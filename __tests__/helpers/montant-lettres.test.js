// __tests__/helpers/montant-lettres.test.js
// BUG LÉGAL (repéré 01/09/2026, smoke éditeur de quittance) : la quittance F-001
// (670,00 €) écrivait « la somme de 670,00 € – Six-cent soixante euros » — or 670
// s'écrit « six cent soixante-DIX ». Montant en lettres FAUX de 10 € sur un document
// que l'article 21 de la loi n° 89-462 rend opposable au bailleur.
//
// Cause : le tableau des dizaines de `numToWords` (et de sa copie `nw`) ne gérait pas
// les cas spéciaux français 70-79 / 90-99 (soixante-dix, soixante et onze,
// quatre-vingt-dix…). Deux implémentations divergentes (hyphens vs espaces) en plus.
//
// Correctif : une SEULE conversion FR entier→lettres correcte (orthographe
// traditionnelle : espaces autour de cent/mille, « et un » pour 21/31/…/71, accords
// de cent/vingt), réutilisée par `numToWords` et `nw` (DRY).
import { describe, it, expect } from 'vitest';
import { nombreEnLettres, montantEnLettres } from './montant-doc.js';

describe('nombreEnLettres — entier → lettres (FR traditionnel)', () => {
  it('0 à 16 (formes irrégulières)', () => {
    expect(nombreEnLettres(0)).toBe('zéro');
    expect(nombreEnLettres(1)).toBe('un');
    expect(nombreEnLettres(7)).toBe('sept');
    expect(nombreEnLettres(11)).toBe('onze');
    expect(nombreEnLettres(16)).toBe('seize');
  });

  it('17-19 (dix-sept…)', () => {
    expect(nombreEnLettres(17)).toBe('dix-sept');
    expect(nombreEnLettres(18)).toBe('dix-huit');
    expect(nombreEnLettres(19)).toBe('dix-neuf');
  });

  it('20-29 : « et un » seulement à 21', () => {
    expect(nombreEnLettres(20)).toBe('vingt');
    expect(nombreEnLettres(21)).toBe('vingt et un');
    expect(nombreEnLettres(22)).toBe('vingt-deux');
    expect(nombreEnLettres(29)).toBe('vingt-neuf');
  });

  it('30/40/50/60 : « et un » à X1', () => {
    expect(nombreEnLettres(31)).toBe('trente et un');
    expect(nombreEnLettres(40)).toBe('quarante');
    expect(nombreEnLettres(51)).toBe('cinquante et un');
    expect(nombreEnLettres(61)).toBe('soixante et un');
    expect(nombreEnLettres(68)).toBe('soixante-huit');
  });

  it('70-79 : soixante-dix / soixante et onze (LE bug)', () => {
    expect(nombreEnLettres(70)).toBe('soixante-dix');
    expect(nombreEnLettres(71)).toBe('soixante et onze');
    expect(nombreEnLettres(72)).toBe('soixante-douze');
    expect(nombreEnLettres(76)).toBe('soixante-seize');
    expect(nombreEnLettres(77)).toBe('soixante-dix-sept');
    expect(nombreEnLettres(79)).toBe('soixante-dix-neuf');
  });

  it('80-89 : quatre-vingts (s) puis quatre-vingt-un (ni s ni « et »)', () => {
    expect(nombreEnLettres(80)).toBe('quatre-vingts');
    expect(nombreEnLettres(81)).toBe('quatre-vingt-un');
    expect(nombreEnLettres(82)).toBe('quatre-vingt-deux');
    expect(nombreEnLettres(89)).toBe('quatre-vingt-neuf');
  });

  it('90-99 : quatre-vingt-dix / quatre-vingt-onze (pas de « et »)', () => {
    expect(nombreEnLettres(90)).toBe('quatre-vingt-dix');
    expect(nombreEnLettres(91)).toBe('quatre-vingt-onze');
    expect(nombreEnLettres(97)).toBe('quatre-vingt-dix-sept');
    expect(nombreEnLettres(99)).toBe('quatre-vingt-dix-neuf');
  });

  it('centaines : cent invariable à 1, accord au pluriel final', () => {
    expect(nombreEnLettres(100)).toBe('cent');
    expect(nombreEnLettres(101)).toBe('cent un');
    expect(nombreEnLettres(180)).toBe('cent quatre-vingts');
    expect(nombreEnLettres(200)).toBe('deux cents');
    expect(nombreEnLettres(201)).toBe('deux cent un');
    expect(nombreEnLettres(280)).toBe('deux cent quatre-vingts');
    expect(nombreEnLettres(300)).toBe('trois cents');
    expect(nombreEnLettres(671)).toBe('six cent soixante et onze');
    expect(nombreEnLettres(670)).toBe('six cent soixante-dix');
  });

  it('milliers : mille invariable, « un mille » interdit', () => {
    expect(nombreEnLettres(1000)).toBe('mille');
    expect(nombreEnLettres(1001)).toBe('mille un');
    expect(nombreEnLettres(1671)).toBe('mille six cent soixante et onze');
    expect(nombreEnLettres(2000)).toBe('deux mille');
    expect(nombreEnLettres(80000)).toBe('quatre-vingt mille');   // vingt perd son s devant mille
    expect(nombreEnLettres(100000)).toBe('cent mille');
    expect(nombreEnLettres(200000)).toBe('deux cent mille');     // cent perd son s devant mille
    expect(nombreEnLettres(999999)).toBe(
      'neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf');
  });

  it('millions / milliards : accord de cent/vingt devant le nom, s au pluriel', () => {
    expect(nombreEnLettres(1000000)).toBe('un million');
    expect(nombreEnLettres(2000000)).toBe('deux millions');
    expect(nombreEnLettres(2000200)).toBe('deux millions deux cents');
    expect(nombreEnLettres(200000000)).toBe('deux cents millions'); // cent garde s devant « millions »
    expect(nombreEnLettres(1000000000)).toBe('un milliard');
    expect(nombreEnLettres(2000000000)).toBe('deux milliards');
  });

  it('entrées non entières / chaînes : arrondi et parse tolérant', () => {
    expect(nombreEnLettres(669.6)).toBe('six cent soixante-dix'); // arrondi
    expect(nombreEnLettres('671')).toBe('six cent soixante et onze');
    expect(nombreEnLettres('1 234')).toBe('mille deux cent trente-quatre');
    expect(nombreEnLettres('')).toBe('');
    expect(nombreEnLettres(null)).toBe('');
    expect(nombreEnLettres(undefined)).toBe('');
    expect(nombreEnLettres('abc')).toBe('');
  });
});

describe('montantEnLettres — montant → « X euro(s) [et Y centime(s)] » (contrat de numToWords)', () => {
  it('le cas du bug F-001 : 670,00 €', () => {
    expect(montantEnLettres(670)).toBe('Six cent soixante-dix euros');
  });

  it('singulier / zéro', () => {
    expect(montantEnLettres(1)).toBe('Un euro');
    expect(montantEnLettres(0)).toBe('Zéro euro');
    expect(montantEnLettres(2)).toBe('Deux euros');
    expect(montantEnLettres(80)).toBe('Quatre-vingts euros');
  });

  it('centimes : « et » + accord singulier/pluriel', () => {
    expect(montantEnLettres(0.01)).toBe('Zéro euro et un centime');
    expect(montantEnLettres(671.5)).toBe('Six cent soixante et onze euros et cinquante centimes');
    expect(montantEnLettres(2.99)).toBe('Deux euros et quatre-vingt-dix-neuf centimes');
    expect(montantEnLettres(1234.56)).toBe('Mille deux cent trente-quatre euros et cinquante-six centimes');
  });

  it('arrondi au centime + négatif', () => {
    expect(montantEnLettres(0.005)).toBe('Zéro euro et un centime'); // 0,005 → arrondi 0,01
    expect(montantEnLettres(-5)).toBe('moins Cinq euros');
  });

  it('vide / null / NaN → chaîne vide (contrat préservé pour les appelants)', () => {
    expect(montantEnLettres('')).toBe('');
    expect(montantEnLettres(null)).toBe('');
    expect(montantEnLettres(undefined)).toBe('');
    expect(montantEnLettres('abc')).toBe('');
  });
});
