/**
 * LA règle du délai de restitution du dépôt de garantie (art. 22, loi n° 89-462) — js/core/dg-delai.js.
 * Décisions du pilotage (06/10) : deux MAXIMUMS (1 mois si l'EDL de sortie est conforme, 2 mois sinon) ;
 * point de départ = la remise des clés déclarée, sinon la date de l'EDL de sortie, la fin effective, la
 * fin ; conformité = l'EDL de sortie de CE bail, jamais les retenues ; conformité inconnue → « dépassement
 * possible » entre 1 et 2 mois, « en retard » au-delà, pénalité possible dite mais jamais additionnée.
 */
import { describe, it, expect } from 'vitest';
import {
  joursEntre, conformiteEdlSortie, remiseDesCles, echeancesRestitution, etatDelai, moisCommences, penaliteRetard, libelleEcheance, texteEtatDelai,
} from '../../js/core/dg-delai.js';

const piece = (etatE, etatS) => ({ pieces: [{ elements: [{ etatE, etatS }] }] });
const EDL_OK = { date: '2026-03-10', ...piece('Bon état', 'Bon état') };
const EDL_KO = { date: '2026-03-10', ...piece('Bon état', 'Mauvais état') };

describe('conformité de l’EDL de sortie', () => {
  it('pas d’EDL de sortie → inconnue (null), jamais « conforme » par défaut', () => {
    expect(conformiteEdlSortie(null)).toBeNull();
  });
  it('aucune dégradation → conforme ; « Mauvais état » ou usure d’un élément entré en bon état → non conforme', () => {
    expect(conformiteEdlSortie(EDL_OK)).toBe(true);
    expect(conformiteEdlSortie(EDL_KO)).toBe(false);
    expect(conformiteEdlSortie(piece('Bon état', "État d'usage"))).toBe(false);
    expect(conformiteEdlSortie(piece("État d'usage", "État d'usage"))).toBe(true);
    expect(conformiteEdlSortie(piece('Absent', 'Absent'))).toBe(true);    // « Absent ou non applicable » ne prouve rien
  });
  it('EDL de sortie incomplet ou vide → INCONNUE : un état de sortie vide n’est jamais conforme présumé (edl-parcours §A.6)', () => {
    expect(conformiteEdlSortie(piece('Neuf', ''))).toBeNull();
    expect(conformiteEdlSortie({ pieces: [] })).toBeNull();
    expect(conformiteEdlSortie({ pieces: [{ elements: [{ etatE: 'Bon état', etatS: 'Bon état' }, { etatE: 'Bon état', etatS: '  ' }] }] })).toBeNull();
    // une dégradation déjà relevée suffit, même si l’EDL n’est pas fini
    expect(conformiteEdlSortie({ pieces: [{ elements: [{ etatE: 'Bon état', etatS: 'Mauvais état' }, { etatE: 'Bon état', etatS: '' }] }] })).toBe(false);
    const ech = echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, { date: '2026-03-01', ...piece('Bon état', '') });
    expect(ech).toMatchObject({ conforme: null, delaiMois: 2, limiteSiConforme: '2026-04-01', limite: '2026-05-01' });
  });
  it('les retenues ne disent rien de la conformité (un loyer impayé ne dégrade pas le logement)', () => {
    expect(echeancesRestitution({ depart: { dateSortie: '2026-03-01' }, dgRetenu: 300 }, EDL_OK)).toMatchObject({ conforme: true, delaiMois: 1 });
  });
});

describe('point de départ : la remise des clés', () => {
  const bail = { depart: { dateSortie: '2026-03-01' }, finEffective: '2026-03-05', fin: '2026-06-30' };
  it('ordre : remise déclarée → date de l’EDL de sortie → fin effective → fin', () => {
    expect(remiseDesCles(bail, EDL_OK)).toEqual({ iso: '2026-03-01', source: 'remise' });
    expect(remiseDesCles({ ...bail, depart: {} }, EDL_OK)).toEqual({ iso: '2026-03-10', source: 'edl' });
    expect(remiseDesCles({ ...bail, depart: null }, null)).toEqual({ iso: '2026-03-05', source: 'finEffective' });
    expect(remiseDesCles({ fin: '2026-06-30T00:00:00Z' }, null)).toEqual({ iso: '2026-06-30', source: 'fin' });
    expect(remiseDesCles({ depart: { dateSortie: 'n/a' } }, { date: '' })).toBeNull();
    expect(remiseDesCles(null, EDL_OK)).toBeNull();
  });
});

describe('échéances : deux maximums', () => {
  it('conformité inconnue : 1 mois SI conforme, 2 mois sinon — l’échéance applicable est 2 mois', () => {
    expect(echeancesRestitution({ depart: { dateSortie: '2026-01-31' } }, null)).toEqual({
      remise: '2026-01-31', source: 'remise', conforme: null, delaiMois: 2,
      limite: '2026-03-31', limiteSiConforme: '2026-02-28', limiteSinon: '2026-03-31',
    });
  });
  it('conforme → 1 mois ; non conforme → 2 mois (fin de mois recadrée, année bissextile)', () => {
    expect(echeancesRestitution({ depart: { dateSortie: '2028-01-31' } }, EDL_OK)).toMatchObject({ conforme: true, delaiMois: 1, limite: '2028-02-29' });
    expect(echeancesRestitution({ depart: { dateSortie: '2025-12-31' } }, EDL_KO)).toMatchObject({ conforme: false, delaiMois: 2, limite: '2026-02-28' });
  });
  it('sans point de départ : null', () => {
    expect(echeancesRestitution({}, null)).toBeNull();
  });
});

describe('où en est le délai', () => {
  const inconnu = echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, null);   // 01/04 si conforme, sinon 01/05
  it('conformité inconnue : dans le délai jusqu’au 1 mois inclus', () => {
    expect(etatDelai(inconnu, '2026-04-01')).toEqual({ etat: 'dans_le_delai', jours: 30, joursSiConforme: 0, joursRetard: 0 });
  });
  it('entre 1 et 2 mois : dépassement POSSIBLE (si l’EDL de sortie est conforme), pas « en retard »', () => {
    expect(etatDelai(inconnu, '2026-04-02')).toEqual({ etat: 'depassement_possible', jours: 29, joursSiConforme: -1, joursRetard: 0 });
    expect(etatDelai(inconnu, '2026-05-01').etat).toBe('depassement_possible');
  });
  it('au-delà de 2 mois : en retard', () => {
    expect(etatDelai(inconnu, '2026-05-03')).toEqual({ etat: 'en_retard', jours: -2, joursSiConforme: -32, joursRetard: 2 });
  });
  it('conformité connue : jamais de « dépassement possible »', () => {
    const ok = echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, EDL_OK);
    expect(etatDelai(ok, '2026-04-01').etat).toBe('dans_le_delai');
    expect(etatDelai(ok, '2026-04-02')).toEqual({ etat: 'en_retard', jours: -1, joursSiConforme: null, joursRetard: 1 });
  });
  it('dates invalides : null', () => {
    expect(etatDelai(null, '2026-04-01')).toBeNull();
    expect(etatDelai(inconnu, '')).toBeNull();
    expect(joursEntre('x', '2026-01-01')).toBeNull();
  });
});

describe('majoration de retard : 10 % du loyer en principal par période mensuelle commencée', () => {
  it('périodes commencées', () => {
    expect(moisCommences('2026-04-01', '2026-04-01')).toBe(0);
    expect(moisCommences('2026-04-01', '2026-04-02')).toBe(1);
    expect(moisCommences('2026-04-01', '2026-05-01')).toBe(1);   // une période pile
    expect(moisCommences('2026-04-01', '2026-05-02')).toBe(2);
  });
  it('conformité connue : pénalité certaine depuis l’échéance, aucune « possible »', () => {
    const ech = echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, EDL_OK);
    expect(penaliteRetard(ech, { loyerPrincipal: 800, restitution: '2026-05-15' })).toEqual({
      enRetard: true, moisRetard: 2, penalite: 160, base: 800, dateLimite: '2026-04-01', exclue: false, possible: null,
    });
  });
  it('conformité inconnue : certaine depuis 2 mois ; possible depuis 1 mois, DITE à part', () => {
    const ech = echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, null);
    expect(penaliteRetard(ech, { loyerPrincipal: 800, restitution: '2026-04-20' })).toEqual({
      enRetard: false, moisRetard: 0, penalite: 0, base: 800, dateLimite: '2026-05-01', exclue: false,
      possible: { depuis: '2026-04-01', moisRetard: 1, penalite: 80 },
    });
    expect(penaliteRetard(ech, { loyerPrincipal: 800, restitution: '2026-05-20' })).toMatchObject({
      enRetard: true, moisRetard: 1, penalite: 80, possible: { depuis: '2026-04-01', moisRetard: 2, penalite: 160 },
    });
  });
  it('adresse non communiquée : majoration non due (exception légale), le retard reste dit', () => {
    const ech = echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, null);
    expect(penaliteRetard(ech, { loyerPrincipal: 800, restitution: '2026-06-20', adresseNonCommuniquee: true }))
      .toMatchObject({ enRetard: true, moisRetard: 2, penalite: 0, exclue: true, possible: { penalite: 0 } });
  });
  it('sans échéance ou sans date : rien', () => {
    expect(penaliteRetard(null, { loyerPrincipal: 800, restitution: '2026-06-20' })).toMatchObject({ enRetard: false, penalite: 0 });
    expect(penaliteRetard(echeancesRestitution({ fin: '2026-03-01' }, null), { loyerPrincipal: 800 })).toMatchObject({ enRetard: false, penalite: 0 });
  });
});

describe('libellé unique', () => {
  const fd = (iso) => iso.split('-').reverse().join('/');
  it('état du délai, forme longue et courte (conformité inconnue)', () => {
    const ech = echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, null);
    const t = (iso, court) => texteEtatDelai(ech, etatDelai(ech, iso), fd, court);
    expect(t('2026-03-20')).toBe("à restituer au plus tard le 01/04/2026 si l'EDL de sortie est conforme, sinon le 01/05/2026 · J‑12");
    expect(t('2026-03-20', true)).toBe('J‑12');
    expect(t('2026-04-10')).toBe("dépassement possible (si l'EDL de sortie est conforme) — au plus tard le 01/05/2026 · J‑21");
    expect(t('2026-04-10', true)).toBe('dépassement possible');
    expect(t('2026-05-04')).toBe('en retard de 3 j — majoration de 10 % du loyer mensuel en principal par période mensuelle commencée');
    expect(t('2026-05-04', true)).toBe('retard 3 j');
    expect(texteEtatDelai(null, null, fd)).toBe('');
  });
  it('conformité connue : J‑n jusqu’à l’échéance applicable', () => {
    const ech = echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, EDL_OK);
    expect(texteEtatDelai(ech, etatDelai(ech, '2026-03-20'), fd)).toBe('à restituer au plus tard le 01/04/2026 (EDL de sortie conforme, 1 mois) · J‑12');
  });
  it('conformité inconnue : les deux maximums', () => {
    expect(libelleEcheance(echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, null), fd))
      .toBe("au plus tard le 01/04/2026 si l'EDL de sortie est conforme, sinon le 01/05/2026");
  });
  it('conformité connue : l’échéance applicable et sa raison', () => {
    expect(libelleEcheance(echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, EDL_OK), fd)).toBe('au plus tard le 01/04/2026 (EDL de sortie conforme, 1 mois)');
    expect(libelleEcheance(echeancesRestitution({ depart: { dateSortie: '2026-03-01' } }, EDL_KO), fd)).toBe("au plus tard le 01/05/2026 (dégradations relevées à l'EDL de sortie, 2 mois)");
    expect(libelleEcheance(null, fd)).toBe('');
  });
});
