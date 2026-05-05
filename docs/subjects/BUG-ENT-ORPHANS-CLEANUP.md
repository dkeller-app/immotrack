# BUG-ENT-ORPHANS-CLEANUP — Détection + nettoyage des rattachements orphelins

**Status** : ⬜ À faire
**Prio** : P2 · **Taille** : S (~1-2 h)
**Détecté** : 2026-05-05 (session DASH-PROFILES — révélé en parallèle de `BUG-ENT-RENAME-CASCADE`)
**Lié à** : `BUG-ENT-RENAME-CASCADE` (P0) · `ARCHI-DB-DOUBLONS` (refonte plus large)

## Contexte
ImmoTrack utilise `entity = string` comme clé de jointure entre logements/baux/quittances et `DB.entites[]`. Plusieurs scénarios créent des **logements orphelins** dont `entity` ne match aucune entité active :

1. **Renommage entité non-cascade** (cf `BUG-ENT-RENAME-CASCADE`) — fix prévu mais des données héritées peuvent rester
2. **Suppression d'entité (`_deleted=true`)** sans nettoyage cascade des logements rattachés
3. **Création d'un logement avec `entity` mal saisi** (faute de frappe, copier-coller raté)

Exemple détecté chez l'utilisateur principal (2026-05-05) :
- 1 logement avec `entity = "Test SCI"` → entité `id=1777755206721 _deleted=true` (orphelin)
- 1 logement avec `entity = "Perso — Didier Keller"` → entité renommée en "Didier Keller" sans cascade (orphelin résolu manuellement par script console)

## Symptômes
- Logement n'apparaît dans aucun filtre par bailleur (dashboard, listes)
- Mais les mouvements rattachés au logement continuent de fonctionner (filtrage par `logement.ref` direct)
- Aucune alerte UI : l'utilisateur peut perdre des biens sans s'en apercevoir

## Fix proposé

### Phase 1 : détection au démarrage (boot toast)

Au démarrage de l'app, après chargement DB, lancer un audit :

```js
function _auditOrphans() {
  const activeEntNames = new Set(
    (DB.entites || []).filter(_isAlive).map(e => e.nom)
  );
  const collections = [
    { name: 'logements',       items: (DB.logements || []).filter(_isAlive) },
    { name: 'baux',            items: Object.values(DB.baux || {}).filter(_isAlive) },
    { name: 'baux_historique', items: (DB.baux_historique || []).filter(_isAlive) },
    { name: 'quittances',      items: (DB.quittances || []).filter(_isAlive) },
  ];
  const orphansByEntity = new Map();   // entity inconnu → array d'items
  let total = 0;
  for (const { name, items } of collections) {
    for (const item of items) {
      if (item.entity && !activeEntNames.has(item.entity)) {
        const key = item.entity;
        if (!orphansByEntity.has(key)) orphansByEntity.set(key, []);
        orphansByEntity.get(key).push({ collection: name, ref: item.ref });
        total++;
      }
    }
  }
  return { total, orphansByEntity };
}
```

Si `total > 0`, afficher toast non-bloquant :
> "⚠️ N rattachements orphelins détectés (X entités inconnues) — voir Paramètres → Réparation"

### Phase 2 : modale de réparation manuelle (Paramètres)

Onglet Paramètres → bouton "Détecter rattachements orphelins" → ouvre modale :

```
┌─ Rattachements orphelins ──────────────────────────────────────┐
│                                                                  │
│ ⚠️ 2 entités orphelines détectées (3 records concernés)         │
│                                                                  │
│ Entité orpheline : "Test SCI"                                    │
│   → 1 logement (D-007)                                           │
│   Rattacher à : [SCI DD2AMELEVIERES ▾] [Rattacher] [Supprimer]   │
│                                                                  │
│ Entité orpheline : "Perso — Didier Keller"                       │
│   → 1 logement (Delle), 1 bail, 1 quittance                      │
│   Rattacher à : [Didier Keller ▾] [Rattacher] [Supprimer]        │
│                                                                  │
│                          [Fermer]                                │
└─────────────────────────────────────────────────────────────────┘
```

Bouton **Rattacher** : cascade `entity = "ancien"` → `entity = "nouveau"` (réutilise la fonction de cascade de `BUG-ENT-RENAME-CASCADE`).
Bouton **Supprimer** : marque les items orphelins en `_deleted=true` (avec confirm2 + _undoOp).

### Phase 3 (optionnelle) : auto-fix au boot

Si UNE seule entité active a un nom **fuzzy-match** avec l'orphelin (ex : seul changement = trait d'union), proposer fix automatique 1-clic dans le toast de boot. Risqué, à valider.

## Effort estimé
- Phase 1 audit boot + toast : 30 min
- Phase 2 modale Paramètres : 1 h
- Phase 3 fuzzy-match auto (optionnel) : 30 min
- Tests + commit : 30 min
- **Total : ~2-3 h**

## Pré-requis
- `BUG-ENT-RENAME-CASCADE` livré (sinon création de nouveaux orphelins en parallèle)
- Possiblement `ARCHI-DB-DOUBLONS` (clé string → ID stable, refonte plus large)

## Tests à écrire
1. DB avec orphelins → boot → toast s'affiche, count correct
2. Modale Paramètres → 2 entités orphelines listées, options Rattacher / Supprimer fonctionnelles
3. Rattachement → cascade `entity` correct, no orphan persist après refresh

## Journal
- 2026-05-05 : sujet créé après détection de plusieurs entités orphelines dans la DB de l'utilisateur principal (2 entités tests + 1 cas réel résolu en console)
