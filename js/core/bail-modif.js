/**
 * core/bail-modif.js — HISTORIQUE-BAIL-ONGLET (2026-07-17), décision user ④.
 *
 * Toute modification d'un terme FINANCIER du bail (loyer HC, provision charges,
 * dépôt de garantie) passe par une popup de validation dans saveBail :
 * ancien → nouveau, date d'effet (garde-fous Q1 : jamais rétroactive, jamais dans
 * un mois quittancé), motif obligatoire. hc/ch → nouvelle période datée du barème
 * (appliquerNouvellePeriode, source 'manuel', note = motif) ; dg → trace append-only
 * DB.bailEvents. Les autres champs du bail restent en sauvegarde simple.
 *
 * Fonctions PURES — testées : __tests__/helpers/bail-modif.test.js.
 */

import { clampDateEffet, _premierDuMoisSuivant } from './loyer-bareme.js';

const CHAMPS_FINANCIERS = [
  { champ: 'hc', label: 'Loyer hors charges' },
  { champ: 'ch', label: 'Provision charges' },
  { champ: 'dg', label: 'Dépôt de garantie' }
];

/**
 * Compare les termes financiers d'un bail avant/après édition.
 * @returns {Array<{champ,label,avant,apres}>} vide si création (prev null) ou rien de financier.
 */
export function detecterChangementsFinanciers(prev, next) {
  if (!prev || !next) return [];
  const out = [];
  for (const { champ, label } of CHAMPS_FINANCIERS) {
    const avant = Number(prev[champ]) || 0;
    const apres = Number(next[champ]) || 0;
    if (avant !== apres) out.push({ champ, label, avant, apres });
  }
  return out;
}

/**
 * Date d'effet pré-remplie d'une modification manuelle : 1er du mois SUIVANT la
 * modification, remontée si nécessaire hors des mois déjà quittancés (Q1).
 * @returns {{effetIso:string, ajustee:boolean}}
 */
export function dateEffetModifDefaut(todayIso, dernierMoisQuittanceYm) {
  const propose = _premierDuMoisSuivant(todayIso);
  return clampDateEffet(propose, { dernierMoisQuittanceYm: dernierMoisQuittanceYm || undefined });
}
