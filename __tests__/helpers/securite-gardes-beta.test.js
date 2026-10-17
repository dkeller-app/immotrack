// Garde-fous avant bêta (lot A) : trois classes de défaut qui ne doivent pas revenir.
//   1. pdf.js 3.11 (CVE-2024-4367) : tout PDF ouvert par l'app — souvent fourni par un tiers (facture
//      d'artisan, DDT, pièce de candidat) — l'est avec `isEvalSupported: false`.
//   2. Un « échappeur » de repli qui n'échappe rien (`x => x`) : escHtml est toujours défini.
//   3. `fd()` (date affichée) ne renvoie jamais de < > " & bruts quand la valeur n'est pas une date.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function fichiersJs (dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'vendor') fichiersJs(p, out) } else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}
const SOURCES = fichiersJs('js').map(f => ({ f, s: fs.readFileSync(f, 'utf8') }))

describe('pdf.js : évaluation de code désactivée', () => {
  const appels = []
  for (const { f, s } of SOURCES) {
    const re = /getDocument\(\s*\{([^}]*)\}/g
    let m
    while ((m = re.exec(s))) appels.push({ f, args: m[1] })
  }
  it('au moins les 7 ouvertures connues sont trouvées (garde anti-vacuité)', () => {
    expect(appels.length).toBeGreaterThanOrEqual(7)
  })
  it('chaque ouverture passe isEvalSupported: false', () => {
    const fautifs = appels.filter(a => !/isEvalSupported\s*:\s*false/.test(a.args)).map(a => a.f + ' : ' + a.args.trim())
    expect(fautifs).toEqual([])
  })
})

describe('aucun échappeur de repli qui n\'échappe rien', () => {
  it('pas de « ? esc… : (x => x) »', () => {
    const fautifs = []
    for (const { f, s } of SOURCES) {
      const re = /\?\s*[\w.]*[eE]sc\w*\s*:\s*\(\s*(\w+)\s*=>\s*\1\s*\)/g
      let m
      while ((m = re.exec(s))) fautifs.push(f + ' : ' + m[0])
    }
    expect(fautifs).toEqual([])
  })
})

describe('fd() : valeur non datable rendue sans caractère HTML actif', () => {
  const src = fs.readFileSync('index.html', 'utf8')
  const i = src.indexOf('function fd(iso)')
  const fd = new Function(src.slice(i, src.indexOf('\n}', i) + 2) + '\nreturn fd;')()
  it('date valide inchangée', () => {
    expect(fd('2026-10-17')).toBe(new Date('2026-10-17T00:00:00').toLocaleDateString('fr-FR'))
  })
  it('texte libre hérité conservé, sans < > " &', () => {
    expect(fd('12 mai 1980')).toBe('12 mai 1980')
    expect(fd('"><img src=x onerror=alert(1)>')).not.toMatch(/[<>"&]/)
  })
})
