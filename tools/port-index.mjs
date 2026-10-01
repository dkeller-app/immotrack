#!/usr/bin/env node
// Porte vers la NOUVELLE structure (index.html = coquille + js/app/app-part{1,2,3}.js) les modifications qu'une
// branche a faites dans l'ANCIEN index.html monolithique. À lancer PENDANT une fusion en cours :
//
//   git switch -c port/<nom> perf/chargement-modulaire     # (ou main, une fois la refonte fusionnée)
//   git merge --no-commit --no-ff <branche>                 # conflit attendu sur index.html : c'est normal
//   node tools/port-index.mjs                               # résout index.html + app-part*.js (fusion à 3 voies)
//   git add -A && git commit
//
// Principe : on découpe 3 versions de l'ancien index.html (BASE = ancêtre commun, THEIRS = la branche) en
// « coquille » + 3 gros scripts inline (+ le bloc des libs PDF) ; la 3e version (OURS = arbre courant) est déjà
// découpée. Puis `git merge-file` (fusion à 3 voies) bloc par bloc : les modifs de la branche s'appliquent aux
// bons fichiers, y compris celles faites sur du code que main a aussi modifié. Une zone modifiée des deux côtés
// reste marquée <<<<<<< / >>>>>>> : à résoudre à la main, l'outil les liste et sort en code 1.
//
// Codage : tout est lu/écrit en latin1 (octets inchangés — index.html contient des octets non UTF-8).
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const git = (...a) => execFileSync('git', a, { encoding: 'latin1', maxBuffer: 1 << 30 })
const MIN = 50 * 1024

function split(html) {
  const parts = []
  let pdf = null
  const shell = html.replace(/<script>([\s\S]*?)<\/script>/g, (m, inner) => {
    if (inner.length < MIN) return m
    if (inner.slice(0, 200).includes('window._BAIL_PDF_LIBS')) { pdf = inner; return '<!--@@PDF@@-->' }
    parts.push(inner)
    return `<!--@@PART${parts.length}@@-->`
  })
  return { shell, parts, pdf }
}

// Les blobs git sont en LF, les copies de travail (index.html, app-part*.js : .gitattributes eol=crlf) en CRLF :
// on aligne tout sur CRLF, sinon chaque ligne « diffère » et tout devient conflit.
const crlf = t => t.replace(/\r?\n/g, '\r\n')

// OURS = commit courant (HEAD), PAS la copie de travail : pendant une fusion en conflit, celle-ci contient déjà
// les marqueurs de Git, qui se mélangeraient aux nôtres. Balises <script src="js/app/app-partN.js…"> -> marqueurs.
let ours = crlf(git('show', 'HEAD:index.html'))
const tags = {}
ours = ours.replace(/<script src="js\/app\/(app-part(\d))\.js[^"]*" data-inline-part[^>]*><\/script>/g, (m, _n, k) => { tags[k] = m; return `<!--@@PART${k}@@-->` })
if (Object.keys(tags).length !== 3) { console.error('index.html courant : les 3 balises app-part sont introuvables (arbre pas sur la nouvelle structure ?).'); process.exit(2) }

let head
try { head = git('rev-parse', '-q', '--verify', 'MERGE_HEAD').trim() } catch { head = '' }
if (!head) { console.error('Pas de fusion en cours (MERGE_HEAD absent). Lancer : git merge --no-commit --no-ff <branche>'); process.exit(2) }
const baseRef = git('merge-base', 'HEAD', 'MERGE_HEAD').trim()

const base = split(crlf(git('show', `${baseRef}:index.html`)))
const theirs = split(crlf(git('show', `${head}:index.html`)))
if (base.parts.length !== 3 || theirs.parts.length !== 3) {
  console.error(`Découpage inattendu (base : ${base.parts.length} parts, branche : ${theirs.parts.length}). Attendu : 3 gros scripts inline dans l'ancien index.html.`)
  process.exit(2)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'port-index-'))
function merge3(name, o, b, t) {
  if (b === t) return { text: o, conflits: 0 }    // la branche n'a rien changé ici
  if (o === b) return { text: t, conflits: 0 }    // main n'a rien changé ici : on prend la branche
  const [fo, fb, ft] = ['ours', 'base', 'theirs'].map((k, i) => { const f = path.join(tmp, `${name}.${k}`); fs.writeFileSync(f, [o, b, t][i], 'latin1'); return f })
  const r = spawnSync('git', ['merge-file', '-p', '-L', 'perf/main', '-L', 'base', '-L', 'branche', fo, fb, ft], { maxBuffer: 1 << 30 })
  if (r.status < 0 || r.status === null) { console.error('git merge-file a échoué pour', name); process.exit(2) }
  return autoVersion({ text: r.stdout.toString('latin1'), conflits: r.status })
}

// Les conflits qui ne portent QUE sur un numéro de version (v15.709 / v15.710 : chaque branche « bumpe » la
// version) se règlent seuls : on garde le plus récent.
function autoVersion(r) {
  if (!r.conflits) return r
  const ver = s => (s.match(/15\.\d{3}/g) || []).map(v => +v.slice(3))
  const re = /<<<<<<< perf\/main\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>> branche\r?\n/g
  let restants = 0
  const text = r.text.replace(re, (m, a, b) => {
    if (a.replace(/15\.\d{3}/g, 'X') === b.replace(/15\.\d{3}/g, 'X')) return Math.max(0, ...ver(a)) >= Math.max(0, ...ver(b)) ? a : b
    restants++
    return m
  })
  return { text, conflits: restants }
}

let total = 0
const rapport = []

// 1. les 3 scripts applicatifs
for (let i = 0; i < 3; i++) {
  const file = `js/app/app-part${i + 1}.js`
  const cur = crlf(git('show', `HEAD:${file}`))
  const r = merge3(`part${i + 1}`, cur, base.parts[i], theirs.parts[i])
  fs.writeFileSync(file, r.text, 'latin1')
  total += r.conflits
  rapport.push(`${file.padEnd(22)} ${base.parts[i] === theirs.parts[i] ? 'inchangé côté branche' : (r.conflits ? r.conflits + ' conflit(s) À RÉSOUDRE' : 'porté')}`)
}

// 2. la coquille d'index.html
const sh = merge3('shell', ours.replace(/<!--@@PDF@@-->/g, ''), base.shell, theirs.shell)
let out = sh.text
total += sh.conflits
rapport.push(`index.html (coquille)    ${base.shell === theirs.shell ? 'inchangé côté branche' : (sh.conflits ? sh.conflits + ' conflit(s) À RÉSOUDRE' : 'porté')}`)
for (const k of [1, 2, 3]) out = out.replace(`<!--@@PART${k}@@-->`, tags[k])
if (/<!--@@PART\d@@-->/.test(out)) { console.error('Marqueur app-part perdu dans la fusion de la coquille : à vérifier à la main.'); total++ }
fs.writeFileSync('index.html', out, 'latin1')

// 3. libs PDF : changées par la branche ? (rare) -> à reporter à la main dans js/vendor/pdf-libs.b64.js
if (base.pdf !== theirs.pdf) {
  const f = path.join(tmp, 'pdf-libs.THEIRS.js'); fs.writeFileSync(f, theirs.pdf, 'latin1')
  rapport.push(`⚠ libs PDF modifiées par la branche : à reporter à la main dans js/vendor/pdf-libs.b64.js (version branche : ${f})`)
}

try { execFileSync('node', ['tools/stamp-app-parts.mjs'], { stdio: 'pipe' }) } catch (e) { rapport.push('⚠ tools/stamp-app-parts.mjs a échoué : à relancer à la main') }

console.log('Portage de ' + head.slice(0, 8) + ' (base ' + baseRef.slice(0, 8) + ') :\n  ' + rapport.join('\n  '))
if (total) {
  console.log(`\n${total} conflit(s). Chercher « <<<<<<< perf/main » dans index.html et js/app/app-part*.js, résoudre, puis :\n  node tools/stamp-app-parts.mjs && npx vitest run && git add -A && git commit`)
  process.exit(1)
}
console.log('\nAucun conflit. Vérifier : npx vitest run  (puis git add -A && git commit)')
