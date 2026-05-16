# SPRINT 19 — Refonte onglets V2 + bugs détectés (10 remarques 2026-05-16)

**Total estimé** : 14-21h · 9 lots indépendants · pause STOP USER entre chaque

> **Comment l'utiliser** : copie-colle un sprint à la fois dans une nouvelle session Claude Code. Chaque sprint est autonome (contexte + pré-vol + scope + tests + bascule prod). Le **STOP USER** final attend ta validation visuelle avant bascule `index-test.html` → `index.html`.

---

## 📊 Vue d'ensemble — Planning Sprint 19

| Lot | Code | Sujet | Prio | Taille | Bloque ? |
|---|---|---|---|---|---|
| **19A** | `BUG-IRL-APERCU-LETTRE-V15` | Bouton "Aperçu lettre" IRL ne s'ouvre plus | P1 | S (1-2h) | Indépendant |
| **19B** | `EMAIL-ONGLET-PERMANENT` | Créer onglet `#p-emails` permanent dans sidebar | P1 | S (1-2h) | Indépendant |
| **19C** | `BUG-EQUIP-INTERV-FEEDBACK` | "Aucun logement trouvé" après save intervention | P1 | S (1h) | Indépendant |
| **19D** | `V3-REFONTE-NAV-ONGLETS` | Renommer Loyers→Mouvements + décisions nav (Baux/Imports) | P1 | M (2-3h) | Précède 19E |
| **19E** | `V3-REFONTE-IMPORTS-UI` | 2 sous-tabs Référentiel/Bancaire + tableau import bases concurrentes | P1 | M (2-3h) | Post-19D |
| **19F** | `IRL-RAPPEL-MAJ-INSEE` | Rappel mise à jour Table IRL INSEE par trimestre | P2 | S (1-2h) | Post-19A |
| **19G** | `V3-REFONTE-ASSURANCES` | Tableau → cards modernes (PNO/GLI + MRH) | P2 | M (2-3h) | Indépendant |
| **19H** | `V3-REFONTE-EDL-CARDS` | Tableau → cards modernes + filtres | P2 | M (2-3h) | Indépendant |
| **19I** | `V3-REFONTE-PARAMS-AUDIT` | Audit obsolescence Paramètres + Export | P2 | S (1h) | Nécessite input USER |

**Ordre recommandé** : 19A → 19B → 19C → 19D → 19E → 19F → 19G → 19H → 19I
(Les 3 bugs P1 d'abord — quick wins — puis refontes UI, puis décisions de nav)

---

## 🔒 Règles non négociables (rappel à TOUT sprint)

1. **Sandbox-first** : modifier UNIQUEMENT `index-test.html`. Bascule `index.html` après "OK explicite" user.
2. **Modify + Verify** : après chaque modif → grep symboles + sites collatéraux + état localStorage. Pas de patch sans vérif complète.
3. **Bump version** à chaque commit livré : `v15.X` dans `index.html` (title + footer) ET message commit.
4. **BACKLOG.md temps réel** : update statut + version dès qu'un sprint est livré, pas en fin de session.
5. **Tests Vitest** : ajouter au moins 1 test par helper modifié.
6. **Commit explicite** : `git add <fichier>` jamais `git add -u` ou `git add .`.
7. **Pré-vol 5 critères** : valider AVANT toute action (cible / règles / justification / git status / 5 vues 360°).

---

# 🚀 SPRINT 19A — BUG-IRL-APERCU-LETTRE-V15

**Prio** : P1 · **Taille** : S (1-2h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « IRL : aperçu lettre ne fonctionne pas »)
- **Sujet à créer** : `docs/subjects/BUG-IRL-APERCU-LETTRE-V15.md`
- **Lié à** : BUG-IRL-001 ✅ livré v13.30 · IRL-VALIDATION ✅ livré v13.33 · IRL-REVISION-UX-FIX ✅ livré v15.10
- **Note** : sur screenshot 2026-05-16, le panneau "Aperçu lettre" s'affiche bien en panneau droit (D-102). Le KO porte donc sur **un cas spécifique** à identifier (peut-être D-101 gel DPE F ? ou D-Garage DPE non renseigné ?)

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs qui révisent IRL annuellement
2. **Règles** : sandbox-first + modify+verify + bump version
3. **Justification** : 🧑 cas user 2026-05-16 explicite + 💻 régression possible post-v15.10 IRL-REVISION-UX-FIX
4. **Git status** : clean attendu
5. **5 vues 360°** : axe légal (IRL = obligation loi 89-462 art 17-1) + axe UX + cycle vie locataire

## 🎯 OBJECTIF
Identifier la cause exacte du KO "Aperçu lettre" et corriger en sandbox.

## 📐 SCOPE
- **Phase 1 — Reproduction** (~30min)
  - Tester les 3 cas sur `index-test.html` : D-101 (gel DPE F), D-102 (à valider OK), D-Garage (DPE non renseigné)
  - Identifier le cas qui plante (console error + screenshot)
  - Grep `rIRLApercuLettre`, `apercu-lettre`, `genererLettreIRL` pour localiser la fonction
- **Phase 2 — Fix** (~30min)
  - Corriger la cause racine (variable null ? bail manquant ? template HTML mal échappé ?)
  - Test des 3 cas après fix
- **Phase 3 — Tests Vitest** (~20min)
  - `__tests__/helpers/irl-lettre.test.js` : générer aperçu pour bail valide + bail gelé DPE + bail sans DPE → no throw
- **Phase 4 — Commit sandbox** (~10min)
  - Bump version `v15.39`
  - `git add index-test.html __tests__/helpers/irl-lettre.test.js docs/subjects/BUG-IRL-APERCU-LETTRE-V15.md`
  - Commit `v15.39 fix : IRL aperçu lettre - [cause identifiée]`
- **Phase 5 — Bascule prod** (APRÈS validation user)
  - Reproduire fix sur `index.html` + bump v15.39
  - Commit séparé `v15.39 prod : IRL aperçu lettre`

## 🧪 TESTS À AJOUTER
- `_irlGenererLettreApercu(bail)` ne throw jamais
- Cas DPE F/G figé → message gel affiché
- Cas DPE non renseigné → CTA "Saisir DPE" affiché

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 4** : tester visuellement les 3 cas sur `index-test.html`. Confirmer "OK aperçu fonctionne" avant Phase 5 bascule prod.

---

# 🚀 SPRINT 19B — EMAIL-ONGLET-PERMANENT

**Prio** : P1 · **Taille** : S (1-2h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « je ne vois plus les mails »)
- **Sujet à créer** : `docs/subjects/EMAIL-ONGLET-PERMANENT.md`
- **Lié à** : EMAIL-AUTO ✅ livré v15.09 (29 types, hub modale `ov-comms-hub`)
- **Constat audit** : aucun `#p-emails` dans la sidebar — le hub EMAIL-AUTO est UNIQUEMENT accessible via modale flottante. Le user attend un onglet permanent.

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs (centralisation communications)
2. **Règles** : ne PAS dupliquer la modale → réutiliser le rendu hub via une page wrapper
3. **Justification** : 🧑 cas user 2026-05-16 + 💻 EMAIL-AUTO v15.09 fait le rendu modal-only (régression UX) + 📋 cohérence sidebar
4. **Git status** : clean attendu
5. **5 vues 360°** : axe UX (accessibilité hub) + cycle vie locataire (32+ types email = central)

## 🎯 OBJECTIF
Créer un onglet permanent `#p-emails` "📧 Communications" dans la sidebar, qui affiche le hub EMAIL-AUTO existant (réutilisation rendu).

## 📐 SCOPE
- **Phase 1 — Audit hub modale** (~15min)
  - Localiser `#ov-comms-hub`, `rCommsHub()`, `_commsHistorique()` dans `index-test.html`
  - Identifier le wrapper modal à externaliser (juste le contenu interne)
- **Phase 2 — Création page `#p-emails`** (~30min)
  - Ajouter dans le HTML sidebar (section "Locataires") : `<a data-page="emails">📧 Communications</a>`
  - Ajouter dans le DOM body : `<section id="p-emails" class="page">...</section>`
  - Render JS `rEmailsPage()` qui appelle le helper interne du hub (sans la modale wrapper)
  - 3 sous-tabs : "À envoyer (queue)" / "Historique" / "Modèles"
- **Phase 3 — Coupler depuis le hub modale** (~15min)
  - Garder la modale ouvrable depuis n'importe quelle fiche (ex bouton "✉ Envoyer" dans card bail) pour les actions ponctuelles
  - Bouton "📧 Voir tous les emails" dans la modale → ferme modale + ouvre page `#p-emails`
- **Phase 4 — Tests Vitest** (~15min)
  - `__tests__/helpers/emails-page.test.js` : helper `_emailsListAll()` retourne tous les emails archivés
- **Phase 5 — Commit sandbox** (~10min)
  - Bump `v15.40`
  - Commit `v15.40 feat : onglet permanent Communications (#p-emails)`
- **Phase 6 — Bascule prod** (APRÈS validation user)

## 🧪 TESTS
- Page `#p-emails` rendue avec 3 sous-tabs
- Helper `_emailsListAll()` retourne ≥ 0 emails sans throw
- Bouton "Voir tous les emails" depuis modale fonctionne

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 5** : tester sidebar → cliquer "📧 Communications" → vérifier 3 sous-tabs + historique présent. Confirmer avant bascule prod.

---

# 🚀 SPRINT 19C — BUG-EQUIP-INTERV-FEEDBACK

**Prio** : P1 · **Taille** : S (1h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « intervention enregistrée mais où ?? » + screenshot "Aucun logement trouvé")
- **Sujet à créer** : `docs/subjects/BUG-EQUIP-INTERV-FEEDBACK.md`
- **Lié à** : EQUIP-CONTROLES-PERIODIQUES ✅ livré v15.08 (6 phases)
- **Constat audit** : `saveEquipIntervention()` ligne 31989 appelle `rEquipements()` immédiatement → l'intervention EST sauvée et le rendu se rafraîchit. Mais l'écran montre "Aucun logement trouvé" → filtre actif ne match aucun logement avec équipement saisi (cas : pas de logement avec équipement, ou filtre "Tous immeubles/Tous logements" mal initialisé).

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs (interventions = quotidien)
2. **Règles** : pas de modif backend (data sauvée OK) — fix UX uniquement
3. **Justification** : 🧑 cas user 2026-05-16 + screenshot probant + 💻 régression UX post-v15.08
4. **Git status** : clean attendu
5. **5 vues 360°** : axe UX (feedback save) + cycle vie équipement (DAAF + 7 catégories)

## 🎯 OBJECTIF
Faire que **toujours** après une intervention saisie, la nouvelle ligne soit visible (auto-désactiver filtre + scroll vers la nouvelle ligne).

## 📐 SCOPE
- **Phase 1 — Audit `saveEquipIntervention()`** (~10min)
  - Vérifier ligne 31989 : que fait `rEquipements()` ?
  - Vérifier filtres actifs (`equip-filter-imm`, `equip-filter-log`)
  - Tracer la cause du "Aucun logement trouvé"
- **Phase 2 — Fix** (~30min)
  - Après save : reset filtres à "Tous" (`equip-filter-imm.value = ''`)
  - Re-appel `rEquipements()` avec filtres reset
  - Scroll smooth vers `tr[data-equip-key="${newKey}"]` + highlight CSS 2s
  - Garder toast "✓ Intervention enregistrée" + ajouter sous-texte "(visible dans la liste ↓)"
- **Phase 3 — Tests Vitest** (~10min)
  - `__tests__/helpers/equipements.test.js` : helper `_equipScrollToNew(ref, key)` ne throw pas si élément absent
- **Phase 4 — Commit sandbox**
  - Bump `v15.41`
  - Commit `v15.41 fix : equipements - reset filtres + scroll vers nouvelle intervention`
- **Phase 5 — Bascule prod** (APRÈS validation user)

## 🧪 TESTS
- Helper `_equipScrollToNew(ref, key)` no-throw si DOM absent
- Save intervention reset bien les 2 filtres

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 4** : test sandbox → saisir intervention → vérifier scroll + highlight + filtre reset → confirmer OK.

---

# 🚀 SPRINT 19D — V3-REFONTE-NAV-ONGLETS

**Prio** : P1 · **Taille** : M (2-3h) · **Précède 19E**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user :
  - « baux = locataire. supprimer baux »
  - « Loyers : mauvaise dénomination, il y a tous les mouvements »
  - « est-ce qu'on fait pas un seul onglet avec l'import de mouvements et les mouvements ? »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-NAV-ONGLETS.md`
- **Lié à** : V3-REFONTE-LOYERS (P2 existant) · sidebar globale

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs (clarté navigation)
2. **Règles** : pas de perte de fonctionnalité, juste nettoyage label + structure
3. **Justification** : 🧑 3 cas user explicites 2026-05-16 + 💻 audit confirme labels trompeurs
4. **Git status** : clean attendu
5. **5 vues 360°** : axe UX globale + cohérence design system

## 🎯 OBJECTIF
3 décisions de nav :
1. **Renommer "Loyers & Mouvements" → "Mouvements"** (label sidebar + titre page)
2. **Clarifier "Baux & Locataires"** → garder ce nom (déjà fusion), supprimer la mention "Baux" seule
3. **Fusion Import bancaire dans Mouvements** ou garder onglet Import séparé : **décision à arbitrer ce sprint** (cf 2 propositions ci-dessous)

## 📐 SCOPE
- **Phase 1 — Renommage Loyers → Mouvements** (~30min)
  - HTML sidebar : `Loyers & Mouvements` → `Mouvements`
  - Titre page `#p-loyers` h2 : `Mouvements`
  - Garder l'ID `p-loyers` interne (pas casser localStorage `currentPage`)
  - 3 sous-tabs : `Tous` / `Recettes` / `Dépenses` inchangés
- **Phase 2 — Décision fusion Import / Mouvements** (~30min)
  - **Option A** : garder 2 onglets séparés (Import / Mouvements) avec cross-link "📥 Importer" en haut de Mouvements
  - **Option B** : intégrer un bouton "+ Importer relevé bancaire" dans la page Mouvements directement
  - **Recommandation** : **Option A** (séparation claire data entry vs visualisation) + bouton cross-link en haut Mouvements
- **Phase 3 — Sidebar : revoir nom "Baux & Locataires"** (~15min)
  - Garder le nom (déjà clair)
  - Vérifier que la vue Actifs cards est bien le défaut
  - Ajouter un sous-titre "👥 Profils locataires + 📜 baux signés"
- **Phase 4 — Tests Vitest** (~20min)
  - `__tests__/helpers/nav.test.js` : helper `_navLabel(pageId)` retourne le bon label
- **Phase 5 — Commit sandbox**
  - Bump `v15.42`
  - Commit `v15.42 feat : nav onglets - Loyers→Mouvements + cross-link Import + label Baux`
- **Phase 6 — Bascule prod** (APRÈS validation user)

## 🧪 TESTS
- Label "Mouvements" affiché dans sidebar
- ID `p-loyers` toujours valide (pas casser localStorage)
- Cross-link Import → Mouvements fonctionne

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 5** : 
- Tester sidebar nouveau label
- Confirmer Option A retenue (ou demander Option B)
- Confirmer avant bascule prod

---

# 🚀 SPRINT 19E — V3-REFONTE-IMPORTS-UI

**Prio** : P1 · **Taille** : M (2-3h) · **Post-19D**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « imports : il faut revoir on mélange tout : import bancaire et de données de base ! il faut revoir le tableau (3 onglets qui se répètent !) il faut un tableau simple et rapide à compléter pour import d'autres bases de données »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-IMPORTS-UI.md`
- **Lié à** : IMPORT-EXCEL-LOG ✅ livré · BANK-INTEGRATION V1 ✅ livré v15.07 · IMPORT-CONCURRENTS (À faire)

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs migrant depuis Rentila/BailFacile/Qalimo + saisie initiale
2. **Règles** : sandbox-first + simplification (pas plus de complexité)
3. **Justification** : 🧑 cas user 2026-05-16 explicite + 💻 audit confirme 2 workflows mélangés
4. **Git status** : clean attendu
5. **5 vues 360°** : axe UX (clarté) + axe commercial (différenciant import concurrents)

## 🎯 OBJECTIF
Refondre `#p-import` en **3 sous-tabs clairs** (au lieu de 2 sections mélangées) :
1. **📋 Référentiel** : entités + immeubles + logements + baux (Excel)
2. **💳 Bancaire** : relevés CSV/OFX/QIF
3. **🔄 Concurrents** : tableau simple pour import depuis solutions tierces (Rentila/BailFacile/Qalimo)

## 📐 SCOPE
- **Phase 1 — Restructuration UI** (~45min)
  - Ajouter 3 sous-tabs dans `#p-import` (style identique aux autres tabs app)
  - Migrer Import Référentiel actuel dans tab 1
  - Migrer Import Bancaire actuel dans tab 2
  - Créer tab 3 vide "🔄 Import depuis solutions concurrentes"
- **Phase 2 — Tab 3 "Concurrents"** (~60min)
  - Tableau simple : Colonne | Description | Exemple
  - Lignes : type bien, adresse, surface, nb pièces, locataire, loyer, charges, IRL, DPE, etc.
  - Bouton "📥 Importer fichier" (drop zone CSV/Excel)
  - Aide visuelle : "Exportez depuis Rentila/BailFacile/Qalimo en CSV → uploadez ici"
  - Mapping colonnes auto (par nom de colonne) + manuel si différent
- **Phase 3 — Helpers parsing** (~30min)
  - `_importConcurrentsParse(csvText)` : détecte les colonnes et propose un mapping
  - `_importConcurrentsApply(mapping, rows)` : crée logements + baux à partir du mapping
- **Phase 4 — Tests Vitest** (~30min)
  - `__tests__/helpers/import-concurrents.test.js` :
    - Parse CSV Rentila (fixture) → retourne array d'objets
    - Apply mapping → crée logement + bail en DB
    - Gestion erreurs (colonne manquante, mauvais format)
- **Phase 5 — Commit sandbox**
  - Bump `v15.43`
  - Commit `v15.43 feat : refonte Import - 3 sous-tabs (Référentiel/Bancaire/Concurrents)`
- **Phase 6 — Bascule prod** (APRÈS validation user)

## 🧪 TESTS
- 3 sous-tabs présents et fonctionnels
- Parse CSV simple → array d'objets
- Mapping auto par nom colonne fonctionne
- Création logement+bail via mapping OK

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 5** : tester les 3 sous-tabs + faire un import CSV factice → confirmer OK avant bascule prod.

---

# 🚀 SPRINT 19F — IRL-RAPPEL-MAJ-INSEE

**Prio** : P2 · **Taille** : S (1-2h) · **Post-19A**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « Table IRL avoir un rappel pour mise à jour »)
- **Sujet à créer** : `docs/subjects/IRL-RAPPEL-MAJ-INSEE.md`
- **Lié à** : IRL-VALIDATION ✅ v13.33 · BUG-IRL-001 ✅ v13.30

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs (l'INSEE publie l'IRL chaque trimestre)
2. **Règles** : pas de fetch externe (offline-first), juste un rappel calendaire
3. **Justification** : 🧑 cas user 2026-05-16 + 💻 INSEE publie T1 mi-avril, T2 mi-juillet, T3 mi-octobre, T4 mi-janvier
4. **Git status** : clean attendu
5. **5 vues 360°** : axe légal (IRL obligatoire) + axe UX (rappel proactif)

## 🎯 OBJECTIF
Carte rappel dans le sous-tab "Table IRL INSEE" qui détecte si la table est obsolète (dernier trimestre publié vs trimestre actuel) et invite à mettre à jour.

## 📐 SCOPE
- **Phase 1 — Helper détection obsolescence** (~30min)
  - `_irlInseeLastPublishedQuarter()` : retourne le dernier trimestre publié dans `DB.params.irlIndices`
  - `_irlInseeIsOutdated()` : true si le dernier trimestre publié est plus vieux que le trimestre attendu (selon date du jour : T1 dispo mi-avril, T2 mi-juillet, etc.)
  - `_irlInseeMissingQuarters()` : liste les trimestres manquants
- **Phase 2 — UI bannière rappel** (~30min)
  - Bannière jaune en haut de "Table IRL INSEE" si `_irlInseeIsOutdated()` :
    - « ⚠️ Indices IRL manquants : T2 2026, T3 2026 — Mettez à jour depuis insee.fr »
    - Lien direct : https://www.insee.fr/fr/statistiques/serie/001515333
    - Bouton "Marquer comme à jour" (force `DB.params.irlLastChecked = today`)
- **Phase 3 — Tests Vitest** (~30min)
  - `__tests__/helpers/irl-insee.test.js` :
    - Dernier T1 2026 + date 2026-08-01 → T2 manquant
    - Dernier T2 2026 + date 2026-08-01 → up to date
    - Date 2026-04-30 → T1 attendu mi-avril, vérifier détection
- **Phase 4 — Commit sandbox**
  - Bump `v15.44`
  - Commit `v15.44 feat : IRL rappel maj Table INSEE par trimestre`
- **Phase 5 — Bascule prod** (APRÈS validation user)

## 🧪 TESTS
- 3 cas calendaires (avant publication / pendant / après)
- Bannière affichée si outdated, masquée sinon
- Bouton "Marquer à jour" persist localStorage

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 4** : tester sandbox avec date forcée → bannière apparaît → confirmer OK.

---

# 🚀 SPRINT 19G — V3-REFONTE-ASSURANCES

**Prio** : P2 · **Taille** : M (2-3h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « assurances et EDL encore sous forme de tableau à l'ancienne, il faut revoir ça ! »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-ASSURANCES.md`
- **Lié à** : MRH-AUTO-LOC (P2) · design system V3 cards

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs (PNO/GLI obligatoire + MRH locataire à vérifier)
2. **Règles** : design consistency + responsive + pas de perte fonctionnalité
3. **Justification** : 🧑 cas user 2026-05-16 + 💻 audit confirme tableau brut + 📋 cohérence avec autres onglets refondus
4. **Git status** : clean attendu
5. **5 vues 360°** : axe légal (assurances obligatoires) + axe UX (design consistency)

## 🎯 OBJECTIF
Remplacer les 2 tableaux `<table class="tbl">` de l'onglet Assurances par des cards modernes (style identique aux cards Baux Actifs).

## 📐 SCOPE
- **Phase 1 — Audit existant** (~15min)
  - Localiser `rAss()` ligne 16481
  - Lister les champs affichés par contrat (compagnie, n° contrat, échéance, garanties, montant, statut)
- **Phase 2 — Design cards** (~60min)
  - 1 card par contrat (PNO/GLI ou MRH)
  - Header : type (icône) + compagnie + n° contrat + badge statut (Actif/Échue/Renouv)
  - Body : garanties principales + date échéance (avec progbar j-30/j-60)
  - Footer : montant annuel + boutons (Éditer / Renouveler / Document)
  - 2 sections : "🛡 Bailleur (PNO/GLI)" + "👥 Locataires (MRH)"
  - Grid responsive `class="g2"` (desktop 2 cols, mobile 1 col)
- **Phase 3 — Refactor `rAss()`** (~45min)
  - Nouvelle fonction `rAssCards()` qui génère le HTML cards
  - Conserver l'ancien `rAss()` ou le remplacer
  - Garder compat localStorage (pas de migration data)
- **Phase 4 — Filtres + tri** (~15min)
  - Filtre par immeuble (dropdown haut)
  - Tri par échéance ascendante (les + urgentes en haut)
  - Toggle "Afficher contrats échus"
- **Phase 5 — Tests Vitest** (~20min)
  - `__tests__/helpers/assurances.test.js` :
    - Sort by échéance asc
    - Filtre par immeuble
    - Badge statut selon date échéance
- **Phase 6 — Commit sandbox**
  - Bump `v15.45`
  - Commit `v15.45 feat : refonte Assurances en cards modernes`
- **Phase 7 — Bascule prod** (APRÈS validation user)

## 🧪 TESTS
- Render 0 contrat → message vide gracieux
- Render N contrats → grid avec N cards
- Tri par échéance OK
- Filtre par immeuble OK

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 6** : test sandbox → cards visibles + tri OK + responsive mobile OK → confirmer avant bascule prod.

---

# 🚀 SPRINT 19H — V3-REFONTE-EDL-CARDS

**Prio** : P2 · **Taille** : M (2-3h) · **Indépendant**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « assurances et EDL encore sous forme de tableau à l'ancienne »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-EDL-CARDS.md`
- **Lié à** : EDL-VALIDATION-AVOCAT (P1) · EDL-TEMPLATE-PER-LOG (P2) · EDL-DELEGUE-EXPORT/IMPORT (P2)

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs (EDL obligatoire entrée + sortie loi 89-462 art 3-2)
2. **Règles** : design consistency + responsive
3. **Justification** : 🧑 cas user 2026-05-16 + 💻 audit tableau brut + 📋 cohérence
4. **Git status** : clean attendu
5. **5 vues 360°** : axe légal (EDL obligatoire) + axe UX

## 🎯 OBJECTIF
Remplacer le `<table class="tbl">` EDL par des cards modernes avec filtres.

## 📐 SCOPE
- **Phase 1 — Audit existant** (~15min)
  - Localiser `rEDLList()` et `edl-tbody`
  - Champs : logement / locataire / type (entrée/sortie) / date / pièces / signature / actions
- **Phase 2 — Design cards** (~60min)
  - 1 card par EDL
  - Header : badge type (🔵 Entrée / 🟠 Sortie) + logement + date
  - Body : locataire + pièces couvertes + statut signature
  - Footer : boutons (Voir / Éditer / Imprimer / Comparer entrée/sortie)
  - Grid responsive `class="g2"` ou `g3`
- **Phase 3 — Filtres** (~30min)
  - Filtre par logement (dropdown)
  - Filtre par type (Tous/Entrée/Sortie)
  - Filtre par statut signature (Tous/Signé/En attente)
  - Tri par date desc
- **Phase 4 — Refactor `rEDLList()`** (~30min)
  - Nouvelle fonction `rEDLCards()` qui génère HTML cards
  - Conserver l'historique tableau (vue alternative ?)
- **Phase 5 — Tests Vitest** (~20min)
  - `__tests__/helpers/edl.test.js` :
    - Tri par date desc OK
    - Filtres OK
    - Pairing entrée/sortie pour comparaison
- **Phase 6 — Commit sandbox**
  - Bump `v15.46`
  - Commit `v15.46 feat : refonte EDL en cards modernes + filtres`
- **Phase 7 — Bascule prod** (APRÈS validation user)

## 🧪 TESTS
- Render 0/N EDL OK
- Filtres combinés OK
- Pairing entrée/sortie OK

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 6** : test sandbox + responsive → confirmer avant bascule prod.

---

# 🚀 SPRINT 19I — V3-REFONTE-PARAMS-AUDIT

**Prio** : P2 · **Taille** : S (1h) · **Nécessite input USER**

## 📋 CONTEXTE
- **Détecté** : 2026-05-16 (user : « paramètres et export (on a ajouté plein de choses qui ne sont plus valables maintenant) »)
- **Sujet à créer** : `docs/subjects/V3-REFONTE-PARAMS-AUDIT.md`
- **Lié à** : V3-REFONTE-PARAMS (P2 existant)

## ✅ PRÉ-VOL
1. **Cible** : tous bailleurs (Paramètres = config app)
2. **Règles** : ne RIEN supprimer sans confirmation user (risque perte fonctionnalité)
3. **Justification** : 🧑 cas user 2026-05-16 + 💻 audit confirme 9 sous-tabs Params + 8 cards Export (mais "obsolescence" est subjective)
4. **Git status** : clean attendu
5. **5 vues 360°** : axe nettoyage codebase + axe UX

## 🎯 OBJECTIF
**Phase préparatoire** : faire un inventaire complet des 9 sous-tabs Paramètres + 8 cards Export, et demander au user de pointer ce qui est obsolète.

## 📐 SCOPE
- **Phase 1 — Inventaire Paramètres** (~30min)
  - Lister les 9 sous-tabs avec leurs fonctionnalités exactes :
    1. Catégories
    2. Pièces EDL
    3. Modèle bail
    4. Règles import
    5. Thème
    6. Mandataire
    7. Partage
    8. Profil utilisateur
    9. Préférences globales
  - Pour chaque : screenshot + liste des options + dernière utilisation détectable
- **Phase 2 — Inventaire Export** (~15min)
  - Lister les 8 cards d'action avec leur fonction
- **Phase 3 — Document `PARAMS-EXPORT-INVENTAIRE.md`** (~15min)
  - Tableau exhaustif → demander au user de pointer ce qui est obsolète/à supprimer
- **Phase 4 — STOP USER OBLIGATOIRE**
  - User indique ce qui est obsolète
  - PUIS Phase 5 (sprint suivant 19I.2)

## 🚨 STOP USER OBLIGATOIRE
**Après Phase 3** : user lit l'inventaire et pointe les options à purger. **Pas de suppression sans son OK**.

---

# 📦 Phase de clôture Sprint 19 (post 19I)

Après les 9 sprints livrés :
1. **BACKLOG.md** : marquer Sprint 19 ✅ livré avec liste exhaustive des bumps versions (v15.39 → v15.47+)
2. **MEMORY auto-memory** : update `project_immotrack.md` si nouvelles décisions arch (ex : tab Mouvements remplace Loyers)
3. **Bascule prod globale** : si user veut faire 1 seul commit prod final regroupant tout (alternative aux bascules sprint par sprint)
4. **HTML report** : générer `docs/strategie/SPRINT-19-LIVRAISON.html` récap pour archive

---

## 🎯 Rappel final — Workflow par sprint

```
1. Nouvelle session Claude Code → coller le prompt Sprint 19X
2. Claude crée le sujet docs/subjects/[CODE].md + applique pré-vol
3. Claude exécute Phase 1 → Phase N en sandbox (index-test.html)
4. Claude commit sandbox + bump version + update BACKLOG.md
5. ⏸️ STOP USER : test visuel + validation OK
6. Claude bascule prod (index.html) + commit séparé
7. Sprint suivant
```

**Ne pas oublier** :
- 🧪 Toujours `npm test` après chaque sprint (Vitest ne doit pas casser)
- 📝 Pré-vol 5 critères TOUJOURS appliqué avant action
- 🔍 Modify+Verify TOUJOURS appliqué après modif
