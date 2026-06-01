/**
 * Module acte-extract — extraction heuristique locale (voie A) d'un acte de
 * vente notarié pré-lu par pdf.js, pour pré-remplir entité bailleur + immeuble
 * + indice logements en mode « ✨ suggéré · à vérifier » (jamais d'écriture
 * aveugle — l'utilisateur valide champ par champ avant toute création DB).
 *
 * (IMPORT-ACTE-VENTE — Phase A, design 2026-06-01)
 *
 * RGPD : 100 % statique, aucun LLM/backend — l'acte ne quitte jamais le
 * navigateur. Port fidèle du prototype v4 validé 4/4 sur actes réels
 * (actes/_test_extract.cjs, local-only/gitignored).
 *
 * ── Contraintes pdf.js apprises sur actes réels ──────────────────────────
 *  1. Le texte arrive via `tc.items.map(it => it.str).join(' ')`. pdf.js
 *     découpe les mots de façon irrégulière et VARIABLE d'une page à l'autre
 *     (« Situé » → « S itué », « immeuble » → « immeubl e », « DESIGNATION »
 *     → « D ESIGNA TION »). On NORMALISE donc l'espace (`\s+` → ' ') et on
 *     évite d'ancrer sur un mot fragile isolé.
 *  2. Le `\b` de JS est ASCII : il n'y a pas de frontière de mot avant un
 *     accent (« à », « é »). `\b[Aà]` rate donc « à ». On ancre les
 *     prépositions sur une classe de délimiteurs `[\s.,;:(«"]` à la place.
 *  3. On cherche le SIREN DANS LE BLOC acquéreur isolé (sinon on capte celui
 *     du vendeur, premier dans le document).
 *
 * Conservative : si un champ est incertain, on le laisse vide plutôt que de
 * suggérer du bruit (le coût d'un faux positif « à vérifier » est élevé pour
 * l'utilisateur).
 *
 * 2 templates notaire connus (ancres différentes selon l'étude) :
 *   - société entre guillemets + « numéro unique d'identification »
 *   - société sans guillemets (jusqu'à virgule) + « SIREN sous le numéro »
 *   - immeuble format X : « à VILLE (CP), adresse »
 *   - immeuble format Y : « à VILLE (DÉPARTEMENT) CP adresse »
 */

/** Normalise les espaces (cf. contrainte pdf.js n°1). */
export function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extrait entité + immeuble + indice logements d'un texte d'acte.
 * @param {string} rawText - texte brut concaténé par pdf.js (multi-pages)
 * @returns {{
 *   type: 'societe'|'personne',
 *   entite: {nom?:string, siren?:string, forme?:string, civilite?:string, ville?:string, cp?:string, adr?:string},
 *   immeuble: {ville?:string, cp?:string, adr?:string},
 *   logementsHint: {count?:string, unit?:string, parEtage?:number, lots?:number},
 *   _src: object  // phrases sources (pour l'UI « d'après : … »)
 * }}
 */
export function acteExtract(rawText) {
  const N = norm(rawText);
  const out = { type: '', entite: {}, immeuble: {}, logementsHint: {}, _src: {} };

  // ── 1. Isoler le bloc ACQUÉREUR : heading « (2)) Acquéreur » SUIVI de « La
  //    société|Monsieur|Madame » (≠ occurrences « l'acquéreur » de la
  //    terminologie), puis fenêtre vers l'avant, coupée au « dénommé(e)
  //    "L'ACQUEREUR" » si présent (sinon +900).
  let block = N;
  const heads = [...N.matchAll(/(?:\b2\s*\)\s*)?ACQU[EÉ]REUR\b/gi)];
  let hStart = -1;
  for (const h of heads) {
    const after = N.slice(h.index + h[0].length, h.index + h[0].length + 45);
    if (/^\s*(La\s+soci[ée]t[ée]|Monsieur|Madame|M\.|Mme)/i.test(after)) { hStart = h.index; break; }
  }
  if (hStart >= 0) {
    const tail = N.slice(hStart, hStart + 1200);
    const endRel = tail.search(/d[ée]nomm[ée]\(?e?\)?\s*["«]?\s*L['’]ACQU[EÉ]REUR/i);
    block = N.slice(hStart, hStart + (endRel > 80 ? endRel : 900));
  }
  out._src.block = block.slice(0, 300);

  const isSoc = /soci[ée]t[ée]\s+d[ée]nomm[ée]e/i.test(block);
  out.type = isSoc ? 'societe' : 'personne';

  // ── 2. SIREN (2 ancres) — cherché DANS LE BLOC (sinon on capte celui du vendeur).
  const sirenM = block.match(/(?:num[ée]ro\s+unique\s+d['’]identification|SIREN\s+sous\s+le\s+num[ée]ro|num[ée]ro\s+SIREN)\s*:?\s*([\d][\d ]{8,12}?)(?=[\s.,]|$)/i);
  if (sirenM) {
    const digits = sirenM[1].replace(/\D/g, '').slice(0, 9);
    if (digits.length === 9) { out.entite.siren = digits; out._src.siren = norm(sirenM[0]); }
  }

  if (isSoc) {
    // nom société : avec guillemets OU sans (jusqu'à virgule)
    let nm = block.match(/soci[ée]t[ée]\s+d[ée]nomm[ée]e\s*["«“]\s*([^"»”]{2,60}?)\s*["»”]/i)
          || block.match(/soci[ée]t[ée]\s+d[ée]nomm[ée]e\s+([A-Z0-9][^,]{1,60}?)\s*,/i);
    if (nm) { out.entite.nom = norm(nm[1]); out._src.nom = norm(nm[0]); }
    // forme juridique
    const fm = block.match(/(Soci[ée]t[ée]\s+[Cc]ivile\s+[Ii]mmobili[èe]re|S\.?A\.?R\.?L\.?|S\.?A\.?S\.?|\bSCI\b)/i);
    if (fm) out.entite.forme = norm(fm[1]);
    // siège
    const sg = block.match(/si[èe]ge(?:\s+social)?\s+est\s+à\s+([A-ZÀ-Ÿ'’\- ]+?)\s*\((\d{5})\)\s*,\s*([^.,]+)/i);
    if (sg) { out.entite.ville = norm(sg[1]); out.entite.cp = sg[2]; out.entite.adr = norm(sg[3]); out._src.siege = norm(sg[0]); }
  } else {
    // personne : civilité + nom jusqu'à virgule
    const pn = block.match(/Acqu[ée]reur\s+(Monsieur|Madame|M\.|Mme)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'’\- ]+?)\s*,/i);
    if (pn) { out.entite.civilite = pn[1]; out.entite.nom = norm(pn[2]); out._src.nom = norm(pn[0]); }
    // domicile (dans le bloc acquéreur uniquement → pas le vendeur)
    const dm = block.match(/demeurant\s+à\s+([A-ZÀ-Ÿ'’\- ]+?)\s*\((\d{5})\)\s*,\s*([^.]+?)\s*\./i);
    if (dm) { out.entite.ville = norm(dm[1]); out.entite.cp = dm[2]; out.entite.adr = norm(dm[3]); out._src.domicile = norm(dm[0]); }
  }

  // ── 3. IMMEUBLE : après « DESIGNATION / IDENTIFICATION DU BIEN ». 2 formats
  //    d'adresse, sans dépendre de « situé » (pdf.js coupe « S itué »). On évite
  //    le faux positif « COMMUNE DE … ».
  const desIdx = N.search(/(?:D[ÉE]SIGNATION\s+DES\s+BIENS|IDENTIFICATION\s+DU\s+BIEN|D\s?ESIGNA\s?TION)/i);
  const desBlock = desIdx >= 0 ? N.slice(desIdx, desIdx + 1600) : N;
  // Format X : « à VILLE (CP 5 chiffres), adresse » (préposition à/A ancrée sur
  //  un délimiteur — pas \b, qui est ASCII et rate « à »).
  let im = desBlock.match(/[\s.,;:(«"][AaÀà]\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿ'’\- ]{2,34}?)\s*\((\d{5})\)\s*,?\s*(\d[^.;,]{2,55})/);
  if (im) { out.immeuble.ville = norm(im[1]); out.immeuble.cp = im[2]; out.immeuble.adr = norm(im[3]); out._src.immeuble = norm(im[0]); }
  else {
    // Format Y : « à VILLE (DÉPARTEMENT) CP 5 chiffres adresse » (template CHANTERET-FAGOT).
    im = desBlock.match(/[\s.,;:(][AaÀà]\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿ'’\- ]{2,34}?)\s*\([A-ZÀ-Ÿ'’\- ]{4,40}\)\s*(\d{5})\s+(\d[^.;,]{2,55})/);
    if (im) { out.immeuble.ville = norm(im[1]); out.immeuble.cp = im[2]; out.immeuble.adr = norm(im[3]); out._src.immeuble = norm(im[0]); }
  }
  // indice logements : « comprenant/composé … X appartements/logements » + structure par étage
  const cnt = desBlock.match(/(?:comprenant|compos[ée]e?)\s+(?:un\s+local[^.]*?et\s+)?(?:de\s+)?([A-Za-zÀ-ÿ]+)\s*(?:\(\d+\)\s*)?(appartements?|logements?)/i);
  if (cnt) { out.logementsHint.count = norm(cnt[1]); out.logementsHint.unit = cnt[2]; out._src.count = norm(cnt[0]); }
  const floors = (desBlock.match(/\*?\s*(?:Au|A l['’])\s+(?:sous-?\s?sol|rez|premier|deuxi[èe]me|troisi[èe]me|\d+\s?[èe]?r?e?\s*[ée]tage|ext[ée]rieur)/gi) || []).length;
  if (floors >= 2) out.logementsHint.parEtage = floors;
  // lots de copropriété (autre famille)
  const lots = (desBlock.match(/Lot\s+(?:num[ée]ro|n[°o])/gi) || []).length;
  if (lots >= 1) out.logementsHint.lots = lots;

  return out;
}
