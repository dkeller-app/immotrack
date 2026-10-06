// Perf étape 3a — l'écran de connexion est du HTML STATIQUE dans index.html, adopté (pas recréé) par
// js/app/supabase-entry.js. Ce test verrouille le contrat entre les deux : ids attendus par le câblage,
// drapeau de gate, lien CSS, garde anti-submit inline, adoption côté entrée.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const html = readFileSync(resolve(root, 'index.html'), 'utf8').replace(/\r/g, '')
const entry = readFileSync(resolve(root, 'js/app/supabase-entry.js'), 'utf8').replace(/\r/g, '')

describe('écran de connexion statique', () => {
  it('index.html contient l’overlay statique, premier enfant du body, avec tous les ids du câblage', () => {
    const i = html.indexOf('\n<body>\n')
    expect(i).toBeGreaterThan(0)
    expect(html.slice(i, i + 80)).toContain('<div id="imsb-overlay" data-static>')
    for (const id of ['imsb-left', 'imsb-form', 'imsb-email', 'imsb-pass', 'imsb-submit', 'imsb-error', 'imsb-forgot', 'imsb-remember', 'imsb-signup', 'imsb-theme', 'imsb-authwrap']) {
      expect(html, `#${id} manquant dans l’overlay statique`).toContain(`id="${id}"`)
    }
  })

  it('le CSS est lié dans le <head> et le gate pose data-imsb (overlay masqué hors démarrage cloud)', () => {
    expect(html).toMatch(/<link rel="stylesheet" id="imsb-style-link" href="css\/login\.css\?v=[0-9a-f]+">/)
    expect(html).toContain("setAttribute('data-imsb','1')")
    expect(readFileSync(resolve(root, 'css/login.css'), 'utf8')).toContain('html:not([data-imsb]) #imsb-overlay[data-static]{display:none}')
  })

  it('le script inline pose la garde anti-submit natif AVANT les scripts de l’app', () => {
    const o = html.indexOf('id="imsb-overlay" data-static')
    const g = html.indexOf('ov._pendingSubmit=false;', o)
    const firstApp = html.indexOf('<script src="js/helpers/', o)
    expect(g).toBeGreaterThan(o)
    expect(g).toBeLessThan(firstApp)
    expect(html.slice(g, g + 400)).toContain('e.preventDefault();ov._pendingSubmit=true')
  })

  it('supabase-entry adopte l’overlay existant, sans le recréer', () => {
    expect(entry).toContain("document.getElementById('imsb-overlay')")
    expect(entry).not.toMatch(/ov\.innerHTML\s*=\s*`/)
    expect(entry).not.toMatch(/createElement\('div'\)[\s\S]{0,80}imsb-overlay/)
  })
})
