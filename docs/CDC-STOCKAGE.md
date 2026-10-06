# CDC STOCKAGE — FIGÉ 30/09/2026 (GO Didier)

> **Décisions validées en bloc par Didier le 30/09 (recos de l'audit)** : D1 **B** · D2 **C** · D3 **A** · D4 **B** · D5 **A** · D6 **A** (puis **C** si le journal > 30 % de la base après mesure) · D7 **B**. Là où le texte ci-dessous dit « à trancher », c'est tranché ici. Lot 3 = maquette validée AVANT code. Audit détaillé : `mockups/STOCKAGE/AUDIT.md`.
>
> **Écarts actés par le pilotage (lot 1, 30/09)** : (1) pas de repli inline du registre dans index.html — prod et sandbox servies en http ; module absent = comportement d'avant le lot (prouvé par test). (2) `RELAY_APP_KEY` classée `secret_residuel` (intouchable), pas `retiree` — traitement du secret = sujet séparé. (3) La sauvegarde de base illisible (legacy/sandbox) va en IndexedDB `corrompu:<clé>` ; sa purge/rotation rejoint le lot 2.

> **Écarts actés au lot 2 (v15.719, 06/10)** : (1) clé `filet:<espace de noms>:<label>` (et non `filet:<label>`) et plafond de **3 filets par espace de noms** (prod `immotrack_v4`, sandbox `_test_immotrack_v4`), pas 3 au global : prod et sandbox partagent la même IndexedDB, un filet de test ne doit pas évincer un filet de la prod. (2) La purge RGPD (logout, login ≠ `same`) retire les filets et la copie de base illisible de **tous** les espaces de noms, sandbox comprise — même règle que la purge localStorage du lot 1 (poste partagé : la sandbox peut porter des données réelles importées). (3) La copie de base illisible `corrompu:<clé>` suit la même durée de vie (30 jours, message mis à jour) et la même purge (écart 3 du lot 1 soldé). (4) Branchement des migrations de `_bootDataJobs` **non fait** (optionnel au §5) : `_migrerLoyerBareme` ne modifie aucun enregistrement existant et `numLotVersLot` ne remplit que des champs vides ; le jour où une migration cloud y appelle `_filetAvantMigration`, empêcher une pose pendant la déconnexion (`window.__immoLoggingOut`) — sinon un `put` validé après la purge survivrait au logout (contre-audit, point 7). (5) Une lecture IndexedDB ratée ne retire jamais un filet (ni expiré, ni compté) ; la purge du logout est bornée à 5 s (reprise au login suivant ou à l'expiration).
>
> P0 bloquant commercial « Mémoire pleine » — suite de l'audit `mockups/STOCKAGE/AUDIT.md` (même dossier).
> Direction validée par Didier (BACKLOG, section « 🔴 P0 — RÉSILIENCE DU STOCKAGE ») : save principal sacré et
> auto-réparant, sauvegardes de migration en IndexedDB avec rotation, bascule de la base à peser, nettoyage
> rétroactif, garde-fou permanent testable. Exigence : « le mieux et le fonctionnel, pas un patch ».
> Contraintes : aucun CDN, **aucune colonne cloud nouvelle**, réutiliser l'existant, ton neutre, règle
> « jamais bloquer un enregistrement » (seul un échec technique empêche d'enregistrer).
> Lignes citées : commit `be09e4b7` (v15.703) — re-localiser par grep avant de coder.

---

## 1. Le problème, reformulé par l'audit

1. Le stockage local n'a **aucune règle d'occupation** : n'importe quel code peut y poser une copie intégrale de la base, sans plafond, et rien ne la retire jamais (3 familles de clés illimitées, 9 écrivains de copie complète, 0 éviction).
2. Le save principal ne sait pas **se défendre** : sur quota, il abandonne au premier essai.
3. Le save principal ne sait pas **dire ce qui s'est passé** : en cloud en ligne, l'échec du miroir n'est pas un échec d'enregistrement (le cloud porte la modification), mais le message dit « PAS enregistrée » et trois appelants annulent en mémoire une modification déjà partie vers le cloud.
4. Le miroir lui-même (la base entière) vit dans un budget d'environ 5 Mo partagé avec la sandbox et, potentiellement, d'autres pages de l'origine github.io ; la base réelle d'un utilisateur actif est probablement déjà de l'ordre de 2 Mo (AUDIT §11, à mesurer).

La réponse proposée traite ces quatre points, dans cet ordre, en lots séparables.

---

## 2. Invariants cibles (numérotés, chacun encodé par un test)

| # | Invariant | Encodé par |
|---|---|---|
| **S-1** | **Save sacré** : le miroir de la base ne peut pas échouer tant que le stockage contient une donnée évinçable. Sur `QuotaExceededError` : éviction automatique (copies, clés retirées) puis **un** nouvel essai. | test comportemental G2 |
| **S-2** | **Aucune copie de la base en `localStorage`** hors du miroir lui-même (`KEY`). Toute sauvegarde va en IndexedDB, avec plafond et rotation. | test statique G1 |
| **S-3** | **Registre unique** : toute clé écrite par l'app est déclarée dans un registre (motif, classe, taille max attendue). Une clé non déclarée fait échouer la suite de tests. | test statique G1 |
| **S-4** | **Clé inconnue = intouchable** : l'éviction et le nettoyage ne suppriment que des clés **reconnues** par le registre (l'origine github.io est partagée). | test G2/G3 |
| **S-5** | **Nettoyage rétroactif** au démarrage, idempotent, sans console : les comptes existants se réparent en ouvrant l'app. | test G3 |
| **S-6** | **Vérité du message** : le retour de `saveDB` et le message disent si la modification a une **destination durable** (cloud en ligne, miroir hors ligne, miroir en legacy). « Mémoire pleine » n'apparaît que si une modification est réellement perdue ou si le mode hors ligne est réellement dégradé. | test G4 |
| **S-7** | **RGPD** : toute copie de données personnelles posée localement (miroir, filets de migration) est purgée au logout et au changement d'utilisateur, au même titre que le miroir (P1.3). | test G5 |
| **S-8** | Le **hors ligne reste zéro perte** : les invariants 19a, 19f, 19g de docs/CDC-EDL.md restent vrais ; 19l est **amendé** (D1) sans affaiblir le cas hors ligne. | tests existants `offline-*.test.js` + G4 |

---

## 3. Architecture proposée

### 3.1 Registre des clés — `js/core/stockage-local.js` (module pur, nouveau)

Même patron que `cache-purge.js` / `offline-boot.js` : décisions pures testées, exécution dans l'app.

- `REGISTRE` : liste de `{ motif, classe, note }`, **source unique** (les constantes existantes `MIROIR_KEY`, `MIROIR_ECRIT_KEY`, `FLUSH_OK_KEY`, `ESPACES_KEY`, `MIRROR_TAG_KEY`, `AUTH_STORAGE_KEY` sont **importées**, pas recopiées).
- Classes :
  - `principal` : `immotrack_v4`, `_test_immotrack_v4` ;
  - `etat` : `*_ecrit_at`, `*_flush_at`, `*_tag`, `*_espaces`, marqueurs `*_archi_*_done`, `immo_appareil_id` ;
  - `session` : `immo-supabase-auth*` ;
  - `pref` : préférences d'écran (AUDIT §2.5) ;
  - `copie` (évinçable, jamais légitime en `localStorage`) : `immotrack_backup_*`, `_test_immotrack_backup_*`, `*immotrack_v4_corrupt_backup_*`, `_driveBackupBeforeSync` ;
  - `retiree` (évinçable) : clés Drive, `immo_use_supabase`, `RELAY_APP_KEY` (secret résiduel), `irl_view`, `irl_grp_collapsed`, `quit_view`, `dash_alerts_collapsed`, `_driveBackupBeforeSyncAt` (AUDIT §2.4) ;
  - `inconnue` : tout le reste → **jamais touché**.
- Fonctions pures :
  - `classerCle(cle)` ;
  - `tailleStockage(cle, valeur)` = `cle.length + valeur.length` (unité du quota Chromium : caractères UTF-16, pas les octets UTF-8 de `Blob`) ;
  - `planLiberation(entrees)` → clés à supprimer : `copie` par taille décroissante, puis `retiree` ; rien d'autre (D5) ;
  - `clesDuNettoyage(cles)` → toutes les `copie` + `retiree` présentes (S-5) ;
  - `verdictEchecMiroir({ mode, quoi })` → `{ retour, message }` (S-6, D1).
- Exposé par `js/main.js` (patron `window._bk`). **Repli inline** minimal dans `index.html` si le module n'est pas chargé (file://), avec test d'égalité module ↔ repli (patron existant de `nav-submenu.js`).

### 3.2 Écriture du miroir sacrée et auto-réparante

Un **seul** écrivain du miroir, `_miroirEcrire(json)` (inline, à côté de `saveDB`), appelé par les 2 branches de `saveDB` (`:6871`, `:6917`), le rebase au login (`supabase-entry.js:1393`, aujourd'hui en `catch` muet), la restauration (`:61556`, idem) et `beforeunload` (`:63274`). DRY : un seul endroit sait gérer le quota.

```
_miroirEcrire(json):
  essai 1 : setItem(KEY, json) + setItem(KEY+'_ecrit_at', now)       ← même try, comme aujourd'hui (F1)
  si QuotaExceededError :
      entrees = énumérer localStorage (clé, tailleStockage)
      aSupprimer = _stockage.planLiberation(entrees)
      removeItem(chacune)  +  trace console (combien, combien de caractères libérés)
      essai 2 : même écriture
  rend { ok, libere, cause }
```

- Pas de boucle : un seul nouvel essai. Si l'essai 2 échoue, c'est que la base elle-même ne tient plus → lot 4 (IndexedDB).
- Le cloud n'attend jamais le miroir : `__immoMarkDirty()` reste appelé inconditionnellement (déjà le cas, `:6886`).
- La sandbox bénéficie du même mécanisme (même fonction, `KEY` déjà namespacée).

### 3.3 Sémantique du retour et du message (D1, reco B)

| Mode | Miroir OK | Miroir KO après éviction | Message |
|---|---|---|---|
| Cloud **en ligne** | `true` | `true` — la modification part au cloud ; la pastille dit la vérité du flush | **Pas** « PAS enregistrée ». Un avis unique par session : « copie de secours de l'appareil non mise à jour, l'ouverture sans réseau montrera des données plus anciennes » + état visible dans Réglages (§3.7). |
| Cloud **hors ligne** | `true` | `false` | « Stockage de l'appareil plein : cette saisie n'est PAS enregistrée » (seul cas où la perte est réelle ; invariant 19l inchangé ici). |
| Legacy / sandbox | `true` | `false` | idem hors ligne. |

Effets de bord voulus :
- supprime la **course d'annulation** des appelants qui annulent sur `false` alors que le flush est planifié (journal bail `:21351`, avenant `:26267`, import `:50444`/`:50615`) : en ligne, ils ne reçoivent plus `false` pour un miroir plein ;
- EDL en ligne (`:38248`) : le marqueur « Enregistré » redevient exact (la modification est au cloud ou en file d'envoi, la pastille signale un flush en échec) ;
- le commentaire périmé `:50658` est corrigé au passage.
- Textes exacts : **maquette d'abord** (règle mockup-first), ton neutre.

### 3.4 Filets de migration → IndexedDB avec rotation (D2, reco C)

- `_backupBeforeMigration(label)` (`:38862`) est remplacé par `_filetAvantMigration(label)` qui écrit dans la base IndexedDB **existante** `immotrack_backup`, store `handles`, clé `filet:<label>`, valeur `{ label, at, db: <clone> }`, via `_idbPutRaw` (`:60993`) — **réutilisation telle quelle** : le store accepte des clés et valeurs arbitraires, **aucun changement de version de base** (zéro risque sur l'entrée `dirhandle`).
- Rotation par construction : une clé par label (le suivant écrase le précédent) ; plafond global 3 filets ; au démarrage, suppression des filets de plus de 30 jours (D2-C).
- **Les migrations `archi-v1` / `archi-v4b` n'en créent plus en boot cloud** : elles tournent dans `initDB` sur une base vide (AUDIT §3) ; le filet n'y protège rien. Garde `if (!_CLOUD_BOOT)`. En legacy/sandbox, elles utilisent le nouveau filet.
- Les migrations post-hydratation de `_bootDataJobs` (`_migrerLoyerBareme` `:63478`, `numLotVersLot` `:63486`) peuvent appeler le même helper — **point d'accroche unique** pour toute migration future qui réécrit des données cloud.
- Restauration d'un filet : réutilise `_backupRestoreApply` (`:61507`) + `__immoFlush` (chemin déjà audité). Sans UI dans ce chantier (procédure de support) ; une UI éventuelle = maquette séparée.
- RGPD (S-7) : filets supprimés au logout et au changement d'utilisateur (voir §3.6).

### 3.5 Nettoyage rétroactif au démarrage (D3, reco A)

- `_stockageNettoyer()` au `DOMContentLoaded`, **avant `initDB`** (`:63570`), synchrone : supprime `clesDuNettoyage(...)` — toutes les clés `copie` et `retiree`, **dans les deux namespaces** (elles sont mortes dans les deux).
- Idempotent, silencieux (trace console avec le total libéré), une passe par démarrage (coût : une énumération des clés).
- Retrait du code mort associé : lecture `_driveLastSync`/`_driveGlobalFileId` (`:5914-5916`, `:5931-5934` — `driveUsed` jamais lue, modale absente).
- Répare les comptes existants sans console : à la première ouverture de la version corrigée, les 3,2 Mo de copies de Didier (s'il en restait) et celles de tout utilisateur disparaissent.

### 3.6 Purges RGPD étendues (S-7)

- `cache-purge.js` gagne une fonction pure `clesCopiesLocales(cles)` (réutilise le registre) ; `_teardownSession` (`supabase-entry.js:309-347`) et la branche « tag ≠ same » (`:1303`) suppriment aussi les clés `copie` et les filets IndexedDB (`filet:*` du store `handles`, jamais `dirhandle`).
- Corrige au passage l'horodatage orphelin : `:1303` retire aussi `immotrack_v4_ecrit_at` quand il retire le miroir (même règle que `:319`).

### 3.7 Visibilité (Réglages) — maquette requise

- Remplacer la jauge trompeuse « N KB / ~10 MB » (`updateDBSizeBadge` `:55058`, mesure la base seule, base 10 Mo fausse) par un état « Stockage de cet appareil » : taille du miroir, usage `localStorage` par classe (registre), `navigator.storage.estimate()` pour IndexedDB, et l'état « copie de secours à jour / non à jour depuis … ».
- Réutilise `showDBDiag` (`:63238`) pour le détail (compteurs par collection + tailles). Aucune donnée nouvelle au cloud.

### 3.8 Miroir cloud → IndexedDB (D4, reco B) — trajectoire sans perte

**Pourquoi** : lots 1-3 éliminent les copies ; il reste la base elle-même, qui grossit avec le parc (journal d'audit jusqu'à ~3 Mo selon le code, signatures PNG, mouvements). Un grand compte dépassera ~5 Mo : le miroir deviendrait impossible → **le mode hors ligne (EDL sur site) disparaîtrait précisément pour les plus gros clients**.

**Pour / contre**

| | IndexedDB | localStorage |
|---|---|---|
| Plafond | quota d'origine (de centaines de Mo à plusieurs Go selon navigateur / disque) | ~5 Mo par origine, partagé sandbox + autres pages github.io |
| Format | clone structuré, pas de `JSON.stringify` de 2 Mo à chaque save | chaîne JSON complète à chaque save |
| API | **asynchrone** | synchrone |
| Atomicité miroir + horodatage | un seul enregistrement `{ db, ecritA }` → atomique | deux clés dans un même `try` |
| Navigation privée / refus | variable selon navigateur (à vérifier sur les cibles) → **repli obligatoire** | disponible (quota réduit) |
| Éviction navigateur | même politique d'origine que localStorage ; `navigator.storage.persist()` possible (D7) | idem |

**Impact de l'asynchronisme — traité par conception, pas par patch :**
- **Boot** : en cloud, le miroir n'est déjà **pas lu** au boot en ligne (`:5866`) ; ses lecteurs sont déjà asynchrones (`onHorsLigne`, `_remonterTravailHorsLigne`) ou appelés depuis une fonction asynchrone (garde de déconnexion : `_teardownSession`, `api.logout`). → aucun changement de séquence de boot.
- **`saveDB` reste synchrone** : il met la base en mémoire, marque le cloud, et **dépose** l'écriture IndexedDB. Écrivain à coalescence « dernier gagnant » : une transaction en vol au plus + un drapeau « à réécrire » → jamais de file qui grossit. L'horodatage `ecritA` est pris au moment du `put` et stocké dans le même enregistrement.
- **Retour de `saveDB` hors ligne** (seul cas où le miroir est la destination) : l'EDL affiche « Enregistré » **à la fin de la transaction** (rappel), pas à l'appel. L'autosave (2 s) et le marqueur existant (`_edlMarquerEnregistre`) s'y prêtent. Durabilité : transaction en mode `durability: 'strict'` là où l'option existe (valeur par défaut variable selon navigateur).
- **Indicateur « Enregistré »** (pastille cloud) : inchangé.
- **Sync** : inchangé (`store-sync.js` lit la base en mémoire).
- **Sandbox / legacy** : **restent en localStorage synchrone** (le harnais démarre par une lecture synchrone dans `initDB` ; le basculer imposerait un boot asynchrone — option C, écartée). Conséquence assumée : **la sandbox n'exerce pas le miroir IndexedDB** → vérification sur l'app servie avec un compte de test (patron Edge headless utilisé pour ANNONCES).
- **Multi-onglets** : dernier écrivain gagne, comme aujourd'hui.

**Stockage** : nouvelle base IndexedDB dédiée `immotrack_miroir` (store `miroir`, clé unique `courant`) — séparée des photos (pas de changement de version) et supprimable d'un bloc (patron `_deletePhotosDb`, `supabase-entry.js:145`). Le tag, les espaces autorisés et `flush_at` restent en `localStorage` (petits, lus de façon synchrone par F1/F13).

**Migration des données existantes (sans perte)** — au tout début de `boot()` (`supabase-entry.js:203`), **avant** tout lecteur (hors ligne, F1, garde) :
1. IndexedDB indisponible → backend `localStorage` pour la session (comportement lots 1-3), état visible dans Réglages.
2. Miroir `localStorage` présent et enregistrement IndexedDB absent (ou plus ancien selon `ecritA`) → écrire `{ db: JSON.parse(ls), ecritA: ls_ecrit_at }`, **relire et comparer** (longueur JSON + `ecritA`), puis seulement `removeItem(KEY)` + `removeItem(KEY+'_ecrit_at')`.
3. Échec à n'importe quelle étape → rien n'est supprimé, backend `localStorage` conservé.
4. Lecteurs pendant la transition : IndexedDB d'abord, `localStorage` ensuite (double lecture), pour qu'un EDL hors ligne non remonté (F1) ne soit jamais ignoré.

**Purges** : logout et changement d'utilisateur suppriment la base `immotrack_miroir` (attendue avant `location.reload()`), en plus des clés `localStorage` actuelles.

**Coûts connus** : les deux ouvertures IndexedDB existantes ouvrent une connexion à chaque appel et ne la ferment jamais ; le nouvel écrivain garde **une** connexion ouverte et gère `onversionchange` (sinon une suppression au logout reste bloquée).

### 3.9 Garde-fous permanents (tests, sans nouvelle dépendance)

| # | Test | Type | Rougit si… |
|---|---|---|---|
| **G1** | Balayage de `index.html` + `js/**/*.js` (hors `vendor`) : chaque `localStorage.setItem(` résout une clé du registre ; aucun `setItem(…, JSON.stringify(DB|db…))` hors de l'écrivain unique du miroir (et des deux chemins legacy listés : démo sandbox, popup Path 2) ; aucune clé de classe `copie` n'a d'écrivain. | statique | quelqu'un réintroduit une sauvegarde en `localStorage` ou une clé non déclarée (**l'invariant « aucune sauvegarde dans le stockage du save principal »**) |
| **G2** | « **On remplit le stockage, le save passe quand même** » : extraction de `saveDB` + `_miroirEcrire` + repli du registre depuis `index.html` (patron de `saveDB-miroir-horodate.test.js`), faux `localStorage` à quota façon Chromium (caractères clés + valeurs), pré-rempli à 99 % par des copies, clés retirées, préférences, jeton et une clé étrangère ; base de 2 M caractères. Attendus : miroir écrit, `ecrit_at` posé, copies et retirées supprimées, préférences / jeton / clé étrangère **intacts**. Variante : stockage plein de préférences seulement → échec honnête, rien de supprimé. | comportemental | l'éviction régresse, touche une clé non évinçable, ou boucle |
| **G3** | Nettoyage au démarrage : idempotent, deux namespaces, clés inconnues intactes. | pur | |
| **G4** | `verdictEchecMiroir` : table §3.3 complète (3 modes × EDL / non-EDL). | pur | le message redevient mensonger |
| **G5** | Purges RGPD : `clesCopiesLocales` + filets inclus au logout / `other-user`. | pur | une copie survit au logout |
| **G6** (lot 2) | Une migration n'écrit **aucun octet** en `localStorage` (espion) ; filet écrit via un adaptateur en mémoire, rotation et TTL respectés. | pur | |
| **G7** (lot 4) | Logique du miroir asynchrone (coalescence, transfert LS→IDB avec vérification, repli, double lecture) contre deux adaptateurs en mémoire (`lire/ecrire/supprimer`) ; l'adaptateur IndexedDB réel vérifié dans le navigateur. | pur + navigateur | |

Pas de `fake-indexeddb` : la logique est dans le module pur derrière un adaptateur injecté ; le vrai IndexedDB se vérifie dans l'app.

---

## 4. Mesure préalable (lot 0 — 5 minutes, lecture seule, avant tout code)

Sur le compte réel de Didier, **dans le navigateur de l'incident**, console, après connexion :

```js
(async () => {
  const db = window.__immoGetDB();
  const t = v => JSON.stringify(v == null ? null : v).length;
  console.table(Object.keys(db).map(k => ({ collection: k, caracteres: t(db[k]) })).sort((a, b) => b.caracteres - a.caracteres).slice(0, 12));
  let ls = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls += k.length + (localStorage.getItem(k) || '').length; }
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  console.log({ baseVivante: t(db), miroir: (localStorage.getItem('immotrack_v4') || '').length, localStorageTotal: ls, estimate: est, navigateur: navigator.userAgent });
})();
```

Décide : l'urgence du lot 4 (base vivante > ~1 M caractères → enchaîner lots 1 puis 4), et D6 (part du journal d'audit).

---

## 5. Découpage en lots livrables

Chaque lot : worktree dédié, 1 lot = 1 commit versionné, BACKLOG mis à jour en temps réel, **audit code-reviewer obligatoire** (données + persistance = sensible), smoke Didier.

| Lot | Contenu | Effort | Gate |
|---|---|---|---|
| **0** | Mesure §4 | 5 min (Didier) | chiffres reportés dans le BACKLOG |
| **1 — Save sacré + registre + nettoyage** | `js/core/stockage-local.js` (registre, classes, `planLiberation`, `clesDuNettoyage`) + repli inline ; `_miroirEcrire` unique (5 écrivains rebranchés) ; éviction + nouvel essai ; `_stockageNettoyer()` au démarrage ; purges RGPD étendues (§3.6) ; retrait du code mort Drive ; `_backupBeforeMigration` **neutralisé** (plus d'écriture `localStorage`, en attendant le lot 2) | 1,5 à 2 j | G1, G2, G3, G5 verts + suite complète ; **vérification app réelle** : servie en http (Edge headless) et sandbox — injecter 4 M caractères de `immotrack_backup_test_*` + une clé étrangère, modifier un bien → aucun toast, copie supprimée, clé étrangère intacte, pastille « Enregistré », rechargement propre ; hors ligne simulé : EDL enregistré après éviction ; audit code-reviewer |
| **2 — Filets de migration IndexedDB** | `_filetAvantMigration` sur `immotrack_backup`/`handles` (`filet:<label>`), rotation 1/label, 3 max, TTL 30 j (selon D2), garde `!_CLOUD_BOOT` pour `archi-*`, branchement optionnel des migrations `_bootDataJobs`, purge logout | 0,5 à 1 j | G6 + suite ; vérification app : filet visible dans IndexedDB (DevTools), `localStorage` inchangé pendant une migration, filet supprimé au logout ; audit code-reviewer |
| **3 — Message vrai + état du stockage** | `verdictEchecMiroir` (D1) branché dans `saveDB` ; retrait des annulations devenues fausses en ligne ; amendement de l'invariant 19l dans docs/CDC-EDL.md ; carte « Stockage de cet appareil » dans Réglages (remplace la jauge ~10 MB) | 1 j + **maquette validée avant code** | G4 + suite ; app : 3 modes (en ligne, hors ligne simulé, sandbox) avec stockage saturé artificiellement ; **3 formats × 2 thèmes** (charte mobile M-1→M-17) ; audit code-reviewer |
| **4 — Miroir cloud en IndexedDB** | base `immotrack_miroir`, écrivain à coalescence, transfert LS→IDB vérifié, double lecture, repli `localStorage`, lecteurs (hors ligne, F1, garde) rebranchés, purges, `navigator.storage.persist()` selon D7 | 3 à 4 j | G7 + tests hors ligne existants (`offline-boot`, `offline-cablage`, `offline-ui`, `supabase-offline-auth`) verts ; app servie avec compte de test : (a) transfert d'un miroir existant avec EDL hors ligne non remonté → remonté après transfert, (b) démarrage hors ligne sur miroir IndexedDB, (c) navigation privée → repli annoncé, (d) logout → base `immotrack_miroir` absente ; smoke terrain Didier téléphone (PWA, mode avion) ; audit code-reviewer **+ contre-audit** (zéro perte EDL) |

Ordre : 0 → 1 (corrige l'incident à la source pour tous les comptes) → 2 → 3 → 4. Les lots 2 et 3 sont indépendants entre eux.

---

## 6. Risques identifiés

| Risque | Parade |
|---|---|
| Éviction d'une clé utile d'une autre page de l'origine github.io | S-4 : seules les clés reconnues par le registre sont supprimables (G2 le prouve) |
| Nettoyage d'une copie dont un utilisateur aurait eu besoin | Les copies ciblées sont antérieures au cloud (données dans le cloud depuis l'ETL) ; D3 à trancher |
| Module non chargé en `file://` → éviction absente | repli inline + test d'égalité module ↔ repli |
| Lot 4 : perte d'un EDL hors ligne pendant le transfert | transfert « écrire, relire, comparer, puis seulement supprimer » ; double lecture ; G7 ; contre-audit |
| Lot 4 non couvert par la sandbox | vérification obligatoire sur l'app servie avec compte de test + smoke terrain |
| IndexedDB évincé par le navigateur (Safari 7 jours hors PWA) | déjà le cas pour les photos ; `persist()` en PWA (D7) ; le cloud reste la source |

---

## 7. Décisions à trancher par Didier

Effort en jours de développement assisté ; risque = risque de régression ou de perte.

### D1 — Que doit dire l'app quand la copie locale échoue alors que le cloud a bien reçu la modification ?
Aujourd'hui : « PAS enregistrée » (faux en ligne) et annulation en mémoire chez trois appelants.
- **A. Statu quo** — effort 0 · risque : message faux, course d'annulation, confiance perdue.
- **B. Retour = « destination durable »** : en ligne → enregistré (cloud) + avis unique « copie de secours de l'appareil non à jour » ; hors ligne / sandbox → « PAS enregistrée » (inchangé). Amende l'invariant 19l pour le seul cas en ligne — effort 0,5 j + maquette · risque faible.
- **C. Garder « échec » partout mais reformuler le texte** — effort 0,3 j · risque : l'EDL continue d'afficher « non enregistré » pour une saisie arrivée au cloud ; les annulations en ligne restent.
- **Reco : B.** C'est la seule option où le message dit la vérité dans les trois modes, et elle supprime la course d'annulation au lieu de la maquiller.

### D2 — Sauvegardes avant migration : garder un filet local, et combien de temps ?
- **A. Supprimer** (cloud + « Sauvegarde de sécurité » dossier/zip comme seuls filets) — effort 0,1 j · risque : une future migration post-hydratation qui abîme les données est propagée au cloud sans retour arrière possible.
- **B. IndexedDB, 1 par migration, purgé dès la réussite** (direction initiale) — 0,5 j · risque : un défaut logique découvert quelques jours après la migration n'a plus de filet (c'est le profil habituel de ces défauts).
- **C. IndexedDB, 1 par migration, 3 maximum, conservé 30 jours, purgé au logout** — 0,5 à 1 j · risque faible (IndexedDB a la place ; RGPD couvert par la purge).
- **Reco : C.** Le coût est le même que B ; la différence est le délai de détection d'une migration fautive, qui se compte en jours, pas en secondes. Dans les trois cas, les migrations `archi-*` cessent d'écrire en boot cloud (elles sauvegardent une base vide).

### D3 — Les copies déjà présentes chez les utilisateurs (`immotrack_backup_*`, `_driveBackupBeforeSync`, `*_corrupt_backup_*`)
- **A. Suppression automatique au démarrage** — effort inclus lot 1 · risque : perte d'une copie antérieure au cloud (données présentes dans le cloud depuis l'ETL).
- **B. Transférer la plus récente en IndexedDB puis supprimer** — +0,5 j · risque : conserve une copie intégrale hors de tout usage, à purger aussi (RGPD).
- **C. Demander à l'utilisateur (télécharger puis supprimer)** — 1 j + maquette · risque : l'utilisateur ne comprend pas la question et reste bloqué.
- **Reco : A.** Aucune ligne de code ne lit ces copies, elles datent d'avant le cloud, et elles contournent aujourd'hui la purge RGPD du logout.

### D4 — La base (miroir) en IndexedDB ?
- **A. Rester en `localStorage`** (lots 1-3 seulement) — effort 0 · risque : au-delà d'environ 4 Mo de base, plus de copie hors ligne → plus d'EDL sans réseau pour les grands comptes.
- **B. Miroir cloud en IndexedDB, sandbox/legacy en `localStorage`, repli automatique** — 3 à 4 j · risque moyen, maîtrisé (lecteurs déjà asynchrones, transfert vérifié, contre-audit).
- **C. Tout en IndexedDB, y compris sandbox/legacy (boot asynchrone)** — 6 à 8 j · risque élevé (démarrage du harnais, 201 appels à `saveDB`), gain nul pour les clients.
- **Reco : B**, planifiée juste après le lot 1 ; enchaînée immédiatement si la mesure du lot 0 donne une base vivante > ~1 M caractères.

### D5 — Jusqu'où l'éviction automatique peut-elle aller ?
- **A. Copies complètes connues + clés retirées seulement** — risque nul pour les préférences et la sandbox.
- **B. + base sandbox `_test_immotrack_v4` en dernier recours** — risque : effacer silencieusement des données de test en cours.
- **C. + préférences d'écran** — gain négligeable (quelques Ko), agacement réel.
- **Reco : A.** Après éviction des copies, un échec restant signifie que la base elle-même ne tient plus : c'est le lot 4 qui le règle, pas une éviction plus large.

### D6 — Le journal d'audit local (plafond 10 000 entrées ≈ 3 Mo selon le code)
- **A. Ne rien changer dans ce chantier ; mesurer (lot 0)** — effort 0.
- **B. Plafonner le cache local** (non synchronisées + N dernières ; l'historique complet se lit dans la table `audit_log`) — ~1 j + écran journal · risque : touche un écran et le blob cloud privé.
- **C. Exclure `auditTrail` du seul miroir** — 0,2 j · risque nul supplémentaire (F1 ne remonte déjà que les EDL : les entrées d'audit posées hors ligne sont perdues aujourd'hui de toute façon).
- **Reco : A**, puis **C** si la mesure montre que le journal dépasse 30 % de la base (sujet séparé pour B).

### D7 — Demander un stockage persistant au navigateur (`navigator.storage.persist()`)
- **A. Non** — risque : éviction possible du miroir et des photos sous pression disque.
- **B. Oui, seulement en app installée (PWA)**, une fois — ~0,1 j (dans le lot 4) · risque nul (accordé silencieusement par Chromium aux apps installées).
- **C. Oui, partout** — Firefox affiche une demande d'autorisation à chaque utilisateur web.
- **Reco : B.** L'usage terrain (EDL hors ligne) est celui de la PWA, déjà promue pour cette raison (CDC-EDL lot 2).
