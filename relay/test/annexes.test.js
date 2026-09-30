import { describe, it, expect } from 'vitest';
import { annexGroups, annexAckDue } from '../public/sign/annexes.js';

// D-207 tel qu'envoyé par l'app v15.703 : bail 1-13 (page 13 = signatures), annexe A 14-15, B 16-17,
// notice 18-26, page de garde du DDT 27, DPE 28-33 ; électricité remise hors application ; plomb non joint.
const PLAN_NEW = {
  pageCount: 33, annexStart: 14,
  annexes: { from: 27, items: [
    { label: 'Annexe A — Réparations locatives', ref: 'Décret n° 87-712', statut: 'joint', from: 14, to: 15 },
    { label: 'Annexe B — Charges récupérables', ref: 'Décret n° 87-713', statut: 'joint', from: 16, to: 17 },
    { label: "Notice d'information", ref: 'Arrêté du 29 mai 2015', statut: 'joint', from: 18, to: 26 },
    { label: 'CREP — Plomb', statut: 'non_joint' },
    { label: 'DPE', statut: 'joint', docName: 'dpe.pdf', from: 28, to: 33 },
    { label: 'Électricité', statut: 'hors_app' }
  ] }
};

describe('annexGroups', () => {
  it("une entrée par annexe, dans l'ordre des pages ; page de garde du DDT revendiquée ; sans page en dernier", () => {
    const g = annexGroups(PLAN_NEW);
    expect(g.map((x) => x.label)).toEqual([
      'Annexe A — Réparations locatives', 'Annexe B — Charges récupérables', "Notice d'information",
      'Page de garde du dossier de diagnostic technique', 'DPE', 'CREP — Plomb', 'Électricité'
    ]);
    expect(g[0].pages).toEqual([14, 15]);
    expect(g[3].pages).toEqual([27]);
    expect(g[4].pages).toEqual([28, 29, 30, 31, 32, 33]);
    expect(g[5]).toMatchObject({ statut: 'non_joint', pages: [] });
    expect(g[6]).toMatchObject({ statut: 'hors_app', pages: [] });
    // Toutes les pages d'annexe apparaissent une et une seule fois.
    const all = g.flatMap((x) => x.pages).sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 20 }, (_, i) => 14 + i));
  });

  it('ancien envoi (manifeste = DDT seul) : pages 14-26 non déclarées → une entrée générique en tête', () => {
    const g = annexGroups({ pageCount: 26, annexStart: 14, annexes: { from: null, items: [
      { label: 'DPE', statut: 'non_joint' }, { label: 'Électricité', statut: 'non_joint' }
    ] } });
    expect(g[0]).toMatchObject({ label: 'Pages annexées au bail', statut: 'joint', pages: Array.from({ length: 13 }, (_, i) => 14 + i) });
    expect(g.slice(1).map((x) => x.statut)).toEqual(['non_joint', 'non_joint']);
  });

  it('très ancien envoi (aucune annexe déclarée)', () => {
    expect(annexGroups({ pageCount: 5, annexStart: 4, annexes: null })).toEqual([
      { label: 'Pages annexées au bail', ref: '', docName: '', statut: 'joint', pages: [4, 5] }
    ]);
  });

  it("aucune page d'annexe ni annexe déclarée → liste vide (pas de bloc)", () => {
    expect(annexGroups({ pageCount: 3, annexStart: 0, annexes: null })).toEqual([]);
  });

  it("pages déclarées hors de la zone d'annexe ignorées, statut inconnu → non jointe", () => {
    const g = annexGroups({ pageCount: 6, annexStart: 5, annexes: { items: [
      { label: 'X', statut: 'joint', from: 2, to: 3 }, { label: 'Y', statut: 'bizarre' }
    ] } });
    expect(g.find((x) => x.label === 'X').pages).toEqual([]);
    expect(g.find((x) => x.label === 'Y').statut).toBe('non_joint');
    expect(g.find((x) => x.label === 'Pages annexées au bail').pages).toEqual([5, 6]);
  });
});

describe('annexAckDue', () => {
  it('locataire + au moins une annexe jointe ou remise → case due', () => {
    expect(annexAckDue('locataire', annexGroups(PLAN_NEW))).toBe(true);
    expect(annexAckDue('locataire', [{ statut: 'hors_app', pages: [] }])).toBe(true);
  });
  it('bailleur : jamais ; locataire sans annexe jointe ni remise : non', () => {
    expect(annexAckDue('bailleur', annexGroups(PLAN_NEW))).toBe(false);
    expect(annexAckDue('locataire', [{ statut: 'non_joint', pages: [] }])).toBe(false);
    expect(annexAckDue('locataire', [])).toBe(false);
  });
});
