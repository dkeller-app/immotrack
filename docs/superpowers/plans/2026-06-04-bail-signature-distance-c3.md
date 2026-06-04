# BAIL-SIGNATURE-DISTANCE Composant 3 (intégration in-app) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un bailleur ImmoTrack d'envoyer un bail en signature électronique à distance, avec aller-retour automatique (création session relais, emails chaînés, polling de retour, download PDF signé + certificat de preuve, archivage derrière une couture isolée, verrouillage du bail).

**Architecture:** Le PDF natif est généré par `genPDFNative`, du JS **sérialisé en string** injecté dans une popup. On l'**instrumente** pour capturer au dessin les rectangles (mm) des signataires à distance, on les convertit mm→points via un **module pur testé** (`coords`), on embarque un **manifeste** dans le PDF via **pdf-lib** (`manifest`), on POST au relais Cloudflare (Hono), on **poll** le retour (boot + ouverture fiche, throttle 30 s), on chaîne les emails, et à la complétion on archive via la **couture unique** `_ingestSignedBailArtifacts` (Drive aujourd'hui / Supabase demain, D12) puis on purge le relais (`DELETE`). Le flux présentiel existant reste intact.

**Tech Stack:** Vanilla JS (monolithe `index.html` v15.250), jsPDF (mm), pdf-lib (à vendorer), Vitest (modules purs `__tests__/helpers/*.js` mirrorés en `js/helpers/*.global.js`), Cloudflare Worker Hono + KV (relais, branche séparée), Gmail API (envoi emails).

**Spec source :** `docs/superpowers/specs/2026-06-03-bail-signature-distance-c3-integration-design.md` (mise à jour 2026-06-04 : couture d'archivage + D12).
**Stratégie persistance :** `docs/superpowers/specs/2026-06-04-strategie-persistance-multitenant-design.md` (D6 Supabase Storage, D12 relais éphémère).

---

## Vue d'ensemble — fichiers & responsabilités

**Worktree relais** `C:\Users\Did_K\Desktop\Immo-relay-bailsign` (branche `relay-bail-sign`) :
- `relay/src/index.js` — routeur Hono. **Ajouter** : middleware CORS + route `DELETE /api/sessions/:id`.
- `relay/src/storage.js` — accès KV. **Ajouter** : helper `deleteSession(env, sid)`.
- `relay/test/cors.test.js`, `relay/test/delete-session.test.js` — **créer**.

**Worktree app** `C:\Users\Did_K\Desktop\Immo-bail-sign-c3` (branche `bail-sign-c3`) :
- `__tests__/helpers/bail-sign-coords.js` (+ `.test.js`) — **créer** : conversion mm→pt + Y-flip (copie testée du relais). Risque #1.
- `__tests__/helpers/bail-sign-manifest.js` (+ `.test.js`) — **créer** : encode/decode + embed/read manifeste pdf-lib (copie testée du relais).
- `tools/sync-helpers-global-mirrors.mjs` — **modifier** : ajouter les 2 modules au tableau `PAIRS`.
- `js/helpers/bail-sign-coords.global.js`, `js/helpers/bail-sign-manifest.global.js` — **générés** (ne pas éditer à la main).
- `package.json` — **modifier** : ajouter `pdf-lib` en devDependency.
- `index.html` — **modifier** (sandbox-first via `index-test.html` d'abord) :
  - ligne 8 `window._BAIL_PDF_LIBS` : vendorer pdf-lib (base64) pour la prod.
  - lignes ~3700-3706 : `<script src>` des 2 mirrors.
  - popup `previewBailData` (17888-19873) : instrumentation capture ancres (3 rects) + mode `remoteSign` + handoff opener.
  - opener : `_buildSignManifest`, `_embedSignManifest`, `_relayCreateSession`, `_relayPollSession`, `_relayDeleteSession`, `_pollRemoteSignSessions`, `_onRemoteBailReady`, `_ingestSignedBailArtifacts`, `_buildBailCertificatePdf`, `_sendBailSignEmail`, `_renderRemoteSignBadge`, modale d'envoi, champs Réglages, scope gmail.send incrémental, hook boot polling.
- `sw.js` ligne 17 + 4 lignes version dans `index.html` : bump version (Phase 6).
- `mockups/bail-signature-distance-c3/c3-envoi-signature.html` — **référence canonique** (variante B) pour la modale et les badges. NE PAS deviner l'UI : la reproduire fidèlement.

---

## Conventions (toutes tâches)

- **TDD** : test rouge → implémentation minimale → vert → commit. Un commit par tâche au moins.
- **Sandbox-first** : toute modif `index.html` se fait **d'abord dans `index-test.html`**, sync `index.html` **après OK utilisateur explicite**. Exception captée : `index-test.html` n'a pas Drive → l'aller-retour réel se teste en prod.
- **Stage par fichier nommé** (jamais `git add -A`/`.`).
- **Ne jamais confondre signature et paraphe** (`kind:'signature'` vs `kind:'paraphe'`).
- **Jamais de secret en URL/log.** APP_KEY saisie UI (repo public).
- Tests app : `npm run test:run` (Vitest, env node, `import { describe, it, expect } from 'vitest'`, imports relatifs `.js`).
- Tests relais : `npm test` dans `relay/` (`@cloudflare/vitest-pool-workers`, `relay/test/**/*.test.js`).
- **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant tout commit final touchant le PDF/bail légal (Phase 6). Mes audits propres ne suffisent jamais.

---

## Phase 0 — Relais (branche `relay-bail-sign`, worktree `Immo-relay-bailsign`)

> Phase **indépendante** et préalable au câblage des appels app→relais. Doit être déployée avant la Phase 4. Vit sur sa propre branche + redéploiement Worker.

### Task R1 : CORS sur le Worker

**Files:**
- Modify: `relay/src/index.js` (juste après `const app = new Hono();`)
- Test: `relay/test/cors.test.js` (créer)

- [ ] **Step 1: Écrire le test rouge**

```js
// relay/test/cors.test.js
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index.js';

const ALLOWED = 'https://didierkeller.github.io';

describe('CORS', () => {
  it('répond au preflight OPTIONS avec les bons en-têtes', async () => {
    const res = await app.request('/api/sessions/abc', {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED,
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers': 'X-Owner-Token'
      }
    }, env);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
    const allowH = (res.headers.get('Access-Control-Allow-Headers') || '').toLowerCase();
    expect(allowH).toContain('x-owner-token');
    expect(allowH).toContain('authorization');
  });

  it('ajoute Allow-Origin sur une requête réelle d’origine autorisée', async () => {
    const res = await app.request('/health', { headers: { Origin: ALLOWED } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
  });

  it('reflète localhost et null (file://)', async () => {
    for (const o of ['http://localhost:5500', 'null']) {
      const res = await app.request('/health', { headers: { Origin: o } }, env);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(o);
    }
  });
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `cd relay && npx vitest run test/cors.test.js`
Expected: FAIL (`Access-Control-Allow-Origin` is null).

- [ ] **Step 3: Implémentation minimale**

Dans `relay/src/index.js`, ajouter l'import en tête (à côté de `import { Hono } from 'hono';`) :

```js
import { cors } from 'hono/cors';
```

Juste après `const app = new Hono();` :

```js
// CORS — l'app ImmoTrack appelle le relais en cross-origin avec en-têtes custom.
const ALLOWED_ORIGINS = ['https://didierkeller.github.io', 'null'];
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return undefined;
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;   // dev local
    return undefined; // origine non autorisée → pas d'en-tête
  },
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'X-Owner-Token', 'X-Sign-Token', 'X-Sign-Proof', 'Content-Type'],
  maxAge: 86400
}));
```

- [ ] **Step 4: Lancer le test → vert**

Run: `cd relay && npx vitest run test/cors.test.js`
Expected: PASS. Puis `npx vitest run` (toute la suite relais) → 0 régression.

- [ ] **Step 5: Commit**

```bash
git add relay/src/index.js relay/test/cors.test.js
git commit -m "feat(relais): CORS pour appels cross-origin app→relais"
```

### Task R2 : `DELETE /api/sessions/:id` + helper `deleteSession` (D12 purge)

**Files:**
- Modify: `relay/src/storage.js` (ajouter `deleteSession`)
- Modify: `relay/src/index.js` (ajouter la route, réutilise `requireOwner`)
- Test: `relay/test/delete-session.test.js` (créer)

- [ ] **Step 1: Écrire le test rouge**

```js
// relay/test/delete-session.test.js
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index.js';

// Helper : crée une session via POST /sessions et renvoie { sessionId, ownerToken }.
async function createSession() {
  const fd = new FormData();
  fd.set('pdf', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }), 'b.pdf');
  fd.set('meta', JSON.stringify({ bailRef: 'L1-2026', signers: [{ role: 'locataire', nom: 'X', email: 'x@y.fr', ordre: 1 }] }));
  const res = await app.request('/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.APP_KEY}` }, body: fd
  }, env);
  return res.json();
}

describe('DELETE /api/sessions/:id', () => {
  it('purge la session avec un X-Owner-Token valide → 204, puis GET → 404', async () => {
    const { sessionId, ownerToken } = await createSession();
    const del = await app.request(`/api/sessions/${sessionId}`, {
      method: 'DELETE', headers: { 'X-Owner-Token': ownerToken }
    }, env);
    expect(del.status).toBe(204);
    const after = await app.request(`/api/sessions/${sessionId}`, {
      method: 'GET', headers: { 'X-Owner-Token': ownerToken }
    }, env);
    expect(after.status).toBe(404);
  });

  it('refuse sans token → 401', async () => {
    const { sessionId } = await createSession();
    const del = await app.request(`/api/sessions/${sessionId}`, { method: 'DELETE' }, env);
    expect(del.status).toBe(401);
  });

  it('idempotent : DELETE d’une session déjà absente → 204', async () => {
    const { ownerToken } = await createSession(); // token valide mais id inconnu impossible (sid lié) :
    // on teste plutôt le re-DELETE
    const { sessionId, ownerToken: tok } = await createSession();
    await app.request(`/api/sessions/${sessionId}`, { method: 'DELETE', headers: { 'X-Owner-Token': tok } }, env);
    const again = await app.request(`/api/sessions/${sessionId}`, { method: 'DELETE', headers: { 'X-Owner-Token': tok } }, env);
    expect([204, 404]).toContain(again.status);
  });
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `cd relay && npx vitest run test/delete-session.test.js`
Expected: FAIL (route inexistante → 404 sur le DELETE, ou 204 jamais atteint).

- [ ] **Step 3: Implémentation — storage helper**

Dans `relay/src/storage.js`, à côté des helpers existants (`putMeta`/`getMeta`/`putSignedPdf`…), ajouter (les fonctions `metaKey`/`originalKey`/`signedKey` existent déjà) :

```js
// Purge complète d'une session (D12 : relais éphémère). 3 clés KV partagent le namespace.
export async function deleteSession(env, sid) {
  await Promise.all([
    env.SESSIONS_KV.delete(metaKey(sid)),
    env.SESSIONS_KV.delete(originalKey(sid)),
    env.SESSIONS_KV.delete(signedKey(sid))
  ]);
}
```

- [ ] **Step 4: Implémentation — route Hono**

Dans `relay/src/index.js`, ajouter l'import de `deleteSession` à la ligne d'import de `storage.js`, puis ajouter la route à côté de `app.get('/api/sessions/:id', ...)` :

```js
app.delete('/api/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireOwner(c, sessionId);   // 401 si token absent/invalide, 404 si déjà absente
  if (guard.error) return guard.error;
  await deleteSession(c.env, sessionId);
  return c.body(null, 204);
});
```

- [ ] **Step 5: Lancer le test → vert**

Run: `cd relay && npx vitest run test/delete-session.test.js`
Expected: PASS. Puis `npx vitest run` complet → 0 régression.

- [ ] **Step 6: Commit**

```bash
git add relay/src/storage.js relay/src/index.js relay/test/delete-session.test.js
git commit -m "feat(relais): DELETE /api/sessions/:id (purge KV post-ingestion, D12)"
```

### Task R3 : Déploiement du Worker (ACTION UTILISATEUR)

**Files:** aucun (commande).

- [ ] **Step 1: Déployer**

Run (worktree relais) : `cd relay && npm run deploy`
Expected: `wrangler deploy` réussit, URL `https://bail-sign-relay.didierkeller.workers.dev` mise à jour.

- [ ] **Step 2: Vérifier CORS en prod**

```bash
curl -i -X OPTIONS https://bail-sign-relay.didierkeller.workers.dev/api/sessions/x \
  -H "Origin: https://didierkeller.github.io" \
  -H "Access-Control-Request-Method: DELETE" \
  -H "Access-Control-Request-Headers: X-Owner-Token"
```
Expected: en-têtes `Access-Control-Allow-Origin: https://didierkeller.github.io` + `Access-Control-Allow-Headers` contenant `X-Owner-Token`.

> **Note plan :** R3 bloque le test réel de la Phase 4 mais PAS le développement des Phases 1-3 (modules purs + instrumentation + émission, testables hors-ligne). Séquencer R1→R2→R3 tôt, en parallèle des Phases 1-2.

---

## Phase 1 — Modules purs (app, branche `bail-sign-c3`) — TDD

### Task 1 : pdf-lib en devDependency + vendoring prod

**Files:**
- Modify: `package.json`
- Modify: `index.html` (ligne 8, objet `window._BAIL_PDF_LIBS`)

- [ ] **Step 1: Ajouter pdf-lib en devDependency**

Run: `npm install --save-dev pdf-lib@^1.17.1`
Expected: `pdf-lib` ajouté à `devDependencies` de `package.json`, présent dans `node_modules`.

- [ ] **Step 2: Vérifier l'import en test**

Créer un test jetable `__tests__/helpers/_pdflib-smoke.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
describe('pdf-lib dispo en test', () => {
  it('crée et sauvegarde un PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    expect(bytes.length).toBeGreaterThan(100);
  });
});
```

Run: `npx vitest run __tests__/helpers/_pdflib-smoke.test.js`
Expected: PASS. Puis **supprimer** ce fichier jetable (`git rm`/del) et le mentionner dans le commit.

- [ ] **Step 3: Vendoring prod (base64) dans `window._BAIL_PDF_LIBS`**

> La prod n'utilise pas npm : les libs sont base64-inlinées dans `window._BAIL_PDF_LIBS` (index.html ligne 8) et décodées en Blob URL. Ajouter une clé `pdfLib`.

Sous-étape 3a — générer le base64 du build navigateur de pdf-lib (UMD minifié) :

```bash
node -e "const fs=require('fs');const b=fs.readFileSync('node_modules/pdf-lib/dist/pdf-lib.min.js');fs.writeFileSync('tools/_pdflib.b64.txt', b.toString('base64'));console.log('len',b.length)"
```

Sous-étape 3b — insérer la clé dans l'objet `window._BAIL_PDF_LIBS` (index.html ligne 8), au même format que les clés existantes (`jspdf`, `html2canvas`…) : `pdfLib: "<contenu de tools/_pdflib.b64.txt>"`. Puis supprimer `tools/_pdflib.b64.txt`.

> **Décodage prod** : la Phase 3 (Task 8) chargera pdf-lib via le helper existant `_b64ToBlobUrl` (index.html ~19828) en injectant `<script src="blob:…">`, exposant `window.PDFLib` (global UMD de pdf-lib). Vérifier le nom du global réellement exposé par le build (`PDFLib`).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json index.html
git commit -m "build: ajoute pdf-lib (devDep tests + vendoring base64 prod)"
```

### Task 2 : Module `coords` (mm→pt + Y-flip) — risque technique #1

**Files:**
- Create: `__tests__/helpers/bail-sign-coords.js`
- Test: `__tests__/helpers/bail-sign-coords.test.js`

- [ ] **Step 1: Écrire le test rouge** (cas de référence repris du relais, validés e2e)

```js
// __tests__/helpers/bail-sign-coords.test.js
import { describe, it, expect } from 'vitest';
import { mmToPt, rectFromJsPdf, fallbackAnchors, PDF_NATIVE } from './bail-sign-coords.js';

const A4_H_PT = 841.8897637795275; // 297 mm en points

describe('mmToPt', () => {
  it('25.4 mm = 72 pt', () => { expect(mmToPt(25.4)).toBeCloseTo(72, 6); });
  it('0 mm = 0 pt', () => { expect(mmToPt(0)).toBe(0); });
});

describe('rectFromJsPdf (Y-flip)', () => {
  it('convertit et inverse Y', () => {
    const r = rectFromJsPdf({ x: 10, y: 20, w: 30, h: 40 }, A4_H_PT);
    expect(r.x).toBeCloseTo(mmToPt(10), 6);
    expect(r.width).toBeCloseTo(mmToPt(30), 6);
    expect(r.height).toBeCloseTo(mmToPt(40), 6);
    expect(r.y).toBeCloseTo(A4_H_PT - mmToPt(60), 6); // y+h = 60
  });
  it('cas signature référence {x:15,y:210,w:90,h:30}', () => {
    const r = rectFromJsPdf({ x: 15, y: 210, w: 90, h: 30 }, A4_H_PT);
    expect(r.x).toBeCloseTo(mmToPt(15), 6);
    expect(r.y).toBeCloseTo(A4_H_PT - mmToPt(240), 6);
  });
  it('cas paraphe référence {x:15,y:279.5,w:70,h:14}', () => {
    const r = rectFromJsPdf({ x: 15, y: 279.5, w: 70, h: 14 }, A4_H_PT);
    expect(r.y).toBeCloseTo(A4_H_PT - mmToPt(293.5), 6);
  });
});

describe('fallbackAnchors', () => {
  it('locataire : colonne droite x=125, signature sur dernière page', () => {
    const a = fallbackAnchors({ sigId: 'loc-0', side: 'locataire', totalPages: 3 });
    const paraphes = a.filter(x => x.kind === 'paraphe');
    const sig = a.find(x => x.kind === 'signature');
    expect(paraphes).toHaveLength(3);
    expect(paraphes[0].x).toBe(125);
    expect(sig.page).toBe(3);
    expect(a.every(x => x.sigId === 'loc-0')).toBe(true);
  });
  it('bailleur : colonne gauche x=15', () => {
    const a = fallbackAnchors({ sigId: 'bailleur-0', side: 'bailleur', totalPages: 1 });
    expect(a.find(x => x.kind === 'paraphe').x).toBe(15);
  });
});
```

- [ ] **Step 2: Lancer → échec**

Run: `npx vitest run __tests__/helpers/bail-sign-coords.test.js`
Expected: FAIL (`bail-sign-coords.js` introuvable).

- [ ] **Step 3: Implémentation** (copie verbatim du module relais déjà testé `relay/public/sign/coords.js`)

```js
// __tests__/helpers/bail-sign-coords.js
// Conversion repère jsPDF(mm, haut-gauche) → pdf-lib(pt, bas-gauche) + ancres de repli.
// PUR : aucune dépendance pdf-lib, aucun window. Copie alignée sur relay/public/sign/coords.js.
export const PDF_NATIVE = {
  MARGIN_LEFT: 15, MARGIN_RIGHT: 15, MARGIN_TOP: 15, MARGIN_BOTTOM: 25,
  PAGE_W: 210, PAGE_H: 297,
  FOOT_Y: 297 - 25 + 5,        // 277 : ligne du label
  PARAPHE_RECT_DY: 2.5,        // sous-cadres à FOOT_Y + 2.5 = 279.5
  COL_W: 70, COL_H: 14
};

const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm) {
  return mm * PT_PER_MM;
}

export function rectFromJsPdf({ x, y, w, h }, pageHeightPt) {
  return {
    x: mmToPt(x),
    y: pageHeightPt - mmToPt(y + h),
    width: mmToPt(w),
    height: mmToPt(h)
  };
}

export function fallbackAnchors({ sigId, side, totalPages }) {
  const colX = side === 'locataire'
    ? PDF_NATIVE.PAGE_W - PDF_NATIVE.MARGIN_RIGHT - PDF_NATIVE.COL_W // 125
    : PDF_NATIVE.MARGIN_LEFT;                                        // 15
  const parapheY = PDF_NATIVE.FOOT_Y + PDF_NATIVE.PARAPHE_RECT_DY;   // 279.5
  const anchors = [];
  for (let p = 1; p <= totalPages; p++) {
    anchors.push({ sigId, kind: 'paraphe', page: p, x: colX, y: parapheY, w: PDF_NATIVE.COL_W, h: PDF_NATIVE.COL_H });
  }
  anchors.push({ sigId, kind: 'signature', page: totalPages, x: colX, y: 235, w: 90, h: 30, luApprouve: true });
  return anchors;
}
```

- [ ] **Step 4: Lancer → vert**

Run: `npx vitest run __tests__/helpers/bail-sign-coords.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/helpers/bail-sign-coords.js __tests__/helpers/bail-sign-coords.test.js
git commit -m "feat: module pur coords (mm→pt + Y-flip) pour signature distance — risque #1"
```

### Task 3 : Module `manifest` (embarquage pdf-lib) — round-trip testé

**Files:**
- Create: `__tests__/helpers/bail-sign-manifest.js`
- Test: `__tests__/helpers/bail-sign-manifest.test.js`

- [ ] **Step 1: Écrire le test rouge** (round-trip + persistance octets via pdf-lib réel)

```js
// __tests__/helpers/bail-sign-manifest.test.js
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { encode, decode, readFromDoc, embedInDoc, SENTINEL } from './bail-sign-manifest.js';

const sample = { v: 1, totalPages: 2, anchors: [
  { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30, luApprouve: true },
  { sigId: 'loc-0', kind: 'paraphe',   page: 1, x: 125, y: 279.5, w: 70, h: 14 }
] };

describe('encode/decode', () => {
  it('round-trip', () => {
    expect(encode(sample).startsWith(SENTINEL)).toBe(true);
    expect(decode(encode(sample))).toEqual(sample);
  });
  it('UTF-8', () => {
    const m = { v: 1, totalPages: 1, anchors: [], note: 'éàü' };
    expect(decode(encode(m))).toEqual(m);
  });
  it('decode défensif → null', () => {
    for (const bad of ['hello world', SENTINEL + '!!!pas-base64', '', undefined]) {
      expect(decode(bad)).toBeNull();
    }
  });
});

describe('embedInDoc/readFromDoc (persistance octets)', () => {
  it('survit à un save/load pdf-lib', async () => {
    const doc = await PDFDocument.create();
    doc.addPage(); doc.addPage();
    embedInDoc(doc, sample);
    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(readFromDoc(reloaded)).toEqual(sample);
  });
  it('null si pas de manifeste', async () => {
    const doc = await PDFDocument.create(); doc.addPage();
    const bytes = await doc.save();
    expect(readFromDoc(await PDFDocument.load(bytes))).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer → échec**

Run: `npx vitest run __tests__/helpers/bail-sign-manifest.test.js`
Expected: FAIL (`bail-sign-manifest.js` introuvable).

- [ ] **Step 3: Implémentation** (copie verbatim de `relay/public/sign/manifest.js`)

```js
// __tests__/helpers/bail-sign-manifest.js
// Manifeste d'ancres de signature. encode/decode PUR. readFromDoc/embedInDoc reçoivent
// un PDFDocument pdf-lib en paramètre (aucun import pdf-lib ici → testable + portable).
export const SENTINEL = 'ITSIGNv1:';

function toB64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encode(manifest) {
  return SENTINEL + toB64url(JSON.stringify(manifest));
}

export function decode(str) {
  if (typeof str !== 'string' || !str.startsWith(SENTINEL)) return null;
  try {
    return JSON.parse(fromB64url(str.slice(SENTINEL.length)));
  } catch {
    return null;
  }
}

export function readFromDoc(pdfDoc) {
  return decode(pdfDoc.getKeywords());
}

export function embedInDoc(pdfDoc, manifest) {
  pdfDoc.setKeywords([encode(manifest)]);
}
```

- [ ] **Step 4: Lancer → vert**

Run: `npx vitest run __tests__/helpers/bail-sign-manifest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/helpers/bail-sign-manifest.js __tests__/helpers/bail-sign-manifest.test.js
git commit -m "feat: module pur manifest (embed/read pdf-lib) aligné sign.html"
```

### Task 4 : Mirrors globaux + `<script src>` dans index.html

**Files:**
- Modify: `tools/sync-helpers-global-mirrors.mjs` (tableau `PAIRS`)
- Generate: `js/helpers/bail-sign-coords.global.js`, `js/helpers/bail-sign-manifest.global.js`
- Modify: `index.html` (~3700-3706) et `index-test.html` (sandbox-first)

- [ ] **Step 1: Ajouter les 2 entrées au tableau `PAIRS`**

Dans `tools/sync-helpers-global-mirrors.mjs`, ajouter au tableau `PAIRS` (en respectant le format des entrées existantes — `src`, `globalName`, `exports`) :

```js
  { src: 'bail-sign-coords',   globalName: 'BailSignCoords',   exports: ['PDF_NATIVE', 'mmToPt', 'rectFromJsPdf', 'fallbackAnchors'] },
  { src: 'bail-sign-manifest', globalName: 'BailSignManifest', exports: ['SENTINEL', 'encode', 'decode', 'readFromDoc', 'embedInDoc'] },
```

- [ ] **Step 2: Générer les mirrors**

Run: `node tools/sync-helpers-global-mirrors.mjs`
Expected: `js/helpers/bail-sign-coords.global.js` et `js/helpers/bail-sign-manifest.global.js` créés (bannière "NE PAS ÉDITER À LA MAIN", IIFE exposant `window.BailSignCoords` / `window.BailSignManifest`).

- [ ] **Step 3: Ajouter les `<script src>` (index-test.html d'abord)**

Dans `index-test.html`, après la dernière ligne `<script src="js/helpers/*.global.js">` (~3706), ajouter :

```html
<script src="js/helpers/bail-sign-coords.global.js"></script>
<script src="js/helpers/bail-sign-manifest.global.js"></script>
```

- [ ] **Step 4: Vérifier le chargement**

Ouvrir `index-test.html`, console : `BailSignCoords.mmToPt(25.4)` → ~72 ; `BailSignManifest.SENTINEL` → `'ITSIGNv1:'`.

- [ ] **Step 5: Commit** (sync prod `index.html` reportée en Phase 6 après OK user, sauf les mirrors générés qui sont neutres)

```bash
git add tools/sync-helpers-global-mirrors.mjs js/helpers/bail-sign-coords.global.js js/helpers/bail-sign-manifest.global.js index-test.html
git commit -m "build: mirrors globaux coords+manifest + chargement sandbox"
```

---

## Phase 2 — Instrumentation : capture des ancres au dessin (popup)

> Le générateur PDF est du JS **sérialisé en string** dans `previewBailData` (index-test.html ; sandbox-first). On ajoute un accumulateur d'ancres en **mm jsPDF**, poussé au moment exact des `pdf.rect(...)`. Les ancres ne sont **jamais re-calculées a posteriori** — on capture ce que jsPDF dessine. **Risque** : ne pas casser le flux présentiel. Tout est gardé derrière un flag : sans `remoteSign`, l'accumulateur reste inerte (push quand même, mais jamais lu).

> ⚠️ Les numéros de ligne ci-dessous sont ceux de `index.html` v15.250 (rapport d'ancrage) ; dans `index-test.html` ils diffèrent. Localiser par **chaîne de recherche** (fournie), pas par numéro.

### Task 5 : Accumulateur `__SIGN_ANCHORS__` + push aux 3 rects + tag page

**Files:**
- Modify: `index-test.html` (popup string de `previewBailData`)
- Test: `__tests__/helpers/anchor-accumulator.test.js` (créer — teste la **logique pure** de push, extraite)

> Pour rendre la logique de push testable hors popup, on extrait la décision « quel sigId / kind / page pour ce rect » dans une fonction pure réutilisée à l'identique dans la string. On teste la fonction pure ; l'intégration popup est vérifiée au smoke (Task 6).

- [ ] **Step 1: Test rouge — fonction pure `pushAnchor`**

```js
// __tests__/helpers/anchor-accumulator.test.js
import { describe, it, expect } from 'vitest';
import { pushAnchor, makeAnchorAcc } from './anchor-accumulator.js';

describe('pushAnchor', () => {
  it('n’enregistre rien hors mode remoteSign', () => {
    const acc = makeAnchorAcc(false);
    pushAnchor(acc, { sigId: 'loc-0', kind: 'signature', page: 2, x: 15, y: 210, w: 90, h: 30 });
    expect(acc.anchors).toHaveLength(0);
  });
  it('enregistre en mode remoteSign avec tous les champs', () => {
    const acc = makeAnchorAcc(true);
    pushAnchor(acc, { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 });
    expect(acc.anchors).toEqual([{ sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 }]);
  });
  it('ignore un rect sans sigId (bloc non-signataire)', () => {
    const acc = makeAnchorAcc(true);
    pushAnchor(acc, { sigId: null, kind: 'signature', page: 1, x: 15, y: 210, w: 90, h: 30 });
    expect(acc.anchors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Lancer → échec**

Run: `npx vitest run __tests__/helpers/anchor-accumulator.test.js`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémentation de la fonction pure**

```js
// __tests__/helpers/anchor-accumulator.js
// Logique pure de capture d'ancres (réutilisée verbatim dans la string popup de previewBailData).
export function makeAnchorAcc(remoteSign) {
  return { remoteSign: !!remoteSign, anchors: [] };
}
export function pushAnchor(acc, a) {
  if (!acc || !acc.remoteSign) return;
  if (!a || !a.sigId) return; // seuls les signataires à distance portent un sigId
  acc.anchors.push({ sigId: a.sigId, kind: a.kind, page: a.page, x: a.x, y: a.y, w: a.w, h: a.h, ...(a.luApprouve != null ? { luApprouve: a.luApprouve } : {}) });
}
```

- [ ] **Step 4: Lancer → vert**

Run: `npx vitest run __tests__/helpers/anchor-accumulator.test.js`
Expected: PASS.

- [ ] **Step 5: Inliner la même logique dans la string popup (index-test.html)**

5a — Localiser le début de `genPDFNative` dans la string popup (chercher `window._sigBailleurFinalIdx=0;`). Juste avant, injecter la déclaration de l'accumulateur dans la string (le flag vient de `_BAIL_REMOTE_SIGN`, défini Task 6) :

```js
+'window.__SIGN_ANCHORS__=(typeof _BAIL_REMOTE_SIGN!=="undefined"&&_BAIL_REMOTE_SIGN)?{remoteSign:true,anchors:[]}:{remoteSign:false,anchors:[]};'
+'window.__pushAnchor=function(a){if(!window.__SIGN_ANCHORS__.remoteSign)return;if(!a||!a.sigId)return;var o={sigId:a.sigId,kind:a.kind,page:a.page,x:a.x,y:a.y,w:a.w,h:a.h};if(a.luApprouve!=null)o.luApprouve=a.luApprouve;window.__SIGN_ANCHORS__.anchors.push(o);};'
```

5b — `drawLocataireSignaturePlaceholder` (chercher `'drawLocataireSignaturePlaceholder:function('`). Le rect réel est `pdf.rect(x,y,w,h)`. Juste **après** ce `pdf.rect`, ajouter dans la string :

```js
+      'if(window.__pushAnchor&&typeof __CUR_SIGID!=="undefined")window.__pushAnchor({sigId:__CUR_SIGID,kind:"signature",page:pdf.internal.getCurrentPageInfo().pageNumber,x:x,y:y,w:w,h:h,luApprouve:!!luApprouve});'
```

5c — `drawParaphesFooter`→`drawCol` (chercher `'pdf.rect(sx,footY+2.5,sw,colH);'`). Juste **après**, ajouter (le sigId courant du paraphe vient de la boucle footer — variable `__CUR_PARAPHE_SIGID` posée en 5e) :

```js
+        'if(window.__pushAnchor&&typeof __CUR_PARAPHE_SIGID!=="undefined")window.__pushAnchor({sigId:__CUR_PARAPHE_SIGID,kind:"paraphe",page:p,x:sx,y:footY+2.5,w:sw,h:colH});'
```

5d — `drawSignatureBlock` (signature **remplie** côté bailleur). Le bailleur est signé en dur : **ne pas** capturer d'ancre pour lui (manifeste = signataires à distance uniquement). Donc **aucun push** dans `drawSignatureBlock` (laisser tel quel). Documenter par un commentaire dans la string.

5e — Définir `__CUR_SIGID` / `__CUR_PARAPHE_SIGID` au bon endroit : dans le handler `signature-locataire-placeholder` (chercher `drawLocataireSignaturePlaceholder(pdf,x,y,90,30,item.label,luL)`), poser `var __CUR_SIGID=item.sigId;` avant l'appel (le `sigId` doit être présent sur l'item — voir 5f). Dans la boucle footer (chercher `drawParaphesFooter(pdf,p,tot,sigBPNGs,sigLPNGs)`), il faut un sigId par sous-cadre locataire : passer un tableau de sigIds parallèle à `sigLPNGs`. **Approche minimale** : restreindre la capture des paraphes aux pages réelles via la même boucle `k` que les PNGs — poser `__CUR_PARAPHE_SIGID` dans `drawCol` à partir d'un tableau `sigIds` ajouté en 5e-bis.

5e-bis — Étendre la signature de `drawCol`/`drawParaphesFooter` pour recevoir les sigIds. Chercher `'drawCol=function(label,x,sigs,fallbackText){'` → ajouter param `sigIds` : `'drawCol=function(label,x,sigs,fallbackText,sigIds){'` et dans la boucle `for(var k...)`, avant le `pdf.rect`, poser `'var __CUR_PARAPHE_SIGID=(sigIds&&sigIds[k])?sigIds[k]:null;'`. Côté appelant locataire, passer le tableau des sigIds locataires (dérivé de `window._wizV2Paraphes[p]` côté loc, déjà trié — réutiliser le tri existant pour produire `locSigIds`).

5f — S'assurer que chaque item `signature-locataire-placeholder` porte un `sigId` stable. Dans `buildBailStructure` (chercher `type:'signature-locataire-placeholder'`), ajouter `sigId:'loc-'+i` à l'objet poussé (la map `locs.map((l,i)=>...)`). De même les paraphes locataires sont déjà clés `loc-*` dans `_wizV2Paraphes` — vérifier la correspondance d'id (`loc-0`, `loc-1`…).

> **Convention sigId figée** : `loc-<index>` pour les locataires, `garant-<index>` pour les garants/cautions. Le manifeste (Phase 3) et `sign.html` (Composant 2) doivent partager exactement ces ids. Vérifier contre `sign.html` (worktree relais) la convention attendue.

- [ ] **Step 6: Test de NON-RÉGRESSION du flux présentiel (manuel sandbox)**

Ouvrir `index-test.html`, charger le dataset démo (bouton manuel), signer un bail **en présentiel** (flux existant). Vérifier : PDF généré identique (paraphes + signature), aucune erreur console, `window.__SIGN_ANCHORS__.remoteSign === false`, `.anchors.length === 0`.

- [ ] **Step 7: Commit**

```bash
git add __tests__/helpers/anchor-accumulator.js __tests__/helpers/anchor-accumulator.test.js index-test.html
git commit -m "feat: instrumentation capture ancres signataires distants (popup, inerte hors remoteSign)"
```

### Task 6 : Mode `remoteSign` dans `previewBailData` + handoff vers l'opener

**Files:**
- Modify: `index-test.html` (`previewBailData` : param opts + injection flag + handoff après génération PDF)
- Modify: `index-test.html` (opener : callback `_onRemoteBailReady`)

> Le bailleur signe **in-app** via la popup existante (paraphes + signature finale), puis le PDF sortant (bailleur tamponné + placeholders vides pour les distants) + les ancres capturées sont remis à l'opener. En mode `remoteSign`, on **n'écrit pas** `bail.signatures` comme un bail signé : on garde le bail en attente (la signature finale viendra du retour relais).

- [ ] **Step 1: Passer le flag dans la string popup**

Localiser l'injection de `_BAIL_REF` dans la string (chercher `'var _BAIL_REF='`). Juste après, ajouter :

```js
+'var _BAIL_REMOTE_SIGN='+(opts&&opts.remoteSign?'true':'false')+';'
```

- [ ] **Step 2: Brancher le handoff après génération du PDF sortant**

Localiser le bloc de persistance des signatures (chercher `'window.opener.DB.baux[_BAIL_REF].signatures=sigData;'`). En mode `remoteSign`, **au lieu** d'écrire `signatures` comme signé, sérialiser le PDF généré + ancres et appeler l'opener. Le PDF jsPDF est disponible via l'objet `pdf` du dernier `genPDFNative` (récupérer son blob : `pdf.output('blob')` → `FileReader`/`URL`). Injecter dans la string, dans la branche `remoteSign` :

```js
+'if(_BAIL_REMOTE_SIGN){'
+'  try{'
+'    var _outBlob=pdf.output("blob");'
+'    var _fr=new FileReader();'
+'    _fr.onload=function(){'
+'      if(window.opener&&!window.opener.closed&&typeof window.opener._onRemoteBailReady==="function"){'
+'        window.opener._onRemoteBailReady(_BAIL_REF,_fr.result,window.__SIGN_ANCHORS__.anchors,(pdf.internal.pages.length-1));'
+'      }'
+'      try{window.close();}catch(e){}'
+'    };'
+'    _fr.readAsDataURL(_outBlob);'
+'  }catch(e){if(window.opener&&window.opener.showToast)window.opener.showToast("Erreur préparation envoi: "+e.message,"err",6000);}'
+'  return;'   // ne pas exécuter la persistance "signé" du flux présentiel
+'}'
```

> ⚠️ **Point précis à confirmer à l'implémentation** : l'identifiant exact de l'objet jsPDF en scope au moment de la persistance (le rapport d'ancrage montre `var pdf=new jsPDFCls(...)` dans `genPDFNative` lignes ~19590). Vérifier que `pdf` (ou son nom réel) est accessible dans la branche de persistance ; sinon, capturer le blob à la fin de `genPDFNative` dans une variable globale popup `window.__LAST_PDF_BLOB__` et la lire ici. Lire les lignes ~19166-19210 (`_wizV2PersistSignatures`) avant d'écrire.

- [ ] **Step 3: Callback opener `_onRemoteBailReady` (squelette inerte testable plus tard)**

Dans l'opener (proche des autres helpers bail, après `_refreshAfterMutation` ~ligne 5983), ajouter une fonction qui sera complétée Phase 3 (Task 9). Pour l'instant elle stocke le PDF dataURL + ancres sur un staging et log :

```js
// Reçu de la popup remoteSign : PDF sortant (dataURL) + ancres mm capturées + nb pages.
async function _onRemoteBailReady(ref, pdfDataUrl, anchors, totalPages) {
  try {
    window.__remoteBailStaging = window.__remoteBailStaging || {};
    window.__remoteBailStaging[ref] = { pdfDataUrl, anchors, totalPages, at: Date.now() };
    console.log('[remoteSign] PDF prêt', ref, anchors.length, 'ancres,', totalPages, 'pages');
    // Phase 3 (Task 9) : conversion manifeste + embed pdf-lib + POST /sessions + email.
    await _emitRemoteSignSession(ref); // défini Task 9
  } catch (e) {
    showToast('Erreur envoi signature : ' + e.message, 'err', 6000);
  }
}
window._onRemoteBailReady = _onRemoteBailReady; // accessible depuis la popup
```

- [ ] **Step 4: Smoke manuel sandbox**

Déclencher (provisoirement via console : `previewBailData(DB.baux[ref], log, ref, {remoteSign:true})`), signer le bailleur, vérifier dans la console opener : `window.__remoteBailStaging[ref].anchors` contient les ancres locataires (`kind:'paraphe'` × nbPages + `kind:'signature'` × 1 par locataire), `totalPages` cohérent, et **aucune** ancre `sigId` bailleur.

- [ ] **Step 5: Commit**

```bash
git add index-test.html
git commit -m "feat: mode remoteSign previewBailData + handoff PDF+ancres vers opener"
```

---

## Phase 3 — Post-traitement (manifeste) + émission de la session

### Task 7 : `_buildSignManifest` — ancres mm → manifeste pt (pur, testé)

**Files:**
- Create: `__tests__/helpers/build-sign-manifest.js`
- Test: `__tests__/helpers/build-sign-manifest.test.js`

> Transforme les ancres capturées (mm jsPDF) en manifeste pt pdf-lib prêt à embarquer. Pur, sans pdf-lib (reçoit `pageHeightPt`). Réutilise `rectFromJsPdf` du module coords.

- [ ] **Step 1: Test rouge**

```js
// __tests__/helpers/build-sign-manifest.test.js
import { describe, it, expect } from 'vitest';
import { buildSignManifest } from './build-sign-manifest.js';

const A4_H_PT = 841.8897637795275;

describe('buildSignManifest', () => {
  it('convertit chaque ancre mm en pt + Y-flip, garde sigId/kind/page', () => {
    const anchors = [
      { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
      { sigId: 'loc-0', kind: 'signature', page: 2, x: 15, y: 210, w: 90, h: 30, luApprouve: true }
    ];
    const m = buildSignManifest(anchors, 2, A4_H_PT);
    expect(m.v).toBe(1);
    expect(m.totalPages).toBe(2);
    expect(m.anchors).toHaveLength(2);
    const sig = m.anchors.find(a => a.kind === 'signature');
    expect(sig.x).toBeCloseTo(15 * 72 / 25.4, 6);
    expect(sig.y).toBeCloseTo(A4_H_PT - (240) * 72 / 25.4, 6); // y+h = 240
    expect(sig.w).toBeCloseTo(90 * 72 / 25.4, 6);
    expect(sig.luApprouve).toBe(true);
    expect(sig.sigId).toBe('loc-0');
    expect(sig.page).toBe(2);
  });
  it('manifeste vide si pas d’ancres', () => {
    expect(buildSignManifest([], 1, A4_H_PT).anchors).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer → échec** — `npx vitest run __tests__/helpers/build-sign-manifest.test.js`

- [ ] **Step 3: Implémentation**

```js
// __tests__/helpers/build-sign-manifest.js
import { rectFromJsPdf } from './bail-sign-coords.js';

// anchors: ancres mm jsPDF (top-left). pageHeightPt: hauteur page pdf-lib en points.
export function buildSignManifest(anchors, totalPages, pageHeightPt) {
  return {
    v: 1,
    totalPages,
    anchors: (anchors || []).map(a => {
      const r = rectFromJsPdf({ x: a.x, y: a.y, w: a.w, h: a.h }, pageHeightPt);
      const out = { sigId: a.sigId, kind: a.kind, page: a.page, x: r.x, y: r.y, w: r.width, h: r.height };
      if (a.luApprouve != null) out.luApprouve = a.luApprouve;
      return out;
    })
  };
}
```

- [ ] **Step 4: Lancer → vert** ; ajouter au `PAIRS` du mirror (`globalName:'BuildSignManifest', exports:['buildSignManifest']`) + régénérer + `<script src>` index-test.html (comme Task 4).

- [ ] **Step 5: Commit**

```bash
git add __tests__/helpers/build-sign-manifest.js __tests__/helpers/build-sign-manifest.test.js tools/sync-helpers-global-mirrors.mjs js/helpers/build-sign-manifest.global.js index-test.html
git commit -m "feat: build-sign-manifest (ancres mm → manifeste pt)"
```

### Task 8 : `_embedSignManifest` — embarque le manifeste dans le PDF (pdf-lib, prod)

**Files:**
- Modify: `index-test.html` (opener : helper `_loadPdfLib` + `_embedSignManifest`)
- Test: vérification d'intégration en smoke (le round-trip pur est déjà couvert Task 3)

- [ ] **Step 1: Helper de chargement pdf-lib (prod, Blob URL)**

Dans l'opener, ajouter (réutilise `_b64ToBlobUrl` et `window._BAIL_PDF_LIBS.pdfLib` de Task 1) :

```js
let _pdfLibPromise = null;
function _loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (_pdfLibPromise) return _pdfLibPromise;
  _pdfLibPromise = new Promise((resolve, reject) => {
    try {
      const url = _b64ToBlobUrl(window._BAIL_PDF_LIBS.pdfLib, 'text/javascript');
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('PDFLib non exposé'));
      s.onerror = () => reject(new Error('Échec chargement pdf-lib'));
      document.head.appendChild(s);
    } catch (e) { reject(e); }
  });
  return _pdfLibPromise;
}
```

- [ ] **Step 2: `_embedSignManifest(pdfBytes, manifest) → Uint8Array`**

```js
// Embarque le manifeste (Keywords) dans le PDF via pdf-lib. Retourne les octets modifiés.
async function _embedSignManifest(pdfBytes, manifest) {
  const PDFLib = await _loadPdfLib();
  const doc = await PDFLib.PDFDocument.load(pdfBytes);
  const sentinel = window.BailSignManifest.SENTINEL;
  doc.setKeywords([sentinel + _b64urlJson(manifest)]); // même encodage que manifest.encode
  return doc.save();
}
// Réutilise exactement l'encodage du module manifest pour cohérence avec sign.html.
function _b64urlJson(obj) {
  // équivalent de BailSignManifest.encode sans le SENTINEL — réutiliser le module si exposé :
  return window.BailSignManifest.encode(obj).slice(window.BailSignManifest.SENTINEL.length);
}
```

> Simplification : exposer une fonction unique. Préférer appeler `window.BailSignManifest.embedInDoc(doc, manifest)` directement (le module gère sentinel + encodage), puis `doc.save()`. Réécrire `_embedSignManifest` ainsi :

```js
async function _embedSignManifest(pdfBytes, manifest) {
  const PDFLib = await _loadPdfLib();
  const doc = await PDFLib.PDFDocument.load(pdfBytes);
  window.BailSignManifest.embedInDoc(doc, manifest); // setKeywords([encode(manifest)])
  return doc.save();
}
```

- [ ] **Step 3: Lire la hauteur de page réelle (pageHeightPt) depuis le PDF chargé**

Le `pageHeightPt` passé à `buildSignManifest` doit venir du PDF réel (pdf-lib) pour être exact :

```js
// dans _emitRemoteSignSession (Task 9) avant buildSignManifest :
const PDFLib = await _loadPdfLib();
const probe = await PDFLib.PDFDocument.load(pdfBytes);
const pageHeightPt = probe.getPage(0).getHeight(); // ≈ 841.89 pour A4
```

- [ ] **Step 4: Smoke** — Phase 3 testée bout-à-bout en Task 9. Pas de commit isolé ici (helpers commités avec Task 9).

### Task 9 : `_relayCreateSession` + `_emitRemoteSignSession` (POST /sessions)

**Files:**
- Modify: `index-test.html` (opener : `_relayCreateSession`, `_emitRemoteSignSession`, écriture `bail.signatures.remoteSession`)

- [ ] **Step 1: Client `_relayCreateSession(pdfBlob, meta) → {sessionId, signUrl, ownerToken}`**

```js
// POST multipart au relais. APP_KEY en Bearer (jamais loggée, jamais en URL).
async function _relayCreateSession(pdfBlob, meta) {
  const relayUrl = (DB.params && DB.params.bailSignRelayUrl || '').replace(/\/$/, '');
  const appKey = DB.params && DB.params.bailSignAppKey;
  if (!relayUrl || !appKey) throw new Error('Relais ou clé non configurés (Réglages)');
  const fd = new FormData();
  fd.set('pdf', pdfBlob, 'bail.pdf');
  fd.set('meta', JSON.stringify(meta));
  const r = await fetch(relayUrl + '/sessions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + appKey }, body: fd
  });
  if (!r.ok) throw new Error('Relais POST /sessions ' + r.status);
  return r.json(); // { sessionId, signUrl, ownerToken }
}
```

- [ ] **Step 2: `_emitRemoteSignSession(ref)` — orchestrateur d'émission**

```js
async function _emitRemoteSignSession(ref) {
  const staging = window.__remoteBailStaging && window.__remoteBailStaging[ref];
  const bail = DB.baux[ref];
  if (!staging || !bail) throw new Error('Données d’émission manquantes');
  // 1) dataURL → bytes
  const pdfBytes = _dataUrlToUint8(staging.pdfDataUrl);
  // 2) hauteur page réelle
  const PDFLib = await _loadPdfLib();
  const probe = await PDFLib.PDFDocument.load(pdfBytes);
  const pageHeightPt = probe.getPage(0).getHeight();
  // 3) manifeste pt
  const manifest = window.BuildSignManifest.buildSignManifest(staging.anchors, staging.totalPages, pageHeightPt);
  // 4) embarquer
  const stampedBytes = await _embedSignManifest(pdfBytes, manifest);
  const pdfBlob = new Blob([stampedBytes], { type: 'application/pdf' });
  // 5) signers (ordre = ordre tableau) — distants seulement (présentiel exclu via toggle modale)
  const signers = _collectRemoteSigners(bail); // [{sigId, role, nom, email, distant, ordre}]
  // 6) créer session
  const meta = { bailRef: ref, signers: signers.map(s => ({ sigId: s.sigId, role: s.role, nom: s.nom, email: s.email, ordre: s.ordre })) };
  const { sessionId, signUrl, ownerToken } = await _relayCreateSession(pdfBlob, meta);
  // 7) état
  bail.signatures = bail.signatures || {};
  bail.signatures.remoteSession = {
    sessionId, signUrl, ownerToken,
    relayUrl: (DB.params.bailSignRelayUrl || '').replace(/\/$/, ''),
    status: 'sent', createdAt: new Date().toISOString(),
    signers: signers.map(s => ({ sigId: s.sigId, role: s.role, nom: s.nom, email: s.email, distant: s.distant, signedAt: null, notifiedAt: null })),
    lastPolledAt: null
  };
  bail._modifiedAt = new Date().toISOString();
  saveDB();
  // 8) email signataire 1
  await _sendBailSignEmail(bail, bail.signatures.remoteSession.signers[0], signUrl); // Task 12/15
  bail.signatures.remoteSession.signers[0].notifiedAt = new Date().toISOString();
  saveDB();
  delete window.__remoteBailStaging[ref];
  showToast('📨 Bail envoyé en signature', 'ok', 4000);
  _refreshAfterMutation();
}

function _dataUrlToUint8(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
```

> `_collectRemoteSigners(bail)` et `_sendBailSignEmail(...)` sont définis Task 10 (modale, fournit l'ordre + emails + toggles présentiel) et Task 12/15 (email). En Task 9 on peut stubber `_sendBailSignEmail` (log) pour tester l'émission jusqu'au POST, puis le compléter.

- [ ] **Step 3: Smoke émission (sandbox + relais déployé Phase 0)**

Configurer Réglages (Task 14) avec l'URL relais + APP_KEY de test. Déclencher l'émission, vérifier : POST /sessions → 200, `bail.signatures.remoteSession.status==='sent'`, `sessionId`/`ownerToken` présents, page `signUrl` ouvrable et affichant le PDF avec placeholders aux bons emplacements (validation visuelle des ancres = validation risque #1 bout-à-bout).

- [ ] **Step 4: Commit**

```bash
git add index-test.html
git commit -m "feat: émission session signature distance (manifeste pdf-lib + POST /sessions + état remoteSession)"
```

### Task 10 : Modale d'envoi (variante B) + bouton 📨 + `_collectRemoteSigners`

**Files:**
- Modify: `index-test.html` (bouton dans `rBaux` ~14823 et `_renderLogFichePanelBail` ~35131 ; modale ; `_collectRemoteSigners`)
- Référence canonique : `mockups/bail-signature-distance-c3/c3-envoi-signature.html`

> **Mockup-first** : la modale et les badges DOIVENT reproduire fidèlement le mockup validé (variante B : étape 1 récap signataires/emails/toggles, étape 2 aperçu emails + « Confirmer l'envoi »). Ne pas inventer l'UI — lire le mockup et reprendre structure/classes.

- [ ] **Step 1: Ajouter le bouton 📨 « Envoyer en signature »**

Dans `_renderLogFichePanelBail` (chercher le bloc `${partial?...previewBailLocataireRef...}`), ajouter une condition pour le nouveau bouton, visible quand il n'y a pas de session distante en cours et bail non signé complet :

```js
${(!complet && !(bail.signatures && bail.signatures.remoteSession)) ? `<button class="btn bs bb" onclick="openRemoteSignModal('${refSafe}')" style="background:#7c3aed;color:#fff" title="Envoyer en signature à distance">📨 Envoyer en signature</button>` : ''}
```

Idem (version compacte icône) dans `rBaux` ~14823, en cohérence avec les boutons icônes existants.

- [ ] **Step 2: `openRemoteSignModal(ref)` — modale variante B (reproduire le mockup)**

Construire la modale avec les classes du design system (`.ov`/`.modal`/`.m-head`/`.btn`/`.inp`/`.fg`). Étape 1 : liste des signataires distants (locataires + garants) avec emails éditables (`.inp`), toggle « présentiel » par signataire, ordre. Étape 2 : aperçu des emails (à qui / ordre) + bouton « Confirmer l'envoi » → appelle `_confirmRemoteSignSend(ref)`. Si relais/APP_KEY absents → modale « config manquante » renvoyant vers Réglages. **Reprendre la structure exacte du mockup.**

- [ ] **Step 3: `_collectRemoteSigners(bail)` — à partir des saisies modale**

Lit les emails/toggles saisis, construit la liste ordonnée des signataires **distants** (exclut ceux marqués présentiel), avec `sigId` (`loc-<i>`/`garant-<i>` — même convention que Task 5f), `role`, `nom`, `email`, `ordre`. Valide que chaque distant a un email (sinon erreur inline).

- [ ] **Step 4: `_confirmRemoteSignSend(ref)`**

Persiste les emails saisis sur le bail (locataires/garants), ferme la modale, puis ouvre `previewBailData(bail, log, ref, {remoteSign:true})` (Phase 2) → le reste de la chaîne s'enchaîne via `_onRemoteBailReady` → `_emitRemoteSignSession`.

- [ ] **Step 5: Smoke modale (sandbox, 3 formats)**

Vérifier responsive PC/tablette/téléphone (mockup), édition emails, toggle présentiel (retire de la liste distante), étape 2 cohérente, gestion config manquante.

- [ ] **Step 6: Commit**

```bash
git add index-test.html
git commit -m "feat: modale envoi signature distance (variante B) + bouton 📨 + collecte signataires"
```

---

## Phase 4 — Boucle de retour automatique (polling)

### Task 11 : Clients polling `_relayPollSession` + `_relayFetchResult` + `_relayDeleteSession`

**Files:**
- Modify: `index-test.html` (opener : 3 clients relais)

- [ ] **Step 1: Implémentation des 3 clients**

```js
// État de session (X-Owner-Token).
async function _relayPollSession(relayUrl, sessionId, ownerToken) {
  const r = await fetch(relayUrl.replace(/\/$/, '') + '/api/sessions/' + encodeURIComponent(sessionId), {
    headers: { 'X-Owner-Token': ownerToken }
  });
  if (r.status === 404) return { status: 'expired' };
  if (!r.ok) throw new Error('poll ' + r.status);
  return r.json(); // { status, currentIndex, signers:[{role,ordre,statut,emailVerifiedAt,proof}], expiresAt }
}

// PDF signé final (X-Owner-Token) → Blob.
async function _relayFetchResult(relayUrl, sessionId, ownerToken) {
  const r = await fetch(relayUrl.replace(/\/$/, '') + '/api/sessions/' + encodeURIComponent(sessionId) + '/result', {
    headers: { 'X-Owner-Token': ownerToken }
  });
  if (!r.ok) throw new Error('result ' + r.status);
  return r.blob();
}

// Purge relais post-ingestion (D12) — best-effort, 404-tolérant, jamais bloquant.
async function _relayDeleteSession(relayUrl, sessionId, ownerToken) {
  try {
    await fetch(relayUrl.replace(/\/$/, '') + '/api/sessions/' + encodeURIComponent(sessionId), {
      method: 'DELETE', headers: { 'X-Owner-Token': ownerToken }
    });
  } catch (e) { console.warn('[remoteSign] DELETE relais échec (non bloquant)', e); }
}
```

- [ ] **Step 2: Commit** (testé en intégration Task 12-13)

```bash
git add index-test.html
git commit -m "feat: clients relais polling/result/delete (signature distance)"
```

### Task 12 : Orchestrateur de polling (boot + ouverture fiche, throttle) + chaînage email N+1

**Files:**
- Modify: `index-test.html` (`_pollRemoteSignSessions`, hook boot ~46912, hook ouverture fiche logement)

- [ ] **Step 1: `_pollRemoteSignSessions(opts)` — itère les baux en attente**

```js
// Poll tous les baux avec remoteSession.status ∈ {sent, chaining}. opts.logRef = limiter à un logement.
// Throttle global 30 s (pattern _drvLazyScanLogement).
async function _pollRemoteSignSessions(opts) {
  opts = opts || {};
  const now = Date.now();
  if (!opts.force && window.__lastRemotePoll && now - window.__lastRemotePoll < 30000) return;
  window.__lastRemotePoll = now;
  const refs = Object.keys(DB.baux || {}).filter(ref => {
    const rs = DB.baux[ref].signatures && DB.baux[ref].signatures.remoteSession;
    if (!rs || !['sent', 'chaining'].includes(rs.status)) return false;
    if (opts.logRef && DB.baux[ref].logementRef !== opts.logRef) return false; // adapter au nom réel du champ logement
    return true;
  });
  let mutated = false;
  for (const ref of refs) {
    try { if (await _pollOneRemoteSession(ref)) mutated = true; }
    catch (e) { console.warn('[remoteSign] poll', ref, e); }
  }
  if (mutated) { saveDB(); _refreshAfterMutation(); }
}
```

- [ ] **Step 2: `_pollOneRemoteSession(ref)` — chaînage + détection complétion**

```js
async function _pollOneRemoteSession(ref) {
  const bail = DB.baux[ref];
  const rs = bail.signatures.remoteSession;
  const state = await _relayPollSession(rs.relayUrl, rs.sessionId, rs.ownerToken);
  rs.lastPolledAt = new Date().toISOString();
  if (state.status === 'expired') { rs.status = 'expired'; return true; }
  if (state.status === 'error')   { rs.status = 'error';   return true; }

  // Reporter l'état signé par signataire (depuis state.signers, clé sur ordre/sigId)
  let changed = false;
  (state.signers || []).forEach(ss => {
    const local = rs.signers.find(s => s.sigId === ss.sigId || s.role === ss.role);
    if (local && ss.statut === 'signed' && !local.signedAt) { local.signedAt = new Date().toISOString(); changed = true; }
  });

  if (state.status === 'completed') {
    await _completeRemoteSign(ref, state); // Task 13
    return true;
  }

  // Chaînage : si un intermédiaire vient de signer, notifier le suivant non notifié.
  if (changed) {
    rs.status = 'chaining';
    const next = rs.signers.find(s => s.distant && !s.notifiedAt && !s.signedAt);
    if (next) {
      try { await _sendBailSignEmail(bail, next, rs.signUrl); next.notifiedAt = new Date().toISOString(); }
      catch (e) { console.warn('[remoteSign] email N+1 échec', e); }
    }
  }
  return changed;
}
```

- [ ] **Step 3: Hook boot** — dans le `DOMContentLoaded` (~46912), après `initDB()`, suivre le pattern des tâches différées (`setTimeout(_checkIRLRappelsAuLogin, 1500)`) :

```js
setTimeout(() => { try { _pollRemoteSignSessions({ force: true }); } catch (e) {} }, 2500);
```

- [ ] **Step 4: Hook ouverture fiche logement** — dans le handler de tab/ouverture fiche (proche de l'appel `_drvLazyScanLogement` ~30353), ajouter un poll ciblé throttlé :

```js
setTimeout(() => { try { _pollRemoteSignSessions({ logRef: /* ref du logement courant */ }); } catch (e) {} }, 300);
```

- [ ] **Step 5: Commit**

```bash
git add index-test.html
git commit -m "feat: orchestrateur polling signature distance (boot + fiche, throttle 30s) + chaînage email N+1"
```

### Task 13 : Complétion — result + certificat + hash + couture `_ingestSignedBailArtifacts` + DELETE + lock

**Files:**
- Modify: `index-test.html` (`_completeRemoteSign`, `_ingestSignedBailArtifacts`, `_sha256Hex`)

> **Prérequis d'ordre** : `_completeRemoteSign` (Step 3) appelle `_buildBailCertificatePdf`, défini en **Task 16 Step 2**. Implémenter `_buildBailCertificatePdf` **avant** cette tâche (le déplacer en amont, juste après `_loadPdfLib` de Task 8), OU le stubber ici (`async _buildBailCertificatePdf(){ return new Blob([new Uint8Array()],{type:'application/pdf'}); }`) puis le compléter en Task 16. Ne pas laisser Task 13 sans définition de cette fonction.

- [ ] **Step 1: Hash de contenu — `_sha256Hex(arrayBuffer) → hex`**

```js
async function _sha256Hex(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 2: Couture d'archivage `_ingestSignedBailArtifacts` (SEUL point de couplage au store, §3.4)**

```js
/**
 * Couture d'archivage. SEUL point de couplage au store dans C3.
 * Aujourd'hui : Drive via _driveUploadBlob (renvoie {id,name,webViewLink}).
 * Demain (D6/P1) : Supabase Storage — réimplémenter CE corps uniquement.
 * @returns {Promise<{pdfRef, certRef}>} refs OPAQUES (l'appelant ne suppose pas la forme).
 */
async function _ingestSignedBailArtifacts(pdfBlob, certBlob, bail, proof) {
  const folderId = (DB.params && DB.params.edlDriveFolderId) || LEGACY_OWNER_EDL_ROOT_ID;
  const pdfRes  = await _driveUploadBlob(folderId, 'bail-' + bail.ref + '-signe.pdf', pdfBlob, 'application/pdf');
  const certRes = await _driveUploadBlob(folderId, 'bail-' + bail.ref + '-certificat.pdf', certBlob, 'application/pdf');
  return {
    pdfRef:  { driveFileId: pdfRes.id,  driveWebViewLink: pdfRes.webViewLink },
    certRef: { driveFileId: certRes.id, driveWebViewLink: certRes.webViewLink }
  };
}
```

- [ ] **Step 3: `_completeRemoteSign(ref, state)`**

```js
async function _completeRemoteSign(ref, state) {
  const bail = DB.baux[ref];
  const rs = bail.signatures.remoteSession;
  // 1) PDF signé final
  const pdfBlob = await _relayFetchResult(rs.relayUrl, rs.sessionId, rs.ownerToken);
  const pdfBuf = await pdfBlob.arrayBuffer();
  const contentHash = await _sha256Hex(pdfBuf);
  // 2) preuve par signataire (depuis state.signers[].proof)
  const proof = (state.signers || []).map(ss => ({
    sigId: ss.sigId, role: ss.role, nom: ss.nom,
    email: ss.email, emailVerifiedAt: ss.emailVerifiedAt || null,
    signedAt: (ss.proof && ss.proof.signedAt) || null,
    ip: (ss.proof && ss.proof.ip) || null,
    sigHash: (ss.proof && ss.proof.sigHash) || null
  }));
  // 3) certificat de preuve PDF (Task 16)
  const certBlob = await _buildBailCertificatePdf(bail, proof, contentHash);
  // 4) archivage (couture) + DELETE relais (best-effort)
  const { pdfRef, certRef } = await _ingestSignedBailArtifacts(pdfBlob, certBlob, bail, proof);
  await _relayDeleteSession(rs.relayUrl, rs.sessionId, rs.ownerToken); // non bloquant
  // 5) écriture finale bail.signatures + verrou
  bail.signatures = Object.assign({}, bail.signatures, {
    mode: 'distance',
    signedAt: new Date().toISOString(),
    signatureSource: 'immotrack',
    contentHash,
    pdfRef, certRef,
    proof,
    locked: true
  });
  bail.signatures.remoteSession.status = 'completed';
  bail._modifiedAt = new Date().toISOString();
  showToast('🔒 Bail signé à distance — archivé', 'ok', 5000);
}
```

> ⚠️ **Confirmer à l'implémentation** : le nom réel du dossier Drive cible (`edlDriveFolderId` vs un dossier baux dédié) et le contrat exact de `state.signers[].proof` renvoyé par le relais (rapport d'ancrage : `GET /api/sessions/:id` mappe `proof{...}` par signer — lire la forme exacte côté `relay/src/index.js` lignes ~178-207).

- [ ] **Step 4: Smoke complétion (PROD index.html — Drive requis)**

> Exception sandbox captée : `index-test.html` n'a pas Drive. Le test réel de l'aller-retour complet (signature des locataires sur `sign.html`, polling, download, archivage Drive, verrouillage) se fait **en prod** après sync Phase 6, avec un bail de test.

- [ ] **Step 5: Commit**

```bash
git add index-test.html
git commit -m "feat: complétion signature distance (result+hash+certificat+couture archivage+DELETE+lock)"
```

---

## Phase 5 — Configuration, états UI, scope email

### Task 14 : Réglages — `bailSignRelayUrl` + `bailSignAppKey`

**Files:**
- Modify: `index-test.html` (panneau `tp-global` ~1070 ; `rParamsGlobal` ~39818 ; `saveGlobalParams` ~40179)

- [ ] **Step 1: Markup des 2 champs** (panneau global, modèle du champ `param-drive-folder-id`)

```html
<div class="fg mb8">
  <label style="font-size:11px">URL du relais de signature</label>
  <input class="inp" id="param-bailsign-relay-url" placeholder="https://bail-sign-relay.didierkeller.workers.dev" style="width:100%;font-family:monospace">
</div>
<div class="fg mb8">
  <label style="font-size:11px">Clé d'application (APP_KEY) du relais</label>
  <input class="inp" id="param-bailsign-app-key" type="password" autocomplete="off" placeholder="••••••••" style="width:100%;font-family:monospace">
</div>
```

- [ ] **Step 2: Lecture dans `rParamsGlobal()`**

```js
const ru = el('param-bailsign-relay-url'); if (ru) ru.value = (DB.params.bailSignRelayUrl || '');
const ak = el('param-bailsign-app-key');  if (ak) ak.value = (DB.params.bailSignAppKey || '');
```

- [ ] **Step 3: Écriture dans `saveGlobalParams()`**

```js
DB.params.bailSignRelayUrl = v('param-bailsign-relay-url').trim();
DB.params.bailSignAppKey   = v('param-bailsign-app-key'); // ne pas trim (clé exacte)
```

> **À signaler au code-reviewer (Task 17)** : `bailSignAppKey` est le **premier secret stocké** dans `DB.params` → persistance localStorage en clair via `saveDB()`. Documenter le risque (repo public ≠ localStorage exposé, mais XSS/partage de machine) ; l'APP_KEY ne sert qu'à créer la session, l'ownerToken par-session porte le reste.

- [ ] **Step 4: Commit**

```bash
git add index-test.html
git commit -m "feat: Réglages — URL relais + APP_KEY signature distance (champ password)"
```

### Task 15 : Scope `gmail.send` incrémental + `_sendBailSignEmail`

**Files:**
- Modify: `index-test.html` (extension `_ensureDriveToken` ~44167 avec scope optionnel ; `_sendBailSignEmail`)

> Gap confirmé : `GMAIL_SEND_SCOPE` (~44140) existe mais n'est jamais demandé. Le polling/chaînage tourne **sans interaction popup** → l'autorisation gmail.send doit être obtenue **au moment de l'émission** (Task 9, geste utilisateur), pas pendant un poll de fond.

- [ ] **Step 1: Permettre un scope additionnel dans l'acquisition de token**

Étendre le primitive d'acquisition (`_ensureDriveToken(force)` → `requestAccessToken({prompt:''})`) pour accepter un scope additionnel `gmail.send` lors d'une demande explicite. Réutiliser le pattern d'`_onSendNow` (email-modal.js) qui gère déjà l'envoi Gmail et le 403. **Vérifier** comment `_getDriveToken()`/`window._getDriveToken` expose le token aux modules ESM.

- [ ] **Step 2: `_sendBailSignEmail(bail, signer, signUrl)`**

Réutilise le template `bail-pret-a-signer` (`js/core/email-compose.js:260`) via `_emailCompose('bail-pret-a-signer', ctx)` puis envoie via `_emailSendViaGmail(token, mime)` (`js/core/email-send.js:181`). Le contexte fournit nom signataire, lien `signUrl`, infos bail/logement. L'envoi **doit être déclenché à l'émission** (geste user) pour le signataire 1 ; pour N+1 pendant un poll, si le token gmail.send n'est plus valide → marquer `notifiedAt=null` et exposer le bouton 🔔 « Relancer » (filet manuel, §6).

- [ ] **Step 3: Smoke (prod)** — envoyer un email de test à soi-même, vérifier réception + lien `signUrl` cliquable.

- [ ] **Step 4: Commit**

```bash
git add index-test.html
git commit -m "feat: scope gmail.send incrémental + envoi email pret-a-signer (signature distance)"
```

### Task 16 : Badges 4 états + certificat de preuve PDF

**Files:**
- Modify: `index-test.html` (`_renderRemoteSignBadge`, `_buildBailCertificatePdf`)
- Référence : `mockups/bail-signature-distance-c3/c3-envoi-signature.html` (badges)

- [ ] **Step 1: `_renderRemoteSignBadge(bail)` → HTML** (4 états, classes `.bail-signed-badge`)

| État | Rendu |
|---|---|
| pas de `remoteSession` | bouton 📨 (Task 10) |
| `status==='sent'` | badge « 📨 En attente » |
| `status==='chaining'` | badge « 📨 N/M signé » (compter `signers.signedAt`) |
| `status==='completed'` | 🔒 pleine largeur + liens `pdfRef.driveWebViewLink` + `certRef.driveWebViewLink` |
| `status∈{error,expired}` | badge alerte + bouton 🔔 « Relancer / Recréer » |

Brancher dans `_renderLogFichePanelBail` (~35131) et `rBaux` (~14823) à la place/à côté de la logique de boutons existante. **Reproduire le mockup.**

- [ ] **Step 2: `_buildBailCertificatePdf(bail, proof, contentHash) → Blob`** (PDF lisible, pdf-lib)

Génère un PDF A4 séparé listant : référence bail, logement, date de complétion, hash de contenu (SHA-256), et pour chaque signataire : nom, rôle, email (+ vérifié à), horodatage de signature, IP, hash de signature, mention « Lu et approuvé ». Réutiliser les lignes de mention de `proof.js` (`buildMentionLines`, worktree relais) pour cohérence de formulation. Utilise pdf-lib (`PDFDocument.create`, `drawText`).

```js
async function _buildBailCertificatePdf(bail, proof, contentHash) {
  const PDFLib = await _loadPdfLib();
  const doc = await PDFLib.PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 pt
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  let y = 800;
  const line = (t, size = 11) => { page.drawText(String(t), { x: 40, y, size, font }); y -= size + 6; };
  line('Certificat de preuve de signature électronique', 16); y -= 8;
  line('Bail : ' + bail.ref);
  line('Date de complétion : ' + new Date().toLocaleString('fr-FR'));
  line('Empreinte du document (SHA-256) :', 10);
  line(contentHash, 8); y -= 8;
  line('Signataires :', 13); y -= 4;
  proof.forEach(p => {
    line('• ' + (p.nom || '') + ' (' + (p.role || '') + ')', 11);
    line('   email : ' + (p.email || '') + (p.emailVerifiedAt ? ' — vérifié le ' + p.emailVerifiedAt : ''), 9);
    line('   signé le : ' + (p.signedAt || '') + (p.ip ? ' — IP ' + p.ip : ''), 9);
    if (p.sigHash) line('   empreinte signature : ' + p.sigHash, 8);
    y -= 4;
  });
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
```

- [ ] **Step 3: Smoke** — vérifier le certificat (ouvrir le PDF généré, champs présents et lisibles, 3 formats du badge en sandbox).

- [ ] **Step 4: Commit**

```bash
git add index-test.html
git commit -m "feat: badges 4 états + certificat de preuve PDF (fichier séparé)"
```

---

## Phase 6 — Audit, sync prod, livraison

### Task 17 : Audit `superpowers:code-reviewer` OBLIGATOIRE

**Files:** aucun (revue).

- [ ] **Step 1: Lancer l'agent code-reviewer** sur l'ensemble du diff (`bail-sign-c3` depuis v15.250) **avant tout commit prod**. Périmètre explicite : (a) instrumentation popup sans régression du PDF présentiel ; (b) immuabilité légale du bail signé (verrou, contentHash, signatureSource) ; (c) sécurité APP_KEY/ownerToken (jamais en URL/log, premier secret localStorage) ; (d) couture d'archivage isolée (aucun autre site couplé au store) ; (e) best-effort DELETE non bloquant ; (f) conversion mm→pt (risque #1) ; (g) ne confond pas signature et paraphe dans le manifeste.

- [ ] **Step 2: Corriger tous les findings** (re-test après chaque correction). 0 finding bloquant avant de continuer.

- [ ] **Step 3: Commit des corrections** (messages explicites par finding).

### Task 18 : Sync sandbox→prod + bump version 5 endroits + BACKLOG

**Files:**
- Modify: `index.html` (sync depuis `index-test.html` — APRÈS OK utilisateur explicite), `sw.js`, `BACKLOG.md`, `docs/subjects/BAIL-SIGNATURE-DISTANCE.md`

- [ ] **Step 1: Attendre l'OK utilisateur explicite** (sandbox-first) avant de toucher `index.html` prod.

- [ ] **Step 2: Porter byte-identiquement** toutes les modifs de `index-test.html` vers `index.html` (instrumentation popup, helpers opener, modale, badges, Réglages, scope email, hooks boot/fiche). Vérifier la parité (les ancres diffèrent en numéro de ligne, le code doit être identique).

- [ ] **Step 3: Bump version 5 endroits** — déterminer la prochaine version (≥ v15.257, vérifier `origin/main` au moment du merge) :
  - `index.html` : `<title>` (~ligne 6), `<em>` footer (~57), label landing `ImmoTrack v` (~3628), `const IMMOTRACK_VERSION` (~3688).
  - `sw.js` ligne 17 : `CACHE_VER = 'immotrack-vX.Y'`.

- [ ] **Step 4: BACKLOG temps réel** — `BACKLOG.md` : passer BAIL-SIGNATURE-DISTANCE C3 à ✅ Livré (version + commit) ; `docs/subjects/BAIL-SIGNATURE-DISTANCE.md` : journal d'avancement (C1+C2+C3 livrés, CORS+DELETE déployés).

- [ ] **Step 5: Commit + push** (fast-forward sur `main`, sans toucher un worktree sale)

```bash
git add index.html sw.js BACKLOG.md docs/subjects/BAIL-SIGNATURE-DISTANCE.md
git commit -m "feat: signature distance bail in-app (C3) — vX.Y [+ Pilotage BACKLOG]"
```

- [ ] **Step 6: Test réel prod** — bail de test, émission → signature locataire sur `sign.html` → polling → archivage Drive → certificat → verrou 🔒. Valider l'aller-retour complet.

---

## Auto-revue (writing-plans)

**1. Couverture spec :**
- §3.1 émission → Tasks 6, 9, 10 ✓ ; §3.2 retour → Tasks 11-13 ✓ ; §3.3 machine à états → `remoteSession.status` Tasks 9/12/13 ✓ ; §3.4 couture → Task 13 (`_ingestSignedBailArtifacts`) ✓ ; §4 PDF+manifeste (risque #1) → Tasks 2, 5, 7, 8 ✓ ; §5 UI variante B → Tasks 10, 16 ✓ ; §6 boucle retour → Task 12 ✓ ; §7 sécurité APP_KEY/ownerToken → Tasks 9, 14, 17 ✓ ; §8 CORS + §8.1 DELETE → Tasks R1, R2 ✓ ; §9 modèle données (signatureSource/contentHash/pdfRef opaques) → Tasks 9, 13 ✓ ; §10 contrat relais (+DELETE) → R2, Task 11 ✓ ; §11 tests+audit → Tasks 2/3/7 + Task 17 ✓ ; §14 hors scope (migration Supabase, durcissement auth) → respecté ✓ ; §15 risques → mitigés (modules purs testés, best-effort DELETE, branche dédiée) ✓.

**2. Placeholders :** code complet pour modules purs (copie verbatim relais testé), relais (Hono exact), couture, clients, certificat, conversion. Les 3 points « à confirmer à l'implémentation » (nom var `pdf` popup, champ logementRef, forme `state.signers[].proof`) sont des **lookups précis bornés** (fichier + lignes), pas des placeholders — l'implémenteur lit les lignes citées. La modale/badges renvoient au **mockup validé** (artefact canonique, pas un placeholder).

**3. Cohérence types :** `sigId` convention `loc-<i>`/`garant-<i>` partagée Task 5f → 7 → 9 → 13 → manifeste → `sign.html`. `pdfRef`/`certRef` opaques `{driveFileId,driveWebViewLink}` cohérents Task 13 ↔ spec §9.2 ↔ badge Task 16. `remoteSession.status` ∈ {draft,sent,chaining,completed,error,expired} cohérent Tasks 9/12/13/16. Manifeste `{v,totalPages,anchors:[{sigId,kind,page,x,y,w,h,luApprouve?}]}` identique entre `buildSignManifest` (Task 7), `manifest.encode` (Task 3) et `sign.html`.

**Dépendances inter-tâches :** R1→R2→R3 (relais) avant Phase 4 réelle. Task 1 (pdf-lib) avant 3/8/16. Task 2 avant 7. Tasks 5+6 (popup) avant 9. Task 9 avant 12. Task 13 dépend de 16 (`_buildBailCertificatePdf`) → **réordonner : faire Task 16 (certificat) avant Task 13**, ou stubber le certificat en 13 puis compléter en 16. **Recommandation : déplacer la sous-fonction `_buildBailCertificatePdf` en amont (avec Task 8/pdf-lib) pour que Task 13 l'appelle directement.**

