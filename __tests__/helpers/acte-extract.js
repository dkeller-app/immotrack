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

  // ── 4. ENRICHISSEMENT ENTITÉ — RCS + capital, DANS LE BLOC acquéreur uniquement
  //    (un acte contient plusieurs immatriculations : copropriété, syndic, notaire,
  //    vendeur). On reste conservateur : ancre absente → champ vide.
  if (isSoc) {
    // ville RCS = suite de tokens MAJUSCULES uniquement (s'arrête au 1er mot minuscule « et », « sous »…)
    const rcs = block.match(/(?:R\.?C\.?S\.?|[Rr]egistre\s+du\s+[Cc]ommerce\s+et\s+des\s+[Ss]oci[ée]t[ée]s)\s+(?:[Dd]e\s+|d['’])\s*([A-ZÀ-Ÿ][A-ZÀ-Ÿ'’\-]+(?:\s+[A-ZÀ-Ÿ'’\-]{2,})*)/);
    if (rcs) { out.entite.rcs = norm(rcs[1]); out._src.rcs = norm(rcs[0]); }
    // capital uniquement s'il est numérique (souvent écrit en lettres → on ne devine pas)
    const cap = block.match(/au\s+capital\s+(?:social\s+)?de\s+([0-9][\d .  ]{2,13}[0-9])\s*(?:€|euros?)/i);
    if (cap) { out.entite.capital = cap[1].replace(/[^\d]/g, ''); out._src.capital = norm(cap[0]); }
  }

  // ── 5. ENRICHISSEMENT IMMEUBLE — contenance cadastrale + surface totale.
  //    Fenêtre élargie : Carrez/contenance peuvent être hors des 1600 premiers car.
  const desBlock2 = desIdx >= 0 ? N.slice(desIdx, desIdx + 4000) : N;
  // Contenance cadastrale : « Contenance totale 12 a 21 ca » (ha/a/ca, certains absents).
  const conten = N.match(/Contenance\s+totale\s+((?:\d+\s*ha\s*)?(?:\d+\s*a\s*)?\d+\s*ca)/i);
  if (conten) { out.immeuble.contenance = norm(conten[1]); out._src.contenance = norm(conten[0]); }
  // Surface totale en m² : « surface … totale … est de 433,18m² » (m² désambiguïse de la contenance).
  const surfTot = N.match(/totale\s*[»"”]?\s*(?:est\s+de\s+)?(\d{2,4}[.,]\d{1,2})\s*m²/i)
              || N.match(/surface\s+(?:habitable\s+)?totale[^.]{0,25}?(\d{2,4}[.,]\d{1,2})\s*m²/i);
  if (surfTot) { out.immeuble.surfaceTotale = surfTot[1].replace('.', ','); out._src.surfaceTotale = norm(surfTot[0]); }

  // ── 6. SURFACES — Carrez par lot(s) + surface habitable individuelle.
  out.carrez = [];
  const carrezRe = /Lot\s+num[ée]ro\s+(\d+(?:\s*(?:et|à|&|,)\s*\d+)*)\s*:\s*(\d{1,3}[.,]\d{1,2})\s*m²/gi;
  let cz;
  while ((cz = carrezRe.exec(N)) !== null) {
    const nums = (cz[1].match(/\d+/g) || []).map(Number);
    if (nums.length) out.carrez.push({ lots: nums, surf: cz[2].replace('.', ',') });
  }
  // surface habitable explicite « surface habitable de 36m² » (sans "totale" — déjà capté ci-dessus)
  const surfHab = N.match(/surface\s+habitable\s+(?:de\s+)?(\d{1,4}[.,]?\d{0,2})\s*m²/i);
  if (surfHab && !/totale/i.test(surfHab[0])) { out.surfaceHabitable = surfHab[1].replace('.', ','); out._src.surfaceHabitable = norm(surfHab[0]); }

  // ── 7. LOTS DE COPROPRIÉTÉ — désignation + tantièmes (2 passes fusionnées par n°).
  out.lots = [];
  const lotDesRe = /Lot\s+num[ée]ro\s+[a-zà-ÿ]+(?:[\s-][a-zà-ÿ]+)*\s*\((\d+)\)\s*[-–—]\s*([^.•]{1,50}?)(?=\s+Et\s+les\b|\s+Lot\s+num|[.•]|$)/gi;
  let ld;
  while ((ld = lotDesRe.exec(N)) !== null) {
    const num = parseInt(ld[1], 10);
    if (out.lots.some(l => l.num === num)) continue;
    out.lots.push({ num, designation: norm(ld[2]) });
  }
  const lotTanRe = /Lot\s+num[ée]ro\s+[a-zà-ÿ\- ]*?\((\d+)\)[^/]{0,60}?Et\s+les\s+([\d][\d.\s]*?)\s*\/\s*([\d.\s]*?\d)\s*[èe]mes/gi;
  let lt;
  while ((lt = lotTanRe.exec(N)) !== null) {
    const num = parseInt(lt[1], 10);
    const lot = out.lots.find(l => l.num === num);
    const tantiemes = lt[2].replace(/\D/g, '') + '/' + lt[3].replace(/\D/g, '');
    if (lot) lot.tantiemes = tantiemes;
    else out.lots.push({ num, tantiemes });
  }
  out.lots.sort((a, b) => a.num - b.num);

  // ── 8. ÉTAGES (immeuble entier énuméré) + types FN.
  out.etages = [];
  const etRe = /(?:^|[•·\-*:]|\bAu\s)\s*(?:Au\s+)?((?:rez[\s-]*de[\s-]*chauss[ée]e|sous[\s-]?sol|combles?|\d+\s*(?:er|ère|ème|nd|e)?\s*[ée]tage)(?:\s+et\s+\d+\s*(?:er|ème|e)?\s*[ée]tage)?)\s*((?:à\s+(?:droite|gauche)|au\s+milieu)?)\s*:?\s*(un\s+appartement|un\s+logement)\b/gi;
  let et;
  while ((et = etRe.exec(desBlock2)) !== null) {
    out.etages.push({ etage: _normEtage(et[1]), position: norm(et[2]) });
  }
  out.types = [...new Set((N.match(/\btype\s+(F[1-6])\b/gi) || []).map(t => t.replace(/.*\b(F[1-6])\b.*/i, '$1').toUpperCase()))];

  // ── 9. ANNEXES (cave / garage / parking / grenier) — best-effort, conservateur.
  out.annexesRaw = [];
  const annRe = /\b(une?|deux|trois|quatre|cinq|six|\d{1,2}|les|l['’]ensemble\s+des)\s+(caves?|garages?|box(?:es)?|parkings?|emplacements?\s+de\s+stationnement|greniers?)\b/gi;
  let an;
  const annSeen = new Set();
  while ((an = annRe.exec(N)) !== null) {
    let nature = an[2].toLowerCase().replace(/s$/, '').replace(/^emplacement.*/, 'parking').replace(/^box.*/, 'garage');
    if (annSeen.has(nature)) continue;
    annSeen.add(nature);
    out.annexesRaw.push({ nature, count: norm(an[1]), _src: norm(an[0]) });
  }

  return out;
}

/** Normalise un libellé d'étage malmené par pdf.js (« 1 er étage » → « 1er étage »). */
export function _normEtage(s) {
  return norm(s)
    .replace(/rez\s*-?\s*de\s*-?\s*chauss[ée]e/i, 'rez-de-chaussée')
    .replace(/(\d+)\s*(ers?|ères?|èmes?|nds?|es?)\b/gi, '$1$2')
    .replace(/sous\s*-?\s*sol/i, 'sous-sol')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mots-nombres FR → entier (réutilisé pour tantièmes / regroupement). */
const _MOTS_NOMBRES = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
  quinze: 15, seize: 16
};
export function motNombre(w) {
  if (w == null) return null;
  const k = String(w).toLowerCase().trim();
  if (/^\d+$/.test(k)) return parseInt(k, 10);
  return _MOTS_NOMBRES[k] ?? null;
}

/**
 * Regroupe les lots/étages bruts en LOGEMENTS interprétés (D4 du design).
 * Ne fusionne jamais en aveugle : chaque regroupement produit une NOTE de
 * vérification destinée à l'UI (« 🤖 L'app a regroupé les lots 5+6… vérifie »).
 *
 * Stratégie, par ordre de priorité du signal :
 *   1. Lots de copropriété + groupes Carrez (« Lot 5 et 6 : 34,79 m² » → 1 logement).
 *   2. Énumération par étage (immeuble entier) → 1 logement par étage.
 *   3. Comptage en prose (« comprenant cinq appartements ») → N logements génériques.
 *
 * @param {ReturnType<typeof acteExtract>} ext
 * @returns {{ logements: Array, annexes: Array, notes: string[] }}
 */
export function acteRegroup(ext) {
  const e = ext || {};
  const out = { logements: [], annexes: [], notes: [] };
  const NAT_ANNEXE = /(cave|garage|parking|box|grenier|stationnement|emplacement|local\s+(?:commercial|technique)|combles?\b)/i;
  const isAnnexeNature = (s) => NAT_ANNEXE.test(String(s || ''));

  const lots = Array.isArray(e.lots) ? e.lots.slice() : [];
  const carrez = Array.isArray(e.carrez) ? e.carrez : [];

  // ── 1. Famille COPROPRIÉTÉ : on a des lots numérotés.
  if (lots.length) {
    // Séparer lots-annexes (cave/garage…) des lots-logements d'après leur désignation.
    const lotAnnexes = lots.filter(l => isAnnexeNature(l.designation));
    const lotLogts = lots.filter(l => !isAnnexeNature(l.designation));

    const used = new Set();
    // 1a. Groupes Carrez explicites (« 5 et 6 ») → 1 logement par groupe ≥ 2 lots.
    for (const cz of carrez) {
      const grp = (cz.lots || []).filter(n => lotLogts.some(l => l.num === n));
      if (grp.length >= 2) {
        const members = grp.map(n => lotLogts.find(l => l.num === n)).filter(Boolean);
        members.forEach(m => used.add(m.num));
        out.logements.push(_mkLogement(members, cz.surf));
        out.notes.push(`L'app a regroupé les lots ${grp.join(' + ')} en un seul logement (Carrez ${cz.surf} m²). Vérifie ce regroupement.`);
      }
    }
    // 1b. Lots-logements restants → 1 logement chacun (surface Carrez individuelle si dispo).
    for (const l of lotLogts) {
      if (used.has(l.num)) continue;
      const czSolo = carrez.find(c => (c.lots || []).length === 1 && c.lots[0] === l.num);
      out.logements.push(_mkLogement([l], czSolo ? czSolo.surf : undefined));
    }
    // 1c. Lots-annexes → bucket annexes (triple mode en Phase C).
    for (const a of lotAnnexes) {
      out.annexes.push({ nature: _natureAnnexe(a.designation), lot: a.num, designation: a.designation, mode: 'rattacher' });
    }
    return out;
  }

  // ── 2. Famille IMMEUBLE ENTIER énuméré par étage.
  if (Array.isArray(e.etages) && e.etages.length) {
    e.etages.forEach((et, i) => {
      out.logements.push({
        type: 'Appartement',
        etage: et.etage || '',
        position: et.position || '',
        surf: '',
        numApt: '',
        tantiemes: '',
        _lots: []
      });
    });
    if (out.logements.length && e.immeuble && e.immeuble.surfaceTotale) {
      out.notes.push(`Surface totale ${e.immeuble.surfaceTotale} m² (non répartie par logement dans l'acte). À ventiler.`);
    }
  }

  // ── 3. Fallback : comptage en prose (« comprenant cinq appartements ») ou, à défaut,
  //    structure par étage détectée (« Au 1er étage… ») → on amorce N logements vides que
  //    l'utilisateur complète dans le déroulé manuel (mieux que 0 logement bloquant).
  if (!out.logements.length && e.logementsHint) {
    const n = motNombre(e.logementsHint.count) || e.logementsHint.parEtage || 0;
    const unit = /logement/i.test(e.logementsHint.unit || '') ? 'Logement' : 'Appartement';
    for (let i = 0; i < Math.min(n, 30); i++) {
      out.logements.push({ type: unit, etage: '', position: '', surf: '', numApt: '', tantiemes: '', _lots: [] });
    }
    if (n && !e.logementsHint.count) {
      out.notes.push(`L'app a estimé ${n} logement(s) d'après la structure par étage. Vérifie et complète.`);
    }
  }

  // Annexes détectées en prose (hors lots) — ajoutées si pas déjà couvertes par un lot-annexe.
  if (Array.isArray(e.annexesRaw)) {
    for (const a of e.annexesRaw) {
      if (out.annexes.some(x => x.nature === a.nature)) continue;
      out.annexes.push({ nature: a.nature, count: a.count, designation: a._src || '', mode: 'rattacher' });
    }
  }

  return out;
}

/** Construit un logement à partir d'un ou plusieurs lots membres. */
function _mkLogement(members, surf) {
  const nums = members.map(m => m.num);
  // tantièmes : somme si plusieurs lots partagent le même dénominateur
  let tantiemes = '';
  const parts = members.map(m => m.tantiemes).filter(Boolean);
  if (parts.length) {
    const den = parts[0].split('/')[1];
    if (parts.every(p => p.split('/')[1] === den)) {
      const sum = parts.reduce((s, p) => s + (parseInt(p.split('/')[0], 10) || 0), 0);
      tantiemes = sum + '/' + den;
    } else {
      tantiemes = parts.join(' + ');
    }
  }
  const desig = members.map(m => m.designation).filter(Boolean).join(' + ');
  return {
    type: 'Appartement',
    etage: '',
    position: '',
    surf: surf || '',
    numApt: nums.join('+'),
    tantiemes,
    designation: desig,
    _lots: nums
  };
}

/** Normalise une nature d'annexe depuis une désignation libre. */
function _natureAnnexe(designation) {
  const s = String(designation || '').toLowerCase();
  if (/garage|box/.test(s)) return 'garage';
  if (/parking|stationnement|emplacement/.test(s)) return 'parking';
  if (/cave/.test(s)) return 'cave';
  if (/grenier|comble/.test(s)) return 'grenier';
  return 'annexe';
}
