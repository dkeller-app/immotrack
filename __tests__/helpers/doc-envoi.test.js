// ENVOI DE DOCUMENTS COUPÉ (décision user 2026-08-17) — verrou anti-régression.
// L'envoi par e-mail des documents (quittance / révision IRL / décompte) ne fonctionne pas :
// tant que DOC_ENVOI_ACTIF vaut false, ces documents ne proposent QUE le téléchargement du PDF.
// Ce test échoue si quelqu'un rebranche l'envoi sans décision explicite.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8'); });

describe('Envoi de documents coupé — téléchargement seul', () => {
  it('DOC_ENVOI_ACTIF est déclaré et vaut false', () => {
    expect(html).toMatch(/const DOC_ENVOI_ACTIF = false;/);
  });

  it('_docShareOpen sort en téléchargement seul avant toute ouverture de modale', () => {
    const i = html.indexOf('async function _docShareOpen(');
    expect(i).toBeGreaterThan(0);
    const corps = html.slice(i, i + 2000);
    const iGarde = corps.indexOf('if (!DOC_ENVOI_ACTIF) return _docTelechargerSeul(');
    const iModale = corps.indexOf('_openShareModal(');
    expect(iGarde).toBeGreaterThan(0);
    expect(iGarde).toBeLessThan(iModale);
  });

  it('la fonction de téléchargement seul existe et réutilise _pdfSortie (pas de recopie)', () => {
    const i = html.indexOf('async function _docTelechargerSeul(');
    expect(i).toBeGreaterThan(0);
    expect(html.slice(i, i + 1200)).toMatch(/_pdfSortie\(/);
  });

  it("aucun bouton de document ne promet un envoi", () => {
    for (const fn of ['envoyerQuittanceParEmail', 'envoyerLettreIRLParEmail', 'envoyerDecompteParEmail',
                      '_emailDecompteFromModal', '_emailQuittancePreviewModal']) {
      const re = new RegExp(`${fn}\([^)]*\)"[^>]{0,120}>[^<]{0,40}`, 'g');
      for (const m of html.match(re) || []) {
        expect(m, `bouton ${fn} promet encore un envoi : ${m}`).not.toMatch(/Envoyer/);
      }
    }
  });

  it('la signature du bail n’est pas touchée (flux distinct conservé)', () => {
    expect(html).toMatch(/_openBailSignShareModal/);
  });
});
