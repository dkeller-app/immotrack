import { describe, it, expect } from 'vitest';
import { duMois } from '../../js/core/loyer-du-mois.js';
import {
  clampDateEffet, computeDateEffetIRL, appliquerNouvellePeriode
} from '../../js/core/loyer-bareme.js';
import { etatRevision } from '../../js/core/irl-calendrier.js';
import { moisFrToYm } from '../../js/core/loyers-mois.js';

/**
 * CDC-QUITTANCES-IRL étape 6 — I2 : AUCUNE RÉVISION NE MODIFIE UN MOIS DÉJÀ QUITTANCÉ.
 *
 * « Pour tout `ym` porteur d'une quittance émise, `duMois` après `_applyIRLValidated`
 *   = `duMois` avant. »
 *
 * La garantie ne vient pas d'un contrôle a posteriori : elle vient de la chaîne
 *   dateEffet → clampDateEffet(dernierMoisQuittanceYm) → appliquerNouvellePeriode
 * qui ne peut PAS produire une période commençant dans un mois déjà quittancé. Ces tests
 * jouent la chaîne complète, y compris ce qu'un utilisateur peut saisir à la main dans la
 * fenêtre de validation (D18 : la date est modifiable — les garde-fous, eux, ne le sont pas).
 */

const REF = 'MUTZIG-B1';
const BAIL = { debut: '2023-09-15', hc: 700, ch: 80 };
const BAREME0 = [{ ref: REF, debut: '2023-09-15', fin: null, hc: 700, ch: 80, source: 'bail' }];
const ctx = (bareme) => ({ ref: REF, bails: [BAIL], bareme });

/** Le dernier mois quittancé, tel que l'app le calcule (libellés FR → 'YYYY-MM'). */
const dernierMoisQuittance = (quittances) => quittances
  .map(q => moisFrToYm(q.mois)).filter(Boolean).sort().pop() || null;

/** La chaîne réelle : calendrier → date d'effet pré-remplie → garde-fous → nouvelle période. */
function reviserComme_applyIRLValidated({ bareme, quittances, validationIso, saisieUtilisateur, nouveauHC }) {
  const cal = etatRevision({ debut: BAIL.debut, todayISO: validationIso, derniereApplicationIso: '2025-09-01' });
  const pre = computeDateEffetIRL({
    anniversaireIso: cal.effetPrevuIso,
    validationIso,
    dernierMoisQuittanceYm: dernierMoisQuittance(quittances)
  });
  const clamp = clampDateEffet(saisieUtilisateur || pre.effetIso, {
    annivMoisPremierIso: cal.effetPrevuIso,
    dernierMoisQuittanceYm: dernierMoisQuittance(quittances)
  });
  return {
    effetIso: clamp.effetIso, ajustee: clamp.ajustee,
    bareme: appliquerNouvellePeriode(bareme, {
      ref: REF, debut: clamp.effetIso, hc: nouveauHC, ch: BAIL.ch, source: 'irl', bailDebut: BAIL.debut
    })
  };
}

const MOIS_SUIVIS = ['2025-09', '2025-12', '2026-01', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const photo = (bareme) => MOIS_SUIVIS.map(ym => `${ym}:${duMois(ctx(bareme), ym).total}`);

describe('I2 — une révision ne recalcule jamais un mois déjà quittancé', () => {
  const QUITTANCES = [
    { logement: REF, mois: 'mai 2026' }, { logement: REF, mois: 'juin 2026' },
    { logement: REF, mois: 'juillet 2026' }
  ];

  it('cas nominal : la révision prend effet APRÈS le dernier mois quittancé', () => {
    const avant = photo(BAREME0);
    const r = reviserComme_applyIRLValidated({
      bareme: BAREME0, quittances: QUITTANCES, validationIso: '2026-08-18', nouveauHC: 733.32
    });
    expect(r.effetIso).toBe('2026-09-01');
    const apres = photo(r.bareme);
    for (const ym of ['2025-09', '2025-12', '2026-01', '2026-05', '2026-06', '2026-07', '2026-08']) {
      const i = MOIS_SUIVIS.indexOf(ym);
      expect(apres[i]).toBe(avant[i]);
    }
    expect(duMois(ctx(r.bareme), '2026-09').total).toBe(813.32);
  });

  it('l\'utilisateur saisit une date DANS un mois quittancé → elle est remontée, rien ne bouge', () => {
    const avant = photo(BAREME0);
    const r = reviserComme_applyIRLValidated({
      bareme: BAREME0, quittances: QUITTANCES, validationIso: '2026-08-18',
      saisieUtilisateur: '2026-06-01', nouveauHC: 733.32   // juin est quittancé
    });
    expect(r.ajustee).toBe(true);
    // DEUX planchers s'appliquent et le PLUS HAUT gagne : le 1er mois libre après juillet
    // (2026-08) et le 1er du mois de l'anniversaire (2026-09). Résultat : septembre.
    expect(r.effetIso).toBe('2026-09-01');
    const apres = photo(r.bareme);
    for (const ym of ['2026-05', '2026-06', '2026-07']) {
      const i = MOIS_SUIVIS.indexOf(ym);
      expect(apres[i]).toBe(avant[i]);
    }
  });

  it('l\'utilisateur saisit une date carrément rétroactive → même garantie', () => {
    const avant = photo(BAREME0);
    const r = reviserComme_applyIRLValidated({
      bareme: BAREME0, quittances: QUITTANCES, validationIso: '2026-08-18',
      saisieUtilisateur: '2024-01-15', nouveauHC: 733.32
    });
    const apres = photo(r.bareme);
    for (const ym of ['2025-09', '2025-12', '2026-01', '2026-05', '2026-06', '2026-07']) {
      const i = MOIS_SUIVIS.indexOf(ym);
      expect(apres[i]).toBe(avant[i]);
    }
    expect(r.effetIso >= '2026-08-01').toBe(true);
  });

  it('DEUX révisions successives ne touchent toujours aucun mois quittancé', () => {
    const avant = photo(BAREME0);
    const r1 = reviserComme_applyIRLValidated({
      bareme: BAREME0, quittances: QUITTANCES, validationIso: '2026-08-18', nouveauHC: 733.32
    });
    const q2 = QUITTANCES.concat([{ logement: REF, mois: 'août 2026' }, { logement: REF, mois: 'septembre 2026' }]);
    const r2 = reviserComme_applyIRLValidated({
      bareme: r1.bareme, quittances: q2, validationIso: '2027-08-18', nouveauHC: 750
    });
    const apres = photo(r2.bareme);
    for (const ym of ['2025-09', '2025-12', '2026-01', '2026-05', '2026-06', '2026-07']) {
      const i = MOIS_SUIVIS.indexOf(ym);
      expect(apres[i]).toBe(avant[i]);
    }
    // Septembre 2026 (quittancé après r1) garde le tarif issu de r1.
    expect(duMois(ctx(r2.bareme), '2026-09').total).toBe(813.32);
  });

  it('sans aucune quittance, le garde-fou anniversaire suffit — jamais de rétroactif', () => {
    const r = reviserComme_applyIRLValidated({
      bareme: BAREME0, quittances: [], validationIso: '2026-08-18',
      saisieUtilisateur: '2025-01-01', nouveauHC: 733.32
    });
    expect(r.effetIso).toBe('2026-09-01');
    expect(duMois(ctx(r.bareme), '2026-01').total).toBe(780);
  });

  it('propriété générale : pour TOUT mois quittancé, le dû est identique avant/après', () => {
    const quittances = MOIS_SUIVIS.slice(0, 7).map(ym => ({ logement: REF, mois: ym }));
    const avant = MOIS_SUIVIS.map(ym => duMois(ctx(BAREME0), ym).total);
    for (const saisie of ['2024-05-01', '2026-01-01', '2026-06-15', '2026-08-31', '']) {
      const r = reviserComme_applyIRLValidated({
        bareme: BAREME0, quittances, validationIso: '2026-08-18',
        saisieUtilisateur: saisie, nouveauHC: 999
      });
      const apres = MOIS_SUIVIS.map(ym => duMois(ctx(r.bareme), ym).total);
      quittances.forEach(q => {
        const i = MOIS_SUIVIS.indexOf(moisFrToYm(q.mois));
        expect(apres[i]).toBe(avant[i]);
      });
    }
  });
});
