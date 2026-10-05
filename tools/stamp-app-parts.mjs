#!/usr/bin/env node
// Recalcule les empreintes ?v=<sha1:8> de ce qu'index.html charge hors cache HTTP :
//   - les balises <script src="js/app/app-partN.js?v=…" data-inline-part …>   (code applicatif)
//   - <link id="imsb-style-link" href="css/login.css?v=…">                     (écran de connexion)
//   - le loader des libs PDF : src='js/vendor/pdf-libs.b64.js?v=…'            (libs PDF à la demande)
// À lancer après toute modification de ces fichiers (sinon le test app-parts-stamp échoue, et les navigateurs
// garderaient l'ancienne version en cache). Usage : node tools/stamp-app-parts.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'

const hash = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8)
let html = fs.readFileSync('index.html', 'latin1')   // latin1 : aller-retour sans altérer d'octets
let n = 0
html = html.replace(/(<script src="js\/app\/(app-part\d)\.js\?v=)[0-9a-f]*(" data-inline-part)/g, (_m, a, name, b) => { n++; return a + hash(`js/app/${name}.js`) + b })
html = html.replace(/(id="imsb-style-link" href="css\/login\.css\?v=)[0-9a-f]*(")/g, (_m, a, b) => { n++; return a + hash('css/login.css') + b })
html = html.replace(/(s\.src='js\/vendor\/pdf-libs\.b64\.js\?v=)[0-9a-f]*(')/g, (_m, a, b) => { n++; return a + hash('js/vendor/pdf-libs.b64.js') + b })
fs.writeFileSync('index.html', html, 'latin1')
console.log(`${n} empreinte(s) mise(s) à jour (attendu : 5).`)
