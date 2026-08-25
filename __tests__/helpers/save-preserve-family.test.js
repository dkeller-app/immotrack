// FAMILLE « écritures destructrices » — LOT 1, deuxième moitié.
//
// saveImm et saveEnt n'étaient pas des cas isolés, et saveBail non plus. Le motif est :
//     const obj = { …lu depuis le formulaire… };   puis   DB.collection[i] = obj;
// Tout champ sans input dans CETTE modale disparaît alors SANS TOMBSTONE ET SANS UNDO.
// Recensement exhaustif fait sur index.html v15.541 (les `DB.x[i] = { … }` littéraux restants
// sont tous des TOMBSTONES volontaires des fonctions de suppression, pas des sauvegardes).
//
// Ce fichier teste le COMPORTEMENT attendu sur les formes réelles de chaque enregistrement.
// Le câblage dans index.html est vérifié dans le navigateur, en exécutant les vraies fonctions
// de sauvegarde (cf. rapport de chantier) — pas par une recherche de chaîne dans le monolithe.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { _preserverChampsExistants, _preserverSaufChampsPilotes } from '../../js/core/preserve-fields.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8'); });

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const end = src.indexOf('\n}', start);
  if (end === -1) return null;
  return src.slice(start, end + 2).replace(/\r/g, '');
}

describe('_preserverSaufChampsPilotes — quand un bloc amont fait autorité sur quelques clés', () => {
  it('une clé pilotée ABSENTE du reconstruit le reste (la PJ retirée n\'est pas ressuscitée)', () => {
    // saveMv : le bloc pièce jointe a retiré la PJ (l\'utilisateur a cliqué « Supprimer »).
    const m = { id: 7, lib: 'Loyer août', db: 0, cr: 610 };            // aucune clé pj/pjId
    _preserverSaufChampsPilotes(m, { id: 7, lib: 'Loyer août', pjId: 42, bankTxId: 'TX-99' }, ['pj', 'pjId']);
    expect('pjId' in m).toBe(false);
    expect(m.bankTxId).toBe('TX-99');   // le reste, lui, est bien préservé
  });

  it('une clé pilotée PRÉSENTE garde la valeur décidée par le bloc', () => {
    const m = { id: 7, lib: 'Loyer août', pjId: 55 };                   // le bloc a créé un doc
    _preserverSaufChampsPilotes(m, { id: 7, pjId: 42 }, ['pj', 'pjId']);
    expect(m.pjId).toBe(55);
  });

  it('une clé pilotée présente avec une valeur FAUSSE (null, 0, \'\') n\'est pas écrasée', () => {
    const m = { pjId: null };
    _preserverSaufChampsPilotes(m, { pjId: 42 }, ['pj', 'pjId']);
    expect(m.pjId).toBe(null);
  });

  it('sans clé pilotée, se comporte exactement comme la préservation générique', () => {
    const a = { x: 1 }, b = { x: 1 };
    const src = { x: 9, y: 2, z: 3 };
    _preserverSaufChampsPilotes(a, src, []);
    _preserverChampsExistants(b, src);
    expect(a).toEqual(b);
  });

  it('entrées dégradées : rend la cible telle quelle', () => {
    const r = { a: 1 };
    expect(_preserverSaufChampsPilotes(r, null, ['pj'])).toBe(r);
    expect(_preserverSaufChampsPilotes(null, { a: 1 }, ['pj'])).toBe(null);
    expect(_preserverSaufChampsPilotes(r, { b: 2 }, null)).toEqual({ a: 1, b: 2 });
  });
});

describe('les 7 écrans de la famille — ce qui partait à la trappe', () => {
  it('MOUVEMENT : les tags d\'import bancaire et le tag multi-espace survivent à une édition', () => {
    // saveMv reconstruit { id,date,lib,imm,cat,qui,db,cr,fac,compteurCcId } : tout le reste partait.
    const existant = { id: 7, date: '2026-08-05', lib: 'Loyer', imm: 'FERRETTE', cat: 'Loyers',
      qui: 'FER-001', db: 0, cr: 610, fac: '', compteurCcId: '',
      bankTxId: 'TX-2026-08-05-0001', _importLot: 'releve-aout', _espaceId: 'ESP-SCI', regulId: 12 };
    const reconstruit = { id: 7, date: '2026-08-05', lib: 'Loyer août', imm: 'FERRETTE', cat: 'Loyers',
      qui: 'FER-001', db: 0, cr: 610, fac: '', compteurCcId: '' };
    _preserverSaufChampsPilotes(reconstruit, existant, ['pj', 'pjId']);
    expect(reconstruit.bankTxId).toBe('TX-2026-08-05-0001');   // sans lui, le ré-import redouble la ligne
    expect(reconstruit._importLot).toBe('releve-aout');
    expect(reconstruit._espaceId).toBe('ESP-SCI');
    expect(reconstruit.regulId).toBe(12);
    expect(reconstruit.lib).toBe('Loyer août');                 // la saisie gagne
  });

  it('CANDIDAT : les 6 lignes nominatives ne suffisaient pas', () => {
    // Elles couvrent dateCreation/statut/_archived/bailRef/notes/piecesVerifiees ; le reste, non.
    const existant = { id: 'c1', nom: 'Muller', statut: 'retenu', dateCreation: '2026-01-05',
      documents: [{ id: 3, nom: 'avis-imposition.pdf' }], _espaceId: 'ESP-SCI', historique: [{ at: '2026-02-01' }] };
    const reconstruit = { id: 'c1', nom: 'Muller', revenus: 2400, statut: 'retenu', dateCreation: '2026-01-05' };
    _preserverChampsExistants(reconstruit, existant);
    expect(reconstruit.documents).toHaveLength(1);
    expect(reconstruit.historique).toHaveLength(1);
    expect(reconstruit._espaceId).toBe('ESP-SCI');
  });

  it('ASSURANCE : le tag multi-espace et les tombstones survivent', () => {
    const existant = { id: 3, type: 'PNO', compagnie: 'AXA', prime: 320, _espaceId: 'ESP-SCI', echeanceRappelAt: '2026-11-01' };
    const reconstruit = { id: 3, portee: 'immeuble', type: 'PNO', compagnie: 'AXA', numContrat: 'A-1', prime: 320, echeance: '2026-12-31', notes: '' };
    _preserverChampsExistants(reconstruit, existant);
    expect(reconstruit._espaceId).toBe('ESP-SCI');
    expect(reconstruit.echeanceRappelAt).toBe('2026-11-01');
  });

  it('ASSURANCE HABITATION (MRH) : la prime, dont le champ a été retiré de la modale, n\'est plus effacée', () => {
    // v15.239 a retiré la saisie « prime » de la modale MRH. Le formulaire n\'émet plus la clé :
    // ré-enregistrer une MRH existante écrasait donc la prime déjà saisie par… rien.
    const existant = { id: 5, logement: 'FER-001', locataire: 'Fric Marc', compagnie: 'MAIF',
      numContrat: 'H-77', echeance: '2026-09-30', notes: '', prime: 148.5, _espaceId: 'ESP-SCI' };
    const reconstruit = { id: 5, logement: 'FER-001', locataire: 'Fric Marc', compagnie: 'MAIF',
      numContrat: 'H-77', echeance: '2027-09-30', notes: '' };
    _preserverChampsExistants(reconstruit, existant);
    expect(reconstruit.prime).toBe(148.5);
    expect(reconstruit.echeance).toBe('2027-09-30');   // la saisie gagne
  });

  it('EDL : les clés d\'artefact cloud survivent, les signatures restent celles du record', () => {
    const existant = { id: 9, logement: 'FER-001', type: 'Entrée',
      signatures: { bailleur: 'SIG-OLD', locataire: 'SIG-OLD', signedAt: '2024-01-05' },
      cloudPdfKey: 'edl/9.pdf', driveWebViewLink: 'https://drive/9', _espaceId: 'ESP-SCI' };
    const reconstruit = { id: 9, logement: 'FER-001', type: 'Entrée', drivePath: '',
      signatures: { bailleur: 'SIG-OLD', locataire: 'SIG-OLD', signedAt: '2024-01-05', edlSnapshot: { x: 1 } } };
    _preserverChampsExistants(reconstruit, existant);
    expect(reconstruit.cloudPdfKey).toBe('edl/9.pdf');
    expect(reconstruit.driveWebViewLink).toBe('https://drive/9');
    expect(reconstruit.signatures.edlSnapshot).toEqual({ x: 1 });  // le record fait foi, pas l\'ancien
    expect(reconstruit.drivePath).toBe('');                        // clé présente → non réécrite
  });

  it('AGENDA : `auto` / `autoKey` remis à zéro par le formulaire restent à zéro', () => {
    // Une édition manuelle détache volontairement l\'événement de l\'auto-sync : le formulaire
    // ÉMET auto:false / autoKey:'' — la préservation ne doit pas les rétablir.
    const existant = { id: 4, titre: 'Révision IRL', auto: true, autoKey: 'irl:FER-001:2026', _espaceId: 'ESP-SCI', pieceJointeId: 21 };
    const reconstruit = { id: 4, titre: 'Révision IRL (déplacée)', auto: false, autoKey: '' };
    _preserverChampsExistants(reconstruit, existant);
    expect(reconstruit.auto).toBe(false);
    expect(reconstruit.autoKey).toBe('');
    expect(reconstruit._espaceId).toBe('ESP-SCI');
    expect(reconstruit.pieceJointeId).toBe(21);
  });

  it('IMPORT DE RÉFÉRENCE : ré-importer le fichier n\'efface plus le dossier de départ d\'un bail géré', () => {
    // validateImportRef fusionnait entités / immeubles / logements (Object.assign) mais REMPLAÇAIT
    // les baux en entier — le seul des quatre à le faire.
    const existant = { ref: 'FER-001', hc: 537, ch: 73, dg: 537, debut: '2024-01-01',
      depart: { dateSortie: '2026-06-30' }, dgRestitueAt: '2026-07-15',
      signatures: { signedAt: '2024-01-05' }, quittanceDemandee: true };
    const importe = { hc: 560, ch: 80, dg: 560, debut: '2024-01-01', locataires: [{ nom: 'Fric Marc' }] };
    _preserverChampsExistants(importe, existant);
    expect(importe.hc).toBe(560);                       // la colonne importée gagne
    expect(importe.depart.dateSortie).toBe('2026-06-30');
    expect(importe.dgRestitueAt).toBe('2026-07-15');
    expect(importe.signatures.signedAt).toBe('2024-01-05');
    expect(importe.quittanceDemandee).toBe(true);
  });
});

describe('non-divergence — shadow inline de _preserverSaufChampsPilotes', () => {
  it('index.html porte exactement la fonction du module', () => {
    const moduleSrc = readFileSync(resolve(repoRoot, 'js/core/preserve-fields.js'), 'utf8').replace(/^export /gm, '');
    const inline = extractFn(html, '_preserverSaufChampsPilotes');
    const fromModule = extractFn(moduleSrc, '_preserverSaufChampsPilotes');
    expect(inline).toBeTruthy();
    expect(fromModule).toBeTruthy();
    expect(inline).toBe(fromModule);
  });
});
