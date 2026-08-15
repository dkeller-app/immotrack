// BIENS — les SURFACES (étapes 8, 9, 10) : fiche logement 360, fiche immeuble, fiche bailleur.
//
// POURQUOI CE FICHIER EXISTE (audit code-reviewer, constat I6). Les trois étapes de surface ont
// été livrées SANS AUCUN TEST — et c'est exactement ce qui a laissé passer le défaut C1 jusqu'en
// production (v15.510) : un commentaire de bloc `${/* … */''}` ouvert sur une ligne et refermé sur
// la suivante avale tout ce qui se trouve entre les deux DANS un littéral de gabarit. Le fichier
// restait syntaxiquement valide (check-inline-js passait), la suite Vitest ne touchait pas au
// rendu, et les 4 KPI du hero immeuble + le bouton « ＋ Ajouter un bien » — seul point d'entrée du
// fil rouge depuis un immeuble non vide — avaient purement disparu de l'écran.
//
// Deux filets, donc :
//   1. un GARDE-FOU GÉNÉRIQUE contre le motif `${/*` non refermé sur sa ligne (il aurait attrapé C1
//      à l'écriture, sans même exécuter le rendu) ;
//   2. l'ÉVALUATION RÉELLE du gabarit de `rImmFiche` avec ses dépendances stubées, qui vérifie que
//      le hero produit bien ses KPI et ses boutons.
//
// Modèle : __tests__/helpers/biens-migration.test.js (extraction depuis index.html + assertions sur
// la source), poussé un cran plus loin puisqu'on exécute ici le gabarit.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;

beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8'); });

// ════════════════════════════════════════════════════════════════════════════
// 1. GARDE-FOU — le motif qui a produit C1
// ════════════════════════════════════════════════════════════════════════════
describe('garde-fou — commentaire `${/* … */\'\'}` refermé sur sa ligne', () => {
  it('aucun `${/*` ne reste ouvert en fin de ligne', () => {
    // Un `${/* commentaire */''}` est un idiome pratique pour annoter l'intérieur d'un littéral de
    // gabarit. Mais s'il n'est pas refermé sur la MÊME ligne, tout ce qui suit — jusqu'au `*/` —
    // devient du commentaire : boutons, KPI, sections entières disparaissent SILENCIEUSEMENT.
    // C'est ce qui est arrivé à index.html:40262 en v15.510.
    const fautifs = [];
    html.split('\r\n').forEach((ligne, i) => {
      let depuis = 0;
      for (;;) {
        const o = ligne.indexOf('${/*', depuis);
        if (o < 0) break;
        if (ligne.indexOf('*/', o) < 0) fautifs.push((i + 1) + ' : ' + ligne.trim().slice(0, 120));
        depuis = o + 4;
      }
    });
    expect(fautifs, 'commentaire de gabarit non refermé sur sa ligne :\n' + fautifs.join('\n')).toEqual([]);
  });

  it('tout `${/*` se termine bien par `*/\'\'}` (et non par un `*/` orphelin qui laisserait une expression vide)', () => {
    const fautifs = [];
    html.split('\r\n').forEach((ligne, i) => {
      let depuis = 0;
      for (;;) {
        const o = ligne.indexOf('${/*', depuis);
        if (o < 0) break;
        const f = ligne.indexOf('*/', o);
        if (f >= 0 && !/^\s*''\s*\}/.test(ligne.slice(f + 2))) {
          fautifs.push((i + 1) + ' : ' + ligne.trim().slice(0, 120));
        }
        depuis = o + 4;
      }
    });
    expect(fautifs, 'attendu `*/\'\'}` :\n' + fautifs.join('\n')).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. ÉVALUATION RÉELLE du gabarit de rImmFiche (le rendu que C1 avait vidé)
// ════════════════════════════════════════════════════════════════════════════
/** Extrait le littéral de gabarit affecté à `wrap.innerHTML` dans une fonction d'index.html. */
function extraitGabarit(src, nomFonction) {
  const debut = src.indexOf('function ' + nomFonction + '(');
  if (debut < 0) return null;
  // fin du littéral : le backtick de fermeture suivi de `;` puis de l'accolade de la fonction.
  const fin = src.indexOf('`;\r\n}', debut);
  if (fin < 0) return null;
  // rImmFiche affecte wrap.innerHTML DEUX fois (l'état « aucun immeuble », puis le rendu complet) :
  // on veut la DERNIÈRE affectation avant la fin de la fonction.
  let i = -1, k = debut;
  for (;;) { const n = src.indexOf('wrap.innerHTML = `', k); if (n < 0 || n > fin) break; i = n; k = n + 1; }
  if (i < 0) return null;
  return src.slice(i + 'wrap.innerHTML = '.length, fin + 1);
}

describe('rImmFiche — le hero rend bien ses KPI et ses boutons (régression C1)', () => {
  let rendu;

  beforeAll(() => {
    const gabarit = extraitGabarit(html, 'rImmFiche');
    expect(gabarit, 'gabarit de rImmFiche introuvable').toBeTruthy();

    // ── Dépendances stubées : on ne teste pas leur contenu, seulement que le gabarit les appelle
    //    et que RIEN ne disparaît du rendu.
    const noop = () => '';
    const ctx = {
      ent: { id: 1, nom: 'SCI DD FREYMING', immeubles: [{ id: 11, nom: 'FERRETTE' }] },
      im: { id: 11, nom: 'FERRETTE', adr: '14 rue de Ferrette', annee: 1968, regimeJuridique: 'Copropriété', nbLots: 5 },
      immId: 11, immIdx: 0,
      entNomEsc: 'SCI DD FREYMING', immNomEsc: 'FERRETTE',
      adrLine: '<div class="logf-adr">14 rue de Ferrette · construit en 1968</div>',
      nbLogs: 5, nbCompteCharges: 4, occupes: 4, vacance: 1, vacancePct: 20, occupCls: '', loyerHC: 2840,
      activeLogs: [{ ref: 'FERRETTE-001' }], archivedLogs: [],
      _currentImmFicheTab: 'logements', _immVueFrise: false,
      // helpers
      escHtml: (x) => String(x == null ? '' : x),
      fmt: (n) => String(n) + ' €',
      fmtN: (n) => String(n),
      _frAttr: (x) => String(x),
      _renderOccupationDonut: () => '<svg class="immf-donut-svg"></svg>',
      _renderFichePastilles: () => '<div class="fiche-pastilles"></div>',
      _renderImmBatiPastille: noop,
      _attCount: () => 0,
      _renderAttachmentSection: noop,
      _renderImmFichePanelCharges: () => '<div class="cc-grid"></div>',
      _renderImmFichePlanGantt: () => '<div class="immf-gantt"></div>',
      _renderLogementCardFlat: () => '<article class="bien-card"></article>',
      _coverImg: () => '<span aria-hidden="true">IC</span>',
      _immFicheNewLog: noop
    };
    const noms = Object.keys(ctx);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...noms, 'return ' + gabarit + ';');
    rendu = fn(...noms.map(n => ctx[n]));
  });

  it('les 4 KPI du hero sont présents (C1 les avait avalés)', () => {
    expect(rendu).toContain('logf-hero-stats');
    expect(rendu).toContain('Logement');
    expect(rendu).toContain('Loué');
    expect(rendu).toContain('Vacance');
    expect(rendu).toContain('Loyer HC /mois');
    expect((rendu.match(/logf-stat"/g) || []).length, '4 tuiles de KPI attendues').toBe(4);
  });

  it('la barre d\'actions et le bouton d\'ajout sont présents (seul point d\'entrée du fil rouge)', () => {
    expect(rendu).toContain('logf-actions');
    expect(rendu).toContain("_frStartCtx('log'");
    expect(rendu).toContain('Ajouter un bien');
    expect(rendu).toContain("editImm(0,1)");
  });

  it('le doublon « Voir le bailleur » a bien disparu, le bouton retour reste', () => {
    // le BOUTON part ; le badge du bailleur, lui, reste cliquable (son title dit « Voir le bailleur »)
    expect(rendu).not.toMatch(/<button[^>]*>[^<]*Voir le bailleur/);
    expect(rendu).toContain('logf-back');
    expect(rendu).toContain('openEntFiche(1)');
  });

  it('2 onglets seulement, et l\'onglet grisé « À venir » a disparu', () => {
    expect((rendu.match(/logf-subtab/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(rendu).toContain("setImmFicheTab('logements')");
    expect(rendu).toContain("setImmFicheTab('charges')");
    expect(rendu).not.toContain("setImmFicheTab('plan')");
    expect(rendu).not.toContain("setImmFicheTab('assurances')");
    expect(rendu).not.toContain('class="soon"');   // le marqueur des onglets grisés
    expect(rendu).not.toMatch(/logf-subtab disabled/);
  });

  it('l\'entête porte les pastilles et le toggle Liste ⇄ Frise est rendu', () => {
    expect(rendu).toContain('fiche-pastilles');
    expect(rendu).toContain('immf-vue-toggle');
    expect(rendu).toContain('_setImmVue(true)');
    expect(rendu).toContain('_setImmVue(false)');
  });

  it('vue Liste : les bulles ; vue Frise : le rendu du plan d\'occupation (DRY, pas de réécriture)', () => {
    const gabarit = extraitGabarit(html, 'rImmFiche');
    const rendre = (over) => {
      const ctx = Object.assign({
        ent: { id: 1, nom: 'E', immeubles: [{ id: 11, nom: 'I' }] },
        im: { id: 11, nom: 'I' }, immId: 11, immIdx: 0,
        entNomEsc: 'E', immNomEsc: 'I', adrLine: '',
        nbLogs: 5, nbCompteCharges: 4, occupes: 4, vacance: 1, vacancePct: 20, occupCls: '', loyerHC: 0,
        activeLogs: [{ ref: 'A' }], archivedLogs: [],
        _currentImmFicheTab: 'logements', _immVueFrise: false,
        escHtml: (x) => String(x == null ? '' : x), fmt: String, fmtN: String, _frAttr: String,
        _renderOccupationDonut: () => '', _renderFichePastilles: () => '',
        _renderImmBatiPastille: () => '', _attCount: () => 0, _renderAttachmentSection: () => '',
        _renderImmFichePanelCharges: () => '<div class="cc-grid"></div>',
        _renderImmFichePlanGantt: () => '<div class="immf-gantt"></div>',
        _renderLogementCardFlat: () => '<article class="bien-card"></article>',
        _coverImg: () => '<span aria-hidden="true">IC</span>',
      _coverImg: () => '<span aria-hidden="true">IC</span>',
        _immFicheNewLog: () => ''
      }, over);
      const noms = Object.keys(ctx);
      // eslint-disable-next-line no-new-func
      return new Function(...noms, 'return ' + gabarit + ';')(...noms.map(n => ctx[n]));
    };
    expect(rendre({ _immVueFrise: false })).toContain('bien-card');
    expect(rendre({ _immVueFrise: false })).not.toContain('immf-gantt');
    expect(rendre({ _immVueFrise: true })).toContain('immf-gantt');
    expect(rendre({ _currentImmFicheTab: 'charges' })).toContain('cc-grid');
    // état vide : le bouton de création directe SUBSISTE (seul endroit où il a du sens)
    const vide = rendre({ nbLogs: 0, activeLogs: [] });
    expect(vide).toContain('biens-empty');
    expect(vide).toContain('_immFicheNewLog');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Les 4 SETTERS d'onglets + leurs redirections (aucun test jusqu'ici)
// ════════════════════════════════════════════════════════════════════════════
/** Extrait une fonction top-level (déclarée colonne 0, fermée par `}` colonne 0). */
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) return null;
  const end = src.indexOf('\n}', start);
  if (end === -1) return null;
  return src.slice(start, end + 2).replace(/\r/g, '');
}

/** Exécute un setter avec ses dépendances stubées et rend l'état observé. */
function jouerSetter(nom, valeur, stubs) {
  const src = extractFn(html, nom);
  expect(src, nom + ' introuvable').toBeTruthy();
  const ctx = Object.assign({
    rLogFiche: () => {}, rImmFiche: () => {}, rEntFiche: () => {},
    openLogModalOnTab: () => {}, openImmFiche: () => {},
    DB: { logements: [], entites: [] },
    _currentLogFicheRef: null, _currentImmFiche: null, _currentEntFiche: null,
    _fichePastilles: {}, _immCompteursRef: '', _immVueFrise: false,
    _setImmCompteursRef: () => {},
    _currentLogFicheTab: '?', _currentImmFicheTab: '?', _currentEntFicheTab: '?'
  }, stubs || {});
  const noms = Object.keys(ctx);
  const corps = 'let _currentLogFicheTab = arguments0, _currentImmFicheTab = arguments1, _currentEntFicheTab = arguments2;';
  // eslint-disable-next-line no-new-func
  const fn = new Function(...noms, `
    let __log = _currentLogFicheTab, __imm = _currentImmFicheTab, __ent = _currentEntFicheTab;
    let _immVueFriseLocal = _immVueFrise, _immCompteursRefLocal = _immCompteursRef;
    Object.defineProperty(globalThis, '__nop', { value: 1, configurable: true });
    ${src.replace(/_currentLogFicheTab = /g, '__log = ')
         .replace(/_currentImmFicheTab = /g, '__imm = ')
         .replace(/_currentEntFicheTab = /g, '__ent = ')
         .replace(/_immVueFrise = /g, '_immVueFriseLocal = ')
         .replace(/_immCompteursRef = /g, '_immCompteursRefLocal = ')}
    ${nom}(${JSON.stringify(valeur)});
    return { log: __log, imm: __imm, ent: __ent, frise: _immVueFriseLocal, compteursRef: _immCompteursRefLocal, pastilles: _fichePastilles };
  `);
  return fn(...noms.map(n => ctx[n]));
}

describe('setLogModalTab — modale logement : 3 onglets + redirections (P1-4)', () => {
  const src = () => extractFn(html, 'setLogModalTab');
  it('la whitelist est bien réduite à 3', () => {
    expect(src()).toContain("const ids = ['ident','diag','equip'];");
  });
  it("'desc' est redirigé vers Équipements et 'presentation' vers Identité", () => {
    expect(src()).toContain("if(tab === 'desc') tab = 'equip';");
    expect(src()).toContain("if(tab === 'presentation') tab = 'ident';");
  });
  it('les redirections sont posées AVANT le test de whitelist (sinon elles ne servent à rien)', () => {
    const s = src();
    expect(s.indexOf("tab = 'equip'")).toBeLessThan(s.indexOf("ids.includes(tab)"));
    expect(s.indexOf("tab = 'ident'")).toBeLessThan(s.indexOf("ids.includes(tab)"));
  });
});

describe('setLogFicheTab — fiche logement : 4 onglets + 5 redirections (P1-4)', () => {
  const cas = [
    ['general', 'bail'], ['edl', 'bail'], ['photos', 'documents'], ['agenda', 'bail'],
    ['bail', 'bail'], ['conformite', 'conformite'], ['documents', 'documents'], ['compta', 'compta']
  ];
  cas.forEach(([entree, attendu]) => {
    it(`'${entree}' → '${attendu}'`, () => {
      expect(jouerSetter('setLogFicheTab', entree, { _currentLogFicheTab: '?' }).log).toBe(attendu);
    });
  });

  it('un onglet inconnu ne change rien (whitelist fail-closed)', () => {
    expect(jouerSetter('setLogFicheTab', 'nimporte-quoi', { _currentLogFicheTab: 'bail' }).log).toBe('bail');
  });

  it("'compteurs' ouvre la fiche de l'immeuble PARENT sur Charges communes, logement présélectionné (P1-7)", () => {
    let ouvert = null;
    const r = jouerSetter('setLogFicheTab', 'compteurs', {
      _currentLogFicheRef: 'F-001',
      DB: {
        logements: [{ ref: 'F-001', entity: 'SCI X', imm: 'IMM A' }],
        entites: [{ id: 7, nom: 'SCI X', immeubles: [{ id: 71, nom: 'IMM A' }] }]
      },
      openImmFiche: (e, i) => { ouvert = [e, i]; },
      _currentImmFicheTab: '?'
    });
    expect(ouvert).toEqual([7, 71]);
    expect(r.imm).toBe('charges');
    expect(r.compteursRef).toBe('F-001');
  });

  it("'compteurs' sans immeuble parent retombe sur Bail (un logement autonome n'a pas la fonction)", () => {
    const r = jouerSetter('setLogFicheTab', 'compteurs', {
      _currentLogFicheRef: 'F-002',
      DB: { logements: [{ ref: 'F-002', entity: 'SCI X' }], entites: [{ id: 7, nom: 'SCI X', immeubles: [] }] },
      _currentLogFicheTab: '?'
    });
    expect(r.log).toBe('bail');
  });

  it("'diagnostics' ouvre la modale sur l'onglet Diagnostics, et retombe sur Bail sans ref", () => {
    let ouvert = null;
    jouerSetter('setLogFicheTab', 'diagnostics', {
      _currentLogFicheRef: 'F-001', openLogModalOnTab: (r, t) => { ouvert = [r, t]; }
    });
    expect(ouvert).toEqual(['F-001', 'diag']);
    expect(jouerSetter('setLogFicheTab', 'diagnostics', { _currentLogFicheRef: null, openLogModalOnTab: null }).log).toBe('bail');
  });

  it("l'onglet par défaut est 'bail', pas 'general' (P0-3 : c'était AUSSI le fallback du ternaire)", () => {
    expect(html).toContain("let _currentLogFicheTab = 'bail';");
    expect(html).not.toContain("let _currentLogFicheTab = 'general';");
    expect(html).toContain(': _renderLogFichePanelBail(log, bail, ref)');
  });
});

describe('setImmFicheTab — fiche immeuble : 2 onglets + redirections', () => {
  [['logements', 'logements'], ['charges', 'charges']].forEach(([e, a]) => {
    it(`'${e}' → '${a}'`, () => expect(jouerSetter('setImmFicheTab', e, { _currentImmFicheTab: '?' }).imm).toBe(a));
  });

  it("'plan' bascule sur Logements EN VUE FRISE (le plan d'occupation n'est pas perdu)", () => {
    const r = jouerSetter('setImmFicheTab', 'plan', { _currentImmFicheTab: '?', _immVueFrise: false });
    expect(r.imm).toBe('logements');
    expect(r.frise).toBe(true);
  });

  it("'documents' et 'assurances' basculent sur Logements en dépliant la pastille Documents", () => {
    ['documents', 'assurances'].forEach(t => {
      const r = jouerSetter('setImmFicheTab', t, { _currentImmFicheTab: '?', _currentImmFiche: { entId: 1, immId: 11 } });
      expect(r.imm).toBe('logements');
      expect(r.pastilles['imm:11']).toBe('docs');
    });
  });

  it('un onglet inconnu ne change rien', () => {
    expect(jouerSetter('setImmFicheTab', 'zzz', { _currentImmFicheTab: 'charges' }).imm).toBe('charges');
  });
});

describe('setEntFicheTab — fiche bailleur : 1 onglet + redirections', () => {
  it("'immeubles' reste", () => {
    expect(jouerSetter('setEntFicheTab', 'immeubles', { _currentEntFicheTab: '?' }).ent).toBe('immeubles');
  });

  it("'compta' retombe sur l'onglet unique (comptabilité globale supprimée)", () => {
    expect(jouerSetter('setEntFicheTab', 'compta', { _currentEntFicheTab: '?' }).ent).toBe('immeubles');
  });

  it("'documents' retombe sur l'onglet unique en dépliant la pastille Documents", () => {
    const r = jouerSetter('setEntFicheTab', 'documents', { _currentEntFicheTab: '?', _currentEntFiche: 9 });
    expect(r.ent).toBe('immeubles');
    expect(r.pastilles['ent:9']).toBe('docs');
  });

  it('un onglet inconnu ne change rien', () => {
    expect(jouerSetter('setEntFicheTab', 'zzz', { _currentEntFicheTab: 'immeubles' }).ent).toBe('immeubles');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Ce que les surfaces DOIVENT contenir (assertions sur la source)
// ════════════════════════════════════════════════════════════════════════════
describe('fiche logement — étape 8', () => {
  it('4 onglets, dans l\'ordre du mockup', () => {
    const barre = html.slice(html.indexOf('aria-label="Sous-sections de la fiche bien"'));
    const fin = barre.indexOf('</div>');
    const onglets = (barre.slice(0, fin).match(/setLogFicheTab\('(\w+)'\)/g) || []);
    expect(onglets).toEqual(["setLogFicheTab('bail')", "setLogFicheTab('conformite')",
                             "setLogFicheTab('documents')", "setLogFicheTab('compta')"]);
  });

  it('P1-8bis — les états des lieux sont rendus HORS du bloc « bail en cours »', () => {
    // À l'intérieur du `if(bail)`, un logement vacant perdrait ses EDL passés et son template —
    // exactement le moment où l'on consulte l'EDL de sortie.
    expect(html).toContain('${currentSection}${_renderHistoBailSection(ref)}${_renderLogFichePanelEDL(log, ref)}');
  });

  it('les photos sont rendues dans l\'onglet Documents', () => {
    expect(html).toContain("html: _renderLogFichePanelPhotos(log, ref)");
  });

  it('« ＋ Ajouter un bien » a disparu de la fiche d\'un bien (P1-13)', () => {
    expect(html).not.toContain("_frStartFromLog('${refSafe}')");
  });
});

describe('fiche bailleur — étape 10', () => {
  it('un seul onglet, et plus aucun onglet grisé « À venir » sur les 2 fiches (P1-12)', () => {
    const barre = html.slice(html.indexOf('aria-label="Sous-sections de la fiche bailleur"'));
    const onglets = (barre.slice(0, barre.indexOf('</div>')).match(/setEntFicheTab\('(\w+)'\)/g) || []);
    expect(onglets).toEqual(["setEntFicheTab('immeubles')"]);
    expect(html).not.toContain('<span class="soon">À venir</span>');
  });

  it('les 2 pastilles d\'entête sont branchées sur le composant PARTAGÉ (DRY)', () => {
    expect(html).toContain("_renderFichePastilles('ent:' + (+ent.id)");
    expect(html).toContain("_renderFichePastilles('imm:' + immId");
    // une seule définition du composant
    expect((html.match(/function _renderFichePastilles\(/g) || []).length).toBe(1);
  });

  it('le panneau de comptabilité globale n\'a plus d\'appelant', () => {
    expect((html.match(/_renderEntFichePanelComptaGlobale\(/g) || []).length).toBe(1);   // la définition seule
  });
});

describe('les renderers déplacés ne sont pas dupliqués (DRY)', () => {
  ['_renderImmFichePlanGantt', '_renderLogFichePanelEDL', '_renderLogFichePanelPhotos',
   '_renderLogFichePanelCompteurs', '_renderAttachmentSection'].forEach(fn => {
    it(fn + ' n\'est défini qu\'une fois', () => {
      expect((html.match(new RegExp('function ' + fn + '\\(', 'g')) || []).length).toBe(1);
    });
  });
});
