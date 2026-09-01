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

describe('V7/D27 — l\'alerte est un bandeau NON BLOQUANT, JAMAIS un verrou ni une case', () => {
  it('tous les mois sont CLIQUABLES, y compris non soldés et déjà édités (D27)', () => {
    expect(has('TOUS les mois restent cliquables, y compris non soldés et déjà édités')).toBe(true);
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
  it('D27 (retour Didier) — PLUS de case à cocher : « on met une alerte mais on laisse libre »', () => {
    expect(SRC.includes('Je sais que ce document vaut reçu')).toBe(false);
    expect(SRC.includes('_qeSetConfirme')).toBe(false);
    expect(SRC.includes('_qe.confirme')).toBe(false);
    // le bandeau rassure au lieu de bloquer, et dit que l'app marque « sans paiement constaté »
    expect(has('Tu peux l\'éditer quand même.')).toBe(true);
    expect(has('sans paiement constaté')).toBe(true);
  });
  it('AUCUNE règle ne grise le bouton : seule une saisie sans mois le désactive', () => {
    expect(SRC.includes("why = 'Coche la confirmation ci-dessus'")).toBe(false);
    expect(SRC.includes('confirmationRequise && !_qe.confirme')).toBe(false);
    expect(has("why = 'Choisis un mois'")).toBe(true);
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

describe('D27 — un lot, un mois, un document ; aucune impasse', () => {
  it('la sélection est UNIQUE : un mois choisi, rien à décocher', () => {
    expect(has('function _qeChoisirMois(ym)')).toBe(true);
    expect(has('const on = _qe.ym === m.ym;')).toBe(true);
    expect(SRC.includes('_qe.sel')).toBe(false);
    expect(SRC.includes('_qeToggle(')).toBe(false);
  });
  it("l'enchaînement « lot suivant » et la pile ont disparu", () => {
    expect(SRC.includes('lotSuivant')).toBe(false);
    expect(SRC.includes('_qe.pile')).toBe(false);
  });
  it('le bouton NOMME le mois (élidé, sans année), et la réédition se dit', () => {
    expect(has('`Rééditer la quittance ${moisLbl}`')).toBe(true);
    expect(has('`Éditer la quittance ${moisLbl}`')).toBe(true);
  });
  it("plus d'onglets « N documents » : un seul document à l'écran", () => {
    expect(SRC.includes('_qeOnglet')).toBe(false);
    expect(SRC.includes('documents — un par mois')).toBe(false);
  });
  it('règle 5 — sur téléphone le bouton principal reste visible', () => {
    expect(has('.qd-foot .rec{flex:0 0 100%;order:0}')).toBe(true);
    expect(has('.qd-foot .btn.bp{flex:2}')).toBe(true);
  });
  it("le document édité s'ouvre : c'est de là qu'on le partage ou l'enregistre", () => {
    expect(has('if (faites.length) previewQuit(faites[0].id);')).toBe(true);
  });
  it("le pied de l'aperçu n'a qu'UN bouton, comme l'EDL", () => {
    expect(has('<button class="btn bp" id="qp-action" onclick="_qpAction()"></button>')).toBe(true);
    expect(SRC.includes('_archiveQuittancePreviewModal &&')).toBe(false);
    expect(SRC.includes('_printQuittancePreviewModal()">')).toBe(false);
    expect(SRC.includes('_emailQuittancePreviewModal')).toBe(false);
  });
  it("D27 (retour Didier) — le libellé SUIT l'appareil : « Partager » sur tactile, « Télécharger le PDF » sur PC", () => {
    const i = SRC.indexOf('function _qpMajBoutonAction');
    const fn = SRC.slice(i, i + 700);
    expect(fn.includes('_edlPrefersShare()')).toBe(true);
    expect(fn.includes("b.textContent = share ? '📤 Partager' : '⬇️ Télécharger le PDF'")).toBe(true);
    // le GESTE, lui, fait les deux (partage natif / enregistrement) via _pdfSortie
    expect(has('function _pdfSortie(')).toBe(true);
  });
  it("Retour Didier — noms de fichiers SANS accents (août → aout) via _edlSanitize", () => {
    const i = SRC.indexOf('function _edlSanitize');
    expect(SRC.slice(i, i + 200).includes("normalize('NFD')")).toBe(true);
  });
  it("Retour Didier — PDF natif : signature à ratio préservé + parties en cartouches côte à côte", () => {
    const dn = fs.readFileSync(path.join(ROOT, 'js/helpers/doc-native.global.js'), 'utf8');
    expect(dn.includes('getImageProperties(src)')).toBe(true);                              // ratio signature lu
    expect(dn.includes("addImage(src, 'PNG', bx, yy, Math.min(bw, 58), 10)")).toBe(false);  // ancien forçage 58×10 retiré
    expect(dn.includes('roundedRect')).toBe(true);                                          // cartouches gris des parties
  });
  it("D27 (retour Didier) — LISTE sur PC/tablette (comme avant), BULLES seulement sur téléphone (place)", () => {
    // défaut (large) = liste : lignes en grille, état + montant par ligne
    expect(has('.qd-m{display:grid;grid-template-columns:16px minmax(0,1fr) auto')).toBe(true);
    expect(has('.qd-selmo{display:none}')).toBe(true);                 // pas de ligne de détail sur la liste
    // sous 600 px : bulles qui s'enroulent + ligne de détail montrée
    expect(has('@media (max-width:600px)')).toBe(true);
    expect(has('.qd-mois{display:flex;flex-wrap:wrap')).toBe(true);    // (dans la media query téléphone)
    expect(has('class="qd-selmo"')).toBe(true);
    expect(SRC.includes('<span class="bx">✓</span>')).toBe(false);    // la case de liste a disparu
    expect(SRC.includes('grid-auto-flow:column')).toBe(false);        // plus de carrousel horizontal
  });
  it("D27 (retour Didier) — les mois À VENIR sont masqués (on ne quittance pas un mois pas arrivé)", () => {
    expect(has('function _qeRailVisible()')).toBe(true);
    expect(has("_qeRail().filter(m => m.etat !== 'fut')")).toBe(true);
  });
  it("D27 (retour Didier) — le bouton nomme le mois ÉLIDÉ et sans année (« d'avril », « de septembre »)", () => {
    expect(has('function _qeMoisLabel(ym)')).toBe(true);
    expect(has("? \"d'\" : 'de '")).toBe(true);              // avril/août/octobre → d'
    expect(has('`Éditer la quittance ${moisLbl}`')).toBe(true);
  });
  it("il fonctionne aussi sur un document éphémère (reçu partiel, relance)", () => {
    expect(has('function _qpAction()')).toBe(true);
    // Un document non persisté sort par la MÊME fonction, avec le même moteur natif.
    expect(has("genererBlob: () => window._docHtmlToNativeBlob(built.html")).toBe(true);
    expect(SRC.includes("_printQuittancePreviewModal")).toBe(false);
  });
  it('le mois sans paiement offre la sortie utile, jamais un bouton mort', () => {
    expect(has('Enregistrer le paiement')).toBe(true);
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
  it('D27 (retour Didier) — « Document non émissible » N\'EXISTE PLUS : un mois sans paiement bascule en QUITTANCE pleine', () => {
    expect(SRC.includes('estNonPayé')).toBe(false);                 // la branche impasse a disparu du code
    expect(SRC.includes('AUCUN PAIEMENT ENREGISTRÉ')).toBe(false);  // son texte aussi
    expect(has('const estPartiel   = totalRecu > 0 && totalRecu < total - 0.01 && !_forceeV7;')).toBe(true);
    expect(has("(estPartiel?'Reçu partiel':'Quittance')")).toBe(true);   // le titre ne connaît plus l'impasse
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
  it('D27 (retour Didier) — un mois non soldé est TOUJOURS une quittance pleine forcée, sans case à cocher', () => {
    expect(SRC.includes('_qeSetConfirme')).toBe(false);
    expect(SRC.includes('&& _qe.confirme')).toBe(false);
    expect(has("forceeV7: (m.etat === 'no' || m.etat === 'fut')")).toBe(true);
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
  it("D27 — le chemin PDF ne rallume aucune impasse « no-payment » (statut 'non-paye' retiré du module)", () => {
    // Angle mort de l'audit précédent : le grep « non-paye » n'avait porté que sur index.html.
    // Ce consommateur mort vivait dans le module PDF — on garde le module aussi.
    const pdf = fs.readFileSync(path.join(ROOT, 'js/core/email-pdf-attachment.js'), 'utf8');
    expect(pdf.includes("status === 'non-paye'")).toBe(false);
    expect(pdf.includes('no-payment')).toBe(false);
  });
});
