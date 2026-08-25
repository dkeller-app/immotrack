/**
 * core/bail-historique.js — HISTORIQUE-BAIL-ONGLET (2026-07-17).
 *
 * Assemble l'« Historique du bail » affiché INLINE dans l'onglet Bail de la fiche
 * logement : un CHAPITRE par bail (courant + clos), chacun portant un `rail`
 * chronologique décroissant qui mélange PÉRIODES du barème (DB.loyerBareme) et
 * ÉVÉNEMENTS (bail signé, DG versé/restitué, révisions IRL/renonciations,
 * modifications manuelles du barème, traces DB.bailEvents, fin de bail).
 *
 * Décisions user 17/07 : le DG est un événement de la timeline (pas un bloc à part),
 * l'historique couvre TOUTES les évolutions tous baux confondus, accordéon par bail.
 *
 * Module PUR : aucune lecture de DB, `today` injecté (jamais Date.now — testable,
 * même contrainte que loyer-du-mois.js). Les compteurs de quittances et le statut
 * DG « versé/partiel » (qui dépendent des mouvements) restent des décorations UI.
 */

const _nr = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _ymd = (iso) => String(iso == null ? '' : iso).slice(0, 10);

/** Libellé locataires d'un bail ('' si inconnu). */
function _locataires(bail) {
  if (!bail) return '';
  if (Array.isArray(bail.locataires) && bail.locataires.length) {
    return bail.locataires.map((l) => l && l.nom).filter(Boolean).join(', ');
  }
  return bail.locataire || '';
}

/** Poids de tri à date égale : la période s'affiche AU-DESSUS des événements du même jour,
 *  et bail-debut ferme le chapitre (tout en bas du rail). */
function _poids(item) {
  if (item.kind === 'periode') return 3;
  const t = item.ev.type;
  if (t === 'bail-debut') return 0;
  if (t === 'dg-verse') return 1;
  return 2;
}

function _pushEv(rail, ev, dateTri) {
  rail.push({ kind: 'evenement', ev, dateTri: _ymd(dateTri) });
}

/**
 * Construit les chapitres de l'historique du bail d'un lot.
 * @param {{ref:string, today:string, bailCourant:Object|null, bauxHistorique:Array,
 *          bareme:Array, irlHistorique:Array, bailEvents:Array}} input
 * @returns {{chapitres:Array}}
 */
export function construireHistoriqueBail(input) {
  const i = input || {};
  const want = _nr(i.ref);
  const today = _ymd(i.today);

  // ── Chapitres : bail courant + baux archivés (ref tolérante, tombstones exclus,
  //    index GLOBAL conservé pour openBailHist).
  const chapitres = [];
  const cur = i.bailCourant;
  if (cur && !cur._deleted && _nr(cur.ref) === (want || _nr(cur.ref))) {
    chapitres.push({
      statut: 'courant', bail: cur, histIdx: null,
      bailDebut: _ymd(cur.debut), debut: _ymd(cur.debut), fin: null,
      locataires: _locataires(cur), rail: []
    });
  }
  const clos = [];
  (i.bauxHistorique || []).forEach((h, idx) => {
    if (!h || h._deleted || _nr(h.ref) !== want) return;
    clos.push({
      statut: 'clos', bail: h, histIdx: idx,
      bailDebut: _ymd(h.debut), debut: _ymd(h.debut),
      fin: _ymd(h.finEffective || h.fin) || null,
      locataires: _locataires(h), rail: []
    });
  });
  clos.sort((a, b) => (b.debut || '').localeCompare(a.debut || ''));
  chapitres.push(...clos);
  if (!chapitres.length) return { chapitres };

  // Rattachement par plage de dates [debut, fin] (fallback : chapitre le plus récent).
  const _byRange = (dateIso) => {
    const d = _ymd(dateIso);
    for (const c of chapitres) {
      if (!c.debut) continue;
      if (d >= c.debut && (c.fin == null || d <= c.fin)) return c;
    }
    return null;
  };
  const _byBailDebut = (bd) => chapitres.find((c) => c.bailDebut === _ymd(bd)) || null;

  // ── Événements fondateurs de chaque chapitre : bail-debut, DG versé, DG restitué, fin de bail.
  for (const c of chapitres) {
    const b = c.bail;
    _pushEv(c.rail, {
      type: 'bail-debut', date: c.debut,
      hc0: Number(b.hc) || 0, ch0: Number(b.ch) || 0, dg: Number(b.dg) || 0,
      locataires: c.locataires, typeContrat: b.typeContrat || '',
      signe: !!(b.signatures && b.signatures.signedAt)
    }, c.debut);
    if ((Number(b.dg) || 0) > 0) {
      _pushEv(c.rail, { type: 'dg-verse', date: c.debut, montant: Number(b.dg) || 0 }, c.debut);
    }
    // I-DATE (CDC-LOYERS-DESIGN §4, surface 7) — une restitution N'EST DATÉE QUE PAR SON
    // VIREMENT. Avant, la carte se déclenchait aussi sur `dgRestitueMontant` et se datait de
    // la fin du bail : une restitution enregistrée sans date faisait apparaître « Dépôt de
    // garantie restitué le <fin du bail> » — une date FABRIQUÉE — sur le même rail que la
    // carte « ⏳ À restituer », qui elle disait vrai. Deux cartes contradictoires.
    // Le montant seul ne date rien : il donne une carte distincte, qui dit ce qui manque.
    if (_ymd(b.dgRestitueAt)) {
      _pushEv(c.rail, {
        type: 'dg-restitue', date: _ymd(b.dgRestitueAt),
        montant: Number(b.dgRestitueMontant) || 0, dgVerse: Number(b.dg) || 0,
        retenues: b.dgDetailRetenues || ''
      }, _ymd(b.dgRestitueAt));
    } else if (b.dgRestitueMontant != null) {
      _pushEv(c.rail, {
        type: 'dg-restitue-sans-date',
        montant: Number(b.dgRestitueMontant) || 0, dgVerse: Number(b.dg) || 0,
        retenues: b.dgDetailRetenues || ''
      }, c.fin || c.debut);
    }
    if (c.statut === 'clos') {
      _pushEv(c.rail, {
        type: 'fin-bail', date: c.fin || c.debut,
        motif: b.finMotif || '', auto: !!b._archivedAuto,
        finTheorique: (_ymd(b.fin) && c.fin && _ymd(b.fin) !== c.fin) ? _ymd(b.fin) : ''
      }, c.fin || c.debut);
    }
  }

  // ── Périodes du barème (+ événements 'modif' pour les périodes source:'manuel').
  for (const p of (i.bareme || [])) {
    if (!p || _nr(p.ref) !== want) continue;
    if (p._deleted) {
      // AUDIT 24/08 (I2) — un tombstone QUI PORTE SA RAISON n'est pas un néant : c'est une
      // saisie que l'app a écartée, et elle doit le dire. Le commentaire du module de barème
      // affirmait « la ligne reste dans l'historique » ; c'était faux, ce filtre l'effaçait.
      // Mesuré : après deux validations IRL à la même date d'effet, la ligne 730 € disparaissait
      // de la timeline. Les tombstones SANS raison (stock legacy, purges) restent invisibles.
      const cd = _byBailDebut(p.bailDebut) || _byRange(p.debut) || chapitres[0];
      const dd = _ymd(p.debut);
      const total = (Number(p.hc) || 0) + (Number(p.ch) || 0);
      if (p._remplaceePar) {
        const r = p._remplaceePar;
        _pushEv(cd.rail, {
          type: 'periode-remplacee', date: dd, avant: total,
          apres: (Number(r.hc) || 0) + (Number(r.ch) || 0), motif: p.note || ''
        }, dd);
      } else if (p._annuleeParCloture) {
        _pushEv(cd.rail, {
          type: 'periode-annulee', date: dd, avant: total,
          dateEffet: _ymd(p._annuleeParCloture), motif: p.note || ''
        }, dd);
      }
      continue;
    }
    const c = _byBailDebut(p.bailDebut) || _byRange(p.debut) || chapitres[0];
    const debut = _ymd(p.debut);
    const fin = p.fin != null ? _ymd(p.fin) : null;
    const periode = {
      debut, fin, hc: Number(p.hc) || 0, ch: Number(p.ch) || 0,
      total: (Number(p.hc) || 0) + (Number(p.ch) || 0),
      source: p.source || '', note: p.note || '',
      future: !!(today && debut > today),
      courante: !!(today && debut <= today && (fin == null || today <= fin))
    };
    c.rail.push({ kind: 'periode', periode, dateTri: debut });
    if (p.source === 'manuel') {
      _pushEv(c.rail, {
        type: 'modif', date: debut, effet: debut,
        hc: periode.hc, ch: periode.ch, note: p.note || ''
      }, debut);
    }
    // Audit 17/07 (mineur 2) : « Loyer initial » de la carte bail-debut = la PREMIÈRE période
    // source 'bail' du chapitre (le hc du bail VIVANT est muté par les IRL/modifs).
    if (p.source === 'bail') {
      const bd = c.rail.find((r) => r.kind === 'evenement' && r.ev.type === 'bail-debut');
      if (bd && (!bd.ev._hc0Periode || debut < bd.ev._hc0Periode)) {
        bd.ev.hc0 = periode.hc; bd.ev.ch0 = periode.ch; bd.ev._hc0Periode = debut;
      }
    }
  }

  // ── Révisions IRL / renonciations (rattachées par date d'effet puis date de validation).
  for (const h of (i.irlHistorique || [])) {
    if (!h || h._deleted || _nr(h.ref) !== want) continue;
    const date = _ymd(h.date) || _ymd(h.dateRevision);
    const effet = _ymd(h.dateEffet) || _ymd(h.dateApplication) || _ymd(h.dateRevision) || date;
    const c = _byRange(effet) || _byRange(date);
    const horsBail = !c;
    const cible = c || chapitres[0];
    if (h.action === 'renonciation') {
      _pushEv(cible.rail, {
        type: 'irl-renonce', date, ancienHC: Number(h.ancienHC) || 0, horsBail
      }, date);
    } else {
      _pushEv(cible.rail, {
        type: 'irl', date, effet,
        ancienHC: Number(h.ancienHC) || 0, nouveauHC: Number(h.nouveauHC) || 0,
        diff: Number(h.diff) || 0, irlRef: h.irlRef || '', irlVigueur: h.irlVigueur || '',
        pendingApply: !!h.pendingApply, future: !!(today && effet > today),
        dateEffetAjustee: !!h.dateEffetAjustee, horsBail
      }, date);
    }
  }

  // ── Traces hors barème (modif DG, corrections…) — DB.bailEvents, append-only.
  for (const e of (i.bailEvents || [])) {
    if (!e || e._deleted || _nr(e.ref) !== want) continue;
    const c = _byBailDebut(e.bailDebut) || _byRange(e.date) || chapitres[0];
    _pushEv(c.rail, { ...e, type: e.type || 'trace' }, e.date);
  }

  // ── Tri final du rail : date décroissante, à date égale par poids (période > événements > bail-debut).
  for (const c of chapitres) {
    c.rail.sort((a, b) => {
      const d = (b.dateTri || '').localeCompare(a.dateTri || '');
      if (d) return d;
      return _poids(b) - _poids(a);
    });
    c.nbEvenements = c.rail.filter((r) => r.kind === 'evenement').length;
  }
  return { chapitres };
}

/**
 * Bandeau « en vigueur » : période du barème couvrant `today` (+ la prochaine future).
 * @returns {{hc,ch,total,depuis,source,prochaine:{debut,hc,ch,total,note}|null}|null}
 */
export function enVigueur(ref, bareme, today) {
  const want = _nr(ref);
  const t = _ymd(today);
  let cur = null, next = null;
  for (const p of (bareme || [])) {
    if (!p || p._deleted || _nr(p.ref) !== want) continue;
    const debut = _ymd(p.debut);
    const fin = p.fin != null ? _ymd(p.fin) : null;
    if (debut <= t && (fin == null || t <= fin)) {
      if (!cur || debut > cur.depuis) {
        cur = { hc: Number(p.hc) || 0, ch: Number(p.ch) || 0,
          total: (Number(p.hc) || 0) + (Number(p.ch) || 0), depuis: debut, source: p.source || '' };
      }
    } else if (debut > t) {
      if (!next || debut < next.debut) {
        next = { debut, hc: Number(p.hc) || 0, ch: Number(p.ch) || 0,
          total: (Number(p.hc) || 0) + (Number(p.ch) || 0), note: p.note || '' };
      }
    }
  }
  if (!cur) return null;
  cur.prochaine = next;
  return cur;
}
