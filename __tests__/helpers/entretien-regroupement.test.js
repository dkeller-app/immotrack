// RETOURS 15/10 (lot 2, point 2) — une seule échéance « entretien + ramonage » (poêle à granulés, insert / foyer
// fermé), migration idempotente des données, base légale citée (décret 2023-641, C. santé publ. R. 1331-16 / 19).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { regrouperEntretiens, fusionnerFiches, REGROUPEMENTS } from '../../js/core/entretien-regroupement.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8').replace(/\r/g, '')
const P3 = readFileSync(resolve(root, 'js/app/app-part3.js'), 'utf8').replace(/\r/g, '')
const MAIN = readFileSync(resolve(root, 'js/main.js'), 'utf8').replace(/\r/g, '')
const NOW = '2026-10-15T10:00:00.000Z'

describe('fusionnerFiches', () => {
  it('date la plus ancienne des deux (D6), intervenant de la plus récente, les deux dates notées', () => {
    const f = fusionnerFiches({ lastDate: '2025-11-12', interv: 'Chauffagiste A', notes: 'joints changés' }, { lastDate: '2026-01-20', interv: 'Ramonage Hoffmann' }, NOW)
    expect(f.lastDate).toBe('2025-11-12')
    expect(f.interv).toBe('Ramonage Hoffmann')
    expect(f.notes).toContain('entretien le 12/11/2025, ramonage le 20/01/2026')
    expect(f.notes).toContain('joints changés')
    expect(f.regroupeDe.entretien.interv).toBe('Chauffagiste A')
    expect(f.regroupeDe.ramonage.lastDate).toBe('2026-01-20')
    expect(f.updatedAt).toBe(NOW)
  })
  it('une seule des deux renseignée : sa date, et l\'autre dite « non enregistré »', () => {
    const f = fusionnerFiches(null, { lastDate: '2026-02-01', interv: 'X' }, NOW)
    expect(f.lastDate).toBe('2026-02-01')
    expect(f.notes).toContain('entretien non enregistré, ramonage le 01/02/2026')
  })
  it('fiches sans date : pas de date inventée', () => {
    expect(fusionnerFiches({ interv: 'A' }, {}, NOW).lastDate).toBe('')
  })
  it('aucune fiche : rien', () => {
    expect(fusionnerFiches(null, undefined, NOW)).toBeNull()
  })
})

describe('regrouperEntretiens — migration', () => {
  const base = () => ({
    equipements: {
      'D-104': { POELE_GRAN_ENT: { lastDate: '2025-11-12', interv: 'A' }, POELE_GRAN_RAM: { lastDate: '2025-12-01', interv: 'B' }, CHAUDIERE_GAZ: { lastDate: '2026-01-01' } },
      'D-105': { INSERT_RAM: { lastDate: '2026-03-03', interv: 'C' } },
      'D-106': { CHAUDIERE_FIOUL: { lastDate: '2026-01-01' }, RAMONAGE_FIOUL: { lastDate: '2026-02-01' } },
    },
    documents: [
      { id: 1, parentType: 'equipement', parentId: 'D-104__POELE_GRAN_RAM', name: 'facture.pdf' },
      { id: 2, parentType: 'equipement', parentId: 'D-104__CHAUDIERE_GAZ' },
      { id: 3, parentType: 'equipement', parentId: 'D-105__INSERT_ENT', _deleted: true },
      { id: 4, parentType: 'bail', parentId: 'D-104__POELE_GRAN_ENT' },
    ],
    agenda: [
      { id: 10, auto: true, autoKey: 'EQUIP:D-104:POELE_GRAN_ENT:2026-11-12', titre: 'Entretien poêle granulés — D-104' },
      { id: 11, auto: true, autoKey: 'EQUIP:D-104:POELE_GRAN_RAM:2025-12-01', titre: 'Ramonage poêle granulés — D-104', done: true },
      { id: 12, auto: true, autoKey: 'EQUIP:D-107:POELE_BOIS_RAM:2026-12-01', titre: 'Ramonage poêle à bois — D-107' },
      { id: 13, auto: true, autoKey: 'EQUIP:D-107:POELE_BOIS_RAM:2026-12-01', titre: 'Entretien + ramonage poêle à bois — D-107' },
      { id: 14, auto: true, autoKey: 'EQUIP:D-104:CHAUDIERE_GAZ:2027-01-01', titre: 'Entretien chaudière gaz — D-104' },
      { id: 15, auto: false, autoKey: 'EQUIP:D-104:POELE_GRAN_ENT:2026-11-12', titre: 'note manuelle' },
    ],
  })

  it('poêle à granulés : une fiche POELE_GRAN, les anciennes retirées, les autres appareils intacts', () => {
    const db = base()
    const r = regrouperEntretiens(db, { now: NOW })
    const e = db.equipements['D-104']
    expect(e.POELE_GRAN.lastDate).toBe('2025-11-12')
    expect(e.POELE_GRAN.interv).toBe('B')
    expect(e.POELE_GRAN_ENT).toBeUndefined()
    expect(e.POELE_GRAN_RAM).toBeUndefined()
    expect(e.CHAUDIERE_GAZ).toEqual({ lastDate: '2026-01-01' })
    expect(r.equipements).toEqual(['D-104', 'D-105'])
    expect(r.change).toBe(true)
  })
  it('insert / foyer fermé regroupé ; chaudière fioul + ramonage fioul NON regroupés (D3)', () => {
    const db = base()
    regrouperEntretiens(db, { now: NOW })
    expect(db.equipements['D-105'].INSERT.lastDate).toBe('2026-03-03')
    expect(db.equipements['D-106']).toEqual({ CHAUDIERE_FIOUL: { lastDate: '2026-01-01' }, RAMONAGE_FIOUL: { lastDate: '2026-02-01' } })
  })
  it('pièces jointes re-rattachées à la nouvelle clé (vivantes seulement, type équipement seulement), horodatées', () => {
    const db = base(); const vus = []
    const r = regrouperEntretiens(db, { now: NOW, stamp: d => vus.push(d.id) })
    expect(db.documents[0].parentId).toBe('D-104__POELE_GRAN')
    expect(db.documents[1].parentId).toBe('D-104__CHAUDIERE_GAZ')
    expect(db.documents[2].parentId).toBe('D-105__INSERT_ENT')
    expect(db.documents[3].parentId).toBe('D-104__POELE_GRAN_ENT')
    expect(r.documents).toEqual([1]); expect(vus).toEqual([1])
  })
  it('agenda : événements automatiques non faits des anciennes clés retirés ; faits, manuels et autres gardés ; ancien titre du poêle à bois retiré', () => {
    const db = base()
    const r = regrouperEntretiens(db, { now: NOW })
    expect(db.agenda.map(e => e.id)).toEqual([11, 13, 14, 15])
    expect(r.agendaRetires).toBe(2)
  })
  it('idempotente : un second passage ne change rien', () => {
    const db = base()
    regrouperEntretiens(db, { now: NOW })
    const avant = JSON.stringify(db)
    const r2 = regrouperEntretiens(db, { now: '2027-01-01T00:00:00.000Z' })
    expect(r2.change).toBe(false)
    expect(JSON.stringify(db)).toBe(avant)
  })
  it('fiche regroupée déjà présente (autre appareil) : elle fait foi, les anciennes sont retirées', () => {
    const db = { equipements: { A: { POELE_GRAN: { lastDate: '2026-09-01', interv: 'Z' }, POELE_GRAN_RAM: { lastDate: '2020-01-01' } } } }
    regrouperEntretiens(db, { now: NOW })
    expect(db.equipements.A).toEqual({ POELE_GRAN: { lastDate: '2026-09-01', interv: 'Z' } })
  })
  it('relecture Fable B2 — fiche regroupée présente mais saisie PLUS RÉCENTE sur une ancienne clé : reportée, jamais perdue', () => {
    const db = { equipements: { A: { POELE_GRAN: { lastDate: '2025-10-01', interv: 'X', notes: 'n' }, POELE_GRAN_RAM: { lastDate: '2026-10-20', interv: 'Ramoneur Y' } } } }
    regrouperEntretiens(db, { now: NOW })
    const f = db.equipements.A.POELE_GRAN
    expect(f.lastDate).toBe('2026-10-20'); expect(f.interv).toBe('Ramoneur Y')
    expect(f.notes).toContain("Repris d'une saisie « ramonage » du 20/10/2026")
    expect(f.regroupeDe.saisieTardive_ramonage.interv).toBe('Ramoneur Y')
    expect(db.equipements.A.POELE_GRAN_RAM).toBeUndefined()
  })
  it('relecture Fable B1 — rappels de la NOUVELLE clé créés avant la migration (logement migré) retirés pour régénération ; pas aux passages suivants', () => {
    const db = { equipements: { A: { POELE_GRAN_ENT: { lastDate: '2025-11-12' } } }, agenda: [
      { id: 1, auto: true, autoKey: 'EQUIP:A:POELE_GRAN:2026-03-01', titre: 'Entretien + ramonage poêle à granulés — A' },
      { id: 2, auto: true, autoKey: 'EQUIP:B:POELE_GRAN:2026-03-01', titre: 'Entretien + ramonage poêle à granulés — B' },
    ] }
    regrouperEntretiens(db, { now: NOW })
    expect(db.agenda.map(e => e.id)).toEqual([2])
    db.agenda.push({ id: 3, auto: true, autoKey: 'EQUIP:A:POELE_GRAN:2026-11-12', titre: 'Entretien + ramonage poêle à granulés — A' })
    expect(regrouperEntretiens(db, { now: NOW }).change).toBe(false)
    expect(db.agenda.map(e => e.id)).toEqual([2, 3])
  })
  it('base vide ou absente : aucun changement, aucune erreur', () => {
    expect(regrouperEntretiens({}).change).toBe(false)
    expect(regrouperEntretiens(null).change).toBe(false)
  })
})

describe('EQUIP_RULES (app-part1) : les règles regroupées et la base légale', () => {
  const regles = P1.slice(P1.indexOf('const EQUIP_RULES = ['), P1.indexOf('];', P1.indexOf('const EQUIP_RULES = [')))
  it('les anciennes clés ont disparu, les nouvelles existent', () => {
    for (const g of REGROUPEMENTS) {
      expect(regles).toContain(`key:'${g.cle}'`)
      for (const k of Object.values(g.anciennes)) expect(regles).not.toContain(`'${k}'`)
    }
  })
  it('libellés « Entretien + ramonage » (granulés, insert, poêle à bois — D5)', () => {
    expect(regles).toContain("label:'Entretien + ramonage poêle à granulés'")
    expect(regles).toContain("label:'Entretien + ramonage insert / foyer fermé'")
    expect(regles).toMatch(/key:'POELE_BOIS_RAM'[^\n]*label:'Entretien \+ ramonage poêle à bois'/)
  })
  it('base légale citée (D4) : R. 1331-16 et R. 1331-19, décret 2023-641, arrêté local (RSD) et notice du fabricant', () => {
    const m = regles.match(/const _BASE_POELE_INSERT = '([^']+)'/) || P1.match(/const _BASE_POELE_INSERT = '([^']+)'/)
    expect(m).not.toBeNull()
    const b = m[1]
    for (const x of ['R. 1331-16', 'R. 1331-19', '2023-641', 'règlement sanitaire départemental', 'notice du fabricant']) expect(b).toContain(x)
    expect((regles.match(/base:_BASE_POELE_INSERT/g) || []).length).toBe(3)
  })
  it('les chaudières fioul / bois et la cheminée ouverte gardent leurs règles séparées', () => {
    for (const k of ['CHAUDIERE_FIOUL', 'RAMONAGE_FIOUL', 'CHAUDIERE_BOIS', 'RAMONAGE_BOIS', 'CHEMINEE_RAM']) expect(regles).toContain(`key:'${k}'`)
  })
})

describe('branchement : la migration tourne au démarrage (local et cloud), une fois, puis enregistre', () => {
  it('main.js expose le module', () => {
    expect(MAIN).toMatch(/import \{ regrouperEntretiens \} from '\.\/core\/entretien-regroupement\.js'/)
    expect(MAIN).toContain('window.EntretienRegroupement')
  })
  it('_bootDataJobs l\'appelle avec _stamp et enregistre seulement si quelque chose a changé', () => {
    const boot = P3.slice(P3.indexOf('function _bootDataJobs()'), P3.indexOf('function _bootDataJobs()') + 9000)
    expect(boot).toMatch(/EntretienRegroupement\.regrouperEntretiens\(DB, \{ stamp: _stamp \}\)/)
    expect(boot).toMatch(/if \(_rg\.change\) \{[^}]*saveDB\(\)/)
  })
})
