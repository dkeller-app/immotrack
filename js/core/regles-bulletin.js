// js/core/regles-bulletin.js — VERIF-DOCUMENTS lot 3 (v15.740 provisoire).
// RÈGLES DE COHÉRENCE des bulletins de salaire d'un dossier, appliquées aux valeurs LUES par l'IA (tâche relais
// « bulletin-paie ») et éventuellement CORRIGÉES par le bailleur. L'IA lit, la règle décide : chaque constat cite son
// texte (Code du travail, art. R3243-1 ; arrêté du 25/02/2016 ; décret n° 2015-1437) et ses valeurs. Une valeur
// absente = règle non applicable (jamais un écart). Aucun score, aucun total, aucun mot de jugement.
// Module pur. Testé par __tests__/helpers/regles-bulletin.test.js.

import { identiteConcorde } from './deux-d-doc.js';

export const SOURCES = {
  r3243: { libelle: 'Code du travail, art. R3243-1 (9° et 10°)', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048841718' },
  arrete: { libelle: 'arrêté du 25/02/2016 relatif au bulletin de paie', url: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000032106923/' },
  decret: { libelle: 'décret n° 2015-1437, annexe I, D, 2°', url: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000031444493' }
};
export const TOLERANCES = Object.freeze({ net: 0.02, impot: 0.10, cumul: 0.05 });
export const TYPES_BULLETIN = Object.freeze(['I.D.2', 'II.E.3']);
export const TYPES_CONTRAT = Object.freeze(['I.C.1', 'II.D.1']);
export const CHAMPS_BULLETIN = Object.freeze([
  ['periode', 'Période'], ['salarie', 'Salarié'], ['employeur', 'Employeur'], ['siret', 'SIRET'], ['dateEntree', 'Date d\'entrée'],
  ['brut', 'Salaire brut'], ['netSocial', 'Montant net social'], ['netAvantImpot', 'Net à payer avant impôt'], ['impotBase', 'Base de l\'impôt prélevé'],
  ['impotTaux', 'Taux de l\'impôt prélevé (%)'], ['impotMontant', 'Impôt prélevé à la source'], ['netAPayer', 'Net à payer'], ['netImposable', 'Net imposable'], ['cumulNetImposable', 'Cumul net imposable']
]);
export const CHAMPS_CONTRAT = Object.freeze([['salarie', 'Salarié'], ['employeur', 'Employeur'], ['siret', 'SIRET'], ['dateDebut', 'Date de début'], ['typeContrat', 'Type de contrat']]);
export const NUMERIQUES = Object.freeze(['brut', 'netSocial', 'netAvantImpot', 'impotBase', 'impotTaux', 'impotMontant', 'netAPayer', 'netImposable', 'cumulNetImposable']);

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const libellePeriode = (p) => { const m = /^(\d{4})-(\d{2})$/.exec(String(p || '')); return m ? `${MOIS[+m[2] - 1]} ${m[1]}` : ''; };
export const euros = (n) => (typeof n === 'number' && isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ') + ' €' : '—');
const fdate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const moisIndex = (p) => { const m = /^(\d{4})-(\d{2})$/.exec(String(p || '')); return m ? (+m[1]) * 12 + (+m[2] - 1) : null; };
const nombre = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const arrondi = (n) => Math.round(n * 100) / 100;
const siretDe = (s) => String(s || '').replace(/\D/g, '');

/**
 * Valeurs retenues d'une pièce : lecture de l'IA, puis corrections du bailleur (qui priment).
 * Une correction vide efface la valeur lue.
 */
export function valeursRetenues(ia) {
  if (!ia || !ia.lu) return null;
  const v = Object.assign({}, ia.lu);
  for (const [k, c] of Object.entries(ia.corrections || {})) v[k] = c ? c.apres : null;
  for (const k of NUMERIQUES) v[k] = nombre(v[k]);
  return v;
}

/**
 * Convertit une saisie de correction (« 2 193,04 € », « 2026-08 », « 04/09/2023 ») dans le format de la lecture.
 * @returns {{ok:boolean, valeur:any}}
 */
export function lireSaisie(champ, saisie) {
  const s = String(saisie == null ? '' : saisie).trim();
  if (!s) return { ok: true, valeur: null };
  if (NUMERIQUES.includes(champ)) {
    const n = Number(s.replace(/[\s  €%]/g, '').replace(',', '.'));
    return isFinite(n) && Math.abs(n) <= 1e6 ? { ok: true, valeur: arrondi(n) } : { ok: false, valeur: null };
  }
  if (champ === 'periode') {
    let m = /^(\d{4})-(\d{1,2})$/.exec(s) || null; if (m) { const mm = +m[2]; return mm >= 1 && mm <= 12 ? { ok: true, valeur: `${m[1]}-${String(mm).padStart(2, '0')}` } : { ok: false }; }
    m = /^(\d{1,2})\/(\d{4})$/.exec(s); if (m) { const mm = +m[1]; return mm >= 1 && mm <= 12 ? { ok: true, valeur: `${m[2]}-${String(mm).padStart(2, '0')}` } : { ok: false }; }
    return { ok: false, valeur: null };
  }
  if (champ === 'dateEntree' || champ === 'dateDebut') {
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (m && !isNaN(Date.parse(s))) return { ok: true, valeur: s };
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (m) { const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return isNaN(Date.parse(iso)) ? { ok: false } : { ok: true, valeur: iso }; }
    return { ok: false, valeur: null };
  }
  if (champ === 'siret') { const d = siretDe(s); return d.length === 14 ? { ok: true, valeur: d } : { ok: false, valeur: null }; }
  return { ok: true, valeur: s.slice(0, 120) };
}

/** Règles internes d'UN bulletin. @returns Array<{code, applicable, ok, titre, detail, source}> */
export function reglesInternes(v) {
  const out = [];
  if (!v) return out;
  const nAvant = nombre(v.netAvantImpot), imp = nombre(v.impotMontant), net = nombre(v.netAPayer);
  if (nAvant != null && imp != null && net != null) {
    const attendu = arrondi(nAvant - imp), ecart = arrondi(net - attendu);
    const ok = Math.abs(ecart) <= TOLERANCES.net;
    out.push({ code: 'B1', ok, titre: ok ? 'Net à payer = net avant impôt − impôt prélevé.' : 'Le net à payer ne correspond pas au net avant impôt moins l\'impôt prélevé à la source.',
      detail: `${euros(nAvant)} − ${euros(imp)} = ${euros(attendu)} ; net à payer imprimé : ${euros(net)}${ok ? '' : ` ; écart : ${euros(Math.abs(ecart))}`}.`, source: SOURCES.r3243 });
  }
  const base = nombre(v.impotBase), taux = nombre(v.impotTaux);
  if (base != null && taux != null && imp != null) {
    const attendu = arrondi(base * taux / 100), ecart = arrondi(imp - attendu);
    const ok = Math.abs(ecart) <= TOLERANCES.impot;
    out.push({ code: 'B2', ok, titre: ok ? 'Impôt prélevé = base × taux.' : 'L\'impôt prélevé ne correspond pas à la base multipliée par le taux.',
      detail: `${euros(base)} × ${String(taux).replace('.', ',')} % = ${euros(attendu)} ; imprimé : ${euros(imp)}${ok ? '' : ` ; écart : ${euros(Math.abs(ecart))}`}.`, source: SOURCES.r3243 });
  }
  const brut = nombre(v.brut), social = nombre(v.netSocial);
  if (brut != null && social != null) {
    const ok = social <= brut + TOLERANCES.net;
    out.push({ code: 'B3', ok, titre: ok ? 'Montant net social inférieur au salaire brut.' : 'Le montant net social est supérieur au salaire brut.',
      detail: `Brut : ${euros(brut)} ; net social : ${euros(social)}.`, source: SOURCES.arrete });
  }
  return out;
}

/**
 * Analyse de tous les bulletins (et de la page 1 du contrat) d'une personne du dossier.
 * @param {{pieces: Array<{id, nom, type:'bulletin'|'contrat', ia}>, identite:{nom, prenom}, siretDeclare?:string, recuLe?:string, qui?:'candidat'|'garant'}} p
 * @returns {{ parPiece: Object<string,{etat, regles:Array, constats:Array}>, constats: Array }}
 */
export function analyserBulletins({ pieces, identite, siretDeclare, recuLe, qui }) {
  const parPiece = {}; const constats = [];
  const quiTxt = qui === 'garant' ? ' du garant' : '';
  const bull = [], contrats = [];
  for (const p of pieces || []) {
    const v = valeursRetenues(p.ia);
    const e = { etat: 'ia_non_lancee', regles: [], constats: [] };
    parPiece[p.id] = e;
    if (!p.ia) continue;
    if (p.ia.erreur) { e.etat = 'ia_erreur'; continue; }
    if (!v || v.lisible === false) { e.etat = 'illisible'; continue; }
    if (p.type === 'contrat') { contrats.push({ p, v, e }); e.etat = 'lu'; continue; }
    bull.push({ p, v, e });
  }
  const nom = (p) => `« ${p.nom} »`;
  const ajouter = (e, c) => { e.constats.push(c); constats.push(c); };

  for (const { p, v, e } of bull) {
    e.regles = reglesInternes(v);
    for (const r of e.regles) if (!r.ok) ajouter(e, { code: r.code, icone: 'calc', titre: `Bulletin ${libellePeriode(v.periode) || nom(p)} : ${r.titre.charAt(0).toLowerCase()}${r.titre.slice(1)}`, detail: r.detail, source: r.source.libelle, url: r.source.url, ia: true, pieceId: p.id });
    // Identité (comparaison sans accents, tirets ni ordre).
    if (v.salarie && identite && identite.nom) {
      const ok = identiteConcorde(v.salarie, identite.nom, identite.prenom);
      e.regles.push({ code: 'B6', ok: ok !== false, titre: ok === false ? 'Le nom du salarié diffère de l\'identité déclarée.' : 'Nom du salarié identique à l\'identité déclarée.', detail: `Salarié : ${v.salarie} ; identité déclarée${quiTxt} : ${[identite.prenom, identite.nom].filter(Boolean).join(' ')}.`, source: { libelle: 'comparaison sans accents ni tirets' } });
      if (ok === false) ajouter(e, { code: 'B6', icone: 'doc', titre: `Bulletin ${libellePeriode(v.periode) || nom(p)} : le nom du salarié diffère de l'identité déclarée${quiTxt}.`, detail: `Salarié : ${v.salarie} ; identité déclarée : ${[identite.prenom, identite.nom].filter(Boolean).join(' ')}. Un nom d'usage peut l'expliquer.`, source: 'lecture du bulletin (proposée par l\'IA, à vérifier)', ia: true, pieceId: p.id });
    }
    // SIRET lu ≠ SIRET déclaré (comparaison au niveau SIREN si un SIREN a été déclaré).
    const sd = siretDe(siretDeclare), sl = siretDe(v.siret);
    if (sd && sl) {
      const ok = sd.length === 9 ? sl.slice(0, 9) === sd : sl === sd;
      e.regles.push({ code: 'B6', ok, titre: ok ? 'SIRET identique à celui déclaré.' : 'Le SIRET du bulletin diffère de celui déclaré.', detail: `SIRET du bulletin : ${sl} ; déclaré : ${sd}.`, source: { libelle: 'déclaration du candidat' } });
      if (!ok) ajouter(e, { code: 'B6', icone: 'building', titre: `Bulletin ${libellePeriode(v.periode) || nom(p)} : le SIRET de l'employeur diffère de celui déclaré.`, detail: `SIRET lu sur le bulletin : ${sl} ; déclaré : ${sd}.`, source: 'lecture du bulletin (proposée par l\'IA, à vérifier)', ia: true, pieceId: p.id });
    }
  }

  // Entre bulletins : périodes consécutives, cumul du net imposable (même employeur, même année).
  const tries = bull.filter((b) => moisIndex(b.v.periode) != null).sort((a, b) => moisIndex(a.v.periode) - moisIndex(b.v.periode));
  for (let i = 1; i < tries.length; i++) {
    const A = tries[i - 1], B = tries[i];
    const ia = moisIndex(A.v.periode), ib = moisIndex(B.v.periode);
    const memeEmployeur = (siretDe(A.v.siret) && siretDe(B.v.siret)) ? siretDe(A.v.siret) === siretDe(B.v.siret) : true;
    if (ib - ia === 1 && memeEmployeur && A.v.periode.slice(0, 4) === B.v.periode.slice(0, 4)) {
      const ca = nombre(A.v.cumulNetImposable), cb = nombre(B.v.cumulNetImposable), nb = nombre(B.v.netImposable);
      if (ca != null && cb != null && nb != null) {
        const attendu = arrondi(ca + nb), ecart = arrondi(cb - attendu), ok = Math.abs(ecart) <= TOLERANCES.cumul;
        B.e.regles.push({ code: 'B4', ok, titre: ok ? `Cumul net imposable dans la continuité de ${libellePeriode(A.v.periode)}.` : `Le cumul net imposable ne prolonge pas celui de ${libellePeriode(A.v.periode)}.`, detail: `${euros(ca)} + ${euros(nb)} = ${euros(attendu)} ; cumul imprimé : ${euros(cb)}${ok ? '' : ` ; écart : ${euros(Math.abs(ecart))}`}.`, source: SOURCES.arrete });
        if (!ok) ajouter(B.e, { code: 'B4', icone: 'calc', titre: `Bulletin ${libellePeriode(B.v.periode)} : le cumul net imposable ne prolonge pas celui du bulletin de ${libellePeriode(A.v.periode)}.`, detail: `Cumul de ${libellePeriode(A.v.periode)} ${euros(ca)} + net imposable ${euros(nb)} = ${euros(attendu)} ; cumul imprimé ${euros(cb)}. Écart : ${euros(Math.abs(ecart))}.`, source: SOURCES.arrete.libelle + ', cumul annuel', url: SOURCES.arrete.url, ia: true, pieceId: B.p.id });
      }
    }
  }
  if (tries.length >= 2) {
    const manquants = [];
    for (let i = 1; i < tries.length; i++) for (let m = moisIndex(tries[i - 1].v.periode) + 1; m < moisIndex(tries[i].v.periode); m++) manquants.push(`${MOIS[m % 12]} ${Math.floor(m / 12)}`);
    if (manquants.length) constats.push({ code: 'B5', icone: 'clock', titre: `Bulletins${quiTxt} : période${manquants.length > 1 ? 's' : ''} absente${manquants.length > 1 ? 's' : ''} entre les bulletins reçus (${manquants.join(', ')}).`, detail: `Bulletins reçus : ${tries.map((t) => libellePeriode(t.v.periode)).join(', ')}. Le décret prévoit les trois derniers bulletins de salaire.`, source: SOURCES.decret.libelle, url: SOURCES.decret.url, ia: true });
  }
  if (tries.length && recuLe) {
    const r = new Date(recuLe); const ir = r.getUTCFullYear() * 12 + r.getUTCMonth();
    const dernier = tries[tries.length - 1];
    if (ir - moisIndex(dernier.v.periode) > 2) {
      constats.push({ code: 'B5', icone: 'clock', titre: `Bulletins${quiTxt} : le plus récent porte sur ${libellePeriode(dernier.v.periode)}.`, detail: `Pour un dossier reçu le ${fdate(r.toISOString())}, les trois derniers bulletins couvrent en principe les mois précédant la réception.`, source: SOURCES.decret.libelle, url: SOURCES.decret.url, ia: true });
    }
  }
  // Contrat de travail (page 1) ↔ bulletins : employeur et date d'entrée.
  for (const { p, v } of contrats) {
    for (const { p: pb, v: vb } of bull) {
      if (v.dateDebut && vb.dateEntree && v.dateDebut !== vb.dateEntree) {
        constats.push({ code: 'B7', icone: 'doc', titre: `Contrat ${nom(p)} et bulletin ${libellePeriode(vb.periode) || nom(pb)} : dates d'entrée différentes.`, detail: `Contrat : ${fdate(v.dateDebut)} ; bulletin : ${fdate(vb.dateEntree)}. Un avenant ou une reprise d'ancienneté peut l'expliquer.`, source: 'lecture du contrat et du bulletin (proposée par l\'IA, à vérifier)', ia: true, pieceId: p.id });
        break;
      }
    }
    const sc = siretDe(v.siret);
    const autre = bull.find((b) => siretDe(b.v.siret) && sc && siretDe(b.v.siret).slice(0, 9) !== sc.slice(0, 9));
    if (autre) constats.push({ code: 'B7', icone: 'building', titre: `Contrat ${nom(p)} et bulletin ${libellePeriode(autre.v.periode)} : employeurs différents (SIREN).`, detail: `Contrat : ${sc} ; bulletin : ${siretDe(autre.v.siret)}.`, source: 'lecture du contrat et du bulletin (proposée par l\'IA, à vérifier)', ia: true, pieceId: p.id });
  }
  for (const { e } of bull) e.etat = e.constats.length ? 'ecart' : (e.regles.length ? 'sans_ecart' : 'lu');
  return { parPiece, constats };
}
