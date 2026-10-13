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
