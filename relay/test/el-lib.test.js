// el-lib.js — fonctions pures de la page /l (smoke 14/10 : « Nouveau » = quittance d'avril alors qu'août existe ;
// confirmation de l'accord).
import { describe, it, expect } from 'vitest';
import { cleMois, rangDocument, plusRecentDabord, documentNouveau, confirmationAccord } from '../public/el-lib.js';

const MAINTENANT = Date.parse('2026-10-14T16:00:00Z');
const q = (periode, publieMs, extra = {}) => ({ id: periode, type: 'quittance', titre: 'Quittance ' + periode, periode, date_doc: '2026-10-14', publie_le: new Date(MAINTENANT - publieMs).toISOString(), ...extra });

describe('cleMois', () => {
  it('mois français, avec ou sans accent, ou AAAA-MM', () => {
    expect(cleMois('avril 2026')).toBe('2026-04');
    expect(cleMois('août 2026')).toBe('2026-08');
    expect(cleMois('AOUT 2026')).toBe('2026-08');
    expect(cleMois('décembre 2025')).toBe('2025-12');
    expect(cleMois('2026-03')).toBe('2026-03');
    expect(cleMois('du 01/01/2026 au 31/12/2026')).toBe('');
    expect(cleMois(null)).toBe('');
  });
});

describe('documentNouveau — le plus récent par période, pas par ordre de publication', () => {
  // Cas du smoke : 4 quittances rééditées le même jour, avril publiée EN DERNIER.
  const docs = [q('août 2026', 4000), q('juin 2026', 3000), q('mai 2026', 2000), q('avril 2026', 1000)];
  it('août 2026 ressort, même si avril a été publiée la dernière', () => {
    expect(documentNouveau(docs, MAINTENANT).periode).toBe('août 2026');
    expect(documentNouveau([...docs].reverse(), MAINTENANT).periode).toBe('août 2026');
  });
  it('un document publié PLUS TARD que le lot reste mis en avant (décompte ancien, avenant daté du passé)', () => {
    const jours = (n) => n * 864e5;
    const octobre = q('octobre 2026', jours(13), { date_doc: '2026-10-01' });          // publiée le 01/10
    const decompte = { id: 'd', type: 'decompte', titre: 'Décompte 2025', date_doc: '2026-03-15', publie_le: new Date(MAINTENANT - 1000).toISOString() };   // publié le 14/10
    expect(documentNouveau([octobre, decompte], MAINTENANT).id).toBe('d');
    // même jour de publication : la période départage (cas du smoke)
    const memeJour = { ...decompte, id: 'd2', publie_le: new Date(MAINTENANT - 500).toISOString() };
    expect(documentNouveau([...docs, { ...memeJour, type: 'bail', date_doc: '2026-01-01' }], MAINTENANT).periode).toBe('août 2026');
  });
  it('au-delà de 30 jours : rien n\'est mis en avant ; hors quittance : date du document', () => {
    expect(documentNouveau([q('août 2026', 31 * 864e5)], MAINTENANT)).toBeNull();
    const bail = { id: 'b', type: 'bail', titre: 'Bail signé', date_doc: '2026-10-01', publie_le: new Date(MAINTENANT - 1000).toISOString() };
    const avenant = { id: 'a', type: 'avenant', titre: 'Avenant', date_doc: '2026-10-10', publie_le: new Date(MAINTENANT - 9000).toISOString() };
    expect(documentNouveau([bail, avenant], MAINTENANT).id).toBe('a');
    expect(documentNouveau([], MAINTENANT)).toBeNull();
    expect(documentNouveau(null, MAINTENANT)).toBeNull();
  });
  it('plusRecentDabord : tri stable des quittances par période décroissante', () => {
    expect([...docs].sort(plusRecentDabord).map((d) => d.periode)).toEqual(['août 2026', 'juin 2026', 'mai 2026', 'avril 2026']);
    expect(rangDocument(q('août 2026', 1))).toBe('2026-08-01');
    expect(rangDocument({ type: 'bail', date_doc: '2026-03-02T10:00:00Z' })).toBe('2026-03-02');
    expect(rangDocument({ type: 'bail', publie_le: '2026-03-05T10:00:00Z' })).toBe('2026-03-05');
  });
});

describe('confirmationAccord', () => {
  const fdh = (s) => '14/10/2026 à 18 h 00';
  it('donner / retirer : message daté', () => {
    expect(confirmationAccord(true, { donne_le: 'x' }, fdh)).toBe('Accord enregistré le 14/10/2026 à 18 h 00.');
    expect(confirmationAccord(false, { retire_le: 'x' }, fdh)).toBe('Accord retiré le 14/10/2026 à 18 h 00.');
  });
  it('sans date renvoyée par le serveur : message sans date, jamais « undefined »', () => {
    expect(confirmationAccord(true, {}, fdh)).toBe('Accord enregistré.');
    expect(confirmationAccord(false, null, fdh)).toBe('Accord retiré.');
  });
});
