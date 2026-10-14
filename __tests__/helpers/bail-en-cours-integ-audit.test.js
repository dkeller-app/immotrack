// Audit d'intégration v15.728 (Bail en cours sur la production) — points 🟡 et tests manquants M12 / M17.
// Vrai code de l'app exécuté (fonctions extraites), doubles pour le reste.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { extraireFonction } from './_extraction-source.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const lire = (p) => readFileSync(resolve(root, p), 'utf8')
const P1 = lire('js/app/app-part1.js'), P2 = lire('js/app/app-part2.js'), CSS = lire('css/main.css'), HTML = lire('index.html')
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Monte des fonctions dans une portée `with` : identifiants fournis, sinon undefined. */
function monter(src, noms, env) {
  const scope = new Proxy(env, { has: (t, k) => typeof k === 'string' && !noms.includes(k), get: (t, k) => (k in t ? t[k] : (k in globalThis ? globalThis[k] : undefined)) })
  return new Function('scope', 'with (scope) {\n' + noms.map(n => (src.includes('async function ' + n + '(') ? 'async ' : '') + extraireFonction(src, n)).join('\n') + '\nreturn {' + noms.join(',') + '};\n}')(scope)
}

describe('🟡1 — cibles tactiles 44 px au téléphone (bloc « signé hors Propryo », choix Entrée / Sortie de l\'EDL)', () => {
  it('règle CSS dans le bloc téléphone, min-height 44 px + inline-flex', () => {
    const i = CSS.indexOf('BAIL-EN-COURS-SIGNE-HORS-PROPRYO — zones tactiles')
    const bloc = CSS.slice(i, CSS.indexOf('\n}', i))
    expect(bloc).toMatch(/@media \(max-width:767px\)/)
    expect(bloc).toMatch(/#b-externe-detail \.btn, #edlx-form \.edlx-choix\{min-height:44px;display:inline-flex;align-items:center\}/)
  })
  it('les deux choix Entrée / Sortie portent la classe', () => {
    expect((extraireFonction(P2, '_edlExtFormHtml').match(/<label class="edlx-choix"/g) || []).length).toBe(2)
  })
})

describe('🟡4 — Accueil téléphone : le pire cas n\'est échappé qu\'une fois', () => {
  const { _pilPireTxt } = monter(P1, ['_pilPireTxt'], { escHtml })
  it('_pilPireTxt rend du HTML déjà échappé', () => {
    expect(_pilPireTxt({ pire: { nom: 'Studio <b> & Cie' } })).toBe('Studio &lt;b&gt; &amp; Cie')
  })
  it('_accmShowAregarder l\'insère tel quel (comme le PC), jamais escHtml(pire)', () => {
    const f = extraireFonction(P1, '_accmShowAregarder')
    expect(f).not.toMatch(/escHtml\(pire\)/)
    expect(f).toMatch(/\(pire\?\(' · '\+pire\):''\)/)
    expect(P1).toContain(`'<span class="sub">' + _pilPireTxt(f) + '</span>'`)   // le PC l'insère tel quel lui aussi
  })
})

describe('🟡5 — export CSV des biens : injection de formule et texte normalisé', () => {
  function exporter(logs) {
    const sortie = {}
    const env = {
      DB: { logements: logs }, _biensTab: 'actifs', _activeLogements: () => logs, _filterAndSortLogs: (p) => p,
      _lotStatutLibelle: () => 'Loué', _logLabel: (l) => l.libelle || l.ref, td: () => '2026-10-07', showToast: () => {},
      Blob: class { constructor(p) { sortie.csv = p.join('') } }, URL: { createObjectURL: () => 'u', revokeObjectURL: () => {} },
      document: { createElement: () => ({ click() {} }) },
    }
    monter(P2, ['exportBiensCSV'], env).exportBiensCSV()
    return sortie.csv.replace(/^﻿/, '').split('\n').slice(1).map(l => l.split(';'))
  }
  it.each([['=HYPERLINK("x")'], ['+1'], ['-2'], ['@SUM(A1)'], ['\t=cmd'], ['\r=cmd'], ['‮=cmd']])('locataire %j : neutralisé', (loc) => {
    const [ligne] = exporter([{ ref: 'D-101', locataire: loc }])
    expect(ligne[10]).toMatch(/^"'[=+\-@]/)
  })
  it('locataire normalisé : contrôles → espace, invisibles / bidi retirés, blancs ramenés', () => {
    const [ligne] = exporter([{ ref: 'D-101', locataire: '  Jean\u0007​  Dupont\n ' }])
    expect(ligne[10]).toBe('"Jean Dupont"')
  })
  it('nom affiché neutralisé lui aussi ; texte ordinaire inchangé', () => {
    const [a, b] = exporter([{ ref: 'D-101', libelle: '=1+1', locataire: 'Lea' }, { ref: 'D-102', libelle: 'Studio', locataire: 'Paul' }])
    expect(a[15]).toBe(`"'=1+1"`)
    expect(b[15]).toBe('"Studio"'); expect(b[10]).toBe('"Paul"')
  })
})

describe('🟡8 — dates de la carte Documents échappées', () => {
  it('« Signé le » et « début » passent par escHtml(fd(…))', () => {
    const f = extraireFonction(P2, '_renderLogFichePanelDocuments')
    expect(f).toMatch(/Signé le \$\{escHtml\(fd\(_sigExt/)
    expect(f).toMatch(/début \$\{escHtml\(fd\(bail\.debut\)\)\}/)
    expect(f).toMatch(/Signé le \$\{escHtml\(fd\(String\(d\.bailSignedAt/)
    expect(f).not.toMatch(/Signé le \$\{fd\(/)
  })
})

describe('🟡10 — pièce jointe d\'un bail / EDL hors Propryo : contenu vérifié aux premiers octets', () => {
  const toasts = []
  const env = { showToast: (m, t) => toasts.push([m, t]), FileReader: class { readAsDataURL(f) { this.onload({ target: { result: 'data:' + (f.type || 'application/octet-stream') + ';base64,QUJD' } }) } }, Uint8Array }
  const { _pjTypeReel, _pjExterneLire } = monter(P1, ['_pjTypeReel', '_pjExterneLire'], env)
  const octets = (s) => Array.from(Buffer.from(s, 'latin1'))
  const PDF = octets('%PDF-1.7\n'), JPG = [0xFF, 0xD8, 0xFF, 0xE0], PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], WEBP = octets('RIFF\0\0\0\0WEBPVP8 ')
  const SVG = octets('<svg xmlns="http://www.w3.org/2000/svg"><script>'), HTMLB = octets('<!doctype html>')
  it('bail (PDF seulement) : %PDF- accepté ; image, SVG, HTML refusés', () => {
    expect(_pjTypeReel(PDF, false)).toBe('application/pdf')
    for (const b of [JPG, PNG, WEBP, SVG, HTMLB, octets('%PD')]) expect(_pjTypeReel(b, false)).toBe('')
  })
  it('EDL (PDF ou photo) : JPEG, PNG, WebP acceptés ; SVG et HTML jamais', () => {
    expect(_pjTypeReel(JPG, true)).toBe('image/jpeg'); expect(_pjTypeReel(PNG, true)).toBe('image/png'); expect(_pjTypeReel(WEBP, true)).toBe('image/webp')
    expect(_pjTypeReel(SVG, true)).toBe(''); expect(_pjTypeReel(HTMLB, true)).toBe('')
  })
  const fichier = (bytes, type, name = 'x.pdf', size) => ({ name, type, size: size == null ? bytes.length : size, slice: () => ({ arrayBuffer: async () => Uint8Array.from(bytes).buffer }) })
  it('_pjExterneLire : un SVG renommé .pdf et annoncé application/pdf est REFUSÉ (le contenu décide)', async () => {
    const input = { files: [fichier(SVG, 'application/pdf', 'bail.pdf')], value: 'x' }
    expect(await _pjExterneLire(input, false)).toBeNull()
    expect(input.value).toBe('')
    expect(toasts.at(-1)).toEqual(['Format non accepté : déposer un PDF.', 'err'])
  })
  it('_pjExterneLire : vrai PDF au type vide (Android) → accepté, en-tête data: = type RÉEL', async () => {
    const r = await _pjExterneLire({ files: [fichier(PDF, '', 'bail')] }, false)
    expect(r).toMatchObject({ name: 'bail', mime: 'application/pdf' })
    expect(r.dataB64).toBe('data:application/pdf;base64,QUJD')
  })
  it('_pjExterneLire : photo JPEG annoncée image/png → acceptée pour un EDL, typée image/jpeg ; refusée pour un bail', async () => {
    expect((await _pjExterneLire({ files: [fichier(JPG, 'image/png', 'edl.png')] }, true)).mime).toBe('image/jpeg')
    expect(await _pjExterneLire({ files: [fichier(JPG, 'image/png', 'bail.png')] }, false)).toBeNull()
  })
  it('_pjExterneLire : plus de 10 Mo → refusé avant toute lecture', async () => {
    expect(await _pjExterneLire({ files: [fichier(PDF, 'application/pdf', 'gros.pdf', 11 * 1048576)] }, false)).toBeNull()
    expect(toasts.at(-1)[0]).toMatch(/trop lourd/)
  })
  it('câblage : les 4 sélecteurs passent par _pjExterneLire ; accept sans image/* ni SVG', () => {
    expect(extraireFonction(P1, '_bailExterneFichierPris')).toMatch(/_pjExterneLire\(input, false\)/)
    expect(extraireFonction(P1, '_bailScanExterneChoisir')).toMatch(/_pjExterneLire\(inp, false\)/)
    expect(extraireFonction(P1, '_bailScanExterneChoisir')).toMatch(/inp\.accept = 'application\/pdf';/)
    expect(extraireFonction(P2, '_edlExtFichierPris')).toMatch(/_pjExterneLire\(input, true\)/)
    expect(extraireFonction(P2, '_edlExtAjouterPj')).toMatch(/_pjExterneLire\(inp, true\)/)
    expect(HTML).toMatch(/id="b-externe-file" accept="application\/pdf"/)
    expect(extraireFonction(P2, '_edlExtFormHtml')).toMatch(/id="edlx-file" accept="application\/pdf,image\/jpeg,image\/png,image\/webp"/)
  })
})

describe('M12 — _computeUnifiedTodo : les diagnostics « à refaire » passent par le filtre A6 (_diagExpireARefaire)', () => {
  function todo(aRefaire) {
    const appels = []
    const AlertRules = new Proxy({}, { get: () => () => [] })
    const env = {
      DB: { mrh: [], baux: {}, assurances: [], logements: [] }, AlertRules, _DIAGS_CATALOG_INLINE: [{ key: 'erp', label: 'ERP' }, { key: 'dpe', label: 'DPE' }],
      _diagExpireARefaire: (k, l, d) => { appels.push([k, l.ref, d instanceof Date]); return aRefaire(k) },
      _logLabel: (r) => r, _lyQ: (r) => r, fd: (s) => s, fmt: (n) => String(n), _lotEstLoue: () => false, _archivesDetenuesDuLot: () => [],
    }
    const { _computeUnifiedTodo } = monter(P1, ['_computeUnifiedTodo'], env)
    return { out: _computeUnifiedTodo({ scopeLogs: [{ ref: 'F-101', locataire: 'Martin' }], activeEnt: '' }), appels }
  }
  it('diagnostic jugé à refaire (bail en place conclu après son expiration) → une tâche', () => {
    const { out, appels } = todo((k) => k === 'erp')
    expect(out.filter(x => x.type === 'diag').map(x => x.title)).toEqual(['ERP expiré'])
    expect(appels).toEqual([['erp', 'F-101', true], ['dpe', 'F-101', true]])
  })
  it('diagnostic expiré APRÈS la conclusion du bail en place (A6 : pas à refaire) → aucune tâche', () => {
    expect(todo(() => false).out.filter(x => x.type === 'diag')).toEqual([])
  })
})

describe('M17 — openRemoteSignModal refuse un bail déclaré signé hors Propryo ou déjà signé', () => {
  function ouvrir(bail) {
    const toasts = [], appels = []
    const env = {
      DB: { baux: { 'D-101': bail }, logements: [{ ref: 'D-101' }] }, showToast: (m, t) => toasts.push([m, t]),
      _rsPreflight: async () => { appels.push('preflight'); return { ok: false } },
    }
    const { openRemoteSignModal } = monter(P1, ['openRemoteSignModal'], env)
    return openRemoteSignModal('D-101').then(() => ({ toasts, appels }))
  }
  it('bail externe → refus, message dédié, aucun contrôle au relais ni envoi', async () => {
    const r = await ouvrir({ ref: 'D-101', signatures: { signedAt: '2024-02-20T12:00:00.000Z', mode: 'externe' } })
    expect(r.toasts).toEqual([['Bail déclaré signé hors Propryo : rien à signer dans Propryo', 'err']])
    expect(r.appels).toEqual([])
  })
  it('bail signé électroniquement → refus « déjà signé »', async () => {
    const r = await ouvrir({ ref: 'D-101', signatures: { signedAt: '2024-02-20T12:00:00.000Z', mode: 'distance' } })
    expect(r.toasts).toEqual([['Ce bail est déjà signé', 'err']])
    expect(r.appels).toEqual([])
  })
  it('signature partielle (bailleur seul) → on continue vers le contrôle au relais', async () => {
    const r = await ouvrir({ ref: 'D-101', signatures: { signedAt: '2024-02-20T12:00:00.000Z', mode: 'bailleur-seul' } })
    expect(r.appels).toEqual(['preflight'])
  })
})
