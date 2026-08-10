# Plan de portage — P&L Finances révisé → index.html

**Date** : 2026-06-19
**Statut** : conception validée (mockup figé), portage EN ATTENTE de la bascule Supabase (coordination commits `index.html`).
**Mockup de référence** : `mockups/loyer-2044-pro/pl-revise.html` (+ vitrine `pl-revise-3formats.html`), déployés sur github.io.
**Cible** : onglet Finances (`rFinances()` ~ligne 45000, `_finRenderPL`, `_computeFinancesSummary` dans `js/core/finances-summary.js`).

## Principe

Le P&L est un **bilan de gestion GLOBAL** (tous régimes : nu + meublé/BIC + local pro), résultat **avant impôts**, donné à titre indicatif. **Ce n'est pas une déclaration fiscale** (le fiscal = 2044 foncier + récap comptable meublé/IS, séparés). On **conserve la structure existante** de `rFinances()`/`_finRenderPL` et le panneau « Argent à récupérer » — on ne réinvente pas.

## Découpage en phases (du moins au plus sensible)

### Phase A — Habillage (risque faible)
- Hero : libellé « Résultat net **avant impôts** » + caveat sobre (« à titre indicatif, ne se substitue pas à la déclaration fiscale ni à l'avis d'un expert-comptable »). Pas de « ne simule pas l'imposition ».
- Bande **composition par régime** (loyers nu / meublé / local pro) — info, via `splitFonciereLots`/`lotRegimeForYear` (regime-lot.js).
- Responsive tableau : `white-space:nowrap` sur toutes les cellules de montant (jamais coupées) ; sous 680px ne garder que Poste + montant de l'année.
- 3 ratios (recouvrement/occupation/poids charges) à l'horizontale.

### Phase B — Nouvelles catégories de charges propriétaire
- Ajouter aux buckets de `_finChargeBuckets` : **CFE**, **frais de comptabilité / expert-comptable**, **taxe sur logements vacants** (pertinentes meublé/IS, absentes du référentiel foncier).
- Respecter [[feedback_choix_plus_ajout_libre]] (kit de démarrage + ajout libre).

### Phase C — Le régul impacte le résultat ⚠️ SENSIBLE
- **Décision user : « pas récupéré, pas de résultat ».** Le solde de régularisation des charges récupérables **avancées mais non encore récupérées** (provisions encaissées − charges récupérables réellement payées, si débiteur) **réduit le résultat net**.
- Deux étages dans `_computeFinancesSummary` + `_finRenderPL` :
  - Résultat de gestion = loyers HC − charges propriétaire (inchangé)
  - − solde de régularisation non récupéré
  - = **Résultat net avant impôts**
- **DIVERGE de l'app actuelle** qui traite les récupérables en NEUTRE (hors résultat). Le solde reste aussi listé dans « Argent à récupérer » (action pour le récupérer ; une fois encaissé, le résultat remonte).
- 🛡️ **Audit `superpowers:code-reviewer` OBLIGATOIRE** (modif fiscalement sensible touchant le calcul du résultat) — cf [[feedback_audits_par_agents]].

### Phase D — Enrichissement + saisie des intérêts (sous-feature)
- **Enrichissement = Résultat net + capital de crédit amorti** (patrimoine, « pas une charge »). Bande visuelle + lignes dans le tableau.
- **Bouton « renseigner les intérêts »** sur la ligne Intérêts → fenêtre 3 méthodes (toutes skippables) :
  1. **Saisir le montant** de l'année (= ce qu'on redemande pour la 2044, peut changer chaque année) ;
  2. **Modéliser le prêt** (montant/taux/durée/début → calcule intérêts + capital, **multi-prêts** dates/taux différents) → débloque le capital amorti / l'enrichissement ;
  3. **Importer le tableau d'amortissement** (PDF/Excel/CSV ; un scan image n'est pas lu auto).
- Le tableau d'amortissement **ne sert PAS** à remplir la 2044 (intérêts redemandés à chaque fois) — uniquement la VISU.
- Réutiliser le math d'amortissement déjà mockée (`mockups/loyer-2044-pro/credit-amortissement.html`).

### Phase E — Drill-down par ligne
- Chaque ligne du compte de résultat cliquable → drill (réutiliser `openDashDrill` ou modale dédiée plafonnée à 88vh, en-tête+boutons fixes, contenu défilant).
- Contenu, adapté au type de ligne : **mouvements** (les pièces : date / libellé / bien / montant + éditer) + **répartition par bien** + **graphe N/N-1** contextualisé + CTA « ouvrir ces mouvements filtrés ». Liste longue → compteur + filtre + tri + défilement.
- Remplace l'unique drill plat actuel `_finOpenParLogement`.
- Le panneau « Argent à récupérer » garde sa navigation opérationnelle (règle d'or) — ne pas le transformer en drill sauf demande.

## Contraintes de livraison
- Build **direct sur index.html** (le user a levé le sandbox-first pour ce chantier), MAIS : bump version **5 spots** (`<title>`, `<em>` sidebar, landing, `IMMOTRACK_VERSION`, `sw.js CACHE_VER`) + commit `Pilotage : ...`.
- Livrer via **worktree depuis origin/main** (clone local stale, cf [[project_repo_clone_stale]]) ; coordination commits index.html (cf [[feedback_index_commit_coordination]]).
- **Ordonnancement : démarrer quand la contention Supabase (bascule app sur Supabase) se calme.** Lié à [[project_persistance_multitenant]].
- Toute phase touchant le calcul du résultat (B, et le calcul intérêts/capital en D) → audit code-reviewer avant de dire « prêt à tester ».
