# CHANTIER — Fix signature à distance : relayUrl vide + faux « expiré » + relance destructrice

> Session dédiée. Lire d'abord `docs/subjects/AUDIT-BAIL-SIGNE-SESSION-EXPIREE-2026-07-15.md`
> (cause racine confirmée fichier:ligne + récupération FERRETTE 001 déjà faite).
> Mémoire : `project_bail_signature_fil_rouge`, `feedback_audits_par_agents`,
> `feedback_index_commit_coordination`, `feedback_sandbox_first`.

## Contexte en 3 lignes
Un bail signé à distance est apparu « ⚠️ Session expirée » alors que le locataire avait signé :
`_emitRemoteSignSession` (index.html:7035) stocke `relayUrl = DB.params.bailSignRelayUrl || ''`
(vide pour TOUT compte n'ayant jamais saisi l'URL en Réglages — donc tous les nouveaux comptes),
alors que la création utilise `_relayCfg().base` (défaut workers.dev, l.49303-49315). Le poll
part alors en URL RELATIVE sur github.io → 404 → `'expired'` synthétique TERMINAL. Reproduction
100 % sur compte frais dès le premier envoi.

## Correctifs (dans l'ordre, TDD là où testable)

### 1. P0 — Stocker l'URL réellement utilisée (la correction)
`_emitRemoteSignSession` (~7035) : `relayUrl: _relayCfg().base` au lieu de
`(DB.params.bailSignRelayUrl || '')`.

### 2. P0 — Résolution au poll (auto-guérison des sessions déjà stockées)
Partout où `rs.relayUrl` est lu (`_pollOneRemoteSession` ~7078, purge `openRemoteSignModal`
~7417, et tout autre site — grep `rs.relayUrl` / `.relayUrl`) : résoudre
`const base = rs.relayUrl || _relayCfg().base`. Les sessions existantes avec relayUrl vide
redeviennent pollables sans migration de données.

### 3. P0 — 404 ≠ « expiré » automatique (ne plus jamais perdre un signé)
Dans `_pollOneRemoteSession` (~7074-7110) :
- Sur `{status:'expired'}` (404 synthétique de `_bsRelayPollSession` ~6712) : ne poser
  `'expired'` QUE si `now > rs.createdAt + 14 j` (TTL réel du relais, `SESSION_TTL_SECONDS`).
- Sinon poser un état NON terminal (ex. `'unreachable'`) : badge orange « Vérification
  impossible — 🔄 Réessayer » (≠ rouge « expirée »), et l'inclure dans le filtre de
  `_pollRemoteSignSessions` (~7059) pour que le re-poll continue.
- Le badge `_renderRemoteSignBadge` (~6998) : nouvelle branche `'unreachable'`.
  ⚠️ Changement UX → mockup-first (badge 3 états × clair/sombre, fichiers locaux
  `mockups/`, validation user) avant de coder.

### 4. P0 — « Relancer » ne détruit jamais une session potentiellement signée
`openRemoteSignModal` (~7412-7420) supprime l'ancienne session relais AVANT d'avoir vérifié
son état réel. Sur un faux « expirée », si la session était `completed`, le DELETE détruit le
PDF signé (évité de justesse dans l'incident : relayUrl vide = DELETE sauté). Fix : avant le
DELETE, poller la session (URL résolue §2) ; si `completed` → appeler `_completeRemoteSign`
(on RÉCUPÈRE la signature au lieu de relancer) ; ne supprimer que si pending/404 confirmé.

### 5. P0 — Poison CHECK `baux_immotrack_hash_chk` (découvert à l'audit)
`supabase-boot.js:109` passe `sealSigned: false` → une complétion de signature à distance pose
`signatureSource='immotrack'` SANS `contentHashTerms` → le mapping (`store-mapping.js:84-95`)
envoie `content_hash=NULL` + `signature_source='immotrack'` → violation du CHECK (migration
0015) → 23514 → **le bail signé ne se pousse JAMAIS au cloud** (ligne poison en boucle).
Même sans l'incident relayUrl, toute signature à distance serait restée bloquée en local.
Fix : activer `sealSigned: true` (= P0.7 du BACKLOG, décision user à confirmer) OU poser
`contentHashTerms` dans `_completeRemoteSign` à l'ingestion. Test contre le vrai Postgres
(pattern `supabase/tests/flush-poison.test.mjs`).

### 6. P1 optionnel — Route « reclaim » côté relais (ferme le risque orphelin)
L'ownerToken n'existe qu'en un exemplaire dans `remoteSession` : un écrasement (relance) rend
le résultat signé irrécupérable. Relais (`Immo-relay-bailsign/relay`) : stocker
`createdBy = payload.sub` à la création (`POST /sessions`) + route
`POST /api/sessions/:id/reclaim` (auth JWT Supabase, `sub === createdBy`) qui re-mint un
ownerToken. Déploiement `npx wrangler deploy` = **confirmation user obligatoire**.

### 7. P2 cosmétique — doublon de boutons PDF (constat user 15/07)
Sur un bail signé à distance, la fiche affiche DEUX boutons qui ouvrent LE MÊME fichier :
« 📄 PDF signé » (badge `_renderRemoteSignBadge` branche completed, ~6992) et « 📄 PDF du
bail » (bouton générique cloud-aware, ~38756) — tous deux `_openCloudBailPdf(ref)` sur
`signatures.cloudPdfKey`. Masquer le bouton générique quand le badge completed affiche déjà
le sien (condition : `remoteSession.status !== 'completed'`). Vérifier aussi rBaux (~37547).

## Contraintes (non négociables)
- Code de SIGNATURE = document légal → audit `superpowers:code-reviewer` AVANT « prêt à tester ».
- `node scripts/check-inline-js.mjs` (5|0) + `node scripts/verif-popup.cjs` (PARSE OK).
- Livraison : worktree depuis `origin/main` (clone Desktop\Immo = stale), rebase `-X ours`,
  re-bump au-dessus de la version courante (5 emplacements : title / `<em>` /
  IMMOTRACK_VERSION / récap diag / sw.js CACHE_VER), file `.index-queue/QUEUE.md` si session
  maître active, push fast-forward `HEAD:main`, vérif github.io.
- Smoke test final SUR COMPTE FRAIS (le bug ne se voit que sans `bailSignRelayUrl` —
  `didierkeller+test0@gmail.com` dispo) : envoyer un bail en signature, vérifier badge
  « En attente » stable (pas « expirée »), signer via le lien, vérifier ingestion complète
  (badge 🔒 + PDF + certificat) et la POUSSÉE CLOUD de la ligne signée (§5).

## Effort estimé
§1-4 ≈ 2-3 h dev+tests + audit + livraison · §5 ≈ 30-60 min (+ décision user sealSigned) ·
§6 ≈ 1-2 h (relais + app). Total ~1 session dédiée.

## Post-livraison
- Vérifier chez Marion/Didier que FERRETTE 001 affiche « 🔒 Signé à distance » (récupération
  du 15/07) + régénérer le certificat + le classer.
- Supprimer la session relais signée `0834bebc…` du KV après confirmation (sinon TTL 28/07).
- Sauvegardes locales : `Desktop\Immo\_recovery-bail-signe\` (gitignoré) — conserver.
