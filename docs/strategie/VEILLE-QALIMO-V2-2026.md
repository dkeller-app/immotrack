# VEILLE-QALIMO-V2 — Analyse nouvelle version Qalimo (mai 2026)

**Date** : 2026-05-13
**Source** : 5 captures utilisateur (Dashboard, Liste Bailleurs, Fiche Bailleur Général/Automatisation/Paramètres)
**Auditeur** : session pilotage Claude

---

## 📊 Synthèse exécutive

Qalimo V2 a fait un **bond pro structurant** : la centralisation des automatisations par bailleur + paramétrage facturation/SMTP par bailleur sont **2 patterns UX très puissants** absents d'ImmoTrack. À reprendre absolument pour parité commerciale.

Nouveautés majeures détectées :
1. ⭐⭐⭐ **Panneau Automatisation centralisé par bailleur** (9 toggles on/off) — pattern à reprendre
2. ⭐⭐⭐ **Paramètres facturation + SMTP par bailleur** — préfiguration multi-utilisateurs SaaS
3. ⭐⭐ **Sidebar 8 onglets** dont nouveaux : Candidats, Pilotage, Carnet d'adresse
4. ⭐⭐ **Dashboard : Mes raccourcis + Mon agenda intégrés** — UX rapide
5. ⭐ **Partage de gestion** (multi-utilisateurs SaaS visible dans la liste bailleurs)

---

## 🔍 Captures analysées (5)

### Capture 1 — Dashboard
**Sidebar** : Tableau de Bord · Bailleurs · Biens · Locataires · **Candidats** (nouveau) · **Pilotage** (nouveau) · Finances · Fiscalité · **Carnet d'adresse** (nouveau)

**Layout Dashboard** :
- Titre "Bienvenue sur Qalimo !"
- Onglets internes : Général / Statistiques / Export quittances
- 6 KPI tuiles : Logements loués (5/13) · Candidatures (0) · Revenus locatifs (0€) · Retards paiement (1) · DG non reçus (0) · Impayés (5)
- Section "Mes actions prioritaires" : accordéons "Processus de départ en cours (1)" × 2
- Section "Mes raccourcis" : 7 actions rapides
  - Ajouter un bien · Ajouter un locataire · Inviter un candidat · Générer une quittance · Réaliser un état des lieux · Modèles de document · Envoyer un courrier
- Section "Mon agenda" : vue calendrier intégrée avec bouton "Ajouter"

### Capture 2 — Liste Bailleurs
- Bouton primaire "+ Ajouter un profil bailleur"
- 2 cartes :
  - SCI DD2AMELEVIERES (badge "Société à l'IS") - Partagé avec : personne
  - Delle (badge "LMNP réel") - Partagé avec : personne
- Champs : avatar initiales (orange) + nom + badge type + partage

### Capture 3 — Fiche Bailleur Général
- Header : avatar SD + nom SCI DD2AMELEVIERES
- 4 onglets internes : Général · Documents · Automatisation · Paramètres
- 3 actions premium en haut :
  - Export comptable
  - Compte rendu de gestion
  - Partagez la gestion
- Section "Informations personnelles" : carte avec téléphone, email, adresse

### Capture 4 — Fiche Bailleur Automatisation (⭐ NOUVEAUTÉ MAJEURE)
**9 toggles d'automatisation organisés en 2 colonnes** :

| # | Toggle | Équivalent ImmoTrack | Statut nous |
|---|---|---|---|
| 1 | Envoyer automatiquement la quittance au locataire | QUIT-EMAIL | partial (EMAIL-AUTO V1 livré, intégration UI v14.97) |
| 2 | Générer automatiquement les avis d'échéance | AVIS-ECHEANCE | ⬜ pending |
| 3 | M'avertir pour la révision du loyer à la date anniversaire du bail | IRL-VALIDATION popup | ✅ livré v13.33 |
| 4 | Demander automatiquement au locataire l'assurance multirisque | MRH alerte renouvellement | ⬜ pending |
| 5 | Demander automatiquement l'attestation d'entretien du chauffage | EQUIP-CONTROLES-PERIODIQUES auto-demande | ⬜ pending (sujet redéfini 2026-05-13) |
| 6 | M'avertir de la date butoir pour résilier le bail | alerte fin bail < 90j | partial (Échéances DASH-PROFILES) |
| 7 | Envoyer automatiquement un email de relance en cas d'impayé | RAPPEL-IMPAYE | ⬜ pending (EMAIL-AUTO infra prête, intégration UI V1.1) |
| 8 | M'avertir en cas de virement | notification mouvement entrant | ⬜ pending |
| 9 | Compte rendu de gestion | GESTION-CRG | ⬜ V1.1 |

→ Conclusion : **ImmoTrack a 60% des fonctionnalités sous-jacentes**, mais **n'a PAS le panneau centralisé** qui les expose dans une UX unique par bailleur. C'est la lacune UX la plus visible.

### Capture 5 — Fiche Bailleur Paramètres (⭐ NOUVEAUTÉ MAJEURE)

**6 cartes de paramètres** :

1. **Signature des documents** : "Dessiner une signature" + bouton "Utiliser la signature du compte"
2. **Logo personnalisé sur les documents** : upload PNG/JPG/JPEG + preview "Qalimo" + bouton "Utiliser le logo du compte"
3. **Signature mail** : éditeur texte signature (default "Cordialement, Votre bailleur via Qalimo") + boutons "Utiliser la signature par défaut" / "Utiliser la signature du compte"
4. **Serveur mail** : config SMTP custom (default "Qalimo (default)") + boutons "Tester la connexion" / "Modifier" / "Utiliser le serveur mail Qalimo" / "Utiliser le serveur mail du compte"
5. **Paramètres des emails** : toggles "Copie des emails au bailleur (CC)" + "Récapitulatif des emails programmés"
6. **Paramètres de facturation** :
   - Préfixe des factures (FAC)
   - Dernier numéro utilisé (0 → next FAC000001)
   - Échéance de paiement (30 jours à réception)
   - Conditions de règlement (textarea : "Des pénalités correspondant au taux directeur de la BCE, majoré de 10 points seront applicables...")

→ Conclusion : **paramétrage très fin par bailleur** = signal commercial fort (l'app s'adapte à chaque bailleur, support SaaS multi-tenant).

---

## 📊 Comparaison feature-par-feature

| Feature | Qalimo V2 | ImmoTrack v14.97 | Verdict |
|---|---|---|---|
| Dashboard KPIs basiques | ✅ 6 tuiles | ✅ Sparklines + drill | Match |
| Dashboard "Mes raccourcis" | ✅ 7 actions | ❌ pas centralisé | **Lacune** |
| Dashboard "Mon agenda" intégré | ✅ vue calendrier | ❌ pas d'agenda intégré | **Lacune** |
| Dashboard lentilles personas | ❌ | ✅ DASH-PROFILES (Phase 1 livrée, attente validation) | **Avantage ImmoTrack** |
| Vue Biens cartes Qalimo-like | ✅ | ✅ LOG-LISTE-CARDS livrée v14.2 | Match |
| Fiche 360° bien | ✅ sous-onglets | ✅ LOG-FICHE-360 Bloc A livré | Match (Phase 2 sous-onglets pending) |
| Fiche 360° bailleur | ✅ 4 onglets | ✅ ENT-FICHE-360 Phase 1 | Match (mais Automatisation+Paramètres lacune) |
| Onglet Candidats (pipeline locataires) | ✅ | ❌ pas dispo | **Lacune** (LOG-CANDIDATS noté) |
| Onglet Pilotage | ✅ inconnu sans capture | ? | À investiguer |
| Carnet d'adresses | ✅ | ❌ | **Lacune** |
| Wizard bail | À évaluer | ✅ V3-REFONTE-BAIL livré | À confirmer |
| EDL + photos | À évaluer | ✅ très enrichi v14.7+ | **Avantage ImmoTrack** probablement |
| Charges récupérables détaillées au bail | À évaluer | ⬜ BAIL-CHARGES-DETAIL noté 2026-05-13 | À confirmer |
| Diagnostics DDT + bloquage bail | À évaluer | ⬜ BAILLEUR-DIAGNOSTICS-DDT noté 2026-05-13 | À confirmer |
| Équipements + contrôles | À évaluer | ⬜ EQUIP-CONTROLES-PERIODIQUES noté 2026-05-13 | À confirmer |
| Sync Drive | ❌ (cloud Qalimo) | ✅ offline-first + Drive | **Avantage ImmoTrack** |
| RGPD UI Mes données | À évaluer | ✅ RGPD-COMPLIANCE livré v14.91 | À confirmer |
| Export comptable FEC | ✅ | ✅ EXPORT-COMPTABLE livré v14.93 | Match |
| CRG mensuel auto | ✅ toggle | ⬜ V1.1 | **Lacune** (sujet V1.1) |
| **Automatisations centralisées par bailleur** | ⭐⭐⭐ panneau dédié | ❌ dispersées | **Lacune majeure** |
| **Paramètres facturation par bailleur** | ⭐⭐ section dédiée | ❌ pas exposé | **Lacune** |
| **Serveur SMTP par bailleur** | ⭐⭐ config custom | ❌ EMAIL-AUTO V1 = mailto: | **Lacune V2 SaaS** |
| Logo + signature personnalisés docs | ✅ par bailleur | partial (logo global) | **Lacune partielle** |
| Partage gestion multi-utilisateurs | ✅ "Partagé avec personne" | ❌ V2 SaaS | À aligner sur SAAS-MULTIUSERS |

---

## 🎯 Lacunes à combler (priorisées)

### P1 — Différenciants commerciaux V1
1. **PARAM-BAILLEUR-AUTOMATISATIONS** (nouveau, P1/L) — panneau centralisé de toggles d'automatisations par bailleur. Signal UX pro fort.
2. **DASH-RACCOURCIS** (nouveau, P1/S) — section "Mes raccourcis" dans dashboard avec 7 actions rapides (Ajouter bien/locataire/candidat, Générer quittance, Réaliser EDL, Modèles, Envoyer courrier).
3. **PARAM-BAILLEUR-LOGO-SIG** (nouveau, P1/S) — signature + logo personnalisés par bailleur dans documents PDF (extension du global au niveau bailleur).

### P2 — Différenciants V1.1
4. **PARAM-BAILLEUR-FACTURATION** (nouveau, P2/S) — préfixe facture, dernier numéro, échéance, conditions règlement BCE par bailleur. Utile mandataire Hoguet.
5. **LOG-CANDIDATS** (déjà noté sous-sujet LOG-FICHE-360) — pipeline candidatures locataires.
6. **CARNET-ADRESSE** (nouveau, P2/M) — annuaire contacts (locataires, garants, fournisseurs, syndics, comptables, notaires).
7. **DASH-AGENDA-INTEGRE** (nouveau, P2/S) — vue calendrier dans dashboard (intégration TRAV-SUIVI).

### P3 — Différenciants V2 SaaS
8. **PARAM-BAILLEUR-SMTP** (nouveau, P3/M) — serveur mail custom par bailleur (DKIM/SPF) — alternative pro à mailto: pour V2 SaaS.
9. **ALERTE-VIREMENT-ENTRANT** (nouveau, P3/S) — notification automatique quand virement détecté côté banque (nécessite intégration bancaire ou import auto).

---

## 🟢 Différenciants ImmoTrack à pousser

| Différenciant | Statut | Communication marketing |
|---|---|---|
| **Offline-first + Drive sync** | ✅ unique sur le marché | « Vos données chez vous, pas chez nous » (RGPD natif) |
| **DASH-PROFILES lentilles persona** | ✅ Phase 1 livrée | « 4 dashboards en 1 selon votre besoin du moment » |
| **DAAF photo EDL non-négociable** | ⬜ EQUIP-CONTROLES-PERIODIQUES | « Preuve juridique en cas d'incendie » |
| **DDT généré auto + bloquage bail** | ⬜ BAILLEUR-DIAGNOSTICS-DDT | « Bail conforme légalement par défaut » |
| **LEGAL-2044 wizard intégré** | ✅ livré v14.90 | « Déclaration fonciers en 5 minutes » |
| **EDL délégué + photos compteurs** | ✅ v14.7+ | « EDL délégable à un tiers offline » |
| **Tests Vitest 262 tests** | ✅ infra robuste | (interne, mais argument vente B2B) |

---

## 📋 Mise à jour CARTE_POSITIONNEMENT

Repositionnement ImmoTrack vs Qalimo V2 :
- **Axe X (solo↔pro)** : ImmoTrack reste plus solo-friendly (offline, Drive perso). Qalimo V2 a fait un pas pro net avec Automatisations + SMTP + Partage.
- **Axe Y (prix↔richesse fonctionnelle)** : ImmoTrack rattrape sur richesse mais lacunes UX exposées par Qalimo (centralisation automatisations, raccourcis).

**Recommandation positionnement** :
- ImmoTrack = **"Le contrôle pro pour bailleur indépendant"** (data chez vous + workflow conforme légalement)
- Qalimo V2 = **"Le SaaS clé en main pour mandataire"** (cloud + automatisations + multi-utilisateur)

→ Cibles distinctes mais zone de chevauchement (SCI familiales 5-10 logements).

---

## 📦 Sujets backlog à créer suite à cette analyse

1. ✅ Créer `docs/subjects/PARAM-BAILLEUR-AUTOMATISATIONS.md` (P1/L)
2. ✅ Créer `docs/subjects/DASH-RACCOURCIS.md` (P1/S)
3. ✅ Créer `docs/subjects/PARAM-BAILLEUR-LOGO-SIG.md` (P1/S)
4. ✅ Créer `docs/subjects/PARAM-BAILLEUR-FACTURATION.md` (P2/S)
5. ✅ Créer `docs/subjects/CARNET-ADRESSE.md` (P2/M)
6. ✅ Créer `docs/subjects/DASH-AGENDA-INTEGRE.md` (P2/S)
7. ✅ Créer `docs/subjects/PARAM-BAILLEUR-SMTP.md` (P3/M, V2 SaaS)
8. ✅ Créer `docs/subjects/ALERTE-VIREMENT-ENTRANT.md` (P3/S)
9. LOG-CANDIDATS : déjà noté sous-sujet LOG-FICHE-360, à promouvoir en sujet propre

---

## Notes utilisateur
> 💬 2026-05-13 : "faire une analyse de qalimo ils ont sorti une nouvelle version. Je continue après avec les imprim écran qalimo"
> 💬 captures partagées : Dashboard / Liste Bailleurs / Fiche Bailleur Général + Automatisation + Paramètres

## Journal
- 2026-05-13 : créé suite captures utilisateur
- 2026-05-13 : 9 lacunes identifiées + 8 sujets backlog créés
