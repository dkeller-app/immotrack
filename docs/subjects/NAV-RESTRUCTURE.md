# NAV-RESTRUCTURE — Restructuration navigation principale (sortir Biens/Bailleurs du Référentiel)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : S (1-3h, à coupler avec LOG-LISTE-CARDS)
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

### Migration
- [ ] Déplacer route/onglet `#log` (logements) hors `Référentiel` → onglet top-nav `Biens`
- [ ] Déplacer route/onglet `#ent` (entités) hors `Référentiel` → onglet top-nav `Bailleurs` OU laisser dans Paramètres (décision)
- [ ] Renommer onglet `Référentiel` en `Paramètres` ou `Configuration` ?
- [ ] Mettre à jour la nav top + sidebar mobile
- [ ] Mettre à jour les liens internes (deeplinks `#log-...`, `#ent-...`)
- [ ] Bouton primaire `+ Ajouter un bien` dans nouvel onglet Biens (cf `LOG-LISTE-CARDS`)
- [ ] Bouton primaire `+ Ajouter un bailleur` dans nouvel onglet Bailleurs

### Décisions à prendre
- [ ] **Bailleurs/Entités** : top-nav dédié OU rester dans Paramètres ?
  - Option A (top-nav dédié) : prépare le SaaS multi-users où chaque user a ses bailleurs ; cohérent avec Qalimo
  - Option B (Paramètres) : moins de pollution top-nav (les entités sont peu éditées) ; plus simple
  - → **Recommandation** : Option A (top-nav) si la nav supporte 12+ onglets sans saturation, sinon Option B
- [ ] **Renommer "Référentiel"** en "Paramètres" / "Configuration" / "Réglages" ?
  - "Paramètres" est le terme standard
- [ ] **Ordre des onglets** : Biens en premier après Dashboard, ou plus loin ? → Biens en premier (c'est l'objet métier central)
- [ ] **Mobile** : bottom-nav avec les 5 onglets principaux (Biens, Baux, Mouvements, Dashboard, Plus...) ?

## Impact technique
- Faible (juste une restructuration de routes/menus)
- Aucune migration de données nécessaire
- Risque : casser des deeplinks existants → faire des redirects `#ref-log-...` → `#log-...`

## Notes utilisateur
> 💬 2026-05-01 : "on fait la création de bien par cet onglet alors et on enlève logements et entités de référentiel ?"

## Journal
- 2026-05-01 : créé · à attaquer en même temps que LOG-LISTE-CARDS (logique cohérente : nouvelle vue + nouvelle nav)
