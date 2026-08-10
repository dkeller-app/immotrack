# Lien candidat en ligne (relais Cloudflare) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un candidat sans compte de déposer son dossier de location en ligne via un lien sécurisé (relais Cloudflare), puis rapatrier ce dossier dans ImmoTrack au prochain sync et purger le relais.

**Architecture:** Deux sous-systèmes. **PARTIE 1 — Relais** (`Immo-relay-bailsign/relay`) : module candidature ajouté au Worker Hono existant, réutilisant `crypto-utils` / `tokens` / `storage` / `validate` (aucun mécanisme de transport/chiffrement/stockage réinventé). **PARTIE 2 — App** (`Immo/index.html` + `js/core/`) : config relais, modale d'invitation (variante B validée), récupération des dossiers au sync, migration des pièces, purge + RGPD. La Partie 1 est testable seule (curl) et **doit être déployée avant** la Partie 2.

**Tech Stack:** Cloudflare Workers + Hono, KV (pas de R2 — pas de carte bancaire), HMAC SHA-256, Vitest (`@cloudflare/vitest-pool-workers` côté relais, Vitest pur côté app), vanilla JS, IndexedDB + Drive sync existants.

---

## Déviations assumées vs design (`docs/superpowers/specs/2026-06-02-candidature-locataire-design.md`)

1. **R2 → KV.** Le design §11 dit « chiffrées au repos (R2) ». Réalité : le relais n'utilise QUE KV (R2 exige une carte bancaire, refusé). KV est chiffré au repos par Cloudflare. **1 pièce = 1 valeur KV**, plafonnée à 20 Mo (`validate.js`), sous la limite KV de 25 Mio. Multi-upload par case = plusieurs valeurs KV.
2. **APP_KEY côté navigateur.** Une SPA statique (GitHub Pages) ne peut pas cacher un secret. L'app lit `RELAY_BASE` + `APP_KEY` depuis `localStorage` (saisis par le propriétaire dans les Réglages). Acceptable en perso (le propriétaire détient déjà ses identifiants relais). **Caveat commercialisation** : migrer vers une auth par utilisateur (noté, hors périmètre).
3. **Le candidat ne voit JAMAIS son score Confiance** (D7) — le scoring reste 100 % côté app, `dossier.js` ne le calcule ni l'affiche.

---

## File Structure

### Partie 1 — Relais (`Immo-relay-bailsign/relay`)
- Modify `src/validate.js` — ajoute `validatePieceUpload`, `validateDossier`, `validateCandidatureMeta`, `MAX_PIECE_BYTES`.
- Modify `src/storage.js` — ajoute clés + accesseurs candidature (`putCand/getCand/delCand/putPiece/getPiece/delPiece`) + TTL paramétrable.
- Create `src/candidatures.js` — modèle de dossier (miroir de `sessions.js`) : create/load/saveDossier/addPiece/removePiece/markOpened/submit/reopen/revoke/purge.
- Create `src/dossier-page.js` — `renderDossierPage` + `renderDossierError` (miroir de `sign-page.js`).
- Modify `src/index.js` — routes candidature.
- Create `public/dossier.css` — page candidat ImmoTrack-marquée (issue du mockup validé `mockups/candidature/dossier-public.html`, variante A).
- Create `public/dossier.html` — shell servi par `[assets]`.
- Create `public/dossier.js` — wizard 4 étapes + multi-upload + reprise (D13).
- Create `test/candidatures.test.js`, ajoute à `test/validate.test.js`, `test/storage.test.js`, `test/routes.test.js`.

### Partie 2 — App (`Immo`)
- Create `js/core/relay-client.js` — config relais + wrappers fetch + helper pur `buildCandidatUrl`.
- Create `__tests__/helpers/relay-client.test.js` — teste les helpers purs.
- Modify `index.html` — Réglages relais, modale d'invitation (variante B), 3 points d'entrée (D12), récupération au sync + migration pièces + purge, complément (D13).
- Modify `js/core/candidature.js` si un helper de mapping dossier-relais → `DB.candidats` manque (TDD).
- Modify `index-candidature-test.html` (sandbox) en parallèle de `index.html`.
- Modify registre RGPD (`js/core/rgpd.js`) — relais = sous-traitant.

---

## PARTIE 1 — RELAIS (testable seule via curl)

**Working dir pour toute la Partie 1 :** `C:\Users\Did_K\Desktop\Immo-relay-bailsign\relay`
Commande de test : `npm test` (= `vitest run`, voir `package.json`). Un seul fichier : `npx vitest run test/<fichier>.test.js`.

---

### Task 1 : Validation upload pièces + dossier (`validate.js`)

**Files:**
- Modify: `src/validate.js`
- Test: `test/validate.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent** — ajouter à la fin de `test/validate.test.js` :

```js
import { validatePieceUpload, validateDossier, validateCandidatureMeta, MAX_PIECE_BYTES } from '../src/validate.js';

const JPEG_MAGIC = new Uint8Array([0xFF, 0xD8, 0xFF]);
const PNG_MAGIC  = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
const PDFM       = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
function mk(magic, size) { const b = new Uint8Array(size); b.set(magic, 0); return b; }

describe('validatePieceUpload', () => {
  it('accepte un JPEG', () => expect(validatePieceUpload(mk(JPEG_MAGIC, 500), 'image/jpeg').ok).toBe(true));
  it('accepte un PNG', () => expect(validatePieceUpload(mk(PNG_MAGIC, 500), 'image/png').ok).toBe(true));
  it('accepte un PDF', () => expect(validatePieceUpload(mk(PDFM, 500), 'application/pdf').ok).toBe(true));
  it('rejette un type inconnu (magic invalide)', () => {
    const r = validatePieceUpload(mk(new Uint8Array([0,1,2,3]), 500), 'image/png');
    expect(r.ok).toBe(false); expect(r.reason).toBe('bad-format');
  });
  it('rejette un content-type non autorisé', () => {
    const r = validatePieceUpload(mk(JPEG_MAGIC, 500), 'image/gif');
    expect(r.ok).toBe(false); expect(r.reason).toBe('bad-content-type');
  });
  it('rejette si trop volumineux (> 20 Mo)', () => {
    const r = validatePieceUpload(mk(PDFM, MAX_PIECE_BYTES + 1), 'application/pdf');
    expect(r.ok).toBe(false); expect(r.reason).toBe('too-large');
  });
});

describe('validateDossier', () => {
  const ok = { identite: { civilite:'Mme', nom:'Moreau', prenom:'Camille', ddn:'1990-01-01', lieuNaiss:'Lyon', tel:'0600000000', email:'c@x.fr', adressePrecedente:'1 rue X' } };
  it('accepte un dossier identité complet', () => expect(validateDossier(ok).ok).toBe(true));
  it('rejette si identite absente', () => expect(validateDossier({}).reason).toBe('identite-missing'));
  it('rejette un email invalide', () => {
    const bad = { identite: { ...ok.identite, email:'pasunemail' } };
    expect(validateDossier(bad).reason).toBe('bad-email');
  });
  it('rejette un nom vide', () => {
    const bad = { identite: { ...ok.identite, nom:'  ' } };
    expect(validateDossier(bad).reason).toBe('nom-missing');
  });
});

describe('validateCandidatureMeta', () => {
  it('accepte une meta valide', () => expect(validateCandidatureMeta({ logRef:'L1', expDays:14 }).ok).toBe(true));
  it('rejette un logRef vide', () => expect(validateCandidatureMeta({ logRef:'', expDays:14 }).reason).toBe('bad-logref'));
  it('rejette un expDays hors {7,14,30}', () => expect(validateCandidatureMeta({ logRef:'L1', expDays:99 }).reason).toBe('bad-expdays'));
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**
Run : `npx vitest run test/validate.test.js`
Expected : FAIL — `validatePieceUpload is not a function` (export absent).

- [ ] **Step 3 : Implémenter** — ajouter à la fin de `src/validate.js` :

```js
export const MAX_PIECE_BYTES = 20 * 1024 * 1024; // 20 Mo (cf. design : sous la limite KV 25 Mio)

const ALLOWED_PIECE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// Magic bytes : %PDF / JPEG (FF D8 FF) / PNG (89 50 4E 47).
function detectKind(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
  return null;
}

export function validatePieceUpload(bytes, contentType) {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_PIECE_TYPES.includes(ct)) return { ok: false, reason: 'bad-content-type' };
  if (bytes.byteLength > MAX_PIECE_BYTES) return { ok: false, reason: 'too-large' };
  const kind = detectKind(bytes);
  if (!kind) return { ok: false, reason: 'bad-format' };
  if ((kind === 'pdf' && ct !== 'application/pdf') ||
      (kind === 'jpeg' && ct !== 'image/jpeg') ||
      (kind === 'png' && ct !== 'image/png')) {
    return { ok: false, reason: 'content-type-mismatch' };
  }
  return { ok: true, kind };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validation serveur du dossier candidat (en plus du client). Champs d'identité
// obligatoires (D2). La situation/garant sont optionnels au niveau transport ;
// la complétude « métier » est gérée à l'étape submit + côté app (scoring).
export function validateDossier(dossier) {
  if (!dossier || typeof dossier !== 'object' || !dossier.identite || typeof dossier.identite !== 'object') {
    return { ok: false, reason: 'identite-missing' };
  }
  const i = dossier.identite;
  const req = ['civilite', 'nom', 'prenom', 'ddn', 'tel', 'email'];
  for (const f of req) {
    if (typeof i[f] !== 'string' || i[f].trim() === '') {
      return { ok: false, reason: `${f}-missing` };
    }
  }
  if (!EMAIL_RE.test(i.email.trim())) return { ok: false, reason: 'bad-email' };
  return { ok: true };
}

export function validateCandidatureMeta(meta) {
  if (!meta || typeof meta !== 'object') return { ok: false, reason: 'bad-meta' };
  if (typeof meta.logRef !== 'string' || meta.logRef.trim() === '') return { ok: false, reason: 'bad-logref' };
  if (![7, 14, 30].includes(meta.expDays)) return { ok: false, reason: 'bad-expdays' };
  return { ok: true };
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**
Run : `npx vitest run test/validate.test.js`
Expected : PASS (tous les `describe`, anciens + nouveaux).

- [ ] **Step 5 : Commit**

```bash
git add src/validate.js test/validate.test.js
git commit -m "feat(relay): validation upload pièces (JPG/PNG/PDF, 20 Mo) + dossier candidat"
```

---

### Task 2 : Stockage KV candidature (`storage.js`)

**Files:**
- Modify: `src/storage.js`
- Test: `test/storage.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent** — ajouter à la fin de `test/storage.test.js` :

```js
import {
  putCand, getCand, delCand, putPiece, getPiece, delPiece, candidatureTtl
} from '../src/storage.js';

describe('storage candidature (KV)', () => {
  it('putCand puis getCand restitue l\'objet', async () => {
    await putCand(env, 'lid-1', { linkId: 'lid-1', status: 'open' }, 3600);
    expect(await getCand(env, 'lid-1')).toEqual({ linkId: 'lid-1', status: 'open' });
  });
  it('getCand retourne null si absent', async () => {
    expect(await getCand(env, 'lid-absent')).toBeNull();
  });
  it('delCand supprime', async () => {
    await putCand(env, 'lid-2', { linkId: 'lid-2' }, 3600);
    await delCand(env, 'lid-2');
    expect(await getCand(env, 'lid-2')).toBeNull();
  });
  it('putPiece/getPiece restitue les octets, delPiece supprime', async () => {
    const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 7, 8]);
    await putPiece(env, 'lid-3', 'p1', bytes, 3600);
    expect(new Uint8Array(await getPiece(env, 'lid-3', 'p1'))).toEqual(bytes);
    await delPiece(env, 'lid-3', 'p1');
    expect(await getPiece(env, 'lid-3', 'p1')).toBeNull();
  });
  it('candidatureTtl = expDays*86400 + grâce 7 j', () => {
    expect(candidatureTtl(14)).toBe(14 * 86400 + 7 * 86400);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**
Run : `npx vitest run test/storage.test.js`
Expected : FAIL — `putCand is not a function`.

- [ ] **Step 3 : Implémenter** — ajouter à la fin de `src/storage.js` :

```js
// ── Candidature (dossier locataire en ligne) ──
// Même boîte KV que la signature. Métadonnées + dossier dans une valeur ;
// chaque pièce dans sa propre valeur (1 pièce = 1 valeur, ≤ 20 Mo, cf. validate.js).
// TTL = durée de validité choisie + grâce de 7 j (backstop si l'app ne purge jamais).
export const CANDIDATURE_GRACE_SECONDS = 7 * 24 * 60 * 60;
export function candidatureTtl(expDays) {
  return expDays * 24 * 60 * 60 + CANDIDATURE_GRACE_SECONDS;
}

const candKey = (lid) => `cand:${lid}`;
const candPieceKey = (lid, pid) => `cand-piece/${lid}/${pid}`;

export async function putCand(env, lid, obj, ttlSeconds) {
  await env.SESSIONS_KV.put(candKey(lid), JSON.stringify(obj), { expirationTtl: ttlSeconds });
}
export async function getCand(env, lid) {
  const raw = await env.SESSIONS_KV.get(candKey(lid));
  return raw ? JSON.parse(raw) : null;
}
export async function delCand(env, lid) {
  await env.SESSIONS_KV.delete(candKey(lid));
}
export async function putPiece(env, lid, pid, bytes, ttlSeconds) {
  await env.SESSIONS_KV.put(candPieceKey(lid, pid), bytes, { expirationTtl: ttlSeconds });
}
export async function getPiece(env, lid, pid) {
  return env.SESSIONS_KV.get(candPieceKey(lid, pid), { type: 'arrayBuffer' });
}
export async function delPiece(env, lid, pid) {
  await env.SESSIONS_KV.delete(candPieceKey(lid, pid));
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**
Run : `npx vitest run test/storage.test.js`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/storage.js test/storage.test.js
git commit -m "feat(relay): stockage KV candidature (meta + pièces, TTL paramétrable)"
```

---

### Task 3 : Modèle candidature (`candidatures.js`)

**Files:**
- Create: `src/candidatures.js`
- Test: `test/candidatures.test.js`

Modèle KV (1 valeur `cand:${linkId}`) :
```
{ linkId, logRef, bienLabel, loyer, message, expDays,
  createdAt, expiresAt, openedAt, submittedAt,
  status: 'open'|'submitted'|'revoked',
  dossier: { identite, situation, garant } | null,
  pieces: [ { pieceId, categorie, filename, contentType, size, uploadedAt } ],
  complementNote: string|null }
```

- [ ] **Step 1 : Écrire les tests qui échouent** — créer `test/candidatures.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  createCandidature, loadCandidature, saveDossier, addPiece, removePiece,
  markOpened, submitCandidature, reopenForComplement, revokeCandidature, purgeCandidature
} from '../src/candidatures.js';
import { getCand, getPiece } from '../src/storage.js';

const base = { logRef: 'L1', bienLabel: 'T2 rue des Lilas', loyer: 1100, message: 'Bonjour', expDays: 14 };
const dossier = { identite: { civilite:'Mme', nom:'Moreau', prenom:'Camille', ddn:'1990-01-01', lieuNaiss:'Lyon', tel:'0600000000', email:'c@x.fr', adressePrecedente:'1 rue X' }, situation: { contrat:'CDI', employeur:'ACME', revenus:3200 }, garant: null };

describe('candidatures', () => {
  it('createCandidature génère un linkId 64 hex, status open, expiresAt cohérent', async () => {
    const { linkId, candidature } = await createCandidature(env, base);
    expect(linkId).toMatch(/^[0-9a-f]{64}$/);
    expect(candidature.status).toBe('open');
    expect(candidature.dossier).toBeNull();
    expect(candidature.pieces).toEqual([]);
    expect(new Date(candidature.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('saveDossier enregistre le dossier, status reste open', async () => {
    const { linkId } = await createCandidature(env, base);
    const c = await saveDossier(env, linkId, dossier);
    expect(c.dossier.identite.nom).toBe('Moreau');
    expect(c.status).toBe('open');
  });

  it('addPiece stocke les octets + meta, removePiece les retire', async () => {
    const { linkId } = await createCandidature(env, base);
    const bytes = new Uint8Array([0x25,0x50,0x44,0x46,1,2]);
    const { pieceId, candidature } = await addPiece(env, linkId, { categorie:'identite', filename:'cni.pdf', contentType:'application/pdf', bytes });
    expect(candidature.pieces).toHaveLength(1);
    expect(candidature.pieces[0].pieceId).toBe(pieceId);
    expect(new Uint8Array(await getPiece(env, linkId, pieceId))).toEqual(bytes);
    const after = await removePiece(env, linkId, pieceId);
    expect(after.pieces).toHaveLength(0);
    expect(await getPiece(env, linkId, pieceId)).toBeNull();
  });

  it('markOpened pose openedAt une seule fois', async () => {
    const { linkId } = await createCandidature(env, base);
    const c1 = await markOpened(env, linkId);
    expect(c1.openedAt).toBeTruthy();
    const c2 = await markOpened(env, linkId);
    expect(c2.openedAt).toBe(c1.openedAt);
  });

  it('submitCandidature passe open → submitted', async () => {
    const { linkId } = await createCandidature(env, base);
    await saveDossier(env, linkId, dossier);
    const c = await submitCandidature(env, linkId);
    expect(c.status).toBe('submitted');
    expect(c.submittedAt).toBeTruthy();
  });

  it('reopenForComplement passe submitted → open + note', async () => {
    const { linkId } = await createCandidature(env, base);
    await saveDossier(env, linkId, dossier);
    await submitCandidature(env, linkId);
    const c = await reopenForComplement(env, linkId, 'Merci d\'ajouter le contrat');
    expect(c.status).toBe('open');
    expect(c.complementNote).toBe('Merci d\'ajouter le contrat');
  });

  it('revokeCandidature passe status → revoked', async () => {
    const { linkId } = await createCandidature(env, base);
    expect((await revokeCandidature(env, linkId)).status).toBe('revoked');
  });

  it('purgeCandidature supprime meta + toutes les pièces', async () => {
    const { linkId } = await createCandidature(env, base);
    const { pieceId } = await addPiece(env, linkId, { categorie:'identite', filename:'a.pdf', contentType:'application/pdf', bytes:new Uint8Array([0x25,0x50,0x44,0x46]) });
    await purgeCandidature(env, linkId);
    expect(await loadCandidature(env, linkId)).toBeNull();
    expect(await getPiece(env, linkId, pieceId)).toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**
Run : `npx vitest run test/candidatures.test.js`
Expected : FAIL — module `../src/candidatures.js` introuvable.

- [ ] **Step 3 : Implémenter** — créer `src/candidatures.js` :

```js
import { randomHex } from './crypto-utils.js';
import { putCand, getCand, delCand, putPiece, getPiece, delPiece, candidatureTtl } from './storage.js';

function ttlOf(c) { return candidatureTtl(c.expDays); }

export async function createCandidature(env, { logRef, bienLabel, loyer, message, expDays }) {
  const linkId = randomHex(32); // 256 bits, inguessable (D11)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expDays * 24 * 60 * 60 * 1000);
  const candidature = {
    linkId, logRef, bienLabel: bienLabel || '', loyer: Number(loyer) || 0,
    message: message || '', expDays,
    createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(),
    openedAt: null, submittedAt: null,
    status: 'open', dossier: null, pieces: [], complementNote: null
  };
  await putCand(env, linkId, candidature, ttlOf(candidature));
  return { linkId, candidature };
}

export async function loadCandidature(env, linkId) {
  return getCand(env, linkId);
}

export async function saveDossier(env, linkId, dossier) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  c.dossier = dossier;
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function addPiece(env, linkId, { categorie, filename, contentType, bytes }) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  const pieceId = randomHex(8);
  await putPiece(env, linkId, pieceId, bytes, ttlOf(c));
  c.pieces.push({
    pieceId, categorie: String(categorie || 'autre').slice(0, 40),
    filename: String(filename || 'piece').slice(0, 200),
    contentType, size: bytes.byteLength, uploadedAt: new Date().toISOString()
  });
  await putCand(env, linkId, c, ttlOf(c));
  return { pieceId, candidature: c };
}

export async function removePiece(env, linkId, pieceId) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  await delPiece(env, linkId, pieceId);
  c.pieces = c.pieces.filter((p) => p.pieceId !== pieceId);
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function markOpened(env, linkId) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  if (!c.openedAt) {
    c.openedAt = new Date().toISOString();
    await putCand(env, linkId, c, ttlOf(c));
  }
  return c;
}

export async function submitCandidature(env, linkId) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  c.status = 'submitted';
  c.submittedAt = new Date().toISOString();
  c.complementNote = null;
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function reopenForComplement(env, linkId, note) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  c.status = 'open';
  c.complementNote = typeof note === 'string' ? note.slice(0, 500) : null;
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function revokeCandidature(env, linkId) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  c.status = 'revoked';
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function purgeCandidature(env, linkId) {
  const c = await getCand(env, linkId);
  if (c) { for (const p of c.pieces) await delPiece(env, linkId, p.pieceId); }
  await delCand(env, linkId);
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**
Run : `npx vitest run test/candidatures.test.js`
Expected : PASS (9 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/candidatures.js test/candidatures.test.js
git commit -m "feat(relay): modèle candidature (création, dossier, pièces, submit, complément, purge)"
```

---

### Task 4 : Rendu de la page candidat (`dossier-page.js`)

**Files:**
- Create: `src/dossier-page.js`
- Test: `test/dossier-page.test.js`

Le token candidat et l'état du dossier (pour la reprise D13) sont **injectés côté serveur** dans `window.__*`, jamais dans l'URL. Le candidat ne reçoit **pas** le score Confiance (D7) — il n'est pas dans les données injectées.

- [ ] **Step 1 : Écrire les tests qui échouent** — créer `test/dossier-page.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { renderDossierPage, renderDossierError } from '../src/dossier-page.js';

const cand = { linkId: 'abc', bienLabel: 'T2 <script>', loyer: 1100, message: 'Bonjour', status: 'open',
  dossier: { identite: { nom: 'Moreau' } }, pieces: [{ pieceId: 'p1', categorie: 'identite', filename: 'cni.pdf' }], complementNote: null };

describe('renderDossierPage', () => {
  const html = renderDossierPage({ candidature: cand, candidatToken: 'TOK.SIG' });
  it('injecte le token et le linkId côté serveur', () => {
    expect(html).toContain('window.__CAND_TOKEN__ = "TOK.SIG"');
    expect(html).toContain('window.__LINK_ID__ = "abc"');
  });
  it('embarque l\'état du dossier pour la reprise (D13) mais aucun score', () => {
    expect(html).toContain('window.__CAND__');
    expect(html.toLowerCase()).not.toContain('confiance');
    expect(html.toLowerCase()).not.toContain('score');
  });
  it('neutralise </script> dans les données injectées (anti-injection)', () => {
    expect(html).not.toContain('<script>'.replace('s', 's') + 'T2'); // le label brut ne doit pas casser le <script>
    expect(html).toContain('\\u003c'); // < échappé dans le JSON injecté
  });
  it('charge /dossier.css et /dossier.js', () => {
    expect(html).toContain('/dossier.css');
    expect(html).toContain('/dossier.js');
  });
});

describe('renderDossierError', () => {
  it('échappe le message et renvoie un HTML', () => {
    const html = renderDossierError('Lien <expiré>');
    expect(html).toContain('Lien &lt;expiré&gt;');
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**
Run : `npx vitest run test/dossier-page.test.js`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter** — créer `src/dossier-page.js` :

```js
const ASSET_VERSION = '1';

function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function renderDossierPage({ candidature, candidatToken }) {
  // Données strictement nécessaires au formulaire — AUCUN score Confiance (D7).
  const data = {
    bienLabel: candidature.bienLabel || '',
    loyer: candidature.loyer || 0,
    message: candidature.message || '',
    status: candidature.status,
    complementNote: candidature.complementNote || null,
    // Reprise (D13) : on renvoie le dossier déjà saisi + la liste des pièces (méta only).
    dossier: candidature.dossier || null,
    pieces: (candidature.pieces || []).map((p) => ({ pieceId: p.pieceId, categorie: p.categorie, filename: p.filename }))
  };
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Déposer mon dossier de location</title>
<link rel="stylesheet" href="/dossier.css?v=${ASSET_VERSION}">
</head>
<body>
<main id="app" aria-live="polite"><p id="boot">Chargement…</p></main>
<script>
window.__CAND_TOKEN__ = ${jsonForScript(candidatToken)};
window.__LINK_ID__ = ${jsonForScript(candidature.linkId)};
window.__CAND__ = ${jsonForScript(data)};
</script>
<script type="module" src="/dossier.js?v=${ASSET_VERSION}"></script>
</body>
</html>`;
}

export function renderDossierError(message, title = 'Dossier de location') {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title><link rel="stylesheet" href="/dossier.css?v=${ASSET_VERSION}"></head>
<body><main id="app"><div class="state-card"><h1>${escHtml(message)}</h1></div></main></body>
</html>`;
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**
Run : `npx vitest run test/dossier-page.test.js`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/dossier-page.js test/dossier-page.test.js
git commit -m "feat(relay): rendu page candidat (token injecté server-side, anti-injection, sans score)"
```

---

### Task 5 : Routes candidature (`index.js`)

**Files:**
- Modify: `src/index.js` (imports + handlers, avant `export default app;`)
- Test: `test/cand-routes.test.js`

Routes : `POST /candidatures` (Bearer APP_KEY) · `GET /d/:linkId` (public) · `GET|POST /api/candidatures/:linkId` (token candidat : lire / écrire dossier) · `POST .../piece` + `DELETE .../piece/:pid` (candidat) · `POST .../submit` (candidat) · `GET .../result` + `GET .../piece/:pid` + `POST .../reopen` + `POST .../revoke` + `DELETE .../:linkId` (ownerToken).

- [ ] **Step 1 : Étendre les imports** en tête de `src/index.js` :

```js
// étendre l'import storage existant :
import { SESSION_TTL_SECONDS, getOriginalPdf, getSignedPdf, candidatureTtl } from './storage.js';
// étendre l'import validate existant :
import { validatePdfUpload, validateSigners, validatePieceUpload, validateDossier, validateCandidatureMeta } from './validate.js';
// nouveaux imports :
import {
  createCandidature, loadCandidature, saveDossier, addPiece, removePiece,
  markOpened, submitCandidature, reopenForComplement, revokeCandidature, purgeCandidature
} from './candidatures.js';
import { renderDossierPage, renderDossierError } from './dossier-page.js';
```

- [ ] **Step 2 : Écrire le test qui échoue** — créer `test/cand-routes.test.js` (voir Step 4 ci-dessous pour le contenu complet ; l'écrire AVANT d'implémenter).

- [ ] **Step 3 : Implémenter les routes** — insérer juste avant `export default app;` dans `src/index.js` :

```js
// ════════════════ CANDIDATURE (dossier locataire en ligne) ════════════════

async function requireCandidat(c, linkId) {
  const token = c.req.header('X-Cand-Token') || '';
  if (!token) return { error: c.json({ error: 'missing token' }, 401) };
  const ver = await verifyToken(token, c.env.SIGNING_SECRET);
  if (!ver.valid || ver.payload.role !== 'candidat' || ver.payload.lid !== linkId) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  const cand = await loadCandidature(c.env, linkId);
  if (!cand) return { error: c.json({ error: 'not found' }, 404) };
  if (cand.status === 'revoked') return { error: c.json({ error: 'revoked' }, 410) };
  if (new Date(cand.expiresAt).getTime() < Date.now()) return { error: c.json({ error: 'expired' }, 410) };
  return { cand };
}

async function requireCandOwner(c, linkId) {
  const token = c.req.header('X-Owner-Token') || '';
  if (!token) return { error: c.json({ error: 'missing token' }, 401) };
  const ver = await verifyToken(token, c.env.SIGNING_SECRET);
  if (!ver.valid || ver.payload.role !== 'cand-owner' || ver.payload.lid !== linkId) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  const cand = await loadCandidature(c.env, linkId);
  if (!cand) return { error: c.json({ error: 'not found' }, 404) };
  return { cand };
}

// Le bailleur (app) crée une invitation. Auth = Bearer APP_KEY (comme POST /sessions).
app.post('/candidatures', async (c) => {
  const auth = c.req.header('Authorization') || '';
  if (!timingSafeEqualStr(auth, `Bearer ${c.env.APP_KEY}`)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  let meta;
  try { meta = await c.req.json(); } catch { return c.json({ error: 'bad json' }, 400); }
  const v = validateCandidatureMeta(meta);
  if (!v.ok) return c.json({ error: v.reason }, 400);

  const { linkId, candidature } = await createCandidature(c.env, {
    logRef: meta.logRef, bienLabel: meta.bienLabel, loyer: meta.loyer,
    message: meta.message, expDays: meta.expDays
  });
  const exp = Math.floor(Date.now() / 1000) + candidatureTtl(meta.expDays);
  const ownerToken = await createToken(
    { lid: linkId, role: 'cand-owner', jti: randomHex(8), exp },
    c.env.SIGNING_SECRET
  );
  const candidatUrl = new URL(`/d/${linkId}`, c.req.url).toString();
  return c.json({ linkId, candidatUrl, ownerToken, expiresAt: candidature.expiresAt }, 201);
});

// Ping santé authentifié — alimente le bouton « Tester la connexion » des Réglages
// côté app. Vérifie d'un seul coup que la base répond ET que l'APP_KEY est acceptée,
// sans écrire dans KV (zéro pollution). Auth = Bearer APP_KEY.
app.get('/api/ping', (c) => {
  const auth = c.req.header('Authorization') || '';
  if (!timingSafeEqualStr(auth, `Bearer ${c.env.APP_KEY}`)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.json({ ok: true, ts: Date.now() });
});

// Page publique candidat (sans compte). Token candidat injecté server-side.
app.get('/d/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const cand = await loadCandidature(c.env, linkId);
  if (!cand) return c.html(renderDossierError('Lien invalide ou expiré.'), 404);
  if (cand.status === 'revoked') return c.html(renderDossierError('Ce lien a été désactivé par le propriétaire.'), 410);
  if (new Date(cand.expiresAt).getTime() < Date.now()) return c.html(renderDossierError('Ce lien a expiré.'), 410);
  const opened = await markOpened(c.env, linkId);
  const exp = Math.floor(new Date(opened.expiresAt).getTime() / 1000);
  const candidatToken = await createToken(
    { lid: linkId, role: 'candidat', jti: randomHex(8), exp },
    c.env.SIGNING_SECRET
  );
  return c.html(renderDossierPage({ candidature: opened, candidatToken }));
});

// Candidat : relit l'état de son dossier (reprise D13).
app.get('/api/candidatures/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  const cand = guard.cand;
  return c.json({
    status: cand.status, bienLabel: cand.bienLabel, message: cand.message,
    complementNote: cand.complementNote,
    dossier: cand.dossier,
    pieces: cand.pieces.map((p) => ({ pieceId: p.pieceId, categorie: p.categorie, filename: p.filename }))
  });
});

// Candidat : enregistre/complète son dossier (champs identité/situation/garant).
app.post('/api/candidatures/:linkId/dossier', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'open') return c.json({ error: 'not-open' }, 409);
  let dossier;
  try { dossier = await c.req.json(); } catch { return c.json({ error: 'bad json' }, 400); }
  const v = validateDossier(dossier);
  if (!v.ok) return c.json({ error: v.reason }, 400);
  await saveDossier(c.env, linkId, dossier);
  return c.json({ ok: true });
});

// Candidat : upload d'UNE pièce (octets bruts + en-têtes catégorie/nom).
app.post('/api/candidatures/:linkId/piece', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'open') return c.json({ error: 'not-open' }, 409);
  const contentType = c.req.header('content-type') || '';
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const v = validatePieceUpload(bytes, contentType);
  if (!v.ok) return c.json({ error: v.reason }, 400);
  let filename = 'piece';
  try { filename = decodeURIComponent(c.req.header('X-Piece-Filename') || '') || 'piece'; } catch { filename = c.req.header('X-Piece-Filename') || 'piece'; }
  const { pieceId } = await addPiece(c.env, linkId, {
    categorie: c.req.header('X-Piece-Categorie') || 'autre',
    filename,
    contentType, bytes
  });
  return c.json({ pieceId }, 201);
});

// Candidat : supprime une de ses pièces (remplacement avant envoi).
app.delete('/api/candidatures/:linkId/piece/:pieceId', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'open') return c.json({ error: 'not-open' }, 409);
  await removePiece(c.env, linkId, c.req.param('pieceId'));
  return c.json({ ok: true });
});

// Candidat : finalise l'envoi (open → submitted).
app.post('/api/candidatures/:linkId/submit', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'open') return c.json({ error: 'not-open' }, 409);
  const v = validateDossier(guard.cand.dossier || {});
  if (!v.ok) return c.json({ error: v.reason }, 400);
  const cand = await submitCandidature(c.env, linkId);
  return c.json({ status: cand.status, submittedAt: cand.submittedAt });
});

// Bailleur : récupère le dossier soumis (méta + dossier). Pièces via route dédiée.
app.get('/api/candidatures/:linkId/result', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'submitted') return c.json({ error: 'not-submitted', status: guard.cand.status }, 409);
  const cand = guard.cand;
  return c.json({
    linkId: cand.linkId, logRef: cand.logRef, bienLabel: cand.bienLabel, loyer: cand.loyer,
    status: cand.status, submittedAt: cand.submittedAt,
    dossier: cand.dossier,
    pieces: cand.pieces.map((p) => ({ pieceId: p.pieceId, categorie: p.categorie, filename: p.filename, contentType: p.contentType, size: p.size }))
  });
});

// Bailleur : télécharge UNE pièce (pour rapatriement dans la GED de l'app).
app.get('/api/candidatures/:linkId/piece/:pieceId', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  const meta = guard.cand.pieces.find((p) => p.pieceId === c.req.param('pieceId'));
  if (!meta) return c.json({ error: 'piece not found' }, 404);
  const bytes = await getPiece(c.env, linkId, meta.pieceId);
  if (!bytes) return c.json({ error: 'piece missing' }, 404);
  return new Response(bytes, { headers: { 'content-type': meta.contentType || 'application/octet-stream' } });
});

// Bailleur : demande de complément (D13) — submitted → open + note.
app.post('/api/candidatures/:linkId/reopen', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  let body = {};
  try { body = await c.req.json(); } catch {}
  const cand = await reopenForComplement(c.env, linkId, body && body.note);
  return c.json({ status: cand.status });
});

// Bailleur : révoque le lien (le rend inutilisable immédiatement).
app.post('/api/candidatures/:linkId/revoke', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  const cand = await revokeCandidature(c.env, linkId);
  return c.json({ status: cand.status });
});

// Bailleur : purge (accusé de réception après rapatriement dans l'app).
app.delete('/api/candidatures/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  await purgeCandidature(c.env, linkId);
  return c.json({ ok: true });
});
```

> Note : `getPiece` doit être importé dans `index.js` (ajouter à l'import storage existant : `getPiece`).

- [ ] **Step 4 : Contenu du test** `test/cand-routes.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { verifyToken } from '../src/tokens.js';

const PDF = () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
const DOSSIER = { identite: { civilite:'Mme', nom:'Moreau', prenom:'Camille', ddn:'1990-01-01', lieuNaiss:'Lyon', tel:'0600000000', email:'c@x.fr', adressePrecedente:'1 rue X' }, situation:{ contrat:'CDI', employeur:'ACME', revenus:3200 }, garant:null };

async function createInvite() {
  const res = await SELF.fetch('https://relay.test/candidatures', {
    method: 'POST', headers: { Authorization: `Bearer ${env.APP_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ logRef: 'L1', bienLabel: 'T2 Lilas', loyer: 1100, message: 'Bonjour', expDays: 14 })
  });
  return res;
}
async function candTokenOf(linkId) {
  const res = await SELF.fetch(`https://relay.test/d/${linkId}`);
  return (await res.text()).match(/window\.__CAND_TOKEN__\s*=\s*"([^"]+)"/)[1];
}

describe('POST /candidatures', () => {
  it('401 sans APP_KEY', async () => {
    const res = await SELF.fetch('https://relay.test/candidatures', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ logRef:'L1', expDays:14 }) });
    expect(res.status).toBe(401);
  });
  it('201 + linkId + ownerToken cand-owner valide', async () => {
    const res = await createInvite();
    expect(res.status).toBe(201);
    const b = await res.json();
    expect(b.linkId).toMatch(/^[0-9a-f]{64}$/);
    expect(b.candidatUrl).toContain(`/d/${b.linkId}`);
    const ver = await verifyToken(b.ownerToken, env.SIGNING_SECRET);
    expect(ver.payload.role).toBe('cand-owner');
    expect(ver.payload.lid).toBe(b.linkId);
  });
  it('400 expDays invalide', async () => {
    const res = await SELF.fetch('https://relay.test/candidatures', { method:'POST', headers:{ Authorization:`Bearer ${env.APP_KEY}`, 'content-type':'application/json'}, body: JSON.stringify({ logRef:'L1', expDays:99 }) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/ping', () => {
  it('401 sans APP_KEY', async () => {
    expect((await SELF.fetch('https://relay.test/api/ping')).status).toBe(401);
  });
  it('200 { ok:true } avec APP_KEY', async () => {
    const res = await SELF.fetch('https://relay.test/api/ping', { headers: { Authorization: `Bearer ${env.APP_KEY}` } });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe('GET /d/:linkId', () => {
  it('404 si inconnu', async () => expect((await SELF.fetch('https://relay.test/d/deadbeef')).status).toBe(404));
  it('sert le HTML + injecte un candToken valide', async () => {
    const { linkId } = await (await createInvite()).json();
    const res = await SELF.fetch(`https://relay.test/d/${linkId}`);
    expect(res.status).toBe(200);
    const ver = await verifyToken(await candTokenOf(linkId), env.SIGNING_SECRET);
    expect(ver.payload.role).toBe('candidat');
    expect(ver.payload.lid).toBe(linkId);
  });
});

describe('flux candidat complet', () => {
  it('dossier + pièce + submit, puis lecture bailleur + pièce + purge', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);

    // dossier
    const d = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/dossier`, {
      method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/json' }, body: JSON.stringify(DOSSIER) });
    expect(d.status).toBe(200);

    // pièce
    const p = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece`, {
      method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/pdf', 'X-Piece-Categorie':'identite', 'X-Piece-Filename':'cni.pdf' }, body: PDF() });
    expect(p.status).toBe(201);
    const { pieceId } = await p.json();

    // submit
    const s = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    expect((await s.json()).status).toBe('submitted');

    // bailleur : result
    const r = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/result`, { headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.dossier.identite.nom).toBe('Moreau');
    expect(body.pieces[0].pieceId).toBe(pieceId);

    // bailleur : pièce
    const pb = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece/${pieceId}`, { headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect(pb.status).toBe(200);
    expect(new Uint8Array(await pb.arrayBuffer())[0]).toBe(0x25);

    // purge
    const pu = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}`, { method:'DELETE', headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect(pu.status).toBe(200);
    const after = await SELF.fetch(`https://relay.test/d/${invite.linkId}`);
    expect(after.status).toBe(404);
  });

  it('result 409 tant que non soumis', async () => {
    const invite = await (await createInvite()).json();
    const r = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/result`, { headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect(r.status).toBe(409);
  });

  it('complément D13 : reopen remet en open et ré-autorise l\'écriture', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/dossier`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/json' }, body: JSON.stringify(DOSSIER) });
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    const ro = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/reopen`, { method:'POST', headers:{ 'X-Owner-Token': invite.ownerToken, 'content-type':'application/json' }, body: JSON.stringify({ note:'Ajoutez le contrat' }) });
    expect((await ro.json()).status).toBe('open');
    const p = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/pdf', 'X-Piece-Categorie':'situation', 'X-Piece-Filename':'contrat.pdf' }, body: PDF() });
    expect(p.status).toBe(201);
  });

  it('revoke rend le lien 410', async () => {
    const invite = await (await createInvite()).json();
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/revoke`, { method:'POST', headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect((await SELF.fetch(`https://relay.test/d/${invite.linkId}`)).status).toBe(410);
  });

  it('upload non conforme rejeté 400', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    const p = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/pdf' }, body: new Uint8Array([1,2,3,4]) });
    expect(p.status).toBe(400);
  });
});
```

- [ ] **Step 5 : Lancer toute la suite relais**
Run : `npm test`
Expected : PASS (anciens tests signature intacts + nouveaux candidature).

- [ ] **Step 6 : Commit**

```bash
git add src/index.js test/cand-routes.test.js
git commit -m "feat(relay): routes candidature (invitation, dépôt candidat, récupération bailleur, complément, purge)"
```

---

### Task 6 : Feuille de style publique `public/dossier.css`

**Files:**
- Create: `C:\Users\Did_K\Desktop\Immo-relay-bailsign\relay\public\dossier.css`

C'est la CSS de la page que voit le candidat. Elle reprend **mot pour mot** les tokens ImmoTrack et les composants validés dans le mockup `mockups/candidature/dossier-public.html` (section `<style>` lignes 15-178), **moins** le chrome de mockup (`.mock-bar`, `.frame-host`, `.frame`, `.view`). Sur la vraie page, `.pub` occupe tout le viewport (mobile-first), pas un cadre simulé. Aucune couleur inventée.

> Pas de test unitaire : cette CSS est validée visuellement dans un vrai navigateur (règle gravée « mockup-first / tester dans vrai navigateur ») contre le mockup déjà approuvé, à l'étape de déploiement (Task 8).

- [ ] **Step 1 : Créer le fichier** avec exactement ce contenu :

```css
/* ════════════════════════════════════════════════════════════════════════
   dossier.css — page publique de dépôt de candidature (relais Cloudflare).
   Candidat sans compte, mobile-first. Tokens ImmoTrack (css/main.css) +
   ergonomie mobile (actionbar collée, boutons 46px, inputs 16px anti-zoom iOS,
   safe-area). Source visuelle validée : mockups/candidature/dossier-public.html.
   AUCUNE couleur inventée.
   ════════════════════════════════════════════════════════════════════════ */
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
:root{
  --bg:#eef2f7;--sur:#fff;--sur2:#f4f7fb;--sur3:#e8eef6;
  --bor:rgba(0,0,0,.10);--bor2:rgba(0,0,0,.06);
  --t1:#1a2332;--t2:#5a6e87;--t3:#9aabbf;
  --blu:#3b7ef6;--blu-d:#2d6de0;--grn:#16a34a;--red:#dc2626;--ora:#ea580c;--pur:#7c3aed;
  --r:8px;--rl:14px;
  --shadow:0 1px 3px rgba(0,0,0,.07),0 4px 18px rgba(0,0,0,.07);
  --shadow-lg:0 8px 40px rgba(0,0,0,.13),0 2px 8px rgba(0,0,0,.07);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#f5f7fb;color:var(--t1);font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5}

/* La page occupe tout le viewport ; .pub gère le layout en colonne. */
.pub{display:flex;flex-direction:column;min-height:100dvh;background:#f5f7fb;max-width:680px;margin:0 auto}

/* En-tête : marque + bien + réassurance */
.pub-head{flex:none;background:var(--sur);border-bottom:1px solid var(--bor);padding:12px 16px}
.pub-brand{display:flex;align-items:center;gap:8px;font-family:'Manrope',sans-serif;font-weight:800;font-size:15px;color:var(--t1);letter-spacing:-.01em}
.pub-brand .dot{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#0E73F6,#00CCBC);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800}
.pub-brand .by{margin-left:auto;font-family:'IBM Plex Sans';font-weight:500;font-size:11px;color:var(--t3)}
.prop{margin-top:10px;display:flex;gap:10px;align-items:flex-start;background:var(--sur2);border:1px solid var(--bor2);border-radius:var(--r);padding:10px 12px}
.prop .ico{font-size:20px;line-height:1.2}
.prop .ttl{font-weight:700;font-size:14px}
.prop .meta{font-size:12.5px;color:var(--t2);margin-top:1px}
.prop .rent{font-family:'Manrope',sans-serif;font-weight:700;color:var(--t1);font-size:13px;white-space:nowrap;text-align:right}
.reassure{display:flex;gap:6px;align-items:center;font-size:11.5px;color:var(--t2);margin-top:8px}
.reassure b{color:var(--grn);font-weight:600}

/* progression (wizard) */
.steps{flex:none;display:flex;gap:0;padding:10px 16px 4px;background:var(--sur);border-bottom:1px solid var(--bor)}
.steps .st{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;position:relative}
.steps .st .n{width:26px;height:26px;border-radius:50%;background:var(--sur3);color:var(--t2);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;font-family:'Manrope',sans-serif;z-index:2;border:2px solid transparent}
.steps .st .lb{font-size:10px;color:var(--t3);font-weight:600;text-align:center;letter-spacing:.01em}
.steps .st.done .n{background:var(--grn);color:#fff}
.steps .st.cur .n{background:var(--blu);color:#fff;border-color:rgba(59,126,246,.25);box-shadow:0 0 0 3px rgba(59,126,246,.15)}
.steps .st.cur .lb{color:var(--blu)}
.steps .st::before{content:'';position:absolute;top:13px;left:-50%;width:100%;height:2px;background:var(--sur3);z-index:1}
.steps .st:first-child::before{display:none}
.steps .st.done::before,.steps .st.cur::before{background:var(--grn)}

/* zone défilante */
.scroll{flex:1;overflow:auto;padding:16px;min-height:0}
.sec{background:var(--sur);border:1px solid var(--bor);border-radius:var(--rl);padding:16px;margin-bottom:14px;box-shadow:var(--shadow)}
.sec[hidden]{display:none}
.sec-h{display:flex;align-items:center;gap:9px;font-weight:700;font-size:15px;font-family:'Manrope',sans-serif;margin-bottom:4px}
.sec-h .si{width:28px;height:28px;border-radius:8px;background:rgba(59,126,246,.10);color:var(--blu);display:flex;align-items:center;justify-content:center;font-size:15px}
.sec-h .opt{margin-left:auto;font-family:'IBM Plex Sans';font-weight:500;font-size:11px;color:var(--t3)}
.sec-sub{font-size:12.5px;color:var(--t2);margin-bottom:12px}

.field{margin-bottom:12px}
.field:last-child{margin-bottom:0}
.field>label{display:block;font-size:12.5px;font-weight:600;color:var(--t2);margin-bottom:5px}
.field .req{color:var(--red)}
.inp{width:100%;background:var(--sur);border:1.5px solid var(--bor);border-radius:var(--r);color:var(--t1);padding:12px;font-size:16px;font-family:'IBM Plex Sans',sans-serif;transition:border .15s,box-shadow .15s}
.inp:focus{outline:none;border-color:var(--blu);box-shadow:0 0 0 3px rgba(59,126,246,.12)}
.inp::placeholder{color:var(--t3)}
.inp.err{border-color:var(--red);box-shadow:0 0 0 3px rgba(220,38,38,.12)}
.err-msg{font-size:11.5px;color:var(--red);margin-top:4px;display:flex;gap:4px;align-items:center}
select.inp{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%235a6e87' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:460px){.row2{grid-template-columns:1fr}}

/* segmented (civilité) */
.segc{display:inline-flex;background:var(--sur2);border:1px solid var(--bor);border-radius:var(--r);padding:3px;gap:2px;flex-wrap:wrap}
.segc button{background:transparent;border:none;padding:9px 16px;border-radius:6px;font-size:14px;font-weight:600;color:var(--t2);cursor:pointer;font-family:inherit}
.segc button.on{background:var(--blu);color:#fff}

/* toggle garant */
.switch-row{display:flex;align-items:center;gap:12px;background:var(--sur2);border:1px solid var(--bor);border-radius:var(--r);padding:12px}
.switch{width:46px;height:27px;border-radius:20px;background:var(--sur3);position:relative;flex:none;cursor:pointer;transition:background .15s;border:1px solid var(--bor)}
.switch.on{background:var(--blu)}
.switch::after{content:'';position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.switch.on::after{left:21px}
.switch-row .tx{font-size:13.5px;font-weight:600}
.switch-row .tx small{display:block;font-weight:400;color:var(--t2);font-size:11.5px}

/* info box */
.info{display:flex;gap:9px;background:rgba(59,126,246,.07);border:1px solid rgba(59,126,246,.18);border-radius:var(--r);padding:10px 12px;font-size:12px;color:var(--t2);line-height:1.45}
.info .i{color:var(--blu);flex:none}
.info.warn{background:rgba(234,88,12,.07);border-color:rgba(234,88,12,.2)}
.info.warn .i{color:var(--ora)}

/* uploader */
.uph{font-size:12.5px;font-weight:600;color:var(--t2);margin:14px 0 6px;display:flex;align-items:center;gap:6px}
.uph .req{color:var(--red)}
.uph:first-of-type{margin-top:0}
.drop{border:1.5px dashed var(--bor);border-radius:var(--r);background:var(--sur2);padding:14px;text-align:center;cursor:pointer;transition:border .15s,background .15s}
.drop:hover,.drop.dragover{border-color:var(--blu);background:rgba(59,126,246,.04)}
.drop .big{font-size:13px;font-weight:600;color:var(--t1)}
.drop .small{font-size:11px;color:var(--t3);margin-top:3px}
.drop .plus{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:rgba(59,126,246,.1);color:var(--blu);font-size:18px;margin-bottom:5px}
.tile{display:flex;align-items:center;gap:10px;background:var(--sur);border:1px solid var(--bor);border-radius:var(--r);padding:9px 11px;margin-top:8px}
.tile .ft{width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex:none;font-family:'Manrope'}
.tile .ft.pdf{background:#dc2626}.tile .ft.img{background:#7c3aed}
.tile .nm{flex:1;min-width:0}
.tile .nm .f{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .nm .s{font-size:11px;color:var(--t3)}
.tile .x{flex:none;width:30px;height:30px;border-radius:6px;border:1px solid var(--bor);background:var(--sur2);color:var(--t2);cursor:pointer;font-size:14px}
.tile .ok{flex:none;color:var(--grn);font-size:18px;font-weight:700}
.tile.err{border-color:rgba(220,38,38,.4);background:rgba(220,38,38,.04)}
.tile.err .ft{background:var(--red)}
.tile.err .s{color:var(--red);font-weight:600}
.pbar{height:5px;border-radius:4px;background:var(--sur3);overflow:hidden;margin-top:5px}
.pbar i{display:block;height:100%;background:var(--blu);border-radius:4px;transition:width .2s}

/* actionbar collée */
.actionbar{flex:none;position:sticky;bottom:0;background:var(--sur);border-top:1px solid var(--bor);padding:10px 16px calc(12px + env(safe-area-inset-bottom));box-shadow:0 -2px 12px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:8px}
.actionbar .pg{font-size:12px;color:var(--t2);text-align:center;font-weight:500}
.actionbar .btns{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:46px;padding:12px 18px;border-radius:var(--r);border:none;cursor:pointer;font-size:15px;font-weight:600;font-family:'IBM Plex Sans',sans-serif;transition:all .15s}
.btn.bp{background:var(--blu);color:#fff;box-shadow:0 2px 8px rgba(59,126,246,.3);flex:1}
.btn.bp:hover{background:var(--blu-d)}
.btn.bs{background:var(--sur2);color:var(--t1);border:1px solid var(--bor)}
.btn.bs:hover{background:var(--sur3)}
.btn.full{width:100%}
.btn:disabled{opacity:.45;cursor:not-allowed}

/* RGPD */
.rgpd{margin-top:4px;font-size:11px;color:var(--t3);text-align:center;padding:0 4px 8px}
.rgpd a{color:var(--blu);text-decoration:none;cursor:pointer}
.rgpd-panel{background:var(--sur2);border:1px solid var(--bor);border-radius:var(--r);padding:12px;font-size:11.5px;color:var(--t2);line-height:1.5;margin-bottom:14px}
.rgpd-panel b{color:var(--t1)}

/* bandeau complément (D13) */
.cbanner{flex:none;background:rgba(234,88,12,.1);border-bottom:1px solid rgba(234,88,12,.25);padding:10px 16px;display:flex;gap:9px;align-items:flex-start;font-size:12.5px;color:#9a3a0c}
.cbanner .i{font-size:16px;flex:none}
.cbanner b{color:var(--ora)}

/* écrans d'état plein écran */
.state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 24px}
.state .em{width:74px;height:74px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:18px}
.state .em.ok{background:rgba(22,163,74,.12)}
.state .em.no{background:rgba(220,38,38,.1)}
.state h2{font-family:'Manrope',sans-serif;font-size:21px;margin-bottom:8px}
.state p{font-size:13.5px;color:var(--t2);max-width:300px;margin-bottom:8px}
.state .tip{font-size:12px;color:var(--t3);background:var(--sur);border:1px solid var(--bor);border-radius:var(--r);padding:10px 12px;max-width:300px;margin-top:6px}

[hidden]{display:none!important}
#boot{padding:40px 16px;text-align:center;color:var(--t2)}
```

- [ ] **Step 2 : Commit**

```bash
git add public/dossier.css
git commit -m "feat(relay): feuille de style page publique candidature (tokens ImmoTrack)"
```

---

### Task 7 : Client de la page publique `public/dossier.js`

**Files:**
- Create: `C:\Users\Did_K\Desktop\Immo-relay-bailsign\relay\public\dossier.js`

Module ES chargé par la page server-rendue (Task 4). Il construit le wizard 4 étapes (Identité / Situation / Garant / Pièces — variante A validée), gère l'upload **multi-fichiers par case** (un `<input multiple>` par catégorie, chaque fichier = un POST `/piece`), l'**autosave** du dossier (pour la reprise D13), et l'envoi final. Le candidat ne voit **jamais** de score. Tokens injectés via `window.__*`, jamais dans l'URL.

Contrats relais consommés (Task 5) :
- `POST {API}/dossier` — corps JSON `{identite,situation,garant}`, en-tête `X-Cand-Token`.
- `POST {API}/piece` — corps = octets bruts du fichier, en-têtes `X-Cand-Token`, `content-type`, `X-Piece-Categorie`, `X-Piece-Filename` (encodé `encodeURIComponent`).
- `DELETE {API}/piece/:pieceId` — en-tête `X-Cand-Token`.
- `POST {API}/submit` — en-tête `X-Cand-Token`.

> Pas de test unitaire (pas de DOM headless dans la suite relais) : validé visuellement en vrai navigateur (Task 8) contre le mockup approuvé `mockups/candidature/dossier-public.html`, sur les 3 largeurs (téléphone/tablette/PC) et les états (formulaire, upload, complément D13, envoyé).

- [ ] **Step 1 : Créer le fichier** avec exactement ce contenu :

```js
/* ════════════════════════════════════════════════════════════════════════
   dossier.js — client de la page publique de candidature (relais Cloudflare).
   Wizard 4 étapes + upload multi-fichiers par case + autosave (reprise D13) +
   envoi. Le candidat ne voit JAMAIS de score (D7). Tokens via window.__*.
   ════════════════════════════════════════════════════════════════════════ */
const TOKEN = window.__CAND_TOKEN__;
const LINK_ID = window.__LINK_ID__;
const CAND = window.__CAND__ || {};
const API = `/api/candidatures/${LINK_ID}`;

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Catégories de pièces (décret n°2015-1437) — libellés validés mockup.
const CATS = [
  { key:'identite',   req:true,  title:"Pièce d'identité",           big:'Ajouter — CNI, passeport ou titre de séjour',        small:'Recto-verso accepté · plusieurs fichiers' },
  { key:'domicile',   req:true,  title:'Justificatif de domicile',   big:'Ajouter un justificatif récent',                     small:'Quittance, facture énergie, attestation hébergement…' },
  { key:'situation',  req:true,  title:'Situation professionnelle',  big:'Contrat de travail <b>et</b> 3 dernières fiches de paie', small:'Glissez plusieurs fichiers dans cette case (contrat + bulletins)' },
  { key:'ressources', req:true,  title:'Justificatif de ressources', big:"Dernier avis d'imposition",                          small:'PDF de préférence' },
  { key:'garant',     req:false, title:'Pièces du garant',           big:'Identité + ressources du garant',                    small:'Si vous avez indiqué un garant' }
];
const STEP_LABELS = ['Identité', 'Situation', 'Garant', 'Pièces'];

// ── État ─────────────────────────────────────────────────────────────────
const dossier = normalizeDossier(CAND.dossier);
const pieces = {}; CATS.forEach(c => { pieces[c.key] = []; });
(CAND.pieces || []).forEach(p => { (pieces[p.categorie] || (pieces[p.categorie] = [])).push({ ...p, status:'done' }); });
let step = 1;
let saveTimer = null;

function normalizeDossier(d) {
  d = d || {};
  return {
    identite: Object.assign({ civilite:'M.', nom:'', prenom:'', ddn:'', lieuNaiss:'', tel:'', email:'', adresseActuelle:'' }, d.identite),
    situation: Object.assign({ contrat:'CDI', employeur:'', revenus:'' }, d.situation),
    garant: d.garant ? Object.assign({ nom:'', adresse:'', ddn:'', lieuNaiss:'' }, d.garant) : null
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtSize(b){ return b<1024?b+' o':b<1048576?Math.round(b/1024)+' Ko':(b/1048576).toFixed(1).replace('.',',')+' Mo'; }
function kindOf(type){ if(type==='application/pdf')return{cls:'pdf',txt:'PDF'}; if(type==='image/png')return{cls:'img',txt:'PNG'}; return{cls:'img',txt:'JPG'}; }
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return [...(root||document).querySelectorAll(sel)]; }

// ── Construction du DOM ──────────────────────────────────────────────────
function build() {
  const d = dossier;
  const civBtn = (v) => `<button type="button" data-civ="${esc(v)}" class="${d.identite.civilite===v?'on':''}">${esc(v)}</button>`;
  const piecesHtml = CATS.map(cat => `
    <div class="uph"><span>${cat.title}</span>${cat.req?'<span class="req">*</span>':''}</div>
    <div class="drop" data-cat="${cat.key}"><span class="plus">+</span><div class="big">${cat.big}</div><div class="small">${cat.small}</div></div>
    <input type="file" multiple accept="image/jpeg,image/png,application/pdf" data-input="${cat.key}" hidden>
    <div class="tiles" id="tiles-${cat.key}"></div>`).join('');

  document.getElementById('app').innerHTML = `
  <div class="pub">
    <div class="pub-head">
      <div class="pub-brand"><span class="dot">i</span> Dossier de candidature <span class="by">via ImmoTrack</span></div>
      <div class="prop">
        <span class="ico">🏠</span>
        <div style="flex:1"><div class="ttl">${esc(CAND.bienLabel||'Bien à louer')}</div></div>
        ${CAND.loyer?`<div class="rent">${esc(String(CAND.loyer))} €<br><span style="font-weight:500;color:var(--t3);font-size:11px">CC / mois</span></div>`:''}
      </div>
      <div class="reassure">🔒 <span><b>Transmission chiffrée</b> au propriétaire uniquement · données supprimées sous 30 j si non retenu</span></div>
    </div>

    <div class="cbanner" id="cbanner" hidden><span class="i">📌</span><div id="cbanner-txt"></div></div>

    <div class="steps" id="steps">
      ${STEP_LABELS.map((lb,i)=>`<div class="st${i===0?' cur':''}" data-step="${i+1}"><span class="n">${i+1}</span><span class="lb">${lb}</span></div>`).join('')}
    </div>

    <div class="scroll" id="scroll">
      <!-- 1 · Identité -->
      <section class="sec" data-step="1">
        <div class="sec-h"><span class="si">👤</span> Votre identité</div>
        <div class="sec-sub">Ces informations seront reportées telles quelles sur le bail si votre dossier est retenu.</div>
        <div class="field"><label>Civilité</label><div class="segc" id="civ">${['M.','Mme','Autre…'].map(civBtn).join('')}</div></div>
        <div class="row2">
          <div class="field"><label>Nom <span class="req">*</span></label><input class="inp" data-path="identite.nom" placeholder="Moreau"></div>
          <div class="field"><label>Prénom <span class="req">*</span></label><input class="inp" data-path="identite.prenom" placeholder="Camille"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Date de naissance <span class="req">*</span></label><input class="inp" data-path="identite.ddn" placeholder="jj/mm/aaaa"></div>
          <div class="field"><label>Lieu de naissance</label><input class="inp" data-path="identite.lieuNaiss" placeholder="Lyon"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Téléphone <span class="req">*</span></label><input class="inp" type="tel" data-path="identite.tel" placeholder="06 12 34 56 78"></div>
          <div class="field"><label>Email <span class="req">*</span></label><input class="inp" type="email" data-path="identite.email" placeholder="vous@email.fr"></div>
        </div>
        <div class="field"><label>Adresse actuelle</label><input class="inp" data-path="identite.adresseActuelle" placeholder="N°, rue, code postal, ville"></div>
      </section>

      <!-- 2 · Situation -->
      <section class="sec" data-step="2" hidden>
        <div class="sec-h"><span class="si">💼</span> Situation &amp; revenus</div>
        <div class="info" style="margin-bottom:12px"><span class="i">ℹ️</span><span>Ces éléments aident le propriétaire à évaluer votre dossier. Ils restent <b>déclaratifs</b> tant que vos justificatifs ne sont pas vérifiés. Aucun critère lié à l'origine, l'âge ou la situation familiale n'est demandé.</span></div>
        <div class="field"><label>Type de contrat <span class="req">*</span></label>
          <select class="inp" data-path="situation.contrat">${['CDI','CDD','Freelance / Indépendant','Étudiant','Retraité','Autre'].map(o=>`<option>${o}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Employeur</label><input class="inp" data-path="situation.employeur" placeholder="Nom de l'employeur"></div>
        <div class="field"><label>Revenus mensuels nets (€) <span class="req">*</span></label><input class="inp" inputmode="numeric" data-path="situation.revenus" placeholder="ex. 3200"></div>
      </section>

      <!-- 3 · Garant -->
      <section class="sec" data-step="3" hidden>
        <div class="sec-h"><span class="si">🛡️</span> Garant <span class="opt">facultatif</span></div>
        <div class="switch-row" style="margin-bottom:12px">
          <div class="switch${d.garant?' on':''}" id="gsw"></div>
          <div class="tx">J'ai un garant<small>Un garant n'est pas obligatoire mais renforce votre dossier.</small></div>
        </div>
        <div id="gfields" ${d.garant?'':'hidden'}>
          <div class="field"><label>Nom complet du garant</label><input class="inp" data-path="garant.nom" placeholder="Nom Prénom"></div>
          <div class="field"><label>Adresse du garant</label><input class="inp" data-path="garant.adresse" placeholder="N°, rue, code postal, ville"></div>
          <div class="row2">
            <div class="field"><label>Date de naissance</label><input class="inp" data-path="garant.ddn" placeholder="jj/mm/aaaa"></div>
            <div class="field"><label>Lieu de naissance</label><input class="inp" data-path="garant.lieuNaiss" placeholder="Ville"></div>
          </div>
        </div>
      </section>

      <!-- 4 · Pièces -->
      <section class="sec" data-step="4" hidden>
        <div class="sec-h"><span class="si">📎</span> Pièces justificatives</div>
        <div class="info" style="margin-bottom:12px"><span class="i">⚖️</span><span>Seules les pièces autorisées par la loi (décret n°2015-1437) vous sont demandées. <b>JPG, PNG ou PDF · 20 Mo max par fichier.</b> Vous pouvez en ajouter plusieurs et revenir plus tard avec ce lien.</span></div>
        ${piecesHtml}
        <div class="info warn" style="margin-top:12px"><span class="i">💡</span><span>Astuce mobile : photographiez vos documents un par un, la lumière du jour suffit. Vous pouvez revenir compléter avec le même lien.</span></div>
        <div class="rgpd" style="margin-top:14px"><a id="rgpd-toggle">Mentions d'information RGPD ▾</a></div>
        <div class="rgpd-panel" id="rgpd-panel" hidden><b>Responsable :</b> le propriétaire du bien ci-dessus. <b>Finalité :</b> étude de votre candidature à la location. <b>Destinataire :</b> le propriétaire uniquement. <b>Conservation :</b> supprimée automatiquement sous 30 jours si votre dossier n'est pas retenu ; conservée le temps du bail s'il est conclu. <b>Vos droits :</b> accès, rectification, suppression — par le contact indiqué par le propriétaire. Hébergement chiffré (Cloudflare), aucune donnée revendue.</div>
      </section>
    </div>

    <div class="actionbar" id="bar">
      <div class="pg" id="pgtxt"></div>
      <div class="btns">
        <button class="btn bs" id="prev" type="button" hidden>← Précédent</button>
        <button class="btn bp" id="next" type="button">Continuer →</button>
      </div>
    </div>
  </div>`;
}

// ── Liaison des champs (prefill + autosave) ──────────────────────────────
function setPath(obj, path, val){ const k=path.split('.'); if(k[0]==='garant'&&!obj.garant)return; let o=obj; for(let i=0;i<k.length-1;i++)o=o[k[i]]; o[k[k.length-1]]=val; }
function getPath(obj, path){ const k=path.split('.'); let o=obj; for(const p of k){ if(o==null)return ''; o=o[p]; } return o==null?'':o; }

function bindFields(){
  $all('[data-path]').forEach(inp => {
    inp.value = getPath(dossier, inp.dataset.path);
    inp.addEventListener('input', () => {
      inp.classList.remove('err');
      setPath(dossier, inp.dataset.path, inp.value);
      scheduleSave();
    });
  });
  // civilité
  $('#civ').addEventListener('click', e => {
    const b = e.target.closest('[data-civ]'); if(!b) return;
    $all('#civ button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
    dossier.identite.civilite = b.dataset.civ; scheduleSave();
  });
  // garant toggle
  $('#gsw').addEventListener('click', () => {
    const sw = $('#gsw'); sw.classList.toggle('on');
    const on = sw.classList.contains('on');
    $('#gfields').hidden = !on;
    dossier.garant = on ? Object.assign({ nom:'', adresse:'', ddn:'', lieuNaiss:'' }, dossier.garant || {}) : null;
    if(on) $all('#gfields [data-path]').forEach(inp => inp.value = getPath(dossier, inp.dataset.path));
    scheduleSave();
  });
  // RGPD panel
  $('#rgpd-toggle').addEventListener('click', () => { const p=$('#rgpd-panel'); p.hidden=!p.hidden; });
}

// ── Autosave ─────────────────────────────────────────────────────────────
function collect(){
  return {
    identite: { ...dossier.identite },
    situation: { ...dossier.situation, revenus: parseRevenus(dossier.situation.revenus) },
    garant: dossier.garant ? { ...dossier.garant } : null
  };
}
function parseRevenus(v){ const n = parseInt(String(v).replace(/[^\d]/g,''),10); return isNaN(n)?0:n; }
function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
async function saveNow(){
  clearTimeout(saveTimer);
  try {
    await fetch(`${API}/dossier`, { method:'POST', headers:{ 'X-Cand-Token':TOKEN, 'content-type':'application/json' }, body: JSON.stringify(collect()) });
  } catch(_) { /* réseau : on réessaiera au prochain changement ou à l'envoi */ }
}

// ── Pièces (upload multi-fichiers + tuiles) ──────────────────────────────
function makeTile(cat, { name, sizeTxt, type, mode, sub, pieceId }){
  const k = kindOf(type);
  const tile = document.createElement('div');
  tile.className = 'tile' + (mode==='err'?' err':'');
  tile.innerHTML = `<span class="ft ${k.cls}">${k.txt}</span>
    <span class="nm"><span class="f">${esc(name)}</span><span class="s">${esc(sub)}</span>${mode==='up'?'<div class="pbar"><i style="width:0%"></i></div>':''}</span>
    ${mode==='done'?'<span class="ok">✓</span>':'<button class="x" type="button" aria-label="Retirer">✕</button>'}`;
  if(pieceId) tile.dataset.pieceId = pieceId;
  tile.dataset.cat = cat;
  const x = tile.querySelector('.x');
  if(x) x.addEventListener('click', () => removeTile(tile));
  $('#tiles-'+cat).appendChild(tile);
  return tile;
}
function setTileProgress(tile, pct){ const b=tile.querySelector('.pbar i'); if(b)b.style.width=pct+'%'; const s=tile.querySelector('.s'); if(s)s.textContent=pct+' %'; }
function tileDone(tile, pieceId, sizeTxt){
  tile.dataset.pieceId = pieceId; tile.classList.remove('err');
  tile.querySelector('.s').textContent = sizeTxt + ' · envoyé';
  const pbar = tile.querySelector('.pbar'); if(pbar) pbar.remove();
  const x = tile.querySelector('.x'); if(x){ x.outerHTML = '<span class="ok">✓</span>'; }
}
function tileError(tile, msg){ tile.classList.add('err'); tile.querySelector('.s').textContent = msg; const pbar=tile.querySelector('.pbar'); if(pbar)pbar.remove(); }
async function removeTile(tile){
  const pieceId = tile.dataset.pieceId, cat = tile.dataset.cat;
  if(pieceId){
    try { await fetch(`${API}/piece/${pieceId}`, { method:'DELETE', headers:{ 'X-Cand-Token':TOKEN } }); } catch(_){}
    pieces[cat] = (pieces[cat]||[]).filter(p => p.pieceId !== pieceId);
  }
  tile.remove();
}
function uploadFile(cat, file){
  const sizeTxt = fmtSize(file.size);
  if(!ALLOWED.includes(file.type)){ makeTile(cat, { name:file.name, type:file.type, mode:'err', sub:'format non accepté (JPG, PNG, PDF)' }); return; }
  if(file.size > MAX_BYTES){ makeTile(cat, { name:file.name, type:file.type, mode:'err', sub:sizeTxt+' · trop lourd (20 Mo max)' }); return; }
  const tile = makeTile(cat, { name:file.name, type:file.type, mode:'up', sub:'0 %' });
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API}/piece`);
  xhr.setRequestHeader('X-Cand-Token', TOKEN);
  xhr.setRequestHeader('content-type', file.type);
  xhr.setRequestHeader('X-Piece-Categorie', cat);
  xhr.setRequestHeader('X-Piece-Filename', encodeURIComponent(file.name));
  xhr.upload.onprogress = e => { if(e.lengthComputable) setTileProgress(tile, Math.round(e.loaded/e.total*100)); };
  xhr.onload = () => {
    if(xhr.status === 201){ const { pieceId } = JSON.parse(xhr.responseText); tileDone(tile, pieceId, sizeTxt); pieces[cat].push({ pieceId, filename:file.name, status:'done' }); }
    else if(xhr.status === 409){ tileError(tile, 'dossier déjà envoyé'); }
    else { tileError(tile, 'échec de l\'envoi — réessayez'); }
  };
  xhr.onerror = () => tileError(tile, 'connexion perdue');
  xhr.send(file);
}
function bindUploads(){
  CATS.forEach(cat => {
    const drop = $(`.drop[data-cat="${cat.key}"]`);
    const input = $(`input[data-input="${cat.key}"]`);
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { [...input.files].forEach(f => uploadFile(cat.key, f)); input.value=''; });
    ['dragover','dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', e => { [...(e.dataTransfer?.files||[])].forEach(f => uploadFile(cat.key, f)); });
  });
}
function renderExistingPieces(){
  CATS.forEach(cat => (pieces[cat.key]||[]).forEach(p =>
    makeTile(cat.key, { name:p.filename, type:guessType(p.filename), mode:'done', sub:'envoyé', pieceId:p.pieceId })));
}
function guessType(name){ const n=(name||'').toLowerCase(); if(n.endsWith('.pdf'))return'application/pdf'; if(n.endsWith('.png'))return'image/png'; return'image/jpeg'; }

// ── Navigation wizard ────────────────────────────────────────────────────
function showStep(n){
  step = Math.min(4, Math.max(1, n));
  $all('.scroll > .sec').forEach(s => { s.hidden = (+s.dataset.step !== step); });
  $all('#steps .st').forEach((st,i) => { st.classList.remove('cur','done'); const k=i+1; if(k<step)st.classList.add('done'); if(k===step)st.classList.add('cur'); });
  $('#pgtxt').textContent = `Étape ${step} sur 4 — ${STEP_LABELS[step-1]}`;
  $('#prev').hidden = step===1;
  const next = $('#next'); next.textContent = step===4 ? 'Envoyer mon dossier' : 'Continuer →';
  $('#scroll').scrollTop = 0;
}
function bindNav(){
  $('#prev').addEventListener('click', () => showStep(step-1));
  $('#next').addEventListener('click', () => { if(step<4){ showStep(step+1); } else { submit(); } });
}

// ── Validation client (miroir léger de validateDossier) ──────────────────
function validateClient(){
  const errs = [];
  const id = dossier.identite;
  if(!id.nom)    errs.push({ path:'identite.nom', step:1 });
  if(!id.prenom) errs.push({ path:'identite.prenom', step:1 });
  if(!id.ddn)    errs.push({ path:'identite.ddn', step:1 });
  if(!id.tel)    errs.push({ path:'identite.tel', step:1 });
  if(!id.email || !EMAIL_RE.test(id.email)) errs.push({ path:'identite.email', step:1 });
  if(!dossier.situation.contrat) errs.push({ path:'situation.contrat', step:2 });
  if(!parseRevenus(dossier.situation.revenus)) errs.push({ path:'situation.revenus', step:2 });
  return errs;
}

// ── Envoi ────────────────────────────────────────────────────────────────
async function submit(){
  const errs = validateClient();
  if(errs.length){
    showStep(errs[0].step);
    errs.forEach(e => { const f=$(`[data-path="${e.path}"]`); if(f && f.dataset.step===undefined){ f.classList.add('err'); } else if(f){ f.classList.add('err'); } });
    return;
  }
  const next = $('#next'); next.disabled = true; next.textContent = 'Envoi…';
  await saveNow();
  try {
    const r = await fetch(`${API}/submit`, { method:'POST', headers:{ 'X-Cand-Token':TOKEN } });
    if(r.ok){ showSent(); return; }
    const body = await r.json().catch(()=>({}));
    next.disabled = false; next.textContent = 'Envoyer mon dossier';
    if(body.error){ const f = body.error.startsWith('identite') ? $(`[data-path="${body.error}"]`) : null; if(f){ showStep(1); f.classList.add('err'); } else { alert('Vérifiez les champs obligatoires de votre dossier.'); } }
  } catch(_){ next.disabled=false; next.textContent='Envoyer mon dossier'; alert('Connexion perdue — réessayez.'); }
}

// ── Écrans d'état pleins ─────────────────────────────────────────────────
function showSent(){
  document.getElementById('app').innerHTML = `<div class="pub"><div class="state">
    <div class="em ok">✅</div>
    <h2>Dossier envoyé !</h2>
    <p>Votre candidature pour <b>${esc(CAND.bienLabel||'ce bien')}</b> a bien été transmise au propriétaire.</p>
    <p>Il va l'étudier et pourra vous recontacter.</p>
    <div class="tip">📎 Besoin d'ajouter une pièce ? Revenez avec <b>ce même lien</b> tant que votre dossier est en cours — rien n'est à ressaisir.</div>
  </div></div>`;
}

// ── Démarrage ────────────────────────────────────────────────────────────
function start(){
  if(CAND.status === 'submitted'){ build(); showSent(); return; }
  build();
  bindFields();
  bindUploads();
  bindNav();
  renderExistingPieces();
  if(CAND.complementNote){
    const b = $('#cbanner'); b.hidden = false;
    $('#cbanner-txt').innerHTML = `Le propriétaire vous demande un complément : <b>${esc(CAND.complementNote)}</b>. Ajoutez-le ci-dessous puis renvoyez — le reste de votre dossier est conservé.`;
    showStep(4);
  } else {
    showStep(1);
  }
}
start();
```

- [ ] **Step 2 : Commit**

```bash
git add public/dossier.js
git commit -m "feat(relay): client page candidature (wizard, upload multi-fichiers, reprise D13, envoi)"
```

---

### Task 8 : Déploiement relais + smoke tests 🚦 GATE avant Partie 2

**Files:** aucun nouveau fichier — déploiement + vérifications.

> **Cette tâche est un point de blocage.** La Partie 2 (app) consomme le relais déployé. Ne **PAS** commencer la Partie 2 tant que les smoke tests ci-dessous ne passent pas tous en vert sur l'URL de production `https://bail-sign-relay.didierkeller.workers.dev`.
>
> **Secrets — règle gravée :** ne **JAMAIS** afficher en clair `APP_KEY`, `SIGNING_SECRET`, ni le token OAuth wrangler. Les snippets ci-dessous chargent `APP_KEY` depuis `.dev.vars` (fichier local gitignored) dans une variable de session **sans l'écho**. `.dev.vars` et `.claude/launch.json` ne doivent jamais être committés.

- [ ] **Step 1 : Suite complète verte (pré-requis)**
Run : `npm test`
Expected : PASS — toute la suite relais (signature + candidature). Si rouge → corriger avant de déployer.

- [ ] **Step 2 : Vérifier que les assets candidature seront bien servis**
Le binding `[assets]` de `wrangler.toml` sert `./public`. Confirmer que `public/dossier.css` et `public/dossier.js` existent (Tasks 6-7) :
Run : `Get-ChildItem public\dossier.*`
Expected : `dossier.css` et `dossier.js` listés.

- [ ] **Step 3 : Déployer**
Run : `npm run deploy`
Expected : wrangler affiche `Uploaded bail-sign-relay` puis l'URL `https://bail-sign-relay.didierkeller.workers.dev`. Si wrangler demande une ré-authentification, suivre le flux OAuth (ne pas coller le token dans le chat).

- [ ] **Step 4 : Charger APP_KEY en session (sans écho) + smoke test invitation**
Coller dans la même fenêtre PowerShell (`.dev.vars` contient une ligne `APP_KEY=...`) :

```powershell
$BASE = 'https://bail-sign-relay.didierkeller.workers.dev'
$APP_KEY = (Get-Content .dev.vars | Where-Object { $_ -match '^APP_KEY=' }) -replace '^APP_KEY=',''
# Création d'une invitation (rôle bailleur)
$inv = Invoke-RestMethod -Method Post -Uri "$BASE/candidatures" -Headers @{ Authorization = "Bearer $APP_KEY" } -ContentType 'application/json' -Body (@{ logRef='SMOKE'; bienLabel='T2 smoke test'; loyer=1100; message='Bonjour'; expDays=14 } | ConvertTo-Json)
$LINK = $inv.linkId
"linkId = $LINK"   # doit être 64 hex ; candidatUrl doit contenir /d/$LINK
$inv.candidatUrl
```
Expected : `linkId` = 64 caractères hex ; `candidatUrl` se termine par `/d/<linkId>`. (Ne pas afficher `$inv.ownerToken`.)

- [ ] **Step 5 : Smoke test parcours candidat (page + dossier + pièce + submit)**

```powershell
# La page publique répond 200 et injecte un candToken
$page = Invoke-WebRequest -Uri "$BASE/d/$LINK"
$page.StatusCode            # 200
$tok = ([regex]'window\.__CAND_TOKEN__\s*=\s*"([^"]+)"').Match($page.Content).Groups[1].Value
if (-not $tok) { throw 'candToken introuvable' }

# Dépôt du dossier
$dossier = @{ identite=@{ civilite='Mme'; nom='Moreau'; prenom='Camille'; ddn='1990-01-01'; tel='0600000000'; email='c@x.fr'; adresseActuelle='1 rue X' }; situation=@{ contrat='CDI'; employeur='ACME'; revenus=3200 }; garant=$null } | ConvertTo-Json
(Invoke-WebRequest -Method Post -Uri "$BASE/api/candidatures/$LINK/dossier" -Headers @{ 'X-Cand-Token'=$tok } -ContentType 'application/json' -Body $dossier).StatusCode  # 200

# Upload d'une pièce PDF minimale (octets %PDF...)
$pdf = [byte[]](0x25,0x50,0x44,0x46,0x2D,0x31,0x2E,0x34,0x0A,0x25)
$pc = Invoke-RestMethod -Method Post -Uri "$BASE/api/candidatures/$LINK/piece" -Headers @{ 'X-Cand-Token'=$tok; 'X-Piece-Categorie'='identite'; 'X-Piece-Filename'='cni.pdf' } -ContentType 'application/pdf' -Body $pdf
$pc.pieceId   # non vide

# Envoi
(Invoke-RestMethod -Method Post -Uri "$BASE/api/candidatures/$LINK/submit" -Headers @{ 'X-Cand-Token'=$tok }).status  # 'submitted'
```
Expected : page `200`, dossier `200`, `pieceId` non vide, submit → `submitted`.

- [ ] **Step 6 : Smoke test côté bailleur (lecture + pièce) puis purge**

```powershell
$owner = $inv.ownerToken
$res = Invoke-RestMethod -Uri "$BASE/api/candidatures/$LINK/result" -Headers @{ 'X-Owner-Token'=$owner }
$res.dossier.identite.nom            # 'Moreau'
$res.pieces[0].pieceId               # = $pc.pieceId
# téléchargement d'une pièce
(Invoke-WebRequest -Uri "$BASE/api/candidatures/$LINK/piece/$($res.pieces[0].pieceId)" -Headers @{ 'X-Owner-Token'=$owner }).StatusCode  # 200
# purge (accusé de réception) — nettoie la donnée de smoke test
(Invoke-RestMethod -Method Delete -Uri "$BASE/api/candidatures/$LINK" -Headers @{ 'X-Owner-Token'=$owner }).ok   # True
(Invoke-WebRequest -Uri "$BASE/d/$LINK" -SkipHttpErrorCheck).StatusCode   # 404 après purge
```
Expected : `nom`=Moreau, pièce `200`, purge `True`, puis `/d/<linkId>` → `404`.

- [ ] **Step 7 : Validation visuelle en vrai navigateur (règle gravée mockup-first)**
Créer une invitation jetable (Step 4), ouvrir `candidatUrl` dans Chrome et vérifier, **sur les 3 largeurs** (DevTools → téléphone 390 / tablette 760 / PC) :
  - En-tête marque ImmoTrack + bien + bandeau réassurance chiffrée.
  - Wizard 4 étapes (Identité → Situation → Garant → Pièces), boutons Précédent/Continuer, dernier = « Envoyer mon dossier ».
  - Upload : glisser plusieurs fichiers dans une case → tuiles avec barre de progression puis ✓ ; fichier > 20 Mo ou .docx → tuile erreur rouge.
  - Toggle garant ouvre/masque les champs.
  - Recharger la page (reprise D13) → champs déjà saisis re-remplis, pièces déjà envoyées re-listées avec ✓.
  - Après « Envoyer » → écran « Dossier envoyé ! ». Re-ouvrir le lien → écran « Dossier envoyé » (statut submitted).
  - Comparer au mockup approuvé `mockups/candidature/dossier-public.html`. Aucun écart visuel.
Puis **purger** l'invitation jetable (Step 6, DELETE).

- [ ] **Step 8 : Tag de version relais (traçabilité déploiement)**

```bash
git tag relay-candidature-v1
```

> 🚦 **GATE franchie** uniquement si Steps 1-7 sont tous verts. La Partie 2 peut alors démarrer.

---

## PARTIE 2 — APPLICATION (ImmoTrack)

**Working dir pour toute la Partie 2 :** `C:\Users\Did_K\Desktop\Immo`
Commande de test : `npx vitest run __tests__/helpers/<fichier>.test.js`.

**Règles gravées qui s'appliquent à TOUTE la Partie 2 :**
- **Sandbox-first** : toute modif passe d'abord par `index-test.html`. On ne touche `index.html` (prod) qu'après le « OK » explicite de l'utilisateur (Task 16).
- **Modifier + vérifier TOUJOURS** : après chaque modif, `grep` des symboles + sites collatéraux + fichier dérivé (`index-test.html`).
- **Ne jamais `git add` l'arbre entier** ; committer uniquement ses propres fichiers (ne pas écraser le travail des sessions parallèles sur `index.html`/`index-test.html`/`BACKLOG.md`/`sw.js`).
- **Isolation prod/sandbox** : toute nouvelle clé localStorage passe par `_lsKey(k)` (`index.html:3774`) → préfixe `_test_` en sandbox.
- **Secrets** : `APP_KEY` est saisi par l'utilisateur dans les Réglages et stocké en localStorage local. Ne jamais le logger, ne jamais l'écrire dans le DB synchronisé Drive, ne jamais l'inclure dans un commit.

**État du code app au moment d'écrire ce plan (anchors confirmés) :**
- Le bouton « Inviter un candidat » existe déjà (`index.html:371`) et appelle `openInviteCandidat()` — **stub** à `index.html:14440-14443` (`note-lien` « lien en ligne — bientôt »).
- `rCandidats()` (rendu onglet) : `index.html:14304`. `_nouveauCandidat(partial)` inline : `index.html:14211`. `saveDB()` : `index.html:5703`. `DB.candidats` init : `index.html:4922`. `DB.documents` init : `index.html:4906`.
- GED : `_attachmentSaveForEntity(parent, fileData)` (`index.html:12626`) construit le doc inline (12642-12658), supporte déjà `parentType:'candidat'`, stocke le binaire en IndexedDB (`_idbPut`). `fileData = { name, mime, size, dataB64 }`.
- Drive : merge candidats `index.html:45419-45429` (par `id`, arbitré `_drvWins`/`_modifiedAt`) ; `tombstone({id,entity,logRef})` (44712/44864) ; auto-pull `_scheduleAutoPull()` (46018). **Le relais est un canal SÉPARÉ de Drive** (pas de JSON Drive).
- Modales : `openM(id)` / `closeM(id)` (5918-5919), `closeBg(event,id)`. Patron `<div class="ov hidden" id="ov-X" onclick="closeBg(event,'ov-X')"><div class="modal">…`. Exemple vivant `#ov-candidat` (1936-1995).
- Réglages : page `#p-export` (1157) ; carte Google Drive (1175-1181) à recopier pour la carte « Relais candidatures ».
- Registre RGPD = doc markdown `docs/legal/RGPD-REGISTRE.md` (ligne Cloudflare 27, traitement n°6 « Candidatures locataires » 95-109). `js/core/rgpd.js` n'a **pas** de registre code.
- Version courante (3 emplacements) : `index.html:6` (title), `:57` (header), `:3650` (footer).

---

### Task 9 : Module client relais `js/core/relay-client.js` (TDD)

**Files:**
- Create: `js/core/relay-client.js`
- Test: `__tests__/helpers/relay-client.test.js`
- Modify: `js/main.js` (import + expose `window`)

Module ES sans dépendance DOM. Helpers **purs** (testés TDD) + wrappers réseau (paramètre `fetchImpl = fetch` injectable → testables). La config `{ base, appKey }` est **fournie par l'appelant** (index.html lit `localStorage` via `_lsKey`), jamais lue ici → le module reste pur et isolable sandbox. Le `ownerToken` (capacité bailleur) n'est ni loggé ni mis dans une URL.

- [ ] **Step 1 : Écrire les tests qui échouent** — créer `__tests__/helpers/relay-client.test.js` :

```js
// __tests__/helpers/relay-client.test.js
import { describe, it, expect } from 'vitest';
import {
  normalizeBase, buildCandidatUrl, relayConfigured, buildInvitationPayload,
  _relayDossierVersCandidat, relayCreateInvitation, relayFetchResult, relayPing
} from '../../js/core/relay-client.js';

describe('normalizeBase', () => {
  it('retire les slashs finaux', () => {
    expect(normalizeBase('https://r.dev/')).toBe('https://r.dev');
    expect(normalizeBase('https://r.dev///')).toBe('https://r.dev');
    expect(normalizeBase('  https://r.dev  ')).toBe('https://r.dev');
  });
  it('vide → chaîne vide', () => expect(normalizeBase(null)).toBe(''));
});

describe('buildCandidatUrl', () => {
  it('compose base + /d/linkId', () => {
    expect(buildCandidatUrl('https://r.dev/', 'abc123')).toBe('https://r.dev/d/abc123');
  });
});

describe('relayConfigured', () => {
  it('exige base ET appKey', () => {
    expect(relayConfigured({ base: 'https://r.dev', appKey: 'k' })).toBe(true);
    expect(relayConfigured({ base: 'https://r.dev', appKey: '' })).toBe(false);
    expect(relayConfigured({ base: '', appKey: 'k' })).toBe(false);
    expect(relayConfigured(null)).toBe(false);
  });
});

describe('buildInvitationPayload', () => {
  it('valide et normalise', () => {
    const p = buildInvitationPayload({ logRef: 'L1', bienLabel: 'T2', loyer: '1100', expDays: 30 });
    expect(p).toEqual({ logRef: 'L1', bienLabel: 'T2', loyer: 1100, message: '', expDays: 30 });
  });
  it('expDays par défaut = 14', () => {
    expect(buildInvitationPayload({ logRef: 'L1' }).expDays).toBe(14);
  });
  it('rejette logRef vide', () => expect(() => buildInvitationPayload({ logRef: '' })).toThrow());
  it('rejette expDays hors liste', () => expect(() => buildInvitationPayload({ logRef: 'L1', expDays: 99 })).toThrow());
});

describe('_relayDossierVersCandidat', () => {
  const result = {
    logRef: 'L9', submittedAt: '2026-06-03T10:00:00Z',
    dossier: {
      identite: { civilite: 'Mme', nom: 'Moreau', prenom: 'Camille', ddn: '1990-01-01', lieuNaiss: 'Lyon', tel: '0600', email: 'c@x.fr', adresseActuelle: '9 rue X' },
      situation: { contrat: 'CDI', employeur: 'ACME', revenus: 3200 },
      garant: { nom: 'Jean Moreau', adresse: '9 rue X', ddn: '1961-11-03', lieuNaiss: 'St-Étienne' }
    },
    pieces: [{ pieceId: 'p1', categorie: 'identite', filename: 'cni.pdf' }]
  };
  const c = _relayDossierVersCandidat(result, { logRef: 'L9', entity: 'SCI' });
  it('mappe identité + renomme adresseActuelle → adressePrecedente', () => {
    expect(c.nom).toBe('Moreau'); expect(c.prenom).toBe('Camille');
    expect(c.adressePrecedente).toBe('9 rue X');
  });
  it('mappe situation avec revenus numérique', () => {
    expect(c.contrat).toBe('CDI'); expect(c.revenus).toBe(3200); expect(typeof c.revenus).toBe('number');
  });
  it('mappe garant + renomme lieuNaiss → lieu', () => {
    expect(c.garant.nom).toBe('Jean Moreau'); expect(c.garant.lieu).toBe('St-Étienne');
  });
  it('marque la provenance lien + statut reçu + pièces non vérifiées', () => {
    expect(c.source).toBe('lien'); expect(c.statut).toBe('recu'); expect(c.piecesCompletes).toBe(false);
  });
  it("n'injecte AUCUN score (recalculé côté app)", () => {
    expect(c.confianceScore).toBeUndefined();
  });
  it('garant absent → null', () => {
    const c2 = _relayDossierVersCandidat({ dossier: { garant: null } }, {});
    expect(c2.garant).toBeNull();
  });
});

describe('réseau (fetch injecté)', () => {
  it('relayCreateInvitation envoie Bearer APP_KEY et renvoie le JSON', async () => {
    let seen;
    const fakeFetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ linkId: 'abc', candidatUrl: 'https://r.dev/d/abc', ownerToken: 'OWN' }) }; };
    const out = await relayCreateInvitation({ base: 'https://r.dev', appKey: 'SECRET' }, { logRef: 'L1' }, fakeFetch);
    expect(out.linkId).toBe('abc');
    expect(seen.url).toBe('https://r.dev/candidatures');
    expect(seen.opts.headers.Authorization).toBe('Bearer SECRET');
  });
  it('relayFetchResult renvoie {_status:409} si pas encore soumis', async () => {
    const fakeFetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'not-submitted' }) });
    const out = await relayFetchResult({ base: 'https://r.dev' }, 'abc', 'OWN', fakeFetch);
    expect(out._status).toBe(409);
  });
  it('relayPing GET /api/ping avec Bearer APP_KEY', async () => {
    let seen;
    const fakeFetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ ok: true }) }; };
    const out = await relayPing({ base: 'https://r.dev', appKey: 'SECRET' }, fakeFetch);
    expect(out.ok).toBe(true);
    expect(seen.url).toBe('https://r.dev/api/ping');
    expect(seen.opts.headers.Authorization).toBe('Bearer SECRET');
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**
Run : `npx vitest run __tests__/helpers/relay-client.test.js`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter** — créer `js/core/relay-client.js` :

```js
// js/core/relay-client.js
// Client du relais Cloudflare pour les candidatures en ligne (lien candidat).
// Helpers PURS (testés) + wrappers réseau (fetchImpl injectable). Aucune dépendance
// DOM. La config {base, appKey} est fournie par l'appelant (index.html lit
// localStorage via _lsKey). Le ownerToken (capacité bailleur) n'est jamais loggé
// ni placé dans une URL. Exposé sur window par js/main.js.

const EXP_DAYS_ALLOWED = [7, 14, 30];

/** Retire les slashs finaux d'une base URL. '' si vide. */
export function normalizeBase(base) {
  return String(base || '').trim().replace(/\/+$/, '');
}

/** URL publique de dépôt pour le candidat. */
export function buildCandidatUrl(base, linkId) {
  return `${normalizeBase(base)}/d/${encodeURIComponent(String(linkId || ''))}`;
}

/** true si la config relais est exploitable. */
export function relayConfigured(cfg) {
  return !!(cfg && normalizeBase(cfg.base) && String(cfg.appKey || '').trim());
}

/** Construit et valide le corps d'une invitation. Lève si logRef vide / expDays invalide. */
export function buildInvitationPayload({ logRef, bienLabel, loyer, message, expDays } = {}) {
  if (!String(logRef || '').trim()) throw new Error('logRef requis');
  const exp = expDays == null ? 14 : Number(expDays);
  if (!EXP_DAYS_ALLOWED.includes(exp)) throw new Error('expDays invalide (7, 14 ou 30)');
  return {
    logRef: String(logRef),
    bienLabel: String(bienLabel || ''),
    loyer: Number(loyer) || 0,
    message: String(message || ''),
    expDays: exp
  };
}

/**
 * Mappe le résultat relais (dossier soumis) vers un *partial* candidat (à passer à
 * _nouveauCandidat). Pur. Renomme : identite.adresseActuelle → adressePrecedente ;
 * garant.lieuNaiss → garant.lieu. source:'lien', statut:'recu', piecesCompletes:false
 * (le bailleur vérifie ensuite). AUCUN score (recalculé via _calculConfiance).
 */
export function _relayDossierVersCandidat(result, ctx = {}) {
  const d = (result && result.dossier) || {};
  const id = d.identite || {};
  const si = d.situation || {};
  const g = d.garant || null;
  return {
    logRef: ctx.logRef || (result && result.logRef) || '',
    entity: ctx.entity || '',
    source: 'lien',
    statut: 'recu',
    civilite: id.civilite || '',
    nom: id.nom || '',
    prenom: id.prenom || '',
    ddn: id.ddn || '',
    lieuNaiss: id.lieuNaiss || '',
    tel: id.tel || '',
    email: id.email || '',
    adressePrecedente: id.adresseActuelle || id.adressePrecedente || '',
    revenus: Number(si.revenus) || 0,
    employeur: si.employeur || '',
    contrat: si.contrat || '',
    garant: g && String(g.nom || '').trim()
      ? { nom: g.nom || '', adresse: g.adresse || '', ddn: g.ddn || '', lieu: g.lieuNaiss || g.lieu || '' }
      : null,
    piecesCompletes: false,
    dateCreation: (result && result.submittedAt) || new Date().toISOString()
  };
}

// ── Réseau ──────────────────────────────────────────────────────────────────
async function jsonOrThrow(res) {
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json()).error || ''; } catch (_) {}
    throw new Error(`relay ${res.status}${detail ? ' ' + detail : ''}`);
  }
  return res.json();
}

/** Crée une invitation (rôle bailleur). → { linkId, candidatUrl, ownerToken, expiresAt }. */
export async function relayCreateInvitation(cfg, input, fetchImpl = fetch) {
  const payload = buildInvitationPayload(input);
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/candidatures`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.appKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return jsonOrThrow(res);
}

/** Lit le dossier soumis. 409 (pas encore soumis) → { _status: 409 } (non bloquant). */
export async function relayFetchResult(cfg, linkId, ownerToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}/result`, {
    headers: { 'X-Owner-Token': ownerToken }
  });
  if (res.status === 409) return { _status: 409 };
  return jsonOrThrow(res);
}

/** Télécharge une pièce. → { bytes: Uint8Array, contentType }. */
export async function relayFetchPiece(cfg, linkId, pieceId, ownerToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}/piece/${pieceId}`, {
    headers: { 'X-Owner-Token': ownerToken }
  });
  if (!res.ok) throw new Error(`relay piece ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType: res.headers.get('content-type') || 'application/octet-stream' };
}

/** Demande de complément (D13) : remet le lien en 'open' + note. */
export async function relayReopen(cfg, linkId, ownerToken, note, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}/reopen`, {
    method: 'POST', headers: { 'X-Owner-Token': ownerToken, 'content-type': 'application/json' },
    body: JSON.stringify({ note: String(note || '') })
  });
  return jsonOrThrow(res);
}

/** Révoque le lien (inutilisable immédiatement). */
export async function relayRevoke(cfg, linkId, ownerToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}/revoke`, {
    method: 'POST', headers: { 'X-Owner-Token': ownerToken }
  });
  return jsonOrThrow(res);
}

/** Purge (accusé de réception après rapatriement dans l'app). */
export async function relayPurge(cfg, linkId, ownerToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}`, {
    method: 'DELETE', headers: { 'X-Owner-Token': ownerToken }
  });
  return jsonOrThrow(res);
}

/** Test de connexion (Réglages). Vérifie base + APP_KEY d'un coup. → { ok:true } ou lève. */
export async function relayPing(cfg, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/ping`, {
    headers: { Authorization: `Bearer ${cfg.appKey}` }
  });
  return jsonOrThrow(res);
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**
Run : `npx vitest run __tests__/helpers/relay-client.test.js`
Expected : PASS (tous les tests).

- [ ] **Step 5 : Câbler dans `js/main.js`** — après le bloc d'import candidature (≈ `js/main.js:130-134`), ajouter :

```js
// LOG-CANDIDATS (lien en ligne) — client relais Cloudflare
import {
  normalizeBase, buildCandidatUrl, relayConfigured, buildInvitationPayload,
  _relayDossierVersCandidat, relayCreateInvitation, relayFetchResult,
  relayFetchPiece, relayReopen, relayRevoke, relayPurge, relayPing
} from './core/relay-client.js';
```

Puis, à côté des `window._calcul...` candidature (≈ `js/main.js:297-298`), exposer :

```js
// LOG-CANDIDATS (lien en ligne) — client relais
window._relayNormalizeBase = normalizeBase;
window._buildCandidatUrl = buildCandidatUrl;
window._relayConfigured = relayConfigured;
window._buildInvitationPayload = buildInvitationPayload;
window._relayDossierVersCandidat = _relayDossierVersCandidat;
window._relayCreateInvitation = relayCreateInvitation;
window._relayFetchResult = relayFetchResult;
window._relayFetchPiece = relayFetchPiece;
window._relayReopen = relayReopen;
window._relayRevoke = relayRevoke;
window._relayPurge = relayPurge;
window._relayPing = relayPing;
```

- [ ] **Step 6 : Vérifier la non-régression de la suite app**
Run : `npx vitest run`
Expected : PASS (suite complète inchangée + nouveau fichier vert).

- [ ] **Step 7 : Commit**

```bash
git add js/core/relay-client.js __tests__/helpers/relay-client.test.js js/main.js
git commit -m "feat(candidats): client relais Cloudflare (helpers purs + wrappers réseau) [TDD]"
```

---

### Task 10 : Carte Réglages « Relais candidatures » (sandbox)

**Files:**
- Modify: `index-test.html` (carte dans `#p-export` après la carte Google Drive `:1181` ; fonctions config près de la section EXPORT `:42942` ; hook dans `rExport()` `:42962`)

**But :** une carte de Réglages où l'utilisateur saisit l'URL du relais (pré-remplie) et la clé d'application (`APP_KEY`). La clé est stockée **uniquement en local** (`localStorage` isolé via `_lsKey`) — jamais dans `DB`, jamais sur Drive, jamais exportée. Un bouton « Tester la connexion » valide base + clé via `GET /api/ping`.

> ⚠️ **Sandbox-first** : tout ce qui suit se fait dans `index-test.html`. `index.html` (prod) n'est touché qu'en Task 16 après « OK » utilisateur.

- [ ] **Step 1 : Ajouter la carte dans `#p-export`** — dans `index-test.html`, juste **après** la carte « ☁️ Google Drive » (l'élément `.card` qui se termine par `<div id="drive-status" …></div></div>`, soit `index.html:1181`), insérer :

```html
        <div class="card">
          <div class="ct">🔗 Relais candidatures</div>
          <div class="mu sm mb8">Envoie à un candidat un lien sécurisé pour déposer son dossier en ligne (sans compte). Données chiffrées hébergées temporairement chez Cloudflare (sous-traitant RGPD), purgées dès rapatriement dans l'app. Voir <a href="docs/legal/RGPD-REGISTRE.md" target="_blank">RGPD-REGISTRE.md</a>.</div>
          <div class="mb8">
            <label for="relay-base" class="mu sm">URL du relais</label>
            <input type="url" id="relay-base" class="inp" placeholder="https://…workers.dev" autocomplete="off" spellcheck="false">
          </div>
          <div class="mb8">
            <label for="relay-appkey" class="mu sm">Clé d'application (APP_KEY)</label>
            <input type="password" id="relay-appkey" class="inp" placeholder="•••••••• (stockée sur cet appareil)" autocomplete="off">
          </div>
          <div class="mu sm mb8" style="color:var(--warn,#f59e0b)">⚠️ La clé reste sur cet appareil (jamais synchronisée Drive, jamais exportée). À ressaisir sur chaque appareil.</div>
          <div class="mb8"><button class="btn bp" onclick="saveRelayCfg()">💾 Enregistrer</button> <button class="btn bs" onclick="testRelayCfg()">🔌 Tester la connexion</button></div>
          <div id="relay-status" class="mu sm mt8"></div>
        </div>
```

- [ ] **Step 2 : Ajouter les fonctions de configuration** — dans `index-test.html`, juste **avant** `function rExport()` (`index.html:42942`, repère `// =================== EXPORT ===================`), insérer :

```js
// =================== RELAIS CANDIDATURES — configuration (Réglages) ===================
// LOG-CANDIDATS (lien en ligne). URL + clé d'app stockées EN LOCAL (localStorage isolé
// via _lsKey) — jamais dans DB, jamais sur Drive, jamais exportées. Cf. règle gravée secrets.
const RELAY_BASE_DEFAULT = 'https://bail-sign-relay.didierkeller.workers.dev';

// Config exploitable par le reste de l'app (invitation, pull, reopen…). base normalisée.
function _relayCfg() {
  let base = ''; let appKey = '';
  try { base = localStorage.getItem(_lsKey('RELAY_BASE')) || ''; } catch (_) {}
  try { appKey = localStorage.getItem(_lsKey('RELAY_APP_KEY')) || ''; } catch (_) {}
  const norm = window._relayNormalizeBase || ((s) => String(s || '').trim().replace(/\/+$/, ''));
  return { base: norm(base || RELAY_BASE_DEFAULT), appKey };
}

// Peuple les champs + le statut quand on entre dans l'onglet Réglages.
function _relayCfgLoadInputs() {
  const baseEl = el('relay-base'); const keyEl = el('relay-appkey');
  if (!baseEl || !keyEl) return;
  let base = ''; let key = '';
  try { base = localStorage.getItem(_lsKey('RELAY_BASE')) || ''; } catch (_) {}
  try { key = localStorage.getItem(_lsKey('RELAY_APP_KEY')) || ''; } catch (_) {}
  baseEl.value = base || RELAY_BASE_DEFAULT;
  keyEl.value = key;
  const st = el('relay-status');
  if (st) st.innerHTML = window._relayConfigured(_relayCfg())
    ? '<span style="color:var(--ok,#16a34a)">✓ Relais configuré</span>'
    : '<span class="mu">Relais non configuré (clé manquante).</span>';
}

// Enregistre URL + clé en local. La clé n'écrase l'existante que si un nouveau champ est saisi.
function saveRelayCfg() {
  const norm = window._relayNormalizeBase || ((s) => String(s || '').trim().replace(/\/+$/, ''));
  const base = norm((el('relay-base') || {}).value || '');
  const key = ((el('relay-appkey') || {}).value || '').trim();
  try {
    localStorage.setItem(_lsKey('RELAY_BASE'), base);
    if (key) localStorage.setItem(_lsKey('RELAY_APP_KEY'), key);
  } catch (e) { showToast('Stockage local indisponible', 'err'); return; }
  _relayCfgLoadInputs();
  showToast('Réglages relais enregistrés', 'ok');
}

// Test de connexion : valide base + clé en une requête (GET /api/ping). Aucune écriture KV.
async function testRelayCfg() {
  const st = el('relay-status');
  const norm = window._relayNormalizeBase || ((s) => String(s || '').trim().replace(/\/+$/, ''));
  const cfg = { base: norm((el('relay-base') || {}).value || ''), appKey: ((el('relay-appkey') || {}).value || '').trim() };
  if (!window._relayConfigured(cfg)) { if (st) st.innerHTML = '<span style="color:var(--err,#ef4444)">⚠️ URL et clé requises.</span>'; return; }
  if (st) st.innerHTML = '<span class="mu">Test en cours…</span>';
  try {
    await window._relayPing(cfg);
    if (st) st.innerHTML = '<span style="color:var(--ok,#16a34a)">✓ Connexion OK — relais joignable et clé acceptée.</span>';
  } catch (e) {
    const msg = /401/.test(String(e && e.message)) ? 'clé refusée (401)' : 'relais injoignable';
    if (st) st.innerHTML = `<span style="color:var(--err,#ef4444)">✗ Échec : ${msg}.</span>`;
  }
}
```

- [ ] **Step 3 : Brancher le chargement des champs sur l'entrée d'onglet** — dans `rExport()` de `index-test.html`, juste avant la ligne `el('export-stats').innerHTML=` (`index.html:42963`), à la suite des autres `if (typeof _xxxRefresh === 'function')`, ajouter :

```js
  // LOG-CANDIDATS : peuple les champs de config relais à l'ouverture des Réglages
  if (typeof _relayCfgLoadInputs === 'function') {
    try { _relayCfgLoadInputs(); } catch (e) { console.warn('[relay] load inputs', e); }
  }
```

- [ ] **Step 4 : Vérifier (modify + verify)** — dans `index-test.html` :

```bash
# 1. la carte existe une seule fois
grep -c "id=\"relay-base\"" index-test.html      # attendu : 1
# 2. les fonctions existent
grep -c "function saveRelayCfg\|function testRelayCfg\|function _relayCfg\b\|function _relayCfgLoadInputs" index-test.html   # attendu : 4
# 3. le hook est posé dans rExport
grep -n "_relayCfgLoadInputs()" index-test.html  # attendu : 2 occurrences (def + appel rExport)
```

- [ ] **Step 5 : Validation visuelle sandbox (vrai navigateur)**
Ouvrir `index-test.html` dans Chrome → onglet Réglages (`#p-export`). Vérifier, **sur les 3 largeurs** (DevTools 390 / 760 / PC) :
  - La carte « 🔗 Relais candidatures » s'affiche dans la grille, mêmes marges/typo que la carte Google Drive (cohérence design system).
  - URL pré-remplie sur la valeur par défaut ; champ clé vide (type password).
  - « Enregistrer » → toast OK + statut « ✓ Relais configuré » (après saisie d'une clé).
  - « Tester la connexion » sans relais déployé → « ✗ Échec : relais injoignable » (attendu tant que la Partie 1 n'est pas en ligne ; deviendra ✓ une fois déployée).
  - Recharger la page → champs re-remplis depuis `localStorage`.
  - Vérifier l'isolation : `localStorage.getItem('_test_RELAY_BASE')` existe, `localStorage.getItem('RELAY_BASE')` (prod) reste `null`.

- [ ] **Step 6 : Commit (sandbox uniquement)**

```bash
git add index-test.html
git commit -m "feat(candidats): carte Réglages Relais candidatures (URL + APP_KEY local) [sandbox]"
```

---

### Task 11 : Modale « Inviter un candidat » (variante B) + 3 points d'entrée (sandbox)

**Files:**
- Create: `js/vendor/qrcode-generator.js` (lib QR hors-ligne, MIT — zéro réseau tiers : l'URL-capacité ne doit jamais fuiter vers une API QR externe)
- Modify: `index-test.html` :
  - init `DB.candidatLinks` après `:4922`
  - balise `<script src>` de la lib QR après les autres globals (`:3706`)
  - bloc `<style>` + modale `#ov-invite-candidat` après la modale `#ov-candidat` (`:1995`)
  - remplace le stub `openInviteCandidat()` (`:14440-14443`) par l'implémentation réelle + helpers
  - 3 points d'entrée (D12) : bouton toolbar (`:371`), fiche bien vacant (`:34998`), pied de modale annonce (`:2653`)

> ⚠️ **Sandbox-first** : tout dans `index-test.html`. La modale, le `<style>` et le JS sont **inline** (comme les autres modales de l'app) → l'isolation sandbox est parfaite (rien dans `css/main.css` partagé). `index.html` (prod) ne reçoit ces blocs qu'en Task 16.

**Modèle de données — un enregistrement de `DB.candidatLinks` :**
```
{ id:<linkId>, ownerToken:<capacité bailleur>, logRef, entity, bienLabel, loyer,
  message, createdAt, expiresAt,
  status:'active'|'collected'|'done'|'revoked',   // active=en attente · collected=rapatrié (re-pull stoppé) · done=terminal (relais purgé) · revoked
  opened, deposed,
  candId,            // backref vers DB.candidats, posé au 1er rapatriement (Task 12) — sert au complément D13 (Task 13)
  _archived:false, _modifiedAt }
```
> `candId` est absent à la création (posé par `_relayPullCandidatures`, Task 12). `ownerToken` (capacité de lecture du dossier sur le relais) **est** synchronisé via Drive — nécessaire au multi-device, même niveau de confiance que le reste du `DB` (qui contient déjà des données personnelles locataires). Seul l'`APP_KEY` reste strictement local (Task 10).

- [ ] **Step 1 : Vendoriser la lib QR hors-ligne** — la télécharger dans `js/vendor/` (créer le dossier si besoin). Lib `qrcode-generator` de Kazuhiko Arase (MIT, sans dépendance, API stable `qrcode(type,ecc).addData().make().createImgTag()`) :

```powershell
New-Item -ItemType Directory -Force 'js/vendor' | Out-Null
Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js' -OutFile 'js/vendor/qrcode-generator.js'
# Vérifier : le fichier définit une fonction globale qrcode(...)
Select-String -Path 'js/vendor/qrcode-generator.js' -Pattern 'function qrcode' | Select-Object -First 1
```
Expected : 1 ligne `function qrcode` trouvée (≈ 20 Ko). *(Si l'URL CDN est indisponible : récupérer la même version depuis npm `npm pack qrcode-generator@1.4.4` puis extraire `qrcode.js`.)*

- [ ] **Step 2 : Charger la lib QR** — dans `index-test.html`, juste après les scripts globals existants (`index.html:3706`, après `georisques-erp-detector.global.js`), ajouter :

```html
<script src="js/vendor/qrcode-generator.js"></script>
```

- [ ] **Step 3 : Initialiser la collection** — dans `index-test.html`, après `if (!DB.candidats) DB.candidats = [];` (`index.html:4922`), ajouter :

```js
  if (!DB.candidatLinks) DB.candidatLinks = []; // LOG-CANDIDATS (lien en ligne) — invitations relais émises
```

- [ ] **Step 4 : Ajouter le `<style>` + la modale** — dans `index-test.html`, juste **après** la modale candidat (`</div></div>` qui clôt `#ov-candidat`, `index.html:1995`), insérer :

```html
<style>
/* INVITER UN CANDIDAT — lien en ligne (composants calqués sur le design system ; tokens de css/main.css) */
#ov-invite-candidat .bien-ctx{display:flex;align-items:center;gap:12px;background:var(--bg-info);border:1px solid rgba(59,126,246,.2);border-radius:var(--rl);padding:12px 14px;margin-bottom:16px}
#ov-invite-candidat .bien-ctx .ico{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#0E73F6,#00CCBC);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
#ov-invite-candidat .bien-ctx .nm{font-weight:700;font-size:14px;color:var(--t1)}
#ov-invite-candidat .bien-ctx .meta{font-size:12px;color:var(--t2);margin-top:1px}
#ov-invite-candidat .segd{display:inline-flex;background:var(--sur2);border:1px solid var(--bor);border-radius:var(--r);padding:3px;gap:2px}
#ov-invite-candidat .segd button{background:transparent;border:none;color:var(--t2);font-size:13px;font-weight:600;padding:7px 16px;border-radius:6px;cursor:pointer;font-family:inherit}
#ov-invite-candidat .segd button.act{background:var(--blu);color:#fff}
#ov-invite-candidat .linkbox{display:flex;gap:8px;align-items:stretch}
#ov-invite-candidat .linkbox .url{flex:1;background:var(--sur2);border:1.5px solid var(--bor);border-radius:var(--r);padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center}
#ov-invite-candidat .linkbox .url.ok{border-color:var(--grn);background:var(--bg-success)}
#ov-invite-candidat .chans{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:4px}
#ov-invite-candidat .chan{display:flex;flex-direction:column;align-items:center;gap:6px;padding:13px 6px;border:1.5px solid var(--bor);border-radius:var(--rl);background:var(--sur2);cursor:pointer;transition:all .15s;text-align:center}
#ov-invite-candidat .chan:hover{border-color:var(--blu);background:var(--bg-info)}
#ov-invite-candidat .chan .ci{font-size:22px;line-height:1}
#ov-invite-candidat .chan .cl{font-size:11.5px;font-weight:600;color:var(--t1)}
#ov-invite-candidat .info-box{background:var(--bg-info);border:1px solid rgba(59,126,246,.18);border-radius:var(--rl);padding:12px 14px;font-size:12.5px;color:var(--t2);line-height:1.5;margin-top:14px}
#ov-invite-candidat .info-box b{color:var(--t1)}
#ov-invite-candidat .steps{display:flex;align-items:center;gap:8px;margin-bottom:16px}
#ov-invite-candidat .steps .stp{flex:1;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--t3)}
#ov-invite-candidat .steps .stp .n{width:24px;height:24px;border-radius:50%;background:var(--sur2);border:1.5px solid var(--bor);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
#ov-invite-candidat .steps .stp.act{color:var(--blu)}
#ov-invite-candidat .steps .stp.act .n{background:var(--blu);color:#fff;border-color:var(--blu)}
#ov-invite-candidat .steps .stp.done .n{background:var(--grn);color:#fff;border-color:var(--grn)}
#ov-invite-candidat .steps .bar{flex:0 0 24px;height:2px;background:var(--bor)}
#ov-invite-candidat .qrbox img{width:188px;height:188px;border-radius:var(--rl);border:1px solid var(--bor);box-shadow:var(--shadow);image-rendering:pixelated}
@media(max-width:560px){#ov-invite-candidat .chans{gap:6px}#ov-invite-candidat .chan{padding:10px 4px}}
</style>

<!-- MODAL: INVITER UN CANDIDAT — LOG-CANDIDATS (lien en ligne, assistant 2 étapes — variante B validée) -->
<div class="ov hidden" id="ov-invite-candidat" onclick="closeBg(event,'ov-invite-candidat')">
<div class="modal" style="max-width:560px">
  <div class="m-head"><h3 id="inv-title">Inviter un candidat</h3><button class="m-close" onclick="closeM('ov-invite-candidat')">✕</button></div>
  <div class="m-body" id="inv-body"></div>
  <div class="m-foot" id="inv-foot"></div>
</div></div>
```

- [ ] **Step 5 : Remplacer le stub `openInviteCandidat`** — dans `index-test.html`, remplacer **intégralement** le stub (`index.html:14440-14443`) par :

```js
// ═══════════════════ INVITER UN CANDIDAT — lien en ligne (relais) ═══════════════════
// LOG-CANDIDATS. Assistant 2 étapes (variante B validée) : Configurer → Partager.
// Crée une invitation sur le relais, stocke le lien dans DB.candidatLinks. Le ownerToken
// (capacité bailleur) est synchronisé Drive (multi-device) ; l'APP_KEY reste locale (Task 10).
let _invState = null;
const INV_EXP_DAYS = [7, 14, 30];

function _invBienInfo(ref) {
  const log = (DB.logements || []).find(l => l && !l._deleted && l.ref === ref) || null;
  if (!log) return { logRef: ref || '', entity: '', bienLabel: ref || '', loyer: 0, log: null };
  const type = log.type ? (log.type + ' ') : '';
  const lieu = log.imm || log.adr || log.ref;
  return { logRef: log.ref, entity: log.entity || '', bienLabel: (type + (lieu || '')).trim() || log.ref, loyer: Number(log.hc) || 0, log };
}

function _invSignature(log) {
  const entNom = (log && log.entity) || '';
  const ent = entNom ? (DB.entites || []).find(e => e && e.nom === entNom) : null;
  if (ent && Array.isArray(ent.gerants)) {
    const g = ent.gerants.map(x => String(x || '').trim()).filter(Boolean);
    if (g.length) return g.join(', ');
  }
  return entNom || '';
}

function _invDefaultMessage(bienLabel, signature) {
  const bien = bienLabel || 'le logement';
  const sig = signature ? ('\n' + signature) : '';
  return 'Bonjour,\n\n'
    + 'Merci de l\'intérêt que vous portez à ' + bien + '.\n\n'
    + 'Pour étudier votre candidature, je vous invite à déposer votre dossier de location en ligne via le lien sécurisé ci-dessous : pièce d\'identité, justificatif de domicile, situation professionnelle et justificatif de ressources.\n\n'
    + 'Aucun compte n\'est nécessaire. Vous pouvez interrompre puis reprendre votre dépôt à tout moment avec le même lien. Vos documents sont chiffrés et transmis à moi seul.\n\n'
    + 'Bien cordialement,' + sig;
}

function openInviteCandidat(ctx) {
  ctx = ctx || {};
  const info = ctx.logRef ? _invBienInfo(ctx.logRef) : { logRef: '', entity: '', bienLabel: '', loyer: 0, log: null };
  _invState = {
    fixed: !!ctx.logRef, logRef: info.logRef, entity: info.entity,
    bienLabel: info.bienLabel, loyer: info.loyer, expDays: 14,
    message: _invDefaultMessage(info.bienLabel, _invSignature(info.log)),
    link: null
  };
  _invRenderStep1();
  openM('ov-invite-candidat');
}

function _invBienCtxHtml() {
  if (_invState.fixed) {
    return '<div class="bien-ctx"><div class="ico">🏠</div><div>'
      + '<div class="nm">' + escHtml(_invState.bienLabel || '—') + '</div>'
      + '<div class="meta">' + (_invState.loyer > 0 ? (_invState.loyer.toLocaleString('fr-FR') + ' € HC') : 'loyer non renseigné') + ' · pré-rempli depuis la fiche</div>'
      + '</div></div>';
  }
  const opts = _logementsVacants().map(l => {
    const info = _invBienInfo(l.ref);
    return '<option value="' + escHtml(l.ref) + '"' + (l.ref === _invState.logRef ? ' selected' : '') + '>'
      + escHtml(info.bienLabel + (info.loyer > 0 ? (' · ' + info.loyer.toLocaleString('fr-FR') + ' € HC') : '')) + '</option>';
  }).join('');
  return '<div class="fg"><label>Bien concerné <span style="color:var(--ora,#ea580c)">⚠ à choisir</span></label>'
    + '<select class="inp" id="inv-bien" onchange="_invSelectBien(this.value)"><option value="">— Sélectionner un bien —</option>' + opts + '</select></div>';
}

function _invStepsBar(active) {
  function s(n, lab, st) { return '<div class="stp ' + st + '"><span class="n">' + (st === 'done' ? '✓' : n) + '</span>' + lab + '</div>'; }
  return '<div class="steps">' + s(1, 'Configurer', active >= 2 ? 'done' : 'act') + '<div class="bar"></div>' + s(2, 'Partager', active >= 2 ? 'act' : '') + '</div>';
}

function _invSegHtml() {
  return '<div class="fg"><label>Validité du lien</label><div class="segd" id="inv-seg">'
    + INV_EXP_DAYS.map(d => '<button type="button" class="' + (d === _invState.expDays ? 'act' : '') + '" onclick="_invSetExp(' + d + ')">' + d + ' jours</button>').join('')
    + '</div><div class="sm mu" style="margin-top:6px">Au-delà, le lien expire et le candidat ne peut plus déposer.</div></div>';
}

function _invRenderStep1() {
  const body = el('inv-body'); if (!body) return;
  if (el('inv-title')) el('inv-title').textContent = 'Inviter un candidat';
  body.innerHTML = _invStepsBar(1)
    + _invBienCtxHtml()
    + _invSegHtml()
    + '<div class="fg"><label>Message au candidat <span class="mu sm" style="font-weight:400">— pré-rempli, modifiable</span></label>'
    + '<textarea class="inp" id="inv-msg" rows="8" style="resize:vertical" oninput="this.dataset.touched=\'1\'">' + escHtml(_invState.message) + '</textarea></div>'
    + '<div class="info-box" style="background:var(--sur2);border-color:var(--bor)">🛡 <b>RGPD</b> — les pièces transitent par le relais (sous-traitant Cloudflare) puis sont rapatriées dans votre coffre et <b>supprimées du relais</b> dès réception. Dossiers refusés purgés après 30 jours.</div>';
  const foot = el('inv-foot');
  if (foot) foot.innerHTML = '<button class="btn bs" onclick="closeM(\'ov-invite-candidat\')">Annuler</button>'
    + '<button class="btn bp" id="inv-gen-btn" onclick="_invGenerate()">Continuer →</button>';
}

function _invSelectBien(ref) {
  const info = _invBienInfo(ref);
  _invState.logRef = info.logRef; _invState.entity = info.entity;
  _invState.bienLabel = info.bienLabel; _invState.loyer = info.loyer;
  const ta = el('inv-msg');
  if (ta && ta.dataset.touched !== '1') {
    _invState.message = _invDefaultMessage(info.bienLabel, _invSignature(info.log));
    ta.value = _invState.message;
  }
}

function _invSetExp(d) {
  _invState.expDays = d;
  const btns = document.querySelectorAll('#inv-seg button');
  btns.forEach(b => b.classList.remove('act'));
  INV_EXP_DAYS.forEach((x, i) => { if (x === d && btns[i]) btns[i].classList.add('act'); });
}

async function _invGenerate() {
  const cfg = (typeof _relayCfg === 'function') ? _relayCfg() : null;
  if (!window._relayConfigured || !window._relayConfigured(cfg)) {
    showToast('Configurez d\'abord le relais (Réglages → 🔗 Relais candidatures).', 'warn', 6000);
    return;
  }
  if (!_invState.logRef) { showToast('Choisissez un bien.', 'warn'); return; }
  const ta = el('inv-msg'); if (ta) _invState.message = ta.value;
  const btn = el('inv-gen-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Génération…'; }
  try {
    const out = await window._relayCreateInvitation(cfg, {
      logRef: _invState.logRef, bienLabel: _invState.bienLabel,
      loyer: _invState.loyer, message: _invState.message, expDays: _invState.expDays
    });
    const url = out.candidatUrl || (window._buildCandidatUrl ? window._buildCandidatUrl(cfg.base, out.linkId) : '');
    _invState.link = { id: out.linkId, url, ownerToken: out.ownerToken, expiresAt: out.expiresAt };
    if (!Array.isArray(DB.candidatLinks)) DB.candidatLinks = [];
    const rec = {
      id: out.linkId, ownerToken: out.ownerToken, logRef: _invState.logRef,
      entity: _invState.entity, bienLabel: _invState.bienLabel, loyer: _invState.loyer,
      message: _invState.message, createdAt: new Date().toISOString(),
      expiresAt: out.expiresAt, status: 'active', opened: 0, deposed: 0, _archived: false
    };
    if (typeof _stamp === 'function') _stamp(rec); else rec._modifiedAt = Date.now();
    DB.candidatLinks.push(rec);
    saveDB();
    _invRenderStep2();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Continuer →'; }
    showToast('Échec de génération : ' + ((e && e.message) || 'relais injoignable'), 'err', 6000);
  }
}

function _invRenderStep2() {
  const body = el('inv-body'); if (!body || !_invState.link) return;
  if (el('inv-title')) el('inv-title').textContent = 'Lien d\'invitation prêt';
  const url = _invState.link.url;
  const exp = _invState.link.expiresAt ? new Date(_invState.link.expiresAt).toLocaleDateString('fr-FR') : '—';
  body.innerHTML = _invStepsBar(2)
    + (_invState.fixed ? _invBienCtxHtml() : '')
    + '<div class="fg"><label>Lien d\'invitation</label><div class="linkbox">'
    +   '<div class="url ok" id="inv-url">' + escHtml(url) + '</div>'
    +   '<button class="btn bp" onclick="_invCopy()">📋 Copier</button></div></div>'
    + '<div class="fg"><label>Partager par</label><div class="chans">'
    +   '<div class="chan" onclick="_invShareEmail()"><span class="ci">✉️</span><span class="cl">Email</span></div>'
    +   '<div class="chan" onclick="_invShareSms()"><span class="ci">💬</span><span class="cl">SMS</span></div>'
    +   '<div class="chan" onclick="_invShareWhatsApp()"><span class="ci">🟢</span><span class="cl">WhatsApp</span></div>'
    +   '<div class="chan" onclick="_invToggleQr()"><span class="ci">⬛</span><span class="cl">QR code</span></div>'
    +   '</div></div>'
    + '<div id="inv-qr-wrap" class="hidden" style="text-align:center;margin-top:12px"></div>'
    + '<div class="info-box">🔒 Le candidat <b>n\'a pas besoin de compte</b>. Le lien ouvre un formulaire sécurisé. Valable jusqu\'au <b>' + exp + '</b>. Le dossier déposé apparaîtra dans l\'onglet Candidats après actualisation.</div>';
  const foot = el('inv-foot');
  if (foot) foot.innerHTML = '<button class="btn bs" onclick="_invRenderStep1()">← Étape 1</button>'
    + '<button class="btn bp" onclick="closeM(\'ov-invite-candidat\'); if(typeof rCandidats===\'function\') rCandidats();">Terminé</button>';
}

function _invCopyFallback(text, done) {
  try { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); if (done) done(); }
  catch (e) { showToast('Copie impossible', 'err'); }
}
function _invCopy() {
  const url = (_invState && _invState.link) ? _invState.link.url : '';
  if (!url) return;
  const done = () => showToast('Lien copié', 'ok');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => _invCopyFallback(url, done));
  else _invCopyFallback(url, done);
}
function _invShareText() { return ((_invState.message || '').trim()) + '\n\n' + _invState.link.url; }
function _invShareEmail() {
  const subject = 'Votre dossier de location' + (_invState.bienLabel ? (' — ' + _invState.bienLabel) : '');
  location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(_invShareText());
}
function _invShareSms() { location.href = 'sms:?&body=' + encodeURIComponent('Dépôt de votre dossier de location : ' + _invState.link.url); }
function _invShareWhatsApp() { window.open('https://wa.me/?text=' + encodeURIComponent(_invShareText()), '_blank', 'noopener'); }
function _invToggleQr() {
  const wrap = el('inv-qr-wrap'); if (!wrap) return;
  if (!wrap.classList.contains('hidden')) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  if (typeof qrcode === 'undefined') { wrap.innerHTML = '<div class="mu sm">QR indisponible (lib non chargée).</div>'; return; }
  try {
    const qr = qrcode(0, 'M'); qr.addData(_invState.link.url); qr.make();
    wrap.innerHTML = '<div class="qrbox">' + qr.createImgTag(5, 8) + '</div><div class="sm mu" style="margin-top:8px">Le candidat scanne ce code pour ouvrir son dossier sur mobile.</div>';
  } catch (e) { wrap.innerHTML = '<div class="mu sm">QR indisponible.</div>'; }
}
```

- [ ] **Step 6 : Point d'entrée ① — bouton toolbar Candidats** — dans `index-test.html`, remplacer le bouton `:371` :

```html
          <button class="btn bs" onclick="openInviteCandidat()" title="Générer un lien d'invitation en ligne (dépôt de dossier sans compte)">🔗 Inviter un candidat</button>
```
*(supprime le `<span class="note-lien">lien en ligne — bientôt</span>`).*

- [ ] **Step 7 : Point d'entrée ② — fiche d'un bien vacant** — dans `index-test.html`, dans le bloc `${(!isArchived && !_bienActiveBail(ref)) ? ` ... ``` (juste après le bouton `📢 Générer l'annonce`, `index.html:34998`), ajouter :

```html
            <button class="btn bs bb" onclick="openInviteCandidat({logRef:'${refSafe}'})" title="Envoyer au candidat un lien de dépôt de dossier en ligne pour ce bien">🔗 Inviter un candidat</button>
```

- [ ] **Step 8 : Point d'entrée ③ — pied de la modale annonce** — dans `index-test.html`, dans le `m-foot` de `#ov-annonce` (`index.html:2652-2657`), juste après le bouton « Fermer » (`:2653`), ajouter :

```html
      <button type="button" class="btn bs" onclick="openInviteCandidat({logRef:(window._annonceCtx&&_annonceCtx.log)?_annonceCtx.log.ref:''})" title="Inviter un candidat à déposer son dossier pour ce bien">🔗 Inviter un candidat</button>
```

- [ ] **Step 9 : Vérifier (modify + verify)** — dans `index-test.html` :

```bash
grep -c "id=\"ov-invite-candidat\"" index-test.html        # attendu : 1
grep -c "function openInviteCandidat" index-test.html       # attendu : 1 (le stub a disparu)
grep -c "note-lien" index-test.html                          # attendu : 0 (la mention « bientôt » a disparu)
grep -c "openInviteCandidat(" index-test.html                # attendu : 4 (def + 3 points d'entrée)
grep -c "DB.candidatLinks" index-test.html                   # attendu : >=2 (init + push)
grep -c "qrcode-generator.js" index-test.html                # attendu : 1
```

- [ ] **Step 10 : Validation visuelle sandbox (vrai navigateur, 3 largeurs)**
Pré-requis : avoir configuré le relais (Task 10) **et** la Partie 1 déployée (GATE Task 8) pour générer un vrai lien. Ouvrir `index-test.html` dans Chrome :
  - Onglet Candidats → « 🔗 Inviter un candidat » (sans bien) : modale étape 1, select « ⚠ à choisir » listant les biens vacants, durée 14 j par défaut, message pré-rempli, encart RGPD.
  - Depuis une fiche de bien vacant → bouton « 🔗 Inviter un candidat » : modale avec bandeau bien pré-rempli (pas de select).
  - Depuis une annonce (modale 📢) → même chose pour le bien de l'annonce.
  - « Continuer → » : appel relais, passage étape 2 ; lien affiché (vert), Copier (toast), canaux Email/SMS/WhatsApp ouvrent le bon deep-link pré-rempli, QR s'affiche/masque.
  - Vérifier sur les 3 largeurs (DevTools 390 / 760 / PC) la cohérence avec le mockup `mockups/candidature/inviter-candidat.html` (variante B) et le design system (pas de couleur/typo hors tokens).
  - Vérifier `DB.candidatLinks` peuplé (console : `DB.candidatLinks.length` ≥ 1) et `localStorage` du sandbox isolé (clé `_test_immotrack_v4`).

- [ ] **Step 11 : Commit (sandbox)**

```bash
git add js/vendor/qrcode-generator.js index-test.html
git commit -m "feat(candidats): modale Inviter un candidat (lien en ligne, assistant 2 étapes + QR) [sandbox]"
```

---

### Task 12 : Rapatriement des dossiers déposés `_relayPullCandidatures()` (sandbox + audit-ready)

**Files:**
- Modify: `index-test.html` :
  - fonctions `_bytesToDataUrl` + `_relayPullCandidatures` après les helpers d'invitation (Task 11)
  - bouton « 🔄 Actualiser les dépôts » dans la toolbar Candidats (`:370`)
  - merge Drive de `DB.candidatLinks` après le merge `candidats` (`:45429`)

**But :** pour chaque lien `active`, interroger le relais ; si un dossier est soumis → créer **ou mettre à jour** le candidat (`source:'lien'`, score recalculé localement), télécharger ses **nouvelles** pièces dans la GED (`parentType:'candidat'`), puis marquer le lien `collected`. **Modèle « reopen » (choix utilisateur 2026-06-03) : on NE PURGE PAS au pull** — l'enregistrement relais survit (TTL côté KV) pour permettre la demande de complément D13 (« le reste de votre dossier est conservé », cf. mockup `dossier-public.html`). La purge du relais est différée à l'état **terminal** du candidat (converti / refusé) ou au TTL (cf. Task 13). Idempotent : seuls les liens `active` sont interrogés (statut `collected` stoppe le re-pull) ; les pièces déjà importées sont dédupliquées par `pieceId` (`cand._relayPieceIds`) ; un `404/410` (relais expiré ou révoqué) clôt le lien sans réimporter.

> 🛡 **Audit obligatoire** : ce flux manipule des PII de tiers transitant par un sous-traitant + écrit dans la GED + alimente Drive. Il fait partie du périmètre de l'audit agent (Task 15) avant toute mise en prod.

- [ ] **Step 1 : Ajouter les fonctions** — dans `index-test.html`, juste après `_invToggleQr()` (fin du bloc JS de la Task 11), insérer :

```js
// ═══════════════════ RAPATRIEMENT DES DOSSIERS DÉPOSÉS (relais → app) ═══════════════════
// LOG-CANDIDATS. Convertit des octets bruts (Uint8Array) en data URL pour la GED (qui
// attend dataB64 = data URL, cf. _attachmentSaveForEntity). Chunké pour les gros fichiers.
function _bytesToDataUrl(bytes, mime) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return 'data:' + (mime || 'application/octet-stream') + ';base64,' + btoa(bin);
}

// Interroge le relais pour tous les liens 'active' et rapatrie/actualise les dossiers soumis.
// MODÈLE « REOPEN » : pas de purge au pull (le relais survit jusqu'au TTL ou à l'état
// terminal du candidat, Task 13) pour autoriser la demande de complément D13.
// Idempotence : statut du lien ('active' → 'collected') + dédup pièces par pieceId.
async function _relayPullCandidatures(opts) {
  opts = opts || {};
  const cfg = (typeof _relayCfg === 'function') ? _relayCfg() : null;
  if (!window._relayConfigured || !window._relayConfigured(cfg)) {
    if (!opts.silent) showToast('Relais non configuré (Réglages → 🔗 Relais candidatures).', 'warn');
    return { imported: 0, errors: 0 };
  }
  const links = (DB.candidatLinks || []).filter(l => l && !l._archived && l.status === 'active');
  let imported = 0, errors = 0;
  if (!Array.isArray(DB.candidats)) DB.candidats = [];
  for (const link of links) {
    try {
      const res = await window._relayFetchResult(cfg, link.id, link.ownerToken);
      if (res && res._status === 409) continue; // pas encore soumis
      // Mapping pur — AUCUN score injecté par le relais (recalculé localement plus bas).
      const partial = window._relayDossierVersCandidat(res, { logRef: link.logRef, entity: link.entity });
      // D13 : si le lien référence déjà un candidat (complément), on le met à jour ; sinon création.
      let cand = link.candId ? DB.candidats.find(x => x && x.id === link.candId && !x._deleted) : null;
      const isNew = !cand;
      if (isNew) {
        cand = _nouveauCandidat(partial);
        cand.linkId = link.id;
        DB.candidats.push(cand);
        if (typeof _auditLog === 'function') { try { _auditLog('create', 'candidat', cand.id, (cand.nom || '') + ' (lien en ligne)'); } catch (e) {} }
      } else {
        // Complément : le dossier re-soumis fait foi pour les champs déclarés ; on préserve
        // id / source / dateCreation / décisions manuelles (statut terminal, piecesVerifiees, score).
        ['civilite','nom','prenom','ddn','lieuNaiss','tel','email','adressePrecedente',
         'revenus','employeur','contrat','garant','piecesCompletes']
          .forEach(k => { cand[k] = partial[k]; });
        if (cand.statut !== 'refuse' && cand.statut !== 'converti') cand.statut = 'enCours';
        if (typeof _auditLog === 'function') { try { _auditLog('update', 'candidat', cand.id, 'complément déposé (lien en ligne)'); } catch (e) {} }
      }
      // Télécharger les NOUVELLES pièces dans la GED (dédup par pieceId déjà importé).
      if (!Array.isArray(cand._relayPieceIds)) cand._relayPieceIds = [];
      const pieces = Array.isArray(res.pieces) ? res.pieces : [];
      for (const p of pieces) {
        if (cand._relayPieceIds.includes(p.pieceId)) continue; // déjà en GED
        try {
          const { bytes, contentType } = await window._relayFetchPiece(cfg, link.id, p.pieceId, link.ownerToken);
          await _attachmentSaveForEntity(
            { type: 'candidat', id: cand.id, ref: cand.id, logRef: cand.logRef, category: p.categorie || 'candidature' },
            { name: p.filename || (p.categorie || 'piece'), mime: contentType, size: bytes.length, dataB64: _bytesToDataUrl(bytes, contentType) }
          );
          cand._relayPieceIds.push(p.pieceId);
        } catch (e) { console.warn('[relay] pièce', p.pieceId, e); errors++; }
      }
      // Recalcul du score Confiance — 100 % local (loi 6 juillet 1989 / décret 2015-1437).
      const loyerHC = Number(link.loyer) || (typeof _invBienInfo === 'function' ? (_invBienInfo(link.logRef).loyer || 0) : 0);
      try { cand.confianceScore = _calculConfiance(cand, loyerHC); } catch (e) {}
      _stamp(cand);
      // PAS DE PURGE (modèle reopen). On stoppe juste le re-pull de ce lien + backref D13.
      link.candId = cand.id; link.status = 'collected'; link.deposed = (link.deposed || 0) + 1;
      if (typeof _stamp === 'function') _stamp(link); else link._modifiedAt = Date.now();
      imported++;
    } catch (e) {
      // 404/410 = relais expiré (TTL) ou révoqué → clore localement (pas de réimport).
      if (/relay (404|410)|not found/i.test(String(e && e.message))) {
        link.status = 'collected';
        if (typeof _stamp === 'function') _stamp(link); else link._modifiedAt = Date.now();
      } else { errors++; console.warn('[relay] pull', link.id, e); }
    }
  }
  if (imported > 0 || errors > 0) saveDB();
  if (imported > 0 && typeof rCandidats === 'function') rCandidats();
  if (!opts.silent) {
    if (imported > 0) showToast(imported + ' dossier' + (imported > 1 ? 's' : '') + ' rapatrié' + (imported > 1 ? 's' : ''), 'ok');
    else if (errors > 0) showToast('Aucun nouveau dossier (' + errors + ' erreur' + (errors > 1 ? 's' : '') + ')', 'warn');
    else showToast('Aucun nouveau dossier déposé', 'ok');
  }
  return { imported, errors };
}
```

- [ ] **Step 2 : Bouton « Actualiser les dépôts » dans la toolbar Candidats** — dans `index-test.html`, dans le groupe d'actions de l'onglet Candidats (`index.html:370-373`), juste **avant** le bouton « 🔗 Inviter un candidat », ajouter :

```html
          <button class="btn bs" onclick="_relayPullCandidatures()" title="Vérifier et rapatrier les dossiers déposés via les liens en ligne">🔄 Actualiser les dépôts</button>
```

- [ ] **Step 3 : Merge Drive de `DB.candidatLinks`** — dans `index-test.html`, juste **après** le bloc de merge `candidats` (`index.html:45419-45429`), ajouter (même arbitrage `_drvWins` par `id`) :

```js
  // LOG-CANDIDATS (lien en ligne) : merge candidatLinks (par id, arbitrage _drvWins)
  if(Array.isArray(payload.candidatLinks)) {
    if(!DB.candidatLinks) DB.candidatLinks=[];
    payload.candidatLinks.forEach(l=>{
      const i=DB.candidatLinks.findIndex(x=>x.id===l.id);
      if(i>=0){
        if(_drvWins(l, DB.candidatLinks[i], upd)) { DB.candidatLinks[i]=l; _drvMark(); }
        else conflicts++;
      } else { DB.candidatLinks.push(l); _drvMark(); }
    });
  }
```

- [ ] **Step 4 : Vérifier (modify + verify)** — dans `index-test.html` :

```bash
grep -c "function _relayPullCandidatures" index-test.html   # attendu : 1
grep -c "function _bytesToDataUrl" index-test.html           # attendu : 1
grep -c "_relayPullCandidatures()" index-test.html           # attendu : >=2 (def + bouton ; +1 si auto-appel)
grep -c "payload.candidatLinks" index-test.html              # attendu : 1 (merge Drive)
```
Vérifier aussi que `_relayFetchResult` / `_relayFetchPiece` / `_relayPurge` sont bien exposés sur `window` (Task 9) :
```bash
grep -c "window._relayFetchResult\|window._relayFetchPiece\|window._relayPurge" js/main.js   # attendu : 3
```

- [ ] **Step 5 : Validation fonctionnelle bout-en-bout (sandbox + relais déployé)**
Pré-requis : relais déployé (GATE Task 8), Réglages configurés (Task 10), au moins un lien généré (Task 11) et un dossier soumis côté candidat. Dans `index-test.html` :
  - Cliquer « 🔄 Actualiser les dépôts » → toast « 1 dossier rapatrié », le candidat apparaît dans l'onglet (statut « reçu », score Confiance calculé, badge garant correct).
  - Ouvrir la fiche candidat → les pièces déposées sont présentes dans la GED (catégories identité/domicile/situation/ressources/garant), ouvrables.
  - Re-cliquer « Actualiser » → « Aucun nouveau dossier » (idempotence : pas de doublon ; `DB.candidats` n'a pas grossi ; le lien est passé `status:'collected'` donc plus interrogé).
  - **Modèle reopen** : vérifier que le relais **conserve** le dossier après pull — `GET /d/<linkId>` répond encore (le candidat verrait son dossier ; pas de 404). La purge n'a PAS eu lieu au pull (elle est différée à l'état terminal, testée en Task 13).
  - Vérifier qu'**aucun score** n'a été transmis par le relais (le score affiché provient bien de `_calculConfiance`, recalculé localement).
  - Vérifier le backref D13 : `DB.candidatLinks` du lien collecté porte bien `candId === <id du candidat créé>` (préalable au complément Task 13).

- [ ] **Step 6 : Commit (sandbox)**

```bash
git add index-test.html
git commit -m "feat(candidats): rapatriement des dossiers déposés via le relais (modèle reopen) [sandbox]"
```

---

### Task 13 : Demande de complément D13 (reopen) + purge à l'état terminal (sandbox)

**Files:**
- Modify: `index-test.html` :
  - rewrite de `demanderComplementCandidat(id)` (`index.html:14506`) + nouveaux helpers `_relayPurgeForCandidat`, `_complementLocal`
  - hook purge terminale dans `_finalizeCandidatConversion` (`index.html:15124-15140`, après `saveDB()`) et `refuserCandidat` (`index.html:14500-14504`)
  - bandeau « complément demandé » dans `openFicheCandidat` (carte pipeline, `index.html:14643`)

**But (modèle « reopen » validé 2026-06-03) :** sur un candidat venu d'un **lien en ligne**, « 📩 Demander un complément » rouvre le dépôt côté relais (`relayReopen` → le candidat complète en ligne, *le reste de son dossier est conservé*) **et** repasse le lien en `active` pour que le prochain « 🔄 Actualiser les dépôts » fusionne le complément dans le candidat existant (cf. Task 12, branche `link.candId`). Sur un candidat **saisi manuellement** (pas de canal en ligne), on se contente de repasser « En cours » avec une note interne. La **purge du relais** (accusé de réception RGPD — minimisation) est faite à l'**état terminal** du candidat : conversion en bail (`_finalizeCandidatConversion`) ou refus (`refuserCandidat`). Le TTL KV reste le filet de sécurité ultime.

> 🛡 **Audit obligatoire (Task 15)** : ce flux rouvre un accès tiers à des PII et déclenche une suppression chez le sous-traitant — périmètre de l'audit agent avant prod.
>
> ⚠️ **Déviation assumée (UX) :** la saisie de la note utilise `prompt()` natif (action peu fréquente, note interne saisie par le bailleur). **Caveat commercialisation** : remplacer par une petite modale stylée (design-system) — noté, hors périmètre de cette livraison.

- [ ] **Step 1 : Helper de purge terminale** — dans `index-test.html`, juste **avant** `function demanderComplementCandidat(id){` (`index.html:14506`), insérer :

```js
// État terminal (converti / refusé) → purge le relais (accusé de réception RGPD :
// la donnée a fini son cycle utile) + clôt le lien. Best-effort, async fire-and-forget
// (le TTL KV reste le filet de sécurité si la purge échoue / hors-ligne).
async function _relayPurgeForCandidat(c){
  if(!c || c.source!=='lien' || !c.linkId) return;
  const link = (DB.candidatLinks||[]).find(l=>l && l.id===c.linkId && !l._archived);
  if(!link || !link.ownerToken || link.status==='done') return;
  const cfg = (typeof _relayCfg==='function') ? _relayCfg() : null;
  if(!window._relayConfigured || !window._relayConfigured(cfg)) return;
  try{ await window._relayPurge(cfg, link.id, link.ownerToken); }
  catch(e){ console.warn('[relay] purge terminal', link.id, e); }
  link.status='done';
  if(typeof _stamp==='function') _stamp(link); else link._modifiedAt=Date.now();
  saveDB();
}
```

- [ ] **Step 2 : Réécrire `demanderComplementCandidat`** — dans `index-test.html`, remplacer **toute** la fonction `demanderComplementCandidat` actuelle (`index.html:14506-14513`, du commentaire `// Demande de complément...` jusqu'à son `}` final) par :

```js
// Demande de complément (D13). Candidat « lien en ligne » → rouvre le dépôt via le relais
// (note transmise, reste du dossier conservé) + ré-arme le lien pour le prochain pull.
// Candidat saisi manuellement → simple repassage « En cours » (aucun canal de relance).
async function demanderComplementCandidat(id){
  const c = (DB.candidats||[]).find(x=>x && x.id===id); if(!c) return;
  const link = c.linkId ? (DB.candidatLinks||[]).find(l=>l && l.id===c.linkId && !l._archived) : null;
  const enLigne = !!(c.source==='lien' && link && link.ownerToken);
  const raw = prompt(
    enLigne
      ? "Message au candidat (ce qui manque) :\nIl pourra compléter en ligne ; le reste de son dossier est conservé."
      : "Note interne (ce qui manque) — candidat saisi manuellement, aucune relance en ligne ne sera envoyée :",
    "Merci de compléter votre dossier (pièce manquante)."
  );
  if(raw === null) return;                 // annulé
  const note = raw.trim();
  if(!enLigne){ _complementLocal(c, id, note); return; }
  const cfg = (typeof _relayCfg==='function') ? _relayCfg() : null;
  if(!window._relayConfigured || !window._relayConfigured(cfg)){
    showToast('Relais non configuré (Réglages → 🔗 Relais candidatures).','warn'); return;
  }
  try{
    await window._relayReopen(cfg, link.id, link.ownerToken, note);
  }catch(e){
    // 404/410 = dossier relais expiré (TTL) ou révoqué → plus de canal en ligne, on bascule local.
    console.warn('[relay] reopen', link.id, e);
    showToast("Le lien en ligne a expiré : le candidat ne peut plus compléter en ligne.",'warn',7000);
    link.status='done'; if(typeof _stamp==='function') _stamp(link); else link._modifiedAt=Date.now();
    _complementLocal(c, id, note); return;
  }
  link.status='active';                     // ré-arme le pull pour récupérer le complément
  if(typeof _stamp==='function') _stamp(link); else link._modifiedAt=Date.now();
  c.statut='enCours'; c.complementNote=note; _stamp(c);
  try{ if(typeof _auditLog==='function') _auditLog('update','candidat',id,'complément demandé (lien rouvert)'); }catch(e){}
  saveDB(); rCandidats();
  if(el('ov-fiche-candidat') && !el('ov-fiche-candidat').classList.contains('hidden')) openFicheCandidat(id);
  const url = window._buildCandidatUrl ? window._buildCandidatUrl(cfg.base, link.id) : '';
  try{ await navigator.clipboard.writeText(url); showToast('Complément demandé — lien copié. Renvoyez-le au candidat (email / SMS).','ok',7000); }
  catch(_){ showToast('Complément demandé. Lien à renvoyer : '+url,'ok',9000); }
}

// Repassage « En cours » sans canal en ligne (candidat manuel ou lien expiré).
function _complementLocal(c, id, note){
  c.statut='enCours'; if(note) c.complementNote=note; _stamp(c);
  try{ if(typeof _auditLog==='function') _auditLog('update','candidat',id,'statut=enCours (complément demandé)'); }catch(e){}
  saveDB(); rCandidats();
  if(el('ov-fiche-candidat') && !el('ov-fiche-candidat').classList.contains('hidden')) openFicheCandidat(id);
  showToast('Statut « En cours ». Aucune relance en ligne (candidat hors canal).','info',6000);
}
```

- [ ] **Step 3 : Hook purge terminale — conversion** — dans `index-test.html`, dans `_finalizeCandidatConversion` (`index.html:15124`), juste **après** la ligne `saveDB();` (`index.html:15137`) et **avant** `rCandidats();`, insérer :

```js
  _relayPurgeForCandidat(c); // état terminal (converti) → purge relais (RGPD)
```

- [ ] **Step 4 : Hook purge terminale — refus** — dans `index-test.html`, dans `refuserCandidat` (`index.html:14500`), remplacer la ligne `  setCandidatStatut(id,'refuse');` par :

```js
  setCandidatStatut(id,'refuse');
  const cR = (DB.candidats||[]).find(x=>x && x.id===id); if(cR) _relayPurgeForCandidat(cR); // terminal → purge relais (RGPD)
```

- [ ] **Step 5 : Bandeau « complément demandé » dans la fiche** — dans `index-test.html`, dans `openFicheCandidat` (`index.html:14522`), juste **après** le bloc qui termine `actionsHtml` (la ligne `  }` qui ferme le `else` à `index.html:14565`, avant le commentaire `// ── Situation`), insérer :

```js
  // D13 : rappel visuel d'une demande de complément en attente.
  const complBanner = (c.statut==='enCours' && c.complementNote)
    ? `<div class="alert info" style="margin-top:12px;margin-bottom:0">📩 <b>Complément demandé :</b> ${escHtml(c.complementNote)}${c.source==='lien'?' — le candidat peut le déposer via son lien (dossier conservé).':''}</div>`
    : '';
```

Puis, dans le template de la carte pipeline, juste **après** la ligne `<div class="flex-c" style="gap:8px;flex-wrap:wrap;margin-top:18px">${actionsHtml}</div>` (`index.html:14643`), ajouter sur la ligne suivante :

```html
      ${complBanner}
```

- [ ] **Step 6 : Vérifier (modify + verify)** — dans `index-test.html` :

```bash
grep -c "function _relayPurgeForCandidat" index-test.html          # attendu : 1
grep -c "async function demanderComplementCandidat" index-test.html # attendu : 1
grep -c "function _complementLocal" index-test.html                # attendu : 1
grep -c "_relayPurgeForCandidat(" index-test.html                  # attendu : >=3 (def + conversion + refus)
grep -c "window._relayReopen" index-test.html                      # attendu : 1 (dans demanderComplementCandidat)
grep -c "complBanner" index-test.html                              # attendu : 2 (déclaration + insertion)
```
Vérifier aussi qu'il ne reste **aucune** ancienne version synchrone : `grep -n "La relance en ligne du candidat arrivera avec le module relais" index-test.html` → **0 résultat** (l'ancien toast placeholder a disparu).

- [ ] **Step 7 : Validation fonctionnelle (sandbox + relais déployé)**
Pré-requis : Tasks 10-12 validées, un candidat `source:'lien'` déjà rapatrié (lien `status:'collected'`, `candId` renseigné). Dans `index-test.html` :
  - Ouvrir la fiche du candidat → « 📩 Demander un complément » → saisir une note → toast « lien copié », la fiche affiche le bandeau bleu « Complément demandé : … », le lien est repassé `active`.
  - Côté candidat (autre navigateur, l'URL copiée) : la page affiche le bandeau complément (D13) avec la note, le dossier précédent est conservé ; ajouter une pièce et re-soumettre.
  - Revenir dans l'app → « 🔄 Actualiser les dépôts » → **pas** de nouveau candidat (mise à jour de l'existant) ; la nouvelle pièce apparaît dans la GED ; les pièces déjà importées **ne sont pas dupliquées** (dédup `_relayPieceIds`) ; le score est recalculé ; le lien repasse `collected`.
  - **Purge terminale — refus** : refuser un candidat `source:'lien'` → vérifier que `GET /d/<linkId>` renvoie désormais 404 (relais purgé) et que le lien est `status:'done'`.
  - **Purge terminale — conversion** : valider puis convertir un autre candidat `source:'lien'` en bail → même vérification (relais purgé, lien `done`, pièces migrées vers le bail).
  - Candidat **manuel** : « Demander un complément » → repasse « En cours » + bandeau, **aucun** appel réseau (vérifier l'onglet Réseau : pas de requête `/reopen`).

- [ ] **Step 8 : Commit (sandbox)**

```bash
git add index-test.html
git commit -m "feat(candidats): demande de complément D13 (reopen) + purge relais à l'état terminal [sandbox]"
```

---

### Task 14 : Mise à jour du registre RGPD (canal de dépôt en ligne)

**Files:**
- Modify: `docs/legal/RGPD-REGISTRE.md`

**But :** le relais Cloudflare transporte désormais aussi des PII de **candidats** (et non plus seulement le bail à signer). Le registre art. 30 doit refléter ce nouveau canal : sous-traitant Cloudflare élargi, durée de conservation côté relais, transferts hors UE, mesures techniques du dépôt en ligne, et confidentialité du score (D7). Document pur — aucune dépendance code, commit indépendant.

- [ ] **Step 1 : Élargir la ligne sous-traitant Cloudflare** — dans `docs/legal/RGPD-REGISTRE.md`, remplacer la cellule « Service » de la ligne Cloudflare (`:27`) :

Remplacer :
```
| **Cloudflare, Inc.** | Relais de signature à distance (Worker + R2 + KV) — `bail-sign-relay`, transit temporaire du bail le temps de la signature |
```
par :
```
| **Cloudflare, Inc.** | Relais de signature à distance **et de candidatures** (Worker + R2 + KV) — `bail-sign-relay` : transit temporaire (1) du bail le temps de la signature, (2) des dossiers de candidature (**KV seul**, pas de R2) le temps du dépôt en ligne et de l'examen |
```

- [ ] **Step 2 : Ajouter le paragraphe « Relais de candidatures »** — dans `docs/legal/RGPD-REGISTRE.md`, juste **après** le paragraphe « Relais de signature » (`:31`, qui se termine par « …localisation des données dans l'UE est requise. ») et **avant** le `---` (`:33`), insérer :

```markdown

**Relais de candidatures** : lorsqu'un candidat dépose son dossier via un lien en ligne, son dossier (identité, situation, garant) et ses pièces justificatives (limitées au décret n° 2015-1437) transitent par Cloudflare **KV uniquement** (1 pièce = 1 valeur KV, plafonnée à 20 Mo). Le lien est un **jeton de capacité** : `linkId` non devinable + jetons HMAC-SHA256 injectés côté serveur (jamais dans l'URL). Données purgées **à l'état terminal du candidat** (converti en bail ou refusé → suppression immédiate côté relais) et, à défaut, par **TTL KV** (filet de sécurité). KV étant répliqué mondialement par défaut, configurer la restriction de juridiction UE si la localisation des données dans l'UE est requise. **Le score de confiance n'est jamais calculé ni transmis côté relais** : le candidat n'y a aucun accès (D7).
```

- [ ] **Step 3 : Compléter le traitement n°6 — Durée de conservation** — dans `docs/legal/RGPD-REGISTRE.md` (`:106`), remplacer :

```
| **Durée de conservation** | **Candidat refusé** : 30 jours après le refus, puis effacement automatique au démarrage de l'application (tombstone propagé à la sync Drive). **Candidat retenu** : converti en locataire → bascule sous le traitement n°1 (durée du bail + délais légaux) |
```
par :
```
| **Durée de conservation** | **Côté relais Cloudflare (si dépôt en ligne)** : éphémère — le dossier reste sur le relais le temps du dépôt et de l'examen, puis est purgé à l'**état terminal** du candidat (converti / refusé) ou par **TTL KV** (filet de sécurité). **Côté ImmoTrack — candidat refusé** : 30 jours après le refus, puis effacement automatique au démarrage de l'application (tombstone propagé à la sync Drive). **Candidat retenu** : converti en locataire → bascule sous le traitement n°1 (durée du bail + délais légaux) |
```

- [ ] **Step 4 : Compléter le traitement n°6 — Destinataires + Transferts** — dans `docs/legal/RGPD-REGISTRE.md` (`:107-108`), remplacer :

```
| **Destinataires** | Responsable de traitement uniquement ; Google (si sync Drive) |
| **Transferts hors UE** | Si Drive : oui, vers les USA, encadrés par les clauses contractuelles types (SCC) Google |
```
par :
```
| **Destinataires** | Responsable de traitement uniquement ; Google (si sync Drive) ; **Cloudflare (sous-traitant, transit temporaire si dépôt en ligne)** |
| **Transferts hors UE** | Si Drive : oui, vers les USA, encadrés par les SCC Google. **Si dépôt en ligne** : possible via Cloudflare (KV répliqué mondialement) — encadré par les SCC du DPA Cloudflare ; restriction de juridiction UE recommandée |
```

- [ ] **Step 5 : Compléter le traitement n°6 — Profilage + Mesures techniques** — dans `docs/legal/RGPD-REGISTRE.md`, remplacer la fin de la cellule « Profilage / décision automatisée » (`:105`) :

Remplacer :
```
Aucun critère discriminatoire (art. 225-1 Code pénal) n'entre dans le score |
```
par :
```
Aucun critère discriminatoire (art. 225-1 Code pénal) n'entre dans le score. **Le candidat n'a jamais accès à ce score** : il est calculé à 100 % côté responsable de traitement (jamais côté relais, D7) |
```

Puis remplacer la cellule « Mesures techniques » (`:109`) :
```
| **Mesures techniques** | Score non-discriminant transparent (barème affiché) ; purge automatique des refusés à 30 j ; isolation des données de test (`_test_immotrack_v4`) ; chiffrement transport (HTTPS/TLS) et stockage au repos |
```
par :
```
| **Mesures techniques** | Score non-discriminant transparent (barème affiché) ; purge automatique des refusés à 30 j ; isolation des données de test (`_test_immotrack_v4`) ; chiffrement transport (HTTPS/TLS) et stockage au repos. **Dépôt en ligne** : `linkId` non devinable, jetons HMAC-SHA256 injectés server-side (jamais dans l'URL), comparaison à temps constant des secrets, upload validé et plafonné (types autorisés, ≤ 20 Mo), purge à l'état terminal + TTL KV, restriction de juridiction UE recommandée |
```

- [ ] **Step 6 : Mettre à jour le pied de page du registre** — dans `docs/legal/RGPD-REGISTRE.md` (`:154`), remplacer :

```
**Dernière mise à jour** : 2026-06-03 (ajout traitement n°6 candidatures locataires — purge RGPD refusés 30 j, score non-discriminant, RIB exclu au stade candidature)
```
par :
```
**Dernière mise à jour** : 2026-06-03 (traitement n°6 candidatures locataires : ajout du canal de dépôt en ligne via relais Cloudflare — sous-traitant élargi, conservation côté relais purgée à l'état terminal + TTL KV, transferts hors UE, mesures techniques du lien, score jamais exposé au candidat)
```

- [ ] **Step 7 : Vérifier (modify + verify)** — dans `docs/legal/RGPD-REGISTRE.md` :

```bash
grep -c "Relais de candidatures" docs/legal/RGPD-REGISTRE.md           # attendu : 1
grep -c "Cloudflare (sous-traitant, transit temporaire si dépôt en ligne)" docs/legal/RGPD-REGISTRE.md  # attendu : 1
grep -c "état terminal" docs/legal/RGPD-REGISTRE.md                    # attendu : >=2 (durée + mesures)
grep -c "n'a jamais accès à ce score" docs/legal/RGPD-REGISTRE.md      # attendu : 1
```

- [ ] **Step 8 : Commit**

```bash
git add docs/legal/RGPD-REGISTRE.md
git commit -m "docs(rgpd): registre — canal de dépôt candidature en ligne (sous-traitant Cloudflare, TTL, transferts, score non exposé)"
```

---

### Task 15 : Audit agent obligatoire (GATE avant prod) 🛡

**Files:** aucun (revue). Cette tâche **bloque** la Task 16 : aucune propagation en prod tant que l'audit n'est pas vert ou ses réserves levées.

> Règle gravée non négociable : tout livrable sensible (relais PII tiers + sync Drive + migration GED) **DOIT** être audité par un agent `superpowers:code-reviewer` **avant** d'annoncer « prêt à tester » en prod. Mes audits propres (Vitest + grep) ne suffisent jamais sur ce périmètre.

- [ ] **Step 1 : Pré-requis** — Tasks 1-14 livrées et validées en sandbox + relais déployé (GATE Task 8). Suites vertes : `npm test` (relais, dossier `Immo-relay-bailsign/relay`) **et** `npx vitest run` (app).

- [ ] **Step 2 : Dispatcher l'agent `superpowers:code-reviewer`** avec, en contexte : ce plan, le diff complet des deux dépôts (relais + app), la spec `docs/superpowers/specs/2026-06-02-candidature-locataire-design.md`, le registre RGPD mis à jour. Périmètre d'audit imposé (checklist) :

  **Sécurité relais / tokens (Partie 1)**
  - [ ] Jetons HMAC-SHA256 : jamais dans l'URL, injectés server-side ; comparaison à **temps constant** (`timingSafeEqualStr`) pour APP_KEY, ownerToken, candToken.
  - [ ] `linkId` / `sessionId` 256 bits non devinables ; pas de fuite de token dans les logs/erreurs.
  - [ ] Séparation stricte des rôles `cand-owner` (X-Owner-Token) vs `candidat` (X-Cand-Token) ; aucune route candidat n'accepte un ownerToken et inversement.
  - [ ] `POST /candidatures` exige bien `Authorization: Bearer APP_KEY` ; `/api/ping` idem (et ne pollue pas KV).
  - [ ] Upload : `validatePieceUpload` plafonne (≤ 20 Mo), valide types autorisés, rejette le reste ; pas de stockage > limite KV (25 Mio).
  - [ ] Machine à états dossier (open → submitted → reopen → submitted) anti-rejeu cohérente ; `reopen` ne ré-autorise QUE l'écriture attendue.

  **Modèle reopen + cycle de vie données (Parties 1+2)**
  - [ ] Pas de purge au pull ; purge effective à l'état terminal (converti **et** refusé) ; TTL KV = filet de sécurité documenté.
  - [ ] Idempotence : re-pull d'un lien `collected` n'importe rien ; dédup pièces par `pieceId` (`_relayPieceIds`) — **aucun doublon** en GED après complément.
  - [ ] Complément (`link.candId`) : met à jour le candidat existant sans écraser id/source/dateCreation ni les décisions manuelles (statut terminal, `piecesVerifiees`, score).
  - [ ] `404/410` géré partout (lien expiré/révoqué) sans crash ni réimport.

  **Confidentialité / RGPD / scoring (D7)**
  - [ ] **Aucun score** calculé ni transmis côté relais ; recalcul 100 % local via `_calculConfiance` (critères de solvabilité licites uniquement, décret 2015-1437 / loi 6 juillet 1989 — pas de RIB, pas de critère discriminatoire).
  - [ ] Le candidat ne voit jamais son score ; `dossier.js`/`dossier-page.js` ne l'exposent pas.
  - [ ] Registre RGPD : sous-traitant Cloudflare élargi, durée côté relais, transferts hors UE, mesures techniques — tout présent (Task 14).

  **Secrets**
  - [ ] `APP_KEY` : stocké en `localStorage` local uniquement ; **jamais** écrit dans la DB synchronisée Drive, jamais committé. `ownerToken` (synchronisé Drive multi-device) ≠ `APP_KEY`.
  - [ ] `.dev.vars` / OAuth wrangler / `.claude/launch.json` jamais exposés ni committés.

  **Sync Drive (Partie 2)**
  - [ ] Merge `candidatLinks` par `id` avec arbitrage `_drvWins`/`_modifiedAt` cohérent avec le merge `candidats` ; `conflicts++` ; pas de résurrection de lien `done`/`_archived`.
  - [ ] `_stamp()` posé sur toute mutation de lien et de candidat (sinon perte d'arbitrage).

  **GED / migration pièces**
  - [ ] `_attachmentSaveForEntity` appelé avec `dataB64` = **data URL complète** (pas base64 brut) ; `parentType:'candidat'` ; catégorie correcte.
  - [ ] Conversion : `_migrerDocsCandidatVersBail` re-pointe bien les pièces du candidat vers le bail (pas de perte, pas de doublon).

  **Isolation sandbox**
  - [ ] Toutes les clés relais passent par `_lsKey` (préfixe `_test_` en sandbox) ; aucune écriture sur les données réelles depuis `index-test.html`.

- [ ] **Step 3 : Traiter les retours** — corriger en sandbox toute réserve **bloquante** (re-commit `[sandbox]`), re-dispatcher l'agent si nécessaire jusqu'au vert. Consigner les réserves non bloquantes en backlog.

- [ ] **Step 4 : Feu vert** — n'annoncer « prêt pour la prod » qu'une fois l'audit vert. **Ne pas committer** cette tâche (revue pure).

---

### Task 16 : Propagation sandbox → prod + bump version + BACKLOG 🚦

**Files:**
- Modify: `index.html` (report verbatim des blocs validés depuis `index-test.html`)
- Modify: `sw.js` (bump `CACHE_VER`)
- Modify: `BACKLOG.md`

> 🚦 **GATE — règle gravée** : ne toucher `index.html` (prod, données réelles) **qu'après le « OK » explicite de l'utilisateur** sur la validation sandbox **et** l'audit Task 15 vert. Sandbox-first respecté jusqu'ici ; cette tâche est la seule qui écrit en prod.
>
> ⚠️ **Multi-sessions** : `index.html`, `sw.js`, `BACKLOG.md` sont des fichiers partagés entre sessions parallèles. Reporter UNIQUEMENT les blocs de cette feature, vérifier le `git diff` avant chaque commit, ne jamais `git add` l'arbre entier.

- [ ] **Step 1 : Reporter les blocs Task 10-13 dans `index.html`** — pour chaque bloc validé en sandbox, copier **verbatim** depuis `index-test.html` vers l'ancre prod correspondante (les ancres `index.html:NNN` citées dans chaque tâche restent valides puisque `index-test.html` en est une copie). Liste exhaustive :
  - **Task 10** : carte Réglages « 🔗 Relais candidatures » (après la carte Google Drive) ; constantes + `_relayCfg`/`_relayCfgLoadInputs`/`saveRelayCfg`/`testRelayCfg`/`RELAY_BASE_DEFAULT` (avant `rExport()`) ; hook `_relayCfgLoadInputs()` dans `rExport()`.
  - **Task 11** : `<script src="js/vendor/qrcode-generator.js"></script>` (après `index.html:3706`) ; `if (!DB.candidatLinks) DB.candidatLinks = [];` (après `:4922`) ; bloc `<style>` inline invitation ; modale `#ov-invite-candidat` (après `#ov-candidat`) ; remplacement du stub `openInviteCandidat` par le bloc JS complet ; bouton toolbar « 🔗 Inviter un candidat » ; bouton fiche bien vacant ; bouton footer annonce.
  - **Task 12** : `_bytesToDataUrl` + `_relayPullCandidatures` ; bouton « 🔄 Actualiser les dépôts » ; merge Drive `candidatLinks`.
  - **Task 13** : `_relayPurgeForCandidat` ; réécriture `demanderComplementCandidat` + `_complementLocal` ; hook purge dans `_finalizeCandidatConversion` et `refuserCandidat` ; bandeau `complBanner` dans `openFicheCandidat`.

  > Note : `js/core/relay-client.js`, `js/main.js` (Task 9) et `js/vendor/qrcode-generator.js` (Task 11) sont **partagés** (chargés par les deux HTML) — déjà committés en Tasks 9/11, **rien à reporter** pour eux. Le `<style>` invitation est **inline** (voyage avec le markup) — aucune promotion `css/main.css` ni bump `?v=` requis.

- [ ] **Step 2 : Vérifier le report (modify + verify) dans `index.html`** — mêmes greps qu'en sandbox, cibles identiques :

```bash
grep -c "ov-invite-candidat" index.html            # attendu : >=1 (modale)
grep -c "function openInviteCandidat" index.html    # attendu : 1 (plus de stub)
grep -c "openInviteCandidat(" index.html            # attendu : 4 (def + 3 points d'entrée)
grep -c "note-lien" index.html                      # attendu : 0 (ancien bouton retiré)
grep -c "function _relayPullCandidatures" index.html # attendu : 1
grep -c "function _relayPurgeForCandidat" index.html # attendu : 1
grep -c "async function demanderComplementCandidat" index.html # attendu : 1
grep -c "payload.candidatLinks" index.html          # attendu : 1
grep -c "qrcode-generator.js" index.html            # attendu : 1
grep -c "La relance en ligne du candidat arrivera avec le module relais" index.html # attendu : 0
```
Puis diff de cohérence sandbox/prod (doit ne montrer que des écarts attendus : version, ids de test) :
```bash
git --no-pager diff --no-index index-test.html index.html | grep -i "relay\|invite-candidat\|candidatLinks" | head -40
```

- [ ] **Step 3 : Bump de version** — dans `index.html`, remplacer `v15.250` par `v15.251` aux 3 emplacements (`:6` commentaire/title, `:57` constante `IMMOTRACK_VERSION`, `:3650` footer) ; dans `sw.js` (`:17`), `CACHE_VER = 'immotrack-v15.250'` → `'immotrack-v15.251'`.

```bash
grep -c "v15.251" index.html      # attendu : >=3
grep -c "immotrack-v15.251" sw.js # attendu : 1
grep -c "v15.250" index.html      # attendu : 0
```

- [ ] **Step 4 : Smoke test prod (données réelles — prudence)** — sur `index.html` servi en `http-server`, sur les 3 largeurs : Réglages → carte Relais visible, « Tester la connexion » OK ; onglet Candidats → « 🔗 Inviter un candidat » ouvre la modale (assistant 2 étapes + QR) ; « 🔄 Actualiser les dépôts » présent ; fiche candidat → « Demander un complément » OK. **Aucune régression** sur l'onglet Candidats existant (saisie manuelle, scoring, conversion, refus). Vérifier qu'aucune clé `RELAY_*` non préfixée n'a été écrite (isolation des données de test préservée).

- [ ] **Step 5 : Mettre à jour `BACKLOG.md`** — passer le sujet « candidature — lien en ligne (relais Cloudflare) » à **Livré** : statut, version `v15.251`, commits, date 2026-06-03. (Règle BACKLOG temps réel : mise à jour à la livraison, pas en fin de session.)

- [ ] **Step 6 : Commit (prod)** — vérifier `git status` (seuls `index.html`, `sw.js`, `BACKLOG.md` modifiés), puis :

```bash
git add index.html sw.js BACKLOG.md
git commit -m "feat(candidats): lien candidat en ligne (relais Cloudflare) — propagation prod v15.251

Pilotage : candidature lien en ligne livré (invitation + dépôt relais + rapatriement + complément D13 + purge terminale + RGPD)."
```

- [ ] **Step 7 : Déploiement** — `index.html` part sur GitHub Pages (origin/main) au push ; le relais (Partie 1) est déjà déployé (GATE Task 8). Rappeler le **caveat commercialisation** : migrer `*.workers.dev` → `sign.<domaine>` et l'auth APP_KEY → auth par utilisateur avant vente.

---

## Self-review (writing-plans)

**1. Couverture de la spec** — Partie 1 (relais) : validation upload + dossier (T1), storage candidature (T2), modèle dossier (T3), page candidat variante A (T4 dossier-page), routes (T5 + ping), déploiement (T8). Partie 2 (app) : client relais TDD (T9), Réglages + Tester (T10), invitation variante B + 3 points d'entrée D12 (T11), rapatriement + GED + Drive (T12), complément D13 reopen + purge terminale (T13), RGPD (T14), audit (T15), prod (T16). Déviations R2→KV et APP_KEY-navigateur explicitées en tête. ✅

**2. Scan des placeholders** — aucun « TODO/TBD/à compléter » ; chaque step de code montre le code complet ; chaque commande montre l'attendu. ✅

**3. Cohérence des types/noms** — vérifié transverse : `relayCreateInvitation/relayFetchResult/relayFetchPiece/relayReopen/relayRevoke/relayPurge/relayPing` (T9) ↔ `window._relay*` (T9 expose) ↔ appels (T11/12/13). Record `candidatLinks` : `{id, ownerToken, logRef, entity, bienLabel, loyer, message, createdAt, expiresAt, status:'active'|'collected'|'done'|'revoked', opened, deposed, candId, _archived, _modifiedAt}` — `status` aligné (T11 crée `active`, T12 → `collected`, T13/purge → `done`) ; `candId` introduit en T12 et consommé en T13. `_relayPieceIds` défini et lu en T12, préservé en T13. `cand.linkId` posé en T12, lu en T13. ✅

> Note de cohérence appliquée pendant l'écriture : le choix « reopen » (2026-06-03) a fait retirer la purge-au-pull de T12 (statut `done`→`collected`, ajout branche `candId` + dédup pièces) et déplacer la purge à l'état terminal en T13.

---

## Handoff d'exécution

Plan complet et enregistré dans `docs/superpowers/plans/2026-06-03-candidature-lien-en-ligne.md`. Deux options d'exécution :

1. **Subagent-Driven (recommandé)** — un sous-agent neuf par tâche, revue à deux étages entre chaque tâche, itération rapide. Sous-skill : `superpowers:subagent-driven-development`.
2. **Inline** — exécution dans cette session via `superpowers:executing-plans`, par lots avec points de contrôle.

⚠️ Rappels avant exécution : Partie 1 **déployée avant** Partie 2 ; sandbox-first jusqu'à la Task 16 (prod) qui exige le « OK » explicite + audit Task 15 vert.

Quelle approche ?
