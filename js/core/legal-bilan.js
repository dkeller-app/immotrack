/**
 * core/legal-bilan.js — Bilan annuel par entité (Sprint 3C LEGAL-BILAN-ANNUEL).
 *
 * Synthèse N-1 par bailleur : revenus, charges, cash-flow, vacance, occupation,
 * répartition par logement, projection N. Réutilise _compute2044 pour la
 * structure fiscale + ajoute KPIs métier.
 *
 * Utilité V1 :
 *   - PDF récapitulatif annuel envoyé au bailleur (CRG mandataire pré-requis V1.1)
 *   - Synthèse perso pour bailleur particulier
 *   - Pré-requis Sprint 3E GESTION-CRG (qui sera plus complet : mensuel + détaillé)
 */

import { _compute2044 } from './legal-2044.js';

/**
 * Calcule le bilan annuel pour une entité (= un bailleur, personne morale ou physique).
 *
 * @param {Object} db - DB global snapshot (logements, mouvements, baux, baux_historique, quittances)
 * @param {Object} stdCategories - STD_CATEGORIES global
 * @param {string} entityNom - Nom exact de l'entité dans DB.entites
 * @param {number|string} year - Année (ex 2025)
 * @returns {Object} - bilan structuré (KPIs + détail par logement + résultat fiscal)
 */
export function _computeBilanAnnuel(db, stdCategories, entityNom, year) {
  if (!db || !entityNom || !year) return null;
  const yr = String(year);
  const from = yr + '-01-01';
  const to = yr + '-12-31';
  const isAlive = e => e && !e._deleted;

  const entity = (db.entites || []).find(e => isAlive(e) && e.nom === entityNom);
  if (!entity) return null;

  // Logements de l'entité (actifs OU archivés dans l'année courante)
  const logements = (db.logements || [])
    .filter(l => isAlive(l) && l.entity === entityNom);
  const refs = logements.map(l => l.ref);

  // Baux historiques de l'entité finis dans l'année
  const bauxHist = (db.baux_historique || [])
    .filter(b => isAlive(b) && b.entity === entityNom && (b.fin >= from && b.fin <= to));

  // Calcul fiscal 2044 pour l'entité (filtre via STD_CATEGORIES)
  const fiscal = _compute2044(db.mouvements || [], stdCategories, {
    from, to, entityNom, refs
  });

  // KPIs métier par logement
  const parLogement = logements.map(l => {
    const lRefs = [l.ref];
    const lFiscal = _compute2044(db.mouvements || [], stdCategories, {
      from, to, entityNom, refs: lRefs
    });
    // Détecter période de vacance (bail courant + historiques de cette année)
    const bailCourant = (db.baux && db.baux[l.ref] && isAlive(db.baux[l.ref])) ? db.baux[l.ref] : null;
    const histsForRef = (db.baux_historique || []).filter(b => isAlive(b) && b.ref === l.ref);
    const allBails = [...(bailCourant ? [bailCourant] : []), ...histsForRef];
    const occDays = _calcOccDays(allBails, from, to);
    const totalDays = _daysBetween(from, to);
    const vacanceDays = totalDays - occDays;
    const loyerMensuelMoyen = bailCourant ? Number(bailCourant.hc || 0) : (histsForRef.length ? Number(histsForRef[histsForRef.length-1].hc || 0) : 0);
    return {
      ref: l.ref,
      type: l.type,
      imm: l.imm,
      locataire: l.locataire || (allBails.length ? '(historique)' : 'Vacant'),
      occDays,
      vacanceDays,
      tauxOccupation: totalDays > 0 ? Math.round(occDays / totalDays * 1000) / 10 : 0,
      revenus: lFiscal.totalRecettes,
      charges: lFiscal.totalCharges,
      cashFlow: Math.round((lFiscal.totalRecettes - lFiscal.totalCharges) * 100) / 100,
      loyerMensuelMoyen,
      manqueAGagner: Math.round((vacanceDays / 30.44) * loyerMensuelMoyen * 100) / 100
    };
  });

  // KPIs entité agrégés
  const totalRevenus = fiscal.totalRecettes;
  const totalCharges = fiscal.totalCharges;
  const totalInterets = fiscal.totalInterets;
  const cashFlow = Math.round((totalRevenus - totalCharges) * 100) / 100;
  const resultatFoncier = fiscal.resultatFoncier;
  const totalManqueAGagner = parLogement.reduce((s, l) => s + l.manqueAGagner, 0);
  const totalOccDays = parLogement.reduce((s, l) => s + l.occDays, 0);
  const totalVacanceDays = parLogement.reduce((s, l) => s + l.vacanceDays, 0);
  const tauxOccupationGlobal = (totalOccDays + totalVacanceDays) > 0
    ? Math.round(totalOccDays / (totalOccDays + totalVacanceDays) * 1000) / 10
    : 0;

  return {
    entity: { id: entity.id, nom: entity.nom, type: entity.type, siren: entity.siren },
    year: yr,
    period: { from, to },
    kpis: {
      totalRevenus,
      totalCharges,
      totalInterets,
      cashFlow,
      resultatFoncier,
      totalManqueAGagner: Math.round(totalManqueAGagner * 100) / 100,
      nbLogements: logements.length,
      nbBauxHist: bauxHist.length,
      tauxOccupationGlobal
    },
    fiscal,
    parLogement,
    generatedAt: new Date().toISOString()
  };
}

/** Calcule le nombre de jours d'occupation d'un logement pour la période donnée.
 *  Utilise T00:00:00 partout + `+1` pour inclure début ET fin (cohérent avec _daysBetween). */
function _calcOccDays(bails, from, to) {
  const fromTs = new Date(from + 'T00:00:00').getTime();
  const toTs = new Date(to + 'T00:00:00').getTime();
  let total = 0;
  bails.forEach(b => {
    if (!b.debut) return;
    const bStart = new Date(b.debut + 'T00:00:00').getTime();
    const bEnd = b.fin ? new Date((b.finEffective || b.fin) + 'T00:00:00').getTime() : toTs;
    const start = Math.max(bStart, fromTs);
    const end = Math.min(bEnd, toTs);
    if (end >= start) total += Math.round((end - start) / 86400000) + 1;
  });
  // Clip à la durée totale de la période (cas rare : si plusieurs baux se chevauchent)
  const maxDays = _daysBetween(from, to);
  return Math.min(total, maxDays);
}

function _daysBetween(from, to) {
  const fromTs = new Date(from + 'T00:00:00').getTime();
  const toTs = new Date(to + 'T00:00:00').getTime();
  return Math.round((toTs - fromTs) / 86400000) + 1;
}

/** Formate le bilan en texte ASCII multilignes. */
export function _formatBilanTexte(bilan) {
  if (!bilan) return '(bilan introuvable)';
  const fmt = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €';
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  BILAN ANNUEL — ' + bilan.entity.nom);
  lines.push('  Type : ' + (bilan.entity.type || 'n/a') + (bilan.entity.siren ? '  SIREN : ' + bilan.entity.siren : ''));
  lines.push('  Année : ' + bilan.year + '  (du ' + bilan.period.from + ' au ' + bilan.period.to + ')');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('▶ KPIs ENTITÉ');
  lines.push('  Revenus totaux ................. ' + fmt(bilan.kpis.totalRevenus).padStart(15));
  lines.push('  Charges totales ................ ' + fmt(bilan.kpis.totalCharges).padStart(15));
  lines.push('  Intérêts d\'emprunt ............. ' + fmt(bilan.kpis.totalInterets).padStart(15));
  lines.push('  ─────────────────────────────────────────────');
  lines.push('  Cash-flow opérationnel ......... ' + fmt(bilan.kpis.cashFlow).padStart(15));
  lines.push('  Résultat foncier (2044) ........ ' + fmt(bilan.kpis.resultatFoncier).padStart(15));
  lines.push('');
  lines.push('  Nombre de logements ............ ' + bilan.kpis.nbLogements);
  lines.push('  Baux clôturés cette année ..... ' + bilan.kpis.nbBauxHist);
  lines.push('  Taux occupation global ......... ' + bilan.kpis.tauxOccupationGlobal + ' %');
  lines.push('  Manque à gagner cumulé ......... ' + fmt(bilan.kpis.totalManqueAGagner).padStart(15));
  lines.push('');
  lines.push('▶ DÉTAIL PAR LOGEMENT');
  lines.push('  Ref        Type      Locataire                Occ%    Revenus     Charges     Cash-flow');
  lines.push('  ─────────────────────────────────────────────────────────────────────────────────');
  bilan.parLogement.forEach(l => {
    const ref = (l.ref || '').padEnd(10);
    const type = (l.type || '').slice(0, 8).padEnd(9);
    const loc = (l.locataire || '').slice(0, 25).padEnd(26);
    const occ = String(l.tauxOccupation).padStart(5) + '%';
    const rev = fmt(l.revenus).padStart(11);
    const chg = fmt(l.charges).padStart(11);
    const cf = fmt(l.cashFlow).padStart(11);
    lines.push('  ' + ref + type + loc + ' ' + occ + ' ' + rev + ' ' + chg + ' ' + cf);
  });
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  Document généré par ImmoTrack le ' + bilan.generatedAt);
  lines.push('═══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}
