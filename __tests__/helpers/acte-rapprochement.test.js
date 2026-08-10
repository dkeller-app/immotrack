import { describe, it, expect } from 'vitest';
import { canonAdresse, matchImmeuble } from './acte-rapprochement.js';

const ENT = { nom: 'SCI DK PATRIMOINE', immeubles: [
  { id: 'i1', nom: '16 r. des Tilleuls — Mulhouse', adr: '16 r. des Tilleuls', codePostal: '68100', ville: 'Mulhouse' },
  { id: 'i2', nom: '14-16 rue des Tilleuls', adr: '14-16 rue des Tilleuls', codePostal: '68100', ville: 'Mulhouse' },
  { id: 'i3', nom: '8 avenue Foch', adr: '8 av. Foch', codePostal: '68100', ville: 'Mulhouse' },
] };

describe('canonAdresse', () => {
  it('normalise casse, accents, abréviations de voie et espaces', () => {
    expect(canonAdresse('16 R.  des Tilleuls')).toEqual({ num: '16', voie: 'rue des tilleuls' });
    expect(canonAdresse('16 rue des Tilleuls')).toEqual({ num: '16', voie: 'rue des tilleuls' });
    expect(canonAdresse('8 Av. Foch')).toEqual({ num: '8', voie: 'avenue foch' });
    expect(canonAdresse('12 Bd de la Marne')).toEqual({ num: '12', voie: 'boulevard de la marne' });
  });
  it('gère plage de numéros et absence de numéro', () => {
    expect(canonAdresse('14-16 rue des Tilleuls')).toEqual({ num: '14-16', voie: 'rue des tilleuls' });
    expect(canonAdresse('rue des Tilleuls')).toEqual({ num: '', voie: 'rue des tilleuls' });
  });
  it('bis/ter : « 16 bis » et « 16bis » donnent le même num', () => {
    expect(canonAdresse('16 bis rue X').num).toBe(canonAdresse('16bis rue X').num);
    expect(canonAdresse('16 bis rue X').num).toBe('16bis');
  });
});

describe('matchImmeuble', () => {
  it('identique : même n° + voie + ville après canon (abréviations comprises)', () => {
    const r = matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' });
    expect(r[0]).toMatchObject({ imm: ENT.immeubles[0], idx: 0, strength: 'identique' });
  });
  it('proche : même voie + ville, numéro différent ou plage', () => {
    const r = matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' });
    expect(r.some(m => m.imm.id === 'i2' && m.strength === 'proche')).toBe(true);
  });
  it('tri fort→faible, autres voies exclues', () => {
    const r = matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' });
    expect(r.map(m => m.strength)).toEqual(['identique', 'proche']);
    expect(r.some(m => m.imm.id === 'i3')).toBe(false);
  });
  it('ville différente ⇒ aucun match ; entité vide/nulle ⇒ []', () => {
    expect(matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: 'Colmar' })).toEqual([]);
    expect(matchImmeuble(null, { adr: 'x', ville: 'y' })).toEqual([]);
    expect(matchImmeuble({ immeubles: [] }, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' })).toEqual([]);
  });
  it('fallback nom : suffixe ville (« — Mulhouse ») retiré quand adr absent', () => {
    const ent = { immeubles: [{ id: 'i4', nom: '16 r. des Tilleuls — Mulhouse', ville: 'Mulhouse' }] };
    const r = matchImmeuble(ent, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' });
    expect(r[0]).toMatchObject({ imm: ent.immeubles[0], idx: 0, strength: 'identique' });
  });
  it('voie composée à tiret interne finissant par la ville (Petit-Mulhouse) non tronquée', () => {
    const cible = { adr: '16 Chemin du Petit-Mulhouse', ville: 'Mulhouse' };
    const avecAdr = { immeubles: [{ id: 'i5', adr: '16 Chemin du Petit-Mulhouse', ville: 'Mulhouse' }] };
    const sansAdr = { immeubles: [{ id: 'i6', nom: '16 Chemin du Petit-Mulhouse', ville: 'Mulhouse' }] };
    expect(matchImmeuble(avecAdr, cible)[0]).toMatchObject({ imm: avecAdr.immeubles[0], strength: 'identique' });
    expect(matchImmeuble(sansAdr, cible)[0]).toMatchObject({ imm: sansAdr.immeubles[0], strength: 'identique' });
  });
  it("la ville peut arriver collée au CP (champ vérif « 68100 Mulhouse »)", () => {
    const r = matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: '68100 Mulhouse' });
    expect(r[0].strength).toBe('identique');
  });
});
