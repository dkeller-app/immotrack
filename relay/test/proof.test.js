import { describe, it, expect } from 'vitest';
import { formatDateFr, buildMentionLines, buildProofObject } from '../public/sign/proof.js';

describe('formatDateFr', () => {
  it('formate un ISO en date+heure FR', () => {
    const s = formatDateFr('2026-06-02T14:30:00.000Z');
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('buildMentionLines', () => {
  const lines = buildMentionLines({ signerName: 'Jean Dupont', role: 'locataire', dateISO: '2026-06-02T14:30:00.000Z' });
  it('mentionne le signataire, « Lu et approuvé » et le consentement', () => {
    const joined = lines.join(' \n ');
    expect(joined).toContain('Jean Dupont');
    expect(joined).toContain('Lu et approuvé');
    expect(joined.toLowerCase()).toContain('électronique');
    expect(joined).toMatch(/2026/);
  });
  it('retourne un tableau de lignes courtes (tamponnables)', () => {
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.every((l) => typeof l === 'string' && l.length <= 60)).toBe(true);
  });
});

describe('buildProofObject', () => {
  it('assemble les items de preuve côté client', () => {
    const p = buildProofObject({
      signerName: 'Jean Dupont', role: 'locataire', sigId: 'loc-0',
      dateISO: '2026-06-02T14:30:00.000Z', consentElectronic: true, luApprouve: true
    });
    expect(p).toMatchObject({
      sigId: 'loc-0', signerName: 'Jean Dupont', role: 'locataire',
      consentElectronic: true, luApprouve: true, signedAt: '2026-06-02T14:30:00.000Z'
    });
  });
});
