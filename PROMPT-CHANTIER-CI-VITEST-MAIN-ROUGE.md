# PROMPT CHANTIER — CI-VITEST-MAIN-ROUGE (P1 dette, S)

> À coller tel quel dans une NOUVELLE session Claude Code ouverte sur `C:\Users\Did_K\Desktop\Immo`.

---

Tu attaques **CI-VITEST-MAIN-ROUGE** : le workflow GitHub Actions « Tests Vitest » échoue sur **CHAQUE push de `main` depuis ~1 mois** (356 notifications, runs #957→#967+ tous rouges, constat user 2026-08-08). Pendant ce temps les mêmes suites passent en local dans les chantiers (2180+ tests verts, gates systématiques). Le garde-fou CI ne signale donc plus rien = zéro valeur. Objectif : **main redevient VERT et le reste**.

## Setup

- **La vraie prod = `origin/main`**. Clone `Desktop\Immo` = STALE. Worktree frais depuis `origin/main`, jamais de push du main local.
- Le workflow vit dans `.github/` (sur origin/main). CLI `gh` disponible.

## Étapes

1. **Lire les logs réels** : `gh run list --workflow=<vitest> --branch=main --limit=5` puis `gh run view <id> --log-failed` sur 2-3 runs (dont un ancien, ~début de la casse) → identifier la CAUSE exacte et **la dater** (quel commit a cassé : setup Node/pnpm/npm ? dépendance native ? test qui exige `.env`/Postgres absent en CI ? timeout ? fichier gitignoré requis ?).
2. **Distinguer** : (a) workflow cassé (setup/infra) → fixer le YAML ; (b) tests qui requièrent des secrets/services absents en CI (ex. suite RLS vrai Postgres, `supabase/tests/*` avec `.env`) → les **exclure proprement du job CI** (scope Vitest explicite) SANS les affaiblir en local ; (c) vrai test rouge → le fixer, pas le skipper.
3. Reproduire le job en local avant de pousser (mêmes commandes que le YAML).
4. Livrer via branche + PR ou push direct de `.github/` selon l'ampleur (ça ne touche PAS index.html → pas de file QUEUE nécessaire) ; vérifier que le run suivant sur main est **VERT** (`gh run watch`).
5. **Bonus dans la même session (si trivial)** : ajouter un job cron quotidien « keep-alive Supabase » (1 GET authentifié anonyme sur l'API, URL+anon key publiques de `js/app/supabase-config.js`) pour empêcher la mise en pause free tier qui a causé la panne du 08/08 (`docs/subjects/P0-SUPABASE-PAUSE.md`). Pas de secret dans le YAML (anon key = déjà publique côté client). Si pas trivial → le noter, ne pas bricoler.
6. **Backlog temps réel** : résultat consigné dans `BACKLOG.md` (note CI-VITEST-MAIN-ROUGE, section « Remarques en attente ») + commit `Pilotage : …`.

## Definition of done

1. Cause racine identifiée, datée et écrite (1 paragraphe dans BACKLOG).
2. Dernier run `main` VERT, vérifié via `gh`.
3. Aucun test affaibli : la couverture locale reste identique ; ce qui est exclu du CI l'est explicitement et pour une raison documentée (services absents), pas pour « faire passer ».
4. (Si fait) keep-alive quotidien en place et 1er run vérifié.
