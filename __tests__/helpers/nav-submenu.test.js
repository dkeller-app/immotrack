import { describe, it, expect } from 'vitest';
import { navSubmenuModel } from '../../js/core/nav-submenu.js';

// Groupes échantillons (forme = _NAV_GROUPS[x])
const pilotage = { parent: 'Pilotage', tabs: [['dashboard', 'Tableau de bord'], ['finances', 'Finances'], ['pilotage', 'Suivi']] };
const loc = { parent: 'Locataires', tabs: [['baux', 'Baux en cours'], ['candidats', 'Candidatures']] };
const all = (...ids) => new Set(ids);

describe('navSubmenuModel', () => {
  it('onglet autonome (pas de groupe) → link', () => {
    expect(navSubmenuModel('biens', null, 'biens', all('biens'), all()).kind).toBe('link');
    expect(navSubmenuModel('biens', undefined, 'biens', all(), all()).kind).toBe('link');
  });

  it('groupe à 2+ enfants visibles → group avec enfants complets', () => {
    const on = all('dashboard', 'finances', 'pilotage');
    const m = navSubmenuModel('dashboard', pilotage, 'finances', on, all('dashboard'));
    expect(m.kind).toBe('group');
    expect(m.groupKey).toBe('dashboard');
    expect(m.children.map(c => c.id)).toEqual(['dashboard', 'finances', 'pilotage']);
    expect(m.children.map(c => c.lb)).toEqual(['Tableau de bord', 'Finances', 'Suivi']);
  });

  it('parentActive vrai quand la page courante est un enfant du groupe', () => {
    const on = all('dashboard', 'finances', 'pilotage');
    expect(navSubmenuModel('dashboard', pilotage, 'finances', on, all()).parentActive).toBe(true);
    expect(navSubmenuModel('dashboard', pilotage, 'biens', on, all()).parentActive).toBe(false);
  });

  it('enfant actif = celui égal à la page courante', () => {
    const on = all('dashboard', 'finances', 'pilotage');
    const m = navSubmenuModel('dashboard', pilotage, 'pilotage', on, all());
    expect(m.children.find(c => c.active).id).toBe('pilotage');
    expect(m.children.filter(c => c.active).length).toBe(1);
  });

  it('open suit l\'appartenance à openSet (variante A : rien de forcé)', () => {
    const on = all('dashboard', 'finances', 'pilotage');
    expect(navSubmenuModel('dashboard', pilotage, 'biens', on, all('dashboard')).open).toBe(true);
    expect(navSubmenuModel('dashboard', pilotage, 'biens', on, all()).open).toBe(false);
    // même actif, si pas dans openSet → fermé (l'appelant sème le groupe courant en amont)
    expect(navSubmenuModel('dashboard', pilotage, 'finances', on, all()).open).toBe(false);
  });

  it('menu perso réduit le groupe à <2 enfants visibles → link', () => {
    // candidats masqué + page hors groupe → seul baux visible → link
    expect(navSubmenuModel('baux', loc, 'accueil', all('baux'), all()).kind).toBe('link');
  });

  it('un enfant masqué mais courant reste visible (ne casse pas la nav)', () => {
    // candidats masqué du menu perso MAIS c'est la page courante → conservé → group
    const m = navSubmenuModel('baux', loc, 'candidats', all('baux'), all());
    expect(m.kind).toBe('group');
    expect(m.children.map(c => c.id)).toEqual(['baux', 'candidats']);
    expect(m.children.find(c => c.active).id).toBe('candidats');
  });
});
