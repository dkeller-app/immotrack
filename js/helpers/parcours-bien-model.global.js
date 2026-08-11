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
   * @param {object} p {entite, immeuble, logements[], bauxActifs:{ref:bail}}
   * @returns {{nodes:[{kind,id,name,sub,badge,full,tasks:[{id,label,detail,status,action}]}], pct:number}}
   */
  function completionModel({ entite, immeuble, logements, bauxActifs }) {
    const ent = entite || {}, imm = immeuble || {}, logs = logements || [], baux = bauxActifs || {};
    const T = (id, label, done, opts) => ({ id, label, detail: (opts && opts.detail) || '',
      status: done ? 'done' : ((opts && opts.warn) ? 'warn' : 'todo'), action: (opts && opts.action) || null });
    const nodes = [];

    nodes.push({ kind: 'ent', id: ent.id || null, name: ent.nom || 'Bailleur', sub: 'Bailleur', badge: null, tasks: [
      T('identite', 'Identité', _s(ent.nom) !== '', { detail: 'nom, forme, SIREN' }),
      T('gerant', 'Gérant / représentant légal', !!((ent.gerants || []).length) || _s(ent.gerant) !== '', { detail: 'requis sur les baux' }),
      T('coordonnees', 'Coordonnées', _s(ent.emailEnvoi) !== '', { detail: 'email d’envoi' }),
      T('iban', 'IBAN', _s(ent.iban) !== '', { detail: 'quittances & appels de loyer' }),
    ] });

    const eq = imm.equipementsCommuns || {};
    const hasEq = Object.keys(eq).some((k) => k !== 'customs' && eq[k]) || ((eq.customs || []).length > 0);
    nodes.push({ kind: 'imm', id: imm.id || null, name: imm.nom || 'Immeuble', sub: _s(imm.ville), badge: null, tasks: [
      T('adresse', 'Adresse', _s(imm.adr) !== '' && _s(imm.ville) !== ''),
      T('valeur', 'Prix / valeur estimée', _num(imm.valeurEstimee) !== ''),
      T('annee', 'Année de construction', _num(imm.annee) !== '', { detail: 'absente des actes — viendra du DPE' }),
      T('equipements', 'Équipements communs', hasEq),
    ] });

    logs.forEach((l) => {
      const bail = baux[l.ref] || null;
      const repris = !!(bail && bail.source && bail.source.import === 'acte');
      let bailTask;
      if (bail && repris && !bail.reprisVerifie) bailTask = T('bail', 'Vérifier le bail repris', false, { warn: true, action: 'verifier-repris', detail: 'état civil, loyer, clauses' });
      else if (bail) bailTask = T('bail', 'Bail en place', true);
      else if (l.vacantAssume) bailTask = T('bail', 'Vacant assumé', true, { detail: 'bail à créer plus tard si besoin' });
      else bailTask = T('bail', 'Créer le bail', false, { action: 'creer-bail', detail: 'wizard bail existant' });
      nodes.push({ kind: 'log', id: l.ref, name: l.ref,
        sub: [l.type, l.surf ? (l.surf + ' m²') : ''].filter(Boolean).join(' · '),
        badge: bail ? 'loue' : 'vac',
        tasks: [
          // Caractéristiques = identité louable du parcours (réf/type/surface/loyer),
          // schéma logement stocké : `surf` → surface, `hc` → loyer.
          T('caracteristiques', 'Caractéristiques', isRentable({ ref: l.ref, type: l.type, surface: l.surf, loyer: l.hc })),
          T('numFiscal', 'N° fiscal du logement', _s(l.numFiscal) !== '', { warn: true, detail: 'obligatoire depuis 2024' }),
          // `dpe` = objet {classe|lettre|note} (schéma courant) OU chaîne legacy ('D') sur
          // les vieux logements (même tolérance que _diagGet côté app).
          T('dpe', 'DPE', typeof l.dpe === 'string' ? l.dpe.trim() !== '' : !!(l.dpe && (l.dpe.classe || l.dpe.lettre || l.dpe.note))),
          bailTask,
        ] });
    });

    nodes.forEach((n) => { n.full = n.tasks.every((t) => t.status === 'done'); });
    const all = nodes.flatMap((n) => n.tasks);
    const pct = all.length ? Math.round(all.filter((t) => t.status === 'done').length / all.length * 100) : 100;
    return { nodes, pct };
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
