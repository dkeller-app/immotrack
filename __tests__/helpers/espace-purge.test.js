import { describe, it, expect } from 'vitest'
import { confirmNameMatches, purgeUiState, purgeErrorMessage } from '../../js/core/espace-purge.js'

// RESET-CLOUD UX (quick-wins cloud 2026-07-13) — cœur PUR du « ⚠️ Vider mon espace cloud ».
// La décision (droit d'afficher, correspondance du nom, messages d'erreur RPC) est testée ici ;
// l'exécution (modale, export JSON, appel RPC purge_mon_espace, logout) vit inline dans index.html
// + supabase-entry.js. Le serveur re-vérifie TOUJOURS owner + nom (migration 0041) : ce module
// n'est qu'un confort UX, jamais la garde de sécurité.

describe('confirmNameMatches — saisie du nom exact de l\'espace (miroir du btrim serveur)', () => {
  it('correspondance exacte après trim (sémantique btrim de la RPC)', () => {
    expect(confirmNameMatches('Mon patrimoine', 'Mon patrimoine')).toBe(true)
    expect(confirmNameMatches('  Mon patrimoine  ', 'Mon patrimoine')).toBe(true)
    expect(confirmNameMatches('Mon patrimoine', '  Mon patrimoine ')).toBe(true)
  })

  it('sensible à la casse et aux accents (c\'est une confirmation, pas une recherche)', () => {
    expect(confirmNameMatches('mon patrimoine', 'Mon patrimoine')).toBe(false)
    expect(confirmNameMatches('Mon Patrimoine', 'Mon patrimoine')).toBe(false)
  })

  it('jamais de correspondance sur vide/null (même si le nom attendu était vide)', () => {
    expect(confirmNameMatches('', 'Mon patrimoine')).toBe(false)
    expect(confirmNameMatches(null, 'Mon patrimoine')).toBe(false)
    expect(confirmNameMatches(undefined, 'Mon patrimoine')).toBe(false)
    expect(confirmNameMatches('', '')).toBe(false)
    expect(confirmNameMatches('   ', '   ')).toBe(false)
    expect(confirmNameMatches('Mon patrimoine', null)).toBe(false)
  })

  it('tolère des entrées non-string sans throw (fail-safe)', () => {
    expect(confirmNameMatches(42, '42')).toBe(true)
    expect(confirmNameMatches({}, 'Mon patrimoine')).toBe(false)
  })
})

describe('purgeUiState — quels gestes afficher dans la card « Import & restauration »', () => {
  it('mode legacy/sandbox → variante legacy (bouton reset historique inchangé)', () => {
    expect(purgeUiState({ cloudMode: false, isOwner: false })).toEqual({ variant: 'legacy' })
    expect(purgeUiState({ cloudMode: false, isOwner: true })).toEqual({ variant: 'legacy' })
    expect(purgeUiState({})).toEqual({ variant: 'legacy' })
    expect(purgeUiState(null)).toEqual({ variant: 'legacy' })
  })

  it('mode cloud + owner → 2 gestes, purge espace ACTIVE', () => {
    expect(purgeUiState({ cloudMode: true, isOwner: true })).toEqual({ variant: 'cloud', canPurgeEspace: true })
  })

  it('mode cloud + invité (non-owner) → purge espace DÉSACTIVÉE (le serveur refuse de toute façon)', () => {
    expect(purgeUiState({ cloudMode: true, isOwner: false })).toEqual({ variant: 'cloud', canPurgeEspace: false })
    expect(purgeUiState({ cloudMode: true })).toEqual({ variant: 'cloud', canPurgeEspace: false })
  })
})

describe('purgeErrorMessage — erreurs RPC purge_mon_espace → message utilisateur', () => {
  it('PURGE_NOT_OWNER (garde serveur) → message propriétaire', () => {
    expect(purgeErrorMessage({ message: 'PURGE_NOT_OWNER' })).toMatch(/propriétaire/i)
  })

  it('PURGE_CONFIRM_MISMATCH (garde serveur) → message nom incorrect', () => {
    expect(purgeErrorMessage({ message: 'PURGE_CONFIRM_MISMATCH' })).toMatch(/nom/i)
  })

  it('fonction absente (migration pas appliquée) → message explicite, pas de jargon SQL brut seul', () => {
    const m = purgeErrorMessage({ message: 'Could not find the function public.purge_mon_espace' })
    expect(m).toMatch(/indisponible|serveur/i)
  })
  it('permission denied → même message « indisponible » (EXECUTE révoqué = déploiement incomplet)', () => {
    expect(purgeErrorMessage({ message: 'permission denied for function purge_mon_espace' })).toMatch(/indisponible|serveur/i)
  })

  it('erreur inconnue → préfixe générique + message technique conservé (diagnostic)', () => {
    const m = purgeErrorMessage({ message: 'TypeError: réseau' })
    expect(m).toMatch(/impossible/i)
    expect(m).toContain('TypeError: réseau')
  })

  it('erreur nulle/vide → message générique sans throw', () => {
    expect(purgeErrorMessage(null)).toMatch(/impossible/i)
    expect(purgeErrorMessage({})).toMatch(/impossible/i)
  })
})
