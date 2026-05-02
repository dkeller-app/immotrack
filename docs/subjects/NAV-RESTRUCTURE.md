# NAV-RESTRUCTURE — Restructuration navigation principale (sortir Biens/Bailleurs du Référentiel)

**Status** : ✅ Livré v14.2 (2026-05-01) · **Prio** : P1 · **Taille** : S (livré ~1h)
**Détecté** : 2026-05-01
**Lié à** : LOG-LISTE-CARDS · LOG-FICHE-360 · V3-REFONTE-PARAMS

## Contexte
Demande utilisateur 2026-05-01 :
> 💬 « on fait la création de bien par cet onglet alors et on enlève logements et entités de référentiel ? »

Aujourd'hui ImmoTrack a probablement :
- Onglet **Référentiel** contenant Logements + Entités/Bailleurs + autres données paramétrables (catégories, taux, etc.)

Cette structure est **fonctionnelle** mais **pas alignée** avec les patterns concurrents (Qalimo/BailFacile/Smovin) où :
- Les **biens** sont un onglet **majeur** au top niveau (premier ou deuxième)
- Les **bailleurs** sont un onglet dédié OU dans Paramètres
- Le **paramétrage technique** (catégories, équipements types, IRL, taux TVA) reste dans un onglet "Paramètres"

## Scope

### Cible nav proposée (à valider)
```
🏢 Tableau de bord
🏠 Biens                    ← NOUVEAU (sort de Référentiel)
👤 Bailleurs / Entités      ← NOUVEAU (sort de Référentiel) — OU dans Paramètres si pas top-nav
📜 Baux
👥 Locataires
💰 Mouvements
🧾 Quittances
📈 IRL
📋 EDL
⚡ Charges / Régul
🛡️ MRH
🔧 Travaux
⚙️ Paramètres / Référentiel ← devient "settings techniques" : catégories mvt, équipements types, IRL, TVA, etc.
```

### Migration (livrée v14.2)
- [x] Déplacer route/onglet `#log` (logements) hors `Référentiel` → onglet sidebar dédié `Biens` (`go('biens')`, page `#p-biens`)
- [x] Déplacer route/onglet `#ent` (entités) hors `Référentiel` → onglet sidebar dédié `Bailleurs` (`go('bailleurs')`, page `#p-bailleurs`)
- [x] Renommer item sidebar `Référentiel` en `Paramètres` (titre topbar `Paramètres` aussi)
- [x] Sidebar : nouvelle section "Patrimoine" (entre Vue d'ensemble et Locataires) avec Biens + Bailleurs
- [x] Mettre à jour les liens internes (redirect `setParamsTab('logements'|'entites')` → `go('biens'|'bailleurs')` pour les deeplinks legacy)
- [x] Bouton primaire `+ Bien` dans onglet Biens
- [x] Bouton primaire `+ Bailleur` dans onglet Bailleurs

### Décisions prises (par défaut, faute de validation utilisateur en session)
- [x] **Bailleurs/Entités** : Option A retenue (sidebar dédiée). Cohérent avec pattern Qalimo et préparation SaaS multi-user.
- [x] **Renommer "Référentiel"** en "Paramètres" (terme standard). Onglet interne "Paramètres globaux" renommé en "Préférences" pour éviter la collision.
- [x] **Ordre sidebar** : Biens en premier de la section Patrimoine (objet métier central).
- [ ] **Mobile bottom-nav** : non livré, sidebar mobile coulissante existante conservée. À évaluer dans MOBILE-AUDIT-ONGLETS.

## Impact technique
- Faible : restructuration de routes/menus, ~62 insertions / 38 suppressions
- Aucune migration de données nécessaire
- Renames code : `rParamsLog → rBiens` (10 sites), `rParamsEnt → rBailleurs` (8 sites), `params-log-wrap → biens-list-wrap`, `params-ent-wrap → bailleurs-list-wrap`

## Notes utilisateur
> 💬 2026-05-01 : "on fait la création de bien par cet onglet alors et on enlève logements et entités de référentiel ?"

## Journal
- 2026-05-01 : créé · à attaquer en même temps que LOG-LISTE-CARDS (logique cohérente : nouvelle vue + nouvelle nav)
- 2026-05-01 : ✅ **Livré v14.2** · commit `aaf1e54` · session dédiée vue biens (NAV-RESTRUCTURE + LOG-LISTE-CARDS + LOG-FICHE-360 Phase 1 + LOG-ARCHIVE)
