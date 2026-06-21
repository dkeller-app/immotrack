# Refonte de l'import bancaire — design figé

**Date** : 2026-06-21
**Chantier** : V3-REFONTE-LOYERS — import bancaire (sujet séparé, la plus grosse pièce).
**Maquette de réf** : `mockups/loyer-2044-pro/import-bancaire.html` (UX validée).
**Statut** : design **figé** après revalidation des catégories avec l'utilisateur (2026-06-21). Toutes les briques retenues.

## Vision

Remplacer l'écran d'import actuel (table à plat, select « Bail » à plat, heuristique aux catégories **périmées**) par un assistant multi-écrans :
**dépôt → revue (compte = périmètre · tri À compléter / Reconnus · affectation riche · split) → récap → impact 2044.**

## 🐛 Bug fiscal existant à corriger (découvert au grounding)

`_bankMatchHeuristic` (`js/core/bank-import.js` ~L320-328) suggère des catégories **qui n'existent pas** dans `STD_CATEGORIES` : « Taxes foncières », « Intérêts d'emprunt », « Frais de gérance, rémunérations », « Autres ». → ces mouvements importés ne mappent **aucune** ligne 2044 (tombent dans `nonMappes`) = **sous-déclaration silencieuse**. La refonte réécrit cette table vers les vrais noms.

## Modèle de données réel (NE PAS réinventer)

- `DB.params.bankAccounts` = `{id, label, type, identifiers[]}` → **AJOUTER `scope: {niv:'sci'|'imm', cible}`** (optionnel ; null = tout le patrimoine).
- `DB.importRules` = `{pattern, cat, qui, imm, compteurCcId}` (refondu `_affZone` v15.319) → **AJOUTER `account` (optionnel)** : règle = (compte + motif), le compte désambiguïse quand le comptable porte le même libellé sur 2 SCI.
- `_affZone` (v15.316, 4 niveaux log/imm/SCI/récup, écrit `<tgt>-qui/-imm/-cc`) → **ENRICHIR avec un picker cherchable en overlay** (catégorie + cible), filtré par le périmètre du compte. S'applique partout (formulaire, split, règles, import) = cohérence.
- `STD_CATEGORIES` (~30) → **AJOUTER « Charges récupérables (eau, énergie…) »** `ligne2044:''` (jamais déclarée ; portée par compteur collectif + régul, part non récupérée → ligne 225). Audit obligatoire (modif STD).
- `_bankMatchHeuristic` (`js/core/bank-import.js`) → réécrire la table mots-clés → vraies catégories.
- `_compute2044` (`js/core/legal-2044.js`) : **INCHANGÉ** (contrat de données).
- Entrée existante : `_bankImportOpen` / `_bankImportRenderPreview` / `_bankImportConfirm` (table à plat) → remplacés par l'assistant.

## Décisions figées (revalidation user 2026-06-21)

1. **Catégories** : l'import utilise les ~30 vraies `STD_CATEGORIES`. **+ 1 ajout** : « Charges récupérables (eau, énergie…) ».
2. **Prêt** : une échéance importée → catégorie « Prêt — Capital remboursé » (trésorerie, hors 2044) ; les intérêts (ligne 250) se saisissent à part depuis l'attestation annuelle (cohérent fenêtre crédit du P&L).
3. **Récupérable** = niveau (charge + compteur collectif), exclu du 2044 (`compteurCcId` skip). La nouvelle catégorie porte le cas eau/EDF direct.
4. **Compte = périmètre** : retenu. **Règles (compte + motif)** : retenu.
5. **Picker d'affectation cherchable (overlay)** : retenu, sur `_affZone` (partout).
6. **Assistant pas-à-pas « À compléter » + onglet « Reconnus »** : retenu.
7. **Auto-détection relevé de gérance** (libellé GERANCE/GESTION) → split pré-rempli : retenu.
8. **Écran après-import → impact 2044** : retenu.

## Découpage en phases (chacune : check-inline-js + audit code-reviewer + bump version + push main)

1. **Socle données** : nouvelle catégorie « Charges récupérables (eau, énergie…) » + `scope` sur `bankAccounts` + `account` sur `importRules` + **réécriture de `_bankMatchHeuristic`** vers les vraies catégories (fix bug). *Fiscal → audit.*
2. **Picker cherchable** : enrichir `_affZone` avec le sélecteur overlay (catégorie + cible), scopé par le compte. Bénéficie au formulaire/split/règles aussi.
3. **Assistant de tri** : écran revue à 2 onglets (À compléter = wizard rail + pane ; Reconnus = liste modifiable), compteurs, barre compte=périmètre.
4. **Split intégré + gérance** : auto-détection relevé de gérance → split pré-rempli (réutilise le split multi-sens v15.317). *Fiscal → audit.*
5. **Récap après-import** : écran final agrégé → impact 2044 (211/213, 221-229, récup hors 2044, prêt 250) + aperçu + lien 2044.

## Contraintes
- Audit `superpowers:code-reviewer` **obligatoire** sur les phases fiscalement sensibles (1, 4, 5 minimum).
- Build via worktree depuis origin/main (clone local stale), bump version 5 spots + sw.js, push direct main (autorisation user).
- Ground in real app, ne pas réinventer ; réutiliser `_affZone`, le split multi-sens, le module compteurs, `_compute2044`.
- L'aperçu actuel (`_bankImportRenderPreview`) est remplacé progressivement ; garder l'import fonctionnel à chaque phase.
