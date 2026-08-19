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
    expect(has('_qeSetMeta(_qe.ref, ym, { forceePar: _qeQui(), forceeLe: td() })')).toBe(true);
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
    const build = SRC.slice(SRC.indexOf('function _buildQuittanceHtml'), SRC.indexOf('function _buildQuittanceHtml') + 12000);
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
