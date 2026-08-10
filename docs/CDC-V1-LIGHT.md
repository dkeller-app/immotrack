# CDC-V1-LIGHT — Cahier des charges & règles de fonctionnement (FIGÉ)

> **Document unique de référence de la V1 light. Validé par Didier le 10/08/2026 (chat pilotage).**
> Remplace : les PROMPT-*.md de la racine (archivés au nettoyage) et docs/subjects/V1-LIGHT-FIN-AOUT.md (supprimé).
> Toute modification de ce document = validation explicite user dans le chat AVANT écriture.

## 0. Objectif

Une V1 propre, stable, utilisable au quotidien sur **téléphone, tablette et PC** : gérer son parc doit être simple et ne pas donner un deuxième métier. Uniquement des features consolidées. Cible : **31/08/2026**.

## 1. Préalable absolu — blindage (rien d'autre ne démarre avant)

### Connexion — critères de sortie
- [ ] Keep-alive Supabase actif et vérifié (plus jamais de pause silencieuse du projet).
- [ ] Login + session stable : E2E réel PC **et** iPhone, reconnexion après veille/reload sans rebond.

### Partage — critères de sortie
- [ ] Fix EDL espace tiers terminé : suite RLS + audit + un-delete de l'EDL de Marion (session en cours, worktree `Immo-wt-partage-edl`).
- [ ] Écrans invitation 4-7 livrés.
- [ ] **E2E réel Didier ↔ Marion** : invitation → acceptation → visibilité croisée → modification → propagation, sans collision ni disparition.

### Nettoyage repo & bureau
- [x] Purge des worktrees morts du bureau + tmp + .claude (10/08 — gardés : `Immo`, `Immo-wt-partage-edl`, `Immo-wt-filrouge-complet`).
- [x] Clone pilotage réaligné sur origin/main (10/08 — main = v15.497 `91d2847`, push direct rétabli ; backup complet ancienne lignée + fichiers racine = branche `backup/pilotage-pre-realign-2026-08-10` sur origin, 0 secret vérifié).
- [x] Intégration du fix relay-401 (10/08 — cherry-pick `7d720fe` → **v15.498** déployé, suite 2214/2214 verte) ; file QUEUE fermée.
- [x] Fin de la triple copie index* (10/08 — 6 copies trackées supprimées, 28 MB ; **le sandbox existe déjà en mode intégré : `index.html?sandbox=1`** ou `/test`, storage isolé `_test_*`).
- [x] BACKLOG allégé (10/08 — intégral archivé dans `docs/archive/BACKLOG-integral-2026-08-10.md`, backlog court actif).
- [x] Purge des branches mortes (10/08 — 83 branches archivées en tags `archive-20260810/*` sur origin puis supprimées ; restent : main, backup, partage-edl, relay-otp + fil-rouge-complet local).

## 2. Règles de fonctionnement (remplacent les anciennes)

1. **Une session de chantier à la fois** (+ le fil rouge qui finit). La session pilotage est l'unique maître.
2. **Un worktree par chantier**, créé depuis origin/main, **détruit à l'intégration**.
3. **Gel du monolithe** : toute nouvelle logique naît en module `js/` testé ; index.html ne fait que l'appeler.
4. **Valider puis figer** : décision dans le chat → UNE seule écriture. Aucun document spéculatif. Un prompt de chantier ne s'écrit qu'au lancement réel de la session.
5. **CDC avant tout code** : par onglet — CDC détaillé → mockup 3 formats → validation user → TDD → audit agent → déploiement → smoke 3 formats = onglet VALIDÉ. Pas d'onglet suivant avant.
6. Bump version + commit à chaque livraison ; données réelles jamais touchées sans sandbox.
7. Un onglet validé est **figé** : on n'y revient plus en V1.

## 3. Modèle Claude par chantier

**Principe** : Fable = là où une erreur coûte des données ou de l'argent (sync, partage, signature, calculs financiers, refactor du monolithe) · Opus = features UI bien cadrées + mockups · Sonnet = mécanique et petits fixes cadrés.

| Chantier | Modèle |
|---|---|
| Pilotage + CDC par onglet (cette session) | **Fable** |
| Blindage partage (fix EDL tiers + invitations 4-7 + E2E) | **Fable** |
| Blindage connexion (E2E login 2 appareils) | Opus |
| Réalignement clone + nettoyage repo | **Fable** (session pilotage) |
| Fix relais signature à distance | **Fable** |
| Simplification Biens (purge onglets, monolithe) | **Fable** |
| Fil rouge création (session en cours) | inchangé (continue) |
| EDL mobile terrain (autosave, photos, offline) | Opus |
| Import bancaire (règles, OFX) | Opus |
| Quittances (simplification, onglet locataire) | Opus |
| Suivi (CDC + ajustements) | Opus |
| Finances P&L (ligne par ligne sourcée) | **Fable** |
| Accueil / KPI (garder actuel, ajustements) | Sonnet |
| Candidature (CDC + vérif relay-401) | Sonnet |
| Mockups 3 formats (tous onglets) | Opus |
| Audits | agent `superpowers:code-reviewer` (inchangé) |

## 4. Périmètre

**IN** : Connexion · Partage SCI · Accueil/KPI · Biens (+ fil rouge création) · Candidature · Bail · Signature à distance · EDL (dont mobile terrain) · Import bancaire · Quittances · Suivi · Finances P&L.

**OUT (après V1)** : charges/régularisation · agenda (à redéfinir) · annonces (supprimées de la cible) · OTP email (bloqué domaine propryo.fr) · toute refonte non listée. Le fiscal 2044 existant est **conservé tel quel, intouché**.

## 5. Cahier des charges par onglet (source : mapping PPTX Didier + existant)

> Chaque onglet aura son CDC **détaillé** au moment de son tour (règle 5). Ce qui suit est le cadre validé.

### Biens — référentiel · **CDC DÉTAILLÉ VALIDÉ 10/08** (audit code v15.498 + réponses user)
Entrée : **fil rouge création** (analyse d'acte de vente, saisie manuelle, import Excel simple — session en cours).

État actuel audité : bailleur 3 onglets (Immeubles/Documents juridiques/Compta globale) · immeuble 5 (Logements/Plan d'occupation/Charges communes/Documents/Assurances) · fiche logement 5 (Général/Bail/Comptabilité/Compteurs/Documents) · modale logement 5 (Identité/Description/Diagnostics/Équipements/Présentation) + boutons Annonce.

Cible validée :
- **Bailleur → 1 onglet (Immeubles) + entête** : identité complète (nom, type, SIREN/RCS, gérants, siège, IBAN/BIC, signature, logo) + documents juridiques remontés dans l'entête. **Compta globale SUPPRIMÉE → part dans Finances P&L** (décision user 10/08).
- **Immeuble → 2 onglets (Logements · Charges communes) + entête** : documents communs dans l'entête. **Assurance immeuble = simple document (MRO/PNO) dans les documents d'entête** — onglet Assurances supprimé, aucune logique dédiée (décision user 10/08). **Plan d'occupation conservé SANS onglet** : intégré à l'onglet Logements en vue commutable Liste ⇄ Frise (toggle, rendu existant réutilisé) — à confirmer au mockup. Doublon résolu : régime juridique / période construction / type habitat saisis une fois à l'immeuble, hérités par les logements.
- **Modale logement → 3 onglets (Identité · Diagnostics · Équipements)** : Description fusionnée dans Équipements (type T2/T3 = nb pièces principales ; pièces + chambres ajoutables avec leurs équipements — structure réutilisée par l'EDL). Présentation supprimée + les 2 boutons Annonce partout. Identité récupère n° identifiant fiscal + case charges communes.
- **Fiche logement → 3 onglets (Bail · Comptabilité · Documents)** : Général supprimé (synthèse dans l'entête de fiche) ; Compteurs supprimé → relevés dans Charges communes de l'immeuble (sélecteur de logement).

Prochain gate : mockups 4 surfaces × 3 formats (Opus), réutilisant les écrans existants → validation user → chantier Fable.

### Candidature
Fonctionnement actuel + fix relay-401 intégré. Dossier → bail.

### Bail — source du dû
Fonctionnement actuel + historique/barème/IRL (livré v15.496, smoke à faire). Le bail porte le dû dans le temps ; IRL appuyée sur l'historique, jamais rétroactive.

### Signature à distance
Fil rouge signature conservé ; chantier unique : **fiabiliser le relais** (plus jamais de bail signé affiché « expiré »).

### État des lieux
Fonctionnement actuel + reprendre pièces/chambres depuis Logement. **Mobile terrain indispensable** : autosave du brouillon (zéro perte au reload), photos conservées sur le téléphone, footer réduit, comportement offline défini.

### Import bancaire — source du payé
OFX, reconnaissance des doublons, tri/recherche actuels. **Aucun import auto sans règle.**

### Quittances
Générée seulement si loyer payé, montant = bail (figé). Déplacées vers l'onglet global locataire + page de génération. Pas d'historique complet ; case rappel dans le bail.

### Suivi
À jour = payé − dû (résolveur unique `duMois`), par logement. Périmètre exact précisé à son CDC détaillé.

### Finances — P&L
Mockup `pl-revise` validé (19/06) : bilan avant impôts + drill par ligne. **Entrées = bail (dû) + import (payé), chaque ligne sourcée** — revue ligne par ligne des calculs.

### Accueil / KPI
Garder l'actuel : encaissement, cash flow, occupation, rendement brut, dépôts de garantie, perçu vs potentiel, payés/impayés par logement. Contrainte : tient sur 1 écran PC (~900 px).

### Transverse (ajouts validés user 10/08)
- **Documents unifiés** : un gabarit unique Propryo (logo + charte + code PROPRYO) pour tous les documents émis — quittance, avis/courrier IRL, décomptes… Traité avec les CDC Quittances et Bail/Révisions.
- **Visuels des liens locataire** : les pages publiques ouvertes par le locataire (lien candidature, lien signature bail) passent au design Propryo. Traité avec les CDC Candidature et Signature à distance.

## 6. Validation par onglet (gate de sortie, non négociable)

Fonctionnel complet sur **téléphone + tablette + PC** · 0 erreur console · données réelles intactes · tests verts · audit agent SÛR · smoke explicite du user. Onglet validé = figé.

## 7. Sessions (état 10/08)

- ✅ **Continue** : partage-EDL (blindage, quasi finie) · fil rouge création (`Immo-wt-filrouge-complet`, étape 2/8).
- ❌ **Tuée** : pièces-obligatoires (SC1 rejeté et retiré de la prod v15.497).
- 🗄️ **Archivées** : sessions dormantes de juillet.
