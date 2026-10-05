#!/usr/bin/env node
// Maintient ce qu'index.html charge hors cache HTTP, à lancer après toute modification de ces fichiers :
//   node tools/stamp-app-parts.mjs
// 1. Empreintes ?v=<sha1:8> des scripts « différés » : js/helpers/*.global.js, js/app/supabase-config.js,
//    js/app/app-part{1,2,3}.js, js/vendor/qrcode-generator.js (balises <script src="…" … defer>).
//    Un fichier à empreinte est servi DEPUIS LE CACHE par le service worker (sw.js) : sans empreinte à jour,
//    un navigateur garderait l'ancien code. Le test app-parts-stamp.test.js échoue si une empreinte est périmée.
// 2. Empreintes de css/login.css (<link id="imsb-style-link">) et du loader des libs PDF (pdf-libs.b64.js).
// 3. Bloc <link rel="modulepreload"> : le graphe d'imports statiques de js/main.js (+ js/app/supabase-entry.js),
//    pour que le navigateur télécharge les ~90 modules EN PARALLÈLE au lieu de les découvrir en cascade.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Hash sur le contenu SANS retours chariot : même empreinte sous Windows (CRLF) et sur la CI Linux (LF).
const hash = (rel) => crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, rel)).toString('latin1').replace(/\r/g, '')).digest('hex').slice(0, 8)

// ── graphe d'imports STATIQUES (import … from / export … from / import 'x'), pas les import() dynamiques ──────
const IMPORT_RE = /(?:^|[\n;}])\s*(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g
export function moduleGraph(entries) {
  const seen = new Set()
  const order = []
  let level = entries.map(e => e.replace(/\\/g, '/'))
  while (level.length) {
    const next = []
    for (const rel of level) {
      if (seen.has(rel)) continue
      seen.add(rel); order.push(rel)
      let src
      try { src = fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { continue }
      src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
      for (const m of src.matchAll(IMPORT_RE)) {
        const spec = m[1]
        if (!spec.startsWith('.')) continue                       // bare / URL : pas un module local
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec))
        if (!seen.has(target)) next.push(target)
      }
    }
    level = next
  }
  return order
}

export const PRELOAD_ENTRIES = ['js/main.js', 'js/app/supabase-entry.js']
export const PRELOAD_BEGIN = '<!-- modulepreload:begin (genere par tools/stamp-app-parts.mjs - ne pas editer a la main) -->'
export const PRELOAD_END = '<!-- modulepreload:end -->'
// Modules chargés par import() DYNAMIQUE avec un littéral relatif (ou new URL('…', import.meta.url)) dans l'entrée de
// connexion : supabase-js (vendor), supabase-boot, store-sync, cache-purge… Sans preload, chacun n'est découvert
// qu'au moment de son `await import(...)` — une dizaine d'allers-retours EN SÉRIE au démarrage.
const DYN_RE = /import\(\s*(?:\/\*[^*]*\*\/\s*)?['"](\.[^'"]+)['"]\s*\)|new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g
export function dynamicImports(rel) {
  let src
  try { src = fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { return [] }
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  return [...src.matchAll(DYN_RE)].map(m => path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1] || m[2])))
    .filter(p => /\.m?js$/.test(p))
}
export function preloadBlock() {
  // les points d'entrée sont déjà des <script type="module"> : on ne les « preload » pas
  const mods = moduleGraph([...PRELOAD_ENTRIES, ...dynamicImports('js/app/supabase-entry.js')]).filter(m => !PRELOAD_ENTRIES.includes(m))
  return PRELOAD_BEGIN + '\r\n' + mods.map(m => `<link rel="modulepreload" href="${m}">`).join('\r\n') + '\r\n' + PRELOAD_END
}

export const DEFER_SRC = /(<script src="(js\/(?:helpers\/[A-Za-z0-9._-]+\.global\.js|app\/supabase-config\.js|app\/app-part\d\.js|vendor\/qrcode-generator\.js)))(?:\?v=[0-9a-f]*)?(")/g

function main() {
  const file = path.join(ROOT, 'index.html')
  let html = fs.readFileSync(file, 'latin1')   // latin1 : aller-retour sans altérer d'octets
  let n = 0
  html = html.replace(DEFER_SRC, (_m, a, rel, q) => { n++; return `${a}?v=${hash(rel)}${q}` })
  html = html.replace(/(id="imsb-style-link" href="css\/login\.css\?v=)[0-9a-f]*(")/g, (_m, a, b) => { n++; return a + hash('css/login.css') + b })
  html = html.replace(/(s\.src='js\/vendor\/pdf-libs\.b64\.js\?v=)[0-9a-f]*(')/g, (_m, a, b) => { n++; return a + hash('js/vendor/pdf-libs.b64.js') + b })
  const a = html.indexOf(PRELOAD_BEGIN), b = html.indexOf(PRELOAD_END)
  if (a < 0 || b < 0) { console.error("Marqueurs modulepreload absents d'index.html."); process.exit(2) }
  html = html.slice(0, a) + preloadBlock() + html.slice(b + PRELOAD_END.length)
  fs.writeFileSync(file, html, 'latin1')
  console.log(`${n} empreinte(s) mise(s) à jour ; ${(html.match(/rel="modulepreload"/g) || []).length} modulepreload.`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
