# Paquet 1B — Évolution des onglets (fusions, suppressions, renommages)

**Date** : 2026-05-25
**Pourquoi ce document** : on a évoqué plein de modifs d'onglets dans nos discussions. Voici la vue **consolidée** : ce qui est déjà fait, ce qui reste à faire, et l'état cible.

---

## Vue d'ensemble — sidebar AVANT / APRÈS

### Sidebar AVANT (ancienne version, vrac)
```
🏠 Biens (hub avec toggle Bailleurs/Immeubles/Logements)
📋 Baux & Locataires
📊 Tableau de bord
🏠 Accueil
💰 Loyers (qui contient en fait tous les mouvements)
📈 Révision IRL
⚖ Régularisation
🧾 Reçus & Quittances
🛡 Assurances              ← à supprimer
📋 États des lieux
📅 Agenda
🔧 Équipements
⚙ Pilotage
📥 Import / Données
🛠 Paramètres + Sauvegarde + Export (3 onglets distincts)
```

### Sidebar CIBLE
```
🏠 Accueil
📊 Tableau de bord
─── Patrimoine ───
🏠 Bien (vue par défaut = logements groupés par immeuble)
👥 Locataires (échéances + contact + candidats)
📋 EDL (conservé)
─── Finance ───
💰 Mouvements (ex Loyers, contient TOUS les mouvements)
📈 IRL
⚖ Régularisation
🧾 Quittances
─── Relation ───
📧 Communications (livré)
─── Gestion ───
📅 Agenda
🔧 Équipements
⚙ Pilotage
─── Admin ───
📥 Import / Données (refondu : 3 sous-tabs)
🛠 Paramètres
💾 Sauvegarde / Export (séparé proprement)
```

→ **Différences clés** :
- **Assurances supprimé** (réparti dans fiches Bien et Bail)
- **Loyers → Mouvements** (nom plus juste, contenu identique)
- **Bien** : vue par défaut = Logements (au lieu du toggle 3-modes qui démarrait sur Immeubles)
- **Baux & Locataires → Locataires** ✅ (déjà fait)
- **Communications** ✅ (déjà fait)
- **Paramètres** et **Sauvegarde/Export** sont **séparés** clairement
- Groupes thématiques en sous-titres (Patrimoine / Finance / Relation / Gestion / Admin)

---

## Détail par évolution

### ✅ Déjà LIVRÉ

| Changement | Version |
|---|---|
| Renommer "Baux & Locataires" → **Locataires** | v15.220 |
| Ajouter onglet **Communications** | v15.79 |
| Supprimer onglet "Diagnostics" (déplacé en sous-onglet fiche bien) | livré |
| Onglet IRL : intercalaires par immeuble + drill-downs | v15.76-77 |

### 🟡 À FAIRE — modifications légères (1-3h chacune)

#### 1. Renommer Loyers → Mouvements
**Pourquoi** : aujourd'hui "Loyers" contient aussi les charges, les travaux, les remboursements… Le nom est trompeur. **Mouvements** dit ce que ça contient.
**Effort** : ~1h (rename label + h2 + tooltip)
**Sujet** : V3-REFONTE-NAV-ONGLETS

#### 2. Hub Biens : vue par défaut = Logements
**Pourquoi** : aujourd'hui tu cliques "Biens" → tu vois "Immeubles" en premier. Or 90 % du temps, ce qu'on veut voir = la liste des logements. Tu peux toujours basculer vers Immeubles/Bailleurs si besoin.
**Effort** : ~30 min (changement du défaut + persistance localStorage)
**Sujet** : NAV-LOGEMENT-BAIL-CLARIF (D5)

#### 3. Croix sur la sidebar : titres de groupes
**Pourquoi** : aujourd'hui 14 onglets en vrac. Avec des sous-titres "Patrimoine / Finance / Relation / Gestion / Admin", c'est mentalement plus simple à scanner.
**Effort** : ~1h (CSS + structure HTML sidebar)
**Sujet** : NAV-LOGEMENT-BAIL-CLARIF

### 🟠 À FAIRE — refontes moyennes (3-6h chacune)

#### 4. Supprimer l'onglet Assurances → déplacer dans fiches
**Pourquoi** : tu y vas 1× par an, c'est lourd pour rien. Plus logique de gérer :
- **PNO** côté **Bien** ou **Immeuble** (le mur)
- **GLI / MRH locataire** côté **Bail / Locataire** (la personne)

**Garde-fou** : on garde une vue "Assurances à renouveler" dans le dashboard (sinon risque d'oublier un renouvellement = trou de couverture légal).
**Effort** : ~3-4h
**Sujet** : V3-REFONTE-ASSURANCES

#### 5. Onglet Import : 3 sous-tabs + unification des 2 moteurs
**Pourquoi** : aujourd'hui il y a **2 moteurs d'import bancaire** qui font doublon (ancien onglet Import accepte xlsx ; nouveau bouton dans Loyers accepte CSV/OFX). C'est l'incohérence que tu as déjà touchée du doigt.
**Cible** :
- Onglet "Import" → 3 sous-tabs clairs : **📋 Référentiel** (biens/baux Excel) · **💳 Bancaire** (un seul moteur unifié CSV+OFX+XLSX) · **🔄 Concurrents** (import depuis Rentila/BailFacile/Qalimo)
- Retirer le bouton "Import banque" séparé dans Loyers (cross-link vers l'onglet Import)
**Effort** : ~3-4h
**Sujet** : V3-REFONTE-PARAMS-EXPORT-IMPORT + BANK-IMPORT-XLSX

#### 6. Séparer Sauvegarde et Export
**Pourquoi** : ce sont deux besoins différents souvent mélangés :
- **Sauvegarde** = filet de sécurité (export complet DB pour restauration) — CRITIQUE
- **Export** = sortie de données pour usage externe (CSV comptable, xlsx, PDF) — pratique

**Cible** : 2 onglets distincts dans la sidebar (ou clairement séparés dans le même onglet).
**Effort** : ~2-3h
**Sujet** : V3-REFONTE-PARAMS-EXPORT-IMPORT

#### 7. Paramètres : audit d'obsolescence
**Pourquoi** : tu as dit "on a ajouté plein de choses qui ne sont plus valables maintenant". Faut faire l'inventaire et purger ce qui ne sert plus.
**Méthode** : Phase 1 = inventaire complet, validation user, Phase 2 = nettoyage.
**Effort** : Phase 1 ~1h, Phase 2 selon ton arbitrage
**Sujet** : V3-REFONTE-PARAMS-EXPORT-IMPORT

### 🔴 À FAIRE — chantier transverse (P1, le gros morceau)

#### 8. La barre de contexte globale (Chantier A du Paquet 1)
**Pourquoi** : aujourd'hui chaque onglet a son propre filtre entité. Avec la barre globale (bulles + période), tu filtres une fois et **tous** les onglets suivent.
**Couplé à** : la cascade réelle (entité sélectionnée → seuls ses logements affichés partout) + group-by-immeuble.
**Effort** : ~5-7h
**Sujet** : NAV-FILTRE-ENTITE-GLOBAL

#### 9. Wizard de création séquentiel (Chantier C du Paquet 1)
**Pourquoi** : aujourd'hui pour ajouter un bien loué, tu navigues dans 3 onglets. Avec le wizard, après avoir créé l'immeuble, l'app te propose "Voulez-vous ajouter un bien dedans ?".
**Effort** : ~4-6h
**Sujet** : WIZARD-CREATION-SEQUENTIEL

### ⚪ Petit confort (XS, à faire au fil de l'eau)

| Évolution | Effort | Sujet |
|---|---|---|
| Composer email type Gmail (popup riche) | ~5-7h | EMAIL-COMPOSER-GMAIL (nouveau, prio P1) |
| Carnet d'adresses (artisans/syndic/comptable) | ~4-6h | CARNET-ADRESSE |
| Sync Google Calendar (push auto continu) | ~4-5h | AGENDA-GOOGLE-SYNC |
| Zone Notes libres dans fiche bien | ~2-3h | LOG-NOTES |
| Excel xlsx import bancaire (unifié dans #5) | inclus | BANK-IMPORT-XLSX |

---

## 📊 Tableau récapitulatif des onglets (cible finale)

| Onglet sidebar | Statut | Évolution |
|---|---|---|
| 🏠 Accueil | ✅ existant | conservé |
| 📊 Tableau de bord | ✅ existant | conservé (+ barre globale) |
| 🏠 Bien | 🟡 à ajuster | défaut = Logements (au lieu d'Immeubles) |
| 👥 Locataires | ✅ livré v15.220 | conservé + bouton ✉ + composer Gmail |
| 📋 EDL | ✅ existant | conservé |
| 💰 Mouvements | 🟡 à renommer | ex "Loyers" |
| 📈 IRL | ✅ existant | conservé (intercalaires déjà faits) |
| ⚖ Régularisation | ✅ existant | conservé |
| 🧾 Quittances | ✅ existant | conservé |
| 📧 Communications | ✅ livré v15.79 | + composer Gmail + envoi PULL |
| 📅 Agenda | ✅ existant | + sync Google Calendar |
| 🔧 Équipements | ✅ existant | conservé |
| ⚙ Pilotage | ✅ existant | conservé |
| 📥 Import | 🟠 à refondre | 3 sous-tabs Référentiel/Bancaire/Concurrents |
| 🛠 Paramètres | 🟠 à auditer | nettoyage |
| 💾 Sauvegarde / Export | 🟠 à séparer | distinguer backup vs export |
| ❌ Assurances | 🟠 à supprimer | déplacé dans fiches Bien/Bail |
| ❌ Diagnostics | ✅ déjà supprimé | en sous-onglet fiche bien |

---

## ⏱ Total des chantiers d'évolution onglets

| Catégorie | Effort total |
|---|---|
| ✅ Déjà livré | 0h (fait) |
| 🟡 Modifs légères (#1, #2, #3) | ~3h |
| 🟠 Refontes moyennes (#4, #5, #6, #7) | ~10-13h |
| 🔴 Chantiers transverses (#8, #9) | ~10-13h |
| ⚪ Confort (composer, carnet, agenda, notes) | ~15-20h selon ce que tu veux |
| **TOTAL** | **38-49h** |

---

## 🎯 L'ordre que je te propose

### Tranche 1 — Quick wins (1 demi-journée, ~3h)
1. Renommer Loyers → **Mouvements**
2. Hub Biens : défaut = **Logements**
3. Sous-titres groupes dans sidebar

→ **Tu vois immédiatement la différence**, zéro risque.

### Tranche 2 — La barre globale (Chantier A du Paquet 1, ~5-7h)
4. Barre de contexte (entité + période persistants) + cascade réelle

→ **Le vrai gain UX quotidien**, l'app devient cohérente.

### Tranche 3 — Refontes moyennes (~10-13h, à étaler)
5. Supprimer Assurances
6. Refonte Import (3 sous-tabs + unification)
7. Séparer Sauvegarde / Export
8. Audit Paramètres

→ **L'app devient propre côté admin**.

### Tranche 4 — Wizard + confort
9. Wizard création séquentiel (Chantier C du Paquet 1)
10. Composer email Gmail
11. Carnet d'adresses (couplé)
12. Notes, sync Google, etc. selon besoin

---

**Question pour toi** : tu veux qu'on attaque par **Tranche 1** (3h pour avoir un gain visible immédiat) ou directement par la **Tranche 2** (la barre globale qui est le plus gros impact UX) ?
