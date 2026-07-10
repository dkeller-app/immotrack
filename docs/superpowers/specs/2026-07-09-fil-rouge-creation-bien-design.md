# Fil rouge « Mettre un bien en location » — design (consolidé)

**Date** : 2026-07-09 · **Statut** : design validé en brainstorm, mockup-first à valider
**Consolide** : `WIZARD-CREATION-SEQUENTIEL.md` (25 mai) + `FLOW-CREATION-BIEN.md` (2 juil.) — les deux
décrivaient le MÊME parcours de création. Ce doc les remplace ; les deux sujets sont marqués « fusionnés ».
**NE PAS confondre avec** le fil rouge SIGNATURE du bail (livré v15.427→448, autre sujet, autre session).

## Intention (mot du user)

- 25 mai : « quand on crée un immeuble ou bien, il faudrait une **suite logique** (immeuble → biens → baux) ».
- 2 juil. : « créer un **vrai fil rouge** de création de bailleur à logement (avec **import acte de vente**) ».

Aujourd'hui : 4 modales isolées (entité, immeuble, logement, bail), aucun enchaînement, effet page blanche.

## Concept unifié (décidé en brainstorm 2026-07-09)

Un **fil rouge = un wizard plein écran**, et le concept global = une **bibliothèque de parcours** décrits
dans un **registre** (`PARCOURS[]`), tous portés par **une seule coquille** wizard. « Mettre un bien en
location » est le **premier** parcours ; d'autres viendront (encaisser le mois, réviser l'IRL) sans réécrire
la coquille. Modèle existant à réutiliser : `acte-stepper` (wizard import acte de vente) + rail `.ws-step`
(wizard Bail).

**Règle d'or (DRY, non négociable)** : chaque étape **réutilise l'écran/formulaire existant** (`#ov-ent`,
`#ov-imm`, `#ov-log` avec ses onglets internes, `#ov-bail`) et les saves existants (`saveEnt`, `addImmForm`,
`saveParamLog`/`openNewLog`, `saveBail`). **Aucun formulaire recopié.**

## Le parcours

Coquille `#ov-parcours-bien` plein écran, rail d'étapes en haut :

1. **Bailleur** — choisir un bailleur existant (liste) OU en créer un (form `#ov-ent`). *Skippé/replié si on
   entre depuis une fiche bailleur.* Tous statuts juridiques dès ici (SaaS).
2. **Immeuble** — existant / nouveau (`#ov-imm`) / **« logement isolé »** (garage, parking → pas d'immeuble).
3. **Logement** — `#ov-log` **avec ses onglets internes déjà existants** (Identité · Description · **Diagnostics**
   · Équipements). Donc « diagnostics » n'est pas un écran neuf. *Entrée alternative en tête d'étape :
   « **Importer un acte de vente** » (wizard `acte-stepper` existant) pré-remplit le logement.*
4. **Bien prêt ✓** — écran de fin : récap du bien + **2 boutons** :
   - « **C'est loué : ajouter le locataire** » → ouvre le **wizard Bail existant** (`#ov-bail`) en surimpression,
     logement pré-sélectionné ; au retour, revient à cet écran. **Deux wizards distincts qui se passent le
     relais** — pas de couplage, pas de risque sur la zone légale du bail.
   - « **Terminer** » → redirige vers la fiche 360° du bien créé.

### Règles de parcours
- **Skip-if-exists** : toute étape dont l'objet est déjà fourni au lancement est pré-remplie et repliée.
- **Non bloquant** : « Plus tard » / « Terminer » à toute étape ; ce qui est créé est **gardé** (pas de cage).
- **Pré-remplissage des liens** : immeuble créé → pré-sélectionné pour le logement ; logement créé →
  pré-sélectionné pour le bail. (Reprend WIZARD-CREATION-SEQUENTIEL.)
- **Choix prédéfini + ajout libre** partout (règle gravée).

## Points d'entrée
- Onglet **Biens** : le bouton « + » lance le parcours (au lieu d'ouvrir directement une modale isolée).
- **Accueil** : tuile/CTA « Ajouter un bien ».
- **Onboarding 1ʳᵉ connexion** (DB vide, pas de démo) : « Démarrer : ajouter mon premier bien » lance le
  parcours complet. (Reprend WIZARD-CREATION-SEQUENTIEL Phase 4 + ONBOARDING-PREMIERE-CONNEXION.)

## À régler en passant
- **BUG câblage « Créer bail »** : sur la fiche logement, le bouton « Créer bail » dirige vers le bien au lieu
  d'ouvrir le wizard bail (BUG 3.A de WIZARD-CREATION-SEQUENTIEL). Le relais du parcours utilise le bon câblage.

## Responsive (3 formats)
- PC/tablette : coquille plein écran, rail horizontal.
- Téléphone : rail compact + étapes plein écran (pas de modale centrée étriquée). Cohérent BUG-MOBILE.

## Hors périmètre (V1)
- OCR de l'acte de vente (extraction auto des champs) → IA-V2.
- Les autres parcours de la bibliothèque (encaisser le mois, IRL…) → specs séparées quand on y arrive.

## Coordination
- **Session parallèle active** sur le fil rouge SIGNATURE (bail) — sujet distinct, mais elle touche
  `#ov-bail`. Le relais bail de ce parcours ne fait que **lancer** le wizard bail existant → surface de contact
  minimale, mais coordonner le commit (file `.index-queue`).
- Lié : NAV-BIENS-SIMPLIFICATION (même chantier Biens), BAILLEUR-FORM-RICHE, ARCHI-IMM-LOG-DEDUP.

## Étapes de livraison
1. **Mockup local** (plein écran, CSS réelle de l'app, 3 formats) → validation user. ← prochaine action
2. Spec → plan d'implémentation (writing-plans).
3. Build sandbox-first, DRY (réutilise modales existantes montées dans la coquille), tests, audit code-reviewer.
