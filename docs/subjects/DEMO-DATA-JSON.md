# DEMO-DATA-JSON — Jeu de données de démonstration étoffé

**Status** : ⬜ À faire · **Prio** : P1 (bloquant démo commerciale) · **Taille** : M (~3-5h)
**Détecté** : 2026-05-17 (user : « il faudra faire une version json de démonstration assez étoffé »)
**Lié à** : ONBOARDING-PREMIERE-CONNEXION (s'appuie dessus) · TEST-E2E-PLAYWRIGHT (seed-db) · USER-PROFILE-FILTERS · commercialisation V1

## Justification (4 critères pré-vol)

1. **Cible** : prospects/nouveaux utilisateurs (tester l'app sans saisir leurs données) + démo commerciale + support + tests
2. **Règles** : données réalistes mais fictives (RGPD : aucun vrai locataire) + couvrir TOUTES les features
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « une version json de démonstration assez étoffé »
   - 💻 Code existant : `initDB()` + DB localStorage → un import JSON démo est trivial à brancher
   - 📋 Backlog : nécessaire pour ONBOARDING (tuto sur données réelles) + démo commerciale
4. **5 vues 360°** : commercial (démo vendeuse) + UX (découverte) + technique (seed reproductible) + tests (fixture)

## Objectif

Un fichier `demo-data.json` **étoffé et réaliste** chargeable en 1 clic, qui montre **toutes les fonctionnalités** d'ImmoTrack remplies — pour qu'un prospect voie immédiatement la valeur sans rien saisir.

## Contenu cible (étoffé = couvre tous les cas)

### Entités variées (montrer la polyvalence)
- 1 **SCI à l'IS** (ex « SCI Patrimoine Démo ») avec plusieurs immeubles
- 1 **SCI à l'IR**
- 1 **particulier / nom propre** (LMNP)
- → montre que l'app gère tous les statuts juridiques

### Immeubles + logements (15-25 lots variés)
- Plusieurs immeubles (pour montrer les **intercalaires par immeuble**)
- Typologies variées : studio, T2, T3, T4, maison, **garage/parking**, local commercial
- **États variés** : loués / **vacants** (pour montrer annonce + candidats) / en travaux
- **DPE variés** : A à G dont **1-2 en F/G** (pour montrer le blocage loi Climat + gel IRL)

### Baux + locataires
- Baux actifs de durées variées (récents < 1 an + anciens à réviser IRL)
- 1-2 baux **arrivant à échéance** (renouvellement)
- Colocation (2 locataires sur 1 bail)
- Bail meublé + bail vide
- Garants

### Données financières (montrer dashboard rempli)
- Mouvements sur 12-18 mois (loyers perçus, charges, travaux) → graphiques cash-flow remplis
- Quelques **impayés** (pour montrer la gestion d'impayés)
- Quittances générées
- Régularisation de charges (1 exemple complet)

### Légal / conformité
- Diagnostics renseignés (DPE, ERP, plomb, amiante…) avec **1-2 expirés** (alertes)
- Assurances PNO/GLI + MRH locataires (dont 1 à renouveler)
- Révisions IRL (historique + 1-2 à appliquer)
- EDL entrée (+ 1 sortie pour montrer la comparaison)

### Documents / photos
- Quelques PJ + photos de logement (illustratives libres de droits ou placeholders)

## Scope (proposé)

### Phase 1 — Construire le JSON démo (~2-3h)
- Générer `demo-data.json` couvrant tout le contenu ci-dessus
- Cohérence des liens (logement↔bail↔mouvements↔quittances↔entité)
- Dates réalistes calées sur la date courante (révisions « à faire » tombent juste)

### Phase 2 — UI de chargement (~1h)
- Bouton « Charger les données de démonstration » (Paramètres ou écran d'accueil 1ʳᵉ connexion)
- Confirmation : « Cela remplace la base actuelle » (garde-fou si données réelles présentes)
- Bouton « Réinitialiser (vide) » pour repartir propre après la démo

### Phase 3 — Cohérence dates dynamiques (~30min)
- Les dates relatives (révisions IRL dues, diagnostics expirés, baux à échéance) doivent rester pertinentes quelle que soit la date de chargement → calculer en relatif (today - N mois) à l'injection

### Phase 4 — Tests (~30min)
- Le JSON démo charge sans erreur + tous les onglets s'affichent remplis
- Réutilisable comme fixture pour TEST-E2E-PLAYWRIGHT (seed-db)

## Décisions à arbitrer

- [ ] **D1** : données démo intégrées au build (toujours dispo) ou fichier externe à importer ?
  - → Reco : intégré + bouton dédié (zéro friction pour le prospect)
- [ ] **D2** : dates relatives (recalculées au chargement) ou figées ? → relatives (reste pertinent)
- [ ] **D3** : 1 seul jeu démo ou plusieurs profils (solo / SCI / gestionnaire) ?
  - → Reco : 1 jeu riche couvrant tout, suffisant pour V1

## Notes utilisateur

> 💬 2026-05-17 : « il faudra faire une version json de démonstration assez étoffé »

## Journal

- 2026-05-17 : créé · jeu de données démo étoffé couvrant toutes les features (entités variées + 15-25 lots + DPE F/G + impayés + IRL à réviser + diagnostics expirés + EDL) · dates relatives · bouton de chargement · réutilisable comme fixture E2E · support ONBOARDING
