import { describe, it, expect } from 'vitest';
import { docSandboxFrame, docSandboxDoc } from './doc-template.js';

/**
 * DOC-3 (AUDIT-GLOBAL) — Les documents `.pro-doc` sont rendus dans une IFRAME SANDBOXÉE.
 *
 * Le défaut : le HTML des documents (avenant, décompte de régularisation…) était injecté par
 * `innerHTML` DANS LA PAGE DE L'APP (`index.html:24276`, `:27604`). Un `<img onerror>` glissé
 * dans un champ synchronisé (nom de garant, libellé, note) s'exécutait donc dans l'origine de
 * l'application, avec accès au jeton de session et au miroir de données.
 *
 * Pourquoi une iframe et pas un échappement : le corps d'un document CONTIENT du HTML légitime
 * (tableaux, mises en forme). L'échapper globalement casserait le document. Et on n'écrit pas
 * un sanitizer maison sur un chemin de document légal — ni n'en charge un, la règle « aucun CDN
 * runtime » l'interdit. L'iframe neutralise le script QUEL QUE SOIT le contenu.
 *
 * ⚠️ `sandbox="allow-same-origin"` SANS `allow-scripts` : le script ne s'exécute pas, et le
 * parent peut mesurer la hauteur du document pour dimensionner le cadre. Ajouter `allow-scripts`
 * à cette combinaison rendrait le bac à sable inopérant (l'iframe pourrait se libérer elle-même).
 */

describe('DOC-3 — docSandboxFrame : le document est isolé, pas assaini', () => {
  it('rend un document complet et autonome, CSS embarquée', () => {
    const html = docSandboxFrame({ corps: '<div class="pro-doc">Bail</div>', css: '.pro-doc{color:red}' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('.pro-doc{color:red}');
    expect(html).toContain('Bail');
  });

  it('le bac à sable est actif et n\'autorise JAMAIS les scripts', () => {
    const html = docSandboxFrame({ corps: '<p>x</p>', css: '' });
    expect(html).toMatch(/<iframe[^>]*\ssandbox="/);
    expect(html).not.toContain('allow-scripts');
  });

  it('refuse allow-scripts même si un appelant le demande', () => {
    const html = docSandboxFrame({ corps: '<p>x</p>', css: '', sandbox: 'allow-scripts allow-same-origin' });
    expect(html).not.toContain('allow-scripts');
  });

  it('un guillemet dans le document ne casse pas l\'attribut srcdoc', () => {
    const html = docSandboxFrame({ corps: '<p title="a">b</p>', css: '' });
    const srcdoc = html.match(/srcdoc="([^"]*)"/);
    expect(srcdoc).not.toBeNull();            // l'attribut est resté d'un seul tenant
    expect(srcdoc[1]).toContain('&quot;');    // le guillemet a été neutralisé
  });

  it('une tentative d\'évasion d\'attribut est neutralisée, pas exécutée', () => {
    // Le payload exact de l'audit : fermer l'attribut puis la balise pour poser un handler.
    const payload = '"><img src=x onerror="alert(1)">';
    const html = docSandboxFrame({ corps: '<p>' + payload + '</p>', css: '' });
    // Le payload reste PRÉSENT — on isole, on n'assainit pas. Ce qui compte est qu'il ne puisse
    // pas créer de frontière d'attribut : aucun guillemet BRUT dans la valeur de srcdoc.
    const valeur = html.match(/srcdoc="([\s\S]*)"><\/iframe>$/);
    expect(valeur).not.toBeNull();
    expect(valeur[1]).not.toContain('"');
    expect(html.match(/srcdoc="/g)).toHaveLength(1);
    // Et le `onerror` n'existe que dans la valeur, jamais comme attribut du markup parent.
    expect(html.slice(0, html.indexOf('srcdoc="'))).not.toContain('onerror');
  });

  it('les esperluettes sont encodées AVANT les guillemets (sinon double encodage)', () => {
    const html = docSandboxFrame({ corps: '<p>Dupont &amp; Fils</p>', css: '' });
    expect(html).toContain('&amp;amp;');      // le & de `&amp;` est lui-même encodé une fois
    expect(html).not.toContain('&amp;amp;amp;');
  });

  it('sans corps ni CSS, rend un cadre valide plutôt qu\'une exception', () => {
    expect(() => docSandboxFrame()).not.toThrow();
    expect(docSandboxFrame()).toMatch(/<iframe[^>]*srcdoc="/);
  });

  it('accepte une classe et un titre accessible pour le cadre', () => {
    const html = docSandboxFrame({ corps: '<p>x</p>', css: '', className: 'doc-frame', title: 'Aperçu du document' });
    expect(html).toContain('class="doc-frame"');
    expect(html).toContain('title="Aperçu du document"');
  });
});

describe('DOC-3 — docSandboxDoc : le document seul, pour recharger sans recréer le cadre', () => {
  it('rend un document autonome, sans markup d\'iframe', () => {
    const d = docSandboxDoc({ corps: '<p>Bail</p>', css: '.pro-doc{color:red}' });
    expect(d).toContain('<!DOCTYPE html>');
    expect(d).toContain('.pro-doc{color:red}');
    expect(d).toContain('<p>Bail</p>');
    expect(d).not.toContain('<iframe');
  });

  it('neutralise la marge par défaut du corps (le cadre ne doit pas décaler le document)', () => {
    expect(docSandboxDoc({ corps: '', css: '' })).toContain('body{margin:0}');
  });

  it('le document n\'est PAS échappé — il sera posé via la propriété srcdoc, pas l\'attribut', () => {
    const d = docSandboxDoc({ corps: '<p title="a">b</p>', css: '' });
    expect(d).toContain('title="a"');     // tel quel
    expect(d).not.toContain('&quot;');
  });

  it('docSandboxFrame construit le MÊME document, mais échappé pour l\'attribut', () => {
    const o = { corps: '<p title="a">b</p>', css: '' };
    const attendu = docSandboxDoc(o).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    expect(docSandboxFrame(o)).toContain('srcdoc="' + attendu + '"');
  });

  it('sans argument, ne jette pas', () => {
    expect(() => docSandboxDoc()).not.toThrow();
  });
});
