import { describe, it, expect } from 'vitest';
import {
  SCOPE_KIND, SANS_BAILLEUR, SANS_IMMEUBLE,
  LABEL_SANS_BAILLEUR, LABEL_SANS_IMMEUBLE,
  buildScopeCatalog, resolveScope, lotInScope, scopeLots, scopeRefs,
  scopeWeight, inScope
} from '../../js/core/finances-scope.js';

// ── Parc de test ────────────────────────────────────────────────────────────
// SCI Alpha : imm « Lilas » (2 lots) + imm « Roses » (1 lot) + 1 lot sans immeuble
// Dupont (particulier) : imm « Chênes » (1 lot)
// 1 lot orphelin (ni bailleur ni immeuble) + 1 lot sans bailleur mais avec immeuble
// 1 lot supprimé (tombstone) — jamais compté nulle part
const LOGEMENTS = [
  { ref: 'A1', entity: 'SCI Alpha', imm: 'Lilas' },
  { ref: 'A2', entity: 'SCI Alpha', imm: 'Lilas' },
  { ref: 'A3', entity: 'SCI Alpha', imm: 'Roses' },
  { ref: 'A4', entity: 'SCI Alpha', imm: '' },          // sans immeuble, bailleur connu
  { ref: 'D1', entity: 'Dupont', imm: 'Chênes' },
  { ref: 'O1', entity: '', imm: '' },                    // orphelin total
  { ref: 'O2', entity: '', imm: 'Peupliers' },           // sans bailleur, immeuble connu
  { ref: 'X9', entity: 'SCI Alpha', imm: 'Lilas', _deleted: true }
];

describe('finances-scope — catalogue (P-1, P-2)', () => {
  it('expose 3 crans : Tout, bailleur, immeuble (aucun cran logement)', () => {
    const cat = buildScopeCatalog(LOGEMENTS);
    expect(cat.nbLots).toBe(7);                     // tombstone exclu
    expect(cat.entites.map(e => e.key)).toEqual(['Dupont', 'SCI Alpha', SANS_BAILLEUR]);
    expect(cat.entites.every(e => Array.isArray(e.immeubles))).toBe(true);
    expect(cat).not.toHaveProperty('logements');    // pas de cran logement
  });

  it('trie les bailleurs alphabétiquement (fr) et place « Sans bailleur » en dernier', () => {
    const cat = buildScopeCatalog(LOGEMENTS);
    const last = cat.entites[cat.entites.length - 1];
    expect(last.key).toBe(SANS_BAILLEUR);
    expect(last.label).toBe(LABEL_SANS_BAILLEUR);
    expect(last.unassigned).toBe(true);
  });

  it('le panier « Sans bailleur » porte son compte de lots (constat 13)', () => {
    const cat = buildScopeCatalog(LOGEMENTS);
    const sb = cat.entites.find(e => e.key === SANS_BAILLEUR);
    expect(sb.nbLots).toBe(2);                      // O1 + O2
  });

  it('chaque bailleur liste ses immeubles + son panier « Sans immeuble » avec son compte', () => {
    const cat = buildScopeCatalog(LOGEMENTS);
    const alpha = cat.entites.find(e => e.key === 'SCI Alpha');
    expect(alpha.nbLots).toBe(4);
    expect(alpha.immeubles.map(i => i.key)).toEqual(['Lilas', 'Roses', SANS_IMMEUBLE]);
    expect(alpha.immeubles.find(i => i.key === 'Lilas').nbLots).toBe(2);
    const si = alpha.immeubles.find(i => i.key === SANS_IMMEUBLE);
    expect(si.nbLots).toBe(1);                      // A4
    expect(si.label).toBe(LABEL_SANS_IMMEUBLE);
    expect(si.unassigned).toBe(true);
  });

  it('un bailleur dont tous les lots ont un immeuble n\'affiche pas le panier', () => {
    const cat = buildScopeCatalog(LOGEMENTS);
    const dupont = cat.entites.find(e => e.key === 'Dupont');
    expect(dupont.immeubles.map(i => i.key)).toEqual(['Chênes']);
  });

  it('le cran « Tout » liste TOUS les immeubles du parc + le panier global', () => {
    const cat = buildScopeCatalog(LOGEMENTS);
    expect(cat.immeubles.map(i => i.key))
      .toEqual(['Chênes', 'Lilas', 'Peupliers', 'Roses', SANS_IMMEUBLE]);
    expect(cat.immeubles.find(i => i.key === SANS_IMMEUBLE).nbLots).toBe(2);  // A4 + O1
  });

  it('P-5 : le sélecteur d\'immeuble reste renseigné même avec un seul immeuble', () => {
    const cat = buildScopeCatalog([{ ref: 'S1', entity: 'Solo', imm: 'Unique' }]);
    expect(cat.entites[0].immeubles.map(i => i.key)).toEqual(['Unique']);
  });

  it('tri naturel français des immeubles (Imm 2 avant Imm 10)', () => {
    const cat = buildScopeCatalog([
      { ref: 'a', entity: 'E', imm: 'Imm 10' }, { ref: 'b', entity: 'E', imm: 'Imm 2' }
    ]);
    expect(cat.entites[0].immeubles.map(i => i.key)).toEqual(['Imm 2', 'Imm 10']);
  });

  it('parc vide → catalogue vide, jamais null', () => {
    const cat = buildScopeCatalog([]);
    expect(cat.nbLots).toBe(0);
    expect(cat.entites).toEqual([]);
    expect(cat.immeubles).toEqual([]);
  });
});

describe('finances-scope — résolution du périmètre (P-1)', () => {
  it('sélection vide → cran « Tout », tous les lots, tombstone exclu', () => {
    const s = resolveScope({}, LOGEMENTS);
    expect(s.kind).toBe(SCOPE_KIND.ALL);
    expect(s.refs.sort()).toEqual(['A1', 'A2', 'A3', 'A4', 'D1', 'O1', 'O2']);
    expect(s.label).toBe('Tout');
  });

  it('cran bailleur → ses lots, ses immeubles', () => {
    const s = resolveScope({ ent: 'SCI Alpha' }, LOGEMENTS);
    expect(s.kind).toBe(SCOPE_KIND.ENT);
    expect(s.ent).toBe('SCI Alpha');
    expect(s.refs.sort()).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(s.imms).toEqual(['Lilas', 'Roses']);
    expect(s.nbImm).toBe(2);
    expect(s.label).toBe('SCI Alpha');
  });

  it('cran immeuble → ses lots seulement, poids SCI = 1/nbImm du bailleur', () => {
    const s = resolveScope({ ent: 'SCI Alpha', imm: 'Lilas' }, LOGEMENTS);
    expect(s.kind).toBe(SCOPE_KIND.IMM);
    expect(s.refs.sort()).toEqual(['A1', 'A2']);
    expect(s.imms).toEqual(['Lilas']);
    expect(s.nbImm).toBe(2);
    expect(s.sciWeight).toBe(0.5);
    expect(s.label).toBe('SCI Alpha · Lilas');
  });

  it('immeuble sans bailleur explicite → l\'entité est dérivée (parité _finEntScope)', () => {
    const s = resolveScope({ imm: 'Lilas' }, LOGEMENTS);
    expect(s.ent).toBe('SCI Alpha');
    expect(s.nbImm).toBe(2);
    expect(s.sciWeight).toBe(0.5);
    expect(s.refs.sort()).toEqual(['A1', 'A2']);
  });

  it('P-6 : immeuble hors périmètre du bailleur → repli « Tout le bailleur » ANNONCÉ', () => {
    const s = resolveScope({ ent: 'Dupont', imm: 'Lilas' }, LOGEMENTS);
    expect(s.kind).toBe(SCOPE_KIND.ENT);
    expect(s.immKey).toBe('');
    expect(s.fallback).toEqual({ raison: 'imm-hors-perimetre', immDemande: 'Lilas' });
    expect(s.refs).toEqual(['D1']);
  });

  it('bailleur inconnu → repli « Tout » ANNONCÉ (jamais un périmètre vide silencieux)', () => {
    const s = resolveScope({ ent: 'Fantôme' }, LOGEMENTS);
    expect(s.kind).toBe(SCOPE_KIND.ALL);
    expect(s.fallback).toEqual({ raison: 'ent-inconnu', entDemande: 'Fantôme' });
  });

  it('sans repli, `fallback` est null', () => {
    expect(resolveScope({ ent: 'SCI Alpha' }, LOGEMENTS).fallback).toBeNull();
  });
});

describe('finances-scope — paniers « à rattacher » (P-2, constats 13 et 21)', () => {
  it('panier « Sans bailleur » sélectionnable : ses lots existent enfin', () => {
    const s = resolveScope({ ent: SANS_BAILLEUR }, LOGEMENTS);
    expect(s.kind).toBe(SCOPE_KIND.ENT);
    expect(s.entKey).toBe(SANS_BAILLEUR);
    expect(s.ent).toBe('');
    expect(s.refs.sort()).toEqual(['O1', 'O2']);
    expect(s.nbLots).toBe(2);
    expect(s.label).toBe(LABEL_SANS_BAILLEUR);
  });

  it('panier « Sans immeuble » d\'un bailleur', () => {
    const s = resolveScope({ ent: 'SCI Alpha', imm: SANS_IMMEUBLE }, LOGEMENTS);
    expect(s.refs).toEqual(['A4']);
    expect(s.imms).toEqual([]);
    expect(s.label).toBe('SCI Alpha · ' + LABEL_SANS_IMMEUBLE);
  });

  it('panier « Sans immeuble » au cran « Tout » (tous bailleurs confondus)', () => {
    const s = resolveScope({ imm: SANS_IMMEUBLE }, LOGEMENTS);
    expect(s.refs.sort()).toEqual(['A4', 'O1']);
    expect(s.label).toBe(LABEL_SANS_IMMEUBLE);
  });

  it('les deux paniers combinés → le lot orphelin total', () => {
    const s = resolveScope({ ent: SANS_BAILLEUR, imm: SANS_IMMEUBLE }, LOGEMENTS);
    expect(s.refs).toEqual(['O1']);
  });

  it('AUCUN LOT INVISIBLE : Σ des lots des paniers = parc entier', () => {
    const cat = buildScopeCatalog(LOGEMENTS);
    const total = cat.entites.reduce((n, e) => n + e.nbLots, 0);
    expect(total).toBe(cat.nbLots);
    cat.entites.forEach(e => {
      const somme = e.immeubles.reduce((n, i) => n + i.nbLots, 0);
      expect(somme).toBe(e.nbLots);           // aucun lot perdu entre les 2 crans
    });
  });

  it('constat 13 : un lot sans entité appartient au périmètre « Tout » (vacance comprise)', () => {
    expect(scopeRefs(resolveScope({}, LOGEMENTS), LOGEMENTS)).toContain('O1');
  });
});

describe('finances-scope — appartenance d\'un LOT (fonction unique, P-3)', () => {
  const all = resolveScope({}, LOGEMENTS);
  const alpha = resolveScope({ ent: 'SCI Alpha' }, LOGEMENTS);
  const lilas = resolveScope({ ent: 'SCI Alpha', imm: 'Lilas' }, LOGEMENTS);

  it('cran Tout : tout lot vivant appartient', () => {
    expect(lotInScope(all, { ref: 'O1', entity: '', imm: '' })).toBe(true);
    expect(lotInScope(null, { ref: 'O1' })).toBe(true);
  });

  it('tombstone : jamais dans aucun périmètre', () => {
    expect(lotInScope(all, { ref: 'X9', _deleted: true })).toBe(false);
  });

  it('cran bailleur / immeuble', () => {
    expect(lotInScope(alpha, { ref: 'A1', entity: 'SCI Alpha', imm: 'Lilas' })).toBe(true);
    expect(lotInScope(alpha, { ref: 'D1', entity: 'Dupont', imm: 'Chênes' })).toBe(false);
    expect(lotInScope(lilas, { ref: 'A3', entity: 'SCI Alpha', imm: 'Roses' })).toBe(false);
  });

  it('les espaces autour des noms ne cassent pas l\'appartenance', () => {
    expect(lotInScope(alpha, { ref: 'Z', entity: ' SCI Alpha ', imm: ' Lilas ' })).toBe(true);
    expect(lotInScope(lilas, { ref: 'Z', entity: 'SCI Alpha', imm: ' Lilas' })).toBe(true);
  });

  it('scopeLots renvoie les objets, scopeRefs les refs — même règle', () => {
    expect(scopeLots(lilas, LOGEMENTS).map(l => l.ref)).toEqual(['A1', 'A2']);
    expect(scopeRefs(lilas, LOGEMENTS)).toEqual(['A1', 'A2']);
  });
});

describe('finances-scope — poids d\'un MOUVEMENT (fonction unique, P-3 / C7)', () => {
  const all = resolveScope({}, LOGEMENTS);
  const alpha = resolveScope({ ent: 'SCI Alpha' }, LOGEMENTS);
  const lilas = resolveScope({ ent: 'SCI Alpha', imm: 'Lilas' }, LOGEMENTS);

  it('cran Tout : tout mouvement pèse 1 (rien d\'invisible)', () => {
    expect(scopeWeight(all, { qui: 'A1' })).toBe(1);
    expect(scopeWeight(all, { qui: '', imm: 'Inconnu' })).toBe(1);
    expect(scopeWeight(null, { qui: 'SCI:Dupont' })).toBe(1);
  });

  it('mouvement rattaché à un lot du périmètre → 1, hors périmètre → 0', () => {
    expect(scopeWeight(alpha, { qui: 'A1' })).toBe(1);
    expect(scopeWeight(alpha, { qui: 'D1' })).toBe(0);
    expect(scopeWeight(lilas, { qui: 'A3' })).toBe(0);
  });

  it('mouvement de niveau immeuble : compté seulement si `qui` est vide (parité _compute2044)', () => {
    expect(scopeWeight(alpha, { qui: '', imm: 'Lilas' })).toBe(1);
    expect(scopeWeight(alpha, { qui: 'D1', imm: 'Lilas' })).toBe(0);
    expect(scopeWeight(lilas, { qui: '', imm: 'Roses' })).toBe(0);
  });

  it('frais SCI : entiers en vue bailleur, quote-part en vue immeuble', () => {
    expect(scopeWeight(alpha, { qui: 'SCI:SCI Alpha' })).toBe(1);
    expect(scopeWeight(lilas, { qui: 'SCI:SCI Alpha' })).toBe(0.5);
    expect(scopeWeight(lilas, { qui: 'SCI:Dupont' })).toBe(0);
  });

  it('panier « Sans bailleur » : aucun frais SCI ne s\'y rattache (pas de « SCI: » vide)', () => {
    const s = resolveScope({ ent: SANS_BAILLEUR }, LOGEMENTS);
    expect(scopeWeight(s, { qui: 'SCI:' })).toBe(0);
    expect(scopeWeight(s, { qui: 'O1' })).toBe(1);
    expect(scopeWeight(s, { qui: '', imm: 'Peupliers' })).toBe(1);
  });

  it('mouvement supprimé → poids 0 partout (y compris au cran Tout)', () => {
    expect(scopeWeight(all, { qui: 'A1', _deleted: true })).toBe(0);
    expect(scopeWeight(alpha, { qui: 'A1', _deleted: true })).toBe(0);
  });

  it('inScope = poids > 0', () => {
    expect(inScope(alpha, { qui: 'A1' })).toBe(true);
    expect(inScope(alpha, { qui: 'D1' })).toBe(false);
    expect(inScope(lilas, { qui: 'SCI:SCI Alpha' })).toBe(true);
  });

  it('P-4 : la clé de répartition est injectable (fonction), défaut = 1/nbImm', () => {
    const s = resolveScope({ ent: 'SCI Alpha', imm: 'Lilas' }, LOGEMENTS,
      { sciWeight: (mv) => (mv.date === '2026-08-10' ? 0.7 : 0.3) });
    expect(scopeWeight(s, { qui: 'SCI:SCI Alpha', date: '2026-08-10' })).toBe(0.7);
    expect(scopeWeight(s, { qui: 'SCI:SCI Alpha', date: '2026-01-10' })).toBe(0.3);
  });

  it('bailleur sans aucun immeuble : pas de division par zéro', () => {
    const s = resolveScope({ ent: 'Seul' }, [{ ref: 'S1', entity: 'Seul', imm: '' }]);
    expect(s.nbImm).toBe(0);
    expect(scopeWeight(s, { qui: 'SCI:Seul' })).toBe(1);
  });

  it('le poids reste dans [0,1] pour tout mouvement', () => {
    const mvts = [{ qui: 'A1' }, { qui: 'SCI:SCI Alpha' }, { qui: '', imm: 'Lilas' }, { qui: 'zz' }];
    [all, alpha, lilas].forEach(s => mvts.forEach(m => {
      const w = scopeWeight(s, m);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }));
  });

  it('Σ des vues immeuble = vue bailleur pour un frais SCI (invariant P-4 amorcé)', () => {
    const parts = ['Lilas', 'Roses']
      .map(i => scopeWeight(resolveScope({ ent: 'SCI Alpha', imm: i }, LOGEMENTS), { qui: 'SCI:SCI Alpha' }));
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(scopeWeight(alpha, { qui: 'SCI:SCI Alpha' }), 10);
  });
});
