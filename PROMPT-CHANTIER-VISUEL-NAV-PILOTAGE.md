# PROMPT — Nouvelle session : CHANTIER « VISUEL NAV + REFONTE PILOTAGE/SUIVI »

Tu reprends **Propryo** (ex-ImmoTrack), PWA **vanilla JS** : `index.html` (~50 000 lignes, inline)
+ modules ES dans `js/core/`. Déployée sur `https://dkeller-app.github.io/immotrack/` (Pages sert `main`).
**Modèle : Opus 4.8** (session = 80 % audit/déduplication/archi, 20 % rendu créatif — Fable seulement
en appoint pour cracher des variantes de maquettes une fois l'archi tranchée).

---

## ⚠️ GARDE-FOU N°1 — LE CLONE LOCAL EST PÉRIMÉ (à lire avant tout)

`C:\Users\Did_K\Desktop\Immo` est une **branche divergente** : **82 commits en avant / 579 en retard**
sur `origin/main`. Conséquence directe qui casse ce chantier si on l'ignore :

- La **refonte navigation (v15.456)** avec sa source unique **`_V4_NAV_MODEL`** (→ sidebar + bottom-nav
  + feuille Plus, 8 onglets / 3 zones) **EST déployée sur `origin/main`** (`_V4_NAV_MODEL` ×6 dans
  `index.html`) mais **ABSENTE du clone local** (sidebar plate `_renderSidebarV4`, 3 surfaces maintenues
  à la main). **Toute exploration de la nav faite sur le clone local est FAUSSE pour la prod.**
- **Première action obligatoire** : créer un worktree sur `origin/main` et **y refaire l'exploration**.
  Ne jamais lire/auditer la nav depuis `C:\Users\Did_K\Desktop\Immo`.

```
git fetch origin -q
git worktree add C:/tmp/wt-visuel origin/main
# tout le travail se fait dans C:/tmp/wt-visuel
```
**Livraison** : worktree rebasé sur `origin/main` → `git push origin HEAD:main`.
**Ne JAMAIS pousser `main` depuis le clone local.**

---

## LE BRIEF UTILISATEUR (4 demandes, mot pour mot)

1. **Sous-menus visuels dépliables.** « On a regroupé différents onglets sous un seul onglet, mais
   maintenant ça manque de visuel. Je voudrais des ouvertures de sous-menus (possible de laisser ouvert)
   pour chaque onglet. »
2. **Audit comparatif** entre la **page gestionnaire** et l'**onglet Suivi** — « il y a des choses assez
   proches voire similaires. »
3. **Retrouver la trace de travail** de la page **Suivi / Suivi comptable** — « on est loin de ce que
   j'avais validé. »
4. **Proposer de vraies pages pour l'onglet Pilotage** — « on empile les choses actuellement (premium
   avec des infos de gestion, gestionnaire pas loin du suivi, premium et gestionnaire avec un sélecteur
   différent…). »

Les demandes 2-3-4 sont **le même écosystème** (Pilotage / Suivi / mode Gestionnaire du Dashboard qui se
recouvrent). La demande 1 est distincte (nav). D'où les 2 chantiers ci-dessous.

---

## COMPRÉHENSION DÉJÀ ÉTABLIE (à revérifier sur `origin/main`, numéros de ligne du clone stale)

### Le vrai doublon n'est pas « 2 pages » — c'est du code de calcul divergent + une matrice dupliquée
- **DEUX sélecteurs différents**, ce qui trouble l'utilisateur :
  - Pills **Premium ↔ Gestionnaire** (`_v4SetMode`, `DB.params.dashV4Mode`) — **sur le Tableau de bord
    uniquement**, pas sur l'onglet Pilotage. Défaut = `premium`. Le mode « Solo » a été retiré.
  - 4 **sous-onglets** internes à l'onglet Pilotage (`_setPilotageTab`) : 💰 Suivi comptable / 📋 Suivi
    documents / ⚡ Automatisations / 🏦 Prélèvements (stub). Rien à voir avec Premium/Gestionnaire.
- **« Premium affiche des infos de gestion »** = confirmé : `_renderDashV4Premium` montre l'entview par
  lot (« N lots gérés · X vacants » + statut de paiement par lot) en plus du financier.
- **« Gestionnaire pas loin du suivi »** = confirmé : le bloc **« Pilotage parc »** de
  `_renderDashV4Gestionnaire` (matrice Lot/Loyer/Bail/DPE/MRH/IRL/Quittance) **duplique** la matrice de
  l'onglet **Suivi documents** (`_rPilDocs`). Deux implémentations séparées de la même idée.
- **Duplication de calcul de dette** (le point dur, à consolider en priorité) :
  - `_pilSoldeLocataire` (colonne « Solde cumulé » du Suivi comptable) et `_calculerLoyerImpayeCumule`
    (modale Impayés) implémentent **la même formule** avec **3 divergences** (filtre catégorie loyer,
    fallback `log.hc/ch` vs `bail.hc/ch`, clip à 0 + `finEffective`) → **deux montants d'impayé
    possibles pour le même bail**. ⚠️ Recouper avec le chantier BARÈME-LOYER en cours : le résolveur
    unique `duMois()` (`js/core/`, étapes 1-2/4 livrées) est censé devenir LA source du dû — ces deux
    helpers doivent converger vers lui, **pas créer un 3ᵉ moteur**.
  - Point d'entrée « Suivi des loyers » **incohérent** : le lien du hub Finances (`_dashGoImpayes`) ouvre
    **Quittances filtrées « impayée »**, alors que le bouton « Impayés actifs » de Pilotage ouvre la
    **modale `_impayesOpenVue`**. Deux destinations pour le même intitulé.

### Ce que l'utilisateur avait VALIDÉ pour le « Suivi comptable » (demande 3)
Il y a **4 fils « suivi »** distincts — identifier lequel il vise avant de coder :
- **(a) Matrice Pilotage « Suivi comptable »** : design validé = `docs/subjects/PILOTAGE-MATRICIEL.md`
  (livré v15.07, parité Qalimo V2 : locataire × mois, DG versé/dû, solde cumulé, colonnes M-3…M).
  **MAIS** `docs/subjects/PILOTAGE-ONGLET-REFONTE.md` (02/07) note : user a dit *« onglet à revoir
  complètement »* → refonte P3 jamais faite. C'est très probablement le cœur de la demande 4.
- **(b) Onglet Finances / P&L** : mockups validés `mockups/finances/finances-tab.html` (05/06) puis
  refonte `mockups/loyer-2044-pro/pl-revise.html` (« conception validée, mockup figé », plan
  `docs/superpowers/plans/2026-06-19-pl-finances-refonte-portage.md`, portage en attente).
- **(c) Page Charges dédiée** : `docs/superpowers/specs/2026-07-11-page-charges-design.md`
  (« design validé pièce par pièce », mockup `mockups/page-charges/index.html`).
- **(d) Écran « Historique du loyer » Timeline** : variante **B validée 14/07**
  (`mockups/historique-loyer/`), **pas encore implémentée** (chantier BARÈME-LOYER étape 3).
- **Historique commits utiles** : chantier SUIVI-LOYERS-SOURCE-UNIQUE (`e81cd3e` → `a0355c8`
  « Pilotage Suivi comptable sur le moteur unique » v15.450, Phase D-matrice) + audit
  `docs/subjects/AUDIT-FINANCES-COHERENCE-2026-07-07.md` (4 moteurs, ~39 constats).

> **⚠️ Première question à trancher AVEC l'utilisateur** : quand il dit « on est loin de ce que j'avais
> validé », parle-t-il de (a) la matrice Pilotage, (b) Finances/P&L, (c) Charges, ou (d) Historique
> Timeline ? Ne pas deviner — ouvrir les 4 mockups, les lui montrer, et lui demander lequel comparer à
> l'app actuelle. Tout le chantier B en dépend.

---

## CHANTIER A — Sous-menus dépliables dans la navigation (demande 1)

**Socle** : `_V4_NAV_MODEL` existe déjà sur `origin/main` comme source unique (sidebar + bottom-nav +
feuille Plus, 8 onglets / 3 zones). **On construit DESSUS, on ne recrée pas la nav.** Ré-explorer :
`_V4_NAV_MODEL`, le rendu sidebar, et les 3 zones (Pilotage · Gestion locative · Argent) sur origin/main.

Objectif : chaque onglet qui a des sous-sections expose un **sous-menu dépliable dans la sidebar**,
**qui peut rester ouvert** (état persistant, pas un simple switch plein écran). Points de conception :
- État plié/déplié **persistant** par onglet (`DB.params` ou localStorage) — se souvenir entre sessions.
- Un **accordéon** (plusieurs onglets ouverts en même temps possible, cf. « possible de laisser ouvert »)
  vs exclusif : **à valider en mockup** avec l'utilisateur.
- Cohérence **3 formats** (PC sidebar / tablette / téléphone bottom-nav + feuille Plus) et **clair/sombre**.
- Réutiliser le CSS existant (`.v4s-…`) ; ne pas inventer un composant « à part » (design system).
- ⚠️ Un mécanisme legacy `_toggleSidebarSection` existe (ancienne sidebar) — s'en inspirer mais ne pas
  ressusciter du code mort ; brancher sur `_V4_NAV_MODEL`.

## CHANTIER B — Refonte de l'écosystème Pilotage / Suivi / Gestionnaire (demandes 2-3-4)

Dérouler dans l'ordre :
1. **Audit comparatif formel** (demande 2) : produire `docs/subjects/AUDIT-PILOTAGE-SUIVI-GESTIONNAIRE-2026-07-16.md`
   confirmant sur `origin/main` les 4 recouvrements ci-dessus (matrice dupliquée, 2 helpers de dette
   divergents, 2 destinations « suivi loyers », Premium/Gestionnaire vs sous-onglets). Chaque constat
   avec `file_path:line` réels d'origin/main.
2. **Retrouver le validé** (demande 3) : trancher (a/b/c/d) avec l'utilisateur, ouvrir le(s) mockup(s)
   validé(s), documenter l'écart validé ↔ app actuelle.
3. **Vraies pages Pilotage** (demande 4) : proposer une **architecture cible** qui **dé-empile** —
   décider quoi vit où (que devient le mode Gestionnaire du Dashboard ? fusionne-t-il avec l'onglet
   Pilotage ? Premium reste-t-il le cockpit financier ?), **une seule matrice de conformité**, **un seul
   calcul de dette** (branché sur `duMois()`), **un seul point d'entrée « suivi des loyers »**.
   → **mockups A/B/C × 3 formats × post-clic** validés AVANT toute ligne de code.

---

## RÈGLES GRAVÉES (non négociables — voir MEMORY.md)

- **Mockup-first** : tout changement visuel/UX → mockups HTML **A/B/C × PC/Tablette/Téléphone ×
  tout artefact post-clic** (drill-downs, modales, popovers…), **validation user explicite** AVANT de
  coder. Mockups dans `Desktop\Immo\mockups\{SUJET}\` (gitignoré, jamais `add -f`), double-clic `file://`.
  Tester dans un **vrai navigateur**, pas la preview.
- **DRY** : réutiliser/factoriser, **jamais recopier**. Ce chantier EST une déduplication — ne pas créer
  un moteur/matrice de plus.
- **Pas de solution passable** : refonte propre plutôt que compromis ; session dédiée si trop gros.
- **Audit `superpowers:code-reviewer` obligatoire AVANT tout « prêt à tester »** (Vitest/grep ne suffisent
  jamais), en particulier pour la consolidation des helpers de dette.
- **Choix prédéfini + ajout libre** partout où on propose des choix.
- **Icônes** = line-icons `currentColor` propres, **mais on garde la couleur** qui différencie (pastilles
  teintées, états, calendrier).
- **Penser SaaS commercial** : tous statuts/profils, extensible — pas « pour mon besoin uniquement ».
- Versioning : bump `v15.X` dans index.html (title+footer) **et** `sw.js` à **origin+1** à chaque livraison.
- **Scan noncaractères OBLIGATOIRE avant push** (U+FFFF/FFFE/FDD0-FDEF cassent Jekyll → site figé).
- Livraison : `git fetch origin -q ; git rebase --autostash origin/main ; git push origin HEAD:main`.
  Si une session maître intègre index.html : file `.index-queue/QUEUE.md`
  (protocole `docs/INDEX-COMMIT-PROTOCOL.md`).
- **BACKLOG.md mis à jour en temps réel** à chaque livraison (statut + version + commit `Pilotage : …`).

## À LIRE EN PREMIER (dans le worktree origin/main)
1. `MEMORY.md` + `BACKLOG.md` (entrées navigation, pilotage, suivi-loyers).
2. `docs/subjects/PILOTAGE-MATRICIEL.md` + `docs/subjects/PILOTAGE-ONGLET-REFONTE.md`.
3. `docs/subjects/AUDIT-FINANCES-COHERENCE-2026-07-07.md` (les 4 moteurs).
4. Les 4 mockups validés : `mockups/finances/`, `mockups/loyer-2044-pro/pl-revise.html`,
   `mockups/page-charges/`, `mockups/historique-loyer/`.
5. `docs/superpowers/specs/2026-07-08-refonte-navigation-design.md` (le socle `_V4_NAV_MODEL`).
