// Perf étape 2 — les balises <script src="js/app/app-partN.js?v=…" data-inline-part> d'index.html portent
// l'empreinte du fichier : sans elle à jour, un navigateur garderait l'ancien code applicatif en cache.
// Réparer : node tools/stamp-app-parts.mjs
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'   // readFile (promesses) : non touché par le shim « index.html assemblé »
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('empreintes des app-part (cache-busting)', () => {
  it('chaque balise data-inline-part porte le sha1 courant de son fichier', async () => {
    const html = (await readFile(resolve(root, 'index.html'))).toString('latin1')
    const balises = [...html.matchAll(/<script src="js\/app\/(app-part\d)\.js\?v=([0-9a-f]+)" data-inline-part><\/script>/g)]
    expect(balises.length, 'les 3 balises app-part doivent être présentes').toBe(3)
    for (const [, name, v] of balises) {
      const h = crypto.createHash('sha1').update(await readFile(resolve(root, 'js/app', name + '.js'))).digest('hex').slice(0, 8)
      expect(v, `${name}.js a changé : lancer node tools/stamp-app-parts.mjs`).toBe(h)
    }
  })
})
