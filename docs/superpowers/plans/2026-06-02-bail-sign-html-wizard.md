# `sign.html` — Wizard de signature à distance (composant 2/3) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire la page autonome `sign.html` servie par le relais Cloudflare, qui permet à un signataire à distance de lire le bail, signer au doigt/souris, puis **tamponner sa signature et ses paraphes sur le PDF original** (pdf-lib) et le renvoyer au relais — sans aucune action manuelle de retour. C'est le composant n°2 sur 3 du sujet BAIL-SIGNATURE-DISTANCE.

**Architecture :** `sign.html` est une page statique servie par le Worker (route `GET /s/:id`, qui injecte le token + métadonnées dans `window.*`). Elle récupère le PDF original via `GET /api/sessions/:id/pdf` (header `X-Sign-Token`), l'affiche pour lecture (PDF.js), capture la signature manuscrite (canvas), puis **tamponne** (stratégie B) signature + paraphes + mention légale sur le PDF original via **pdf-lib** et renvoie les octets via `POST /api/sessions/:id/signed`. Le relais reste intact (zéro changement de contrat de sécurité). Le cœur de tamponnage est isolé dans des **modules purs** (`sigid`, `coords`, `manifest`, `proof`, `stamp`) testables en Node/workerd ; la coque navigateur (rendu, pad, flux) est vérifiée manuellement.

**Tech Stack :** pdf-lib (tamponnage, isomorphe Node+navigateur) · PDF.js (affichage lecture) · Web Crypto/Canvas (signature) · HTML/CSS/JS vanilla ESM (cohérent avec l'app) · Cloudflare Worker `[assets]` (service statique) · Vitest + `@cloudflare/vitest-pool-workers` (modules purs) · wrangler. **Pas de bundler** : pdf-lib et PDF.js sont *vendorés* en builds pré-compilés ; les modules purs reçoivent les objets pdf-lib en paramètre (injection de dépendance) et n'importent jamais ni pdf-lib ni `window`.

**Référence spec :** [docs/subjects/BAIL-SIGNATURE-DISTANCE.md](../../subjects/BAIL-SIGNATURE-DISTANCE.md) (§3 routes/flux, §4 wizard, §5 dossier de preuve, §6 sécurité/RGPD, §8 plan de phases).

**Plan du composant 1 (relais, déjà construit + audité) :** [2026-06-02-bail-signature-relais.md](./2026-06-02-bail-signature-relais.md).

---

## Décisions de conception (deltas vs la spec écrite, à valider à l'exécution)

La spec §4 décrit la stratégie **A** (« le PDF est réinjecté dans `genPDFNative` »). L'utilisateur a tranché pour la stratégie **B** (tamponner). Les choix ci-dessous découlent de B et sont rendus explicites pour ne pas être enterrés :

1. **Stratégie B — tamponnage (immutabilité préservée).** `sign.html` ne reconstruit PAS le PDF. Il tamponne la signature/paraphes sur **les octets exacts** présentés au signataire. C'est la base juridiquement défendable (un audit code-reviewer avait relevé une violation d'immutabilité du bail signé sur une refonte précédente : le document signé doit rester fidèle au document présenté). La stratégie A re-rendrait le PDF → risque de divergence → écartée.

2. **Contrat d'ancrage = manifeste embarqué dans le PDF.** La position de la signature finale est **dynamique** (flux vertical de `genPDFNative`), donc non devinable côté `sign.html`. Solution : `genPDFNative` (composant 3) embarque un **manifeste** listant les ancres. `sign.html` le lit via pdf-lib. ⚠️ **Ceci ajoute une exigence au composant 3** (écrire le manifeste). Format retenu : `base64url(JSON)` stocké dans le champ **Keywords** des métadonnées PDF, préfixé par le sentinel `ITSIGNv1:`. jsPDF (composant 3) l'écrit via `setProperties({keywords})` ; pdf-lib (composant 2) le lit via `doc.getKeywords()`. Le manifeste porte **toutes** les ancres (signature *et* paraphes), coordonnées en mm/origine-haut-gauche (repère jsPDF) :
   ```json
   {
     "v": 1,
     "totalPages": 7,
     "anchors": [
       { "sigId": "loc-0", "kind": "signature", "page": 7, "x": 120, "y": 210, "w": 90, "h": 30, "luApprouve": true },
       { "sigId": "loc-0", "kind": "paraphe",   "page": 2, "x": 125, "y": 279.5, "w": 70, "h": 14 }
     ]
   }
   ```
   `sign.html` ne reproduit donc **jamais** les maths de colonnes du pied de page — il lit les ancres et tamponne. La reproduction géométrique déterministe (constantes `PDF_NATIVE`) n'est qu'un **repli défensif** (`coords.fallbackAnchors`) quand le manifeste est absent (ex. PDF d'un ancien `genPDFNative`).

3. **Cœur de tamponnage isolé en modules purs pour TDD.** `sigid.js`, `coords.js`, `manifest.js`, `proof.js` sont **purs** (aucune dépendance pdf-lib, aucun `window`). `stamp.js` est le seul à manipuler pdf-lib, et **reçoit le `PDFDocument` en paramètre** (jamais d'import pdf-lib en son sein). Résultat : tout est testable dans le pool workers (Node/workerd) ; le test crée le doc pdf-lib et le passe ; le navigateur passe le doc créé via `window.PDFLib`.

4. **Libs servies en assets statiques (pas de bundler).** `pdf-lib.min.js` (UMD → `window.PDFLib`) et PDF.js (`pdf.min.mjs` + worker) sont vendorés dans `relay/public/vendor/`. `sign.html` les charge par `<script>`. pdf-lib est aussi en `devDependency` pour que les tests Vitest l'importent depuis `node_modules` (source unique).

5. **Preuve d'acte de volonté embarquée dans le PDF (contrat relais gelé).** La spec §5 liste 8 items de preuve. Le relais (composant 1, gelé) capture déjà côté serveur `ip` + `userAgent` + `signedAt` + `pdfSha256` (et le token porte `jti`/`role`/`exp` = contrôle email + piste d'audit). Les items restants (identité affirmée, « Lu et approuvé », consentement au procédé électronique) sont **tamponnés visiblement dans le PDF** par `sign.html` (mention légale à côté de la signature) — donc immuables et opposables, sans étendre le contrat POST du relais (qui n'accepte que `application/pdf`). Un POST de preuve structuré reste un item de durcissement Phase 4.

6. **Modèle de paraphe V1 = capture unique répliquée.** Le signataire dessine **une** signature. La même image sert de signature finale (ancre `signature`) **et** de paraphe (ancres `paraphe` sur chaque page non exclue). Évite une double capture au doigt sur mobile ; conforme à l'usage des outils e-sign. À valider au mockup (Task 0).

7. **Coque autonome → gate mockup-first obligatoire (Task 0).** `sign.html` est un nouvel artefact visuel destiné à des tiers (locataires) sur mobile. Règle gravée mockup-first : mockups A/B/C × PC/Tablette/Téléphone × **tous** les états post-clic AVANT de coder. Validation explicite de l'utilisateur avant Task 1.

8. **Audit code-reviewer obligatoire avant le commit final (Task 13).** Règle gravée : tout livrable sensible (PDF de bail, preuve juridique) est audité par un agent `superpowers:code-reviewer` AVANT d'annoncer « prêt à tester ». Mes audits propres (Vitest + grep) ne suffisent jamais ici.

---

## File Structure

Tout vit dans le sous-dossier `relay/` du worktree `Immo-relay-bailsign` (branche `relay-bail-sign`). Le plan lui-même vit sur la branche principale (convergence au merge).

```
relay/
  package.json            # + devDep pdf-lib ; + script "build:vendor" (copie les libs)
  wrangler.toml           # + bloc [assets] { directory = "./public", binding = "ASSETS" }
  public/
    sign.html             # coque : <script> libs + sign.js, conteneurs lecture/pad/états
    sign.css              # styles responsive (touch ≥44px, mobile-first)
    sign.js               # orchestrateur navigateur (NON testé unitairement) : fetch→render→capture→stamp→POST
    sign/
      sigid.js            # PUR : (signer)→sigId ; conventions bailleur/loc/mandataire
      coords.js           # PUR : mm→pt, flip Y jsPDF→pdf-lib, fallbackAnchors(constantes)
      manifest.js         # encode/decode (PUR) + readFromDoc/embedInDoc (pdf-lib en param)
      proof.js            # PUR : construit la mention légale + l'objet preuve local
      stamp.js            # pdf-lib (doc en param) : tamponne signature+paraphes+mention
    vendor/
      pdf-lib.min.js      # UMD vendoré (window.PDFLib)
      pdf.min.mjs         # PDF.js (affichage)
      pdf.worker.min.mjs  # worker PDF.js
  test/
    sigid.test.js
    coords.test.js
    manifest.test.js
    proof.test.js
    stamp.test.js         # fixtures pdf-lib (doc + manifeste créés dans le test)
    sign-route.test.js    # GET /s/:id : injection token/role + service asset (SELF.fetch)
  mockups/
    sign-distance/        # Task 0 : mockups statiques A/B/C × 3 formats × tous états
  src/
    index.js              # MODIF : GET /s/:id (renderSignPage) + forward ASSETS
    sign-page.js          # NOUVEAU : renderSignPage(session, token, signer) → HTML coque
```

**Responsabilités (une par fichier) :**
- `sigid.js` : convention d'identifiant de signataire (pur, aucune I/O).
- `coords.js` : conversion de repère jsPDF(mm, haut-gauche) → pdf-lib(pt, bas-gauche) + ancres de repli déterministes.
- `manifest.js` : (dé)sérialisation du manifeste + lecture/écriture dans un doc pdf-lib.
- `proof.js` : texte de mention légale + objet preuve (pur).
- `stamp.js` : seul module touchant pdf-lib ; tamponne tout pour un sigId donné.
- `sign.js` : colle le tout dans le navigateur (orchestration, événements, états) — vérifié manuellement, pas de test unitaire.
- `src/sign-page.js` : génère le HTML serveur de `GET /s/:id` avec injection sécurisée.

---

## Task 0 : Gate mockup-first (AUCUN code applicatif — bloquant)

**Files:**
- Create: `relay/mockups/sign-distance/index.html` (galerie liant les variantes)
- Create: `relay/mockups/sign-distance/A-*.html`, `B-*.html`, `C-*.html` (variantes × formats × états)

Règle gravée mockup-first : produire des mockups **statiques HTML** (pas de logique) couvrant :

- **3 variantes** A/B/C de la coque (ex. A = pleine page mono-colonne ; B = lecture en haut + barre signature collée en bas ; C = étapes en accordéon).
- **3 formats** : PC (≥1024px), Tablette (~768px), Téléphone (~375px).
- **Tous les états post-clic** : (1) atterrissage + consentement (identité affirmée, case « je reconnais signer », consentement procédé électronique) ; (2) lecture du document + zone paraphe ; (3) signature finale (pad) ; (4) confirmation/aperçu avant envoi ; (5) succès (« document signé et renvoyé ») ; (6) erreurs : lien expiré, déjà signé, pas votre tour (`currentIndex` ≠ vous), échec réseau (retry).

- [ ] **Step 1 : Construire les mockups statiques** (HTML/CSS inline, données factices, zéro JS de logique). Inclure une note en haut de chaque fichier rappelant le format ciblé.

- [ ] **Step 2 : Tester dans un vrai navigateur** (pas la zone preview Claude). Ouvrir `relay/mockups/sign-distance/index.html`.

- [ ] **Step 3 : Validation explicite de l'utilisateur.** Présenter A/B/C × 3 formats × états. **Attendre le choix** (variante retenue + ajustements) AVANT toute autre tâche. Le modèle de paraphe (décision #6 : capture unique répliquée) est confirmé ici.

- [ ] **Step 4 : Commit** (mockups uniquement)

```bash
cd relay && git add mockups/sign-distance && git commit -m "feat(sign): mockups wizard signature à distance (A/B/C × 3 formats × états)"
```

> ⛔ **Ne pas démarrer Task 1 tant que l'utilisateur n'a pas validé une variante.** Les tâches suivantes supposent la variante retenue ; adapter `sign.html`/`sign.css` en conséquence.

---

## Task 1 : Toolchain — vendoring des libs + assets Worker + squelette servi

**Files:**
- Modify: `relay/package.json` (devDep `pdf-lib`, script `build:vendor`)
- Modify: `relay/wrangler.toml` (bloc `[assets]`)
- Create: `relay/public/sign.html` (squelette minimal)
- Create: `relay/public/vendor/.gitkeep`
- Modify: `relay/.gitignore` (ne pas ignorer `public/vendor/*.js` — ils sont commités)

- [ ] **Step 1 : Ajouter pdf-lib en devDependency + script de vendoring**

Éditer `relay/package.json` — ajouter dans `devDependencies` et `scripts` :

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "build:vendor": "node scripts/vendor-libs.mjs"
  },
  "devDependencies": {
    "wrangler": "^3.80.0",
    "vitest": "^2.1.0",
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^4.6.82"
  }
}
```

- [ ] **Step 2 : Écrire le script de vendoring** `relay/scripts/vendor-libs.mjs`

```js
// Copie les builds pré-compilés des libs dans public/vendor (source unique = node_modules).
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'public', 'vendor');
await mkdir(vendor, { recursive: true });

const copies = [
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs']
];
for (const [src, dst] of copies) {
  await copyFile(join(root, src), join(vendor, dst));
  console.log('vendored', dst);
}
```

- [ ] **Step 3 : Installer + vendorer**

Run: `cd relay && npm install && npm run build:vendor`
Expected : `vendored pdf-lib.min.js` / `vendored pdf.min.mjs` / `vendored pdf.worker.min.mjs`, et 3 fichiers présents dans `relay/public/vendor/`.

- [ ] **Step 4 : Déclarer les assets dans wrangler.toml**

Ajouter à la fin de `relay/wrangler.toml` :

```toml
[assets]
directory = "./public"
binding = "ASSETS"
```

- [ ] **Step 5 : Squelette `public/sign.html`** (sera étoffé Tasks 8-11 selon la variante validée Task 0)

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Signature du bail</title>
  <link rel="stylesheet" href="/vendor/../sign.css" />
  <link rel="stylesheet" href="/sign.css" />
</head>
<body>
  <main id="app" aria-live="polite">
    <p id="boot">Chargement…</p>
  </main>
  <script src="/vendor/pdf-lib.min.js"></script>
  <script type="module" src="/sign.js"></script>
</body>
</html>
```

- [ ] **Step 6 : `public/sign.css` minimal** (placeholder remplacé Task 11)

```css
:root { --pad: 16px; --accent: #1a1a8c; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1a1a1a; }
#app { max-width: 860px; margin: 0 auto; padding: var(--pad); }
button { min-height: 44px; min-width: 44px; }
```

- [ ] **Step 7 : Vérifier que les tests existants passent encore** (le bloc `[assets]` ne doit rien casser)

Run: `cd relay && npm test`
Expected : les 46 tests existants PASS (0 régression).

- [ ] **Step 8 : Commit**

```bash
cd relay && git add package.json package-lock.json wrangler.toml scripts/vendor-libs.mjs public/sign.html public/sign.css public/vendor && git commit -m "feat(sign): toolchain — vendoring pdf-lib/PDF.js + assets Worker + squelette sign.html"
```

---

## Task 2 : `sigid.js` — convention d'identifiant de signataire (PUR)

**Files:**
- Create: `relay/public/sign/sigid.js`
- Test: `relay/test/sigid.test.js`

**Contrat canonique** (le manifeste de `genPDFNative`, composant 3, DOIT le respecter) : le côté `bailleur` regroupe `bailleur`/`gerant`/`gérant`/`mandataire` ; le côté `locataire` regroupe tout rôle contenant `locat` ou `preneur`. Le `sigId` = préfixe (`bailleur` ou `loc`) + `-` + rang 0-based parmi les signataires du même côté, dans l'ordre `ordre`.

- [ ] **Step 1 : Écrire le test qui échoue** `relay/test/sigid.test.js`

```js
import { describe, it, expect } from 'vitest';
import { sideOf, computeSigId } from '../public/sign/sigid.js';

describe('sideOf', () => {
  it('classe le locataire et le preneur côté locataire', () => {
    expect(sideOf('locataire')).toBe('locataire');
    expect(sideOf('Locataire principal')).toBe('locataire');
    expect(sideOf('preneur')).toBe('locataire');
  });
  it('classe bailleur, gérant et mandataire côté bailleur', () => {
    expect(sideOf('bailleur')).toBe('bailleur');
    expect(sideOf('gérant')).toBe('bailleur');
    expect(sideOf('mandataire')).toBe('bailleur');
  });
});

describe('computeSigId', () => {
  const signers = [
    { role: 'bailleur', ordre: 0 },
    { role: 'locataire', ordre: 1 },
    { role: 'locataire', ordre: 2 }
  ];
  it('indexe par rang dans le même côté', () => {
    expect(computeSigId(signers, 0)).toBe('bailleur-0');
    expect(computeSigId(signers, 1)).toBe('loc-0');
    expect(computeSigId(signers, 2)).toBe('loc-1');
  });
  it('lève si index hors borne', () => {
    expect(() => computeSigId(signers, 9)).toThrow();
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd relay && npx vitest run test/sigid.test.js`
Expected : FAIL (`sideOf`/`computeSigId` introuvables).

- [ ] **Step 3 : Implémenter** `relay/public/sign/sigid.js`

```js
// Convention d'identifiant de signataire. PUR : aucune dépendance, aucun window.
// Contrat partagé avec genPDFNative (composant 3) qui embarque les mêmes sigId dans le manifeste.

export function sideOf(role) {
  return /locat|preneur/i.test(role || '') ? 'locataire' : 'bailleur';
}

export function computeSigId(signers, index) {
  if (!Array.isArray(signers) || index < 0 || index >= signers.length) {
    throw new Error('computeSigId: index hors borne');
  }
  const side = sideOf(signers[index].role);
  let rank = 0;
  for (let i = 0; i < index; i++) {
    if (sideOf(signers[i].role) === side) rank++;
  }
  const prefix = side === 'locataire' ? 'loc' : 'bailleur';
  return `${prefix}-${rank}`;
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd relay && npx vitest run test/sigid.test.js`
Expected : PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
cd relay && git add public/sign/sigid.js test/sigid.test.js && git commit -m "feat(sign): sigid.js — convention sigId par côté/rang (pur, testé)"
```

---

## Task 3 : `coords.js` — conversion de repère + ancres de repli (PUR)

**Files:**
- Create: `relay/public/sign/coords.js`
- Test: `relay/test/coords.test.js`

Le manifeste exprime les ancres en **mm, origine haut-gauche** (repère jsPDF). pdf-lib travaille en **points, origine bas-gauche**. `coords.js` convertit. Constantes `PDF_NATIVE` reproduites depuis `index.html` (geometry du pied de page paraphes) pour le repli défensif.

- [ ] **Step 1 : Écrire le test qui échoue** `relay/test/coords.test.js`

```js
import { describe, it, expect } from 'vitest';
import { mmToPt, rectFromJsPdf, fallbackAnchors, PDF_NATIVE } from '../public/sign/coords.js';

const A4_H_PT = 841.8897637795275; // 297mm en pt

describe('mmToPt', () => {
  it('convertit mm → pt (72/25.4)', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
    expect(mmToPt(0)).toBe(0);
  });
});

describe('rectFromJsPdf', () => {
  it('flippe Y (haut-gauche → bas-gauche) et convertit en pt', () => {
    // boîte jsPDF top-left (10,20) 30×40 mm sur page 297mm de haut
    const r = rectFromJsPdf({ x: 10, y: 20, w: 30, h: 40 }, A4_H_PT);
    expect(r.x).toBeCloseTo(mmToPt(10), 6);
    expect(r.width).toBeCloseTo(mmToPt(30), 6);
    expect(r.height).toBeCloseTo(mmToPt(40), 6);
    // bas de la boîte = (20+40)=60mm du haut → y pdf-lib = hauteur - 60mm
    expect(r.y).toBeCloseTo(A4_H_PT - mmToPt(60), 6);
  });
});

describe('fallbackAnchors', () => {
  it('produit un paraphe par page côté locataire + une signature en dernière page', () => {
    const anchors = fallbackAnchors({ sigId: 'loc-0', side: 'locataire', totalPages: 3 });
    const paraphes = anchors.filter((a) => a.kind === 'paraphe');
    const sigs = anchors.filter((a) => a.kind === 'signature');
    expect(paraphes).toHaveLength(3);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].page).toBe(3);
    // colonne locataire : x = PAGE_W - MARGIN_RIGHT - colW = 210 - 15 - 70 = 125
    expect(paraphes[0].x).toBe(125);
    expect(paraphes.every((a) => a.sigId === 'loc-0')).toBe(true);
  });
  it('met la colonne paraphe bailleur à gauche (x=15)', () => {
    const anchors = fallbackAnchors({ sigId: 'bailleur-0', side: 'bailleur', totalPages: 1 });
    expect(anchors.find((a) => a.kind === 'paraphe').x).toBe(15);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd relay && npx vitest run test/coords.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter** `relay/public/sign/coords.js`

```js
// Conversion de repère jsPDF(mm, haut-gauche) → pdf-lib(pt, bas-gauche) + ancres de repli.
// PUR : aucune dépendance pdf-lib, aucun window.

// Constantes reproduites depuis index.html (PDF_NATIVE + drawParaphesFooter).
export const PDF_NATIVE = {
  MARGIN_LEFT: 15, MARGIN_RIGHT: 15, MARGIN_TOP: 15, MARGIN_BOTTOM: 25,
  PAGE_W: 210, PAGE_H: 297,
  // pied de page paraphes (drawParaphesFooter) :
  FOOT_Y: 297 - 25 + 5,        // 277 : ligne du label
  PARAPHE_RECT_DY: 2.5,        // les sous-cadres commencent à FOOT_Y + 2.5 = 279.5
  COL_W: 70, COL_H: 14
};

const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm) {
  return mm * PT_PER_MM;
}

// Boîte jsPDF (top-left, mm) → boîte pdf-lib (bottom-left, pt). pageHeightPt = page.getHeight().
export function rectFromJsPdf({ x, y, w, h }, pageHeightPt) {
  return {
    x: mmToPt(x),
    y: pageHeightPt - mmToPt(y + h),
    width: mmToPt(w),
    height: mmToPt(h)
  };
}

// Ancres déterministes quand le PDF n'a pas de manifeste (défensif). Coords en mm/jsPDF.
export function fallbackAnchors({ sigId, side, totalPages }) {
  const colX = side === 'locataire'
    ? PDF_NATIVE.PAGE_W - PDF_NATIVE.MARGIN_RIGHT - PDF_NATIVE.COL_W // 125
    : PDF_NATIVE.MARGIN_LEFT;                                        // 15
  const parapheY = PDF_NATIVE.FOOT_Y + PDF_NATIVE.PARAPHE_RECT_DY;   // 279.5
  const anchors = [];
  for (let p = 1; p <= totalPages; p++) {
    anchors.push({ sigId, kind: 'paraphe', page: p, x: colX, y: parapheY, w: PDF_NATIVE.COL_W, h: PDF_NATIVE.COL_H });
  }
  // Signature finale : zone fixe au-dessus du pied de page, dernière page (best-effort sans manifeste).
  anchors.push({ sigId, kind: 'signature', page: totalPages, x: colX, y: 235, w: 90, h: 30, luApprouve: true });
  return anchors;
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd relay && npx vitest run test/coords.test.js`
Expected : PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
cd relay && git add public/sign/coords.js test/coords.test.js && git commit -m "feat(sign): coords.js — conversion repère jsPDF→pdf-lib + ancres de repli (pur, testé)"
```

---

## Task 4 : `manifest.js` — (dé)sérialisation + lecture/écriture PDF

**Files:**
- Create: `relay/public/sign/manifest.js`
- Test: `relay/test/manifest.test.js`

`encode`/`decode` sont **purs** (chaîne ↔ objet). `readFromDoc`/`embedInDoc` reçoivent un `PDFDocument` pdf-lib **en paramètre** (jamais d'import pdf-lib ici). Stockage dans le champ Keywords, sentinel `ITSIGNv1:`. `embedInDoc` sert de référence + de fabrique de fixtures pour les tests ; le composant 3 reproduira le même format en jsPDF.

- [ ] **Step 1 : Écrire le test qui échoue** `relay/test/manifest.test.js`

```js
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { encode, decode, readFromDoc, embedInDoc, SENTINEL } from '../public/sign/manifest.js';

const sample = {
  v: 1,
  totalPages: 2,
  anchors: [
    { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30, luApprouve: true },
    { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 }
  ]
};

describe('encode/decode', () => {
  it('fait un aller-retour fidèle', () => {
    const s = encode(sample);
    expect(s.startsWith(SENTINEL)).toBe(true);
    expect(decode(s)).toEqual(sample);
  });
  it('supporte les accents (UTF-8)', () => {
    const m = { v: 1, totalPages: 1, anchors: [], note: 'éàü' };
    expect(decode(encode(m))).toEqual(m);
  });
  it('retourne null sur chaîne non préfixée ou corrompue', () => {
    expect(decode('hello world')).toBeNull();
    expect(decode(SENTINEL + '!!!pas-du-base64-valide')).toBeNull();
    expect(decode('')).toBeNull();
    expect(decode(undefined)).toBeNull();
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
  it('readFromDoc retourne null si pas de manifeste', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(readFromDoc(reloaded)).toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd relay && npx vitest run test/manifest.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter** `relay/public/sign/manifest.js`

```js
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

// pdf-lib getKeywords() retourne une string (ou undefined). setKeywords prend un tableau.
export function readFromDoc(pdfDoc) {
  return decode(pdfDoc.getKeywords());
}

export function embedInDoc(pdfDoc, manifest) {
  pdfDoc.setKeywords([encode(manifest)]);
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd relay && npx vitest run test/manifest.test.js`
Expected : PASS (5 tests).

- [ ] **Step 5 : Commit**

```bash
cd relay && git add public/sign/manifest.js test/manifest.test.js && git commit -m "feat(sign): manifest.js — (dé)sérialisation ancres + lecture/écriture PDF (testé persistance octets)"
```

---

## Task 5 : `proof.js` — mention légale + objet preuve (PUR)

**Files:**
- Create: `relay/public/sign/proof.js`
- Test: `relay/test/proof.test.js`

Construit le texte tamponné à côté de la signature (décision #5 : preuve d'acte de volonté embarquée dans le PDF) et un objet preuve structuré (réutilisable). Pur — aucune I/O.

- [ ] **Step 1 : Écrire le test qui échoue** `relay/test/proof.test.js`

```js
import { describe, it, expect } from 'vitest';
import { formatDateFr, buildMentionLines, buildProofObject } from '../public/sign/proof.js';

describe('formatDateFr', () => {
  it('formate un ISO en date+heure FR', () => {
    const s = formatDateFr('2026-06-02T14:30:00.000Z');
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('buildMentionLines', () => {
  const lines = buildMentionLines({ signerName: 'Jean Dupont', role: 'locataire', dateISO: '2026-06-02T14:30:00.000Z' });
  it('mentionne le signataire, « Lu et approuvé » et le consentement', () => {
    const joined = lines.join(' \n ');
    expect(joined).toContain('Jean Dupont');
    expect(joined).toContain('Lu et approuvé');
    expect(joined.toLowerCase()).toContain('électronique');
    expect(joined).toMatch(/2026/);
  });
  it('retourne un tableau de lignes courtes (tamponnables)', () => {
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.every((l) => typeof l === 'string' && l.length <= 60)).toBe(true);
  });
});

describe('buildProofObject', () => {
  it('assemble les items de preuve côté client', () => {
    const p = buildProofObject({
      signerName: 'Jean Dupont', role: 'locataire', sigId: 'loc-0',
      dateISO: '2026-06-02T14:30:00.000Z', consentElectronic: true, luApprouve: true
    });
    expect(p).toMatchObject({
      sigId: 'loc-0', signerName: 'Jean Dupont', role: 'locataire',
      consentElectronic: true, luApprouve: true, signedAt: '2026-06-02T14:30:00.000Z'
    });
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd relay && npx vitest run test/proof.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter** `relay/public/sign/proof.js`

```js
// Mention légale tamponnée + objet preuve. PUR : aucune I/O.

export function formatDateFr(dateISO) {
  const d = new Date(dateISO);
  // Format stable indépendant de la locale du runtime : JJ/MM/AAAA HH:MM (UTC).
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function buildMentionLines({ signerName, role, dateISO }) {
  return [
    'Signé électroniquement',
    `par ${signerName} (${role})`,
    `« Lu et approuvé » — ${formatDateFr(dateISO)}`,
    'Consentement au procédé électronique donné.'
  ];
}

export function buildProofObject({ signerName, role, sigId, dateISO, consentElectronic, luApprouve }) {
  return {
    sigId,
    signerName,
    role,
    signedAt: dateISO,
    consentElectronic: !!consentElectronic,
    luApprouve: !!luApprouve
  };
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd relay && npx vitest run test/proof.test.js`
Expected : PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
cd relay && git add public/sign/proof.js test/proof.test.js && git commit -m "feat(sign): proof.js — mention légale + objet preuve (pur, testé)"
```

---

## Task 6 : `stamp.js` — cœur de tamponnage pdf-lib (module à risque)

**Files:**
- Create: `relay/public/sign/stamp.js`
- Test: `relay/test/stamp.test.js`

Seul module touchant pdf-lib, mais **reçoit le `PDFDocument` + `deps.rgb` en paramètre** (aucun import pdf-lib). Il tamponne, pour un `sigId` donné, l'image de signature dans toutes les ancres `signature` + `paraphe`, plus la mention légale à côté de la signature. Ne redessine PAS les cadres (déjà dessinés par `genPDFNative`). Police standard `Helvetica` (pas de fontkit). Si pas de manifeste → ancres de repli déterministes.

- [ ] **Step 1 : Écrire le test qui échoue** `relay/test/stamp.test.js`

```js
import { describe, it, expect } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedInDoc } from '../public/sign/manifest.js';
import { dataUrlToBytes, stampSignature } from '../public/sign/stamp.js';

// 1×1 PNG transparent valide.
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function makeDoc(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]); // A4 pt
  return doc;
}

describe('dataUrlToBytes', () => {
  it('décode un data URL PNG en octets', () => {
    const bytes = dataUrlToBytes(PNG_1x1);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    // signature PNG \x89PNG
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
  });
});

describe('stampSignature (avec manifeste)', () => {
  it('tamponne chaque ancre du sigId et ajoute du contenu', async () => {
    const doc = await makeDoc(2);
    embedInDoc(doc, {
      v: 1, totalPages: 2,
      anchors: [
        { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30, luApprouve: true },
        { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'loc-0', kind: 'paraphe', page: 2, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'bailleur-0', kind: 'signature', page: 2, x: 15, y: 210, w: 90, h: 30 }
      ]
    });
    const before = (await doc.save()).length;
    const res = await stampSignature(doc, {
      sigId: 'loc-0', pngDataUrl: PNG_1x1,
      mentionLines: ['Signé électroniquement', 'par Jean Dupont (locataire)']
    }, { rgb });
    expect(res.stamped).toBe(3); // 1 signature + 2 paraphes (pas l'ancre bailleur-0)
    const after = (await doc.save()).length;
    expect(after).toBeGreaterThan(before);
  });

  it('ignore une ancre dont la page dépasse le document', async () => {
    const doc = await makeDoc(1);
    embedInDoc(doc, {
      v: 1, totalPages: 1,
      anchors: [{ sigId: 'loc-0', kind: 'paraphe', page: 9, x: 125, y: 279.5, w: 70, h: 14 }]
    });
    const res = await stampSignature(doc, { sigId: 'loc-0', pngDataUrl: PNG_1x1, mentionLines: [] }, { rgb });
    expect(res.stamped).toBe(0);
    expect(res.skipped).toBe(1);
  });
});

describe('stampSignature (repli sans manifeste)', () => {
  it('tamponne totalPages paraphes + 1 signature', async () => {
    const doc = await makeDoc(3);
    const res = await stampSignature(doc, {
      sigId: 'loc-0', side: 'locataire', pngDataUrl: PNG_1x1, mentionLines: ['x']
    }, { rgb });
    expect(res.stamped).toBe(4); // 3 paraphes + 1 signature
    expect(res.usedFallback).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd relay && npx vitest run test/stamp.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter** `relay/public/sign/stamp.js`

```js
// Cœur de tamponnage. Reçoit le PDFDocument pdf-lib + deps.rgb en paramètre (aucun import pdf-lib).
import { rectFromJsPdf, mmToPt, fallbackAnchors } from './coords.js';
import { readFromDoc } from './manifest.js';

export function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Résout les ancres pour ce sigId : manifeste si présent, sinon repli déterministe.
function resolveAnchors(pdfDoc, { sigId, side }) {
  const manifest = readFromDoc(pdfDoc);
  if (manifest && Array.isArray(manifest.anchors)) {
    return { anchors: manifest.anchors.filter((a) => a.sigId === sigId), usedFallback: false };
  }
  const totalPages = pdfDoc.getPageCount();
  return { anchors: fallbackAnchors({ sigId, side: side || 'locataire', totalPages }), usedFallback: true };
}

export async function stampSignature(pdfDoc, { sigId, pngDataUrl, mentionLines = [], side }, deps) {
  const { rgb } = deps;
  const { anchors, usedFallback } = resolveAnchors(pdfDoc, { sigId, side });
  const png = await pdfDoc.embedPng(dataUrlToBytes(pngDataUrl));
  const font = await pdfDoc.embedFont('Helvetica');
  const pad = mmToPt(1);
  const pageCount = pdfDoc.getPageCount();
  let stamped = 0, skipped = 0;

  for (const a of anchors) {
    if (a.page < 1 || a.page > pageCount) { skipped++; continue; }
    const page = pdfDoc.getPage(a.page - 1);
    const r = rectFromJsPdf(a, page.getHeight());
    page.drawImage(png, {
      x: r.x + pad, y: r.y + pad,
      width: Math.max(0, r.width - 2 * pad), height: Math.max(0, r.height - 2 * pad)
    });
    // Mention légale sous le bloc signature (pas sous les paraphes).
    if (a.kind === 'signature' && mentionLines.length) {
      const size = 7;
      let ty = r.y - mmToPt(2); // juste sous la boîte (origine bas-gauche)
      for (const line of mentionLines) {
        page.drawText(line, { x: r.x, y: ty, size, font, color: rgb(0.42, 0.42, 0.42) });
        ty -= size + 2;
      }
    }
    stamped++;
  }
  return { stamped, skipped, usedFallback };
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd relay && npx vitest run test/stamp.test.js`
Expected : PASS (4 tests). Si `embedPng`/`embedFont` échoue dans workerd, c'est un signal bloquant → remonter (BLOCKED) avant de continuer.

- [ ] **Step 5 : Lancer toute la suite (non-régression modules purs)**

Run: `cd relay && npm test`
Expected : 46 (relais) + 4 + 4 + 5 + 4 + 4 = **67 tests** PASS.

- [ ] **Step 6 : Commit**

```bash
cd relay && git add public/sign/stamp.js test/stamp.test.js && git commit -m "feat(sign): stamp.js — tamponnage signature/paraphes/mention via pdf-lib (doc en param, testé)"
```

---

## Task 7 : `renderSignPage` + réécriture de `GET /s/:id` (serveur)

**Files:**
- Create: `relay/src/sign-page.js`
- Modify: `relay/src/index.js:77-91` (route `GET /s/:sessionId`) + import
- Test: `relay/test/sign-route.test.js`

⚠️ **Contrat gelé à préserver** : `routes.test.js` extrait le token via la regex `window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"`. La nouvelle page DOIT garder cette ligne **à l'identique** (assignation, guillemets doubles) → **zéro régression** sur les tests existants. On ajoute seulement `window.__SIGN__` (données riches : `sigId`, `role`, `side`, `bailRef`, `rank`, `total`) en échappant `<` contre l'injection `</script>`. La page sert une coque HTML server-rendue qui référence les assets statiques `/sign.js`, `/sign.css`, `/vendor/*` (servis via `[assets]`). La logique vit entièrement dans `/sign.js` (zéro duplication).

- [ ] **Step 1 : Écrire le test qui échoue** `relay/test/sign-route.test.js`

```js
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const APP_KEY = 'test-app-key';

async function createSession(signers, bailRef = 'BAIL-2026-001') {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2]); // %PDF-1.4
  const form = new FormData();
  form.set('pdf', new File([pdf], 'bail.pdf', { type: 'application/pdf' }));
  form.set('meta', JSON.stringify({ bailRef, signers }));
  const res = await SELF.fetch('https://relay.test/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${APP_KEY}` }, body: form
  });
  return (await res.json()).sessionId;
}

describe('GET /s/:id — injection riche', () => {
  it('injecte window.__SIGN__ avec sigId/role/rank du signataire courant', async () => {
    const sessionId = await createSession([
      { role: 'bailleur', email: 'b@x.fr', ordre: 0 },
      { role: 'locataire', email: 'l@x.fr', ordre: 1 }
    ]);
    const html = await (await SELF.fetch(`https://relay.test/s/${sessionId}`)).text();
    // contrat gelé conservé :
    expect(html).toMatch(/window\.__SIGN_TOKEN__\s*=\s*"[^"]+"/);
    expect(html).toMatch(/window\.__SESSION_ID__\s*=\s*"[^"]+"/);
    // injection riche :
    const m = html.match(/window\.__SIGN__\s*=\s*(\{.*?\});/s);
    expect(m).toBeTruthy();
    const data = JSON.parse(m[1]);
    expect(data.sigId).toBe('bailleur-0'); // currentIndex=0 → bailleur
    expect(data.role).toBe('bailleur');
    expect(data.side).toBe('bailleur');
    expect(data.rank).toBe(1);
    expect(data.total).toBe(2);
    expect(data.bailRef).toBe('BAIL-2026-001');
    // référence les assets statiques :
    expect(html).toContain('/sign.js');
    expect(html).toContain('/vendor/pdf-lib.min.js');
  });

  it('échappe </script> dans bailRef (anti-injection)', async () => {
    const sessionId = await createSession(
      [{ role: 'locataire', email: 'l@x.fr', ordre: 0 }],
      'A</script><script>alert(1)</script>'
    );
    const html = await (await SELF.fetch(`https://relay.test/s/${sessionId}`)).text();
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });

  it('404 sur session inconnue, 410 sur session complétée', async () => {
    const r404 = await SELF.fetch('https://relay.test/s/inconnu');
    expect(r404.status).toBe(404);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd relay && npx vitest run test/sign-route.test.js`
Expected : FAIL (`window.__SIGN__` absent / `bailRef` non échappé).

- [ ] **Step 3 : Implémenter** `relay/src/sign-page.js`

```js
import { computeSigId, sideOf } from '../public/sign/sigid.js';

// Sérialise pour insertion dans <script> : échappe < pour neutraliser </script>.
function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

export function renderSignPage({ session, signToken }) {
  const idx = session.currentIndex;
  const signer = session.signers[idx];
  const data = {
    sigId: computeSigId(session.signers, idx),
    role: signer.role,
    side: sideOf(signer.role),
    bailRef: session.bailRef || '',
    rank: idx + 1,
    total: session.signers.length
  };
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Signature du bail</title>
<link rel="stylesheet" href="/sign.css">
</head>
<body>
<main id="app" aria-live="polite"><p id="boot">Chargement…</p></main>
<script>
window.__SIGN_TOKEN__ = ${jsonForScript(signToken)};
window.__SESSION_ID__ = ${jsonForScript(session.sessionId)};
window.__SIGN__ = ${jsonForScript(data)};
</script>
<script src="/vendor/pdf-lib.min.js"></script>
<script type="module" src="/sign.js"></script>
</body>
</html>`;
}

export function renderErrorPage(message, title = 'Signature du bail') {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="/sign.css"></head>
<body><main id="app"><div class="state-card"><h1>${message}</h1></div></main></body>
</html>`;
}
```

- [ ] **Step 4 : Brancher dans `src/index.js`**

Ajouter l'import en tête (après les imports existants) :

```js
import { renderSignPage, renderErrorPage } from './sign-page.js';
```

Remplacer le corps de la route `GET /s/:sessionId` (lignes 77-91) par :

```js
app.get('/s/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = await loadSession(c.env, sessionId);
  if (!session) return c.html(renderErrorPage('Lien invalide ou expiré.'), 404);
  if (session.status === 'completed') return c.html(renderErrorPage('Ce document est déjà signé.'), 410);
  const signToken = await mintSignToken(c.env, sessionId, session.currentIndex);
  return c.html(renderSignPage({ session, signToken }));
});
```

- [ ] **Step 5 : Lancer les tests de routes (zéro régression) + le nouveau**

Run: `cd relay && npx vitest run test/routes.test.js test/sign-route.test.js`
Expected : PASS (toutes les assertions `routes.test.js` existantes + 3 nouvelles). Si `routes.test.js` casse, c'est que la ligne `window.__SIGN_TOKEN__ = "…"` n'a pas le bon format → corriger `jsonForScript`/l'ordre.

- [ ] **Step 6 : Suite complète**

Run: `cd relay && npm test`
Expected : 67 + 3 = **70 tests** PASS.

- [ ] **Step 7 : Commit**

```bash
cd relay && git add src/sign-page.js src/index.js test/sign-route.test.js && git commit -m "feat(sign): GET /s/:id sert la coque sign.html + injection riche (sigId/role/rank), contrat token gelé préservé"
```

---

> **Note sur les Tasks 8-11 (navigateur)** : ces modules touchent le DOM/canvas/PDF.js et **ne sont pas testables dans le pool workers**. Ils sont **vérifiés manuellement** via `wrangler dev` + le harnais de dev `public/sign.html` (qui injecte de fausses données `window.__SIGN__` et exerce chaque fonction sans relais). La logique métier testable (coords/stamp/manifest/proof/sigid) est déjà couverte par les Tasks 2-6.

## Task 8 : `pad.js` — pad de signature manuscrite (navigateur, vérif. manuelle)

**Files:**
- Create: `relay/public/sign/pad.js`
- Modify: `relay/public/sign.html` (harnais dev : un canvas + bouton effacer)

Port de `initPad` (index.html:17491-17505) en module ES. Le canvas transparent → `toDataURL('image/png')` donne des traits sur fond transparent (idéal pour tamponner sur le PDF blanc). Gère souris + tactile (`passive:false` pour bloquer le scroll pendant le tracé). Expose `isEmpty()` (pour exiger une signature), `clear()`, `toDataURL()`.

- [ ] **Step 1 : Implémenter** `relay/public/sign/pad.js`

```js
// Signature manuscrite (canvas). Navigateur uniquement (DOM). Non testé unitairement.
// Port de initPad (index.html:17491-17505).
export function initPad(canvas, { clearBtn } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a8c';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  let drawing = false;
  let dirty = false;

  function xy(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
  }
  function start(e) { drawing = true; dirty = true; const p = xy(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { if (!drawing) return; const p = xy(e); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function end() { drawing = false; ctx.beginPath(); }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
  canvas.addEventListener('touchend', end);

  function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }
  if (clearBtn) clearBtn.addEventListener('click', clear);

  return {
    isEmpty: () => !dirty,
    clear,
    toDataURL: () => canvas.toDataURL('image/png')
  };
}
```

- [ ] **Step 2 : Harnais dev dans `public/sign.html`** — remplacer le `<main>` par :

```html
  <main id="app" aria-live="polite">
    <h1>Harnais dev — pad</h1>
    <canvas id="pad" width="500" height="160" style="border:1px solid #ccc;touch-action:none"></canvas>
    <div><button id="clr">Effacer</button> <button id="dump">Voir dataURL</button></div>
    <img id="preview" alt="" style="border:1px solid #eee;max-width:250px">
  </main>
  <script type="module">
    import { initPad } from '/sign/pad.js';
    const pad = initPad(document.getElementById('pad'), { clearBtn: document.getElementById('clr') });
    document.getElementById('dump').onclick = () => {
      document.getElementById('preview').src = pad.isEmpty() ? '' : pad.toDataURL();
    };
  </script>
```

- [ ] **Step 3 : Vérification manuelle**

Run: `cd relay && npx wrangler dev` (puis ouvrir `http://localhost:8787/sign.html` dans un **vrai navigateur**).
Vérifier : tracé à la souris ET au doigt (DevTools → mode tactile) ; le bouton « Effacer » vide ; « Voir dataURL » affiche l'aperçu PNG ; `isEmpty()` est vrai avant tout tracé.

- [ ] **Step 4 : Commit**

```bash
cd relay && git add public/sign/pad.js public/sign.html && git commit -m "feat(sign): pad.js — pad signature manuscrite (port initPad, souris+tactile)"
```

---

## Task 9 : `viewer.js` — rendu lecture du PDF (PDF.js, navigateur, vérif. manuelle)

**Files:**
- Create: `relay/public/sign/viewer.js`
- Modify: `relay/public/sign.html` (harnais : génère un PDF pdf-lib en mémoire et l'affiche)

⚠️ **Gotcha critique** : `pdfjsLib.getDocument({data})` **détache** (transfère) le buffer passé. Or `sign.js` a besoin des octets originaux **intacts** pour tamponner ensuite (pdf-lib). → toujours passer une **copie** des octets à `renderPdf`, jamais le buffer original. Documenté ici et appliqué en Task 10.

- [ ] **Step 1 : Implémenter** `relay/public/sign/viewer.js`

```js
// Rendu lecture du PDF (PDF.js). Navigateur uniquement. Non testé unitairement.
let pdfjsLib;
async function ensureLib() {
  if (!pdfjsLib) {
    pdfjsLib = await import('/vendor/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  }
  return pdfjsLib;
}

// bytes : Uint8Array (DOIT être une copie — PDF.js détache le buffer). Rend toutes les pages.
export async function renderPdf(bytes, container, { scale = 1.3 } = {}) {
  const lib = await ensureLib();
  const pdf = await lib.getDocument({ data: bytes }).promise;
  container.innerHTML = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.className = 'pdf-page';
    container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  return pdf.numPages;
}
```

- [ ] **Step 2 : Harnais dev** — remplacer le `<script type="module">` de `public/sign.html` par :

```html
  <main id="app">
    <h1>Harnais dev — viewer</h1>
    <button id="gen">Générer + afficher un PDF 2 pages</button>
    <div id="pdf-pages"></div>
  </main>
  <script src="/vendor/pdf-lib.min.js"></script>
  <script type="module">
    import { renderPdf } from '/sign/viewer.js';
    document.getElementById('gen').onclick = async () => {
      const doc = await PDFLib.PDFDocument.create();
      const f = await doc.embedFont('Helvetica');
      for (const t of ['Page 1 — bail', 'Page 2 — bail']) {
        const p = doc.addPage([595.28, 841.89]);
        p.drawText(t, { x: 60, y: 760, size: 24, font: f });
      }
      const bytes = await doc.save(); // Uint8Array
      const n = await renderPdf(bytes.slice(), document.getElementById('pdf-pages'));
      console.log('pages rendues', n);
    };
  </script>
```

- [ ] **Step 3 : Vérification manuelle**

Run: `cd relay && npx wrangler dev` (ouvrir `http://localhost:8787/sign.html`).
Vérifier : le clic génère et affiche **2 canvases** lisibles (« Page 1 — bail », « Page 2 — bail ») ; aucune erreur console (worker PDF.js chargé depuis `/vendor/pdf.worker.min.mjs`).

- [ ] **Step 4 : Commit**

```bash
cd relay && git add public/sign/viewer.js public/sign.html && git commit -m "feat(sign): viewer.js — rendu lecture PDF.js (copie des octets, worker vendoré)"
```

---

## Task 10 : `sign.js` — orchestrateur du flux (navigateur, vérif. manuelle)

**Files:**
- Create: `relay/public/sign.js`

Colle tout : lit `window.__SIGN__`/`__SIGN_TOKEN__`/`__SESSION_ID__`, construit les étapes (consentement → lecture → signature → confirmation → succès/erreur), récupère le PDF original, le rend (copie des octets), capture la signature, **tamponne** via `stampSignature` (pdf-lib global), renvoie les octets. Le nom saisi à l'étape consentement = item de preuve « identité affirmée ».

- [ ] **Step 1 : Implémenter** `relay/public/sign.js`

```js
import { initPad } from '/sign/pad.js';
import { renderPdf } from '/sign/viewer.js';
import { stampSignature } from '/sign/stamp.js';
import { buildMentionLines } from '/sign/proof.js';

const S = window.__SIGN__ || {};
const TOKEN = window.__SIGN_TOKEN__;
const SID = window.__SESSION_ID__;
const app = document.getElementById('app');

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
function show(id) { for (const s of app.querySelectorAll('.step')) s.hidden = s.id !== id; window.scrollTo(0, 0); }
function fail(msg) { app.innerHTML = ''; app.appendChild(h(`<div class="state-card"><h1>${msg}</h1></div>`)); }

let master;       // Uint8Array intacts (jamais passés à PDF.js)
let pad;

function buildUI() {
  app.innerHTML = '';
  app.appendChild(h(`
    <div>
      <header class="sign-head"><strong>Signature du bail ${S.bailRef ? '· ' + S.bailRef : ''}</strong>
        <span class="rank">Signataire ${S.rank}/${S.total}</span></header>

      <section id="step-consent" class="step">
        <h1>Avant de signer</h1>
        <label>Vos nom et prénom<br><input id="name" type="text" autocomplete="name" placeholder="Jean Dupont"></label>
        <label class="chk"><input id="c1" type="checkbox"> Je reconnais signer ce bail (${S.role}).</label>
        <label class="chk"><input id="c2" type="checkbox"> Je consens à signer par procédé électronique.</label>
        <button id="toRead" class="primary" disabled>Lire le document</button>
      </section>

      <section id="step-read" class="step" hidden>
        <h1>Lisez le document</h1>
        <div id="pdf-pages" class="pdf-scroll">Chargement du document…</div>
        <button id="toSign" class="primary">J'ai lu, passer à la signature</button>
      </section>

      <section id="step-sign" class="step" hidden>
        <h1>Signez</h1>
        <div class="pad-wrap"><canvas id="pad" width="600" height="200"></canvas></div>
        <div class="pad-actions"><button id="clr" class="ghost">Effacer</button></div>
        <button id="toConfirm" class="primary">Valider ma signature</button>
      </section>

      <section id="step-confirm" class="step" hidden>
        <h1>Confirmer l'envoi</h1>
        <p>Votre signature va être apposée sur le document, qui sera renvoyé automatiquement.</p>
        <button id="submit" class="primary">Signer et envoyer</button>
        <p id="busy" hidden>Traitement…</p>
      </section>

      <section id="step-done" class="step" hidden>
        <div class="state-card"><h1>✓ Document signé</h1><p>Il a été renvoyé automatiquement. Vous pouvez fermer cette page.</p></div>
      </section>
    </div>`));

  const name = app.querySelector('#name'), c1 = app.querySelector('#c1'), c2 = app.querySelector('#c2');
  const toRead = app.querySelector('#toRead');
  const gate = () => { toRead.disabled = !(name.value.trim() && c1.checked && c2.checked); };
  [name, c1, c2].forEach((el) => el.addEventListener('input', gate));

  toRead.onclick = async () => { show('step-read'); await loadAndRender(); };
  app.querySelector('#toSign').onclick = () => { show('step-sign'); ensurePad(); };
  app.querySelector('#toConfirm').onclick = () => {
    if (pad.isEmpty()) { alert('Veuillez signer avant de continuer.'); return; }
    show('step-confirm');
  };
  app.querySelector('#submit').onclick = () => doSubmit(name.value.trim());
}

async function loadAndRender() {
  if (master) return;
  const r = await fetch(`/api/sessions/${SID}/pdf`, { headers: { 'X-Sign-Token': TOKEN } });
  if (r.status === 403) return fail('Ce n\'est pas (ou plus) votre tour de signer.');
  if (r.status === 410) return fail('Ce document est déjà signé.');
  if (!r.ok) return fail('Impossible de charger le document. Réessayez plus tard.');
  master = new Uint8Array(await r.arrayBuffer());
  await renderPdf(master.slice(), app.querySelector('#pdf-pages')); // copie : PDF.js détache
}

function ensurePad() {
  if (!pad) pad = initPad(app.querySelector('#pad'), { clearBtn: app.querySelector('#clr') });
}

async function doSubmit(signerName) {
  const busy = app.querySelector('#busy'); const btn = app.querySelector('#submit');
  busy.hidden = false; btn.disabled = true;
  try {
    const doc = await PDFLib.PDFDocument.load(master);
    const mentionLines = buildMentionLines({ signerName, role: S.role, dateISO: new Date().toISOString() });
    await stampSignature(doc, { sigId: S.sigId, side: S.side, pngDataUrl: pad.toDataURL(), mentionLines }, { rgb: PDFLib.rgb });
    const signed = await doc.save();
    const r = await fetch(`/api/sessions/${SID}/signed`, {
      method: 'POST', headers: { 'X-Sign-Token': TOKEN, 'content-type': 'application/pdf' }, body: signed
    });
    if (r.status === 403) return fail('Ce n\'est pas (ou plus) votre tour de signer.');
    if (r.status === 410) return fail('Ce document est déjà signé.');
    if (!r.ok) throw new Error('http ' + r.status);
    show('step-done');
  } catch (e) {
    console.error(e);
    busy.hidden = true; btn.disabled = false;
    alert('Échec de l\'envoi. Vérifiez votre connexion et réessayez.');
  }
}

if (!TOKEN || !SID) fail('Lien invalide.');
else { buildUI(); show('step-consent'); }
```

- [ ] **Step 2 : Vérifier la syntaxe**

Run: `cd relay && node --check public/sign.js`
Expected : aucune sortie (syntaxe valide). *(Le comportement complet est vérifié en Task 12 contre un vrai relais ; ici on ne valide que la syntaxe — `node --check` ne suit pas les imports `/sign/*`.)*

- [ ] **Step 3 : Commit**

```bash
cd relay && git add public/sign.js && git commit -m "feat(sign): sign.js — orchestrateur flux consentement→lecture→signature→tamponnage→envoi"
```

---

## Task 11 : `sign.css` — responsive + états (navigateur, vérif. manuelle)

**Files:**
- Modify: `relay/public/sign.css` (remplace le placeholder de Task 1)

Applique la variante validée en Task 0. Mobile-first ; cibles tactiles ≥44px ; `touch-action:none` sur le pad (sinon le scroll vole le tracé) ; pages PDF en largeur 100% ; carte d'état centrée pour succès/erreurs.

- [ ] **Step 1 : Écrire** `relay/public/sign.css`

```css
:root { --pad: 16px; --accent: #1a1a8c; --ok: #1c7c3c; --err: #b00020; --line: #d9d9e3; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; background: #f5f5f8; }
#app { max-width: 820px; margin: 0 auto; padding: var(--pad); }
.sign-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 8px 0 12px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.sign-head .rank { color: #555; font-size: 14px; white-space: nowrap; }
h1 { font-size: 1.3rem; margin: 0 0 12px; }

label { display: block; margin: 12px 0; }
label.chk { display: flex; gap: 10px; align-items: flex-start; }
input[type=text] { width: 100%; padding: 12px; font-size: 16px; border: 1px solid var(--line); border-radius: 8px; }
input[type=checkbox] { width: 22px; height: 22px; margin-top: 2px; flex: none; }

button { min-height: 44px; min-width: 44px; padding: 12px 18px; font-size: 16px; border-radius: 8px; border: 1px solid var(--line); background: #fff; cursor: pointer; }
button.primary { background: var(--accent); color: #fff; border-color: var(--accent); width: 100%; margin-top: 16px; }
button.primary:disabled { opacity: .5; cursor: not-allowed; }
button.ghost { background: #fff; }

.pdf-scroll { max-height: 60vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: 8px; background: #fff; }
.pdf-page { display: block; width: 100%; height: auto; margin: 0 auto 10px; box-shadow: 0 1px 4px rgba(0,0,0,.12); }

.pad-wrap { border: 2px dashed var(--accent); border-radius: 10px; background: #fff; }
#pad { display: block; width: 100%; height: auto; touch-action: none; }
.pad-actions { margin-top: 8px; }

.state-card { text-align: center; padding: 40px 16px; }
.state-card h1 { font-size: 1.4rem; }

@media (min-width: 768px) { #pad { max-width: 600px; margin: 0 auto; } }
```

- [ ] **Step 2 : Vérification manuelle 3 formats**

Run: `cd relay && npx wrangler dev` puis, dans un vrai navigateur, ouvrir une page `/s/:id` réelle (créée à l'étape Task 12) ou stuber `window.__SIGN__` dans `sign.html`.
Vérifier en **PC / Tablette / Téléphone** (DevTools responsive) : étapes lisibles, boutons ≥44px, pad pleine largeur sans voler le scroll, pages PDF en largeur 100%, carte d'état centrée. Conforme à la variante validée Task 0.

- [ ] **Step 3 : Commit**

```bash
cd relay && git add public/sign.css && git commit -m "feat(sign): sign.css — responsive mobile-first + états (variante validée Task 0)"
```

---

## Task 12 : Build + smoke end-to-end contre `wrangler dev` (mono + 2 signataires)

**Files:**
- Create: `relay/scripts/make-sample-bail.mjs` (génère un bail factice multi-pages AVEC manifeste)
- Create: `relay/.dev.vars` (depuis `.dev.vars.example`, gitignoré — secrets de dev)

Valide le flux complet réel : création de session → page de signature → tamponnage → renvoi automatique → récupération du PDF signé par le propriétaire, et le **chaînage 2 signataires** (« signature par-dessus » : le 2e signataire récupère le PDF déjà tamponné par le 1er).

- [ ] **Step 1 : Générateur de bail factice** `relay/scripts/make-sample-bail.mjs`

```js
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { embedInDoc } from '../public/sign/manifest.js';

const N = 3;
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= N; i++) {
  const p = doc.addPage([595.28, 841.89]);
  p.drawText(`Bail de location — page ${i}/${N}`, { x: 50, y: 780, size: 18, font });
}
const anchors = [];
for (let p = 1; p <= N; p++) {
  anchors.push({ sigId: 'bailleur-0', kind: 'paraphe', page: p, x: 15, y: 279.5, w: 70, h: 14 });
  anchors.push({ sigId: 'loc-0', kind: 'paraphe', page: p, x: 125, y: 279.5, w: 70, h: 14 });
}
anchors.push({ sigId: 'bailleur-0', kind: 'signature', page: N, x: 15, y: 210, w: 90, h: 30, luApprouve: true });
anchors.push({ sigId: 'loc-0', kind: 'signature', page: N, x: 110, y: 210, w: 90, h: 30, luApprouve: true });
embedInDoc(doc, { v: 1, totalPages: N, anchors });
await writeFile(new URL('../sample-bail.pdf', import.meta.url), await doc.save());
console.log('écrit sample-bail.pdf (', N, 'pages, manifeste embarqué )');
```

Run: `cd relay && node scripts/make-sample-bail.mjs`
Expected : `écrit sample-bail.pdf ( 3 pages, manifeste embarqué )`.

- [ ] **Step 2 : Secrets de dev + démarrage**

```bash
cd relay && cp -n .dev.vars.example .dev.vars   # contient SIGNING_SECRET=… APP_KEY=dev-app-key
npx wrangler dev
```
(miniflare provisionne KV + R2 en local ; laisser tourner dans un terminal.)

- [ ] **Step 3 : Créer une session 2 signataires (bailleur puis locataire)**

```bash
curl -s -X POST http://localhost:8787/sessions \
  -H "Authorization: Bearer dev-app-key" \
  -F "pdf=@relay/sample-bail.pdf;type=application/pdf" \
  -F 'meta={"bailRef":"BAIL-SMOKE-001","signers":[{"role":"bailleur","email":"b@x.fr","ordre":0},{"role":"locataire","email":"l@x.fr","ordre":1}]}'
```
Expected : JSON `{ sessionId, signUrl, ownerToken }` (noter les 3).

- [ ] **Step 4 : Signer #1 (bailleur) dans un vrai navigateur**

Ouvrir `signUrl`. Vérifier l'ordre : consentement (saisir nom + 2 cases) → lecture (3 pages affichées) → signature (tracer) → confirmer → « ✓ Document signé ».

- [ ] **Step 5 : Signer #2 (locataire)**

Rouvrir la **même** `signUrl` (le relais a avancé `currentIndex` → mint un token locataire, `sigId=loc-0`). Refaire le flux. Vérifier le succès.

- [ ] **Step 6 : Récupérer le PDF final signé (propriétaire) + vérifier visuellement**

```bash
curl -s http://localhost:8787/api/sessions/<sessionId>/result -H "X-Owner-Token: <ownerToken>" -o signed.pdf
```
Ouvrir `signed.pdf` et **vérifier** : (a) les 3 pages d'origine **intactes** (immutabilité — aucun re-rendu) ; (b) paraphe bailleur (col. gauche) ET locataire (col. droite) sur chaque page ; (c) les **deux** signatures finales en dernière page (chaînage « par-dessus » OK) ; (d) la mention « Signé électroniquement … Lu et approuvé … » sous chaque signature.

- [ ] **Step 7 : Smoke mono-signataire + repli sans manifeste**

Refaire Steps 3-6 avec **un seul** signataire `locataire`. Puis régénérer un `sample-bail.pdf` **sans** `embedInDoc` (commenter la ligne) et vérifier que le repli déterministe (`fallbackAnchors`) place quand même paraphes + signature (positions par défaut). Restaurer ensuite le générateur.

- [ ] **Step 8 : Suite de tests complète (non-régression finale)**

Run: `cd relay && npm test`
Expected : **70 tests** PASS.

- [ ] **Step 9 : Commit**

```bash
cd relay && git add scripts/make-sample-bail.mjs && git commit -m "test(sign): générateur de bail factice + smoke end-to-end (mono + 2 signataires, chaînage)"
```

---

## Task 13 : Audit code-reviewer OBLIGATOIRE + corrections + commit final

**Files:** (revue de l'ensemble des fichiers `sign*` + `src/sign-page.js` + `src/index.js`)

⚠️ **Règle gravée non négociable** : aucun livrable touchant le PDF de bail / la preuve juridique n'est annoncé « prêt à tester » sans audit par un agent `superpowers:code-reviewer`. Mes audits propres (Vitest + grep) ne suffisent **jamais** ici (un audit précédent avait trouvé une violation d'immutabilité que j'avais loupée).

- [ ] **Step 1 : Dispatcher l'agent `superpowers:code-reviewer`** sur l'implémentation `sign.html` complète, avec ce périmètre explicite :
  - **Immutabilité juridique** : `stamp.js` n'ajoute QUE du contenu (images/texte) sur les octets originaux, ne re-rend jamais, ne supprime/réécrit aucune page. Le document signé est byte-fidèle (hors ajouts de signature) au document présenté.
  - **Sécurité** : token jamais dans l'URL ni loggé ; injection `renderSignPage` correctement échappée (`</script>`, attributs) ; `content-type`/taille validés au write-back (déjà côté relais) ; pas de fuite de secret dans le bundle servi.
  - **Dossier de preuve (spec §5)** : 8 items couverts ? Vérifier que mention embarquée (identité affirmée via nom saisi, « Lu et approuvé », consentement électronique) + capture serveur (ip/UA/horodatage/hash SHA-256) + token (contrôle email/jti/audit) couvrent l'ensemble ; signaler tout trou.
  - **Robustesse pdf-lib/PDF.js** : gotcha du buffer détaché respecté (copie pour PDF.js) ; `embedPng`/`embedFont` ne lèvent pas ; ancres hors-page ignorées proprement ; repli sans manifeste fonctionnel.
  - **RGPD** : sous-traitant, pas de PII superflue stockée (emailHash, pas l'email en clair).
  - **Qualité** : modules purs réellement sans dépendance pdf-lib/`window` ; cohérence des conventions `sigId` entre `sigid.js`, le manifeste et `renderSignPage`.

- [ ] **Step 2 : Corriger toutes les anomalies** remontées (bloquantes ET importantes). Re-dispatcher l'agent jusqu'à approbation.

- [ ] **Step 3 : Vérifier la suite après corrections**

Run: `cd relay && npm test`
Expected : tous les tests PASS (≥ 70).

- [ ] **Step 4 : Mettre à jour le statut backlog (règle temps réel)** dans `C:\Users\Did_K\Desktop\Immo\BACKLOG.md` (composant 2/3 livré + version + commit) et le journal de `docs/subjects/BAIL-SIGNATURE-DISTANCE.md`.

- [ ] **Step 5 : Commit final**

```bash
cd relay && git add -A && git commit -m "feat(sign): sign.html composant 2/3 — audit code-reviewer OK, prêt à tester"
```

---

## Self-Review (auteur du plan)

- **Couverture spec** : §3 routes/flux → Tasks 7, 10, 12 ; §4 wizard (porté) → Tasks 8-11 (delta : tamponnage B au lieu de re-rendu A, justifié §Décisions) ; §5 dossier de preuve → Task 5 (mention) + relais existant (ip/UA/hash) + Task 13 (vérif. couverture) ; §6 sécurité/RGPD → Tasks 7, 13. ✅
- **Placeholders** : chaque étape de code contient le code complet ; les seuls « à valider » sont la variante mockup (Task 0, gate utilisateur) et la couverture preuve (Task 13, audit) — délibérés, pas des trous. ✅
- **Cohérence des types** : `sigId` (`sigid.js`) consommé par `renderSignPage`, le manifeste (`manifest.js`/`coords.js`), `stamp.js`, `sign.js` — même format `loc-N`/`bailleur-N`. `anchors[].{sigId,kind,page,x,y,w,h}` identique partout (mm/jsPDF). `stampSignature(doc, opts, {rgb})` signature unique. ✅
- **Dépendance composant 3** : le delta #2 (manifeste écrit par `genPDFNative` en jsPDF) est explicitement signalé comme exigence ajoutée au composant 3 ; le repli défensif évite tout blocage entre-temps. ✅

---

## Execution Handoff

Plan complet et enregistré dans `docs/superpowers/plans/2026-06-02-bail-sign-html-wizard.md`. Deux options d'exécution :

1. **Subagent-Driven (recommandé)** — je dispatch un subagent frais par tâche, revue spec puis qualité entre chaque, itération rapide. ⚠️ Task 0 (gate mockup) et Tasks 8-12 (navigateur) exigent **ta** validation/vérification visuelle — je m'arrêterai à ces points.
2. **Exécution inline** — j'exécute les tâches dans cette session avec checkpoints.

**Quelle approche ?** (Et rappel : il me faudra la connexion Drive seulement pour le composant 3 ; le composant 2 se teste entièrement en local via `wrangler dev`.)
