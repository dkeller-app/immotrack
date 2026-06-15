# FEAT-REGIMES-FISCAUX — Gérer plusieurs régimes (nu / meublé / IS) et les immeubles mixtes

**Status** : ⬜ À faire · **Prio** : P2 (avec une **brique P1 de correctness** — voir §3) · **Taille** : L
**Détaché de** : V3-REFONTE-LOYERS + AUDIT-FISCAL-MOUVEMENTS · **Lié à** : Chantier A (2044), REPORTING-BAILLEUR, PROCEDURE-AFFECTATION-MOUVEMENTS

---

## 1. Le principe — le statut fiscal est par LOT/BAIL, jamais par immeuble

Un immeuble peut contenir des lots de **régimes différents** :
- Lot loué **nu** → revenus fonciers (**2044**).
- Lot loué **meublé / étudiant / mobilité** → **BIC / LMNP** (2031 + 2042-C-PRO, **amortissement**).

Ce sont **deux déclarations séparées**, règles différentes (foncier = liste limitative sans amortissement ; LMNP = amortissement du bien/mobilier/travaux). Le régime se rattache donc au **bail** (et peut **changer dans le temps** : un lot nu une année, meublé la suivante). L'immeuble n'est PAS une unité fiscale.

Le mode est déjà capté dans l'app : champ **`b-type`** du bail (`nu` / `meuble` / `etudiant` / `mobilite` / `garage` / `autre`). Mapping régime :
- `nu` → foncier (2044) · `garage` → foncier (en principe, location nue de garage)
- `meuble` / `etudiant` / `mobilite` → **meublé = BIC**
- `autre` → à qualifier au cas par cas

---

## 2. Routage des mouvements (cible)

| Mouvement rattaché à… | Déclaration |
|---|---|
| lot **nu** | 2044 (foncier) |
| lot **meublé** | BIC (LMNP) |
| **immeuble** (TF, PNO, syndic — couvre des lots mixtes) | **ventilé au prorata** → part nu en 2044, part meublé en BIC |

**Ventilation des charges immeuble** = le point délicat. → **réutiliser le mécanisme de répartition des compteurs collectifs (`cleRepartition` : tantièmes / surface / forfait / proportionnel)** : la même clé qui répartit une charge récupérable entre locataires peut ventiler une charge immeuble entre **régime nu** et **régime meublé**.

---

## 3. ⚠️ Constat de CORRECTNESS (vérifié sur `origin/main` `20e1663`, 2026-06-09)

**La 2044 actuelle n'exclut PAS les lots meublés.** Le builder (`_legal2044BuildOpts`, `_legal2044WizardOpts`) prend `aliveLogs = DB.logements.filter(_isAlive && !archived && entity===…)` — **sans filtre sur `b-type`**. Le moteur `js/core/legal-2044.js` n'a **aucune** référence au mode de bail. → si un lot **meublé/étudiant/mobilité** a son loyer tagué `211`, il est **compté dans le résultat foncier** = 2044 **fausse** (mélange BIC dans foncier).

**→ Brique P1 (correctness, bornée, faisable avant le moteur BIC)** : faire que le périmètre 2044 **exclue les baux meublés** (`b-type ∈ {meuble, etudiant, mobilite}`), en s'appuyant sur le bail **actif sur la période déclarée**. Subtilités à traiter :
- **Temporel** : un lot nu une partie de l'année, meublé l'autre → n'inclure que les mouvements de la période nue (via `baux` + `baux_historique` et leurs dates).
- **Vacant** : lot sans bail courant → défaut foncier (nu) ou dernier bail connu — à arbitrer.
- **`garage` / `autre`** : `garage` nu → foncier ; `autre` → demander à l'utilisateur.

---

## 4. Architecture cible (gros chantier)

- **Moteur 2044** (existant `legal-2044.js`) → lots nu.
- **Moteur BIC** (NOUVEAU, le gros morceau) → lots meublé : recettes BIC + charges réelles + **amortissement** (bien hors terrain ~2-3 %/an, mobilier ~10-20 %, travaux). Déclaration 2031/2042-C-PRO. Déficit imputable sur BIC futurs uniquement.
- **Ventilation** des charges immeuble entre les deux moteurs (réutilise `cleRepartition`).
- **Sélecteur de régime** à l'entrée : l'app doit savoir le régime de chaque lot avant de proposer le classement (un même mouvement n'a pas le même sort selon le régime — cf AUDIT-FISCAL-MOUVEMENTS).

---

## 5. Plan en 4 étapes

1. **Capter/exploiter le mode** (nu/meublé) au niveau bail — `b-type` existe déjà.
2. **P1 — Exclure les baux meublés du calcul 2044** (correctness §3) : rattachable au Chantier A/B, borné. Gates : TDD (un lot meublé n'apparaît plus dans le résultat foncier ; un lot nu oui), audit fiscal, sandbox→worktree→QUEUE.
3. **Marquer les lots meublés « BIC — hors 2044 » dans l'UI** : leurs mouvements sont tracés mais signalés « relève du BIC, déclaration séparée » (garde-fou pédagogique, en attendant le moteur BIC).
4. **Phase 2 — Moteur BIC complet + ventilation prorata** des charges immeuble (réutilise `cleRepartition`). Conséquent, à cadrer en session dédiée.

---

## Points liés (autres décisions de design captées le 2026-06-09)
- **Ligne 250 (prêt)** — design **révisé** (cf FEAT-PRET-ECHEANCIER) : la source légale de la ligne 250 = l'**attestation annuelle d'intérêts de la banque** (event-proof : intègre changement d'assurance, remboursement anticipé, taux révisable). Le **tableau d'amortissement** est rétrogradé en aide **optionnelle** au découpage mensuel (modèle vivant éditable, réconcilié contre la banque), **jamais** la source du chiffre 2044.
- **TEOM (ordures)** : déductible en **227** (sur l'avis de TF) MAIS **récupérable de plein droit** sur le locataire → c'est une **charge récupérable** (comme les provisions copro). Design : champ **« TEOM annuelle (récupérable) »** + case à cocher au niveau **bien** (ou immeuble réparti via `cleRepartition`), qui **alimente la régularisation des charges** (`computeRegul`) + **rappel** « n'oublie pas la TEOM récupérable ». Réutilise le mécanisme de charges récupérables existant. Source : BOFiP IF-AUT-90 + RFPI-BASE-20-50.

> Réfs légales détaillées : `docs/subjects/AUDIT-FISCAL-MOUVEMENTS.md` + `docs/subjects/PROCEDURE-AFFECTATION-MOUVEMENTS.md`.
