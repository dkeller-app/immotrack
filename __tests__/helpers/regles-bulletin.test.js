// __tests__/helpers/regles-bulletin.test.js — VERIF-DOCUMENTS lot 3 : règles de cohérence des bulletins de salaire,
// appliquées aux valeurs lues par l'IA (et corrigées par le bailleur). Données fictives.
import { describe, it, expect } from 'vitest';
import { reglesInternes, analyserBulletins, valeursRetenues, lireSaisie, libellePeriode, euros, TOLERANCES } from '../../js/core/regles-bulletin.js';

const INTERDITS = /fraude|frauduleu|\bfaux\b|fausse|falsifi|suspect|douteu|(?<!véri)fiable|truqu|mensong|\bscore\b/i;
const AOUT = { lisible: true, periode: '2026-08', salarie: 'ROTH-SCHALLER Kévin', employeur: 'THR Logistique', siret: '00000000200015', dateEntree: '2023-09-04',
  brut: 2950, netSocial: 2312.6, netAvantImpot: 2291.4, impotBase: 2341.8, impotTaux: 4.2, impotMontant: 98.36, netAPayer: 2193.04, netImposable: 2341.8, cumulNetImposable: 15610.4 };
const SEPT = { ...AOUT, periode: '2026-09', netImposable: 2312.6, cumulNetImposable: 17923 };
const JUIL = { ...AOUT, periode: '2026-07', cumulNetImposable: 13268.6 };
const piece = (id, lu, extra = {}) => ({ id, nom: id + '.pdf', type: 'bulletin', ia: { le: '2026-10-13T09:16:00Z', lu }, ...extra });
const ID = { nom: 'Roth-Schaller', prenom: 'Kévin' };

describe('règles internes (R3243-1, arrêté du 25/02/2016)', () => {
  it('bulletin cohérent : B1, B2, B3 satisfaites', () => {
    const r = reglesInternes(AOUT);
    expect(r.map((x) => [x.code, x.ok])).toEqual([['B1', true], ['B2', true], ['B3', true]]);
    expect(r[0].detail).toBe('2 291,40 € − 98,36 € = 2 193,04 € ; net à payer imprimé : 2 193,04 €.');
  });
  it('net à payer incohérent : écart chiffré ; tolérance de 2 centimes', () => {
    const r = reglesInternes({ ...AOUT, netAPayer: 2140 });
    expect(r[0]).toMatchObject({ code: 'B1', ok: false });
    expect(r[0].detail).toContain('écart : 53,04 €');
    expect(reglesInternes({ ...AOUT, netAPayer: 2193.06 })[0].ok).toBe(true);
    expect(reglesInternes({ ...AOUT, netAPayer: 2193.07 })[0].ok).toBe(false);
    expect(TOLERANCES.net).toBe(0.02);
  });
  it('valeur absente = règle non applicable, jamais un écart', () => {
    expect(reglesInternes({ ...AOUT, impotMontant: null }).map((x) => x.code)).toEqual(['B3']);
    expect(reglesInternes({})).toEqual([]);
    expect(reglesInternes(null)).toEqual([]);
  });
  it('impôt : arrondi toléré (10 centimes) ; net social au-dessus du brut relevé', () => {
    expect(reglesInternes({ ...AOUT, impotMontant: 98.3, netAPayer: 2193.1 }).find((x) => x.code === 'B2').ok).toBe(true);
    expect(reglesInternes({ ...AOUT, impotMontant: 120, netAPayer: 2171.4 }).find((x) => x.code === 'B2').ok).toBe(false);
    expect(reglesInternes({ ...AOUT, netSocial: 3100 }).find((x) => x.code === 'B3').ok).toBe(false);
  });
});

describe('analyse du dossier', () => {
  it('trois bulletins consécutifs et cohérents : « sans écart », cumuls vérifiés, aucun constat', () => {
    const a = analyserBulletins({ pieces: [piece('j', JUIL), piece('a', AOUT), piece('s', SEPT)], identite: ID, siretDeclare: '000 000 002 00015', recuLe: '2026-10-11' });
    expect(a.constats).toEqual([]);
    expect(Object.values(a.parPiece).map((p) => p.etat)).toEqual(['sans_ecart', 'sans_ecart', 'sans_ecart']);
    expect(a.parPiece.s.regles.find((r) => r.code === 'B4')).toMatchObject({ ok: true });
  });
  it('scénario D : net à payer et cumul incohérents → constats sourcés, état « Écart relevé » sur les pièces concernées', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, netAPayer: 2140 }), piece('s', { ...SEPT, cumulNetImposable: 17905.2 })], identite: ID, recuLe: '2026-10-11' });
    expect(a.constats.map((c) => [c.code, c.pieceId])).toEqual([['B1', 'a'], ['B4', 's']]);
    expect(a.constats[1].titre).toBe('Bulletin septembre 2026 : le cumul net imposable ne prolonge pas celui du bulletin de août 2026.');
    expect(a.constats[1].detail).toBe('Cumul de août 2026 15 610,40 € + net imposable 2 312,60 € = 17 923,00 € ; cumul imprimé 17 905,20 €. Écart : 17,80 €.');
    expect(a.parPiece.a.etat).toBe('ecart'); expect(a.parPiece.s.etat).toBe('ecart');
  });
  it('identité et SIRET : nom différent, SIRET différent (SIREN déclaré comparé au SIREN lu)', () => {
    const a = analyserBulletins({ pieces: [piece('a', { ...AOUT, salarie: 'DURAND Paul', siret: '99999999900011' })], identite: ID, siretDeclare: '000000002' });
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
    const a = analyserBulletins({ pieces: [piece('a', AOUT), { id: 'c', nom: 'contrat.pdf', type: 'contrat', ia: { lu: { lisible: true, dateDebut: '2023-10-02', siret: '00000000200015' } } }], identite: ID });
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
  it('aucun mot de jugement, chaque constat a une source', () => {
    const a = analyserBulletins({ pieces: [piece('j', { ...JUIL, salarie: 'X Y', siret: '11111111111111' }), piece('s', { ...SEPT, netAPayer: 1, impotMontant: 900, netSocial: 99999, cumulNetImposable: 1 }),
      { id: 'c', nom: 'c', type: 'contrat', ia: { lu: { lisible: true, dateDebut: '2020-01-01', siret: '22222222222222' } } }], identite: ID, siretDeclare: '00000000200015', recuLe: '2027-03-01' });
    expect(a.constats.length).toBeGreaterThanOrEqual(8);
    for (const c of a.constats) { expect(c.titre + c.detail).not.toMatch(INTERDITS); expect(c.source).toBeTruthy(); }
  });
});

describe('saisie des corrections', () => {
  it('montants, périodes, dates, SIRET ; saisie vide = valeur effacée ; saisie invalide refusée', () => {
    expect(lireSaisie('netAPayer', '2 193,04 €')).toEqual({ ok: true, valeur: 2193.04 });
    expect(lireSaisie('impotTaux', '4,2 %')).toEqual({ ok: true, valeur: 4.2 });
    expect(lireSaisie('periode', '08/2026')).toEqual({ ok: true, valeur: '2026-08' });
    expect(lireSaisie('periode', '2026-8')).toEqual({ ok: true, valeur: '2026-08' });
    expect(lireSaisie('periode', '13/2026').ok).toBe(false);
    expect(lireSaisie('dateEntree', '4/9/2023')).toEqual({ ok: true, valeur: '2023-09-04' });
    expect(lireSaisie('siret', '000 000 002 00015')).toEqual({ ok: true, valeur: '00000000200015' });
    expect(lireSaisie('siret', '123').ok).toBe(false);
    expect(lireSaisie('netAPayer', '')).toEqual({ ok: true, valeur: null });
    expect(lireSaisie('netAPayer', 'abc').ok).toBe(false);
  });
  it('libellés', () => {
    expect(libellePeriode('2026-08')).toBe('août 2026'); expect(libellePeriode('x')).toBe('');
    expect(euros(null)).toBe('—');
  });
});
