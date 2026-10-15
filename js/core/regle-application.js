/**
 * js/core/regle-application.js — RETOURS 15/10 (lot 2, point 5) : appliquer une règle de classement aux mouvements
 * DÉJÀ ENREGISTRÉS, sur confirmation (Didier revient le 15/10 sur la décision n°3 du 06/10).
 *
 * Après l'enregistrement d'une règle (création ou modification), l'app PROPOSE « Appliquer aussi aux N mouvements
 * concernés ? » avec la liste, en trois groupes :
 *   - aClasser  : sans catégorie, ou de la même catégorie mais sans affectation — cochés par défaut ;
 *   - parRegle  : classés par l'ANCIENNE version de cette même règle et jamais retouchés depuis — cochés ;
 *   - autrement : classés à la main, par une autre règle, ou découpés — DÉCOCHÉS et signalés (jamais reclassés sans
 *                 que l'utilisateur le voie et le coche).
 * Rien n'est jamais appliqué ici : le module rend la liste, l'app applique les cases cochées par le même chemin que le
 * mouvement de départ (_bankRulePatchMouvement), dans une seule opération annulable.
 *
 * « Classé à la main » : `m._classeMain` (posé par la fiche du mouvement quand la catégorie ou l'affectation change, par
 * l'import quand la ligne a été retouchée). Pour les mouvements antérieurs à ce marqueur, règle CONSERVATRICE : un
 * mouvement qui porte la trace de la règle n'est « classé par cette règle » que si son classement est encore exactement
 * celui que l'ancienne version produisait ; sinon il a été retouché → « classé autrement », décoché.
 */
import { _bankRulePatchMouvement, _bankRuleTraceKey } from './bank-import.js'

const CHAMPS = ['cat', 'qui', 'imm', 'compteurCcId']
const s = v => (v == null ? '' : String(v))

/** Le classement d'un mouvement (catégorie + affectation), en chaînes. */
export function classementDe(m) {
  const o = {}
  for (const k of CHAMPS) o[k] = s(m && m[k])
  return o
}

export function memeClassement(a, b) {
  return CHAMPS.every(k => s(a && a[k]) === s(b && b[k]))
}

/**
 * Le classement qu'aurait le mouvement après le correctif d'une règle, avec les mêmes règles d'écriture que l'app :
 * compteur et logement exclusifs (le compteur l'emporte), immeuble déduit du logement affecté.
 */
export function classementApres(m, patch, logements) {
  const c = classementDe(Object.assign({}, m, patch || {}))
  if (c.compteurCcId && c.qui) c.qui = ''
  if (patch && 'qui' in patch && c.qui && !c.qui.startsWith('SCI:')) {
    const log = (Array.isArray(logements) ? logements : []).find(l => l && !l._deleted && l.ref === c.qui)
    if (log) c.imm = s(log.imm)
  }
  return c
}

/**
 * La fiche d'un mouvement a-t-elle changé son classement à la main ? (catégorie ou affectation différente)
 * Rend true si oui ; sinon false (le marqueur existant est alors conservé tel quel par l'appelant).
 */
export function classeMainApresEdition(avant, apres) {
  return !memeClassement(classementDe(avant), classementDe(apres))
}

export const RAISONS = {
  'a-classer': 'à classer',
  affecte: 'déjà affecté',
  'non-affecte': 'sans affectation',
  'ancienne-version': 'classé par cette règle',
  main: 'classé à la main',
  retouche: 'retouché à la main',
  'autre-regle': 'classé par une autre règle',
  decoupe: 'mouvement découpé',
  autrement: 'déjà classé',
}

/**
 * Les mouvements déjà enregistrés concernés par `rule`.
 * @param {object} rule — la règle enregistrée (nouvelle version)
 * @param {object} o — { mouvements, ancienne (version précédente de la règle, ou null), comptes (bankAccounts),
 *                       logements, sourceId (mouvement de départ, déjà traité), loyerCC }
 * @returns {{aClasser:object[], parRegle:object[], autrement:object[], total:number}} — chaque élément :
 *          { id, mv, patch, avant, apres, raison }
 */
export function mouvementsConcernes(rule, o = {}) {
  const out = { aClasser: [], parRegle: [], autrement: [], total: 0 }
  if (!rule || rule._deleted || !rule.compte) return out
  const compte = String(rule.compte)
  const comptes = Array.isArray(o.comptes) ? o.comptes : []
  const acc = comptes.find(a => a && !a._deleted && String(a.id) === compte) || null
  const trace = _bankRuleTraceKey(rule)
  const ancienne = o.ancienne && !o.ancienne._deleted ? o.ancienne : null
  const src = o.sourceId == null ? null : String(o.sourceId)
  for (const m of Array.isArray(o.mouvements) ? o.mouvements : []) {
    if (!m || m._deleted) continue
    if (src != null && String(m.id) === src) continue
    if (s(m._bankAccountId) !== compte) continue          // même compte seulement (une règle appartient à un compte)
    const r = _bankRulePatchMouvement(rule, m, { account: acc, loyerCC: o.loyerCC })
    if (!r.ok) continue                                    // ne correspond pas (mots, sens, montant, exception)
    const avant = classementDe(m)
    const apres = classementApres(m, r.patch, o.logements)
    if (memeClassement(avant, apres)) continue             // déjà classé ainsi : rien à proposer
    const el = { id: m.id, mv: m, patch: r.patch, avant, apres, raison: '' }
    const traces = Array.isArray(m._rules) ? m._rules.map(String) : []
    const sansAff = !avant.qui && !avant.imm && !avant.compteurCcId
    const affChange = ['qui', 'imm', 'compteurCcId'].some(k => avant[k] !== apres[k])
    if (m._splitGroup) { el.raison = 'decoupe'; out.autrement.push(el) }
    else if (m._classeMain) { el.raison = 'main'; out.autrement.push(el) }
    // Sans catégorie : « à classer »… sauf si une affectation, posée sans la règle, serait remplacée (relecture Fable A1).
    else if (!avant.cat) { if (!sansAff && affChange) { el.raison = 'affecte'; out.autrement.push(el) } else { el.raison = 'a-classer'; out.aClasser.push(el) } }
    else if (sansAff && avant.cat === apres.cat) { el.raison = 'non-affecte'; out.aClasser.push(el) }
    else if (trace && traces.includes(trace)) {
      // Trace de cette règle : « classé par cette règle » SEULEMENT si le classement est encore celui de l'ancienne version
      // ET si chaque champ que la nouvelle version change était posé par l'ancienne (une affectation faite à la main sur un
      // mouvement que l'ancienne règle ne classait qu'en catégorie n'est pas « par cette règle » — relecture Fable A1).
      const old = ancienne ? _bankRulePatchMouvement(ancienne, m, { account: acc, loyerCC: o.loyerCC }) : null
      const poses = new Set(old && old.ok ? Object.keys(old.patch || {}) : [])
      if (poses.has('qui') || poses.has('compteurCcId')) { poses.add('qui'); poses.add('imm'); poses.add('compteurCcId') }
      const changes = CHAMPS.filter(k => avant[k] !== apres[k])
      if (old && old.ok && memeClassement(avant, classementApres(m, old.patch, o.logements)) && changes.every(k => poses.has(k))) { el.raison = 'ancienne-version'; out.parRegle.push(el) }
      else { el.raison = 'retouche'; out.autrement.push(el) }
    }
    else if (traces.some(t => t !== trace)) { el.raison = 'autre-regle'; out.autrement.push(el) }
    else { el.raison = 'autrement'; out.autrement.push(el) }
  }
  const parDate = (a, b) => s(b.mv.date).localeCompare(s(a.mv.date))
  out.aClasser.sort(parDate); out.parRegle.sort(parDate); out.autrement.sort(parDate)
  out.total = out.aClasser.length + out.parRegle.length + out.autrement.length
  return out
}
