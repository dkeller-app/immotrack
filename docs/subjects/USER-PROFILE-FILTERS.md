# USER-PROFILE-FILTERS — Profils utilisateur + filtres d'activation modules

**Status** : ✅ Livré v15.04 (Sprint 6 V1.1, 2026-05-13) · **Prio** : P1 V1.1 · **Taille** : M (3-5h → ~4h réalisé)
**Détecté** : 2026-05-13 (suite analyse ARBORESCENCE-APP.md)
**Lié à** : `feedback_pas_copier_concurrent.md` (vision simple) · DASH-PROFILES · BIZPLAN

## Contexte
Demande utilisateur 2026-05-13 :
> 💬 « on fait une solution qui est simple d'utilisation et avec une expérience utilisateur amélioré »
> 💬 « définir les features manquantes et celles qui sont superflues pour une utilisation fluide (on peut peut etre mettre des filtres d'activation) »

**Problème** : ImmoTrack a maintenant 17-19 onglets et 83 sujets backlog. Un bailleur particulier solo se noie. Un mandataire pro a besoin de tout. **Solution** : profils utilisateur avec activation/désactivation de modules.

## Cadre légal & marché
Pattern standard SaaS B2B (Notion, Linear, ClickUp) : "workspace presets" qui adaptent l'UI selon le persona. Différenciant vs Qalimo (qui montre tout à tout le monde et noie ses utilisateurs amateurs).

## Scope

### Phase 1 — Modèle + setup wizard (~1.5h)
- Champ `DB.params.userProfile` : `'solo' | 'sci_familiale' | 'pro' | 'mandataire'` (default `null` au 1er load)
- Champ `DB.params.modulesEnabled` : `{ [moduleKey]: bool }` override profil
- Setup wizard 1ère ouverture (modale ou onglet dédié) :
  - Question 1 : "Combien de logements gérez-vous ?" (1-3 / 3-10 / 10-30 / 30+)
  - Question 2 : "Quel est votre statut juridique ?" (Particulier / SCI / SAS / Mandataire Hoguet)
  - Question 3 : "Êtes-vous mandataire (gérez pour d'autres) ?" (Oui/Non)
  - Question 4 : "Comment gérez-vous votre comptabilité ?" (Autonome / Excel / Expert-comptable)
- Calcul automatique du profil + sauvegarde

### Phase 2 — Matrice d'activation modules (~1.5h)
Helper `_isModuleEnabled(moduleKey, userProfile)` qui retourne true/false :

| Module | Solo | SCI | Pro | Mandataire |
|---|---|---|---|---|
| `dashboard-simple` | ✅ | ✅ | ✅ | ✅ |
| `dashboard-lentilles` | ❌ | ✅ | ✅ | ✅ |
| `biens` / `locataires` / `baux` / `mouvements` / `quittances` / `irl` / `edl` / `mrh` / `params` | ✅ | ✅ | ✅ | ✅ |
| `bailleurs-multi` | ❌ | ✅ | ✅ | ✅ |
| `candidats` | ❌ | ✅ | ✅ | ✅ |
| `charges-regul` | basique | ✅ | ✅ | ✅ |
| `travaux` | ❌ | ✅ | ✅ | ✅ |
| `pilotage-matriciel` | ❌ | ❌ | ✅ | ✅ |
| `fiscal-2044` | basique | ✅ | ✅ | ✅ |
| `export-fec` | ❌ | ❌ | ✅ | ✅ |
| `mandat-crg-sepa` | ❌ | ❌ | ❌ | ✅ |
| `audit-trail-ui` | ❌ | ❌ | ✅ | ✅ |
| `carnet-adresse` | ❌ | ❌ | ✅ | ✅ |
| `bank-integration` | ❌ | option | ✅ | ✅ |

Override par utilisateur via `DB.params.modulesEnabled[moduleKey]` (true/false).

### Phase 3 — Sidebar dynamique (~1h)
- Au render sidebar, filtrer les onglets visibles selon `_isModuleEnabled`
- Re-render auto à chaque changement de profil
- Préserver les routes deeplink legacy (redirect si module désactivé)

### Phase 4 — UI Paramètres "Profil utilisateur" (~1h)
- Section dans Paramètres avec :
  - Badge profil actuel + bouton "Modifier"
  - Liste des modules avec toggles individuels
  - Bouton "Réinitialiser au profil défaut"
- Mémorisation localStorage
- Auto-détection : si nb logements > 10 et profil = solo → toast "Souhaitez-vous passer en profil SCI Familiale ?"

### Phase 5 — Tests Vitest (~30min)
- `__tests__/helpers/profile.test.js` :
  - `_calculProfile(answers)` mapping correct
  - `_isModuleEnabled(module, profile, overrides)` cas nominaux + overrides
  - `_shouldSuggestUpgrade(nbLogements, profile)` seuils

## Décisions arbitrées 2026-05-13
- [x] **Vision "simple d'utilisation"** (user)
- [x] **4 profils** (Solo / SCI Familiale / Pro / Mandataire) au lieu de 1 monolithe
- [x] **Override possible par module** (un solo peut activer Candidats s'il le veut)
- [x] **Setup wizard** : skippable (default = Solo) — implémenté avec bouton "Passer (par défaut Solo)"
- [x] **Modules désactivés** : masqués sidebar (UX plus propre) — implémenté via `_renderSidebarFiltered()`

## Différenciant marché

| Solution | Profils utilisateur | Filtres modules |
|---|---|---|
| Rentila | ❌ même UI pour tous | ❌ |
| BailFacile | ❌ | ❌ |
| Qalimo V2 | ❌ tout pour tous (sa faiblesse UX) | ❌ |
| Smovin | partial (offres pricing) | ❌ |
| Notion / Linear (SaaS) | ✅ presets workspace | ✅ |
| **ImmoTrack après USER-PROFILE-FILTERS** | ⭐ 4 profils + UI adaptée | ⭐ unique sur le marché |

## Notes utilisateur
> 💬 2026-05-13 : « on fait une solution qui est simple d'utilisation »
> 💬 2026-05-13 : « définir les features manquantes et celles qui sont superflues pour une utilisation fluide (on peut peut etre mettre des filtres d'activation) »
> 💬 2026-05-13 (post-livraison v15.04) : « là comme ça je ne vois pas l'utilité. mais bon ça peut servir demain pour limiter ou ouvrir des accès en fonction du type d'abonnement »
>
> **Validation de l'insight stratégique** : pour le solo actuel l'effet visible est nul (12 modules CORE inchangés), mais l'infrastructure est exactement la bonne pour le gating SaaS par tier d'abonnement. Sujet capté → `docs/subjects/SAAS-PRICING-TIERS.md`. Activera la matrice quand on basculera en commercial.

## Journal
- 2026-05-13 : créé · le sujet qui change tout — permet de garder toutes les features sans surcharger l'UX amateur. **À attaquer en premier Sprint 6 V1.1.**
- 2026-05-13 : ✅ Livré v15.04 (Sprint 6 V1.1, ~4h). 5 phases livrées :
  - **Phase 1** (modèle + wizard) : `DB.params.userProfile/modulesEnabled/profileWizardDone` migration douce + helpers `_calculateProfile(answers)` + `_isModuleEnabled(moduleKey, profile, overrides)` + modal `#ov-profile-wizard` 4 questions (nb logements, statut, mandataire, compta) avec live preview + hook boot 2.5s skippable.
  - **Phase 2** (matrice) : inline dans `_isModuleEnabled` — 12 modules CORE toujours actifs, SOLO_OFF 10 modules masqués, SCI_OFF/PRO_OFF subset, mandataire = tout actif. Override prioritaire sur matrice.
  - **Phase 3** (sidebar dynamique) : `data-module="..."` sur 14 tabs + `data-module-section="..."` sur 5 sections + `_renderSidebarFiltered()` qui masque tabs+sections vides. Trigger boot après initDB + appel après save wizard + appel après toggle Paramètres.
  - **Phase 4** (UI Paramètres) : onglet "👤 Profil utilisateur" + `rParamsProfile()` : badge profil + récap réponses wizard + 14 toggles modules avec badge "override actif" + bouton modifier profil + bouton réinit modules. `_profileToggleModule(key, on)` + `_profileResetOverrides()`.
  - **Phase 5** (tests) : `__tests__/helpers/profile.test.js` — 68 tests (calcul profil ×13 / matrice modules ×42 / overrides ×4 / edge cases ×3 / cohérence labels ×1). 446 tests total au lieu de 378.
- Décisions arbitrées :
  - Wizard skippable, default = solo (vision UX simple).
  - Modules désactivés = masqués sidebar (pas grisés Pro Connect).
  - Modules "à venir" (Sprint 7+) déjà dans la matrice + toggles UI avec mention "À venir" : extensibilité sans toucher le wizard.
- **Bonus session** : BUG-CHARGE-001 résiduel (6 sites legacy) + BUG-DASH-001 résiduel fixés dans le même Sprint 6 (audit Explore avait détecté `_buildProgDrill` l.5892 CRITIQUE DASHBOARD).
