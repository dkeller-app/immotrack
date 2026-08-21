/**
 * core/loyer-bareme.js — AUDIT-SUIVI-LOYERS étape 2 (2026-07-15) : le noyau PUR qui
 * construit et fait évoluer DB.loyerBareme[] (source de vérité du loyer dans le temps).
 *
 * Une période = {ref, debut, fin|null, hc, ch, source:'bail'|'irl'|'manuel'|'cloture',
 * bailDebut, note, _deleted?}. Append-only + tombstones (transite par le blob espace_config
 * comme irlHistorique — aucune table relationnelle). Consommé en lecture par duMois()
 * (loyer-du-mois.js), qui filtre les tombstones et lit `fin` sur chaque période.
 *
 * DÉCISION Q1 (user 14/07) : chaque révision IRL porte une DATE D'EFFET EXPLICITE, jamais
 * rétroactive, jamais avant un mois déjà quittancé (le passé quittancé ne se recalcule jamais).
 * Pré-remplissage : validée avant/au 1er anniversaire de l'année → effet au 1er du mois de
 * l'anniversaire ; validée après → 1er du mois suivant la validation. Modifiable, re-validée
 * par les mêmes garde-fous (clampDateEffet).
 *
 * Fonctions PURES (aucune lecture de DB) — testées : __tests__/helpers/loyer-bareme.test.js.
 */

const _nr = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _ymd = (iso) => String(iso == null ? '' : iso).slice(0, 10);

/** '2026-03-15' | '2026-03' → '2026-03-01'. */
export function _premierDuMois(iso) {
  const s = String(iso == null ? '' : iso);
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : '';
}

/** '2026-06-20' → '2026-07-01' (franchit l'année). */
export function _premierDuMoisSuivant(iso) {
  const p = _premierDuMois(iso);
  if (!p) return '';
  let y = parseInt(p.slice(0, 4), 10);
  let m = parseInt(p.slice(5, 7), 10) + 1;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * « Montant réellement saisi » — CDC Finances §M-1 bis : l'app ne devine rien. Un champ VIDE
 * n'est pas un zéro, et un zéro doit être une SAISIE EXPLICITE.
 *
 * Ce qui se passait sans cette distinction (mesuré le 2026-08-20) : `''` passe le test
 * `!= null` puis `Number('') || 0` vaut 0 — la provision du barème tombait à 0 € pour tous les
 * mois suivants, à la première révision IRL comme au premier enregistrement du bail.
 * Le producteur de cet état est openAnnonce (index.html) : il prenait une RÉFÉRENCE VIVANTE
 * sur DB.baux[ref] et y écrivait `bail.ch = log.chargesRef || log.ch || ''` — ouvrir la modale
 * « Annonce » modifiait donc le bail en base. (Le fichier de référence importé, lui, écrit
 * `parseFloat(...)||0`, donc un 0 : il ne produit pas de chaîne vide.)
 *
 * @param {*} v valeur brute (champ de formulaire, cellule importée, valeur stockée)
 * @returns {number|null} le nombre saisi, ou null si rien ne l'a été
 */
export function montantSaisi(v) {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Premier montant réellement saisi de la chaîne des sources (bail → lot → barème en vigueur).
 * Rend null si AUCUNE source ne sait : c'est à l'appelant d'assumer son plancher, pas au
 * helper d'inventer un 0.
 */
export function premierMontantSaisi(...candidats) {
  for (const c of candidats) {
    const n = montantSaisi(c);
    if (n != null) return n;
  }
  return null;
}

/** Lendemain d'une date ISO. */
function _lendemain(iso) {
  const d = new Date(_ymd(iso) + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Veille d'une date ISO. */
function _veille(iso) {
  const d = new Date(_ymd(iso) + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Applique les garde-fous Q1 à une date d'effet (pré-remplie OU saisie par l'utilisateur) :
 *   1. jamais avant le 1er du mois de l'anniversaire de l'année en cours ;
 *   2. jamais avant/dans un mois déjà quittancé (effet ≥ 1er du mois SUIVANT le dernier quittancé).
 * Normalise toujours au 1er du mois. `ajustee` = la date a dû être remontée (à signaler dans l'UI).
 * @param {string} effetIso date d'effet proposée
 * @param {{annivMoisPremierIso?:string, dernierMoisQuittanceYm?:string}} opts
 * @returns {{effetIso:string, ajustee:boolean}}
 */
export function clampDateEffet(effetIso, opts) {
  const o = opts || {};
  let effet = _premierDuMois(effetIso);
  const propose = effet;
  const annivMin = o.annivMoisPremierIso ? _premierDuMois(o.annivMoisPremierIso) : '';
  if (annivMin && effet < annivMin) effet = annivMin;
  if (o.dernierMoisQuittanceYm) {
    const minLibre = _premierDuMoisSuivant(o.dernierMoisQuittanceYm + '-01');
    if (minLibre && effet < minLibre) effet = minLibre;
  }
  return { effetIso: effet, ajustee: effet !== propose };
}

/**
 * Pré-remplit la date d'effet d'une révision IRL (Q1) puis applique les garde-fous.
 * @param {{anniversaireIso:string, validationIso:string, dernierMoisQuittanceYm?:string}} input
 * @returns {{effetIso:string, ajustee:boolean}}
 */
export function computeDateEffetIRL(input) {
  const i = input || {};
  const anniv = _ymd(i.anniversaireIso);
  const validation = _ymd(i.validationIso);
  const annivMoisPremier = _premierDuMois(anniv);
  // Validée avant/au jour de l'anniversaire → effet au 1er du mois de l'anniversaire ;
  // validée après → 1er du mois suivant la validation.
  const propose = (validation && anniv && validation > anniv)
    ? _premierDuMoisSuivant(validation)
    : annivMoisPremier;
  return clampDateEffet(propose, { annivMoisPremierIso: annivMoisPremier, dernierMoisQuittanceYm: i.dernierMoisQuittanceYm });
}

/** Période initiale à la création d'un bail (source 'bail', fin ouverte). */
export function periodeInitialeBail(bail) {
  if (!bail || !bail.debut) return null;
  const debut = _ymd(bail.debut);
  return {
    ref: bail.ref, debut, fin: null,
    hc: Number(bail.hc) || 0, ch: Number(bail.ch) || 0,
    source: 'bail', bailDebut: debut, note: ''
  };
}

/**
 * Période vivante OUVERTE (fin==null) du lot, la plus tardive, filtrée par `ok(p)` (ref tolérante).
 * Base commune des trois sélecteurs du module — une seule boucle, un seul comportement.
 */
/** Indices de TOUTES les périodes vivantes ouvertes (fin==null) du lot (ref tolérante). */
function _openPeriodIdxs(periods, ref) {
  const want = _nr(ref);
  const out = [];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (!p || p._deleted || _nr(p.ref) !== want || p.fin != null) continue;
    out.push(i);
  }
  return out;
}

function _openPeriodIdxWhere(periods, ref, ok) {
  let idx = -1, best = '';
  for (const i of _openPeriodIdxs(periods, ref)) {
    const p = periods[i];
    if (ok && !ok(p)) continue;
    const d = _ymd(p.debut);
    if (d >= best) { best = d; idx = i; }
  }
  return idx;
}

/** Période vivante ouverte (fin==null) du lot dont le début est ≤ dateLimite (ref tolérante). */
function _openPeriodIdx(periods, ref, dateLimite) {
  return _openPeriodIdxWhere(periods, ref, dateLimite ? (p) => _ymd(p.debut) <= dateLimite : null);
}

/**
 * Ajoute une nouvelle période et clôture la période ouverte précédente du même lot à la veille
 * du nouveau début. PUR (retourne un nouveau tableau, copies des objets modifiés).
 * Idempotent : une période vivante identique (ref+debut+source+hc+ch) existe déjà → no-op
 * (le boot _applyPendingIRLRevisions rejoue les révisions à chaque démarrage).
 * @param {Array} periods barème courant
 * @param {{ref, debut, hc, ch, source, bailDebut?, note?}} nouvelle
 */
export function appliquerNouvellePeriode(periods, nouvelle) {
  const arr = (periods || []).map((p) => ({ ...p }));
  if (!nouvelle || !nouvelle.debut) return arr;
  const debut = _ymd(nouvelle.debut);
  const want = _nr(nouvelle.ref);
  const src = nouvelle.source || 'manuel';
  const hc = Number(nouvelle.hc) || 0;
  const ch = Number(nouvelle.ch) || 0;
  // Idempotence : même période vivante déjà présente ?
  const exists = arr.some((p) => p && !p._deleted && _nr(p.ref) === want && _ymd(p.debut) === debut
    && p.source === src && (Number(p.hc) || 0) === hc && (Number(p.ch) || 0) === ch);
  if (exists) return arr;
  // MÊME DATE DE DÉBUT — la nouvelle SUPERSÈDE l'ancienne. Deux révisions validées pour la
  // même date d'effet (on corrige le montant puis on revalide) laissaient DEUX périodes
  // ouvertes au même jour : reproduit à l'écran le 2026-08-20 via _applyIRLValidated appelé
  // deux fois sur 2026-09-01 (730 puis 742). Ni la clôture « à la veille » ni la borne sur la
  // suivante ne peuvent traiter ce cas — l'une donnerait fin < debut, l'autre ne voit que les
  // débuts STRICTEMENT postérieurs. Tombstone, convention du module (cf. tombstonerPeriodesDuBail) :
  // la ligne reste dans l'historique, _baremeOfLot la filtre. L'idempotence ci-dessus a déjà
  // écarté le cas « strictement identique », donc on ne supersède que sur un vrai changement.
  for (let i = 0; i < arr.length; i++) {
    const q = arr[i];
    if (!q || q._deleted || _nr(q.ref) !== want || _ymd(q.debut) !== debut) continue;
    arr[i] = { ...q, _deleted: true };
  }
  // Clôture de la période ouverte précédente (début < nouveau début).
  const idx = _openPeriodIdx(arr, nouvelle.ref, _veille(debut));
  if (idx >= 0 && _ymd(arr[idx].debut) < debut) arr[idx] = { ...arr[idx], fin: _veille(debut) };
  // AUDIT 2026-08-20 — INVARIANT DU MODULE : un lot n'a jamais deux périodes ouvertes.
  // Une période INTERCALAIRE (insérée avant une période déjà présente — révision rétro-datée,
  // correction) restait ouverte À CÔTÉ de celle qui la suit : _periodeAt retenant la plus
  // tardive dont le début est passé, le dû divergeait silencieusement selon le mois consulté.
  // C'était à chaque appelant de s'en garder (borneMinEffetBareme n'est branché que sur la
  // popup de modification du bail) ; c'est désormais garanti ici, pour les trois écrivains.
  const suivante = arr
    .filter((q) => q && !q._deleted && _nr(q.ref) === want && _ymd(q.debut) > debut)
    .map((q) => _ymd(q.debut))
    .sort()[0];
  const borne = suivante ? _veille(suivante) : null;
  // La borne est un DÉFAUT, pas une règle : une fin EXPLICITE fournie par l'appelant fait foi
  // (correction de période avec date de fin saisie). Sans cette distinction, la fin demandée
  // était silencieusement remplacée par la borne — cloturerPeriodeParDebut exige `fin == null`
  // et devenait un no-op, donc 9 mois surfacturés sur le cas mesuré. Une fin explicite plus
  // TARDIVE que la borne reste ramenée à la borne : deux périodes ouvertes restent interdites.
  let finExplicite = nouvelle.fin != null && _ymd(nouvelle.fin) ? _ymd(nouvelle.fin) : null;
  // Une fin ANTÉRIEURE au début est un non-sens : on l'ignore plutôt que d'écrire une période
  // impossible. cloturerPeriodeParDebut porte déjà ce garde ; l'appelant UI aussi — mais
  // l'invariant doit tenir dans le MODULE, pas reposer sur la discipline de qui l'appelle.
  if (finExplicite != null && finExplicite < debut) finExplicite = null;
  const fin = finExplicite != null
    ? (borne && finExplicite > borne ? borne : finExplicite)
    : borne;
  arr.push({
    ref: nouvelle.ref, debut, fin, hc, ch, source: src,
    bailDebut: nouvelle.bailDebut != null ? _ymd(nouvelle.bailDebut) : debut,
    note: nouvelle.note || ''
  });
  return arr;
}

/**
 * RÉ-ANCRAGE — la date de début d'un bail vient de changer. `debut` n'est pas un terme financier
 * (CHAMPS_FINANCIERS = hc/ch/dg) : aucune popup ne s'interpose, et sans ce geste les périodes du
 * bail gardaient l'ancien `bailDebut`. Elles devenaient « étrangères » à leur propre bail, se
 * faisaient clôturer, et une révision IRL programmée était éteinte par la porte de service.
 *
 * PUR, et volontairement PAUVRE : on ne touche QUE l'étiquette `bailDebut` — plus le `debut` de la
 * période la plus ancienne quand le bail RECULE, sans quoi les mois entre les deux dates n'ont
 * plus de période et duMois retombe sur le repli « bail », c'est-à-dire le tarif d'aujourd'hui
 * appliqué au passé. AUCUN MONTANT NE BOUGE, aucune période n'est créée ni clôturée : cette
 * fonction est appelable sur les DEUX branches de saveBail (avec ou sans popup) sans risque.
 */
export function reancrerPeriodesDuBail(periods, ref, debutPrecedent, debutNouveau) {
  const arr = (periods || []).map((p) => ({ ...p }));
  const prec = _ymd(debutPrecedent);
  const debut = _ymd(debutNouveau);
  if (!prec || !debut || prec === debut) return arr;
  const want = _nr(ref);
  let plusAncienne = -1;
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (!p || p._deleted || _nr(p.ref) !== want || _ymd(p.bailDebut) !== prec) continue;
    // Une période entièrement ANTÉRIEURE au nouveau début n'appartient plus à ce bail : la
    // ré-étiqueter la ferait apparaître sous lui dans la timeline alors qu'elle le précède.
    if (p.fin != null && _ymd(p.fin) < debut) continue;
    arr[i] = { ...p, bailDebut: debut };
    if (plusAncienne < 0 || _ymd(arr[i].debut) < _ymd(arr[plusAncienne].debut)) plusAncienne = i;
  }
  if (plusAncienne >= 0 && debut < _ymd(arr[plusAncienne].debut)) {
    arr[plusAncienne] = { ...arr[plusAncienne], debut };
  }
  return arr;
}

/**
 * Synchronise le barème avec le bail courant à chaque saveBail (création OU édition). PUR.
 *
 * LA PÉRIODE DU BAIL EST CELLE QUE LE BAIL A CRÉÉE — source 'bail'. C'est la seule que cette
 * fonction a le droit de réécrire. Les révisions IRL et les corrections datées ont leur propre
 * chemin d'écriture (appliquerNouvellePeriode, appelé sous popup de validation) : elles portent
 * le tarif en vigueur ou à venir, jamais celui des champs du formulaire de bail.
 *
 * CE QUI SE PASSAIT AVANT (mesuré en prod le 2026-08-20, v15.541) : la sélection prenait « la
 * période ouverte de plus grand début », sans distinction de source. Dès qu'une révision était
 * PROGRAMMÉE pour une date future, elle était la seule période ouverte du lot — un saveBail sans
 * le moindre changement financier (un numéro de téléphone) la ramenait au tarif du bail :
 *     AVANT  2024-01-01→2026-08-31 700+100 · 2026-09-01→ouverte 730+100 [irl]
 *     APRÈS  2024-01-01→2026-08-31 700+100 · 2026-09-01→ouverte 700+100 [irl]
 * La révision disparaissait du barème et de la timeline — DÉFINITIVEMENT :
 * _applyPendingIRLRevisions (index.html) ne réécrit jamais le barème, il ne touche que log.hc,
 * DB.baux[ref].hc et ses drapeaux. Contrairement à ce qui avait été supposé au cadrage, rien ne
 * la remettait au démarrage suivant. Toute quittance émise ensuite partait au mauvais tarif.
 *
 * Aucune horloge n'entre dans la décision : le résultat d'un enregistrement ne dépend pas de
 * l'heure à laquelle on enregistre (et reste testable sans figer la date du jour).
 *
 *   - période ouverte de source 'bail' → son hc/ch suit les termes du formulaire ;
 *   - sinon, période ouverte appartenant à CE bail (même bailDebut) → on n'y touche pas ;
 *   - sinon → création de la période initiale (bail neuf, ou re-bail après clôture).
 *
 * @param {Array} periods barème courant
 * @param {{ref, debut, hc, ch}} bail
 * @param {string} [debutPrecedent] date de début du bail AVANT cette édition, quand elle change
 */
export function synchroniserPeriodeBail(periods, bail, debutPrecedent) {
  let arr = (periods || []).map((p) => ({ ...p }));
  if (!bail || !bail.debut) return arr;
  const want = _nr(bail.ref);
  const debut = _ymd(bail.debut);
  // RE-ANCRAGE (audit) — corriger la DATE DE DÉBUT du bail n'est pas un terme financier : aucune
  // popup ne s'interpose. Sans re-ancrage, les périodes de ce bail gardaient l'ancien bailDebut,
  // devenaient « étrangères » à leur propre bail, et une révision IRL programmée se faisait
  // clôturer puis remplacer par le tarif du formulaire — le défaut du LOT 2 par la porte de
  // service. Le re-ancrage est de la pure comptabilité d'étiquette : aucun montant ne bouge.
  arr = reancrerPeriodesDuBail(arr, bail.ref, debutPrecedent, debut);
  const hcSaisi = montantSaisi(bail.hc);
  const chSaisi = montantSaisi(bail.ch);
  // source absente = barème d'avant l'introduction du champ : c'est une période de bail.
  const idx = _openPeriodIdxWhere(arr, bail.ref, (p) => (p.source || 'bail') === 'bail');
  if (idx >= 0) {
    const cur = arr[idx];
    // LOT 3 — une valeur NON SAISIE ne remplace jamais une valeur connue. `pf()` rend 0 pour
    // un champ vide et un import à colonne vide pose '' : sans ce garde-fou, un simple
    // enregistrement mettait la provision (ou le loyer) du barème à 0 € pour tous les mois
    // suivants, sans popup ni avertissement. Un 0 réellement saisi, lui, écrit bien 0.
    const hc = hcSaisi != null ? hcSaisi : (montantSaisi(cur.hc) != null ? montantSaisi(cur.hc) : 0);
    const ch = chSaisi != null ? chSaisi : (montantSaisi(cur.ch) != null ? montantSaisi(cur.ch) : 0);
    if ((Number(cur.hc) || 0) === hc && (Number(cur.ch) || 0) === ch) return arr;  // idempotent
    arr[idx] = { ...cur, hc, ch };
    return arr;
  }
  // Pas de période de bail ouverte.
  //
  // RÈGLE ABSOLUE ICI : ne jamais laisser DEUX périodes ouvertes sur un lot. _periodeAt()
  // retient la plus tardive dont le début est passé — une seconde période ouverte commençant
  // AVANT elle REPEINT donc tout le passé au tarif du bail courant, ce qu'interdit
  // l'invariant I-1. Mesuré (audit du 2026-08-20, sur les modules réels) : barème
  // 2024-01-01→2026-08-31 700+100 puis 2026-09-01 ouverte 730+100 [irl] ; corriger la DATE DE
  // DÉBUT du bail (2024-01-01 → 2024-01-15) — qui n'est pas un terme financier, donc aucune
  // popup — poussait une seconde période ouverte : juin 2025 passait de 800 € à 830 €, puis à
  // 1050 € après le re-bail suivant. Trois ans de l'ancien locataire au loyer du nouveau.
  const ouvertes = _openPeriodIdxs(arr, bail.ref);
  // Une période ouverte APPARTENANT À CE BAIL (révision IRL programmée, correction datée) porte
  // le tarif à venir : on n'y touche pas, et on ne lui en oppose pas une seconde. C'est le test
  // qui compte — pas la comparaison de dates, qui fermait la révision d'un bail dont on venait
  // de reculer la date de début (audit, résidu 1a).
  if (ouvertes.some((i) => _ymd(arr[i].bailDebut) === debut)) return arr;
  if (!ouvertes.length) {
    // Aucune période ouverte : le barème du lot est refermé (correction datée bornée, clôture).
    // Créer la période du bail à sa date de début REPASSERAIT PAR-DESSUS ce qui est déjà écrit.
    // Mesuré à l'écran : après une correction 2024-01-01→2025-12-31 à 677 € validée avec motif,
    // le saveBail suivant recréait une période 2024-01-01 au loyer du bail (662 €) et duMois
    // rendait 740 € au lieu de 755 € — la correction datée, motivée et tracée était annulée par
    // un simple enregistrement. Même famille que tout ce chantier : une saisie utilisateur
    // détruite en silence. On démarre donc APRÈS la dernière période vivante du lot.
    let finMax = '';
    for (const q of arr) {
      if (!q || q._deleted || _nr(q.ref) !== want || q.fin == null) continue;
      const f = _ymd(q.fin);
      if (f > finMax) finMax = f;
    }
    const p = periodeInitialeBail(bail);
    if (p) {
      if (finMax && finMax >= debut) p.debut = _lendemain(finMax);
      arr.push(p);
    }
    return arr;
  }
  // Les périodes ouvertes restantes appartiennent à un AUTRE bail (barème mal refermé au bail
  // précédent) : on les clôture à la veille et on crée la période du bail. Une seule ouverte.
  const veilleDebut = _veille(debut);
  if (ouvertes.every((i) => _ymd(arr[i].debut) <= veilleDebut)) {
    ouvertes.forEach((i) => { arr[i] = { ...arr[i], fin: veilleDebut }; });
    const p = periodeInitialeBail(bail);
    if (p) arr.push(p);
    return arr;
  }
  // Sinon une période ouverte couvre déjà ce bail (révision IRL programmée, correction datée) :
  // elle porte le tarif à venir. On n'y touche pas, et on n'en crée surtout pas une seconde.
  return arr;
}

/** Clôture (pose une fin) la période ouverte d'un lot — au re-bail / départ. PUR. */
export function cloturerBareme(periods, ref, finIso) {
  const arr = (periods || []).map((p) => ({ ...p }));
  const fin = _ymd(finIso);
  if (!fin) return arr;
  const idx = _openPeriodIdx(arr, ref, null);
  if (idx >= 0) arr[idx] = { ...arr[idx], fin };
  return arr;
}

/**
 * Clôture CIBLÉE par (ref, debut) — audit HISTORIQUE-BAIL-ONGLET 17/07 : le chemin « fin
 * explicite » d'une correction de période doit fermer LA période insérée, pas la période
 * ouverte la plus récente du lot (cloturerBareme), sinon la vivante se corrompt (fin < debut).
 * No-op si fin < debut ou période introuvable. PUR.
 */
export function cloturerPeriodeParDebut(periods, ref, debutIso, finIso) {
  const want = _nr(ref);
  const debut = _ymd(debutIso);
  const fin = _ymd(finIso);
  if (!debut || !fin || fin < debut) return (periods || []).map((p) => ({ ...p }));
  return (periods || []).map((p) => {
    if (p && !p._deleted && _nr(p.ref) === want && _ymd(p.debut) === debut && p.fin == null) {
      return { ...p, fin };
    }
    return { ...p };
  });
}

/** Tombstone toutes les périodes vivantes d'un bail donné (bailDebut) d'un lot. PUR. */
export function tombstonerPeriodesDuBail(periods, ref, bailDebut) {
  const want = _nr(ref);
  const bd = _ymd(bailDebut);
  return (periods || []).map((p) => {
    if (p && !p._deleted && _nr(p.ref) === want && _ymd(p.bailDebut) === bd) return { ...p, _deleted: true };
    return { ...p };
  });
}
