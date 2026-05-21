# NAV-FILTRE-ENTITE-GLOBAL — Barre de contexte globale persistante (entité + période) sur tous les onglets

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (~5-7h)
**Détecté** : 2026-05-17 (user : « pourquoi ne pas utiliser [les bulles entités] sur tous les onglets plutôt que la liste déroulante ? » + « idem pour mois et année, toujours au même endroit en haut » + « quand on a validé une entité, ne plus afficher tous les logements, juste ceux de l'entité »)
**Lié à** : USER-PROFILE-FILTERS ✅ v15.04 (workspace présets) · dashboard V4 (`_v4FilterEnt`) · UX-GROUP-BY-IMMEUBLE · NAV-LOGEMENT-BAIL-CLARIF · dashboard-temporel (sélecteur mois/année)

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs multi-entités (SCI multiples) — continuité visuelle + moins de clics
2. **Règles** : design consistency (un seul mécanisme de filtre entité partout, pas dropdown ici + bulles là) + simplicité
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « pourquoi ne pas utiliser [les bulles] sur tous les onglets plutôt que la liste déroulante (logique de continuité) »
   - 🧑 Cas user 2026-05-17 : « en cliquant sur ces bulles on revient à dashboard » (comportement à découpler)
   - 💻 Code existant : `_v4FilterEnt(name)` (l. 5732) force `go('dashboard')` + filtre `dash-ent`. Les autres onglets ont chacun leur dropdown (`pil-f-entity`, `baux-f`, etc.)
   - 📋 Backlog : croise la refonte nav globale (NAV-LOGEMENT-BAIL-CLARIF)
4. **5 vues 360°** : UX (continuité workspace) + technique (1 source de filtre) + commercial (sensation app pro multi-SCI)

## Constat (comportement actuel)

Les bulles entités (Toutes / SD / SS / DK…) en haut à gauche = composant `.v4s-sb-ent`, câblées **uniquement au dashboard** :
```js
function _v4FilterEnt(name) {
  go('dashboard');               // ← force le retour dashboard à chaque clic
  el('dash-ent').value = name;   // filtre le dropdown du dashboard
  rDash();
}
```

Sur les **autres onglets**, le filtre entité se fait via des **dropdowns locaux** dédiés :
- `#dash-ent` (dashboard), `#pil-f-entity` (pilotage), `#baux-f` (baux), filtres immeuble par onglet, etc.

→ **Incohérence** : 2 mécanismes (bulles dashboard vs dropdowns ailleurs) + clic bulle = saut forcé au dashboard.

## Proposition : filtre entité GLOBAL persistant

### Principe
1. Les bulles entités deviennent un **filtre global** affiché en haut **sur tous les onglets** (composant déplacé hors du dashboard, rendu en topbar persistante).
2. Clic sur une bulle = **set le filtre entité global** + **re-render l'onglet COURANT** (PAS de `go('dashboard')`).
3. Les dropdowns « Toutes entités » locaux sont **remplacés** par ce filtre global (ou se synchronisent dessus).
4. Le filtre est **persisté** (localStorage) → retrouvé au reload, cohérent multi-session.

### Bénéfices
- **Continuité** : je filtre "SCI DD" une fois → tous les onglets (IRL, Baux, Mouvements, Quittances…) montrent uniquement SCI DD
- **Moins de friction** : plus besoin de re-sélectionner l'entité dans chaque dropdown
- **Cohérence design** : un seul mécanisme de filtre entité partout
- **Sensation pro** : façon "workspace" (comme un sélecteur d'organisation dans les SaaS)

## Architecture technique

```
État global : _activeEntityFilter (runtime + localStorage 'immotrack_active_entity')
    ↓
Composant bulles .v4s-sb-ent rendu en TOPBAR persistante (pas dans #p-dashboard)
    ↓
Clic bulle → _setGlobalEntityFilter(name) :
  - _activeEntityFilter = name
  - persiste localStorage
  - met à jour l'état actif visuel des bulles
  - re-render l'ONGLET COURANT (currentPage) sans changer de page
    ↓
Chaque render d'onglet (rDash, rIRL, rBaux, rMv, rAss, rQuit, rEDL, rEquip…)
  lit _activeEntityFilter au lieu de son dropdown local
    ↓
Les dropdowns locaux : soit supprimés, soit synchronisés sur _activeEntityFilter
```

### Combinaison avec UX-GROUP-BY-IMMEUBLE
- Filtre global = niveau **entité** (SCI)
- Group-by-immeuble = niveau **immeuble** (intercalaires dans la liste)
- Les deux se combinent : « SCI DD » filtré + logements groupés par immeuble dedans → hiérarchie claire Entité > Immeuble > Lot

## Extension : barre de contexte = ENTITÉ + PÉRIODE (mois/année)

> 💬 User 2026-05-17 : « idem pour mois et année, il faudrait laisser toujours au même endroit en haut. sinon utilisateur se perd »

Le sélecteur **mois/année** doit suivre la même logique que le filtre entité : **persistant, toujours au même endroit en haut**, sur tous les onglets concernés (dashboard, mouvements, quittances, régul…).

→ La topbar de contexte porte **2 filtres globaux** :
```
┌──────────────────────────────────────────────────────────┐
│  [★ Toutes] [SD] [SS] [DK]  +     │   ◀ Mai 2026 ▶  / An  │
│  ── filtre ENTITÉ ──               ── filtre PÉRIODE ──    │
└──────────────────────────────────────────────────────────┘
```
- **Position fixe** = repère stable, l'utilisateur ne se perd plus
- Période persistée (localStorage) comme l'entité
- Les onglets temporels (dashboard, mouvements, quittances) lisent la période globale ; les onglets non-temporels (Biens, EDL) l'ignorent

## Cascade de filtrage RÉELLE (entité/immeuble → logements)

> 💬 User 2026-05-17 : « quand on a validé une entité ou immeuble, il ne faut plus afficher tous les logements. Juste les logements de l'entité »

**Exigence** : le filtre global ne doit pas être cosmétique — il **cascade réellement** sur les listes :
- Filtre **entité = SCI DD** → tous les onglets n'affichent QUE les logements/baux/mouvements de SCI DD (pas tous, puis re-filtrés visuellement : vraiment filtrés à la source)
- Filtre **immeuble** (niveau plus fin) → idem, uniquement les logements de cet immeuble
- Le compteur, les KPIs, les totaux se recalculent sur le périmètre filtré

→ Chaque `render` d'onglet applique le filtre **avant** de construire la liste (pas un masquage CSS après coup).

## Scope (proposé)

### Phase 1 — État global + helper (~45min)
- Variable `_activeEntityFilter` + persistance localStorage
- `_setGlobalEntityFilter(name)` : set + persist + re-render onglet courant
- Module pur testable `js/core/entity-filter.js` (filtre une liste par entité)

### Phase 2 — Topbar persistante (entité + période) (~90min)
- Déplacer/rendre le composant bulles `.v4s-sb-ent` en topbar visible sur tous les onglets
- Ajouter le sélecteur **mois/année** persistant à droite (position fixe)
- `_activePeriod` (mois+année) en runtime + localStorage
- Responsive (scroll horizontal des bulles sur mobile, ou menu condensé)
- État actif synchronisé

### Phase 3 — Brancher chaque onglet + cascade réelle (~2-3h)
- `rDash`, `rIRL`, `rBaux`, `rMv`, `rAss`, `rQuit`, `rEDL`, `rEquip`, `rPilotage`… lisent `_activeEntityFilter` (+ `_activePeriod` pour les temporels)
- **Cascade RÉELLE** : le filtre s'applique à la source de chaque liste (pas masquage CSS) → entité/immeuble sélectionné = seuls ses logements affichés + KPIs/totaux recalculés
- Supprimer/synchroniser les dropdowns locaux
- `_v4FilterEnt` ne fait plus `go('dashboard')` → re-render courant

### Phase 4 — Tests Vitest (~30min)
- `_filterByEntity(items, entityName)` filtre correct + "" = toutes
- Persistance + re-lecture
- Combinaison avec group-by-immeuble

## Décisions à arbitrer

- [ ] **D1** : les dropdowns locaux sont **supprimés** ou **conservés synchronisés** (redondance) ?
  - → Reco : supprimés (un seul mécanisme = clarté)
- [ ] **D2** : filtre global persistant entre sessions (localStorage) ou reset à chaque ouverture ?
  - → Reco : persistant (workspace)
- [ ] **D3** : sur mobile, bulles en scroll horizontal ou menu déroulant condensé ?
- [ ] **D4** : interaction avec USER-PROFILE-FILTERS (présets de profil) — le filtre entité s'ajoute-t-il par-dessus le préset ?

## Différenciant marché

| Solution | Filtre entité |
|---|---|
| Rentila / BailFacile | dropdown par page |
| Qalimo V2 | sélecteur global partiel |
| **ImmoTrack actuel** | bulles (dashboard only) + dropdowns (ailleurs) = incohérent |
| **ImmoTrack après ce sujet** | ✅ filtre entité global persistant type "workspace SaaS" |

## Notes utilisateur

> 💬 2026-05-17 : « visuellement on a les entités en haut à gauche qui fonctionne avec dashboard. pourquoi ne pas utiliser ça sur tous les onglets plutôt que la liste déroulante (dans une logique de continuité) »
> 💬 2026-05-17 : « De plus, en cliquant sur ces bulles on revient à dashboard » (à découpler)
> 💬 2026-05-17 : « idem pour mois et année, il faudrait laisser toujours au même endroit en haut. sinon utilisateur se perd »
> 💬 2026-05-17 : « quand on a validé une entité ou immeuble, il ne faut plus afficher tous les logements. Juste les logements de l'entité »

## Journal

- 2026-05-17 : créé · bulles entités → filtre global persistant sur tous les onglets · découpler du `go('dashboard')` forcé · remplace les dropdowns locaux · combine avec UX-GROUP-BY-IMMEUBLE (entité > immeuble) · sensation workspace SaaS · P1/M
- 2026-05-17 : **étendu** — la topbar de contexte porte 2 filtres globaux : ENTITÉ + PÉRIODE (mois/année), tous deux persistants et à position fixe (« l'utilisateur ne se perd plus »). + exigence **cascade réelle** : filtre entité/immeuble → seuls les logements concernés affichés (filtré à la source, pas masquage CSS) + KPIs/totaux recalculés. Effort revu ~5-7h.
