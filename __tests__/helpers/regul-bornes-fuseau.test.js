/**
 * CHARGES (régul) — bornes d'occupation décalées d'un jour en fuseau UTC+ (Paris).
 *
 * Bug constaté le 27/09 : un bail couvrant 01/01/2026 → 31/12/2026 s'affichait « 31/12/2025 →
 * 30/12/2026 » ; un bail débutant le 01/04/2026 affichait « 31/03/2026 ». Cause : les dates sont
 * construites à minuit LOCAL (`new Date(x + 'T00:00:00')`) puis formatées par `toISOString()`
 * (UTC) → la veille. Pas qu'un souci d'affichage : `debutOcc/finOcc` bornent le rattachement des
 * loyers (provisions), des charges directes et des parts de compteur à la bonne occupation.
 *
 * Même défaut dans `_ccLogOccupations` (segments des compteurs collectifs, comparés aux
 * `debutOcc/finOcc` de `computeRegul`) : les deux doivent être corrigés ENSEMBLE, sinon une
 * rotation de locataires rattache la part du nouvel occupant à l'ancien.
 *
 * Les fonctions testées sont les VRAIES fonctions d'index.html (extraites, évaluées avec des
 * stubs minimaux). Aucun calcul d'argent n'est modifié : seules les bornes sont en jeu (R-0).
 */

// Fuseau forcé AVANT toute construction de date (le bug n'existe qu'en UTC+).
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => {
  html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, '');
});

/** Corps d'une fonction de premier niveau (même découpe que les autres tests de câblage). */
function corpsDe(src, nom) {
  const re = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(src);
  if (!m) return null;
  const fin = src.indexOf('\n}', m.index);
  return fin === -1 ? null : src.slice(m.index, fin + 2);
}

const _isAlive = (x) => !!x && !x._deleted;

/** computeRegul réelle, branchée sur un DB de test (catégories et moteur compteur stubés). */
function chargerRegul(DB, calcCc = () => ({ parts: [], totaux: {} })) {
  const src = corpsDe(html, 'computeRegul');
  const iso = corpsDe(html, '_isoLocal');
  // eslint-disable-next-line no-new-func
  return new Function(
    'DB', '_isAlive', '_isLoyerCategory', '_isChargeRecupCategory', '_calcCcRepartition',
    'CC_REPARTITION_LABELS', 'fd',
    iso + '\n' + src + '\nreturn computeRegul;'
  )(
    DB, _isAlive,
    (c) => c === 'Loyers encaissés',
    (c) => c === 'Charges récupérables',
    calcCc,
    {}, (s) => s
  );
}

/** _ccLogOccupations réelle, avec les baux du logement fournis directement. */
function chargerOccupations(bails) {
  const src = corpsDe(html, '_ccLogOccupations');
  const iso = corpsDe(html, '_isoLocal');
  // eslint-disable-next-line no-new-func
  return new Function('_getAllBailsForLog', iso + '\n' + src + '\nreturn _ccLogOccupations;')(() => bails);
}

const LOG = { ref: 'TIL-A1', imm: 'Tilleuls' };
const dbAvec = ({ bail = null, historique = [], mouvements = [], entites = [] }) => ({
  logements: [LOG],
  baux: bail ? { 'TIL-A1': bail } : {},
  baux_historique: historique,
  mouvements,
  entites,
});
/** Jour ISO n jours après le 01/01/2026 (arithmétique UTC, indépendante du fuseau). */
const jour2026 = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86400000).toISOString().slice(0, 10);

describe('0 · garde-fou du test', () => {
  it('le fuseau est bien UTC+ (sinon le test serait vrai par le vide)', () => {
    expect(new Date('2026-01-01T00:00:00').getTimezoneOffset()).toBeLessThan(0);
  });
  it('les fonctions testées existent dans index.html', () => {
    expect(corpsDe(html, 'computeRegul')).toBeTruthy();
    expect(corpsDe(html, '_ccLogOccupations')).toBeTruthy();
    expect(corpsDe(html, '_isoLocal')).toBeTruthy();
  });
});

describe('1 · computeRegul — bornes d\'occupation au jour près', () => {
  it('bail couvrant toute la fenêtre → 01/01 → 31/12 (pas 31/12 → 30/12)', () => {
    const res = chargerRegul(dbAvec({ bail: { debut: '2025-06-01', fin: '', ch: 50, locataires: [{ nom: 'Alice' }] } }))('2026-01-01', '2026-12-31');
    const e = res.entries['TIL-A1'];
    expect(e.debutOcc).toBe('2026-01-01');
    expect(e.finOcc).toBe('2026-12-31');
    expect(e.occDays).toBe(365);
  });

  it('bail débutant le 01/04/2026 → occupation à partir du 01/04 (pas du 31/03)', () => {
    const res = chargerRegul(dbAvec({ bail: { debut: '2026-04-01', fin: '', ch: 50, locataires: [{ nom: 'Alice' }] } }))('2026-01-01', '2026-12-31');
    expect(res.entries['TIL-A1'].debutOcc).toBe('2026-04-01');
    expect(res.entries['TIL-A1'].finOcc).toBe('2026-12-31');
  });
});

describe('2 · rotation de locataires — rattachement au bon occupant', () => {
  // A (historique) jusqu'au 30/06, B (courant) depuis le 01/07.
  const rotation = (mouvements) => dbAvec({
    bail: { debut: '2026-07-01', fin: '', ch: 60, locataires: [{ nom: 'Bruno' }] },
    historique: [{ ref: 'TIL-A1', debut: '2024-01-01', fin: '2026-06-30', ch: 40, locataires: [{ nom: 'Alice' }] }],
    mouvements,
  });

  it('charge directe datée du dernier jour de A (30/06) → sur A, pas sur B', () => {
    const res = chargerRegul(rotation([
      { id: 1, date: '2026-06-30', cat: 'Charges récupérables', db: 120, qui: 'TIL-A1', lib: 'Facture eau' },
    ]))('2026-01-01', '2026-12-31');
    expect(res.entries['TIL-A1|h0'].charges).toBe(120);
    expect(res.entries['TIL-A1'].charges).toBe(0);
  });

  it('loyer encaissé le 30/06 → provision du mois de juin comptée pour A, pas pour B', () => {
    const res = chargerRegul(rotation([
      { id: 2, date: '2026-06-30', cat: 'Loyers encaissés', cr: 540, qui: 'TIL-A1', lib: 'Loyer juin' },
    ]))('2026-01-01', '2026-12-31');
    expect(res.entries['TIL-A1|h0'].moisDetails.map((x) => x.mois)).toEqual(['2026-06']);
    expect(res.entries['TIL-A1'].provisions).toBe(0);
  });

  it('charge directe datée du 31/12 → dans l\'occupation de B (dernier jour de la fenêtre)', () => {
    const res = chargerRegul(rotation([]))('2026-01-01', '2026-12-31');
    const b = res.entries['TIL-A1'];
    expect(b.debutOcc).toBe('2026-07-01');
    expect(b.finOcc).toBe('2026-12-31');
    expect('2026-12-31' >= b.debutOcc && '2026-12-31' <= b.finOcc).toBe(true);
  });
});

describe('3 · _ccLogOccupations — segments des compteurs collectifs au jour près', () => {
  it('rotation A → 31/03 puis B ← 01/04 : segments alignés sur les baux', () => {
    const occ = chargerOccupations([
      { debut: '2025-01-01', fin: '2026-03-31', nom: 'Alice', _type: 'hist' },
      { debut: '2026-04-01', fin: '', nom: 'Bruno', _type: 'current' },
    ])(LOG, '2026-01-01', '2026-12-31');
    expect(occ.segments.map((s) => [s.locataire, s.debut, s.fin, s.occDays])).toEqual([
      ['Alice', '2026-01-01', '2026-03-31', 90],
      ['Bruno', '2026-04-01', '2026-12-31', 275],
    ]);
  });

  it('vacance avant un bail débutant juste après le passage à l\'heure d\'été (29/03) → fin 29/03', () => {
    const occ = chargerOccupations([{ debut: '2026-03-30', fin: '', nom: 'Bruno', _type: 'current' }])(LOG, '2026-01-01', '2026-12-31');
    const vac = occ.segments.find((s) => s.isBailleur);
    expect([vac.debut, vac.fin, vac.occDays]).toEqual(['2026-01-01', '2026-03-29', 88]);
    const b = occ.segments.find((s) => !s.isBailleur);
    expect([b.debut, b.fin]).toEqual(['2026-03-30', '2026-12-31']);
  });

  it('vacance après un bail finissant le jour du passage à l\'heure d\'hiver (25/10) → début 26/10', () => {
    const occ = chargerOccupations([{ debut: '2025-01-01', fin: '2026-10-25', nom: 'Alice', _type: 'hist' }])(LOG, '2026-01-01', '2026-12-31');
    expect(occ.segments.map((s) => [s.isBailleur, s.debut, s.fin, s.occDays])).toEqual([
      [false, '2026-01-01', '2026-10-25', 298],
      [true, '2026-10-26', '2026-12-31', 67],
    ]);
  });

  it('les segments couvrent toute la fenêtre, jour pour jour, quel que soit le jour de fin (changements d\'heure compris)', () => {
    // Fenêtre 01/01 → J, bail terminé la veille de J : 1 jour occupé… + 1 jour de vacance bailleur.
    // Avant : fenêtre finissant le 30/03 (lendemain du passage à l'heure d'été) → le dernier jour
    // de vacance disparaissait (curseur à 01:00 > fin de fenêtre) → sa part n'allait à personne.
    const ecarts = [];
    const bail = { debut: '2025-01-01', fin: '', nom: 'Alice', _type: 'hist' };
    const occupations = chargerOccupations([bail]); // compilée une fois, le bail est muté à chaque tour
    for (let n = 1; n < 365; n++) {
      const J = jour2026(n);
      bail.fin = jour2026(n - 1);
      const occ = occupations(LOG, '2026-01-01', J);
      const somme = occ.segments.reduce((s, x) => s + x.occDays, 0);
      if (somme !== occ.totalDays) ecarts.push(`${J} : ${somme}/${occ.totalDays}`);
    }
    expect(ecarts).toEqual([]);
  });

  it('fenêtre finissant le 30/03 (lendemain de l\'heure d\'été), bail fini le 29/03 → 1 jour de vacance le 30/03', () => {
    const occ = chargerOccupations([{ debut: '2025-01-01', fin: '2026-03-29', nom: 'Alice', _type: 'hist' }])(LOG, '2026-03-29', '2026-03-30');
    expect(occ.segments.map((s) => [s.isBailleur, s.debut, s.fin, s.occDays])).toEqual([
      [false, '2026-03-29', '2026-03-29', 1],
      [true, '2026-03-30', '2026-03-30', 1],
    ]);
  });
});

describe('4 · compteur collectif de bout en bout — la part de chaque occupant lui revient', () => {
  it('rotation A → 31/03 puis B ← 01/04 (deux baux historiques) : 365 € → 90 € pour A, 275 € pour B', () => {
    const bails = [
      { debut: '2025-01-01', fin: '2026-03-31', nom: 'Alice', _type: 'hist' },
      { debut: '2026-04-01', fin: '2027-06-30', nom: 'Bruno', _type: 'hist' },
    ];
    const occupations = chargerOccupations(bails);
    // Répartition au prorata des jours, sur les VRAIS segments de _ccLogOccupations.
    const calcCc = (im, cc, logs, montant, from, to) => {
      const occ = occupations(LOG, from, to);
      return {
        parts: occ.segments.filter((s) => !s.isBailleur).map((s) => ({
          ref: 'TIL-A1', methode: 'jours', debut: s.debut, fin: s.fin,
          montant: Math.round((montant * s.occDays / occ.totalDays) * 100) / 100,
        })),
        totaux: {},
      };
    };
    const res = chargerRegul(dbAvec({
      historique: [
        { ref: 'TIL-A1', debut: '2025-01-01', fin: '2026-03-31', ch: 40, locataires: [{ nom: 'Alice' }] },
        { ref: 'TIL-A1', debut: '2026-04-01', fin: '2027-06-30', ch: 60, locataires: [{ nom: 'Bruno' }] },
      ],
      entites: [{ id: 1, immeubles: [{ nom: 'Tilleuls', compteursCollectifs: [{ id: 'cc1', nom: 'Eau froide' }] }] }],
      mouvements: [{ id: 3, date: '2026-12-15', cat: 'Charges récupérables', db: 365, compteurCcId: 'cc1', imm: 'Tilleuls', lib: 'Facture eau' }],
    }), calcCc)('2026-01-01', '2026-12-31');
    expect(res.entries['TIL-A1|h0'].charges).toBe(90);
    expect(res.entries['TIL-A1|h1'].charges).toBe(275);
  });
});
