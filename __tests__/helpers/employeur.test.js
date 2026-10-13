// __tests__/helpers/employeur.test.js — CANDIDATURES-CONFORMITE lot 2 : employeur (SIREN / SIRET) vérifié
// dans l'Annuaire des entreprises (API publique Recherche d'entreprises). Constat factuel, jamais un jugement.
import { describe, it, expect } from 'vitest';
import {
  normaliserIdentifiant, urlRecherche, lireReponse, pointEmployeur, ligneEmployeurActif, doitVerifier, SOURCE_EMPLOYEUR
} from '../../js/core/employeur.js';

// Réponses réelles abrégées de https://recherche-entreprises.api.gouv.fr/search (12/10/2026).
const REP_FERMEE = { results: [{ siren: '552100554', nom_complet: 'PEUGEOT SA', etat_administratif: 'C', date_fermeture: '2021-01-16', date_creation: '1955-01-01',
  siege: { siret: '55210055400054', etat_administratif: 'F', date_fermeture: '2021-01-16' },
  matching_etablissements: [{ siret: '55210055400054', etat_administratif: 'F', date_fermeture: '2021-01-16' }] }], total_results: 1 };
const REP_ACTIVE = { results: [{ siren: '542051180', nom_complet: 'TOTALENERGIES SE', etat_administratif: 'A', date_fermeture: null,
  siege: { siret: '54205118000066', etat_administratif: 'A' },
  matching_etablissements: [{ siret: '54205118000066', etat_administratif: 'A', date_fermeture: null }] }], total_results: 1 };
const REP_ETAB_FERME = { results: [{ siren: '542051180', nom_complet: 'TOTALENERGIES SE', etat_administratif: 'A',
  siege: { siret: '54205118000066', etat_administratif: 'A' },
  matching_etablissements: [{ siret: '54205118000017', etat_administratif: 'F', date_fermeture: '2019-03-31' }] }], total_results: 1 };
const REP_VIDE = { results: [], total_results: 0 };

describe('normaliserIdentifiant — SIREN 9 chiffres / SIRET 14 chiffres, clé de Luhn', () => {
  it('SIREN valide, espaces et points tolérés', () => {
    expect(normaliserIdentifiant('552 100 554')).toEqual({ type: 'siren', valeur: '552100554', siren: '552100554', valide: true });
    expect(normaliserIdentifiant('542.051.180').valide).toBe(true);
  });
  it('SIRET valide', () => {
    expect(normaliserIdentifiant('552 100 554 00054')).toEqual({ type: 'siret', valeur: '55210055400054', siren: '552100554', valide: true });
  });
  it('La Poste : SIRET hors Luhn (somme des chiffres multiple de 5)', () => {
    expect(normaliserIdentifiant('35600000000001').valide).toBe(true);
  });
  it('clé fausse, longueur fausse, lettres → invalide avec un motif', () => {
    expect(normaliserIdentifiant('552100555')).toMatchObject({ valide: false, erreur: 'cle' });
    expect(normaliserIdentifiant('1234')).toMatchObject({ valide: false, erreur: 'longueur' });
    expect(normaliserIdentifiant('55210O554')).toMatchObject({ valide: false });
  });
  it('vide → null (champ facultatif)', () => {
    expect(normaliserIdentifiant('')).toBe(null);
    expect(normaliserIdentifiant('   ')).toBe(null);
    expect(normaliserIdentifiant(null)).toBe(null);
  });
});

describe('urlRecherche', () => {
  it('appel direct à l\'API publique (CORS ouvert, vérifié le 12/10/2026)', () => {
    expect(urlRecherche('552100554')).toBe('https://recherche-entreprises.api.gouv.fr/search?q=552100554&page=1&per_page=1');
  });
});

describe('lireReponse', () => {
  const LE = '2026-10-12T09:42:00.000Z';
  it('entreprise fermée', () => {
    expect(lireReponse(REP_FERMEE, normaliserIdentifiant('552100554'), LE))
      .toEqual({ id: '552100554', type: 'siren', etat: 'ferme', nomOfficiel: 'PEUGEOT SA', dateFermeture: '2021-01-16', verifieLe: LE });
  });
  it('entreprise active', () => {
    expect(lireReponse(REP_ACTIVE, normaliserIdentifiant('542051180'), LE)).toMatchObject({ etat: 'actif', nomOfficiel: 'TOTALENERGIES SE', dateFermeture: '' });
  });
  it('SIRET : l\'état de l\'ÉTABLISSEMENT fait foi', () => {
    expect(lireReponse(REP_ETAB_FERME, normaliserIdentifiant('54205118000017'), LE)).toMatchObject({ type: 'siret', etat: 'ferme', dateFermeture: '2019-03-31' });
    expect(lireReponse(REP_ACTIVE, normaliserIdentifiant('54205118000066'), LE)).toMatchObject({ etat: 'actif' });
  });
  it('introuvable : aucun résultat, ou résultat d\'un autre SIREN', () => {
    expect(lireReponse(REP_VIDE, normaliserIdentifiant('552100554'), LE)).toMatchObject({ etat: 'introuvable', nomOfficiel: '' });
    expect(lireReponse(REP_ACTIVE, normaliserIdentifiant('552100554'), LE)).toMatchObject({ etat: 'introuvable' });
  });
  it('SIRET absent des établissements de l\'entreprise → introuvable', () => {
    expect(lireReponse(REP_ACTIVE, normaliserIdentifiant('54205118000017'), LE)).toMatchObject({ etat: 'introuvable' });
  });
  it('réponse illisible → null (vérification reportée, aucune alerte)', () => {
    expect(lireReponse(null, normaliserIdentifiant('552100554'), LE)).toBe(null);
    expect(lireReponse({ foo: 1 }, normaliserIdentifiant('552100554'), LE)).toBe(null);
  });
});

describe('pointEmployeur — constat factuel daté et sourcé, sans jugement', () => {
  const LE = '2026-10-12T09:42:00.000Z';
  it('fermée → « n\'apparaît pas comme actif … au JJ/MM/AAAA » + nom officiel et date de fermeture', () => {
    const p = pointEmployeur({ id: '552100554', type: 'siren', etat: 'ferme', nomOfficiel: 'PEUGEOT SA', dateFermeture: '2021-01-16', verifieLe: LE }, 'Endress+Hauser Flowtec AG');
    expect(p.titre).toBe("L'employeur indiqué n'apparaît pas comme actif dans l'Annuaire des entreprises au 12/10/2026.");
    expect(p.detail).toBe('SIREN 552 100 554 déclaré pour « Endress+Hauser Flowtec AG ». L\'annuaire indique : PEUGEOT SA, entreprise fermée le 16/01/2021.');
    expect(p.source).toBe(SOURCE_EMPLOYEUR.libelle);
    expect(p.url).toBe('https://annuaire-entreprises.data.gouv.fr/entreprise/552100554');
    expect(p.date).toMatch(/^vérifié le 12\/10\/2026/);
  });
  it('introuvable', () => {
    const p = pointEmployeur({ id: '55210055400054', type: 'siret', etat: 'introuvable', nomOfficiel: '', dateFermeture: '', verifieLe: LE }, '');
    expect(p.detail).toBe('Aucun établissement trouvé pour le SIRET 552 100 554 00054.');
  });
  it('numéro saisi invalide → constat sur la clé, sans appel réseau', () => {
    const p = pointEmployeur({ id: '552100555', etat: 'invalide', verifieLe: LE }, 'X');
    expect(p.titre).toBe("Le numéro d'employeur saisi n'est pas un SIREN ou SIRET valide (contrôle de la clé).");
  });
  it('actif, reporté ou absent → aucun point', () => {
    expect(pointEmployeur({ id: '542051180', etat: 'actif', verifieLe: LE }, 'Total')).toBe(null);
    expect(pointEmployeur(null, 'X')).toBe(null);
  });
  it('aucun mot de jugement', () => {
    const p = pointEmployeur({ id: '552100554', type: 'siren', etat: 'ferme', nomOfficiel: 'PEUGEOT SA', dateFermeture: '2021-01-16', verifieLe: LE }, 'X');
    expect((p.titre + p.detail).toLowerCase()).not.toMatch(/suspect|fraud|faux|fiable|risque|douteu/);
  });
  it('ligne « actif » neutre', () => {
    expect(ligneEmployeurActif({ etat: 'actif', nomOfficiel: 'TOTALENERGIES SE', verifieLe: LE })).toBe('Actif dans l\'Annuaire des entreprises au 12/10/2026 — TOTALENERGIES SE');
    expect(ligneEmployeurActif({ etat: 'ferme' })).toBe('');
  });
});

describe('doitVerifier', () => {
  it('numéro valide jamais vérifié, ou numéro changé → oui', () => {
    expect(doitVerifier({ employeurSiren: '552100554' })).toBe(true);
    expect(doitVerifier({ employeurSiren: '552100554', employeurVerif: { id: '542051180', etat: 'actif' } })).toBe(true);
  });
  it('déjà vérifié pour ce numéro → non ; vide → non', () => {
    expect(doitVerifier({ employeurSiren: '552 100 554', employeurVerif: { id: '552100554', etat: 'ferme' } })).toBe(false);
    expect(doitVerifier({ employeurSiren: '' })).toBe(false);
  });
  it('numéro invalide pas encore constaté → oui (constat local, sans réseau)', () => {
    expect(doitVerifier({ employeurSiren: '552100555' })).toBe(true);
    expect(doitVerifier({ employeurSiren: '552100555', employeurVerif: { id: '552100555', etat: 'invalide' } })).toBe(false);
  });
});
