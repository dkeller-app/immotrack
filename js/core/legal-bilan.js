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
import { periodeEnVigueurA } from './loyer-du-mois.js';

/**
 * Calcule le bilan annuel pour une entité (= un bailleur, personne morale ou physique).
 *
 * @param {Object} db - DB global snapshot (logements, mouvements, baux, baux_historique, quittances)
 * @param {Object} stdCategories - STD_CATEGORIES global
 * @param {string} entityNom - Nom exact de l'entité dans DB.entites
 * @param {number|string} year - Année (ex 2025)
 * @returns {Object} - bilan structuré (KPIs + détail par logement + résultat fiscal)
 */
export function _computeBilanAnnuel(db, stdCategories, entityNom, year, opts) {
  if (!db || !entityNom || !year) return null;
  const yr = String(year);
  const from = yr + '-01-01';
  const to = yr + '-12-31';
  // B3 — occupation / vacance : ne PAS projeter les mois à venir. Pour l'exercice EN COURS, on borne
  // le calcul d'occupation à aujourd'hui (le fiscal et les mouvements gardent l'année pleine [from,to]).
  // opts.today (YYYY-MM-DD) injectable pour des tests déterministes ; défaut = date du jour.
  const _todayStr = (opts && opts.today) || new Date().toISOString().slice(0, 10);
  const occTo = (_todayStr >= from && _todayStr < to) ? _todayStr : to;
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
  // M-2 (CDC FINANCES §3) : le mapping des catégories perso est ENFIN passé au bilan — sans
  // lui, une charge de catégorie maison comptait dans le tableau et disparaissait du détail
  // par logement (le total ne pouvait pas égaler la somme des logements).
  const mapping = (opts && opts.mapping) || null;
  const fiscal = _compute2044(db.mouvements || [], stdCategories, {
    from, to, entityNom, refs, mapping
  });

  // KPIs métier par logement
  const parLogement = logements.map(l => {
    const lRefs = [l.ref];
    const lFiscal = _compute2044(db.mouvements || [], stdCategories, {
      from, to, entityNom, refs: lRefs, mapping
    });
    // Détecter période de vacance (bail courant + historiques de cette année)
    const bailCourant = (db.baux && db.baux[l.ref] && isAlive(db.baux[l.ref])) ? db.baux[l.ref] : null;
    const histsForRef = (db.baux_historique || []).filter(b => isAlive(b) && b.ref === l.ref);
    const occDays = _calcOccDays(bailCourant, histsForRef, from, occTo);
    const totalDays = _daysBetween(from, occTo);
    const vacanceDays = totalDays - occDays;
    // R0-H : le loyer de référence se lit au barème à la fin de la période mesurée, pas sur
    // `hists[hists.length-1]` — le dernier ÉLÉMENT du tableau, qui n'est pas le dernier bail.
    const _ctxLoyer = { bareme: db.loyerBareme || [], bailCourant, hists: histsForRef, lot: l };
    const loyerMensuelMoyen = loyerHcDuLotA(occTo, l.ref, _ctxLoyer);
    return {
      ref: l.ref,
      type: l.type,
      imm: l.imm,
      // ⚠️ Lisait `allBails`, dont la déclaration a disparu avec le changement de signature de
      // `_calcOccDays` : `ReferenceError` en mode strict, qui ne se déclenchait QUE si le cache
      // `l.locataire` était vide — c'est-à-dire exactement le cas que R0-B répare. Le bilan
      // annuel ne s'affichait plus, sans le moindre message (`openBilanAnnuel` n'a pas de
      // try/catch). Aucun test ne l'a vu : la fixture existante remplit toujours `locataire`.
      //
      // Au passage, le libellé était déjà faux : `allBails` contenait AUSSI le bail courant,
      // donc un lot loué dont le cache est vide s'affichait « (historique) ». Un bail courant
      // existe → on prend son locataire ; sinon seul l'historique justifie « (historique) ».
      locataire: l.locataire
        || (bailCourant ? _nomLocataireBail(bailCourant) : '')
        || (histsForRef.length ? '(historique)' : 'Vacant'),
      occDays,
      vacanceDays,
      tauxOccupation: totalDays > 0 ? Math.round(occDays / totalDays * 1000) / 10 : 0,
      revenus: lFiscal.totalRecettes,
      charges: lFiscal.totalCharges,
      cashFlow: Math.round((lFiscal.totalRecettes - lFiscal.totalCharges) * 100) / 100,
      loyerMensuelMoyen,
      // R0-H : chaque segment vide est valorisé au loyer de SON époque, jamais à celui
      // d'aujourd'hui. `vacanceDays` reste le total affiché, il ne sert plus de multiplicande.
      manqueAGagner: _manqueVacance(_segmentsVacants(bailCourant, histsForRef, from, occTo), l.ref, _ctxLoyer)
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

/**
 * REFONTE FINANCES étape 2 — R-4 / K-2 : occupation & vacance d'un JEU DE LOTS injecté.
 * « Passe sous le socle » : le périmètre vient de finances-scope (scopeLots), jamais d'un
 * filtre `l.entity === X` maison — les lots sans bailleur comptent enfin (P-2, constat 21).
 *   R-4 · « Occupation » = MOYENNE de la période (jours loués ÷ jours louables sur [from..to]),
 *         plus jamais un instantané. L'état du jour est rendu à part (`vacantsJour`).
 *   K-2 · manque à gagner THÉORIQUE = jours vides × loyer de référence du lot
 *         (`loyerHcRef`, repli `hc`) ÷ 30,44 — même base que la clé P-4 pour un mois sans bail,
 *         même fenêtre que le reste de la page. Il QUALIFIE le taux, ce n'est pas une créance.
 * @param {Object} db  DB (baux, baux_historique)
 * @param {Array} lots lots du périmètre (déjà filtrés par le socle)
 * @param {{from:string, to:string}} opts fenêtre ISO (YYYY-MM-DD, bornes incluses)
 */
export function _computeOccupationLots(db, lots, opts) {
  const o = opts || {};
  const from = o.from, to = o.to;
  const isAlive = (e) => e && !e._deleted;
  const r2 = (n) => Math.round(n * 100) / 100;
  let occ = 0, louable = 0, manque = 0;
  const vacantsJour = [];
  if (!from || !to || to < from) return { occDays: 0, louableDays: 0, taux: 0, manqueAGagner: 0, vacantsJour, nbLots: 0 };
  let nb = 0;
  (lots || []).forEach((l) => {
    if (!isAlive(l) || !l.ref) return;
    nb++;
    const bailCourant = (db && db.baux && db.baux[l.ref] && isAlive(db.baux[l.ref])) ? db.baux[l.ref] : null;
    const hists = ((db && db.baux_historique) || []).filter((b) => isAlive(b) && b.ref === l.ref);
    const occDays = _calcOccDays(bailCourant, hists, from, to);
    const totalDays = _daysBetween(from, to);
    const vac = Math.max(0, totalDays - occDays);
    occ += occDays; louable += totalDays;
    // R0-H : ce moteur-ci valorisait la vacance avec `lot.loyerHcRef || lot.hc`, l'autre avec
    // `bailCourant.hc` — deux sources, et la même erreur : le loyer d'aujourd'hui appliqué
    // au passé. Une seule lecture désormais, datee segment par segment.
    manque += _manqueVacance(
      _segmentsVacants(bailCourant, hists, from, to), l.ref,
      { bareme: (db && db.loyerBareme) || [], bailCourant, hists, lot: l });
    // R0-B — la vacance se lit sur le BAIL, pas sur `l.locataire`. Ce champ n'est qu'un cache
    // dénormalisé, resynchronisé au démarrage et seulement SI le bail porte un nom : un bail
    // repris à l'achat ou une saisie en cours le laissent vide. Un lot loué apparaissait alors
    // dans la liste des vacants — et un lot réellement vide, dont le cache gardait l'ancien
    // locataire, n'y apparaissait pas. Un bail clôturé mais encore présent ne loue plus rien.
    const loue = !!bailCourant && !bailCourant.cloture && !bailCourant.finEffective;
    if (!loue) {
      const fins = hists.map((b) => b.finEffective || b.fin).filter(Boolean).sort();
      vacantsJour.push({ ref: l.ref, depuis: fins.length ? fins[fins.length - 1] : null });
    }
  });
  return {
    occDays: occ, louableDays: louable,
    taux: louable > 0 ? r2(occ / louable * 100) : 0,
    manqueAGagner: r2(manque), vacantsJour, nbLots: nb
  };
}


/**
 * LE loyer HC d'un lot À UNE DATE DONNÉE — qu'il soit loué ou vide.
 *
 * R0-H : deux moteurs valorisaient la vacance, et tous deux appliquaient le loyer
 * D'AUJOURD'HUI à des jours vides PASSÉS — `bailCourant.hc` ici, `lot.loyerHcRef || lot.hc`
 * dans `_computeOccupationLots`. Deux sources, et la même infraction à I-1 (« le loyer
 * d'aujourd'hui appliqué à tout le passé ») que le CDC déclare supprimée. Un lot reloué
 * 850 € après six mois de vide, puis révisé à 900 €, se voyait imputer six mois à 900 €.
 *
 * La chaîne des sources, dans cet ordre :
 *   1. le BARÈME en vigueur à cette date — c'est l'historique du loyer, la même lecture que
 *      `duMois()` (aucun moteur concurrent) ;
 *   2. le bail EN COURS à cette date, s'il y en a un ;
 *   3. sinon le bail qui s'est terminé le plus récemment AVANT — ce que le lot valait quand
 *      il s'est vidé, qui est la bonne contrefactuelle d'une vacance ;
 *   4. le bail qui commence le plus tôt APRÈS — un lot jamais encore loué à cette date ne
 *      vaut que ce que son premier locataire acceptera ;
 *   5. la fiche du lot, en dernier recours (stock non migré) ;
 *   6. zéro, et rien d'inventé.
 */
export function loyerHcDuLotA(iso, ref, ctx) {
  const c = ctx || {};
  const d = String(iso || '').slice(0, 10);
  if (!d) return 0;
  const num = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };

  const p = periodeEnVigueurA(c.bareme || [], ref, d);
  const viaBareme = p ? num(p.hc) : null;
  if (viaBareme != null) return viaBareme;

  const baux = [];
  if (c.bailCourant) baux.push(c.bailCourant);
  (c.hists || []).forEach((b) => { if (b) baux.push(b); });

  const finDe = (b) => b.finEffective || b.fin || b._archivedAt || null;
  // R0-E : un bail dont la date de fin est passée mais qui n'est pas clôturé court toujours
  // (tacite reconduction). Même règle que `_calcOccDays` et `_bienActiveBail`.
  const enCoursA = (b) => {
    if (!b || !b.debut || String(b.debut).slice(0, 10) > d) return false;
    if (b.cloture || b.finEffective) return String(b.finEffective || '').slice(0, 10) >= d;
    return true;
  };
  // 2. le bail EN COURS. Sans lui, le 31 décembre d'un lot reloué au 1er octobre renvoyait
  //    le loyer de l'ANCIEN bail — la recherche ne regardait que les baux TERMINÉS.
  for (const b of baux) { if (enCoursA(b) && num(b.hc) != null) return num(b.hc); }
  // 3. le dernier bail TERMINÉ avant cette date, choisi sur sa date de fin — pas sur l'ordre
  //    du tableau, qui ne garantit rien (le défaut précédent prenait `hists[hists.length-1]`).
  let avant = null, finAvant = '';
  for (const b of baux) {
    const f = finDe(b);
    if (!f || String(f).slice(0, 10) >= d) continue;
    if (!avant || String(f).slice(0, 10) > finAvant) { avant = b; finAvant = String(f).slice(0, 10); }
  }
  if (avant && num(avant.hc) != null) return num(avant.hc);

  // 4. le premier bail qui COMMENCE après cette date.
  let apres = null, debutApres = '';
  for (const b of baux) {
    const deb = b.debut ? String(b.debut).slice(0, 10) : '';
    if (!deb || deb <= d) continue;
    if (!apres || deb < debutApres) { apres = b; debutApres = deb; }
  }
  if (apres && num(apres.hc) != null) return num(apres.hc);

  const lot = c.lot || null;
  return lot ? (num(lot.loyerHcRef) || num(lot.hc) || 0) : 0;
}

/**
 * Les segments VIDES d'un lot sur [from, to] — le complément exact de `_calcOccDays`, mêmes
 * règles de fin de bail (tacite reconduction comprise : seule la clôture termine un bail).
 * @returns {Array<{from:string, to:string, jours:number}>}
 */
function _segmentsVacants(bailCourant, hists, from, to) {
  const J = 86400000;
  const ts = (iso) => new Date(String(iso).slice(0, 10) + 'T00:00:00').getTime();
  // ⚠️ `toISOString()` reconvertit en UTC : à Paris, minuit local d'un 1er juillet devient
  // le 30 juin à 22 h UTC, et le segment vide commençait la VEILLE — assez pour que le bail
  // qui se terminait ce jour-là soit encore vu comme en cours, et que la vacance soit
  // valorisée au loyer du bail d'AVANT. Le découpage est local, le formatage aussi.
  const iso = (t) => { const d = new Date(t); const p2 = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const fromTs = ts(from), toTs = ts(to);
  if (!(toTs >= fromTs)) return [];

  const occ = [];
  const pousse = (b, force) => {
    if (!b || !b.debut) return;
    const finIso = b.finEffective || b.fin || b._archivedAt || null;
    const termine = force || !!(b.cloture || b.finEffective);
    const bStart = ts(b.debut);
    const bEnd = (termine && finIso) ? ts(finIso) : toTs;
    const a = Math.max(bStart, fromTs), z = Math.min(bEnd, toTs);
    if (z >= a) occ.push([a, z]);
  };
  pousse(bailCourant, false);
  (hists || []).forEach((b) => pousse(b, true));

  occ.sort((x, y) => x[0] - y[0]);
  const fusion = [];
  for (const seg of occ) {
    const dernier = fusion[fusion.length - 1];
    if (dernier && seg[0] <= dernier[1] + J) { if (seg[1] > dernier[1]) dernier[1] = seg[1]; }
    else fusion.push([seg[0], seg[1]]);
  }

  const vides = [];
  let curseur = fromTs;
  for (const [a, z] of fusion) {
    if (a > curseur) vides.push([curseur, a - J]);
    if (z + J > curseur) curseur = z + J;
  }
  if (curseur <= toTs) vides.push([curseur, toTs]);

  return vides
    .filter(([a, z]) => z >= a)
    .map(([a, z]) => ({ from: iso(a), to: iso(z), jours: Math.round((z - a) / J) + 1 }));
}

/**
 * LE manque à gagner d'une vacance : chaque segment vide est valorisé au loyer qui était en
 * vigueur à SON DÉBUT. Le barème ne bouge pas pendant une vacance (une période naît d'une
 * révision, qui suppose un bail), donc cette lecture est exacte, pas approchée.
 */
function _manqueVacance(segments, ref, ctx) {
  let total = 0;
  for (const seg of segments) total += (seg.jours / 30.44) * loyerHcDuLotA(seg.from, ref, ctx);
  return Math.round(total * 100) / 100;
}

/** Calcule le nombre de jours d'occupation d'un logement pour la période donnée.
 *  Utilise T00:00:00 partout + `+1` pour inclure début ET fin (cohérent avec _daysBetween). */
function _calcOccDays(bailCourant, hists, from, to) {
  const fromTs = new Date(from + 'T00:00:00').getTime();
  const toTs = new Date(to + 'T00:00:00').getTime();
  let total = 0;
  // R0-E — Un bail n'est PAS terminé parce que sa date de fin est passée : un bail nu non
  // dénoncé se reconduit tacitement, le locataire est là et le loyer est dû. Seule la CLÔTURE
  // termine un bail. C'est déjà la règle de `_bienActiveBail` (index.html) depuis v15.343 ;
  // ce moteur-ci ne la suivait pas, et voyait donc « vacant » le cas le plus courant du parc :
  // taux d'occupation sous-évalué et « manque à gagner » inventé sur une vacance inexistante.
  //
  // ⚠️ Portée exacte, vérifiée : ce moteur n'alimente QUE le taux d'occupation, le manque à
  // gagner et la liste des vacants. Il ne touche NI le dû, NI la clé de répartition P-4 —
  // celle-ci passe par `_occupation` (js/core/loyer-du-mois.js), qui connaît déjà la tacite
  // reconduction. Aucun montant de charges ne bouge.
  //
  // Les baux d'HISTORIQUE sont terminés par construction : on les borne toujours, sans se fier
  // à leurs drapeaux — les chemins d'archivage ne posent pas tous `cloture`. Le repli qui tient
  // réellement le stock est `_archivedAt`, posé par les trois chemins ; une entrée antérieure
  // sans AUCUNE des trois dates resterait ouverte jusqu'à la fin de la période.
  const compte = (b, force) => {
    if (!b || !b.debut) return;
    const finIso = b.finEffective || b.fin || b._archivedAt || null;
    const termine = force || !!(b.cloture || b.finEffective);
    const bStart = new Date(b.debut + 'T00:00:00').getTime();
    const bEnd = (termine && finIso) ? new Date(finIso + 'T00:00:00').getTime() : toTs;
    const start = Math.max(bStart, fromTs);
    const end = Math.min(bEnd, toTs);
    if (end >= start) total += Math.round((end - start) / 86400000) + 1;
  };
  compte(bailCourant, false);
  (hists || []).forEach((b) => compte(b, true));
  // Clip à la durée totale de la période (cas rare : si plusieurs baux se chevauchent)
  const maxDays = _daysBetween(from, to);
  return Math.min(total, maxDays);
}

/**
 * Le nom des locataires d'un bail. `log.locataire` n'est qu'un cache : un bail repris à
 * l'achat ou une saisie en cours le laisse vide, et la clôture le VIDE (`log.locataire = ''`).
 * Le bail, lui, sait toujours.
 */
function _nomLocataireBail(b) {
  if (!b) return '';
  const noms = Array.isArray(b.locataires) ? b.locataires.map((x) => x && x.nom).filter(Boolean) : [];
  return noms.join(', ') || String(b.nom || '');
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
  lines.push('  Document généré par Propryo le ' + bilan.generatedAt);
  lines.push('═══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}
