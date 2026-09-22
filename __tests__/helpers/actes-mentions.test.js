/**
 * DOC-C (AUDIT-GLOBAL) — Un acte juridique ne doit pas partir en PDF avec ses trous.
 *
 * Le défaut : `_congeSortiePdf` (index.html) génère le document et l'envoie au PDF sans aucune
 * vérification. Or `_congeExtra` remplace un champ vide par un marqueur — « ‹prix› »,
 * « ‹conditions› », « ‹bénéficiaire› ». Le champ « Prix de vente » n'a AUCUNE valeur par défaut :
 * ouvrir « Congé bailleur → Vente » et cliquer « Télécharger le PDF » produit, aujourd'hui, un
 * congé portant « au prix de ‹prix› € ». L'art. 15-II le frappe de nullité, et le bailleur ne
 * l'apprend qu'au tribunal — après avoir engagé une vente.
 *
 * L'avenant, lui, a déjà le bon réflexe (`_avenantChampsOk` → confirm2). On garde CE patron :
 * l'app ALERTE, elle ne bloque pas (« l'utilisateur décide », index.html:24350). Ce qui change,
 * c'est qu'elle dit ce que ça COÛTE quand la mention est prescrite à peine de nullité.
 */

import { describe, it, expect } from 'vitest';
import { mentionsManquantes, emporteNullite, messageMentionsManquantes } from '../../js/core/actes-mentions.js';

const M = (s) => '‹' + s + '›';

describe('mentionsManquantes — on lit le DOCUMENT rendu, pas le formulaire', () => {
  it('un acte complet ne signale rien', () => {
    expect(mentionsManquantes('<p>Vente du logement, au prix de <b>250000</b> €.</p>')).toEqual([]);
  });

  it('repère le marqueur laissé par un champ vide', () => {
    const r = mentionsManquantes('<p>au prix de ' + M('prix') + ' €</p>');
    expect(r).toHaveLength(1);
    expect(r[0].marqueur).toBe('prix');
  });

  it('le congé pour VENTE sans prix ni conditions : deux mentions, toutes deux fatales', () => {
    // Le texte exact produit par `_congeExtra` quand les deux champs sont vides.
    const html = '<p>Vente du logement, au prix de ' + M('prix') + ' € — conditions : ' + M('conditions') + '.</p>';
    const r = mentionsManquantes(html);
    expect(r.map((x) => x.marqueur)).toEqual(['prix', 'conditions']);
    expect(r.every((x) => x.nullite)).toBe(true);
    expect(r[0].fondement).toMatch(/15-II/);
  });

  it('le congé pour REPRISE sans bénéficiaire est fatal aussi (art. 15-I)', () => {
    const r = mentionsManquantes('<p>au bénéfice de ' + M('bénéficiaire') + ' (le bailleur lui-même).</p>');
    expect(r[0].nullite).toBe(true);
    expect(r[0].fondement).toMatch(/15-I\b/);
  });

  it('un motif légitime non décrit est fatal (art. 15-I)', () => {
    const r = mentionsManquantes('<p>' + M('description du motif légitime et sérieux') + '</p>');
    expect(r[0].nullite).toBe(true);
  });

  it('les trous NON fatals sont signalés, mais sans crier à la nullité', () => {
    // Mise en demeure et avenant : le document est incomplet, l'acte n'est pas nul pour autant.
    const r = mentionsManquantes('<p>' + M('montant') + ' pour ' + M('période') + ' — ' + M('à compléter') + '</p>');
    expect(r).toHaveLength(3);
    expect(r.some((x) => x.nullite)).toBe(false);
    expect(emporteNullite(r)).toBe(false);
  });

  it('ordre d’apparition respecté et doublons écrasés', () => {
    const html = M('conditions') + ' ... ' + M('prix') + ' ... ' + M('prix');
    expect(mentionsManquantes(html).map((x) => x.marqueur)).toEqual(['conditions', 'prix']);
  });

  it('deux appels successifs donnent le MÊME résultat', () => {
    // La regex est globale et partagée : sans remise à zéro de `lastIndex`, un appel sur deux
    // repartait du milieu du document et ratait les premières mentions.
    const html = '<p>' + M('prix') + ' et ' + M('conditions') + '</p>';
    expect(mentionsManquantes(html)).toEqual(mentionsManquantes(html));
    expect(mentionsManquantes(html)).toHaveLength(2);
  });

  it('entrées dégradées : jamais d’exception', () => {
    expect(mentionsManquantes(null)).toEqual([]);
    expect(mentionsManquantes(undefined)).toEqual([]);
    expect(mentionsManquantes('')).toEqual([]);
    expect(mentionsManquantes(42)).toEqual([]);
  });

  it('un chevron ouvrant seul, ou un marqueur démesuré, ne déclenche rien', () => {
    expect(mentionsManquantes('<p>‹ ouvert sans fermeture</p>')).toEqual([]);
    expect(mentionsManquantes(M('x'.repeat(200)))).toEqual([]);
  });
});

describe('emporteNullite — la question qui change le ton du message', () => {
  it('vrai dès UNE mention fatale, même noyée parmi des trous bénins', () => {
    expect(emporteNullite(mentionsManquantes(M('à compléter') + M('prix')))).toBe(true);
  });
  it('faux sur une liste vide ou absente', () => {
    expect(emporteNullite([])).toBe(false);
    expect(emporteNullite(null)).toBe(false);
  });
});

describe('messageMentionsManquantes — dire ce qui manque, ce que ça coûte, et quoi faire', () => {
  it('vide quand il n’y a rien à dire (pas de boîte de dialogue inutile)', () => {
    expect(messageMentionsManquantes([])).toBe('');
    expect(messageMentionsManquantes(null)).toBe('');
  });

  it('une mention fatale : le mot NUL, le fondement, et l’avertissement d’inopposabilité', () => {
    const msg = messageMentionsManquantes(mentionsManquantes(M('prix')), 'Générer le PDF');
    expect(msg).toMatch(/NUL/);
    expect(msg).toMatch(/15-II/);
    expect(msg).toMatch(/Générer le PDF quand même/);
    expect(msg).toMatch(/sans effet : le bail se poursuivrait/);
  });

  it('accorde le pluriel plutôt que d’écrire « 1 mentions »', () => {
    expect(messageMentionsManquantes(mentionsManquantes(M('prix')))).toMatch(/une mention obligatoire manque/);
    expect(messageMentionsManquantes(mentionsManquantes(M('prix') + M('conditions')))).toMatch(/2 mentions obligatoires manquent/);
  });

  it('sans mention fatale : on signale, on ne parle pas de nullité', () => {
    const msg = messageMentionsManquantes(mentionsManquantes(M('montant')), 'Générer le PDF');
    expect(msg).not.toMatch(/NUL/);
    expect(msg).not.toMatch(/sans effet/);
    expect(msg).toMatch(/Générer le PDF quand même \?/);
  });

  it('les deux familles cohabitent, les fatales en premier', () => {
    const msg = messageMentionsManquantes(mentionsManquantes(M('montant') + M('prix')));
    expect(msg.indexOf('NUL')).toBeLessThan(msg.indexOf('montant'));
  });
});
