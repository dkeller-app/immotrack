# USER-PROFILE-FILTERS — Profils utilisateur + filtres d'activation modules

**Status** : ⬜ À faire · **Prio** : P1 V1.1 · **Taille** : M (3-5h)
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
- [ ] **Setup wizard** : obligatoire au 1er load OU skippable ? → Recommandation skippable (default = Solo, le moins surchargé)
- [ ] **Modules désactivés** : masqués sidebar OU grisés avec "🔒 Pro Connect" ? → Recommandation masqués (UX plus propre)

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

## Journal
- 2026-05-13 : créé · le sujet qui change tout — permet de garder toutes les features sans surcharger l'UX amateur. **À attaquer en premier Sprint 6 V1.1.**
