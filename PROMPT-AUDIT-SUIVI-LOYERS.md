# PROMPT — Nouvelle session : AUDIT COMPLET du suivi des loyers / retard / dû / IRL, PUIS propositions

Tu reprends le projet **Propryo** (ex-ImmoTrack), une PWA de gestion locative en **vanilla JS** :
`index.html` (~50 000 lignes, inline) + modules ES dans `js/core/`. Déployée sur
`https://dkeller-app.github.io/immotrack/` (GitHub Pages sert la branche `main`).

**Livraison** : worktree git `C:/tmp/wt-finbuild` → `git push origin HEAD:main`.
Le clone `C:\Users\Did_K\Desktop\Immo` est **périmé** (~loin derrière origin/main) : ne
jamais y pousser `main`. Toujours livrer depuis le worktree, rebasé sur `origin/main`.

## ⛔ ORDRE STRICT — NE PAS INVERSER
1. **AUDIT COMPLET d'abord** (toi + agent `superpowers:code-reviewer`). Ne touche à AUCUN code.
2. **REPRODUIRE** chaque bug avec un scénario seedé, expliquer la **cause racine**.
3. **PROPOSER** des solutions cohérentes (design, pas patch) et **attendre ma validation**.
4. Seulement après : implémenter en **TDD**, **mockup-first** pour tout visuel, **audit
   code-reviewer obligatoire** avant de dire « prêt à tester ».

Je ne veux PAS une Nième rustine. Je veux qu'on **comprenne le système en entier** avant d'agir.

## Ce qui ne va pas (symptômes réels, observés dans MES données)
- **Un locataire (Fric) est noté « en retard depuis mars »** alors qu'il paie. Retard de
  l'ordre de ~5 €/mois → ça sent l'écart de **révision IRL** appliqué à tort.
- **L'IRL semble appliquée rétroactivement** : des mois AVANT la date de révision affichent
  le loyer révisé (courant) au lieu de l'ancien.
- **Le dû affiché n'est pas celui de la période** : loyer/locataire COURANT au lieu de ceux
  qui étaient en place à ce mois-là (surtout après un changement de locataire / re-bail).
- **Les charges ne sont pas correctement gérées** (provisions dues vs encaissées incohérentes).
- Le popup « cause du retard » a été bricolé plusieurs fois (scope mois/année, nom, etc.).

## Ce que JE VEUX (règles métier, non négociables)
- **Date de départ du retard = PREMIER VERSEMENT du lot** (début du suivi), jamais avant.
- **P&L = pas de report** : chaque colonne mensuelle montre le mois lui-même (pas de cumul
  running). L'annuel = somme des mois.
- **Dû d'un mois = loyer ET locataire EN PLACE À CETTE PÉRIODE** (bail actif du mois + loyer
  en vigueur alors, IRL **historisée**). Le loyer d'un mois passé ne doit JAMAIS être le loyer
  courant révisé.
- **Un VRAI historique des loyers** : chaque révision IRL et chaque changement de locataire
  doit être tracé de façon fiable et **visible** (je veux pouvoir le voir et le corriger).
- **Cohérence dû ↔ quittance** : ce que le retard compte comme « dû » doit être exactement ce
  que la quittance facture au locataire pour ce mois. Une divergence = un faux retard.
- **Charges** gérées proprement, par période, avec le bon dû de charges.

## Périmètre technique à auditer (chaîne complète)
Comprends d'abord le **modèle de données** et comment chaque champ est peuplé :
`DB.baux`, `DB.baux_historique`, `DB.irlHistorique`, `DB.logements`, `DB.mouvements`.

Puis la chaîne du **dû** :
- `_finBailHcChAt(qui, ym)` (index.html) → **borné au 1er versement** via `_getLogementStartMi`
- → `_getActiveBailHcChProratedSplit` (index.html) → `_loyerProrataMoisSplit` (js/core/utils.js)
- → `_loyerHCAtDate` (js/core/utils.js) qui lit `DB.irlHistorique` (wrapper `main.js` ajoute l'historique)
- IRL : `computeIRLRevision` (index.html), enregistrement dans `DB.irlHistorique` (index.html ~24743, batch ~45666)

Les **moteurs** (purs, testés en Vitest) :
- `js/core/loyer-statut.js` : `_computeLoyerChargeAlloc` (cascade loyer→charges→avance),
  `_computeLoyerArrears` (arriérés + résidu par mois + cause FIFO)
- `js/core/finances-monthly.js` : `_computeFinancesMonthly` (le sous-P&L mensuel)

Le **rendu** et les **drills** (index.html) :
- `_finRenderPLv2` (tableau P&L, sous-lignes retard/avance orange/bleu)
- `_finDrillRetard` / `_finDrillAvance` / `_finLotNomAt` (popups « cause »)

## Changements RÉCENTS à auditer d'un œil CRITIQUE (v15.466→478)
Ils ont été livrés en série, possiblement **incohérents entre eux** — remets tout à plat :
- sous-lignes retard/avance orange cliquables + drills « cause » par-locataire ;
- retard par mois = **résidu** (pas cumul), annuel = somme ;
- `_finBailHcChAt` **borné au 1er versement** (`_getLogementStartMi`, mémoïsé) ;
- cascade **monthHasDue** (un paiement sur un mois sans dû ≠ avance) ;
- **tolérance début de mois** (mois courant neutralisé avant le 10) ;
- `_finLotNomAt` (nom du bail de la période) ;
- `_loyerHCAtDate` **ref tolérante** (trim+minuscule).
Réserves d'audit connues non traitées : doublon inline `_loyerHCAtDate` (index.html ~4330)
resté **strict** (parité file://) ; création de logement (index.html ~19521) en ref stricte.

## Attendus de l'AUDIT (livrable écrit avant toute proposition)
1. Le **modèle de données** du loyer dans le temps : où vit le loyer d'un mois donné (bail courant
   vs archivé vs irlHistorique), qui l'écrit, quand, et où ça peut se désynchroniser.
2. La **cause racine** de « Fric en retard depuis mars », reproduite par un scénario seedé
   (bail + révision IRL + paiements). Est-ce un dû IRL rétroactif ? un dû ≠ quittance ? un
   problème de date d'application (mois anniversaire = ancien ou nouveau loyer) ? les deux ?
3. La **cohérence dû ↔ quittance ↔ Suivi des loyers ↔ Finances** : ces 4 surfaces utilisent-elles
   le même dû ? où divergent-elles ?
4. Un inventaire des **incohérences** entre les changements récents (retard résidu vs cascade
   cumulative, bornage 1er versement vs baux archivés, tolérance, etc.).
5. Les **trous du modèle** : révision IRL sans date, changement de locataire sans clôture (bail
   non archivé), refs désynchronisées. Que faire des données déjà cassées.

## Puis : PROPOSER (attendre ma validation avant de coder)
- Un **design cohérent** du dû par période (source de vérité unique du loyer d'un mois),
  du retard (par mois, non cumulé, borné au 1er versement, dû = quittance) et de l'historique
  visible/corrigeable.
- Options chiffrées quand il y a un choix (ex. mois anniversaire IRL = ancien ou nouveau loyer,
  sémantique légale à trancher AVEC moi).
- Mockups pour tout ce qui est visuel.

## Règles gravées (non négociables — voir la mémoire du projet)
- **Audit par agent `superpowers:code-reviewer` AVANT tout « prêt à tester »** — mes tests
  Vitest/grep/parse ne suffisent JAMAIS pour un livrable sensible (fiscal, dû, sync).
- **Pas de solution passable** : refonte propre plutôt que compromis temporaire.
- **Mockup-first** pour tout visuel/UX (HTML A/B/C × PC/tablette/téléphone, validé avant code).
- **TDD** : test rouge d'abord, puis code minimal.
- **Fiscal** : la base 2044 est **à l'encaissement** (Σ ligne 211 brut `cr-db`) — ne JAMAIS la
  casser ; c'est indépendant du split loyer/charges/avance.
- **DRY**, **sandbox-first**, **responsive 3 formats**, **design system respecté**.
- Versioning : bump `v15.X` dans index.html (title + footer) **et** `sw.js` (`immotrack-v15.X`)
  à **origin+1** à chaque livraison. **Scan noncaractères OBLIGATOIRE** avant push (U+FFFF /
  U+FFFE / U+FDD0-FDEF / (c&0xFFFF)===0xFFFF|0xFFFE cassent le build Jekyll → site figé).
- Livraison : `git fetch origin -q ; git rebase --autostash origin/main ; [résoudre les conflits
  de version] ; git push origin HEAD:main`. Une session parallèle bump souvent → collisions de version fréquentes.
- Le **preview navigateur intégré était instable** (timeouts) la session précédente : prévoir un
  repli par **harness Node** pour tester les fonctions pures + demander à l'utilisateur de vérifier
  le rendu réel sur l'app déployée.

## Contexte mémoire
Lis la mémoire projet (`C:\Users\Did_K\.claude\projects\C--Users-Did-K-Desktop-Immo\memory\MEMORY.md`
et les fichiers liés, notamment le suivi des loyers, la persistance, le partage SCI). Le WHY du
produit = **la simplicité** (« gérer son parc doit être simple »), pas seulement la 2044.

---
**Commence par l'audit. Ne propose rien avant de l'avoir écrit. Ne code rien avant que je valide.**
