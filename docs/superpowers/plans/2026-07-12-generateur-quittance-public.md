# Générateur de quittance de loyer public — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exposer le moteur de quittance de l'app comme outil public gratuit (aimant SEO), en extrayant un renderer pur réutilisé par l'app ET la page publique.

**Architecture:** Séparer la collecte de données dépendante de `DB` (reste dans `index.html`) du **rendu HTML pur** extrait dans `js/core/doc-quittance.js`. L'app construit un objet `input` depuis `DB` puis appelle `buildQuittanceDoc(input)`. La page publique construit le même `input` depuis un formulaire. Un seul moteur → zéro divergence légale.

**Tech Stack:** Vanilla JS (ES module), Vitest, html2canvas + jsPDF vendorés (`js/vendor/`), HTML statique.

> ⚠️ **Contrainte repo (lire avant de commencer) :** ce clone est en retard sur `origin/main`. **Créer un worktree depuis `origin/main`** et y implémenter. Les extraits de `_buildQuittanceHtml` ci-dessous viennent du clone local (l.24666+) et sont **à re-vérifier sur la prod** avant extraction (le nom/la signature peuvent différer). Le commit d'`index.html` passe par le protocole file d'attente `.index-queue/QUEUE.md` — **ne jamais pousser `index.html` sur `main` directement**.

---

## Contrat `input` (référence pour toutes les tâches)

Objet plat, auto-suffisant, **aucune** dépendance `DB`/DOM :

```js
// input attendu par buildQuittanceDoc()
{
  bailleur:  { nom, type?, siege?, siren?, rcs?, gerant? },   // ent.*
  locataires: [ { nom, civilite?, ddn?, lieuNaiss? } ],       // au moins 1
  bien:      { adresse },                                     // adrBien
  periode:   { mois, annee },                                 // ex mois="avril", annee=2026
  dateEmission,                                               // ISO ou Date
  datePaiement,                                               // ISO ou Date (déjà résolue par l'appelant)
  montantDu,     // number — total dû (prorata déjà appliqué par l'appelant app ; = HC+charges côté public)
  montantRecu,   // number — total encaissé
  prorata?: { jours, joursMois }   // optionnel, pour l'affichage "X jours sur Y"
}
```

Le module dérive `status` : `complet` (`montantRecu >= montantDu-0.01`), `partiel` (`0 < montantRecu < montantDu`), `non-paye` (`montantRecu <= 0`).

---

## Task 1: Module pur `doc-quittance.js` — squelette + helpers purs

**Files:**
- Create: `js/core/doc-quittance.js`
- Test: `__tests__/helpers/doc-quittance.test.js`

- [ ] **Step 1: Écrire le test qui échoue**

```js
// __tests__/helpers/doc-quittance.test.js
import { describe, it, expect } from 'vitest';
import { buildQuittanceDoc } from '../../js/core/doc-quittance.js';

const base = {
  bailleur: { nom: 'SCI DUPONT', type: 'SCI', siege: '1 rue A 67000 STRASBOURG', gerant: 'Jean Dupont' },
  locataires: [{ nom: 'Marie Martin', civilite: 'Mme' }],
  bien: { adresse: '2 rue B 67000 STRASBOURG' },
  periode: { mois: 'avril', annee: 2026 },
  dateEmission: '2026-05-02',
  datePaiement: '2026-04-03',
  montantDu: 650,
  montantRecu: 650,
};

describe('buildQuittanceDoc', () => {
  it('retourne html + filename', () => {
    const out = buildQuittanceDoc(base);
    expect(out).toHaveProperty('html');
    expect(out).toHaveProperty('filename');
    expect(typeof out.html).toBe('string');
  });
  it('porte la mention loi du 6 juillet 1989', () => {
    expect(buildQuittanceDoc(base).html).toMatch(/6 juillet 1989/);
  });
  it('cas complet : intitulé QUITTANCE', () => {
    expect(buildQuittanceDoc(base).html).toMatch(/QUITTANCE/i);
  });
});
```

- [ ] **Step 2: Lancer le test → échec attendu**

Run: `npx vitest run __tests__/helpers/doc-quittance.test.js`
Expected: FAIL — `buildQuittanceDoc is not a function` / module introuvable.

- [ ] **Step 3: Implémentation minimale des helpers purs + squelette**

Porter dans `doc-quittance.js` **les helpers purs uniquement** (pas de `DB`) — `escHtml`, `numToWords`, format date `fd`, constante `MOIS_FR`. Les copier depuis `js/core/utils.js` s'ils y sont déjà exportés (les **importer** plutôt que recopier — règle DRY) ; sinon les extraire de `index.html` vers `utils.js` et les importer.

```js
// js/core/doc-quittance.js
import { escHtml, numToWords, fd, MOIS_FR } from './utils.js'; // ré-utilise l'existant

const CSS = `@page{size:A4;margin:1.8cm 2cm}
body{font-family:'Times New Roman',serif;font-size:11.5pt;color:#111;line-height:1.45;max-width:700px;margin:0 auto}
h1{font-size:16pt;text-align:center;font-weight:bold;margin:0 0 14px;text-decoration:underline}
h2{font-size:11.5pt;font-weight:bold;margin:12px 0 4px;text-decoration:underline}
.mention{font-size:9.5pt;color:#444;margin-top:12px;font-style:italic;border-top:1px solid #ccc;padding-top:8px}`;

function statusOf(du, recu){
  if (recu >= du - 0.01) return 'complet';
  if (recu > 0) return 'partiel';
  return 'non-paye';
}

export function buildQuittanceDoc(input) {
  const i = input || {};
  const du = i.montantDu || 0, recu = i.montantRecu || 0;
  const status = statusOf(du, recu);
  const mIdx = MOIS_FR.indexOf(String(i.periode?.mois||'').toLowerCase());
  const periodeStr = mIdx>=0
    ? `du 01/${String(mIdx+1).padStart(2,'0')}/${i.periode.annee} au ${new Date(i.periode.annee, mIdx+1, 0).toLocaleDateString('fr-FR')}`
    : (i.periode?.mois||'–');
  const titre = status==='partiel' ? 'REÇU DE PAIEMENT PARTIEL' : 'QUITTANCE DE LOYER';
  const locs = (i.locataires||[]).map(l=>`<p>${escHtml((l.civilite?l.civilite+' ':'')+(l.nom||'–'))}, demeurant ${escHtml(i.bien?.adresse||'–')}&nbsp;;</p>`).join('');
  const mention = `<p class="mention">Quittance établie conformément à l'article 21 de la loi n°89-462 du 6 juillet 1989. Elle ne vaut que pour la période et les sommes mentionnées.</p>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<h1>${titre}</h1>
<h2>Bailleur</h2><p>${escHtml(i.bailleur?.nom||'–')}${i.bailleur?.type?', '+escHtml(i.bailleur.type):''}</p>
<h2>Locataire</h2>${locs}
<p>Période : ${periodeStr}</p>
<p>Montant dû : ${escHtml(numToWords(du))} (${du.toFixed(2)} €) — Reçu : ${recu.toFixed(2)} €</p>
${mention}
</body></html>`;
  const filename = `quittance-${i.periode?.mois||''}-${i.periode?.annee||''}.pdf`.replace(/\s+/g,'-').toLowerCase();
  return { html, filename };
}
```

> Note : ce squelette couvre les cas de test. À l'étape refactor (Task 2), enrichir le corps HTML pour atteindre la **parité exacte** avec `_buildQuittanceHtml` (blocs entête RCS/gérant, prorata, aire de signature) — piloté par le test de parité.

- [ ] **Step 4: Lancer le test → succès attendu**

Run: `npx vitest run __tests__/helpers/doc-quittance.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/core/doc-quittance.js __tests__/helpers/doc-quittance.test.js
git commit -m "feat(outils): module pur buildQuittanceDoc extrait (squelette + tests)"
```

---

## Task 2: Cas paiement partiel + charges=0 + parité renderer

**Files:**
- Modify: `js/core/doc-quittance.js`
- Test: `__tests__/helpers/doc-quittance.test.js`

- [ ] **Step 1: Ajouter les tests qui échouent**

```js
it('cas partiel : intitulé REÇU + montant reçu affiché', () => {
  const out = buildQuittanceDoc({ ...base, montantRecu: 300 });
  expect(out.html).toMatch(/REÇU/i);
  expect(out.html).toMatch(/300\.00/);
});
it('cas non payé : statut non-paye ne produit pas QUITTANCE acquittée', () => {
  const out = buildQuittanceDoc({ ...base, montantRecu: 0 });
  expect(out.html).not.toMatch(/REÇU DE PAIEMENT PARTIEL/);
});
it('charges = 0 : pas de crash, montant dû = HC', () => {
  const out = buildQuittanceDoc({ ...base, montantDu: 650, montantRecu: 650 });
  expect(out.html).toMatch(/650\.00/);
});
it('prorata : affiche jours d occupation si fourni', () => {
  const out = buildQuittanceDoc({ ...base, prorata: { jours: 12, joursMois: 30 } });
  expect(out.html).toMatch(/12/);
});
```

- [ ] **Step 2: Lancer → 4 nouveaux échecs (le prorata notamment)**

Run: `npx vitest run __tests__/helpers/doc-quittance.test.js`
Expected: FAIL sur le test prorata (jours non rendus).

- [ ] **Step 3: Enrichir `buildQuittanceDoc`**

Ajouter, avant la construction de `html`, le rendu du prorata :

```js
const proHtml = i.prorata && i.prorata.jours
  ? `<p>Loyer calculé au prorata : ${i.prorata.jours} jour(s) sur ${i.prorata.joursMois}.</p>` : '';
```

et insérer `${proHtml}` juste après la ligne `Période`. Vérifier que le cas `non-paye` n'émet jamais le titre "REÇU DE PAIEMENT PARTIEL" (déjà garanti par `statusOf`).

- [ ] **Step 4: Lancer → tous verts**

Run: `npx vitest run __tests__/helpers/doc-quittance.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add js/core/doc-quittance.js __tests__/helpers/doc-quittance.test.js
git commit -m "feat(outils): cas partiel/non-paye/prorata dans buildQuittanceDoc"
```

---

## Task 3: Refactor `index.html` — `_buildQuittanceHtml` appelle le module

**Files:**
- Modify: `index.html` (fonction `_buildQuittanceHtml`, ~l.24666 sur le clone — **re-localiser sur prod**)
- Test: `__tests__/helpers/doc-quittance-parity.test.js`

- [ ] **Step 1: Écrire le test de parité (échoue tant que le refactor n'est pas fait)**

```js
// __tests__/helpers/doc-quittance-parity.test.js
// Vérifie que, pour un input donné, le module produit le même corps légal que
// la sortie de référence figée (capturée depuis l'app AVANT refactor).
import { describe, it, expect } from 'vitest';
import { buildQuittanceDoc } from '../../js/core/doc-quittance.js';
import ref from './fixtures/quittance-ref.json'; // { input, expectedHtml }

describe('parité app === module', () => {
  it('mentions et montants identiques à la référence', () => {
    const out = buildQuittanceDoc(ref.input);
    // comparaison normalisée (espaces) sur le corps légal
    const norm = s => s.replace(/\s+/g,' ').trim();
    expect(norm(out.html)).toContain(norm(ref.expectedLegalBlock));
  });
});
```

Générer `__tests__/helpers/fixtures/quittance-ref.json` en capturant la sortie de `_buildQuittanceHtml` de la prod pour un jeu d'entrée connu (bailleur SCI + 1 locataire + mois complet), et le bloc légal attendu.

- [ ] **Step 2: Lancer → échec si le module ne couvre pas encore la parité**

Run: `npx vitest run __tests__/helpers/doc-quittance-parity.test.js`
Expected: FAIL (bloc légal absent) — sert de guide pour compléter Task 1/2.

- [ ] **Step 3: Refactorer l'app pour construire `input` puis appeler le module**

Dans `index.html`, remplacer le **corps de rendu HTML** de `_buildQuittanceHtml` par : (a) garder la collecte DB existante (mvsPay, prorata via `window._loyerProrataMois`, résolution `datePay`, `total`), (b) construire l'objet `input` conforme au contrat, (c) `return window.buildQuittanceDoc(input).html;`. Exposer le module via `window.buildQuittanceDoc` (import ES ou balise module selon le bundling de `index.html`). Compléter `buildQuittanceDoc` jusqu'à ce que la parité passe.

- [ ] **Step 4: Lancer parité + suite quittance existante**

Run: `npx vitest run __tests__/ -t quittance`
Expected: PASS (parité + tous les tests quittance historiques inchangés).

- [ ] **Step 5: Commit (index.html → protocole file d'attente, PAS de push main direct)**

```bash
git add index.html __tests__/helpers/doc-quittance-parity.test.js __tests__/helpers/fixtures/quittance-ref.json
git commit -m "refactor(quittance): _buildQuittanceHtml appelle buildQuittanceDoc (parité, DRY)"
# inscrire index.html dans .index-queue/QUEUE.md selon docs/INDEX-COMMIT-PROTOCOL.md
```

---

## Task 4: Helper PDF partagé `pdfFromQuittanceHtml`

**Files:**
- Create: `js/core/doc-pdf.js`
- Test: `__tests__/helpers/doc-pdf.test.js`

- [ ] **Step 1: Test (mock DOM) — la fonction renvoie un Blob**

```js
// __tests__/helpers/doc-pdf.test.js
import { describe, it, expect, vi } from 'vitest';
import { pdfFromQuittanceHtml } from '../../js/core/doc-pdf.js';
describe('pdfFromQuittanceHtml', () => {
  it('produit un Blob PDF (pipeline mocké)', async () => {
    globalThis.__pdfDeps = { // injection de deps pour test
      html2canvas: async () => ({ toDataURL: () => 'data:image/png;base64,AAAA', width:800, height:1100 }),
      jsPDF: function(){ return { addImage(){}, output:(t)=> new Blob(['%PDF'],{type:'application/pdf'}) }; },
    };
    const blob = await pdfFromQuittanceHtml('<h1>QUITTANCE</h1>', globalThis.__pdfDeps);
    expect(blob).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Lancer → échec**

Run: `npx vitest run __tests__/helpers/doc-pdf.test.js`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter en réutilisant le pipeline existant (EM-2d)**

```js
// js/core/doc-pdf.js — deps injectables pour testabilité + réutilise les vendors app
export async function pdfFromQuittanceHtml(html, deps) {
  const { html2canvas, jsPDF } = deps || window;
  const host = document.createElement('div');
  host.style.position='fixed'; host.style.left='-9999px'; host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const canvas = await html2canvas(host.firstElementChild || host, { scale: 2 });
    const pdf = new jsPDF({ unit:'pt', format:'a4' });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 595, 842);
    return pdf.output('blob');
  } finally { document.body.removeChild(host); }
}
```

Ne recopie PAS la logique de `genPDFNative` : ce helper cible le rendu HTML→PDF simple de la quittance publique. L'app garde `genPDFNative` pour ses cas complexes.

- [ ] **Step 4: Lancer → vert**

Run: `npx vitest run __tests__/helpers/doc-pdf.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/core/doc-pdf.js __tests__/helpers/doc-pdf.test.js
git commit -m "feat(outils): helper pdfFromQuittanceHtml (deps injectables)"
```

---

## Task 5: Page publique `outils/quittance-de-loyer.html` (layout B)

**Files:**
- Create: `outils/quittance-de-loyer.html`
- Create: `outils/quittance.js` (glue formulaire → module)

- [ ] **Step 1: Créer la page statique (layout B validé)**

Structure exacte : `<head>` avec `<title>Quittance de loyer gratuite 2026 — modèle conforme | Propryo</title>`, meta description, JSON-LD `FAQPage`. `<body>` : `<h1>` + accroche → `<form id="q">` (bailleur, locataire, bien, loyer HC, charges, mois/année, date paiement, montant reçu) → `<div id="apercu">` → bouton « Générer + Télécharger le PDF » → encart CTA `<a href="/app">compte gratuit</a> » → section contenu SEO (qu'est-ce qu'une quittance / obligatoire / gratuite / délai / quittance vs reçu partiel) → FAQ → liens internes (`/outils/calcul-revision-irl` à venir, `/app`). Charger en fin de body : `<script type="module" src="./quittance.js"></script>` + vendors locaux `../js/vendor/html2canvas.min.js` et `../js/vendor/jspdf.umd.min.js` (**aucun CDN**).

- [ ] **Step 2: Glue formulaire → module (`outils/quittance.js`)**

```js
import { buildQuittanceDoc } from '../js/core/doc-quittance.js';
import { pdfFromQuittanceHtml } from '../js/core/doc-pdf.js';
const $ = s => document.querySelector(s);
function readInput(){
  return {
    bailleur: { nom: $('#f-bailleur').value },
    locataires: [{ nom: $('#f-locataire').value }],
    bien: { adresse: $('#f-bien').value },
    periode: { mois: $('#f-mois').value, annee: +$('#f-annee').value },
    dateEmission: new Date().toISOString().slice(0,10),
    datePaiement: $('#f-datepaie').value,
    montantDu: (+$('#f-hc').value||0) + (+$('#f-ch').value||0),
    montantRecu: +$('#f-recu').value || ((+$('#f-hc').value||0)+(+$('#f-ch').value||0)),
  };
}
$('#q').addEventListener('input', () => { $('#apercu').innerHTML = buildQuittanceDoc(readInput()).html; });
$('#btn-pdf').addEventListener('click', async () => {
  const { html, filename } = buildQuittanceDoc(readInput());
  const blob = await pdfFromQuittanceHtml(html, { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
});
```

- [ ] **Step 3: Vérifier en navigateur (règle : vrai navigateur, pas la preview Claude)**

Ouvrir `outils/quittance-de-loyer.html` en local (double-clic file:// ou serveur statique). Remplir le formulaire → l'aperçu se met à jour → « Télécharger » produit un PDF conforme. Vérifier 0 erreur console et **0 requête réseau externe** (onglet Réseau).

- [ ] **Step 4: Valider la conformité de la sortie**

Comparer visuellement le PDF public à une quittance générée par l'app pour les mêmes valeurs : mentions loi 1989 présentes, cas paiement partiel = « reçu ». Doivent être identiques (même moteur).

- [ ] **Step 5: Commit**

```bash
git add outils/quittance-de-loyer.html outils/quittance.js
git commit -m "feat(outils): page publique générateur de quittance (layout B, SEO + FAQ)"
```

---

## Task 6: Audit code-reviewer (obligatoire avant "prêt à tester")

**Files:** aucun (revue)

- [ ] **Step 1: Lancer la suite complète**

Run: `npx vitest run`
Expected: PASS (aucune régression sur les tests existants).

- [ ] **Step 2: Dispatcher l'agent `superpowers:code-reviewer`**

Périmètre : `js/core/doc-quittance.js`, `js/core/doc-pdf.js`, le refactor de `_buildQuittanceHtml` dans `index.html`, la page `outils/`. Points de vigilance à demander explicitement : (a) **conformité légale** de la quittance identique à l'app (mentions loi 1989, cas partiel), (b) **aucune fuite de données** (génération 100 % client-side, aucun POST), (c) **aucun CDN runtime**, (d) parité byte du rendu app, (e) pas de dépendance `DB` réintroduite dans le module pur.

- [ ] **Step 3: Corriger les blocages remontés, re-tester, re-auditer si nécessaire**

- [ ] **Step 4: Déploiement**

Déployer sur le site public (github.io aujourd'hui). Vérifier l'URL en ligne, la présence dans le sitemap, et le rendu du JSON-LD FAQ via l'outil de test de résultats enrichis.

- [ ] **Step 5: Marquer prêt + mettre à jour le backlog**

Mettre à jour `BACKLOG.md` (sujet livré + version) selon la règle de pilotage temps réel.

---

## Self-review — couverture spec

- §3.1 module pur → Task 1-2 ✅ · §3.2 refactor DRY + parité → Task 3 ✅ · §3.3 pipeline PDF → Task 4 ✅ · §4 page publique layout B → Task 5 ✅ · §6 SEO/FAQPage/conformité → Task 5 ✅ · §7 gestion erreurs (partiel/charges=0/repli) → Task 2 + Task 5 ✅ · §8 tests + audit → Task 1-2-3-4 + Task 6 ✅ · §9 YAGNI (quittance seule, EDL reporté) → périmètre respecté ✅ · §10 worktree/queue → bandeau contrainte + Task 3 step 5 ✅.
- IRL et Bail = **plans séparés** réutilisant `doc-quittance.js`/`doc-pdf.js` comme patron (hors de ce plan).
