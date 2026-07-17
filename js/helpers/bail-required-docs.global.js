/**
 * bail-required-docs.global.js — Wrapper browser (window.BailRequiredDocs)
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    __tests__/helpers/bail-required-docs.js
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

  /**
   * Module bail-required-docs — moteur PUR de complétude des pièces obligatoires du bail (SC1).
   *
   * Ne ré-encode PAS les seuils légaux des diagnostics : l'applicabilité tri-état
   * (true/false/null) est fournie par le caller (index.html : `_estDiagApplicable`,
   * qui renvoie déjà null quand un champ décisif — année construction/installation —
   * manque). Le module traduit cette applicabilité en état de pièce et matche les
   * fichiers tagués `requirementKeys[]`. Les pièces non-diagnostic (règlement copro,
   * Anah, permis de louer) sont décidées ici depuis imm/log.
   *
   * Complétude = FICHIER réel (ou non applicable). Décision validée 2026-07-16.
   */

  const PIECES_META = {
    dpe:     { label: 'DPE — Performance énergétique',      legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Toujours obligatoire',        negWhy: 'Non requis' },
    crep:    { label: 'Constat plomb (CREP)',               legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Construit avant 1949',       negWhy: 'Construit après 1949' },
    amiante: { label: 'État amiante',                       legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Construit avant 1997',       negWhy: 'Construit après 1997' },
    gaz:     { label: 'État installation gaz',              legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Installation > 15 ans',      negWhy: 'Installation ≤ 15 ans' },
    elec:    { label: 'État installation électrique',       legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Installation > 15 ans',      negWhy: 'Installation ≤ 15 ans' },
    erp:     { label: 'État des risques (ERP)',             legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Commune en zone à risque',   negWhy: 'Hors zone à risque' },
    bruit:   { label: 'Nuisances sonores aériennes',        legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Zone d’exposition au bruit', negWhy: 'Hors zone PEB' },
    termites:{ label: 'État parasitaire (termites)',        legal: 'Art. L133-6',          level: 'logement', kind: 'diagnostic', posWhy: 'Zone à termites',           negWhy: 'Hors zone termites' },
    merule:  { label: 'Information mérule',                 legal: 'Art. L133-7',          level: 'logement', kind: 'diagnostic', posWhy: 'Zone à mérule',             negWhy: 'Hors zone mérule' },
    copro:   { label: 'Extrait règlement de copropriété',  legal: 'Loi 89-462',           level: 'immeuble', kind: 'file',       posWhy: 'Immeuble en copropriété',   negWhy: 'Hors copropriété' },
    anah:    { label: 'Convention Anah',                   legal: 'Convention Anah',      level: 'logement', kind: 'file',       posWhy: 'Logement conventionné',     negWhy: 'Non conventionné' },
    permis:  { label: 'Autorisation / permis de louer',   legal: 'Art. L634-1 CCH',      level: 'logement', kind: 'file',       posWhy: 'Zone permis de louer',      negWhy: 'Hors zone permis de louer' },
  }

  function filesFor(key, documents) {
    return (documents || []).filter(d =>
      d && !d._deleted && Array.isArray(d.requirementKeys) && d.requirementKeys.includes(key))
  }

  function pieceFrom(key, applicable, documents) {
    const meta = PIECES_META[key]
    const base = { key, label: meta.label, legal: meta.legal, level: meta.level, kind: meta.kind, files: [] }
    if (applicable === false) return { ...base, state: 'na', why: meta.negWhy }
    if (applicable === null || applicable === undefined) return { ...base, state: 'verify', why: 'À vérifier — champ manquant' }
    const files = filesFor(key, documents)
    return { ...base, state: files.length ? 'ok' : 'miss', why: meta.posWhy, files }
  }

  function computeRequiredDocs({ diagApplicability = {}, imm = {}, log = {}, documents = [] } = {}) {
    const out = []
    for (const key of Object.keys(diagApplicability)) {
      if (!PIECES_META[key]) continue
      out.push(pieceFrom(key, diagApplicability[key], documents))
    }
    const isCopro = Number(imm && imm.nbLots) > 1
    out.push(pieceFrom('copro', isCopro ? true : false, documents))
    out.push(pieceFrom('anah', log && log.conventionneAnah === true ? true : false, documents))
    out.push(pieceFrom('permis', log && log.permisDeLouer === true ? true : false, documents))
    return out
  }

  function completenessCount(pieces) {
    const applicable = (pieces || []).filter(p => p.state !== 'na')
    return { ok: applicable.filter(p => p.state === 'ok').length, total: applicable.length }
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.BailRequiredDocs = {
    computeRequiredDocs: computeRequiredDocs,
    completenessCount: completenessCount,
    PIECES_META: PIECES_META
  };
})(typeof window !== 'undefined' ? window : globalThis);
