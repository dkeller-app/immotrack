// Perf — index.html charge du code/CSS/libs via des URL à empreinte (?v=<sha1:8>) : sans empreinte à jour, un
// navigateur (et le service worker, qui sert ces URL DEPUIS LE CACHE) garderait l'ancienne version.
// Concerne : js/helpers/*.global.js, js/app/supabase-config.js, js/app/app-part{1,2,3}.js,
// js/vendor/qrcode-generator.js, css/login.css, js/vendor/pdf-libs.b64.js — et le bloc <link rel="modulepreload">
// (graphe d'imports de js/main.js) qui doit refléter l'état réel du code.
// Réparer : node tools/stamp-app-parts.mjs
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'   // readFile (promesses) : non touché par le shim « index.html assemblé »
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { preloadBlock, PRELOAD_BEGIN, PRELOAD_END } from '../../tools/stamp-app-parts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sha = async (rel) => crypto.createHash('sha1').update(await readFile(resolve(root, rel))).digest('hex').slice(0, 8)
const indexHtml = async () => (await readFile(resolve(root, 'index.html'))).toString('latin1')

describe('empreintes de cache-busting', () => {
  it('chaque script différé (helpers, config, app-part, qrcode) porte le sha1 courant de son fichier', async () => {
    const html = await indexHtml()
    const re = /<script src="(js\/(?:helpers\/[A-Za-z0-9._-]+\.global\.js|app\/supabase-config\.js|app\/app-part\d\.js|vendor\/qrcode-generator\.js))\?v=([0-9a-f]+)"/g
    const balises = [...html.matchAll(re)]
    expect(balises.length, '24 helpers + config + 3 app-part + qrcode attendus').toBe(29)
    for (const [, rel, v] of balises) {
      expect(v, `${rel} a changé : lancer node tools/stamp-app-parts.mjs`).toBe(await sha(rel))
    }
  })

  it('tous les scripts classiques de l’app sont en defer (téléchargés en parallèle, exécutés dans l’ordre)', async () => {
    const html = await indexHtml()
    const sansDefer = [...html.matchAll(/<script src="(js\/(?:helpers|app|vendor)\/[^"]+)"[^>]*>/g)]
      .filter(m => !/type="module"/.test(m[0]) && !/\bdefer\b/.test(m[0]) && !m[1].includes('pdf-libs'))
      .map(m => m[1])
    expect(sansDefer, 'script classique synchrone : bloque le parsing et se télécharge en série').toEqual([])
  })

  it('l’entrée supabase-entry s’exécute APRÈS les app-part et AVANT main.js (ordre d’origine)', async () => {
    const html = await indexHtml()
    const iEntry = html.indexOf('<script type="module" src="js/app/supabase-entry.js"')
    const iPart3 = html.indexOf('src="js/app/app-part3.js')
    const iQr = html.indexOf('src="js/vendor/qrcode-generator.js')
    const iMain = html.indexOf('<script type="module" src="js/main.js"')
    expect(iEntry).toBeGreaterThan(iPart3)
    expect(iEntry).toBeGreaterThan(iQr)
    expect(iMain).toBeGreaterThan(iEntry)
  })

  it('css/login.css et js/vendor/pdf-libs.b64.js portent leur sha1 courant', async () => {
    const html = await indexHtml()
    const css = /id="imsb-style-link" href="css\/login\.css\?v=([0-9a-f]+)"/.exec(html)
    const pdf = /s\.src='js\/vendor\/pdf-libs\.b64\.js\?v=([0-9a-f]+)'/.exec(html)
    expect(css, 'lien css/login.css?v= introuvable').toBeTruthy()
    expect(pdf, 'loader pdf-libs.b64.js?v= introuvable').toBeTruthy()
    expect(css[1], 'css/login.css a changé : lancer node tools/stamp-app-parts.mjs').toBe(await sha('css/login.css'))
    expect(pdf[1], 'pdf-libs.b64.js a changé : lancer node tools/stamp-app-parts.mjs').toBe(await sha('js/vendor/pdf-libs.b64.js'))
  })

  it('le bloc modulepreload reflète exactement le graphe d’imports statiques de js/main.js', async () => {
    const html = await indexHtml()
    const a = html.indexOf(PRELOAD_BEGIN), b = html.indexOf(PRELOAD_END)
    expect(a, 'marqueur modulepreload absent').toBeGreaterThan(0)
    const actuel = html.slice(a, b + PRELOAD_END.length)
    expect(actuel, 'un import a changé : lancer node tools/stamp-app-parts.mjs').toBe(preloadBlock())
    expect((actuel.match(/rel="modulepreload"/g) || []).length).toBeGreaterThan(50)
  })
})
