// __tests__/helpers/demo-app.test.js — COMPTE DÉMO : compléments calculés par les MODULES de l'app (js/app/demo-app.js).
// Le jeu de données ne recopie jamais un résultat à la main : verdict « qui paie » par le moteur, vérification 2D-Doc
// pré-calculée par le module de vérification sur des pièces fictives.
import { describe, it, expect } from 'vitest'
import { completerIncidents, completerVerifs, SCENARIOS_VERIF, bailIdDe, ESPACE_DEMO } from '../../js/app/demo-app.js'
import { VERSION_VERIF, etatAffiche } from '../../js/core/verif-pieces.js'
import { verdictDuConstat } from '../../js/core/incident-circuit.js'

const CAND = { id: 'cand_demo_1', nom: 'Rousseau', prenom: 'Emma', garant: { nom: 'Rousseau', prenom: 'Jean' } }
const CAND2 = { id: 'cand_demo_2', nom: 'Girard', prenom: 'Thomas' }
const doc = (o) => ({ id: 1, parentType: 'candidat', parentId: 'cand_demo_1', category: 'ressources', pieceType: 'I.D.1', mime: 'application/pdf', uploadedAt: '2026-09-18T09:12:00.000Z', ...o })

describe('verdict des incidents terminés', () => {
  it('constat de l\'artisan → verdict du moteur (règles inchangées) et payeur retenu ; idempotent', () => {
    const inc = { id: 4002, element: 'chaudiere', nature: 'panne', urgences: [], contexte: {}, constat: { constat: 'defaut', ampleur: 'petite' }, verdict: null, payeurRetenu: null }
    const D = { incidents: [inc, { id: 4001, constat: null }] }
    expect(completerIncidents(D)).toBe(1)
    expect(inc.verdict).toEqual(verdictDuConstat(inc, inc.constat))
    expect(inc.payeurRetenu).toBe(inc.verdict.payeur)
    expect(completerIncidents(D)).toBe(0)
  })
})

describe('vérifications 2D-Doc pré-calculées (pièces fictives)', () => {
  const now = new Date('2026-10-05T10:00:00Z')
  it('avis du candidat : signature vérifiée, nom identique, aucun constat ; version courante du module', () => {
    const d = doc({ _demoVerif: 'avis-valide' }); const D = { candidats: [CAND], documents: [d] }
    expect(completerVerifs(D, now)).toBe(1)
    expect(d.verif.v).toBe(VERSION_VERIF)
    expect(etatAffiche(d, d.verif)).toMatchObject({ etat: 'signature_valide', positif: true })
    expect(d.verif.constats).toEqual([])
    expect(completerVerifs(D, now)).toBe(0)   // déjà posée
  })
  it('avis du garant : comparé à l\'identité du GARANT', () => {
    const d = doc({ category: 'garant', pieceType: 'II.E.1', _demoVerif: 'avis-valide-garant' }); const D = { candidats: [CAND], documents: [d] }
    completerVerifs(D, now)
    expect(d.verif.deuxDDoc).toMatchObject({ etat: 'valide', identite: 'concorde', qui: 'garant', annee: '2023' })
    expect(d.verif.constats.map((c) => c.code)).toEqual(['V7'])   // revenus 2023 : point à vérifier factuel (décret 2015-1437)
  })
  it('photo d\'un avis sans code lisible : constat factuel V4, jamais un jugement', () => {
    const d = doc({ parentId: 'cand_demo_2', mime: 'image/jpeg', _demoVerif: 'avis-sans-code' }); const D = { candidats: [CAND2], documents: [d] }
    completerVerifs(D, now)
    expect(d.verif.constats.map((c) => c.code)).toEqual(['V4'])
    expect(etatAffiche(d, d.verif).positif).toBe(false)
  })
  it('aucune donnée réelle dans les scénarios (numéros à zéro, document fictif)', () => {
    for (const k of Object.keys(SCENARIOS_VERIF)) {
      for (const r of SCENARIOS_VERIF[k]().resultats) {
        const v = (id) => (r.champs.find((c) => c.id === id) || {}).valeur
        expect(v('47')).toMatch(/^0{13}$/)                 // numéro fiscal : que des zéros
        expect(v('44')).toMatch(/^2[46]0{10}\d$/)           // référence d'avis : format seul, sans numéro réel
        expect(r.motif).toMatch(/démonstration/)
      }
    }
  })
  it('pièce hors candidat, supprimée ou sans scénario : ignorée', () => {
    const D = { candidats: [CAND], documents: [doc({ _demoVerif: 'inconnu' }), doc({ _demoVerif: 'avis-valide', _deleted: true }), doc({ parentType: 'logement', _demoVerif: 'avis-valide' })] }
    expect(completerVerifs(D, now)).toBe(0)
  })
})

describe('identifiants de bail du nuage fictif', () => {
  it('déterministes, propres à l\'espace de la démo', () => {
    const a = bailIdDe('D-101', { debut: '2023-06-15' }, 'SCI'), b = bailIdDe('D-101@@x', { debut: '2023-06-15' }, 'SCI')
    expect(a).toMatch(/^[0-9a-f-]{36}$/); expect(a).toBe(b)
    expect(bailIdDe('D-102', {}, 'SCI')).not.toBe(a)
    expect(ESPACE_DEMO).toMatch(/^de3/)
  })
})

import { creerClientIA, messageErreur, CODES_REESSAYABLES } from '../../js/core/ia-client.js'
describe('IA en démonstration : aucun appel, message clair', () => {
  it('code « demo » sans requête ni jeton demandé ; non réessayable ; hors démo inchangé', async () => {
    let appels = 0, jetons = 0
    const c = creerClientIA({ base: 'https://relais.exemple', getToken: async () => { jetons++; return 'j' }, fetchImpl: async () => { appels++; return { ok: true, json: async () => ({ actif: true }) } }, demo: true })
    expect(await c.statut()).toEqual({ ok: false, code: 'demo' })
    expect(await c.structurer('lecture-facture', {})).toEqual({ ok: false, code: 'demo' })
    expect([appels, jetons]).toEqual([0, 0])
    expect(CODES_REESSAYABLES.has('demo')).toBe(false)
    expect(messageErreur('demo')).toMatchObject({ titre: 'Indisponible dans la démonstration', reessayable: false })
    const reel = creerClientIA({ base: 'https://relais.exemple', getToken: async () => 'j', fetchImpl: async () => { appels++; return { ok: true, json: async () => ({ actif: true }) } }, demo: false })
    expect((await reel.statut()).ok).toBe(true)
  })
  it('détection par défaut : window.__immoDemo === true seulement', async () => {
    const f = async () => ({ ok: true, json: async () => ({}) })
    globalThis.__immoDemo = 'vrai'   // jamais une valeur « truthy » (élément DOM homonyme…)
    expect((await creerClientIA({ base: 'https://r', getToken: async () => 'j', fetchImpl: f }).statut()).ok).toBe(true)
    globalThis.__immoDemo = true
    expect((await creerClientIA({ base: 'https://r', getToken: async () => 'j', fetchImpl: f }).statut()).code).toBe('demo')
    delete globalThis.__immoDemo
  })
})
