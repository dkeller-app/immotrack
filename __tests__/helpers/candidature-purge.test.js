// __tests__/helpers/candidature-purge.test.js — CANDIDATURES-CONFORMITE lot 1.
// Purge RGPD des candidats non retenus : horloge = date du refus, périmètre exact, idempotence,
// candidat converti jamais purgé, chemins Storage contrôlés, nettoyage de la ligne cloud.
import { describe, it, expect } from 'vitest';
import {
  JOURS_CONSERVATION_REFUS, dateRefus, estProtegeDeLaPurge, refuseLeAPoser,
  candidatsAPurger, dateSuppressionPrevue, piecesDuCandidat, planPurge,
  cheminFichierCandidatValide, ajouterEnAttente, retirerDeAttente,
  idsAvecScoreStocke, effacementLigneCloud
} from '../../js/core/candidature-purge.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-12T10:00:00Z');
const iso = ms => new Date(ms).toISOString();
const U1 = '11111111-2222-4333-8444-555555555555';
const U2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('dateRefus — horloge de la purge', () => {
  it('lit refuseLe en priorité, même si _modifiedAt est plus récent', () => {
    expect(dateRefus({ statut: 'refuse', refuseLe: '2026-09-01T08:00:00.000Z', _modifiedAt: '2026-10-11T08:00:00.000Z' }))
      .toBe('2026-09-01T08:00:00.000Z');
  });
  it('repli sur _modifiedAt (ISO ou nombre) pour un refus antérieur à la mise à jour', () => {
    expect(dateRefus({ statut: 'refuse', _modifiedAt: '2026-09-02T00:00:00.000Z' })).toBe('2026-09-02T00:00:00.000Z');
    expect(dateRefus({ statut: 'refuse', _modifiedAt: Date.parse('2026-09-03T00:00:00Z') })).toBe('2026-09-03T00:00:00.000Z');
  });
  it('vide si aucune date exploitable', () => {
    expect(dateRefus({ statut: 'refuse' })).toBe('');
    expect(dateRefus(null)).toBe('');
    expect(dateRefus({ statut: 'refuse', _modifiedAt: 'n/importe' })).toBe('');
  });
});

describe('estProtegeDeLaPurge — un candidat converti en bail n\'est jamais purgé', () => {
  it('converti, ou bailRef renseigné → protégé', () => {
    expect(estProtegeDeLaPurge({ statut: 'converti' })).toBe(true);
    expect(estProtegeDeLaPurge({ statut: 'refuse', bailRef: 'T3-Ferrette' })).toBe(true);
  });
  it('refusé sans bail → non protégé', () => {
    expect(estProtegeDeLaPurge({ statut: 'refuse', bailRef: '' })).toBe(false);
  });
});

describe('refuseLeAPoser — migration des refusés existants (une seule fois)', () => {
  it('pose refuseLe depuis _modifiedAt pour les refusés qui n\'en ont pas', () => {
    const r = refuseLeAPoser([
      { id: 'a', statut: 'refuse', _modifiedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'b', statut: 'refuse', refuseLe: '2026-08-01T00:00:00.000Z' },
      { id: 'c', statut: 'enCours', _modifiedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'd', statut: 'refuse', _deleted: true },
      { id: 'e', statut: 'converti', _modifiedAt: '2026-09-01T00:00:00.000Z' }
    ], iso(NOW));
    expect(r).toEqual([{ id: 'a', refuseLe: '2026-09-01T00:00:00.000Z' }]);
  });
  it('sans aucune date : refuseLe = maintenant (l\'horloge démarre, elle ne purge pas à l\'aveugle)', () => {
    expect(refuseLeAPoser([{ id: 'x', statut: 'refuse' }], iso(NOW))).toEqual([{ id: 'x', refuseLe: iso(NOW) }]);
  });
  it('idempotent : un 2e passage ne propose plus rien', () => {
    const cands = [{ id: 'a', statut: 'refuse', _modifiedAt: '2026-09-01T00:00:00.000Z' }];
    refuseLeAPoser(cands, iso(NOW)).forEach(p => { cands.find(c => c.id === p.id).refuseLe = p.refuseLe; });
    expect(refuseLeAPoser(cands, iso(NOW))).toEqual([]);
  });
  it('entrée non-array → []', () => { expect(refuseLeAPoser(null, iso(NOW))).toEqual([]); });
});

describe('candidatsAPurger', () => {
  it('30 jours par défaut', () => { expect(JOURS_CONSERVATION_REFUS).toBe(30); });
  it('J+29 conservé, J+30 purgé', () => {
    const ids = candidatsAPurger([
      { id: 'j29', statut: 'refuse', refuseLe: iso(NOW - 29 * DAY) },
      { id: 'j30', statut: 'refuse', refuseLe: iso(NOW - 30 * DAY) }
    ], NOW);
    expect(ids).toEqual(['j30']);
  });
  it('une édition après le refus ne repousse PAS la purge (horloge = refuseLe, pas _modifiedAt)', () => {
    expect(candidatsAPurger([{ id: 'e', statut: 'refuse', refuseLe: iso(NOW - 40 * DAY), _modifiedAt: iso(NOW - DAY) }], NOW))
      .toEqual(['e']);
  });
  it('jamais un converti, jamais un candidat qui porte un bail, jamais un non-refusé', () => {
    const vieux = iso(NOW - 400 * DAY);
    expect(candidatsAPurger([
      { id: 'c', statut: 'converti', refuseLe: vieux },
      { id: 'b', statut: 'refuse', bailRef: 'T2', refuseLe: vieux },
      { id: 'v', statut: 'valide', _modifiedAt: vieux },
      { id: 'r', statut: 'recu', _modifiedAt: vieux },
      { id: 'n', statut: 'enCours', _modifiedAt: vieux }
    ], NOW)).toEqual([]);
  });
  it('refusé puis repassé en cours (refuseLe effacé) → plus purgeable', () => {
    expect(candidatsAPurger([{ id: 'x', statut: 'enCours', _modifiedAt: iso(NOW - 90 * DAY) }], NOW)).toEqual([]);
  });
  it('ignore les tombstones (idempotence : un candidat déjà purgé ne revient pas)', () => {
    expect(candidatsAPurger([{ id: 't', statut: 'refuse', refuseLe: iso(NOW - 90 * DAY), _deleted: true }], NOW)).toEqual([]);
  });
  it('date de refus inconnue → pas purgé', () => {
    expect(candidatsAPurger([{ id: 'u', statut: 'refuse' }], NOW)).toEqual([]);
  });
  it('durée paramétrable', () => {
    expect(candidatsAPurger([{ id: 'a', statut: 'refuse', refuseLe: iso(NOW - 8 * DAY) }], NOW, 7)).toEqual(['a']);
  });
  it('entrée non-array → []', () => { expect(candidatsAPurger(undefined, NOW)).toEqual([]); });
});

describe('dateSuppressionPrevue', () => {
  it('refus + 30 jours, au format AAAA-MM-JJ', () => {
    expect(dateSuppressionPrevue({ statut: 'refuse', refuseLe: '2026-10-12T09:00:00.000Z' })).toBe('2026-11-11');
  });
  it('vide si non refusé ou protégé', () => {
    expect(dateSuppressionPrevue({ statut: 'enCours' })).toBe('');
    expect(dateSuppressionPrevue({ statut: 'converti', refuseLe: '2026-10-12T09:00:00.000Z' })).toBe('');
  });
});

describe('piecesDuCandidat / planPurge — périmètre exact de ce qui peut être effacé', () => {
  const documents = [
    { id: 1, parentType: 'candidat', parentId: 'cand_A', idbKey: 'ph_1_aaaaaa', cloudKey: `${U1}/${U2}/files/ph_1_aaaaaa`, name: 'cni.pdf' },
    { id: 2, parentType: 'candidat', parentId: 'cand_A', idbKey: 'ph_2_bbbbbb', name: 'bulletins.pdf' },               // jamais envoyé en ligne
    { id: 3, parentType: 'candidat', parentId: 'cand_A', idbKey: 'ph_3_cccccc', cloudKey: 'x', _deleted: true },        // déjà supprimée
    { id: 4, parentType: 'candidat', parentId: 'cand_B', idbKey: 'ph_4_dddddd', cloudKey: `${U1}/${U2}/files/ph_4_dddddd` }, // autre candidat
    { id: 5, parentType: 'bail', parentId: 'cand_A', parentRef: 'T3', idbKey: 'ph_5_eeeeee', cloudKey: `${U1}/${U2}/files/ph_5_eeeeee` }, // migrée au bail
    { id: 6, parentType: 'logement', parentId: 'cand_A', idbKey: 'ph_6_ffffff', cloudKey: `${U1}/${U2}/files/ph_6_ffffff` },
    null
  ];
  it('piecesDuCandidat : seulement les pièces vivantes parentType « candidat » de CE candidat', () => {
    expect(piecesDuCandidat(documents, 'cand_A').map(d => d.id)).toEqual([1, 2]);
  });
  it('parentId numérique ou texte : comparaison en chaîne', () => {
    expect(piecesDuCandidat([{ id: 9, parentType: 'candidat', parentId: 42 }], '42').map(d => d.id)).toEqual([9]);
  });
  it('planPurge : fiches + pièces + clés locales + chemins en ligne, rien d\'autre', () => {
    const candidats = [
      { id: 'cand_A', statut: 'refuse', entity: 'SCI X', linkId: 'L1', refuseLe: iso(NOW - 40 * DAY) },
      { id: 'cand_B', statut: 'refuse', entity: 'SCI X', refuseLe: iso(NOW - 2 * DAY) }
    ];
    const plan = planPurge(candidats, documents, ['cand_A']);
    expect(plan).toEqual([{
      candId: 'cand_A', entity: 'SCI X', linkId: 'L1',
      docIds: [1, 2], idbKeys: ['ph_1_aaaaaa', 'ph_2_bbbbbb'], cloudPaths: [`${U1}/${U2}/files/ph_1_aaaaaa`], cheminsInconnus: 0
    }]);
  });
  it('planPurge signale un cloudKey de forme inconnue (le candidat sera conservé)', () => {
    const p = planPurge([{ id: 'X', statut: 'refuse' }], [{ id: 9, parentType: 'candidat', parentId: 'X', cloudKey: 'autre/forme.pdf' }], ['X']);
    expect(p[0]).toMatchObject({ cloudPaths: [], cheminsInconnus: 1 });
  });
  it('planPurge écarte un candidat protégé même si son id est demandé (défense en profondeur)', () => {
    const candidats = [{ id: 'cand_A', statut: 'converti', bailRef: 'T3' }];
    expect(planPurge(candidats, documents, ['cand_A'])).toEqual([]);
  });
  it('planPurge ignore un id inconnu ou déjà supprimé', () => {
    expect(planPurge([{ id: 'cand_A', statut: 'refuse', _deleted: true }], documents, ['cand_A', 'zzz'])).toEqual([]);
  });
});

describe('cheminFichierCandidatValide — garde des chemins envoyés à la suppression Storage', () => {
  it('accepte les formes produites par l\'app', () => {
    expect(cheminFichierCandidatValide(`${U1}/${U2}/files/ph_1760000000000_ab12cd`)).toBe(true);
    expect(cheminFichierCandidatValide(`${U1}/_orphelin/files/ph_1760000000000_ab12cd`)).toBe(true);
    expect(cheminFichierCandidatValide(`${U1}/files/ph_1760000000000_ab12cd`)).toBe(true);          // legacy
    expect(cheminFichierCandidatValide(`${U1}/${U2}/files/att_1760000000000_ab12cd`)).toBe(true);
    expect(cheminFichierCandidatValide('att_1760000000000_ab12cd')).toBe(true);                    // clé nue legacy
  });
  it('refuse tout le reste (dossier entier, traversée, joker, autre forme)', () => {
    [
      '', null, undefined, 42,
      `${U1}/${U2}/files/`, `${U1}/${U2}/files`, `${U1}/${U2}`, U1,
      `${U1}/${U2}/files/../ph_1_ab`, `${U1}/${U2}/files/ph_1_ab/x`, `${U1}/${U2}/files/*`,
      `${U1}/${U2}/files/bail-signe.pdf`, `${U1}/${U2}/autre/ph_1_ab`, `/${U1}/${U2}/files/ph_1_ab`,
      `${U1}/${U2.toUpperCase()}/files/ph_1_ab`, `${U1}/${U2}/files/ph_1_ab `, 'ph_1_ab ', 'bp_1_ab', '../ph_1_ab'
    ].forEach(p => expect(cheminFichierCandidatValide(p)).toBe(false));
  });
});

describe('file d\'attente des fichiers en ligne à supprimer (hors ligne → reprise)', () => {
  const P1 = `${U1}/${U2}/files/ph_1_aaaaaa`, P2 = `${U1}/${U2}/files/ph_2_bbbbbb`;
  it('ajoute sans doublon et ignore les chemins invalides', () => {
    expect(ajouterEnAttente([P1], [P1, P2, 'n/importe'])).toEqual([P1, P2]);
  });
  it('liste illisible → repart d\'une liste vide', () => {
    expect(ajouterEnAttente('corrompu', [P1])).toEqual([P1]);
  });
  it('retire les chemins effacés', () => {
    expect(retirerDeAttente([P1, P2], [P1])).toEqual([P2]);
    expect(retirerDeAttente(null, [P1])).toEqual([]);
  });
});

describe('idsAvecScoreStocke — effacement du score stocké (décision Didier 12/10, Q1)', () => {
  it('liste les candidats vivants qui portent encore le champ, même à 0', () => {
    expect(idsAvecScoreStocke([
      { id: 'a', confianceScore: 72 }, { id: 'b', confianceScore: 0 }, { id: 'c' },
      { id: 'd', confianceScore: 50, _deleted: true }, null
    ])).toEqual(['a', 'b']);
  });
  it('idempotent : plus rien après suppression du champ', () => {
    const c = [{ id: 'a', confianceScore: 72 }];
    idsAvecScoreStocke(c).forEach(() => { delete c[0].confianceScore; });
    expect(idsAvecScoreStocke(c)).toEqual([]);
  });
});

describe('effacementLigneCloud — la ligne supprimée ne garde aucune donnée personnelle', () => {
  it('candidat : legacy_raw réduit à l\'identifiant', () => {
    expect(effacementLigneCloud('candidats', { id: 'cand_A', nom: 'Dupont', email: 'x@y.fr', revenus: 2000 }))
      .toEqual({ legacy_raw: { id: 'cand_A', _efface: true } });
  });
  it('pièce de candidat : legacy_raw réduit + nom de fichier effacé', () => {
    expect(effacementLigneCloud('documents', { id: 7, parentType: 'candidat', parentId: 'cand_A', name: 'cni-dupont.pdf' }))
      .toEqual({ legacy_raw: { id: 7, parentType: 'candidat', _efface: true }, name: null });
  });
  it('toute autre pièce ou table : rien (comportement « preuve légale » inchangé)', () => {
    expect(effacementLigneCloud('documents', { id: 8, parentType: 'bail', name: 'bail.pdf' })).toBe(null);
    expect(effacementLigneCloud('documents', { id: 9, parentType: 'logement' })).toBe(null);
    expect(effacementLigneCloud('baux', { id: 1 })).toBe(null);
    expect(effacementLigneCloud('documents', null)).toBe(null);
  });
});
