# Renommer un bien (logement) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Permettre de renommer la référence d'un bien (`logement.ref`) en reportant proprement les 11 rattachements, en bloquant si un bail/EDL est signé, via un module PUR testé + un dialogue dans la modale d'édition.

**Architecture:** Cœur pur `js/core/rename-logement.js` (validation + garde-fou + report des 11 sites, injection du `stamp`, zéro DOM/global) exposé sur `window._renameLogement` (patron `window._bk`) ; orchestration + UI dans `index.html` (bouton « ✏️ Renommer » à côté de l'input `#log-ref` readOnly + dialogue validé au mockup). Le renommage change `detUuid('logement', norm(ref))` → la sync Supabase fait delete/insert + ré-insère les enfants sous le nouvel uuid.

**Tech Stack:** Vanilla JS (module ESM `js/core`), Vitest, index.html mono-fichier.

**Spec:** `docs/superpowers/specs/2026-07-06-renommer-bien-design.md`.

---

## Task 1 : Cœur pur `js/core/rename-logement.js` (TDD)

**Files:**
- Create: `js/core/rename-logement.js`
- Test: `__tests__/helpers/rename-logement.test.js`

- [ ] **Step 1 : Écrire les tests d'abord** (`__tests__/helpers/rename-logement.test.js`)

```js
import { describe, it, expect } from 'vitest'
import { validateNewRef, canRenameLogement, renameLogementRef } from '../../js/core/rename-logement.js'

const stamp = x => { if (x) x._modifiedAt = 'TS'; return x }
function db() {
  return {
    logements: [{ ref: 'A', entity: 'SCI X' }],
    baux: { 'A': { ref: 'A', entity: 'SCI X', signatures: {} } },
    baux_historique: [{ ref: 'A', logement: 'A' }],
    mouvements: [{ qui: 'A' }, { qui: 'SCI:SCI X' }],
    quittances: [{ logement: 'A' }, { logement: 'A' }],
    edl: [{ logement: 'A', signatures: {} }],
    assurances: [{ logement: 'A' }],
    mrh: [{ logement: 'A' }],
    agenda: [{ logement: 'A', autoKey: 'BAIL:A:2026-01' }],
    documents: [{ parentType: 'logement', parentRef: 'A', logRef: 'A' }, { parentType: 'entite', parentRef: 'A' }],
    candidats: [{ logRef: 'A' }],
  }
}

describe('validateNewRef', () => {
  it('refuse ref identique', () => { expect(validateNewRef(db(), 'A', 'A').ok).toBe(false) })
  it('refuse format invalide', () => { expect(validateNewRef(db(), 'A', 'a@b').ok).toBe(false) })
  it('refuse collision (norm-égale, y compris tombstone)', () => {
    const d = db(); d.logements.push({ ref: 'B2', _deleted: true })
    expect(validateNewRef(d, 'A', 'b2').ok).toBe(false)   // norm('b2')===norm('B2')
  })
  it('accepte un nom neuf valide', () => { expect(validateNewRef(db(), 'A', 'A-cave').ok).toBe(true) })
})

describe('canRenameLogement', () => {
  it('bloque si bail locked', () => {
    const d = db(); d.baux['A'].signatures = { locked: true }
    expect(canRenameLogement(d, 'A').ok).toBe(false)
  })
  it('bloque si bail signedAt', () => {
    const d = db(); d.baux['A'].signatures = { signedAt: '2026-01-01' }
    expect(canRenameLogement(d, 'A').ok).toBe(false)
  })
  it('bloque si EDL signé', () => {
    const d = db(); d.edl[0].signatures = { signedAt: '2026-01-01' }
    expect(canRenameLogement(d, 'A').ok).toBe(false)
  })
  it('autorise si rien de signé', () => { expect(canRenameLogement(db(), 'A').ok).toBe(true) })
})

describe('renameLogementRef', () => {
  it('reporte les 11 rattachements + re-keye la map baux', () => {
    const d = db()
    const r = renameLogementRef(d, 'A', 'A-cave', { stamp })
    expect(r.ok).toBe(true)
    expect(d.logements[0].ref).toBe('A-cave')
    expect(d.baux['A']).toBeUndefined()
    expect(d.baux['A-cave'].ref).toBe('A-cave')
    expect(d.baux_historique[0].ref).toBe('A-cave')
    expect(d.baux_historique[0].logement).toBe('A-cave')
    expect(d.mouvements[0].qui).toBe('A-cave')
    expect(d.mouvements[1].qui).toBe('SCI:SCI X')          // mouvement SCI intact
    expect(d.quittances.every(q => q.logement === 'A-cave')).toBe(true)
    expect(d.edl[0].logement).toBe('A-cave')
    expect(d.assurances[0].logement).toBe('A-cave')
    expect(d.mrh[0].logement).toBe('A-cave')
    expect(d.agenda[0].logement).toBe('A-cave')
    expect(d.agenda[0].autoKey).toBe('BAIL:A-cave:2026-01') // autoKey réécrit
    expect(d.documents[0].parentRef).toBe('A-cave')
    expect(d.documents[0].logRef).toBe('A-cave')
    expect(d.documents[1].parentRef).toBe('A')              // doc entite intact
    expect(d.candidats[0].logRef).toBe('A-cave')
    expect(r.touched).toBeGreaterThanOrEqual(12)
    expect(d.baux['A-cave']._modifiedAt).toBe('TS')         // stamp appliqué
  })
  it('refuse (retourne error) si bail locked, sans muter', () => {
    const d = db(); d.baux['A'].signatures = { locked: true }
    const r = renameLogementRef(d, 'A', 'A-cave', { stamp })
    expect(r.ok).toBe(false)
    expect(d.logements[0].ref).toBe('A')                    // aucune mutation
  })
  it('no-op si oldRef===newRef', () => { expect(renameLogementRef(db(), 'A', 'A', { stamp }).ok).toBe(false) })
})
```

- [ ] **Step 2 : Lancer les tests → échec** (`function not defined`)

Run: `npx vitest run __tests__/helpers/rename-logement.test.js`
Expected: FAIL (import introuvable).

- [ ] **Step 3 : Écrire le module** (`js/core/rename-logement.js`)

```js
// Cœur PUR du renommage d'un bien (logement.ref). Zéro DOM/global/réseau : reçoit `db` en paramètre.
// Reporte la ref dans les 11 rattachements (miroir du patron saveEnt), bloque si bail/EDL signé.
const REF_RE = /^[A-Za-z0-9À-ſ.\-_/ ]{1,60}$/
const norm = s => String(s == null ? '' : s).trim().toLowerCase()

// Format + unicité (norm, tombstones inclus car detUuid est calculé sur norm(ref)) + no-op.
export function validateNewRef(db, oldRef, newRef) {
  if (newRef === oldRef) return { ok: false, code: 'same', error: 'La nouvelle référence est identique à l\'actuelle.' }
  if (!REF_RE.test(newRef)) return { ok: false, code: 'format', error: 'Référence invalide : lettres/chiffres + . - _ / espaces (60 max).' }
  const nn = norm(newRef)
  const clash = (db.logements || []).some(l => l && l.ref && norm(l.ref) === nn)
  if (clash) return { ok: false, code: 'collision', error: 'Cette référence existe déjà (ou est réservée par un bien supprimé).' }
  return { ok: true }
}

// Garde-fou légal : bloque si un bail (courant ou historique) est signé/verrouillé, ou un EDL signé.
export function canRenameLogement(db, ref) {
  const sig = o => o && o.signatures && (o.signatures.locked || o.signatures.signedAt)
  if (sig((db.baux || {})[ref])) return { ok: false, code: 'bail-signe', error: 'Bail signé : la référence est verrouillée pour préserver la valeur juridique.' }
  if ((db.baux_historique || []).some(b => b && (b.ref === ref || b.logement === ref) && sig(b)))
    return { ok: false, code: 'bail-signe', error: 'Bail signé (historique) : la référence est verrouillée.' }
  if ((db.edl || []).some(e => e && e.logement === ref && sig(e)))
    return { ok: false, code: 'edl-signe', error: 'État des lieux signé : la référence est verrouillée.' }
  return { ok: true }
}

// Renomme oldRef → newRef en reportant les 11 rattachements. Retourne { ok, touched, breakdown } ou { ok:false, error }.
export function renameLogementRef(db, oldRef, newRef, opts = {}) {
  const stamp = opts.stamp || (x => { if (x) x._modifiedAt = new Date().toISOString(); return x })
  const v = validateNewRef(db, oldRef, newRef); if (!v.ok) return v
  const g = canRenameLogement(db, oldRef); if (!g.ok) return g

  const breakdown = {}; let touched = 0
  const bump = k => { touched++; breakdown[k] = (breakdown[k] || 0) + 1 }

  ;(db.logements || []).forEach(l => { if (l && !l._deleted && l.ref === oldRef) { l.ref = newRef; stamp(l); bump('logement') } })

  if (db.baux && Object.prototype.hasOwnProperty.call(db.baux, oldRef)) {
    const b = db.baux[oldRef]; delete db.baux[oldRef]
    if (b) { b.ref = newRef; stamp(b) }
    db.baux[newRef] = b; bump('bail')
  }
  ;(db.baux_historique || []).forEach(b => { if (b && !b._deleted && (b.ref === oldRef || b.logement === oldRef)) { if (b.ref === oldRef) b.ref = newRef; if (b.logement === oldRef) b.logement = newRef; stamp(b); bump('baux_historique') } })
  ;(db.mouvements || []).forEach(m => { if (m && !m._deleted && m.qui === oldRef) { m.qui = newRef; stamp(m); bump('mouvement') } })
  ;(db.quittances || []).forEach(q => { if (q && !q._deleted && q.logement === oldRef) { q.logement = newRef; stamp(q); bump('quittance') } })
  ;(db.edl || []).forEach(e => { if (e && !e._deleted && e.logement === oldRef) { e.logement = newRef; stamp(e); bump('edl') } })
  ;(db.assurances || []).forEach(a => { if (a && !a._deleted && a.logement === oldRef) { a.logement = newRef; stamp(a); bump('assurance') } })
  ;(db.mrh || []).forEach(a => { if (a && !a._deleted && a.logement === oldRef) { a.logement = newRef; stamp(a); bump('mrh') } })
  ;(db.agenda || []).forEach(ev => {
    if (ev && !ev._deleted && ev.logement === oldRef) {
      ev.logement = newRef
      if (typeof ev.autoKey === 'string' && ev.autoKey.indexOf(':' + oldRef + ':') !== -1)
        ev.autoKey = ev.autoKey.split(':' + oldRef + ':').join(':' + newRef + ':')
      stamp(ev); bump('agenda')
    }
  })
  ;(db.documents || []).forEach(d => { if (d && !d._deleted && d.parentType === 'logement' && (d.parentRef === oldRef || d.logRef === oldRef)) { if (d.parentRef === oldRef) d.parentRef = newRef; if (d.logRef === oldRef) d.logRef = newRef; stamp(d); bump('document') } })
  ;(db.candidats || []).forEach(c => { if (c && !c._deleted && c.logRef === oldRef) { c.logRef = newRef; stamp(c); bump('candidat') } })

  return { ok: true, touched, breakdown }
}
```

- [ ] **Step 4 : Lancer les tests → vert**

Run: `npx vitest run __tests__/helpers/rename-logement.test.js`
Expected: PASS (tous).

- [ ] **Step 5 : Commit**

```bash
git add js/core/rename-logement.js __tests__/helpers/rename-logement.test.js
git commit -m "Renommer un bien : coeur pur rename-logement.js (11 rattachements, garde-fou bail/EDL signe) + tests"
```

---

## Task 2 : Exposer sur `window._renameLogement`

**Files:**
- Modify: `js/main.js` (près de `window._bk = ...` / `window._emailCompose = ...`)

- [ ] **Step 1 : Importer + exposer**

En tête de `js/main.js`, ajouter à la liste d'imports :
```js
import { validateNewRef, canRenameLogement, renameLogementRef } from './core/rename-logement.js';
```
Puis, près des autres expositions `window.*` (ex. `window._emailCompose = _emailCompose;`) :
```js
window._renameLogement = { validate: validateNewRef, canRename: canRenameLogement, rename: renameLogementRef };
```

- [ ] **Step 2 : Vérifier**

Run: `node --check js/main.js` → OK.
Run: `grep -c "_renameLogement" js/main.js` → ≥1.

- [ ] **Step 3 : Commit**

```bash
git add js/main.js
git commit -m "Renommer un bien : expose window._renameLogement (validate/canRename/rename)"
```

---

## Task 3 : Orchestration + UI dans `index.html`

**Files:**
- Modify: `index.html` (modale `#ov-log` — bouton près de `#log-ref` ~L41591 ; nouveau dialogue `#ov-rename-log` ; fonctions `_openRenameLog`/`_doRenameLog`)

- [ ] **Step 1 : Bouton « ✏️ Renommer » à côté du champ ref verrouillé**

Localiser (`grep -n "el('log-ref').readOnly = true" index.html`, ~L41591). Juste après cette ligne (édition d'un bien existant), injecter un bouton visible seulement en édition :
```js
    setV('log-ref', log.ref); el('log-ref').readOnly = true;
    // Renommer : bouton à côté du champ ref (verrouillé). Visible uniquement en édition.
    (function(){ const w = el('log-ref-rename-wrap'); if (w) { w.style.display = ''; w.innerHTML = '<button type="button" class="btn bs bb" onclick="_openRenameLog(\'' + String(log.ref).replace(/'/g, "\\'") + '\')" title="Renommer ce bien">✏️ Renommer</button>'; } })();
```
Et dans le HTML de la modale `#ov-log`, à côté de l'input `#log-ref` (chercher `id="log-ref"`), ajouter un conteneur : `<span id="log-ref-rename-wrap" style="display:none;margin-left:8px"></span>`. En création (`el('log-ref').readOnly = false;`, ~L41655), masquer : ajouter `const w = el('log-ref-rename-wrap'); if (w) w.style.display = 'none';`.

- [ ] **Step 2 : Le dialogue `_openRenameLog(ref)` + validation live** (calqué sur le mockup validé)

Ajouter (près des autres modales) :
```js
function _openRenameLog(ref) {
  const api = window._renameLogement; if (!api) { showToast('Module renommage non chargé', 'err'); return; }
  const guard = api.canRename(DB, ref);
  const old = el('ov-rename-log'); if (old) old.remove();
  const blocked = !guard.ok;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="ov" id="ov-rename-log" onclick="closeBg(event,\'ov-rename-log\')"><div class="modal" style="max-width:440px">'
    + '<div class="m-head"><h3>✏️ Renommer le bien</h3><button class="m-close" onclick="closeM(\'ov-rename-log\')">✕</button></div>'
    + '<div class="m-body">'
    + '<div class="mu sm" style="margin-bottom:4px">Référence actuelle</div><div style="font-weight:600;margin-bottom:14px">' + escHtml(ref) + '</div>'
    + (blocked
        ? '<div style="background:var(--bg-warning,rgba(180,83,9,.10));border:1px solid rgba(180,83,9,.25);border-radius:var(--r);padding:12px 14px;color:var(--amb,#b45309);font-size:13px;line-height:1.5"><b>🔒 Référence verrouillée.</b><br>' + escHtml(guard.error) + '</div>'
        : '<div class="fg"><label>Nouvelle référence</label><input class="inp" id="rename-log-input" value="' + escHtml(ref) + '" oninput="_renameLogLive(\'' + String(ref).replace(/'/g, "\\'") + '\')"></div>'
          + '<div id="rename-log-msg" class="sm" style="min-height:18px;margin-top:4px"></div>'
          + '<div id="rename-log-preview" class="sm mu" style="margin-top:6px"></div>')
    + '</div>'
    + '<div class="m-foot"><button class="btn bs" onclick="closeM(\'ov-rename-log\')">' + (blocked ? 'Fermer' : 'Annuler') + '</button>'
    + (blocked ? '' : '<button class="btn bp" id="rename-log-go" onclick="_doRenameLog(\'' + String(ref).replace(/'/g, "\\'") + '\')" disabled>Renommer</button>') + '</div>'
    + '</div></div>');
  openM('ov-rename-log');
  if (!blocked) _renameLogLive(ref);
}
function _renameLogLive(oldRef) {
  const api = window._renameLogement; const inp = el('rename-log-input'); if (!api || !inp) return;
  const newRef = inp.value.trim();
  const msg = el('rename-log-msg'), prev = el('rename-log-preview'), go = el('rename-log-go');
  const v = api.validate(DB, oldRef, newRef);
  if (!v.ok) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = v.code === 'same' ? '' : v.error; } if (prev) prev.textContent = ''; if (go) go.disabled = true; return; }
  if (msg) { msg.style.color = 'var(--grn)'; msg.textContent = '✓ Nom disponible.'; }
  // Aperçu (dry-run sur une COPIE — ne mute pas DB) : compter les rattachements.
  const copy = JSON.parse(JSON.stringify(DB));
  const r = api.rename(copy, oldRef, newRef, { stamp: x => x });
  if (prev && r.ok) prev.textContent = r.touched + ' élément(s) seront mis à jour (tout l\'historique suit).';
  if (go) go.disabled = false;
}
async function _doRenameLog(oldRef) {
  const api = window._renameLogement; const inp = el('rename-log-input'); if (!api || !inp) return;
  const newRef = inp.value.trim();
  const log = (DB.logements || []).find(l => l && l.ref === oldRef);
  const r = api.rename(DB, oldRef, newRef, { stamp: _stamp });
  if (!r.ok) { showToast(r.error || 'Renommage impossible', 'err', 6000); return; }
  if (typeof _auditLog === 'function' && log) _auditLog('update', 'logement', log.id, newRef, oldRef, newRef);
  saveDB();
  closeM('ov-rename-log'); closeM('ov-log');
  showToast('Bien renommé « ' + newRef + ' » — ' + r.touched + ' rattachement(s) mis à jour', 'ok', 4000);
  _refreshAfterMutation();
}
```

- [ ] **Step 3 : Vérifier**

Run: `node scripts/check-inline-js.mjs` → `5 | errors : 0`.
Run: `grep -c "_openRenameLog\|_doRenameLog\|_renameLogLive" index.html` → ≥4.

- [ ] **Step 4 : Commit**

```bash
git add index.html
git commit -m "Renommer un bien : bouton dans la modale d'edition + dialogue (validation live, apercu impact, blocage bail/EDL signe)"
```

---

## Task 4 : Livraison (bump + vérif + audit + round-trip cloud)

- [ ] **Step 1 : Bump version** — repérer `IMMOTRACK_VERSION`, +1 sur les 4 emplacements ciblés d'index.html (title, `<em>`, const, recap) + `sw.js` (bump CIBLÉ, pas global — ne pas toucher les commentaires `/* vX */`).
- [ ] **Step 2 : Vérif** — `node scripts/check-inline-js.mjs` → 5/0 ; `npx vitest run` → suite verte (dont `rename-logement` ; 3 échecs pré-existants legal-2044/bank-import hors périmètre).
- [ ] **Step 3 : AUDIT `superpowers:code-reviewer` OBLIGATOIRE** (report de données sensibles) : (a) les 11 rattachements couverts, aucun oublié → pas d'orphelin ; (b) garde-fou `signatures.locked`/`signedAt` bail+EDL bien bloquant AVANT toute mutation ; (c) unicité incluant tombstones + `norm` (anti-collision uuid) ; (d) l'aperçu (`_renameLogLive`) tourne sur une COPIE (ne mute pas DB) ; (e) `autoKey` agenda réécrit sans sur-remplacement ; (f) pas de XSS dans le dialogue (escHtml + quote-escape des onclick). Corriger jusqu'à PASS.
- [ ] **Step 4 : Round-trip cloud** (sur l'app déployée) : renommer un bien vacant → recharger → cohérent ; renommer un bien AVEC quittances/mouvements (sans bail signé) → recharger → enfants rattachés au nouvel uuid, 0 orphelin ; tenter sur un bien à bail signé → bloqué proprement.
- [ ] **Step 5 : Intégration** — rebase sur origin/main, push FF (re-bump si collision).

---

## Self-Review
- Couverture spec : module pur+tests (T1), exposition (T2), garde-fou bail/EDL signé (T1 canRename), validation format+unicité tombstones (T1 validateNewRef), report 11 sites dont autoKey (T1 rename), UI bouton+dialogue+aperçu+blocage (T3), audit+round-trip cloud (T4). ✓
- Placeholders : bump « +1 » explicité (repérage). Anchors UI localisés par `grep` (numéros dérivent). ✓
- Cohérence : `window._renameLogement.{validate,canRename,rename}` ↔ appels `_openRenameLog/_renameLogLive/_doRenameLog` ↔ signatures module. `stamp` injecté (prod `_stamp`, tests mock, aperçu identité). ✓
