# AUDIT — Bail signé à distance affiché « ⚠️ Session expirée » (FERRETTE 001)

**Date** : 2026-07-15 · **Sévérité** : P0 (document légal signé non ingéré)
**Bail** : FERRETTE 001 (espace Marion `2e5c49db…`, entité `6afe1b64…`, row baux `b43e34e9…`)
**Locataire signataire** : Baysang Tiffany — signature à distance le **14/07/2026 18:44:50 UTC**

---

## 1. RÉCUPÉRATION (priorité 1) — ✅ le bail signé n'est PAS perdu

Le relais (KV Cloudflare `SESSIONS_KV`) contenait encore **la session signée complète** :

| Élément | Valeur |
|---|---|
| Session signée | `0834bebc…` — `status: completed`, créée 14/07 18:22:51 |
| PDF signé | `signed/0834bebc….pdf` — 5 713 578 octets, TTL jusqu'au **28/07** |
| SHA-256 PDF | `c5766ae1a5bf5004…` — **identique** au `pdfSha256` du dossier de preuve |
| Preuve | emailVerifiedAt 18:26 · openedAt 18:28 · readCompletedAt 18:42 · signedAt 18:44:50 · consentElectronic ✓ · luApprouve ✓ · IP 37.166.108.20 · UA iPhone |

**Sauvegardes locales** (`Desktop\Immo\_recovery-bail-signe\`, gitignoré) :
- `FERRETTE-001-signe-Baysang-2026-07-14.pdf` (intégrité vérifiée par sha256)
- `session-meta-proof-0834bebc.json` (dossier de preuve complet)
- `backup-row-baux-AVANT-recovery.json` (ligne baux complète avant toute écriture)

**Ré-ingestion dans le bail : ✅ EXÉCUTÉE 15/07** — script `recover-ingest.mjs` (même
dossier), reproduit côté serveur ce que `_completeRemoteSign` + `_ingestSignedBailArtifacts`
+ `sealSignedBaux` auraient produit : PDF uploadé dans Supabase Storage
(`espace-files/…/bp_FERRETTE_001_c5766ae1a5bf`, sha256 revérifié après upload), écriture
`legacy_raw` + `signatures` + colonnes verrou légal (`locked=true`, `content_hash` =
`bf25e6a5…` hash canonique des TERMES — contre-calculé indépendamment par l'auditeur,
`signature_source='immotrack'`, `signed_at=18:44:50`), remoteSession repointée sur la vraie
session 0834 en `completed`, ownerToken null. **Version 10 → 11** (les clients périmés
tomberont en conflit → re-pull, la récupération ne peut pas être écrasée). Session
orpheline 35228 **supprimée du relais** (204) → la locataire ne peut plus re-signer par
l'ancien lien. Certificat : régénérable en un clic dans l'app (« 📜 Régénérer le
certificat », reconstruction déterministe depuis proof+contentHash — fallback prévu).
**Audité 2 fois par agent code-reviewer** (v1 = DANGEREUX, 2 critiques corrigées :
`legacy_raw` non écrit → récupération invisible + scellée à jamais ; `content_hash` colonne
= termes pas sha PDF ; v2 = **SÛR À EXÉCUTER**, hash contre-vérifié).

---

## 2. CAUSE RACINE (confirmée, fichier:ligne)

**Le 404 ne venait pas du relais : il venait de GitHub Pages.** `remoteSession.relayUrl`
est stocké **vide**, le poll part donc en URL *relative* sur l'origine de l'app.

Chaîne complète (index.html, origin/main v15.480) :

1. **Création** — `_bsRelayCreateSession` (l.6691) utilise `_relayCfg().base` qui retombe
   sur `RELAY_BASE_DEFAULT` (workers.dev, l.49303-49315) → la session se crée toujours.
2. **Persistance** — `_emitRemoteSignSession` (l.**7035**) stocke
   `relayUrl: (DB.params.bailSignRelayUrl || '')` → **chaîne vide** pour tout utilisateur
   n'ayant jamais saisi l'URL en Réglages (= tous les nouveaux comptes ; l'espace de Marion
   n'a jamais eu ce param). **C'est l'asymétrie création/persistance qui est le bug.**
3. **Poll** — `_bsRelayPollSession` (l.6709) : `fetch('' + '/api/sessions/…')` → URL
   relative → `https://dkeller-app.github.io/api/sessions/…` → **404** (vérifié par curl)
   → `return {status:'expired'}` (l.6712).
4. **Terminal** — `_pollOneRemoteSession` (l.7083) pose `rs.status='expired'` ;
   `_pollRemoteSignSessions` (l.7059) ne re-polle QUE `sent`/`chaining` → la session n'est
   **plus jamais revérifiée**. Badge « ⚠️ Session expirée » (l.6998).
5. Pendant ce temps le lien locataire (URL absolue `signUrl` renvoyée par le relais)
   fonctionne parfaitement → **Tiffany signe la session 0834 à 18:44**, le relais stocke le
   PDF signé. L'app ne le saura jamais.
6. **Relance** — l'utilisateur clique « 🔄 Relancer » (~18:51) → nouvelle session `35228…`
   → `remoteSession` (et l'ownerToken de 0834) **écrasés** → la session signée devient
   orpheline/inaccessible pour l'app (seul l'ownerToken permet de lire le résultat).
7. **Coup de chance** : la purge best-effort de l'ancienne session à la relance
   (`openRemoteSignModal` l.7417) est conditionnée à `_existingRs.relayUrl` — **vide donc
   falsy → DELETE sauté** → la session signée 0834 a survécu en KV. Si `relayUrl` avait été
   renseignée, **le PDF signé aurait été détruit** par la relance.

**Hypothèses de départ** : H1 (suppression post-signature) ✗ · H2 (ingestion échouée puis
delete) ✗ · H3 (matching par ordre) ✗ — le matching est correct · H4 (poll ne tourne pas)
✗ — le poll tournait, mais frappait le mauvais serveur.

**Pourquoi jamais vu avant** : les espaces de Didier ont `params.bailSignRelayUrl`
renseigné (époque où la config était obligatoire) → `relayUrl` stocké non-vide → polls OK.
Tout compte frais (bêta, Marion, commercialisation) reproduit le bug à 100 % dès le premier
envoi en signature.

### Défauts de conception aggravants (à corriger avec le bug)

- **D1** — `'expired'` est synthétisé sur *n'importe quel* 404 (l.6712) : indiscernable
  d'une mauvaise URL, et **terminal** (plus aucun re-poll) sans aucune tentative de
  récupération du résultat.
- **D2** — « Relancer » **supprime l'ancienne session avant d'avoir vérifié son état réel**
  (l.7417) : sur un faux « expirée », si la session était signée, le PDF signé est détruit
  (ici évité par chance, cf. point 7). Chemin de perte d'un document légal.
- **D3** — l'`ownerToken` n'existe qu'en un seul exemplaire dans `remoteSession` : tout
  écrasement (relance) rend le résultat signé irrécupérable par l'app (aucun mécanisme de
  reclaim côté relais).
- **D4 (latent, découvert à l'audit du script)** — `supabase-boot.js:109` passe
  `sealSigned: false` : même une ingestion réussie par l'app produirait au flush
  `signature_source='immotrack'` + `content_hash=NULL` (le mapping lit `contentHashTerms`,
  jamais posé quand le scellement est off) → **violation du CHECK `baux_immotrack_hash_chk`
  (migration 0015) → 23514 → la signature ne se pousse JAMAIS au cloud** (ligne poison
  retentée en boucle). À corriger avant la prochaine signature à distance.

**Côté relais : rien à corriger pour ce bug** (le relais a fait exactement son travail :
session complétée, PDF conservé 14 j, jamais supprimée d'office).

---

## 3. PLAN D'ACTIONS (chiffré)

### C1 — Correctif app P0 (~2-3 h dev + audit code-reviewer + livraison worktree)
1. **`_emitRemoteSignSession` l.7035** : stocker `relayUrl: _relayCfg().base` (l'URL
   réellement utilisée pour créer la session). ~1 ligne. *La* correction.
2. **Résolution au poll** : dans `_pollOneRemoteSession` / `_bsRelayPollSession` /
   `_bsRelayFetchResult` / `_bsRelayDeleteSession` / partage : `const base = rs.relayUrl ||
   _relayCfg().base` → **auto-guérit les sessions déjà stockées avec relayUrl vide** chez
   tous les comptes. ~5 lignes.
3. **404 ≠ expiré automatique** : sur 404, (a) re-tenter avec `_relayCfg().base` si
   différente de `rs.relayUrl` ; (b) tenter `GET /result` avant de conclure ; (c) ne poser
   `'expired'` que si `now > createdAt + 14 j` (le TTL réel), sinon poser un état
   `'unreachable'` NON terminal (badge « Vérification impossible — Réessayer », re-poll
   continue). ~20-25 lignes + branche badge.
4. **« Relancer » sans destruction** (D2) : dans `openRemoteSignModal`, AVANT le DELETE
   l.7417 : poller l'ancienne session (URL résolue) ; si `completed` → lancer
   `_completeRemoteSign` (récupérer la signature !) au lieu de relancer ; ne supprimer que
   si vraiment pending/404. ~15 lignes. **Rend la perte d'un signé impossible par ce
   chemin.**
5. **D4** : poser `contentHashTerms` à l'ingestion (`_completeRemoteSign`) OU activer
   `sealSigned: true` (décision backlog « sealSigned GO user » déjà actée) — sinon toute
   signature à distance future reste bloquée hors cloud. ~30 min + tests.

### C2 — Relais P1, optionnel (~1-2 h + audit + `wrangler deploy` avec confirmation user)
`POST /sessions` stocke `createdBy` (sub du JWT Supabase) ; nouvelle route
`POST /api/sessions/:id/reclaim` (auth JWT, sub == createdBy) qui re-mint un ownerToken →
une session orpheline (token écrasé) redevient récupérable par l'app. Ferme D3
définitivement.

### C3 — Prévention (déjà en backlog)
`sealSigned` GO user ([[project_audit_sync_cloud]]) + smoke test signature à distance sur
compte frais après C1 (le bug ne se voit QUE sur un compte sans `bailSignRelayUrl`).

### Reste à faire immédiat (post-récupération)
1. User : recharger l'app sur chaque appareil (PC + téléphone + appareils Marion) →
   vérifier badge « 🔒 Signé à distance » + bouton 📄 PDF signé sur FERRETTE 001.
2. User : cliquer « 📜 Régénérer le certificat » et l'archiver.
3. Session relais signée 0834 : conservée en KV jusqu'à confirmation du point 1 (elle
   s'auto-purge au TTL le 28/07). La session orpheline 35228 est supprimée par le script
   (sinon la locataire pourrait re-signer par l'ancien lien).
4. Chantier C1 en session dédiée (worktree depuis origin/main, bump 5 emplacements, queue
   index.html, audit code-reviewer obligatoire).
