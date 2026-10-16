// CONSO-IA — côté client : plafond MENSUEL (429 motif « mois ») et part utilisée (`conso`) signalés à l'indicateur ;
// la dictée en pause attend le 1er du mois suivant puis repart seule (jamais perdue).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { creerClientIA, messageErreur, dateReprise } from '../../js/core/ia-client.js'
import { creerFileDictees, storeMemoire, ETAPES } from '../../js/core/ia-file-attente.js'

const rep = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const client = (fetchImpl) => creerClientIA({ base: 'https://relais.test/', getToken: async () => 'jeton', fetchImpl, enLigne: () => true, demo: false })
afterEach(() => { delete globalThis.__iaConsoSignal })

describe('client IA — plafond mensuel', () => {
  it('429 motif « mois » : code quota, famille et date de reprise transmises, signal « pause »', async () => {
    const sig = vi.fn(); globalThis.__iaConsoSignal = sig
    const r = await client(() => rep(429, { error: 'quota', motif: 'mois', famille: 'dictee', renouvellement: '2027-01-01' })).transcrire(new Blob([new Uint8Array(4)], { type: 'audio/webm' }))
    expect(r).toMatchObject({ ok: false, code: 'quota', motif: 'mois', famille: 'dictee', renouvellement: '2027-01-01' })
    expect(sig).toHaveBeenCalledWith({ famille: 'dictee', pause: true, renouvellement: '2027-01-01' })
  })
  it('réponse avec `conso` : la part utilisée est signalée ; un signal qui lève ne casse rien', async () => {
    const sig = vi.fn(() => { throw new Error('x') }); globalThis.__iaConsoSignal = sig
    const r = await client(() => rep(200, { data: {}, rejets: 0, conso: { famille: 'pieces', pct: 85 } })).structurer('bulletin-paie', {})
    expect(r.ok).toBe(true)
    expect(sig).toHaveBeenCalledWith({ famille: 'pieces', pct: 85 })
  })
  it('quota du jour : aucun signal de pause mensuelle', async () => {
    const sig = vi.fn(); globalThis.__iaConsoSignal = sig
    await client(() => rep(429, { error: 'quota', motif: 'audio' })).transcrire(new Blob([new Uint8Array(4)]))
    expect(sig).not.toHaveBeenCalled()
  })
  it('message : pause jusqu\'au 1er du mois, la saisie à la main nommée, ton neutre', () => {
    const m = messageErreur('quota', { motif: 'mois', renouvellement: '2027-01-01' })
    expect(m.titre).toBe('Dictée en pause jusqu’au 1er janvier')
    expect(m.texte).toMatch(/saisie à la main reste disponible/)
    expect(m.texte).not.toMatch(/\b(tu|vous|votre)\b/i)
    expect(messageErreur('quota', { motif: 'audio' }).titre).toBe('Limite du jour atteinte')
    expect(dateReprise('2026-11-15')).toBe('15 novembre')
  })
})

describe('file des dictées — plafond mensuel', () => {
  it('pause : gardée ; pas relancée avant le 1er du mois suivant ; relancée seule ensuite', async () => {
    let now = new Date('2026-12-20T10:00:00Z')
    let r = { ok: false, code: 'quota', motif: 'mois', renouvellement: '2027-01-01' }
    const c = { transcrire: vi.fn(async () => r), structurer: vi.fn(async () => ({ ok: true, data: { propositions: [], aAjouter: [], compteurs: [], corrections: [] }, rejets: 0 })) }
    const f = creerFileDictees({ store: storeMemoire(), client: c, creerBlob: (b, t) => ({ b, t }), maintenant: () => now })
    const x = await f.ajouter({ audio: new Uint8Array([1, 2]).buffer, mime: 'audio/webm', entree: { piece: 'Salon', mode: 'entree', elements: [] } })
    await f.traiter()
    expect((await f.get(x.id)).erreur).toMatchObject({ code: 'quota', motif: 'mois', renouvellement: '2027-01-01' })
    now = new Date('2026-12-28T10:00:00Z'); await f.traiter()
    expect(c.transcrire).toHaveBeenCalledTimes(1)                 // un autre jour du même mois : toujours en pause
    now = new Date('2027-01-01T09:00:00Z'); r = { ok: true, text: 'sol', segments: [] }
    await f.traiter()
    expect(c.transcrire).toHaveBeenCalledTimes(2)
    expect((await f.get(x.id)).etape).toBe(ETAPES.PRET)
  })
})
