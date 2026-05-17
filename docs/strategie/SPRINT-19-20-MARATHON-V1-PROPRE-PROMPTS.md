# SPRINT 19 + 20 — Marathon V1 propre (bugs UX + fondations Drive avant partage)

**Total estimé** : 24-35h sur 6-10 sessions · 12 lots indépendants · STOP USER entre chaque

> **Décision user 2026-05-16** : finir les bugs UX VISIBLES (Sprint 19) PUIS poser les fondations Drive solides (Sprint 20) AVANT d'attaquer le partage granulaire. Pas de patch vite fait sur fondations bancales (`feedback_no_compromise.md`).
>
> **Ordre strict non-négociable** :
> 1. Sprint 19A → 19I (bugs UX visibles user) — environ 14-21h
> 2. Sprint 20A → 20C (fondations Drive : split fichiers, OCC, awareness) — environ 10-14h
> 3. APRÈS le marathon : Sprint 21 PARTAGE-GRANULAIRE V1 (~6-8h, à spec'er à la sortie)

---

## 📊 Vue d'ensemble — Planning Marathon V1 propre

| Lot | Code | Sujet | Prio | Taille | Bloque ? |
|---|---|---|---|---|---|
| **19A** | `BUG-IRL-APERCU-LETTRE-V15` | Bouton "Aperçu lettre" IRL ne s'ouvre plus | P1 | S (1-2h) | Indépendant — **EN PAUSE : helpers + tests déjà créés** |
| **19B** | `EMAIL-ONGLET-PERMANENT` | Créer onglet `#p-emails` permanent dans sidebar | P1 | S (1-2h) | Indépendant |
| **19C** | `BUG-EQUIP-INTERV-FEEDBACK` | "Aucun logement trouvé" après save intervention | P1 | S (1h) | Indépendant |
| **19D** | `V3-REFONTE-NAV-ONGLETS` | Renommer Loyers→Mouvements + décisions nav | P1 | M (2-3h) | Précède 19E |
| **19E** | `V3-REFONTE-IMPORTS-UI` | 2 sous-tabs Référentiel/Bancaire/Concurrents | P1 | M (2-3h) | Post-19D |
| **19F** | `IRL-RAPPEL-MAJ-INSEE` | Rappel maj Table IRL INSEE par trimestre | P2 | S (1-2h) | Post-19A |
| **19G** | `V3-REFONTE-ASSURANCES` | Tableau → cards modernes (PNO/GLI + MRH) | P2 | M (2-3h) | Indépendant |
| **19H** | `V3-REFONTE-EDL-CARDS` | Tableau → cards modernes + filtres | P2 | M (2-3h) | Indépendant |
| **19I** | `V3-REFONTE-PARAMS-AUDIT` | Audit obsolescence Paramètres + Export | P2 | S (1h) | Nécessite input USER |
| **20A** | `DRIVE-2H` | **Split immotrack-global.json en 4 fichiers** (user/entity/entity-shared/global-ref) | P1 | M (4-6h) | Bloque 20B, 20C, partage V1 |
| **20B** | `DRIVE-2F` | **OCC** (Optimistic Concurrency Control) — anti-écrasement multi-device | P1 | M (4-5h) | Post-20A |
| **20C** | `DRIVE-2G` | **Awareness UI** : "Qui édite quoi en ce moment" | P1 | S (2-3h) | Post-20A et 20B |

**Total** : 14-21h Sprint 19 + 10-14h Sprint 20 = **24-35h** sur 6-10 sessions

---

## 🔒 Règles non négociables (rappel à TOUT sprint)

1. **Bascule directe `index.html`** (décision user 2026-05-16 : pas de sandbox pour ce marathon)
2. **Modify + Verify** : après chaque modif → grep symboles + sites collatéraux + état localStorage
3. **Bump version** : `v15.X` dans `index.html` (title + footer) ET message commit (1 sprint = 1 bump)
4. **BACKLOG.md temps réel** : update statut + version dès qu'un sprint est livré
5. **Tests Vitest** : au moins 1 test par helper modifié
6. **Commit explicite** : `git add <fichier>` jamais `git add -u` ou `git add .`
7. **Pré-vol 5 critères** : valider AVANT toute action (cible / règles / justification / git status / 5 vues 360°)

---

# 🚀 SPRINT 19A — BUG-IRL-APERCU-LETTRE-V15

**Prio** : P1 · **Taille** : S (1-2h) · **Statut** : ⏸️ EN PAUSE (helpers + tests créés, commit en attente)

## 📋 État avancé
- ✅ Sujet créé : `docs/subjects/BUG-IRL-APERCU-LETTRE-V15.md`
- ✅ Helpers ajoutés dans `index.html` : `_irlToggleLetterPane()` refactor + `_irlFirstPreviewableRef()` + `_irlPreviewableRefs()` + `_irlRefreshSelector()`
- ✅ UI : `<select id="irl-letter-selector">` ajouté dans header panneau
- ✅ Version bumpée v15.38 → v15.39
- ✅ Module pur créé : `js/core/irl-preview.js`
- ✅ Tests Vitest créés : `__tests__/helpers/irl-preview.test.js`
- ⏳ **Reste à faire** : `npm test` pour valider + commit `v15.39 fix : IRL aperçu lettre (auto-load + sélecteur)`

## 🚨 Reprise
```bash
cd C:/Users/Did_K/Desktop/Immo
npm test -- irl-preview
# Si OK :
git add index.html docs/subjects/BUG-IRL-APERCU-LETTRE-V15.md js/core/irl-preview.js __tests__/helpers/irl-preview.test.js
git commit -m "v15.39 fix : IRL aperçu lettre — auto-load 1ère lettre valide + sélecteur de bail (BUG-IRL-APERCU-LETTRE-V15)"
```

---

# 🚀 SPRINT 19B — EMAIL-ONGLET-PERMANENT

**Prio** : P1 · **Taille** : S (1-2h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « je ne vois plus les mails »)
- **Sujet à créer** : `docs/subjects/EMAIL-ONGLET-PERMANENT.md`
- **Lié à** : EMAIL-AUTO ✅ livré v15.09 (29 types, hub modale `ov-comms-hub`)

## ✅ PRÉ-VOL
1. Cible : tous bailleurs (centralisation communications)
2. Règles : réutiliser le rendu hub existant, pas dupliquer
3. Justification : 🧑 cas user + 💻 EMAIL-AUTO v15.09 modal-only = régression UX
4. Git status clean
5. 5 vues 360° : UX accessibilité + cycle vie locataire

## 📐 SCOPE
- **Phase 1** : Audit hub modale `#ov-comms-hub` + `rCommsHub()` (~15min)
- **Phase 2** : Création page `#p-emails` "📧 Communications" dans sidebar (~30min)
- **Phase 3** : 3 sous-tabs (À envoyer queue / Historique / Modèles) + render `rEmailsPage()` (~20min)
- **Phase 4** : Coupler modale ↔ page : bouton "📧 Voir tous les emails" dans modale → ferme + ouvre `#p-emails` (~15min)
- **Phase 5** : Tests Vitest `_emailsListAll()` no-throw + retourne array (~15min)
- **Phase 6** : Bump v15.40 + commit `v15.40 feat : onglet permanent Communications (#p-emails)`

## 🚨 STOP USER
Test sidebar → clic "📧 Communications" → vérifier 3 sous-tabs + historique présent.

---

# 🚀 SPRINT 19C — BUG-EQUIP-INTERV-FEEDBACK

**Prio** : P1 · **Taille** : S (1h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « intervention enregistrée mais où ?? » + screenshot "Aucun logement trouvé")
- **Sujet à créer** : `docs/subjects/BUG-EQUIP-INTERV-FEEDBACK.md`
- **Lié à** : EQUIP-CONTROLES-PERIODIQUES ✅ livré v15.08

## ✅ PRÉ-VOL
1. Cible : tous bailleurs (interventions = quotidien)
2. Règles : pas de modif backend (data sauvée OK) — fix UX uniquement
3. Justification : 🧑 cas user + screenshot probant + 💻 régression post-v15.08
4. Git status clean
5. 5 vues 360° : UX feedback save + cycle vie équipement

## 📐 SCOPE
- **Phase 1** : Audit `saveEquipIntervention()` ligne 31989 + filtres `equip-filter-imm/log` (~10min)
- **Phase 2** : Fix — reset filtres "Tous" après save + scroll smooth + highlight CSS 2s (~30min)
- **Phase 3** : Tests Vitest `_equipScrollToNew(ref, key)` no-throw si DOM absent (~10min)
- **Phase 4** : Bump v15.41 + commit `v15.41 fix : équipements — reset filtres + scroll vers nouvelle intervention`

## 🚨 STOP USER
Saisir intervention test → vérifier scroll + highlight + filtre reset.

---

# 🚀 SPRINT 19D — V3-REFONTE-NAV-ONGLETS

**Prio** : P1 · **Taille** : M (2-3h) · **Précède 19E**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user :
  - « baux = locataire. supprimer baux »
  - « Loyers : mauvaise dénomination, il y a tous les mouvements »
  - « est-ce qu'on fait pas un seul onglet avec l'import de mouvements et les mouvements ? »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-NAV-ONGLETS.md`

## ✅ PRÉ-VOL
1. Cible : tous bailleurs (clarté navigation)
2. Règles : pas de perte fonctionnalité, juste nettoyage label + structure
3. Justification : 🧑 3 cas user + 💻 audit labels trompeurs
4. Git status clean
5. 5 vues 360° : UX globale + design consistency

## 📐 SCOPE
- **Phase 1** : Renommer sidebar "Loyers & Mouvements" → "Mouvements" + h2 page (~30min)
  - Garder ID `p-loyers` interne (pas casser localStorage)
- **Phase 2** : Décision fusion Import/Mouvements (~30min)
  - **Recommandation** : Option A = 2 onglets séparés + cross-link "📥 Importer" en haut de Mouvements
- **Phase 3** : Sidebar : revoir nom "Baux & Locataires" (garder, ajouter sous-titre "👥 Profils locataires + 📜 baux signés") (~15min)
- **Phase 4** : Tests Vitest `_navLabel(pageId)` retourne bon label (~20min)
- **Phase 5** : Bump v15.42 + commit `v15.42 feat : nav onglets — Loyers→Mouvements + cross-link Import + label Baux`

## 🚨 STOP USER
Confirmer Option A retenue (ou demander Option B fusion).

---

# 🚀 SPRINT 19E — V3-REFONTE-IMPORTS-UI

**Prio** : P1 · **Taille** : M (2-3h) · **Post-19D**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « imports : il faut revoir on mélange tout : import bancaire et de données de base ! il faut revoir le tableau (3 onglets qui se répètent !) il faut un tableau simple et rapide à compléter pour import d'autres bases de données »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-IMPORTS-UI.md`
- **Lié à** : IMPORT-EXCEL-LOG ✅ livré · BANK-INTEGRATION V1 ✅ livré v15.07 · IMPORT-CONCURRENTS (À faire)

## ✅ PRÉ-VOL
1. Cible : tous bailleurs migrant Rentila/BailFacile/Qalimo + saisie initiale
2. Règles : sandbox-first + simplification
3. Justification : 🧑 cas user explicite + 💻 audit confirme workflows mélangés
4. Git status clean
5. 5 vues 360° : UX clarté + commercial (différenciant import concurrents)

## 📐 SCOPE
- **Phase 1** : Restructuration UI — 3 sous-tabs dans `#p-import` (Référentiel / Bancaire / Concurrents) (~45min)
- **Phase 2** : Tab 3 "Concurrents" — tableau + drop zone + aide visuelle + mapping colonnes (~60min)
- **Phase 3** : Helpers parsing `_importConcurrentsParse(csvText)` + `_importConcurrentsApply(mapping, rows)` (~30min)
- **Phase 4** : Tests Vitest `__tests__/helpers/import-concurrents.test.js` (parse CSV Rentila + apply mapping + erreurs) (~30min)
- **Phase 5** : Bump v15.43 + commit `v15.43 feat : refonte Import — 3 sous-tabs (Référentiel/Bancaire/Concurrents)`

## 🚨 STOP USER
Tester les 3 sous-tabs + import CSV factice.

---

# 🚀 SPRINT 19F — IRL-RAPPEL-MAJ-INSEE

**Prio** : P2 · **Taille** : S (1-2h) · **Post-19A**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « Table IRL avoir un rappel pour mise à jour »)
- **Sujet à créer** : `docs/subjects/IRL-RAPPEL-MAJ-INSEE.md`

## ✅ PRÉ-VOL
1. Cible : tous bailleurs (INSEE publie IRL chaque trimestre)
2. Règles : pas de fetch externe (offline-first), juste rappel calendaire
3. Justification : 🧑 cas user + ⚖️ INSEE T1 mi-avril, T2 mi-juillet, T3 mi-octobre, T4 mi-janvier
4. Git status clean
5. 5 vues 360° : légal IRL obligatoire + UX rappel proactif

## 📐 SCOPE
- **Phase 1** : Helpers `_irlInseeLastPublishedQuarter()`, `_irlInseeIsOutdated()`, `_irlInseeMissingQuarters()` (~30min)
- **Phase 2** : UI bannière jaune en haut "Table IRL INSEE" si outdated + lien INSEE + bouton "Marquer à jour" (~30min)
- **Phase 3** : Tests Vitest 3 cas calendaires (avant/pendant/après publication) (~30min)
- **Phase 4** : Bump v15.44 + commit `v15.44 feat : IRL rappel maj Table INSEE par trimestre`

## 🚨 STOP USER
Tester avec date forcée → bannière apparaît si outdated.

---

# 🚀 SPRINT 19G — V3-REFONTE-ASSURANCES

**Prio** : P2 · **Taille** : M (2-3h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « assurances et EDL encore sous forme de tableau à l'ancienne, il faut revoir ça ! »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-ASSURANCES.md`

## ✅ PRÉ-VOL
1. Cible : tous bailleurs (PNO/GLI obligatoire + MRH locataire)
2. Règles : design consistency + responsive + pas de perte
3. Justification : 🧑 cas user + 💻 audit tableau brut + 📋 cohérence
4. Git status clean
5. 5 vues 360° : légal + UX

## 📐 SCOPE
- **Phase 1** : Audit `rAss()` ligne 16481 (~15min)
- **Phase 2** : Design cards (header icône + body garanties + footer montant/actions) + 2 sections "Bailleur (PNO/GLI)" + "Locataires (MRH)" (~60min)
- **Phase 3** : Refactor `rAssCards()` + compat localStorage (~45min)
- **Phase 4** : Filtres immeuble + tri échéance asc + toggle "afficher échus" (~15min)
- **Phase 5** : Tests Vitest sort/filtre/badge statut (~20min)
- **Phase 6** : Bump v15.45 + commit `v15.45 feat : refonte Assurances en cards modernes`

## 🚨 STOP USER
Test sandbox → cards visibles + tri + responsive mobile.

---

# 🚀 SPRINT 19H — V3-REFONTE-EDL-CARDS

**Prio** : P2 · **Taille** : M (2-3h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « assurances et EDL encore sous forme de tableau à l'ancienne »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-EDL-CARDS.md`

## ✅ PRÉ-VOL
1. Cible : tous bailleurs (EDL obligatoire entrée + sortie loi 89-462 art 3-2)
2. Règles : design consistency + responsive
3. Justification : 🧑 cas user + 💻 tableau brut + 📋 cohérence
4. Git status clean
5. 5 vues 360° : légal + UX

## 📐 SCOPE
- **Phase 1** : Audit `rEDLList()` + `edl-tbody` (~15min)
- **Phase 2** : Design cards (badge type 🔵Entrée/🟠Sortie + locataire + pièces + signature + actions Voir/Éditer/Imprimer/Comparer) (~60min)
- **Phase 3** : Filtres (logement / type / signature) + tri date desc (~30min)
- **Phase 4** : Refactor `rEDLCards()` (~30min)
- **Phase 5** : Tests Vitest pairing entrée/sortie + filtres combinés (~20min)
- **Phase 6** : Bump v15.46 + commit `v15.46 feat : refonte EDL en cards modernes + filtres`

## 🚨 STOP USER
Test cards + responsive mobile.

---

# 🚀 SPRINT 19I — V3-REFONTE-PARAMS-AUDIT

**Prio** : P2 · **Taille** : S (1h) · **Nécessite input USER**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « paramètres et export (on a ajouté plein de choses qui ne sont plus valables maintenant) »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-PARAMS-AUDIT.md`

## ✅ PRÉ-VOL
1. Cible : tous bailleurs
2. Règles : NE RIEN supprimer sans confirmation user
3. Justification : 🧑 cas user + 💻 audit 9 sous-tabs Params + 8 cards Export
4. Git status clean
5. 5 vues 360° : nettoyage codebase + UX

## 🎯 OBJECTIF
**Phase préparatoire SEULEMENT** : inventaire complet + tableau pour user pointe ce qui est obsolète. Pas de suppression dans ce sprint.

## 📐 SCOPE
- **Phase 1** : Inventaire 9 sous-tabs Paramètres (Catégories / Pièces EDL / Modèle bail / Règles import / Thème / Mandataire / Partage / Profil utilisateur / Préférences) (~30min)
- **Phase 2** : Inventaire 8 cards Export (~15min)
- **Phase 3** : Document `PARAMS-EXPORT-INVENTAIRE.md` tableau exhaustif (~15min)
- **Phase 4** : 🚨 STOP USER OBLIGATOIRE — user pointe les options à purger
- **Phase 5** : (Sprint séparé 19I.2) suppression validée par user uniquement

## 🚨 STOP USER OBLIGATOIRE
User lit inventaire et pointe à purger. **Pas de suppression sans son OK explicite**.

---

═══════════════════════════════════════════════════════════════════
                         🏗️ FIN SPRINT 19
                  Passage aux fondations Drive
═══════════════════════════════════════════════════════════════════

---

# 🚀 SPRINT 20A — DRIVE-2H Re-architecture fichiers Drive

**Prio** : P1 · **Taille** : M (4-6h) · **Bloque 20B, 20C, partage V1**

## 📋 CONTEXTE
- **Sujet existant** : `docs/subjects/DRIVE-2H.md` (déjà spec'é depuis sessions Drive 2026-05-02/03)
- **Décision user 2026-05-16** : finir fondations Drive AVANT le partage granulaire
- **Lié à** : DRIVE-2F (OCC, suit 20B), DRIVE-2G (awareness, suit 20C), BUG-DRIVE-PARTAGE-TIERS (livré), futur PARTAGE-GRANULAIRE V1
- **Bloquant** : V1 commercial multi-users + partage propre

## ✅ PRÉ-VOL
1. Cible : bailleurs solo qui veulent partager une entité spécifique sans casser leurs préférences perso → tous bailleurs V1 commercial multi-user
2. Règles : modify+verify + bump version + commit explicite + tests Vitest
3. Justifications :
   - 🧑 Cas user 2026-05-16 : « il ne faut pas d'abord de bien finir et cadrer les sauvegardes drive avant de faire le partage ? »
   - 💻 Code existant : `immotrack-global.json` mélange `params.mandataire` (perso) + `templates.bail` (partageable) + `irlTable` (référentiel global) → schisme
   - 📋 Backlog DRIVE-2H P1 spec'é depuis Drive sessions 2026-05-02/03
   - ⚖️ RGPD : préférences UI utilisateur ne doivent jamais traverser un partage
4. Git status clean
5. 5 vues 360° : technique (architecture) + RGPD (cloisonnement) + commercial (V1 multi-users) + UX (chaque user garde sa config) + cycle vie

## 🎯 OBJECTIF
Splitter `immotrack-global.json` en 4 fichiers Drive avec rôles clairs :
- `immotrack-user-{userId}.json` : préférences PERSO (mandataire, dashLayout...)
- `immotrack-entity-{entityId}.json` : données entité (INCHANGÉ, déjà splitté)
- `immotrack-entity-{entityId}-shared.json` : NOUVEAU — templates bail+cats+EDL par entité
- `immotrack-global-ref.json` : référentiel global (irlTable INSEE, edlTemplates)

## 📐 SCOPE — 7 phases

### Phase 1 — Audit cartographie (~30min)
- Grep `immotrack-global`, `_buildGlobalPayload`, `_mergeGlobalPayload`, `_driveLoadGlobal`, `_driveSaveGlobal` dans `index.html`
- Lister TOUTES les clés dans le global actuel (DB.params, templates, categories, piecesEDL, catConfig, irlTable, edlTemplates, agendaLastSync, nid, importRules)
- Classifier chaque clé en : **user-only / entity-shared / global-ref**
- Documenter dans `docs/subjects/DRIVE-2H.md` → section "Cartographie 2026-05-16"

### Phase 2 — Helpers builders payload (~60min)
- `_buildUserPayload(userId)` : `params.mandataire`, `dashLayout`, `dashMigrationV2Prompted`, `agendaLastSync`, `nid`, `importRules`
- `_buildEntitySharedPayload(entityId)` : `templates.bail` (par entité), catégories custom par-entité, piecesEDL custom par-entité, catConfig par-entité
- `_buildGlobalRefPayload()` : `irlTable`, `edlTemplates` de référence
- `_buildEntityPayload(ent)` : INCHANGÉ (déjà OK pour les données pures)
- **Module pur** : `js/core/drive-payloads.js` exportant les 4 builders pour tests Vitest

### Phase 3 — Helpers merge symétriques (~60min)
- `_mergeUserPayload(payload)` : timestamp-aware merge des préférences perso
- `_mergeEntitySharedPayload(entityId, payload)` : merge templates/cats/edl par entité
- `_mergeGlobalRefPayload(payload)` : merge IRL/edlTemplates (last writer wins OK car référentiel quasi-statique)

### Phase 4 — Save / Load orchestration (~60min)
- `_driveSaveAll()` : itère entités + save user + save global-ref
- `_driveSaveOneEntityShared(ent)` : nouveau, save templates entité
- `_driveLoadAll()` : charge user/entities/entities-shared/global-ref + merges
- `_driveLoadEntityFiles()` : étendu pour aussi charger les `entity-shared` associés

### Phase 5 — Migration auto v15.X → v15.Y (~45min)
- À la 1ʳᵉ sync de la nouvelle version :
  - Lire ancien `immotrack-global.json`
  - Splitter dans les 4 nouveaux fichiers
  - Marquer migré dans `DB.params._migratedTo2H = '2026-05-XX'`
  - Garder ancien fichier 30 jours puis cleanup (manuel ou auto)
- Toast user : « ✓ Architecture Drive mise à jour (split en 4 fichiers) »

### Phase 6 — Tests Vitest (~60min)
- `__tests__/helpers/drive-payloads.test.js` :
  - `_classifyKeyForFile('mandataire')` → `'user'`
  - `_classifyKeyForFile('templates.bail')` → `'entity-shared'`
  - `_classifyKeyForFile('irlTable')` → `'global-ref'`
  - `_buildUserPayload({...})` inclut UNIQUEMENT les clés user
  - `_buildEntitySharedPayload(...)` filtre correctement par entité
  - Migration : ancien global → 4 fichiers cibles sans perte
  - Cas dégradé : ancien fichier absent → init vide sans crash

### Phase 7 — Bump version + commit
- v15.X → v15.(X+1) (title + footer `index.html`)
- Commit `v15.X DRIVE-2H : split immotrack-global en 4 fichiers (user/entity/entity-shared/global-ref)`

## 🧪 TESTS (~20 attendus)
- Classification clés (8)
- Build payloads (6)
- Migration auto (3 : nominal / dégradé / déjà migré)
- Merges (3 : conflit / pas conflit / vide)

## 🚨 STOP USER OBLIGATOIRE
- Tester avec compte Drive réel + vérifier 4 fichiers créés
- Confirmer "OK" avant cleanup ancien `immotrack-global.json`

---

# 🚀 SPRINT 20B — DRIVE-2F Optimistic Concurrency Control (OCC)

**Prio** : P1 · **Taille** : M (4-5h) · **Post-20A**

## 📋 CONTEXTE
- **Sujet existant** : `docs/subjects/DRIVE-2F.md`
- **Lié à** : DRIVE-2H (architecture cible 20A), DRIVE-2B (timestamps livrés)
- **Bloquant** : V1 commercial multi-users (race conditions sur write)

## ✅ PRÉ-VOL
1. Cible : tous bailleurs V1 multi-users
2. Règles : pas de breaking change API Drive existante
3. Justifications :
   - 🧑 Cas user 2026-05-01 : risque écrasement silencieux multi-device
   - 💻 `_driveSaveOneEntity` fait PATCH brutal sans check version
   - 📋 Backlog DRIVE-2F P1 spec'é
4. Git status clean
5. 5 vues 360° : technique + commercial + UX (zéro perte data) + cycle vie

## 🎯 OBJECTIF
Empêcher l'écrasement silencieux quand 2 devices écrivent quasi-simultanément. Solution : OCC via `If-Match: ETag` Drive ou check `modifiedTime`.

## 📐 SCOPE — 6 phases

### Phase 1 — Check version avant write (~45min)
- Stocker `_driveFileVersions[fileId] = modifiedTime` à chaque load réussi
- Avant `_driveSaveOneEntity` : GET `?fields=modifiedTime` du fichier
- Comparer `currentModifiedTime !== _driveFileVersions[fileId]` → conflit détecté

### Phase 2 — Retry avec reload+merge (~60min)
- En cas de conflit :
  1. Recharger le fichier entity (full GET)
  2. Merge avec local via `_mergeEntityPayload` (timestamp-aware Phase 2B)
  3. Retry write
- Limite : 3 retries max
- Si 3 retries échouent : toast erreur + pas de save → user reload manuel

### Phase 3 — Alternative `If-Match: ETag` (~30min, investigation)
- Investiguer support Drive API v3 `If-Match: ETag` sur PATCH
- Si OUI → migrer vers If-Match (plus atomique que comparaison modifiedTime)
- Drive renvoie 412 Precondition Failed si conflit → trigger retry

### Phase 4 — Étendre à tous les fichiers Drive-2H (~45min)
- Même logique pour `_driveSaveUser`, `_driveSaveEntityShared`, `_driveSaveGlobalRef`
- Stocker `_driveFileVersions` par fichier

### Phase 5 — Tests (~45min)
- Simuler conflit : 2 navigateurs même session Drive, modifier même entité, save quasi-simultané
- Vérifier qu'aucune modif n'est perdue après retry
- Test unitaire pure : `_mergeAfterConflict(local, remote, base)` → résultat attendu

### Phase 6 — Bump version + commit
- v15.X → v15.(X+1)
- Commit `v15.X DRIVE-2F : OCC (anti-écrasement multi-device + retry merge)`

## 🚨 STOP USER OBLIGATOIRE
Test 2 navigateurs simultanés → modifier le même bail → vérifier no perte.

---

# 🚀 SPRINT 20C — DRIVE-2G Awareness UI

**Prio** : P1 · **Taille** : S (2-3h) · **Post-20A et 20B**

## 📋 CONTEXTE
- **Sujet existant** : `docs/subjects/DRIVE-2G.md`
- **Lié à** : DRIVE-2H (20A), DRIVE-2F (20B) — couche UX par-dessus
- **Bloquant** : aucun, mais améliore UX multi-user

## ✅ PRÉ-VOL
1. Cible : tous bailleurs multi-device + multi-user
2. Règles : pas de surcharge UI
3. Justifications :
   - 🧑 Anticipation frustration multi-device
   - 💻 Drive a `modifiedTime` + `lastModifyingUser` → exploitables
   - 📋 Backlog DRIVE-2G P1
4. Git status clean
5. 5 vues 360° : UX awareness + commercial (signal pro)

## 🎯 OBJECTIF
Afficher discrètement « Modifié il y a 2 min par marion@gmail.com » sur les écrans pertinents (fiche bail, fiche bien, dashboard).

## 📐 SCOPE — 4 phases

### Phase 1 — Helpers récupération metadata (~30min)
- `_driveGetLastModifier(fileId)` : GET `?fields=modifiedTime,lastModifyingUser`
- Cache 60s pour éviter polling excessif
- Mapping `fileId` → `entityId` pour affichage

### Phase 2 — Composant UI badge `mu-info` (~45min)
- Petit badge discret coin haut droite des écrans clés
- Texte : « ✏️ Modifié il y a 2 min par X »
- Couleur : gris par défaut, orange si modif > 5 min (warning peut être stale)
- Tooltip : nom complet + email + heure précise

### Phase 3 — Intégration dans 3 écrans clés (~45min)
- Fiche bail (`#p-baux` → modal édition)
- Fiche logement 360° (`#p-biens` → fiche)
- Dashboard (badge global "Dernière sync : marion il y a 12 min")

### Phase 4 — Tests + Bump version
- Test helper `_formatTimeAgo(iso)` retourne "à l'instant" / "il y a 2 min" / etc.
- v15.X → v15.(X+1)
- Commit `v15.X DRIVE-2G : awareness UI dernier modifieur`

## 🚨 STOP USER OBLIGATOIRE
Test 2 comptes Drive : modif par compte A → compte B voit le badge avec email A.

---

═══════════════════════════════════════════════════════════════════
                         🏁 FIN MARATHON SPRINT 19+20
═══════════════════════════════════════════════════════════════════

## 📦 Phase de clôture

Après les 12 lots livrés :
1. **BACKLOG.md** : marquer Sprint 19 ET Sprint 20 ✅ livrés avec bumps versions cumulés
2. **MEMORY auto-memory** : update `project_immotrack.md` (nouvelle archi Drive 4 fichiers)
3. **HTML report** : générer `docs/strategie/SPRINT-19-20-LIVRAISON.html` récap archive
4. **Sprint 21** : spec PARTAGE-GRANULAIRE V1 (~6-8h, sur fondations propres) → cahier des charges précis basé sur l'archi 2H

---

## 🎯 Rappel workflow par sprint

```
1. Coller le prompt Sprint 19X ou 20X dans la session
2. Claude crée le sujet docs/subjects/[CODE].md + applique pré-vol
3. Claude exécute Phase 1 → Phase N (direct index.html, décision user 2026-05-16)
4. Claude commit + bump version + update BACKLOG.md
5. ⏸️ STOP USER : test visuel + validation OK
6. Sprint suivant
```

**Ne pas oublier** :
- 🧪 `npm test` après chaque sprint (Vitest ne doit pas casser)
- 📝 Pré-vol 5 critères TOUJOURS appliqué
- 🔍 Modify+Verify TOUJOURS appliqué
- ⚠️ Sprint 19A est en pause — finir avant d'attaquer 19B
