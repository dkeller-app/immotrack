# Candidature — auto-réouverture candidat + notif « mise à jour » — Design

**Date :** 2026-06-10
**Statut :** validé (mockups A page candidat ✅ ; B notif = réutilise T13d ✅)
**Mockups :** `mockups/candidature/candidat-completer.html` (page candidat, 3 états)
**Objectif produit :** permettre au candidat de **compléter lui-même** son dossier après envoi, **sans message ni intervention du bailleur** — c'est le but de l'onglet Candidats (éviter les messages des candidats). Le bailleur est juste **notifié** dans l'app.

---

## Flux

1. Candidat envoie son dossier → `submitted` → écran « Dossier envoyé ! » **avec bouton « 📎 Compléter mon dossier »**.
2. Clic → **auto-réouverture** : le dépôt repasse `open` → le candidat revoit son formulaire (pré-rempli) → ajoute/corrige → « Renvoyer mon dossier » → `submitted`.
3. Bailleur : à la re-soumission, le pull marque le candidat **non lu (`vu=false`)** → les surfaces de notif **T13d existantes** se rallument (bandeau accueil + rond rouge Candidats + toast + pill). Texte « 📝 dossier mis à jour » (distinct du « 📩 nouveau dossier »).
4. Bailleur **Valide ou Refuse** → l'app **révoque** le lien relais → le candidat qui revient voit **« 🔒 Dossier traité »** (plus modifiable). Fin de la cible mouvante.

---

## Modifications RELAIS (`Immo-relay-bailsign/relay`)

- **`src/candidatures.js`** : `reopenByCandidate(env, linkId)` — passe `submitted → open` (refuse si `revoked` ou inexistant). Ne modifie PAS `complementNote` (réservé au bailleur).
- **`src/index.js`** : route `POST /api/candidatures/:linkId/reopen-self` — auth **X-Cand-Token** (le candidat, pas le bailleur) ; autorise seulement si `status === 'submitted'` (sinon 409) ; jamais si `revoked`.
- **`public/dossier.js`** : sur l'écran `showSent()`, remplacer le `.tip` par un bouton « 📎 Compléter mon dossier » → `POST /reopen-self` (X-Cand-Token) → recharge le formulaire éditable (état `open`). Gérer l'état `revoked` → écran « 🔒 Dossier traité » (pas de bouton).
- **`src/dossier-page.js`** : si `status === 'revoked'`, servir l'écran verrouillé « Dossier traité ».
- **Tests** `test/cand-routes.test.js` : reopen-self OK depuis `submitted` ; 409 si déjà `open` ; refus si `revoked`. + **redéploiement wrangler** (gate user).

## Modifications APP (`index.html` + `js/core`)

> **⚠ Découverte à l'implémentation (le design initial sous-spécifiait le re-pull).** Le lien
> candidat a un cycle d'état réel : `active` (jamais soumis) → `collected` (≥1 dépôt reçu) →
> `done` (purgé, terminal) ; `_complReopen` (complément bailleur D13) le ré-arme en `active`.
> Or le pull ne tirait QUE les liens `active` (ligne `filter(... status==='active')`) et figeait
> le lien en `collected` après import. **Donc une ré-ouverture *candidat* n'était jamais re-tirée**
> → le bailleur ne verrait rien. Le design app est donc plus riche que la spec initiale :

- **Helpers purs** (`js/core/candidature.js`, exposés via `js/main.js`, testés Vitest) :
  - `repullDecision(link, submittedAt, candStatut)` → `'import' | 'skip' | 'baseline'`. Gère le
    re-pull des liens `collected` : ne (ré)importe que si `submittedAt` a changé (anti-boucle),
    skippe si décision déjà prise (`valide`/`refuse`/`converti`), et adopte un `baseline` sans
    notifier pour les liens collectés hérités d'avant le suivi (`_lastSubmittedAt == null`).
  - `majDossierToast(updatedNames)` → texte « 📝 Dossier mis à jour : [nom] » (≠ `nouveauDossierToast` 📩).
- **`_relayPullCandidatures`** :
  - **filtre** : tirer `active` **et** `collected` (plus seulement `active`).
  - **dédup** : après le 409, appeler `repullDecision` ; `skip`→continue, `baseline`→poser
    `link._lastSubmittedAt` sans notifier, `import`→flux normal.
  - **branche update** : poser `cand.vu = false` (rallume bandeau + pastille + pill T13d) + collecter `updatedNames`.
  - à l'import, stamper `link._lastSubmittedAt = res.submittedAt` (référence dédup).
  - **toast** : `created>0` → 📩 nouveau ; sinon `updated>0` → 📝 mis à jour (même en auto-pull silencieux).
- **Décisions bailleur (verrou du dépôt)** :
  - **Validé** : `setCandidatStatut('valide')` → `_relayRevokeForCandidat(c)` = **révoque** le lien
    (relais) + `link.status='revoked'` (exclu du re-pull). **Réversible** : « demander un complément »
    (`_complReopen`) ré-arme le lien (`requireCandOwner` n'interdit pas un révoqué). Donnée **conservée**.
  - **Converti** : `_finalizeCandidatConversion` → `_relayPurgeForCandidat(c)` = **purge** RGPD (donnée migrée au bail). *(manquait avant)*
  - **Refusé** : `_relayPurgeForCandidat` **déjà** appelé (purge → candidat voit « Lien invalide »). Inchangé.
- **Sandbox** `index-candidature-test.html` : parité **différée** (l'utilisateur teste sur prod ; à resync ultérieurement).

## Sécurité / RGPD

- `reopen-self` authentifié par le **jeton candidat** (X-Cand-Token) = le candidat agit sur SON dossier uniquement. Jamais le `ownerToken`.
- Révocation à la décision bailleur → pas de modification post-traitement (intégrité de la décision).
- Aucune donnée nouvelle ; même rétention (TTL invitation). Le score n'intervient pas côté relais.

## Hors périmètre

- Pas de messagerie candidat↔bailleur (volontairement : on évite les messages).
- Pas de notification e-mail/SMS au bailleur (notif in-app uniquement).
- Historique des versions du dossier (on garde la dernière soumission).

## Critères de succès

1. Candidat : après envoi, bouton « Compléter » → rouvre → ajoute → renvoie, sans contacter le bailleur.
2. Bailleur : notifié de la maj via bandeau accueil + rond rouge Candidats (comme un nouveau), texte « mis à jour ».
3. Après Validé/Refusé : le candidat voit « Dossier traité », ne peut plus modifier.
4. Sécurité : reopen-self impossible si révoqué ; jamais d'usage du ownerToken côté candidat.
