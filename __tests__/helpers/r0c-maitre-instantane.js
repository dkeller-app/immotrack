/**
 * R0-C lot 1 — INSTANTANÉ DU MAÎTRE (non-régression au centime du module Finances).
 *
 * Calcule `_computeFinancesMonthly` sur les jeux multi-lots/multi-baux du générateur, pour
 * plusieurs exercices, fenêtres (constat / numérique) et périmètres (nul / pondéré SCI).
 * La fixture `__tests__/fixtures/r0c-maitre-fiscal-avant.json` a été produite par CE fichier sur le
 * moteur NON MODIFIÉ (commit de base 8bdd5d86), AVANT toute ligne du lot 1 :
 *
 *     node __tests__/helpers/r0c-maitre-instantane.js --ecrire
 *
 * Le test compare le moteur courant à cette fixture par égalité profonde : l'extraction du
 * collecteur de loyers (ligne 211) et l'option `debutDu` (absente ici) ne doivent RIEN changer.
 * Ne JAMAIS régénérer la fixture pour faire passer le test : ce serait effacer la preuve.
 */

import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { computeConstatWindow } from '../../js/core/finances-window.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { createHash } from 'node:crypto';
import { jeuMultiLots, catLigne, isEcheance, isRecupCharge } from './r0c-jeux.js';

/** Empreinte d'une sortie complète du moteur (months + annual + byLot + bornes) : sha256 du JSON. */
const empreinte = (r) => createHash('sha256').update(JSON.stringify(r)).digest('hex');
/**
 * Trois postes ont été ajoutés au moteur APRÈS la prise de cette photo (décisions Didier) :
 * `construction` (travaux d'agrandissement) et `nonDeductible` (dépenses non déductibles), le 05/10,
 * puis `assuranceEmprunteur` (assurance de prêt prélevée à part), le 15/10 — comptés
 * dans les charges et le cash-flow. Aucun jeu ne contient ces catégories, ils y valent donc 0 — on
 * les retire QUAND ILS VALENT 0, pour que la photo d'avant reste la référence à l'octet.
 * Un poste NON NUL n'est jamais retiré : il ferait échouer la comparaison, comme il le doit.
 */
const NOUVEAUX_POSTES = ['construction', 'nonDeductible', 'assuranceEmprunteur'];
const sansNouveauxPostesNuls = (v) => {
  if (Array.isArray(v)) return v.map(sansNouveauxPostesNuls);
  if (!v || typeof v !== 'object') return v;
  const o = {};
  for (const k of Object.keys(v)) {
    if (NOUVEAUX_POSTES.includes(k) && v[k] === 0) continue;
    o[k] = sansNouveauxPostesNuls(v[k]);
  }
  return o;
};
/**
 * FINANCES-SUIVI-V2 (16/10/2026) — la photo porte sur la PARTIE FISCALE ET CASH du maître : P&L mensuel et annuel,
 * dû et encaissé par lot. Le retard, l'avance et la position par lot sont désormais calculés par le moteur
 * unique du suivi (positions de fin de mois, avance compensée — lot E du 05/10) : ils sont retirés de la
 * photo et couverts par leurs propres tests (finances-suivi-v2*.test.js). La fixture a été réécrite avec
 * cette projection sur le code de main AVANT le chantier (1fc276c5, v15.754) : le P&L ne bouge pas d'un centime.
 */
const POSTES_SUIVI = ['loyerRetard', 'chargeRetard', 'avanceLot', 'ecart', 'aRendre'];
const projectionFiscale = (r) => {
  const sansSuivi = (b) => { const o = {}; for (const k of Object.keys(b)) if (!POSTES_SUIVI.includes(k)) o[k] = b[k]; return o; };
  const byLot = {};
  for (const q of Object.keys(r.byLot || {})) {
    const L = r.byLot[q];
    byLot[q] = { months: L.months.map((m) => ({ ym: m.ym, duHC: m.duHC, duCH: m.duCH, encaisse: m.encaisse, rattrapage: m.rattrapage })),
      annual: { duHC: L.annual.duHC, duCH: L.annual.duCH, encaisse: L.annual.encaisse } };
  }
  return { months: r.months.map(sansSuivi), annual: sansSuivi(r.annual), interetsTotal: r.interetsTotal, interetsKnown: r.interetsKnown, lastMonth: r.lastMonth, dueMonth: r.dueMonth, byLot };
};
/** Forme stockée : l'annuel EN CLAIR (lisible dans un diff) + l'empreinte de la sortie (projection fiscale). */
const forme = (r0) => { const r = projectionFiscale(sansNouveauxPostesNuls(r0)); return { annual: r.annual, lots: Object.keys(r.byLot).sort(), sha256: empreinte(r) }; };

export const SEEDS_INSTANTANE = Array.from({ length: 30 }, (_, i) => 1000 + i);
export const TODAY_INSTANTANE = '2026-09-30';

export function calculerInstantane(compute = _computeFinancesMonthly) {
  const out = {};
  for (const seed of SEEDS_INSTANTANE) {
    const { lots, mouvements } = jeuMultiLots(seed);
    const byRef = Object.fromEntries(lots.map((l) => [l.ref, l.ctx]));
    const loyerDue = (q, ym) => (byRef[q] ? duMois(byRef[q], ym) : { hc: 0, ch: 0 });
    const refs = lots.map((l) => l.ref);
    // Périmètre pondéré : le 1ᵉʳ lot n'est détenu qu'à 50 % (poids SCI) — exerce scopeWeight.
    const scope = { refs };
    const scopeWeight = (s, m) => (!m || m._deleted) ? 0 : (!s ? 1 : (m.qui === refs[0] ? 0.5 : 1));
    const res = {};
    for (const year of [2023, 2024, 2025, 2026]) {
      const win = computeConstatWindow({ year, today: TODAY_INSTANTANE, mouvements });
      // Résolveur des dépenses hors 2044 ACTIF, calqué sur la production (05/10) : les jeux contiennent
      // des dépôts de garantie, des échéances de prêt et de l'eau récupérable — aucun ne doit basculer
      // dans les nouveaux postes. Sans lui, l'instantané ne prouverait rien sur la branche réelle.
      const chargeHorsFiscal = (m) => ({ 'Travaux de construction / agrandissement (non déductible)': 'construction',
        'Divers (non déductible)': 'nonDeductible' })[m && m.cat] || null;
      const base = { mouvements, year, catLigne, isEcheance, isRecupCharge, chargeHorsFiscal, loyerDue, activeLots: refs, today: TODAY_INSTANTANE };
      res[year] = {
        fenetre: forme(compute({ ...base, window: win })),
        numerique: forme(compute({ ...base, lastMonth: 7 })),
        pondere: forme(compute({ ...base, window: win, scope, scopeWeight }))
      };
    }
    out[seed] = JSON.parse(JSON.stringify(res));
  }
  return out;
}

// Écriture de la fixture (une seule fois, sur le moteur de base).
if (typeof process !== 'undefined' && process.argv && process.argv.includes('--ecrire')) {
  const fs = await import('node:fs');
  const url = await import('node:url');
  const path = await import('node:path');
  const dir = path.dirname(url.fileURLToPath(import.meta.url));
  const dest = path.join(dir, '..', 'fixtures', 'r0c-maitre-fiscal-avant.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(calculerInstantane()));
  console.log('fixture écrite :', dest, fs.statSync(dest).size, 'octets');
}
