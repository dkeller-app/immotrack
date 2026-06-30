// __tests__/helpers/candidature.test.js
import { describe, it, expect } from 'vitest';
import {
  _calculConfiance, _candidatVersLocataire, _candidatVersGarant,
  _nouveauCandidat, _migrerDocsCandidatVersBail, _purgeCandidatsRefuses,
  buildComplementShareMessage, shouldAutoPull,
  countUnreadCandidats, nouveauDossierToast,
  majDossierToast, repullDecision, loyerAttenduForLog
} from '../../js/core/candidature.js';

describe('_calculConfiance', () => {
  it('ratio >= 3 + CDI + garant + pièces complètes = 100', () => {
    const c = { revenus: 3000, contrat: 'CDI', garant: { nom: 'Papa' }, piecesCompletes: true };
    expect(_calculConfiance(c, 1000)).toBe(100); // 35 + 25 + 20 + 20
  });
  it('ratio >= 3 seul = 35 pts (barème renforcé sur la solvabilité)', () => {
    expect(_calculConfiance({ revenus: 3000 }, 1000)).toBe(35);
  });
  it('ratio entre 2.5 et 3 = 20 pts de ratio', () => {
    const c = { revenus: 2700, contrat: 'Autre', garant: null };
    expect(_calculConfiance(c, 1000)).toBe(20);
  });
  it('ratio entre 2 et 2.5 = 10 pts', () => {
    expect(_calculConfiance({ revenus: 2200 }, 1000)).toBe(10);
  });
  it('ratio < 2 = 0 pt de ratio', () => {
    expect(_calculConfiance({ revenus: 1500 }, 1000)).toBe(0);
  });
  it('CDD = 10, CDI = 25', () => {
    expect(_calculConfiance({ contrat: 'CDD' }, 0)).toBe(10);
    expect(_calculConfiance({ contrat: 'CDI' }, 0)).toBe(25);
  });
  it('garant compte seulement si nom non vide', () => {
    expect(_calculConfiance({ garant: { nom: '  ' } }, 0)).toBe(0);
    expect(_calculConfiance({ garant: { nom: 'Tante' } }, 0)).toBe(20);
  });
  it('pièces complètes = 20 pts', () => {
    expect(_calculConfiance({ piecesCompletes: true }, 0)).toBe(20);
  });
  it('le RIB n\'entre PAS dans le score (décret 2015-1437 / art. 22-2 loi 1989)', () => {
    expect(_calculConfiance({ ribFourni: true }, 0)).toBe(0);
    // ribFourni n'ajoute rien même combiné à un dossier par ailleurs identique
    expect(_calculConfiance({ contrat: 'CDI', ribFourni: true }, 0))
      .toBe(_calculConfiance({ contrat: 'CDI' }, 0));
  });
  it('loyer 0 ou revenus 0 → pas de points de ratio, pas de crash', () => {
    expect(_calculConfiance({ revenus: 0, contrat: 'CDI' }, 1000)).toBe(25);
    expect(_calculConfiance({ revenus: 3000, contrat: 'CDI' }, 0)).toBe(25);
  });
  it('entrée nulle → 0', () => {
    expect(_calculConfiance(null, 1000)).toBe(0);
  });
  it('plafonné à 100', () => {
    const c = { revenus: 99999, contrat: 'CDI', garant: { nom: 'X' }, piecesCompletes: true };
    expect(_calculConfiance(c, 1)).toBe(100);
  });
});

describe('_candidatVersLocataire', () => {
  it('fusionne nom + prenom en `nom` complet et passe les autres champs', () => {
    const c = { civilite: 'Mme', nom: 'Durand', prenom: 'Alice', ddn: '1990-05-01',
                lieuNaiss: 'Lyon', tel: '0600000000', email: 'a@b.fr', adressePrecedente: '1 rue X' };
    expect(_candidatVersLocataire(c)).toEqual({
      civilite: 'Mme', nom: 'Durand Alice', ddn: '1990-05-01', lieuNaiss: 'Lyon',
      tel: '0600000000', email: 'a@b.fr', adressePrecedente: '1 rue X'
    });
  });
  it('prenom manquant → nom seul, pas d\'espace en trop', () => {
    expect(_candidatVersLocataire({ nom: 'Durand' }).nom).toBe('Durand');
  });
  it('entrée nulle → objet locataire vide bien formé', () => {
    expect(_candidatVersLocataire(null)).toEqual({
      civilite: '', nom: '', ddn: '', lieuNaiss: '', tel: '', email: '', adressePrecedente: ''
    });
  });
});

describe('_candidatVersGarant', () => {
  it('garant avec nom → objet garant aligné bail {nom, adresse, ddn, lieu}', () => {
    const c = { garant: { nom: 'Papa Durand', adresse: '2 rue Y', ddn: '1960-01-01', lieu: 'Paris' } };
    expect(_candidatVersGarant(c)).toEqual({ nom: 'Papa Durand', adresse: '2 rue Y', ddn: '1960-01-01', lieu: 'Paris' });
  });
  it('pas de garant ou nom vide → null', () => {
    expect(_candidatVersGarant({ garant: null })).toBeNull();
    expect(_candidatVersGarant({ garant: { nom: '  ' } })).toBeNull();
    expect(_candidatVersGarant({})).toBeNull();
  });
});

describe('_nouveauCandidat', () => {
  it('applique les valeurs par défaut et un id', () => {
    const c = _nouveauCandidat();
    expect(c.statut).toBe('recu');
    expect(c.source).toBe('manuel');
    expect(c._archived).toBe(false);
    expect(typeof c.id).toBe('string');
    expect(c.id.length).toBeGreaterThan(0);
    expect(c.confianceScore).toBe(0);
    expect(c.garant).toBeNull();
    expect(c.dateDebutSouhaitee).toBe('');
  });
  it('les champs fournis écrasent les défauts', () => {
    const c = _nouveauCandidat({ nom: 'X', logRef: 'F-001', source: 'lien', statut: 'enCours', dateDebutSouhaitee: '2026-09-01' });
    expect(c.nom).toBe('X');
    expect(c.logRef).toBe('F-001');
    expect(c.source).toBe('lien');
    expect(c.statut).toBe('enCours');
    expect(c.dateDebutSouhaitee).toBe('2026-09-01');
  });
  it('deux appels donnent des id différents', () => {
    expect(_nouveauCandidat().id).not.toBe(_nouveauCandidat().id);
  });
});

describe('_migrerDocsCandidatVersBail', () => {
  const docs = [
    { id: 1, parentType: 'candidat', parentId: 'cand_A', name: 'cni.pdf', logRef: null },
    { id: 2, parentType: 'candidat', parentId: 'cand_B', name: 'autre.pdf', logRef: null },
    { id: 3, parentType: 'bail', parentRef: 'F-009', name: 'bail.pdf', logRef: 'F-009' }
  ];
  it('re-pointe seulement les docs du candidat ciblé vers le bail', () => {
    const out = _migrerDocsCandidatVersBail(docs, 'cand_A', 'F-001', 'F-001');
    const a = out.find(d => d.id === 1);
    expect(a.parentType).toBe('bail');
    expect(a.parentRef).toBe('F-001');
    expect(a.logRef).toBe('F-001');
    expect(out.find(d => d.id === 2).parentType).toBe('candidat'); // intact
    expect(out.find(d => d.id === 3).parentRef).toBe('F-009');     // intact
  });
  it('comparaison d\'id tolérante au type (string vs number)', () => {
    const d = [{ id: 9, parentType: 'candidat', parentId: 42 }];
    expect(_migrerDocsCandidatVersBail(d, '42', 'F-1', 'F-1')[0].parentType).toBe('bail');
  });
  it('entrée non-array → []', () => {
    expect(_migrerDocsCandidatVersBail(null, 'x', 'y', 'z')).toEqual([]);
  });
});

describe('_purgeCandidatsRefuses', () => {
  const now = Date.parse('2026-06-02T00:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  it('supprime un refusé plus vieux que 30 j, garde un refusé récent', () => {
    const cands = [
      { id: 'old', statut: 'refuse', _modifiedAt: new Date(now - 31 * day).toISOString() },
      { id: 'new', statut: 'refuse', _modifiedAt: new Date(now - 10 * day).toISOString() }
    ];
    const kept = _purgeCandidatsRefuses(cands, now, 30).map(c => c.id);
    expect(kept).toEqual(['new']);
  });
  it('ne touche jamais les non-refusés même très anciens', () => {
    const cands = [{ id: 'v', statut: 'valide', _modifiedAt: new Date(now - 999 * day).toISOString() }];
    expect(_purgeCandidatsRefuses(cands, now, 30)).toHaveLength(1);
  });
  it('entrée non-array → []', () => {
    expect(_purgeCandidatsRefuses(null, now)).toEqual([]);
  });
});

describe('buildComplementShareMessage', () => {
  it('inclut le bien et la note de complément', () => {
    const m = buildComplementShareMessage('Avis d\'imposition page 2', 'T2 — rue des Lilas');
    expect(m).toContain('T2 — rue des Lilas');
    expect(m).toContain('Avis d\'imposition page 2');
    expect(m).toMatch(/conserv/i);
  });
  it('reste correct sans note', () => {
    const m = buildComplementShareMessage('', 'Studio Foch');
    expect(m).toContain('Studio Foch');
    expect(m).not.toMatch(/Élément\(s\) à compléter/);
  });
  it('reste correct sans bien (libellé générique)', () => {
    const m = buildComplementShareMessage('RIB', '');
    expect(typeof m).toBe('string');
    expect(m).toContain('RIB');
    expect(m).toContain('votre dossier de location');
  });
});

describe('shouldAutoPull', () => {
  const I = 180000; // 3 min
  it('pas de lien actif → jamais de pull', () => {
    expect(shouldAutoPull(0, 1_000_000, I, false)).toBe(false);
    expect(shouldAutoPull(null, 1_000_000, I, false)).toBe(false);
  });
  it('jamais pull + liens actifs → pull', () => {
    expect(shouldAutoPull(0, 1_000_000, I, true)).toBe(true);
    expect(shouldAutoPull(null, 1_000_000, I, true)).toBe(true);
  });
  it('intervalle non écoulé → pas de pull', () => {
    expect(shouldAutoPull(1_000_000, 1_000_000 + 60_000, I, true)).toBe(false);
  });
  it('intervalle écoulé → pull', () => {
    expect(shouldAutoPull(1_000_000, 1_000_000 + 200_000, I, true)).toBe(true);
  });
  it('borne exacte (now-last === interval) → pull', () => {
    expect(shouldAutoPull(1_000_000, 1_000_000 + I, I, true)).toBe(true);
  });
});

describe('countUnreadCandidats', () => {
  it('compte uniquement vu === false, non supprimés, non archivés', () => {
    const list = [
      { id:'a', vu:false },
      { id:'b', vu:true },
      { id:'c' },
      { id:'d', vu:false, _deleted:true },
      { id:'e', vu:false, _archived:true },
      { id:'f', vu:false }
    ];
    expect(countUnreadCandidats(list)).toBe(2);
  });
  it('liste vide / invalide → 0', () => {
    expect(countUnreadCandidats([])).toBe(0);
    expect(countUnreadCandidats(null)).toBe(0);
  });
});

describe('nouveauDossierToast', () => {
  it('aucun nom → message générique', () => {
    expect(nouveauDossierToast([])).toMatch(/Nouveau dossier reçu/);
  });
  it('un nom', () => {
    expect(nouveauDossierToast(['Marie Dupont'])).toContain('Marie Dupont');
  });
  it('deux noms → « et 1 autre »', () => {
    const t = nouveauDossierToast(['Marie Dupont','Karim Benali']);
    expect(t).toContain('Marie Dupont');
    expect(t).toContain('1 autre');
  });
  it('trois noms → « et 2 autres »', () => {
    expect(nouveauDossierToast(['A','B','C'])).toContain('2 autres');
  });
  it('ignore les noms vides', () => {
    expect(nouveauDossierToast(['', null, 'Léa'])).toContain('Léa');
  });
});

describe('majDossierToast', () => {
  it('aucun nom → message générique', () => {
    expect(majDossierToast([])).toMatch(/Dossier mis à jour/);
  });
  it('un nom', () => {
    expect(majDossierToast(['Marie Dupont'])).toContain('Marie Dupont');
  });
  it('deux noms → « et 1 autre »', () => {
    const t = majDossierToast(['Marie Dupont','Karim Benali']);
    expect(t).toContain('Marie Dupont');
    expect(t).toContain('1 autre');
  });
  it('distinct du toast « nouveau » (📝 vs 📩)', () => {
    expect(majDossierToast(['Léa'])).toContain('📝');
    expect(majDossierToast(['Léa'])).not.toContain('📩');
  });
});

describe('repullDecision', () => {
  it('lien actif → toujours import (1ère soumission / complément D13)', () => {
    expect(repullDecision({ status: 'active' }, '2026-06-11T10:00:00Z', null)).toBe('import');
  });
  it('lien collecté sans horodatage suivi → baseline (pas de notif rétroactive)', () => {
    expect(repullDecision({ status: 'collected' }, '2026-06-11T10:00:00Z', 'enCours')).toBe('baseline');
    expect(repullDecision({ status: 'collected', _lastSubmittedAt: null }, '2026-06-11T10:00:00Z', 'enCours')).toBe('baseline');
  });
  it('même horodatage que le dernier import → skip (anti-boucle)', () => {
    const link = { status: 'collected', _lastSubmittedAt: '2026-06-11T10:00:00Z' };
    expect(repullDecision(link, '2026-06-11T10:00:00Z', 'enCours')).toBe('skip');
  });
  it('horodatage plus récent (ré-ouverture candidat) → import', () => {
    const link = { status: 'collected', _lastSubmittedAt: '2026-06-11T10:00:00Z' };
    expect(repullDecision(link, '2026-06-11T12:30:00Z', 'enCours')).toBe('import');
  });
  it('décision prise (validé/refusé/converti) → skip même si soumission change', () => {
    const link = { status: 'collected', _lastSubmittedAt: '2026-06-11T10:00:00Z' };
    expect(repullDecision(link, '2026-06-11T12:30:00Z', 'valide')).toBe('skip');
    expect(repullDecision(link, '2026-06-11T12:30:00Z', 'refuse')).toBe('skip');
    expect(repullDecision(link, '2026-06-11T12:30:00Z', 'converti')).toBe('skip');
  });
  it('décision prise prime sur baseline (lien hérité décidé → skip, pas de réécriture)', () => {
    const link = { status: 'collected' }; // pas de _lastSubmittedAt (hérité)
    expect(repullDecision(link, '2026-06-11T12:30:00Z', 'valide')).toBe('skip');
    expect(repullDecision(link, '2026-06-11T12:30:00Z', 'refuse')).toBe('skip');
    expect(repullDecision(link, '2026-06-11T12:30:00Z', 'converti')).toBe('skip');
  });
  it('lien absent → import (laisse le flux normal créer)', () => {
    expect(repullDecision(null, '2026-06-11T10:00:00Z', null)).toBe('import');
  });
});

describe('loyerAttenduForLog', () => {
  it('priorité 1 : loyer du logement', () => {
    const r = loyerAttenduForLog({ logHC: 720, baux: [{hc:600,fin:'2025-01-01'}], linkLoyer: 900 });
    expect(r).toEqual({ loyer: 720, source: 'logement', locataire: null });
  });
  it('priorité 2 : ancien locataire (logement vide) — bail le plus récent', () => {
    const r = loyerAttenduForLog({ logHC: 0, baux: [
      {hc:600,fin:'2024-05-31',locataire:'Vieux'},
      {hc:680,fin:'2026-05-31',locataire:'Dupont'}
    ], linkLoyer: 900 });
    expect(r).toEqual({ loyer: 680, source: 'ancien', locataire: 'Dupont' });
  });
  it('bail en cours (sans fin) prime sur un historique', () => {
    const r = loyerAttenduForLog({ logHC: 0, baux: [
      {hc:680,fin:'2026-05-31',locataire:'Dupont'},
      {hc:700,locataire:'EnCours'}
    ]});
    expect(r.loyer).toBe(700);
    expect(r.locataire).toBe('EnCours');
  });
  it('priorité 3 : loyer saisi à l\'invitation (ni logement ni bail)', () => {
    const r = loyerAttenduForLog({ logHC: 0, baux: [], linkLoyer: 850 });
    expect(r).toEqual({ loyer: 850, source: 'invitation', locataire: null });
  });
  it('rien → manquant, loyer 0', () => {
    expect(loyerAttenduForLog({})).toEqual({ loyer: 0, source: 'manquant', locataire: null });
    expect(loyerAttenduForLog({ logHC: 0, baux: [{hc:0}], linkLoyer: 0 })).toEqual({ loyer: 0, source: 'manquant', locataire: null });
  });
});
