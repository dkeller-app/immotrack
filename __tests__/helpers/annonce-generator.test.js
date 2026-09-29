/**
 * Tests du moteur d'annonces CONFORMES — chantier ANNONCES (CDC validé 29/09/2026).
 *
 * Garde-fous :
 *  - VERBATIM : chaque libellé imposé par un texte est comparé à la chaîne relue sur Légifrance
 *    (mockups/ANNONCES/AUDIT.md partie 2). Toute reformulation fait rougir.
 *  - ANTI-INVENTION : un logement sans équipement ne produit AUCUNE phrase d'équipement ;
 *    jamais « undefined », « 0 chambre », « douche italienne » par défaut (défauts de l'ancien moteur).
 *  - D1 : le loyer vient du loyer souhaité (loyerHcRef/chargesRef/dgRef), jamais du bail.
 *  - D3 : donnée manquante → marqueur « [… à compléter] » + contrôle 'ko', jamais d'exception.
 */
import { describe, it, expect } from 'vitest';
import {
  TXT_GEORISQUES, TXT_DEPENSES, TXT_EXCESSIF, TXT_HCL, PIECES_LIBELLES,
  nombre, montant, etageLabel, communeLabel, dateFr, natureBien, estMeuble, estHorsHabitation,
  genererTitre, genererDescription, genererMentions, genererDossier, genererAnnonce,
} from './annonce-generator.js';

const PIECES = ['identite', 'domicile', 'situation', 'ressources'];   // = PIECES_REQUISES (js/core/candidature.js)

// Le logement vacant du jeu de démonstration (index.html _loadDemoDataset, « D-103 »), complété
// comme dans la maquette validée : T2 50 m², 2e, Strasbourg, copropriété 1949-1997.
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
const IMM = { ville: 'Strasbourg', codePostal: '67000', regimeJuridique: 'Copropriété', typeHabitat: 'Immeuble collectif', equipementsCommuns: { ascenseur: true } };
const DPE_D = { classe: 'D', ges: 'D', depensesEnergie: 'entre 890 € et 1 240 € par an', anneePrix: '2021, 2022, 2023' };

function gen(o = {}) {
  return genererAnnonce(Object.assign({
    log: d103(), imm: IMM, dpe: DPE_D, composition: 'Séjour, Cuisine, 1 chambre, Salle d\'eau, WC',
    periode: 'De 1949 à 1997', pieces: PIECES, mandataire: false, includeDossier: true, aujourdhui: '2026-09-29'
  }, o));
}
const ligne = (r, key) => (r.mentions.find(m => m.key === key) || {}).texte;
const ctl = (r, key) => r.controle.find(c => c.key === key);

// ═══════════════════════════════════════════════════════════════
describe('libellés imposés — verbatim Légifrance', () => {
  it('Géorisques = C. env. R125-25 (adresse écrite en texte simple, sans espaces parasites)', () => {
    expect(TXT_GEORISQUES).toBe('Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr');
  });
  it('dépenses d\'énergie = R126-23', () => {
    expect(TXT_DEPENSES).toBe('Montant estimé des dépenses annuelles d\'énergie pour un usage standard : ');
  });
  it('consommation excessive = R126-24 + arrêté du 22/12/2021 (« classe F. » / « classe G. »)', () => {
    expect(TXT_EXCESSIF).toBe('Logement à consommation énergétique excessive : ');
    const f = gen({ dpe: Object.assign({}, DPE_D, { classe: 'F' }) });
    expect(ligne(f, 'excessif')).toBe('Logement à consommation énergétique excessive : classe F.');
    const g = gen({ dpe: Object.assign({}, DPE_D, { classe: 'G' }) });
    expect(ligne(g, 'excessif')).toBe('Logement à consommation énergétique excessive : classe G.');
  });
  it('honoraires professionnel = arr. 10/01/2017 4-I-6° (« honoraires charge locataire »)', () => {
    expect(TXT_HCL).toBe('honoraires charge locataire');
  });
  it('classes précédées de « classe énergie » / « classe climat » (R126-21)', () => {
    expect(ligne(gen(), 'dpe')).toBe('Classe énergie : D · Classe climat : D');
  });
  it('loyer suivi de « par mois » et « charges comprises » (arr. 21/04/2022 1°)', () => {
    expect(ligne(gen(), 'loyer')).toBe('Loyer : 800 € par mois charges comprises');
  });
  it('pièces : uniquement les 4 catégories de la liste autorisée (décret 2015-1437)', () => {
    expect(Object.keys(PIECES_LIBELLES)).toEqual(PIECES);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('D-103 complet (maquette §2)', () => {
  const r = gen();
  it('titre factuel', () => {
    expect(r.titre).toBe('Appartement T2 50 m² avec balcon — Strasbourg');
  });
  it('description : uniquement les données saisies, dans l\'ordre du CDC §3.2', () => {
    expect(r.description).toBe([
      'Appartement T2 de 50 m² au 2e étage avec ascenseur, dans une copropriété construite entre 1949 et 1997.',
      'Composition : Séjour, Cuisine, 1 chambre, Salle d\'eau, WC.',
      'Cuisine équipée : four, plaques de cuisson, réfrigérateur.',
      'Sanitaires : douche, WC séparé.',
      'Extérieur : balcon de 4 m².',
      'Annexe : cave.',
      'Fibre optique.',
      '',
      'Disponible le 1er novembre 2026.',
      'Garanties acceptées : Visale ou caution solidaire.'
    ].join('\n'));
  });
  it('mentions dans l\'ordre du CDC §3.3', () => {
    expect(r.mentions.map(m => m.texte)).toEqual([
      'Loyer : 800 € par mois charges comprises',
      'Charges : 100 € par mois — provision avec régularisation annuelle',
      'Dépôt de garantie : 700 €',
      'Surface habitable : 50 m²',
      'Commune : Strasbourg',
      'Classe énergie : D · Classe climat : D',
      'Montant estimé des dépenses annuelles d\'énergie pour un usage standard : entre 890 € et 1 240 € par an. Prix moyens des énergies indexés sur les années 2021, 2022, 2023.',
      TXT_GEORISQUES
    ]);
  });
  it('aucune mention manquante, contrôle tout vert ou non concerné', () => {
    expect(r.manquantes).toBe(0);
    expect(r.controle.every(c => c.etat === 'ok' || c.etat === 'na')).toBe(true);
  });
  it('D1 : aucune trace des anciennes valeurs du bail (999)', () => {
    expect(r.texte).not.toContain('999');
  });
  it('D9 : liste des pièces sans aucune adresse web ajoutée', () => {
    expect(r.dossier).toBe('Pièces demandées (liste autorisée, décret n° 2015-1437) : une pièce d\'identité, un justificatif de domicile, un justificatif de situation professionnelle, un ou plusieurs justificatifs de ressources.\nLe dossier peut être constitué sur DossierFacile, service public gratuit.');
    // Seule adresse web du texte : celle que la loi impose (D10).
    expect(r.texte.match(/www\.|https?:/g)).toEqual(['www.']);
  });
  it('texte copié = description + mentions + dossier', () => {
    expect(r.texte.startsWith(r.description + '\n\n')).toBe(true);
    expect(r.texte.endsWith(r.dossier)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('anti-invention (défauts de l\'ancien moteur)', () => {
  const vide = { ref: 'V-1', type: 'T2', surf: 50, typeUsage: 'habitation-nu', loyerHcRef: 700, chargesRef: 100, dgRef: 700, chargesModalite: 'provision',
    equipements: { cuisine: {}, sanitaires: {}, technologies: {} }, exterieurs: { balcon: {}, terrasse: {}, jardin_privatif: {} },
    annexes: { cave: {}, parking: {}, customs: [] }, presentation: { exposition: 'sud', vue: 'mer-montagne' }, quartier: { reperes: ['Cathédrale'] }, locationInfo: {} };
  const r = gen({ log: vide, composition: '', periode: '' });
  it('aucune phrase d\'équipement, d\'extérieur, d\'annexe, de quartier ni de présentation', () => {
    // « avec ascenseur » vient de l'immeuble (donnée saisie), pas du logement.
    expect(r.description).toBe('Appartement T2 de 50 m² avec ascenseur, dans une copropriété.');
    expect(r.texte).not.toMatch(/cuisine|douche|baignoire|balcon|cave|fibre|sud|mer|Cathédrale|quartier/i);
  });
  it('jamais « undefined », « null », « NaN », « 0 chambre »', () => {
    const tous = [gen({ log: {}, imm: {}, dpe: {} }), r, gen({ log: { typeUsage: 'garage' }, imm: {}, dpe: {} })];
    tous.forEach(x => {
      const blob = x.titre + x.texte;
      expect(blob).not.toMatch(/undefined|null|NaN|0 chambre/);
    });
  });
  it('arguments totalement absents : pas d\'exception', () => {
    expect(() => genererAnnonce()).not.toThrow();
    expect(() => genererAnnonce({ log: null, imm: null, dpe: null })).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
describe('D3 — données manquantes : marquées, jamais bloquantes', () => {
  it('modalité des charges absente', () => {
    const r = gen({ log: d103({ chargesModalite: '' }) });
    expect(ligne(r, 'charges')).toBe('Charges : 100 € par mois — [modalité des charges à compléter]');
    expect(ctl(r, 'charges').etat).toBe('ko');
    expect(ctl(r, 'charges').cible).toBe('identite');
  });
  it('dépenses et années absentes', () => {
    const r = gen({ dpe: { classe: 'D', ges: 'D' } });
    expect(ligne(r, 'depenses')).toBe(TXT_DEPENSES + '[montant et années de référence des prix à compléter]');
    expect(ctl(r, 'depenses').etat).toBe('ko');
    expect(r.manquantes).toBe(1);
  });
  it('années absentes seules', () => {
    const r = gen({ dpe: { classe: 'D', ges: 'D', depensesEnergie: '1234 €' } });
    expect(ligne(r, 'depenses')).toBe(TXT_DEPENSES + '1234 € par an. [années de référence des prix à compléter]');
  });
  it('DPE absent → classes manquantes (habitation)', () => {
    const r = gen({ dpe: {} });
    expect(ligne(r, 'dpe')).toBe('Classe énergie : [classes énergie et climat à compléter]');
    expect(ctl(r, 'dpe').etat).toBe('ko');
    expect(ctl(r, 'dpe').cible).toBe('dpe');
  });
  it('loyer souhaité absent : marqué, jamais repris de log.hc', () => {
    const r = gen({ log: d103({ loyerHcRef: '', chargesRef: '' }) });
    expect(ligne(r, 'loyer')).toBe('Loyer : [loyer à compléter]');
    expect(ctl(r, 'loyer').etat).toBe('ko');
    expect(r.texte).not.toContain('999');
  });
  it('surface et commune absentes', () => {
    const r = gen({ log: d103({ surf: '' }), imm: {} });
    expect(ligne(r, 'surface')).toBe('Surface habitable : [surface à compléter]');
    expect(ligne(r, 'commune')).toBe('Commune : [commune à compléter]');
  });
  it('charges à 0 = une valeur (aucune), pas un manque', () => {
    const r = gen({ log: d103({ chargesRef: 0, chargesModalite: '' }) });
    expect(ligne(r, 'loyer')).toBe('Loyer : 700 € par mois');
    expect(ligne(r, 'charges')).toBe('Charges : aucune');
    expect(ctl(r, 'charges').etat).toBe('ok');
  });
  it('forfait', () => {
    expect(ligne(gen({ log: d103({ chargesModalite: 'forfait' }) }), 'charges')).toBe('Charges : 100 € par mois — forfait');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('meublé Lyon 3e, classe F (maquette §4)', () => {
  const lyon = { ville: 'Lyon', codePostal: '69003', regimeJuridique: '', typeHabitat: 'Immeuble collectif', equipementsCommuns: {} };
  const r = gen({
    log: d103({ ref: 'L-204', surf: 42, etage: '4', typeUsage: 'habitation-meuble', loyerHcRef: 850, chargesRef: 90, dgRef: 1580, exterieurs: {}, annexes: {} }),
    imm: lyon, periode: 'Avant 1949',
    dpe: { classe: 'F', ges: 'E', depensesEnergie: 'entre 1 510 € et 2 080 € par an', anneePrix: '2021, 2022, 2023' }
  });
  it('titre avec « meublé » et arrondissement', () => {
    expect(r.titre).toBe('Appartement T2 42 m² meublé — Lyon 3e arrondissement');
  });
  it('« Location meublée », arrondissement, mention F', () => {
    expect(ligne(r, 'meuble')).toBe('Location meublée');
    expect(ligne(r, 'commune')).toBe('Commune : Lyon 3e arrondissement');
    expect(ligne(r, 'excessif')).toBe('Logement à consommation énergétique excessive : classe F.');
  });
  it('immeuble hors copropriété : « dans un immeuble construit avant 1949 »', () => {
    expect(r.description.split('\n')[0]).toBe('Appartement T2 de 42 m² au 4e étage, dans un immeuble construit avant 1949.');
  });
  it('dépôt ≤ 2 mois en meublé : pas d\'avertissement', () => {
    expect(ctl(r, 'dg').etat).toBe('ok');
  });
  it('D5 : aucune mention d\'encadrement des loyers', () => {
    expect(r.texte).not.toMatch(/encadrement|loyer de référence|complément de loyer/i);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('plafonds du dépôt de garantie (avertissement, jamais bloquant)', () => {
  it('nu > 1 mois (art. 22)', () => {
    const c = ctl(gen({ log: d103({ dgRef: 1400 }) }), 'dg');
    expect(c.etat).toBe('warn'); expect(c.detail).toContain('art. 22');
  });
  it('meublé > 2 mois (art. 25-6)', () => {
    const c = ctl(gen({ log: d103({ typeUsage: 'habitation-meuble', dgRef: 1500 }) }), 'dg');
    expect(c.etat).toBe('warn'); expect(c.detail).toContain('25-6');
  });
  it('bail mobilité : aucun dépôt (art. 25-17)', () => {
    const c = ctl(gen({ log: d103({ typeUsage: 'mobilite', dgRef: 300 }) }), 'dg');
    expect(c.etat).toBe('warn'); expect(c.detail).toContain('25-17');
  });
  it('dépôt à 0 = « aucun »', () => {
    expect(ligne(gen({ log: d103({ dgRef: 0 }) }), 'dg')).toBe('Dépôt de garantie : aucun');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('honoraires (D8)', () => {
  it('particulier sans honoraires : aucune ligne « Honoraires : aucun »', () => {
    const r = gen();
    expect(r.texte).not.toMatch(/honoraires/i);
    expect(ctl(r, 'honorairesEdl').etat).toBe('na');
  });
  it('honoraires d\'état des lieux renseignés', () => {
    expect(ligne(gen({ log: d103({ honorairesEdlRef: 150 }) }), 'honorairesEdl')).toBe('Honoraires d\'état des lieux à la charge du locataire : 150 € TTC');
  });
  it('mandataire configuré sans montant : manquant', () => {
    const r = gen({ mandataire: true });
    expect(ligne(r, 'hcl')).toBe('[montant TTC à compléter] honoraires charge locataire');
    expect(ctl(r, 'hcl').etat).toBe('ko');
  });
  it('mandataire configuré avec montant', () => {
    expect(ligne(gen({ mandataire: true, log: d103({ honorairesHclRef: 605 }) }), 'hcl')).toBe('605 € TTC honoraires charge locataire');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('mode hors habitation (P-1) — box, local pro', () => {
  const box = { ref: 'G-12', type: 'Box', surf: 14, etage: '-1', numApt: '12', typeUsage: 'garage', loyerHcRef: 95, chargesRef: '', dgRef: 95, locationInfo: { disponibilite: '2026-11-01', garanties_acceptees: ['visale'] } };
  const r = gen({ log: box, dpe: {} });
  it('titre, description, bloc « Informations »', () => {
    expect(r.mode).toBe('hors-habitation');
    expect(r.blocTitre).toBe('Informations');
    expect(r.titre).toBe('Box 14 m² — Strasbourg');
    expect(r.description).toBe('Box de 14 m² au niveau -1, n° 12.\n\nDisponible le 1er novembre 2026.');
  });
  it('mentions : loyer, dépôt, surface, commune, Géorisques — rien de la loi 89 ni du DPE habitation', () => {
    expect(r.mentions.map(m => m.texte)).toEqual([
      'Loyer : 95 € par mois', 'Dépôt de garantie : 95 €', 'Surface : 14 m²', 'Commune : Strasbourg', TXT_GEORISQUES
    ]);
    expect(r.texte).not.toMatch(/charges comprises|habitable|meublé|dépenses|excessive|Garanties/i);
  });
  it('garage : DPE non concerné (R126-15 f), aucun manque', () => {
    expect(ctl(r, 'dpe').etat).toBe('na');
    expect(r.manquantes).toBe(0);
  });
  it('pas de liste de pièces (le décret 2015-1437 vise les logements)', () => {
    expect(r.dossier).toBe('');
  });
  it('garage avec DPE saisi : classes affichées', () => {
    expect(ligne(gen({ log: box, dpe: { classe: 'E', ges: 'C' } }), 'dpe')).toBe('Classe énergie : E · Classe climat : C');
  });
  it('local pro sans DPE : DPE requis (L126-33)', () => {
    const lp = gen({ log: Object.assign({}, box, { type: 'Local commercial', typeUsage: 'local-pro' }), dpe: {} });
    expect(ctl(lp, 'dpe').etat).toBe('ko');
    expect(lp.manquantes).toBe(1);
    expect(lp.mentions.map(m => m.key)).not.toContain('depenses');
  });
  it('charges en hors habitation', () => {
    expect(ligne(gen({ log: Object.assign({}, box, { chargesRef: 10 }), dpe: {} }), 'loyer')).toBe('Loyer : 95 € par mois + charges 10 € par mois');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('helpers', () => {
  it('montant', () => {
    expect(montant(800)).toBe('800'); expect(montant(1580)).toBe('1 580');
    expect(montant(812.7)).toBe('812,70'); expect(montant(12500.5)).toBe('12 500,50');
  });
  it('nombre : vide ≠ 0', () => {
    expect(nombre('')).toBe(null); expect(nombre(null)).toBe(null); expect(nombre('0')).toBe(0); expect(nombre('12,5')).toBe(12.5);
  });
  it('etageLabel', () => {
    expect(etageLabel('RDC')).toBe('rez-de-chaussée'); expect(etageLabel('0')).toBe('rez-de-chaussée');
    expect(etageLabel('1')).toBe('1er étage'); expect(etageLabel('2e')).toBe('2e étage');
    expect(etageLabel('-1')).toBe('niveau -1'); expect(etageLabel('Sous-sol')).toBe(''); expect(etageLabel('')).toBe('');
  });
  it('communeLabel : arrondissements Paris / Lyon / Marseille seulement', () => {
    expect(communeLabel({ ville: 'Paris', codePostal: '75011' })).toBe('Paris 11e arrondissement');
    expect(communeLabel({ ville: 'Paris', codePostal: '75001' })).toBe('Paris 1er arrondissement');
    expect(communeLabel({ ville: 'Marseille', codePostal: '13008' })).toBe('Marseille 8e arrondissement');
    expect(communeLabel({ ville: 'Lyon', codePostal: '69003' })).toBe('Lyon 3e arrondissement');
    expect(communeLabel({ ville: 'Strasbourg', codePostal: '67000' })).toBe('Strasbourg');
    expect(communeLabel({ ville: 'Villeurbanne', codePostal: '69100' })).toBe('Villeurbanne');
  });
  it('dateFr', () => {
    expect(dateFr('2026-11-01')).toBe('1er novembre 2026'); expect(dateFr('2026-02-15')).toBe('15 février 2026'); expect(dateFr('x')).toBe('');
  });
  it('natureBien', () => {
    expect(natureBien({ type: 'T2' }, {})).toBe('Appartement T2');
    expect(natureBien({ type: 'T4' }, { typeHabitat: 'Maison individuelle' })).toBe('Maison T4');
    expect(natureBien({ type: 'studio' }, {})).toBe('Studio');
    expect(natureBien({ type: '' , typeUsage: 'local-pro' }, {})).toBe('Local');
  });
  it('estMeuble / estHorsHabitation', () => {
    expect(estMeuble({ typeUsage: 'mobilite' })).toBe(true); expect(estMeuble({ typeUsage: 'etudiant' })).toBe(true);
    expect(estMeuble({ typeUsage: 'habitation-nu' })).toBe(false);
    expect(estHorsHabitation({ typeUsage: 'autre' })).toBe(true); expect(estHorsHabitation({ typeUsage: 'habitation-nu' })).toBe(false);
  });
  it('disponibilité passée → « Disponible immédiatement »', () => {
    expect(gen({ log: d103({ locationInfo: { disponibilite: '2026-09-01' } }) }).description).toContain('Disponible immédiatement.');
  });
  it('maison : « construite » et pas d\'étage', () => {
    expect(genererDescription({ type: 'T4', surf: 90, etage: '1', typeUsage: 'habitation-nu' }, { typeHabitat: 'Maison individuelle' }, { periode: 'Après 1997' }))
      .toBe('Maison T4 de 90 m², construite après 1997.');
  });
  it('genererDossier ignore les clés inconnues', () => {
    expect(genererDossier(['identite', 'rib'])).toBe('Pièces demandées (liste autorisée, décret n° 2015-1437) : une pièce d\'identité.\nLe dossier peut être constitué sur DossierFacile, service public gratuit.');
    expect(genererDossier([])).toBe('');
  });
  it('interrupteur dossier désactivé', () => {
    expect(gen({ includeDossier: false }).dossier).toBe('');
  });
  it('genererTitre / genererMentions exposés seuls', () => {
    expect(genererTitre(d103(), IMM)).toBe('Appartement T2 50 m² avec balcon — Strasbourg');
    expect(genererMentions(d103(), IMM, { dpe: DPE_D }).lignes.length).toBe(8);
  });
});
