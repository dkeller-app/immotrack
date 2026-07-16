import { describe, it, expect } from 'vitest';
import { _loyerHCAtDate } from '../../js/core/utils.js';

// Bug user 2026-07-14 : sur un lot dont la ref enregistrée dans DB.irlHistorique diffère
// légèrement de log.ref (re-bail, import, casse/espaces), le match STRICT `h.ref === log.ref`
// échouait → aucune révision trouvée → repli sur le loyer COURANT pour TOUS les mois =
// « IRL appliquée dans le passé ». Toute l'app matche les refs en tolérant (norm = trim+minuscule).
describe('_loyerHCAtDate — ref TOLÉRANTE (re-bail/import/casse) : plus de rétroactif', () => {
  const log = { ref: 'Ferrette-001', hc: 655.05 };
  it('ref identique — mai AVANT révision de juin → ancien loyer 640', () => {
    const irl = [{ ref: 'Ferrette-001', dateRevision: '2026-06-01', ancienHC: 640, nouveauHC: 655.05 }];
    expect(_loyerHCAtDate(log, '2026-05-01', irl)).toBe(640);
  });
  it('ref de casse/espaces différente — révision QUAND MÊME trouvée (avant : 655,05 rétroactif)', () => {
    const irl = [{ ref: ' ferrette-001 ', dateRevision: '2026-06-01', ancienHC: 640, nouveauHC: 655.05 }];
    expect(_loyerHCAtDate(log, '2026-05-01', irl)).toBe(640);
  });
  it('mois APRÈS la révision → nouveau loyer 655,05', () => {
    const irl = [{ ref: 'FERRETTE-001', dateRevision: '2026-06-01', ancienHC: 640, nouveauHC: 655.05 }];
    expect(_loyerHCAtDate(log, '2026-07-01', irl)).toBe(655.05);
  });
  it('aucune révision pour ce lot → loyer courant (comportement conservé)', () => {
    expect(_loyerHCAtDate(log, '2026-05-01', [{ ref: 'AUTRE-999', dateRevision: '2026-01-01', ancienHC: 1, nouveauHC: 2 }])).toBe(655.05);
  });
});

// AUDIT-SUIVI-LOYERS étape 2 (Q1) : une révision IRL porte désormais une DATE D'EFFET explicite
// (`dateEffet`) distincte de l'anniversaire (`dateRevision`, resté la clé de cycle IRL). Le loyer d'un
// mois suit la date d'EFFET (non rétroactive), jamais l'anniversaire — fin de la sur-facturation « depuis
// mars » (cause Fric : IRL validée en juin, anniversaire mars, effet au 1er juillet).
describe('_loyerHCAtDate — la DATE D\'EFFET (dateEffet) prime sur l\'anniversaire (dateRevision)', () => {
  const log = { ref: 'F-001', hc: 505.15 };
  it('cas Fric : anniversaire mars mais effet juillet → mai/juin = ANCIEN loyer (500), pas rétroactif', () => {
    const irl = [{ ref: 'F-001', dateRevision: '2026-03-01', dateEffet: '2026-07-01', ancienHC: 500, nouveauHC: 505.15 }];
    expect(_loyerHCAtDate(log, '2026-05-01', irl)).toBe(500);
    expect(_loyerHCAtDate(log, '2026-06-30', irl)).toBe(500);
  });
  it('à partir de la date d\'effet → nouveau loyer', () => {
    const irl = [{ ref: 'F-001', dateRevision: '2026-03-01', dateEffet: '2026-07-01', ancienHC: 500, nouveauHC: 505.15 }];
    expect(_loyerHCAtDate(log, '2026-07-01', irl)).toBe(505.15);
    expect(_loyerHCAtDate(log, '2026-08-15', irl)).toBe(505.15);
  });
  it('avant la 1re date d\'effet → ancienHC (initial)', () => {
    const irl = [{ ref: 'F-001', dateRevision: '2026-03-01', dateEffet: '2026-07-01', ancienHC: 500, nouveauHC: 505.15 }];
    expect(_loyerHCAtDate(log, '2026-01-15', irl)).toBe(500);
  });
  it('rétrocompat : entrée legacy SANS dateEffet → repli sur dateRevision (comportement conservé)', () => {
    const irl = [{ ref: 'F-001', dateRevision: '2026-07-01', ancienHC: 500, nouveauHC: 505.15 }];
    expect(_loyerHCAtDate(log, '2026-06-01', irl)).toBe(500);
    expect(_loyerHCAtDate(log, '2026-07-01', irl)).toBe(505.15);
  });
  it('tri par date d\'EFFET quand plusieurs révisions (effets dans le désordre de saisie)', () => {
    const irl = [
      { ref: 'F-001', dateRevision: '2027-03-01', dateEffet: '2027-04-01', ancienHC: 505.15, nouveauHC: 515 },
      { ref: 'F-001', dateRevision: '2026-03-01', dateEffet: '2026-07-01', ancienHC: 500, nouveauHC: 505.15 }
    ];
    expect(_loyerHCAtDate(log, '2026-08-01', irl)).toBe(505.15);
    expect(_loyerHCAtDate(log, '2027-05-01', irl)).toBe(515);
  });
});
