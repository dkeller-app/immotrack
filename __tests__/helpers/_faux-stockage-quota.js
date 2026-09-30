/**
 * __tests__/helpers/_faux-stockage-quota.js — un `localStorage` de laboratoire
 * qui se comporte comme celui de Chromium face au quota (CDC-STOCKAGE §3.9, G2).
 *
 * Chromium compte le stockage d'une origine en caractères UTF-16, clés ET
 * valeurs. Une écriture est refusée si `usage − ancienne valeur + nouvelle
 * valeur > quota`, avec une DOMException nommée `QuotaExceededError`. Rien de
 * plus : pas d'éviction, pas d'ordre garanti des clés.
 *
 * API identique à `Storage` (length, key, getItem, setItem, removeItem) + deux
 * outils d'observation pour les tests (`cles`, `usage`).
 */
export function fauxStockageQuota({ quota = Infinity, initial = {} } = {}) {
  const m = new Map();
  const taille = (k, v) => String(k).length + String(v).length;
  const usage = () => { let n = 0; for (const [k, v] of m) n += taille(k, v); return n; };
  const st = {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(String(k)) ? m.get(String(k)) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      const avant = m.has(k) ? taille(k, m.get(k)) : 0;
      if (usage() - avant + taille(k, v) > quota) {
        const e = new Error("Failed to execute 'setItem' on 'Storage': the quota has been exceeded.");
        e.name = 'QuotaExceededError';
        throw e;
      }
      m.set(k, v);
    },
    removeItem(k) { m.delete(String(k)); },
    cles() { return [...m.keys()]; },
    usage,
  };
  // Remplissage initial SANS contrôle de quota : c'est l'état hérité d'un compte.
  for (const [k, v] of Object.entries(initial)) m.set(k, String(v));
  return st;
}

/** Une chaîne de `n` caractères (contenu sans importance). */
export const chaine = (n, c = 'x') => c.repeat(n);
