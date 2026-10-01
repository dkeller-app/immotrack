/**
 * Tests — AVENANT-REFONTE lot 3 : ce que la signature d'un avenant applique au bail (planApplication, pur).
 */
import { describe, it, expect } from 'vitest';
import { planApplication } from '../../js/core/avenant-registre.js';

const LBL = { loyer: 'Loyer', charges: 'Charges', annexe: 'Annexe / dépendance', duree: 'Durée', paiement: 'Paiement / RIB', destination: 'Destination', travaux: 'Travaux', coloc: 'Colocataire' };
const bail = { hc: 850, ch: 120, jpay: '5', fin: '2027-02-28', destinationLocaux: 'habitation' };
const plan = (objets, b) => planApplication({ objets, bail: b || bail, libelles: LBL });

describe('planApplication — loyer, charges, annexe (barème daté)', () => {
  it('nouveau loyer et nouvelles charges', () => {
    const p = plan([{ k: 'loyer', data: { nouveau: '900' } }, { k: 'charges', data: { mode: 'Révision du montant des provisions', montant: '130' } }]);
    expect(p).toMatchObject({ hc: 900, ch: 130, champs: [], docSeul: [], alertes: [] });
    expect(p.appliques.sort()).toEqual(['Charges', 'Loyer']);
  });
  it('montant laissé vide ou identique : rien à dater, document seulement', () => {
    const p = plan([{ k: 'loyer', data: { nouveau: '' } }, { k: 'charges', data: { montant: '120' } }]);
    expect(p).toMatchObject({ hc: null, ch: null, appliques: [], docSeul: ['Loyer', 'Charges'] });
  });
  it('montant illisible : jamais appliqué, et dit', () => {
    const p = plan([{ k: 'loyer', data: { nouveau: 'abc' } }]);
    expect(p.hc).toBeNull(); expect(p.alertes.length).toBe(1);
  });
  it('annexe : le loyer supplémentaire s\'ajoute au loyer (adjonction) ou s\'en retire (retrait), cumulé avec un nouveau loyer', () => {
    expect(plan([{ k: 'annexe', data: { act: 'Adjonction', sup: '50' } }]).hc).toBe(900);
    expect(plan([{ k: 'annexe', data: { act: 'Retrait', sup: '50' } }]).hc).toBe(800);
    const p = plan([{ k: 'loyer', data: { nouveau: '900' } }, { k: 'annexe', data: { act: 'Adjonction', sup: '40,50' } }]);
    expect(p.hc).toBe(940.5);
    expect(p.appliques).toEqual(['Loyer', 'Annexe / dépendance (loyer supplémentaire)']);
  });
  it('annexe sans supplément : document seulement', () => {
    expect(plan([{ k: 'annexe', data: { act: 'Adjonction', sup: '' } }])).toMatchObject({ hc: null, docSeul: ['Annexe / dépendance'] });
  });
  it('loyer résultant nul ou négatif : refusé, loyer inchangé', () => {
    const p = plan([{ k: 'annexe', data: { act: 'Retrait', sup: '900' } }]);
    expect(p.hc).toBeNull(); expect(p.alertes.join(' ')).toMatch(/nul ou négatif/);
  });
  it('passage au forfait de charges au même montant : APPLIQUÉ (daté, lu par la régularisation), sans alerte', () => {
    const p = plan([{ k: 'charges', data: { mode: 'Passage au forfait de charges', montant: '' } }]);
    expect(p.ch).toBeNull(); expect(p.regime).toBe(true);
    expect(p.champs).toEqual([{ champ: 'chForfait', apres: true }]);
    expect(p.appliques).toEqual(['Passage au forfait de charges']);
    expect(p.docSeul).toEqual([]);
    expect(p.alertes).toEqual([]);
  });
});

describe('planApplication — régime des charges comparé à la TIMELINE (forfaitAvant), pas au flag', () => {
  const forf = [{ k: 'charges', data: { mode: 'Passage au forfait de charges', montant: '' } }];
  const prov = [{ k: 'charges', data: { mode: 'Passage aux provisions avec régularisation', montant: '' } }];
  it('flag déjà vrai (posé par un avenant antérieur) mais timeline aux provisions à la date d\'effet → changement de régime', () => {
    const p = planApplication({ objets: forf, bail: Object.assign({}, bail, { chForfait: true }), libelles: LBL, forfaitAvant: false });
    expect(p.regime).toBe(true); expect(p.appliques).toEqual(['Passage au forfait de charges']);
    expect(p.champs).toEqual([]);   // flag déjà aligné
  });
  it('déjà au forfait à la date d\'effet : régime inchangé → document seulement', () => {
    const p = planApplication({ objets: forf, bail, libelles: LBL, forfaitAvant: true });
    expect(p.regime).toBe(false); expect(p.appliques).toEqual([]); expect(p.docSeul).toEqual(['Charges']);
  });
  it('retour aux provisions', () => {
    const p = planApplication({ objets: prov, bail: Object.assign({}, bail, { chForfait: true }), libelles: LBL, forfaitAvant: true });
    expect(p.regime).toBe(true); expect(p.appliques).toEqual(['Retour aux provisions']);
    expect(p.champs).toEqual([{ champ: 'chForfait', apres: false }]);
  });
  it('forfait + nouveau montant : les deux sont appliqués', () => {
    const p = planApplication({ objets: [{ k: 'charges', data: { mode: 'Passage au forfait de charges', montant: '90' } }], bail, libelles: LBL, forfaitAvant: false });
    expect(p.ch).toBe(90); expect(p.appliques).toEqual(['Charges', 'Passage au forfait de charges']); expect(p.docSeul).toEqual([]);
  });
  it('révision des provisions (pas de changement de régime) : comportement inchangé', () => {
    const p = planApplication({ objets: [{ k: 'charges', data: { mode: 'Révision du montant des provisions', montant: '120' } }], bail, libelles: LBL, forfaitAvant: false });
    expect(p.regime).toBe(false); expect(p.docSeul).toEqual(['Charges']);
  });
});

describe('planApplication — autres champs du bail', () => {
  it('terme, jour de paiement, destination', () => {
    const p = plan([
      { k: 'duree', data: { act: 'Prorogation du bail', fin: '2030-02-28' } },
      { k: 'paiement', data: { jour: '10', mode: 'virement', rib: '' } },
      { k: 'destination', data: { dest: 'usage mixte (habitation et activité professionnelle)' } },
    ]);
    expect(p.champs).toEqual([{ champ: 'fin', apres: '2030-02-28' }, { champ: 'jpay', apres: '10' }, { champ: 'destinationLocaux', apres: 'mixte' }]);
    expect(p.appliques).toEqual(['Durée', 'Jour de paiement', 'Destination']);
    expect(p.docSeul).toEqual([]);   // mode : dans le document, sans avertissement
    expect(plan([{ k: 'paiement', data: { jour: '5', rib: 'FR76 1234' } }]).docSeul).toEqual(['IBAN du bailleur']);   // l'IBAN est celui du bailleur, pas du bail
  });
  it('terme absent ou jour invalide : non appliqué, et dit', () => {
    const p = plan([{ k: 'duree', data: { fin: '' } }, { k: 'paiement', data: { jour: '45' } }]);
    expect(p.champs).toEqual([]); expect(p.alertes.length).toBe(2);
  });
  it('objets sans donnée du bail (colocataire, travaux…) : document seulement', () => {
    expect(plan([{ k: 'coloc', data: { act: 'Départ' } }, { k: 'travaux', data: {} }]).docSeul).toEqual(['Colocataire', 'Travaux']);
  });
  it('module pur : le bail n\'est jamais modifié', () => {
    const b = { ...bail };
    plan([{ k: 'loyer', data: { nouveau: '999' } }, { k: 'duree', data: { fin: '2031-01-01' } }], b);
    expect(b).toEqual(bail);
  });
  it('objets absents ou malformés : aucune exception', () => {
    expect(() => planApplication({})).not.toThrow();
    expect(planApplication({ objets: 'x', bail })).toMatchObject({ hc: null, ch: null, champs: [] });
  });
});

describe('planApplication — audit lot 3a', () => {
  it('M1 : loyer final refusé → ni loyer ni supplément annoncés appliqués', () => {
    const p = plan([{ k: 'loyer', data: { nouveau: '100' } }, { k: 'annexe', data: { act: 'Retrait', sup: '200' } }]);
    expect(p.hc).toBeNull(); expect(p.appliques).toEqual([]);
    expect(p.docSeul).toEqual(['Loyer', 'Annexe / dépendance (loyer supplémentaire)']);
  });
  it('M2 : valeur inchangée → ni journalisée ni annoncée appliquée ; destination absente = habitation', () => {
    const p = plan([{ k: 'duree', data: { fin: '2027-02-28' } }, { k: 'paiement', data: { jour: '5' } }, { k: 'destination', data: { dest: "usage exclusif d'habitation" } }], { hc: 850, ch: 120, jpay: 5, fin: '2027-02-28' });
    expect(p.champs).toEqual([]); expect(p.appliques).toEqual([]);
  });
  it('M8 : jour de paiement 29 à 31 refusé (le formulaire du bail s\'arrête à 28)', () => {
    expect(plan([{ k: 'paiement', data: { jour: '30' } }]).champs).toEqual([]);
  });
});
