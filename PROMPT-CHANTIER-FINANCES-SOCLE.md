# PROMPT — Session CHANTIER FINANCES · ÉTAPE 1 « SOCLE » · modèle **Fable** · dossier `C:\Users\Did_K\Desktop\Immo`

Tu es la session chantier qui pose le **socle** de la refonte Finances de Propryo (vanilla JS, monolithe `index.html`, prod = origin/main → GitHub Pages). INTERDICTION de poser des questions de cadrage : tout est décidé et écrit ; ambiguïté → option conservatrice notée au rapport.

## Ta spec = `docs/CDC-FINANCES.md` (655 lignes, VALIDÉ ligne par ligne avec Didier, versionné dans main)
Lis-le en entier avant de coder. Ton périmètre = **l'étape 1 de son §11 « Ordre de chantier »**, rien d'autre.

## PÉRIMÈTRE STRICT — modules purs seulement, ZÉRO branchement dans index.html
Un autre chantier (Biens) travaille en parallèle sur `index.html` : **tu n'y touches pas** (sauf le bump de version en toute fin). Tu écris des modules `js/core/*.js` testés, prêts à être branchés à l'étape suivante. Un module qui n'est pas encore appelé = zéro risque de régression, c'est voulu.

### Ce que tu livres
1. **Résolveur de périmètre unique (P-1, P-2, P-3)** — module `js/core/finances-scope.js` :
   - 3 crans : Tout / bailleur / immeuble (pas de cran logement).
   - **Aucun lot invisible** : paniers « Sans bailleur (à rattacher) » et « Sans immeuble (à rattacher) », sélectionnables, avec leur compte de lots (corrige les constats 13 et 21 : aujourd'hui un lot sans entité est exclu de la vacance mais compté dans l'impayé).
   - Une seule fonction de poids/appartenance destinée à être consommée par TOUS les moteurs (fin du filtrage maison par moteur, constat C7).
2. **Fenêtres nommées (F-1, F-1 v2)** — module `js/core/finances-window.js` :
   - **Fenêtre de constat** : 01/01 → dernier mois contenant un mouvement connu (un mouvement post-daté COMPTE — décision Didier « B »).
   - **Fenêtre d'exigibilité** : 01/01 → dernier mois échu (on ne peut pas être en retard sur un loyer non encore dû).
   - Libellés prêts à afficher (« Exercice 2026 · tout ce qui est saisi au 13/09 ») + drapeau « mois à venir » par colonne, pour que l'UI les grise plus tard.
   - Le comparatif N-1 doit pouvoir s'aligner sur la MÊME étendue de mois que N (fonction dédiée).
3. **Invariant I-1 testé** — le test d'anti-régression du principe directeur : *aucun chiffre calculé sur une valeur actuelle appliquée au passé*. Cas de référence du CDC : un lot à 800 € de janvier à juillet, indexé à 850 € au 1er août → **aucun chiffre de janvier à juillet ne bouge** après application de l'IRL. Écris-le comme un test réutilisable (il servira à chaque étape suivante) en t'appuyant sur `duMois`/`_duMoisLot` (`js/core/loyer-bareme.js`) qui est déjà la cible.

### Ce que tu NE fais PAS (étapes 2 à 8 du §11, plus tard)
Aucune suppression de bloc à l'écran, aucun rebranchement des 4 moteurs, aucun changement de rendu, aucune migration de catégories, aucune répartition P-4. Si tu constates un bug en passant : tu le NOTES au rapport, tu ne le corriges pas.

## Méthode
- **TDD strict** : test d'abord, puis implémentation. Ces modules seront la source de vérité de toute la page Finances — ils doivent être irréprochables.
- Réutiliser, jamais recopier : appuie-toi sur `js/core/loyer-bareme.js` (résolveur du dû), `js/core/finances-monthly.js`, `js/core/legal-bilan.js` pour comprendre les conventions ; ne duplique aucune logique existante.
- Aucune dépendance externe, aucun CDN (règle du projet).

## Exigences
- **Worktree dédié** : `git worktree add C:\Users\Did_K\Desktop\Immo-wt-finances origin/main -b feat/finances-socle`. Jamais de commit depuis `Desktop\Immo`. **Tu ne pousses pas sur main** : le pilotage intègre.
- Gates avant de conclure : `npm install` si besoin → `npx vitest run` COMPLET vert (référence actuelle : **2378 tests**) · `node scripts/check-inline-js.mjs` (5|0) · si tu touches `index.html` pour le bump : CRLF préservé, version = prochaine libre (re-fetch origin/main) sur 5 emplacements + `sw.js`. Si tu n'as touché aucun fichier de l'app, **pas de bump** — dis-le au rapport.
- **Audit `superpowers:code-reviewer`** obligatoire sur ton diff (code financier), Critiques/Importants corrigés.
- Tu ne modifies ni `BACKLOG.md`, ni `docs/CDC-*.md`, ni la mémoire.

## Rapport final (= données pour le pilotage)
Hash de tête · modules créés avec leur API publique · nombre de tests ajoutés · résultat des gates (comptes exacts) · verdict d'audit + corrections · ce que tu as constaté sans corriger · ce qui reste pour l'étape 2 (liste des points de branchement identifiés dans index.html, avec fichier:ligne). Puis : « prêt — dis "intègre finances socle" à ta session pilotage ».
