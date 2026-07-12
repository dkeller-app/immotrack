import { describe, it, expect } from 'vitest';
import { buildQuittanceDoc } from '../../js/core/doc-quittance.js';
const base = {
  bailleur: { nom: 'SCI DUPONT', type: 'SCI', siege: '1 rue A 67000 STRASBOURG', gerant: 'Jean Dupont' },
  locataires: [{ nom: 'Marie Martin', civilite: 'Mme' }],
  bien: { adresse: '2 rue B 67000 STRASBOURG' },
  periode: { mois: 'avril', annee: 2026 },
  dateEmission: '2026-05-02', datePaiement: '2026-04-03',
  montantDu: 650, montantRecu: 650,
};
describe('buildQuittanceDoc', () => {
  it('retourne html + filename', () => {
    const out = buildQuittanceDoc(base);
    expect(out).toHaveProperty('html'); expect(out).toHaveProperty('filename');
    expect(typeof out.html).toBe('string');
  });
  it('porte la mention loi du 6 juillet 1989', () => {
    expect(buildQuittanceDoc(base).html).toMatch(/6 juillet 1989/);
  });
  it('cas complet : intitulé QUITTANCE', () => {
    expect(buildQuittanceDoc(base).html).toMatch(/QUITTANCE/i);
  });
});
