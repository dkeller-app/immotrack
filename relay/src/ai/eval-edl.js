// relay/src/ai/eval-edl.js — MESURE DE QUALITÉ de la tâche edl-piece sur un jeu de référence.
// Pur, sans réseau : sert au test (fournisseur simulé) et à scripts/eval-edl.mjs (fournisseur réel).
//
// `attendu` = { elements:[noms], propositions:{ [nomElement]: { etat, mots:[…] } }, corrections:[{entendu, compris}],
//               aAjouter:[mots] }
// Mesures (0 → 1) :
//   elementsRappel     éléments attendus effectivement proposés
//   elementsPrecision  propositions qui portent sur un élément attendu (le reste = élément non cité touché)
//   etatsJustes        parmi les éléments attendus proposés, état identique à l'attendu (null compris)
//   observationsJustes parmi eux, observation contenant tous les mots attendus (forme corrigée)
//   correctionsTrouvees corrections attendues retrouvées (dans `corrections` ou dans les observations)
//   nonCitesTouches    NOMBRE d'éléments non cités qui ont reçu une proposition (cible : 0)
import { normaliser } from './texte.js';

export function mesurerEdl(sortie, attendu) {
  const props = (sortie && sortie.propositions) || [];
  const nomDe = (id) => attendu.elements[Number(id)];
  const att = attendu.propositions;
  const nomsAtt = Object.keys(att);
  const proposes = new Map(props.map((p) => [nomDe(p.elementId), p]));
  const bons = nomsAtt.filter((n) => proposes.has(n));
  const horsAttente = [...proposes.keys()].filter((n) => !att[n]);
  const etatsJustes = bons.filter((n) => (proposes.get(n).etat || null) === (att[n].etat || null));
  const obsJustes = bons.filter((n) => {
    const o = normaliser([proposes.get(n).observation, proposes.get(n).aVerifier].filter(Boolean).join(' '));
    return (att[n].mots || []).every((m) => o.includes(normaliser(m)));
  });
  const toutTexte = normaliser([
    ...((sortie && sortie.corrections) || []).map((c) => c.compris),
    ...props.map((p) => p.observation || ''),
    ...((sortie && sortie.aAjouter) || []).map((a) => `${a.nom} ${a.observation || ''}`),
  ].join(' '));
  const corr = (attendu.corrections || []).filter((c) => toutTexte.includes(normaliser(c.compris)));
  const ajouts = (attendu.aAjouter || []).filter((m) => normaliser(((sortie && sortie.aAjouter) || []).map((a) => a.nom).join(' ')).includes(normaliser(m)));
  const r = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : 1);
  return {
    elementsRappel: r(bons.length, nomsAtt.length),
    elementsPrecision: r(props.length - horsAttente.length, props.length),
    etatsJustes: r(etatsJustes.length, bons.length),
    observationsJustes: r(obsJustes.length, bons.length),
    correctionsTrouvees: r(corr.length, (attendu.corrections || []).length),
    ajoutsTrouves: r(ajouts.length, (attendu.aAjouter || []).length),
    nonCitesTouches: horsAttente.length,
    detail: {
      manquants: nomsAtt.filter((n) => !proposes.has(n)),
      enTrop: horsAttente,
      etatsFaux: bons.filter((n) => !etatsJustes.includes(n)),
      observationsIncompletes: bons.filter((n) => !obsJustes.includes(n)),
    },
  };
}
