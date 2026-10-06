/**
 * Tests loc-display — helpers présentation Biens/Locataires
 * (ARCHI-FICHES-UNIFIED v15.224 P3-O — couverture audit)
 */

import { describe, it, expect } from 'vitest';
import { avatarInitials, echeanceInfo, bailProgressPct, isBailPresent } from './loc-display.js';

// ─── avatarInitials ────────────────────────────────────────────────
describe('avatarInitials — filtre civilités', () => {
  it('"M. DUPONT Jean" → "DJ" (filtre M.)', () => {
    expect(avatarInitials('M. DUPONT Jean')).toBe('DJ');
  });

  it('"Mme MARTIN Sophie" → "MS" (filtre Mme)', () => {
    expect(avatarInitials('Mme MARTIN Sophie')).toBe('MS');
  });

  it('"Dr. DUPONT" → "DU" (filtre Dr., un seul nom restant)', () => {
    expect(avatarInitials('Dr. DUPONT')).toBe('DU');
  });

  it('"M DUPONT" (sans point) → "DU"', () => {
    expect(avatarInitials('M DUPONT')).toBe('DU');
  });

  it('"Mlle X" → "XX" (un caractère, dédoublé)', () => {
    expect(avatarInitials('Mlle X')).toBe('X');
  });

  it('"Mr Smith" → "SM"', () => {
    expect(avatarInitials('Mr Smith')).toBe('SM');
  });

  it('"Pr. EINSTEIN Albert" → "EA"', () => {
    expect(avatarInitials('Pr. EINSTEIN Albert')).toBe('EA');
  });

  it('Cas pathologique "M. Mme DUPONT Jean" → "DJ" (filtres multiples)', () => {
    expect(avatarInitials('M. Mme DUPONT Jean')).toBe('DJ');
  });

  it('Vide → "?"', () => {
    expect(avatarInitials('')).toBe('?');
    expect(avatarInitials(null)).toBe('?');
    expect(avatarInitials(undefined)).toBe('?');
  });

  it('Que des civilités → "?"', () => {
    expect(avatarInitials('M. Mme')).toBe('?');
  });

  it('Sans civilité — "DUPONT Jean" → "DJ"', () => {
    expect(avatarInitials('DUPONT Jean')).toBe('DJ');
  });

  it('Sans civilité — un seul nom "DUPONT" → "DU"', () => {
    expect(avatarInitials('DUPONT')).toBe('DU');
  });

  it('Casse de sortie majuscule', () => {
    expect(avatarInitials('dupont jean')).toBe('DJ');
  });

  it('Espaces multiples normalisés', () => {
    expect(avatarInitials('  M.   DUPONT   Jean  ')).toBe('DJ');
  });
});

// ─── echeanceInfo ──────────────────────────────────────────────────
// BAUX-ECHUS — echeanceInfo délègue à LA règle du type (js/core/bail-echeance.js), comme l'app.
describe('echeanceInfo — vert/orange/rouge + NaN safe (règle du type)', () => {
  const AUJ = '2026-10-06';
  const E = (b, fdFn) => echeanceInfo(b, fdFn, AUJ);

  it('bail null → pastille vide (pas de « Tacite reconduction » sur un lot vacant)', () => {
    expect(E(null)).toEqual({ cls: 'muted', text: '', urgent: false });
  });

  it('bail sans début ni fin → « Échéance non renseignée »', () => {
    expect(E({})).toEqual({ cls: 'muted', text: 'Échéance non renseignée', urgent: false });
    expect(E({ fin: '' }).text).toBe('Échéance non renseignée');
    expect(E({ fin: null }).text).toBe('Échéance non renseignée');
  });

  it('bail fin dans 365 j → ok (vert) ; dans 45 j → warn (orange) + urgent', () => {
    expect(E({ fin: '2027-10-06' })).toMatchObject({ cls: 'ok', urgent: false });
    const r = E({ fin: '2026-11-20' });
    expect(r).toMatchObject({ cls: 'warn', urgent: true });
    expect(r.text).toBe('20/11/2026 (45j)');
  });

  it('bail NU / SANS type / MEUBLÉ échu → tacite reconduction (art. 10, art. 25-7 al. 3)', () => {
    expect(E({ type: 'nu', fin: '2026-10-01' }).text).toBe('Tacite reconduction');
    expect(E({ fin: '2026-10-01' }).text).toBe('Tacite reconduction');
    expect(E({ type: 'meuble', fin: '2025-09-01' }).text).toBe('Tacite reconduction');
  });

  it('bail ÉTUDIANT / MOBILITÉ échu → « Arrivé à terme » (jamais reconduit)', () => {
    expect(E({ type: 'etudiant', fin: '2026-10-01' })).toEqual({ cls: 'err', text: 'Arrivé à terme (01/10/2026)', urgent: true });
    expect(E({ type: 'mobilite', fin: '2026-10-01' }).text).toBe('Arrivé à terme (01/10/2026)');
  });

  it("bail GARAGE de l'app échu → reconduit par son contrat ; garage repris → arrivé à terme", () => {
    expect(E({ type: 'garage', debut: '2025-10-01', fin: '2026-09-30', signatures: { signedAt: '2026-09-10T10:00:00Z' } }).text).toBe('Tacite reconduction');
    expect(E({ type: 'garage', debut: '2025-10-01', fin: '2026-09-30' }).cls).toBe('err');   // jamais signé : contrat à vérifier
    expect(E({ type: 'garage', typeContrat: 'repris', debut: '2025-10-01', fin: '2026-09-30' }).cls).toBe('err');
  });

  it('bail type inconnu/legacy (importé) échu → traité comme nu (tacite reconduction)', () => {
    expect(E({ type: 'colocation', fin: '2026-10-01' }).text).toBe('Tacite reconduction');
  });

  it('date invalide → warn ⚠ Date invalide (PAS ok silencieux)', () => {
    const r = E({ fin: 'pas-une-date' });
    expect(r.cls).toBe('warn');
    expect(r.urgent).toBe(true);
    expect(r.text).toContain('Date invalide');
  });

  it('utilise fdFn formatter si fourni', () => {
    expect(E({ fin: '2027-10-06' }, iso => `[${iso}]`).text).toBe('[2027-10-06]');
  });
});

// ─── bailProgressPct ───────────────────────────────────────────────
describe('bailProgressPct — % bail écoulé', () => {
  const ymd = d => d.toISOString().slice(0, 10);
  const ms = days => days * 86400000;

  it('bail sans debut ou fin → null', () => {
    expect(bailProgressPct({})).toBe(null);
    expect(bailProgressPct({ debut: '2026-01-01' })).toBe(null);
    expect(bailProgressPct({ fin: '2027-01-01' })).toBe(null);
  });

  it('bail null → null', () => {
    expect(bailProgressPct(null)).toBe(null);
  });

  it('bail commence dans le futur → 0', () => {
    const future = new Date(Date.now() + ms(30));
    const futurePlus = new Date(Date.now() + ms(365));
    expect(bailProgressPct({ debut: ymd(future), fin: ymd(futurePlus) })).toBe(0);
  });

  it('bail entièrement passé → 100', () => {
    const past = new Date(Date.now() - ms(365));
    const pastPlus = new Date(Date.now() - ms(30));
    expect(bailProgressPct({ debut: ymd(past), fin: ymd(pastPlus) })).toBe(100);
  });

  it('bail en cours, ~50% écoulé', () => {
    const past = new Date(Date.now() - ms(365));
    const future = new Date(Date.now() + ms(365));
    const pct = bailProgressPct({ debut: ymd(past), fin: ymd(future) });
    expect(pct).toBeGreaterThanOrEqual(48);
    expect(pct).toBeLessThanOrEqual(52);
  });

  it('dates invalides → null', () => {
    expect(bailProgressPct({ debut: 'x', fin: 'y' })).toBe(null);
    expect(bailProgressPct({ debut: '2026-01-01', fin: 'invalid' })).toBe(null);
  });

  it('fin <= debut → null (pas de progression possible)', () => {
    expect(bailProgressPct({ debut: '2027-01-01', fin: '2026-01-01' })).toBe(null);
    expect(bailProgressPct({ debut: '2027-01-01', fin: '2027-01-01' })).toBe(null);
  });
});

// ─── isBailPresent — occupation logement (vacance) ──────────────────
// v15.343 BUG-STATUT-TACITE : un logement n'est vacant que si le bail est
// absent / supprimé / clôturé / résilié. Une simple échéance dépassée
// (tacite reconduction OU échu réel) ne rend PAS le logement vacant.
describe('isBailPresent — bail présent = logement NON vacant', () => {
  const ymd = d => d.toISOString().slice(0, 10);
  const daysFromNow = days => ymd(new Date(Date.now() + days * 86400000));

  it('bail nu fin PASSÉE non clôturé → présent (PAS vacant) [tacite reconduction]', () => {
    expect(isBailPresent({ type: 'nu', fin: daysFromNow(-30), locataire: 'X' })).toBe(true);
  });

  it('bail étudiant fin passée (échu réel) non clôturé → présent (échu ≠ vacant)', () => {
    expect(isBailPresent({ type: 'etudiant', fin: daysFromNow(-30), locataire: 'X' })).toBe(true);
  });

  it('bail fin future → présent', () => {
    expect(isBailPresent({ type: 'nu', fin: daysFromNow(365) })).toBe(true);
  });

  it('bail clôturé → absent (vacant)', () => {
    expect(isBailPresent({ type: 'nu', fin: daysFromNow(-30), cloture: true })).toBe(false);
  });

  it('bail avec finEffective (résilié) → absent (vacant)', () => {
    expect(isBailPresent({ type: 'nu', finEffective: daysFromNow(-10) })).toBe(false);
  });

  it('bail supprimé (_deleted) → absent', () => {
    expect(isBailPresent({ type: 'nu', _deleted: true })).toBe(false);
  });

  it('bail null/undefined → absent', () => {
    expect(isBailPresent(null)).toBe(false);
    expect(isBailPresent(undefined)).toBe(false);
  });
});
