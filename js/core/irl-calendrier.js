/**
 * core/irl-calendrier.js — CDC-QUITTANCES-IRL étape 5 : LE CALENDRIER DES RÉVISIONS.
 *
 * Répond à « quand ? » et « est-ce encore possible ? ». Le « combien ? » reste au calcul
 * d'indice existant (`computeIRLRevision`), et le « à partir de quand exactement ? » aux
 * garde-fous Q1 déjà codés (`computeDateEffetIRL` / `clampDateEffet`, loyer-bareme.js) —
 * ce module ne les redouble pas.
 *
 * Décisions encodées :
 *   D12 — l'effet est au 1ᵉʳ JOUR DU MOIS de l'anniversaire du bail. Bail du 15/09 →
 *         effet au 01/09 de chaque année (et non au jour anniversaire).
 *   D13 — la révision est proposée UN MOIS AVANT : elle apparaît le 1ᵉʳ du mois précédent
 *         (effet 01/09 → à partir du 01/08), pas à 30 jours glissants.
 *   D15 — PRESCRIPTION art. 17-1 : au-delà d'un an après la date d'effet prévue, le cycle
 *         est fermé. Il n'est plus proposé ; il bascule en « ⌛ Perdue », informatif. Seul
 *         le CYCLE EN COURS reste révisable, sur le loyer ACTUEL.
 *   D17 — les non-révisables (DPE F/G gelé, bail < 1 an, indice non publié) sont VISIBLES
 *         mais muets : hors du compteur, sans action demandée.
 *
 * Invariants : I8 (prescription), I9 (rappel M-1), I10 (loyer gelé DPE F/G).
 * Pur / testable : aucune lecture de DB, aucun `new Date()` implicite — `todayISO` est injecté.
 * Tests : __tests__/helpers/irl-calendrier.test.js
 */

const _an = (iso) => parseInt(String(iso || '').slice(0, 4), 10);
const _mo = (iso) => parseInt(String(iso || '').slice(5, 7), 10);
const _ok = (iso) => /^\d{4}-\d{2}-\d{2}/.test(String(iso || ''));

/** États possibles d'une révision. Les trois derniers sont MUETS (D17/D15). */
export const ETAT = Object.freeze({
  A_PREPARER: 'a-preparer',   // dans le mois de rappel de l'effet à venir (D13)
  EN_RETARD: 'en-retard',     // effet prévu passé, jamais appliqué, cycle encore ouvert
  FAITE: 'faite',             // le cycle en cours est appliqué (ou renoncé)
  RIEN: 'rien',               // rien à faire maintenant
  GEL: 'gel',                 // DPE F ou G — loi Climat (I10)
  TROP_JEUNE: 'trop-jeune',   // bail de moins d'un an
  INDICE_MANQUANT: 'indice-manquant'  // trimestre non publié par l'INSEE
});

/** Les états qui ne demandent RIEN et ne comptent pas dans le badge (D17). */
export const ETATS_MUETS = Object.freeze([ETAT.GEL, ETAT.TROP_JEUNE, ETAT.INDICE_MANQUANT]);

/**
 * D12 — la date d'effet du cycle d'une année : 1ᵉʳ jour du MOIS de l'anniversaire.
 * @returns {string} 'YYYY-MM-01' ('' si entrée invalide)
 */
export function effetDuCycle(debutIso, annee) {
  const m = _mo(debutIso);
  const y = parseInt(annee, 10);
  if (!m || m < 1 || m > 12 || !Number.isFinite(y)) return '';
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** D13 — le mois de RAPPEL d'un effet : le mois précédent, en entier. @returns 'YYYY-MM' */
export function moisRappel(effetIso) {
  if (!_ok(effetIso)) return '';
  let y = _an(effetIso), m = _mo(effetIso) - 1;
  if (m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Le PREMIER cycle révisable : l'année du premier anniversaire (D12 appliqué à la lettre —
 * un bail du 15/09/2023 a sa première révision au 01/09/2024, alignée sur le mois).
 */
export function premierEffet(debutIso) {
  return _ok(debutIso) ? effetDuCycle(debutIso, _an(debutIso) + 1) : '';
}

/** Même date, un an plus tard (bornes de prescription — art. 17-1). */
function _plusUnAn(iso) {
  return `${_an(iso) + 1}${String(iso).slice(4, 10)}`;
}

/**
 * Le cycle EN COURS : le dernier dont la date d'effet est déjà passée (ou du jour).
 * `null` tant que le premier anniversaire n'est pas atteint.
 */
export function cycleEnCours(debutIso, todayISO) {
  const p = premierEffet(debutIso);
  if (!p || !_ok(todayISO) || todayISO < p) return null;
  // Les cycles sont annuels : l'année du cycle en cours se déduit sans boucle.
  let annee = _an(todayISO);
  if (todayISO < effetDuCycle(debutIso, annee)) annee -= 1;
  const effetIso = effetDuCycle(debutIso, annee);
  return { annee, effetIso, rappelYm: moisRappel(effetIso) };
}

/** Le cycle SUIVANT (celui dont on prépare la lettre pendant son mois de rappel). */
export function cycleSuivant(debutIso, todayISO) {
  const cur = cycleEnCours(debutIso, todayISO);
  const annee = cur ? cur.annee + 1 : _an(premierEffet(debutIso));
  const effetIso = effetDuCycle(debutIso, annee);
  return effetIso ? { annee, effetIso, rappelYm: moisRappel(effetIso) } : null;
}

/** Un cycle est appliqué si la dernière application couvre sa date d'effet. */
function _applique(derniereApplicationIso, effetIso) {
  const d = String(derniereApplicationIso || '').slice(0, 10);
  return !!(d && effetIso && d >= effetIso);
}

/**
 * L'ÉTAT de la révision d'un lot à une date donnée — le cœur du bloc « Révisions ».
 *
 * @param {Object} input
 *   @param {string} input.debut         début du bail 'YYYY-MM-DD'
 *   @param {string} input.todayISO      date du jour 'YYYY-MM-DD'
 *   @param {string} [input.derniereApplicationIso]  `log.irlDerniereApplication`
 *   @param {boolean} [input.gel]        DPE F ou G (I10) — décidé par l'appelant
 *   @param {boolean} [input.indiceManquant]  trimestre non publié (D17)
 * @returns {{etat:string, muet:boolean, cycleAnnee:number|null, effetPrevuIso:string,
 *            rappelYm:string, joursAvantEffet:number|null, premiereEffetIso:string,
 *            perdue:{annee:number, effetIso:string}|null}}
 */
export function etatRevision(input) {
  const i = input || {};
  const debut = String(i.debut || '').slice(0, 10);
  const today = String(i.todayISO || '').slice(0, 10);
  const base = {
    etat: ETAT.RIEN, muet: false, cycleAnnee: null, effetPrevuIso: '', rappelYm: '',
    joursAvantEffet: null, premiereEffetIso: premierEffet(debut), perdue: null
  };
  if (!_ok(debut) || !_ok(today)) return base;

  // I10 — le gel DPE F/G prime sur tout : aucun calendrier, aucune action.
  if (i.gel) return Object.assign(base, { etat: ETAT.GEL, muet: true });

  const suivant = cycleSuivant(debut, today);
  const cur = cycleEnCours(debut, today);

  // Bail encore dans sa première année.
  if (!cur) {
    const premier = base.premiereEffetIso;
    const rappelPremier = moisRappel(premier);
    // D13/I9 — le rappel M-1 vaut AUSSI pour la toute première révision : sans ça, le lot
    // reste « 🔒 Non révisable » pendant tout son mois de rappel, puis bascule le 1er du mois
    // suivant directement en « ⚠ en retard ». Sur un parc qui se remplit au fil de l'eau,
    // c'est la première révision de CHAQUE nouveau bail qui passe à la trappe.
    if (rappelPremier && today.slice(0, 7) === rappelPremier && !i.indiceManquant) {
      return Object.assign(base, {
        etat: ETAT.A_PREPARER, cycleAnnee: _an(premier),
        effetPrevuIso: premier, rappelYm: rappelPremier,
        joursAvantEffet: _joursEntre(today, premier)
      });
    }
    // D17 — sinon : visible, muet, avec sa première échéance.
    return Object.assign(base, {
      etat: (rappelPremier && today.slice(0, 7) === rappelPremier && i.indiceManquant)
        ? ETAT.INDICE_MANQUANT : ETAT.TROP_JEUNE,
      muet: true,
      effetPrevuIso: premier,
      rappelYm: rappelPremier,
      joursAvantEffet: _joursEntre(today, premier)
    });
  }

  const curFait = _applique(i.derniereApplicationIso, cur.effetIso);

  // D15 — PRESCRIPTION : le cycle PRÉCÉDENT jamais réclamé est présumé abandonné
  // (plus d'un an après sa date d'effet prévue). Informatif, jamais proposé (I8).
  let perdue = null;
  const precedentIso = effetDuCycle(debut, cur.annee - 1);
  if (precedentIso && precedentIso >= base.premiereEffetIso
      && !_applique(i.derniereApplicationIso, precedentIso)
      && today >= _plusUnAn(precedentIso)) {
    perdue = { annee: cur.annee - 1, effetIso: precedentIso };
  }

  // Le cycle en cours n'a pas été réclamé : il reste ouvert (moins d'un an), donc proposable.
  // D14 : la date d'effet réelle sera recalée par les garde-fous Q1 (jamais rétroactive).
  if (!curFait) {
    if (i.indiceManquant) {
      return Object.assign(base, {
        etat: ETAT.INDICE_MANQUANT, muet: true, cycleAnnee: cur.annee,
        effetPrevuIso: cur.effetIso, rappelYm: cur.rappelYm, perdue
      });
    }
    return Object.assign(base, {
      etat: ETAT.EN_RETARD, cycleAnnee: cur.annee, effetPrevuIso: cur.effetIso,
      rappelYm: cur.rappelYm, joursAvantEffet: _joursEntre(today, cur.effetIso), perdue
    });
  }

  // Le cycle en cours est fait. Reste-t-il le RAPPEL du cycle suivant (D13/I9) ?
  if (suivant && today.slice(0, 7) === suivant.rappelYm) {
    if (i.indiceManquant) {
      return Object.assign(base, {
        etat: ETAT.INDICE_MANQUANT, muet: true, cycleAnnee: suivant.annee,
        effetPrevuIso: suivant.effetIso, rappelYm: suivant.rappelYm, perdue
      });
    }
    return Object.assign(base, {
      etat: ETAT.A_PREPARER, cycleAnnee: suivant.annee, effetPrevuIso: suivant.effetIso,
      rappelYm: suivant.rappelYm, joursAvantEffet: _joursEntre(today, suivant.effetIso), perdue
    });
  }

  return Object.assign(base, {
    etat: ETAT.FAITE, cycleAnnee: cur.annee, effetPrevuIso: cur.effetIso,
    rappelYm: cur.rappelYm,
    joursAvantEffet: suivant ? _joursEntre(today, suivant.effetIso) : null, perdue
  });
}

function _joursEntre(aIso, bIso) {
  if (!_ok(aIso) || !_ok(bIso)) return null;
  const a = new Date(aIso + 'T00:00:00'), b = new Date(bIso + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * D16 — LE CALENDRIER type Gantt : douze mois glissants à partir du mois courant,
 * une ligne par lot. Pur : l'appelant fournit déjà l'état de chaque lot.
 *
 * @param {Array<{ref:string, libelle?:string, etat:Object}>} lots
 *        `etat` = sortie de etatRevision
 * @param {string} todayISO
 * @returns {{mois:Array<{ym:string, mois:number, annee:number, courant:boolean}>,
 *            lignes:Array<{ref:string, libelle:string, cells:Array<{ym:string, kind:string, label:string}>}>}}
 *        kind ∈ '' | 'rappel' | 'effet' | 'faite' | 'gel'
 *        Un effet passé est PROJETÉ sur sa prochaine occurrence annuelle : le calendrier
 *        montre quand la prochaine échéance retombe, pas une colonne vide.
 */
export function ganttRevisions(lots, todayISO) {
  const today = String(todayISO || '').slice(0, 10);
  const mois = [];
  if (_ok(today)) {
    let y = _an(today), m = _mo(today);
    for (let k = 0; k < 12; k++) {
      mois.push({ ym: `${y}-${String(m).padStart(2, '0')}`, mois: m, annee: y, courant: k === 0 });
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  const fenetre = new Set(mois.map((m) => m.ym));
  // Un effet PASSÉ (cycle en retard, lot gelé, indice manquant) ne tomberait dans aucune
  // colonne : on le PROJETTE sur sa prochaine occurrence annuelle, qui est bien dans la
  // fenêtre — le calendrier montre « quand ça retombe », pas « quand ça aurait dû ».
  const projete = (ym) => {
    if (!ym) return '';
    let y = parseInt(ym.slice(0, 4), 10);
    const mm = ym.slice(4);
    for (let k = 0; k < 12; k++) { if (fenetre.has(y + mm)) return y + mm; y++; }
    return '';
  };
  const lignes = (lots || []).map((l) => {
    const e = (l && l.etat) || {};
    const effetYm = projete(String(e.effetPrevuIso || '').slice(0, 7));
    const rappelYm = effetYm ? moisRappel(effetYm + '-01') : '';
    // D17 — un lot non révisable (gelé, bail trop jeune, indice manquant) n'a ni bande de
    // rappel ni pavé d'effet : une seule case grise, qui dit pourquoi.
    const muet = !!e.muet;
    const cells = mois.map((mm) => {
      let kind = '', label = '';
      if (muet) {
        if (effetYm && mm.ym === effetYm) {
          kind = 'gel';
          label = e.etat === ETAT.GEL ? 'loyer gelé' : (e.etat === ETAT.TROP_JEUNE ? 'bail < 1 an' : 'non révisable');
        }
      } else if (effetYm) {
        if (mm.ym === effetYm) {
          kind = (e.etat === ETAT.FAITE) ? 'faite' : 'effet';
          label = '01/' + effetYm.slice(5, 7);
        } else if (mm.ym === rappelYm) { kind = 'rappel'; label = 'rappel'; }
      }
      return { ym: mm.ym, kind, label };
    });
    return { ref: (l && l.ref) || '', libelle: (l && l.libelle) || '', cells, etat: e.etat };
  });
  return { mois, lignes };
}

/**
 * V3/V4 (CDC-LOYERS-DESIGN) — LE RUBAN DES RÉVISIONS : douze tuiles, un chiffre par mois.
 *
 * Il REMPLACE le Gantt « 1 lot × 12 mois » (33 lignes sur le parc réel, l'un des postes
 * qui faisaient monter l'écran Loyers à 3 691 px). Aucun calendrier n'est recalculé :
 * ce ruban n'est qu'une AGRÉGATION en colonnes de `ganttRevisions` — même fenêtre, mêmes
 * projections, mêmes états. Le détail par mois (quels lots) reste atteignable au clic, ce
 * que le Gantt donnait en occupant douze fois plus de place.
 *
 * @param {{mois:Array, lignes:Array}} gantt sortie de ganttRevisions
 * @returns {{mois:Array<{ym:string, mois:number, annee:number, courant:boolean,
 *            nbEffet:number, nbFaite:number, nbGel:number, nbRappel:number,
 *            effet:Array, faite:Array, gel:Array}>, totalEffet:number, totalGel:number}}
 */
export function rubanRevisions(gantt) {
  const g = gantt || { mois: [], lignes: [] };
  const par = new Map();
  (g.mois || []).forEach((m) => par.set(m.ym, {
    ym: m.ym, mois: m.mois, annee: m.annee, courant: !!m.courant,
    nbEffet: 0, nbFaite: 0, nbGel: 0, nbRappel: 0, effet: [], faite: [], gel: []
  }));
  for (const l of (g.lignes || [])) {
    for (const c of (l.cells || [])) {
      const b = par.get(c.ym);
      if (!b || !c.kind) continue;
      const info = { ref: l.ref, libelle: l.libelle, etat: l.etat, label: c.label };
      if (c.kind === 'effet') { b.nbEffet++; b.effet.push(info); }
      else if (c.kind === 'faite') { b.nbFaite++; b.faite.push(info); }
      else if (c.kind === 'gel') { b.nbGel++; b.gel.push(info); }
      else if (c.kind === 'rappel') { b.nbRappel++; }
    }
  }
  const mois = [...par.values()];
  return {
    mois,
    totalEffet: mois.reduce((s, m) => s + m.nbEffet, 0),
    totalGel: mois.reduce((s, m) => s + m.nbGel, 0)
  };
}
