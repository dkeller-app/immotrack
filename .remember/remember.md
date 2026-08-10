# Handoff

## State
Tout déployé en prod (`origin/main`, v15.465). Cette session : refonte nav (8 onglets/3 zones + menu perso, déjà live v15.456/458) + 4 bugfixes user-retest tous poussés — v15.457 (rebond login `!window.__immoSupabaseMode` + double-€ + IRL reproposées), v15.458 (bottom-nav mobile générée depuis `_V4_BOTTOM`), v15.465 (Accueil hero « Reçu » → `totalPaid` = source du donut, `index.html:8866`). Finances « pas cliquable » = **cache PWA périmé** (code sain, prouvé), pas un fix à coder. Détails : `.index-queue/QUEUE.md` (journal) + mémoire `project_hotfix_auth_irl` / `project_refonte_navigation`.

## Next
1. **Attendre les retests user** (il doit d'abord Ctrl+Shift+R / désinscrire le SW) : login, Accueil hero==widget, drill Finances, bottom-nav mobile, IRL.
2. **🚨 P0 sync cloud** ([[project_audit_sync_cloud]]) — le vrai bloqueur commercialisation, piloté par une autre session ; à reprendre si user le demande.
3. Sinon : Sauvegarde v2 (mockup validé, `backup.js` commencé ailleurs) · Notifications mail.

## Context
- Prod bouge vite (sessions parallèles). Toute modif `index.html` = worktree dédié off `origin/main` → `.index-queue/QUEUE.md` → intégration MAÎTRE en worktree jetable + **feu vert user explicite** avant push `main` (= déploiement prod GitHub Pages). Cf `docs/INDEX-COMMIT-PROTOCOL.md`.
- **Cache PWA = douleur récurrente** : le SW sert des assets périmés → rebond login ET « Finances pas cliquable » viennent de là.
- Bump 5 spots (4 index.html + sw.js CACHE_VER), sed ciblé jamais global. Audits `code-reviewer` obligatoires avant tout push sensible.
- Worktree `immo-wt-accueil` non supprimé (Permission denied, panneau navigateur le tient) — `git worktree remove ... --force` à retenter.
