/**
 * core/finances-scope.js — REFONTE FINANCES étape 1 « socle » (CDC-FINANCES § 1).
 *
 * LE résolveur de périmètre UNIQUE de l'onglet Finances (P-1, P-2, P-3). Aucun moteur ne
 * refait son filtrage maison : tous consomment `lotInScope` (appartenance d'un LOT) et
 * `scopeWeight` (poids d'un MOUVEMENT) — c'est la fin du constat C7.
 *
 *   P-1 · 3 crans : Tout → bailleur → immeuble. PAS de cran logement (décision Didier : le
 *         détail par lot reste une lecture, jamais un périmètre).
 *   P-2 · AUCUN LOT INVISIBLE : les lots sans bailleur vivent dans le panier
 *         « Sans bailleur (à rattacher) », ceux sans immeuble dans « Sans immeuble
 *         (à rattacher) ». Paniers SÉLECTIONNABLES, avec leur compte de lots.
 *         Corrige les constats 13 et 21 : aujourd'hui un lot sans entité est exclu de la
 *         vacance (`_computeBilanAnnuel` filtre `l.entity === entityNom`) mais compté dans
 *         l'impayé — il n'appartenait à aucun périmètre affichable.
 *   P-3 · une seule fonction d'appartenance, une seule fonction de poids.
 *   P-5 · le catalogue expose toujours les immeubles, même s'il n'y en a qu'un.
 *   P-6 · le garde-fou « hors périmètre » ne se tait plus : il pose `scope.fallback`,
 *         que l'UI DOIT annoncer.
 *
 * HORS PÉRIMÈTRE de ce module (étape 7) : P-4, la clé de répartition des frais bailleur.
 * Le défaut reste celui de la prod (`1 / nbImm`, cf `_finEntScope` index.html:50378) ; la clé
 * est INJECTABLE (`opts.sciWeight`, nombre ou fonction du mouvement) pour que l'étape 7 y
 * branche le potentiel locatif mensuel sans toucher à ce fichier.
 *
 * PUR : aucune lecture de DB, aucun DOM. Le parc (`logements`) est toujours injecté.
 * Tests : __tests__/helpers/finances-scope.test.js
 */

import { _groupLogementsByImm } from './group-by-imm.js';

export const SCOPE_KIND = { ALL: 'all', ENT: 'ent', IMM: 'imm' };

/** Clés réservées des paniers « à rattacher » (jamais un nom d'entité/immeuble réel). */
export const SANS_BAILLEUR = '__SANS_BAILLEUR__';
export const SANS_IMMEUBLE = '__SANS_IMMEUBLE__';
export const LABEL_SANS_BAILLEUR = 'Sans bailleur (à rattacher)';
export const LABEL_SANS_IMMEUBLE = 'Sans immeuble (à rattacher)';
export const LABEL_TOUT = 'Tout';

const _s = (v) => String(v == null ? '' : v).trim();
/** Ref tolérante — même politique que _baremeOfLot / _findBailByRefTolerant (trim + minuscule). */
const _nr = (v) => _s(v).toLowerCase();
const _alive = (o) => !!o && !o._deleted;
const _cmpFr = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });

/** Lots vivants du parc, `entity`/`imm`/`ref` normalisés en surface (les objets ne sont pas copiés). */
function _liveLots(logements) {
  return (Array.isArray(logements) ? logements : []).filter(_alive);
}

/**
 * Catalogue du sélecteur en cascade : bailleurs (+ panier « Sans bailleur ») et, pour chacun,
 * ses immeubles (+ panier « Sans immeuble »). `immeubles` au premier niveau = le cran « Tout ».
 * Chaque nœud porte son `nbLots` : l'utilisateur voit le poids de ce qu'il choisit, et les
 * paniers cessent d'être des trous noirs.
 *
 * @param {Array} logements DB.logements (tombstones filtrés ici)
 * @param {{entites?:Array}} [opts] entités connues (objets {nom} ou chaînes) — un bailleur
 *        sans aucun lot reste sélectionnable (il peut porter des frais SCI).
 * @returns {{nbLots:number, entites:Array, immeubles:Array}}
 */
export function buildScopeCatalog(logements, opts) {
  const lots = _liveLots(logements);
  const connues = ((opts && opts.entites) || [])
    .map((e) => _s(typeof e === 'string' ? e : (e && e.nom)))
    .filter(Boolean);

  const parEnt = new Map();          // nom → lots
  const sansEnt = [];
  lots.forEach((l) => {
    const ent = _s(l.entity);
    if (!ent) { sansEnt.push(l); return; }
    if (!parEnt.has(ent)) parEnt.set(ent, []);
    parEnt.get(ent).push(l);
  });
  connues.forEach((nom) => { if (!parEnt.has(nom)) parEnt.set(nom, []); });

  const entites = Array.from(parEnt.keys()).sort(_cmpFr).map((nom) => ({
    key: nom, label: nom, unassigned: false,
    nbLots: parEnt.get(nom).length,
    immeubles: _immNodes(parEnt.get(nom))
  }));
  if (sansEnt.length) {
    entites.push({
      key: SANS_BAILLEUR, label: LABEL_SANS_BAILLEUR, unassigned: true,
      nbLots: sansEnt.length, immeubles: _immNodes(sansEnt)
    });
  }
  return { nbLots: lots.length, entites, immeubles: _immNodes(lots) };
}

/** Nœuds « immeuble » d'un jeu de lots — délègue le groupage/tri à _groupLogementsByImm (DRY). */
function _immNodes(lots) {
  return _groupLogementsByImm(lots).map((g) => (g.isUnassigned
    ? { key: SANS_IMMEUBLE, label: LABEL_SANS_IMMEUBLE, unassigned: true, nbLots: g.logements.length }
    : { key: g.imm, label: g.imm, unassigned: false, nbLots: g.logements.length }));
}

/**
 * Résout une sélection d'UI en périmètre exploitable par les 4 moteurs.
 *
 * @param {{ent?:string, imm?:string}} selection `ent`/`imm` = '' (tout), un nom, ou une clé
 *        de panier (SANS_BAILLEUR / SANS_IMMEUBLE).
 * @param {Array} logements DB.logements
 * @param {{entites?:Array, sciWeight?:number|function}} [opts]
 * @returns {Object} scope — voir `scopeWeight` / `lotInScope`
 */
export function resolveScope(selection, logements, opts) {
  const sel = selection || {};
  const o = opts || {};
  const lots = _liveLots(logements);
  const cat = buildScopeCatalog(lots, o);

  let fallback = null;

  // ── Cran bailleur ─────────────────────────────────────────────────────────
  let entKey = _s(sel.ent);
  if (entKey && entKey !== SANS_BAILLEUR && !cat.entites.some((e) => e.key === entKey)) {
    fallback = { raison: 'ent-inconnu', entDemande: entKey };   // P-6 : on le DIT
    entKey = '';
  }
  // Lots du cran bailleur seul — passe par `lotInScope` (règle unique, paniers compris).
  const entCran = { kind: entKey ? SCOPE_KIND.ENT : SCOPE_KIND.ALL, entKey, immKey: '' };
  const entLots = lots.filter((l) => lotInScope(entCran, l));

  // ── Cran immeuble ─────────────────────────────────────────────────────────
  let immKey = _s(sel.imm);
  if (immKey && immKey !== SANS_IMMEUBLE && !entLots.some((l) => _s(l.imm) === immKey)) {
    fallback = { raison: 'imm-hors-perimetre', immDemande: immKey };
    immKey = '';
  }

  const kind = immKey ? SCOPE_KIND.IMM : (entKey ? SCOPE_KIND.ENT : SCOPE_KIND.ALL);

  // Entité PORTEUSE des frais SCI. Sélection explicite, sinon dérivée de l'immeuble choisi
  // (parité `_finEntScope`) : elle ne sert QU'À la quote-part, jamais à l'appartenance des lots
  // — un lot de l'immeuble rattaché à un autre bailleur reste dans le périmètre (P-2).
  let ent = (entKey && entKey !== SANS_BAILLEUR) ? entKey : '';
  if (!ent && immKey && immKey !== SANS_IMMEUBLE) {
    const porteur = lots.find((l) => _s(l.imm) === immKey && _s(l.entity));
    if (porteur) ent = _s(porteur.entity);
  }
  // Immeubles du BAILLEUR (dénominateur de la quote-part), pas du périmètre affiché.
  const baseImm = ent ? lots.filter((l) => _s(l.entity) === ent) : entLots;
  const immsBailleur = Array.from(new Set(baseImm.map((l) => _s(l.imm)).filter(Boolean))).sort(_cmpFr);
  const nbImm = immsBailleur.length;

  let sciWeight = 1;
  if (o.sciWeight != null) sciWeight = o.sciWeight;                      // P-4 (étape 7) injecté
  else if (kind === SCOPE_KIND.IMM && immKey !== SANS_IMMEUBLE && nbImm > 0) sciWeight = 1 / nbImm;

  // Immeubles DU PÉRIMÈTRE (pour les mouvements de niveau immeuble).
  const imms = immKey === SANS_IMMEUBLE ? []
    : (immKey ? [immKey] : immsBailleur.slice());

  const scope = {
    kind, entKey, immKey, ent,
    immFilter: (immKey && immKey !== SANS_IMMEUBLE) ? immKey : null,
    sansBailleur: entKey === SANS_BAILLEUR,
    sansImmeuble: immKey === SANS_IMMEUBLE,
    imms, nbImm, sciWeight, fallback,
    refs: [], nbLots: 0, label: ''
  };
  scope.refs = scopeRefs(scope, lots);
  scope.nbLots = scope.refs.length;
  scope.label = scopeLabel(scope);
  return scope;
}

/** Libellé affichable du périmètre (« SCI Alpha · Lilas », « Sans bailleur (à rattacher) »…). */
export function scopeLabel(scope) {
  if (!scope || scope.kind === SCOPE_KIND.ALL) return LABEL_TOUT;
  const g = scope.entKey === SANS_BAILLEUR ? LABEL_SANS_BAILLEUR : scope.entKey;
  const d = scope.immKey === SANS_IMMEUBLE ? LABEL_SANS_IMMEUBLE : scope.immKey;
  return [g, d].filter(Boolean).join(' · ') || LABEL_TOUT;
}

/**
 * APPARTENANCE D'UN LOT — la fonction unique (P-3). Consommée par la vacance/occupation,
 * le recouvrement, le tableau : plus aucun moteur ne réécrit `l.entity === X`.
 * @param {Object|null} scope null / cran « Tout » → tout lot vivant appartient
 * @param {Object} lot logement
 */
export function lotInScope(scope, lot) {
  if (!_alive(lot)) return false;
  if (!scope || scope.kind === SCOPE_KIND.ALL) return true;
  const ent = _s(lot.entity), imm = _s(lot.imm);
  if (scope.entKey === SANS_BAILLEUR) { if (ent) return false; }
  else if (scope.entKey && ent !== scope.entKey) return false;
  if (scope.immKey === SANS_IMMEUBLE) return !imm;
  if (scope.immKey) return imm === scope.immKey;
  return true;
}

/** Lots du périmètre (objets), ordre d'origine préservé. */
export function scopeLots(scope, logements) {
  return _liveLots(logements).filter((l) => lotInScope(scope, l));
}

/** Refs des lots du périmètre — même règle que `lotInScope`, jamais un filtre parallèle. */
export function scopeRefs(scope, logements) {
  return scopeLots(scope, logements).map((l) => _s(l.ref)).filter(Boolean);
}

/**
 * POIDS D'UN MOUVEMENT dans le périmètre — la fonction unique (P-3, remplace
 * `_finScopeWeight` index.html:50397). 0 = hors périmètre · 1 = rattaché · 0..1 = quote-part
 * d'un frais de niveau bailleur en vue immeuble.
 *
 * Règles (parité `_compute2044` conservée) :
 *   - `qui` = ref d'un lot du périmètre → 1 (ref tolérante : trim + casse) ;
 *   - `qui` = 'SCI:<bailleur>' → quote-part `scope.sciWeight` (clé P-4 injectable) ;
 *   - `qui` VIDE et `imm` dans le périmètre → 1 (un mouvement de niveau immeuble ne compte
 *     que si aucun lot n'est désigné, sinon il serait compté deux fois) ;
 *   - sinon 0.
 *
 * @param {Object|null} scope
 * @param {Object} mv mouvement
 * @returns {number} 0..1
 */
export function scopeWeight(scope, mv) {
  if (!mv || mv._deleted) return 0;
  if (!scope || scope.kind === SCOPE_KIND.ALL) return 1;
  const qui = _s(mv.qui);
  if (qui && scope.refs.some((r) => _nr(r) === _nr(qui))) return 1;
  if (scope.ent && qui === 'SCI:' + scope.ent) {
    const w = typeof scope.sciWeight === 'function' ? scope.sciWeight(mv) : scope.sciWeight;
    const n = Number(w);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
  }
  if (!qui && scope.imms.indexOf(_s(mv.imm)) >= 0) return 1;
  return 0;
}

/** `scopeWeight > 0` — remplace `_finInScope`. */
export function inScope(scope, mv) { return scopeWeight(scope, mv) > 0; }
