// AIDE À LA DÉCISION — comparer les dossiers d'un même logement, sans note ni classement imposé.
import { describe, it, expect } from 'vitest';
import * as AD from '../../js/core/aide-decision-candidats.js';

const C = (o) => Object.assign({ id: 'c' + Math.random().toString(36).slice(2, 7), logRef: 'T3', statut: 'recu', nom: 'Martin', prenom: 'Camille', revenus: 2650, dateCreation: '2026-10-14T10:00:00Z' }, o);

describe('candidatsAComparer / peutComparer', () => {
  const liste = [
    C({ id: 'a' }), C({ id: 'b', statut: 'enCours' }), C({ id: 'c', statut: 'valide' }),
    C({ id: 'd', statut: 'refuse' }), C({ id: 'e', statut: 'converti' }), C({ id: 'f', _archived: true }),
    C({ id: 'g', _deleted: true }), C({ id: 'h', logRef: 'T2' }), null
  ];
  it('garde les dossiers vivants, non archivés, en lice, du même logement', () => {
    expect(AD.candidatsAComparer(liste, 'T3').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('compare la référence du logement en chaîne, espaces ignorés', () => {
    expect(AD.candidatsAComparer([C({ id: 'x', logRef: 12 }), C({ id: 'y', logRef: ' 12 ' })], '12').length).toBe(2);
  });
  it('sans logement : rien', () => {
    expect(AD.candidatsAComparer(liste, '')).toEqual([]);
    expect(AD.candidatsAComparer(null, 'T3')).toEqual([]);
  });
  it('à partir de 2 dossiers seulement', () => {
    expect(AD.peutComparer(liste, 'T3')).toBe(true);
    expect(AD.peutComparer(liste, 'T2')).toBe(false);
  });
});

describe('normaliserRepere : choisi par le propriétaire, aucun par défaut', () => {
  it.each([[35, 35], ['35', 35], ['33,5', 33.5], ['40 %', 40], [100, 100], [1, 1], ['12.34', 12.3]])('%s → %s', (v, r) => expect(AD.normaliserRepere(v)).toBe(r));
  it.each([[null], [undefined], [''], ['abc'], [0], [0.5], ['0,9'], [-5], [101], ['1e2'], [NaN]])('%s → aucun repère', (v) => expect(AD.normaliserRepere(v)).toBeNull());
});

describe('tauxEffort et situationRepere', () => {
  it('loyer charges comprises ÷ ressources, arrondi au % près', () => {
    expect(AD.tauxEffort(820, 2650)).toBe(31);
    expect(AD.tauxEffort(820, 2100)).toBe(39);
    expect(AD.tauxEffort(820, 650)).toBe(126);
  });
  it('loyer ou ressources manquants → null (jamais 0 % ni Infinity)', () => {
    expect(AD.tauxEffort(0, 2000)).toBeNull();
    expect(AD.tauxEffort(820, 0)).toBeNull();
    expect(AD.tauxEffort(820, '')).toBeNull();
    expect(AD.tauxEffort(undefined, undefined)).toBeNull();
  });
  it('sans repère : aucune marque', () => {
    expect(AD.situationRepere(39, null)).toBeNull();
    expect(AD.situationRepere(39, '')).toBeNull();
  });
  it('le repère lui-même est « dans le repère »', () => {
    expect(AD.situationRepere(35, 35)).toBe('dans');
    expect(AD.situationRepere(36, 35)).toBe('audessus');
    expect(AD.situationRepere(null, 35)).toBeNull();
  });
  it('les mots ne jugent pas la personne', () => {
    expect(AD.MOTS_REPERE).toEqual({ dans: 'dans le repère', audessus: 'au-dessus du repère' });
  });
});

describe('etatPiecesDossier : un mot par dossier, jamais un compte', () => {
  const e = (...k) => k.map((etat) => ({ etat }));
  it('ordre d\'attention : à vérifier > en attente > non vérifiable > OK', () => {
    expect(AD.etatPiecesDossier(e('ok', 'nonverif', 'averif', 'attente'))).toEqual({ etat: 'averif', mot: 'À vérifier' });
    expect(AD.etatPiecesDossier(e('ok', 'nonverif', 'attente'))).toEqual({ etat: 'attente', mot: 'En attente' });
    expect(AD.etatPiecesDossier(e('ok', 'nonverif'))).toEqual({ etat: 'nonverif', mot: 'Non vérifiable' });
    expect(AD.etatPiecesDossier(e('ok', 'ok'))).toEqual({ etat: 'ok', mot: 'OK' });
  });
  it('« Non lue » ne compte pas ; aucun état → null', () => {
    expect(AD.etatPiecesDossier(e('nonlue', 'ok'))).toEqual({ etat: 'ok', mot: 'OK' });
    expect(AD.etatPiecesDossier(e('nonlue'))).toBeNull();
    expect(AD.etatPiecesDossier([])).toBeNull();
    expect(AD.etatPiecesDossier(null)).toBeNull();
  });
  it('un constat de dossier (bulletins) → à vérifier', () => {
    expect(AD.etatPiecesDossier(e('ok'), [{ code: 'B5' }]).etat).toBe('averif');
  });
  it('aucune propriété de compte ni de total', () => {
    const r = AD.etatPiecesDossier(e('ok', 'averif', 'averif'));
    expect(Object.keys(r).sort()).toEqual(['etat', 'mot']);
  });
});

describe('etatDossier : liste légale', () => {
  it('complet', () => expect(AD.etatDossier(['identite', 'domicile', 'situation', 'ressources'])).toEqual({ etat: 'complet', manque: [] }));
  it('catégories manquantes dans l\'ordre du décret', () => expect(AD.etatDossier(['situation', 'identite'])).toEqual({ etat: 'manque', manque: ['domicile', 'ressources'] }));
  it('aucune pièce mais déclaré complet (saisie manuelle)', () => expect(AD.etatDossier([], true)).toEqual({ etat: 'declare', manque: [] }));
  it('aucune pièce, rien de déclaré', () => expect(AD.etatDossier(undefined, false).manque.length).toBe(4));
});

describe('etatGarantie', () => {
  it('aucune / garant', () => {
    expect(AD.etatGarantie(C({}), 820, '2026-10-16')).toEqual({ type: 'aucune', mot: 'Aucune', precision: '' });
    expect(AD.etatGarantie(C({ garant: { nom: 'Paul Roux' } }), 820, '2026-10-16')).toEqual({ type: 'garant', mot: 'Garant', precision: '' });
  });
  it('Visale : couvre le loyer / loyer au-dessus du visa / visa expiré', () => {
    const v = (o) => C({ visale: Object.assign({ visaId: 'V123' }, o) });
    expect(AD.etatGarantie(v({ loyerMax: 900 }), 820, '2026-10-16').precision).toBe('couvre le loyer');
    expect(AD.etatGarantie(v({ loyerMax: 800 }), 820, '2026-10-16').precision).toBe('loyer au-dessus du visa');
    expect(AD.etatGarantie(v({ loyerMax: 900, validite: '2026-09-30' }), 820, '2026-10-16').precision).toBe('visa expiré');
    expect(AD.etatGarantie(v({}), 820, '2026-10-16')).toEqual({ type: 'visale', mot: 'Visale', precision: '' });
  });
});

describe('ligneComparaison', () => {
  it('assemble les critères, sans note', () => {
    const l = AD.ligneComparaison(C({ id: 'h', prenom: 'Hugo', nom: 'Lefèvre', revenus: 2100, piecesVerifiees: true, garant: { nom: 'X' }, dateDebutSouhaitee: '2026-11-15', statut: 'enCours' }),
      { loyerCC: 820, repere: 35, aujourdhui: '2026-10-16', categoriesFournies: ['identite', 'domicile', 'situation', 'ressources'], etatsPieces: [{ etat: 'ok' }, { etat: 'averif' }] });
    expect(l).toMatchObject({ id: 'h', nom: 'Hugo Lefèvre', statut: 'enCours', debut: '2026-11-15',
      dossier: { etat: 'complet' }, pieces: { etat: 'averif' }, garantie: { type: 'garant' },
      taux: { pct: 39, ressources: 2100, loyerCC: 820, examinees: true, situation: 'audessus' } });
    expect(JSON.stringify(l)).not.toMatch(/score|note|rang|total|classement/i);
  });
  it('sans repère ni loyer : taux inconnu, aucune marque', () => {
    const l = AD.ligneComparaison(C({}), { loyerCC: 0 });
    expect(l.taux.pct).toBeNull();
    expect(l.taux.situation).toBeNull();
    expect(l.pieces).toBeNull();
  });
});

describe('trierLignes : réception par défaut, dates et taux d\'effort seulement', () => {
  const L = [
    { id: '1', nom: 'B', recu: '2026-10-12', debut: '2026-12-01', taux: { pct: 34 } },
    { id: '2', nom: 'A', recu: '2026-10-14', debut: '2026-11-01', taux: { pct: 39 } },
    { id: '3', nom: 'C', recu: '2026-10-13', debut: '', taux: { pct: null } },
    { id: '4', nom: 'D', recu: '', debut: '2026-11-01', taux: { pct: 25 } }
  ];
  const ids = (r) => r.map((l) => l.id);
  it('défaut : réception, plus récent d\'abord ; date absente en dernier', () => expect(ids(AD.trierLignes(L))).toEqual(['2', '3', '1', '4']));
  it('taux d\'effort croissant ; inconnu toujours en dernier', () => {
    expect(ids(AD.trierLignes(L, 'tauxEffort', 'asc'))).toEqual(['4', '1', '2', '3']);
    expect(ids(AD.trierLignes(L, 'tauxEffort', 'desc'))).toEqual(['2', '1', '4', '3']);
  });
  it('début souhaité ; égalité → nom', () => expect(ids(AD.trierLignes(L, 'debut', 'asc'))).toEqual(['2', '4', '1', '3']));
  it('clé interdite (pièces, garantie, dossier) → ordre de réception', () => {
    for (const k of ['pieces', 'garantie', 'dossier', 'score', undefined]) expect(ids(AD.trierLignes(L, k, 'asc'))).toEqual(['2', '3', '1', '4']);
  });
  it('ne modifie pas le tableau reçu', () => { const copie = L.slice(); AD.trierLignes(L, 'tauxEffort', 'asc'); expect(L).toEqual(copie); });
  it('seules colonnes triables : dates et taux d\'effort', () => expect([...AD.TRIS]).toEqual(['recu', 'debut', 'tauxEffort']));
});
