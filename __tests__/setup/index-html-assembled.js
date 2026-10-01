// Les ~3,8 Mo de code applicatif d'index.html vivent désormais dans js/app/app-part{1,2,3}.js (perf :
// la page de connexion n'a plus à les télécharger). ~90 tests lisent encore « index.html » pour analyser
// ce code : plutôt que de les réécrire un à un, on leur sert index.html ASSEMBLÉ — chaque balise
// <script src="js/app/app-partN.js" data-inline-part> est remplacée par le contenu exact du fichier, en
// <script> inline. Le texte rendu est identique, octet pour octet, à l'ancien index.html monolithique.
import fs from 'node:fs'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..')
const indexPath = path.join(root, 'index.html')
const orig = fs.readFileSync.bind(fs)
const re = /<script src="js\/app\/(app-part\d)\.js[^"]*" data-inline-part><\/script>/g

function assembled(opts) {
  const enc = typeof opts === 'string' ? opts : (opts && opts.encoding)
  const html = orig(indexPath, 'utf8').replace(re, (_m, name) => '<script>' + orig(path.join(root, 'js', 'app', name + '.js'), 'utf8') + '</script>')
  return enc ? html : Buffer.from(html, 'utf8')
}

fs.readFileSync = function (p, opts) {
  try {
    if (typeof p === 'string' || p instanceof URL || Buffer.isBuffer(p)) {
      const s = p instanceof URL ? p.pathname : String(p)
      if (path.resolve(s.replace(/^\/([A-Za-z]:)/, '$1')) === indexPath) return assembled(opts)
    }
  } catch (_e) { /* retombe sur l'original */ }
  return orig(p, opts)
}
syncBuiltinESMExports()
