// LES TROIS CHAÎNES D'ÉCRITURE DU BARÈME, COMPOSÉES COMME index.html LES COMPOSE.
//
// Pourquoi ce fichier existe (audit du 2026-08-24, verdict DANGEREUX sur 7a5d498..faf5868) :
// les tests du chantier étaient tous au niveau du MODULE, et aucun ne composait
// `borneMinEffetBareme` → `garantirCouvertureBail` → `appliquerNouvellePeriode` comme le fait
// `saveBail`. Les trois bloquants trouvés vivaient exactement dans cet interstice — et c'est
// aussi pour ça que la mesure rendait « 0 infraction » : le clamp était calculé sur un barème
// que le code modifiait ENSUITE, avant d'écrire.
//
// Deuxième leçon, encodée ici : la fenêtre de mesure précédente s'arrêtait à 2027-12 et le
// défaut démarrait au 2028-01. Chaque scénario ci-dessous vérifie donc les euros JUSQU'EN 2033,
// bien au-delà de la dernière date manipulée.
//
// Chaque helper porte le nom de sa fonction dans index.html et l'ordre exact de ses appels.

import { describe, it, expect } from 'vitest';
import {
  appliquerNouvellePeriode, garantirCouvertureBail, synchroniserPeriodeBail,
  cloturerBareme, cloturerPeriodeParDebut, clampDateEffet, chapitrePour
} from '../../js/core/loyer-bareme.js';
import { borneMinEffetBareme } from '../../js/core/bail-modif.js';
import { duMois } from '../../js/core/loyer-du-mois.js';

const REF = 'F-001';
const vivantes = (b) => b.filter((p) => p && !p._deleted && p.ref === REF);
const ouvertes = (b) => vivantes(b).filter((p) => p.fin == null);

/** _bailValidConfirm (index.html) : clamp Q1 + début du bail, PUIS bmin. */
function dateEffetValidee(bareme, bail, effetVoulu, dernierMoisQuittanceYm) {
  const cl = clampDateEffet(effetVoulu, {
    dernierMoisQuittanceYm: dernierMoisQuittanceYm || undefined,
    debutBailIso: bail.debut
  });
  let effet = cl.effetIso;
  const bmin = borneMinEffetBareme(bareme, REF);
  const ajustee = cl.ajustee || !!(bmin && effet < bmin);
  if (bmin && effet < bmin) effet = bmin;
  return { effet, ajustee };
}

/** saveBail, branche « terme financier validé en popup » (index.html:20825-20840). */
function saveBailModifFinanciere(bareme, bailAvant, bailApres, effetVoulu) {
  const { effet, ajustee } = dateEffetValidee(bareme, bailAvant, effetVoulu);
  let b = garantirCouvertureBail(bareme, { ref: REF, debut: bailApres.debut, hc: bailAvant.hc, ch: bailAvant.ch }, effet);
  b = appliquerNouvellePeriode(b, {
    ref: REF, debut: effet, hc: bailApres.hc, ch: bailApres.ch,
    source: 'manuel', bailDebut: bailApres.debut, note: 'accord amiable'
  });
  return { bareme: b, effet, ajustee };
}

/** saveBail, branche « aucun terme financier changé » — le numéro de téléphone. */
function saveBailNonFinancier(bareme, bail) {
  return synchroniserPeriodeBail(bareme, { ...bail }, bail.debut);
}

/** _baremeRecordRevision (index.html) : clamp début de bail, couverture bornée, écriture. */
function revisionIRL(bareme, bail, effetVoulu, nouveauHC) {
  const effet = clampDateEffet(effetVoulu, { debutBailIso: bail.debut }).effetIso;
  let b = garantirCouvertureBail(bareme, { ref: REF, debut: bail.debut, hc: bail.hc, ch: bail.ch }, effet);
  b = appliquerNouvellePeriode(b, { ref: REF, debut: effet, hc: nouveauHC, ch: bail.ch, source: 'irl', bailDebut: bail.debut });
  return { bareme: b, effet };
}

/** _histoSaveCorrPeriode (index.html) : chapitre résolu, couverture bornée, écriture, clôture. */
function corrigerPeriode(bareme, baux, debut, fin, hc, ch) {
  const chap = chapitrePour(bareme, REF, debut, baux);
  if (!chap) return { bareme, refus: 'aucun bail ne couvre cette date' };
  if (debut < chap) return { bareme, refus: 'avant le début du bail' };
  const b0 = baux.find((x) => String(x.debut).slice(0, 10) === chap);
  let b = b0 ? garantirCouvertureBail(bareme, { ref: REF, debut: chap, hc: b0.hc, ch: b0.ch }, debut) : bareme;
  b = appliquerNouvellePeriode(b, { ref: REF, debut, fin: fin || null, hc, ch, source: 'manuel', bailDebut: chap, note: 'régularisation' });
  if (fin) b = cloturerPeriodeParDebut(b, REF, debut, fin);
  return { bareme: b, refus: null, chapitre: chap };
}

const LOIN = ['2028-01', '2029-06', '2030-12', '2032-03', '2033-12'];

describe('B1 — une augmentation validée ne s\'éteint pas toute seule', () => {
  // DONNÉE DE PRODUCTION : le barème du lot est une correction longue qui court jusqu'en 2027,
  // le bail affiche 700+90. On valide 760+110 au 01/09/2026.
  const bail = { ref: REF, debut: '2023-01-01', hc: 700, ch: 90 };
  const base = () => ([{ ref: REF, debut: '2023-01-01', fin: '2027-12-31', hc: 677, ch: 90, source: 'manuel', bailDebut: '2023-01-01', note: 'régul' }]);
  const bails = (hc, ch) => ([{ debut: bail.debut, fin: null, finEffective: null, archive: false, hc, ch }]);

  it('le loyer révisé tient au-delà de la période qu\'il remplace — 2028 comme 2033', () => {
    const { bareme, effet } = saveBailModifFinanciere(base(), bail, { ...bail, hc: 760, ch: 110 }, '2026-09-01');
    expect(effet).toBe('2026-09-01');
    const bs = bails(760, 110);
    expect(duMois({ ref: REF, bails: bs, bareme }, '2026-08').total).toBe(767);   // 677 + 90, avant
    for (const ym of ['2026-09', '2027-12', ...LOIN]) {
      expect(duMois({ ref: REF, bails: bs, bareme }, ym).total).toBe(870);
    }
    expect(ouvertes(bareme)).toHaveLength(1);
  });

  it('CAUSE RACINE — une continuation dérivée du bail ne borne plus une augmentation, même plantée à la main', () => {
    // Avant le correctif : une période OUVERTE au 01/01/2028 (source:'bail', une reprise de
    // couverture) devenait `suivante`, bornait l'augmentation au 31/12/2027, et le loyer y
    // retombait POUR TOUJOURS (2 880 € sur 2028-2030). Désormais une période `source:'bail'` du
    // même chapitre N'EST PAS une décision : elle ne borne pas, et la nouvelle période la
    // supersède. Le scénario le plus hostile — la queue déjà présente dans le barème — est neutre.
    const avecQueue = base().concat([{ ref: REF, debut: '2028-01-01', fin: null, hc: 700, ch: 90, source: 'bail', bailDebut: '2023-01-01' }]);
    const out = appliquerNouvellePeriode(avecQueue, { ref: REF, debut: '2026-09-01', hc: 760, ch: 110, source: 'manuel', bailDebut: '2023-01-01' });
    const bs = bails(760, 110);
    const perdu = ['2028', '2029', '2030'].reduce((s, y) => s + Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
      .reduce((a, ym) => a + (870 - duMois({ ref: REF, bails: bs, bareme: out }, ym).total), 0), 0);
    expect(perdu).toBe(0);                                    // plus AUCUN euro perdu
    expect(vivantes(out).some((p) => p.debut === '2028-01-01')).toBe(false);   // la queue est superséée
    expect(ouvertes(out)).toHaveLength(1);
    // et la chaîne d'aujourd'hui ne produit plus jamais cette queue
    const { bareme } = saveBailModifFinanciere(base(), bail, { ...bail, hc: 760, ch: 110 }, '2026-09-01');
    expect(vivantes(bareme).some((p) => p.debut === '2028-01-01')).toBe(false);
  });

  it('la révision IRL non plus (elle n\'a même pas le garde-fou du clamp)', () => {
    const { bareme } = revisionIRL(base(), bail, '2026-09-01', 742);
    const bs = bails(742, 90);
    for (const ym of ['2026-09', ...LOIN]) expect(duMois({ ref: REF, bails: bs, bareme }, ym).total).toBe(832);
  });

  it('et les mois d\'AVANT la date d\'effet sont gelés, pas laissés au repli', () => {
    const { bareme } = saveBailModifFinanciere(base(), bail, { ...bail, hc: 760, ch: 110 }, '2026-09-01');
    const bs = bails(760, 110);
    for (const ym of ['2023-01', '2024-06', '2026-08']) {
      expect(duMois({ ref: REF, bails: bs, bareme }, ym)).toMatchObject({ total: 767, source: 'bareme' });
    }
  });
});

describe('I1 — la date d\'effet n\'est pas repoussée par une période qu\'on vient de fabriquer', () => {
  const bail = { ref: REF, debut: '2023-01-01', hc: 700, ch: 90 };
  const base = () => ([{ ref: REF, debut: '2023-01-01', fin: '2027-12-31', hc: 677, ch: 90, source: 'manuel', bailDebut: '2023-01-01' }]);

  it('bmin reste 2023-02-01 après un enregistrement non financier', () => {
    // AVANT : le saveBail « téléphone » posait une période au 01/01/2028 ; bmin passait à
    // 2028-02-01 et la popup remontait l'augmentation de 17 mois, avec un motif faux.
    const apresTelephone = saveBailNonFinancier(base(), bail);
    expect(borneMinEffetBareme(apresTelephone, REF)).toBe('2023-02-01');
    const { effet, ajustee } = dateEffetValidee(apresTelephone, bail, '2026-09-01');
    expect(effet).toBe('2026-09-01');
    expect(ajustee).toBe(false);
  });

  it('bmin joue toujours son rôle quand une période FUTURE existe vraiment', () => {
    const avecRevision = base().concat([{ ref: REF, debut: '2028-06-01', fin: null, hc: 900, ch: 90, source: 'irl', bailDebut: '2023-01-01' }]);
    expect(dateEffetValidee(avecRevision, bail, '2026-09-01').effet).toBe('2028-07-01');
  });
});

describe('I2 — un enregistrement non financier ne déplace pas un centime', () => {
  const bail = { ref: REF, debut: '2023-01-01', hc: 700, ch: 90 };
  const base = () => ([{ ref: REF, debut: '2023-01-01', fin: '2027-12-31', hc: 677, ch: 90, source: 'manuel', bailDebut: '2023-01-01' }]);

  it('après une augmentation, corriger le NUMÉRO DE TÉLÉPHONE ne change aucun mois', () => {
    const { bareme } = saveBailModifFinanciere(base(), bail, { ...bail, hc: 760, ch: 110 }, '2026-09-01');
    const bailApres = { ...bail, hc: 760, ch: 110 };
    const bs = [{ debut: bail.debut, fin: null, finEffective: null, archive: false, hc: 760, ch: 110 }];
    const mois = [];
    for (let y = 2022; y <= 2033; y++) for (let m = 1; m <= 12; m++) mois.push(`${y}-${String(m).padStart(2, '0')}`);
    const avant = mois.map((ym) => duMois({ ref: REF, bails: bs, bareme }, ym).total);
    const apres2 = saveBailNonFinancier(bareme, bailApres);
    const apres = mois.map((ym) => duMois({ ref: REF, bails: bs, bareme: apres2 }, ym).total);
    expect(apres).toEqual(avant);
  });

  it('… et trois enregistrements d\'affilée laissent le barème identique', () => {
    const { bareme } = saveBailModifFinanciere(base(), bail, { ...bail, hc: 760, ch: 110 }, '2026-09-01');
    const bailApres = { ...bail, hc: 760, ch: 110 };
    const un = saveBailNonFinancier(bareme, bailApres);
    const deux = saveBailNonFinancier(un, bailApres);
    expect(deux).toEqual(un);
    expect(saveBailNonFinancier(deux, bailApres)).toEqual(un);
  });
});

describe('B2 — corriger une période sur un lot dont le bail est CLOS', () => {
  // Le bouton « ＋ Corriger une période » est rendu même sans bail en cours. `DB.baux[ref]` est
  // alors un TOMBSTONE : il existe, il n'a pas de `debut`. Le chapitre retombait sur la date de
  // la correction elle-même, la supersession ne mordait plus, et deux périodes vivantes
  // coexistaient au même jour → deux montants selon l'ordre du tableau, donc selon l'appareil.
  const baux = () => ([{ debut: '2023-09-01', fin: null, finEffective: '2026-02-28', hc: 760, ch: 90 }]);
  const base = () => ([
    { ref: REF, debut: '2023-09-01', fin: '2023-12-31', hc: 700, ch: 90, source: 'bail', bailDebut: '2023-09-01' },
    { ref: REF, debut: '2024-01-01', fin: '2026-02-28', hc: 760, ch: 90, source: 'manuel', bailDebut: '2023-09-01' },
  ]);

  it('le chapitre est celui du bail ARCHIVÉ, pas la date de la correction', () => {
    const { bareme, chapitre } = corrigerPeriode(base(), baux(), '2024-01-01', '2024-03-31', 677, 90);
    expect(chapitre).toBe('2023-09-01');
    expect(vivantes(bareme).filter((p) => p.debut === '2024-01-01')).toHaveLength(1);
    expect(vivantes(bareme).find((p) => p.debut === '2024-01-01').hc).toBe(677);
  });

  it('DEUX APPAREILS, UN SEUL MONTANT : le dû ne dépend pas de l\'ordre du tableau', () => {
    const { bareme } = corrigerPeriode(base(), baux(), '2024-01-01', '2024-03-31', 677, 90);
    const bs = [{ debut: '2023-09-01', fin: null, finEffective: '2026-02-28', archive: true, hc: 760, ch: 90 }];
    const inverse = bareme.slice().reverse();
    for (const ym of ['2024-01', '2024-02', '2024-03', '2024-04', '2025-06']) {
      expect(duMois({ ref: REF, bails: bs, bareme }, ym).total)
        .toBe(duMois({ ref: REF, bails: bs, bareme: inverse }, ym).total);
    }
    expect(duMois({ ref: REF, bails: bs, bareme }, '2024-02').total).toBe(767);
  });

  it('et le reste de la période remplacée REPREND après la correction (pas de trou)', () => {
    const { bareme } = corrigerPeriode(base(), baux(), '2024-01-01', '2024-03-31', 677, 90);
    const bs = [{ debut: '2023-09-01', fin: null, finEffective: '2026-02-28', archive: true, hc: 760, ch: 90 }];
    expect(duMois({ ref: REF, bails: bs, bareme }, '2024-04')).toMatchObject({ total: 850, source: 'bareme' });
    expect(duMois({ ref: REF, bails: bs, bareme }, '2026-02')).toMatchObject({ total: 850, source: 'bareme' });
  });

  it('rejouer DEUX FOIS la même correction n\'empile rien (idempotence)', () => {
    const un = corrigerPeriode(base(), baux(), '2024-01-01', '2024-03-31', 677, 90).bareme;
    const deux = corrigerPeriode(un, baux(), '2024-01-01', '2024-03-31', 677, 90).bareme;
    expect(deux).toEqual(un);
  });

  it('chapitrePour tient par le BARÈME seul (le bail archivé a été supprimé)', () => {
    // delBail purge DB.baux[ref] ET la ligne d'historique : il ne reste que le barème. Sans la
    // 1re route (le chapitre de la période qu'on corrige), la correction serait refusée alors
    // que la donnée est là, sous les yeux de l'utilisateur.
    const { bareme, chapitre, refus } = corrigerPeriode(base(), [], '2024-01-01', '2024-03-31', 677, 90);
    expect(refus).toBeNull();
    expect(chapitre).toBe('2023-09-01');
    expect(vivantes(bareme).filter((p) => p.debut === '2024-01-01')).toHaveLength(1);
  });

  it('chapitrePour tient par les BAUX seuls (aucune période ne couvre encore cette date)', () => {
    // Lot legacy jamais migré : le barème ne porte qu'une tranche, et on corrige un mois situé
    // en dehors. Sans la 2e route (le bail qui occupe la date), refus alors qu'un bail couvre.
    const partiel = [{ ref: REF, debut: '2023-09-01', fin: '2023-12-31', hc: 700, ch: 90, source: 'bail', bailDebut: '2023-09-01' }];
    const r = corrigerPeriode(partiel, baux(), '2025-01-01', '2025-06-30', 677, 90);
    expect(r.refus).toBeNull();
    expect(r.chapitre).toBe('2023-09-01');
    expect(vivantes(r.bareme).find((p) => p.debut === '2025-01-01')).toMatchObject({ hc: 677, bailDebut: '2023-09-01' });
  });

  it('une date que RIEN ne couvre est refusée, pas écrite en silence', () => {
    const r = corrigerPeriode(base(), baux(), '2020-01-01', '2020-03-31', 500, 90);
    expect(r.refus).toBeTruthy();
    expect(r.bareme).toEqual(base());
  });
});

describe('LA CEINTURE MUETTE reste inatteignable depuis les trois chaînes', () => {
  // `appliquerNouvellePeriode` refuse SANS RIEN DIRE une période antérieure à son chapitre
  // (`debut < bailDebut` → return). Mesuré quand ce chemin s'ouvrait : le barème ignorait la
  // révision pendant que log.hc, lui, était écrit — et l'enregistrement suivant repeignait la
  // période du bail au tarif de la révision fantôme (172 mois, 26 088 €).
  const bail = { ref: REF, debut: '2026-03-01', hc: 850, ch: 130 };
  const base = () => ([{ ref: REF, debut: '2026-03-01', fin: null, hc: 850, ch: 130, source: 'bail', bailDebut: '2026-03-01' }]);

  it('révision IRL datée avant le bail : la date est RAMENÉE, la période est bien écrite', () => {
    const { bareme, effet } = revisionIRL(base(), bail, '2025-09-01', 880);
    expect(effet).toBe('2026-03-01');
    expect(vivantes(bareme).some((p) => p.hc === 880)).toBe(true);
  });

  it('popup de modification datée avant le bail : idem, et signalée comme ajustée', () => {
    // le clamp la ramène au début du bail (2026-03-01). bmin ne joue PAS : la seule période du
    // barème est `source:'bail'` (la continuation du bail), qui n'est pas une décision datée et ne
    // borne donc rien. Effet = 2026-03-01, ajustée par le clamp.
    const r = dateEffetValidee(base(), bail, '2025-01-01');
    expect(r.effet).toBe('2026-03-01');
    expect(r.ajustee).toBe(true);
    const { bareme } = saveBailModifFinanciere(base(), bail, { ...bail, hc: 900 }, '2025-01-01');
    expect(vivantes(bareme).some((p) => p.hc === 900)).toBe(true);
  });

  it('correction datée avant le bail : refus PARLANT, rien d\'écrit', () => {
    const r = corrigerPeriode(base(), [{ debut: '2026-03-01', fin: null, finEffective: null, hc: 850, ch: 130 }], '2025-01-01', '2025-06-30', 700, 130);
    expect(r.refus).toBe('aucun bail ne couvre cette date');
    expect(r.bareme).toEqual(base());
  });
});

describe('LA CHAÎNE COMPLÈTE — six gestes d\'affilée, aucun euro du passé ne bouge', () => {
  it('bail neuf → correction → téléphone → IRL → augmentation → re-bail', () => {
    const mois = [];
    for (let y = 2023; y <= 2033; y++) for (let m = 1; m <= 12; m++) mois.push(`${y}-${String(m).padStart(2, '0')}`);
    let bail = { ref: REF, debut: '2023-09-01', hc: 700, ch: 90 };
    let bails = [{ debut: '2023-09-01', fin: null, finEffective: null, archive: false, hc: 700, ch: 90 }];
    const du = (bareme) => mois.map((ym) => duMois({ ref: REF, bails, bareme }, ym).total);
    const fige = (a, b, avant) => {                       // rien ne bouge STRICTEMENT avant `avant`
      for (let i = 0; i < mois.length; i++) if (mois[i] < avant.slice(0, 7)) expect([mois[i], b[i]]).toEqual([mois[i], a[i]]);
    };

    let bareme = synchroniserPeriodeBail([], { ...bail }, null);
    expect(ouvertes(bareme)).toHaveLength(1);

    // 1. correction du loyer de janvier-mars 2024
    let etat = du(bareme);
    const c = corrigerPeriode(bareme, bails, '2024-01-01', '2024-03-31', 600, 90);
    expect(c.refus).toBeNull();
    bareme = c.bareme; fige(etat, du(bareme), '2024-01-01');

    // 2. le locataire change de téléphone : AUCUN mois ne bouge, nulle part
    etat = du(bareme);
    bareme = saveBailNonFinancier(bareme, bail);
    expect(du(bareme)).toEqual(etat);

    // 3. révision IRL au 01/09/2025
    etat = du(bareme);
    const r1 = revisionIRL(bareme, bail, '2025-09-01', 721);
    bareme = r1.bareme; bail = { ...bail, hc: 721 }; bails[0].hc = 721;
    fige(etat, du(bareme), '2025-09-01');

    // 4. augmentation validée en popup au 01/09/2026
    etat = du(bareme);
    const r2 = saveBailModifFinanciere(bareme, bail, { ...bail, hc: 780, ch: 110 }, '2026-09-01');
    expect(r2.effet).toBe('2026-09-01');
    bareme = r2.bareme; bail = { ...bail, hc: 780, ch: 110 }; bails[0].hc = 780; bails[0].ch = 110;
    fige(etat, du(bareme), '2026-09-01');
    for (const ym of LOIN) expect(duMois({ ref: REF, bails, bareme }, ym).total).toBe(890);

    // 5. re-bail au 01/07/2027 : le nouveau locataire à SON loyer, dès le premier mois
    etat = du(bareme);
    bails[0].finEffective = '2027-06-30'; bails[0].archive = true;
    bareme = cloturerBareme(bareme, REF, '2027-06-30');
    bail = { ref: REF, debut: '2027-07-01', hc: 950, ch: 160 };
    bails.push({ debut: '2027-07-01', fin: null, finEffective: null, archive: false, hc: 950, ch: 160 });
    bareme = synchroniserPeriodeBail(bareme, { ...bail }, null);
    fige(etat, du(bareme), '2027-07-01');
    for (const ym of ['2027-07', ...LOIN]) expect(duMois({ ref: REF, bails, bareme }, ym).total).toBe(1110);

    // invariants de structure, à la fin
    expect(ouvertes(bareme)).toHaveLength(1);
    const v = vivantes(bareme);
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      const a = v[i], b = v[j];
      expect(a.debut <= (b.fin || '9999-12-31') && b.debut <= (a.fin || '9999-12-31')).toBe(false);
    }
    // et le dû ne dépend pas de l'ordre du tableau (deux appareils, un seul montant)
    const inverse = bareme.slice().reverse();
    for (const ym of mois) {
      expect(duMois({ ref: REF, bails, bareme: inverse }, ym).total)
        .toBe(duMois({ ref: REF, bails, bareme }, ym).total);
    }
  });
});

describe('CAUSE RACINE — une période dérivée du bail (source:"bail") ne borne ni ne bloque une décision datée', () => {
  // Le geste unique qui ferme B1, I1 et la variante mesurée sur MUL-002 (données du parc) : une
  // correction longue laisse derrière elle une REPRISE ouverte (source:'bail'), et cette reprise
  // n'est PAS une décision de l'utilisateur — c'est la continuation du loyer du bail. Elle ne doit
  // ni borner l'augmentation suivante (sinon celle-ci expire), ni gonfler bmin (sinon la date
  // d'effet est repoussée de plusieurs années avec un motif faux).
  const bail = { ref: REF, debut: '2022-04-01', hc: 700, ch: 120 };
  // barème = ancien chapitre clos + bail courant, comme en base sur un lot re-baillé
  const base = () => ([
    { ref: REF, debut: '2020-01-01', fin: '2022-03-31', hc: 500, ch: 100, source: 'bail', bailDebut: '2020-01-01' },
    { ref: REF, debut: '2022-04-01', fin: null, hc: 700, ch: 120, source: 'bail', bailDebut: '2022-04-01' },
  ]);
  const baux = () => ([{ debut: '2022-04-01', fin: null, finEffective: null, hc: 700, ch: 120 }]);

  it('la reprise ouverte laissée par une correction longue ne repousse pas bmin', () => {
    const c = corrigerPeriode(base(), baux(), '2023-01-01', '2026-12-31', 650, 120);
    expect(c.refus).toBeNull();
    // le barème porte maintenant une reprise ouverte au 01/01/2027 (source:'bail')
    expect(vivantes(c.bareme).some((p) => p.debut === '2027-01-01' && p.source === 'bail' && p.fin == null)).toBe(true);
    // … mais bmin l'ignore : la seule décision datée est la correction au 01/01/2023
    expect(borneMinEffetBareme(c.bareme, REF)).toBe('2023-02-01');
  });

  it('l\'augmentation demandée APRÈS n\'est pas repoussée, et ne s\'éteint pas — 2028 comme 2033', () => {
    const c = corrigerPeriode(base(), baux(), '2023-01-01', '2026-12-31', 650, 120);
    const { bareme, effet } = saveBailModifFinanciere(c.bareme, { ...bail, hc: 650 }, { ...bail, hc: 900 }, '2027-06-01');
    expect(effet).toBe('2027-06-01');                       // pas repoussée derrière la reprise
    const bs = [{ debut: '2022-04-01', fin: null, finEffective: null, archive: false, hc: 900, ch: 120 }];
    // la reprise 2027-01 a été superséée par l'augmentation ouverte
    expect(vivantes(bareme).filter((p) => p.fin == null)).toHaveLength(1);
    for (const ym of ['2027-06', '2028-01', '2029-06', '2030-12', '2033-12']) {
      expect(duMois({ ref: REF, bails: bs, bareme }, ym).total).toBe(1020);   // 900 + 120, tenu
    }
    // et le dû ne dépend pas de l'ordre du tableau
    const inverse = bareme.slice().reverse();
    for (const ym of ['2023-06', '2026-06', '2027-06', '2030-01']) {
      expect(duMois({ ref: REF, bails: bs, bareme: inverse }, ym).total)
        .toBe(duMois({ ref: REF, bails: bs, bareme }, ym).total);
    }
  });

  it('une DÉCISION datée (révision IRL), elle, borne toujours', () => {
    // pour ne pas jeter le bébé : une vraie révision programmée continue de borner une écriture
    // antérieure — c'est source:'irl', pas source:'bail'.
    let b = appliquerNouvellePeriode(base(), { ref: REF, debut: '2026-09-01', hc: 730, ch: 120, source: 'irl', bailDebut: '2022-04-01' });
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2025-01-01', hc: 715, ch: 120, source: 'manuel', bailDebut: '2022-04-01' });
    expect(vivantes(b).find((p) => p.debut === '2025-01-01').fin).toBe('2026-08-31');   // bornée par la révision
    expect(vivantes(b).find((p) => p.debut === '2026-09-01').fin).toBe(null);
  });
});
