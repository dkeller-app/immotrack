/**
 * core/irl-garde-fou.js — LES GARDE-FOUS DE LA RÉVISION IRL, NON BLOQUANTS (V20/V21).
 *
 * Arbitrage Didier du 19/08, mot pour mot :
 *   « L'app doit prévenir mais pas bloquer tout le temps l'utilisateur. S'il ne veut pas
 *     remplir les DPE, il doit quand même pouvoir utiliser les fonctionnalités. On garde des
 *     garde-fous partout mais pas bloquants. »
 *
 * Le geste est donc TOUJOURS offert quand c'est une RÈGLE qui l'empêchait — la fenêtre cite
 * la règle, dit ce que ça engage, demande une confirmation à cocher, et laisse passer.
 *
 * Il ne l'est PAS quand il n'y a rien à calculer ni rien à réviser encore : « bail de moins
 * d'un an » et « indice non publié » ne sont pas des verrous, c'est le vide — la date n'est
 * pas arrivée, ou l'INSEE n'a rien publié. Un bouton « quand même » y serait un mensonge.
 * C'est l'exception assumée du CDC (V21).
 *
 * Pur / testable : aucune lecture de DB, aucun DOM.
 * Tests : __tests__/helpers/irl-garde-fou.test.js
 */

export const GARDE = Object.freeze({
  GEL: 'gel',                    // DPE F ou G — loi Climat & Résilience, art. 23
  DPE_ABSENT: 'dpe-absent',      // aucun DPE saisi : l'app ne PEUT PAS vérifier le gel
  CYCLE_ETEINT: 'cycle-eteint',  // cycle non appliqué, éteint par le délai d'un an (art. 17-1)
  TROP_JEUNE: 'trop-jeune',      // pas un verrou : la date n'est pas arrivée
  INDICE: 'indice-manquant'      // pas un verrou : l'INSEE n'a rien publié
});

const _fr = (iso) => {
  const s = String(iso || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : s;
};

/**
 * LE garde-fou d'un lot, d'après l'état de sa révision.
 *
 * @param {Object} rev sortie de computeIRLRevision : { gelDpeFG, dpe, dpeManquant, etat,
 *        effetPrevuIso, missingKey, perdue:{effetIso, annee}, premiereAnniv }
 * @param {{gainMensuel?:number|null, typeLot?:string, fmtMontant?:Function}} [ctx]
 * @returns {{kind:string, peut:boolean, ico?:string, titre?:string, loi?:string,
 *            consequence?:string, confirmation?:string, cta?:string, pourquoi?:string}|null}
 *          null = aucun garde-fou, la révision est ordinaire.
 */
export function gardeFouRevision(rev, ctx) {
  const r = rev || {};
  const c = ctx || {};
  const eur = (n) => (typeof c.fmtMontant === 'function')
    ? c.fmtMontant(n) : (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €';

  // ── V20 — cycle éteint : les mois passés ne se rattrapent plus, mais l'avenir, si.
  if (r.perdue && r.perdue.effetIso) {
    const prescritIso = (parseInt(String(r.perdue.effetIso).slice(0, 4), 10) + 1) + String(r.perdue.effetIso).slice(4);
    const gain = (c.gainMensuel != null) ? c.gainMensuel : null;
    return {
      kind: GARDE.CYCLE_ETEINT, peut: true, ico: '⏸',
      titre: 'Appliquer une révision dont le cycle est éteint',
      loi: `Le cycle du ${_fr(r.perdue.effetIso)} est éteint depuis le ${_fr(prescritIso)} `
        + '(délai d’un an, art. 17-1 de la loi du 6 juillet 1989).',
      consequence: '<b>Les mois passés ne sont plus réclamables</b> : le manque à gagner'
        + (gain != null ? ` (≈ ${eur(gain)}/mois depuis le ${_fr(r.perdue.effetIso)})` : '')
        + ' ne se rattrape pas. Appliquée aujourd’hui, l’augmentation vaut <b>pour l’avenir</b> — '
        + 'et le locataire peut la contester en s’appuyant sur la prescription.',
      confirmation: 'J’ai compris que les mois passés sont perdus et que le locataire peut contester',
      cta: 'Appliquer quand même'
    };
  }

  // ── V20 — gel légal DPE F/G.
  if (r.gelDpeFG) {
    const cl = String(r.dpe || '').toUpperCase() === 'G' ? 'G' : 'F';
    return {
      kind: GARDE.GEL, peut: true, ico: '🔒',
      titre: 'Réviser un logement dont le loyer est gelé',
      loi: `Ce logement est classé ${cl}. La loi Climat &amp; Résilience (art. 23) `
        + '<b>interdit l’augmentation du loyer</b> des logements F et G.',
      consequence: 'Une révision appliquée <b>n’est pas opposable au locataire</b> : il peut refuser '
        + 'de payer l’augmentation et réclamer le remboursement de ce qu’il aurait versé en trop. '
        + 'La lettre part quand même si tu le décides.',
      confirmation: 'J’ai compris que cette révision n’est pas opposable au locataire',
      cta: 'Réviser quand même'
    };
  }

  // ── V21 — le blocage « DPE absent » est LEVÉ.
  if (r.dpeManquant) {
    return {
      kind: GARDE.DPE_ABSENT, peut: true, ico: '📄',
      titre: 'Réviser sans DPE renseigné',
      loi: 'Aucun DPE n’est saisi pour ce lot : l’app <b>ne peut pas vérifier</b> si le gel des '
        + 'logements F et G s’applique.',
      consequence: 'Rien ne t’empêche de réviser. Mais si le logement s’avère classé F ou G, '
        + 'l’augmentation ne sera pas opposable au locataire. '
        + '<b>Un garage, une cave ou un parking n’a pas de DPE par nature</b> — le gel ne les vise pas, '
        + 'aucune vérification n’est attendue.',
      confirmation: 'J’ai compris que l’app ne peut pas vérifier le gel F/G sur ce lot',
      cta: 'Réviser quand même'
    };
  }

  // ── V21, exception assumée SANS bouton : il n'y a rien à débloquer.
  if (r.etat === 'trop-jeune') {
    const quand = r.effetPrevuIso ? _fr(r.effetPrevuIso)
      : (r.premiereAnniv && r.premiereAnniv.toLocaleDateString ? r.premiereAnniv.toLocaleDateString('fr-FR') : '');
    return {
      kind: GARDE.TROP_JEUNE, peut: false,
      pourquoi: 'La première révision arrive au <b>premier anniversaire du bail</b>'
        + (quand ? ` (${quand})` : '') + '. Il n’y a rien à réviser avant : ce n’est pas un verrou, '
        + 'c’est la date qui n’est pas encore là.'
    };
  }
  if (r.etat === 'indice-manquant') {
    return {
      kind: GARDE.INDICE, peut: false,
      pourquoi: 'L’indice de référence' + (r.missingKey ? ` (${r.missingKey})` : '')
        + ' n’est <b>pas encore publié</b> par l’INSEE. Le calcul est impossible tant qu’il manque — '
        + 'rien à débloquer : la révision apparaîtra dès la publication.'
    };
  }
  return null;
}

/**
 * Le geste est-il offert ? Réponse binaire, pour l'affichage d'un bouton.
 * @returns {boolean}
 */
export function revisionForcable(rev, ctx) {
  const g = gardeFouRevision(rev, ctx);
  return !!(g && g.peut);
}

/**
 * Le libellé du bouton quand il existe — jamais un mot inventé côté écran.
 * @returns {string|null}
 */
export function libelleForcage(rev, ctx) {
  const g = gardeFouRevision(rev, ctx);
  return (g && g.peut) ? g.cta : null;
}
