/**
 * __tests__/helpers/edl-voix-cablage.test.js — chantier EDL-VOIX-IA : le monolithe (gelé) ne fait
 * qu'APPELER les modules testés. Ces tests lisent le code source pour vérifier les points de câblage
 * qui protègent les données : persistance du marquage IA, mention du PDF, cohérence des états.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EDL_ETATS as ETATS_RELAIS, COMPTEUR_CLES } from '../../relay/src/ai/tasks/edl-piece.js';

const root = path.resolve(__dirname, '..', '..');
const lire = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const p2 = lire('js/app/app-part2.js');

describe('cohérence app ↔ relais', () => {
  it('EDL_ETATS du relais = EDL_ETATS de l’app (même liste, même ordre)', () => {
    const m = /const EDL_ETATS\s*=\s*(\[[^\]]+\]);/.exec(p2);
    expect(m).toBeTruthy();
    // eslint-disable-next-line no-new-func
    expect(Function(`return ${m[1]}`)()).toEqual(ETATS_RELAIS);
  });
  it('les clés de compteurs du relais = les champs compteurs de l’EDL', () => {
    const m = /\[('elec-num'[^\]]+)\]\.forEach\(k=>\{const val=v\('edl-cpt-'\+k\)/.exec(p2);
    expect(m).toBeTruthy();
    // eslint-disable-next-line no-new-func
    expect(Function(`return [${m[1]}]`)()).toEqual(COMPTEUR_CLES);
  });
});

describe('A2 — marquage lisible par machine persisté', () => {
  it('saveEDL garde iaE / iaS sur chaque élément', () => {
    const i = p2.indexOf('const piecesClean = _edlP.map(');
    const bloc = p2.slice(i, i + 900);
    expect(bloc).toContain('iaE: { ...x.iaE }');
    expect(bloc).toContain('iaS: { ...x.iaS }');
  });
  it('saveEDL persiste compteursIA, remis à zéro à chaque ouverture, rechargé à l’édition', () => {
    expect(p2).toMatch(/compteursIA: JSON\.parse\(JSON\.stringify\(_edlCptIA \|\| \{\}\)\)/);
    const reset = p2.slice(p2.indexOf('function _edlResetGlobalState()'), p2.indexOf('function _edlResetGlobalState()') + 600);
    expect(reset).toContain('_edlCptIA = {}');
    const open = p2.slice(p2.indexOf('async function openEditEDL('), p2.indexOf('async function openEditEDL(') + 4000);
    expect(open).toContain('_edlCptIA = (e.compteursIA');
  });
});

describe('A2 — mention du PDF signé', () => {
  const gen = p2.slice(p2.indexOf('async function generateEDLPdfNative('), p2.indexOf('async function uploadEDLPDFToDrive('));
  it('seulement si edlAAideIA(edl) (au moins une proposition acceptée)', () => {
    expect(gen).toMatch(/if \(_IAT && _IAT\.edlAAideIA\(edl\)\)/);
    expect(gen).toContain('_IAT.MENTION_PDF');
  });
  it('placée APRÈS les cadres de signature : aucune coordonnée de signature ne bouge', () => {
    const sig = gen.indexOf("pdf.text('Le(s) locataire(s)'");
    const avance = gen.indexOf('y += sigH + 10;');
    const mention = gen.indexOf('_IAT.MENTION_PDF');
    expect(sig).toBeGreaterThan(0);
    expect(avance).toBeGreaterThan(sig);
    expect(mention).toBeGreaterThan(avance);
  });
});

describe('modules exposés au monolithe', () => {
  const main = lire('js/main.js');
  it('IaTransparence importé et exposé', () => {
    expect(main).toContain("import * as IaTransparence from './core/ia-transparence.js'");
    expect(main).toContain('window.IaTransparence = IaTransparence');
  });
});

describe('B1 — dicter la pièce : branchement', () => {
  const p1 = lire('js/app/app-part1.js');
  const main = lire('js/main.js');
  const css = lire('css/main.css');
  it('les modules de la dictée sont importés et exposés', () => {
    for (const [nom, f] of [['IaClient', 'ia-client'], ['IaFileAttente', 'ia-file-attente'], ['AudioCapture', 'audio-capture'], ['EdlDictee', 'edl-dictee'], ['EdlVoixVues', 'edl-voix-vues']]) {
      expect(main).toContain(`import * as ${nom} from './core/${f}.js'`);
      expect(main).toContain(`window.${nom} = ${nom}`);
    }
  });
  it('icône micro dans le système de line-icons', () => {
    expect(p1).toMatch(/\n\s+mic:'<rect/);
  });
  it('chaque pièce porte la barre (téléphone / tablette) et le bouton (PC)', () => {
    const f = p2.slice(p2.indexOf('function _edlPieceHTML('), p2.indexOf('// ── Handlers données'));
    expect(f).toContain('_edlVoixSlotHTML(pi)');
    expect(f).toContain('_edlVoixBoutonPC(pi)');
  });
  it('nouvelle session à chaque ouverture ; file relue et relancée', () => {
    const reset = p2.slice(p2.indexOf('function _edlResetGlobalState()'), p2.indexOf('function _edlResetGlobalState()') + 800);
    expect(reset).toContain('_edlVoixReset()');
    const ar = p2.slice(p2.indexOf('function _edlAutosaveReset()'), p2.indexOf('function _edlAutosaveReset()') + 400);
    expect(ar).toContain('_edlVoixOuverture()');
  });
  it('aucun geste de la dictée ne s’appelle edl[A-Z]… (déclencherait l’autosave à l’ouverture)', () => {
    const noms = [...p2.matchAll(/function (\w*[Vv]oix\w*)\(/g)].map((m) => m[1]);
    expect(noms.length).toBeGreaterThan(10);
    for (const n of noms) expect(n).toMatch(/^_edlVoix|^_evx/);
  });
  it('jamais proposée sur un EDL signé ni en lecture seule', () => {
    const d = p2.slice(p2.indexOf('function _edlVoixDispo()'), p2.indexOf('function _edlVoixDispo()') + 500);
    expect(d).toContain('_appReadOnly');
    expect(d).toContain('_edlVoixSigne()');
    const s = p2.slice(p2.indexOf('function _edlVoixSigne()'), p2.indexOf('function _edlVoixSigne()') + 400);
    expect(s).toContain('_edlCourantSigne()');
    expect(s).toContain('edl-signed-locked');
  });
  it('la couche passe au-dessus du rail et du chrome (M-3), plein écran sur téléphone (M-16)', () => {
    expect(css).toMatch(/\.evx\{position:absolute;inset:0;z-index:95\}/);
    expect(css).toMatch(/\.evx-panel\{position:absolute;inset:0;/);
    expect(css).toMatch(/@media \(min-width:768px\)\{\s*\.evx-scrim\{display:block/);
  });
});
