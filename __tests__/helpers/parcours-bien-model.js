// Modèle pur du fil rouge « Ajouter un bien ». Aucune dépendance DOM.
// Décision user 2026-07-11 : Identité obligatoire pour créer un logement.

const _s = (v) => (v == null ? '' : String(v)).trim();

/** Champs requis pour créer un logement (les `*` de l'onglet Identité de #ov-log). */
export const LOG_REQUIRED = ['ref', 'typeUsage', 'entity', 'imm'];

export function canCreateLogement(fields) {
  const f = fields || {};
  const missing = LOG_REQUIRED.filter((k) => _s(f[k]) === '');
  return { ok: missing.length === 0, missing };
}

/** Champs « clés » des onglets optionnels qui font passer un logement à `complet`. */
export const LOG_OPTIONAL_KEY = ['surface', 'loyer', 'dpe'];

// Identité « minimale » d'un logement stocké, utilisée pour le badge de complétude du
// parcours : réf + rattachement (bailleur/immeuble). `typeUsage` reste requis pour CRÉER
// (voir canCreateLogement) mais n'entre pas dans le badge de complétude affiché.
const LOG_COMPLETENESS_IDENTITY = ['ref', 'entity', 'imm'];

export function logementCompleteness(log) {
  const l = log || {};
  const missingId = LOG_COMPLETENESS_IDENTITY.filter((k) => _s(l[k]) === '');
  const missingOpt = LOG_OPTIONAL_KEY.filter((k) => _num(l[k]) === '');
  if (missingId.length) return { level: 'a-completer', missing: [...missingId, ...missingOpt] };
  return { level: missingOpt.length ? 'a-completer' : 'complet', missing: missingOpt };
}

export function immeubleCompleteness(imm) {
  const adr = _s((imm || {}).adr);
  return adr ? { level: 'complet', missing: [] } : { level: 'a-completer', missing: ['adr'] };
}

// `surface`/`loyer` numériques : 0 ou vide = manquant ; `dpe` textuel.
function _num(v) {
  if (v === 0) return '';
  return _s(v);
}

const ORPHAN_LABEL = '— Sans immeuble —';

export function buildParcoursTree(entite, allLogements) {
  const ent = entite || { nom: '', immeubles: [] };
  const logs = (allLogements || []).filter((l) => l && l.entity === ent.nom);
  const immList = (ent.immeubles || []).map((im) => ({
    id: im.id,
    nom: im.nom,
    adr: im.adr || '',
    raw: im,
    completeness: immeubleCompleteness(im),
    logements: logs.filter((l) => (l.imm || '') === im.nom).map(_decorateLog),
  }));
  const known = new Set((ent.immeubles || []).map((im) => im.nom));
  const orphans = logs.filter((l) => !known.has(l.imm || '')).map(_decorateLog);
  if (orphans.length) {
    immList.push({ id: null, nom: ORPHAN_LABEL, adr: '', raw: null, synthetic: true,
      completeness: { level: 'a-completer', missing: [] }, logements: orphans });
  }
  return { bailleur: { id: ent.id, nom: ent.nom }, immeubles: immList };
}

function _decorateLog(l) {
  return { ...l, completeness: logementCompleteness(l) };
}

export function parcoursSummary(tree) {
  const t = tree || { immeubles: [] };
  const realImms = t.immeubles.filter((i) => !i.synthetic);
  const allLogs = t.immeubles.flatMap((i) => i.logements);
  return {
    nbImmeubles: realImms.length,
    nbLogements: allLogs.length,
    logementsALouer: allLogs.filter((l) => !_s(l.locataire)),
  };
}
