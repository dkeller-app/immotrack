# Store multi-espace — design (spec)

> **Statut : DESIGN à valider.** Implémentation = session dédiée (refonte fondamentale du Store, le morceau
> le plus risqué du partage). Lié à `project_partage_sci`, `project_cloud_cutover_finition` (Chantier 2).
> Date : 2026-06-21.

## Objectif
Quand un associé a **son propre abonnement** (son espace) **ET** une ou plusieurs SCI octroyées **chez un
autre propriétaire**, il doit voir **tout dans une seule liste de biens** (vue unifiée — décision « **on ne
fait pas de multi-canaux** », pas de sélecteur d'espace). Le Store doit donc charger + fusionner **plusieurs
espaces** dans un seul `DB` mémoire, et **router chaque écriture vers le bon espace** (celui du propriétaire
de la SCI), avec le **namespace `detUuid` de ce propriétaire**.

## Non-objectif / portée
- **Pas bloquant aujourd'hui** : un associé **sans** abonnement propre (ex. la compagne) est simplement
  membre scopé de l'espace du propriétaire → `resolveEspace` charge cet espace, la RLS le scope à sa SCI →
  il voit déjà la SCI partagée. Le mono-espace actuel SUFFIT pour ce cas.
- Le multi-espace ne concerne QUE l'utilisateur qui est **owner/plein de l'espace A** **ET** **membre scopé
  de l'espace B** (SCI octroyée par un autre owner). C'est le scénario commercial (associés abonnés).
- Hors scope : facturation croisée, sélecteur d'espace (exclu par design).

## État actuel (mono-espace) — ce qu'on refond
- `supabase-boot.js` `resolveEspace()` : renvoie **UN** espace (`order created_at`, `limit 1`) → `{espaceId,
  ownerId, espaceNom}`. Commentaire existant : *« 1 espace aujourd'hui ; durcir avant le vrai multi-espace »*.
- `wireStore({espaceId, ownerId,…})` : **UN** adapter (`createSupabaseAdapter(client, espaceId)`) + **UN**
  `detUuid = makeDetUuid(ownerId)` + **UN** `store` + **UN** `sync`. Tout est scopé à un espace.
- `hydrate()` : lit les tables (RLS scope les lignes visibles) → reconstruit `DB`. `DB` legacy est keyé par
  **réf/nom** (ex. `DB.baux[logementRef]`, `DB.entites[].nom`), pas par uuid.

## Design proposé

### 1. `resolveEspaces()` (pluriel)
Lister TOUS les espaces de l'utilisateur via `espace_members` :
- `full_espace = true` → **espace propre** (rôle plein, écrit tout).
- `full_espace = false` → **espace tiers** où il a des octrois `entite_membre` (accès scopé à des SCI).
Renvoie `[{ espaceId, ownerId, mine: bool }]` (ownerId = `espaces.created_by` de chaque espace). Ordre
déterministe (espace propre d'abord). 0 espace → en créer un (comme aujourd'hui).

### 2. Un Store PAR espace
`wireStore` devient `wireStores(espaces[])` : pour chaque espace, instancier `{ adapter(client, espaceId),
detUuid: makeDetUuid(ownerId), store, versions }`. Le `detUuid` est **par-propriétaire** (les ids
déterministes d'un espace sont cohérents avec son import) → indispensable de NE PAS mélanger.

### 3. Hydrate fusionné + tag de provenance
Hydrater chaque espace, puis **fusionner** les collections dans un seul `DB`. **Chaque enregistrement porte
un tag de provenance** `_espaceId` (et implicitement son ownerId) → indispensable pour router l'écriture.
- Collections tableau (logements, mouvements, edl, candidats, agenda…) : concaténer, chaque item taggé.
- `DB.entites` : concaténer (chaque entité taggée de son espace).
- `DB.baux` (objet keyé par réf logement), `DB.entites[].nom`, `DB.logements[].ref` : **risque de COLLISION
  de clés** entre espaces (deux SCI de propriétaires différents peuvent avoir le même nom/réf).

### 4. ⚠️ DÉCISION D1 — collisions de clés réf/nom inter-espaces
Le `DB` legacy keye par réf/nom. Deux espaces peuvent partager une réf (« D-105 ») ou un nom de SCI.
Options :
- **(a) Namespacer les clés** par espace dans le `DB` unifié (ex. `baux["<espaceId>:<ref>"]`) — robuste mais
  touche TOUT le code app qui lit `DB.baux[ref]` (gros).
- **(b) Préfixer seulement à la collision** (rare) — moins invasif, mais logique de détection partout.
- **(c) Accepter la rareté + tag `_espaceId`** : garder les clés réf/nom, mais quand deux items collident,
  les désambiguïser à l'affichage par le tag (l'écriture route par `_espaceId`). Recommandé en 1re passe
  (les SCI de propriétaires différents ont rarement le même nom), durcir si un cas réel apparaît.
→ **À trancher avec l'utilisateur.** Reco : **(c)** d'abord (pragmatique), prévoir (a) si besoin.

### 5. Routage des écritures (le cœur du risque)
`store-sync` doit, pour chaque enregistrement muté, **router** vers le store de SON espace (`_espaceId`) avec
le bon `detUuid`. Aujourd'hui le sync a UN store ; il faut :
- énumérer les changements par espace (grouper par `_espaceId`),
- upsert/remove via le store correspondant (qui a le bon adapter + detUuid + version map),
- la **config** (`espace_config`/`_private`) : n'écrire QUE dans l'espace propre (un scopé n'écrit pas la
  config d'un autre — RLS le refuse déjà ; cf volet 3).

### 6. ⚠️ DÉCISION D2 — création d'un NOUVEL enregistrement
Un nouveau bien/mouvement créé par l'utilisateur va dans QUEL espace ? Options :
- **(a) Toujours l'espace propre** (le sien) — simple, mais on ne peut pas créer dans une SCI partagée.
- **(b) Selon le contexte** : si on crée DANS une SCI partagée (entité dont `_espaceId` ≠ propre), router vers
  cet espace (si l'utilisateur y a l'écriture). Plus juste, plus complexe.
→ **À trancher.** Reco : **(b)** — un gestionnaire de la SCI partagée doit pouvoir y créer ; la résolution se
fait par l'entité choisie à la création (son `_espaceId`).

### 7. Vue unifiée (UI) — peu de changement
L'app rend déjà `DB.entites`/`DB.logements`/etc. Une fois le `DB` fusionné, la liste des biens montre tout
(propres + partagés) **sans sélecteur** (décision). Détail : badge discret de provenance possible (« partagé
par X »), non bloquant. Le gros du travail est **backend** (load/merge/route), pas l'affichage.

## Risques
- Le **routage d'écriture** par espace = le point critique (une écriture mal routée = perte ou RLS refus).
- **Collisions de clés** (D1) + **conflits de version** par espace (chaque espace a ses versions optimistes).
- Le `detUuid` par-propriétaire NE DOIT JAMAIS être mélangé entre espaces (ids incohérents sinon).
- Régression mono-espace : un utilisateur à 1 seul espace doit marcher exactement comme avant (chemin
  dégénéré du multi à N=1).

## Phasage proposé (session dédiée)
1. `resolveEspaces` + `wireStores` (N adapters/stores/detUuid) — chemin N=1 identique à l'actuel (non-régression).
2. Hydrate fusionné + tag `_espaceId` (D1 = option c d'abord).
3. Routage des écritures par espace dans `store-sync` (D2 = option b).
4. UI : badge provenance (optionnel) ; vérifier la liste unifiée.
5. Tests : `test:rls` (déjà OK par-SCI) + nouveaux tests Store multi-espace (load/merge/route, non-régression N=1).
6. **Audit `code-reviewer`** (refonte transverse = livrable sensible, règle non négociable) AVANT prod.
7. Déploiement prudent (le Store touche la lecture/écriture de TOUTES les données).

## Décisions à valider AVANT d'implémenter
- **D1** : collisions de clés réf/nom inter-espaces → (a) namespacer / (b) à la collision / **(c) tag + désambig.** (reco c).
- **D2** : nouvel enregistrement → (a) toujours espace propre / **(b) selon l'entité choisie** (reco b).
- **D3** : badge de provenance dans la liste (oui/non, wording).
