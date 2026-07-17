# Refonte de l'écosystème Pilotage / Suivi / Gestionnaire (chantier B)

**Date** : 2026-07-16
**Statut** : design validé (Variante A, par mockup)
**Audit source** : `docs/subjects/AUDIT-PILOTAGE-SUIVI-GESTIONNAIRE-2026-07-16.md`
**Mockup validé** : `mockups/pilotage-refonte/index.html` (Variante A, 3 formats, clair/sombre)
**Base** : `origin/main` ≥ v15.492 (après BARÈME-LOYER 4/4 : `duMois()` = résolveur de dû unique déjà branché)

> ⚠️ Les numéros de ligne de l'audit datent de v15.487 ; les étapes 3-4 BARÈME-LOYER ont décalé le fichier. Re-localiser par **nom de symbole** au moment d'implémenter, pas par ligne.

---

## 1. Problème (résumé de l'audit)

Trois surfaces de « pilotage » se recouvrent et se contredisent :
- **Dashboard mode Premium** (`_renderDashV4Premium`) : financier **+** table de paiement par lot (gestion).
- **Dashboard mode Gestionnaire** (`_renderDashV4Gestionnaire`) : matrice de conformité par lot.
- **Onglet Pilotage** (`rPilotage` / `_setPilotageTab`) : Suivi comptable + Suivi documents (2ᵉ matrice de conformité) + Automatisations + Prélèvements (stub mort).

Conséquences confirmées : **R1** deux matrices de conformité aux verdicts contradictoires (Bail « OK » ici / « Non signé » là) ; **R3** deux destinations pour « suivi des loyers » ; **R4** deux sélecteurs indépendants (pills Premium/Gestionnaire ≠ sous-onglets Pilotage) ; **demande 3** la matrice comptable a dérivé de la maquette validée.

**Déjà réglé (ne pas refaire)** : le résolveur de dû mensuel est unifié sur `duMois()` (`_duMoisLot`, étape 4 BARÈME-LOYER). On **construit dessus**, on ne crée aucun nouveau moteur.

## 2. Architecture cible — Variante A (validée)

**Deux surfaces, rôles nets :**

- **Tableau de bord = cockpit financier de synthèse.** Plus de pills Premium/Gestionnaire. Contenu : hero encaissé/attendu + résultat net, KPI d'occupation (lots/vacants/taux), « attendu vs encaissé » 6 mois, liste « à traiter ». **Un seul bouton** « Suivi des loyers → ». **Pas** de table de paiement par lot (elle vit dans Pilotage).
- **Onglet Pilotage = hub de gestion.** 3 sous-onglets : **Suivi comptable** · **Conformité** (matrice UNIQUE) · **Automatisations**. Le stub « Prélèvements » est retiré.

## 3. Décisions de conception

### 3.1 Dashboard (dé-empilement)
- **Supprimer le sélecteur de mode** : pills Premium/Gestionnaire, `_v4SetMode`, `DB.params.dashV4Mode`, la logique `showMode`. Le Dashboard rend une seule vue.
- **Retirer la table de paiement par lot** de l'ex-Premium (le drill `_DD['hero']` / `_v4ComputeLotStatus`) : cette info de gestion migre vers Pilotage. Garder les KPI financiers + occupation.
- **Supprimer le code mort** : `_renderDashV4Solo` (plus atteignable), `_renderDashV4Gestionnaire` (sa matrice est absorbée par Pilotage > Conformité — cf. 3.3).
- Le Dashboard devient un seul renderer (issu de l'ex-Premium allégé).

### 3.2 Pilotage > Suivi comptable (demande 3 — revenir au validé)
- **Colonne finale = Solde cumulé signé** (« −620 € » rouge / « +150 € » vert), via le moteur consolidé `_computeLoyerCumul` (borné au début du suivi — le « −63 050 € fantôme » reste corrigé). **Fin de la pastille verdict** comme colonne d'état.
- **Fenêtre de mois = M-3 … M** (validé Qalimo). *(à confirmer par toggle mockup ; défaut M-3…M. Implémentation = offset de mois, trivialement réversible.)*
- **Restaurer le bouton bulk « Mettre à jour les loyers »** (IRL groupé) en tête de tableau — `_pilOpenBulkMajIrl` existe (déprécié), le ré-exposer. Garder la sélection groupée (checkbox).
- Conserver : locataire+bien cliquable, DG versé/dû, cellules mensuelles colorées, tri par retard décroissant.

### 3.3 Pilotage > Conformité (R1 — matrice UNIQUE)
- **Une seule matrice de conformité**, source de vérité unique = `_pilStatutDoc` (déjà le helper de `_rPilDocs`). La matrice « Pilotage parc » du Dashboard Gestionnaire est **supprimée** ; ses colonnes utiles (Loyer, DPE, IRL, Quittance) sont ajoutées à la matrice unifiée **en passant par `_pilStatutDoc`** (étendre le helper aux nouveaux types plutôt que réintroduire la logique de dots inline).
- Colonnes cibles (à figer en implémentation, choix prédéfini + extensible) : **Lot/Locataire · Bail · EDL · Assurance hab. · Diagnostics (DPE/DDT) · IRL · Quittance · État global**.
- Cellule = pastille colorée + mini-label ; **un seul jeu de règles** → Dashboard et Pilotage ne peuvent plus se contredire (ils ne rendent d'ailleurs plus qu'une seule matrice, dans Pilotage).

### 3.4 Point d'entrée unique « suivi des loyers » (R3)
- Unifier `_dashGoImpayes()` (→ page Quittances filtrée « impayée ») et `_impayesOpenVue()` (→ modale strip) vers **une destination unique**. Cible retenue : **Pilotage > Suivi comptable** (le hub de gestion), atteinte par le bouton « Suivi des loyers → » du Dashboard **et** le bouton d'en-tête Pilotage. La modale strip 12 mois reste accessible en drill depuis là si utile, mais l'intitulé « suivi des loyers » mène toujours au même écran.

### 3.5 Alignement du dernier calcul de dette (R2 reco #2)
- `_calculerLoyerImpayeCumule` (encore vivant, divergent : compte charges/régul comme loyer, pas de filtre catégorie, clip à 0) alimente **la restitution DG** (`_calculerSoldeDG`) et **le compteur KPI impayés** (`_listerImpayesActifs`). Le remplacer, pour ces 2 clients, par le moteur signé/borné consolidé (`_computeLoyerCumul` / `duMois()`), afin qu'ils cessent de diverger du verdict des matrices. Supprimer `_pilSoldeLocataire` (code mort).

### 3.6 SaaS / extensibilité
- Aucune régression multi-statut : la matrice Conformité et le Suivi comptable doivent marcher tous profils (nu/meublé/SCI). Colonnes = kit de départ + extensible (règle « choix + ajout libre »). Icônes line-icons `currentColor`, pastilles teintées par état (garder la couleur qui différencie).

## 4. Phasage (chantier gros → incréments livrables + auditables séparément)

**Sandbox-first** (`index-test.html`) puis prod après OK user, à chaque phase. Bump version + audit `code-reviewer` **par phase**.

- **B0 — Suivi comptable au validé** (le plus attendu, isolé) : colonne Solde signé, fenêtre M-3…M, bouton bulk « Mettre à jour les loyers » restauré. Aucun impact Dashboard.
- **B1 — Matrice Conformité unique** : étendre `_pilStatutDoc` aux colonnes Loyer/DPE/IRL/Quittance ; fusionner dans Pilotage > Conformité ; supprimer la matrice du Dashboard Gestionnaire.
- **B2 — Dashboard cockpit** : retirer les pills + `_v4SetMode`/`dashV4Mode`, retirer la table par lot de l'ex-Premium, supprimer `_renderDashV4Solo`/`_renderDashV4Gestionnaire`, un seul renderer. Retirer le stub Prélèvements.
- **B3 — Point d'entrée unique** : unifier `_dashGoImpayes` + `_impayesOpenVue` → Pilotage > Suivi comptable.
- **B4 — Alignement dette DG/KPI** : brancher `_calculerSoldeDG` + `_listerImpayesActifs` sur `_computeLoyerCumul`, supprimer `_pilSoldeLocataire` mort. **Audit renforcé** (touche restitution DG = argent réel).

Ordre : B0 (quick win visible) → B1 → B2 → B3 → B4. Chaque phase = 1 mockup post-clic si nouvel écran, sinon fidèle au mockup Variante A déjà validé.

## 5. Tests & garde-fous
- Chaque phase : gates repo (Vitest ciblé + `check-inline-js` + `node --check sw.js` + scan noncaractères) **et** audit `superpowers:code-reviewer` avant tout « prêt à tester ». B4 (argent) = audit renforcé.
- Non-régression : la 2044 fiscale (`legal-2044`) reste intouchée ; les surfaces de dû restent sur `duMois()` (0 nouveau moteur).
- Réutiliser les modules `js/core/loyer-statut.js` / `loyer-du-mois.js` existants ; ne rien recopier (DRY).

## 6. Hors périmètre
- Refonte du barème/quittances (chantier BARÈME-LOYER, terminé).
- Automatisations (sous-onglet inchangé, placeholder).
- Toute nouvelle feature de gestion (relances, prélèvements réels) — le stub Prélèvements est retiré, pas remplacé.

## 7. Risques
- **B2 retire du code Dashboard très visible** : vérifier que `dashV4Mode` n'est lu nulle part ailleurs (params, exports, onboarding) avant suppression.
- **B4 touche l'argent** (restitution DG) : divergence de montant possible à l'écran pour les baux legacy (hc/ch vides) — documenter et smoke-tester sur données réelles.
- **Lignes décalées** post-BARÈME-LOYER : toujours re-localiser par symbole.
- Coordination `index.html` : file `.index-queue/QUEUE.md` si session maître active ; rebase `origin/main` avant chaque push (il bouge vite).
