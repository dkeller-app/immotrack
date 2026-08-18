import { describe, it, expect } from 'vitest';
import {
  etatMoisLot, peutQuittancer, moisProposables, moisAQuittancer,
  retardLot, lignesRelance, niveauRelance,
  moisFrToYm, ymToMoisFr, ymRange, EPS_CENTIME
} from '../../js/core/loyers-mois.js';

// CDC-QUITTANCES-IRL étape 1 — LE socle du verdict « ce mois est-il soldé ? ».
// Invariants couverts ici : I4 (une quittance n'existe que sur un mois soldé),
// I7 (une quittance = un mois : N mois soldés → N entrées, jamais un intervalle).
// I6 (source d'imputation unique) est vérifié par loyers-invariants.test.js (scan source).

const M = (ym, hc, ch, recu) => ({ ym, hcDue: hc, chDue: ch, received: recu });

// ── Convertisseurs de mois ────────────────────────────────────────────────────
describe('moisFrToYm / ymToMoisFr', () => {
  it('lit le libellé FR stocké dans DB.quittances.mois', () => {
    expect(moisFrToYm('août 2026')).toBe('2026-08');
    expect(moisFrToYm('Août 2026')).toBe('2026-08');
    expect(moisFrToYm('décembre 2025')).toBe('2025-12');
    expect(moisFrToYm('janvier 2026')).toBe('2026-01');
  });
  it('lit aussi le format ISO', () => {
    expect(moisFrToYm('2026-08')).toBe('2026-08');
    expect(moisFrToYm('2026-08-14')).toBe('2026-08');
  });
  it('refuse ce qui n\'est pas un mois', () => {
    expect(moisFrToYm('')).toBeNull();
    expect(moisFrToYm(null)).toBeNull();
    expect(moisFrToYm('bidule')).toBeNull();
    expect(moisFrToYm('2026-13')).toBeNull();
  });
  it('round-trip', () => {
    expect(ymToMoisFr('2026-08')).toBe('août 2026');
    expect(moisFrToYm(ymToMoisFr('2026-02'))).toBe('2026-02');
    expect(ymToMoisFr('nope')).toBe('');
  });
  it('ymRange enchaîne les mois par-dessus le changement d\'année', () => {
    expect(ymRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(ymRange('2026-03', '2026-03')).toEqual(['2026-03']);
    expect(ymRange('2026-05', '2026-01')).toEqual([]);
    expect(ymRange('', '2026-01')).toEqual([]);
  });
});

// ── Le verdict : soldé / non soldé ────────────────────────────────────────────
describe('etatMoisLot — le verdict par mois', () => {
  it('mois payé au centime = soldé', () => {
    const e = etatMoisLot([M('2026-08', 600, 50, 650)]);
    expect(e.byYm['2026-08'].solde).toBe(true);
    expect(e.byYm['2026-08'].reste).toBe(0);
  });

  it('il manque 0,50 € → PAS soldé (D6 : au centime)', () => {
    const e = etatMoisLot([M('2026-08', 600, 50, 649.5)]);
    expect(e.byYm['2026-08'].solde).toBe(false);
    expect(e.byYm['2026-08'].reste).toBe(0.5);
  });

  it('un mois sans dû (vacance) n\'est pas « soldé » — rien à quittancer', () => {
    const e = etatMoisLot([M('2026-08', 0, 0, 0)]);
    expect(e.byYm['2026-08'].vacance).toBe(true);
    expect(e.byYm['2026-08'].solde).toBe(false);
  });

  // ⚠️ POLITIQUE D'ATTRIBUTION — verrou volontaire.
  // Le CDC tranche le prédicat (« retardMois[idx].loyer === 0 && .charge === 0 » de
  // `_loyerArrearsPass`) et interdit d'écrire un 7ᵉ moteur. La cascade de CE moteur solde
  // le TERME COURANT avant de récupérer les arriérés (loyer du mois → charges du mois →
  // arriérés loyer FIFO → arriérés charges FIFO). Conséquence : sur un lot en retard, c'est
  // le mois RÉCENT qui est marqué soldé, l'ancien qui porte le résidu. Le total dû et le
  // NOMBRE de mois soldés sont exacts ; seule l'étiquette de mois diffère d'une imputation
  // « plus vieux d'abord ». Ces deux tests verrouillent ce choix : s'ils tombent, c'est que
  // `_loyerArrearsPass` a changé d'ordre — décision transverse aux 5 surfaces, pas un détail.
  it('D7 — un versement de retard ne crée pas de dette neuve : le lot reste à un mois derrière', () => {
    const e = etatMoisLot([
      M('2026-08', 600, 50, 0),
      M('2026-09', 600, 50, 650)
    ]);
    expect(e.reste).toBe(650);                       // un mois de retard, pas deux
    expect(e.nbMoisNonSoldes).toBe(1);
    expect(e.byYm['2026-09'].solde).toBe(true);      // terme courant soldé
    expect(e.byYm['2026-08'].solde).toBe(false);     // le résidu reste sur le mois d'origine
  });

  it('D7 — un rattrapage réduit le retard mois par mois, sans en réinventer le calcul', () => {
    const e = etatMoisLot([
      M('2026-06', 600, 50, 0),
      M('2026-07', 600, 50, 0),
      M('2026-08', 600, 50, 1300)
    ]);
    expect(e.reste).toBe(650);                       // 1950 dus, 1300 reçus
    expect(e.byYm['2026-08'].solde).toBe(true);
    expect(e.nbMoisNonSoldes).toBe(2);
    expect(e.premierMoisNonSolde).toBe('2026-06');
  });

  it('D7 — un rattrapage INTÉGRAL solde TOUS les mois d\'un coup (D8 : 3 documents)', () => {
    const e = etatMoisLot([
      M('2026-06', 600, 50, 0),
      M('2026-07', 600, 50, 0),
      M('2026-08', 600, 50, 1950)
    ]);
    expect(e.list.every(x => x.solde)).toBe(true);
    expect(e.reste).toBe(0);
    expect(moisAQuittancer(e, [])).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('D7 — une avance couvre les mois suivants (netting), aucun retard ne naît', () => {
    const e = etatMoisLot([
      M('2026-06', 600, 50, 1950),   // 3 mois d'un coup
      M('2026-07', 600, 50, 0),
      M('2026-08', 600, 50, 0)
    ]);
    expect(e.list.every(x => x.solde)).toBe(true);
    expect(e.reste).toBe(0);
  });

  it('D10 — cascade loyer avant charges : loyer soldé, charges en souffrance', () => {
    const e = etatMoisLot([M('2026-08', 400, 250, 400)]);
    const m = e.byYm['2026-08'];
    expect(m.resteLoyer).toBe(0);
    expect(m.resteCharge).toBe(250);
    expect(m.solde).toBe(false);
    expect(m.partiel).toBe(true);
  });

  it('paiement en plusieurs fois sur le même mois → soldé', () => {
    // received est le CUMUL du mois (l'appelant agrège les mouvements).
    const e = etatMoisLot([M('2026-08', 600, 50, 300 + 350)]);
    expect(e.byYm['2026-08'].solde).toBe(true);
  });

  it('un mois hors série n\'existe pas', () => {
    const e = etatMoisLot([M('2026-08', 600, 50, 650)]);
    expect(e.byYm['2026-07']).toBeUndefined();
  });

  it('entrées invalides ignorées, ne casse pas', () => {
    const e = etatMoisLot([null, { ym: 'x' }, M('2026-08', 600, 50, 650)]);
    expect(e.list).toHaveLength(1);
    expect(etatMoisLot(null).list).toHaveLength(0);
  });

  it('graceLast neutralise le manque neuf du dernier mois (tolérance début de mois)', () => {
    const strict = etatMoisLot([M('2026-07', 600, 50, 650), M('2026-08', 600, 50, 0)]);
    const grace = etatMoisLot([M('2026-07', 600, 50, 650), M('2026-08', 600, 50, 0)], { graceLast: true });
    expect(strict.byYm['2026-08'].reste).toBe(650);
    expect(grace.byYm['2026-08'].reste).toBe(0);
  });
});

// ── I4 : une quittance n'existe que sur un mois soldé ─────────────────────────
describe('I4 — peutQuittancer refuse tout mois porteur d\'un résidu', () => {
  const etat = etatMoisLot([
    M('2026-05', 600, 120, 600),   // reste 120 de charges
    M('2026-06', 600, 120, 720),
    M('2026-07', 600, 120, 720),
    M('2026-08', 600, 120, 720)
  ]);

  it('mois soldé → autorisé', () => {
    expect(peutQuittancer(etat, '2026-06').ok).toBe(true);
    expect(peutQuittancer(etat, '2026-08').ok).toBe(true);
  });

  it('mois non soldé → refusé, avec son motif chiffré', () => {
    const g = peutQuittancer(etat, '2026-05');
    expect(g.ok).toBe(false);
    expect(g.reste).toBe(120);
    expect(g.motif).toContain('120.00');
  });

  it('mois inconnu ou vacant → refusé', () => {
    expect(peutQuittancer(etat, '2020-01').ok).toBe(false);
    expect(peutQuittancer(etatMoisLot([M('2026-08', 0, 0, 0)]), '2026-08').ok).toBe(false);
    expect(peutQuittancer(null, '2026-08').ok).toBe(false);
  });

  it('AUCUN mois retourné par moisProposables comme sélectionnable n\'a de résidu', () => {
    for (const m of moisProposables(etat, [])) {
      if (m.selectable) expect(m.reste).toBeLessThanOrEqual(EPS_CENTIME);
      else expect(m.reste).toBeGreaterThan(EPS_CENTIME);
    }
  });

  it('le mois non soldé reste VISIBLE (D4), simplement non sélectionnable', () => {
    const l = moisProposables(etat, []);
    const mai = l.find(m => m.ym === '2026-05');
    expect(mai).toBeTruthy();
    expect(mai.selectable).toBe(false);
    expect(mai.motif).toMatch(/non soldé/);
  });

  it('un mois déjà quittancé est signalé mais ne disparaît pas', () => {
    const l = moisProposables(etat, ['2026-07']);
    const juil = l.find(m => m.ym === '2026-07');
    expect(juil.dejaQuittance).toBe(true);
    expect(juil.motif).toMatch(/déjà éditée/);
  });
});

// ── I7 : une quittance = un mois ──────────────────────────────────────────────
describe('I7 — N mois soldés produisent N entrées distinctes', () => {
  it('un rattrapage qui solde 3 mois → 3 ym, jamais un intervalle', () => {
    const etat = etatMoisLot([
      M('2026-06', 600, 50, 0),
      M('2026-07', 600, 50, 0),
      M('2026-08', 600, 50, 1950)
    ]);
    const aFaire = moisAQuittancer(etat, []);
    expect(aFaire).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(new Set(aFaire).size).toBe(3);
    aFaire.forEach(ym => expect(ym).toMatch(/^\d{4}-\d{2}$/));
  });

  it('les mois déjà quittancés sortent de la liste à faire', () => {
    const etat = etatMoisLot([M('2026-07', 600, 50, 650), M('2026-08', 600, 50, 650)]);
    expect(moisAQuittancer(etat, ['2026-07'])).toEqual(['2026-08']);
    expect(moisAQuittancer(etat, new Set(['2026-07', '2026-08']))).toEqual([]);
  });
});

// ── D9/D10/D11 : la ligne « Pas à jour » et le courrier unique ────────────────
describe('retardLot — une ligne par lot (D9), loyer ET charges (D10)', () => {
  it('6 mois sans rien : une seule ligne, le cumul et le point de départ', () => {
    const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
      .map(ym => M(ym, 640, 50, 0));
    const r = retardLot(etatMoisLot(months), {});
    expect(r.enRetard).toBe(true);
    expect(r.nbMois).toBe(6);
    expect(r.depuisYm).toBe('2026-03');
    expect(r.reste).toBe(4140);
  });

  it('charges seules en souffrance', () => {
    const r = retardLot(etatMoisLot([M('2026-08', 400, 250, 400)]), {});
    expect(r.chargesSeules).toBe(true);
    expect(r.loyerSeul).toBe(false);
    expect(r.resteCharge).toBe(250);
  });

  it('lot à jour → pas de ligne', () => {
    const r = retardLot(etatMoisLot([M('2026-08', 600, 50, 650)]), {});
    expect(r.enRetard).toBe(false);
    expect(r.nbMois).toBe(0);
  });

  it('tolérance début de mois : le mois courant neuf ne crée pas de ligne, les arriérés restent', () => {
    const etat = etatMoisLot([M('2026-07', 600, 50, 650), M('2026-08', 600, 50, 0)]);
    expect(retardLot(etat, { toleranceActive: true }).enRetard).toBe(false);
    const etat2 = etatMoisLot([M('2026-07', 600, 50, 0), M('2026-08', 600, 50, 0)]);
    const r2 = retardLot(etat2, { toleranceActive: true });
    expect(r2.enRetard).toBe(true);
    expect(r2.nbMois).toBe(1);
    expect(r2.depuisYm).toBe('2026-07');
  });
});

describe('D11 — un seul courrier, dont le tableau détaille ce qui manque', () => {
  it('charges seules : une ligne de charges, pas de ligne de loyer', () => {
    const l = lignesRelance(etatMoisLot([M('2026-08', 400, 250, 400)]), {});
    expect(l).toHaveLength(1);
    expect(l[0].libelle).toMatch(/charges/i);
    expect(l[0].montant).toBe(250);
  });

  it('loyer + charges : deux lignes pour le même mois', () => {
    const l = lignesRelance(etatMoisLot([M('2026-08', 600, 50, 0)]), {});
    expect(l).toHaveLength(2);
    expect(l[0].montant).toBe(600);
    expect(l[1].montant).toBe(50);
    expect(l.every(x => x.mois === 'août 2026')).toBe(true);
  });

  it('Σ des lignes = le reste total', () => {
    const etat = etatMoisLot([M('2026-06', 600, 50, 0), M('2026-07', 600, 50, 300), M('2026-08', 600, 50, 0)]);
    const somme = lignesRelance(etat, {}).reduce((s, x) => s + x.montant, 0);
    expect(Math.round(somme * 100) / 100).toBe(etat.reste);
  });

  it('lot à jour → aucune ligne', () => {
    expect(lignesRelance(etatMoisLot([M('2026-08', 600, 50, 650)]), {})).toHaveLength(0);
  });

  it('escalade rappel → relance → mise en demeure selon l\'ancienneté', () => {
    expect(niveauRelance('2026-08', '2026-08-20')).toBe('rappel-impaye-1');
    expect(niveauRelance('2026-06', '2026-08-20')).toBe('rappel-impaye-2');
    expect(niveauRelance('2026-03', '2026-08-20')).toBe('rappel-impaye-3');
    expect(niveauRelance('2025-12', '2026-08-20')).toBe('rappel-impaye-3');
    expect(niveauRelance(null, '2026-08-20')).toBeNull();
  });
});
