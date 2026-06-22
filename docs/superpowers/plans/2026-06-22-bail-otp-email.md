# OTP email (vérification identité signataire) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Steps en `- [ ]`.

**Goal:** Ajouter une vérification d'identité par code à 6 chiffres reçu par email (type Yousign) avant la signature distante du bail.

**Architecture:** Module pur `otp.js` (génération/hash/vérif, testable seul) → stockage par signataire dans la session relais → routes `verify-email` (étendue : envoie le code) + `verify-otp` (nouvelle) → abstraction d'envoi `EmailSender` (impl `dev` sans email + `resend` réel, choisie par `EMAIL_MODE`) → écran « saisir le code » dans `sign.js` → `otpVerifiedAt` dans la preuve + le certificat PDF (app). **Config-staged** : seul l'envoi réel prod dépend du domaine `propryo.fr`.

**Tech Stack:** Cloudflare Worker (Hono), vitest (`@cloudflare/vitest-pool-workers`), Web Crypto API, Resend (HTTP). App : vanilla JS (index.html).

**Spec:** `docs/superpowers/specs/2026-06-22-bail-otp-email-design.md`. **Mockup validé:** `mockup-otp-email.html`.

---

## Pré-requis : worktree relais

Le code relais vit sur la branche `origin/relay-bail-sign` (séparée de l'app `origin/main`). Avant toute tâche relais :

```bash
cd C:/Users/Did_K/Desktop
git -C Immo-bail-stale-fix worktree add ../Immo-relay-otp -b relay-otp origin/relay-bail-sign
cd Immo-relay-otp/relay && npm install
npm test   # baseline : doit être vert avant de commencer
```

Les Tasks 1-6 se font dans `Immo-relay-otp/relay/`. La Task 7 (certificat) se fait dans l'app `Immo-bail-stale-fix/index.html`.

---

## Structure des fichiers

| Fichier | Responsabilité | Repo |
|---|---|---|
| `relay/src/otp.js` (créer) | Module PUR : `generateCode`, `hashCode`, `verifyCode`, `otpUsable`, constantes TTL/attempts | relais |
| `relay/test/otp.test.js` (créer) | Tests du module pur | relais |
| `relay/src/sessions.js` (modifier) | `recordOtpSent` / `recordOtpVerified` + champs OTP sur le signataire | relais |
| `relay/src/email-sender.js` (créer) | `makeSender(env)` → `{ send({to,code,bailRef}) }` ; impl `dev` (no-op + retour) et `resend` | relais |
| `relay/src/index.js` (modifier) | route `verify-email` étendue (envoi code) + nouvelle `verify-otp` | relais |
| `relay/public/sign.js` (modifier) | écran « saisir le code » après l'email | relais |
| `relay/wrangler.toml` (modifier) | vars `EMAIL_MODE`, `EMAIL_FROM` (+ secret `RESEND_API_KEY` hors-fichier) | relais |
| `index.html` `_buildBailCertificatePdf` (modifier) | ligne `otpVerifiedAt` dans le certificat | app |

---

## Task 1 : Module pur OTP

**Files:**
- Create: `relay/src/otp.js`
- Test: `relay/test/otp.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

```js
// relay/test/otp.test.js
import { describe, it, expect } from 'vitest';
import { generateCode, hashCode, verifyCode, otpUsable, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from '../src/otp.js';

describe('generateCode', () => {
  it('rend exactement 6 chiffres', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateCode();
      expect(c).toMatch(/^[0-9]{6}$/);
    }
  });
  it('varie (pas une constante)', () => {
    const s = new Set(Array.from({ length: 30 }, () => generateCode()));
    expect(s.size).toBeGreaterThan(1);
  });
});

describe('hashCode / verifyCode', () => {
  it('le hash diffère du code en clair', async () => {
    const h = await hashCode('sess-abc', '472915');
    expect(h).not.toContain('472915');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('lié à la session : même code + sessionId différent → hash différent', async () => {
    expect(await hashCode('sess-a', '111111')).not.toBe(await hashCode('sess-b', '111111'));
  });
  it('verifyCode : bon code → true, mauvais → false', async () => {
    const h = await hashCode('sess-x', '472915');
    expect(await verifyCode('sess-x', '472915', h)).toBe(true);
    expect(await verifyCode('sess-x', '000000', h)).toBe(false);
    expect(await verifyCode('sess-x', ' 472915 ', h)).toBe(true); // trim
    expect(await verifyCode('sess-x', '472915', null)).toBe(false);
  });
});

describe('otpUsable', () => {
  const now = 1_000_000;
  it('valide si non expiré et tentatives restantes', () => {
    expect(otpUsable({ hash: 'x', expiresAt: now + 1000, attempts: 0 }, now)).toBe(true);
  });
  it('faux si expiré', () => {
    expect(otpUsable({ hash: 'x', expiresAt: now - 1, attempts: 0 }, now)).toBe(false);
  });
  it('faux si tentatives épuisées', () => {
    expect(otpUsable({ hash: 'x', expiresAt: now + 1000, attempts: OTP_MAX_ATTEMPTS }, now)).toBe(false);
  });
  it('faux si pas de hash', () => {
    expect(otpUsable(null, now)).toBe(false);
    expect(otpUsable({ expiresAt: now + 1000 }, now)).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer le test → échoue**

Run: `cd Immo-relay-otp/relay && npx vitest run test/otp.test.js`
Expected: FAIL « Cannot find module '../src/otp.js' ».

- [ ] **Step 3 : Implémenter `otp.js`**

```js
// relay/src/otp.js — Module PUR OTP. Aucune dépendance Worker/réseau → testable seul.
import { sha256hex, timingSafeEqualStr } from './crypto-utils.js';

const CODE_LEN = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;   // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

// Code à 6 chiffres, CSPRNG uniforme (rejection sampling → pas de biais modulo).
export function generateCode() {
  const max = 10 ** CODE_LEN;                         // 1_000_000
  const limit = Math.floor(0xFFFFFFFF / max) * max;   // plus grand multiple de max ≤ 2^32
  const buf = new Uint32Array(1);
  let n;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
  return String(n % max).padStart(CODE_LEN, '0');
}

// Hash lié à la session (anti rainbow-table générique) : sha256(sessionId:code).
export async function hashCode(sessionId, code) {
  return sha256hex(new TextEncoder().encode(`${sessionId}:${String(code).trim()}`));
}

// Compare (constant-time) un code saisi au hash stocké.
export async function verifyCode(sessionId, input, storedHash) {
  if (!storedHash || typeof input !== 'string') return false;
  return timingSafeEqualStr(await hashCode(sessionId, input), storedHash);
}

// L'état OTP d'un signataire est-il exploitable (non expiré, tentatives restantes) ?
export function otpUsable(otp, now) {
  return !!(otp && otp.hash && now <= otp.expiresAt && (otp.attempts || 0) < OTP_MAX_ATTEMPTS);
}
```

- [ ] **Step 4 : Lancer le test → passe**

Run: `npx vitest run test/otp.test.js`
Expected: PASS (tous verts).

- [ ] **Step 5 : Commit**

```bash
git add src/otp.js test/otp.test.js
git commit -m "feat(otp): module pur génération/hash/vérif code 6 chiffres"
```

---

## Task 2 : Stockage OTP dans la session

**Files:**
- Modify: `relay/src/sessions.js` (ajouter après `recordEmailVerified`)
- Test: `relay/test/otp-session.test.js` (créer)

**Contexte:** `sessions.js` expose déjà `loadSession(env, id)` (retourne `{ signers, currentIndex, ... }`) et un mécanisme de persistance (chaque mutateur recharge, modifie `session.signers[currentIndex]`, puis sauve — suivre EXACTEMENT le patron de `recordEmailVerified`, lignes ~40-52). Lire ce patron avant d'écrire.

- [ ] **Step 1 : Écrire le test qui échoue**

```js
// relay/test/otp-session.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createSession, recordOtpSent, recordOtpVerified, loadSession } from '../src/sessions.js';
import { emailHash } from '../src/crypto-utils.js';

async function freshSession() {
  const { sessionId } = await createSession(env, {
    bailRef: 'LOG-014',
    pdfBytes: new Uint8Array([1, 2, 3]),
    signers: [{ emailHash: await emailHash('a@b.fr'), role: 'locataire', ordre: 1 }],
  });
  return sessionId;
}

describe('recordOtpSent / recordOtpVerified', () => {
  it('pose hash + expiresAt + attempts=0 sur le signataire courant', async () => {
    const id = await freshSession();
    await recordOtpSent(env, id, 'deadbeef', 1_111);
    const s = await loadSession(env, id);
    expect(s.signers[0].otp).toEqual({ hash: 'deadbeef', expiresAt: 1_111, attempts: 0 });
  });
  it('recordOtpVerified pose otpVerifiedAt + otpChannel et nettoie le hash', async () => {
    const id = await freshSession();
    await recordOtpSent(env, id, 'deadbeef', 1_111);
    await recordOtpVerified(env, id);
    const s = await loadSession(env, id);
    expect(typeof s.signers[0].otpVerifiedAt).toBe('string');
    expect(s.signers[0].otpChannel).toBe('email');
    expect(s.signers[0].otp.hash).toBeNull(); // code consommé
  });
});
```

- [ ] **Step 2 : Lancer → échoue**

Run: `npx vitest run test/otp-session.test.js`
Expected: FAIL « recordOtpSent is not a function ».

- [ ] **Step 3 : Implémenter dans `sessions.js`** (ajouter après `recordEmailVerified`, en suivant son patron load→mutate→save)

```js
// OTP : pose le code (hashé) envoyé au signataire courant. attempts repart à 0.
export async function recordOtpSent(env, sessionId, hash, expiresAt) {
  const session = await loadSession(env, sessionId);
  const signer = session.signers[session.currentIndex];
  if (!signer) throw new Error('signer-not-found');
  signer.otp = { hash, expiresAt, attempts: 0 };
  await _saveSession(env, sessionId, session); // ⚠️ utiliser le helper de sauvegarde réel de ce fichier
  return session;
}

// OTP : marque l'identité vérifiée (autorité serveur) et consomme le code.
export async function recordOtpVerified(env, sessionId) {
  const session = await loadSession(env, sessionId);
  const signer = session.signers[session.currentIndex];
  if (!signer) throw new Error('signer-not-found');
  signer.otpVerifiedAt = new Date().toISOString();
  signer.otpChannel = 'email';
  if (!signer.emailVerifiedAt) signer.emailVerifiedAt = signer.otpVerifiedAt; // l'OTP prouve l'email
  if (signer.otp) signer.otp.hash = null; // code consommé, plus rejouable
  await _saveSession(env, sessionId, session);
  return session;
}

// OTP : incrémente le compteur de tentatives échouées du signataire courant.
export async function recordOtpAttempt(env, sessionId) {
  const session = await loadSession(env, sessionId);
  const signer = session.signers[session.currentIndex];
  if (signer && signer.otp) { signer.otp.attempts = (signer.otp.attempts || 0) + 1; await _saveSession(env, sessionId, session); }
  return session;
}
```

> **NOTE D'IMPLÉMENTATION (non-placeholder) :** `_saveSession` est un nom générique — à l'implémentation, REMPLACER par l'appel de persistance réel observé dans `recordEmailVerified` (probablement `env.SESSIONS.put(sessionId, JSON.stringify(session))` ou un helper interne). Copier la ligne exacte de sauvegarde de `recordEmailVerified`.

- [ ] **Step 4 : Lancer → passe**

Run: `npx vitest run test/otp-session.test.js`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/sessions.js test/otp-session.test.js
git commit -m "feat(otp): stockage hash/ttl/attempts + recordOtpVerified sur la session"
```

---

## Task 3 : Abstraction d'envoi email (`dev` + `resend`)

**Files:**
- Create: `relay/src/email-sender.js`
- Test: `relay/test/email-sender.test.js`
- Modify: `relay/wrangler.toml`

- [ ] **Step 1 : Test qui échoue**

```js
// relay/test/email-sender.test.js
import { describe, it, expect, vi } from 'vitest';
import { makeSender } from '../src/email-sender.js';

describe('makeSender', () => {
  it('mode dev : n_envoie rien, renvoie devCode (pour test e2e sans email)', async () => {
    const sender = makeSender({ EMAIL_MODE: 'dev' });
    const r = await sender.send({ to: 'a@b.fr', code: '472915', bailRef: 'LOG-014' });
    expect(r.sent).toBe(false);
    expect(r.devCode).toBe('472915');
  });
  it('mode resend : POST à l_API Resend avec le bon payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
    const sender = makeSender({ EMAIL_MODE: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'code@propryo.fr' }, fetchMock);
    const r = await sender.send({ to: 'a@b.fr', code: '472915', bailRef: 'LOG-014' });
    expect(r.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer k');
    const payload = JSON.parse(opts.body);
    expect(payload.from).toContain('code@propryo.fr');
    expect(payload.to).toEqual(['a@b.fr']);
    expect(payload.subject).toContain('code');
    expect(payload.text).toContain('472915');
    expect(payload.text).toContain('LOG-014');
  });
});
```

- [ ] **Step 2 : Lancer → échoue.** Run: `npx vitest run test/email-sender.test.js` → FAIL.

- [ ] **Step 3 : Implémenter `email-sender.js`**

```js
// relay/src/email-sender.js — Abstraction d'envoi du code OTP. Le mode est piloté par EMAIL_MODE :
//   'dev'    → n'envoie rien, renvoie {sent:false, devCode} (test e2e sans email/domaine)
//   'resend' → envoi réel via l'API Resend (nécessite RESEND_API_KEY secret + EMAIL_FROM vérifié)
// fetchImpl injectable pour les tests.
export function makeSender(env, fetchImpl = fetch) {
  const mode = (env && env.EMAIL_MODE) || 'dev';
  return {
    async send({ to, code, bailRef }) {
      if (mode !== 'resend') {
        console.log(`[otp][dev] code pour ${to} (bail ${bailRef}) = ${code}`);
        return { sent: false, devCode: code };
      }
      const from = env.EMAIL_FROM || 'onboarding@resend.dev';
      const subject = `Votre code de signature : ${code}`;
      const text = `Bonjour,\n\nVoici votre code pour signer le bail ${bailRef} : ${code}\n\n` +
        `Ce code est valable 10 minutes. Ne le communiquez à personne.\n\n— Propryo, signature électronique`;
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `Propryo <${from}>`, to: [to], subject, text }),
      });
      if (!res.ok) { console.warn('[otp][resend] échec', res.status); return { sent: false, error: res.status }; }
      return { sent: true };
    },
  };
}
```

- [ ] **Step 4 : Lancer → passe.** Run: `npx vitest run test/email-sender.test.js` → PASS.

- [ ] **Step 5 : Config wrangler.toml** — ajouter sous `[vars]` (créer la section si absente) :

```toml
[vars]
EMAIL_MODE = "dev"          # dev = pas d'envoi (code retourné) · resend = envoi réel
EMAIL_FROM = "onboarding@resend.dev"   # prod : "code@propryo.fr" une fois le domaine vérifié
# RESEND_API_KEY : secret, JAMAIS ici → `npx wrangler secret put RESEND_API_KEY`
```

- [ ] **Step 6 : Commit**

```bash
git add src/email-sender.js test/email-sender.test.js wrangler.toml
git commit -m "feat(otp): abstraction envoi email (dev no-op + resend), config EMAIL_MODE"
```

---

## Task 4 : Routes relais (`verify-email` étendue + `verify-otp`)

**Files:**
- Modify: `relay/src/index.js` (route `verify-email` ~ligne 135 ; ajouter `verify-otp` à la suite)
- Test: `relay/test/otp-routes.test.js` (créer, sur le modèle de `relay/test/routes.test.js`)

**Contexte:** lire `relay/test/routes.test.js` pour le patron de test des routes (création session + appels HTTP via `app.request` ou `SELF.fetch`). La route existante `verify-email` (`POST /api/sessions/:id/verify-email`) compare l'email puis `recordEmailVerified`. On l'étend pour **générer + envoyer le code** après le match, et on ajoute `verify-otp`.

- [ ] **Step 1 : Test qui échoue** (créer `otp-routes.test.js`)

```js
// relay/test/otp-routes.test.js
import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { createSession, loadSession } from '../src/sessions.js';
import { emailHash } from '../src/crypto-utils.js';

async function session(email = 'a@b.fr') {
  const { sessionId } = await createSession(env, {
    bailRef: 'LOG-014', pdfBytes: new Uint8Array([1, 2, 3]),
    signers: [{ emailHash: await emailHash(email), role: 'locataire', ordre: 1 }],
  });
  return sessionId;
}

describe('verify-email envoie le code (mode dev → code retourné)', () => {
  it('email correct → otpSent:true + devCode 6 chiffres', async () => {
    const id = await session();
    const r = await SELF.fetch(`https://x/api/sessions/${id}/verify-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.fr' }),
    });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.otpSent).toBe(true);
    expect(j.devCode).toMatch(/^[0-9]{6}$/); // présent en EMAIL_MODE=dev
  });
  it('email faux → 403, pas de code', async () => {
    const id = await session();
    const r = await SELF.fetch(`https://x/api/sessions/${id}/verify-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'wrong@b.fr' }),
    });
    expect(r.status).toBe(403);
  });
});

describe('verify-otp', () => {
  it('bon code → verified:true', async () => {
    const id = await session();
    const e = await (await SELF.fetch(`https://x/api/sessions/${id}/verify-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.fr' }),
    })).json();
    const r = await SELF.fetch(`https://x/api/sessions/${id}/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: e.devCode }),
    });
    expect((await r.json()).verified).toBe(true);
    const s = await loadSession(env, id);
    expect(typeof s.signers[0].otpVerifiedAt).toBe('string');
  });
  it('mauvais code → verified:false + incrémente attempts', async () => {
    const id = await session();
    await SELF.fetch(`https://x/api/sessions/${id}/verify-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.fr' }),
    });
    const r = await SELF.fetch(`https://x/api/sessions/${id}/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '000000' }),
    });
    expect((await r.json()).verified).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer → échoue.** Run: `npx vitest run test/otp-routes.test.js` → FAIL (devCode/verify-otp absents).

- [ ] **Step 3 : Étendre `index.js`**

3a. En tête du fichier, ajouter les imports :
```js
import { recordOtpSent, recordOtpVerified, recordOtpAttempt } from './sessions.js';
import { generateCode, hashCode, verifyCode, otpUsable, OTP_TTL_MS } from './otp.js';
import { makeSender } from './email-sender.js';
```

3b. Dans la route `verify-email`, APRÈS le match email réussi (`const match = ...; if (!match) return 403`) et AVANT/à la place du `recordEmailVerified` final, insérer la génération + envoi du code :
```js
// Match OK → génère + envoie un code OTP au signataire (email fourni, jamais persisté en clair).
const code = generateCode();
const h = await hashCode(sessionId, code);
await recordOtpSent(c.env, sessionId, h, Date.now() + OTP_TTL_MS);
const sent = await makeSender(c.env).send({ to: email, code, bailRef: guard.session.bailRef });
return c.json({ otpSent: true, ...(sent.devCode ? { devCode: sent.devCode } : {}) });
```
> Le `recordEmailVerified` immédiat est RETIRÉ ici : l'email n'est confirmé qu'après l'OTP (cf. `recordOtpVerified` qui pose aussi `emailVerifiedAt`).

3c. Ajouter la route `verify-otp` juste après :
```js
// Vérifie le code OTP saisi. TTL + max tentatives gérés via otpUsable. Constant-time.
app.post('/api/sessions/:id/verify-otp', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await guardOwner(c); // même garde que verify-email (réutiliser le helper existant)
  if (guard.response) return guard.response;
  const body = await c.req.json().catch(() => ({}));
  const input = body && typeof body.code === 'string' ? body.code : '';
  const signer = guard.session.signers[guard.session.currentIndex];
  if (!otpUsable(signer.otp, Date.now())) return c.json({ verified: false, reason: 'expired-or-locked' }, 400);
  const ok = await verifyCode(sessionId, input, signer.otp.hash);
  if (!ok) { await recordOtpAttempt(c.env, sessionId); return c.json({ verified: false }); }
  await recordOtpVerified(c.env, sessionId);
  return c.json({ verified: true });
});
```
> **NOTE non-placeholder :** `guardOwner` est le nom générique de la garde déjà utilisée par `verify-email` (qui charge la session + vérifie l'accès et fournit `guard.session`). REMPLACER par le helper réel observé dans `verify-email` (mêmes lignes de garde). Réutiliser, ne pas réécrire.

- [ ] **Step 4 : Lancer → passe.** Run: `npx vitest run test/otp-routes.test.js` puis `npm test` (suite complète, non-régression) → PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/index.js test/otp-routes.test.js
git commit -m "feat(otp): verify-email envoie le code + route verify-otp (TTL/attempts/constant-time)"
```

---

## Task 5 : Écran « saisir le code » (sign.js)

**Files:**
- Modify: `relay/public/sign.js` (l'écran identité email — ajouter l'étape code après)

**Contexte:** `sign.js` rend les écrans du signataire (lire la fonction qui rend l'écran « confirmez votre email » + l'appel `POST /verify-email`). Aujourd'hui `verify-email` → succès → écran signature. Désormais `verify-email` renvoie `{otpSent, devCode?}` → afficher l'écran code → `POST /verify-otp` → succès → écran signature. **Réutiliser** le style/composants existants des écrans (pas de nouveau design). Mockup de référence : `mockup-otp-email.html`.

- [ ] **Step 1 : Brancher la transition** — quand `verify-email` répond `otpSent:true`, ne PAS aller à la signature ; rendre l'écran code. Le champ code (6 chiffres), bouton « Valider », lien « Renvoyer » (re-`POST /verify-email`, throttle 30 s). Si `devCode` présent (mode dev), afficher l'encart jaune « Mode test : code = … » (cf. mockup).
- [ ] **Step 2 : Valider** → `POST /api/sessions/:id/verify-otp` `{code}` → `verified:true` → écran « ✓ Identité vérifiée » → continuer vers paraphes/signature (transition existante). `verified:false` → message « Code incorrect, réessayez » + garder l'écran.
- [ ] **Step 3 : Test manuel** (mode dev) — `npx wrangler dev`, ouvrir un lien de signature de test, dérouler email → code (affiché) → signature. Vérifier le parcours.
- [ ] **Step 4 : Commit**

```bash
git add public/sign.js
git commit -m "feat(otp): écran saisie du code dans sign.html (+ encart mode dev)"
```

---

## Task 6 : Pousser la branche relais

- [ ] **Step 1** : `npm test` complet vert.
- [ ] **Step 2** : push de la branche `relay-otp` vers `origin/relay-bail-sign` (ou PR) — coordination à confirmer (le relais a sa propre lignée).
- [ ] **Step 3** : **Audit** `superpowers:code-reviewer` du relais (sécu OTP : CSPRNG, hash session-bound, constant-time, TTL, attempts, pas de secret en dur, email non persisté) AVANT toute activation `EMAIL_MODE=resend`.

---

## Task 7 : Certificat de preuve (app)

**Files:**
- Modify: `index.html` `_buildBailCertificatePdf` (app `Immo-bail-stale-fix`, worktree off `origin/main`)

**Contexte:** `_buildBailCertificatePdf(bail, proof, contentHash)` imprime déjà par signataire `nom (role)`, email, horodatage, IP. Le `proof[]` (rempli par `_completeRemoteSign` depuis `state.signers`) porte déjà `emailVerifiedAt`. Le relais y ajoute `otpVerifiedAt`/`otpChannel` ; `_completeRemoteSign` doit les recopier dans `proof`, puis le certificat les affiche.

- [ ] **Step 1** : dans `_completeRemoteSign` (mapping `proof`), ajouter `otpVerifiedAt: pr.otpVerifiedAt || null` et `otpChannel: pr.otpChannel || null` (à côté de `emailVerifiedAt`).
- [ ] **Step 2** : dans `_buildBailCertificatePdf`, sous la ligne email de chaque signataire, ajouter si présent : `Identité vérifiée par code (email) le <otpVerifiedAt>`.
- [ ] **Step 3** : `node scripts/check-inline-js.mjs` (5/0). Bump version 5 endroits. Commit + push via worktree app (file `.index-queue` si requis).

---

## Self-review (fait)
- **Couverture spec** : flux (T4+T5), module pur (T1), stockage (T2), envoi dev/resend (T3), preuve/certificat (T7), config-staging (T3 wrangler), sécu (T1+T4). ✓
- **Placeholders** : 2 notes explicites (`_saveSession`, `guardOwner`) = noms à remplacer par les helpers RÉELS du fichier (réutilisation imposée, pas réécriture) — pas des trous, des instructions de réutilisation. ✓
- **Cohérence types** : `signer.otp = {hash, expiresAt, attempts}` cohérent T1→T2→T4 ; `otpVerifiedAt`/`otpChannel` cohérents T2→T4→T7. ✓
- **Bloqué domaine** : seul l'envoi réel (T3 `resend`, activé par config) ; T1-T2-T4-T5(dev)-T7 testables sans domaine. ✓
