# OTP email (vérification d'identité type Yousign) — Design

> Spec figée 2026-06-22. Renforce la signature à distance du bail (BAIL-SIGNATURE-DISTANCE, livré PROD).
> **Séquencement validé (user)** : spec complète maintenant + code des parties NON bloquées par le domaine.
> Tout est conçu **config-staged** : l'envoi réel d'email est le SEUL point bloqué par le domaine `propryo.fr`
> (pas encore acquis). Le reste (logique OTP, écran de saisie, preuve, tests) est livrable + testable sans domaine.

## Goal
Passer la vérification d'identité du signataire distant de **« il tape son email »** (faible : prouve qu'il
connaît l'email) à **« il saisit un code reçu par email »** (fort : prouve qu'il contrôle la boîte). Valeur
juridique : rapproche de la **signature électronique avancée** (eIDAS) — facteur de possession.

## État actuel (ancré dans le relais `origin/relay-bail-sign`)
- `relay/src/index.js` `POST /api/sessions/:id/verify-email` : le signataire **tape son email**, le relais compare
  son **hash** (constant-time) à `signer.emailHash` ; si match → `recordEmailVerified` pose `signer.emailVerifiedAt`.
- `relay/src/sessions.js` : `signers[]` = `{ emailHash, statut, emailVerifiedAt, proof }`. Le relais **ne stocke
  jamais l'email/téléphone en clair** (hash only). `proof.emailVerifiedAt` est posé par **autorité serveur**.
- `relay/public/sign.js` : écran « confirmez votre email » existant, AVANT paraphes/signature.
- **Le relais n'envoie AUCUN email** aujourd'hui : le lien est partagé **manuellement** par le bailleur
  (modale Copier/Email/SMS/WhatsApp/QR côté app). ⇒ l'envoi d'email est **net-new infra**.

## Design

### Flux (réutilise l'écran email existant, l'enrichit)
1. Signataire ouvre son lien → écran identité : saisit son **email** (inchangé).
2. Relais : vérifie `emailHash` (déjà en place) → **génère un code 6 chiffres**, le **hash + stocke** sur le
   signataire (`otpHash`, `otpExpiresAt`, `otpAttempts`), puis **l'envoie** (via l'abstraction `EmailSender`, cf.
   infra) à l'email **fourni par le signataire** (jamais stocké en clair). TTL **10 min**.
3. Écran : champ **« code reçu par email »** + bouton « Renvoyer un code » (throttlé).
4. Signataire saisit le code → `POST /api/sessions/:id/verify-otp` → relais compare (constant-time) le hash du
   code saisi à `otpHash`, vérifie TTL + `otpAttempts < 5` → si OK pose `signer.otpVerifiedAt` (+ `otpChannel:'email'`)
   ET `emailVerifiedAt` (l'OTP prouve déjà l'email). Sinon incrémente `otpAttempts`, message d'erreur.
5. Identité confirmée → paraphes/signature (inchangé).

### Périmètre
- **Tous les signataires distants** (bailleur + locataires) — cohérent avec la signature avancée.
- **Obligatoire** (c'est tout l'intérêt). Pas d'opt-out signataire. (Un réglage global « exiger OTP » par défaut ON
  pourra être ajouté plus tard si besoin commercial — hors v1.)

### Modules / fichiers
| Couche | Fichier | Quoi | Bloqué par domaine ? |
|---|---|---|---|
| **Module pur OTP** | `relay/src/otp.js` (+ test) | `generateCode()` (6 chiffres, crypto.getRandomValues), `hashCode`, `verifyCode(saisi, hash)` constant-time, TTL/attempts. **Testable seul.** | ❌ non |
| **Abstraction envoi** | `relay/src/email-sender.js` | interface `send({to, code, bailRef})` + 2 implémentations : `dev` (n'envoie rien → log + renvoie le code dans la réponse API en mode dev) et `resend` (vrai envoi). Choix par `env.EMAIL_MODE`. | ❌ non (l'interface + `dev`) · ✅ oui (le `resend` réel) |
| **Routes relais** | `relay/src/index.js` | étendre `verify-email` (génère+envoie le code après match) + nouvelle `verify-otp`. | ❌ non |
| **Stockage session** | `relay/src/sessions.js` | `recordOtpSent` / `recordOtpVerified` ; champs `otpHash`/`otpExpiresAt`/`otpAttempts`/`otpVerifiedAt`/`otpChannel`. | ❌ non |
| **Écran signataire** | `relay/public/sign.js` | étape « saisir le code » après l'email + « Renvoyer ». | ❌ non |
| **Preuve / certificat** | `proof` + `_buildBailCertificatePdf` (app) | ajouter `otpVerifiedAt` + `otpChannel` au dossier de preuve et au certificat PDF. | ❌ non |

### Infra (vulgarisé) — le SEUL point lié au domaine
- **Service d'envoi** : **Resend** (gratuit ~3000 mails/mois, fetch HTTP simple depuis un Worker Cloudflare).
  Clé API en **secret Worker** (`RESEND_API_KEY`), jamais en dur (repo public).
- **Expéditeur** : `EMAIL_FROM` (config). Dev/test → expéditeur de test Resend (`onboarding@resend.dev`, codes vers
  ta propre boîte) ; **prod → `code@propryo.fr`** (ou `.com`) une fois le domaine **acquis + vérifié SPF/DKIM**.
- **`EMAIL_MODE`** (config) : `dev` (n'envoie rien, code renvoyé/loggé — **état par défaut tant qu'il n'y a pas de
  domaine**) · `resend` (envoi réel). **Bascule = 1 variable d'env + redeploy.**

### Staging d'activation (autour du domaine)
1. **Maintenant (sans domaine, sans Resend)** : on livre `otp.js` + `email-sender.js` (interface + `dev`) + routes +
   `sessions.js` + l'écran sign.html + la preuve/certificat. `EMAIL_MODE=dev`. **Testable de bout en bout** (le code
   s'affiche/se renvoie). Rien à faire côté user.
2. **Quand tu veux tester l'envoi réel** : compte Resend + clé API + `EMAIL_MODE=resend` + `EMAIL_FROM=onboarding@resend.dev`
   + redeploy relais (ops user, ~10 min, guidé). Les codes arrivent sur ta boîte.
3. **Prod** : `propryo.fr` acquis + vérifié → `EMAIL_FROM=code@propryo.fr`. Bascule 1 ligne.

## Sécurité
- Code **6 chiffres** via CSPRNG (`crypto.getRandomValues`), **hashé** (jamais stocké en clair), comparaison
  **constant-time** (réutilise `timingSafeEqualStr`/`crypto-utils.js`).
- **TTL 10 min** + **max 5 tentatives** par code → sinon code invalidé, nouveau « Renvoyer » nécessaire.
- **Throttle** sur l'envoi (anti-spam : 1 code / 30 s par signataire).
- Email/téléphone **jamais en clair** côté relais (l'email transite à la saisie, sert à envoyer, n'est pas persisté).
- Secrets (`RESEND_API_KEY`) en secrets Worker, jamais commités.

## Tests
- **`otp.test.js`** (pur, TDD) : génération 6 chiffres, hash≠clair, verify OK/KO, TTL expiré, attempts dépassés,
  constant-time. **Sans réseau, sans email.**
- **Mode dev e2e** : `EMAIL_MODE=dev` → le code revient dans la réponse → on déroule email→code→signature sans infra.
- Non-régression : la signature distante existante (sans OTP exigé ? non — v1 OTP obligatoire) — on vérifie que le
  flux complet email→OTP→paraphes→signature→complétion passe.

## Hors périmètre v1
- **SMS** (canal alternatif) : l'archi `EmailSender` se généralisera en `OtpSender{email|sms}` plus tard ; SMS = autre
  provider + coût + numéros de téléphone → reporté.
- eIDAS **qualifié** (tiers certifié type Yousign payant) : reste l'option premium déjà actée au backlog.
- Réglage par-bailleur « exiger / ne pas exiger l'OTP » : v1 = toujours exigé.

## Dépendances de livraison
- **Bloqué par `propryo.fr`** : UNIQUEMENT l'étape 3 (envoi réel prod). Tout le reste livrable + testable maintenant.
- **Ops user (quand il voudra l'envoi réel)** : compte Resend, clé API (secret), redeploy relais. Guidé.
- Audit `superpowers:code-reviewer` du relais (sécurité OTP : génération, hash, constant-time, TTL, attempts) avant
  activation prod.
