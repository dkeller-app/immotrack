// BAIL-EN-COURS-MODIFIER-PERIODES — étape 6 : l'ORCHESTRATEUR (js/app/app-part2.js) exécuté tel quel.
// Les fonctions _bailPeriode* (et leurs voisines _findBailByRefTolerant, _migrationBailsForLot, _stamp, _histoBailTodayIso,
// _qaMoisToDate) sont extraites par nom du VRAI code et évaluées dans un vm avec un DB simulé ; les modules purs sont les vrais.
// Couvre : recalage du loyer vivant (bail + logement), entrée de journal (forme + mapping cloud), retour arrière si exception
// ou si la sauvegarde échoue, simulation sans écriture, bail signé, composition avec saveBail.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as BaremeEdition from '../../js/core/bareme-edition.js'
import { bailsFromRaw, periodeEnVigueurA } from '../../js/core/loyer-du-mois.js'
import { chapitrePour, montantSaisi, synchroniserPeriodeBail, periodeInitialeBail, appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js'
import { mapToRow } from '../../js/core/store-mapping.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
function extraire(src, nom) {
  const i = src.indexOf(`function ${nom}(`)
  if (i < 0) throw new Error('fonction introuvable : ' + nom)
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error('accolades non équilibrées : ' + nom)
}

const REF = 'D-101', BD = '2023-09-01'
function monde(over = {}) {
  const bareme = appliquerNouvellePeriode([periodeInitialeBail({ ref: REF, debut: BD, hc: 600, ch: 80 })],
    { ref: REF, debut: '2026-09-01', hc: 640, ch: 80, source: 'manuel', bailDebut: BD, note: 'Accord' })
  const DB = {
    baux: { [REF]: { ref: REF, debut: BD, hc: 640, ch: 80 } },
    baux_historique: [], logements: [{ ref: REF, hc: 640, ch: 80 }], loyerBareme: bareme,
    quittances: [], baux_evenements: [], ...over
  }
  const calls = { save: 0, theo: 0, toasts: [], audit: [] }
  const sb = {
    DB, Date, String, Object, Array, Number, Math, JSON, RegExp, console,
    _loyerPayeDuMois: () => 0,
    _pushLoyerTheoFromLive: () => { calls.theo++ },
    saveDB: () => { calls.save++; return sb.__saveOk },
    __saveOk: true,
    showToast: (m, t) => calls.toasts.push([t, m]),
    _auditLog: (...a) => calls.audit.push(a),
    _appUserName: () => 'Didier',
    _undoOnSaveDBSuccess: () => {},
    _migrationBailsForLot: undefined,
    window: { BaremeEdition, bailsFromRaw, _loyerPeriodeEnVigueurA: periodeEnVigueurA, _baremeChapitrePour: chapitrePour, _montantSaisi: montantSaisi }
  }
  vm.createContext(sb)
  vm.runInContext([
    extraire(P1, '_stamp'), extraire(P1, '_findBailByRefTolerant'), extraire(P1, '_migrationBailsForLot'), extraire(P2, '_histoBailTodayIso'),
    ...['_bailPeriodeNouvelId', '_bailPeriodeNrRef', '_bailPeriodeBailDuChapitre', '_bailPeriodeDecorer', '_bailPeriodeAppliquer', '_bailPeriodeModifier', '_bailPeriodeSupprimer', '_bailPeriodeAjouter'].map(n => extraire(P2, n))
  ].join('\n'), sb)
  return { sb, DB, calls }
}
const vivantes = (b) => b.filter((p) => !p._deleted).sort((a, c) => a.debut.localeCompare(c.debut))
const cle = (DB, debut) => BaremeEdition.cleDePeriode(DB.loyerBareme.find((p) => !p._deleted && p.debut === debut))

describe('_bailPeriodeModifier — recalage du loyer vivant', () => {
  it('modifier la période EN VIGUEUR : bail et logement suivent, le prochain saveBail est un no-op (le piège)', () => {
    const { sb, DB, calls } = monde()
    const r = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { hc: 650 }, 'Révision erronée', { evtId: 'bper_t1', le: '2026-10-06T10:00:00.000Z' })
    expect(r).toMatchObject({ ok: true, change: true })
    expect(DB.baux[REF].hc).toBe(650)
    expect(DB.logements[0].hc).toBe(650)
    expect(calls.theo).toBe(1)
    expect(DB.baux[REF]._modifiedAt).toBeTruthy()
    // composition : « Modifier le bail » sans changement financier juste après → le barème ne bouge pas
    const apres = synchroniserPeriodeBail(DB.loyerBareme, { ref: REF, debut: BD, hc: DB.baux[REF].hc, ch: DB.baux[REF].ch }, BD)
    expect(apres).toEqual(DB.loyerBareme)
  })

  it('période « bail » ouverte seule : sans recalage le saveBail la repeindrait (témoin du piège) ; avec recalage, no-op', () => {
    const { sb, DB } = monde({ baux: { [REF]: { ref: REF, debut: BD, hc: 600, ch: 80 } }, logements: [{ ref: REF, hc: 600, ch: 80 }],
      loyerBareme: [periodeInitialeBail({ ref: REF, debut: BD, hc: 600, ch: 80 })] })
    sb._bailPeriodeModifier(REF, cle(DB, BD), { hc: 650 }, '', {})
    expect(DB.baux[REF].hc).toBe(650)
    const sansRecalage = synchroniserPeriodeBail(DB.loyerBareme, { ref: REF, debut: BD, hc: 600, ch: 80 }, BD)   // l'ancien bail.hc
    expect(vivantes(sansRecalage).find((p) => p.fin == null).hc).toBe(600)
    const avecRecalage = synchroniserPeriodeBail(DB.loyerBareme, { ref: REF, debut: BD, hc: DB.baux[REF].hc, ch: DB.baux[REF].ch }, BD)
    expect(avecRecalage).toEqual(DB.loyerBareme)
  })

  it('une période PASSÉE (qui n\'est pas en vigueur) ne touche ni le bail ni le logement', () => {
    const { sb, DB, calls } = monde()
    sb._bailPeriodeModifier(REF, cle(DB, BD), { hc: 610 }, 'coquille', {})
    expect(DB.baux[REF].hc).toBe(640); expect(DB.logements[0].hc).toBe(640); expect(calls.theo).toBe(0)
  })

  it('l\'entrée de journal : type periode, id = evtId du barème, rattachement, impact ; mapping cloud sans migration (type autre)', () => {
    const { sb, DB } = monde({ baux: { [REF]: { ref: REF, debut: BD, hc: 640, ch: 80, _bailUid: 'U1', _espaceId: 'E1', signatures: { signedAt: '2023-09-01T10:00:00Z' } } } })
    const r = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { debut: '2026-10-01' }, 'Erreur de date', { evtId: 'bper_t2', le: '2026-10-06T10:00:00.000Z' })
    const e = DB.baux_evenements[0]
    expect(e).toMatchObject({ id: 'bper_t2', type: 'periode', action: 'modifiee', ref: REF, bailDebut: BD, bailUid: 'U1', signedAt: '2023-09-01T10:00:00Z', _espaceId: 'E1', auteur: 'Didier', motif: 'Erreur de date' })
    expect(e.avant).toMatchObject({ debut: '2026-09-01' }); expect(e.apres).toMatchObject({ debut: '2026-10-01' })
    expect(e.impact.mois).toEqual([{ ym: '2026-09', avant: 720, apres: 680 }])
    expect(e._modifiedAt).toBeTruthy()
    expect(r.evt).toBe(e)
    expect(DB.loyerBareme.find((p) => p._modifieePar)._modifieePar.evtId).toBe('bper_t2')   // le barème et le journal partagent l'evtId
    const ctx = { espaceId: 'ESP', ownerId: 'OWN', detUuid: (...p) => 'uuid:' + p.join('|'), entiteByNom: new Map(), immeubleByNom: new Map(), logementByRef: new Map([['d-101', 'uuid:logement|d-101']]), documentByLegacy: new Map() }
    const row = mapToRow('baux_evenements', JSON.parse(JSON.stringify(e)), ctx)
    expect(row.type_evenement).toBe('autre')
    expect(row.legacy_raw.type).toBe('periode')
    expect(row.date_evenement).toBe('2026-10-06')
  })

  it('un no-op (rien ne change) n\'écrit rien : ni journal, ni sauvegarde', () => {
    const { sb, DB, calls } = monde()
    const avant = JSON.stringify(DB)
    const r = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { hc: 640 }, '', {})
    expect(r).toMatchObject({ ok: true, change: false })
    expect(JSON.stringify(DB)).toBe(avant); expect(calls.save).toBe(0)
  })
})

describe('simulation, sauvegarde, retours arrière', () => {
  it('simuler:true calcule l\'impact SANS rien écrire (ni DB, ni sauvegarde)', () => {
    const { sb, DB, calls } = monde()
    const avant = JSON.stringify(DB)
    const r = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { debut: '2026-10-01' }, '', { simuler: true })
    expect(r.ok && r.change).toBe(true)
    expect(r.impact.mois.map((m) => m.ym)).toEqual(['2026-09'])
    expect(r.evt).toBeNull()
    expect(JSON.stringify(DB)).toBe(avant); expect(calls.save).toBe(0)
  })

  it('l\'impact porte l\'encaissé, le trop-perçu NOUVEAU et la quittance émise (jamais modifiée)', () => {
    const { sb, DB } = monde({ quittances: [{ logement: REF, mois: 'septembre 2026', hc: 640, ch: 80 }] })
    sb._loyerPayeDuMois = (ref, ym) => (ym === '2026-09' ? 720 : 0)
    vm.runInContext(P2.match(/const _QA_MOIS_FR = \[[^\]]*\];/)[0] + '\n' + extraire(P2, '_qaMoisToDate'), sb)
    const r = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { debut: '2026-10-01' }, '', { simuler: true })
    const m = r.impact.mois[0]
    expect(m).toMatchObject({ ym: '2026-09', paye: 720, tropPercu: 40 })
    expect(m.quittance).toMatchObject({ total: 720 })
    expect(r.impact.tropPercu).toBe(40)
    expect(r.impact.quittances).toEqual(['2026-09'])
    // une hausse ne crée pas de trop-perçu mais un reste à encaisser
    const h = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { hc: 660 }, '', { simuler: true })
    expect(h.impact.mois[0]).toMatchObject({ tropPercu: 0, resteSupp: 20 })   // payé 720 sur 740 dû : delta +20, reste = min(20, 740−720) = 20
  })

  it('sauvegarde refusée (hors ligne, stockage plein) : TOUT est remis en l\'état — barème, journal, bail, logement', () => {
    const { sb, DB, calls } = monde()
    sb.__saveOk = false
    const avant = JSON.stringify(DB)
    const r = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { hc: 650 }, '', {})
    expect(r).toMatchObject({ ok: false, raison: 'sauvegarde' })
    expect(JSON.stringify(DB)).toBe(avant)
    expect(calls.toasts.some(([t, m]) => t === 'err' && /NON enregistrée/.test(m))).toBe(true)
  })

  it('exception en cours d\'écriture : retour arrière complet', () => {
    const { sb, DB } = monde()
    sb._pushLoyerTheoFromLive = () => { throw new Error('boom') }
    const avant = JSON.stringify(DB)
    const r = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { hc: 650 }, '', {})
    expect(r).toMatchObject({ ok: false, raison: 'erreur' })
    expect(JSON.stringify(DB)).toBe(avant)
  })

  it('sansSave : écrit en mémoire mais ne sauvegarde pas (l\'appelant — session IRL — fait UN saveDB)', () => {
    const { sb, DB, calls } = monde()
    const r = sb._bailPeriodeModifier(REF, cle(DB, '2026-09-01'), { hc: 650 }, '', { sansSave: true })
    expect(r.ok && r.change).toBe(true); expect(calls.save).toBe(0)
    expect(DB.baux_evenements).toHaveLength(1)
  })
})

describe('API : supprimer, ajouter, périodes IRL, introuvable', () => {
  it('supprimer la période en vigueur : la précédente reprend, le loyer vivant retombe à son tarif', () => {
    const { sb, DB } = monde()
    const r = sb._bailPeriodeSupprimer(REF, cle(DB, '2026-09-01'), 'annuler', { evtId: 'bper_s' })
    expect(r.ok && r.change).toBe(true)
    expect(vivantes(DB.loyerBareme)).toHaveLength(1)
    expect(DB.baux[REF].hc).toBe(600); expect(DB.logements[0].hc).toBe(600)
    expect(DB.baux_evenements[0]).toMatchObject({ action: 'supprimee', apres: null })
  })
  it('ajouter une période (même séquence que l\'ancien geste) : journal « ajoutee »', () => {
    const { sb, DB } = monde()
    const r = sb._bailPeriodeAjouter(REF, { debut: '2027-03-01', hc: 700, ch: 85 }, 'Travaux', {})
    expect(r.ok && r.change).toBe(true)
    expect(vivantes(DB.loyerBareme).map((p) => [p.debut, p.hc])).toEqual([[BD, 600], ['2026-09-01', 640], ['2027-03-01', 700]])
    expect(DB.baux_evenements[0]).toMatchObject({ action: 'ajoutee', avant: null, motif: 'Travaux' })
    expect(DB.baux[REF].hc).toBe(640)        // période future : le loyer vivant ne bouge pas
    expect(sb._bailPeriodeAjouter(REF, { debut: '2020-01-01', hc: 1, ch: 0 }, '', {})).toMatchObject({ ok: false, raison: 'aucun-bail' })
  })
  it('période issue d\'une révision IRL : charges seules via l\'UI ; autoriserIRL + origine irl lève la restriction', () => {
    const { sb, DB } = monde()
    DB.loyerBareme = appliquerNouvellePeriode(DB.loyerBareme, { ref: REF, debut: '2027-03-01', hc: 660, ch: 80, source: 'irl', bailDebut: BD, note: 'IRL' })
    const k = cle(DB, '2027-03-01')
    const ui = sb._bailPeriodeModifier(REF, k, { hc: 999, ch: 90 }, '', {})
    expect(ui.avertissements).toContain('irl-geste-dedie')
    expect(vivantes(DB.loyerBareme).find((p) => p.source === 'irl')).toMatchObject({ hc: 660, ch: 90 })
    expect(sb._bailPeriodeSupprimer(REF, cle(DB, '2027-03-01'), '', {})).toMatchObject({ ok: false, raison: 'irl-geste-dedie' })
    const irl = sb._bailPeriodeModifier(REF, cle(DB, '2027-03-01'), { hc: 700 }, '', { origine: 'irl', autoriserIRL: true })
    expect(irl.ok && irl.change).toBe(true)
    expect(vivantes(DB.loyerBareme).find((p) => p.source === 'irl').hc).toBe(700)
  })
  it('période disparue entre l\'affichage et l\'enregistrement : introuvable, rien n\'est écrit', () => {
    const { sb, DB, calls } = monde()
    const avant = JSON.stringify(DB)
    const r = sb._bailPeriodeModifier(REF, { ref: REF, bailDebut: BD, debut: '2031-01-01' }, { hc: 1 }, '', {})
    expect(r).toMatchObject({ ok: false, raison: 'introuvable' })
    expect(JSON.stringify(DB)).toBe(avant); expect(calls.save).toBe(0)
  })
  it('bail clos : la période d\'un chapitre archivé s\'édite sans toucher le bail courant', () => {
    const { sb, DB } = monde()
    DB.baux_historique = [{ ref: REF, debut: '2019-01-01', fin: '2022-12-31', finEffective: '2022-12-31', hc: 500, ch: 60, archive: true }]
    DB.loyerBareme = DB.loyerBareme.concat([{ ref: REF, debut: '2019-01-01', fin: '2022-12-31', hc: 500, ch: 60, source: 'bail', bailDebut: '2019-01-01', note: '' }])
    const r = sb._bailPeriodeModifier(REF, { ref: REF, bailDebut: '2019-01-01', debut: '2019-01-01' }, { hc: 510 }, 'erreur', {})
    expect(r.ok && r.change).toBe(true)
    expect(DB.baux[REF].hc).toBe(640)
    expect(vivantes(DB.loyerBareme).filter((p) => p.bailDebut === BD)).toHaveLength(2)
  })
})
