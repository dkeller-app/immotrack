# Relais de signature de bail (Cloudflare Worker) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le relais serverless qui héberge une « session de signature » et permet l'aller-retour automatique du PDF de bail entre le bailleur (ImmoTrack) et le(s) signataire(s) à distance, sans aucune action manuelle de retour.

**Architecture :** Un Cloudflare Worker (routeur Hono) sans état. R2 stocke les blobs PDF (original + signé), KV stocke les métadonnées de session (JSON léger, TTL 14 j). L'accès est gardé par des tokens HMAC-SHA256 signés (Web Crypto), jamais transmis dans l'URL. Les signataires sont **ordonnés** (gère le cas bailleur→locataire séquentiel avec un seul PDF final). C'est le composant n°1 sur 3 du sujet BAIL-SIGNATURE-DISTANCE ; il est autonome et testable seul. `sign.html` (composant 2) et l'intégration ImmoTrack (composant 3) feront l'objet de plans séparés une fois ce relais déployé et testé.

**Tech Stack :** Cloudflare Workers · Hono · Web Crypto (HMAC-SHA256, SHA-256, getRandomValues) · R2 (blobs) · KV (métadonnées) · Vitest + `@cloudflare/vitest-pool-workers` · wrangler. JavaScript ESM (cohérent avec l'app vanilla, pas de TypeScript).

**Référence spec :** [docs/subjects/BAIL-SIGNATURE-DISTANCE.md](../../subjects/BAIL-SIGNATURE-DISTANCE.md) (§2 décisions, §3 architecture/routes, §5 dossier de preuve, §6 sécurité/RGPD).

---

## Décisions ouvertes signalées (à trancher avant Phase 3, n'impactent pas ce plan)

Ces points sont **délibérément hors scope du relais V1** mais documentés ici pour ne pas être enterrés :

1. **Authentification de `POST /sessions`.** Ce plan utilise un secret partagé `APP_KEY` (header `Authorization: Bearer …`), comme spécifié. ⚠️ **Limite connue** : ImmoTrack étant une app client (index.html), `APP_KEY` serait lisible dans le bundle → ce n'est pas une auth forte, juste un garde anti-abus combiné au rate-limiting Cloudflare. Le durcissement propre (vérifier l'ID token Google OAuth déjà présent dans l'app) est un item de **Phase 4 (durcissement)**, à valider par l'audit sécurité. Le blast radius reste faible : créer une session ne fait que stocker un PDF éphémère, et le PDF signé ne revient qu'au détenteur de l'`ownerToken`.

2. **Qui envoie l'email au signataire suivant (cas gestion).** Quand le bailleur a signé, `currentIndex` avance vers le locataire. Deux options pour l'email automatique du 2e signataire :
   - **(a) app-poll** : ImmoTrack, en pollant, voit l'avancement et envoie l'email via Gmail API (garde l'adresse expéditeur du bailleur, mais l'app doit être ouverte) ;
   - **(b) relay-push** : le relais envoie lui-même l'email via un service transactionnel (Resend/MailChannels), expéditeur générique, vraiment push.
   Ce plan implémente la **machine d'état** (avance de `currentIndex` + exposition du signataire courant) et un marqueur `pendingEmail`, mais **ne câble aucun envoi d'email** côté relais. Le choix (a)/(b) se tranche en Phase 3.

3. **Sandbox Phase 3.** `index-test.html` peut être occupé par une session parallèle. L'intégration (Phase 3) utilisera soit `index-test.html` quand il est libre, soit un harnais dédié `index-test-bailsign.html`, pour ne pas entrer en collision. Sans objet pour le relais.

---

## File Structure

Projet **standalone** dans le sous-dossier `relay/` du dépôt ImmoTrack (toolchain isolé, son propre `package.json`). N'impacte pas GitHub Pages (qui sert `index.html`). `relay/node_modules` est gitignoré.

```
relay/
  .gitignore              # node_modules, .dev.vars, .wrangler
  package.json            # deps : hono ; devDeps : wrangler, vitest, @cloudflare/vitest-pool-workers
  wrangler.toml           # name, main, compatibility_date, bindings KV + R2
  vitest.config.js        # defineWorkersConfig → pool workers, configPath wrangler.toml
  .dev.vars.example       # SIGNING_SECRET=… APP_KEY=…  (le vrai .dev.vars est gitignoré)
  src/
    index.js              # entrée Worker : app Hono + montage des routes
    tokens.js             # base64url + createToken/verifyToken (HMAC-SHA256, exp)
    crypto-utils.js       # sha256hex, randomHex, emailHash
    storage.js            # KV (méta + TTL) & R2 (original/signed) helpers
    sessions.js           # modèle session + machine d'état signataires ordonnés
    validate.js           # validation write-back PDF (magic bytes, taille, content-type)
  test/
    tokens.test.js
    crypto-utils.test.js
    storage.test.js
    sessions.test.js
    validate.test.js
    routes.test.js        # tests d'intégration via SELF.fetch
  public/
    .gitkeep              # sign.html y sera déposé en Phase 2 (servi par le Worker)
```

**Responsabilités (une par fichier) :**
- `tokens.js` : tout ce qui touche aux jetons HMAC (encode/décode/vérifie). Pur (prend le secret en paramètre).
- `crypto-utils.js` : primitives crypto réutilisables (hash, aléatoire). Pures.
- `storage.js` : seule frontière avec KV/R2 (le reste du code ne connaît pas les bindings directement).
- `sessions.js` : logique métier de la session (création, avance de signataire, complétion). S'appuie sur storage + crypto-utils.
- `validate.js` : validation d'un upload PDF. Pur.
- `index.js` : routage HTTP + orchestration, fin et sans logique métier dupliquée.

---

## Task 0 : Prérequis infra (action utilisateur)

> ⚠️ **Aucune ligne de code testable ne dépend de cette tâche** sauf le déploiement (Task 12) et les tests d'intégration qui tournent en local via miniflare (pas besoin du vrai compte). Mais le relais ne sera **déployable/testable end-to-end** qu'après ceci. À faire par l'utilisateur (Didier).

- [ ] **Step 1 : Créer un compte Cloudflare** (gratuit) sur https://dash.cloudflare.com/sign-up

- [ ] **Step 2 : Installer et authentifier wrangler**

Run (depuis `relay/` après Task 1) :
```bash
npx wrangler login
```
Expected : ouverture navigateur → autorisation → « Successfully logged in ».

- [ ] **Step 3 : Créer le namespace KV**

Run :
```bash
npx wrangler kv namespace create SESSIONS_KV
npx wrangler kv namespace create SESSIONS_KV --preview
```
Expected : deux `id` retournés (un prod, un preview). Les copier dans `wrangler.toml` (Task 1).

- [ ] **Step 4 : Créer le bucket R2**

Run :
```bash
npx wrangler r2 bucket create bail-sign-pdfs
npx wrangler r2 bucket create bail-sign-pdfs-preview
```
Expected : « Created bucket … ».

- [ ] **Step 5 : Définir les secrets** (après premier déploiement, ou en local via `.dev.vars`)

Pour la prod (Task 12) :
```bash
npx wrangler secret put SIGNING_SECRET   # coller une valeur aléatoire 64+ caractères
npx wrangler secret put APP_KEY          # coller une autre valeur aléatoire
```
Pour le dev local, créer `relay/.dev.vars` (gitignoré) à partir de `.dev.vars.example`.

---

## Task 1 : Scaffold du projet relais

**Files:**
- Create: `relay/package.json`
- Create: `relay/wrangler.toml`
- Create: `relay/vitest.config.js`
- Create: `relay/.gitignore`
- Create: `relay/.dev.vars.example`
- Create: `relay/src/index.js`
- Create: `relay/public/.gitkeep`
- Test: `relay/test/routes.test.js`

- [ ] **Step 1 : Créer `relay/package.json`**

```json
{
  "name": "bail-sign-relay",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "wrangler": "^3.80.0",
    "vitest": "^2.1.0",
    "@cloudflare/vitest-pool-workers": "^0.5.0"
  }
}
```

- [ ] **Step 2 : Créer `relay/.gitignore`**

```
node_modules/
.dev.vars
.wrangler/
dist/
```

- [ ] **Step 3 : Créer `relay/.dev.vars.example`**

```
SIGNING_SECRET=dev-only-change-me-64-chars-minimum-aaaaaaaaaaaaaaaaaaaaaaaaaaaa
APP_KEY=dev-only-app-key-change-me
```

Puis copier en `.dev.vars` pour le dev local (ce dernier est gitignoré).

- [ ] **Step 4 : Créer `relay/wrangler.toml`** (remplacer les `id` par ceux de Task 0)

```toml
name = "bail-sign-relay"
main = "src/index.js"
compatibility_date = "2024-09-23"

kv_namespaces = [
  { binding = "SESSIONS_KV", id = "REMPLIR_PROD_ID", preview_id = "REMPLIR_PREVIEW_ID" }
]

[[r2_buckets]]
binding = "PDF_BUCKET"
bucket_name = "bail-sign-pdfs"
preview_bucket_name = "bail-sign-pdfs-preview"
```

- [ ] **Step 5 : Créer `relay/vitest.config.js`**

```js
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.test.js'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            SIGNING_SECRET: 'test-secret-please-change-test-secret-please-change',
            APP_KEY: 'test-app-key'
          }
        }
      }
    }
  }
});
```

- [ ] **Step 6 : Créer `relay/public/.gitkeep`** (fichier vide)

- [ ] **Step 7 : Créer `relay/src/index.js` minimal**

```js
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'bail-sign-relay' }));

export default app;
```

- [ ] **Step 8 : Écrire le test de santé** dans `relay/test/routes.test.js`

```js
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('GET /health', () => {
  it('répond 200 avec ok:true', async () => {
    const res = await SELF.fetch('https://relay.test/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
```

- [ ] **Step 9 : Installer les dépendances et lancer le test**

Run (depuis `relay/`) :
```bash
npm install
npm test
```
Expected : `GET /health > répond 200 avec ok:true` PASS.

- [ ] **Step 10 : Commit**

```bash
git add relay/.gitignore relay/package.json relay/wrangler.toml relay/vitest.config.js relay/.dev.vars.example relay/src/index.js relay/public/.gitkeep relay/test/routes.test.js
git commit -m "feat(relay): scaffold Cloudflare Worker + health route"
```

---

## Task 2 : Module crypto-utils (hash + aléatoire)

**Files:**
- Create: `relay/src/crypto-utils.js`
- Test: `relay/test/crypto-utils.test.js`

- [ ] **Step 1 : Écrire les tests d'abord** dans `relay/test/crypto-utils.test.js`

```js
import { describe, it, expect } from 'vitest';
import { sha256hex, randomHex, emailHash } from '../src/crypto-utils.js';

describe('crypto-utils', () => {
  it('sha256hex retourne un hex 64 chars stable', async () => {
    const h = await sha256hex(new TextEncoder().encode('abc'));
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('randomHex(32) retourne 64 hex chars, différents à chaque appel', () => {
    const a = randomHex(32), b = randomHex(32);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('emailHash normalise (trim + lowercase) avant de hasher', async () => {
    const a = await emailHash('  Camille.Audrin@Gmail.com ');
    const b = await emailHash('camille.audrin@gmail.com');
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- crypto-utils`
Expected : FAIL (`sha256hex is not a function` / module introuvable).

- [ ] **Step 3 : Implémenter `relay/src/crypto-utils.js`**

```js
export async function sha256hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function emailHash(email) {
  const normalized = String(email).trim().toLowerCase();
  return sha256hex(new TextEncoder().encode(normalized));
}
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- crypto-utils`
Expected : 3 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/crypto-utils.js relay/test/crypto-utils.test.js
git commit -m "feat(relay): crypto-utils (sha256hex, randomHex, emailHash)"
```

---

## Task 3 : Module tokens (HMAC signés)

**Files:**
- Create: `relay/src/tokens.js`
- Test: `relay/test/tokens.test.js`

Format du token : `base64url(JSON payload) + "." + base64url(HMAC-SHA256(payloadBytes, secret))`. Payload : `{ sid, role, idx, jti, exp }` (`idx` absent/ignoré pour `role:'owner'`). `exp` en secondes epoch.

- [ ] **Step 1 : Écrire les tests d'abord** dans `relay/test/tokens.test.js`

```js
import { describe, it, expect } from 'vitest';
import { createToken, verifyToken } from '../src/tokens.js';

const SECRET = 'unit-test-secret-unit-test-secret-unit-test';

describe('tokens', () => {
  it('round-trip : un token créé est vérifiable et rend son payload', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createToken({ sid: 'abc', role: 'signer', idx: 1, jti: 'j1', exp }, SECRET);
    const res = await verifyToken(tok, SECRET);
    expect(res.valid).toBe(true);
    expect(res.payload).toMatchObject({ sid: 'abc', role: 'signer', idx: 1, jti: 'j1' });
  });

  it('rejette une signature falsifiée', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createToken({ sid: 'abc', role: 'owner', jti: 'j1', exp }, SECRET);
    const tampered = tok.slice(0, -2) + (tok.endsWith('A') ? 'BB' : 'AA');
    const res = await verifyToken(tampered, SECRET);
    expect(res.valid).toBe(false);
  });

  it('rejette un token expiré', async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const tok = await createToken({ sid: 'abc', role: 'owner', jti: 'j1', exp }, SECRET);
    const res = await verifyToken(tok, SECRET);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('expired');
  });

  it('rejette un token signé avec un autre secret', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createToken({ sid: 'abc', role: 'owner', jti: 'j1', exp }, SECRET);
    const res = await verifyToken(tok, 'un-autre-secret-different-un-autre-secret');
    expect(res.valid).toBe(false);
  });

  it('rejette un token malformé', async () => {
    const res = await verifyToken('pas-un-token', SECRET);
    expect(res.valid).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- tokens`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `relay/src/tokens.js`**

```js
function bytesToBase64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createToken(payload, secret) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await importKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  return `${bytesToBase64url(payloadBytes)}.${bytesToBase64url(sig)}`;
}

export async function verifyToken(token, secret) {
  try {
    const dot = token.indexOf('.');
    if (dot < 1) return { valid: false, reason: 'malformed' };
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);
    const payloadBytes = base64urlToBytes(payloadB64);
    const sigBytes = base64urlToBytes(sigB64);
    const key = await importKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
    if (!ok) return { valid: false, reason: 'bad-signature' };
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'malformed' };
  }
}
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- tokens`
Expected : 5 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/tokens.js relay/test/tokens.test.js
git commit -m "feat(relay): jetons HMAC signés (create/verify, exp)"
```

---

## Task 4 : Module validate (write-back PDF)

**Files:**
- Create: `relay/src/validate.js`
- Test: `relay/test/validate.test.js`

- [ ] **Step 1 : Écrire les tests d'abord** dans `relay/test/validate.test.js`

```js
import { describe, it, expect } from 'vitest';
import { validatePdfUpload, MAX_PDF_BYTES } from '../src/validate.js';

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

function makeBytes(magic, size) {
  const b = new Uint8Array(size);
  b.set(magic, 0);
  return b;
}

describe('validatePdfUpload', () => {
  it('accepte un PDF valide (magic %PDF, taille ok, content-type pdf)', () => {
    const bytes = makeBytes(PDF_MAGIC, 1000);
    const res = validatePdfUpload(bytes, 'application/pdf');
    expect(res.ok).toBe(true);
  });

  it('rejette si les magic bytes ne sont pas %PDF', () => {
    const bytes = makeBytes(new Uint8Array([0x00, 0x01, 0x02, 0x03]), 1000);
    const res = validatePdfUpload(bytes, 'application/pdf');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not-pdf');
  });

  it('rejette si trop volumineux', () => {
    const bytes = makeBytes(PDF_MAGIC, MAX_PDF_BYTES + 1);
    const res = validatePdfUpload(bytes, 'application/pdf');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('too-large');
  });

  it('rejette un content-type non pdf', () => {
    const bytes = makeBytes(PDF_MAGIC, 1000);
    const res = validatePdfUpload(bytes, 'image/png');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('bad-content-type');
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- validate`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `relay/src/validate.js`**

```js
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 Mo

export function validatePdfUpload(bytes, contentType) {
  if (contentType && !String(contentType).toLowerCase().includes('application/pdf')) {
    return { ok: false, reason: 'bad-content-type' };
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  const isPdf =
    bytes.length >= 4 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!isPdf) {
    return { ok: false, reason: 'not-pdf' };
  }
  return { ok: true };
}
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- validate`
Expected : 4 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/validate.js relay/test/validate.test.js
git commit -m "feat(relay): validation upload PDF (magic bytes, taille, content-type)"
```

---

## Task 5 : Module storage (KV + R2)

**Files:**
- Create: `relay/src/storage.js`
- Test: `relay/test/storage.test.js`

`storage.js` est la seule frontière avec les bindings. KV stocke la méta JSON avec TTL ; R2 stocke les blobs.

- [ ] **Step 1 : Écrire les tests d'abord** dans `relay/test/storage.test.js`

```js
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  putMeta, getMeta, putOriginalPdf, getOriginalPdf, putSignedPdf, getSignedPdf
} from '../src/storage.js';

describe('storage KV', () => {
  it('putMeta puis getMeta restitue l’objet', async () => {
    await putMeta(env, 'sid-1', { hello: 'world', n: 2 });
    const got = await getMeta(env, 'sid-1');
    expect(got).toEqual({ hello: 'world', n: 2 });
  });

  it('getMeta retourne null si absent', async () => {
    const got = await getMeta(env, 'sid-inexistant');
    expect(got).toBeNull();
  });
});

describe('storage R2', () => {
  it('putOriginalPdf puis getOriginalPdf restitue les octets', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
    await putOriginalPdf(env, 'sid-2', bytes);
    const obj = await getOriginalPdf(env, 'sid-2');
    const out = new Uint8Array(await obj.arrayBuffer());
    expect(out).toEqual(bytes);
  });

  it('putSignedPdf puis getSignedPdf restitue les octets', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 9]);
    await putSignedPdf(env, 'sid-3', bytes);
    const obj = await getSignedPdf(env, 'sid-3');
    const out = new Uint8Array(await obj.arrayBuffer());
    expect(out).toEqual(bytes);
  });

  it('getSignedPdf retourne null si absent', async () => {
    const obj = await getSignedPdf(env, 'sid-inexistant');
    expect(obj).toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- storage`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `relay/src/storage.js`**

```js
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 jours

const metaKey = (sid) => `session:${sid}`;
const originalKey = (sid) => `original/${sid}.pdf`;
const signedKey = (sid) => `signed/${sid}.pdf`;

export async function putMeta(env, sid, obj) {
  await env.SESSIONS_KV.put(metaKey(sid), JSON.stringify(obj), {
    expirationTtl: SESSION_TTL_SECONDS
  });
}

export async function getMeta(env, sid) {
  const raw = await env.SESSIONS_KV.get(metaKey(sid));
  return raw ? JSON.parse(raw) : null;
}

export async function putOriginalPdf(env, sid, bytes) {
  await env.PDF_BUCKET.put(originalKey(sid), bytes, {
    httpMetadata: { contentType: 'application/pdf' }
  });
}

export async function getOriginalPdf(env, sid) {
  return env.PDF_BUCKET.get(originalKey(sid));
}

export async function putSignedPdf(env, sid, bytes) {
  await env.PDF_BUCKET.put(signedKey(sid), bytes, {
    httpMetadata: { contentType: 'application/pdf' }
  });
}

export async function getSignedPdf(env, sid) {
  return env.PDF_BUCKET.get(signedKey(sid));
}
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- storage`
Expected : 5 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/storage.js relay/test/storage.test.js
git commit -m "feat(relay): storage KV (méta+TTL) & R2 (original/signé)"
```

---

## Task 6 : Modèle session + machine d'état signataires ordonnés

**Files:**
- Create: `relay/src/sessions.js`
- Test: `relay/test/sessions.test.js`

`sessions.js` orchestre crypto-utils + storage. Une session :

```js
{
  sessionId, bailRef, provider: 'native',
  createdAt, expiresAt,        // ISO
  status: 'pending' | 'completed',
  currentIndex,                // index 0-based du signataire courant
  signers: [
    { role, emailHash, tel, ordre, statut: 'pending'|'done', proof?: {...} }
  ]
}
```

- [ ] **Step 1 : Écrire les tests d'abord** dans `relay/test/sessions.test.js`

```js
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createSession, loadSession, recordSignature } from '../src/sessions.js';
import { getOriginalPdf, getSignedPdf } from '../src/storage.js';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4]);

async function newSession(signers) {
  return createSession(env, {
    bailRef: 'BAIL-2026-001',
    pdfBytes: PDF,
    signers
  });
}

describe('createSession', () => {
  it('crée une session pending, currentIndex 0, et stocke le PDF original', async () => {
    const { sessionId, session } = await newSession([
      { role: 'locataire', emailHash: 'h-loc', tel: '', ordre: 1 }
    ]);
    expect(sessionId).toMatch(/^[0-9a-f]{64}$/);
    expect(session.status).toBe('pending');
    expect(session.currentIndex).toBe(0);
    expect(session.signers[0].statut).toBe('pending');
    const obj = await getOriginalPdf(env, sessionId);
    expect(obj).not.toBeNull();
  });

  it('persiste la session (loadSession la relit)', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const reloaded = await loadSession(env, sessionId);
    expect(reloaded.bailRef).toBe('BAIL-2026-001');
  });
});

describe('recordSignature (machine d’état)', () => {
  it('marque le signataire courant done, capture la preuve, complète si dernier', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const signedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 7, 7]);
    const updated = await recordSignature(env, sessionId, {
      signedBytes,
      proof: { ip: '1.2.3.4', userAgent: 'UA', signedAt: '2026-06-02T10:00:00Z' }
    });
    expect(updated.signers[0].statut).toBe('done');
    expect(updated.signers[0].proof.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(updated.signers[0].proof.ip).toBe('1.2.3.4');
    expect(updated.status).toBe('completed');
    const obj = await getSignedPdf(env, sessionId);
    expect(obj).not.toBeNull();
  });

  it('avance currentIndex sans compléter quand il reste un signataire', async () => {
    const { sessionId } = await newSession([
      { role: 'bailleur', emailHash: 'hb', tel: '', ordre: 1 },
      { role: 'locataire', emailHash: 'hl', tel: '', ordre: 2 }
    ]);
    const signedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 5]);
    const updated = await recordSignature(env, sessionId, {
      signedBytes,
      proof: { ip: '1.1.1.1', userAgent: 'UA', signedAt: '2026-06-02T10:00:00Z' }
    });
    expect(updated.signers[0].statut).toBe('done');
    expect(updated.currentIndex).toBe(1);
    expect(updated.status).toBe('pending');
  });

  it('refuse une 2e signature sur une session déjà completed', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const signedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]);
    await recordSignature(env, sessionId, { signedBytes, proof: { ip: 'x', userAgent: 'y', signedAt: 'z' } });
    await expect(
      recordSignature(env, sessionId, { signedBytes, proof: { ip: 'x', userAgent: 'y', signedAt: 'z' } })
    ).rejects.toThrow(/completed/);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- sessions`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `relay/src/sessions.js`**

```js
import { randomHex, sha256hex } from './crypto-utils.js';
import {
  putMeta, getMeta, putOriginalPdf, putSignedPdf, SESSION_TTL_SECONDS
} from './storage.js';

export async function createSession(env, { bailRef, pdfBytes, signers }) {
  const sessionId = randomHex(32); // 256 bits
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const orderedSigners = [...signers]
    .sort((a, b) => a.ordre - b.ordre)
    .map((s) => ({
      role: s.role,
      emailHash: s.emailHash,
      tel: s.tel || '',
      ordre: s.ordre,
      statut: 'pending'
    }));
  const session = {
    sessionId,
    bailRef,
    provider: 'native',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: 'pending',
    currentIndex: 0,
    signers: orderedSigners
  };
  await putOriginalPdf(env, sessionId, pdfBytes);
  await putMeta(env, sessionId, session);
  return { sessionId, session };
}

export async function loadSession(env, sessionId) {
  return getMeta(env, sessionId);
}

export async function recordSignature(env, sessionId, { signedBytes, proof }) {
  const session = await getMeta(env, sessionId);
  if (!session) throw new Error('session-not-found');
  if (session.status === 'completed') throw new Error('session already completed');

  const idx = session.currentIndex;
  const signer = session.signers[idx];
  signer.statut = 'done';
  signer.proof = {
    ip: proof.ip,
    userAgent: proof.userAgent,
    signedAt: proof.signedAt,
    pdfSha256: await sha256hex(signedBytes)
  };

  // Le PDF signé écrase l'original pour le prochain signataire (signature par-dessus)
  await putSignedPdf(env, sessionId, signedBytes);
  await putOriginalPdf(env, sessionId, signedBytes);

  const isLast = idx >= session.signers.length - 1;
  if (isLast) {
    session.status = 'completed';
  } else {
    session.currentIndex = idx + 1;
  }
  await putMeta(env, sessionId, session);
  return session;
}
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- sessions`
Expected : 5 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/sessions.js relay/test/sessions.test.js
git commit -m "feat(relay): modèle session + machine d'état signataires ordonnés"
```

---

## Task 7 : Route POST /sessions (création par le bailleur)

**Files:**
- Modify: `relay/src/index.js`
- Test: `relay/test/routes.test.js` (ajouts)

Auth : header `Authorization: Bearer <APP_KEY>`. Corps : `multipart/form-data` avec `pdf` (fichier) + `meta` (JSON `{ bailRef, signers:[{role,email,tel,ordre}], ttlDays? }`). Le relais hashe chaque email (`emailHash`), crée la session, mint `ownerToken` + `signToken` du signataire courant, renvoie `{ sessionId, signUrl, ownerToken }`.

- [ ] **Step 1 : Ajouter les tests** dans `relay/test/routes.test.js`

```js
import { env } from 'cloudflare:test';
import { emailHash } from '../src/crypto-utils.js';
import { verifyToken } from '../src/tokens.js';

function pdfForm(meta) {
  const form = new FormData();
  const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3])], { type: 'application/pdf' });
  form.set('pdf', pdf, 'bail.pdf');
  form.set('meta', JSON.stringify(meta));
  return form;
}

describe('POST /sessions', () => {
  const META = { bailRef: 'BAIL-1', signers: [{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }] };

  it('rejette 401 sans APP_KEY', async () => {
    const res = await SELF.fetch('https://relay.test/sessions', { method: 'POST', body: pdfForm(META) });
    expect(res.status).toBe(401);
  });

  it('crée la session et renvoie sessionId + signUrl + ownerToken valides', async () => {
    const res = await SELF.fetch('https://relay.test/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.APP_KEY}` },
      body: pdfForm(META)
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sessionId).toMatch(/^[0-9a-f]{64}$/);
    expect(body.signUrl).toContain(`/s/${body.sessionId}`);
    const ver = await verifyToken(body.ownerToken, env.SIGNING_SECRET);
    expect(ver.valid).toBe(true);
    expect(ver.payload.role).toBe('owner');
    expect(ver.payload.sid).toBe(body.sessionId);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- routes`
Expected : FAIL (404 sur POST /sessions).

- [ ] **Step 3 : Implémenter dans `relay/src/index.js`**

Remplacer le contenu par :

```js
import { Hono } from 'hono';
import { createSession } from './sessions.js';
import { emailHash, randomHex } from './crypto-utils.js';
import { createToken } from './tokens.js';
import { SESSION_TTL_SECONDS } from './storage.js';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'bail-sign-relay' }));

function expEpoch() {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}

app.post('/sessions', async (c) => {
  const auth = c.req.header('Authorization') || '';
  if (auth !== `Bearer ${c.env.APP_KEY}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const form = await c.req.formData();
  const pdfFile = form.get('pdf');
  const metaRaw = form.get('meta');
  if (!pdfFile || !metaRaw) return c.json({ error: 'missing pdf or meta' }, 400);

  let meta;
  try { meta = JSON.parse(metaRaw); } catch { return c.json({ error: 'bad meta json' }, 400); }
  if (!Array.isArray(meta.signers) || meta.signers.length === 0) {
    return c.json({ error: 'no signers' }, 400);
  }

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const signers = [];
  for (const s of meta.signers) {
    signers.push({
      role: s.role,
      emailHash: await emailHash(s.email),
      tel: s.tel || '',
      ordre: s.ordre
    });
  }

  const { sessionId } = await createSession(c.env, { bailRef: meta.bailRef, pdfBytes, signers });
  const exp = expEpoch();
  const ownerToken = await createToken(
    { sid: sessionId, role: 'owner', jti: randomHex(8), exp },
    c.env.SIGNING_SECRET
  );
  const signUrl = new URL(`/s/${sessionId}`, c.req.url).toString();

  return c.json({ sessionId, signUrl, ownerToken }, 201);
});

export default app;
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- routes`
Expected : tous les tests routes PASS (health + POST /sessions).

- [ ] **Step 5 : Commit**

```bash
git add relay/src/index.js relay/test/routes.test.js
git commit -m "feat(relay): POST /sessions (auth APP_KEY, multipart, ownerToken)"
```

---

## Task 8 : Helper de mint du signToken courant + route GET /s/:id (placeholder)

**Files:**
- Modify: `relay/src/index.js`
- Test: `relay/test/routes.test.js` (ajouts)

`GET /s/:sessionId` sert (en Phase 2) `sign.html`. En Phase 1 : page placeholder qui **injecte le signToken** du signataire courant dans une balise `<script>` (prouve le mécanisme d'injection côté serveur, jamais via l'URL). 404 si session inconnue, 410 si déjà completed.

- [ ] **Step 1 : Ajouter les tests** dans `relay/test/routes.test.js`

```js
async function createTestSession(signers) {
  const form = new FormData();
  form.set('pdf', new Blob([new Uint8Array([0x25,0x50,0x44,0x46,1])], { type: 'application/pdf' }), 'b.pdf');
  form.set('meta', JSON.stringify({ bailRef: 'B', signers }));
  const res = await SELF.fetch('https://relay.test/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.APP_KEY}` }, body: form
  });
  return res.json();
}

describe('GET /s/:id', () => {
  it('404 si session inconnue', async () => {
    const res = await SELF.fetch('https://relay.test/s/deadbeef');
    expect(res.status).toBe(404);
  });

  it('sert une page HTML qui injecte un signToken valide du signataire courant', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    const m = html.match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    const ver = await verifyToken(m[1], env.SIGNING_SECRET);
    expect(ver.valid).toBe(true);
    expect(ver.payload.role).toBe('signer');
    expect(ver.payload.idx).toBe(0);
    expect(ver.payload.sid).toBe(sessionId);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- routes`
Expected : FAIL (404 page non servie / pas d'injection).

- [ ] **Step 3 : Implémenter dans `relay/src/index.js`**

Ajouter l'import du loader de session et la route, avant `export default app;` :

```js
// (en haut, compléter les imports)
import { createSession, loadSession } from './sessions.js';
```

```js
async function mintSignToken(env, sessionId, idx) {
  const exp = expEpoch();
  return createToken(
    { sid: sessionId, role: 'signer', idx, jti: randomHex(8), exp },
    env.SIGNING_SECRET
  );
}

app.get('/s/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = await loadSession(c.env, sessionId);
  if (!session) return c.text('Lien invalide ou expiré.', 404);
  if (session.status === 'completed') return c.text('Ce document est déjà signé.', 410);

  const signToken = await mintSignToken(c.env, sessionId, session.currentIndex);
  // Phase 2 : remplacer ce placeholder par le vrai sign.html (wizard porté).
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Signature du bail</title></head><body>
<p>Placeholder de signature (Phase 2 : wizard).</p>
<script>window.__SIGN_TOKEN__ = "${signToken}"; window.__SESSION_ID__ = "${sessionId}";</script>
</body></html>`;
  return c.html(html);
});
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- routes`
Expected : tests GET /s/:id PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/index.js relay/test/routes.test.js
git commit -m "feat(relay): GET /s/:id sert page placeholder + injecte signToken courant"
```

---

## Task 9 : Route GET /api/sessions/:id/pdf (PDF original pour le signataire)

**Files:**
- Modify: `relay/src/index.js`
- Test: `relay/test/routes.test.js` (ajouts)

Auth : header `X-Sign-Token`. Vérifie : token valide, `sid` correspond, `role==='signer'`, `idx===currentIndex`, session non completed. Renvoie le PDF original (`application/pdf`).

- [ ] **Step 1 : Ajouter les tests** dans `relay/test/routes.test.js`

```js
describe('GET /api/sessions/:id/pdf', () => {
  async function signTokenOf(sessionId) {
    const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
    const html = await res.text();
    return html.match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
  }

  it('401 sans token', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/pdf`);
    expect(res.status).toBe(401);
  });

  it('renvoie le PDF original avec un signToken valide', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const token = await signTokenOf(sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/pdf`, {
      headers: { 'X-Sign-Token': token }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x25); // %
  });

  it('401 si le token cible une session différente', async () => {
    const a = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const b = await createTestSession([{ role: 'locataire', email: 'c@d.fr', tel: '', ordre: 1 }]);
    const tokenA = await signTokenOf(a.sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${b.sessionId}/pdf`, {
      headers: { 'X-Sign-Token': tokenA }
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- routes`
Expected : FAIL (404/route absente).

- [ ] **Step 3 : Implémenter dans `relay/src/index.js`**

Ajouter l'import et un helper de garde signataire, puis la route :

```js
// compléter les imports
import { verifyToken } from './tokens.js';
import { getOriginalPdf, getSignedPdf } from './storage.js';
```

```js
async function requireSigner(c, sessionId) {
  const token = c.req.header('X-Sign-Token') || '';
  if (!token) return { error: c.json({ error: 'missing token' }, 401) };
  const ver = await verifyToken(token, c.env.SIGNING_SECRET);
  if (!ver.valid || ver.payload.role !== 'signer' || ver.payload.sid !== sessionId) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  const session = await loadSession(c.env, sessionId);
  if (!session) return { error: c.json({ error: 'not found' }, 404) };
  if (session.status === 'completed') return { error: c.json({ error: 'already completed' }, 410) };
  if (ver.payload.idx !== session.currentIndex) {
    return { error: c.json({ error: 'not your turn' }, 403) };
  }
  return { session, payload: ver.payload };
}

app.get('/api/sessions/:id/pdf', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireSigner(c, sessionId);
  if (guard.error) return guard.error;
  const obj = await getOriginalPdf(c.env, sessionId);
  if (!obj) return c.json({ error: 'pdf missing' }, 404);
  return new Response(obj.body, { headers: { 'content-type': 'application/pdf' } });
});
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- routes`
Expected : tests /pdf PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/index.js relay/test/routes.test.js
git commit -m "feat(relay): GET /api/sessions/:id/pdf (garde signToken, PDF original)"
```

---

## Task 10 : Route POST /api/sessions/:id/signed (write-back du PDF signé)

**Files:**
- Modify: `relay/src/index.js`
- Test: `relay/test/routes.test.js` (ajouts)

Auth signataire (même garde). Corps : PDF brut (`application/pdf`). Valide l'upload (`validate.js`), capture la preuve (IP via `CF-Connecting-IP`, user-agent, horodatage serveur), appelle `recordSignature`. Renvoie `{ status, currentIndex }`.

- [ ] **Step 1 : Ajouter les tests** dans `relay/test/routes.test.js`

```js
describe('POST /api/sessions/:id/signed', () => {
  async function signTokenOf(sessionId) {
    const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
    return (await res.text()).match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
  }
  const signedPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 8, 8, 8]);

  it('rejette un upload non-PDF (400)', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const token = await signTokenOf(sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST',
      headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf' },
      body: new Uint8Array([1, 2, 3, 4])
    });
    expect(res.status).toBe(400);
  });

  it('accepte le PDF signé, complète la session mono-signataire', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const token = await signTokenOf(sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST',
      headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf', 'CF-Connecting-IP': '9.9.9.9' },
      body: signedPdf
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- routes`
Expected : FAIL (route absente).

- [ ] **Step 3 : Implémenter dans `relay/src/index.js`**

Ajouter l'import et la route :

```js
// compléter les imports
import { validatePdfUpload } from './validate.js';
import { createSession, loadSession, recordSignature } from './sessions.js';
```

```js
app.post('/api/sessions/:id/signed', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireSigner(c, sessionId);
  if (guard.error) return guard.error;

  const contentType = c.req.header('content-type') || '';
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const v = validatePdfUpload(bytes, contentType);
  if (!v.ok) return c.json({ error: v.reason }, 400);

  const proof = {
    ip: c.req.header('CF-Connecting-IP') || '',
    userAgent: c.req.header('User-Agent') || '',
    signedAt: new Date().toISOString()
  };
  const session = await recordSignature(c.env, sessionId, { signedBytes: bytes, proof });
  return c.json({ status: session.status, currentIndex: session.currentIndex });
});
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- routes`
Expected : tests /signed PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/index.js relay/test/routes.test.js
git commit -m "feat(relay): POST /api/sessions/:id/signed (validation + preuve + write-back)"
```

---

## Task 11 : Routes bailleur GET /api/sessions/:id (statut) & /result (PDF signé)

**Files:**
- Modify: `relay/src/index.js`
- Test: `relay/test/routes.test.js` (ajouts)

Auth : header `X-Owner-Token` (token `role:'owner'`, `sid` correspond). `/` renvoie le statut JSON (sans le PDF) ; `/result` renvoie le PDF signé seulement si `status==='completed'`.

- [ ] **Step 1 : Ajouter les tests** dans `relay/test/routes.test.js`

```js
describe('routes bailleur (ownerToken)', () => {
  async function createWithOwner(signers) {
    const form = new FormData();
    form.set('pdf', new Blob([new Uint8Array([0x25,0x50,0x44,0x46,1])], { type: 'application/pdf' }), 'b.pdf');
    form.set('meta', JSON.stringify({ bailRef: 'B', signers }));
    const res = await SELF.fetch('https://relay.test/sessions', {
      method: 'POST', headers: { Authorization: `Bearer ${env.APP_KEY}` }, body: form
    });
    return res.json(); // { sessionId, signUrl, ownerToken }
  }
  async function signTokenOf(sessionId) {
    const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
    return (await res.text()).match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
  }

  it('GET /api/sessions/:id renvoie le statut (401 sans owner token)', async () => {
    const { sessionId } = await createWithOwner([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const no = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`);
    expect(no.status).toBe(401);
  });

  it('GET /api/sessions/:id renvoie pending puis completed', async () => {
    const { sessionId, ownerToken } = await createWithOwner([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const r1 = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, { headers: { 'X-Owner-Token': ownerToken } });
    expect((await r1.json()).status).toBe('pending');

    const token = await signTokenOf(sessionId);
    await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST', headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf' },
      body: new Uint8Array([0x25,0x50,0x44,0x46,3,3])
    });
    const r2 = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, { headers: { 'X-Owner-Token': ownerToken } });
    expect((await r2.json()).status).toBe('completed');
  });

  it('GET /result : 409 tant que pending, PDF quand completed', async () => {
    const { sessionId, ownerToken } = await createWithOwner([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const pending = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/result`, { headers: { 'X-Owner-Token': ownerToken } });
    expect(pending.status).toBe(409);

    const token = await signTokenOf(sessionId);
    await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST', headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf' },
      body: new Uint8Array([0x25,0x50,0x44,0x46,4,4])
    });
    const done = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/result`, { headers: { 'X-Owner-Token': ownerToken } });
    expect(done.status).toBe(200);
    expect(done.headers.get('content-type')).toContain('application/pdf');
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npm test -- routes`
Expected : FAIL (routes absentes).

- [ ] **Step 3 : Implémenter dans `relay/src/index.js`**

```js
async function requireOwner(c, sessionId) {
  const token = c.req.header('X-Owner-Token') || '';
  if (!token) return { error: c.json({ error: 'missing token' }, 401) };
  const ver = await verifyToken(token, c.env.SIGNING_SECRET);
  if (!ver.valid || ver.payload.role !== 'owner' || ver.payload.sid !== sessionId) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  const session = await loadSession(c.env, sessionId);
  if (!session) return { error: c.json({ error: 'not found' }, 404) };
  return { session };
}

app.get('/api/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireOwner(c, sessionId);
  if (guard.error) return guard.error;
  const s = guard.session;
  return c.json({
    sessionId: s.sessionId,
    bailRef: s.bailRef,
    status: s.status,
    currentIndex: s.currentIndex,
    expiresAt: s.expiresAt,
    signers: s.signers.map((sg) => ({
      role: sg.role, ordre: sg.ordre, statut: sg.statut,
      proof: sg.proof ? { signedAt: sg.proof.signedAt, pdfSha256: sg.proof.pdfSha256 } : null
    }))
  });
});

app.get('/api/sessions/:id/result', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireOwner(c, sessionId);
  if (guard.error) return guard.error;
  if (guard.session.status !== 'completed') return c.json({ error: 'not completed' }, 409);
  const obj = await getSignedPdf(c.env, sessionId);
  if (!obj) return c.json({ error: 'signed pdf missing' }, 404);
  return new Response(obj.body, { headers: { 'content-type': 'application/pdf' } });
});
```

- [ ] **Step 4 : Relancer le test**

Run : `npm test -- routes`
Expected : tous les tests routes PASS.

- [ ] **Step 5 : Commit**

```bash
git add relay/src/index.js relay/test/routes.test.js
git commit -m "feat(relay): routes bailleur GET statut + GET result (ownerToken)"
```

---

## Task 12 : Test d'intégration aller-retour complet (cas gestion ordonné)

**Files:**
- Test: `relay/test/routes.test.js` (ajout d'un scénario end-to-end)

Vérifie le différenciant : bailleur (signataire 1) signe → `currentIndex` avance → le `GET /s/:id` injecte alors le signToken du **locataire (signataire 2)** → locataire signe → completed → `GET /result` rend le PDF bilatéral.

- [ ] **Step 1 : Ajouter le test** dans `relay/test/routes.test.js`

```js
describe('aller-retour complet — gestion (bailleur + locataire ordonnés)', () => {
  async function currentSignToken(sessionId) {
    const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
    return (await res.text()).match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
  }
  async function postSigned(sessionId, token, marker) {
    return SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST', headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf' },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, marker])
    });
  }

  it('enchaîne les 2 signataires et produit 1 PDF final', async () => {
    const form = new FormData();
    form.set('pdf', new Blob([new Uint8Array([0x25,0x50,0x44,0x46,0])], { type: 'application/pdf' }), 'b.pdf');
    form.set('meta', JSON.stringify({ bailRef: 'BAIL-G', signers: [
      { role: 'bailleur', email: 'g@sci.fr', tel: '', ordre: 1 },
      { role: 'locataire', email: 'loc@x.fr', tel: '', ordre: 2 }
    ]}));
    const create = await SELF.fetch('https://relay.test/sessions', {
      method: 'POST', headers: { Authorization: `Bearer ${env.APP_KEY}` }, body: form
    });
    const { sessionId, ownerToken } = await create.json();

    // Signataire 1 : bailleur
    const t1 = await currentSignToken(sessionId);
    const r1 = await postSigned(sessionId, t1, 1);
    expect((await r1.json())).toMatchObject({ status: 'pending', currentIndex: 1 });

    // currentSignToken pointe maintenant le signataire 2 (locataire)
    const t2 = await currentSignToken(sessionId);
    const { verifyToken } = await import('../src/tokens.js');
    expect((await verifyToken(t2, env.SIGNING_SECRET)).payload.idx).toBe(1);

    // L'ancien token (idx 0) doit être refusé (pas son tour)
    const stale = await postSigned(sessionId, t1, 9);
    expect(stale.status).toBe(403);

    // Signataire 2 : locataire
    const r2 = await postSigned(sessionId, t2, 2);
    expect((await r2.json()).status).toBe('completed');

    const result = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/result`, { headers: { 'X-Owner-Token': ownerToken } });
    expect(result.status).toBe(200);
  });
});
```

- [ ] **Step 2 : Lancer le test**

Run : `npm test -- routes`
Expected : le scénario gestion PASS (avec toutes les routes déjà implémentées).

- [ ] **Step 3 : Lancer toute la suite**

Run : `npm test`
Expected : tous les fichiers de test PASS (tokens, crypto-utils, validate, storage, sessions, routes).

- [ ] **Step 4 : Commit**

```bash
git add relay/test/routes.test.js
git commit -m "test(relay): aller-retour end-to-end gestion (2 signataires ordonnés)"
```

---

## Task 13 : Déploiement + smoke test + lifecycle R2

**Files:** aucun fichier source (config infra + vérif manuelle).

> Nécessite Task 0 complétée (compte CF, KV, R2, secrets) et `wrangler.toml` rempli avec les vrais `id`.

- [ ] **Step 1 : Déployer**

Run (depuis `relay/`) :
```bash
npx wrangler deploy
```
Expected : URL publiée `https://bail-sign-relay.<sous-domaine>.workers.dev`.

- [ ] **Step 2 : Smoke test santé**

Run :
```bash
curl https://bail-sign-relay.<sous-domaine>.workers.dev/health
```
Expected : `{"ok":true,"service":"bail-sign-relay"}`.

- [ ] **Step 3 : Smoke test création de session** (remplacer `<APP_KEY>` par le secret défini)

Run :
```bash
printf '%%PDF-1.4 test' > /tmp/bail.pdf
curl -X POST https://bail-sign-relay.<sous-domaine>.workers.dev/sessions \
  -H "Authorization: Bearer <APP_KEY>" \
  -F "pdf=@/tmp/bail.pdf;type=application/pdf" \
  -F 'meta={"bailRef":"SMOKE-1","signers":[{"role":"locataire","email":"a@b.fr","tel":"","ordre":1}]}'
```
Expected : JSON `{ "sessionId": "...", "signUrl": "...", "ownerToken": "..." }`.

- [ ] **Step 4 : Configurer la règle de rétention R2** (dashboard Cloudflare)

Manuel : Cloudflare Dashboard → R2 → bucket `bail-sign-pdfs` → **Object lifecycle rules** → ajouter une règle « Delete objects 15 days after creation » (préfixes `original/` et `signed/`). Le KV expire seul via `expirationTtl` (14 j) ; R2 ferme la boucle côté blobs.

- [ ] **Step 5 : Noter l'URL déployée dans le spec**

Ajouter dans `docs/subjects/BAIL-SIGNATURE-DISTANCE.md` (§3 ou journal) l'URL `workers.dev` obtenue, pour que les plans sign.html + intégration la consomment.

- [ ] **Step 6 : Commit**

```bash
git add docs/subjects/BAIL-SIGNATURE-DISTANCE.md
git commit -m "docs(relay): URL workers.dev déployée + rétention R2"
```

---

## Task 14 : Audit sécurité par agent code-reviewer (OBLIGATOIRE avant de déclarer prêt)

> Règle non-négociable du projet : tout livrable sensible passe par l'agent `superpowers:code-reviewer` avant de dire à l'utilisateur que c'est prêt. Le relais manipule des données perso (PDF de bail) et des jetons d'accès → sensible.

- [ ] **Step 1 : Lancer l'agent code-reviewer** sur l'ensemble de `relay/` avec ce focus :
  - Robustesse des jetons HMAC (comparaison temps-constant via `crypto.subtle.verify`, pas de fuite via messages d'erreur, `exp` bien vérifié).
  - Anti-rejeu et contrôle « c'est ton tour » (`idx === currentIndex`) — un signataire ne peut pas signer hors de son tour ni rejouer.
  - Limite connue `APP_KEY` côté client : confirmer que le blast radius est borné et documenter le durcissement OAuth (Phase 4).
  - Validation de l'upload PDF (taille avant lecture complète ? magic bytes ? pas de XXE/parse côté serveur).
  - Pas de PII en clair dans les logs ; emails hashés ; rétention KV/R2 effective.
  - CORS : le relais sert sign.html en same-origin ; vérifier qu'aucune route API n'ouvre `*` avec credentials.
  - Gestion des erreurs : codes HTTP cohérents, pas de stack trace renvoyée au client.

- [ ] **Step 2 : Traiter les findings** (corriger inline, re-tester `npm test`, re-commit). Ne pas déclarer le relais « prêt » tant que l'agent n'a pas validé.

- [ ] **Step 3 : Mettre à jour le RGPD** : ajouter le relais comme sous-traitant dans `docs/legal/RGPD-REGISTRE.md` (données : PDF de bail = noms/adresses ; finalité : signature ; durée : 14-15 j ; localisation : Cloudflare). Commit `docs(rgpd): relais signature comme sous-traitant`.

---

## Résultat de l'audit (Task 14 — effectué le 2026-06-02)

Agent `superpowers:code-reviewer` lancé deux fois sur l'ensemble de `relay/`.

**1er passage — CHANGES REQUESTED** (aucun bloquant). Contrat de base conforme (6 routes, modèle de session §3, machine d'état ordonnée testée E2E, capture de preuve correcte). 3 findings importants :
- **I-1 — `GET /s/:id` ne vérifie pas l'email à l'ouverture** (anti-transfert §6 sans point d'application dans le relais). → **DÉCISION : reporté Phase 2.** Contrôle V1 = `sessionId` 256 bits non devinable, livré uniquement à l'email cible (facteur « accès à l'email » au niveau eIDAS *simple*, qui n'emporte de toute façon aucune présomption légale). La vraie vérification (OTP email / clic de confirmation) exige une infra d'envoi d'email → Phase 2 (sign.html + endpoint `verify`), avec l'OTP SMS déjà reporté. **Pas de champ `proof.emailConfirmed` spéculatif** (YAGNI : enregistrer un booléen jamais appliqué serait pire que rien). Validé par le 2e passage de l'audit.
- **I-2 — `POST /sessions` ne validait pas les champs par signataire** (email manquant → `emailHash("undefined")` ; `ordre` manquant/dupliqué → tri NaN corrompant silencieusement l'ordre). → **CORRIGÉ** : `validateSigners()` dans `validate.js` (array non vide ; `email` string non vide ; `role` string non vide ; `ordre` entier via `Number.isInteger` ; pas de doublon d'`ordre`), appelé avant `emailHash`/tri, renvoie 400.
- **I-3 — comparaison `APP_KEY` non temps-constant.** → **CORRIGÉ** : `timingSafeEqualStr()` dans `crypto-utils.js` (XOR-accumulation, le early-return sur longueur ne fuite que la longueur d'un secret opérateur fixe — acceptable).

Mineurs notés (non bloquants) : **M-2 / Phase 2** — le placeholder HTML de `GET /s/:id` (index.js ~l.85-89) interpole `signToken`/`sessionId` (charsets hex/JWT sûrs aujourd'hui, donc pas de XSS vivant) ; **quand le vrai `sign.html` ajoutera des champs dynamiques, ce point d'injection devra être échappé/protégé par CSP** → à mettre sur la checklist sécurité Phase 2. `jti` décoratif (anti-rejeu déjà couvert par les gardes `idx`/`status`) — laissé tel quel (crochet de révocation futur).

**2e passage — APPROVED** : I-2 résolu (vecteur de corruption fermé, aucune entrée malformée n'atteint `emailHash`/tri), I-3 résolu (protège le secret octet par octet), report I-1 défendable, **aucune régression**. Tests : 46/46 verts (+10 : 6 `validateSigners`, 1 `timingSafeEqualStr`, 3 routes — 400 signataire / 410 session complétée / 401 sans token).

### Notes toolchain Windows (à reporter dans les plans aval)
- `wrangler.toml` : `compatibility_flags = ["nodejs_compat"]` requis par `@cloudflare/vitest-pool-workers` (et utile en prod de toute façon).
- `vitest.config.js` : `singleWorker: true` + `isolatedStorage: false` — contourne les bugs miniflare Windows (verrou EBUSY sur les `.sqlite` + crash workerd `kj/table.c++` sur lignes dupliquées). Les tests utilisent des `sid` distincts → stockage partagé sans interférence.
- À la fin des tests : `EBUSY unlink ...sqlite` / `close timed out` = artefact **cosmétique** Windows de teardown **après** que tout est vert. Juger sur la ligne « Tests N passed ».

---

## Self-Review (effectué)

**Couverture spec (§ du spec → tâche) :**
- §3 session model → Task 6 ✓
- §3 routes (6 routes) → Tasks 7 (POST /sessions), 8 (GET /s/:id), 9 (GET /pdf), 10 (POST /signed), 11 (GET statut + GET result) ✓
- §3 R2/KV + TTL + lifecycle → Tasks 5 (TTL KV) + 13 (lifecycle R2) ✓
- §3 tokens HMAC, temps-constant, anti-rejeu → Tasks 3 (HMAC) + 9/10 (garde idx/currentIndex) + 14 (audit) ✓
- §3 validation write-back → Task 4 ✓
- §3 signataires ordonnés / cas gestion → Tasks 6 + 12 ✓
- §5 dossier de preuve (hash SHA-256, IP/UA, horodatage) → Tasks 6 (proof model) + 10 (capture IP/UA/timestamp) ✓ — *partiel : le « certificat de preuve PDF scellé » complet et le consentement explicite relèvent de sign.html (plan 2) ; ici on capture et stocke les éléments côté relais.*
- §6 sécurité/RGPD → Tasks 3/9/10 (tokens, gardes) + 14 (audit + RGPD) ✓
- §6 chiffrement au repos → R2 SSE par défaut (aucune tâche de code, noté Task 5/13) ✓
- §7 crochet eIDAS qualifié → **hors scope de ce plan** (Phase 4, plan ultérieur) — champ `provider:'native'` posé dans le modèle (Task 6) pour préparer le branchement ✓

**Placeholder scan :** aucun « TODO/TBD ». Le placeholder HTML de `GET /s/:id` (Task 8) est intentionnel et explicitement remplacé en plan 2 (sign.html).

**Cohérence des types/signatures :** `createSession`/`loadSession`/`recordSignature` (sessions.js) — signatures identiques entre Task 6 (définition) et Tasks 7-11 (usage). `verifyToken` retourne `{valid, payload, reason}` — usage cohérent. `getOriginalPdf/getSignedPdf/putMeta/getMeta` — signatures identiques Task 5 ↔ usages. Helpers `requireSigner`/`requireOwner` retournent `{error}` | `{session,payload}` — usage cohérent. `validatePdfUpload(bytes, contentType)` → `{ok, reason}` cohérent.

---

## Execution Handoff

**Plan complet et enregistré dans `docs/superpowers/plans/2026-06-02-bail-signature-relais.md`. Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — je dispatche un sous-agent neuf par tâche, je relis entre chaque, itération rapide.

**2. Inline Execution** — j'exécute les tâches dans cette session via executing-plans, par lots avec points de contrôle.

**Laquelle ?**

> Note : Task 0 (compte Cloudflare) est une action utilisateur. Les Tasks 1-12 et 14 sont entièrement développables/testables **en local** (miniflare via vitest-pool-workers) sans le compte Cloudflare. Seule Task 13 (déploiement réel + smoke test + lifecycle) requiert Task 0.
