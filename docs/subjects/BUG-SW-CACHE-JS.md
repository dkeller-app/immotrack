# BUG-SW-CACHE-JS — Service Worker cache les modules JS sans invalidation

**Status** : ⬜ À faire · **Prio** : **P0** (bloquant pour livraison) · **Taille** : XS (~30 min)
**Détecté** : 2026-05-18 (user : « tu cherches pourquoi tes modifs ne sont pas la »)
**Lié à** : EMAIL-MODAL-UX-REFONTE, CODE-CLEANUP-AUDIT, marathon entier

## Symptôme

User a déployé v15.84 (Gmail send OK, confirm popup ajouté). En prod il voit `ImmoTrack v15.84` dans le titre mais le popup `window.confirm()` **n'apparaît pas** avant envoi. → conclusion : son navigateur sert un ancien `email-modal.js` depuis le cache du service worker.

Symptôme similaire (avoué par user lui-même 2026-05-18) : « j'ouvre l'app, j'ai l'ancien UX qui s'affiche puis le nouvel UX ». Flash de version → cache JS désynchronisé du HTML.

## Root cause (validé code)

[sw.js:4](sw.js:4) : `const CACHE_VER = 'immotrack-v31';`

Cette constante **n'a pas été bumpée depuis v15.64** (21 versions de retard). Donc :
- `index.html` = network-first avec `cache: 'no-cache'` ✅ (toujours frais)
- **Modules JS** (`js/components/email-modal.js`, `js/core/email-send.js`, etc.) tombent dans le `else` du fetch handler ([sw.js:52-55](sw.js:52)) : `cache-first` (sert ce qui est en cache, sinon network).
- Tant que `CACHE_VER` est inchangé, le SW ne nettoie pas les anciens caches → vieille version JS servie indéfiniment.

## Décisions

### Option A (quick win, P0 immédiat)
Bumper `CACHE_VER` à chaque release (au moins à chaque modif JS). Pattern : `'immotrack-v{IMMOTRACK_VERSION}'`.

### Option B (root fix, P1 ~1h)
Passer **tous les fichiers same-origin** en `network-first` (ou stale-while-revalidate). Inconvénient : pas de offline réel pour les modules JS, mais offline reste OK car l'app charge tout au boot avant d'être utilisable offline. Solution recommandée pour une PWA en évolution rapide.

### Option C (combo, recommandé)
- **A** maintenant : bumper `CACHE_VER` à v32 pour livrer la fix v15.84 chez le user
- **B** dans la foulée (même sprint) : refonte stratégie cache pour ne plus jamais avoir ce problème
- Bonus : ajouter `CACHE_VER` dans la constante `IMMOTRACK_VERSION` ou auto-bump via hook git pre-commit

## Scope

1. **Phase 1 — Patch immédiat** (5 min) : bumper `CACHE_VER` à `immotrack-v32` (ou mieux : `immotrack-v15.84` synchro avec version app)
2. **Phase 2 — Stratégie cache refondue** (~45 min) : 
   - `sw.js` : passer en network-first pour tous les `same-origin` `*.js`, `*.css`
   - Garder cache-first pour images/icons/manifest
   - Pré-cache liste statique des modules critiques au `install`
   - Tester offline réel + reload après bump
3. **Phase 3 — Auto-bump** (~15 min) :
   - `CACHE_VER` = `'immotrack-v' + IMMOTRACK_VERSION` (lue d'une source unique)
   - OU hook pre-commit qui détecte modif JS/CSS et bumpe auto

## Critères de succès

- [ ] User hard refresh une fois après deploy → toutes les futures releases sont fraîches sans hard refresh
- [ ] `window.confirm()` v15.84 s'affiche bien avant envoi mail
- [ ] Plus jamais de « flash ancien UX → nouveau UX »
- [ ] Offline reste fonctionnel (test offline mode après boot online)

## Notes utilisateur

> 💬 2026-05-18 : « tu cherches pourquoi tes modifs ne sont pas la »
> 💬 2026-05-18 (avant) : « tu ne mets pas à jour la version (qd j'ouvre l'app, j'ai l'ancien UX qui s'affiche puis le nouvel UX) »

## Journal

- 2026-05-18 : créé · P0 (bloque livraison) · cause root identifiée (`CACHE_VER` figé v31 depuis v15.64)
