// BAIL-EN-COURS-SIGNE-HORS-PROPRYO étape 6 — l'historique du bail montre la déclaration « signé hors Propryo » et les signatures /
// sessions ARCHIVÉES (bail.signaturesAnnulees). Module réel + rendu des cartes (vrai code d'app-part2 dans un vm).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { construireHistoriqueBail } from '../../js/core/bail-historique.js'
import * as BSE from '../../js/core/bail-signature-etat.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
function extraire(src, marqueur) {
  const i = src.indexOf(marqueur); if (i < 0) throw new Error('introuvable : ' + marqueur)
  let j = src.indexOf('{', src.indexOf(')', i)), d = 0
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1) }
  throw new Error('accolades')
}
const sb = { fd: (d) => String(d).slice(0, 10).split('-').reverse().join('/'), escHtml: (x) => String(x), fmt: (x) => String(x), _uiIcon: () => '', _lyQ: (x) => x, _dgStatutDuBail: () => ({}), console }
vm.createContext(sb)
vm.runInContext(extraire(P2, 'function _histoBailEventHtml('), sb)

const base = (o = {}) => ({ ref: 'D-101', debut: '2026-01-01', hc: 600, ch: 80, dg: 600, locataires: [{ nom: 'Pierre Demo' }], ...o })
const rail = (bail) => construireHistoriqueBail({ ref: 'D-101', today: '2026-10-06', bailCourant: bail, bauxHistorique: [], bareme: [], irlHistorique: [], bailEvents: [], bailJournal: [] }).chapitres[0].rail
const evs = (bail, type) => rail(bail).filter(r => r.kind === 'evenement' && r.ev.type === type).map(r => r.ev)
const ARCH = { at: '2026-10-06T10:00:00.000Z', par: 'Didier', motif: 'session-annulee', etatRelais: 'expired',
  resume: { envoyeeLe: '2026-09-01T08:00:00.000Z', signataires: [{ role: 'locataire', nom: 'Pierre Demo', signedAt: null }] },
  signatures: { mode: 'bailleur-seul', signedBailleurAt: '2026-09-01T09:00:00.000Z', finales: { b: 'x' }, remoteSession: {} } }

describe('signe-externe — la déclaration figure dans l\'historique', () => {
  it('bail externe : carte « signe-externe » à la date de signature, origine / approximative / déclarant', () => {
    const bail = base({ signatures: BSE.declarerSignatureExterne({}, { date: '2025-12-20', origine: 'repris', dateApprox: true, auteur: 'Didier', now: '2026-10-06T08:00:00Z' }) })
    const [e] = evs(bail, 'signe-externe')
    expect(e).toMatchObject({ date: '2025-12-20', origine: 'repris', dateApprox: true, declareLe: '2026-10-06', declarePar: 'Didier' })
    expect(evs(bail, 'bail-debut')[0].externe).toBe(true)
    const html = sb._histoBailEventHtml(e, { statut: 'courant' }, 'D-101', null)
    expect(html).toMatch(/hors Propryo/); expect(html).toMatch(/20\/12\/2025/); expect(html).toMatch(/approximative/); expect(html).toMatch(/repris du vendeur/)
    expect(html).toMatch(/aucune signature électronique/)
    expect(sb._histoBailEventHtml(evs(bail, 'bail-debut')[0], { statut: 'courant' }, 'D-101', null)).toMatch(/signé hors Propryo/)
  })
  it('bail signé électroniquement ou non signé : aucune carte « signe-externe »', () => {
    expect(evs(base({ signatures: { signedAt: '2026-01-01T10:00:00Z', mode: 'avec-locataire' } }), 'signe-externe')).toHaveLength(0)
    expect(evs(base(), 'signe-externe')).toHaveLength(0)
    expect(evs(base({ signatures: { signedAt: '2026-01-01T10:00:00Z', mode: 'bailleur-seul' } }), 'bail-debut')[0].externe).toBe(false)
  })
})

describe('signature-annulee — rien n\'est détruit, l\'historique le dit', () => {
  it('session annulée : carte avec envoi, état au relais, signataires, signature du bailleur archivée', () => {
    const [e] = evs(base({ signaturesAnnulees: [ARCH] }), 'signature-annulee')
    expect(e).toMatchObject({ date: '2026-10-06', motif: 'session-annulee', etatRelais: 'expired', par: 'Didier', envoyeeLe: '2026-09-01', bailleurAvaitSigne: true })
    expect(e.signataires).toEqual([{ role: 'locataire', nom: 'Pierre Demo', signeLe: '' }])
    const html = sb._histoBailEventHtml(e, { statut: 'courant' }, 'D-101', null)
    expect(html).toMatch(/Session de signature à distance annulée/); expect(html).toMatch(/01\/09\/2026/); expect(html).toMatch(/Pierre Demo n'avait pas signé/)
    expect(html).toMatch(/signature du bailleur est archivée/); expect(html).toMatch(/redevenu non signé/)
  })
  it('déclaration retirée / re-datée / remplacée : libellés dédiés avec l\'ancienne date', () => {
    const ext = { signedAt: '2025-12-20T12:00:00.000Z', mode: 'externe', externe: { date: '2025-12-20' } }
    const mk = (motif) => evs(base({ signaturesAnnulees: [{ at: '2026-10-06T10:00:00Z', par: 'D', motif, signatures: ext }] }), 'signature-annulee')[0]
    expect(sb._histoBailEventHtml(mk('externe-retire'), {}, 'D-101', null)).toMatch(/Déclaration « signé hors Propryo » retirée[\s\S]*20\/12\/2025/)
    expect(sb._histoBailEventHtml(mk('externe-redate'), {}, 'D-101', null)).toMatch(/Date de signature corrigée[\s\S]*20\/12\/2025/)
    expect(sb._histoBailEventHtml(mk('remplace-par-externe'), {}, 'D-101', null)).toMatch(/remplacée par « signé hors Propryo »/)
  })
  it('les archives d\'un bail CLOS vont dans SON chapitre ; entrées invalides ignorées', () => {
    const clos = base({ debut: '2023-01-01', finEffective: '2024-01-01', fin: '2024-01-01', signaturesAnnulees: [ARCH, null, 'x'], _archivedAt: '2024-01-02T00:00:00Z' })
    const r = construireHistoriqueBail({ ref: 'D-101', today: '2026-10-06', bailCourant: base(), bauxHistorique: [clos], bareme: [], irlHistorique: [], bailEvents: [], bailJournal: [] })
    expect(r.chapitres[0].rail.filter(x => x.ev && x.ev.type === 'signature-annulee')).toHaveLength(0)
    expect(r.chapitres[1].rail.filter(x => x.ev && x.ev.type === 'signature-annulee')).toHaveLength(1)
  })
  it('bail sans archive : aucune carte (pas de régression)', () => {
    expect(evs(base(), 'signature-annulee')).toHaveLength(0)
  })
})
