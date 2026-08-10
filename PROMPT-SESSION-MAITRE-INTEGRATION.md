# PROMPT SESSION MAÎTRE — Intégration file QUEUE (relay-401 en attente depuis le 17/07)

> À coller dans une NOUVELLE session Claude Code sur `C:\Users\Did_K\Desktop\Immo`.
> ⚠️ UNE SEULE session maître à la fois (règle `feedback_index_commit_coordination`).

---

Tu es la **session maître** d'intégration `index.html` → `origin/main` (protocole `docs/INDEX-COMMIT-PROTOCOL.md`, file `C:\Users\Did_K\Desktop\Immo\.index-queue\QUEUE.md`).

## État de la file au 2026-08-08

- **`fix/relay-401-liens-expires`** — ✅ **prêt à intégrer depuis le 17/07 09:40** (seule ligne en attente ; tout le reste est déjà intégré). Fix : liens de candidature expirés qui bouclaient en 401 console à vie + churn `saveDB` de fond. Diff : `index.html` + `js/core/candidature.js` + `js/main.js` + `__tests__/helpers/candidature.test.js` + `sw.js`. Gates déjà passés côté ouvrière : 12 nouveaux tests, suite 2180/2180, check-inline-js 5/0, audit code-reviewer SÛR. Commit unique **`7d720fe`** (poussé sur `origin/fix/relay-401-liens-expires`).
- Consigne d'intégration de la ligne : **cherry-pick isolé `7d720fe`**. Elle visait v15.494 sur base `424f396` (v15.493) — **origin/main est depuis passé à `b26240e` v15.494** → conflit attendu = lignes de VERSION uniquement → **renuméroter v15.495** (title + `<em>` + `IMMOTRACK_VERSION` + récap diag + `sw.js` CACHE_VER).

## Étapes

1. Worktree frais depuis `origin/main` (le clone `Desktop\Immo` est STALE — ne jamais pousser son main).
2. `git fetch origin` → vérifier le tip réel de `origin/main` et relire la ligne QUEUE (statut inchangé ✅ prêt).
3. Cherry-pick `7d720fe` ; résoudre les conflits (attendu : version uniquement) ; renuméroter v15.495 aux 5 spots ; **CRLF d'index.html préservé** (vérifier `file`/`git diff --stat`, règle mémoire : le tooling qui flippe CRLF→LF casse la parité data-defaults).
4. Gates locaux AVANT push : suite Vitest complète (2180+/2180+) · `node scripts/check-inline-js.mjs` 5/0 · `node --check sw.js` · grep rapide des symboles touchés (`candidatLinkExpire`, `partitionCandidatLinks`, `_relayPullCandidatures`).
5. Push `origin/main` (fast-forward/cherry-pick propre). Pas de re-audit complet nécessaire (déjà SÛR côté ouvrière) SAUF si les conflits ont dépassé les lignes de version → dans ce cas re-audit `superpowers:code-reviewer` ciblé.
6. Mettre à jour la ligne dans `QUEUE.md` : `✅ prêt` → `🔀 intégré v15.495 (<hash>)`.
7. **Backlog temps réel** : BACKLOG.md (le fix relay-401 est cité dans P0.2 de l'audit sync cloud, « sujet séparé, noté ») + commit `Pilotage : intégration relay-401 v15.495`.
8. Smoke : ouvrir l'app déployée (github.io, après le déploiement Pages), console F12 onglet Candidats → plus de rafale 401/warns sur les vieux liens Ferrette.

## Garde-fous

- N'intègre QUE les lignes `✅ prêt` (aucune autre aujourd'hui). Si entre-temps d'autres chantiers (edl-mobile-terrain, fil-rouge-complet, partage-edl) se sont inscrits `✅ prêt` dans la file, intègre en **FIFO** un par un, gates complets entre chaque.
- Un doute sur un conflit hors version = STOP, re-audit, jamais de résolution « au jugé » sur index.html.
