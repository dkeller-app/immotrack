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

  // ── A1. Cas partiel ────────────────────────────────────────────────────
  it('cas partiel : intitulé REÇU + montant reçu + solde restant dû affichés', () => {
    const out = buildQuittanceDoc({ ...base, montantRecu: 300, montantDu: 650 });
    expect(out.status).toBe('partiel');
    expect(out.html).toMatch(/REÇU/i);
    expect(out.html).toMatch(/300/);
    expect(out.html).toMatch(/350/); // solde = 650 - 300
  });

  // ── A2. Cas non-payé : pas de "QUITTANCE DE LOYER" (risque légal) ─────
  it('cas non-payé : NE porte PAS l\'intitulé QUITTANCE DE LOYER, titre neutre non-acquitté', () => {
    const out = buildQuittanceDoc({ ...base, montantRecu: 0, montantDu: 650 });
    expect(out.status).toBe('non-paye');
    expect(out.html).not.toMatch(/QUITTANCE DE LOYER/i);
    expect(out.html).toMatch(/NON ACQUITT|AVIS D.ÉCHÉANCE/i);
  });

  it('cas non-payé : montantRecu négatif traité comme non-payé aussi', () => {
    const out = buildQuittanceDoc({ ...base, montantRecu: -50, montantDu: 650 });
    expect(out.status).toBe('non-paye');
    expect(out.html).not.toMatch(/QUITTANCE DE LOYER/i);
  });

  // ── A3. Charges nulles : pas de crash, montant dû = HC seul ────────────
  it('charges nulles : pas de crash, montant dû (650) affiché', () => {
    const out = buildQuittanceDoc({ ...base, montantDu: 650, montantRecu: 650 });
    expect(out.html).toMatch(/650/);
  });

  // ── A4. Prorata ─────────────────────────────────────────────────────────
  it('prorata : affiche "12" jours sur "30"', () => {
    const out = buildQuittanceDoc({ ...base, prorata: { jours: 12, joursMois: 30 } });
    expect(out.html).toMatch(/12/);
    expect(out.html).toMatch(/30/);
  });

  // ── B6. Échappement HTML ────────────────────────────────────────────────
  it('échappe le nom du bailleur contre injection HTML', () => {
    const out = buildQuittanceDoc({ ...base, bailleur: { ...base.bailleur, nom: '<script>x</script>' } });
    expect(out.html).not.toContain('<script>x</script>');
    expect(out.html).toMatch(/&lt;script&gt;/);
  });

  it('échappe une dateEmission malformée (repli fd() non parsable)', () => {
    const out = buildQuittanceDoc({ ...base, dateEmission: '<b>x' });
    expect(out.html).not.toContain('<b>x');
    expect(out.html).toMatch(/&lt;b&gt;x/);
  });

  it('échappe une datePaiement malformée', () => {
    const out = buildQuittanceDoc({ ...base, datePaiement: '<i>y' });
    expect(out.html).not.toContain('<i>y');
    expect(out.html).toMatch(/&lt;i&gt;y/);
  });

  it('échappe une date de naissance locataire malformée', () => {
    const out = buildQuittanceDoc({ ...base, locataires: [{ nom: 'Marie Martin', civilite: 'Mme', ddn: '<u>z' }] });
    expect(out.html).not.toContain('<u>z');
    expect(out.html).toMatch(/&lt;u&gt;z/);
  });

  // ── B7. Filename slugifié ────────────────────────────────────────────────
  it('filename slugifié : minuscules, sans espace ni slash', () => {
    const out = buildQuittanceDoc({ ...base, periode: { mois: 'Avril / Mai', annee: 2026 } });
    expect(out.filename).toMatch(/^quittance-[a-z0-9-]+-2026\.pdf$/);
    expect(out.filename).not.toMatch(/[ /]/);
  });
});
