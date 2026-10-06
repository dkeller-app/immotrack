/**
 * BAUX-ECHUS — la règle d'échéance et de reconduction, une par type (js/core/bail-echeance.js).
 * Source : mockups/BAUX-ECHUS/REGLE-LEGALE.md (Légifrance au 05/10/2026) + décisions Didier 06/10.
 */
import { describe, it, expect } from 'vitest';
import {
  typeBailEffectif, reconductionLegale, regleReconduction, preavisBailleurMois, preavisLocataireMois,
  ajouterMois, ajouterJours, dureeInitialeMois, finTheorique, finContractuelle, echeanceBail,
  pastilleEcheance, alerteArriveATerme, preavisBailleurAvantEcheance, noteFinDeBail, dateFr
} from '../../js/core/bail-echeance.js';

const AUJ = '2026-10-06';
const PHYS = 'Personne physique';
const MORALE = 'Personne morale';

describe('type effectif', () => {
  it('bail.type fait autorité, sinon log.typeUsage, sinon nu', () => {
    expect(typeBailEffectif({ type: 'garage' }, { typeUsage: 'habitation-meuble' })).toBe('garage');
    expect(typeBailEffectif({}, { typeUsage: 'habitation-meuble' })).toBe('meuble');
    expect(typeBailEffectif({ type: 'inconnu' }, null)).toBe('nu');
    expect(typeBailEffectif(null, null)).toBe('nu');
  });
});

describe('qui reconduit ? (une règle par type)', () => {
  it('la loi : nu (art. 10) et meublé (art. 25-7 al. 3) ; jamais étudiant ni mobilité', () => {
    expect(reconductionLegale('nu')).toBe(true);
    expect(reconductionLegale('meuble')).toBe(true);
    expect(reconductionLegale('etudiant')).toBe(false);
    expect(reconductionLegale('mobilite')).toBe(false);
    expect(reconductionLegale('garage')).toBe(false);
    expect(reconductionLegale('autre')).toBe(false);
  });
  it('le contrat : seul un garage SIGNÉ dans l\'app depuis le déploiement de v15.586 (04/09/2026 15:28:19 Paris) porte la clause', () => {
    const g = (signedAt) => regleReconduction({ type: 'garage', signatures: { signedAt } });
    expect(g('2026-09-04T13:28:19Z')).toBe('contrat');           // l'instant exact (15:28:19 à Paris)
    expect(g('2026-09-04T15:28:19+02:00')).toBe('contrat');
    expect(g('2026-09-04T13:28:18Z')).toBe(null);                // une seconde avant
    expect(g('2026-09-04T08:00:00Z')).toBe(null);                // le même jour, le matin
    expect(g('2026-09-04')).toBe(null);                          // date seule = minuit UTC, avant
    expect(g(Date.UTC(2026, 8, 4, 13, 28, 19))).toBe('contrat');
    expect(g(Date.UTC(2026, 8, 4, 13, 28, 18))).toBe(null);
    expect(g('pas une date')).toBe(null);
    expect(regleReconduction({ type: 'garage', signatures: { signedAt: '2026-09-10T10:00:00Z' } })).toBe('contrat');
    expect(regleReconduction({ type: 'garage', signatures: { signedAt: Date.UTC(2026, 8, 20) } })).toBe('contrat');
    expect(regleReconduction({ type: 'garage', signatures: { signedAt: '2026-09-03T23:00:00Z' } })).toBe(null);   // signé avant
    expect(regleReconduction({ type: 'garage' })).toBe(null);                                                    // jamais signé
    expect(regleReconduction({ type: 'garage', signatures: {} })).toBe(null);
    expect(regleReconduction({ type: 'garage', typeContrat: 'repris', signatures: { signedAt: '2026-09-10T10:00:00Z' } })).toBe(null);           // repris
    expect(regleReconduction({ type: 'autre' })).toBe(null);
    expect(regleReconduction({ type: 'etudiant' })).toBe(null);
    expect(regleReconduction({ type: 'mobilite' })).toBe(null);
    expect(regleReconduction({ type: 'nu' })).toBe('loi');
  });
});

describe('préavis', () => {
  it('bailleur : 6 mois nu (art. 15-I), 3 mois meublé (art. 25-8 I), aucun ailleurs', () => {
    expect(preavisBailleurMois('nu')).toBe(6);
    expect(preavisBailleurMois('meuble')).toBe(3);
    for (const t of ['etudiant', 'mobilite', 'garage', 'autre']) expect(preavisBailleurMois(t)).toBe(null);
  });
  it('locataire : 3 mois nu, 1 mois meublé / étudiant / mobilité (art. 25-8 I, 25-15), contrat ailleurs', () => {
    expect(preavisLocataireMois('nu')).toBe(3);
    expect(preavisLocataireMois('meuble')).toBe(1);
    expect(preavisLocataireMois('etudiant')).toBe(1);
    expect(preavisLocataireMois('mobilite')).toBe(1);
    expect(preavisLocataireMois('garage')).toBe(null);
  });
});

describe('dates civiles', () => {
  it('ajouter des mois recadre en fin de mois (31/01 + 1 mois = 28/02)', () => {
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28');
    expect(ajouterMois('2024-01-31', 1)).toBe('2024-02-29');
    expect(ajouterMois('2026-03-15', -3)).toBe('2025-12-15');
    expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('durée initiale et fin théorique — bail nu selon le bailleur (art. 10 et 13)', () => {
  it('« Personne morale » = 6 ans (le fragment « perso » ne la fait plus passer pour un particulier)', () => {
    expect(dureeInitialeMois('nu', MORALE)).toBe(72);
    expect(dureeInitialeMois('nu', PHYS)).toBe(36);
    expect(dureeInitialeMois('nu', 'SCI familiale')).toBe(36);
    expect(dureeInitialeMois('nu', 'Indivision')).toBe(36);
  });
  it('fin = veille de l\'anniversaire', () => {
    expect(finTheorique('2026-01-01', 'nu', MORALE)).toBe('2031-12-31');
    expect(finTheorique('2026-01-01', 'nu', PHYS)).toBe('2028-12-31');
    expect(finTheorique('2026-09-01', 'meuble', '')).toBe('2027-08-31');
    expect(finTheorique('2026-09-01', 'etudiant', '')).toBe('2027-05-31');
    expect(finTheorique('2026-09-01', 'mobilite', '')).toBe('');
    expect(finTheorique('2026-09-01', 'garage', '')).toBe('');
  });
  it('la fin saisie prime sur la fin théorique', () => {
    expect(finContractuelle({ type: 'nu', debut: '2026-01-01', fin: '2030-06-30' }, null, PHYS)).toBe('2030-06-30');
    expect(finContractuelle({ type: 'nu', debut: '2026-01-01' }, null, PHYS)).toBe('2028-12-31');
  });
});

describe('échéance — nu : 3 ans ou 6 ans, quelle que soit la durée initiale', () => {
  it('bail de 9 ans d\'un particulier échu → reconduit pour 3 ans (Cass. 3e civ. 25/10/2018 n° 17-20.108)', () => {
    const b = { type: 'nu', debut: '2015-01-01', fin: '2023-12-31' };
    const e = echeanceBail(b, null, { typeEntite: PHYS, todayIso: AUJ });
    expect(e.statut).toBe('reconduit');
    expect(e.prochaine).toBe('2026-12-31');
  });
  it('personne morale → périodes de 6 ans', () => {
    const b = { type: 'nu', debut: '2014-01-01', fin: '2019-12-31' };
    const e = echeanceBail(b, null, { typeEntite: MORALE, todayIso: AUJ });
    expect(e).toMatchObject({ statut: 'reconduit', prochaine: '2031-12-31' });
  });
  it('en cours tant que la date du jour ne dépasse pas la fin (jour de fin compris)', () => {
    const b = { type: 'nu', debut: '2023-10-07', fin: '2026-10-06' };
    expect(echeanceBail(b, null, { typeEntite: PHYS, todayIso: AUJ })).toMatchObject({ statut: 'en_cours', prochaine: '2026-10-06' });
  });
  it('sans date de fin : fin théorique depuis le début (même règle que la saisie)', () => {
    const b = { type: 'nu', debut: '2024-03-01' };
    expect(echeanceBail(b, null, { typeEntite: PHYS, todayIso: AUJ })).toMatchObject({ statut: 'en_cours', prochaine: '2027-02-28' });
  });
  it('clôturé ou résilié → terminé, aucune échéance', () => {
    expect(echeanceBail({ type: 'nu', debut: '2020-01-01', fin: '2022-12-31', cloture: true }, null, { todayIso: AUJ }).statut).toBe('termine');
    expect(echeanceBail({ type: 'nu', debut: '2020-01-01', finEffective: '2024-01-01' }, null, { todayIso: AUJ }).statut).toBe('termine');
  });
});

describe('échéance — meublé : 1 an', () => {
  it('reconduit d\'un an en un an', () => {
    const b = { type: 'meuble', debut: '2023-09-01', fin: '2024-08-31' };
    expect(echeanceBail(b, null, { todayIso: AUJ })).toMatchObject({ statut: 'reconduit', prochaine: '2027-08-31' });
  });
});

describe('échéance — étudiant et mobilité : jamais reconduits', () => {
  it('étudiant échu → arrivé à terme, aucune prochaine échéance (art. 25-7 al. 4)', () => {
    const b = { type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31' };
    expect(echeanceBail(b, null, { todayIso: AUJ })).toMatchObject({ statut: 'arrive_a_terme', finContrat: '2026-05-31', prochaine: '' });
  });
  it('étudiant sans date de fin : 9 mois depuis le début', () => {
    const b = { type: 'etudiant', debut: '2025-09-01' };
    expect(echeanceBail(b, null, { todayIso: AUJ })).toMatchObject({ statut: 'arrive_a_terme', finContrat: '2026-05-31' });
  });
  it('mobilité échue → arrivé à terme (art. 25-14 al. 1) ; sans date de fin → inconnue', () => {
    expect(echeanceBail({ type: 'mobilite', debut: '2026-01-01', fin: '2026-06-30' }, null, { todayIso: AUJ }).statut).toBe('arrive_a_terme');
    expect(echeanceBail({ type: 'mobilite', debut: '2026-01-01' }, null, { todayIso: AUJ }).statut).toBe('inconnue');
  });
});

describe('échéance — garage et autre : le contrat', () => {
  it('garage signé dans l\'app : reconduit pour une durée ÉQUIVALENTE (1 an → 1 an)', () => {
    const b = { type: 'garage', debut: '2024-01-01', fin: '2024-12-31', signatures: { signedAt: '2026-09-10T10:00:00Z' } };
    expect(echeanceBail(b, null, { todayIso: AUJ })).toMatchObject({ statut: 'reconduit', regle: 'contrat', prochaine: '2026-12-31' });
  });
  it('garage repris (contrat non rédigé par l\'app) → arrivé à terme', () => {
    const b = { type: 'garage', typeContrat: 'repris', debut: '2024-01-01', fin: '2024-12-31' };
    expect(echeanceBail(b, null, { todayIso: AUJ }).statut).toBe('arrive_a_terme');
  });
  it('garage signé AVANT le 04/09/2026 ou jamais signé → arrivé à terme (contrat à vérifier)', () => {
    expect(echeanceBail({ type: 'garage', debut: '2024-01-01', fin: '2024-12-31', signatures: { signedAt: '2024-01-01T10:00:00Z' } }, null, { todayIso: AUJ }).statut).toBe('arrive_a_terme');
    expect(echeanceBail({ type: 'garage', debut: '2024-01-01', fin: '2024-12-31' }, null, { todayIso: AUJ }).statut).toBe('arrive_a_terme');
  });
  it('autre → arrivé à terme ; garage sans date de fin → inconnue', () => {
    expect(echeanceBail({ type: 'autre', debut: '2024-01-01', fin: '2025-12-31' }, null, { todayIso: AUJ }).statut).toBe('arrive_a_terme');
    expect(echeanceBail({ type: 'garage', debut: '2024-01-01' }, null, { todayIso: AUJ }).statut).toBe('inconnue');
  });
});

describe('pastille d\'échéance', () => {
  const p = (b, o) => pastilleEcheance(echeanceBail(b, null, Object.assign({ todayIso: AUJ }, o)), { todayIso: AUJ });
  it('reconduit → « Tacite reconduction » ; arrivé à terme → « Arrivé à terme (date) » ; jamais « Échu »', () => {
    expect(p({ type: 'nu', debut: '2015-01-01', fin: '2023-12-31' }, { typeEntite: PHYS })).toEqual({ cls: 'ok', text: 'Tacite reconduction', urgent: false });
    expect(p({ type: 'garage', debut: '2024-01-01', fin: '2024-12-31', signatures: { signedAt: '2026-09-10T10:00:00Z' } })).toEqual({ cls: 'ok', text: 'Tacite reconduction', urgent: false });
    expect(p({ type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31' })).toEqual({ cls: 'err', text: 'Arrivé à terme (31/05/2026)', urgent: true });
  });
  it('en cours : la date, orange avec les jours restants sous 90 j', () => {
    expect(p({ type: 'meuble', debut: '2025-11-01', fin: '2026-10-31' })).toEqual({ cls: 'warn', text: '31/10/2026 (25j)', urgent: true });
    expect(p({ type: 'meuble', debut: '2026-09-01', fin: '2027-08-31' })).toEqual({ cls: 'ok', text: '31/08/2027', urgent: false });
  });
  it('mobilité sans date de fin → « Échéance non renseignée » (plus de « Tacite reconduction » inventée)', () => {
    expect(p({ type: 'mobilite', debut: '2026-01-01' })).toEqual({ cls: 'muted', text: 'Échéance non renseignée', urgent: false });
    expect(pastilleEcheance(null)).toEqual({ cls: 'muted', text: '', urgent: false });
  });
});

describe('alerte « bail arrivé à terme » — neutre, à l\'infinitif, jamais bloquante', () => {
  it('étudiant / mobilité : nouveau bail MEUBLÉ ou départ', () => {
    const a = alerteArriveATerme({ type: 'mobilite', debut: '2026-01-01', fin: '2026-06-30' }, null, { todayIso: AUJ });
    expect(a.texte).toBe('Bail arrivé à terme le 30/06/2026, non reconductible : signer un nouveau bail meublé ou déclarer le départ.');
    expect(a.nouveauBailMeuble).toBe(true);
  });
  it('garage repris / autre : nouveau bail ou départ, sans rien affirmer de plus', () => {
    const a = alerteArriveATerme({ type: 'autre', debut: '2024-01-01', fin: '2025-12-31' }, null, { todayIso: AUJ });
    expect(a.texte).toBe('Bail arrivé à terme le 31/12/2025, contrat à vérifier : signer un nouveau bail ou déclarer le départ.');
  });
  it('aucune alerte : bail reconduit, en cours, départ déclaré, clôturé', () => {
    expect(alerteArriveATerme({ type: 'nu', debut: '2015-01-01', fin: '2023-12-31' }, null, { typeEntite: PHYS, todayIso: AUJ })).toBe(null);
    expect(alerteArriveATerme({ type: 'garage', debut: '2024-01-01', fin: '2024-12-31', signatures: { signedAt: '2026-09-10T10:00:00Z' } }, null, { todayIso: AUJ })).toBe(null);
    expect(alerteArriveATerme({ type: 'etudiant', debut: '2026-09-01', fin: '2027-05-31' }, null, { todayIso: AUJ })).toBe(null);
    expect(alerteArriveATerme({ type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31', depart: { dateSortie: '2026-11-01' } }, null, { todayIso: AUJ })).toBe(null);
    expect(alerteArriveATerme({ type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31', cloture: true }, null, { todayIso: AUJ })).toBe(null);
  });
});

describe('rappel « préavis bailleur » : nu et meublé seulement, sur l\'échéance À VENIR', () => {
  it('nu reconduit : 6 mois avant la prochaine échéance', () => {
    const r = preavisBailleurAvantEcheance({ type: 'nu', debut: '2015-01-01', fin: '2023-12-31' }, null, { typeEntite: PHYS, todayIso: AUJ });
    expect(r).toEqual({ fin: '2026-12-31', debut: '2026-06-30', mois: 6, meuble: false });
  });
  it('aucun rappel pour étudiant, mobilité, garage, autre', () => {
    for (const t of ['etudiant', 'mobilite', 'garage', 'autre']) {
      expect(preavisBailleurAvantEcheance({ type: t, debut: '2026-09-01', fin: '2027-05-31' }, null, { todayIso: AUJ })).toBe(null);
    }
  });
});

describe('note d\'agenda « Fin de bail »', () => {
  it('ne dit « reconduit » que là où la loi ou le contrat le prévoit', () => {
    expect(noteFinDeBail({ regle: 'loi', type: 'nu' })).toMatch(/reconduit \(art\. 10/);
    expect(noteFinDeBail({ regle: 'loi', type: 'meuble' })).toMatch(/art\. 25-7/);
    expect(noteFinDeBail({ regle: 'contrat', type: 'garage' })).toMatch(/clause du contrat/);
    expect(noteFinDeBail({ regle: null, type: 'etudiant' })).not.toMatch(/reconduit\b/);
    expect(noteFinDeBail({ regle: null, type: 'autre' })).toBe('Fin du bail, contrat à vérifier : signer un nouveau bail ou déclarer le départ.');
  });
  it('dateFr', () => { expect(dateFr('2026-05-31')).toBe('31/05/2026'); expect(dateFr('x')).toBe(''); });
});
