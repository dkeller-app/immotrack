# Fil rouge « Mettre un bien en location » — design (consolidé)

**Date** : 2026-07-09 · **Statut** : 🚀 **DÉPLOYÉ PROD `origin/main` v15.464** (commit `8b804e3`, 2026-07-12, auto-déploie github.io). Construit subagent-driven + **2 passes code-reviewer PASSANT**, suite **1917/1917**, check-inline-js 5/0, vérifié navigateur (PC/tablette/mobile). Rebasé sur origin/main (collision cascade 457→463→**464** vs P1.3). **Reste : smoke test user en conditions réelles** (⚠ cache PWA/SW — le bump CACHE_VER v15.464 force le refresh, sinon fermer/rouvrir la PWA).

> **Livraison 2026-07-11** (subagent-driven, plan `docs/superpowers/plans/2026-07-11-fil-rouge-creation-bien.md`) : coquille `#ov-parcours-bien` (3 étapes Démarrer·Patrimoine·Bien prêt) + module pur `parcours-bien-model` (15 tests verts, mirror `window.ParcoursBienModel`). **100% réutilisation** : appelle `openActeImport` (acte phase 1), `openNewEnt`/`saveEnt`, `addImmForm`/`editImm`/`saveImm`, `openNewLog`+`setLogModalTab`/`saveParamLog`, relais `openBail(ref)` — zéro form recopié. Multi-ajout + croix ✕ (suppression canonique tombstone `delImm`/`delLog`). Pastille complétude À compléter→Complet. Hooks post-save **gardés `_pbActive`** (inertes hors parcours, non-régression vérifiée navigateur). Audit code-reviewer : 3 défauts trouvés + corrigés (schéma réel surf/hc/dpe-objet, échappement XSS onclick, garde Identité obligatoire), re-audit PASSANT. Points d'entrée : « +Bien » Biens (branche logements) + empty-state + CTA onboarding Accueil.

**Date d'origine** : 2026-07-09 · **Statut initial** : design validé en brainstorm, mockup-first à valider
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

Coquille `#ov-parcours-bien` plein écran, rail d'étapes en haut. **3 étapes** (révisé 2026-07-11 après
retour user sur le mockup v2) :

1. **Démarrer** — deux voies présentées d'emblée :
   - **« Importer l'acte de vente »** (voie hero, **en phase 1** — corrige la v1 qui la mettait à l'étape
     logement). Réutilise le wizard `acte-stepper` existant. L'acte **pré-remplit d'un coup** le bailleur
     (acquéreur), l'immeuble (adresse) et le premier lot, puis dépose sur l'étape Patrimoine déjà amorcée.
   - **« Saisir à la main »** → va directement à l'étape Patrimoine, bailleur à choisir/créer.
2. **Patrimoine du bailleur** — **arbre 1 bailleur → N immeubles → N logements**, construit d'un seul passage
   grâce à des boutons **+** (retour user : *« il faut pouvoir ajouter pour un même bailleur plusieurs
   immeubles et plusieurs logements d'un coup »*) :
   - Bandeau **bailleur** en tête (issu de l'acte ou choisi/créé via `#ov-ent`), bouton « Changer ».
   - **« + Ajouter un immeuble »** → ouvre `#ov-imm` ; l'immeuble créé s'insère dans l'arbre.
   - Sous chaque immeuble, **« + Ajouter un logement »** → ouvre `#ov-log` avec ses onglets internes
     (Identité · Description · **Diagnostics** · Équipements) ; le logement s'insère sous son immeuble.
     Cas **« logement isolé »** (garage, parking) = immeuble implicite / mono-lot.
   - **« Importer un autre acte de vente »** (nouvel achat) ajoute un immeuble+lot pré-remplis dans le même
     arbre, sans quitter le parcours.
   - **Suppression symétrique de l'ajout** : chaque immeuble ET chaque logement porte sa **croix ✕** (retour
     user 2026-07-11 : *« si on ajoute il faut pouvoir supprimer — l'immeuble n'avait pas de croix »*).
   - **Comment on complète toutes les infos (point clé — l'arbre n'est qu'un sommaire)** — répond à *« comment
     on complète toutes les infos ? ce n'est pas intuitif »* (user 2026-07-11) :
     - Le « + » ne pose pas une ligne vide : il **ouvre immédiatement la vraie fiche** (`#ov-imm` /
       `#ov-log` avec ses onglets Identité · Description · Diagnostics · Équipements).
     - **Chaque ligne de l'arbre est cliquable** → rouvre sa fiche à onglets pour finir la saisie ; bouton
       explicite **« Compléter › »** sur les logements incomplets.
     - **Pastille de complétude par ligne** : `À compléter` (ambre) → `Complet` (vert) après enregistrement,
       plus un point vert/ambre par onglet. Minimum requis pour créer = réf/type/surface/loyer ; le reste est
       complétable maintenant ou plus tard, sans bloquer.
3. **Bien prêt ✓** — récap de tout l'arbre (compteurs immeubles / logements) + par logement à louer, un
   bouton **« Créer le bail »** → ouvre le **wizard Bail existant** (`#ov-bail`) en surimpression, logement
   pré-sélectionné ; au retour, revient ici. **Deux wizards distincts qui se passent le relais** — pas de
   couplage, pas de risque sur la zone légale du bail. **« Terminer »** → fiche 360° / liste des biens.

### Règles de parcours
- **Skip-if-exists** : toute étape dont l'objet est déjà fourni au lancement est pré-remplie et repliée.
- **Non bloquant** : « Plus tard » / « Terminer » à toute étape ; ce qui est créé est **gardé** (pas de cage).
- **Multi-ajout** : autant d'immeubles et de logements que voulu sous un même bailleur, en un passage (boutons +).
- **Ajout ⇔ suppression** : tout objet ajouté dans l'arbre est retirable par une croix ✕ (immeuble + logement).
- **Arbre = sommaire, la fiche à onglets = saisie complète** : on clique une ligne pour l'ouvrir/compléter ;
  pastille de complétude ambre→verte pour montrer ce qui reste.
- **Pré-remplissage des liens** : immeuble créé → pré-sélectionné pour ses logements ; logement à louer →
  pré-sélectionné pour son bail. (Reprend WIZARD-CREATION-SEQUENTIEL.)
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
