/**
 * actes-mentions.js — Un acte juridique ne sort pas de l'app avec ses trous.
 *
 * Les générateurs d'actes (congé, mise en demeure, avenant) remplacent un champ vide par un
 * marqueur LISIBLE entre guillemets simples — « ‹prix› », « ‹à compléter› » — plutôt que par
 * un blanc qui passerait pour du texte final. C'est le bon choix à l'écran. Mais rien
 * n'empêchait le document de partir en PDF avec ces marqueurs dedans.
 *
 * Pour certaines mentions, ce n'est pas un défaut de présentation : c'est la NULLITÉ de l'acte.
 * L'article 15-II de la loi du 6 juillet 1989 impose le prix et les conditions de la vente dans
 * un congé pour vente, et l'article 15-I impose le motif et, en cas de reprise, le bénéficiaire.
 * Un congé portant « ‹prix› » ne vaut rien — et le bailleur ne s'en aperçoit qu'au tribunal.
 *
 * Ce module ne bloque pas : il NOMME ce qui manque et dit ce que ça coûte. La décision reste à
 * l'utilisateur, comme pour l'avenant (`avenantChampsManquants`) — l'app alerte, elle n'interdit
 * pas. Mais elle ne laisse plus passer en silence.
 *
 * ⚠️ Le marqueur `‹…›` est réservé À CET USAGE dans tout le dépôt (vérifié : 10 occurrences,
 * toutes des champs vides). Si un texte légal venait un jour à employer des guillemets simples,
 * il faudrait changer de marqueur — pas assouplir cette détection.
 */

/** Un marqueur = un chevron simple ouvrant, du texte sans chevron, un chevron fermant. */
const RE_MARQUEUR = /‹([^›]{1,150})›/g;

/**
 * Les mentions dont l'absence est sanctionnée par la NULLITÉ de l'acte, et leur fondement.
 * Clé = le texte exact du marqueur posé par le générateur (index.html, `_congeExtra`).
 * Le fondement est repris des mentions que l'app affiche déjà dans le corps du congé.
 */
const NULLITE = {
  'prix': 'art. 15-II de la loi du 6 juillet 1989 : le prix de la vente doit figurer dans le congé, à peine de nullité',
  'conditions': 'art. 15-II de la loi du 6 juillet 1989 : les conditions de la vente doivent figurer dans le congé, à peine de nullité',
  'bénéficiaire': 'art. 15-I de la loi du 6 juillet 1989 : le congé pour reprise doit désigner le bénéficiaire, à peine de nullité',
  'description du motif légitime et sérieux': 'art. 15-I de la loi du 6 juillet 1989 : le motif du congé doit être énoncé, à peine de nullité'
};

/** Libellés lisibles pour les marqueurs qui n'emportent pas nullité. */
const LIBELLES = {
  'à compléter': 'un champ de l’avenant',
  'montant': 'le montant dû',
  'période': 'la période concernée',
  'début du bail': 'la date de début du bail',
  'échéance du bail': 'l’échéance du bail'
};

/**
 * Les mentions encore vides dans un acte RENDU (on lit le document produit, pas le formulaire :
 * c'est ce qui part au locataire qui fait foi, et ça couvre tous les générateurs d'un coup).
 *
 * @param {string} html le document tel qu'il sera imprimé
 * @returns {Array<{marqueur:string, libelle:string, nullite:boolean, fondement:string}>}
 *          dans l'ordre d'apparition, sans doublon
 */
export function mentionsManquantes(html) {
  const src = (html == null) ? '' : String(html);
  const vues = new Set();
  const out = [];
  let m;
  RE_MARQUEUR.lastIndex = 0;   // regex globale partagée : sans ça, un appel sur deux repart du milieu
  while ((m = RE_MARQUEUR.exec(src)) !== null) {
    const marqueur = m[1];
    if (vues.has(marqueur)) continue;
    vues.add(marqueur);
    const fondement = NULLITE[marqueur] || '';
    out.push({
      marqueur,
      libelle: LIBELLES[marqueur] || marqueur,
      nullite: !!fondement,
      fondement
    });
  }
  return out;
}

/** Vrai dès qu'une seule mention manquante emporte la nullité de l'acte. */
export function emporteNullite(mentions) {
  return (mentions || []).some((x) => x && x.nullite);
}

/**
 * Le texte du refus. Il doit répondre à trois questions, dans cet ordre : qu'est-ce qui manque,
 * qu'est-ce que ça coûte, et qu'est-ce que je fais. Un message qui dit seulement « champs vides »
 * pousse à cliquer « continuer » sans lire.
 *
 * @param {Array} mentions sortie de `mentionsManquantes`
 * @param {string} [verbe] l'action demandée, pour la question finale
 */
export function messageMentionsManquantes(mentions, verbe) {
  const list = (mentions || []).filter(Boolean);
  if (!list.length) return '';
  const graves = list.filter((x) => x.nullite);
  const autres = list.filter((x) => !x.nullite);
  const lignes = [];

  if (graves.length) {
    lignes.push(graves.length > 1
      ? 'Cet acte serait NUL : ' + graves.length + ' mentions obligatoires manquent.'
      : 'Cet acte serait NUL : une mention obligatoire manque.');
    lignes.push('');
    for (const g of graves) lignes.push('• ' + g.libelle + ' — ' + g.fondement);
  }
  if (autres.length) {
    if (graves.length) lignes.push('');
    lignes.push(graves.length
      ? 'Et le document affichera aussi, tel quel :'
      : 'Le document affichera, tel quel :');
    for (const a of autres) lignes.push('• ‹' + a.marqueur + '›');
  }
  lignes.push('');
  lignes.push(graves.length
    ? ((verbe || 'Continuer') + ' quand même ? Le document produit ne serait pas opposable.')
    : ((verbe || 'Continuer') + ' quand même ?'));
  return lignes.join('\n');
}
