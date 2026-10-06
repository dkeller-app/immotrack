// B3 (RETOURS-2026-10-05) — garde-fous statiques du nom d'affichage `log.libelle` (BAIL-EN-COURS-NOM-AFFICHAGE §5.2).
// Règle d'or : le libellé est un TEXTE D'ÉCRAN, jamais une donnée. Il n'entre dans aucun document remis à un tiers,
// aucune clé, aucun attribut value/data-/onclick, ni dans le snapshot ou l'empreinte d'un bail signé.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAMPS_BAIL } from '../../js/core/bail-modifications.js'
import { bailLegalContent } from '../../js/core/bail-content-hash.js'
import { mapToRow } from '../../js/core/store-mapping.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const lire = (p) => readFileSync(resolve(root, p), 'utf8')
const P1 = lire('js/app/app-part1.js'), P2 = lire('js/app/app-part2.js'), P3 = lire('js/app/app-part3.js')

function extraire(src, nom) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + nom + '\\s*\\(').exec(src)
  if (!m) return null
  let j = src.indexOf('{', src.indexOf(')', m.index)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(m.index, k + 1)
  }
  return null
}
const corps = (nom) => extraire(P1, nom) || extraire(P2, nom)

const DOCUMENTS = ['genBailHTML', 'buildBailStructure', 'previewBailDataV2', 'exportBailWord', 'buildReprisBail',
  '_avenantDocPageHtml', '_congeDocHtml', '_buildQuittanceHtml', '_buildRelanceHtml', '_buildIRLLetterHtml', 'genIRLLetter',
  '_buildDecompteHtml', '_rgOpenDecompteEstimatif', 'generateEDLPdfNative', 'downloadEDLPdfNative', 'genActeCautionnementDoc',
  '_buildDdtRecapHTML', '_ddtRecapPDF', '_docPage', '_fin2044PrevisuHtml', '_edlSharePhotos']
// Un `libelle` lu sur un LOGEMENT (log/lg/bien/lot) est interdit ; les autres `.libelle` (lignes d'une relance,
// `CT.libelleAnnexe…`) ne sont pas le nom du logement.
const LIBELLE_LOGEMENT = /\b(?:log|lg|logement|bien|lot)\.libelle\b(?!\s*:)/
const INTERDIT = [/_logLabel/, /LogLabel\b/, /_logNomRepli/]

describe('aucun document n\'utilise le nom d\'affichage', () => {
  for (const nom of DOCUMENTS) {
    it(`${nom} : ni _logLabel / LogLabel, ni libelle d'un logement`, () => {
      const c = corps(nom)
      expect(c, 'fonction introuvable : ' + nom).toBeTruthy()
      for (const re of INTERDIT) expect(re.test(c), `${nom} contient ${re}`).toBe(false)
      expect(LIBELLE_LOGEMENT.test(c), `${nom} lit un libelle de logement`).toBe(false)
    })
  }
  for (const f of ['js/core/email-pdf-attachment.js', 'js/core/avenant.js', 'js/core/conge.js', 'js/core/legal-2044.js',
    'js/core/legal-bilan.js', 'js/helpers/doc-template.global.js']) {
    it(`${f} : aucune référence au nom d'affichage`, () => {
      const c = lire(f)
      for (const re of INTERDIT) expect(re.test(c), `${f} contient ${re}`).toBe(false)
      expect(LIBELLE_LOGEMENT.test(c)).toBe(false)
    })
  }
})

describe('bail signé imperméable au libellé', () => {
  it('CHAMPS_BAIL n\'a pas de clé libelle (aucune entrée dans baux_evenements)', () => {
    expect(Object.keys(CHAMPS_BAIL)).not.toContain('libelle')
    expect(JSON.stringify(CHAMPS_BAIL)).not.toMatch(/libelle/i)
  })
  it('_captureBailSnapshot (liste blanche du snapshot figé) ne contient pas libelle', () => {
    const c = extraire(P2, '_captureBailSnapshot')
    expect(c).toBeTruthy()
    expect(c).not.toMatch(/libelle/i)
  })
  it('la capture de la fenêtre de signature ne copie pas le libellé', () => {
    const i = P1.indexOf("'var bailSnapshot=null;'")
    expect(i).toBeGreaterThan(0)
    expect(P1.slice(i, i + 2500)).not.toMatch(/libelle/i)
  })
  it('_syncLogToBail ne recopie pas le libellé', () => {
    const c = extraire(P2, '_syncLogToBail')
    expect(c).toBeTruthy()
    expect(c).not.toMatch(/libelle/i)
  })
  it('bailLegalContent : même contenu légal, que le logement ait un libellé ou non', () => {
    const bail = { hc: 500, ch: 50, debut: '2026-01-01', locataires: [{ nom: 'A' }], signatures: { signedAt: '2026-01-01T10:00:00Z', bailSnapshot: { adr: '1 rue X' } } }
    const a = JSON.stringify(bailLegalContent(bail))
    const logAvec = { ref: 'D-101', libelle: 'Studio RDC' }   // le bail ne porte jamais le logement
    const b = JSON.stringify(bailLegalContent({ ...bail }))
    expect(a).toBe(b)
    expect(a).not.toContain(logAvec.libelle)
  })
})

describe('jamais le libellé dans un attribut ou une clé', () => {
  const sources = { 'app-part1.js': P1, 'app-part2.js': P2, 'app-part3.js': P3 }
  for (const [nom, src] of Object.entries(sources)) {
    const lignes = src.split(/\r?\n/)
    it(`${nom} : _logLabel( absent de value=", data-, onclick=, _lyQ(_logLabel`, () => {
      const fautes = []
      lignes.forEach((l, i) => {
        if (!/_logLabel(Ref)?\(/.test(l)) return
        if (/_lyQ\(\s*_logLabel/.test(l)) fautes.push(i + 1)
        else if (/(?:value|data-[a-z-]+)\s*=\s*(?:\\?")[^"]*\$\{[^}]*_logLabel(Ref)?\(/.test(l)) fautes.push(i + 1)
        else if (/(?:value|data-[a-z-]+)\s*=\s*(?:\\?")'?\s*\+\s*[^+"]*_logLabel(Ref)?\(/.test(l)) fautes.push(i + 1)
        else if (/onclick\s*=\s*(?:\\?")[^"]*(?:\$\{[^}]*_logLabel(Ref)?\(|'\s*\+\s*[^+"]*_logLabel(Ref)?\()/.test(l)) fautes.push(i + 1)
        else if (/dataset\.[a-z]+\s*=\s*[^;]*_logLabel(Ref)?\(/.test(l)) fautes.push(i + 1)
        else if (/\.value\s*=\s*[^;=]*_logLabel(Ref)?\(/.test(l)) fautes.push(i + 1)
      })
      expect(fautes, 'lignes en faute : ' + fautes.join(', ')).toEqual([])
    })
  }
  it('les <option> gardent la référence en value (jamais le nom)', () => {
    const fautes = []
    ;[P1, P2].forEach((src) => src.split(/\r?\n/).forEach((l, i) => {
      if (/<option value="\$\{[^}]*_logLabel/.test(l)) fautes.push(i + 1)
    }))
    expect(fautes).toEqual([])
  })
  it('fillSel échappe le texte ET la valeur (le libellé accepte tout caractère)', () => {
    const c = extraire(P1, 'fillSel')
    expect(c).toMatch(/escHtml\(labFn\(it\)\)/)
    expect(c).toMatch(/escHtml\(valFn\(it\)\)/)
  })
})

describe('synchro cloud : le libellé voyage dans legacy_raw, sans colonne typée', () => {
  const ctx = {
    espaceId: 'e1', ownerId: 'u1', detUuid: (k, v) => k + ':' + v,
    entiteByNom: new Map([['sci demo', 'ent1']]), immeubleByNom: new Map(), logementByRef: new Map(),
  }
  it('mapToRow(logements) : legacy_raw.libelle = valeur, aucune colonne libelle', () => {
    const row = mapToRow('logements', { ref: 'D-101', entity: 'SCI DEMO', libelle: 'Studio RDC' }, ctx)
    expect(row).toBeTruthy()
    expect(row.legacy_raw.libelle).toBe('Studio RDC')
    expect(Object.keys(row)).not.toContain('libelle')
  })
})
