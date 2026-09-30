/**
 * Tests du moteur d'annonces CONFORMES — chantier ANNONCES (CDC 29/09/2026 + maquette v2 : texte
 * unique, format B sans emojis, dossier court).
 *
 * Garde-fous :
 *  - VERBATIM : chaque libellé imposé est comparé à la chaîne relue sur Légifrance (AUDIT.md partie 2).
 *  - ANTI-INVENTION : jamais d'équipement, d'adjectif, ni de « copropriété construite entre… ».
 *  - D1 : loyer = loyer souhaité (loyerHcRef/chargesRef/dgRef), jamais l'ancien bail.
 *  - D3 : manque = emplacement « [À COMPLÉTER : …] » dans le texte, jamais d'exception.
 *  - Texte unique : contrôle en direct, « Remettre », mise à jour après passage par la fiche.
 */
import { describe, it, expect } from 'vitest';
import {
  TXT_GEORISQUES, TXT_DEPENSES, TXT_EXCESSIF, TXT_HCL, RUBRIQUES, DOSSIER_PIECES, TXT_DOSSIERFACILE,
  MANQUE, nombre, montant, etageLabel, commune, communeLabel, dateFr, natureBien, estMeuble, estHorsHabitation,
  depensesTexte, pointsForts, genererTitre, genererAccroche, genererMentions, genererDossier, genererAnnonce,
  controlerTexte, remettreMention, majMentions,
} from './annonce-generator.js';

function d103(o = {}) {
  return Object.assign({
    ref: 'D-103', type: 'T2', surf: 50, etage: '2e', typeUsage: 'habitation-nu',
    loyerHcRef: 700, chargesRef: 100, dgRef: 700, chargesModalite: 'provision',
    hc: 999, ch: 999, dg: 999,   // anciennes valeurs (ex-bail) : ne doivent JAMAIS apparaître
    equipements: { cuisine: { equipee: true, four: true, plaques: true, frigo: true }, sanitaires: { douche: true, wc_separe: true }, technologies: { fibre: true } },
    exterieurs: { balcon: { present: true, surface: 4 } },
    annexes: { cave: { present: true } },
    locationInfo: { disponibilite: '2026-11-01', garanties_acceptees: ['visale', 'caution_solidaire'] },
  }, o);
}
const IMM = { ville: 'Strasbourg', codePostal: '67000', regimeJuridique: 'Copropriété', typeHabitat: 'Immeuble collectif', equipementsCommuns: { ascenseur: true }, periodeConstr: 'De 1949 à 1997' };
const DPE_D = { classe: 'D', ges: 'D', depensesEnergie: 'entre 890 € et 1 240 € par an', anneePrix: '2021, 2022, 2023' };

function gen(o = {}) {
  return genererAnnonce(Object.assign({
    log: d103(), imm: IMM, dpe: DPE_D, composition: 'Séjour, Cuisine, 1 chambre, Salle d\'eau, WC',
    mandataire: false, includeDossier: true, aujourdhui: '2026-09-29'
  }, o));
}
const ligne = (r, key) => (r.mentions.find(m => m.key === key) || {}).texte;
const ctl = (r, key) => r.controle.find(c => c.key === key);

// ═══════════════════════════════════════════════════════════════
describe('libellés imposés — verbatim Légifrance', () => {
  it('Géorisques = C. env. R125-25', () => {
    expect(TXT_GEORISQUES).toBe('Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr');
  });
  it('dépenses d\'énergie = R126-23', () => {
    expect(TXT_DEPENSES).toBe('Montant estimé des dépenses annuelles d\'énergie pour un usage standard : ');
  });
  it('consommation excessive = R126-24 + arrêté du 22/12/2021', () => {
    expect(TXT_EXCESSIF).toBe('Logement à consommation énergétique excessive : ');
    expect(ligne(gen({ dpe: Object.assign({}, DPE_D, { classe: 'F' }) }), 'excessif')).toBe('Logement à consommation énergétique excessive : classe F.');
    expect(ligne(gen({ dpe: Object.assign({}, DPE_D, { classe: 'G' }) }), 'excessif')).toBe('Logement à consommation énergétique excessive : classe G.');
  });
  it('« honoraires charge locataire » (arr. 10/01/2017 4-I-6°)', () => { expect(TXT_HCL).toBe('honoraires charge locataire'); });
  it('« classe énergie » / « classe climat » (R126-21)', () => { expect(ligne(gen(), 'dpe')).toBe('Classe énergie : D · Classe climat : D'); });
  it('« par mois » + « charges comprises » (arr. 21/04/2022 1°)', () => { expect(ligne(gen(), 'loyer')).toBe('Loyer : 800 € par mois charges comprises'); });
});

// ═══════════════════════════════════════════════════════════════
describe('D-103 — texte unique au format B (maquette v2 §1)', () => {
  const r = gen();
  it('titre', () => { expect(r.titre).toBe('Appartement T2 50 m² avec balcon — Strasbourg'); });
  it('texte complet, sans emoji, dans l\'ordre validé', () => {
    expect(r.texte).toBe([
      'À louer à Strasbourg : appartement T2 de 50 m² avec balcon, au 2e étage avec ascenseur. Disponible le 1er novembre 2026.',
      '',
      'LE LOGEMENT',
      'Séjour, cuisine, 1 chambre, salle d\'eau, WC.',
      '',
      'POINTS FORTS',
      '- Balcon de 4 m²',
      '- Cuisine équipée : four, plaques de cuisson, réfrigérateur',
      '- Douche et WC séparé',
      '- Cave',
      '- Fibre optique',
      '',
      'DOSSIER À PRÉPARER',
      '- Pièce d\'identité',
      '- Justificatif de domicile',
      '- Contrat de travail (ou justificatif d\'activité)',
      '- 3 dernières fiches de paie',
      '- Dernier avis d\'imposition',
      '- Pour un garant : les mêmes pièces',
      'Garanties acceptées : Visale ou caution solidaire.',
      'Le dossier peut être constitué sur DossierFacile, service public gratuit.',
      '',
      'INFORMATIONS',
      'Loyer : 800 € par mois charges comprises',
      'Charges : 100 € par mois — provision avec régularisation annuelle',
      'Dépôt de garantie : 700 €',
      'Surface habitable : 50 m²',
      'Commune : Strasbourg',
      'Classe énergie : D · Classe climat : D',
      'Montant estimé des dépenses annuelles d\'énergie pour un usage standard : entre 890 € et 1 240 € par an. Prix moyens des énergies indexés sur les années 2021, 2022, 2023.',
      TXT_GEORISQUES
    ].join('\n'));
  });
  it('aucun emoji, aucune mention de copropriété ni de période de construction', () => {
    expect(r.texte).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(r.texte).not.toMatch(/copropriété|construit|1949|1997/i);
  });
  it('tout est présent', () => {
    expect(r.manquantes).toBe(0); expect(r.retirees).toBe(0); expect(r.emplacements).toBe(0);
  });
  it('D1 : aucune trace des anciennes valeurs (999)', () => { expect(r.texte).not.toContain('999'); });
  it('dossier : uniquement des pièces de la liste autorisée, sans RIB ni « moins de 3 mois »', () => {
    expect(DOSSIER_PIECES).toHaveLength(6);
    expect(r.texte).not.toMatch(/RIB|relevé|moins de 3 mois|< ?3 mois/i);
  });
  it('seule adresse web : celle que la loi impose (Géorisques)', () => {
    expect(r.texte.match(/www\.|https?:/g)).toEqual(['www.']);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('anti-invention', () => {
  const vide = { ref: 'V-1', type: 'T2', surf: 50, typeUsage: 'habitation-nu', loyerHcRef: 700, chargesRef: 100, dgRef: 700, chargesModalite: 'provision',
    equipements: { cuisine: {}, sanitaires: {}, technologies: {} }, exterieurs: { balcon: {} }, annexes: { cave: {}, customs: [] },
    presentation: { exposition: 'sud', vue: 'mer-montagne' }, quartier: { reperes: ['Cathédrale'] }, locationInfo: {} };
  const r = gen({ log: vide, composition: '' });
  it('ni LE LOGEMENT ni POINTS FORTS sans donnée ; rien de presentation/quartier', () => {
    expect(r.texte).not.toContain(RUBRIQUES.logement);
    expect(r.texte).not.toContain(RUBRIQUES.points);
    expect(r.texte).not.toMatch(/cuisine|douche|balcon|cave|fibre|sud|mer|Cathédrale/i);
    expect(r.texte.split('\n')[0]).toBe('À louer à Strasbourg : appartement T2 de 50 m², au 2e étage avec ascenseur.'.replace(', au 2e étage avec ascenseur', ''));
  });
  it('jamais « undefined », « null », « NaN », « 0 chambre »', () => {
    [gen({ log: {}, imm: {}, dpe: {} }), r, gen({ log: { typeUsage: 'garage' }, imm: {}, dpe: {} })].forEach(x => {
      expect(x.titre + x.texte).not.toMatch(/undefined|null|NaN|0 chambre/);
    });
  });
  it('arguments absents : pas d\'exception', () => {
    expect(() => genererAnnonce()).not.toThrow();
    expect(() => genererAnnonce({ log: null, imm: null, dpe: null })).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
describe('D3 — manques : emplacements « [À COMPLÉTER : …] » dans le texte (maquette v2 §2)', () => {
  it('DPE vide : classes + dépenses marquées, contrôle ko → fiche DPE', () => {
    const r = gen({ dpe: {} });
    expect(ligne(r, 'dpe')).toBe('Classe énergie : [À COMPLÉTER : classe énergie du DPE] · Classe climat : [À COMPLÉTER : classe climat du DPE]');
    expect(ligne(r, 'depenses')).toBe(TXT_DEPENSES + '[À COMPLÉTER : montant et années de référence des prix indiqués sur le DPE]');
    expect(ctl(r, 'dpe').etat).toBe('ko'); expect(ctl(r, 'dpe').cible).toBe('dpe');
    expect(r.manquantes).toBe(2); expect(r.emplacements).toBe(3);
  });
  it('une seule classe saisie : l\'autre marquée', () => {
    expect(ligne(gen({ dpe: Object.assign({}, DPE_D, { ges: '' }) }), 'dpe')).toBe('Classe énergie : D · Classe climat : [À COMPLÉTER : classe climat du DPE]');
  });
  it('mode de règlement des charges absent', () => {
    const r = gen({ log: d103({ chargesModalite: '' }) });
    expect(ligne(r, 'charges')).toBe('Charges : 100 € par mois — [À COMPLÉTER : mode de règlement des charges]');
    expect(ctl(r, 'charges').cible).toBe('identite');
  });
  it('années des prix absentes', () => {
    expect(ligne(gen({ dpe: { classe: 'D', ges: 'D', depensesEnergie: 'entre 1 € et 2 € par an' } }), 'depenses'))
      .toBe(TXT_DEPENSES + 'entre 1 € et 2 € par an. [À COMPLÉTER : années de référence des prix indiquées sur le DPE]');
  });
  it('charges vides : le loyer charges comprises n\'est pas complet (audit mineur 6)', () => {
    const r = gen({ log: d103({ chargesRef: '' }) });
    expect(ligne(r, 'loyer')).toBe('Loyer : [À COMPLÉTER : loyer charges comprises]');
    expect(ctl(r, 'loyer').etat).toBe('ko');
  });
  it('loyer souhaité absent : jamais repris de log.hc', () => {
    const r = gen({ log: d103({ loyerHcRef: '', chargesRef: '' }) });
    expect(ligne(r, 'loyer')).toBe('Loyer : [À COMPLÉTER : loyer]');
    expect(r.texte).not.toContain('999');
  });
  it('charges à 0 = « aucune », pas un manque', () => {
    const r = gen({ log: d103({ chargesRef: 0, chargesModalite: '' }) });
    expect(ligne(r, 'loyer')).toBe('Loyer : 700 € par mois');
    expect(ligne(r, 'charges')).toBe('Charges : aucune');
  });
  it('forfait', () => { expect(ligne(gen({ log: d103({ chargesModalite: 'forfait' }) }), 'charges')).toBe('Charges : 100 € par mois — forfait'); });
});

// ═══════════════════════════════════════════════════════════════
describe('contrôle en direct, « Remettre », mise à jour après passage par la fiche', () => {
  it('mention supprimée à la main → « retire » (maquette v2 §3)', () => {
    const r = gen();
    const retouche = r.texte.replace('Dépôt de garantie : 700 €\n', '').replace('\n' + TXT_GEORISQUES, '');
    const c = controlerTexte(retouche, r);
    expect(c.retirees).toBe(2);
    expect(c.controle.find(x => x.key === 'dg').etat).toBe('retire');
    expect(c.controle.find(x => x.key === 'georisques').detail).toBe('retirée du texte');
  });
  it('retouche libre autour des mentions : rien n\'est signalé', () => {
    const r = gen();
    const retouche = r.texte.replace('À louer à Strasbourg', 'Joli T2 à louer à Strasbourg').replace('POINTS FORTS', 'LES PLUS');
    const c = controlerTexte(retouche, r);
    expect(c.retirees + c.modifiees + c.manquantes).toBe(0);
  });
  it('valeur changée à la main → « modifie » (pas « retirée »), « Rétablir » REMPLACE la ligne', () => {
    const r = gen();
    const retouche = r.texte.replace('Dépôt de garantie : 700 €', 'Dépôt de garantie : 900 €');
    const c = controlerTexte(retouche, r);
    expect(c.controle.find(x => x.key === 'dg').etat).toBe('modifie');
    expect(c.controle.find(x => x.key === 'dg').detail).toContain('diffère de la fiche');
    const remis = remettreMention(retouche, r, 'dg');
    expect(remis).toBe(r.texte);
    expect(remis.match(/Dépôt de garantie/g)).toHaveLength(1);
  });
  it('emplacement complété à la main dans le texte → « modifie », jamais doublé', () => {
    const r = gen({ dpe: {} });
    const saisi = r.texte.replace(/Classe énergie : .*$/m, 'Classe énergie : C · Classe climat : C');
    const c = controlerTexte(saisi, r);
    expect(c.controle.find(x => x.key === 'dpe').etat).toBe('modifie');
    expect(remettreMention(saisi, r, 'dpe').match(/^Classe énergie/gm)).toHaveLength(1);
  });
  it('sous-chaîne : « 1 700 € TTC honoraires… » ne vaut pas « 700 € TTC honoraires… » (contre-audit 4)', () => {
    const r = gen({ mandataire: true, log: d103({ honorairesHclRef: 700 }) });
    const retouche = r.texte.replace('700 € TTC honoraires charge locataire', '1 700 € TTC honoraires charge locataire');
    expect(controlerTexte(retouche, r).controle.find(x => x.key === 'hcl').etat).toBe('modifie');
  });
  it('« Remettre » sans aucune autre mention : sous INFORMATIONS, sinon ajoute la rubrique', () => {
    const r = gen();
    expect(remettreMention('INFORMATIONS\nautre', r, 'loyer')).toBe('INFORMATIONS\nLoyer : 800 € par mois charges comprises\nautre');
    expect(remettreMention('Mon texte', r, 'georisques')).toBe('Mon texte\n\nINFORMATIONS\n' + TXT_GEORISQUES);
  });
  it('« Remettre » insère sous INFORMATIONS même si une mention a été recopiée dans l\'accroche (contre-audit 5)', () => {
    const r = gen();
    const t = 'Surface habitable : 50 m²\n' + r.texte.replace('Dépôt de garantie : 700 €\n', '');
    const remis = remettreMention(t, r, 'dg');
    expect(remis.split('\n')[0]).toBe('Surface habitable : 50 m²');
    expect(remis.split('\n')[1]).not.toBe('Dépôt de garantie : 700 €');
    expect(remis).toContain('Charges : 100 € par mois — provision avec régularisation annuelle\nDépôt de garantie : 700 €');
  });
  it('après saisie du DPE : emplacements remplacés, retouches gardées', () => {
    const avant = gen({ dpe: {} });
    const retouche = avant.texte.replace('POINTS FORTS', 'LES PLUS');
    const apres = gen({ dpe: Object.assign({}, DPE_D, { classe: 'F' }) });
    const { texte: t, aRelire } = majMentions(retouche, avant, apres);
    expect(t).toContain('LES PLUS');
    expect(t).toContain('Classe énergie : F · Classe climat : D');
    expect(t).toContain('Logement à consommation énergétique excessive : classe F.');
    expect(t).not.toContain('À COMPLÉTER');
    expect(aRelire).toEqual([]);
    const c = controlerTexte(t, apres); expect(c.retirees + c.modifiees).toBe(0);
  });
  it('classe F corrigée en D : la mention F périmée disparaît (ligne entière)', () => {
    const f = gen({ dpe: Object.assign({}, DPE_D, { classe: 'F' }) });
    expect(majMentions(f.texte, f, gen()).texte).toBe(gen().texte);
  });
  it('mention disparue : seule la LIGNE identique est retirée, jamais une phrase de l\'utilisateur (contre-audit 3)', () => {
    const m = gen({ log: d103({ typeUsage: 'habitation-meuble' }) });
    const retouche = m.texte.replace(/^À louer.*$/m, 'Location meublée idéale pour étudiant.');
    const { texte: t } = majMentions(retouche, m, gen());
    expect(t).toContain('Location meublée idéale pour étudiant.');
    expect(t.split('\n').filter(l => l === 'Location meublée')).toHaveLength(0);
  });
  it('surface changée : accroche non retouchée → mise à jour ; accroche retouchée → « à relire »', () => {
    const a = gen(); const b = gen({ log: d103({ surf: 55 }) });
    const r1 = majMentions(a.texte, a, b);
    expect(r1.texte.split('\n')[0]).toContain('de 55 m²');
    expect(r1.aRelire).toEqual([]);
    const r2 = majMentions(a.texte.replace('À louer', 'Superbe T2 à louer'), a, b);
    expect(r2.texte.split('\n')[0]).toContain('de 50 m²');
    expect(r2.aRelire).toEqual(['accroche']);
    expect(r2.texte).toContain('Surface habitable : 55 m²');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('meublé Lyon 3e, classe F', () => {
  const lyon = { ville: 'Lyon', codePostal: '69003', typeHabitat: 'Immeuble collectif', equipementsCommuns: {} };
  const r = gen({ log: d103({ surf: 42, etage: '4', typeUsage: 'habitation-meuble', loyerHcRef: 850, chargesRef: 90, dgRef: 1580, exterieurs: {}, annexes: {} }), imm: lyon,
    dpe: { classe: 'F', ges: 'E', depensesEnergie: 'entre 1 510 € et 2 080 € par an', anneePrix: '2021, 2022, 2023' } });
  it('titre, accroche, mentions', () => {
    expect(r.titre).toBe('Appartement T2 42 m² meublé — Lyon 3e arrondissement');
    expect(r.texte.split('\n')[0]).toBe('À louer à Lyon 3e arrondissement : appartement T2 de 42 m² meublé, au 4e étage. Disponible le 1er novembre 2026.');
    expect(ligne(r, 'meuble')).toBe('Location meublée');
    expect(ligne(r, 'excessif')).toBe('Logement à consommation énergétique excessive : classe F.');
    expect(ctl(r, 'dg').etat).toBe('ok');
  });
  it('D5 : aucune mention d\'encadrement', () => { expect(r.texte).not.toMatch(/encadrement|loyer de référence|complément de loyer/i); });
});

// ═══════════════════════════════════════════════════════════════
describe('commune et arrondissement (audit important 1)', () => {
  it('Paris 16e : 75016 ET 75116', () => {
    expect(communeLabel({ ville: 'Paris', codePostal: '75016' })).toBe('Paris 16e arrondissement');
    expect(communeLabel({ ville: 'Paris', codePostal: '75116' })).toBe('Paris 16e arrondissement');
  });
  it('arrondissements', () => {
    expect(communeLabel({ ville: 'Paris', codePostal: '75001' })).toBe('Paris 1er arrondissement');
    expect(communeLabel({ ville: 'Marseille', codePostal: '13008' })).toBe('Marseille 8e arrondissement');
    expect(communeLabel({ ville: 'Lyon', codePostal: '69003' })).toBe('Lyon 3e arrondissement');
    expect(communeLabel({ ville: 'Strasbourg', codePostal: '67000' })).toBe('Strasbourg');
    expect(communeLabel({ ville: 'Villeurbanne', codePostal: '69100' })).toBe('Villeurbanne');
  });
  it('Paris / Lyon / Marseille sans code exploitable : arrondissement marqué, contrôle ko', () => {
    expect(commune({ ville: 'Paris', codePostal: '' })).toEqual({ texte: 'Paris ' + MANQUE('arrondissement'), manque: true });
    expect(commune({ ville: 'Lyon', codePostal: '69100' }).manque).toBe(true);
    const r = gen({ imm: { ville: 'Paris', codePostal: '75999' } });
    expect(ligne(r, 'commune')).toBe('Commune : Paris [À COMPLÉTER : arrondissement]');
    expect(ctl(r, 'commune').etat).toBe('ko');
    expect(r.titre).toBe('Appartement T2 50 m² avec balcon — Paris');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('dépenses : même règle que le bail (audit important 2)', () => {
  it('nombre seul → « € par an »', () => { expect(depensesTexte('1250')).toBe('1250 € par an'); });
  it('« 900 à 1200 » → fourchette', () => { expect(depensesTexte('900 à 1200')).toBe('entre 900 € et 1200 € par an'); });
  it('valeur avec € conservée, suffixe du bail retiré', () => {
    expect(depensesTexte('1234 €')).toBe('1234 €');
    expect(depensesTexte('entre 1 € et 2 € par an (fourchette DPE)')).toBe('entre 1 € et 2 € par an');
  });
  it('dans l\'annonce', () => {
    expect(ligne(gen({ dpe: { classe: 'D', ges: 'D', depensesEnergie: '1250', anneePrix: '2023' } }), 'depenses'))
      .toBe(TXT_DEPENSES + '1250 € par an. Année de référence des prix de l\'énergie : 2023.');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('dépôt de garantie (avertissement, jamais bloquant)', () => {
  it('nu > 1 mois (art. 22)', () => { const c = ctl(gen({ log: d103({ dgRef: 1400 }) }), 'dg'); expect(c.etat).toBe('warn'); expect(c.detail).toContain('art. 22'); });
  it('meublé > 2 mois (art. 25-6)', () => { expect(ctl(gen({ log: d103({ typeUsage: 'habitation-meuble', dgRef: 1500 }) }), 'dg').detail).toContain('25-6'); });
  it('bail mobilité (art. 25-17)', () => { expect(ctl(gen({ log: d103({ typeUsage: 'mobilite', dgRef: 300 }) }), 'dg').detail).toContain('25-17'); });
  it('0 = « aucun »', () => { expect(ligne(gen({ log: d103({ dgRef: 0 }) }), 'dg')).toBe('Dépôt de garantie : aucun'); });
});

// ═══════════════════════════════════════════════════════════════
describe('honoraires (D8)', () => {
  it('particulier sans honoraires : aucune ligne', () => { expect(gen().texte).not.toMatch(/honoraires/i); });
  it('état des lieux', () => { expect(ligne(gen({ log: d103({ honorairesEdlRef: 150 }) }), 'honorairesEdl')).toBe('Honoraires d\'état des lieux à la charge du locataire : 150 € TTC'); });
  it('mandataire sans montant', () => {
    const r = gen({ mandataire: true });
    expect(ligne(r, 'hcl')).toBe('[À COMPLÉTER : montant TTC] honoraires charge locataire');
    expect(ctl(r, 'hcl').etat).toBe('ko');
  });
  it('mandataire avec montant', () => { expect(ligne(gen({ mandataire: true, log: d103({ honorairesHclRef: 605 }) }), 'hcl')).toBe('605 € TTC honoraires charge locataire'); });
});

// ═══════════════════════════════════════════════════════════════
describe('hors habitation (P-1)', () => {
  const box = { ref: 'G-12', type: 'Box', surf: 14, etage: '-1', numApt: '12', typeUsage: 'garage', loyerHcRef: 95, chargesRef: '', dgRef: 95, locationInfo: { disponibilite: '2026-11-01', garanties_acceptees: ['visale'] } };
  const r = gen({ log: box, dpe: {} });
  it('texte : accroche + INFORMATIONS, rien de la loi 89 ni du dossier', () => {
    expect(r.mode).toBe('hors-habitation');
    expect(r.titre).toBe('Box 14 m² — Strasbourg');
    expect(r.texte).toBe([
      'À louer à Strasbourg : box de 14 m² au niveau -1, n° 12. Disponible le 1er novembre 2026.',
      '', 'INFORMATIONS', 'Loyer : 95 € par mois', 'Dépôt de garantie : 95 €', 'Surface : 14 m²', 'Commune : Strasbourg', TXT_GEORISQUES
    ].join('\n'));
  });
  it('garage : DPE non concerné ; avec classes saisies : affichées', () => {
    expect(ctl(r, 'dpe').etat).toBe('na'); expect(r.manquantes).toBe(0);
    expect(ligne(gen({ log: box, dpe: { classe: 'E', ges: 'C' } }), 'dpe')).toBe('Classe énergie : E · Classe climat : C');
  });
  it('local pro sans DPE : requis ; DPE déclaré non concerné : na (audit mineur 9)', () => {
    const lp = Object.assign({}, box, { type: 'Local commercial', typeUsage: 'local-pro' });
    expect(ctl(gen({ log: lp, dpe: {} }), 'dpe').etat).toBe('ko');
    expect(ctl(gen({ log: lp, dpe: { na: true } }), 'dpe').etat).toBe('na');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('helpers', () => {
  it('montant / nombre', () => {
    expect(montant(1580)).toBe('1 580'); expect(montant(812.7)).toBe('812,70');
    expect(nombre('')).toBe(null); expect(nombre('0')).toBe(0); expect(nombre('12,5')).toBe(12.5);
  });
  it('etageLabel', () => {
    expect(etageLabel('RDC')).toBe('rez-de-chaussée'); expect(etageLabel('1')).toBe('1er étage');
    expect(etageLabel('2e')).toBe('2e étage'); expect(etageLabel('-1')).toBe('niveau -1'); expect(etageLabel('Sous-sol')).toBe('');
  });
  it('dateFr', () => { expect(dateFr('2026-11-01')).toBe('1er novembre 2026'); expect(dateFr('x')).toBe(''); });
  it('natureBien / estMeuble / estHorsHabitation', () => {
    expect(natureBien({ type: 'T4' }, { typeHabitat: 'Maison individuelle' })).toBe('Maison T4');
    expect(natureBien({ type: 'studio' }, {})).toBe('Studio');
    expect(estMeuble({ typeUsage: 'mobilite' })).toBe(true); expect(estHorsHabitation({ typeUsage: 'autre' })).toBe(true);
  });
  it('pointsForts : sanitaires « et », box de parking, annexes perso', () => {
    expect(pointsForts({ equipements: { sanitaires: { bain: true, douche: true, wc_separe: true } }, annexes: { parking: { present: true, type: 'box' }, customs: ['jardin partagé'] } }))
      .toEqual(['Baignoire, douche et WC séparé', 'Box', 'Jardin partagé']);
  });
  it('disponibilité passée → « Disponible immédiatement »', () => {
    expect(genererAccroche(d103({ locationInfo: { disponibilite: '2026-09-01' } }), IMM, { aujourdhui: '2026-09-29' })).toContain('Disponible immédiatement.');
  });
  it('dossier désactivé : garanties conservées', () => {
    const t = gen({ includeDossier: false }).texte;
    expect(t).not.toContain(RUBRIQUES.dossier);
    expect(t).toContain('Garanties acceptées : Visale ou caution solidaire.');
    expect(t).not.toContain(TXT_DOSSIERFACILE);
  });
  it('genererDossier / genererTitre / genererMentions exposés', () => {
    expect(genererDossier({}).split('\n')[0]).toBe('DOSSIER À PRÉPARER');
    expect(genererTitre(d103(), IMM)).toBe('Appartement T2 50 m² avec balcon — Strasbourg');
    expect(genererMentions(d103(), IMM, { dpe: DPE_D }).lignes.length).toBe(8);
  });
});
