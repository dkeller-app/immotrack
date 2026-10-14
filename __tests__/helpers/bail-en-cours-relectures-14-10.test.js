// Reprise « Bail en cours » (integ/bail-en-cours-v2) — corrections des relectures du 14/10 (Opus adverse + Fable ciblée).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _penaliteRetardDG } from '../../js/core/gestion-dg-impayes.js'
import { valeurLisible } from '../../js/core/bail-modifications.js'
import { construireHistoriqueBail } from '../../js/core/bail-historique.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8').replace(/\r/g, '')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8').replace(/\r/g, '')

describe('art. 22 : pas de pénalité de retard sur un dépôt jamais versé', () => {
  // Remise des clés le 10/01/2026, restitution au 01/06/2026 : largement hors délai.
  const base = { hc: 800, dg: 1000, debut: '2023-01-01', finEffective: '2026-01-10', depart: { dateSortie: '2026-01-10' } }
  it('case « versé » cochée (ou absente) : la pénalité court', () => {
    expect(_penaliteRetardDG({ ...base }, '2026-06-01', []).penalite).toBeGreaterThan(0)
    expect(_penaliteRetardDG({ ...base, dgVerse: true }, '2026-06-01', []).penalite).toBeGreaterThan(0)
  })
  it('case décochée : rien n\'est dû au locataire, rien n\'est majoré', () => {
    const p = _penaliteRetardDG({ ...base, dgVerse: false }, '2026-06-01', [])
    expect(p.penalite).toBe(0)
    expect(p.enRetard).toBe(false)
  })
  it('la fenêtre de restitution le dit (pas de bouton retiré : on avertit)', () => {
    expect(P2).toMatch(/dgVerse <= 0 \? `<strong>Aucun dépôt versé<\/strong>/)
  })
})

describe('frise : un dépôt prévu mais non versé n\'est jamais présenté « versé »', () => {
  const rail = (bail) => {
    const h = construireHistoriqueBail({ ref: 'A', bailCourant: bail, bauxHistorique: [], today: '2026-10-14' })
    const all = JSON.stringify(h)
    return all
  }
  it('l\'événement porte nonVerse selon LA définition', () => {
    expect(rail({ ref: 'A', debut: '2024-01-01', dg: 900, dgVerse: false })).toContain('"nonVerse":true')
    expect(rail({ ref: 'A', debut: '2024-01-01', dg: 900 })).toContain('"nonVerse":false')
  })
  it('la carte titre « prévu, non versé » sans statut ni restitution', () => {
    expect(P2).toContain('if(ev.nonVerse) return')
    expect(P2).toContain('Dépôt de garantie prévu, non versé')
  })
})

describe('historique du bail signé : la case décochée se lit « Non »', () => {
  it('dgVerse false → « Non » ; un autre booléen faux reste « (vide) »', () => {
    expect(valeurLisible('dgVerse', false)).toBe('Non')
    expect(valeurLisible('dgVerse', true)).toBe('Oui')
    expect(valeurLisible('zoneTendue', false)).toBe('(vide)')
  })
})

describe('bail déclaré signé hors Propryo : mêmes suites qu\'une signature', () => {
  it('saveBail appelle _onBailFullySigned pour une DÉCLARATION, après la conversion du candidat', () => {
    const i = P1.indexOf('function saveBail()')
    const corps = P1.slice(i, P1.indexOf('\n}\n', i))
    const conv = corps.indexOf('_finalizeCandidatConversion(_cc, ref)')
    const suite = corps.indexOf("if (_ext.action === 'declarer' && DB.baux[ref] && _bailEtatSig(DB.baux[ref]).etat === 'externe') { try { _onBailFullySigned(ref)")
    expect(conv).toBeGreaterThan(0)
    expect(suite).toBeGreaterThan(conv)
  })
})

describe('re-datation / retrait de la déclaration : l\'espace locataire rattaché est signalé', () => {
  it('la confirmation compte les liens actifs de la ligne actuelle du bail', () => {
    expect(P1).toContain('window.EspaceLoc.accesActifsDuBail(v(\'b-edit-ref\'))')
    expect(P1).toMatch(/Le PDF déposé reste dans les documents\.' \+ _avisEl\);/)
    expect(readFileSync(resolve(root, 'js/app/espace-locataire-app.js'), 'utf8')).toContain('accesActifsDuBail: (ref) =>')
  })
})

describe('textes : « noté » (et non « note_ ») dans l\'assistant de signature', () => {
  it('aucun « note_ au bail » affiché', () => {
    expect(P1).not.toMatch(/note_ (au bail|« non joint »)/)
    expect(P1).toContain('hors application — noté au bail')
  })
})
