/**
 * CONTRAT-TYPE-2026-10 — le bail rendu par le monolithe suit le contrat type issu du décret
 * n° 2026-596 (textes dans js/core/contrat-type.js), sans jamais réécrire un bail signé avant.
 * Même approche que bail-clauses-source.test.js : on lit la source.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html, mainJs;
beforeAll(() => {
  html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, '');
  mainJs = readFileSync(resolve(repoRoot, 'js/main.js'), 'utf8').replace(/\r/g, '');
});

function templateDefaut(src) {
  const m = /BAIL_TEMPLATE_DEFAULT\s*=\s*`/.exec(src);
  if (!m) return null;
  const a = m.index + m[0].length - 1;
  const b = src.indexOf('`', a + 1);
  return b === -1 ? null : src.slice(a + 1, b);
}
function corps(src, signature) {
  const a = src.indexOf(signature);
  if (a === -1) return null;
  const b = src.indexOf('\nfunction ', a + signature.length);
  return src.slice(a, b === -1 ? undefined : b);
}

describe('le module est chargé et sert de source unique', () => {
  it('main.js expose window.ContratType', () => {
    expect(mainJs).toContain("import * as ContratType from './core/contrat-type.js';");
    expect(mainJs).toContain('window.ContratType = ContratType;');
  });
  it('_bailClauseVersion délègue au module', () => {
    const f = corps(html, 'function _bailClauseVersion(b){');
    expect(f).toBeTruthy();
    expect(f).toContain('CT.versionClausesBail(b)');
  });
});

describe('PDF (buildBailStructure) — textes du décret, signés d\'avant intacts', () => {
  let f;
  beforeAll(() => { f = corps(html, 'function buildBailStructure(bail, log, ref, ent, locs) {'); });
  it('chaque passage versionné lit le module et garde l\'ancien texte en repli', () => {
    expect(f).toContain('_ct26 ? CT.LIBELLE_SURFACE : \'Surface habitable (loi Carrez)\'');
    expect(f).toContain('CT.rappelDecence(isFurnished)');
    expect(f).toContain('CT.SERVITUDE_RESIDENCE_PRINCIPALE');
    expect(f).toContain('CT.CLAUSE_RESOLUTOIRE_TEXTE');
    expect(f).toContain('CT.autresMotifsResolutoires(_servitudeRP)');
    expect(f).toContain('CT.texteDepensesEnergie(');
    expect(f).toContain('CT.textePrecedentLocataire(');
    expect(f).toContain('CT.lignesZoneTendue(');
    expect(f).toContain('CT.libelleAnnexeEtatDesLieux(isFurnished)');
    expect(f).toContain("_ct26 ? CT.STATUT_AUTORISATION_PREALABLE : 'N/A — non applicable'");
  });
  it('aucune clause du décret recollée en dur (le texte vit dans le module)', () => {
    expect(f).not.toContain('Le contrat de location est résilié de plein droit pour défaut de paiement');
    expect(f).not.toContain('Servitude de résidence principale : le logement');
  });
});

describe('Word (BAIL_TEMPLATE_DEFAULT + genBailHTML)', () => {
  it('le modèle par défaut porte les jetons, plus les passages d\'avant le décret', () => {
    const t = templateDefaut(html);
    expect(t, 'BAIL_TEMPLATE_DEFAULT introuvable').toBeTruthy();
    for (const k of ['SURFACE_LIBELLE', 'NIVEAU_PERFORMANCE_ROW', 'RAPPEL_DECENCE', 'DEPENSES_ENERGIE_PHRASE', 'CLAUSE_RESOLUTOIRE_MOTIFS', 'STATUT_AUTORISATION_PREALABLE']) {
      expect(t).toContain('{{' + k + '}}');
    }
    expect(t).not.toContain('Surface habitable (loi Carrez)');
    expect(t).not.toContain('N/A — non applicable');
    expect(t).not.toContain('Rappel (loi Climat et Résilience)');
  });
  it('un modèle ENREGISTRÉ resté tel quel remonte vers les jetons au rendu', () => {
    const f = corps(html, 'function genBailHTML(');
    expect(f).toContain(".replace('>Surface habitable (loi Carrez)</td>', '>{{SURFACE_LIBELLE}}</td>')");
    expect(f).toContain(".replace(_BAIL_TMPL_2025.rappel, '{{RAPPEL_DECENCE}}')");
    expect(f).toContain(".replace(_BAIL_TMPL_2025.resolutoire, '{{CLAUSE_RESOLUTOIRE_MOTIFS}}')");
    expect(f).toContain("'<td>N/A — non applicable</td>', '<td>{{STATUT_AUTORISATION_PREALABLE}}</td>'");
    // bail signé avant : le jeton rend EXACTEMENT l'ancien passage
    expect(f).toContain(': _BAIL_TMPL_2025.resolutoire,');
    expect(f).toContain(': _BAIL_TMPL_2025.rappel,');
  });
});

describe('saisie — les nouvelles données sont lues ET enregistrées', () => {
  it('fiche du bien : case servitude chargée, remise à zéro, enregistrée', () => {
    expect(html).toContain('id="log-servitudeRP"');
    expect(html).toContain("setChk('log-servitudeRP', !!log.servitudeRP);");
    expect(html).toContain("log.servitudeRP = !!(el('log-servitudeRP') && el('log-servitudeRP').checked);");
  });
  it('DPE : année de référence des prix saisie et projetée dans log.dpe (figé au snapshot)', () => {
    expect(html).toContain("_logDiagSetField('dpe','anneePrix',this.value)");
    expect(html).toContain("log.dpe.anneePrix       = dpe.anneePrix       || '';");
    expect(html).toContain("dpeAnneePrix: (src.dpe && src.dpe.anneePrix) || '',");
  });
  it('bail : loyer de référence + dates du dernier loyer — formulaire, chargement, enregistrement, surlignage', () => {
    for (const id of ['b-loyerRef', 'b-precedentLoyerDateVers', 'b-precedentLoyerDateRev']) {
      expect(html).toContain('id="' + id + '"');
      expect(html).toContain("['" + id + "',");
    }
    expect(html).toContain("loyerRef: pf('b-loyerRef'),");
    expect(html).toContain("precedentLoyerDateVers: v('b-precedentLoyerDateVers'), precedentLoyerDateRev: v('b-precedentLoyerDateRev'),");
  });
});

describe('immutabilité — la version rendue d\'un bail signé est celle GRAVÉE à la signature', () => {
  it('« Voir bail signé » et le surlignage des modifications relisent bail.clauseIrlV', () => {
    expect(html).toContain('Object.assign({}, bail.signatures.bailSnapshot, { signatures: bail.signatures, clauseIrlV: bail.clauseIrlV })');
    expect(html).toContain('Object.assign({}, snapBail, { signatures: bail.signatures, clauseIrlV: bail.clauseIrlV })');
  });
  it('les 3 relais de la signature à distance acceptent la version 3', () => {
    expect(html).toContain('clauseIrlV: _bailClauseVersionNorm(clauseIrlV)');
    expect(html).toContain('clauseIrlV: _bailClauseVersionNorm(staging && staging.clauseIrlV)');
    expect(html).toContain('bail.clauseIrlV = _bailClauseVersionNorm(rs && rs.clauseIrlV);');
    expect(html).not.toMatch(/clauseIrlV === 2 \? 2 : 1;\s*\n\s*bail\.signatures = Object\.assign/);
  });
  it('aucun rabattement 3 → 1, même dans les replis sans module (audit 🟠1)', () => {
    expect(html).not.toMatch(/=== 2 \? 2 : 1/);
  });
});

describe('Word — pas de ligne ajoutée pour un bail signé d\'avant', () => {
  it('le jeton de la ligne « niveau de performance » est collé à la ligne précédente', () => {
    expect(templateDefaut(html)).toContain('<td>{{TECH_INFO}}</td></tr>{{NIVEAU_PERFORMANCE_ROW}}\n</table>');
  });
});
