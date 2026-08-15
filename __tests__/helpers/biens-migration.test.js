// BIENS étape 4 — migrations douces du chantier « simplification Biens ».
//
// Invariant du chantier : on retire des ÉCRANS, jamais des données. Ici, deux champs
// décrivaient le n° de lot en copropriété (log.lot, synchronisé cloud et lu par la clause
// de bail · log.numLot, doublon jamais synchronisé). Un seul survit à l'écran ; la valeur
// de l'autre est reversée, pas effacée.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { migrerNumLotVersLot } from '../../js/core/biens-migration.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

describe('migrerNumLotVersLot — le doublon n° lot copro est reversé, jamais perdu', () => {
  it('reverse numLot dans lot quand lot est vide', () => {
    const logs = [{ ref: 'L1', lot: '', numLot: 'Lot 12' }];
    const r = migrerNumLotVersLot(logs);
    expect(logs[0].lot).toBe('Lot 12');
    expect(r).toEqual({ migres: 1, refs: ['L1'] });
  });

  it('ne réécrit JAMAIS un lot déjà renseigné (le survivant fait foi)', () => {
    const logs = [{ ref: 'L1', lot: 'Lot 3', numLot: 'Lot 12' }];
    expect(migrerNumLotVersLot(logs).migres).toBe(0);
    expect(logs[0].lot).toBe('Lot 3');
  });

  it('ne supprime pas numLot (réversibilité)', () => {
    const logs = [{ ref: 'L1', lot: '', numLot: 'Lot 12' }];
    migrerNumLotVersLot(logs);
    expect(logs[0].numLot).toBe('Lot 12');
  });

  it('IDEMPOTENCE — un second passage ne change plus rien', () => {
    const logs = [{ ref: 'L1', lot: '', numLot: 'Lot 12' }, { ref: 'L2', lot: 'Lot 9', numLot: '' }];
    expect(migrerNumLotVersLot(logs).migres).toBe(1);
    const apres = JSON.parse(JSON.stringify(logs));
    expect(migrerNumLotVersLot(logs).migres).toBe(0);
    expect(logs).toEqual(apres);
    expect(migrerNumLotVersLot(logs).migres).toBe(0);
  });

  it('ignore les logements sans rien à reverser, les trous et les entrées non-objets', () => {
    const logs = [null, undefined, 'x', { ref: 'L1' }, { ref: 'L2', lot: '', numLot: '   ' }];
    expect(migrerNumLotVersLot(logs)).toEqual({ migres: 0, refs: [] });
    expect(logs[4].lot).toBe('');
  });

  it('trimme la valeur reversée', () => {
    const logs = [{ ref: 'L1', numLot: '  Lot 7 ' }];
    migrerNumLotVersLot(logs);
    expect(logs[0].lot).toBe('Lot 7');
  });

  it('accepte une entrée qui n\'est pas un tableau', () => {
    expect(migrerNumLotVersLot(null)).toEqual({ migres: 0, refs: [] });
    expect(migrerNumLotVersLot(undefined)).toEqual({ migres: 0, refs: [] });
  });
});

describe('BIENS étape 4 — la modale logement est bien passée à 3 onglets', () => {
  const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');

  it('3 onglets seulement : Identité, Diagnostics, Équipements', () => {
    const tabs = html.match(/class="logmod-tab[^"]*" data-tab="([a-z]+)"/g) || [];
    expect(tabs).toHaveLength(3);
    expect(html).toContain('data-tab="ident"');
    expect(html).toContain('data-tab="diag"');
    expect(html).toContain('data-tab="equip"');
    expect(html).not.toContain('data-tab="desc"');
    expect(html).not.toContain('data-tab="presentation"');
  });

  it('3 panneaux seulement, et les panes retirés ne sont plus dans le DOM', () => {
    expect((html.match(/class="logmod-pane/g) || [])).toHaveLength(3);
    expect(html).not.toContain('id="logmod-desc"');
    expect(html).not.toContain('id="logmod-presentation"');
  });

  it('les deep-links vers les onglets retirés sont REDIRIGÉS, pas ignorés en silence', () => {
    expect(html).toContain("if(tab === 'desc') tab = 'equip';");
    expect(html).toContain("if(tab === 'presentation') tab = 'ident';");
    expect(html).toContain("const ids = ['ident','diag','equip'];");
  });

  it('aucun id de champ n\'a été perdu au déménagement (P2-11)', () => {
    // Description → Équipements
    ['log-npp', 'log-piecesDesc', 'log-partiesCommunes',
     'log-typeHabitat', 'log-regimeJuridique', 'log-periodeConstr',
     'logmod-bati-own', 'logmod-bati-inherited-note',
     // Description → Identité
     'log-numFiscal', 'log-tantiemes', 'log-lot', 'log-compteCharges',
     // Présentation → Identité (étape 2)
     'logp-loc-dgRef', 'logp-loc-irlRef', 'logp-loc-dispo', 'logp-loc-g-visale',
     // déjà en Équipements depuis v15.249 B4
     'logp-cu-four', 'logp-sa-douche', 'logp-te-fibre', 'logp-ext-balcon-p', 'logp-an-cave-p'
    ].forEach(id => expect(html, 'id manquant : ' + id).toContain('id="' + id + '"'));
  });

  it('le doublon log-numLot n\'a plus d\'input et n\'est plus écrit', () => {
    expect(html).not.toContain('id="log-numLot"');
    expect(html).not.toContain("log.numLot = v('log-numLot')");
  });

  it('les boutons Annonce sont débranchés mais le module reste', () => {
    const appels = (html.match(/openAnnonce\(/g) || []).length;
    expect(appels, 'seule la définition doit rester').toBe(1);
    expect(html).toContain('function openAnnonce(');   // moteur conservé, sans porte d'entrée
    expect(html).not.toContain("openLogModalOnTab('${refSafe}','presentation')");
  });
});
