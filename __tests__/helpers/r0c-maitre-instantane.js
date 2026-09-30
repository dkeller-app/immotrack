/**
 * R0-C lot 1 — INSTANTANÉ DU MAÎTRE (non-régression au centime du module Finances).
 *
 * Calcule `_computeFinancesMonthly` sur les jeux multi-lots/multi-baux du générateur, pour
 * plusieurs exercices, fenêtres (constat / numérique) et périmètres (nul / pondéré SCI).
 * La fixture `__tests__/fixtures/r0c-maitre-avant.json` a été produite par CE fichier sur le
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
/** Forme stockée : l'annuel EN CLAIR (lisible dans un diff) + l'empreinte de la sortie complète. */
const forme = (r) => ({ annual: r.annual, lots: Object.keys(r.byLot).sort(), sha256: empreinte(r) });

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
      const base = { mouvements, year, catLigne, isEcheance, isRecupCharge, loyerDue, activeLots: refs, today: TODAY_INSTANTANE };
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
  const dest = path.join(dir, '..', 'fixtures', 'r0c-maitre-avant.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(calculerInstantane()));
  console.log('fixture écrite :', dest, fs.statSync(dest).size, 'octets');
}
