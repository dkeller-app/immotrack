// DÉPÔT DÉTENU (17/10/2026, maquette validée par Didier) — vrai code d'app-part1 exécuté (doubles pour le reste) :
// la bulle « Dépôts à restituer » (textes, geste), la liste des dépôts (échappement), l'historique (jamais « rendu » sans
// date de virement). Cas réel : Ferrette - 101, ancien bail sorti le 13/04/2026, 700 € versés, 303 € retenus pour le
// loyer d'avril → 397 € détenus, échéance 13/06 (pas d'EDL de sortie), 350 € de pénalité au 17/10.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extraireFonction } from './_extraction-source.js'
import { _dgRetenueLoyerDecidee, _dgVerseMontant } from '../../js/core/gestion-dg-impayes.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €'
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function monter(noms, extra = {}) {
  const scope = Object.assign({
    window: { _dgRetenueLoyerDecidee, _loyerTodayLocal: () => '2026-10-17' }, fmt, escHtml: esc, fd: (s) => String(s).slice(0, 10).split('-').reverse().join('/'),
    _dgVerseMontant, _logLabel: (r) => r, _lyQ: (s) => String(s).replace(/'/g, "\\'"), _uiIcon: () => '', _todayIsoLocal: () => '2026-10-17',
    Math, Number, String, Object, Array, Date, parseInt, isNaN,
  }, extra)
  const src = noms.map((n) => extraireFonction(P1, n)).join('\n')
  // eslint-disable-next-line no-new-func
  return new Function('scope', 'with (scope) {\n' + src + '\nreturn {' + noms.join(',') + '};\n}')(scope)
}

describe('bulle « Dépôts à restituer » : une phrase, l’échéance, la pénalité', () => {
  const f = monter(['_pilDepotTxt', '_dgEcheanceTxt', '_dgJjMm'])
  const item = { ref: 'Ferrette - 101', nom: 'Ferrette - 101', montant: 397, echeance: '2026-06-13', etat: 'en_retard', urgenceJours: -126, penalite: 350 }
  it('échéance dépassée : « + 350 € de pénalité » · « échéance 13/06 dépassée · Ferrette - 101 »', () => {
    const t = f._pilDepotTxt({ items: [item], pire: item })
    expect(t.a).toBe('+ 350 € de pénalité')
    expect(t.sub).toBe('échéance 13/06 dépassée · Ferrette - 101')
  })
  it('avant l’échéance : « 397 € à rendre » · « avant le 13/06 · … »', () => {
    const av = { ...item, etat: 'en_cours', penalite: 0, urgenceJours: 20 }
    const t = f._pilDepotTxt({ items: [av], pire: av })
    expect(t.a).toBe('397 € à rendre')
    expect(t.sub).toBe('avant le 13/06 · Ferrette - 101')
  })
  it('EDL de sortie de conformité inconnue, 1ʳᵉ date passée : « échéance possible JJ/MM dépassée »', () => {
    const p = { ...item, echeance: '2026-11-01', echeancePossible: '2026-10-01', etat: 'depassement_possible', penalite: 0 }
    expect(f._pilDepotTxt({ items: [p], pire: p }).sub).toBe('échéance possible 01/10 dépassée · Ferrette - 101')
  })
  it('deux dépôts : pénalités additionnées, centimes gardés ; nom échappé', () => {
    const b = { ...item, nom: '<img onerror=x>', penalite: 92.8, urgenceJours: -46, echeance: '2026-09-01' }
    const t = f._pilDepotTxt({ items: [item, b], pire: item })
    expect(t.a).toBe('+ 442,80 € de pénalité')
    expect(f._pilDepotTxt({ items: [b], pire: b }).sub).toContain('&lt;img onerror=x&gt;')
  })
})

describe('clic sur la bulle (PC et téléphone) : le solde de tout compte du bail EXACT, jamais « Déclarer le départ »', () => {
  const run = (liste) => {
    const appels = []
    const f = monter(['_dgBulleClick', '_dgOuvrirSolde'], {
      _dgScopeLogs: () => ({ scopeLogs: [] }), _dgDetenusListe: () => liste,
      _dgOpenRestitution: (ref, cle) => appels.push(['restitution', ref, cle]), _departOuvrir: (ref) => appels.push(['depart', ref]),
      _dgListeDetenus: () => appels.push(['liste']),
    })
    f._dgBulleClick()
    return appels
  }
  it('un seul dépôt à rendre (archive) + un nouveau bail en cours → la restitution de l’archive, avec sa clé', () => {
    expect(run([{ ref: 'Ferrette - 101', cle: 'Ferrette - 101|2026-04-20|a1', parti: true }, { ref: 'Ferrette - 101', cle: '', parti: false }]))
      .toEqual([['restitution', 'Ferrette - 101', 'Ferrette - 101|2026-04-20|a1']])
  })
  it('deux dépôts à rendre → la liste', () => {
    expect(run([{ ref: 'A', cle: 'k', parti: true }, { ref: 'B', cle: '', parti: true }])).toEqual([['liste']])
  })
  it('le téléphone (_accmGoto) et le PC (_pilBulleClick) passent par _dgBulleClick, plus par _departOuvrir', () => {
    expect(extraireFonction(P1, '_accmGoto')).toMatch(/case 'depot':[^]*?_dgBulleClick\(\); break;/)
    expect(extraireFonction(P1, '_pilBulleClick')).toMatch(/if \(famId === 'depot'\) \{ _dgBulleClick\(\); return; \}/)
  })
})

describe('liste des dépôts détenus : nom du locataire échappé', () => {
  it('un nom <img onerror> n’entre jamais tel quel dans le HTML', () => {
    let html = ''
    const e = { ref: 'L1', cle: "k'1", bail: { debut: '2024-08-20' }, parti: true, archive: true, detenu: 397, verse: 700, retenueLoyer: 303,
      nom: '<img src=x onerror=alert(1)>', sortie: '2026-04-13', echeance: '2026-06-13', etat: 'en_retard', jours: -126, penalite: 350, parMois: 70 }
    const f = monter(['_dgListeDetenus', '_dgEcheanceTxt', '_dgJjMm'], {
      _dgCss: () => {}, _dgScopeLogs: () => ({ scopeLogs: [], activeEnt: '' }), _dgDetenusListe: () => [e],
      _dgRetenueMoisTxt: () => 'Retenu pour le loyer d’avril', openDashDrill: (t, b) => { html = b },
    })
    f._dgListeDetenus()
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain("_dgOuvrirSolde('L1','k\\'1')")
    expect(html).toContain('échéance 13/06 dépassée')
    expect(html).toContain('70,00 € par mois commencé depuis le 13/06, soit 350,00 €')
  })
})

describe('restitution : les charges dues sont dites, jamais retenues sur le dépôt (décision Didier 17/10)', () => {
  const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
  const note = (chargesDues) => {
    const appels = []
    // eslint-disable-next-line no-new-func
    const f = new Function('scope', 'with (scope) {\n' + extraireFonction(P2, '_dgRestitChargesNote') + '\nreturn _dgRestitChargesNote;\n}')({
      fmt, td: () => '2026-10-17', _bailFinOccupation: () => '2026-04-13', String,
      _rgClotureImpayes: (ref, from, to, quoi) => { appels.push([ref, from, to, quoi]); return quoi === 'charge' ? chargesDues : 999 },
    })
    return { html: f({ ref: 'L-202', debut: '2025-01-01', finEffective: '2026-04-13' }), appels }
  }
  it('121,67 € de charges dues → une ligne au ton neutre, lue en CHARGES sur le bail exact', () => {
    const r = note(121.67)
    expect(r.html).toContain('121,67 € de charges restent dues : elles se règlent à la régularisation, pas sur le dépôt.')
    expect(r.appels).toEqual([['L-202', '2025-01-01', '2026-04-13', 'charge']])
  })
  it('aucune charge due (Ferrette - 101 : avril sans charges) → rien', () => {
    expect(note(0).html).toBe('')
  })
  it('le champ « Loyer dû retenu » est pré-rempli et plafonné par les loyers HC dus seulement (_rgClotureImpayes sans « charge »)', () => {
    const c = extraireFonction(P1, '_rgClotureImpayes')
    expect(c).toMatch(/const v = \(quoi === 'charge'\) \? m\.chargeRetard : m\.loyerRetard;/)
  })
})

describe('historique : jamais « rendu » sans date de virement', () => {
  const f = monter(['_dgEtatHist', '_dgDetenuDuBail', '_dgRestitutionEnregistree', '_dgRetenueLoyerDe'])
  it('Ferrette - 101 après la remise à zéro : « 397,00 € détenus · à justifier ou à rendre »', () => {
    expect(f._dgEtatHist({ dg: 700, cloture: true, clotureV: 2, dgRetenu: 150, dgRestitue: 0, dgRetenueLoyer: 303 }))
      .toEqual({ cls: 'warn', txt: '397,00 € détenus · à justifier ou à rendre' })
  })
  it('restitution datée : « Rendu le … » ; rien à rendre : « Solde de tout compte le … : rien à rendre »', () => {
    expect(f._dgEtatHist({ dg: 700, dgRestitueAt: '2026-10-17', dgRestitueMontant: 597 }).txt).toBe('Rendu le 17/10/2026 : 597,00 €')
    expect(f._dgEtatHist({ dg: 450, dgRestitueAt: '2026-07-01', dgRestitueMontant: 0 }).txt).toBe('Solde de tout compte le 01/07/2026 : rien à rendre')
  })
  it('ancienne clôture sans date : les montants notés, jamais « Rendu »', () => {
    const t = f._dgEtatHist({ dg: 560, cloture: true, dgRestitue: 650 }).txt
    expect(t).toBe('650,00 € noté rendu · sans date de virement')
    expect(t).not.toMatch(/^Rendu/)
  })
  it('dépôt entièrement retenu pour loyer, sans date : « Retenu pour loyer »', () => {
    expect(f._dgEtatHist({ dg: 450, cloture: true, clotureV: 2, dgRetenueLoyer: 450 }).txt).toBe('Retenu pour loyer : 450,00 €')
  })
})
