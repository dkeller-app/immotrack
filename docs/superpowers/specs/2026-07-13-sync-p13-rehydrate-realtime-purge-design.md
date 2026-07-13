# P1.3 — Conflit→re-hydrate · Récepteur Realtime · Purge cache (design)

> Chantier AUDIT-SYNC-CLOUD-2026-07-12, dernier bloc P1 (items 2, 3, 6 du plan de progrès).
> Base `origin/main 079b59d` (v15.461). Branche `feat/sync-p1-rehydrate`, worktree `Immo-wt-sync-p13`.
> Inclut les réserves d'audit **M2** et **M4** consignées à l'intégration de P1.1+P1.2 (v15.460).

## 1. Conflit → re-hydrate (honore enfin le contrat écrit en commentaires)

**Constat** (audit C-A) : un `status:'conflict'` (version périmée / insert sur id existant / remove non
tracké) est retenté À L'IDENTIQUE à chaque flush = impasse éternelle ; la modif locale est perdue à la
fermeture d'onglet. Le contrat « conflict → l'app re-hydrate » est écrit dans `store-supabase.js:7,161`
et n'a jamais été implémenté.

**Décision** : re-hydratation **complète** (pas par-table). Le store multi-espace hydrate tout en ~1
requête paginée par table ; une granularité par-table ajouterait une surface d'états intermédiaires
(FK inter-tables, resolvers) pour un gain marginal à notre volume (<1000 lignes). Sémantique P1 :
**le serveur gagne**, l'app se resynchronise, l'utilisateur est prévenu (bannière
« Données actualisées — revérifie ta modif »). La résolution fine par ligne (copie locale proposée)
reste P2.6.

**Mécanique** (`supabase-entry.js`, fonction partagée `_repullCloud`) :
1. `runFlush` voit `summary.conflicts.length > 0` → `_repullCloud({ flushFirst:false, banner:true })`.
   (`flushFirst:false` : on sort d'un flush, re-flusher re-produirait le même conflit pour rien.)
2. `_repullCloud` : garde anti-réentrance (`_repullBusy`) → `api.hydrate()` → `__immoSetDB(db)`
   (ferme les modales ouvertes, cf. §3) → `liveDB/_liveDBRef = db` → `api.seed(db)` (baseline neuve,
   `_removeConflicts` purgé) → re-render **page courante** (`__immoRerenderCurrent`, cf. §4) →
   `_lastHydrateAt = Date.now()`.
3. Convergence : le DB mémoire est REMPLACÉ par l'état serveur → plus de diff → plus de conflit.
   La modif locale conflictuelle disparaît de l'app (annoncé par la bannière) — c'est la sémantique
   fail-safe choisie (vs LWW silencieux, interdit).

**M2** (réserve audit v15.460) : un remove en conflit permanent rendait `_hasPendingRemoves` vrai à
chaque save → debounce neutralisé (chaque frappe = flush immédiat). Fix moteur (`store-sync.js`) :
le `_doFlush` mémorise les clés de remove parties en `conflict` (`_removeConflicts`, Set coll+key) ;
`_hasPendingRemoves` les ignore (elles restent retentées par le flush normal, mais ne déclenchent
plus le bypass du debounce). Sortie du Set : remove réussi, ou `seed()` (re-hydratation = baseline
neuve). Testé offline (TDD).

**M4** (réserve audit v15.460) : le broadcast Realtime n'était émis que si le flush était 100 % propre
(`!bad`) → un poison isolé (P1.2) bloquait le signal alors que des upserts/removes VENAIENT d'aboutir.
Fix : émettre si le flush a réellement écrit quelque chose — helper pur exporté
`summaryHasCloudWrites(s)` = `upserts.length || removes.length || config==='written'` (TDD).

## 2. Récepteur Realtime + re-pull au retour de visibilité

**Constat** (audit C-A) : l'émission `changed` existe (post-flush) mais AUCUN récepteur depuis le
cutover → vue figée multi-appareils (téléphone à J-3 de retard).

- **Récepteur** : `_liveChannel.on('broadcast', { event:'changed' }, () => _repullSoon('realtime'))`
  (le canal privé + presence existent déjà ; `self:false` → jamais son propre écho).
- **Re-pull visibilité** : sur `visibilitychange:visible`, si `Date.now() - _lastHydrateAt >
  REPULL_STALE_MS` (**5 min**) → `_repullSoon('visible')`. Tue le téléphone figé.
- **`_repullSoon`** : coalesce (timer 1200 ms — plusieurs `changed` rapprochés = 1 re-pull) et
  **diffère tant qu'une modale `.ov` est ouverte** (recheck 5 s) : on ne détruit pas une saisie en
  cours pour un rafraîchissement de confort. Le chemin CONFLIT, lui, est immédiat (correction de
  divergence > confort) et ferme les modales.
- **Avant un re-pull de confort** (`flushFirst:true`) : si un debounce est en attente, on flush
  d'abord (sinon la ré-hydratation écraserait la modif locale pas encore poussée).
- Après re-pull realtime/visible : toast discret « Données actualisées depuis un autre appareil ».

## 3. Purge cache sécurité (volet RGPD — audit C-C)

**Constat** : miroir `immotrack_v4` écrit à chaque saveDB cloud, JAMAIS purgé (un révoqué garde une
copie lisible à vie) ; rendu + popup IRL calculés dessus AVANT login ; IndexedDB `immotrack_photos`
idem.

### 3a. Tag du miroir
Nouvelle clé `immotrack_v4_tag` = JSON `{ userId, espaceId }` écrite au login (espace PROPRE).
Module pur `js/core/cache-purge.js` (TDD) : `classifyMirrorTag(raw, userId, espaceId)` →
`'same' | 'other-user' | 'other-espace' | 'untagged'`.

### 3b. Matrice de purge
| Événement | Miroir `immotrack_v4` (+tag) | IndexedDB `immotrack_photos` |
|---|---|---|
| **Login, tag `other-user`** | purge | **purge inconditionnelle** (données d'autrui = RGPD prime) |
| **Login, tag `other-espace` / `untagged`** | purge (le cloud est la source, réécrit juste après) | conservée (binaires potentiellement idb-only du même user — preuves légales, cf. règle « pas d'auto-suppression ») |
| **Login, tag `same`** | réécrit depuis le DB hydraté | conservée |
| **Logout (`__immoLogout`)** | purge (toujours) | purgée **seulement si 0 binaire idb-only** (`listIdbOnlyBinaries(DB)` vide) ; sinon conservée + `console.warn` (perte de preuves interdite tant que P2.4 docs→Storage n'est pas fait) |

`listIdbOnlyBinaries(db)` (pur, TDD) : documents vivants `idbKey && !cloudKey` + photos EDL vivantes
`idbKey && !cloudKey` (pièces E/S, clés, compteurs, mobilier — même périmètre que `_edlPreloadPhotos`).
En complément, le rattrapage EXISTANT `_drvUploadPendingAttachments()` (écrit v15.29x, **jamais
appelé** — code mort constaté) est branché post-hydratation (§3d) → la population idb-only fond à
chaque login au lieu de grossir.

⚠️ **Dépendance de déploiement** : P0.1 (export du miroir de Marion) DOIT être fait AVANT que Marion
ne se (re)connecte sur une version portant cette purge — sinon ses créations non synchronisées
(uniquement dans son miroir) seraient purgées au login/logout. Consigné dans QUEUE.md et BACKLOG.

### 3c. Plus de rendu ni de calcul sur le miroir pré-login
`_CLOUD_BOOT` (index.html) = même détection que le FLAG de `supabase-entry.js` et que le boot-gate du
`<head>` (`servi http(s)` ET non-test). En `_CLOUD_BOOT` :
- `initDB()` **ne lit plus** `localStorage[KEY]` (DB démarre vide derrière l'overlay ; le boot-gate
  masque déjà l'app). Le miroir n'était RELU nulle part ailleurs en mode cloud (audit C-C) → il
  devient write-only (filet de rollback), zéro rendu de données d'autrui.
- Les **jobs de boot dépendant des données** ne tournent plus au DOMContentLoaded mais UNE fois,
  post-hydratation (`_bootDataJobs()` appelé par `__immoSetDB`, garde once) : `_applyPendingIRLRevisions`,
  audit incohérences IRL (+3,5 s), `_quittancesAutoGenAtBoot`, `agendaAutoSync`,
  `_purgeCandidatsRefusesProd`, `_migratePjMouvementsToAttachments` (+1,5 s),
  `_checkIRLRappelsAuLogin` (+1,5 s), `_pollRemoteSignSessions` (+2,5 s), `_auditOrphansAtBoot`
  (+2,2 s), + `_drvUploadPendingAttachments` (+4 s, rattrapage réactivé). En mode test/legacy, ces
  jobs tournent au DOMContentLoaded comme avant (appel inline inchangé de comportement).
  → Corrige AUSSI un bug latent : ces jobs MUTAIENT le miroir pré-login (quittances auto, agenda…)
  et leurs effets étaient JETÉS par l'hydratation ; ils tournent désormais sur les vraies données.

### 3d. Fermer les modales dans `__immoSetDB`
`__immoSetDB` ferme toute `.ov:not(.hidden)` (via `closeM`). Couvre : popup IRL/toasts modaux ouverts
sur un état antérieur à l'hydratation (cas Marion), ET les re-pull (conflit) où les données sous une
modale ouverte viennent de changer.

## 4. Re-render de la page courante
`window.__immoRender` (existant) fait `go('accueil')` — correct au login, inacceptable en re-pull en
pleine session (téléphone sur Loyers → renvoyé à l'Accueil). Nouveau `window.__immoRerenderCurrent` :
re-render sidebar/filtres + `go(<page .act courante>)` (repli `accueil` si la page a disparu).
`_repullCloud` l'utilise ; le login initial garde `__immoRender`.

## 5. Hors périmètre (assumé)
- Pull incrémental `updated_at > lastSyncAt` (P2.1) — le re-pull est complet.
- Résolution de conflit par ligne + copie locale (P2.6).
- Kill-switch révocation en session ouverte (P2.5) — mais le re-pull visibilité re-scope déjà la vue
  au retour d'onglet si la RLS a changé.
- Upload Storage systématique à la création (P2.4) — seul le rattrapage existant est rebranché.

## 6. Testabilité
- Moteur : M2 + helpers résumé → `__tests__/helpers/store-sync.test.js` (offline).
- Purge : module pur `js/core/cache-purge.js` → `__tests__/helpers/cache-purge.test.js`.
- Orchestration entry/index.html : non testable offline (comme P1.1) → audit code-reviewer +
  smoke test navigateur réel post-intégration (2 appareils : modif A → B se rafraîchit ; conflit
  provoqué → bannière + convergence ; logout → miroir purgé).
