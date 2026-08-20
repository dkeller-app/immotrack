/**
 * CDC-LOYERS-DESIGN — L'ÉDITEUR DE QUITTANCE, invariants STRUCTURELS dans le source.
 *
 * Ce lot est celui où une régression coûterait le plus cher : c'est ici que Didier a rejeté
 * l'ancien comportement (« tu arrêtes de bloquer les quittances ! là je peux rien faire ! »).
 * Un bouton grisé, une seconde porte, une mention parasite sur le document remis au locataire
 * — aucune de ces trois choses ne se voit dans un test de valeur. Elles se voient ici.
 *
 * Assertions sur des booléens : index.html fait 3,7 Mo.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const has = (s) => SRC.includes(s);
const count = (s) => SRC.split(s).length - 1;

describe('V6 — on ouvre LE DOCUMENT, pas un formulaire', () => {
  it('l\'éditeur est un écran plein, pas une modale de champs', () => {
    expect(has('id="ov-quit-editeur"')).toBe(true);
    expect(has('<div class="qd" id="qd-root">')).toBe(true);
  });
  it('la modale de saisie « ov-quit-faire » a disparu, ainsi que ses fonctions _fq*', () => {
    expect(has('ov-quit-faire')).toBe(false);
    expect(has('_fqSetLot')).toBe(false);
    expect(has('_fqValider')).toBe(false);
    expect(has('id="fq-mois-list"')).toBe(false);
  });
  it('le document affiché est construit par le MÊME builder que l\'impression et le PDF (I5)', () => {
    expect(has('const built = _buildQuittanceHtml(q, log, ent, bail);')).toBe(true);
    expect(has('const du = _duMoisLot(_qe.ref, m.ym);')).toBe(true);
  });
  it('le rail ne porte que le mois (et l\'année), aucun autre champ de saisie', () => {
    expect(has('class="qd-mois"')).toBe(true);
    expect(has('class="qd-an"')).toBe(true);
  });
});

describe('V10 — UNE SEULE PORTE : la quittance libre est un mode DEDANS', () => {
  it('l\'écran Loyers n\'a qu\'un bouton d\'entrée, « Faire une quittance »', () => {
    expect(count('_openFaireQuittance()')).toBeGreaterThan(0);
    // aucun second bouton « quittance libre » dans la barre de commande
    expect(has('Quittance libre</button>')).toBe(false);
  });
  it('le mode libre s\'atteint depuis le sélecteur de lot de l\'éditeur', () => {
    expect(has('onclick="_qeModeLibre(')).toBe(true);
  });
});

describe('V7 — le garde-fou est un bandeau + une case, JAMAIS un verrou', () => {
  it('tous les mois sont cochables, y compris non soldés', () => {
    expect(has('// V7 : TOUS les mois sont cochables, y compris non soldés.')).toBe(true);
  });
  it('l\'émission passe outre le contrôle de solde et laisse une trace', () => {
    expect(has('_creerQuittance(_qe.ref, ym, { verifierSolde: false })')).toBe(true);
    // AUDIT I-2 : la pose ET le retrait de la trace passent par le module testé — le cycle de
    // vie complet est vérifié par le COMPORTEMENT dans quittance-editeur.test.js.
    expect(has('_qeAppliquerMeta(_qe.ref, [ym], forces);')).toBe(true);
    expect(has('window.metaApresEmission(DB.params.quittancesMeta || {}, {')).toBe(true);
  });
  it('le bandeau propose le reçu partiel en un clic', () => {
    expect(has('onclick="_qeRecuPartiel(')).toBe(true);
  });
  it('la confirmation est une case à cocher explicite', () => {
    expect(has('Je sais que ce document vaut reçu et éteint la dette')).toBe(true);
  });
  it('le bouton n\'est jamais désactivé par une RÈGLE, seulement par une saisie incomplète', () => {
    expect(has("why = 'Coche la confirmation ci-dessus'")).toBe(true);
    expect(has("why = 'Choisis au moins un mois'")).toBe(true);
  });
});

describe('V9 — l\'étiquette « sans paiement constaté » vit DANS L\'APP', () => {
  it('elle est posée dans le rail, avec le survol « qui a confirmé et quand »', () => {
    expect(has('window.etiquetteSansPaiement(meta, fd)')).toBe(true);
  });
  it('le DOCUMENT remis au locataire n\'en porte aucune trace', () => {
    // `_buildQuittanceHtml` ne reçoit ni la meta ni l'étiquette : par construction, le
    // document ne peut pas devenir un document bâtard, ni quittance ni reçu.
    expect(has('sans paiement constaté</')).toBe(false);
    const i = SRC.indexOf('function _buildQuittanceHtml');
    // On retire les commentaires : le builder EXPLIQUE la règle V9 en toutes lettres, mais il
    // ne doit jamais l'IMPRIMER — une mention de ce genre ferait un document bâtard.
    const build = SRC.slice(i, i + 14000).replace(/^[ \t]*\/\/.*$/gm, '');
    expect(build.includes('sans paiement constaté')).toBe(false);
    expect(build.includes('etiquetteSansPaiement')).toBe(false);
  });
  it('la trace voyage dans le blob de configuration, pas dans une colonne cloud inexistante', () => {
    expect(has('DB.params.quittancesMeta')).toBe(true);
  });
});

describe('V11/V12 — la saisie libre', () => {
  it('elle est EXCLUE des calculs : elle n\'entre pas dans DB.quittances', () => {
    expect(has('DB.params.quittancesLibres.push(entree)')).toBe(true);
    const fn = SRC.slice(SRC.indexOf('function _qeEditerLibre'), SRC.indexOf('function _qeBuildLibre'));
    expect(fn.includes('DB.quittances')).toBe(false);
  });
  it('elle est rejouable et rééditable — un état, pas une pile de versions', () => {
    expect(has('function _qeRejouerLibre(id)')).toBe(true);
    expect(has('if (i >= 0) DB.params.quittancesLibres[i] = entree; else DB.params.quittancesLibres.push(entree);')).toBe(true);
  });
  it('elle peut partir d\'un logement existant, tout restant modifiable (V12)', () => {
    expect(has('function _qeModeLibre(depuisLot)')).toBe(true);
  });
  it('sans date de paiement saisie, la ligne « payé le » ne sort pas (I-DATE)', () => {
    expect(has('infoPaiement: { date: s.datePaiement || null')).toBe(true);
  });
  it('elle ne crée pas un second gabarit de document', () => {
    const fn = SRC.slice(SRC.indexOf('function _qeBuildLibre'), SRC.indexOf('function _qeRenderPick'));
    expect(fn.includes('_buildQuittanceHtml')).toBe(true);
  });
});

describe('V6 — l\'enchaînement « lot suivant » quand plusieurs lots attendent', () => {
  it('le bouton n\'apparaît que s\'il reste un lot dans la pile', () => {
    expect(has('const suiv = window.lotSuivant(_qe.pile, _qe.ref);')).toBe(true);
    expect(has('Éditer &amp; lot suivant')).toBe(true);
  });
  it('la pile met les demandes mensuelles en tête', () => {
    expect(has('.sort((a, b) => (b.demande - a.demande) || (b.nb - a.nb))')).toBe(true);
  });
});

describe('AUDIT — correctifs de la passe de vérification', () => {
  it('C3 — le document déclare s\'il est partiel, et la règle de date en dépend', () => {
    expect(has('window.mentionDateRecu(_infoPay, fd, { partiel: _docPartiel })')).toBe(true);
    expect(has('const _docPartiel = (opts.partiel != null)')).toBe(true);
    expect(has('partiel: true')).toBe(true);            // le reçu partiel le déclare
  });
  it('V7 — le bouton « reçu partiel » n\'est proposé QUE si un versement existe', () => {
    // Sur un mois où RIEN n'est arrivé, ce reçu n'existe pas : le bouton menait à un document
    // « non émissible » — une impasse, au milieu d'un bandeau censé offrir une porte de sortie.
    expect(has('function _qeAPaiement(ym)')).toBe(true);
    expect(has('${_qeAPaiement(premier.ym)')).toBe(true);
  });
  it('V13 — le panneau du mois porte « ↺ Rééditer », comme le CDC l\'écrit', () => {
    expect(has('↺ Rééditer</button>')).toBe(true);
    expect(has("_ouvrirQuittanceSurMois('${_lyQ(q.logement)}'")).toBe(true);
  });
});

describe('V7 — une quittance FORCÉE est une quittance, pas un reçu partiel', () => {
  // Défaut trouvé à la re-vérification navigateur : l'utilisateur cochait « je sais que ce
  // document vaut reçu », l'app enregistrait un état « quittancé »… et le papier qui sortait
  // était un « Reçu de paiement partiel » de 300 € sur un terme de 800 €. L'état disait
  // quittancé, le document disait reçu : le geste que le CDC rend possible ne produisait pas
  // ce qu'il promet.
  it('la trace du geste forcé fait basculer le document en quittance pleine', () => {
    expect(has('const estComplet   = totalRecu >= total - 0.01 || _forceeV7;')).toBe(true);
    expect(has('const estNonPayé   = totalRecu <= 0 && !_forceeV7;')).toBe(true);
  });
  it('elle se lit dans la trace V9, ou se déclare explicitement pour l\'aperçu', () => {
    expect(has('const _forceeV7 = (opts.forceeV7 != null)')).toBe(true);
    expect(has("!!(prefixMois && typeof _qeMeta === 'function' && _qeMeta(q.logement, prefixMois))")).toBe(true);
  });
  it('le mois n\'étant pas soldé, elle sort SANS ligne « payé le » — ce que le bandeau promet', () => {
    // `_docPartiel` retombe à false quand c'est forcé → `mentionDateRecu` n'a plus le droit
    // au repli sur `dates` → I-DATE s'applique et la date disparaît.
    expect(has('(!_forceeV7 && totalRecu > 0 && totalRecu < total - 0.01)')).toBe(true);
  });
  it('cocher la case REFAIT l\'aperçu : on voit ce qui sortira, pas l\'ancien document', () => {
    expect(has('function _qeSetConfirme(on) { _qe.confirme = !!on; _qeRenderDoc(); _qeFootBtn(); }')).toBe(true);
    expect(has("forceeV7: ((m.etat === 'no' || m.etat === 'fut') && _qe.confirme)")).toBe(true);
  });
});

describe('CONTRE-AUDIT — R1/R5/R8 : le bon document, dans le bon contexte', () => {
  it('R1 — un reçu partiel n\'est JAMAIS forcé, par définition', () => {
    // Sans ce `false`, le builder retombait sur la trace V7 du mois : un mois déjà quittancé
    // de force puis partiellement payé (la cascade impute un versement de juin sur mai)
    // faisait sortir, sous une fenêtre « Reçu de paiement partiel », une QUITTANCE PLEINE de
    // 800 € datée du 14/06 pour 300 € réellement reçus.
    const i = SRC.indexOf('function _lyRecuPartiel');
    const fn = SRC.slice(i, SRC.indexOf('function _lyPreviewEphemere', i));
    expect(fn.includes('partiel: true')).toBe(true);
    expect(fn.includes('forceeV7: false')).toBe(true);
  });
  it('R5 — l\'aperçu d\'un mois DÉJÀ forcé montre le document réel, pas « non émissible »', () => {
    expect(has("|| !!(typeof _qeMeta === 'function' && _qeMeta(_qe.ref, m.ym))")).toBe(true);
  });
  it('R8 — le dû du document est lu APRÈS le repli legacy des montants', () => {
    // AUDIT I-3 : plus de dû calculé à part — le bloc vit APRÈS `total`, donc après le repli
    // legacy champ par champ, et il n'y a plus qu'UNE évaluation de `_forceeV7` (S-2).
    expect(has('const _duDoc')).toBe(false);
    expect(has('const _totalDu = (q.hc || 0) + (q.ch || 0);')).toBe(false);
    expect(has('const _forceeV7Pre')).toBe(false);
    expect(SRC.split('const _forceeV7 = (opts.forceeV7 != null)').length - 1).toBe(1);
  });
});
