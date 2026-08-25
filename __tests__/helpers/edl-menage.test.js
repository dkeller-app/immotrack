/**
 * __tests__/helpers/edl-menage.test.js — chantier EDL TERRAIN, §A.5 (« le ménage du modèle »).
 *
 * Tranché par Didier le 20/08 : EDL_TPL passe de 127 à 109 éléments. Un REGROUPEMENT
 * n'est pas une suppression — la ligne fusionnée NOMME les deux objets pour rester
 * opposable. VMC seulement en Cuisine / Salle de bain / WC. La ligne DAAF quitte
 * « Extérieurs » (la section dédiée sécurité incendie reste seule à porter le constat).
 *
 * Le modèle ne vaut que pour les NOUVEAUX EDL : aucune migration rétroactive.
 * Ce test lit EDL_TPL / EDL_EXTRA dans index.html (comme biens-pieces.test.js) et
 * vérifie le résultat du ménage — pas une chaîne de source, le CONTENU du modèle.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '..', '..');

let EDL_TPL, EDL_EXTRA;
function extractConstArray(html, nom) {
  const start = html.indexOf(`const ${nom} = [`);
  if (start === -1) return null;
  const end = html.indexOf('\n];', start);
  if (end === -1) return null;
  // eslint-disable-next-line no-new-func
  return new Function('return ' + html.slice(html.indexOf('[', start), end + 2))();
}

beforeAll(() => {
  const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  EDL_TPL = extractConstArray(html, 'EDL_TPL');
  EDL_EXTRA = extractConstArray(html, 'EDL_EXTRA');
  expect(EDL_TPL).toBeTruthy();
  expect(EDL_EXTRA).toBeTruthy();
});

const piece = (nom) => EDL_TPL.find(p => p.nom === nom);
const tousLesElements = () => [].concat(EDL_TPL, EDL_EXTRA).flatMap(p => p.e);

describe('§A.5 — 127 → 109, comptes exacts par pièce', () => {
  it('les 7 pièces gardent leurs noms, dans l\'ordre de visite', () => {
    expect(EDL_TPL.map(p => p.nom)).toEqual([
      'Entrée / Couloir', 'Séjour / Salon', 'Cuisine', 'WC',
      'Salle de bain', 'Chambre 1', 'Extérieurs / Communs',
    ]);
  });
  it('chaque pièce a exactement le compte tranché', () => {
    expect(piece('Entrée / Couloir').e).toHaveLength(12);
    expect(piece('Séjour / Salon').e).toHaveLength(13);
    expect(piece('Cuisine').e).toHaveLength(25);
    expect(piece('WC').e).toHaveLength(15);
    expect(piece('Salle de bain').e).toHaveLength(20);
    expect(piece('Chambre 1').e).toHaveLength(14);
    expect(piece('Extérieurs / Communs').e).toHaveLength(10);
  });
  it('le total du modèle est 109', () => {
    expect(EDL_TPL.reduce((s, p) => s + p.e.length, 0)).toBe(109);
  });
});

describe('§A.5 — un regroupement N\'EST PAS une suppression : les lignes fusionnées ont disparu', () => {
  const disparues = [
    'Clé et poignée', 'Clé et poignée (autres portes)',
    'Thermostat radiateur', 'Sangle volet / Chaîne',
    'Porte d\'entrée', 'Porte / Menuiserie',
  ];
  it.each(disparues)('« %s » n\'existe plus comme ligne isolée, nulle part', (s) => {
    expect(tousLesElements()).not.toContain(s);
  });
});

describe('§A.5 — la ligne fusionnée NOMME les deux objets (opposable)', () => {
  it('Entrée : « Portes, clés et poignées » (4 lignes de porte → 1) + Serrure gardée à part', () => {
    const e = piece('Entrée / Couloir').e;
    const porte = e.find(x => /porte/i.test(x) && /cl[eé]/i.test(x));
    expect(porte, 'ligne porte+clé attendue').toBeTruthy();
    expect(porte).toMatch(/poign/i);            // nomme aussi la poignée
    expect(e).toContain('Serrure / Verrou');    // serrure : constat distinct, gardé
  });
  it('« Radiateur et thermostat » nomme les deux, partout où il y avait un thermostat', () => {
    for (const nom of ['Entrée / Couloir', 'Séjour / Salon', 'Cuisine', 'Chambre 1']) {
      const l = piece(nom).e.find(x => /radiateur et thermostat/i.test(x));
      expect(l, `Radiateur et thermostat attendu en ${nom}`).toBeTruthy();
    }
  });
  it('« Volet / store, sangle / chaîne » nomme les deux, là où il y avait une sangle', () => {
    for (const nom of ['Séjour / Salon', 'Chambre 1']) {
      const l = piece(nom).e.find(x => /volet/i.test(x) && /sangle/i.test(x));
      expect(l, `Volet+sangle attendu en ${nom}`).toBeTruthy();
    }
  });
  it('« Porte, clé et poignée » présent en Séjour, Cuisine, WC, Salle de bain, Chambre 1', () => {
    for (const nom of ['Séjour / Salon', 'Cuisine', 'WC', 'Salle de bain', 'Chambre 1']) {
      expect(piece(nom).e, nom).toContain('Porte, clé et poignée');
    }
  });
});

describe('§A.5 — VMC seulement en Cuisine, Salle de bain, WC', () => {
  it('présente dans les pièces humides', () => {
    for (const nom of ['Cuisine', 'Salle de bain', 'WC']) {
      expect(piece(nom).e, nom).toContain('VMC / Aération');
    }
  });
  it('retirée d\'Entrée, Séjour et Chambre', () => {
    for (const nom of ['Entrée / Couloir', 'Séjour / Salon', 'Chambre 1']) {
      expect(piece(nom).e, nom).not.toContain('VMC / Aération');
    }
  });
});

describe('§A.5 — le DAAF quitte « Extérieurs » (sanction pénale : jamais 2 constats contradictoires)', () => {
  it('aucune ligne « Détecteur de fumée (DAAF) » dans Extérieurs / Communs', () => {
    expect(piece('Extérieurs / Communs').e.some(x => /d[ée]tecteur|daaf/i.test(x))).toBe(false);
  });
  it('« Extérieurs / Communs » garde ses 10 autres constats', () => {
    expect(piece('Extérieurs / Communs').e).toEqual([
      'Garage', 'Cave', 'Terrasse / Balcon', 'Jardin / Pelouse', 'Clôture / Portail',
      'Sonnette / Interphone', 'Boîte aux lettres', 'Poubelles / Tri sélectif (multiflux)',
      'Éclairage extérieur', 'Autres observations',
    ]);
  });
});

describe('§A.5 « partout » — EDL_EXTRA suit les mêmes regroupements', () => {
  it('aucune pièce ajoutable ne porte une ligne fusionnée-au-passé isolée', () => {
    for (const s of ['Clé et poignée', 'Thermostat radiateur', 'Sangle volet / Chaîne']) {
      expect(EDL_EXTRA.flatMap(p => p.e), s).not.toContain(s);
    }
  });
  it('« Chambre » (le moule) est aligné sur « Chambre 1 » — mêmes 14 lignes', () => {
    const moule = EDL_EXTRA.find(p => p.nom === 'Chambre');
    expect(moule.e).toEqual(piece('Chambre 1').e);
  });
});
