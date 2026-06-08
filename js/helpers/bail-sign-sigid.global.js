/**
 * bail-sign-sigid.global.js — Wrapper browser (window.BailSignSigid)
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    __tests__/helpers/bail-sign-sigid.js
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

  // __tests__/helpers/bail-sign-sigid.js
  // Convention sigId locataire ALIGNÉE sur le relais (relay/public/sign/sigid.js computeSigId).
  // Le relais ne connaît QUE les signataires à distance (présentiel jamais envoyé) et leur attribue
  // loc-0, loc-1, … par rang dans la liste reçue. Le manifeste embarqué par l'app DOIT porter les
  // mêmes sigId, sinon la signature distante est tamponnée dans la mauvaise case (ou nulle part).

  // Pour CHAQUE locataire (index original) : 'loc-<rang parmi les distants>' ou null si présentiel.
  function buildRemoteSigIdMap(locataires) {
    const arr = Array.isArray(locataires) ? locataires : [];
    let rank = 0;
    return arr.map(l => (l && l.presentiel) ? null : ('loc-' + (rank++)));
  }

  // Réplique locale du computeSigId du relais — pour le test de non-régression cross-composant.
  function relayComputeSigId(remoteSigners, index) {
    const sideOf = r => /locat|preneur/i.test(r || '') ? 'locataire' : 'bailleur';
    const side = sideOf(remoteSigners[index].role);
    let rank = 0;
    for (let i = 0; i < index; i++) if (sideOf(remoteSigners[i].role) === side) rank++;
    return (side === 'locataire' ? 'loc' : 'bailleur') + '-' + rank;
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.BailSignSigid = {
    buildRemoteSigIdMap: buildRemoteSigIdMap,
    relayComputeSigId: relayComputeSigId
  };
})(typeof window !== 'undefined' ? window : globalThis);
