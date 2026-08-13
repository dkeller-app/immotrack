/**
 * parcours-bien-model.global.js — Wrapper browser (window.ParcoursBienModel)
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    __tests__/helpers/parcours-bien-model.js
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

  // Modèle pur du fil rouge « Ajouter un bien ». Aucune dépendance DOM.
  // Décision user 2026-07-11 : Identité obligatoire pour créer un logement.

  const _s = (v) => (v == null ? '' : String(v)).trim();

  /** Champs requis pour créer un logement (les `*` de l'onglet Identité de #ov-log). */
  const LOG_REQUIRED = ['ref', 'typeUsage', 'entity', 'imm'];

  function canCreateLogement(fields) {
    const f = fields || {};
    const missing = LOG_REQUIRED.filter((k) => _s(f[k]) === '');
    return { ok: missing.length === 0, missing };
  }

  /** Champs « clés » des onglets optionnels qui font passer un logement à `complet`. */
  const LOG_OPTIONAL_KEY = ['surface', 'loyer', 'dpe'];

  // Identité « minimale » d'un logement stocké, utilisée pour le badge de complétude du
  // parcours : réf + rattachement (bailleur/immeuble). `typeUsage` reste requis pour CRÉER
  // (voir canCreateLogement) mais n'entre pas dans le badge de complétude affiché.
  const LOG_COMPLETENESS_IDENTITY = ['ref', 'entity', 'imm'];

  function logementCompleteness(log) {
    const l = log || {};
    const missingId = LOG_COMPLETENESS_IDENTITY.filter((k) => _s(l[k]) === '');
    const missingOpt = LOG_OPTIONAL_KEY.filter((k) => _num(l[k]) === '');
    if (missingId.length) return { level: 'a-completer', missing: [...missingId, ...missingOpt] };
    return { level: missingOpt.length ? 'a-completer' : 'complet', missing: missingOpt };
  }

  // Garde bloquante du parcours (mockup validé + décision user 2026-07-15) : dans le fil
  // rouge, un logement ne s'enregistre qu'avec réf + type + surface + loyer. Distinct de
  // canCreateLogement (création hors parcours, rattachement) et du badge de complétude
  // (qui ajoute le dpe). `surface`/`loyer` numériques : 0 ou vide = manquant.
  const PARCOURS_IDENTITY = ['ref', 'type', 'surface', 'loyer'];

  function identiteParcours(fields) {
    const f = fields || {};
    const missing = PARCOURS_IDENTITY.filter((k) =>
      (k === 'surface' || k === 'loyer') ? _num(f[k]) === '' : _s(f[k]) === ''
    );
    return { ok: missing.length === 0, missing };
  }

  /** Louable = identité du parcours complète (réf/type/surface/loyer). Le dpe n'y entre
   *  pas : il pèse sur le badge « complet », pas sur la possibilité de créer le bail. */
  function isRentable(log) {
    return identiteParcours(log).ok;
  }

  function immeubleCompleteness(imm) {
    const adr = _s((imm || {}).adr);
    return adr ? { level: 'complet', missing: [] } : { level: 'a-completer', missing: ['adr'] };
  }

  // `surface`/`loyer` numériques : 0 ou vide = manquant ; `dpe` textuel.
  function _num(v) {
    if (v === 0) return '';
    return _s(v);
  }

  // Une clé présente ne vaut PAS une saisie : la migration de l'app pré-remplit des
  // SQUELETTES vides (`{elec:false, …}` pour chauffage/ECS, `{cave:{present:false,num:''},
  // parking:{present:false,num:'',type:'place'}, …}` pour les annexes). `Object.keys().length`
  // ou la simple truthiness d'un sous-objet marquaient donc les tâches « done » à tort
  // (faux positifs vus en vérif navigateur 13/08). On exige une valeur RÉELLE : booléen vrai,
  // `.present === true` (sous-objet annexe), nombre > 0, chaîne non vide, ou un `customs[]`
  // non vide (zone d'ajout libre).
  function _hasRealValue(o) {
    const obj = o || {};
    return Object.keys(obj).some((k) => {
      const v = obj[k];
      if (k === 'customs') return (v || []).length > 0;
      if (v === true) return true;
      if (typeof v === 'number') return v > 0;
      if (typeof v === 'string') return _s(v) !== '';
      if (v && typeof v === 'object') return v.present === true;
      return false;
    });
  }

  const ORPHAN_LABEL = '— Sans immeuble —';

  function buildParcoursTree(entite, allLogements) {
    const ent = entite || { nom: '', immeubles: [] };
    const logs = (allLogements || []).filter((l) => l && l.entity === ent.nom);
    const immList = (ent.immeubles || []).map((im) => ({
      id: im.id,
      nom: im.nom,
      adr: im.adr || '',
      raw: im,
      completeness: immeubleCompleteness(im),
      logements: logs.filter((l) => (l.imm || '') === im.nom).map(_decorateLog),
    }));
    const known = new Set((ent.immeubles || []).map((im) => im.nom));
    const orphans = logs.filter((l) => !known.has(l.imm || '')).map(_decorateLog);
    if (orphans.length) {
      immList.push({ id: null, nom: ORPHAN_LABEL, adr: '', raw: null, synthetic: true,
        completeness: { level: 'a-completer', missing: [] }, logements: orphans });
    }
    return { bailleur: { id: ent.id, nom: ent.nom }, immeubles: immList };
  }

  function _decorateLog(l) {
    return { ...l, completeness: logementCompleteness(l) };
  }

  /**
   * Modèle du fil de complétion (écran accordéon « complétion à 100 % »). PUR : tout
   * arrive en données. `bauxActifs` = map {ref: bail} des seuls baux ACTIFS (précalculée
   * par l'appelant) ; un bail `source.import === 'acte'` est un bail repris de l'acte.
   *
   * DEUX PALIERS (décision user 2026-08-13, « il faut que le légal soit en place ») :
   * chaque tâche porte `palier` = 'legal' | 'confort'. Les tâches légales portent en plus
   * leur SOURCE (`src`, affichée à l'écran) ; aucune tâche de confort n'en porte. `full` et
   * `pctLegal` ne regardent QUE le palier légal — le confort ne fait plus baisser le vert.
   *
   * Le module reste PUR : le catalogue de diagnostics obligatoires et le calendrier
   * d'interdiction DPE (loi Climat) vivent inline dans index.html, ils sont donc INJECTÉS
   * par l'appelant, par référence de lot :
   *   - `diagsParLot` : {ref: {requis:[{key,label}], indetermines:[{key,label,cause}], fournis:[key]}}
   *   - `dpeParLot`   : {ref: {classe, interdit, raison}}
   * Entrées absentes ⇒ pas de crash (tâches en `todo`). Pour `diagsParLot`, l'ABSENCE de la
   * clé du lot (rien d'affirmable ⇒ `todo`) est distincte d'une entrée VIDE (aucun diagnostic
   * exigé pour ce bien ⇒ `done`).
   *
   * La tâche `diagnostics` porte EN PLUS le détail de l'injection, consommé par la vue pour
   * lister les pièces manquantes : `.diags = {requis:[{key,label}],
   * indetermines:[{key,label,cause}], fournis:[key]}`. Aucune autre tâche ne porte ce champ.
   *
   * @param {object} p {entite, immeuble, logements[], bauxActifs:{ref:bail}, diagsParLot, dpeParLot}
   * @returns {{nodes:[{kind,id,name,sub,badge,full,tasks:[{id,label,detail,status,action,palier,src,diags?}]}], pct:number, pctLegal:number}}
   */
  function completionModel({ entite, immeuble, logements, bauxActifs, diagsParLot, dpeParLot }) {
    const ent = entite || {}, imm = immeuble || {}, logs = logements || [], baux = bauxActifs || {};
    const diagsMap = diagsParLot || {}, dpeMap = dpeParLot || {};
    const T = (id, label, done, opts) => ({ id, label, detail: (opts && opts.detail) || '',
      status: done ? 'done' : ((opts && opts.warn) ? 'warn' : 'todo'), action: (opts && opts.action) || null,
      palier: (opts && opts.palier) || 'confort', src: (opts && opts.src) || '' });
    // Les `src` sont AFFICHÉES à l'utilisateur : elles CITENT une norme ou nomment une
    // fonction précise. Jamais de jugement (« aucun contournement »), jamais une date qu'on
    // ne peut pas soutenir (l'obligation déclarative d'occupation ne se date pas en une
    // ligne : loi de finances 2020, première campagne 2023 — on n'affiche donc aucune année).
    const SRC_BAIL_TYPE = 'Mention obligatoire du bail — contrat type, décret 2015-587';
    const SRC_DPE = 'Loi Climat 2021 — calendrier d’interdiction de mise en location';
    const nodes = [];

    nodes.push({ kind: 'ent', id: ent.id || null, name: ent.nom || 'Bailleur', sub: 'Bailleur', badge: null, tasks: [
      T('identite', 'Identité', _s(ent.nom) !== '', { detail: 'nom, forme, SIREN', palier: 'legal', src: SRC_BAIL_TYPE }),
      T('gerant', 'Gérant / représentant légal', !!((ent.gerants || []).length) || _s(ent.gerant) !== '', { detail: 'requis sur les baux', palier: 'legal', src: 'Signataire du bail pour le compte de la société' }),
      T('siege', 'Siège social / domicile', _s(ent.siege) !== '', { palier: 'legal', src: SRC_BAIL_TYPE }),
      T('iban', 'IBAN', _s(ent.iban) !== '', { detail: 'quittances & appels de loyer' }),
      T('coordonnees', 'Coordonnées', _s(ent.emailEnvoi) !== '', { detail: 'email d’envoi' }),
      T('rcsCapital', 'RCS & capital', _s(ent.rcs) !== '' && _s(ent.capital) !== ''),
      T('signatureLogo', 'Signature & logo', !!ent.signature && !!ent.logo),
    ] });

    const hasEq = _hasRealValue(imm.equipementsCommuns);
    nodes.push({ kind: 'imm', id: imm.id || null, name: imm.nom || 'Immeuble', sub: _s(imm.ville), badge: null, tasks: [
      T('adresse', 'Adresse', _s(imm.adr) !== '' && _s(imm.ville) !== '', { palier: 'legal', src: 'Désignation du logement — mention obligatoire du bail' }),
      T('annee', 'Année de construction', _num(imm.annee) !== '', { palier: 'legal', src: 'Détermine les diagnostics amiante (permis avant juillet 1997) et plomb (avant 1949)', detail: 'tant qu’elle manque, l’app ne peut pas dire quels diagnostics sont exigés' }),
      T('regime', 'Régime juridique (copropriété ?)', _s(imm.regimeJuridique) !== '', { palier: 'legal', src: 'Art. 3 loi du 6 juillet 1989 — extraits du règlement à annexer' }),
      T('syndic', 'Syndic', !!imm.syndic),
      T('equipements', 'Équipements communs', hasEq),
      T('valeur', 'Prix / valeur estimée', _num(imm.valeurEstimee) !== ''),
      T('surfaceTotale', 'Surface totale', _s(imm.surfaceTotale) !== ''),
    ] });

    logs.forEach((l) => {
      const bail = baux[l.ref] || null;
      const repris = !!(bail && bail.source && bail.source.import === 'acte');
      let bailTask;
      // NE PAS « corriger » en ajoutant une `src` (décision user 13/08) : la tâche `bail` est
      // rangée dans le palier légal parce qu'elle est l'ABOUTISSEMENT du fil rouge, pas parce
      // qu'une norme imposerait de créer un bail. Elle est donc la SEULE tâche légale sans
      // source — le test « les tâches légales portent une source » l'exclut explicitement
      // (`t.id !== 'bail'`). Logique de statut inchangée depuis v15.500.
      if (bail && repris && !bail.reprisVerifie) bailTask = T('bail', 'Vérifier le bail repris', false, { warn: true, action: 'verifier-repris', detail: 'état civil, loyer, clauses', palier: 'legal' });
      else if (bail) bailTask = T('bail', 'Bail en place', true, { palier: 'legal' });
      else if (l.vacantAssume) bailTask = T('bail', 'Vacant assumé', true, { detail: 'bail à créer plus tard si besoin', palier: 'legal' });
      else bailTask = T('bail', 'Créer le bail', false, { action: 'creer-bail', detail: 'wizard bail existant', palier: 'legal' });

      // Diagnostics : le catalogue des diagnostics exigés est INJECTÉ (il dépend de l'année,
      // de la zone, du type de bien — connus côté app). « Pas d'injection » ≠ « injection
      // vide » : sans entrée pour le lot on ne peut RIEN affirmer (todo) ; avec une entrée
      // qui ne liste aucun requis ni aucun indéterminé, il n'y a rien à annexer pour ce bien
      // ⇒ done (sinon la tâche resterait todo à vie). Sinon : tous les requis fournis et
      // aucun cas indéterminé.
      const dgInjecte = Object.prototype.hasOwnProperty.call(diagsMap, l.ref) && diagsMap[l.ref] != null;
      const dg = diagsMap[l.ref] || { requis: [], indetermines: [], fournis: [] };
      const dgRequis = dg.requis || [], dgIndet = dg.indetermines || [], dgFournis = dg.fournis || [];
      const dgDone = dgInjecte && dgIndet.length === 0 && dgRequis.every((r) => dgFournis.includes(r.key));
      const diagTask = T('diagnostics', 'Diagnostics obligatoires', dgDone, { palier: 'legal',
        src: 'Dossier de diagnostic technique — art. 3-3 loi du 6 juillet 1989' });
      diagTask.diags = { requis: dgRequis, indetermines: dgIndet, fournis: dgFournis };

      // DPE louable : le calendrier d'interdiction (loi Climat) est INJECTÉ. `interdit` ⇒ warn
      // (le logement ne peut pas partir en location) ; classe posée ⇒ done.
      const dpe = dpeMap[l.ref] || {};
      const dpeTask = dpe.interdit
        ? T('dpeLouable', 'Classe DPE louable ?', false, { warn: true, detail: _s(dpe.raison), palier: 'legal', src: SRC_DPE })
        : T('dpeLouable', 'Classe DPE louable ?', _s(dpe.classe) !== '', { palier: 'legal', src: SRC_DPE });

      const hasAnx = _hasRealValue(l.annexes);
      nodes.push({ kind: 'log', id: l.ref, name: l.ref,
        sub: [l.type, l.surf ? (l.surf + ' m²') : ''].filter(Boolean).join(' · '),
        badge: bail ? 'loue' : 'vac',
        tasks: [
          // Caractéristiques = identité louable du parcours (réf/type/surface/loyer),
          // schéma logement stocké : `surf` → surface, `hc` → loyer.
          T('caracteristiques', 'Surface habitable + désignation', isRentable({ ref: l.ref, type: l.type, surface: l.surf, loyer: l.hc }), { palier: 'legal', src: 'Surface habitable = mention obligatoire du bail (art. 3 loi 89-462)' }),
          diagTask,
          dpeTask,
          T('numFiscal', 'N° fiscal du logement', _s(l.numFiscal) !== '', { warn: true, detail: 'déclaration d’occupation des locaux', palier: 'legal', src: 'Obligation déclarative du propriétaire — service « Gérer mes biens immobiliers »' }),
          bailTask,
          T('chauffageEcs', 'Chauffage & eau chaude', _hasRealValue(l.chauffage) || _hasRealValue(l.ecs)),
          T('tantiemes', 'Tantièmes', _num(l.tantiemes) !== ''),
          T('etage', 'Étage', _s(l.etage) !== ''),
          T('annexes', 'Annexes', hasAnx),
          T('mobilier', 'Mobilier', (l.mobilier || []).length > 0),
          T('photos', 'Photos', (l.photos || []).length > 0),
        ] });
    });

    // `full` = palier LÉGAL complet (décision user 13/08) : le confort restant n'empêche
    // plus la fiche de passer au vert. `pct` reste le ratio sur TOUTES les tâches (compat
    // bandeau de reprise) ; `pctLegal` est la jauge du palier légal seul.
    nodes.forEach((n) => { n.full = n.tasks.filter((t) => t.palier === 'legal').every((t) => t.status === 'done'); });
    const all = nodes.flatMap((n) => n.tasks);
    const pct = all.length ? Math.round(all.filter((t) => t.status === 'done').length / all.length * 100) : 100;
    const legal = all.filter((t) => t.palier === 'legal');
    const pctLegal = legal.length ? Math.round(legal.filter((t) => t.status === 'done').length / legal.length * 100) : 100;
    return { nodes, pct, pctLegal };
  }

  function parcoursSummary(tree) {
    const t = tree || { immeubles: [] };
    const realImms = t.immeubles.filter((i) => !i.synthetic);
    const allLogs = t.immeubles.flatMap((i) => i.logements);
    return {
      nbImmeubles: realImms.length,
      nbLogements: allLogs.length,
      logementsALouer: allLogs.filter((l) => !_s(l.locataire)),
    };
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.ParcoursBienModel = {
    canCreateLogement: canCreateLogement,
    logementCompleteness: logementCompleteness,
    immeubleCompleteness: immeubleCompleteness,
    buildParcoursTree: buildParcoursTree,
    parcoursSummary: parcoursSummary,
    LOG_REQUIRED: LOG_REQUIRED,
    LOG_OPTIONAL_KEY: LOG_OPTIONAL_KEY,
    identiteParcours: identiteParcours,
    isRentable: isRentable,
    PARCOURS_IDENTITY: PARCOURS_IDENTITY,
    completionModel: completionModel
  };
})(typeof window !== 'undefined' ? window : globalThis);
