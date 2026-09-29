/**
 * core/avenant-registre.js — AVENANT-REFONTE lot 2 (29/09) : registre des avenants d'un bail.
 *
 * Décision A (Didier 28/09) : un avenant vit À CÔTÉ du bail, jamais dans la ligne du bail (verrouillée
 * au cloud une fois signée). Il est une entrée du journal `DB.baux_evenements` (table cloud
 * `baux_evenements`, type 'avenant' autorisé par la migration 0054, RLS par entité du bail) :
 *   { id, type:'avenant', ref (clé nue du logement), bailDebut, _espaceId?, bailUid?, signedAt?,
 *     no, statut, date (= date d'effet), ville, objets:[{k,data}], html (document figé),
 *     appliques:[libellés], docSeul:[libellés], createdAt, statutLe, signeLe?, signeMode?, _modifiedAt }
 *
 * Avant ce lot, un avenant était écrit dans `bail.avenants[]` (+ un événement 'avenant' de
 * `DB.bailEvents` depuis v15.681). Ces avenants ne sont PAS recopiés au chargement (deux appareils
 * créeraient la même ligne en même temps) : ils sont lus tels quels et affichés comme les autres
 * (`virtuel:true`). Au premier geste qui change leur statut, l'app écrit leur entrée de registre (même
 * `id` déterministe) — qui prend alors le pas sur l'ancienne trace.
 *
 * Statuts (§9) : Brouillon (rien appliqué, modifiable, supprimable) → À signer (enregistré, figé) →
 * Signé · Annulé (conservé, barré ; possible seulement tant que rien n'a été appliqué au bail).
 *
 * Module PUR : aucune lecture de DB ni de l'horloge (dates injectées).
 */

export const STATUTS = {
  brouillon: { l: 'Brouillon', ton: 'mute' },
  a_signer: { l: 'À signer', ton: 'warn' },
  signe: { l: 'Signé', ton: 'ok' },
  annule: { l: 'Annulé', ton: 'mute' },
};

// Transitions permises. « Signé » et « Annulé » sont définitifs : on revient sur un avenant signé
// par un NOUVEL avenant, jamais en le modifiant.
const TRANSITIONS = {
  brouillon: ['a_signer'],
  a_signer: ['signe', 'annule'],
  signe: [],
  annule: [],
};

const _ymd = (s) => String(s == null ? '' : s).slice(0, 10);
export const cleNue = (k) => String(k == null ? '' : k).split('@@')[0];

/** Vrai si l'entrée `e` (registre ou trace ancienne) concerne CE bail : même logement, même bail
 *  (date de début — un logement garde la même clé au fil des baux), même espace si l'entrée en porte un. */
function _memeBail(e, cle, bail, { strictEspace }) {
  if (!e || e._deleted || e.type !== 'avenant') return false;
  if (cleNue(e.ref) !== cleNue(cle)) return false;
  const esp = (bail && bail._espaceId) || null;
  const eEsp = e._espaceId == null ? null : e._espaceId;
  if (strictEspace ? eEsp !== esp : (eEsp != null && eEsp !== esp)) return false;
  const debut = _ymd(bail && bail.debut);
  // Même début de bail, ou daté à partir du début du bail (date de début corrigée après coup, trace
  // ancienne sans bailDebut). Un avenant du bail PRÉCÉDENT est daté avant le début du bail courant.
  return (!!e.bailDebut && _ymd(e.bailDebut) === debut) || (!!debut && _ymd(e.date) >= debut);
}

/** Entrées de REGISTRE du bail (hors supprimées), triées par numéro croissant. */
export function avenantsDuBail(journal, cle, bail) {
  return (Array.isArray(journal) ? journal : [])
    .filter((e) => _memeBail(e, cle, bail, { strictEspace: true }))
    .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
}

/** Identifiant déterministe d'un avenant ancien (même valeur sur tous les appareils). */
export function idAvenantRepris(cle, bail, no) {
  return 'av_rep_' + cleNue(cle) + '_' + _ymd(bail && bail.debut) + '_' + (Number(no) || 0);
}

// Avant v15.681 (et encore depuis, pour loyer / charges), un avenant appliquait loyer et charges DÈS
// l'enregistrement. Sans trace de ce qui a été appliqué, on considère appliqué ce qui pouvait l'être.
function _appliquesDeduits(objets) {
  const ks = (objets || []).map((o) => (o && typeof o === 'object' ? o.k : o));
  const out = [];
  if (ks.includes('loyer')) out.push('Loyer');
  if (ks.includes('charges')) out.push('Charges');
  return out;
}

/**
 * Tous les avenants du bail, pour l'affichage : registre + avenants anciens non encore repris
 * (`virtuel:true`, statut « À signer » : l'app n'a jamais su s'ils avaient été signés).
 * Ordre : numéro décroissant (le plus récent en tête).
 */
export function listeAvenants({ journal, bailEvents, cle, bail } = {}) {
  const b = bail || {};
  const reg = avenantsDuBail(journal, cle, b);
  const pris = new Set(reg.map((e) => Number(e.no) || 0));
  const anciens = new Map();   // no → avenant reconstitué
  for (const a of (Array.isArray(b.avenants) ? b.avenants : [])) {
    const no = Number(a && a.no) || 0;
    if (!no || pris.has(no)) continue;
    const objets = Array.isArray(a.objets) ? a.objets : [];
    anciens.set(no, {
      id: idAvenantRepris(cle, b, no), type: 'avenant', virtuel: true, ref: cleNue(cle), bailDebut: _ymd(b.debut),
      no, statut: 'a_signer', date: _ymd(a.dateEffet), ville: a.ville || '', objets, html: a.html || null,
      createdAt: a.createdAt || null, appliques: _appliquesDeduits(objets), docSeul: null,
    });
  }
  for (const e of (Array.isArray(bailEvents) ? bailEvents : [])) {
    if (!_memeBail(e, cle, b, { strictEspace: false })) continue;
    const no = Number(e.no) || 0;
    if (!no || pris.has(no)) continue;
    const prev = anciens.get(no);
    const appliques = Array.isArray(e.appliques) ? e.appliques.slice() : null;
    if (prev) {
      // Même avenant vu des deux côtés : l'événement dit ce qui a VRAIMENT été appliqué.
      if (appliques) prev.appliques = appliques;
      if (Array.isArray(e.docSeul)) prev.docSeul = e.docSeul.slice();
      if (!prev.date) prev.date = _ymd(e.date);
      continue;
    }
    const objets = (Array.isArray(e.objets) ? e.objets : []).map((k) => ({ k }));
    anciens.set(no, {
      id: idAvenantRepris(cle, b, no), type: 'avenant', virtuel: true, ref: cleNue(cle), bailDebut: _ymd(b.debut),
      no, statut: 'a_signer', date: _ymd(e.date), ville: '', objets, html: null, createdAt: null,
      appliques: appliques || _appliquesDeduits(objets), docSeul: Array.isArray(e.docSeul) ? e.docSeul.slice() : null,
    });
  }
  return reg.concat([...anciens.values()]).sort((a, b2) => (Number(b2.no) || 0) - (Number(a.no) || 0));
}

/** Numéro du prochain avenant : max des numéros connus (registre, brouillons compris, et anciens) + 1. */
export function numeroSuivant(args) {
  let max = 0;
  for (const a of listeAvenants(args)) max = Math.max(max, Number(a.no) || 0);
  return max + 1;
}

/** Nouvelle entrée de registre. `now` : ISO injecté. */
export function nouvelAvenant({ id, cle, bail, no, statut, date, ville, objets, html, appliques, docSeul, now } = {}) {
  const b = bail || {};
  if (!STATUTS[statut] || statut === 'signe' || statut === 'annule') throw new Error('nouvelAvenant : statut initial invalide ' + statut);
  const e = {
    id, type: 'avenant', ref: cleNue(cle), bailDebut: _ymd(b.debut), no: Number(no) || 1, statut,
    date: _ymd(date), ville: ville || '', objets: JSON.parse(JSON.stringify(objets || [])), html: html || null,
    appliques: (appliques || []).slice(), docSeul: (docSeul || []).slice(),
    createdAt: now, statutLe: now, _modifiedAt: now,
  };
  if (b._espaceId != null) e._espaceId = b._espaceId;
  // Rattachement à la ligne cloud du bail (store-sync `_rattacherJournal` : signature + uid).
  if (b._bailUid) e.bailUid = b._bailUid;
  if (b.signatures && b.signatures.signedAt) e.signedAt = b.signatures.signedAt;
  return e;
}

/** Peut-on passer de `av.statut` à `statut` ? Annuler exige que rien n'ait été appliqué au bail. */
export function transitionPermise(av, statut) {
  if (!av || !TRANSITIONS[av.statut] || !TRANSITIONS[av.statut].includes(statut)) return false;
  if (statut === 'annule' && (av.appliques || []).length) return false;
  return true;
}

/**
 * Copie de l'avenant au nouveau statut (null si la transition est interdite). Un avenant ancien
 * (`virtuel`) devient une vraie entrée de registre : on retire le marqueur.
 * `extra` : { signeLe, signeMode } pour « Signé ».
 */
export function avecStatut(av, statut, now, extra) {
  if (!transitionPermise(av, statut)) return null;
  const e = JSON.parse(JSON.stringify(av));
  delete e.virtuel;
  e.statut = statut; e.statutLe = now; e._modifiedAt = now;
  if (!e.createdAt) e.createdAt = now;
  if (statut === 'signe') {
    e.signeLe = _ymd((extra && extra.signeLe) || now);
    e.signeMode = (extra && extra.signeMode) || 'papier';
  }
  return e;
}

/** Gestes proposés sur une carte (l'écran n'affiche que ceux-là). */
export function actionsAvenant(av) {
  if (!av) return [];
  const a = [];
  if (av.statut === 'brouillon') return ['reprendre', 'supprimer'];
  if (av.html) a.push('voir', 'pdf');
  if (transitionPermise(av, 'signe')) a.push('signe-papier');
  if (transitionPermise(av, 'annule')) a.push('annuler');
  return a;
}

const _eur = (v) => {
  const s = String(v == null ? '' : v).trim();
  const n = Number(s.replace(',', '.'));
  return s !== '' && Number.isFinite(n) ? n.toFixed(2).replace('.', ',') + ' €' : '';
};

/** Titre court d'un objet (« Départ de Bruno Leroy », « Charges 95,00 € »…). Texte brut. */
function _titreObjet(o, libelles) {
  const k = o && o.k; const d = (o && o.data) || {};
  const lbl = (libelles && libelles[k]) || k || '';
  if (k === 'coloc') {
    const act = String(d.act || '');
    if (/^Départ/.test(act) && d.sortant) return 'Départ de ' + d.sortant;
    if (/^Ajout/.test(act) && d.entrant) return 'Arrivée de ' + d.entrant;
    if (/^Remplacement/.test(act) && (d.sortant || d.entrant)) return 'Remplacement de ' + (d.sortant || '?') + ' par ' + (d.entrant || '?');
    return lbl;
  }
  if (k === 'caution') {
    const act = String(d.act || '');
    const nom = String(d.nom || '').trim();
    if (/^Mainlevée/.test(act)) return nom ? 'Mainlevée de la caution ' + nom : 'Mainlevée de caution';
    if (/^Remplacement/.test(act)) return nom ? 'Nouvelle caution : ' + nom : 'Remplacement de caution';
    return nom ? 'Caution : ' + nom : lbl;
  }
  if (k === 'loyer') { const m = _eur(d.nouveau); return m ? 'Loyer ' + m + ' HC' : lbl; }
  if (k === 'charges') { const m = _eur(d.montant); return m ? 'Charges ' + m : lbl; }
  return lbl;
}

/** « Avenant n° 2 — Départ de Bruno Leroy · Charges 95,00 € ». Texte brut (à échapper). */
export function titreAvenant(av, libelles) {
  const objs = (av && Array.isArray(av.objets) ? av.objets : []).map((o) => _titreObjet(typeof o === 'object' ? o : { k: o }, libelles)).filter(Boolean);
  return 'Avenant n° ' + ((av && av.no) || '?') + (objs.length ? ' — ' + objs.join(' · ') : '');
}
