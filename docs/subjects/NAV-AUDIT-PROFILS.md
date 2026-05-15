# NAV-AUDIT-PROFILS — Audit navigation + onglets par profil Solo/Gestionnaire/Pro

> **Statut** : 🔄 Audit complet livré 2026-05-15 (Phase C) · Implémentation à découper en sous-sprints
> **Prio** : P1 · **Taille** : L (audit fait, implé 15-25h)
> **Lié à** : DASH-PROFILES (✅ livré v15.13) · USER-PROFILE-FILTERS (✅ livré v15.04) · refonte UX dashboard wahoo (Phase B agent design v2 en cours)

---

## Contexte

User V1.1 marathon : *« il y a plein de rajouts partout qui sont peu compréhensibles !!! et cela complexifie tout »* + *« trop d'infos tue l'info »*.

DASH-PROFILES Phase 2 a livré 4 onglets dashboard (Propriétaire/Gestionnaire/Complet/Custom) **mais la sidebar reste identique pour tous les profils**. → Un bailleur Solo voit 13 entrées de navigation alors qu'il n'en utilise réellement que 5.

## Inventaire actuel sidebar (13 entrées + dashboard = 14)

| # | Section | Onglet | Présence Solo | Présence Gestionnaire | Présence Pro |
|---|---|---|---|---|---|
| 1 | Vue d'ensemble | 📊 Tableau de bord | ✅ | ✅ | ✅ |
| 2 | Vue d'ensemble | 📥 Import / Données | ✅ rare | ✅ | ✅ |
| 3 | Vue d'ensemble | 💶 Loyers & Mouvements | ✅ | ✅ | ✅ |
| 4 | Patrimoine | 🏠 Biens | ✅ | ✅ | ✅ |
| 5 | Locataires | 📅 Agenda | ⚠️ peu utilisé | ✅ | ✅ |
| 6 | Locataires | 🔧 Équipements | ⚠️ contextuel logement | ✅ | ✅ |
| 7 | Locataires | 📋 Baux & Locataires | ✅ | ✅ | ✅ |
| 8 | Locataires | 🛡 Assurances | ⚠️ « nul » selon user | ✅ | ✅ |
| 9 | Locataires | 🧾 Quittances | ✅ | ✅ | ✅ |
| 10 | Locataires | 🔍 États des lieux | ⚠️ rare | ✅ | ✅ |
| 11 | Locataires | 🎛 Pilotage | ⚠️ inutile Solo | ✅ | ✅ |
| 12 | Finances | 📈 Révision IRL | ⚠️ 1×/an | ✅ | ✅ |
| 13 | Finances | ⚖️ Régularisation | ⚠️ 1×/an | ✅ | ✅ |
| 14 | Config | ⚙️ Paramètres | ✅ | ✅ | ✅ |
| 15 | Config | 💾 Export / Sauvegarde | ✅ | ✅ | ✅ |

**Constat** : 13 entrées + dashboard pour un Solo qui utilise 5-6 fonctions = saturation cognitive.

## Verdict par onglet

### 🟢 Garder en top-nav (4 onglets cœur tous profils)
- **Tableau de bord** : entry-point, doit donner toute l'info essentielle en 1 écran (Phase B en cours)
- **Biens** : hub patrimoine (Bailleurs/Immeubles/Logements)
- **Baux & Locataires** : objet métier central
- **Loyers & Mouvements** : encaissements + dépenses

### 🟡 Garder mais reclassifier ou fusionner
- **Quittances** : à fusionner avec Loyers ? Décision : **rester séparé** car volume haut + workflow distinct (génération masse, envoi, archivage). Sous-onglet du module Loyers possible.
- **Paramètres + Export/Sauvegarde** : à fusionner sous un seul item « Paramètres » avec onglet interne « Sauvegarde ». Gain : -1 entrée sidebar.
- **Import / Données** : à **scinder en 2** (récurrent user : *« Import création séparé d'Import comptable »*) :
  - **Import patrimoine** = importer immeubles/logements en masse (création) → sous-onglet de Biens
  - **Import comptable** = importer mouvements bancaires (BANK-INTEGRATION) → sous-onglet de Loyers

### 🟠 Refondre / repenser
- **Agenda** : user a dit *« Agenda refonte »* — à clarifier en session dédiée. Hypothèse : transformer en widget dashboard + supprimer l'onglet top-nav.
- **Assurances** : user *« onglet assurances est nul »* — à reconsidérer. Hypothèse : devient un widget dashboard + sous-onglet fiche logement (MRH + PNO + GLI).
- **Pilotage matriciel** : très utile Gestionnaire/Pro, inutile Solo (1-3 lots → tableau matriciel n'a aucun sens). **Cacher pour profil Solo** (USER-PROFILE-FILTERS).
- **Équipements** : top-nav peu pertinent (contextuel logement). **Cacher pour Solo**, garder en sous-onglet fiche logement déjà existant.

### 🔴 Sortir du top-nav (devenir sous-onglet contextuel)
- **États des lieux** : déjà disponible en sous-onglet fiche bail. Top-nav doublon. **Supprimer top-nav** (garder accès via bail).
- **Révision IRL** : action 1×/an par bail. Top-nav surdimensionné. **Sortir** → sous-onglet fiche bail + widget dashboard quand révision due.
- **Régularisation** : action 1×/an par bail. **Sortir** → sous-onglet fiche bail + widget dashboard.

## Sidebar cible par profil

### Profil Solo (5 entrées top + Plus)
```
📊 Tableau de bord
🏠 Patrimoine               (Biens hub)
💶 Argent                   (Loyers & Mouvements + Quittances fusionnés visuellement)
📋 Locataires               (Baux + EDL en sous-onglet)
⚙️ Paramètres               (params + export)
─ ⚙ Plus (collapsable)     (Pilotage, IRL, Régul, Assurances, Import — accès rare)
```

### Profil Gestionnaire (10 entrées)
```
📊 Tableau de bord
🎛 Pilotage matriciel       (vue cœur métier gestionnaire)
🏠 Patrimoine
👥 Bailleurs/Clients        (séparé de Biens — multi-mandant)
📋 Baux & Locataires
💶 Loyers & Mouvements
🧾 Quittances
📅 Agenda                   (échéances multi-baux)
🔧 Équipements              (contrôles périodiques par lot)
⚙️ Paramètres + Export
```

### Profil Pro (Gestionnaire + multi-portfolio)
Identique Gestionnaire mais avec **switcher de portfolio** en haut (multi-bailleurs clients).

## Plan d'implémentation (post-Phase B agent design v2)

### C1 — Nav adaptative par profil (8-12h)
- Étendre `_renderSidebarFiltered()` (déjà v15.04) pour vraiment cacher (pas grayer) les onglets selon profil
- Ajout section « Plus » collapsable pour Solo
- Persist profil utilisateur dans `DB.params.profile` (`solo|gestionnaire|pro`)
- Détection auto au boot si pas défini : 1-3 lots → solo ; 10+ lots → gestionnaire ; multi-bailleurs → pro

### C2 — Scinder Import en 2 (3-4h)
- Renommer onglet `Import / Données` en `Import patrimoine`, le déplacer en sous-onglet de Biens
- Créer sous-onglet `Import comptable` de Loyers (déjà BANK-INTEGRATION partiellement)
- Migration deeplinks legacy

### C3 — Sortir EDL / IRL / Régul du top-nav (4-6h)
- Garder accès via fiche bail (sous-onglets existants)
- Ajouter widgets dashboard contextuels (« 3 baux ont une révision IRL due cette semaine »)
- Routes legacy `go('edl'|'irl'|'regul')` conservées pour permaliens
- Supprimer entries sidebar pour profil Solo (Gestionnaire les garde)

### C4 — Refonte Agenda (à scoper avec user)
- Brief user à recueillir : *« Agenda refonte »* sans détail
- Hypothèse : transformer en widget dashboard + cacher top-nav pour Solo

### C5 — Décision Assurances (à scoper avec user)
- Brief user : *« onglet assurances est nul »* — à comprendre ce qui ne va pas
- Hypothèse : refondre en widget dashboard + sous-onglet fiche logement
- Ne pas garder top-nav pour profil Solo

### C6 — Fusionner Paramètres + Export (1-2h)
- Onglet `Paramètres` avec sous-onglets `Préférences | Sauvegarde | Drive | Audit | RGPD`
- Supprimer entrée top-nav `Export/Sauvegarde`

## Effort total Phase C
- C1 nav adaptative : 8-12h
- C2 import scindé : 3-4h
- C3 sortir EDL/IRL/Régul : 4-6h
- C4 refonte Agenda : à scoper (3-8h estimé)
- C5 décision Assurances : à scoper (3-8h estimé)
- C6 fusion Paramètres : 1-2h
- **Total estimé : 22-40h sur 2-3 mois (à découper en sprints)**

## Pré-requis avant code
- ✅ Phase B mockup dashboard wahoo v2 (agent design en cours)
- ⏳ Validation user des mockups B avant attaque navigation
- ⏳ Brief user clarifié pour C4 (Agenda) et C5 (Assurances)

## Notes
- Cohérence ux : la navigation doit être pensée AVEC le dashboard refondu (B), pas après. Sinon doublons d'audit user
- Pour SaaS Phase D : la navigation Solo simplifiée + Gestionnaire est le **différenciant marketing** (vs Qalimo surchargé)
