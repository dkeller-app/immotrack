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
- [ ] Clone pilotage réaligné sur origin/main (fin de la divergence ; opération avec sauvegarde préalable).
- [ ] Intégration du fix relay-401 (prêt depuis 17/07, branche poussée sur origin), puis fermeture de la file QUEUE.
- [ ] Fin de la triple copie index* → un seul fichier + mode sandbox intégré (clé `_test_immotrack_v4`).
- [ ] BACKLOG allégé : historique en archive, backlog court actif.
- [ ] Purge des branches mortes (après réalignement).

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

### Biens — référentiel
Entrée : **fil rouge création** (analyse d'acte de vente, saisie manuelle, import Excel simple).
- **Bailleur** : nom, type, SIREN/RCS, gérants, siège, IBAN/BIC, signature, logo. Un seul onglet Immeubles + documents dans l'entête.
- **Immeuble** : Logements + charges communes uniquement + documents dans l'entête. Résoudre le doublon régime juridique / année construction / type habitat.
- **Logement** : identité (réf, type d'usage, rattachements, T2/T3, surface, tantième, loyer HC, charges, étage, n° appart). Supprimer : boutons annonce ×2, onglets Général, Compteurs, Présentation. Fusionner Description dans Équipements (T2/T3 = nb pièces principales, chambres ajoutables avec équipements). Déplacer n° identifiant fiscal + case charges communes. Diagnostics conservés (DPE, plomb…).

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

## 6. Validation par onglet (gate de sortie, non négociable)

Fonctionnel complet sur **téléphone + tablette + PC** · 0 erreur console · données réelles intactes · tests verts · audit agent SÛR · smoke explicite du user. Onglet validé = figé.

## 7. Sessions (état 10/08)

- ✅ **Continue** : partage-EDL (blindage, quasi finie) · fil rouge création (`Immo-wt-filrouge-complet`, étape 2/8).
- ❌ **Tuée** : pièces-obligatoires (SC1 rejeté et retiré de la prod v15.497).
- 🗄️ **Archivées** : sessions dormantes de juillet.
