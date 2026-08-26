/**
 * CDC-LOYERS-DESIGN — V14 « Trois règles de langue, non négociables » + I-MOT,
 * et les invariants STRUCTURELS de l'écran M5 (V1/V2/V15/V3/V4).
 *
 * Le vocabulaire de l'onglet Loyers a été tranché mot à mot par Didier le 19/08 :
 *   · « Impayés » remplace « Pas à jour » (« ça ne veut rien dire, il faut un terme punch ») ;
 *   · « IRL non appliquées » remplace « Perdues » — ne pas appliquer une révision PEUT être
 *     un choix, et la révision revient à chaque anniversaire ; seul le cycle passé s'éteint ;
 *   · jamais une icône + un chiffre sans mot (I-MOT).
 *
 * Un libellé et une structure d'écran ne se vérifient pas par un calcul : ils se vérifient
 * dans le source. Ces tests empêchent qu'un futur chantier réintroduise ce qui a été écarté
 * — en particulier le groupement bailleur > immeuble EN LIGNES, la cause mesurée des
 * 3 691 px de l'écran livré en v15.537.
 *
 * ⚠️ Les assertions portent sur des BOOLÉENS, jamais sur `expect(SRC)` : index.html fait
 * 3,7 Mo et un échec ferait sérialiser tout le fichier dans le rapport (le worker Vitest
 * meurt sur « Invalid array length »).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const has = (s) => SRC.includes(s);
const matches = (re) => re.test(SRC);

describe('V14 — « Impayés » remplace « Pas à jour »', () => {
  it('la famille s\'appelle « Impayés »', () => {
    expect(matches(/retard:\s*\{ ico: '💸', t: 'Impayés'/)).toBe(true);
  });
  it('« Pas à jour » n\'est plus un libellé de famille ni un titre', () => {
    expect(matches(/t: '[^']*Pas à jour/)).toBe(false);
    expect(has("'⏳ Pas à jour'")).toBe(false);
  });
  it('son sous-titre nomme ce qui manque, pas un état vague', () => {
    expect(has("Loyer ou charges non réglés — aucun document n\\'est émis")).toBe(true);
  });
  it('la tuile porte le mot « Impayés » et un montant, jamais une icône seule', () => {
    expect(has("tuile('retard', 'neg', 'Impayés'")).toBe(true);
    expect(has('de retard sur ')).toBe(true);
  });
});

describe('V14 — « IRL non appliquées » remplace « Perdues »', () => {
  it('la pastille de la bande Suivi s\'appelle « IRL non appliquées »', () => {
    expect(has("pastille('perdue', '⏸ IRL non appliquées'")).toBe(true);
  });
  it('« Perdues » n\'est plus un titre de bloc ni de panneau', () => {
    expect(matches(/'[^']*⌛ Perdues/)).toBe(false);
  });
  it('l\'app ne dit plus « présumé abandonné » — la loi éteint un cycle, elle ne juge pas l\'intention', () => {
    expect(has('présumé abandonné')).toBe(false);
    expect(has('présumées abandonnées')).toBe(false);
  });
  it('le libellé de ligne est celui figé par V14, au mot près', () => {
    expect(has("Cycle du ${fd(r.perdue.effetIso)} non appliqué, éteint le ${fd(prescritIso)} (délai d'un an)")).toBe(true);
  });
  it('l\'écran dit que la révision revient à chaque anniversaire, aux indices du moment', () => {
    expect(has("à chaque anniversaire du bail, sur les indices du moment")).toBe(true);
  });
  it('le manque à gagner est étiqueté « non appliqués », pas présenté comme perdu', () => {
    expect(has('/mois non appliqués')).toBe(true);
  });
});

describe('V20/V21 — « Non révisables » annonce un avertissement, pas un verrou', () => {
  it('le panneau dit explicitement que ce sont des avertissements, pas des verrous', () => {
    expect(has('pas des verrous')).toBe(true);
  });
  it('il ne dit plus « Rien à faire — listés pour ne pas les chercher »', () => {
    expect(has('Rien à faire — listés pour ne pas les chercher')).toBe(false);
  });
});

describe('V1 — l\'écran est un tableau de bord : trois tuiles, UNE seule liste', () => {
  it('les trois tuiles existent, chacune avec sa clé en toutes lettres', () => {
    expect(has("'Impayés'")).toBe(true);
    expect(has("'À remettre'")).toBe(true);
    expect(has("'À préparer'")).toBe(true);
  });
  it('D25 — les révisions (À préparer) sont la liste affichée par défaut (l\'IRL en premier)', () => {
    // Le rare et périssable (une révision se perd à un an de prescription) passe avant le fréquent
    // et rattrapable (un impayé, une quittance). Changé de 'retard' → 'rev' au 26/08 (D25).
    expect(matches(/_lyUI = \{ tuile: 'rev'/)).toBe(true);
  });
  it('une seule liste est rendue à la fois (if / else if / else sur la tuile)', () => {
    expect(has("if (_lyUI.tuile === 'quit')")).toBe(true);
    expect(has("} else if (_lyUI.tuile === 'rev') {")).toBe(true);
  });
});

describe('V2 — le groupement bailleur > immeuble est une COLONNE, pas des lignes', () => {
  it('la gouttière de contexte existe', () => {
    expect(has('class="ly2-gut"')).toBe(true);
    expect(has('class="ly2-run')).toBe(true);
  });
  it('les en-têtes de groupe pleine largeur de l\'écran livré ont disparu', () => {
    // `.ly-grp-b` / `.ly-grp-i` étaient les DEUX lignes posées par groupe, dans CHAQUE bloc :
    // 45 lignes d'en-tête pour 32 lignes de données.
    expect(has('ly-grp-b')).toBe(false);
    expect(has('ly-grp-i')).toBe(false);
  });
  it('le groupage n\'est pas réinventé : il vient de js/core/group-by-imm.js', () => {
    expect(has('G._grouperLotsParBailleurEtImmeuble')).toBe(true);
  });
});

describe('V3/V4 — la frise IRL est un ruban de 12 tuiles, toujours affiché', () => {
  it('le ruban est rendu sans condition d\'ouverture, dans le flux de rLoyers', () => {
    expect(has('html += _lyFriseRuban(etats);')).toBe(true);
  });
  it('le Gantt « 1 lot × 12 mois » (33 lignes sur le parc réel) a disparu', () => {
    expect(has('_lyCalendrierResume')).toBe(false);
    expect(has('ly-gt-wrap')).toBe(false);
  });
  it('aucun calendrier n\'est recalculé : le ruban agrège ganttRevisions', () => {
    expect(has('window.IrlCalendrier.rubanRevisions(window.IrlCalendrier.ganttRevisions(')).toBe(true);
  });
});

describe('V15 — densité Confort et lignes allégées', () => {
  it('l\'écran est rendu en densité Confort', () => {
    expect(has('<div class="ly2 cft">')).toBe(true);
  });
  it('les lignes de 40 px sont définies', () => {
    expect(has('#p-loyers .ly2.cft .ly2-r{min-height:40px')).toBe(true);
  });
  it('la ligne de révision ne répète plus les deux indices ni la date de bail', () => {
    // Ils vivent dans la fenêtre de validation, pas dans la liste.
    expect(has('Bail du ${dbut} → effet au')).toBe(false);
  });
});

describe('I-MOT — aucune information chiffrée sans libellé en toutes lettres', () => {
  it('chaque famille de bloc porte une icône ET un titre en toutes lettres', () => {
    const bloc = SRC.slice(SRC.indexOf('const _LY_FAM = {'), SRC.indexOf('function rLoyers()'));
    const titres = [...bloc.matchAll(/,\s+t: '([^']+)'/g)].map((m) => m[1]);
    expect(titres.length).toBe(4);
    for (const t of titres) expect(/[A-Za-zÀ-ÿ]{3,}/.test(t)).toBe(true);
  });
  it('chaque pastille de la bande Suivi porte son libellé', () => {
    for (const lbl of ['⏸ IRL non appliquées', '🔒 Non révisables',
      '🧾 Quittances éditées ce mois', '📊 Suivi mois par mois']) {
      expect(has("'" + lbl + "'")).toBe(true);
    }
  });
});
