// Perf — index.html charge du code/CSS/libs via des URL à empreinte (?v=<sha1:8>) : sans empreinte à jour, un
// navigateur garderait l'ancienne version en cache (GitHub Pages : 10 min ; service worker : revalidation).
// Concerne : js/app/app-part{1,2,3}.js, css/login.css, js/vendor/pdf-libs.b64.js.
// Réparer : node tools/stamp-app-parts.mjs
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'   // readFile (promesses) : non touché par le shim « index.html assemblé »
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sha = async (rel) => crypto.createHash('sha1').update(await readFile(resolve(root, rel))).digest('hex').slice(0, 8)

describe('empreintes de cache-busting', () => {
  it('chaque balise data-inline-part porte le sha1 courant de son fichier', async () => {
    const html = (await readFile(resolve(root, 'index.html'))).toString('latin1')
    const balises = [...html.matchAll(/<script src="js\/app\/(app-part\d)\.js\?v=([0-9a-f]+)" data-inline-part/g)]
    expect(balises.length, 'les 3 balises app-part doivent être présentes').toBe(3)
    for (const [, name, v] of balises) {
      expect(v, `${name}.js a changé : lancer node tools/stamp-app-parts.mjs`).toBe(await sha(`js/app/${name}.js`))
    }
  })

  it('css/login.css et js/vendor/pdf-libs.b64.js portent leur sha1 courant', async () => {
    const html = (await readFile(resolve(root, 'index.html'))).toString('latin1')
    const css = /id="imsb-style-link" href="css\/login\.css\?v=([0-9a-f]+)"/.exec(html)
    const pdf = /s\.src='js\/vendor\/pdf-libs\.b64\.js\?v=([0-9a-f]+)'/.exec(html)
    expect(css, 'lien css/login.css?v= introuvable').toBeTruthy()
    expect(pdf, 'loader pdf-libs.b64.js?v= introuvable').toBeTruthy()
    expect(css[1], 'css/login.css a changé : lancer node tools/stamp-app-parts.mjs').toBe(await sha('css/login.css'))
    expect(pdf[1], 'pdf-libs.b64.js a changé : lancer node tools/stamp-app-parts.mjs').toBe(await sha('js/vendor/pdf-libs.b64.js'))
  })
})
