// Tests — contrat type de location, rédaction issue du décret n° 2026-596 (js/core/contrat-type.js).
// Les chaînes attendues sont recopiées de Légifrance (annexes 1 et 2 du décret n° 2015-587,
// « Version en vigueur à partir du 01 octobre 2026 »). Un test rouge ici = texte officiel altéré.
import { describe, it, expect } from 'vitest';
import {
  VERSION_CLAUSES_ACTUELLE, normaliserVersionClauses, versionClausesBail, suitContratType2026,
  rappelDecence, SERVITUDE_RESIDENCE_PRINCIPALE, lignesZoneTendue, textePrecedentLocataire,
  texteDepensesEnergie, CLAUSE_RESOLUTOIRE_TEXTE, autresMotifsResolutoires,
  libelleAnnexeEtatDesLieux, STATUT_AUTORISATION_PREALABLE, LIBELLE_SURFACE, mentionsACompleter
} from '../../js/core/contrat-type.js';

describe('mentionsACompleter — avertissement au bailleur avant signature', () => {
  const blocs = [
    { type: 'h2', text: '1 — Désignation du logement' },
    { type: 'table', rows: [['Surface habitable', '45 m²'], ['Numéro fiscal', 'À compléter par avenant']] },
    { type: 'h2', text: '4 — Durée du bail' },
    { type: 'p-mixed', segments: [{ text: 'Le présent contrat est conclu pour une durée initiale de ' }, { text: '6 (six) ans' }, { text: ' et prendra fin le ' }, { text: '[JJ/MM/AAAA]' }, { text: '.' }] },
    { type: 'h2', text: '5 — Loyer' },
    { type: 'p', text: lignesZoneTendue({ zoneTendue: true, encadrement: true }).join(' ') },
    { type: 'p', text: textePrecedentLocataire({ moinsDe18: true, montant: '650 €' }) },
    { type: 'h2', text: '12 — Clause résolutoire' },
    { type: 'p', text: 'Rien à compléter ici.' }
  ];
  it('une entrée par manque, rattachée à sa section, avec son libellé', () => {
    const m = mentionsACompleter(blocs);
    expect(m).toEqual([
      { section: '1 — Désignation du logement', mention: 'Numéro fiscal' },
      { section: '4 — Durée du bail', mention: '…est conclu pour une durée initiale de 6 (six) ans et prendra fin le' },
      { section: '5 — Loyer', mention: 'Montant du loyer de référence' },
      { section: '5 — Loyer', mention: 'Montant du loyer de référence majoré' },
      { section: '5 — Loyer', mention: 'date de versement' },
      { section: '5 — Loyer', mention: 'date de la dernière révision du loyer' }
    ]);
  });
  it('bail complet → aucune mention ; entrée vide → []', () => {
    expect(mentionsACompleter([{ type: 'h2', text: '1' }, { type: 'p', text: 'Tout est rempli.' }])).toEqual([]);
    expect(mentionsACompleter(null)).toEqual([]);
  });
});

describe('version des clauses — un bail signé n\'est jamais réécrit', () => {
  it('brouillon → version courante (5)', () => {
    expect(VERSION_CLAUSES_ACTUELLE).toBe(5);
    expect(versionClausesBail({})).toBe(5);
    expect(versionClausesBail(null)).toBe(5);
    expect(suitContratType2026({})).toBe(true);
  });
  it('signé : la version posée à la signature ; absente = texte d\'origine', () => {
    const signe = v => ({ clauseIrlV: v, signatures: { signedAt: '2026-09-01T10:00:00Z' } });
    expect(versionClausesBail(signe(undefined))).toBe(1);
    expect(versionClausesBail(signe(1))).toBe(1);
    expect(versionClausesBail(signe(2))).toBe(2);
    expect(versionClausesBail(signe(3))).toBe(3);
    expect(versionClausesBail(signe(4))).toBe(4);
    expect(versionClausesBail(signe(5))).toBe(5);
    expect(suitContratType2026(signe(4))).toBe(true);
    expect(suitContratType2026(signe(2))).toBe(false);
  });
  it('signature à distance en cours : la version envoyée ; terminée/expirée → brouillon', () => {
    const rs = (status, v) => ({ signatures: { remoteSession: { status, clauseIrlV: v } } });
    expect(versionClausesBail(rs('pending', 2))).toBe(2);
    expect(versionClausesBail(rs('pending', undefined))).toBe(1);
    expect(versionClausesBail(rs('pending', 3))).toBe(3);
    expect(versionClausesBail(rs('pending', 4))).toBe(4);
    expect(versionClausesBail(rs('pending', 5))).toBe(5);
    expect(versionClausesBail(rs('expired', 2))).toBe(5);
    expect(versionClausesBail(rs('completed', 1))).toBe(5);
  });
  it('valeur inconnue → 1 (jamais une version inventée)', () => {
    expect(normaliserVersionClauses('x')).toBe(1);
    expect(normaliserVersionClauses(6)).toBe(1);
    expect(normaliserVersionClauses(5)).toBe(5);
    expect(normaliserVersionClauses(4)).toBe(4);
    expect(normaliserVersionClauses('3')).toBe(3);
  });
});

describe('textes verbatim du modèle', () => {
  it('surface : « surface habitable » (pas « loi Carrez »)', () => {
    expect(LIBELLE_SURFACE).toBe('Surface habitable');
  });
  it('rappel de décence — nu : « du logement » au a) ; meublé : absent au a), présent au b)', () => {
    const nu = rappelDecence(false), mb = rappelDecence(true);
    expect(nu).toHaveLength(9);
    expect(nu[2]).toBe('i) A compter du 1er janvier 2025, le niveau de performance minimal du logement correspond à la classe F du DPE ;');
    expect(mb[2]).toBe('i) A compter du 1er janvier 2025, le niveau de performance minimal correspond à la classe F du DPE ;');
    expect(mb[5]).toBe('b) En Guadeloupe, en Martinique, en Guyane, à La Réunion et à Mayotte :');
    expect(mb[7]).toBe('ii) A compter du 1er janvier 2031, le niveau de performance minimal du logement correspond à la classe E du DPE.');
    expect(nu[8]).toContain('article L. 126-26 du code de la construction et de l\'habitation');
  });
  it('servitude de résidence principale (II.B)', () => {
    expect(SERVITUDE_RESIDENCE_PRINCIPALE).toBe('Servitude de résidence principale : le logement objet du présent contrat est soumis à l\'obligation prévue à l\'article L. 151-14-1 du code de l\'urbanisme ; il est à usage exclusif de résidence principale, au sens de l\'article 2 de la loi du 6 juillet 1989 susmentionnée.');
  });
  it('clause résolutoire imposée (VIII)', () => {
    expect(CLAUSE_RESOLUTOIRE_TEXTE).toBe('Le contrat de location est résilié de plein droit pour défaut de paiement du loyer ou des charges aux termes convenus ou pour non versement du dépôt de garantie. La clause de résiliation de plein droit ne produit effet que six semaines après la date d\'un commandement de payer demeuré infructueux.');
  });
  it('autres motifs : assurance + troubles ; + servitude seulement si le logement y est soumis', () => {
    expect(autresMotifsResolutoires(false)).toHaveLength(2);
    const avec = autresMotifsResolutoires(true);
    expect(avec).toHaveLength(3);
    // Fragments VERBATIM de la consigne du VIII (Légifrance, version au 01/10/2026) :
    expect(avec[0]).toContain('ne produit effet qu\'un mois après commandement demeuré infructueux');
    expect(avec[1]).toContain('Non-respect de l\'obligation d\'user paisiblement des locaux loués, résultant de troubles de voisinage constatés par une décision de justice passée en force de chose jugée');
    expect(avec[2]).toContain('soumis à l\'obligation prévue à l\'article L. 151-14-1 du code de l\'urbanisme');
    expect(avec[2]).toContain('non-respect de l\'obligation de l\'occuper exclusivement à titre de résidence principale. Dans ce dernier cas, la clause ne peut produire effet qu\'à l\'expiration d\'un délai de mise en demeure fixé par le maire conformément au II de l\'article L. 481-4 du code de l\'urbanisme.');
  });
  it('dépenses énergétiques : texte du modèle + année des prix ; vide → renvoi au DPE, rien d\'inventé', () => {
    const t = texteDepensesEnergie('entre 900 € et 1 200 € par an', '2023');
    expect(t.startsWith('Montant estimé des dépenses annuelles d\'énergie pour un usage standard de l\'ensemble des usages énumérés dans le diagnostic de performance énergétique (chauffage, refroidissement')).toBe(true);
    expect(t).toContain(': entre 900 € et 1 200 € par an (estimation réalisée à partir des prix énergétiques de référence de l\'année : 2023).');
    const vide = texteDepensesEnergie('', '');
    expect(vide).not.toMatch(/\d{4}\)/);
    expect(vide).toContain('voir le diagnostic de performance énergétique annexé (estimation');
  });
});

describe('zone tendue — lignes [Oui / Non]', () => {
  it('hors zone tendue : rien (le modèle dit « le cas échéant »)', () => {
    expect(lignesZoneTendue({ zoneTendue: false })).toEqual([]);
  });
  it('zone tendue sans encadrement : décret Oui, loyer de référence majoré Non, pas de montants', () => {
    const l = lignesZoneTendue({ zoneTendue: true, encadrement: false });
    expect(l).toHaveLength(2);
    expect(l[0]).toMatch(/relocation : Oui\.$/);
    expect(l[1]).toMatch(/arrêté préfectoral : Non\.$/);
  });
  it('encadrement : les deux montants ; absent → « à compléter », jamais 0', () => {
    const l = lignesZoneTendue({ zoneTendue: true, encadrement: true, loyerRef: 25.3, loyerRefMajore: '30,36', fmt: n => n.toFixed(2).replace('.', ',') });
    expect(l[1]).toMatch(/: Oui\.$/);
    expect(l[2]).toBe('Montant du loyer de référence : 25,30 €/m2 / Montant du loyer de référence majoré : 30,36 €/m2.');
    const vide = lignesZoneTendue({ zoneTendue: true, encadrement: true, loyerRef: 0 });
    expect(vide[2]).toBe('Montant du loyer de référence : [à compléter] €/m2 / Montant du loyer de référence majoré : [à compléter] €/m2.');
  });
});

describe('précédent locataire — montant, date de versement, date de la dernière révision', () => {
  it('moins de 18 mois : les trois informations (note 9 annexe 1 pour le nu, note 31 annexe 2 pour le meublé)', () => {
    const t = textePrecedentLocataire({ moinsDe18: true, montant: '650 € HC', dateVersement: '2026-03-05', dateRevision: '2025-01-01', fmtDate: s => s.split('-').reverse().join('/') });
    expect(t).toContain('Montant du dernier loyer acquitté par le précédent locataire : 650 € HC ; date de versement : 05/03/2026 ; date de la dernière révision du loyer : 01/01/2025.');
    expect(t).toContain('note 9 annexe 1');
    expect(textePrecedentLocataire({ moinsDe18: true, meuble: true })).toContain('note 31 annexe 2');
  });
  it('champs manquants → « à compléter » ; plus de 18 mois → mention non obligatoire', () => {
    expect(textePrecedentLocataire({ moinsDe18: true })).toContain(': [à compléter] ; date de versement : [à compléter]');
    expect(textePrecedentLocataire({ moinsDe18: false })).toContain('mention non obligatoire');
  });
});

describe('annexes (XI)', () => {
  it('meublé : état des lieux + inventaire + état détaillé du mobilier ; autorisation préalable « le cas échéant »', () => {
    expect(libelleAnnexeEtatDesLieux(true)).toBe('État des lieux, inventaire et état détaillé du mobilier');
    expect(libelleAnnexeEtatDesLieux(false)).toBe('État des lieux d\'entrée');
    expect(STATUT_AUTORISATION_PREALABLE).toBe('Le cas échéant');
  });
});
