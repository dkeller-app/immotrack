# Design — Page « Charges » dédiée (par immeuble)

**Date** : 2026-07-11 · **Statut** : design validé pièce par pièce par l'utilisateur (mockups). À implémenter.
**Mockup de référence** : `mockups/page-charges/index.html` (composants réels de l'app, clair/sombre, drill-downs fonctionnels).

## But
Une **page dédiée à la gestion des charges**, **toujours par immeuble** (choix d'immeuble obligatoire — aucune charge n'est commune à plusieurs immeubles). De là on gère tout : règles de répartition, compteurs, factures, régularisation.

## Architecture de la page (3 sections + 2 drill-downs)
1. **Règles de répartition** — pour chaque *catégorie* de charge : récupérable ou non, clé de répartition, base légale. Défauts pré-remplis selon la loi, ajustables.
2. **Compteurs de l'immeuble** — la liste des compteurs déclarés (**définition « en amont »**). Bouton « + Ajouter un compteur ».
3. **Factures de charges** — les mouvements bancaires (import auto) rattachés à leur règle ; + « Ajouter une charge (avis papier) » pour les avis sans mouvement (TEOM, syndic). **Pas d'« import de facture »** (les factures arrivent par l'import bancaire).
4. **Drill-down Compteur** (depuis « Ouvrir le compteur » sur une facture *par compteur*, ou depuis la liste Compteurs) : saisie des **relevés d'index** (général + sous-compteurs) + **rapprochement** auto (`Σ sous + résidu = général`) + répartition par logement.
5. **Drill-down Config** (bouton « Configurer » / « + Ajouter un compteur ») : **définition** du compteur — type, nom, **sous-compteurs oui/non**, **périmètre** (quels logements sont concernés : cases à cocher, on exclut garage/cave/logement à contrat propre), **clé du résidu**.

KPI en tête : Charges totales · Récupérable locataires · Reste bailleur · À traiter.

## Règles légales appliquées (vérifiées 2026-07-11)
- **Décret 87-713** : liste *limitative* des charges récupérables ; **la clé n'est pas imposée** en général. En **copropriété** elle suit les **tantièmes** (le syndic facture par tantièmes).
- **Chauffage / eau chaude collectifs** : **individualisation obligatoire** (décret 2019-496) → **70 % conso individuelle (compteur/répartiteur) + 30 % tantièmes** ; à défaut de compteur : 100 % tantièmes.
- **Ordures ménagères (TEOM)** : récupérable **au réel par lot** d'après l'**avis de taxe foncière** (ligne TEOM, valeur cadastrale) — **pas « par surface »**.
- **Résidu compteur** (Σ sous < général) : réparti par **n'importe quelle clé** (prorata conso par défaut, surface, tantièmes, lots, ou bailleur=pertes).
- Sources : Légifrance décret 87-713, INC, Manda (TEOM), BailFacile (chauffage).

## Décisions utilisateur
- **Par immeuble** obligatoire (jamais transverse).
- **Non-récupérable exclu du décompte** : PNO (assurance propriétaire non occupant), gros travaux (ravalement) → au bailleur, hors répartition locataire. **Ne pas les afficher comme charges récupérables.**
- Compteur = **défini une fois, réutilisé chaque année** ; les factures s'y rattachent auto.

## À FAIRE à l'implémentation — retirer les compteurs des fiches
Décision : les compteurs vivent **uniquement** dans la page Charges. Retirer l'UI ailleurs :
- **Fiche immeuble** : sous-onglet « ⚡ Compteurs collectifs & charges communes » → `_renderImmFichePanelCharges` (index.html ~34960). Remplacer par un lien « Gérer dans Charges ».
- **Fiche logement** : sous-onglet « Compteurs » (relevés d'index par logement, CSS `.logf-cpt-*` main.css ~1577 ; render à localiser). Idem lien.

⚠️ **UI seulement — données + logique conservées et RÉUTILISÉES (DRY)** :
- Le modèle reste `im.compteursCollectifs[]` (type, `scope`, `cleRepartition`, `forfaitParts`, `releves`). La page Charges lit/écrit **les mêmes objets**.
- Réutiliser le CRUD existant : `openNewCcForImm` / `editCcForImm` / `delCcForImm` / `addCcReleve`, `_calcCcRepartition`, `_calcCcQuotePart`, `_ccLogsInScope`, relevés par logement via `_collectCompteurReleves`. **Ne pas recoder.**
- Les relevés par logement (fiche logement aujourd'hui) → saisis dans le **drill-down Compteur** de Charges.

## État du design (mockup)
- ✅ Page Charges (Règles → Compteurs → Factures) + drill-downs **Compteur** (relevés + rapprochement live) et **Config** (type, sous-compteurs, périmètre à cases).
- ✅ **Responsive 3 formats** livré dans le mockup (sélecteur PC 1120 / Tablette 800 / Téléphone 414 ; tableaux → cartes sur téléphone, relevés empilés, CTA pleine largeur). Clair + sombre.
- ✅ Règles légales calées + PNO/travaux hors décompte + « import facture » retiré.
- ✅ **Pop-up d'accueil (compte vide)** : première connexion sans bien → on tombe direct sur le pop-up « Bienvenue » (CTA « Ajouter mon premier bien » + 3 étapes Bien→Bail→Charges). **Même pop-up** en entrant dans un onglet quand il n'y a pas de bien. Vaut pour toute l'app, pas que Charges (empty-state global).

## Base légale (sources OFFICIELLES — Légifrance)
- **Art. 23 loi 89-462** : charges « exigibles sur justification » → **régularisation annuelle** ; provisions justifiées par la précédente régul + budget prévisionnel ; **décompte par nature de charges** + **mode de répartition** communiqué 1 mois avant ; pièces justificatives à dispo 6 mois ; régul tardive après « année civile suivant l'année de leur exigibilité » → douzièmes sur demande.
- **Art. 22 loi 89-462** : retenue jusqu'à **20 % du DG** en collectif/copro jusqu'à l'arrêté des comptes.
- **Décret 87-713** : liste limitative des charges récupérables. **Décret 2019-496** : individualisation chauffage (70/30). **TEOM** : au réel par lot (avis TF).
- Prorata temporis du partant = principe constant (Cass. 3e civ. 09/11/2017 n° 16-22.445) ; les agences font un **arrêté de comptes** à l'occupation.
- Liens : legifrance.gouv.fr (art. 23 LEGIARTI000041587263, art. 22), economie.gouv.fr.

### Décision B — rattachement par PÉRIODE COUVERTE (validée 2026-07-11)
- Exercice = **[from, to]**, défaut **année civile 1er janv → 31 déc** ; **paramétrable** (copro décalé = exercice du syndic).
- Une charge entre dans le décompte selon la **période qu'elle couvre**, pas la date de paiement :
  - sans période → **point-date** (100 % si date ∈ exercice, sinon 0) ;
  - avec période → **coupée au prorata des jours** de chevauchement ; facture à cheval répartie sur 2 exercices (Σ parts == montant).
- ✅ **LIVRÉ TDD** : `js/core/charge-exercice.js` (`chargeExerciceShare(charge, from, to)`) + `__tests__/helpers/charge-exercice.test.js` (9 tests verts ; suite complète **1657 tests OK**).

### Pipeline de calcul cible (2 briques pures déjà livrées)
Pour chaque charge : **(1) `chargeExerciceShare`** (montant rattaché à l'exercice) → **(2) répartition** = clé × **`logOccupationSegments`** (occupation, vacance→bailleur). Les deux modules purs sont faits + testés ; reste le câblage dans `computeRegul`.

## Reste à trancher / à faire
- Où « vit » la page dans la nav (item « Compteurs & relevés » sous Comptabilité, ou sous-onglet de Régularisation ?) — à décider.
- États post-clic manquants : modale « + Ajouter une règle », modale « + Ajouter un compteur » plein écran (aujourd'hui réutilise la vue Config), confirmation de régularisation.
- Construction : **retrait des compteurs des fiches** (immeuble + logement, UI only, données/CRUD réutilisés) + branchement du calcul réel (`computeRegul` + refonte occupation/vacance — cf. `2026-07-05-regul-vacance-depart-design.md`).
- Audit `code-reviewer` obligatoire (fiscal 2044 + charges récupérables) avant livraison.
