import { describe, it, expect } from 'vitest';
import { renderDossierPage, renderDossierError } from '../src/dossier-page.js';

const cand = { linkId: 'abc', bienLabel: 'T2 <script>', loyer: 1100, message: 'Bonjour', status: 'open',
  dossier: { identite: { nom: 'Moreau' } }, pieces: [{ pieceId: 'p1', categorie: 'identite', filename: 'cni.pdf' }], complementNote: null };

describe('renderDossierPage', () => {
  const html = renderDossierPage({ candidature: cand, candidatToken: 'TOK.SIG' });
  it('injecte le token et le linkId côté serveur', () => {
    expect(html).toContain('window.__CAND_TOKEN__ = "TOK.SIG"');
    expect(html).toContain('window.__LINK_ID__ = "abc"');
  });
  it('embarque l\'état du dossier pour la reprise (D13) mais aucun score', () => {
    expect(html).toContain('window.__CAND__');
    expect(html.toLowerCase()).not.toContain('confiance');
    expect(html.toLowerCase()).not.toContain('score');
  });
  it('neutralise </script> dans les données injectées (anti-injection)', () => {
    // bienLabel (bailleur) : le < est échappé dans le JSON injecté
    expect(html).toContain('\\u003c');
  });

  it('neutralise une tentative de breakout via un nom de fichier candidat (donnée non fiable)', () => {
    const evil = {
      ...cand,
      pieces: [{ pieceId: 'p1', categorie: 'identite', filename: 'a</script><img src=x onerror=alert(1)>.pdf' }]
    };
    const h = renderDossierPage({ candidature: evil, candidatToken: 'T' });
    // Aucun </script> littéral issu de la donnée ne doit apparaître (pas de breakout)
    expect(h).not.toContain('</script><img');
    // La forme neutralisée doit être présente
    expect(h).toContain('\\u003c/script>\\u003cimg');
  });
  it('charge /dossier.css et /dossier.js', () => {
    expect(html).toContain('/dossier.css');
    expect(html).toContain('/dossier.js');
  });
});

describe('renderDossierError', () => {
  it('échappe le message et renvoie un HTML', () => {
    const html = renderDossierError('Lien <expiré>');
    expect(html).toContain('Lien &lt;expiré&gt;');
  });
});
