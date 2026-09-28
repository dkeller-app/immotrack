// Tests — modifications d'un bail SIGNÉ hors avenant (js/core/bail-modifications.js).
// Incident 28/09 (bail Ferrette 101) : les modifications d'un bail signé étaient perdues au rechargement.
import { describe, it, expect } from 'vitest';
import { bailSigneComplet, diffModificationsBail, reappliquerJournalBaux, journalDuBail, memeValeur, valeurLisible, CHAMPS_BAIL } from '../../js/core/bail-modifications.js';

const signe = (extra) => Object.assign({
  debut: '2025-01-01', fin: '2028-01-01', hc: 800, ch: 95, dg: 800, notes: '', jpay: '5',
  locataires: [{ civilite: 'M.', nom: 'HARNIST', tel: '0612345678', email: 'h@x.fr' }, { civilite: 'Mme', nom: 'ARSLAN', tel: '', email: '' }],
  signatures: { signedAt: '2025-01-02T10:00:00Z', mode: 'avec-locataire', locked: true, bailSnapshot: { hc: 800, notes: '' } },
}, extra || {});

describe('bailSigneComplet — même règle que le scellement cloud', () => {
  it('signé par toutes les parties → oui ; bailleur seul ou non signé → non', () => {
    expect(bailSigneComplet(signe())).toBe(true);
    expect(bailSigneComplet({ signatures: { signedAt: 'x', mode: 'bailleur-seul' } })).toBe(false);
    expect(bailSigneComplet({})).toBe(false);
    expect(bailSigneComplet(null)).toBe(false);
  });
});

describe('diffModificationsBail — ce qui a changé, avec libellés du formulaire', () => {
  it('champ du bail et sous-champ d\'un locataire, désigné par civilité + nom', () => {
    const prev = signe();
    const next = JSON.parse(JSON.stringify(prev));
    next.notes = 'Animaux acceptés';
    next.locataires[0].tel = '0798765432';
    const d = diffModificationsBail(prev, next);
    expect(d).toEqual([
      { champ: 'notes', libelle: 'Notes / conditions particulières', avant: '', apres: 'Animaux acceptés' },
      { champ: 'locataires.0.tel', libelle: 'Téléphone de M. HARNIST', avant: '0612345678', apres: '0798765432' },
    ]);
  });
  it('rien de changé → aucun écart (vide / null / absent / 0 face à vide / false face à vide)', () => {
    const prev = signe({ dernierLoyerPrec: '', zoneTendue: undefined, surf: '' });
    const next = Object.assign(JSON.parse(JSON.stringify(prev)), { dernierLoyerPrec: 0, zoneTendue: false, surf: 0, complementJustif: '' });
    expect(diffModificationsBail(prev, next)).toEqual([]);
  });
  it('« 850 » et 850 identiques ; 850 → 900 = un écart marqué financier', () => {
    expect(memeValeur('850', 850)).toBe(true);
    const d = diffModificationsBail(signe({ hc: 850 }), signe({ hc: 900 }));
    expect(d).toEqual([{ champ: 'hc', libelle: 'Loyer HC', avant: 850, apres: 900, fin: true }]);
  });
  it('champs internes ou gelés jamais suivis (signatures, irlMoisRevision, mobilier, copies de premier niveau…)', () => {
    for (const k of ['nom', 'signatures', 'irlMoisRevision', 'clauseIrlV', 'mobilier', 'dateSignaturePrevue', '_modifiedAt', 'ref']) {
      expect(CHAMPS_BAIL[k]).toBeUndefined();
    }
    const prev = signe(), next = JSON.parse(JSON.stringify(prev));
    next._modifiedAt = 'x'; next.nom = 'copie'; next.mobilier = ['x'];
    expect(diffModificationsBail(prev, next)).toEqual([]);
  });
  it('champ absent du formulaire (ex. champs garage sur un bail d\'habitation) → ignoré', () => {
    const prev = signe({ emplNum: 'B12' }), next = signe();
    expect(diffModificationsBail(prev, next)).toEqual([]);
  });
});

describe('reappliquerJournalBaux — les modifications reviennent au chargement', () => {
  const entree = (date, changements, extra) => Object.assign({ id: 'bj_' + date, ref: 'F101', type: 'modification', signedAt: '2025-01-02T10:00:00Z', date, changements }, extra || {});
  it('bail rechargé dans son état signé → modifications réappliquées dans l\'ordre des dates', () => {
    const baux = { F101: signe() };
    const journal = [
      entree('2026-09-28T10:00:00Z', [{ champ: 'notes', apres: 'B' }]),
      entree('2026-09-27T10:00:00Z', [{ champ: 'notes', apres: 'A' }, { champ: 'locataires.0.tel', apres: '0700' }]),
    ];
    expect(reappliquerJournalBaux(baux, journal)).toBe(1);
    expect(baux.F101.notes).toBe('B');
    expect(baux.F101.locataires[0].tel).toBe('0700');
  });
  it('le document signé (snapshot, signatures) n\'est jamais touché', () => {
    const baux = { F101: signe() };
    reappliquerJournalBaux(baux, [entree('2026-09-28', [{ champ: 'hc', apres: 900 }])]);
    expect(baux.F101.hc).toBe(900);
    expect(baux.F101.signatures.bailSnapshot.hc).toBe(800);
  });
  it('idempotent : réappliquer deux fois donne le même bail', () => {
    const baux = { F101: signe() };
    const j = [entree('2026-09-28', [{ champ: 'notes', apres: 'X' }])];
    reappliquerJournalBaux(baux, j); const une = JSON.stringify(baux);
    reappliquerJournalBaux(baux, j);
    expect(JSON.stringify(baux)).toBe(une);
  });
  it('bail SUIVANT sur le même logement (autre signature) → les modifications de l\'ancien ne s\'appliquent pas', () => {
    const nouveau = signe({ notes: 'neuf', signatures: { signedAt: '2026-10-01T09:00:00Z', mode: 'avec-locataire' } });
    const baux = { F101: nouveau };
    expect(reappliquerJournalBaux(baux, [entree('2026-09-28', [{ champ: 'notes', apres: 'ancien' }])])).toBe(0);
    expect(baux.F101.notes).toBe('neuf');
  });
  it('entrée supprimée, autre type, bail non signé ou clé d\'espace désambiguïsée', () => {
    const baux = { F101: signe(), 'F101@@esp2': signe({ _espaceId: 'esp2' }), N1: { notes: '' } };
    const j = [
      entree('2026-09-28', [{ champ: 'notes', apres: 'supprimée' }], { _deleted: true }),
      entree('2026-09-28', [{ champ: 'notes', apres: 'avenant' }], { type: 'avenant' }),
      entree('2026-09-28', [{ champ: 'notes', apres: 'esp2' }], { _espaceId: 'esp2' }),
      entree('2026-09-28', [{ champ: 'notes', apres: 'n1' }], { ref: 'N1' }),
    ];
    reappliquerJournalBaux(baux, j);
    expect(baux.F101.notes).toBe('');                // l'entrée esp2 ne s'applique pas au bail de l'espace propre
    expect(baux['F101@@esp2'].notes).toBe('esp2');   // clé « ref@@espace » : ref nue + même espace
    expect(baux.N1.notes).toBe('');                  // bail non signé : jamais réappliqué
  });
  it('locataire disparu (index hors liste) → rien d\'inventé', () => {
    const baux = { F101: signe() };
    reappliquerJournalBaux(baux, [entree('2026-09-28', [{ champ: 'locataires.5.tel', apres: '07' }])]);
    expect(baux.F101.locataires.length).toBe(2);
  });
  it('journalDuBail filtre et trie', () => {
    const j = [entree('2026-09-28', []), entree('2026-09-01', []), entree('2026-09-15', [], { ref: 'AUTRE' })];
    expect(journalDuBail(j, 'F101', signe()).map(e => e.date)).toEqual(['2026-09-01', '2026-09-28']);
  });
});

describe('valeurLisible — carte de la timeline', () => {
  it('dates, booléens, vides, listes connues', () => {
    expect(valeurLisible('debut', '2025-09-15')).toBe('15/09/2025');
    expect(valeurLisible('zoneTendue', true)).toBe('Oui');
    expect(valeurLisible('notes', '')).toBe('(vide)');
    expect(valeurLisible('type', 'meuble')).toBe('Meublé');
    expect(valeurLisible('visale', { visaId: 'V123' })).toBe('V123');
    expect(valeurLisible('locataires.0.tel', '0612')).toBe('0612');
  });
});

describe('sécurité de la réapplication (audit 28/09) — le journal vient de données partagées', () => {
  const entree = (changements) => ({ id: 'x', ref: 'F101', type: 'modification', signedAt: '2025-01-02T10:00:00Z', date: '2026-09-28', changements });
  it('jamais le document signé, le bailleur, les signatures ni un champ inconnu', () => {
    const baux = { F101: signe({ entity: 'SCI A' }) };
    reappliquerJournalBaux(baux, [entree([
      { champ: 'signatures.bailSnapshot.hc', apres: 9999 },
      { champ: 'signatures.signedAt', apres: 'faux' },
      { champ: 'champInconnu', apres: 'x' },
      { champ: 'locataires.0.piege', apres: 'AUTRE' },
    ])]);
    expect(baux.F101.signatures.bailSnapshot.hc).toBe(800);
    expect(baux.F101.signatures.signedAt).toBe('2025-01-02T10:00:00Z');
    expect(baux.F101.champInconnu).toBeUndefined();
    expect(baux.F101.locataires[0].piege).toBeUndefined();
  });
  it('pas de pollution de prototype (__proto__, constructor, prototype)', () => {
    const baux = { F101: signe() };
    reappliquerJournalBaux(baux, [entree([
      { champ: '__proto__.pollue', apres: 'oui' }, { champ: 'constructor.prototype.pollue', apres: 'oui' },
      { champ: 'locataires.__proto__.pollue', apres: 'oui' } ])]);
    expect(({}).pollue).toBeUndefined();
    expect([].pollue).toBeUndefined();
  });
  it('champs suivis : toujours réappliqués ; copies de premier niveau du 1er locataire suivies', () => {
    const baux = { F101: signe({ ddn: '1980-01-01' }) };
    reappliquerJournalBaux(baux, [entree([{ champ: 'locataires.0.ddn', apres: '1981-02-02' }, { champ: 'notes', apres: 'ok' }])]);
    expect(baux.F101.locataires[0].ddn).toBe('1981-02-02');
    expect(baux.F101.ddn).toBe('1981-02-02');
    expect(baux.F101.notes).toBe('ok');
  });
});

describe('zéros en tête : un téléphone corrigé d\'un zéro est une modification', () => {
  it('texte comparé comme texte, montants comparés comme nombres', () => {
    expect(memeValeur('0612345678', '612345678', 'tel')).toBe(false);
    expect(memeValeur('850', 850, 'hc')).toBe(true);
    expect(memeValeur('0', '', 'notes')).toBe(false);
    expect(memeValeur(0, '', 'dernierLoyerPrec')).toBe(true);
    const prev = signe(), next = JSON.parse(JSON.stringify(prev));
    next.locataires[0].tel = '612345678';
    expect(diffModificationsBail(prev, next).map(c => c.champ)).toEqual(['locataires.0.tel']);
  });
});

describe('JAMAIS BLOQUER (28/09) — changements de partie enregistrés comme le reste', () => {
  const entree = (changements) => ({ id: 'x', ref: 'F101', type: 'modification', signedAt: '2025-01-02T10:00:00Z', date: '2026-09-28', changements });
  it('garants, bailleur, nom d\'un locataire : dans le diff et réappliqués', () => {
    const prev = signe({ garant: '', garant2: '', entity: 'SCI A' });
    const next = JSON.parse(JSON.stringify(prev));
    next.garant = 'Paul Martin'; next.garant2 = 'Jean Dubois'; next.locataires[0].nom = 'HARNIST Jean';
    const d = diffModificationsBail(prev, next).map(c => c.champ);
    expect(d).toEqual(expect.arrayContaining(['garant', 'garant2', 'locataires.0.nom']));
    const baux = { F101: signe() };
    reappliquerJournalBaux(baux, [entree([{ champ: 'garant', apres: 'Paul Martin' }, { champ: 'locataires.0.nom', apres: 'HARNIST Jean' }])]);
    expect(baux.F101.garant).toBe('Paul Martin');
    expect(baux.F101.locataires[0].nom).toBe('HARNIST Jean');
    expect(baux.F101.nom).toBe('HARNIST Jean');   // copie de premier niveau suivie
  });
  it('ajout / retrait d\'un locataire : la liste entière, nettoyée des clés inconnues', () => {
    const prev = signe(), next = JSON.parse(JSON.stringify(prev));
    next.locataires.push({ civilite: 'Mme', nom: 'DUBOIS', tel: '07', piege: '<script>' });
    const d = diffModificationsBail(prev, next);
    expect(d.map(c => c.champ)).toEqual(['locataires']);
    expect(d[0].apres[2]).toEqual({ civilite: 'Mme', nom: 'DUBOIS', tel: '07' });
    const baux = { F101: signe() };
    reappliquerJournalBaux(baux, [entree([{ champ: 'locataires', apres: [{ nom: 'A', __proto__: { x: 1 }, signatures: 'x' }, 'pas un objet', { nom: 'B' }] }])]);
    expect(baux.F101.locataires).toEqual([{ nom: 'A' }, { nom: 'B' }]);
    expect(baux.F101.nom).toBe('A');
    expect(({}).x).toBeUndefined();
  });
  it('document signé toujours intouchable ; signataires = liste de textes', () => {
    const baux = { F101: signe() };
    reappliquerJournalBaux(baux, [entree([{ champ: 'signatures.bailSnapshot.hc', apres: 1 }, { champ: 'signataires', apres: ['Didier', { x: 1 }, 'Marion'] }])]);
    expect(baux.F101.signatures.bailSnapshot.hc).toBe(800);
    expect(baux.F101.signataires).toEqual(['Didier', 'Marion']);
  });
});

describe('durcissements (relecture hotfix)', () => {
  const entree = (changements) => ({ id: 'x', ref: 'F101', type: 'modification', signedAt: '2025-01-02T10:00:00Z', date: '2026-09-28', changements });
  it('bailleur, garants, noms : toujours du texte', () => {
    const baux = { F101: signe({ entity: 'SCI A' }) };
    reappliquerJournalBaux(baux, [entree([{ champ: 'entity', apres: { toString: 'x' } }, { champ: 'garant', apres: ['a'] }, { champ: 'locataires.0.nom', apres: 42 }])]);
    expect(baux.F101.entity).toBe(''); expect(baux.F101.garant).toBe(''); expect(baux.F101.locataires[0].nom).toBe('');
  });
  it('liste vide = vide (pas d\'entrée parasite « Signataires : (vide) → (aucun) »)', () => {
    expect(diffModificationsBail(signe(), signe({ signataires: [] }))).toEqual([]);
  });
});

// ── Chantier clôture/relocation (option B2, 28/09) — journal AUTOMATIQUE de la vie d'un bail signé
//    verrouillé (départ, dépôt, IRL, pièces de signature posées après scellement).
import { diffAutoBail, entreeJournalAuto, memeBailSigne, cheminAutorise, CHAMPS_VIE, ARTEFACTS_SIGNATURE } from '../../js/core/bail-modifications.js';

describe('diffAutoBail — tout ce qui change sur un bail signé verrouillé, liste fermée', () => {
  it('révision IRL (hc) + départ + DG restitué + lien du PDF signé ; vie/pièces marquées `vie`', () => {
    const prev = signe();
    const next = JSON.parse(JSON.stringify(prev));
    next.hc = 812.4;
    next.depart = { dateSortie: '2026-06-30', etape: 3 };
    next.dgRestitueAt = '2026-07-15';
    next.signatures.cloudPdfKey = 'esp/ent/files/bp_F101.pdf';
    const d = diffAutoBail(prev, next);
    expect(d.map(c => c.champ)).toEqual(['hc', 'depart', 'dgRestitueAt', 'signatures.cloudPdfKey']);
    expect(d.find(c => c.champ === 'hc')).toMatchObject({ avant: 800, apres: 812.4, fin: true });
    expect(d.find(c => c.champ === 'depart')).toMatchObject({ vie: true, avant: null });
    expect(d.find(c => c.champ === 'signatures.cloudPdfKey')).toMatchObject({ vie: true, apres: 'esp/ent/files/bp_F101.pdf' });
  });
  it('champ du formulaire RETIRÉ → écrit à null (le formulaire, lui, ignore les absents)', () => {
    const prev = signe({ notes: 'Animaux acceptés' });
    const next = JSON.parse(JSON.stringify(prev)); delete next.notes;
    expect(diffAutoBail(prev, next)).toEqual([{ champ: 'notes', libelle: 'Notes / conditions particulières', avant: 'Animaux acceptés', apres: null }]);
  });
  it('document signé et champs hors liste : JAMAIS journalisés', () => {
    const prev = signe();
    const next = JSON.parse(JSON.stringify(prev));
    next.signatures.bailSnapshot = { hc: 1 }; next.signatures.signedAt = '2030-01-01'; next.signatures.locked = false
    next._snapshotBackfilled = true; next.champInconnu = 'x'
    expect(diffAutoBail(prev, next)).toEqual([]);
  });
  it('rien de changé → []', () => { expect(diffAutoBail(signe(), signe())).toEqual([]); });
});

describe('entreeJournalAuto — une entrée, jamais un doublon de « Modifier le bail »', () => {
  const opts = { date: '2026-09-29T08:00:00.000Z', id: 'bja_1' };
  it('entrée complète (ref nue, signature, bailUid, espace), source auto', () => {
    const reference = signe({ _espaceId: 'E1' });
    const bail = Object.assign(JSON.parse(JSON.stringify(reference)), { depart: { etape: 1 }, _bailUid: 'u7' });
    const e = entreeJournalAuto('F101@@E1', bail, reference, [], opts);
    expect(e).toMatchObject({ id: 'bja_1', ref: 'F101', signedAt: '2025-01-02T10:00:00Z', bailDebut: '2025-01-01', type: 'modification',
      source: 'auto', auteur: '', date: opts.date, bailUid: 'u7', _espaceId: 'E1' });
    expect(e.changements.map(c => c.champ)).toEqual(['depart']);
  });
  it('déjà journalisé par « Modifier le bail » (même valeur) → null', () => {
    const reference = signe();
    const bail = Object.assign(JSON.parse(JSON.stringify(reference)), { notes: 'Animaux acceptés' });
    const journal = [{ id: 'bj_1', ref: 'F101', type: 'modification', signedAt: '2025-01-02T10:00:00Z', date: '2026-09-28', changements: [{ champ: 'notes', apres: 'Animaux acceptés' }] }];
    expect(entreeJournalAuto('F101', bail, reference, journal, opts)).toBeNull();
  });
  it('autre bail (autre signature ou plus de signature) → null : c\'est un SUCCESSEUR, pas une modification', () => {
    const reference = signe();
    const draft = JSON.parse(JSON.stringify(reference)); delete draft.signatures;
    expect(entreeJournalAuto('F101', draft, reference, [], opts)).toBeNull();
    expect(memeBailSigne(reference, draft)).toBe(false);
    expect(memeBailSigne(reference, JSON.parse(JSON.stringify(reference)))).toBe(true);
  });
  it('PUR : ni la référence ni le journal ne sont modifiés', () => {
    const reference = signe(); const avant = JSON.stringify(reference)
    const journal = [{ id: 'bj_1', ref: 'F101', type: 'modification', signedAt: '2025-01-02T10:00:00Z', date: '2026-09-28', changements: [{ champ: 'notes', apres: 'X' }] }]
    const j0 = JSON.stringify(journal)
    entreeJournalAuto('F101', Object.assign(signe(), { hc: 900 }), reference, journal, opts)
    expect(JSON.stringify(reference)).toBe(avant); expect(JSON.stringify(journal)).toBe(j0)
  });
});

describe('réapplication de la vie du bail (au chargement)', () => {
  const entree = (changements) => ({ id: 'x', ref: 'F101', type: 'modification', signedAt: '2025-01-02T10:00:00Z', date: '2026-09-28', changements });
  it('champs de vie + pièces de signature réappliqués ; types des pièces contrôlés', () => {
    const baux = { F101: signe() };
    reappliquerJournalBaux(baux, [entree([
      { champ: 'depart', apres: { etape: 3 } }, { champ: 'signatures.cloudPdfKey', apres: 'k.pdf' },
      { champ: 'signatures.proof', apres: ['pas', 'un', 'objet'] }, { champ: 'signatures.contentHash', apres: { x: 1 } },
      { champ: 'signatures.certRef', apres: { cloudPdfKey: 'c.pdf' } },
    ])]);
    expect(baux.F101.depart).toEqual({ etape: 3 });
    expect(baux.F101.signatures.cloudPdfKey).toBe('k.pdf');
    expect(baux.F101.signatures.certRef).toEqual({ cloudPdfKey: 'c.pdf' });
    expect(baux.F101.signatures.proof).toBeUndefined();
    expect(baux.F101.signatures.contentHash).toBeUndefined();
    expect(baux.F101.signatures.locked).toBe(true);
  });
  it('valeur structurée COPIÉE (aucune référence partagée journal ↔ bail)', () => {
    const val = { etape: 1 }
    const baux = { F101: signe() };
    reappliquerJournalBaux(baux, [entree([{ champ: 'depart', apres: val }])]);
    val.etape = 99
    expect(baux.F101.depart.etape).toBe(1)
  });
  it('chemins autorisés : liste fermée de vie + pièces, jamais le reste de `signatures`', () => {
    for (const k of Object.keys(CHAMPS_VIE)) expect(cheminAutorise(k)).toBe(true);
    for (const k of ARTEFACTS_SIGNATURE) expect(cheminAutorise('signatures.' + k)).toBe(true);
    for (const c of ['signatures.signedAt', 'signatures.bailSnapshot', 'signatures.locked', 'signatures.cloudPdfKey.x', 'signatures', '_bailUid', '__proto__', 'constructor'])
      expect(cheminAutorise(c)).toBe(false);
  });
});
