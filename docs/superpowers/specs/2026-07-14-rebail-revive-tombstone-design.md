# B-REBAIL-TOMBSTONE — chemin « revive » du casier bail (design)

> **2026-07-14** — P0, ⏰ DEADLINE 18/07 (le bail Baysang/Ferrette-001 démarre le 18/07 :
> il doit pouvoir être créé + monter au cloud + redescendre avant cette date).
> Base : `origin/main` @ `19f0ed9` (v15.476), worktree `Immo-wt-rebail`.

## 1. Le bug (prouvé en prod)

`baux` : l'id de ligne cloud = `detUuid('bail', norm(o.__key))` (store-mapping.js:95) — **fonction
du SEUL nom du logement**. Reloger un logement produit un nouveau bail dont l'id **collisionne avec
le tombstone** de l'ancien :

- **Session fraîche** (cas prod réel) : `hydrate` exclut les soft-deleted → `_versions` ignore l'id
  → chemin INSERT → `ON CONFLICT (id) DO NOTHING` → `null` → **conflit éternel**.
- **Même session** (relouer sans reload) : `_versions` garde l'id (posé par le `softDelete` de la
  suppression) → chemin UPDATE → `WHERE … deleted_at IS NULL` → 0 ligne → `null` → **conflit éternel**.

Dans les DEUX cas, le nouveau bail ne peut JAMAIS être écrit. Preuve : bail Baysang/Ferrette-001
(12/07) jamais monté (id `97dfc78f` = tombstone Misslin 20/06), perdu au reload-cloud du 13/07,
récupéré depuis le miroir Marion le 14/07.

**Même trou côté logements** (vérifié) : le fix app-side `BUG-RECREATE-REF-TOMBSTONE` v15.262
(`2b96b5d`) réanime un bien recréé **localement** (efface `_deleted`, même id/ref) mais la sync
cloud tape ensuite le même mur. Classe identique pour `entites`/`immeubles` (ids par clé naturelle).

## 2. Décision : Option B (revive délibéré), pas Option A

- **Option A** (id par `__key+debut` comme `baux_historique`) : chaque bail = une ligne distincte par
  date de début. Rejetée : migration invasive des lignes existantes (dont des signées/verrouillées),
  et change la sémantique « 1 ligne bail = bail courant du logement » (alignée sur `DB.baux` keyé par ref).
- **Option B** (retenue) : la ligne bail = le **slot courant** du logement. Sur conflit d'écriture dont
  la ligne existante est **TOMBSTONÉE**, un UPDATE explicite **ré-ouvre le slot** (efface `deleted_at`
  + payload complet), gardé par une **intention explicite** + **REFUS ABSOLU si `locked`**. Aucune
  migration ; verrou légal intouché.

## 3. Le raffinement clé : `allowRevive = !prev` (anti-résurrection)

La version naïve du brief (« INSERT-conflit sur tombstone → revive ») a deux failles :

1. **Rate le cas même-session** — qui échoue sur le chemin UPDATE, pas INSERT. → le revive doit être
   tenté sur **les deux** retours `null`.
2. **Rouvrir sur n'importe quel UPDATE-null RESSUSCITE les morts.** Un appareil périmé qui croit
   l'ancien bail encore vivant et le **modifie**, après qu'un autre appareil l'a supprimé, tomberait
   sur UPDATE-null → un revive aveugle **ressusciterait le bail supprimé** (classe « Delle b »).
   Violation directe de « anti-résurrection fail-closed, intention explicite requise ».

**Le signal d'intention vit dans `store-sync` (qui connaît le baseline), pas dans le store :**

| Situation | baseline | `prev` | Décision |
|---|---|---|---|
| **Relocation** (ancien retiré du baseline, nouveau bail) | clé absente | `undefined` | **revive autorisé** ✅ |
| **Édition** d'un enregistrement cru vivant | clé présente | défini | **jamais de revive** (fail-closed) |
| Nouvelle clé jamais vue | clé absente | `undefined` | revive autorisé mais INSERT réussit → jamais atteint |

→ `store.upsert(coll, rec, { allowRevive: !prev })`. Le revive n'est permis **que pour un ajout frais**,
jamais pour une édition.

## 4. Mécanisme (fail-closed, verrou légal intact)

Nouveau binding writer `reviveTombstone(table, id, row)` :

```sql
UPDATE <table> SET <payload>, deleted_at = NULL
 WHERE id = ? AND espace_id = ? AND deleted_at IS NOT NULL   -- tombstones UNIQUEMENT
   [AND locked = false]   -- baux/edl seulement
 RETURNING version         -- touch_row la bumpe ; null ⇒ pas un tombstone réanimable
```

- Ne touche QUE des **tombstones** → un conflit sur ligne VIVANTE retombe en `conflict` (fail-closed,
  re-hydrate). L'anti-résurrection reste donc entière hors du chemin d'ajout-frais.
- **REFUSE `locked`** → immutabilité légale intacte. Triple garde : (a) la sync ne soft-delete jamais
  un `locked` (store-sync.js:215) → un tombstone est non-locké par construction ; (b) le `AND locked=false`
  renvoie `null` (conflit propre) au lieu de laisser le trigger throw ; (c) le trigger DB
  `prevent_locked_mutation` (0014) reste le dernier rempart.
- Ne réécrit jamais `created_by`/`legacy_id`/`id`/`version` (provenance immuable).
- **Concurrence** : deux revives simultanés → le prédicat `deleted_at IS NOT NULL` fait que le 2e
  trouve 0 ligne → `conflict` → re-hydrate. Pas de double-revive, pas de perte.

`store-supabase.upsert(coll, rec, opts)` tente le revive **après l'un ou l'autre `null`**, ssi
`opts.allowRevive && REVIVABLE.has(coll) && typeof writer.reviveTombstone === 'function'`. Renvoie
`status:'revived'`. `REVIVABLE = { baux, logements, immeubles, entites }` (collections à clé naturelle
recréable ; les collections keyées par `id` ne collisionnent jamais à la re-création → exclues).

`store-sync` : ajoute `'revived'` à `OK_UPSERT` (le baseline avance sur revive) et passe
`{ allowRevive: !prev }` à chaque `store.upsert`.

## 5. Fichiers touchés

| Fichier | Changement |
|---|---|
| `js/core/store-supabase-adapter.js` | binding `writer.reviveTombstone` (UPDATE tombstone-only + garde locked) |
| `js/core/store-supabase.js` | `upsert(coll, rec, opts)` : tente revive après INSERT-null ET UPDATE-null ; `REVIVABLE` |
| `js/core/store-sync.js` | émet `{allowRevive:!prev}` ; `OK_UPSERT` inclut `'revived'` |
| `js/core/store-multi.js` | `upsert(coll, rec, opts)` : passe `opts` au store routé |
| `js/app/supabase-boot.js` | aucun (le writer circule déjà par le spread adapter) |

## 6. Tests

- **Unit (Vitest, fakes injectés)** — `store-supabase.test.js` : matrice revive
  (INSERT-null + allowRevive + tombstone → `revived` ; INSERT-null + allowRevive + ligne vivante →
  `conflict` ; INSERT-null + `allowRevive:false` → `conflict` ; UPDATE-null + allowRevive + tombstone →
  `revived` ; UPDATE-null + `allowRevive:false` → `conflict` ; collection non-revivable → jamais de
  revive ; writer sans `reviveTombstone` → `conflict` gracieux). `store-sync.test.js` : re-let émet
  `allowRevive:true` + `'revived'` fait avancer le baseline ; édition émet `allowRevive:false`.
- **Intégration vrai Postgres** — `supabase/tests/flush-revive.test.mjs` (modelé sur `flush-poison`) :
  rejoue **Misslin→Baysang** exact. Appareil A crée bail Misslin → flush ; termine Misslin (tombstone)
  → flush ; appareil frais crée Baysang même ref → flush ⇒ ligne **revivifiée** (vivante, `v+1`,
  0 conflit) ; appareil B hydrate ⇒ voit Baysang vivant. + assert anti-résurrection : édition d'un
  supprimé reste `conflict` ; conflit sur ligne vivante reste fail-closed.

## 7. Validation finale (après intégration par le maître)

Re-créer le bail réel sur **Ferrette - 001** — Tiffany Baysang, 495 € HC + 30 € charges, DG 495 €,
du 18/07/2026 au 17/07/2032 — vérifier qu'il MONTE (ligne `baux` vivante, id revivifié `v+1`) puis
qu'il REDESCEND sur un 2e appareil. Audit `code-reviewer` OBLIGATOIRE avant « prêt à tester »
(frôle le verrou légal).
