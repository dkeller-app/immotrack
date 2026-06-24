# Sauvegarde de sécurité — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Étapes en `- [ ]`.

**Goal:** Sauvegarde locale de sécurité, incrémentale, dans un dossier choisi (PC Chromium) / zip (PC Firefox-Safari) / message (mobile), à cadence longue configurable.

**Architecture:** Cœur PUR + testable dans `js/core/backup.js` (horodatage, période due, collecte incrémentale, manifeste, writer ZIP « stored »). Orchestration IMPURE dans `index.html` (File System Access + handle IndexedDB, fetch des blobs Storage, UI Réglages, check au chargement). Spec : `docs/superpowers/specs/2026-06-24-sauvegarde-design.md`.

**Tech Stack:** vanilla JS, Vitest, File System Access API, Supabase Storage (`window.__immoCloudFileUrl`), `check-inline-js.mjs`. JSZip ABSENT → writer ZIP « stored » maison (Task 2).

**Contraintes:** `index.html` contendu → **file d'attente** (`docs/INDEX-COMMIT-PROTOCOL.md`) + bump version 5 spots. **Sandbox-first** : développer/valider dans `index-test.html` avant `index.html`. Audit `code-reviewer` (données + fichiers légaux). Responsive 3 formats. Pas de demo-data auto-injectée.

**Ordre :** modules purs testés d'abord (Tasks 1-2, hors index.html, sûrs), puis orchestration index.html (Tasks 3-6, sandbox-first + queue), puis bump+audit (Task 7).

---

### Task 1 : `js/core/backup.js` — helpers purs (horodatage, période, manifeste, collecte)

**Files:**
- Create: `js/core/backup.js`
- Test: `__tests__/helpers/backup.test.js`

- [ ] **Step 1 : test horodatage + période due**
```js
import { describe, it, expect } from 'vitest'
import { backupStamp, dueForBackup, FREQ_MS } from '../../js/core/backup.js'

describe('backupStamp', () => {
  it('formate AAAA-MM-JJ_HHhMM (heure locale)', () => {
    // 2026-06-24 14:30 local → on teste via un Date fixe
    const d = new Date(2026, 5, 24, 14, 30, 0)   // mois 0-based : 5 = juin
    expect(backupStamp(d)).toBe('2026-06-24_14h30')
  })
})
describe('dueForBackup', () => {
  const now = new Date('2026-06-24T12:00:00Z').getTime()
  it('jamais sauvegardé → dû', () => { expect(dueForBackup(null, 'semaine', now)).toBe(true) })
  it('manuel → jamais dû automatiquement', () => { expect(dueForBackup(now - 10 * FREQ_MS.jour, 'manuel', now)).toBe(false) })
  it('semaine non écoulée → pas dû', () => { expect(dueForBackup(now - 3 * FREQ_MS.jour, 'semaine', now)).toBe(false) })
  it('semaine écoulée → dû', () => { expect(dueForBackup(now - 8 * FREQ_MS.jour, 'semaine', now)).toBe(true) })
})
```

- [ ] **Step 2 : run → échoue** (`npx vitest run __tests__/helpers/backup.test.js`) → FAIL (module absent).

- [ ] **Step 3 : implémenter backupStamp + dueForBackup**
```js
// js/core/backup.js — Cœur PUR de la sauvegarde de sécurité (testable, zéro dépendance DOM/réseau).
export const FREQ_MS = { jour: 86400000, semaine: 604800000, mois: 2592000000 }   // mois ≈ 30 j

const p2 = n => String(n).padStart(2, '0')
// Horodatage local AAAA-MM-JJ_HHhMM pour nommer zip + snapshots JSON.
export function backupStamp(date) {
  const d = date || new Date()
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + 'h' + p2(d.getMinutes())
}
// La période est-elle écoulée ? `manuel` → jamais auto. `lastAt` null/0 → dû.
export function dueForBackup(lastAt, frequence, nowMs) {
  if (frequence === 'manuel') return false
  const span = FREQ_MS[frequence] || FREQ_MS.semaine
  if (!lastAt) return true
  return (nowMs - lastAt) >= span
}
```

- [ ] **Step 4 : run → passe.**

- [ ] **Step 5 : test collecte incrémentale**
```js
import { collectBackupFiles } from '../../js/core/backup.js'
describe('collectBackupFiles', () => {
  const db = {
    documents: [
      { id: 1, cloudKey: 'esp/seg/files/d1', _modifiedAt: '2026-06-20T10:00:00Z', nom: 'bail.pdf' },
      { id: 2, cloudKey: 'esp/seg/files/d2', _modifiedAt: '2026-06-23T10:00:00Z', nom: 'dpe.pdf' },
      { id: 3, _modifiedAt: '2026-06-23T10:00:00Z' }                 // pas de cloudKey → ignoré
    ],
    baux: { 'L1': { signatures: { cloudPdfKey: 'esp/seg/files/bp_L1', certRef: { cloudPdfKey: 'esp/seg/files/bc_L1' }, signedAt: '2026-06-23T09:00:00Z' } } },
    edl: [ { id: 9, cloudPdfKey: 'esp/seg/files/edl9', _modifiedAt: '2026-06-19T10:00:00Z' } ]
  }
  it('ne renvoie que les fichiers postérieurs à lastBackupAt', () => {
    const last = new Date('2026-06-22T00:00:00Z').getTime()
    const keys = collectBackupFiles(db, last).map(f => f.key).sort()
    // d2 (23>22), bail pdf+cert (23>22) ; PAS d1/edl9 (19-20<22) ni doc#3 (sans clé)
    expect(keys).toEqual(['esp/seg/files/bc_L1', 'esp/seg/files/bp_L1', 'esp/seg/files/d2'])
  })
  it('lastBackupAt null → tout', () => {
    expect(collectBackupFiles(db, null).length).toBe(5)   // d1,d2,bp,bc,edl9
  })
})
```

- [ ] **Step 6 : run → échoue.**

- [ ] **Step 7 : implémenter collectBackupFiles**
```js
// Énumère les fichiers Storage à sauvegarder = porteurs d'une clé cloud ET modifiés/créés après lastBackupAt.
// Renvoie [{ key, name, kind, ts }]. `name` = nom de fichier lisible dans la sauvegarde.
// db.documents[].cloudKey, db.baux[ref].signatures.cloudPdfKey + .certRef.cloudPdfKey, db.edl[].cloudPdfKey.
export function collectBackupFiles(db, lastBackupAt) {
  const out = []
  const after = ts => !lastBackupAt || (ts && new Date(ts).getTime() > lastBackupAt)
  const push = (key, name, kind, ts) => { if (key && after(ts)) out.push({ key, name, kind, ts: ts || null }) }
  for (const d of (db && db.documents) || []) push(d.cloudKey, _safeName(d.nom || ('doc-' + d.id)), 'document', d._modifiedAt)
  for (const [ref, b] of Object.entries((db && db.baux) || {})) {
    const s = b && b.signatures; if (!s) continue
    push(s.cloudPdfKey, _safeName('bail-' + ref + '.pdf'), 'document', s.signedAt || b._modifiedAt)
    if (s.certRef) push(s.certRef.cloudPdfKey, _safeName('certificat-' + ref + '.pdf'), 'document', s.signedAt || b._modifiedAt)
  }
  for (const e of (db && db.edl) || []) push(e.cloudPdfKey, _safeName('edl-' + (e.id || '') + '.pdf'), 'document', e._modifiedAt)
  // Photos EDL (pieces avec cloudKey) — kind 'photo'.
  for (const e of (db && db.edl) || []) for (const pc of (e.pieces || [])) for (const ph of (pc.photos || []))
    push(ph.cloudKey, _safeName('photo-' + (ph.idbKey || ph.cloudKey || '').slice(-12) + '.jpg'), 'photo', ph._modifiedAt || e._modifiedAt)
  return out
}
const _safeName = s => String(s == null ? 'fichier' : s).replace(/[^a-zA-Z0-9._-]/g, '_')
```
> ⚠️ Implémenteur : VÉRIFIER les champs réels des photos EDL par `grep -nE "\.photos|pieces\[|cloudKey" index.html` et ajuster la dernière boucle aux vrais chemins (la forme `e.pieces[].photos[].cloudKey` est l'hypothèse ; corriger si différent). Le test couvre documents/baux/edl-pdf ; ajouter un cas photo une fois la forme confirmée.

- [ ] **Step 8 : test buildManifest**
```js
import { buildManifest } from '../../js/core/backup.js'
it('buildManifest accumule les clés et historise les snapshots', () => {
  const prev = { fichiersSauvegardes: ['a'], versionsJson: ['donnees-old.json'] }
  const m = buildManifest(prev, 'donnees-2026-06-24_14h30.json', ['b', 'c'], '2026-06-24T14:30:00Z', 'semaine')
  expect(m.fichiersSauvegardes.sort()).toEqual(['a', 'b', 'c'])
  expect(m.versionsJson).toContain('donnees-2026-06-24_14h30.json')
  expect(m.derniereSauvegarde).toBe('2026-06-24T14:30:00Z')
  expect(m.frequence).toBe('semaine')
})
```

- [ ] **Step 9 : implémenter buildManifest, run, commit**
```js
// Manifeste cumulatif (mode dossier). Dédoublonne les clés, historise les snapshots JSON.
export function buildManifest(prev, snapshotName, newKeys, iso, frequence) {
  const p = prev || {}
  const keys = Array.from(new Set([...(p.fichiersSauvegardes || []), ...(newKeys || [])]))
  const versions = Array.from(new Set([...(p.versionsJson || []), snapshotName]))
  return { format: 'propryo-backup-1', derniereSauvegarde: iso, frequence, fichiersSauvegardes: keys, versionsJson: versions }
}
```
```bash
npx vitest run __tests__/helpers/backup.test.js   # tout vert
git add js/core/backup.js __tests__/helpers/backup.test.js
git commit -m "Sauvegarde Task 1 : core pur (backupStamp/dueForBackup/collectBackupFiles/buildManifest) + tests"
```

---

### Task 2 : writer ZIP « stored » maison (pur, testable)

**Files:** Modify `js/core/backup.js` · Test `__tests__/helpers/backup.test.js`

**Décision (spec) : writer ZIP « stored » (sans compression) — les PDF/photos sont déjà compressés.** Évite la dépendance JSZip. Format ZIP minimal : pour chaque entrée [local file header + données], puis [central directory], puis [EOCD]. CRC-32 requis.

- [ ] **Step 1 : test CRC-32 (vecteur connu)**
```js
import { crc32 } from '../../js/core/backup.js'
it('crc32 "123456789" = 0xCBF43926', () => {
  expect(crc32(new TextEncoder().encode('123456789')) >>> 0).toBe(0xCBF43926)
})
```

- [ ] **Step 2 : run → échoue. Step 3 : implémenter crc32**
```js
let _crcTable = null
function _crcInit() { _crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); _crcTable[n] = c >>> 0 } }
export function crc32(bytes) {
  if (!_crcTable) _crcInit()
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}
```

- [ ] **Step 4 : run → passe. Step 5 : test storedZip (signature + entrées)**
```js
import { storedZip } from '../../js/core/backup.js'
it('storedZip produit un blob ZIP (PK\\x03\\x04) lisible', () => {
  const entries = [{ name: 'donnees.json', bytes: new TextEncoder().encode('{"a":1}') }, { name: 'documents/x.txt', bytes: new TextEncoder().encode('hello') }]
  const u8 = storedZip(entries)
  expect(u8[0]).toBe(0x50); expect(u8[1]).toBe(0x4B); expect(u8[2]).toBe(0x03); expect(u8[3]).toBe(0x04)   // "PK\x03\x04"
  // EOCD signature présente en fin (PK\x05\x06)
  const tail = u8.slice(u8.length - 22)
  expect(tail[0]).toBe(0x50); expect(tail[1]).toBe(0x4B); expect(tail[2]).toBe(0x05); expect(tail[3]).toBe(0x06)
})
```

- [ ] **Step 6 : run → échoue. Step 7 : implémenter storedZip**
```js
// ZIP « stored » (méthode 0, sans compression). entries = [{ name, bytes:Uint8Array }] → Uint8Array.
// Suffisant car PDF/JPEG déjà compressés. Pas de dates (mtime=0) → reproductible.
export function storedZip(entries) {
  const enc = new TextEncoder()
  const locals = [], centrals = []; let offset = 0
  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF]
  const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]
  for (const e of entries) {
    const nameB = enc.encode(e.name), data = e.bytes, crc = crc32(data), sz = data.length
    const lh = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nameB.length), u16(0))
    locals.push(new Uint8Array(lh), nameB, data)
    const ch = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))
    centrals.push(new Uint8Array(ch), nameB)
    offset += lh.length + nameB.length + data.length
  }
  const cdStart = offset
  let cdSize = 0; for (const c of centrals) cdSize += c.length
  const eocd = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cdSize), u32(cdStart), u16(0)))
  const parts = [...locals, ...centrals, eocd]
  let total = 0; for (const p of parts) total += p.length
  const out = new Uint8Array(total); let pos = 0; for (const p of parts) { out.set(p, pos); pos += p.length }
  return out
}
```

- [ ] **Step 8 : run → passe. Vérif ronde : `node -e` qui écrit le zip + l'ouvre avec un outil système (ou re-parse l'EOCD) pour confirmer la validité.** Commit :
```bash
npx vitest run __tests__/helpers/backup.test.js
git commit -am "Sauvegarde Task 2 : writer ZIP stored maison (crc32 + storedZip) + tests"
```

---

### Task 3 : UI Réglages « Sauvegarde » — SANDBOX d'abord (index-test.html), 3 modes

**Files:** Modify `index-test.html` (sandbox) PUIS `index.html` après OK user · CSS dans `css/main.css`

- [ ] **Step 1 : détecter le mode** (ajouter près des helpers Réglages). Mobile = `matchMedia('(pointer:coarse)').matches && innerWidth < 900`. Sinon `window.showDirectoryPicker` → 'dossier', sinon 'zip'.
```js
function _backupMode() {
  try { if (matchMedia('(pointer:coarse)').matches && innerWidth < 900) return 'mobile'; } catch (e) {}
  return (typeof window.showDirectoryPicker === 'function') ? 'dossier' : 'zip';
}
```
- [ ] **Step 2 : rendre la carte** dans `#p-export` (card « Export données » → AJOUTER une card `#backup-card` au-dessus). HTML par mode (cf. mockup `mockups/sauvegarde/`) : mode dossier → bouton « Choisir un dossier » / chip dossier + fréquence (segment) + dernière sauvegarde + « Sauvegarder maintenant » ; mode zip → bouton « Télécharger le .zip » + fréquence + dernière ; mode mobile → encart « Sauvegarde depuis un PC ». Fonction `_renderBackupCard()` appelée depuis `rExport()`.
- [ ] **Step 3 : fréquence persistée par-appareil** : `localStorage` clés `immo_backup_freq` (défaut 'semaine'), `immo_backup_lastAt`. Le segment écrit `immo_backup_freq`.
- [ ] **Step 4 : sandbox** — valider l'affichage des 3 modes dans `index-test.html` (forcer le mode via un override de test si besoin) + responsive. **Déployer index-test.html + lien user.** Attendre OK.
- [ ] **Step 5 : commit (index-test.html + css)** `Sauvegarde Task 3 : UI carte Réglages (3 modes) — sandbox`.

---

### Task 4 : File System Access — handle dossier + persistance IndexedDB (sandbox)

**Files:** Modify `index-test.html`

- [ ] **Step 1 : choisir + mémoriser le dossier**
```js
async function _backupPickFolder() {
  const h = await window.showDirectoryPicker({ id: 'propryo-backup', mode: 'readwrite' });
  await _idbPut('immo_backup_dirhandle', h);   // les handles sont structured-cloneables → IndexedDB OK (réutilise _idbPut existant)
  _backupDirHandle = h; _renderBackupCard();
}
```
- [ ] **Step 2 : récupérer + (re)vérifier la permission au chargement**
```js
async function _backupLoadFolder() {
  try { const h = await _idbGet('immo_backup_dirhandle'); if (!h) return null;
    const opt = { mode: 'readwrite' };
    if ((await h.queryPermission(opt)) === 'granted') { _backupDirHandle = h; return h; }
    return h;   // permission à re-demander au moment d'écrire (requestPermission dans le geste user)
  } catch (e) { return null; }
}
```
> ⚠️ `_idbGet`/`_idbPut` existent déjà (cache photos) mais stockent du base64 ; VÉRIFIER qu'ils acceptent un objet arbitraire (handle). Sinon ajouter `_idbPutRaw`/`_idbGetRaw` (même DB, store dédié) qui ne JSON.stringify pas.
- [ ] **Step 3 : écrire un fichier dans le dossier**
```js
async function _backupWriteFile(dirHandle, relPath, bytesOrBlob) {
  const parts = relPath.split('/'); let dir = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create: true });
  const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const w = await fh.createWritable(); await w.write(bytesOrBlob); await w.close();
}
```
- [ ] **Step 4 : sandbox** — tester choix dossier + écriture d'un fichier témoin sur Chrome/Edge. Commit `Sauvegarde Task 4 : handle dossier + IndexedDB + écriture — sandbox`.

---

### Task 5 : moteur de sauvegarde — snapshot + fichiers incrémentaux + manifeste/zip (sandbox)

**Files:** Modify `index-test.html` (utilise `js/core/backup.js`)

- [ ] **Step 1 : snapshot JSON** : réutiliser la sérialisation de `exportJSON()` (extraire le corps en `_backupSnapshotJSON()` qui renvoie la string JSON SANS déclencher le download — `exportJSON` appelle ce helper puis download). Filtre secrets déjà en place.
- [ ] **Step 2 : récupérer un blob Storage** :
```js
async function _backupFetchBlob(key) {
  const url = await window.__immoCloudFileUrl(key, 300); if (!url) return null;
  const r = await fetch(url); if (!r.ok) return null; return await r.blob();
}
```
- [ ] **Step 3 : orchestrateur** `_backupRun(trigger)` :
  - `mode = _backupMode()`; si 'mobile' → return.
  - `lastAt = +localStorage.getItem('immo_backup_lastAt') || null`.
  - `files = collectBackupFiles(DB, lastAt)`; `stamp = backupStamp()`; `snap = _backupSnapshotJSON()`.
  - **mode dossier** : `_backupWriteFile(dir, 'donnees-'+stamp+'.json', enc(snap))` ; pour chaque file : `blob = _backupFetchBlob(file.key)` → `_backupWriteFile(dir, (file.kind==='photo'?'photos/':'documents/')+file.name, blob)` (tracker les clés réussies) ; manifeste `buildManifest(prevManifest, 'donnees-'+stamp+'.json', okKeys, iso, freq)` → écrire `manifeste.json`. Progress UI « N/M ».
  - **mode zip** : construire `entries = [{name:'donnees.json',bytes:enc(snap)}, ...fichiers (documents/photos), {name:'manifeste.json',bytes:enc(manifest)}]` → `storedZip(entries)` → `_downloadBlobAs(new Blob([u8]), 'propryo-sauvegarde-'+stamp+'.zip')`.
  - succès → `localStorage.setItem('immo_backup_lastAt', Date.now())` (⚠️ seulement si pas d'échec critique) ; toast ; `_renderBackupCard()`.
- [ ] **Step 4 : bouton « Sauvegarder maintenant »** → `_backupRun('manuel')` (dans le geste user → permission OK).
- [ ] **Step 5 : sandbox** — tester une sauvegarde réelle (dossier sur Chrome, zip sur Firefox) avec des données de test : vérifier `donnees-*.json` + documents/photos + manifeste, et l'incrémental (2e sauvegarde ne réécrit pas les anciens). Commit `Sauvegarde Task 5 : moteur snapshot+incrémental+manifeste/zip — sandbox`.

---

### Task 6 : auto au chargement + cadence + bandeau de proposition (sandbox)

**Files:** Modify `index-test.html`

- [ ] **Step 1 : check au chargement** (après hydrate/login, là où l'app est prête) :
```js
async function _backupAutoCheck() {
  if (_backupMode() === 'mobile') return;
  const freq = localStorage.getItem('immo_backup_freq') || 'semaine';
  const lastAt = +localStorage.getItem('immo_backup_lastAt') || null;
  if (!dueForBackup(lastAt, freq, Date.now())) return;
  if (!collectBackupFiles(DB, lastAt).length) return;   // rien de neuf
  const dir = await _backupLoadFolder();
  if (dir && (await dir.queryPermission({ mode: 'readwrite' })) === 'granted') { await _backupRun('auto'); }   // dossier + permission → silencieux
  else _backupShowProposeBanner(lastAt);                                                                       // zip / pas de dossier / permission à re-demander → proposer
}
```
- [ ] **Step 2 : bandeau** `_backupShowProposeBanner(lastAt)` : « 🛟 Sauvegarde recommandée — dernière il y a N j · X nouveaux éléments » + boutons « Sauvegarder » (`_backupRun('manuel')`) / « Plus tard » (masque, re-propose au prochain chargement). Idempotent (un seul bandeau).
- [ ] **Step 3 : sandbox** — forcer `lastAt` ancien + vérifier déclenchement (silencieux si dossier, bandeau sinon). Commit `Sauvegarde Task 6 : auto check + cadence + bandeau — sandbox`.

---

### Task 7 : Porter en `index.html` (prod) + bump + audit + file d'attente

**Files:** Modify `index.html` (port byte-identique du sandbox) · bump 5 spots · `sw.js`

- [ ] **Step 1 : après OK user sur le sandbox**, porter les blocs validés de `index-test.html` vers `index.html` (carte Réglages + toutes les fonctions `_backup*` + l'appel `_backupAutoCheck()` au bon endroit du boot). Vérifier parité.
- [ ] **Step 2 : gates** : `node scripts/check-inline-js.mjs` (5/0) · grep des symboles (`_backupRun`, `_backupMode`, `_renderBackupCard`…) câblés · responsive PC/tablette/téléphone.
- [ ] **Step 3 : bump version** 5 spots (title, `<em>`, footer legacy, `IMMOTRACK_VERSION`, `sw.js CACHE_VER`).
- [ ] **Step 4 : audit `code-reviewer`** (manipule données + fichiers légaux + File System Access + écriture disque). Corriger les findings.
- [ ] **Step 5 : file d'attente** `.index-queue/QUEUE.md` + intégration (cherry-pick) + push (feu vert user). Commit `Sauvegarde Task 7 : feature SAUVEGARDE livrée vX (UI + moteur incrémental + dossier/zip)`.

---

## Self-review
- **Couverture spec** : 3 modes (Task 3) ✓ · cadence configurable + check chargement (Task 6) ✓ · JSON snapshot complet (Task 5 réutilise exportJSON) ✓ · docs/photos incrémentaux (collectBackupFiles Task 1) ✓ · nommage horodaté (backupStamp Task 1) ✓ · zip stored maison (Task 2) ✓ · dossier mémorisé IndexedDB (Task 4) ✓ · manifeste (Task 1) ✓ · exclut EDL Drive-only (collectBackupFiles ne prend que les `cloudKey` → les Drive-only n'en ont pas) ✓ · lastBackupAt par-appareil localStorage (Task 3/5) ✓.
- **Placeholders** : 2 ⚠️ explicites (champs photos EDL à confirmer Task 1 Step 7 ; `_idbGet/Put` objet vs base64 Task 4 Step 2) — assumés, l'implémenteur grep + ajuste, pas des trous de logique.
- **Cohérence types** : `collectBackupFiles → [{key,name,kind,ts}]` consommé en Task 5 (file.key/name/kind) ✓ · `buildManifest`/`storedZip`/`backupStamp`/`dueForBackup` signatures stables ✓.
- **Sandbox-first** : Tasks 3-6 dans `index-test.html`, port `index.html` seulement Task 7 après OK ✓.
