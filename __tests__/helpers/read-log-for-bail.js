/**
 * Module read-log-for-bail — résolution centralisée des champs « bien » côté bail
 * (ARCHI-FICHES-UNIFIED Session 3 Phase 3a + Session 4 G1, v15.217)
 *
 * Encapsule la logique de _readLogForBail (présente inline dans index.html ligne ~26199).
 * L'extraction permet :
 *   1. Tests Vitest dédiés (G1 audit v15.216 — fenêtre temporelle pré-migration)
 *   2. Garantie de l'immutabilité légale sur bail signé (F1 audit v15.215)
 *   3. Gestion gracieuse de l'imm partiellement migré (F3 audit v15.215)
 *
 * ⚠️ La version inline dans index.html garde l'accès direct à `DB.entites` (global)
 *    et à `window.LogImmResolver` (window). Ce module ES pur prend les dépendances
 *    en paramètre (lookupImm + formatAdresseFn) pour être testable.
 *
 * Refs : `_readLogForBail` index.html · `_captureBailSnapshot` index.html ·
 *        décisions A1+A2+A3+C2 verrouillées Session 1.
 */

import { formatAdresse } from './adresse-parser.js';

/**
 * Résout les champs « bien » côté bail, avec immutabilité légale sur bail signé.
 *
 * @param {object} bail - bail (peut être null)
 * @param {object} log - logement (peut être null)
 * @param {function} lookupImm - (entity, immNom) → imm | null  (DB.entites lookup)
 * @returns {object} aliases plats compat legacy + meta {_bailSignedSnapshot}
 */
export function readLogForBail(bail, log, lookupImm) {
  let src = log;
  let _isSignedSnapshot = false;

  // F1 — bail signé : src vient du snapshot figé (immutabilité légale)
  if (bail && bail.signatures && bail.signatures.bailSnapshot
      && bail.signatures.bailSnapshot.log) {
    src = bail.signatures.bailSnapshot.log;
    _isSignedSnapshot = true;
  }

  if (!src) return {};

  // Résolution imm parent (selon contexte signé / non signé)
  let _imm = null;
  let _inhAddr = { rue: '', codePostal: '', ville: '', full: '' };
  let _inhPeriode = '';
  let _inhRegime = '';
  let _inhAnnee = 0;

  if (_isSignedSnapshot) {
    // Bail signé : préférer le snapshot.imm s'il existe (G2 v15.217),
    // sinon aucun lookup DB.entites mutable → src.adr legacy reste source.
    if (bail.signatures.bailSnapshot.imm) {
      _imm = bail.signatures.bailSnapshot.imm;
    }
  } else if (typeof lookupImm === 'function' && src.entity && src.imm) {
    // Bail NON signé : lookup courant OK
    _imm = lookupImm(src.entity, src.imm);
  }

  // F3 — exiger codePostal ET ville pour considérer l'imm autoritative.
  // Imm partiel (juste rue) ne doit pas écraser log.adr legacy plus riche.
  const _immAutoritative = _imm && _imm.codePostal && _imm.ville;

  if (_immAutoritative) {
    _inhAddr.rue = (_imm.adr || '').trim();
    _inhAddr.codePostal = (_imm.codePostal || '').trim();
    _inhAddr.ville = (_imm.ville || '').trim();
    _inhAddr.full = formatAdresse(_imm);
    _inhPeriode = _imm.periodeConstr || '';
    _inhRegime = _imm.regimeJuridique || '';
    _inhAnnee = +_imm.annee || 0;
  } else if (_imm) {
    // Imm partiel : exploiter ce qu'on peut (période / régime / année)
    _inhPeriode = _imm.periodeConstr || '';
    _inhRegime = _imm.regimeJuridique || '';
    _inhAnnee = +_imm.annee || 0;
  }

  // Sortie : aliases plats legacy + metadata
  return Object.assign({}, src, {
    adrBien: _inhAddr.full || src.adr || '',
    ftype: src.type || '',
    _immCodePostal: _inhAddr.codePostal,
    _immVille: _inhAddr.ville,
    _immPeriodeConstr: _inhPeriode || src.periodeConstr || '',
    _immRegime: _inhRegime || src.regimeJuridique || '',
    _immAnnee: _inhAnnee || +src.annee || 0,
    _bailSignedSnapshot: _isSignedSnapshot,
    // DPE flat
    dpe: (src.dpe && src.dpe.classe) || '',
    ges: (src.dpe && src.dpe.ges) || '',
    dpeDate: (src.dpe && src.dpe.date) || '',
    dpeAn: (src.dpe && src.dpe.an) || '',
    dpeValConv: (src.dpe && src.dpe.valConv) || '',
    dpeValEner: (src.dpe && src.dpe.valEner) || '',
    // État risques flat
    erp: (src.etatRisques && src.etatRisques.erp) || '',
    plomb: (src.etatRisques && src.etatRisques.plomb) || '',
    amiante: (src.etatRisques && src.etatRisques.amiante) || '',
    elec: (src.etatRisques && src.etatRisques.elec) || '',
    gaz: (src.etatRisques && src.etatRisques.gaz) || '',
    bruit: (src.etatRisques && src.etatRisques.bruit) || '',
    // Chauffage flat
    chauff: (src.chauffage && src.chauffage.label) || '',
    chauffElec: !!(src.chauffage && src.chauffage.elec),
    chauffGaz: !!(src.chauffage && src.chauffage.gaz),
    chauffColl: !!(src.chauffage && src.chauffage.coll),
    chauffAutre: (src.chauffage && src.chauffage.autre) || '',
    // ECS flat
    ecsElec: !!(src.ecs && src.ecs.elec),
    ecsGaz: !!(src.ecs && src.ecs.gaz),
    ecsColl: !!(src.ecs && src.ecs.coll),
    ecsLabel: (src.ecs && src.ecs.label) || ''
  });
}
