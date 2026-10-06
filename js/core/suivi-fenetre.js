/**
 * core/suivi-fenetre.js — FINANCES-SUIVI-UNIQUE P4 : ce que montrent la fenêtre UNIQUE « avance /
 * retard » (Finances, clic sur une case de la ligne « Avance / retard du lot ») et l'alerte « loyer
 * incomplet » de la page Mouvements. Mise en forme SEULEMENT : tous les chiffres viennent du moteur
 * (suivi-loyers.js : suiviLot → suiviPerimetre) ; aucune règle d'imputation n'est recopiée ici.
 *
 * Maquette validée le 06/10 (mockups/FINANCES-SUIVI-V2/02-fenetre-lot.html, 03-mouvements.html) :
 *   - phrase de synthèse « N lots à regarder : x en retard (−a €), y en avance (+b €) » ;
 *   - groupes EN RETARD puis EN AVANCE, jamais mélangés, tri par montant décroissant, une ligne
 *     repliable par lot, le premier déplié d'office, « voir les N autres » au-delà de 5 lots ;
 *   - zone compacte « À JOUR » (lecture seule) ;
 *   - carte d'un lot : loyer attendu / reçu pour le mois (virements) / UNE ligne de résultat ;
 *     dette ancienne : « ✅ mois : payé » puis « ⚠ Reste dû des mois précédents : X (depuis …) » ;
 *   - un seul geste : « Accepter le manque » (montant pré-rempli, plafonné ; motif obligatoire).
 *
 * MOIS DU MANQUE (`cibleManque`) — la remise du moteur s'applique au mois `ym` du manque, dans
 * l'ordre H-1 (loyer du mois, charges du mois, puis arriérés les plus vieux d'abord), plafonnée à
 * la dette de fin de ce mois (§B.2, §D). Le geste porte donc sur :
 *   1. le MOIS REGARDÉ, cas général : sa dette de fin de mois (courant + antérieur) est exactement
 *      ce que la carte affiche ; la remise de ce mois solde d'abord le manque propre au mois puis la
 *      dette ancienne (cas C.3 : « reste dû des mois précédents : 122 (depuis février) »). Les mois
 *      passés gardent leur retard historique (I-1 : un mois figé ne bouge pas) ;
 *   2. le MOIS PRÉCÉDENT du bail quand le mois regardé est sous la tolérance du 10 (son manque neuf
 *      n'est pas encore exigible, donc pas dans la case) : sinon la remise viserait d'abord ce loyer
 *      pas encore dû au lieu de la dette ancienne affichée ;
 *   3. le DERNIER MOIS du bail pour un locataire parti (dette figée à son départ) : le moteur ignore
 *      un manque hors des mois du bail.
 * Depuis Mouvements, le geste porte sur le mois que le virement a payé (celui qui reste incomplet).
 *
 * PUR : aucune lecture de DB, aucune horloge, aucun DOM. Tests : __tests__/helpers/suivi-fenetre.test.js.
 */

import { suiviPerimetre } from './suivi-loyers.js';

const EPS = 0.005;
const _r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const VOIR_MAX = 5;
export const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const moisNom = (ym) => MOIS_LONGS[parseInt(String(ym).slice(5, 7), 10) - 1] || '';
export const moisCap = (ym) => { const n = moisNom(ym); return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; };
const _jjmm = (d) => { const p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; };
const _jjmmaaaa = (d) => { const p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };

/** Montant en euros, format français, sans dépendre de l'ICU (espaces insécables, comme fmt / MontantDoc). */
export function eur(n, opts) {
  const o = opts || {};
  const v = Math.abs(_r2(n));
  const entier = Math.abs(v - Math.round(v)) < EPS;
  const dec = o.dec != null ? o.dec : (o.court && entier ? 0 : 2);
  const s = v.toFixed(dec).split('.');
  const mil = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return mil + (dec ? ',' + s[1] : '') + ' €';
}
/** Montant signé court : « −20 € », « +430 € », « −4,99 € » (résumés, phrase, groupes). */
export function eurSigne(n) {
  const v = _r2(n);
  if (Math.abs(v) < EPS) return '0 €';
  return (v < 0 ? '−' : '+') + eur(v, { court: true });
}
const _num = (n) => { const v = _r2(n); return Math.abs(v - Math.round(v)) < EPS ? String(Math.round(v)) : v.toFixed(2).replace('.', ','); };

/** Le mois du bail à `ym`, ou à défaut le dernier mois ≤ ym (dette figée d'un parti). */
export function moisAu(suiviBail, ym) {
  let hit = null;
  for (const m of ((suiviBail && suiviBail.mois) || [])) { if (m.ym > ym) break; hit = m; }
  return hit;
}
/** Date de début du bail lue dans sa clé `ref|AAAA-MM-JJ[|uid]` (celle que _manqueAccepter attend). */
export function debutDeCle(cle) {
  const m = /\|(\d{4}-\d{2}-\d{2})(\|[^|]*)?$/.exec(String(cle || ''));
  return m ? m[1] : null;
}

/**
 * Mois et plafond du geste « Accepter le manque » pour une carte de la fenêtre (règle en tête du
 * fichier). @returns {{ym, plafond, regle:'mois'|'tolerance'|'parti'}|null} null = rien à accepter.
 */
export function cibleManque(suiviBail, ym, parti) {
  const m = moisAu(suiviBail, ym);
  if (!m) return null;
  if (parti || m.ym !== ym) {
    return m.retard > EPS ? { ym: m.ym, plafond: _r2(m.retard), regle: 'parti' } : null;
  }
  const c = (m.courant.loyer || 0) + (m.courant.charge || 0);
  const a = (m.anterieur.loyer || 0) + (m.anterieur.charge || 0);
  if (c > EPS && m.retard < c + a - EPS) {
    // Mois sous tolérance : la case ne compte que la dette ancienne → remise au mois précédent.
    const i = suiviBail.mois.indexOf(m);
    const prec = i > 0 ? suiviBail.mois[i - 1] : null;
    if (!prec || prec.retard <= EPS || m.retard <= EPS) return null;
    return { ym: prec.ym, plafond: _r2(Math.min(m.retard, prec.retard)), regle: 'tolerance' };
  }
  return m.retard > EPS ? { ym, plafond: _r2(m.retard), regle: 'mois' } : null;
}

/**
 * Contrôle de la saisie du formulaire (avant l'appel à _manqueAccepter, qui revalide).
 * @returns {{ok:boolean, erreurs:{montant?,motif?,date?}, montant:number}}
 */
export function controlerSaisie({ montant, motif, date } = {}, plafond) {
  const erreurs = {};
  const txt = String(montant == null ? '' : montant).trim().replace(',', '.');
  const v = txt === '' ? NaN : Number(txt);
  const p = _r2(plafond);
  if (!Number.isFinite(v) || _r2(v) <= 0) erreurs.montant = 'Le montant doit être supérieur à 0.';
  else if (_r2(v) > p + EPS) erreurs.montant = 'Au plus ' + eur(p) + ' (ce qui manque).';
  if (typeof motif !== 'string' || !motif.trim()) erreurs.motif = 'Le motif est obligatoire.';
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(date || ''))) erreurs.date = 'Date invalide.';
  return { ok: !Object.keys(erreurs).length, erreurs, montant: Number.isFinite(v) ? _r2(v) : 0 };
}

/** Phrase de synthèse (maquette) : « 5 lots à regarder : 3 en retard (−269,71 €), 2 en avance (+717,42 €) ». */
export function phraseSynthese({ retard = [], avance = [], acceptes = [] } = {}) {
  const n = retard.length + avance.length + acceptes.length;
  if (!n) return 'Aucun lot à regarder : tout est à jour.';
  const somme = (l) => l.reduce((t, x) => t + x.solde, 0);
  const parts = [];
  if (retard.length) parts.push((n === 1 ? 'en retard' : (retard.length === n ? 'tous en retard' : retard.length + ' en retard')) + ' (' + eurSigne(somme(retard)) + ')');
  if (acceptes.length) parts.push(n === 1 ? 'manque de ' + eur(acceptes[0].manque.montant, { court: true }) + ' accepté' : acceptes.length + ' manque' + (acceptes.length > 1 ? 's acceptés' : ' accepté'));
  if (avance.length) parts.push((n === 1 ? 'en avance' : (avance.length === n ? 'tous en avance' : avance.length + ' en avance')) + ' (' + eurSigne(somme(avance)) + ')');
  return n + ' lot' + (n > 1 ? 's' : '') + ' à regarder : ' + parts.join(', ');
}

/** Les N premiers lots d'un groupe et le reste (« voir les N autres » au-delà de `max`). */
export function decouperGroupe(items, voirTout, max) {
  const lim = max == null ? VOIR_MAX : max;
  const l = items || [];
  if (voirTout || l.length <= lim) return { visibles: l.slice(), autres: l.length > lim ? l.length - lim : 0, replie: false };
  return { visibles: l.slice(0, lim), autres: l.length - lim, replie: true };
}

/** Tri d'un groupe : montant décroissant (valeur absolue), à égalité par nom puis lot. */
export function trierGroupe(items) {
  return (items || []).slice().sort((a, b) => (Math.abs(b.solde) - Math.abs(a.solde))
    || String(a.noms || '').localeCompare(String(b.noms || '')) || String(a.ref).localeCompare(String(b.ref)));
}

// Carte d'un lot : lignes du tableau, résultat dit UNE fois, notes, geste.
function _carteLot(c, lot, sb, ym, o) {
  const m = moisAu(sb, ym);
  const exact = !!(m && m.ym === ym);
  const M = moisNom(ym), Mc = moisCap(ym);
  const item = {
    key: c.bailCle, ref: c.ref, bailCle: c.bailCle, bailDebut: debutDeCle(c.bailCle) || (sb && sb.debut) || null,
    noms: c.noms || (o.nomLot ? o.nomLot(c.ref) : '') || c.ref, parti: !!c.parti, solde: _r2(c.solde),
    sens: c.solde < -EPS ? 'retard' : (c.solde > EPS ? 'avance' : 'accepte'),
    attendu: null, recus: [], regleEnsuite: [], resultats: [], notes: [], geste: null, manque: null
  };
  if (exact && (m.du.total || 0) > EPS) {
    const hc = m.du.hc || 0, ch = m.du.ch || 0;
    let sub = (ch > EPS && hc > EPS) ? _num(hc) + ' loyer + ' + _num(ch) + ' charges' : '';
    const debutMois = sb && sb.debut && String(sb.debut).slice(0, 7) === ym && String(sb.debut).slice(8, 10) !== '01';
    const finMois = sb && sb.fin && String(sb.fin).slice(0, 7) === ym;
    if (debutMois || finMois) sub = (sub ? sub + ' ' : '') + (debutMois ? '(début de bail)' : '(fin de bail)');
    item.attendu = { total: _r2(m.du.total), hc: _r2(hc), ch: _r2(ch), sub };
  }
  if (exact) {
    // Reçu POUR ce mois = ce que le moteur a imputé à ce mois, virement par virement (avance comprise).
    const par = new Map();
    for (const p of m.imputations) {
      const k = (p.kind || 'virement') + '|' + (p.mvId == null ? p.date : p.mvId);
      const e = par.get(k) || { mvId: p.kind === 'dg' ? null : p.mvId, date: p.date, kind: p.kind || 'virement', montant: 0 };
      e.montant = _r2(e.montant + p.montant);
      par.set(k, e);
    }
    // Reçu POUR ce mois À SA FIN : un versement postérieur (qui a payé ce mois ensuite, en arriéré)
    // n'était pas reçu ce mois-là — il est dit à part (« réglé ensuite »), sinon la carte afficherait
    // « reçu 655 € » ET « il manque 655 € ».
    const finMois = ym + '-31';
    const tous = [...par.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((e) => Object.assign(e, { avance: !!(e.date && e.date < ym + '-01') }));
    item.recus = tous.filter((e) => !e.date || e.date <= finMois);
    item.regleEnsuite = tous.filter((e) => e.date && e.date > finMois);
  }
  const mq = exact && m.manque && (m.manque.montant || 0) > EPS ? m.manque : null;
  if (mq) item.manque = { id: mq.id, montant: _r2(mq.montant), motif: mq.motif || '', date: mq.date || null };
  const recuMois = _r2(item.recus.reduce((t, r) => t + r.montant, 0));
  const duMois = item.attendu ? item.attendu.total : 0;
  const cible = item.sens === 'retard' && o.exigible !== false ? cibleManque(sb, ym, item.parti) : null;
  if (cible) item.geste = { ym: cible.ym, plafond: cible.plafond, prefill: cible.plafond, regle: cible.regle, bailDebut: item.bailDebut, ref: item.ref };

  if (item.parti) {
    const fin = sb && sb.fin;
    const antP = m ? (m.anterieur.loyer || 0) + (m.anterieur.charge || 0) : 0;
    const dep = !m ? null : ((antP > EPS && m.anterieur.depuis && m.anterieur.depuis !== 'ouverture') ? m.anterieur.depuis : m.ym);
    item.resultats.push({ cls: 'warn', txt: '⚠ Reste dû à son départ : ' + eur(-item.solde) + (dep ? ' (depuis ' + moisNom(dep) + ')' : ''), action: cible ? 'accepter' : null });
    item.notes.push('Locataire parti' + (fin ? ' le ' + _jjmmaaaa(fin) : '') + ' : dette figée à son départ, visible jusqu\'à la fin de cette année.');
  } else if (mq) {
    const payeAvant = duMois > EPS && recuMois >= duMois - EPS;
    if (payeAvant) item.resultats.push({ cls: 'ok', txt: '✅ ' + Mc + ' : payé' });
    item.resultats.push({ cls: 'ok', txt: '✅ Soldé : manque de ' + eur(mq.montant) + (payeAvant ? ' des mois précédents' : '') + ' accepté (' + (mq.motif || 'sans motif') + (mq.date ? ' · ' + _jjmm(mq.date) : '') + ')', action: 'annuler', manqueId: mq.id });
    if (item.sens === 'retard') item.resultats.push({ cls: 'warn', txt: '⚠ Il manque encore ' + eur(-item.solde), action: cible ? 'accepter' : null });
  } else if (item.sens === 'retard') {
    const cour = exact ? _r2((m.courant.loyer || 0) + (m.courant.charge || 0)) : 0;
    const ant = exact ? _r2((m.anterieur.loyer || 0) + (m.anterieur.charge || 0)) : _r2(-item.solde);
    const dep = exact ? m.anterieur.depuis : (m ? m.ym : null);
    const tolerance = cible && cible.regle === 'tolerance';
    if (ant > EPS) {
      if (tolerance) item.resultats.push({ cls: 'info', txt: Mc + ' : il manque ' + eur(cour) + ', à régler avant le 10' });
      else item.resultats.push(cour > EPS ? { cls: 'warn', txt: '⚠ ' + Mc + ' : il manque ' + eur(cour) } : { cls: 'ok', txt: '✅ ' + Mc + ' : payé' });
      item.resultats.push({ cls: 'warn', txt: '⚠ Reste dû des mois précédents : ' + eur(ant) + (dep === 'ouverture' ? ' (solde d\'ouverture)' : (dep ? ' (depuis ' + moisNom(dep) + ')' : '')), action: cible ? 'accepter' : null });
    } else {
      item.resultats.push({ cls: 'warn', txt: '⚠ Il manque ' + eur(-item.solde), action: cible ? 'accepter' : null });
    }
  } else if (item.sens === 'avance') {
    const d = o.dernierVirement ? o.dernierVirement(c.ref, c.bailCle, ym) : null;
    item.resultats.push({ cls: 'adv', txt: '🔵 ' + eur(item.solde) + ' payé' + (item.solde >= 2 ? 's' : '') + ' d\'avance' + (d ? ' le ' + _jjmm(d) : '') });
    item.notes.push('Si c\'est un solde de charges, reclasse le mouvement dans Charges récupérables.');
  }
  if (exact && duMois > EPS && item.recus.length && !item.parti) {
    const ant = item.recus.filter((r) => r.avance && r.kind === 'virement');
    if (ant.length && item.sens !== 'avance') item.notes.unshift('Le virement du ' + _jjmm(ant[ant.length - 1].date) + ' (reçu d\'avance) paie ' + M + '.');
  }
  if (item.regleEnsuite && item.regleEnsuite.length && item.sens === 'retard') {
    item.notes.push('Réglé ensuite : ' + item.regleEnsuite.map((e) => eur(e.montant) + ' le ' + _jjmm(e.date)).join(', ') + '.');
  }
  // Q4 : l'indemnité GLI ne réduit pas la dette — information seulement (cumul du bail jusqu'à ce mois).
  const gli = _r2(((sb && sb.mois) || []).filter((x) => x.ym <= ym).reduce((t, x) => t + (x.couvertGli || 0), 0));
  if (gli > EPS && item.sens === 'retard') item.notes.push('Couvert par la GLI : ' + eur(gli) + ' (la dette du locataire reste due).');
  return item;
}

/**
 * LE contenu de la fenêtre unique pour un mois et un périmètre.
 * @param {Array} lots sorties de suiviLot (lots du périmètre)
 * @param {string} ym 'AAAA-MM'
 * @param {{exigible?:boolean, nomLot?:function, dernierVirement?:function(ref,bailCle,ym)}} [opts]
 *        exigible:false (mois post-daté « à venir ») : seule l'avance compte, comme la case.
 * @returns {{ym, solde, phrase, retard:[], avance:[], acceptes:[], aJour:[], nb}}
 *          `solde` = valeur de la case (I-d) ; Σ des cartes affichées = `solde`.
 */
export function modeleFenetre(lots, ym, opts) {
  const o = opts || {};
  const P = suiviPerimetre(lots || [], ym);
  const lotDe = (ref) => (lots || []).find((l) => l && l.ref === ref);
  const bailDe = (c) => { const l = lotDe(c.ref); return l ? l.baux.find((b) => b.cle === c.bailCle) : null; };
  const exig = o.exigible !== false;
  const retard = exig ? trierGroupe(P.enRetard.map((c) => _carteLot(c, lotDe(c.ref), bailDe(c), ym, o))) : [];
  const avance = trierGroupe(P.enAvance.map((c) => _carteLot(c, lotDe(c.ref), bailDe(c), ym, o)));
  // Lots soldés CE mois par un manque accepté : restent visibles (carte « Soldé… » + Annuler).
  const acceptes = [];
  const vus = new Set(retard.concat(avance).map((x) => x.bailCle));
  for (const lot of (lots || [])) {
    const lm = lot && lot.mois && lot.mois[ym];
    if (!lm) continue;
    for (const cle of lm.bauxActifs) {
      if (vus.has(cle)) continue;
      const b = lot.baux.find((x) => x.cle === cle);
      const m = b ? b.mois.find((x) => x.ym === ym) : null;
      if (!m || !m.manque || !(m.manque.montant > EPS) || Math.abs(m.solde) > EPS) continue;
      acceptes.push(_carteLot({ ref: lot.ref, bailCle: cle, noms: b.noms, parti: false, solde: 0 }, lot, b, ym, o));
      vus.add(cle);
    }
  }
  const refsAcc = new Set(acceptes.map((x) => x.ref));
  const aJour = P.aJour.filter((x) => !refsAcc.has(x.ref)).map((x) => ({ ref: x.ref, noms: x.noms || (o.nomLot ? o.nomLot(x.ref) : '') || x.ref }))
    .sort((a, b) => String(a.noms).localeCompare(String(b.noms)));
  // En retard : les lots soldés par un manque viennent après les retards ouverts (maquette).
  const groupeRetard = retard.concat(trierGroupe(acceptes));
  const solde = exig ? P.solde : _r2(P.avance);
  return {
    ym, solde,
    phrase: phraseSynthese({ retard, avance, acceptes }),
    retard: groupeRetard, avance, aJour,
    totalRetard: _r2(retard.reduce((t, x) => t + x.solde, 0)),
    totalAvance: _r2(avance.reduce((t, x) => t + x.solde, 0)),
    nb: groupeRetard.length + avance.length
  };
}

/**
 * Index « mouvement → mois qu'il a payé » d'un lot, pour l'alerte de la page Mouvements : un
 * virement de loyer porte l'alerte s'il est le DERNIER versement imputé à un mois exigible qui reste
 * incomplet (reste dû par mois d'origine `residu` > 0 ; sous la tolérance du 10 il est nul) ; il
 * porte la pastille « manque accepté » si ce mois a un manque accepté.
 * @param {Object} suivi sortie de suiviLot
 * @returns {Map<string, {ym, ref, bailCle, bailDebut, du, recu, manque, plafond, accepte}>}
 */
export function indexMouvementsLot(suivi) {
  const out = new Map();
  if (!suivi || !Array.isArray(suivi.baux)) return out;
  for (const b of suivi.baux) {
    for (const m of b.mois) {
      if (!m.exigible || !((m.du && m.du.total) > EPS)) continue;
      const virs = m.imputations.filter((p) => p.kind === 'virement' && p.mvId != null && p.date);
      if (!virs.length) continue;
      let last = virs[0];
      for (const p of virs) if (String(p.date) >= String(last.date)) last = p;
      const residu = _r2((m.residu.loyer || 0) + (m.residu.charge || 0));
      const acc = m.manque && (m.manque.montant || 0) > EPS ? { id: m.manque.id, montant: _r2(m.manque.montant), motif: m.manque.motif || '', date: m.manque.date || null } : null;
      if (residu <= EPS && !acc) continue;
      const k = String(last.mvId);
      const prev = out.get(k);
      if (prev && prev.manque > EPS) continue;          // une alerte par virement : le 1er mois incomplet
      out.set(k, {
        ym: m.ym, ref: suivi.ref, bailCle: b.cle, bailDebut: debutDeCle(b.cle) || b.debut,
        du: _r2(m.du.total), recu: _r2(m.du.total - residu), manque: residu > EPS ? residu : 0,
        plafond: residu > EPS ? residu : 0, accepte: acc || (prev ? prev.accepte : null)
      });
    }
  }
  return out;
}

/** Texte de l'alerte (maquette 03) : « Loyer incomplet : 760 € reçus sur 780 € (−20 €). Accepter le manque ? » */
export function texteAlerte(info, mvDate) {
  if (!info || !(info.manque > EPS)) return '';
  // Le mois n'est nommé que si le virement en paie un autre que le sien (ex. reçu d'avance le 27/06 pour juillet).
  const autre = info.ym && mvDate && String(mvDate).slice(0, 7) !== info.ym;
  return 'Loyer incomplet' + (autre ? ' (' + moisNom(info.ym) + ')' : '') + ' : ' + eur(info.recu, { court: true }) + ' reçus sur ' + eur(info.du, { court: true })
    + ' (' + eurSigne(-info.manque) + '). Accepter le manque ?';
}
