/**
 * Tests — AVENANT-REFONTE lot 2 : registre des avenants (js/core/avenant-registre.js).
 */
import { describe, it, expect } from 'vitest';
import { STATUTS, avenantsDuBail, listeAvenants, numeroSuivant, nouvelAvenant, transitionPermise, avecStatut, actionsAvenant, titreAvenant, idAvenantRepris } from '../../js/core/avenant-registre.js';

const NOW = '2026-09-29T10:00:00.000Z';
const LBL = { coloc: 'Colocataire', caution: 'Garant / caution', loyer: 'Loyer', charges: 'Charges', travaux: 'Travaux' };
const bail = { debut: '2025-09-01', locataires: [{ nom: 'Alice' }, { nom: 'Bruno' }] };

function entree(p) { return { id: 'a' + p.no, type: 'avenant', ref: 'F-001', bailDebut: '2025-09-01', statut: 'a_signer', objets: [], ...p }; }

describe('avenantsDuBail — rattachement au bail', () => {
  it('même logement, même bail, même espace ; supprimés exclus ; tri par numéro', () => {
    const j = [
      entree({ no: 2 }), entree({ no: 1 }),
      entree({ no: 3, _deleted: true }),
      entree({ no: 9, bailDebut: '2022-01-01' }),                 // bail précédent du logement
      entree({ no: 8, ref: 'F-002' }),                            // autre logement
      entree({ no: 7, _espaceId: 'esp-b' }),                      // autre espace
      { id: 'm', type: 'modification', ref: 'F-001', bailDebut: '2025-09-01' },
    ];
    expect(avenantsDuBail(j, 'F-001', bail).map(e => e.no)).toEqual([1, 2]);
  });
  it('clé multi-espace « ref@@espace » : appariement par clé nue ET espace strict', () => {
    const b = { ...bail, _espaceId: 'esp-b' };
    const j = [entree({ no: 1 }), entree({ no: 2, _espaceId: 'esp-b' })];
    expect(avenantsDuBail(j, 'F-001@@esp-b', b).map(e => e.no)).toEqual([2]);
  });
});

describe('listeAvenants — registre + avenants anciens (bail.avenants[] / DB.bailEvents)', () => {
  it('un avenant ancien vu des deux côtés = UNE carte, ce qui a été appliqué vient de l\'événement', () => {
    const b = { ...bail, avenants: [{ no: 1, dateEffet: '2026-04-01', ville: 'Lyon', objets: [{ k: 'charges', data: { montant: '95' } }, { k: 'travaux', data: {} }], html: '<p>doc</p>', createdAt: '2026-03-12T09:00:00Z' }] };
    const ev = [{ type: 'avenant', ref: 'F-001', bailDebut: '2025-09-01', date: '2026-04-01', no: 1, objets: ['charges', 'travaux'], appliques: ['Charges'], docSeul: ['Travaux'] }];
    const l = listeAvenants({ journal: [], bailEvents: ev, cle: 'F-001', bail: b });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ no: 1, virtuel: true, statut: 'a_signer', date: '2026-04-01', html: '<p>doc</p>', appliques: ['Charges'], docSeul: ['Travaux'] });
    expect(l[0].id).toBe(idAvenantRepris('F-001', b, 1));
  });
  it('sans événement : loyer / charges considérés comme appliqués (comportement d\'avant)', () => {
    const b = { ...bail, avenants: [{ no: 1, dateEffet: '2026-04-01', objets: [{ k: 'loyer' }, { k: 'clause' }] }] };
    expect(listeAvenants({ cle: 'F-001', bail: b })[0].appliques).toEqual(['Loyer']);
  });
  it('événement seul (bail signé verrouillé, v15.681) : carte sans document', () => {
    const ev = [{ type: 'avenant', ref: 'F-001', bailDebut: '2025-09-01', date: '2026-05-01', no: 2, objets: ['coloc'], appliques: [], docSeul: ['Colocataire'] }];
    const l = listeAvenants({ bailEvents: ev, cle: 'F-001', bail });
    expect(l[0]).toMatchObject({ no: 2, html: null, appliques: [], objets: [{ k: 'coloc' }] });
  });
  it('l\'entrée de registre prend le pas sur la trace ancienne du même numéro', () => {
    const b = { ...bail, avenants: [{ no: 1, objets: [] }] };
    const j = [entree({ no: 1, statut: 'signe' })];
    const l = listeAvenants({ journal: j, cle: 'F-001', bail: b });
    expect(l).toHaveLength(1);
    expect(l[0].statut).toBe('signe');
    expect(l[0].virtuel).toBeUndefined();
  });
  it('événements du bail précédent ignorés ; plus récent en tête', () => {
    const ev = [
      { type: 'avenant', ref: 'F-001', bailDebut: '2022-01-01', date: '2023-01-01', no: 5 },
      { type: 'avenant', ref: 'F-001', date: '2026-01-01', no: 1 },            // sans bailDebut, daté dans le bail
    ];
    const l = listeAvenants({ journal: [entree({ no: 2 })], bailEvents: ev, cle: 'F-001', bail });
    expect(l.map(a => a.no)).toEqual([2, 1]);
  });
});

describe('numeroSuivant', () => {
  it('max(registre, brouillons, anciens) + 1', () => {
    const b = { ...bail, avenants: [{ no: 1 }] };
    const j = [entree({ no: 3, statut: 'brouillon' })];
    const ev = [{ type: 'avenant', ref: 'F-001', bailDebut: '2025-09-01', no: 2 }];
    expect(numeroSuivant({ journal: j, bailEvents: ev, cle: 'F-001', bail: b })).toBe(4);
  });
  it('aucun avenant → 1 ; brouillon supprimé ne compte pas', () => {
    expect(numeroSuivant({ cle: 'F-001', bail })).toBe(1);
    expect(numeroSuivant({ journal: [entree({ no: 1, statut: 'brouillon', _deleted: true })], cle: 'F-001', bail })).toBe(1);
  });
});

describe('nouvelAvenant', () => {
  it('rattache au bail (début, espace, ligne cloud, signature) et fige une copie des objets', () => {
    const objets = [{ k: 'charges', data: { montant: '95' } }];
    const b = { ...bail, _espaceId: 'esp-b', _bailUid: 'uid-1', signatures: { signedAt: '2025-08-20T10:00:00Z' } };
    const e = nouvelAvenant({ id: 'x', cle: 'F-001@@esp-b', bail: b, no: 2, statut: 'a_signer', date: '2026-10-01', ville: 'Lyon', objets, html: '<p/>', appliques: ['Charges'], now: NOW });
    expect(e).toMatchObject({ id: 'x', type: 'avenant', ref: 'F-001', bailDebut: '2025-09-01', _espaceId: 'esp-b', bailUid: 'uid-1', signedAt: '2025-08-20T10:00:00Z', no: 2, statut: 'a_signer', date: '2026-10-01', createdAt: NOW, statutLe: NOW, _modifiedAt: NOW });
    objets[0].data.montant = '999';
    expect(e.objets[0].data.montant).toBe('95');
  });
  it('bail mono-espace non signé : ni espace, ni uid, ni signature', () => {
    const e = nouvelAvenant({ id: 'x', cle: 'F-001', bail, no: 1, statut: 'brouillon', now: NOW });
    expect(e._espaceId).toBeUndefined(); expect(e.bailUid).toBeUndefined(); expect(e.signedAt).toBeUndefined();
  });
  it('on ne crée jamais directement un avenant « Signé » ou « Annulé »', () => {
    expect(() => nouvelAvenant({ statut: 'signe', now: NOW })).toThrow();
    expect(() => nouvelAvenant({ statut: 'annule', now: NOW })).toThrow();
  });
});

describe('statuts et transitions', () => {
  it('4 statuts', () => { expect(Object.keys(STATUTS)).toEqual(['brouillon', 'a_signer', 'signe', 'annule']); });
  it('Brouillon → À signer → Signé ; Signé et Annulé sont définitifs', () => {
    expect(transitionPermise({ statut: 'brouillon' }, 'a_signer')).toBe(true);
    expect(transitionPermise({ statut: 'brouillon' }, 'signe')).toBe(false);
    expect(transitionPermise({ statut: 'a_signer' }, 'signe')).toBe(true);
    expect(transitionPermise({ statut: 'signe' }, 'annule')).toBe(false);
    expect(transitionPermise({ statut: 'annule' }, 'a_signer')).toBe(false);
  });
  it('Annuler seulement si rien n\'a été appliqué au bail', () => {
    expect(transitionPermise({ statut: 'a_signer', appliques: [] }, 'annule')).toBe(true);
    expect(transitionPermise({ statut: 'a_signer', appliques: ['Loyer'] }, 'annule')).toBe(false);
  });
  it('avecStatut : copie, avenant ancien matérialisé, signature papier datée', () => {
    const av = { id: 'av_rep_F-001_2025-09-01_1', virtuel: true, statut: 'a_signer', appliques: [], no: 1 };
    const s = avecStatut(av, 'signe', NOW, { signeLe: '2026-09-28' });
    expect(s).toMatchObject({ statut: 'signe', signeLe: '2026-09-28', signeMode: 'papier', statutLe: NOW, createdAt: NOW });
    expect(s.virtuel).toBeUndefined();
    expect(av.statut).toBe('a_signer');
    expect(avecStatut(av, 'brouillon', NOW)).toBeNull();
  });
});

describe('actionsAvenant', () => {
  it('brouillon : reprendre / supprimer seulement', () => {
    expect(actionsAvenant({ statut: 'brouillon', html: '<p/>' })).toEqual(['reprendre', 'supprimer']);
  });
  it('à signer : voir / pdf si document, signé sur papier, annuler si rien appliqué', () => {
    expect(actionsAvenant({ statut: 'a_signer', html: '<p/>', appliques: [] })).toEqual(['voir', 'pdf', 'signe-papier', 'annuler']);
    expect(actionsAvenant({ statut: 'a_signer', html: null, appliques: ['Loyer'] })).toEqual(['signe-papier']);
  });
  it('signé / annulé : consultation seulement', () => {
    expect(actionsAvenant({ statut: 'signe', html: '<p/>' })).toEqual(['voir', 'pdf']);
    expect(actionsAvenant({ statut: 'annule', html: null })).toEqual([]);
  });
});

describe('titreAvenant', () => {
  it('nomme les personnes et les montants', () => {
    const av = { no: 2, objets: [
      { k: 'coloc', data: { act: 'Départ (séparation), sans remplaçant', sortant: 'Bruno Leroy' } },
      { k: 'charges', data: { montant: '95' } },
    ] };
    expect(titreAvenant(av, LBL)).toBe('Avenant n° 2 — Départ de Bruno Leroy · Charges 95,00 €');
  });
  it('ajout, remplacement, cautions, loyer', () => {
    expect(titreAvenant({ no: 1, objets: [{ k: 'coloc', data: { act: 'Ajout d\'un colocataire', entrant: 'Chloé' } }] }, LBL)).toBe('Avenant n° 1 — Arrivée de Chloé');
    expect(titreAvenant({ no: 1, objets: [{ k: 'coloc', data: { act: 'Remplacement (départ + arrivée)', sortant: 'Bruno', entrant: 'Chloé' } }] }, LBL)).toBe('Avenant n° 1 — Remplacement de Bruno par Chloé');
    expect(titreAvenant({ no: 1, objets: [{ k: 'caution', data: { act: 'Mainlevée (fin de caution)', nom: 'Jean' } }] }, LBL)).toBe('Avenant n° 1 — Mainlevée de la caution Jean');
    expect(titreAvenant({ no: 1, objets: [{ k: 'loyer', data: { nouveau: '820.5' } }] }, LBL)).toBe('Avenant n° 1 — Loyer 820,50 € HC');
  });
  it('données absentes (trace ancienne) : libellé de l\'objet', () => {
    expect(titreAvenant({ no: 3, objets: [{ k: 'travaux' }, { k: 'loyer' }] }, LBL)).toBe('Avenant n° 3 — Travaux · Loyer');
    expect(titreAvenant({ no: 4, objets: [] }, LBL)).toBe('Avenant n° 4');
  });
});

describe('numeroSuivant — cas repris de avenantNumeroSuivant (v15.681)', () => {
  const bail = { debut: '2025-09-01', avenants: [] };
  it('aucun avenant → n° 1', () => {
    expect(numeroSuivant({ bailEvents: [], cle: 'F-001', bail: bail })).toBe(1);
    expect(numeroSuivant({ bailEvents: undefined, cle: 'F-001', bail: bail })).toBe(1);
  });
  it('max des avenants du bail et du journal + 1', () => {
    const b = { debut: '2025-09-01', avenants: [{ no: 1 }] };
    const ev = [{ type: 'avenant', ref: 'F-001', bailDebut: '2025-09-01', no: 3, date: '2026-01-01' }];
    expect(numeroSuivant({ bailEvents: ev, cle: 'F-001', bail: b })).toBe(4);
  });
  it('les avenants du bail PRÉCÉDENT du même logement ne comptent pas', () => {
    const ev = [
      { type: 'avenant', ref: 'F-001', bailDebut: '2022-01-01', no: 1, date: '2023-01-01' },
      { type: 'avenant', ref: 'F-001', bailDebut: '2022-01-01', no: 2, date: '2024-01-01' },
    ];
    expect(numeroSuivant({ bailEvents: ev, cle: 'F-001', bail: bail })).toBe(1);
  });
  it('bail dont la date de début a été corrigée : un avenant daté après le début compte', () => {
    const ev = [{ type: 'avenant', ref: 'F-001', bailDebut: '2025-08-15', no: 1, date: '2026-02-01' }];
    expect(numeroSuivant({ bailEvents: ev, cle: 'F-001', bail: bail })).toBe(2);
  });
  it('autre logement, autre type ou supprimé → ignorés', () => {
    const ev = [
      { type: 'avenant', ref: 'F-002', bailDebut: '2025-09-01', no: 5 },
      { type: 'modif', ref: 'F-001', bailDebut: '2025-09-01', no: 6 },
      { type: 'avenant', ref: 'F-001', bailDebut: '2025-09-01', no: 7, _deleted: true },
    ];
    expect(numeroSuivant({ bailEvents: ev, cle: 'F-001', bail: bail })).toBe(1);
  });
});
