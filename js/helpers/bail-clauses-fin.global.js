/**
 * bail-clauses-fin.global.js — Wrapper browser (window.BailClausesFin)
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    js/core/bail-clauses-fin.js
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

  // ─── DÉPENDANCES IMPORTÉES depuis ./bail-duree.js (résolues via global) ───
  function regimeBailleur(){
    if (!global.BailDuree || typeof global.BailDuree.regimeBailleur !== 'function') {
      console.warn('[mirror bail-clauses-fin] dep manquante: global.BailDuree.regimeBailleur');
      // Fallback minimal pour formatAdresse-like (objet imm → string vide ou rue)
      return (arguments[0] && typeof arguments[0] === 'object' && arguments[0].adr) ? arguments[0].adr : '';
    }
    return global.BailDuree.regimeBailleur.apply(null, arguments);
  }

  /**
   * bail-clauses-fin.js — les clauses de DURÉE, CONGÉ et FIN du bail dans leur rédaction corrigée
   * (version de clauses 5, BAUX-ECHUS). Pur, testé.
   *
   * Source : mockups/BAUX-ECHUS/REGLE-LEGALE.md — Légifrance, texte en vigueur au 05/10/2026 :
   *   loi n° 89-462 art. 10 al. 3 (reconduction du bail nu : 3 ou 6 ans), art. 25-7 al. 3 (meublé : 1 an),
   *   art. 25-7 al. 4 (étudiant : reconduction inapplicable), art. 25-8 I (préavis et formes du congé
   *   meublé), art. 25-14 (mobilité : non renouvelable, non reconductible, durée, nouveau bail soumis au
   *   titre Ier bis), art. 25-15 (préavis et formes du congé mobilité) ; Code civil art. 1231-5 (clause
   *   pénale, depuis le 01/10/2016), art. 1736 à 1740 (louage : fin et reconduction des baux).
   *
   * Ce que la version 4 imprimait, et pourquoi c'était faux :
   *   · « art. 25-7 II » — l'article 25-7 n'a pas de II ; le préavis d'un mois est à l'art. 25-8 I ;
   *   · meublé « tacitement reconduit pour un an (art. 25-8) » — c'est l'art. 25-7 al. 3 ;
   *   · nu « reconduit pour une durée égale à celle du bail initial » — l'art. 10 al. 3 dit 3 ou 6 ans ;
   *   · mobilité « Toute reconduction implicite entraîne la requalification en bail meublé d'un an
   *     (art. 25-15) » — l'art. 25-15 traite du préavis ; l'art. 25-14 ne vise que le cas où les parties
   *     CONCLUENT un nouveau bail ; la requalification d'un maintien tacite n'est écrite nulle part ;
   *   · « clause pénale (articles 1226 et suivants du Code civil) » — l'art. 1226 traite aujourd'hui de la
   *     résolution par notification ; la clause pénale est à l'art. 1231-5 ;
   *   · autre : « le droit commun des contrats s'applique » — ce sont les règles du louage (1736 à 1740).
   * Un bail SIGNÉ en version ≤ 4 garde son texte, mot pour mot : ces phrases ne servent qu'à partir de 5.
   */

  const LOI = 'de la loi n° 89-462 du 6 juillet 1989';
  const FORMES = 'par lettre recommandée avec demande d’avis de réception, par acte de commissaire de justice ou par remise en main propre contre récépissé ou émargement';

  /** Bail meublé et étudiant — congé du locataire en cours de bail (art. 25-8 I). */
  const CONGE_LOCATAIRE_MEUBLE = 'Le LOCATAIRE peut donner congé au BAILLEUR à tout moment moyennant un préavis d’un (1) mois (article 25-8, I ' + LOI + '), ' + FORMES + '.';

  /** Bail meublé — congé à l'expiration (art. 25-8 I). */
  const CONGE_EXPIRATION_MEUBLE = 'La partie qui souhaite ne pas reconduire le bail doit notifier son intention ' + FORMES + ', au moins trois (3) mois avant l’échéance si le congé émane du BAILLEUR, et un (1) mois avant si le congé émane du LOCATAIRE (article 25-8, I ' + LOI + ').';

  /** Bail meublé — tacite reconduction (art. 25-7 al. 3). */
  const RECONDUCTION_MEUBLE = 'À défaut de congé ou de proposition de renouvellement notifié dans les formes et délais légaux, le bail se trouvera tacitement reconduit pour une durée d’un (1) an (article 25-7 ' + LOI + ').';

  /** Bail étudiant de neuf mois — fin (art. 25-7 al. 4). Rien de plus que la loi. */
  const FIN_ETUDIANT = 'Le bail étant conclu pour une durée de neuf mois avec un étudiant, la reconduction tacite est inapplicable (article 25-7 ' + LOI + ') : il prend fin à son terme. Si les parties souhaitent poursuivre la location, un nouveau bail doit être signé.';

  /** Bail mobilité — congé du locataire (art. 25-15). */
  const CONGE_LOCATAIRE_MOBILITE = 'Le LOCATAIRE peut résilier le contrat à tout moment, sous réserve de respecter un délai de préavis d’un (1) mois (article 25-15 ' + LOI + '), ' + FORMES + '. Le BAILLEUR ne peut pas donner congé en cours de bail.';

  /** Bail mobilité — fin (art. 25-14 al. 1 et dernier al.). Sans « requalification » d'un maintien tacite. */
  const FIN_MOBILITE = 'Le bail mobilité est non renouvelable et non reconductible (article 25-14 ' + LOI + ') : il prend fin à son terme. Si, au terme du contrat, les parties concluent un nouveau bail portant sur le même logement meublé, ce nouveau bail est soumis aux dispositions du titre Ier bis de la même loi (article 25-14).';

  /** Bail mobilité — phrase de durée (art. 25-14 al. 1, 2 et 3). */
  const DUREE_MOBILITE = 'Cette durée s’applique conformément à l’article 25-14 ' + LOI + '. Le bail mobilité est conclu pour une durée minimale d’un mois et maximale de dix mois, non renouvelable et non reconductible ; lorsque le logement fait partie d’une résidence à vocation d’emploi (article L. 631-16-1 du code de la construction et de l’habitation), pour une durée minimale d’une semaine et maximale de dix-huit mois. La durée prévue au contrat peut être modifiée une fois par avenant, dans ces mêmes limites.';

  /** Location « autre » (hors loi de 1989) — conditions de résiliation. */
  const RESILIATION_AUTRE = 'Les conditions de préavis, congé et reconduction sont librement définies entre les parties dans les présentes ou par avenant. À défaut de stipulation, les règles du louage du Code civil s’appliquent, notamment ses articles 1736 à 1740.';

  /** Clause pénale — la référence au Code civil en vigueur (art. 1231-5). Le reste de la clause est inchangé. */
  const CLAUSE_PENALE_REF = 'article 1231-5 du Code civil';

  /**
   * Bail nu — la clause de tacite reconduction (art. 10 al. 3) : 3 ans pour un bailleur personne
   * physique ou relevant de l'art. 13 (société civile familiale, indivision), 6 ans pour une personne
   * morale, QUELLE QUE SOIT la durée initiale. Quand la qualité du bailleur n'est pas établie, la règle
   * est énoncée sans la trancher (même principe que dureeBailNuPhrase).
   */
  function reconductionBailNu(typeEntite) {
    const r = regimeBailleur(typeEntite);
    const debut = 'À défaut de congé ou de proposition de renouvellement notifié dans les formes et délais légaux, le bail se trouvera tacitement reconduit pour une durée de ';
    const fin = ' (article 10 ' + LOI + ').';
    if (!r.certain) {
      return debut + 'trois (3) ans si le bailleur est une personne physique ou relève de l’article 13 de la même loi (société civile familiale, indivision), et de six (6) ans s’il est une autre personne morale' + fin;
    }
    return debut + (r.ans === 3 ? 'trois (3) ans' : 'six (6) ans') + fin;
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.BailClausesFin = {
    CONGE_LOCATAIRE_MEUBLE: CONGE_LOCATAIRE_MEUBLE,
    CONGE_EXPIRATION_MEUBLE: CONGE_EXPIRATION_MEUBLE,
    RECONDUCTION_MEUBLE: RECONDUCTION_MEUBLE,
    FIN_ETUDIANT: FIN_ETUDIANT,
    CONGE_LOCATAIRE_MOBILITE: CONGE_LOCATAIRE_MOBILITE,
    FIN_MOBILITE: FIN_MOBILITE,
    DUREE_MOBILITE: DUREE_MOBILITE,
    RESILIATION_AUTRE: RESILIATION_AUTRE,
    CLAUSE_PENALE_REF: CLAUSE_PENALE_REF,
    reconductionBailNu: reconductionBailNu
  };
})(typeof window !== 'undefined' ? window : globalThis);
