# PROMPT — Chantier FIL ROUGE COMPLET (acte → rapprochement → complétion 100 % → baux)

## Contexte (30 s)

Le fil rouge « Ajouter un bien » v15.494 s'arrête après la création : l'import d'acte finit sur un écran « Succès » cul-de-sac, il n'y a AUCUN rapprochement immeuble (« toujours créé », index.html:41696), pas de complétude au-delà du binaire louable, et pas de reprise après fermeture. Le user a validé (2026-08-08) un mockup qui soude tout : acte → rapprochement (bailleur existant + immeuble NOUVEAU) → création directe depuis la vérif (étape récap SUPPRIMÉE) → transition → fil de complétion ACCORDÉON (tâches ✓/!/○ + % global, écrans existants reliés, baux repris à vérifier / vacants à créer / vacant assumé) → pause/reprise persistée → 100 %.

## Les 3 documents de référence (dans cet ordre)

1. **Spec (design validé)** : `docs/superpowers/specs/2026-08-08-fil-rouge-complet-acte-design.md`
2. **Plan d'implémentation (9 tasks, TDD)** : `docs/superpowers/plans/2026-08-08-fil-rouge-complet-acte.md`
3. **Contrat visuel** : `mockups/fil-rouge-complet/index.html` (local gitignoré — double-clic, 7 écrans, clair/sombre × 3 formats)

## Décisions user GRAVÉES (les re-violer = reprise assurée)

- Écran vérif acte = l'écran EXISTANT COMPLET éditable (logements modifiables/ajout/suppression, occupation, annexes) — **pas de version condensée**.
- **Pas d'étape récap** : synthèse + « ✓ Tout est bon — créer » en bas de la vérif.
- Fil de complétion = **accordéon poussé** (un nœud ouvert, repli auto quand plein) — pas de liste à plat.
- Rapprochement **jamais automatique** (bailleur ET immeuble) ; picker INLINE dans le bandeau (pas de 2ᵉ overlay).
- Stoppable partout, **reprise persistée** (bandeau page Biens), rien d'obligatoire (« vacant assumé » possible), porte unique inchangée.

## Règles non négociables (mémoire projet)

- **Worktree neuf depuis `origin/main` à jour** (le clone `Desktop\Immo` est stale ; Task 0 du plan).
- **DRY absolu** : aucun formulaire recopié, on APPELLE `openNewEnt/saveEnt`, `editImm/saveImm`, `openNewLog/saveParamLog`, `openBail`, `_acteApply`, `_bienActiveBail`.
- **TEST AU VRAI CLIC avec les vraies données** (jamais d'injection/appel direct comme « vérification »).
- **Audit `superpowers:code-reviewer` AVANT « prêt à tester »**, brief incluant la FIDÉLITÉ AU MOCKUP écran par écran.
- Gates : `node scripts/check-inline-js.mjs` 0 erreur · `npx vitest run` verte · `node --check sw.js` · `index.html` reste **CRLF**.
- Mirrors `js/helpers/*.global.js` JAMAIS édités à la main (regénérer + normaliser lignes vides, bug CRLF du générateur).
- Bump version complet (title + footer + `IMMOTRACK_VERSION` + Récap DDT + `CACHE_VER` sw.js) au n° libre au-dessus d'`origin/main` ; coordination `.index-queue/QUEUE.md` ; BACKLOG.md mis à jour immédiatement à la livraison.

## Démarrage attendu

1. Lire spec + plan + ouvrir le mockup dans un navigateur (les 7 écrans, y compris les interactions : toggle occupation, accordéon, reprise).
2. Exécuter le plan task par task (superpowers:subagent-driven-development ou executing-plans), commits fréquents.
3. Livraison = parcours COMPLET vérifié au vrai clic (Task 9 Step 1) + audit fidélité + gates + bump — PUIS demander le go user pour l'intégration `origin/main`.
