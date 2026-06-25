# B4 — Sous-P&L mensuel + prêt entier en charge (design validé 2026-06-25)

Issu de l'audit `docs/subjects/AUDIT-FINANCES-IMPORT-2026-06-22.md` (item B4). Mockup validé
par l'utilisateur après 12 itérations : `mockup-b4-pl-mensuel.html`. **Rien n'est codé dans
l'app — ce doc fige le périmètre avant le portage.**

## Intention
Donner la **tendance mois par mois** dans l'onglet Finances (aujourd'hui mono-exercice) +
corriger le traitement du prêt dans le compte de résultat.

## Décisions validées (verbatim user)

1. **Pas un graphique** : un **sous-P&L mensuel** = le compte de résultat éclaté par mois,
   mêmes lignes que le P&L annuel.
2. **Déploiement** : un **interrupteur discret « Détail mensuel »** dans l'en-tête (PAS un gros
   bouton). On déplie/replie. Plus de modale.
3. **Mois en cours à gauche**, on remonte à l'envers (reverse chrono) vers la droite.
4. **Architecture 3 panneaux** (fix définitif anti-décalage — abandon du `sticky`) :
   - **Gauche figé** : `Poste` + `Année 2026` (= Σ des mois).
   - **Milieu défilant** : les colonnes-mois, **seul** conteneur qui scrolle, via une **barre
     de défilement** (pas de boutons ◀▶). C'est le seul élément qui bouge.
   - **Droite figé** : `2025` (même période) + `Var.` + `% loyers`.
   - Hauteurs de lignes **synchronisées** entre les 3 panneaux (JS).
5. **Prêt entier en charge** : une **seule ligne « Prêt »** = mensualité entière (capital +
   intérêts), à la place de la ligne « Intérêts d'emprunt ». Le résultat principal devient
   **« Résultat réel après prêt »** = loyers HC − toutes charges (prêt entier inclus).
6. **Base imposable 2044** : ligne fine sous le résultat = `loyers HC − charges DÉDUCTIBLES`
   (intérêts seuls, PAS le capital). **Conditionnelle** :
   - Intérêts d'emprunt **non renseignés** → ligne **grisée** + 🔒 CTA « renseigne tes intérêts
     d'emprunt pour la calculer » (réutilise `_finCreditOpen()`), valeurs « – ».
   - Intérêts **renseignés** → 2044 calculée.
7. **Comparaison N-1 = même période** : la colonne « 2025 » et la « Var. » portent sur
   **janv→juin 2025** (mois écoulés), PAS l'année pleine → variation juste (pas de −45 % faux).
8. **Responsive** : téléphone → détail masqué (annuel condensé, tient sans scroll horizontal) ;
   tablette/PC → détail dispo, condensé pour tenir.

## Lignes du P&L (ordre)
Revenus locatifs · Loyers HC encaissés · Provisions sur charges (neutres) · = Total encaissé ·
Charges · **Prêt** (capital+intérêts) · Taxe foncière · Travaux & entretien · Honoraires & gestion ·
Assurance PNO/GLI · = Total charges · **= Résultat réel après prêt** · *Base imposable 2044 (info, conditionnelle)*.

## Implémentation (DRY — réutiliser, pas recopier)
- **Données mensuelles** : version par-mois de `_finChargeBuckets(year, scope)` + `_finLoyersHC` →
  buckets par mois respectant le scope (entité + immeuble + poids SCI de B6). Le **capital** =
  mouvements cat « Prêt » (la part intérêts = ligne 250 via le credit tool).
- **Modèle prêt entier** : `Prêt = échéances cat 'Prêt' (capital) + intérêts (ligne 250)`.
  `réel = loyersHC − (prêt + TF + travaux + honoraires + assurance)`.
  `base2044 = loyersHC − (intérêts + TF + travaux + honoraires + assurance)` (capital exclu).
  `base2044` indisponible si `interetsPret == 0`.
- **CTA 2044** → `_finCreditOpen()` (fenêtre intérêts existante).
- **Annuel** : `_finRenderPL` passe au même modèle (prêt entier, réel, 2044 conditionnelle,
  2025 même période + Var). ⚠ Vérifier la cohérence avec la carte **Enrichissement (B1)** du
  dashboard (qui sépare déjà capital/intérêts) — ne pas double-compter.

## Garde-fous (non négociables)
- **Sandbox-first** : build dans `index-test-finance.html`, validation visuelle user, PUIS `index.html`.
- **Audit code-reviewer obligatoire** (changement fiscal) AVANT de dire « prêt à tester ».
- **2044 reste juste** : le capital n'entre JAMAIS dans la base imposable. Le « réel après prêt »
  est un indicateur de trésorerie, clairement distinct de la base fiscale.

## Plan de build (phasé)
1. Couche données pure + testable (Vitest TDD) : breakdown mensuel + modèle prêt-entier + base2044 conditionnelle + N-1 même période.
2. Refonte `_finRenderPL` annuel sur le nouveau modèle. Test visuel sandbox.
3. Composant 3-panneaux (slider + toggle + sync hauteurs). Test visuel sandbox.
4. Câblage CTA `_finCreditOpen`, responsive, cohérence Enrichissement/dashboard. Audit code-reviewer. Puis prod.
