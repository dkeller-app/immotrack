# FLOW-CREATION-BIEN — Fil rouge guidé de création bailleur → immeuble → logement (avec import acte de vente)

**Status** : 🔀 Fusionné dans FIL-ROUGE-CREATION-BIEN (spec 2026-07-09) — voir mockup, attente validation user · **Prio** : P1 · **Taille** : L (mockup-first)
**Détecté** : 2026-07-02 (user, test app réelle)
**Lié à** : NAV-BIENS-SIMPLIFICATION (même chantier Biens), LOG-CANDIDATS (pattern wizard existant), wizard Bail Phase 2 (pattern step-by-step existant), IA-V2 (OCR — V2, pas ici)

## Contexte

> 💬 2026-07-02 : *« logement : créer un vrai fil rouge de création de bailleur à logement (avec import acte de vente) »*

Aujourd'hui la création se fait en pièces détachées (créer entité, puis immeuble, puis logement, dans des formulaires séparés). Il manque un **parcours guidé** de bout en bout : « J'ajoute un bien » → le wizard enchaîne bailleur (existant ou nouveau) → immeuble (ou mono-lot) → logement(s) → pièces jointes fondatrices (acte de vente).

## Scope (proposé)

1. **Wizard « Ajouter un bien »** multi-étapes, point d'entrée unique (Accueil + onglet Biens) :
   - Étape 1 : bailleur — choisir existant OU créer (form riche minimal, cf. BAILLEUR-FORM-RICHE)
   - Étape 2 : immeuble — existant / nouveau / « logement seul » (mono-lot)
   - Étape 3 : logement(s) — infos essentielles seulement, le reste complétable après en fiche 360
   - Étape 4 : documents — **import acte de vente** (PJ rattachée au bien, architecture attachments 3 tiers existante ; pas d'OCR en V1, OCR = IA-V2)
   - Fin : redirection fiche 360 du bien créé
2. **DRY** : réutiliser les `saveEnt`/`saveParamLog` existants et le pattern wizard Bail/Candidats — PAS de formulaires recopiés.
3. Chaque étape skippable si l'objet existe déjà (fil rouge, pas une cage).

## Règles gravées applicables

- Mockup-first (wizard × 3 formats × chaque étape)
- DRY : réutiliser les saves existants
- Choix prédéfini + ajout libre
- Penser SaaS : tous statuts juridiques dès l'étape bailleur

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : sujet créé en session pilotage (triage retours test user). Même chantier que NAV-BIENS-SIMPLIFICATION → à traiter dans la même session de design.

- 2026-07-09 : 🔀 **FUSIONNÉ** dans la spec consolidée `docs/superpowers/specs/2026-07-09-fil-rouge-creation-bien-design.md` + mockup local `C:\Users\Did_K\Desktop\Immo\mockups/fil-rouge-creation-bien/index.html`. Décisions brainstorm : coquille wizard plein écran unique + registre extensible ; parcours = bailleur→immeuble→logement (« bien prêt ») + relais optionnel vers le wizard Bail existant. Ce sujet ne vit plus seul → suivre la spec consolidée.
