// Conducteur pur du fil rouge « Ajouter un bien ». AUCUNE dépendance DOM ni données.
// Ne gère que la NAVIGATION (étapes) et le FIL D'ARIANE. La donnée vit dans DB.

export const STEPS = ['start', 'ent', 'imm', 'log', 'next', 'done', 'bail', 'transition', 'completion'];

// Étape de départ selon le point d'entrée.
export function entryStep(kind) {
  switch (kind) {
    case 'bien': return 'start';        // porte unique : « + Ajouter un bien » ouvre le choix acte/manuel
    case 'acte': return 'log';          // acte : bailleur+immeuble pré-remplis, on confirme le lot
    case 'continue-ent': return 'imm';  // continuité après un bailleur créé hors fil
    case 'continue-imm': return 'log';  // continuité après un immeuble créé hors fil
    default: return 'ent';
  }
}

// Transition sur événement. Retourne l'étape suivante (ou l'étape courante si non géré).
const _T = {
  start: { manual: 'ent' }, // « saisir à la main » ; le choix « acte » est piloté hors machine (ouvre le wizard d'import)
  ent:  { saved: 'imm' },
  imm:  { saved: 'log', back: 'ent' },
  log:  { saved: 'next', back: 'imm' },
  // Décision user 13/08 : la fin du fil MANUEL enchaîne sur la complétion (écran 'transition' →
  // accordéon), exactement comme l'import d'acte. L'ancienne sortie 'done' (« tout est déjà en
  // place ») faisait croire le bien terminé alors que 6 champs seulement avaient été saisis.
  // 'done' reste dans STEPS (compat : _frContinueTo/_frOfferContinue hors fil y mènent encore).
  next: { addLog: 'log', addImm: 'imm', finish: 'transition' },
  done: { createBail: 'bail' },
  bail: { back: 'done' },
};
export function advance(step, event) {
  // Fil complet (post-import d'acte) : ces 2 écrans se FERMENT (null = fin du fil).
  if (step === 'transition') return event === 'continue' ? 'completion' : null;
  if (step === 'completion') return null;
  const row = _T[step];
  return (row && row[event]) || step;
}

// Descripteurs du fil d'Ariane (4 maillons). ctx = {step, entName, immName, lastLogRef, logCount, bailDone}
export function breadcrumb(ctx) {
  const c = ctx || {};
  const step = c.step || 'ent';
  const has = { ent: !!c.entName, imm: !!c.immName };
  const logCur = step === 'log' || step === 'next';
  const logDone = step === 'done' || step === 'bail';
  const logLabel = (c.lastLogRef)
    ? (c.lastLogRef + (c.logCount > 1 ? ' +' + (c.logCount - 1) : ''))
    : 'Logement';
  return [
    { key: 'ent', icon: '👤', state: has.ent ? 'done' : ((step === 'ent' || step === 'start') ? 'cur' : 'todo'), label: c.entName || 'Bailleur' },
    { key: 'imm', icon: '🏛', state: has.imm ? 'done' : (step === 'imm' ? 'cur' : 'todo'), label: c.immName || 'Immeuble' },
    { key: 'log', icon: '🏠', state: logDone ? 'done' : (logCur ? 'cur' : 'todo'), label: logLabel },
    { key: 'bail', icon: '✍', state: c.bailDone ? 'done' : ((step === 'done' || step === 'bail') ? 'cur' : 'todo'), label: 'Bail' },
  ];
}
