// « Aucun champ laissé derrière » — LOT 1 du chantier ÉCRITURES DESTRUCTRICES.
//
// CAS VÉCU, mesuré dans le navigateur sur origin/main (v15.541, lot FER-001) :
//   déclarer un départ → restituer le DG (15/07/2026, retenue 50 €, « Peinture séjour »)
//   → ouvrir la fiche du bail → changer le SEUL numéro de téléphone → Enregistrer
//   ⇒ depart, dgRestitueAt, dgDetailRetenues, dgRestitueMontant et locNouvIban DISPARAISSENT.
// À l'écran : l'assistant repasse de « 3 / 6 étapes · sortie 30/06/2026 » à « 1 / 6 étapes ·
// sortie — · Déclarer le départ », et le statut DG de « restitue » à « manquant ».
//
// Cause : saveBail reconstruit l'objet depuis le formulaire (getBailDataFromForm) puis REMPLACE
// l'ancien (`DB.baux[ref] = bail`). Même motif que saveImm/saveEnt (audit BIENS C2/I5) → même
// remède, le mécanisme générique de js/core/preserve-fields.js. On NE ré-implémente rien.
//
// PIÈGE SYMÉTRIQUE, propre au bail : `archiverBail` ne supprime PAS DB.baux[ref] au re-bail —
// il en pousse une copie dans baux_historique. Une préservation NON GATÉE ferait donc hériter
// au bail du NOUVEAU locataire le dossier de départ, la restitution de DG et les signatures de
// l'ANCIEN. D'où le gate `isNewBail`, testé ici comme le reste.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { _preserverBailExistant } from '../../js/core/preserve-fields.js';

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

/** Le bail tel qu'il vit en base après un départ déclaré + un DG restitué (état mesuré). */
function bailAvecDossierDeDepart() {
  return {
    ref: 'FER-001', debut: '2024-01-01', fin: '', hc: 537, ch: 73, dg: 537,
    type: 'nu', entity: 'SCI KELLER', notes: '',
    locataires: [{ civilite: 'M.', nom: 'Fric Marc', tel: '06.00.00.01.01', email: 'loc1@test.fr' }],
    // ── le dossier de départ (assistant 6 étapes) ──
    depart: {
      declaredAt: '2026-08-20', congePar: 'locataire', congeDate: '2026-05-31',
      dateSortie: '2026-06-30', motif: 'Congé locataire — mutation', remiseLocationFait: false, notes: ''
    },
    // ── la restitution du dépôt de garantie ──
    dgRetenu: 50, dgRestitue: 0, dgRestitueAt: '2026-07-15', dgRestitueMontant: 0,
    dgDetailRetenues: 'Peinture séjour 50 € (facture jointe)', locNouvIban: '',
    finEffective: '', finMotif: '', locNouvelleAdr: '', finNotes: '',
  };
}

/** Ce que getBailDataFromForm + l'overlay du save produisent : aucun champ de départ/DG-restitution. */
function bailReconstruitParLeFormulaire(tel) {
  return {
    ref: 'FER-001', debut: '2024-01-01', fin: '', hc: 537, ch: 73, dg: 537,
    type: 'nu', entity: 'SCI KELLER', notes: '',
    locataires: [{ civilite: 'M.', nom: 'Fric Marc', tel, email: 'loc1@test.fr' }],
    // les 6 champs que la modale de clôture relit ET réécrit (aller-retour, pas une garantie)
    finEffective: '', finMotif: '', locNouvelleAdr: '', dgRestitue: 0, dgRetenu: 50, finNotes: '',
  };
}

describe('LOT 1 — saveBail ne détruit plus le dossier de départ ni la restitution du DG', () => {
  it('ÉDITION : changer le seul téléphone conserve depart et les 4 champs de restitution', () => {
    const existant = bailAvecDossierDeDepart();
    const reconstruit = bailReconstruitParLeFormulaire('06.11.22.33.44');

    _preserverBailExistant(reconstruit, existant, false);

    expect(reconstruit.depart).toEqual(existant.depart);
    expect(reconstruit.dgRestitueAt).toBe('2026-07-15');
    expect(reconstruit.dgDetailRetenues).toBe('Peinture séjour 50 € (facture jointe)');
    expect(reconstruit.dgRestitueMontant).toBe(0);
    expect(reconstruit.locNouvIban).toBe('');
    // et la saisie du formulaire gagne toujours
    expect(reconstruit.locataires[0].tel).toBe('06.11.22.33.44');
  });

  it('ÉDITION : l\'avancement de l\'assistant départ survit (3/6 étapes ne retombe pas à 1/6)', () => {
    // l'écran lit bail.depart.dateSortie + bail.dgRestitueAt ; sans eux il affiche « Déclarer le départ »
    const reconstruit = bailReconstruitParLeFormulaire('06.11.22.33.44');
    _preserverBailExistant(reconstruit, bailAvecDossierDeDepart(), false);
    expect(reconstruit.depart.dateSortie).toBe('2026-06-30');
    expect(Boolean(reconstruit.dgRestitueAt)).toBe(true);   // drapeau « DG restitué » de toutes les surfaces
  });

  it('ÉDITION : un champ VIDÉ par l\'utilisateur reste vide (le formulaire porte la clé)', () => {
    const existant = { ...bailAvecDossierDeDepart(), notes: 'anciennes notes', adrLoc: '3 rue X' };
    const reconstruit = { ...bailReconstruitParLeFormulaire('06.00.00.01.01'), notes: '', adrLoc: '' };
    _preserverBailExistant(reconstruit, existant, false);
    expect(reconstruit.notes).toBe('');
    expect(reconstruit.adrLoc).toBe('');
  });

  it('ÉDITION : un montant remis à 0 par l\'utilisateur reste 0 (0 n\'est pas « absent »)', () => {
    const existant = { ...bailAvecDossierDeDepart(), ch: 73 };
    const reconstruit = { ...bailReconstruitParLeFormulaire('06.00.00.01.01'), ch: 0 };
    _preserverBailExistant(reconstruit, existant, false);
    expect(reconstruit.ch).toBe(0);
  });

  it('RE-BAIL : le bail du NOUVEAU locataire n\'hérite rien de l\'ancien', () => {
    // archiverBail ne supprime pas DB.baux[ref] : sans gate, le nouveau bail repartirait avec
    // le dossier de départ, la restitution de DG et les signatures du locataire précédent.
    const ancien = { ...bailAvecDossierDeDepart(), signatures: { signedAt: '2024-01-05' } };
    const nouveau = {
      ref: 'FER-001', debut: '2026-07-01', hc: 560, ch: 80, dg: 560,
      locataires: [{ civilite: 'Mme', nom: 'Baysang Anne', tel: '06.99.99.99.99', email: 'a@test.fr' }],
    };
    _preserverBailExistant(nouveau, ancien, true);
    expect(nouveau.depart).toBeUndefined();
    expect(nouveau.dgRestitueAt).toBeUndefined();
    expect(nouveau.dgDetailRetenues).toBeUndefined();
    expect(nouveau.dgRestitueMontant).toBeUndefined();
    expect(nouveau.signatures).toBeUndefined();
    expect(nouveau.locataires[0].nom).toBe('Baysang Anne');
  });

  it('BAIL SUPPRIMÉ : un tombstone n\'est ni ressuscité ni recopié', () => {
    const supprime = { ref: 'FER-001', _deleted: true, _deletedAt: '2026-02-01', depart: { dateSortie: '2025-01-01' } };
    const reconstruit = { ref: 'FER-001', hc: 500 };
    _preserverBailExistant(reconstruit, supprime, false);
    expect(reconstruit._deleted).toBeUndefined();
    expect(reconstruit.depart).toBeUndefined();
  });

  it('IMPORT sur une réf dont le bail a été SUPPRIMÉ : le bail importé naît VIVANT', () => {
    // validateImportRef utilise la même variante gatée. Sans elle, le tombstone laissé par
    // terminerBail / saveBailClore ({ ref, _deleted:true, … }) était recopié sur le bail importé :
    // il naissait DÉJÀ SUPPRIMÉ, invisible partout (_isAlive), pendant que le toast annonçait
    // « 1 ajout » et que le logement, lui, était bien mis à jour depuis ce bail fantôme.
    const tombstone = { ref: 'FER-001', _deleted: true, _deletedAt: '2026-02-01', _archivedAt: '2026-02-01' };
    const importe = { hc: 560, ch: 80, debut: '2026-07-01', locataires: [{ nom: 'Fric Marc' }] };
    _preserverBailExistant(importe, tombstone, false);
    expect(importe._deleted).toBeUndefined();
    expect(importe._archivedAt).toBeUndefined();
    expect(importe.hc).toBe(560);
  });

  it('ENTRÉES DÉGRADÉES : aucun crash, la cible est rendue telle quelle', () => {
    const r = { a: 1 };
    expect(_preserverBailExistant(r, null, false)).toBe(r);
    expect(_preserverBailExistant(r, undefined, false)).toBe(r);
    expect(_preserverBailExistant(r, 'pas-un-objet', false)).toBe(r);
    expect(_preserverBailExistant(null, { a: 1 }, false)).toBe(null);
  });

  it('IDEMPOTENCE : deux enregistrements successifs donnent le même bail', () => {
    const existant = bailAvecDossierDeDepart();
    const r = bailReconstruitParLeFormulaire('06.11.22.33.44');
    _preserverBailExistant(r, existant, false);
    const apres = JSON.parse(JSON.stringify(r));
    _preserverBailExistant(r, existant, false);
    expect(r).toEqual(apres);
  });

  it('POLLUTION DE PROTOTYPE : refusée (garantie héritée du mécanisme générique)', () => {
    const r = { ref: 'X' };
    const sale = JSON.parse('{"__proto__":{"pollue":1},"depart":{"dateSortie":"2026-06-30"}}');
    _preserverBailExistant(r, sale, false);
    expect({}.pollue).toBeUndefined();
    expect(r.depart.dateSortie).toBe('2026-06-30');
  });
});

describe('non-divergence — le shadow inline d\'index.html est identique au module', () => {
  it('index.html porte exactement _preserverBailExistant de js/core/preserve-fields.js', () => {
    // file:// ne charge pas les ES modules : index.html embarque une copie. Si elle dérive,
    // la prod et les tests ne parlent plus du même correctif.
    const moduleSrc = readFileSync(resolve(repoRoot, 'js/core/preserve-fields.js'), 'utf8').replace(/^export /gm, '');
    const inline = extractFn(html, '_preserverBailExistant');
    const fromModule = extractFn(moduleSrc, '_preserverBailExistant');
    expect(inline).toBeTruthy();
    expect(fromModule).toBeTruthy();
    expect(inline).toBe(fromModule);
  });
});
