import { describe, it, expect } from 'vitest';
import { STEPS, entryStep, advance, breadcrumb } from './fil-rouge-conductor.js';

describe('fil-rouge-conductor — entrée', () => {
  it('« + Ajouter un bien » neutre démarre à l’écran de choix', () => { expect(entryStep('bien')).toBe('start'); });
  it('choix « saisir à la main » démarre au bailleur', () => { expect(entryStep('manual')).toBe('ent'); });
  it('import acte démarre au logement (bailleur+immeuble pré-remplis)', () => { expect(entryStep('acte')).toBe('log'); });
  it('continuité après bailleur créé → immeuble', () => { expect(entryStep('continue-ent')).toBe('imm'); });
  it('continuité après immeuble créé → logement', () => { expect(entryStep('continue-imm')).toBe('log'); });
  it('entrée inconnue → bailleur par défaut', () => { expect(entryStep('???')).toBe('ent'); });
});

describe('fil-rouge-conductor — transitions (auto-avance)', () => {
  it('bailleur enregistré → immeuble', () => { expect(advance('ent','saved')).toBe('imm'); });
  it('immeuble enregistré → logement', () => { expect(advance('imm','saved')).toBe('log'); });
  it('logement enregistré → et ensuite', () => { expect(advance('log','saved')).toBe('next'); });
  it('et ensuite : autre logement → logement', () => { expect(advance('next','addLog')).toBe('log'); });
  it('et ensuite : autre immeuble → immeuble', () => { expect(advance('next','addImm')).toBe('imm'); });
  it('et ensuite : terminer → bien prêt', () => { expect(advance('next','finish')).toBe('done'); });
  it('bien prêt : créer le bail → bail', () => { expect(advance('done','createBail')).toBe('bail'); });
  it('événement inconnu → on reste sur place', () => { expect(advance('log','wat')).toBe('log'); });
  it('retour arrière explicite', () => { expect(advance('imm','back')).toBe('ent'); expect(advance('log','back')).toBe('imm'); });
});

describe('fil-rouge-conductor — fil d’Ariane', () => {
  it('4 maillons, bailleur en cours au départ', () => {
    const b = breadcrumb({ step:'ent' });
    expect(b.map(c=>c.key)).toEqual(['ent','imm','log','bail']);
    expect(b[0].state).toBe('cur');
    expect(b[1].state).toBe('todo');
  });
  it('bailleur fait + immeuble en cours', () => {
    const b = breadcrumb({ step:'imm', entName:'SCI du Château' });
    expect(b[0].state).toBe('done'); expect(b[0].label).toBe('SCI du Château');
    expect(b[1].state).toBe('cur');
  });
  it('logement en cours porte la réf du dernier lot', () => {
    const b = breadcrumb({ step:'log', entName:'SCI', immName:'12 rue', lastLogRef:'F-102', logCount:1 });
    expect(b[2].state).toBe('cur'); expect(b[2].label).toBe('F-102');
  });
  it('au bien prêt, logement fait et bail en cours', () => {
    const b = breadcrumb({ step:'done', entName:'SCI', immName:'12 rue', lastLogRef:'F-102', logCount:2 });
    expect(b[2].state).toBe('done'); expect(b[2].label).toBe('F-102 +1');
    expect(b[3].state).toBe('cur');
  });
  it('bail fait → dernier maillon done', () => {
    const b = breadcrumb({ step:'bail', bailDone:true, entName:'SCI', immName:'12', lastLogRef:'F-1', logCount:1 });
    expect(b[3].state).toBe('done');
  });
});
