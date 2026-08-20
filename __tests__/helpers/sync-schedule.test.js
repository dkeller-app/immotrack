/**
 * __tests__/helpers/sync-schedule.test.js — chantier EDL TERRAIN, lot 1 (faille F5).
 *
 * CDC docs/CDC-EDL.md §3ter F5 et §9 invariant 19j :
 *   « Hors ligne, le nombre de tentatives réseau suit le backoff — pas une par autosave. »
 *
 * Le chiffre du CDC : autosave toutes les 2 s pendant une heure hors ligne
 * ≈ 1 800 requêtes en échec. C'est exactement ce que ce fichier mesure.
 */
import { describe, it, expect } from 'vitest';
import { planFlush, FLUSH_DEBOUNCE_MS } from '../../js/core/sync-schedule.js';

/**
 * Rejoue une heure hors ligne : une modification locale toutes les 2 s (l'autosave)
 * pendant que le moteur réessaie avec un backoff qui double de 2 s à 60 s.
 * Rend le nombre de flush RÉELLEMENT partis.
 */
function heureHorsLigne({ respecteBackoff }) {
  let now = 0;
  let hasTimer = false, flushDueAt = 0, backoffUntil = 0;
  let backoff = 2000;
  const departs = [];
  const echeance = () => hasTimer ? flushDueAt : Infinity;

  const appliquer = (r) => {
    if (r.action === 'schedule') { hasTimer = true; flushDueAt = r.at; }
    backoffUntil = respecteBackoff ? r.backoffUntil : 0;
  };

  for (let pas = 0; pas < 3600 * 1000 / 100; pas++) {   // pas de 100 ms sur 1 h
    now += 100;
    // le minuteur échu part : c'est une requête réseau, elle échoue (hors ligne)
    if (now >= echeance()) {
      departs.push(now);
      hasTimer = false; flushDueAt = 0;
      // le moteur replanifie un réessai avec son backoff
      appliquer(planFlush({ now, delay: backoff, isRetry: true, hasTimer, flushDueAt, backoffUntil }));
      backoff = Math.min(backoff * 2, 60000);
    }
    // l'autosave marque le DB modifié toutes les 2 s
    if (now % 2000 === 0) {
      appliquer(planFlush({ now, delay: FLUSH_DEBOUNCE_MS, hasTimer, flushDueAt, backoffUntil }));
    }
  }
  return departs;
}

describe('F5 — le backoff n’est plus réarmé par l’autosave', () => {
  it('une heure hors ligne : des dizaines de tentatives, pas 1 800', () => {
    const avec = heureHorsLigne({ respecteBackoff: true });
    expect(avec.length).toBeLessThan(100);
    expect(avec.length).toBeGreaterThan(5);   // le réseau est bien retenté
  });

  it('sans le plancher, c’est la tempête décrite par le CDC', () => {
    const sans = heureHorsLigne({ respecteBackoff: false });
    expect(sans.length).toBeGreaterThan(1000);
    expect(heureHorsLigne({ respecteBackoff: true }).length * 10).toBeLessThan(sans.length);
  });

  it('les tentatives s’espacent au lieu de rester collées à 800 ms', () => {
    const d = heureHorsLigne({ respecteBackoff: true });
    const dernierEcart = d[d.length - 1] - d[d.length - 2];
    expect(dernierEcart).toBeGreaterThanOrEqual(60000);
  });
});

describe('planFlush — les cas un par un', () => {
  it('une suppression en attente part tout de suite et lève le plancher', () => {
    const r = planFlush({ now: 1000, immediate: true, backoffUntil: 50000 });
    expect(r).toEqual({ action: 'run-now', at: 1000, backoffUntil: 0 });
  });

  it('une modification fraîche est debouncée à 800 ms quand rien ne bloque', () => {
    const r = planFlush({ now: 1000, hasTimer: false });
    expect(r.action).toBe('schedule');
    expect(r.at).toBe(1800);
  });

  it('une modification fraîche ne part JAMAIS avant le plancher du backoff', () => {
    const r = planFlush({ now: 1000, hasTimer: false, backoffUntil: 45000 });
    expect(r.at).toBe(45000);
    expect(r.backoffUntil).toBe(45000);
  });

  it('un réessai ne repousse pas un minuteur déjà plus proche, mais retient son plancher', () => {
    const r = planFlush({ now: 1000, delay: 60000, isRetry: true, hasTimer: true, flushDueAt: 1800, backoffUntil: 0 });
    expect(r.action).toBe('keep');
    expect(r.at).toBe(1800);
    expect(r.backoffUntil).toBe(61000);
  });

  it('un réessai sans minuteur pose l’échéance ET le plancher', () => {
    const r = planFlush({ now: 1000, delay: 8000, isRetry: true, hasTimer: false });
    expect(r).toEqual({ action: 'schedule', at: 9000, backoffUntil: 9000 });
  });

  it('un minuteur déjà plus proche est conservé, pas remplacé', () => {
    const r = planFlush({ now: 1000, hasTimer: true, flushDueAt: 1200, backoffUntil: 0 });
    expect(r.action).toBe('keep');
    expect(r.at).toBe(1200);
  });
});
