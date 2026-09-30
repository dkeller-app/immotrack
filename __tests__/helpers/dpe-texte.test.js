/**
 * Tests de lecture des coûts d'un DPE (chantier ANNONCES, D7). Phrases ANONYMISÉES reprises de
 * 3 DPE réels (2024-2025) : aucune donnée réelle ni PDF dans le dépôt.
 */
import { describe, it, expect } from 'vitest';
import { lireCoutsDpe, estFourchette } from './dpe-texte.js';

describe('lireCoutsDpe', () => {
  it('formulation réelle 2024-2025 (fourchette + 3 années)', () => {
    const t = 'Estimation des coûts annuels : entre 450 € et 670 € par an, prix moyens des énergies indexés sur les années 2021, 2022, 2023 Méthode : 3CL-DPE 2021';
    const r = lireCoutsDpe(t);
    expect(r.depenses).toBe('entre 450 € et 670 € par an');
    expect(r.annees).toBe('2021, 2022, 2023');
    expect(r.depensesSrc).toContain('entre 450');
    expect(r.anneesSrc).toContain('indexés sur les années 2021');
  });
  it('milliers avec espaces insécables et retours à la ligne (pdf.js)', () => {
    const t = 'voir p.3 pour voir les détails par poste. entre 6 610 € et 9 020 €\npar an Prix moyens des énergies\nindexés sur les années 2021, 2022, 2023 (abonnements compris)';
    const r = lireCoutsDpe(t);
    expect(r.depenses).toBe('entre 6 610 € et 9 020 € par an');
    expect(r.annees).toBe('2021, 2022, 2023');
  });
  it('années séparées par « et »', () => {
    expect(lireCoutsDpe('Prix moyens des énergies indexés sur les années 2022 et 2023').annees).toBe('2022, 2023');
  });
  it('repli « indexés au 1er janvier 2021 »', () => {
    const r = lireCoutsDpe('entre 810 € et 1 140 € par an. Prix moyens des énergies indexés au 1er janvier 2021 (abonnements compris)');
    expect(r.depenses).toBe('entre 810 € et 1 140 € par an');
    expect(r.annees).toBe('2021');
  });
  it('rien trouvé → chaînes vides, jamais d\'exception', () => {
    expect(lireCoutsDpe('Constat de risque d\'exposition au plomb')).toEqual({ depenses: '', depensesSrc: '', annees: '', anneesSrc: '' });
    expect(lireCoutsDpe(null).depenses).toBe('');
  });
  it('fourchette incohérente (min > max) ignorée', () => {
    expect(lireCoutsDpe('entre 900 € et 100 € par an').depenses).toBe('');
  });
});

describe('estFourchette', () => {
  it('fourchette DPE vs chiffre ADEME', () => {
    expect(estFourchette('entre 450 € et 670 € par an')).toBe(true);
    expect(estFourchette('1234 €')).toBe(false);
    expect(estFourchette('')).toBe(false);
    expect(estFourchette(null)).toBe(false);
  });
});
