// __tests__/helpers/regles-bulletin.test.js — VERIF-DOCUMENTS lot 3 + REGLES-PAIE : règles de cohérence des bulletins de
// salaire, appliquées aux valeurs lues par l'IA (et corrigées par le bailleur), derrière le garde-fou de lecture.
// Données fictives (SIRET fictifs à clé valide).
import { describe, it, expect } from 'vitest';
import { reglesInternes, analyserBulletins, valeursRetenues, lireSaisie, libellePeriode, euros, TOLERANCES, categorieLigne,
  variantesLecture, variantesChiffres, CHAMPS_BULLETIN, NUMERIQUES, LIGNES_MAX } from '../../js/core/regles-bulletin.js';

const INTERDITS = /fraude|frauduleu|\bfaux\b|fausse|falsifi|suspect|douteu|(?<!véri)fiable|truqu|mensong|\bscore\b/i;
const LIGNES = [
  { libelle: 'Complémentaire santé', base: 4005, taux: 0.8, montant: 32.04 },
  { libelle: 'Sécurité sociale plafonnée', base: 2950, taux: 6.9, montant: 203.55 },
  { libelle: 'Sécurité sociale déplafonnée', base: 2950, taux: 0.4, montant: 11.8 },
  { libelle: 'Complémentaire tranche 1', base: 2950, taux: 3.15, montant: 92.93 },
  { libelle: 'CEG tranche 1', base: 2950, taux: 0.86, montant: 25.37 },
  { libelle: 'CSG déductible de l\'impôt sur le revenu', base: 3019.69, taux: 6.8, montant: 205.34 },
  { libelle: 'CSG/CRDS non déductible de l\'impôt sur le revenu', base: 3019.69, taux: 2.9, montant: 87.57 },
];
const AOUT = { lisible: true, periode: '2026-08', salarie: 'ROTH-SCHALLER Kévin', employeur: 'THR Logistique', siret: '00000000200014', dateEntree: '2023-09-04',
  heures: 151.67, tauxHoraire: 19.4501, salaireBase: 2950, brut: 2950, totalCotisations: 658.6, lignes: LIGNES, autresLignes: [],
  netSocial: 2312.6, netAvantImpot: 2291.4, impotBase: 2341.8, impotTaux: 4.2, impotMontant: 98.36, netAPayer: 2193.04, netImposable: 2341.8,
  cumulBrut: 23600, cumulNetImposable: 15610.4 };
const SEPT = { ...AOUT, periode: '2026-09', netImposable: 2318.4, cumulBrut: 26550, cumulNetImposable: 17928.8 };
const JUIL = { ...AOUT, periode: '2026-07', cumulBrut: 20650, cumulNetImposable: 13268.6 };
const piece = (id, lu, extra = {}) => ({ id, nom: id + '.pdf', type: 'bulletin', ia: { le: '2026-10-13T09:16:00Z', lu }, ...extra });
const ID = { nom: 'Roth-Schaller', prenom: 'Kévin' };
const sp = (s) => String(s).replace(/[  ]/g, ' ');
const codes = (r) => r.map((x) => [x.code, x.ok]);
/** Retouche cohérente d'une ligne : le total et les nets suivent (comme le ferait une retouche soignée). */
const avecLigne = (base, i, l) => { const lignes = base.lignes.map((x, j) => (j === i ? { ...x, ...l } : x)); const d = Math.round((base.lignes[i].montant - lignes[i].montant) * 100) / 100;
  const r = (x) => Math.round(x * 100) / 100; return { ...base, lignes, totalCotisations: r(base.totalCotisations - d), netAvantImpot: r(base.netAvantImpot + d), netAPayer: r(base.netAPayer + d) }; };

describe('règles internes (R3243-1, arrêté du 25/02/2016, Urssaf 2026, BOSS)', () => {
  it('bulletin cohérent : B1, B2, N1, S1, lignes, taux légaux, assiette CSG ; B3 retirée', () => {
    const r = reglesInternes(AOUT);
    expect(codes(r)).toEqual([['B1', true], ['B2', true], ['N1', true], ['S1', true], ['L1', true], ['TL', true], ['CS', true]]);
    expect(sp(r[0].detail)).toBe('2 291,40 € − 98,36 € = 2 193,04 € ; net à payer imprimé : 2 193,04 €.');
    expect(r.find((x) => x.code === 'L1').titre).toBe('Cotisations : base × taux = montant (7 lignes).');
    expect(r.find((x) => x.code === 'TL').titre).toContain('4 lignes');
    expect(r.some((x) => x.code === 'B3')).toBe(false);
  });
  it('net à payer incohérent : jamais un constat (acompte, saisie, 2e ligne d\'impôt possibles) ; bulletin non « OK » ; tolérance de 2 centimes', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, netAPayer: 2140 })], identite: ID });
    expect(a.constats).toEqual([]);
    expect(a.parPiece.a.regles.find((x) => x.code === 'B1')).toMatchObject({ ok: null, titre: 'Net à payer et impôt prélevé' });
    expect(a.parPiece.a.regles.some((x) => x.ok === true)).toBe(false);   // aucune règle « respectée » publiée : pas « OK »
    expect(reglesInternes({ ...AOUT, netAPayer: 2193.06 }).find((x) => x.code === 'B1').ok).toBe(true);
    expect(TOLERANCES.net).toBe(0.02);
  });
  it('valeur absente = règle non applicable, jamais un écart', () => {
    expect(reglesInternes({ ...AOUT, impotMontant: null }).map((x) => x.code)).toEqual(['N1', 'S1', 'L1', 'TL', 'CS']);
    expect(reglesInternes({})).toEqual([]);
    expect(reglesInternes(null)).toEqual([]);
  });
  it('B2, L1, S1, C2 : règles listées quand elles tiennent, jamais un constat quand elles ne tiennent pas (ok = null)', () => {
    expect(reglesInternes({ ...AOUT, impotMontant: 98.3, netAPayer: 2193.1 }).find((x) => x.code === 'B2').ok).toBe(true);
    const cas = [
      { ...AOUT, impotMontant: 128.36, netAPayer: 2163.04 },              // régularisation du prélèvement : B2 non concluante
      avecLigne(AOUT, 1, { montant: 163.55 }),                              // une ligne : assiette ou colonne voisine possible
      { ...AOUT, tauxHoraire: 21.4501 },                                     // horaire du contrat lu pour les heures payées possible
      { ...AOUT, periode: '2026-01', cumulBrut: 3712.48, cumulNetImposable: 2341.8 },
    ];
    for (const v of cas) {
      const a = analyserBulletins({ pieces: [piece('a', v)], identite: ID });
      expect(a.constats).toEqual([]);
      expect(a.parPiece.a.regles.every((r) => r.ok !== false)).toBe(true);
      expect(a.parPiece.a.regles.some((r) => r.ok === null)).toBe(true);
    }
    const s1 = analyserBulletins({ pieces: [piece('a', { ...AOUT, tauxHoraire: 21.4501 })], identite: ID }).parPiece.a.regles.find((r) => r.ok === null);
    expect(s1).toMatchObject({ code: 'S1', titre: 'Salaire de base : heures × taux horaire', ok: null });
  });
  it('S1 : 151,67 h × taux imprimé à 2 ou 4 décimales toléré', () => {
    expect(reglesInternes({ ...AOUT, salaireBase: 2500, tauxHoraire: 16.48, brut: 2500, totalCotisations: 208.6, netAvantImpot: 2291.4 }).find((x) => x.code === 'S1').ok).toBe(true);
    expect(reglesInternes({ ...AOUT, heures: 151.67, tauxHoraire: 12.02, salaireBase: 1823.03 }).find((x) => x.code === 'S1').ok).toBe(true);
  });
  it('TL : taux de CSG différent du taux légal 2026 (régime général : vieillesse à 6,90 %), source Urssaf ; jamais hors 2026', () => {
    const v = avecLigne(AOUT, 5, { taux: 5.8, montant: 175.14 });
    const tl = reglesInternes(v).find((x) => x.code === 'TL');
    expect(tl).toMatchObject({ ok: false, titre: 'Le taux salarial de « CSG déductible de l\'impôt sur le revenu » diffère du taux légal 2026 (CSG déductible).', detail: 'Taux imprimé : 5,8 % ; taux légal : 6,8 %.' });
    expect(tl.source.url).toContain('urssaf.fr');
    expect(reglesInternes({ ...v, periode: '2025-12' }).some((x) => x.code === 'TL')).toBe(false);
  });
  it('TL : vieillesse ou Alsace-Moselle hors norme (Mayotte, régimes spéciaux) → jamais un constat', () => {
    for (const v of [avecLigne(AOUT, 1, { taux: 5.9, montant: 174.05 }), avecLigne(AOUT, 1, { taux: 4.1, montant: 120.95 })]) {
      const a = analyserBulletins({ pieces: [piece('a', v)], identite: ID });
      expect(a.constats).toEqual([]);
      expect(a.parPiece.a.regles.find((r) => r.code === 'TL')).toMatchObject({ ok: null, titre: 'Taux légaux des cotisations' });
    }
  });
  it('CS : assiette CSG non déductible inférieure à l\'assiette déductible (plusieurs chiffres), source BOSS', () => {
    const cs = reglesInternes(avecLigne(AOUT, 6, { base: 1519.69, montant: 44.07 })).find((x) => x.code === 'CS');
    expect(cs).toMatchObject({ ok: false, titre: 'L\'assiette de la CSG non déductible est inférieure à celle de la CSG déductible.' });
    expect(cs.source.url).toContain('boss.gouv.fr');
  });
  it('catégories de lignes : revenus de remplacement exclus (CSG 6,2 % sur indemnités)', () => {
    expect(categorieLigne('CSG déductible')).toBe('csgd');
    expect(categorieLigne('CSG non déductible')).toBe('csgnd');
    expect(categorieLigne('CSG déductible sur indemnités activité partielle')).toBeNull();
    expect(categorieLigne('Sécurité sociale déplafonnée')).toBe('vd');
    expect(categorieLigne('Maladie régime local Alsace-Moselle')).toBe('als');
    expect(categorieLigne('CSG/CRDS non déductible sur heures supplémentaires')).toBe('csghs');
  });
});

describe('garde-fou de lecture : une erreur de lecture ne produit jamais de constat', () => {
  it('quorum : moins de 2 égalités d\'ancrage tenues → aucune règle (valeurs lues seulement)', () => {
    const seulsNets = { lisible: true, periode: '2026-08', netAvantImpot: 2291.4, impotMontant: 98.36, netAPayer: 2140, impotBase: 2341.8, impotTaux: 4.2 };
    expect(reglesInternes(seulsNets)).toEqual([]);
    const a = analyserBulletins({ pieces: [piece('a', seulsNets)], identite: ID });
    expect(a.constats).toEqual([]);
    expect(a.parPiece.a).toMatchObject({ etat: 'lu', lectureIncertaine: true });
  });
  it('un seul chiffre lu de travers (net à payer 2 793,04 au lieu de 2 193,04) : pas de constat, règle rangée à part', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, netAPayer: 2793.04 })], identite: ID });
    expect(a.constats).toEqual([]);
    expect(a.parPiece.a.incertaines.map((x) => x.code)).toContain('B1');
  });
  it('virgule déplacée, chiffres inversés, signe perdu : pas de constat', () => {
    for (const v of [{ ...AOUT, impotMontant: 983.6, netAPayer: 2193.04 }, { ...AOUT, brut: 2590 }, avecLigne(AOUT, 3, { montant: 92.39 }), { ...AOUT, lignes: LIGNES.map((l, i) => (i === 5 ? { ...l, base: -3019.69 } : l)) }]) {
      expect(analyserBulletins({ pieces: [piece('a', v)], identite: ID }).constats).toEqual([]);
    }
  });
  it('ligne de cotisation sautée, libellés décalés, ligne entre le total et le net non lue : pas de constat', () => {
    const saute = { ...AOUT, lignes: LIGNES.filter((_, i) => i !== 2) };
    const decale = { ...AOUT, lignes: LIGNES.map((l, i) => ({ ...l, libelle: i + 1 < LIGNES.length ? LIGNES[i + 1].libelle : '' })) };
    const sansAutre = { ...AOUT, netAvantImpot: 2196.9, netAPayer: 2098.54 };   // titres-restaurant (94,50 €) non lus
    for (const v of [saute, decale, sansAutre]) expect(analyserBulletins({ pieces: [piece('a', v)], identite: ID }).constats).toEqual([]);
    expect(reglesInternes(sansAutre).some((x) => x.code === 'N1')).toBe(false);   // N1 : ancre seulement
  });
  it('N1 tient avec les lignes entre le total et le net (somme ± de ces lignes)', () => {
    const v = { ...AOUT, autresLignes: [{ libelle: 'Titres-restaurant', montant: -94.5 }, { libelle: 'Transport', montant: 44.4 }], netAvantImpot: 2241.3, netAPayer: 2142.94 };
    expect(reglesInternes(v).find((x) => x.code === 'N1').ok).toBe(true);
  });
  it('taux d\'une autre ligne (lignes décalées) ou plusieurs taux hors norme : pas de constat TL', () => {
    expect(reglesInternes(avecLigne(AOUT, 1, { taux: 0.4, montant: 11.8 })).some((x) => x.code === 'TL' && !x.ok)).toBe(false);
    const deux = avecLigne(avecLigne(AOUT, 1, { taux: 5.9, montant: 174.05 }), 2, { taux: 0.3, montant: 8.85 });
    expect(reglesInternes(deux).some((x) => x.code === 'TL' && !x.ok)).toBe(false);
  });
  it('cumul : jamais un constat (colonne voisine, bulletin complémentaire, période mal lue) ; le bulletin n\'est pas « OK »', () => {
    const un = analyserBulletins({ pieces: [piece('a', AOUT), piece('s', { ...SEPT, cumulBrut: 27550 })], identite: ID });
    expect(un.constats).toEqual([]);
    const plusieurs = analyserBulletins({ pieces: [piece('a', AOUT), piece('s', { ...SEPT, cumulBrut: 28150.75 })], identite: ID });
    expect(plusieurs.constats).toEqual([]);
    expect(plusieurs.parPiece.s.regles.find((r) => r.code === 'CB')).toMatchObject({ ok: null, titre: 'Cumul brut avec le mois précédent' });
    expect(plusieurs.parPiece.s.regles.some((r) => r.ok === true)).toBe(false);
  });
  it('cumul égal au montant du mois hors janvier (colonne du mois lue) : ignoré', () => {
    const a = analyserBulletins({ pieces: [piece('a', AOUT), piece('s', { ...SEPT, cumulBrut: 2950 })], identite: ID });
    expect(a.constats).toEqual([]);
    expect(a.parPiece.s.regles.some((r) => r.code === 'CB')).toBe(false);
  });
  it('nom à une lettre près, SIRET ou date d\'entrée à un chiffre près : pas de constat', () => {
    expect(analyserBulletins({ pieces: [piece('a', { ...AOUT, salarie: 'ROTH-SCHALLEP Kévin' })], identite: ID }).constats).toEqual([]);
    expect(analyserBulletins({ pieces: [piece('a', AOUT)], identite: ID, siretDeclare: '00000000300014' }).constats).toEqual([]);
    const c = { id: 'c', nom: 'contrat.pdf', type: 'contrat', ia: { lu: { lisible: true, dateDebut: '2023-09-07', siret: '00000000200014' } } };
    expect(analyserBulletins({ pieces: [piece('a', AOUT), c], identite: ID }).constats).toEqual([]);
  });
  it('mesure seulement : gardeFou=false rend les constats bruts', () => {
    expect(analyserBulletins({ pieces: [piece('a', { ...AOUT, netAPayer: 2793.04 })], identite: ID, gardeFou: false }).constats.map((c) => c.code)).toEqual(['B1']);
  });
  it('variantes de lecture : chiffre remplacé, inversion, virgule, signe', () => {
    const v = variantesLecture(2193.04);
    for (const x of [2793.04, 2913.04, 21930.4, 219.304, -2193.04, 2193.4]) expect(v).toContain(x);
    expect(v).not.toContain(2140);
    expect(variantesChiffres('202608').has('201608')).toBe(true);
  });
});

describe('analyse du dossier', () => {
  it('trois bulletins consécutifs et cohérents : « sans écart », cumuls vérifiés, aucun constat', () => {
    const a = analyserBulletins({ pieces: [piece('j', JUIL), piece('a', AOUT), piece('s', SEPT)], identite: ID, siretDeclare: '000 000 002 00014', recuLe: '2026-10-11' });
    expect(a.constats).toEqual([]);
    expect(Object.values(a.parPiece).map((p) => p.etat)).toEqual(['sans_ecart', 'sans_ecart', 'sans_ecart']);
    expect(a.parPiece.s.regles.find((r) => r.code === 'B4')).toMatchObject({ ok: true });
    expect(a.parPiece.s.regles.find((r) => r.code === 'CB')).toMatchObject({ ok: true });
  });
  it('scénario D : net à payer et cumul incohérents → aucun constat, pièces « non vérifiables » (ok null), règles cohérentes non publiées', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, netAPayer: 2140 }), piece('s', { ...SEPT, cumulNetImposable: 17905.2 })], identite: ID, recuLe: '2026-10-11' });
    expect(a.constats).toEqual([]);
    expect(a.parPiece.a.regles.map((r) => [r.code, r.ok])).toContainEqual(['B1', null]);
    expect(a.parPiece.s.regles.map((r) => [r.code, r.ok])).toContainEqual(['B4', null]);
    expect(a.parPiece.a.etat).toBe('lu'); expect(a.parPiece.s.etat).toBe('lu');
  });
  it('identité et SIRET : nom différent, SIRET différent (SIREN déclaré comparé au SIREN lu)', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, salarie: 'DURAND Paul', siret: '99999999900017' })], identite: ID, siretDeclare: '000000002' });
    expect(a.constats.map((c) => c.code)).toEqual(['B6', 'B6']);
    const b = analyserBulletins({ pieces: [piece('a', AOUT)], identite: ID, siretDeclare: '000000002' });
    expect(b.constats).toEqual([]);
  });
  it('périodes : mois manquant entre deux bulletins ; bulletin le plus récent trop ancien', () => {
    const a = analyserBulletins({ pieces: [piece('j', JUIL), piece('s', SEPT)], identite: ID, recuLe: '2026-10-11' });
    expect(a.constats.find((c) => c.code === 'B5').titre).toBe('Bulletins : période absente entre les bulletins reçus (août 2026).');
    const b = analyserBulletins({ pieces: [piece('j', JUIL)], identite: ID, recuLe: '2026-12-20' });
    expect(b.constats.find((c) => c.code === 'B5').titre).toBe('Bulletins : le plus récent porte sur juillet 2026.');
  });
  it('contrat (page 1) : date d\'entrée différente de celle du bulletin', () => {
    const a = analyserBulletins({ pieces: [piece('a', AOUT), { id: 'c', nom: 'contrat.pdf', type: 'contrat', ia: { lu: { lisible: true, dateDebut: '2023-10-02', siret: '00000000200014' } } }], identite: ID });
    expect(a.constats.map((c) => c.code)).toEqual(['B7']);
    expect(a.parPiece.c.etat).toBe('lu');
  });
  it('lecture illisible, erreur, pas encore lue : aucun constat', () => {
    const a = analyserBulletins({ pieces: [piece('x', { lisible: false }), { id: 'y', nom: 'y', type: 'bulletin', ia: { erreur: 'unavailable' } }, { id: 'z', nom: 'z', type: 'bulletin' }], identite: ID });
    expect(a.constats).toEqual([]);
    expect([a.parPiece.x.etat, a.parPiece.y.etat, a.parPiece.z.etat]).toEqual(['illisible', 'ia_erreur', 'ia_non_lancee']);
  });
  it('les corrections du bailleur priment sur la lecture et relancent les règles', () => {
    const ia = { lu: { ...AOUT, netAPayer: 2140 }, corrections: { netAPayer: { avant: 2140, apres: 2193.04, le: '2026-10-13' } } };
    expect(valeursRetenues(ia).netAPayer).toBe(2193.04);
    expect(analyserBulletins({ pieces: [{ id: 'a', nom: 'a', type: 'bulletin', ia }], identite: ID }).constats).toEqual([]);
    expect(valeursRetenues({ lu: { netAPayer: 1 }, corrections: { netAPayer: null } }).netAPayer).toBeNull();
  });
  it('lignes bornées (40) : au-delà, total non comparé à la somme', () => {
    const v = valeursRetenues({ lu: { ...AOUT, lignes: Array.from({ length: 45 }, () => LIGNES[0]) } });
    expect(v.lignes.length).toBe(LIGNES_MAX); expect(v.lignesTronquees).toBe(true);
    expect(valeursRetenues({ lu: { ...AOUT, lignes: 'x', autresLignes: [null, { montant: 'a' }, { montant: 3 }] } })).toMatchObject({ lignes: [], autresLignes: [3] });
  });
  it('aucun mot de jugement, chaque constat a une source', () => {
    const a = analyserBulletins({ pieces: [piece('j', { ...JUIL, salarie: 'X Y', siret: '11111111111116' }), piece('s', { ...avecLigne(SEPT, 1, { taux: 5.9, montant: 174.05 }), netAPayer: 1, impotMontant: 900, cumulNetImposable: 1, cumulBrut: 91.5 }),
      { id: 'c', nom: 'c', type: 'contrat', ia: { lu: { lisible: true, dateDebut: '2020-01-01', siret: '22222222222222' } } }], identite: ID, siretDeclare: '00000000200014', recuLe: '2027-03-01' });
    expect(a.constats.length).toBeGreaterThanOrEqual(3);
    for (const c of a.constats) { expect(c.titre + c.detail).not.toMatch(INTERDITS); expect(c.source).toBeTruthy(); }
  });
  it('rapide : six bulletins analysés en moins de 300 ms', () => {
    const t0 = Date.now();
    analyserBulletins({ pieces: [JUIL, AOUT, SEPT, { ...AOUT, netAPayer: 2793.04 }, { ...SEPT, brut: 2590 }, avecLigne(AOUT, 1, { montant: 163.55 })].map((v, i) => piece('p' + i, v)), identite: ID });
    expect(Date.now() - t0).toBeLessThan(300);
  });
});

describe('saisie des corrections', () => {
  it('montants, périodes, dates, SIRET ; saisie vide = valeur effacée ; saisie invalide refusée', () => {
    expect(lireSaisie('netAPayer', '2 193,04 €')).toEqual({ ok: true, valeur: 2193.04 });
    expect(lireSaisie('impotTaux', '4,2 %')).toEqual({ ok: true, valeur: 4.2 });
    expect(lireSaisie('tauxHoraire', '19,4501')).toEqual({ ok: true, valeur: 19.4501 });
    expect(lireSaisie('periode', '08/2026')).toEqual({ ok: true, valeur: '2026-08' });
    expect(lireSaisie('periode', '2026-8')).toEqual({ ok: true, valeur: '2026-08' });
    expect(lireSaisie('periode', '13/2026').ok).toBe(false);
    expect(lireSaisie('dateEntree', '4/9/2023')).toEqual({ ok: true, valeur: '2023-09-04' });
    expect(lireSaisie('siret', '000 000 002 00014')).toEqual({ ok: true, valeur: '00000000200014' });
    expect(lireSaisie('siret', '123').ok).toBe(false);
    expect(lireSaisie('netAPayer', '')).toEqual({ ok: true, valeur: null });
    expect(lireSaisie('netAPayer', 'abc').ok).toBe(false);
  });
  it('champs corrigeables : les nouvelles valeurs lues (heures, taux horaire, salaire de base, total des cotisations, cumul brut)', () => {
    const k = CHAMPS_BULLETIN.map(([c]) => c);
    for (const c of ['heures', 'tauxHoraire', 'salaireBase', 'totalCotisations', 'cumulBrut']) { expect(k).toContain(c); expect(NUMERIQUES).toContain(c); }
  });
  it('libellés', () => {
    expect(libellePeriode('2026-08')).toBe('août 2026'); expect(libellePeriode('x')).toBe('');
    expect(euros(null)).toBe('—');
  });
});

describe('relecture du 14/10 (Opus) : liste des mois absents bornée', () => {
  it('année mal lue (2016 au lieu de 2026) et trou réel : titre court', () => {
    const a = analyserBulletins({ pieces: [piece('x', { ...JUIL, periode: '2016-07' }), piece('s', SEPT)], identite: ID });
    const t = a.constats.find((c) => c.code === 'B5').titre;
    expect(t).toMatch(/ et 1\d\d autres\)\.$/);
    expect(t.length).toBeLessThan(200);
  });
  it('année mal lue sans autre trou (2016 au lieu de 2026, mois consécutifs) : pas de constat B5', () => {
    const a = analyserBulletins({ pieces: [piece('x', { ...JUIL, periode: '2016-07' }), piece('a', AOUT)], identite: ID });
    expect(a.constats.filter((c) => c.code === 'B5')).toEqual([]);
  });
});

describe('relecture adverse Opus du 16/10 : une valeur juste prise dans une case voisine ne produit jamais de constat', () => {
  const sans = (v, extra = {}) => analyserBulletins({ pieces: [piece('a', v)], identite: ID, recuLe: '2026-10-10', ...extra }).constats;
  it('nets et prélèvement : net à payer lu sur le net avant impôt, net avant impôt lu sur le net social, impôt lu sur le taux ou la base', () => {
    for (const v of [{ ...AOUT, netAPayer: 2291.4 }, { ...AOUT, netAvantImpot: 2312.6 }, { ...AOUT, impotMontant: 4.2 }, { ...AOUT, impotMontant: 2341.8 }, { ...AOUT, impotBase: 1441.8 }]) expect(sans(v)).toEqual([]);
  });
  it('lignes : colonne patronale (taux et montant), assiette lue sur le brut, montant 0 d\'un apprenti', () => {
    for (const v of [avecLigne(AOUT, 1, { taux: 8.55, montant: 252.23 }), { ...AOUT, lignes: LIGNES.map((l, i) => (i === 1 ? { ...l, taux: 8.55 } : l)) },
      { ...AOUT, lignes: LIGNES.map((l, i) => (i === 5 ? { ...l, base: 2950 } : l)) }, { ...AOUT, lignes: LIGNES.map((l, i) => (i === 6 ? { ...l, base: 2950 } : l)) },
      { ...AOUT, lignes: LIGNES.map((l, i) => (i === 1 ? { ...l, montant: 0 } : l)) }]) expect(sans(v)).toEqual([]);
  });
  it('heures du contrat (169 h), cumul lu 0, colonne du cumul voisine en janvier, champ rendu à 0', () => {
    for (const v of [{ ...AOUT, heures: 169 }, { ...AOUT, cumulBrut: 0 }, { ...AOUT, periode: '2026-01', cumulBrut: 2341.8, cumulNetImposable: 2341.8 }, { ...AOUT, impotMontant: 0 }]) expect(sans(v)).toEqual([]);
  });
  it('impôt à 0 € confirmé par un taux de 0 % : B1 respectée publiée (bulletin « OK »)', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, impotTaux: 0, impotMontant: 0, netAPayer: 2291.4, impotBase: 2341.8 })], identite: ID });
    expect(a.constats).toEqual([]);
    expect(a.parPiece.a.regles.find((r) => r.code === 'B1').ok).toBe(true);
  });
  it('B5 : un bulletin sans quorum a bien été reçu (aucun mois réputé absent)', () => {
    const aoutPartiel = { lisible: true, periode: '2026-08', netAvantImpot: 2291.4, impotMontant: 98.36, netAPayer: 2193.04 };
    const a = analyserBulletins({ pieces: [piece('j', JUIL), piece('a', aoutPartiel), piece('s', SEPT)], identite: ID, recuLe: '2026-10-10' });
    expect(a.constats).toEqual([]);
    expect(a.parPiece.a.lectureIncertaine).toBe(true);
  });
  it('changement d\'employeur en cours d\'année (date d\'entrée dans le mois, SIRET non lu) : cumuls non comparés', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, siret: null }), piece('s', { ...SEPT, siret: null, employeur: 'Autre SAS', dateEntree: '2026-09-01', cumulBrut: 2950, cumulNetImposable: 2318.4 })], identite: ID });
    expect(a.constats).toEqual([]);
  });
  it('B6 : siège déclaré, établissement sur le bulletin (même SIREN) ; B7 : jour et mois inversés', () => {
    expect(analyserBulletins({ pieces: [piece('a', AOUT)], identite: ID, siretDeclare: '00000000299991' }).constats).toEqual([]);
    const c = { id: 'c', nom: 'contrat.pdf', type: 'contrat', ia: { lu: { lisible: true, dateDebut: '2023-04-09', siret: '00000000200014' } } };
    expect(analyserBulletins({ pieces: [piece('a', AOUT), c], identite: ID }).constats).toEqual([]);
  });
  it('B6 (pilotage) : comparaison de nom indéterminée → ok null (« Non lu »), jamais « concordant »', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, salarie: '—' })], identite: ID });
    expect(a.parPiece.a.regles.find((r) => r.code === 'B6')).toMatchObject({ ok: null, titre: 'Nom du salarié' });
    expect(analyserBulletins({ pieces: [piece('a', AOUT)], identite: ID }).parPiece.a.regles.find((r) => r.code === 'B6').ok).toBe(true);
  });
  it('entrées abîmées : aucune exception (pièce nulle, période non textuelle, date de réception invalide)', () => {
    expect(() => analyserBulletins({ pieces: [null, piece('a', { ...AOUT, periode: 202608, dateEntree: 5 })], identite: ID, recuLe: 'pas une date' })).not.toThrow();
  });
});

describe('affichage (etatPiece de verif-pieces, main v15.749) : règles non concluantes = « Non lu », jamais « À vérifier »', () => {
  it('erreur de lecture ou net incohérent : « Non vérifiable » ; taux de CSG faux : « À vérifier » ; bulletin cohérent : « OK »', async () => {
    const VP = await import('../../js/core/verif-pieces.js');
    const doc = { id: 'a', parentType: 'candidat', category: 'revenus', pieceType: 'I.D.2', mime: 'application/pdf', verifIa: { lu: {} } };
    const lecture = analyserBulletins({ pieces: [piece('a', { ...AOUT, netAPayer: 2291.4 })], identite: ID }).parPiece.a;
    const e1 = VP.etatPiece({ doc, verif: null, ia: lecture, iaLue: true });
    expect(e1.etat).not.toBe('averif');
    expect(e1.lignes.some((l) => /^Non lu : net à payer et impôt prélevé/i.test(l.texte))).toBe(true);
    const ecart = analyserBulletins({ pieces: [piece('a', avecLigne(AOUT, 5, { taux: 5.8, montant: 175.14 }))], identite: ID }).parPiece.a;
    expect(VP.etatPiece({ doc, verif: null, ia: ecart, iaLue: true }).etat).toBe('averif');
    const net = analyserBulletins({ pieces: [piece('a', { ...AOUT, netAPayer: 2140 })], identite: ID }).parPiece.a;
    expect(VP.etatPiece({ doc, verif: null, ia: net, iaLue: true }).etat).toBe('nonverif');
    expect(VP.etatPiece({ doc, verif: null, ia: analyserBulletins({ pieces: [piece('a', AOUT)], identite: ID }).parPiece.a, iaLue: true }).etat).toBe('ok');
  });
});

describe('seconde relecture adverse Opus du 16/10 : pratiques légitimes et lectures plausibles', () => {
  const constats = (pieces, extra = {}) => analyserBulletins({ pieces, identite: ID, recuLe: '2026-10-10', ...extra }).constats;
  it('août lu « 2026-06 » (un chiffre) entre juillet et septembre : aucun mois réputé absent, aucun constat de cumul', () => {
    expect(constats([piece('j', JUIL), piece('a', { ...AOUT, periode: '2026-06' }), piece('s', SEPT)])).toEqual([]);
  });
  it('cumul lu dans une colonne voisine du tableau des cumuls (plafond SS) : aucun constat', () => {
    expect(constats([piece('j', JUIL), piece('a', { ...AOUT, cumulBrut: 32040 }), piece('s', SEPT)])).toEqual([]);
  });
  it('acompte ou saisie après le prélèvement, régularisation du prélèvement sur une 2e ligne : aucun constat', () => {
    expect(constats([piece('a', { ...AOUT, netAPayer: 1693.04 })])).toEqual([]);
    expect(constats([piece('a', { ...AOUT, netAPayer: 2156.04 })])).toEqual([]);
  });
  it('CSG/CRDS sur heures sup. abrégées « HS » (9,20 %) ; taux effectif imprimé 6,681 % sur base = brut : aucun constat de taux', () => {
    const hs = { ...AOUT, lignes: [...LIGNES, { libelle: 'CSG non déductible sur HS', base: 98.25, taux: 9.2, montant: 9.04 }], totalCotisations: 667.64, netAvantImpot: 2282.36, netAPayer: 2184 };
    expect(constats([piece('a', hs)])).toEqual([]);
    const eff = avecLigne(AOUT, 5, { base: 2950, taux: 6.681, montant: 197.09 });
    expect(constats([piece('a', eff)])).toEqual([]);
  });
  it('trou réel attesté par les cumuls (juillet et septembre seulement) : B5 maintenu', () => {
    expect(constats([piece('j', JUIL), piece('s', SEPT)]).map((c) => c.code)).toEqual(['B5']);
  });
});
