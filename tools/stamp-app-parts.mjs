#!/usr/bin/env node
// Recalcule l'empreinte ?v=<sha1:8> des balises <script src="js/app/app-partN.js" data-inline-part> d'index.html.
// À lancer après toute modification de js/app/app-part*.js (sinon le test app-parts-stamp échoue, et les
// navigateurs garderaient l'ancien fichier en cache). Usage : node tools/stamp-app-parts.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'

const hash = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8)
let html = fs.readFileSync('index.html', 'latin1')   // latin1 : aller-retour sans altérer d'octets
let n = 0
html = html.replace(/<script src="js\/app\/(app-part\d)\.js\?v=[0-9a-f]*" data-inline-part><\/script>/g, (_m, name) => {
  n++
  return `<script src="js/app/${name}.js?v=${hash(`js/app/${name}.js`)}" data-inline-part></script>`
})
fs.writeFileSync('index.html', html, 'latin1')
console.log(`${n} balise(s) app-part estampillée(s).`)
