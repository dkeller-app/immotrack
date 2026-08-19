/**
 * CDC-LOYERS-DESIGN — V14 « Trois règles de langue, non négociables » + I-MOT.
 *
 * Le vocabulaire de l'onglet Loyers a été tranché mot à mot par Didier le 19/08 :
 *   · « Impayés » remplace « Pas à jour » (« ça ne veut rien dire, il faut un terme punch ») ;
 *   · « IRL non appliquées » remplace « Perdues » — ne pas appliquer une révision PEUT être
 *     un choix, et la révision revient à chaque anniversaire ; seul le cycle passé s'éteint ;
 *   · jamais une icône + un chiffre sans mot (I-MOT).
 *
 * Un libellé n'est pas testable par un calcul : il se vérifie dans le source. Ces tests
 * empêchent qu'un futur chantier réintroduise le vocabulaire écarté sans rouvrir le CDC.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('V14 — « Impayés » remplace « Pas à jour »', () => {
  it('le bloc s\'appelle « Impayés »', () => {
    expect(SRC).toMatch(/_lyBloc\('💸 Impayés'/);
  });
  it('« Pas à jour » n\'est plus un titre de bloc nulle part', () => {
    expect(SRC).not.toMatch(/_lyBloc\('[^']*Pas à jour/);
  });
  it('son sous-titre nomme ce qui manque, pas un état vague', () => {
    expect(SRC).toContain("'Loyer ou charges non réglés — aucun document n\\'est émis'");
  });
});

describe('V14 — « IRL non appliquées » remplace « Perdues »', () => {
  it('le bloc s\'appelle « IRL non appliquées »', () => {
    expect(SRC).toMatch(/_lyBloc\('⏸ IRL non appliquées'/);
  });
  it('« Perdues » n\'est plus un titre de bloc', () => {
    expect(SRC).not.toMatch(/_lyBloc\('[^']*Perdues'/);
  });
  it('l\'app ne dit plus « présumé abandonné » — la loi éteint un cycle, elle ne juge pas l\'intention', () => {
    expect(SRC).not.toContain('présumé abandonné');
    expect(SRC).not.toContain('présumées abandonnées');
  });
  it('le libellé de ligne est celui figé par V14, au mot près', () => {
    expect(SRC).toContain('Cycle du ${fd(rev.perdue.effetIso)} non appliqué, éteint le ${fd(prescritIso)}');
  });
  it('le sous-titre dit que la révision revient à chaque anniversaire', () => {
    expect(SRC).toContain('la révision revient à chaque anniversaire, aux indices du moment');
  });
  it('le manque à gagner est étiqueté « non appliqués », pas présenté comme perdu', () => {
    expect(SRC).toContain('${fmt(gain)}/mois non appliqués');
  });
});

describe('V20/V21 — « Non révisables » annonce un avertissement, pas un verrou', () => {
  it('le sous-titre dit explicitement « jamais blocage »', () => {
    expect(SRC).toContain('avertissement, jamais blocage');
  });
  it('il ne dit plus « Rien à faire »', () => {
    expect(SRC).not.toContain('Rien à faire — listés pour ne pas les chercher');
  });
});

describe('I-MOT — aucune information chiffrée sans libellé en toutes lettres', () => {
  // La pastille de compteur d'un bloc (`<span class="n">`) est toujours précédée, dans le
  // même en-tête, du titre en toutes lettres posé par `_lyBloc(titre, n, …)`. Ce que V14
  // interdit, c'est la rangée de compteurs icône+chiffre SANS libellé (la variante écartée) :
  // aucune ne doit exister dans la ligne de commande de l'onglet.
  it('_lyBloc reçoit toujours un titre en toutes lettres avant son compteur', () => {
    const appels = [...SRC.matchAll(/_lyBloc\(\s*('(?:[^'\\]|\\.)*'|`[^`]*`)/g)].map((m) => m[1]);
    expect(appels.length).toBeGreaterThan(3);
    for (const t of appels) {
      // au moins trois lettres consécutives : un titre, pas une icône seule
      expect(t).toMatch(/[A-Za-zÀ-ÿ]{3,}/);
    }
  });
});
