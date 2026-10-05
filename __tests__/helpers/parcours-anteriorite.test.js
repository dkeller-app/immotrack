import { describe, it, expect } from 'vitest';
import { completionModel } from './parcours-bien-model.js';

/**
 * R0-C · Q1 révisé — fil rouge « création d'un bien » (maquette MAQUETTE-ANTERIORITE validée 05/10) :
 * deux tâches NOUVELLES, de confort, qui n'apparaissent que là où elles comptent.
 *   - immeuble : « Date d'achat » (requise pour un bien acheté loué) ;
 *   - logement : « Situation du locataire au JJ/MM/AAAA » (à noter / à confirmer).
 */
const ent = { id: 1, nom: 'SCI S', siege: 'x', gerant: 'G' };
const imm = (extra = {}) => ({ nom: 'Ferrette', adr: '1 rue', ville: 'Ferrette', ...extra });
const log = (ref) => ({ ref, imm: 'Ferrette', entity: 'SCI S', type: 'T2', surf: 40, hc: 650 });
const tache = (m, kind, id) => m.nodes.filter((n) => n.kind === kind).flatMap((n) => n.tasks).find((t) => t.id === id);

describe('fil rouge — date d\'achat et situation du locataire', () => {
  it('sans injection : aucune tâche nouvelle (rétro-compat, aucun compteur ne bouge)', () => {
    const m = completionModel({ entite: ent, immeubles: [imm()], logements: [log('F-101')], bauxActifs: { 'F-101': { debut: '2024-08-20' } } });
    expect(tache(m, 'imm', 'dateAcquisition')).toBeUndefined();
    expect(tache(m, 'log', 'situation')).toBeUndefined();
  });
  it('date provisoire qui tronque un bail : « Date d\'achat » à faire, situation « à confirmer » (warn)', () => {
    const m = completionModel({ entite: ent, immeubles: [imm()], logements: [log('F-101')], bauxActifs: { 'F-101': { debut: '2024-08-20' } },
      suiviParLot: { 'F-101': { date: '2026-03-01', source: 'provisoire', aConfirmer: true, aNoter: true, notee: false } } });
    expect(tache(m, 'imm', 'dateAcquisition')).toMatchObject({ status: 'todo', action: 'date-achat', palier: 'confort' });
    expect(tache(m, 'log', 'situation')).toMatchObject({ label: 'Situation du locataire au 01/03/2026', status: 'warn', action: 'situation' });
  });
  it('date d\'achat saisie, situation notée : les deux tâches sont faites', () => {
    const m = completionModel({ entite: ent, immeubles: [imm({ dateAcquisition: '2026-03-01' })], logements: [log('F-101')], bauxActifs: { 'F-101': { debut: '2024-08-20' } },
      suiviParLot: { 'F-101': { date: '2026-03-01', source: 'anteriorite', aConfirmer: false, aNoter: true, notee: true } } });
    expect(tache(m, 'imm', 'dateAcquisition').status).toBe('done');
    expect(tache(m, 'log', 'situation').status).toBe('done');
  });
  it('bail commencé après le point de départ : aucune situation à noter, aucune date demandée', () => {
    const m = completionModel({ entite: ent, immeubles: [imm()], logements: [log('F-103')], bauxActifs: { 'F-103': { debut: '2025-10-01' } },
      suiviParLot: { 'F-103': { date: '2025-10-01', source: 'provisoire', aConfirmer: false, aNoter: false, notee: false } } });
    expect(tache(m, 'imm', 'dateAcquisition')).toBeUndefined();
    expect(tache(m, 'log', 'situation')).toBeUndefined();
  });
  it('les nouvelles tâches ne touchent jamais le palier LÉGAL (pctLegal inchangé)', () => {
    const base = { entite: ent, immeubles: [imm()], logements: [log('F-101')], bauxActifs: { 'F-101': { debut: '2024-08-20' } } };
    const sans = completionModel(base);
    const avec = completionModel({ ...base, suiviParLot: { 'F-101': { date: '2026-03-01', source: 'provisoire', aConfirmer: true, aNoter: true, notee: false } } });
    expect(avec.pctLegal).toBe(sans.pctLegal);
  });
});
