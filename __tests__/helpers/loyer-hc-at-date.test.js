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
