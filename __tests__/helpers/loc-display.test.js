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
describe('echeanceInfo — vert/orange/rouge + NaN safe', () => {
  // Helper : crée un bail avec fin = today + n jours
  const today = new Date();
  const ymd = d => d.toISOString().slice(0, 10);
  const futureBail = days => ({ fin: ymd(new Date(today.getTime() + days * 86400000)) });

  it('bail sans fin → tacite reconduction (ok)', () => {
    expect(echeanceInfo({}).cls).toBe('ok');
    expect(echeanceInfo({}).text).toBe('Tacite reconduction');
    expect(echeanceInfo({}).urgent).toBe(false);
  });

  it('bail null → tacite reconduction', () => {
    expect(echeanceInfo(null).cls).toBe('ok');
  });

  it('bail fin dans 365j → ok (vert)', () => {
    const r = echeanceInfo(futureBail(365));
    expect(r.cls).toBe('ok');
    expect(r.urgent).toBe(false);
  });

  it('bail fin dans 45j → warn (orange) + urgent', () => {
    const r = echeanceInfo(futureBail(45));
    expect(r.cls).toBe('warn');
    expect(r.urgent).toBe(true);
    // Math.floor arrondit à 44 ou 45 selon l'heure d'exécution → tolérance
    expect(r.text).toMatch(/\(4[45]j\)/);
  });

  // ── v15.343 BUG-STATUT-TACITE : échéance dépassée = tacite reconduction
  //    (nu/meublé) et NON « échu », sauf types non reconductibles
  //    (étudiant/mobilité/garage/autre). Source : isTaciteReconductionAllowed.
  const pastBail = (days, type) => ({ type, fin: ymd(new Date(today.getTime() + days * 86400000)) });

  it('bail NU fin il y a 5j → tacite reconduction (PAS échu)', () => {
    const r = echeanceInfo(pastBail(-5, 'nu'));
    expect(r.cls).toBe('ok');
    expect(r.text).toBe('Tacite reconduction');
    expect(r.urgent).toBe(false);
  });

  it('bail SANS type fin il y a 5j → tacite reconduction (défaut nu)', () => {
    const r = echeanceInfo(futureBail(-5));
    expect(r.cls).toBe('ok');
    expect(r.text).toBe('Tacite reconduction');
  });

  it('bail MEUBLÉ fin il y a 400j → tacite reconduction', () => {
    const r = echeanceInfo(pastBail(-400, 'meuble'));
    expect(r.cls).toBe('ok');
    expect(r.text).toBe('Tacite reconduction');
  });

  it('bail ÉTUDIANT fin il y a 5j → échu réel (non reconductible)', () => {
    const r = echeanceInfo(pastBail(-5, 'etudiant'));
    expect(r.cls).toBe('err');
    expect(r.urgent).toBe(true);
    expect(r.text).toContain('Échu');
  });

  it('bail MOBILITÉ fin il y a 5j → échu réel (non reconductible)', () => {
    const r = echeanceInfo(pastBail(-5, 'mobilite'));
    expect(r.cls).toBe('err');
    expect(r.text).toContain('Échu');
  });

  it('bail GARAGE fin il y a 5j → échu réel (régime libre, pas de tacite)', () => {
    const r = echeanceInfo(pastBail(-5, 'garage'));
    expect(r.cls).toBe('err');
    expect(r.text).toContain('Échu');
  });

  it('bail type inconnu/legacy (importé) fin il y a 5j → tacite (défaut sûr, pas échu)', () => {
    // Liste noire : un type non explicitement non-reconductible → tacite reconduction.
    const r = echeanceInfo(pastBail(-5, 'colocation'));
    expect(r.cls).toBe('ok');
    expect(r.text).toBe('Tacite reconduction');
  });

  it('date invalide → warn ⚠ Date invalide (PAS ok silencieux)', () => {
    const r = echeanceInfo({ fin: 'pas-une-date' });
    expect(r.cls).toBe('warn');
    expect(r.urgent).toBe(true);
    expect(r.text).toContain('Date invalide');
  });

  it('date string null/undefined dans bail.fin', () => {
    expect(echeanceInfo({ fin: '' }).cls).toBe('ok'); // string vide = pas de fin
    expect(echeanceInfo({ fin: null }).cls).toBe('ok');
  });

  it('utilise fdFn formatter si fourni', () => {
    const fd = iso => `[${iso}]`;
    const r = echeanceInfo(futureBail(365), fd);
    expect(r.text).toContain('[');
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
