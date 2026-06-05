# Bail repris à l'import d'acte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À l'import d'un acte de vente d'un bien occupé, extraire locataire + loyer + date et, en un opt-in par logement, créer un « bail repris » cohérent (`DB.baux[ref]`, `typeContrat:'repris'`, sans signature) + cache d'occupation.

**Architecture:** Logique d'extraction dans le miroir testé `__tests__/helpers/acte-extract.js` (TDD Vitest) puis portée inline dans `index-test.html` (runtime sandbox) ; construction de l'objet bail dans un nouveau miroir pur `__tests__/helpers/bail-repris.js` (TDD) puis shadow inline dans `_acteApply` ; UI variante A (toggle dans la carte logement) dans l'écran de vérification. Sandbox-first : tout passe par `index-test.html`, port vers `index.html` (PROD) seulement après OK user explicite.

**Tech Stack:** Vanilla JS (ES2019), Vitest 2.1 (`npm run test:run`), HTML monofichier, localStorage + Drive sync. Spec : `docs/superpowers/specs/2026-06-03-import-acte-bail-repris-design.md`.

---

> ## ⚠️ Politique de commit & sandbox (GRAVÉ — prime sur le template TDD « commit après chaque tâche »)
> - **Ne JAMAIS committer sans demande explicite de l'utilisateur.** Les steps « commit » ci-dessous sont des **propositions** ; ne les exécuter qu'après un « oui » explicite.
> - **`index-test.html` et `index-candidature-test.html` ne sont JAMAIS commités** (sandbox). Une **session parallèle** les édite aussi → re-lire la région avant toute édition, ne jamais inclure ses changements.
> - **Artefacts commitables pendant le dev** : `__tests__/helpers/acte-extract.js`, `__tests__/helpers/acte-extract.test.js`, `__tests__/helpers/bail-repris.js`, `__tests__/helpers/bail-repris.test.js`, et au port : `index.html sw.js BACKLOG.md docs/subjects/<sujet>.md`. **Allowlist stricte — JAMAIS `git add -A`.**
> - **Port PROD = déploiement public** (post-commit hook auto-push → GitHub Pages). N'arrive qu'à la Tâche 10, après OK user.
> - **Vérifs obligatoires à chaque gate** : `node scripts/check-inline-js.mjs` (0 erreur) · `npm run test:run` (vert) · grep de parité miroir↔inline.
> - **Audit `superpowers:code-reviewer` OBLIGATOIRE** (Tâche 9) avant tout « prêt à tester » — sujet sensible (création multi-objets + Drive + occupation).

---

## File Structure

| Fichier | Responsabilité | Type d'édition |
|---|---|---|
| `__tests__/helpers/acte-extract.js` | Miroir testable du parser : ajoute `acteExtract` → `out.occupations` + rattachement dans `acteRegroup` | TDD (source de vérité parser) |
| `__tests__/helpers/acte-extract.test.js` | Cas de test extraction + rattachement occupation | TDD |
| `__tests__/helpers/bail-repris.js` | **NOUVEAU** module pur : `buildReprisBail(occ, entNom, ref, nowISO)` | TDD (source de vérité construction bail) |
| `__tests__/helpers/bail-repris.test.js` | **NOUVEAU** : tests de forme de l'objet bail repris | TDD |
| `index-test.html` (SANDBOX) | Port inline runtime : `_acteExtract`/`_acteRegroup`, `typeContrat:'repris'` (select+map+impression), bloc occupation (`_acteRenderLogements`/`_acteCollectLogements`/`_acteRenderRecap`), `_acteApply` (création bail repris + shadow `buildReprisBail`) | Sandbox (jamais commité) |
| `index.html` (PROD) | Port byte-identique du sandbox + bump version | PROD (Tâche 10, après OK user) |
| `sw.js` | `CACHE_VER` bump | PROD (Tâche 10) |
| `BACKLOG.md`, `docs/subjects/<sujet>.md` | Statut temps réel | PROD (Tâche 10) |

**Pattern de parité (gravé)** : la logique du parser existe en DEUX copies — le miroir `__tests__/helpers/acte-extract.js` (testé, noms non préfixés : `acteExtract`/`acteRegroup`) et l'inline runtime dans le HTML (`_acteExtract`/`_acteRegroup`). Toute modif du parser se fait dans le miroir (TDD) PUIS est répliquée inline. Idem `buildReprisBail` (miroir `__tests__/helpers/bail-repris.js` ↔ shadow inline dans `_acteApply`).

---

## Task 1 : Parser — extraction de l'occupation (`acteExtract`)

**Files:**
- Modify: `__tests__/helpers/acte-extract.js` (fonction `acteExtract`, juste avant `return out;` — actuellement section 9 « ANNEXES » se termine ~l.226)
- Test: `__tests__/helpers/acte-extract.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `__tests__/helpers/acte-extract.test.js` :

```js
// ── OCCUPATION / BAIL REPRIS (2026-06-03) ──────────────────────────────────
const ACTE_OCCUPE_2LOTS = `
DÉSIGNATION DES BIENS
Un immeuble situé à MULHOUSE (68100), 25 avenue du Test.
ÉTAT LOCATIF
Les lots numéros 5 et 6 sont actuellement loués à Monsieur LOCATAIRE TEST,
suivant bail en date du 01/09/2021, moyennant un loyer mensuel de 680 euros,
outre une provision pour charges de 50 euros et un dépôt de garantie de 680 euros.
`;
const ACTE_OCCUPE_PARTIEL = `
ÉTAT LOCATIF
Le bien est actuellement loué à Madame DUBOIS TEST suivant bail du 15/03/2023,
moyennant un loyer de 520 euros.
`;
const ACTE_LIBRE = `
DÉSIGNATION DES BIENS
Un studio situé à COLMAR (68000), 5 rue Test.
Le BIEN est vendu libre de toute location et occupation.
`;
const ACTE_LOYER_ANNUEL = `
ÉTAT LOCATIF
Bien loué à la société TEST suivant bail du 01/01/2020 moyennant un loyer annuel de 7200 euros.
`;

describe('acteExtract — occupation', () => {
  it('2 lots loués → 1 occupation complète, lots [5,6]', () => {
    const o = acteExtract(ACTE_OCCUPE_2LOTS).occupations;
    expect(o.length).toBe(1);
    expect(o[0].lots).toEqual([5, 6]);
    expect(o[0].locataire).toContain('LOCATAIRE TEST');
    expect(o[0].hc).toBe(680);
    expect(o[0].ch).toBe(50);
    expect(o[0].dg).toBe(680);
    expect(o[0].debut).toBe('2021-09-01');
  });
  it('partiel (loyer sans charges)', () => {
    const o = acteExtract(ACTE_OCCUPE_PARTIEL).occupations;
    expect(o.length).toBe(1);
    expect(o[0].hc).toBe(520);
    expect(o[0].ch).toBeFalsy();
    expect(o[0].debut).toBe('2023-03-15');
    expect(o[0].lots).toEqual([]);
  });
  it('vendu libre → aucune occupation', () => {
    expect(acteExtract(ACTE_LIBRE).occupations).toEqual([]);
  });
  it('loyer annuel → converti /12 + flag', () => {
    const o = acteExtract(ACTE_LOYER_ANNUEL).occupations;
    expect(o[0].hc).toBe(600);
    expect(o[0]._loyerAnnuel).toBe(true);
  });
  it('texte vide → []', () => {
    expect(acteExtract('').occupations).toEqual([]);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npm run test:run -- __tests__/helpers/acte-extract.test.js`
Expected: FAIL — `Cannot read properties of undefined (reading 'length')` (car `out.occupations` n'existe pas encore).

- [ ] **Step 3 : Implémenter l'extraction dans `acteExtract`**

Dans `__tests__/helpers/acte-extract.js`, juste **avant** le `return out;` final de `acteExtract`, insérer :

```js
  // ── 10. OCCUPATION / BAIL EN COURS — best-effort, conservateur (bail repris, Art. 1743).
  out.occupations = [];
  const _occNum = (s) => {
    const n = parseFloat(String(s || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  };
  const _occISO = (s) => {
    const m = String(s || '').match(/(\d{1,2})[\/.\s-](\d{1,2})[\/.\s-](\d{2,4})/);
    if (!m) return '';
    let y = m[3]; if (y.length === 2) y = (+y > 50 ? '19' : '20') + y;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  };
  const _occLibre = /libre\s+de\s+toute\s+(?:location|occupation)|vendu\s+libre|libre\s+de\s+location|occup[ée]\s+par\s+(?:le|la)\s+vendeu/i.test(N);
  const _occRe = /(?:actuellement\s+lou[ée]|donn[ée]s?\s+à\s+bail|aux\s+termes\s+d['’]un\s+bail|[ée]tat\s+locatif|biens?\s+lou[ée]s?)[\s\S]{0,400}/gi;
  let _om;
  while ((_om = _occRe.exec(N)) !== null) {
    const seg = _om[0];
    const occ = { lots: [], _src: { occ: norm(seg.slice(0, 220)) } };
    const loc = seg.match(/lou[ée]s?\s+à\s+((?:M\.|Mme|Monsieur|Madame|la\s+soci[ée]t[ée]\s+)?["«]?[A-ZÀ-Ÿ][A-Za-zÀ-ÿ'’.\- ]{1,60}?)["»]?(?=\s*(?:,|moyennant|suivant|aux\s+termes|selon|en\s+date|\.))/i);
    if (loc) occ.locataire = norm(loc[1]).replace(/["«»]/g, '');
    const dt = seg.match(/bail\s+(?:en\s+date\s+)?du\s+(\d{1,2}[\/.\s-]\d{1,2}[\/.\s-]\d{2,4})/i);
    if (dt) { occ.debut = _occISO(dt[1]); occ._src.debut = norm(dt[0]); }
    const loy = seg.match(/loyer\s+(mensuel\s+|annuel\s+)?(?:de\s+)?([\d  .,]+)\s*(?:€|euros?)/i);
    if (loy) {
      let v = _occNum(loy[2]);
      const annuel = /annuel/i.test(loy[1] || '') || /par\s+an\b/i.test(seg);
      if (annuel && v > 0) { v = Math.round((v / 12) * 100) / 100; occ._loyerAnnuel = true; }
      occ.hc = v; occ._src.hc = norm(loy[0]);
    }
    const ch = seg.match(/provision\s+(?:pour|de)\s+charges\s+(?:de\s+)?([\d  .,]+)\s*(?:€|euros?)/i);
    if (ch) { occ.ch = _occNum(ch[1]); occ._src.ch = norm(ch[0]); }
    const dg = seg.match(/d[ée]p[ôo]t\s+de\s+garantie\s+(?:de\s+)?([\d  .,]+)\s*(?:€|euros?)/i);
    if (dg) { occ.dg = _occNum(dg[1]); occ._src.dg = norm(dg[0]); }
    const lm = seg.match(/lots?\s+(?:num[ée]ros?\s+|n[°os]\s*)?(\d+(?:\s*(?:et|à|,|&)\s*\d+)*)/i);
    if (lm) occ.lots = (lm[1].match(/\d+/g) || []).map(Number);
    if (occ.locataire || occ.hc || occ.debut) out.occupations.push(occ);
  }
  if (_occLibre && !out.occupations.length) out.occupations = [];
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npm run test:run -- __tests__/helpers/acte-extract.test.js`
Expected: PASS (tous les `describe('acteExtract — occupation')` verts). Si un cas échoue, ajuster la regex concernée (NE PAS relâcher l'assertion).

- [ ] **Step 5 (proposé, après OK user) : Commit**

```bash
git add __tests__/helpers/acte-extract.js __tests__/helpers/acte-extract.test.js
git commit -m "feat(import-acte): extraction occupation/bail repris dans acteExtract"
```

---

## Task 2 : Parser — rattachement de l'occupation aux logements (`acteRegroup`)

**Files:**
- Modify: `__tests__/helpers/acte-extract.js` (fonction `acteRegroup` : 2 points de `return out;` — branche copropriété ~l.278 et fin ~l.321 ; helper `attachOccupations` à ajouter près de `_mkLogement`)
- Test: `__tests__/helpers/acte-extract.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `__tests__/helpers/acte-extract.test.js` :

```js
describe('acteRegroup — rattachement occupation', () => {
  it('occupation lots [5,6] → rattachée au logement groupé 5+6', () => {
    const ext = {
      lots: [{ num: 5, designation: 'appartement' }, { num: 6, designation: 'appartement' }, { num: 7, designation: 'appartement' }],
      carrez: [{ lots: [5, 6], surf: '60,00' }],
      occupations: [{ lots: [5, 6], locataire: 'MARTIN TEST', hc: 680, ch: 50, debut: '2021-09-01' }],
    };
    const g = acteRegroup(ext);
    const grouped = g.logements.find(l => l._lots.includes(5) && l._lots.includes(6));
    expect(grouped.occupation).toBeTruthy();
    expect(grouped.occupation.locataire).toBe('MARTIN TEST');
    expect(grouped.occupation._matched).toBe(true);
    const lot7 = g.logements.find(l => l._lots.length === 1 && l._lots[0] === 7);
    expect(lot7.occupation).toBeFalsy();
  });
  it('occupation sans lot + 1 seul logement → rattachée à ce logement', () => {
    const ext = {
      logementsHint: { count: 'un', unit: 'logement' },
      occupations: [{ lots: [], locataire: 'DUBOIS TEST', hc: 520, debut: '2023-03-15' }],
    };
    const g = acteRegroup(ext);
    expect(g.logements.length).toBe(1);
    expect(g.logements[0].occupation.locataire).toBe('DUBOIS TEST');
  });
  it('occupation sans lot + plusieurs logements → non rattachée + note', () => {
    const ext = {
      lots: [{ num: 1, designation: 'appartement' }, { num: 2, designation: 'appartement' }],
      occupations: [{ lots: [], locataire: 'AMBIGU TEST', hc: 400 }],
    };
    const g = acteRegroup(ext);
    expect(g.logements.every(l => !l.occupation)).toBe(true);
    expect(g.notes.some(n => /sans lot identifiable/i.test(n))).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npm run test:run -- __tests__/helpers/acte-extract.test.js -t "rattachement occupation"`
Expected: FAIL — `expected undefined to be truthy` (pas de `.occupation` posée).

- [ ] **Step 3 : Implémenter `attachOccupations` + l'appeler aux 2 returns**

Dans `__tests__/helpers/acte-extract.js`, ajouter ce helper juste après la fonction `_mkLogement` :

```js
/** Rattache les occupations extraites aux logements par recoupement de lots.
 *  Sans lot mais 1 seul logement → rattaché. Ambigu → note de vérification. */
function attachOccupations(logements, occupations, notes) {
  const occs = Array.isArray(occupations) ? occupations : [];
  for (const occ of occs) {
    const lots = Array.isArray(occ.lots) ? occ.lots : [];
    let targets = [];
    if (lots.length) {
      targets = logements.filter(l => Array.isArray(l._lots) && l._lots.some(n => lots.includes(n)));
    } else if (logements.length === 1) {
      targets = [logements[0]];
    }
    if (targets.length) {
      targets.forEach(l => { l.occupation = {
        locataire: occ.locataire || '', hc: occ.hc || 0, ch: occ.ch || 0,
        debut: occ.debut || '', dg: occ.dg || 0, _src: occ._src || {},
        _matched: true, _loyerAnnuel: !!occ._loyerAnnuel,
      }; });
    } else if (notes) {
      notes.push("L'acte mentionne un bail en cours mais sans lot identifiable — active et saisis l'occupation manuellement sur le bon logement.");
    }
  }
}
```

Puis insérer `attachOccupations(out.logements, e.occupations, out.notes);` **juste avant** le `return out;` de la branche copropriété (~l.278) **ET** juste avant le `return out;` final (~l.321).

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npm run test:run -- __tests__/helpers/acte-extract.test.js`
Expected: PASS (extraction + rattachement). Lancer aussi la suite complète : `npm run test:run` → aucune régression.

- [ ] **Step 5 (proposé, après OK user) : Commit**

```bash
git add __tests__/helpers/acte-extract.js __tests__/helpers/acte-extract.test.js
git commit -m "feat(import-acte): rattachement occupation aux logements (acteRegroup)"
```

---

## Task 3 : Port du parser inline dans le sandbox (`index-test.html`)

**Files:**
- Modify: `index-test.html` (fonctions inline `_acteExtract` et `_acteRegroup` — localiser par grep, NE PAS se fier aux numéros de ligne de PROD car la session parallèle décale le sandbox)

> ⚠️ Re-lire les régions `_acteExtract`/`_acteRegroup` dans `index-test.html` AVANT édition (session parallèle active).

- [ ] **Step 1 : Localiser les fonctions inline du sandbox**

Run (via l'outil Grep) : motif `function _acteExtract|function _acteRegroup|const mkLogement` dans `index-test.html`. Lire les deux fonctions entières.

- [ ] **Step 2 : Répliquer la section 10 « OCCUPATION » dans `_acteExtract` inline**

Coller le même bloc qu'en Task 1 Step 3 **avant** le `return out;` de `_acteExtract`, en renommant les helpers locaux pour éviter toute collision : `_occNum`/`_occISO` sont déjà locaux (OK). Utiliser le `norm` interne du fichier (l.35630 PROD : `const norm = s => ...`). Vérifier que `N` (texte normalisé) est bien la variable en scope.

- [ ] **Step 3 : Répliquer `attachOccupations` + appels dans `_acteRegroup` inline**

`_acteRegroup` inline n'a pas de helper externe nommé (les helpers sont des closures). Insérer la fonction `attachOccupations` comme **closure interne** en tête de `_acteRegroup`, puis l'appeler avant le `return out;` de la branche copropriété ET le `return out;` final, avec `attachOccupations(out.logements, e.occupations, out.notes)`.

- [ ] **Step 4 : Vérifier la syntaxe inline**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur (le compteur habituel, ex. « 4 fichiers / 0 erreur »).

- [ ] **Step 5 : Vérifier la parité miroir ↔ inline**

Comparer visuellement le corps de la section 10 et de `attachOccupations` entre `__tests__/helpers/acte-extract.js` et `index-test.html`. Ils doivent être logiquement identiques (seuls les noms `_acteExtract`/`_acteRegroup` diffèrent). Aucun commit (sandbox).

---

## Task 4 : Module pur `buildReprisBail` (construction de l'objet bail)

**Files:**
- Create: `__tests__/helpers/bail-repris.js`
- Test: `__tests__/helpers/bail-repris.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `__tests__/helpers/bail-repris.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { buildReprisBail } from './bail-repris.js';

describe('buildReprisBail', () => {
  const occ = { locataire: 'MARTIN TEST', hc: 680, ch: 50, dg: 680, debut: '2021-09-01' };
  it('produit un bail typeContrat:repris, type:nu, sans signature', () => {
    const b = buildReprisBail(occ, 'SCI TEST', 'A-101', '2026-06-03T10:00:00.000Z');
    expect(b.typeContrat).toBe('repris');
    expect(b.type).toBe('nu');
    expect('signatures' in b).toBe(false);
    expect(b.entity).toBe('SCI TEST');
    expect(b.hc).toBe(680);
    expect(b.ch).toBe(50);
    expect(b.dg).toBe(680);
    expect(b.debut).toBe('2021-09-01');
    expect(b.fin).toBe('');
    expect(b.irl).toBe('');
    expect(b.locataires).toEqual([{ nom: 'MARTIN TEST' }]);
    expect(b.nom).toBe('MARTIN TEST');
    expect(b.source).toEqual({ import: 'acte', acteRef: '', importeLe: '2026-06-03T10:00:00.000Z' });
  });
  it('coerce les nombres et gère les champs manquants', () => {
    const b = buildReprisBail({ locataire: 'X' }, 'E', 'R', 'now');
    expect(b.hc).toBe(0);
    expect(b.ch).toBe(0);
    expect(b.dg).toBe(0);
    expect(b.debut).toBe('');
  });
  it('locataire vide → locataires []', () => {
    const b = buildReprisBail({}, 'E', 'R', 'now');
    expect(b.locataires).toEqual([]);
    expect(b.nom).toBe('');
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm run test:run -- __tests__/helpers/bail-repris.test.js`
Expected: FAIL — `Failed to resolve import "./bail-repris.js"`.

- [ ] **Step 3 : Implémenter le module**

Créer `__tests__/helpers/bail-repris.js` :

```js
/**
 * IMPORT-ACTE-VENTE — construction d'un « bail repris » (Art. 1743 C. civ.).
 * Pur : aucune dépendance DB/DOM. Miroir testable de la logique inline de _acteApply.
 * Bail hérité à l'acquisition d'un bien occupé : PAS de signature ImmoTrack,
 * typeContrat:'repris', régime 'nu' par défaut (éditable ensuite dans le module Bail).
 */
export function buildReprisBail(occ, entNom, ref, nowISO) {
  const o = occ || {};
  const nom = String(o.locataire || '').trim();
  return {
    locataires: nom ? [{ nom }] : [],
    nom,
    type: 'nu',
    typeContrat: 'repris',
    entity: entNom || '',
    debut: o.debut || '',
    fin: '',
    hc: Number(o.hc) || 0,
    ch: Number(o.ch) || 0,
    dg: Number(o.dg) || 0,
    irl: '',
    jpay: '',
    modalitePaiement: 'echeoir',
    source: { import: 'acte', acteRef: o.acteRef || '', importeLe: nowISO || new Date().toISOString() },
  };
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm run test:run -- __tests__/helpers/bail-repris.test.js`
Expected: PASS (3 tests verts).

- [ ] **Step 5 (proposé, après OK user) : Commit**

```bash
git add __tests__/helpers/bail-repris.js __tests__/helpers/bail-repris.test.js
git commit -m "feat(import-acte): module pur buildReprisBail (bail repris Art. 1743)"
```

---

## Task 5 : `typeContrat:'repris'` — affichage (sandbox)

**Files:**
- Modify: `index-test.html` — select `b-typeContrat`, `typeContratMap` (fiche bail), branches d'impression (localiser par grep ; PROD : 1452, 34085, 15754, 16027, 17178, 19120)

- [ ] **Step 1 : Ajouter l'option au select**

Grep `id="b-typeContrat"` dans `index-test.html`. Après `<option value="renouvellement">Renouvellement</option>`, ajouter :

```html
            <option value="repris">Bail repris (acquisition d'un bien occupé)</option>
```

- [ ] **Step 2 : Mapper dans la fiche bail**

Grep `typeContratMap` dans `index-test.html`. Étendre l'objet :

```js
  const typeContratMap = { initial:'Initial', renouvellement:'Renouvellement', avenant:'Avenant', repris:'Repris (Art. 1743)' };
```

- [ ] **Step 3 : Rendre les branches d'impression sûres pour `repris`**

Grep `typeContrat==='renouvellement'` dans `index-test.html` (4 sites). Pour chacun, remplacer le ternaire binaire par une forme à 3 cas afin qu'un bail repris n'affiche JAMAIS « Contrat initial » par défaut. Exemple pour le site ~l.17178 (HTML) :

```js
    +'<p><strong>Nature du contrat :</strong> '
    + (bail.typeContrat==='renouvellement' ? 'Renouvellement du contrat de bail (art. 10 et 17-2 loi 89-462).'
       : bail.typeContrat==='repris' ? 'Bail repris à l’acquisition du bien (art. 1743 du Code civil).'
       : 'Contrat initial (art. 10 loi 89-462).')
    +'</p>'
```

Appliquer la même structure (ajout de la branche `repris`) aux 3 autres sites (l.15754, 16027, 19120). Texte repris : « Bail repris à l'acquisition (art. 1743 du Code civil) ».

- [ ] **Step 4 : Vérifier la syntaxe**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

---

## Task 6 : UI variante A — bloc occupation dans l'écran de vérification (sandbox)

**Files:**
- Modify: `index-test.html` — `_acteRenderLogements` (rendu carte logement), `_acteCollectLogements` (collecte), `_acteRenderRecap` (ligne récap), bloc CSS `.acte-*` (ajout classes `.occ-*` reprises du mockup `mockups/import-acte-vente/occupation-locataire.html`)
- Référence visuelle : `mockups/import-acte-vente/occupation-locataire.html` (variante A)

- [ ] **Step 1 : Ajouter les classes CSS occupation**

Grep le bloc CSS des cartes acte (PROD ~2535-2603). Ajouter les classes `.occ`, `.occ-toggle`, `.occ-switch`, `.occ-slider`, `.occ-detected`, `.occ-fields`, `.occ-note`, `.occ-vacant` en **copiant** depuis `mockups/import-acte-vente/occupation-locataire.html` (déjà calées sur les tokens `css/main.css`). Adapter les couleurs aux variables (`var(--grn)`, `var(--bg-info)`, etc.).

- [ ] **Step 2 : Rendre le bloc occupation dans chaque carte logement**

Dans `_acteRenderLogements`, pour chaque logement `lg` (index `i`), après les champs existants, injecter le bloc. L'état initial du toggle = `lg.occupation && lg.occupation._matched`. Code (gabarit, à adapter aux helpers `_acteFieldBlock`/`escHtml` existants) :

```js
    const occ = lg.occupation || null;
    const on = !!(occ && occ._matched);
    html += `<div class="occ" data-occ-idx="${i}">
      <div class="occ-toggle">
        <label class="occ-switch"><input type="checkbox" id="occ-on-${i}" ${on ? 'checked' : ''} onchange="_acteToggleOcc(${i}, this.checked)"><span class="occ-slider"></span></label>
        <span>Reprendre le bail en cours</span>
        ${occ ? '<span class="occ-detected">détecté</span>' : ''}
      </div>
      <div class="occ-fields" id="occ-fields-${i}" style="${on ? '' : 'display:none'}">
        ${_acteFieldBlock('Locataire', `occ-loc-${i}`, occ ? occ.locataire : '', occ && occ._src ? occ._src.occ : '')}
        ${_acteFieldBlock('Loyer HC (€)', `occ-hc-${i}`, occ && occ.hc ? occ.hc : '', occ && occ._src ? occ._src.hc : '')}
        ${_acteFieldBlock('Charges (€/mois)', `occ-ch-${i}`, occ && occ.ch ? occ.ch : '', occ && occ._src ? occ._src.ch : '')}
        ${_acteFieldBlock('Date d\'effet', `occ-debut-${i}`, occ ? occ.debut : '', occ && occ._src ? occ._src.debut : '')}
        ${_acteFieldBlock('Dépôt de garantie (€)', `occ-dg-${i}`, occ && occ.dg ? occ.dg : '', occ && occ._src ? occ._src.dg : '')}
        <div class="occ-note">🔑 Bail repris (Art. 1743) — sans signature, finalisable ensuite dans le module Bail.${occ && occ._loyerAnnuel ? ' ⚠ Loyer annuel détecté et converti en mensuel — à vérifier.' : ''}</div>
      </div>
    </div>`;
```

Ajouter la fonction `_acteToggleOcc` près des autres handlers du wizard :

```js
function _acteToggleOcc(i, on) {
  _acteCollectLogements();
  const f = el('occ-fields-' + i); if (f) f.style.display = on ? '' : 'none';
}
```

- [ ] **Step 3 : Collecter l'occupation dans `_acteCollectLogements`**

Dans `_acteCollectLogements`, pour chaque logement collecté à l'index `i`, ajouter la lecture de l'occupation :

```js
    const occOn = !!(el('occ-on-' + i) && el('occ-on-' + i).checked);
    d.logements[i].occupation = {
      on: occOn,
      locataire: (el('occ-loc-' + i)?.value || '').trim(),
      hc: parseFloat(el('occ-hc-' + i)?.value) || 0,
      ch: parseFloat(el('occ-ch-' + i)?.value) || 0,
      debut: (el('occ-debut-' + i)?.value || '').trim(),
      dg: parseFloat(el('occ-dg-' + i)?.value) || 0,
      _matched: occOn,
    };
```

(Le ré-rendu doit préserver les saisies : `_acteCollectLogements` est déjà appelé avant chaque re-render — cf. annexes.)

- [ ] **Step 4 : Ligne « N baux repris » dans le récap**

Dans `_acteRenderRecap`, après la ligne logements, calculer depuis l'état (source unique) :

```js
  const repris = (d.logements || []).filter(l => l.occupation && l.occupation.on && l.occupation.locataire);
  if (repris.length) {
    const noms = repris.map(l => (l.ref || '') + ' — ' + l.occupation.locataire).join(' · ');
    html += `<div class="acte-recap-line"><span class="ic">🔑</span><div class="txt"><b>${repris.length} bail/baux repris</b><div>${escHtml(noms)}</div></div><span class="tag acte-tag-link">Art. 1743</span></div>`;
  }
```

(Si la classe `.acte-tag-link` n'existe pas, réutiliser `.acte-tag-new` ; vérifier au grep.)

- [ ] **Step 5 : Vérifier la syntaxe**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 6 : Vérification visuelle navigateur (sandbox)**

Ouvrir `index-test.html` dans un vrai navigateur → wizard import → déposer un acte de test occupé → étape Vérification : le toggle apparaît dans la carte, déplie/replie les champs, citations « ⓘ d'après l'acte » présentes ; étape Récap : ligne « N baux repris ». Tester PC + tablette + téléphone (responsive 1 colonne) + thème clair/sombre.

---

## Task 7 : `_acteApply` — création du bail repris dans la transaction (sandbox)

**Files:**
- Modify: `index-test.html` — `_acteApply`, juste après la boucle de création des logements (`createdLogs` peuplé ; PROD ~36516) et avant le `saveDB()` final

> ⚠️ Re-lire `_acteApply` entier dans `index-test.html` avant édition. Vérifier la présence du tableau `_rollback`, de `createdLogs`, de `d.logements`, de `ent`, et du `_stamp(ent)` existant.

- [ ] **Step 1 : Insérer le bloc de création (shadow de `buildReprisBail`)**

Comme `index-test.html` n'importe pas le module ES (robustesse `file://`), inliner la fonction `buildReprisBail` en shadow (corps **identique** au miroir Task 4) près de `_acteApply`, puis insérer la boucle :

```js
    // ── 3bis. BAIL REPRIS (Art. 1743) — pour chaque logement opt-in « loué ».
    DB.baux = DB.baux || {};
    createdLogs.forEach((log, i) => {
      const occ = (d.logements[i] || {}).occupation;
      if (!occ || !occ.on || !(occ.locataire || occ.hc || occ.debut)) return;
      if (DB.baux[log.ref] && Array.isArray(DB.baux[log.ref].signatures) && DB.baux[log.ref].signatures.length) return; // ne jamais écraser un bail signé
      const bail = buildReprisBail({ ...occ, acteRef: d.fileName || '' }, ent.nom, log.ref, new Date().toISOString());
      DB.baux[log.ref] = bail;
      _rollback.push(() => { delete DB.baux[log.ref]; });
      log.locataire = bail.nom; log.hc = bail.hc; log.ch = bail.ch;
      log.dg = bail.dg; log.debut = bail.debut; log.fin = '';
      if (typeof _auditLog === 'function') _auditLog('create', 'bail', log.ref, ent.nom + '/' + log.ref + ' (repris)');
    });
```

S'assurer que le `_stamp(ent)` existant s'exécute **après** ce bloc (sinon, ajouter `_stamp(ent);` après la boucle). Le `saveDB()` unique existant persiste le tout.

- [ ] **Step 2 : Vérifier la syntaxe**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 3 : Vérification navigateur — cohérence dashboard (le bug §0 de la spec)**

Dans `index-test.html` (vrai navigateur) : importer un acte occupé, opt-in ON, valider. Puis :
1. Page Biens / dashboard → le logement importé apparaît **occupé** (locataire affiché), **pas vacant**, avec loyer attendu = HC+charges.
2. Console : `DB.baux['<ref>']` existe, `typeContrat==='repris'`, pas de clé `signatures`.
3. Ouvrir le module Bail du logement (`openBail('<ref>')`) → champs pré-remplis, type affiché « Repris (Art. 1743) ».
4. Opt-in OFF sur un autre logement → reste **vacant**, pas d'objet `DB.baux`.

- [ ] **Step 4 : Vérification — IRL sans indice ne casse pas**

Le bail repris a `irl:''`. Vérifier qu'aucune exception n'apparaît en console au chargement (agendaAutoSync) et qu'aucune révision IRL n'est planifiée tant que l'indice n'est pas saisi. Saisir ensuite un indice IRL dans le module Bail → la révision se planifie normalement.

---

## Task 8 : Gate de vérification sandbox complète

**Files:** aucun (vérifications uniquement)

- [ ] **Step 1 : Suite de tests complète**

Run: `npm run test:run`
Expected: tous verts (parser + bail-repris + non-régression de l'existant). Noter le total (doit être ≥ baseline + nouveaux tests).

- [ ] **Step 2 : Syntaxe inline**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 3 : Parcours navigateur sur actes réels**

Ouvrir `index-test.html`, importer chacun des actes réels présents dans `actes/` (non commités). Vérifier : détection occupé/libre correcte, rattachement par lot, opt-in, récap, création cohérente. Tester 3 formats + clair/sombre. Tester aussi un acte « vendu libre » → aucun toggle ON, aucun bail créé.

- [ ] **Step 4 : Parité miroir ↔ inline (grep)**

Confirmer que la section 10 de `_acteExtract` inline et `attachOccupations` inline sont logiquement identiques au miroir `__tests__/helpers/acte-extract.js`, et que le shadow `buildReprisBail` inline est byte-identique (hors export) au module `__tests__/helpers/bail-repris.js`.

---

## Task 9 : Audit `superpowers:code-reviewer` (OBLIGATOIRE avant « prêt à tester »)

**Files:** aucun (revue)

- [ ] **Step 1 : Lancer l'agent code-reviewer sur le diff sandbox**

Dispatcher `superpowers:code-reviewer` sur l'ensemble des changements (miroir parser, module bail-repris, bloc `_acteExtract`/`_acteRegroup`/`_acteApply`/UI inline du sandbox). Périmètre demandé : création multi-objets DB + atomicité/rollback, sécurité (injection DOM des valeurs extraites → `escHtml`), absence de signature sur le bail repris (immutabilité non détournée), cohérence Drive cross-device (le bail repris suit le payload entité comme un bail normal), conversion loyer annuel, rattachement par lot.

- [ ] **Step 2 : Traiter les findings**

Corriger tout 🔴/🟠. Re-auditer si un refactor de fond a eu lieu. Ne PAS annoncer « prêt à tester » tant qu'il reste un 🔴/🟠.

---

## Task 10 : Port PROD + déploiement (APRÈS OK user explicite uniquement)

**Files:**
- Modify: `index.html` (port byte-identique du sandbox + bump version), `sw.js` (CACHE_VER), `BACKLOG.md`, `docs/subjects/<sujet>.md`

> ⚠️ N'exécuter cette tâche qu'après le « OK » explicite de l'utilisateur sur le test sandbox. Le commit déclenche le post-commit hook → push GitHub Pages → **déploiement public**.

- [ ] **Step 1 : Porter le parser inline dans `index.html`**

Répliquer dans `index.html` : section 10 de `_acteExtract`, closure `attachOccupations` + appels dans `_acteRegroup`, **identiques** au sandbox validé. Re-grep pour localiser (les lignes PROD bougent).

- [ ] **Step 2 : Porter `typeContrat:'repris'` (select + map + 4 branches impression)**

Identique au sandbox (Task 5). Vérifier les 4 branches d'impression.

- [ ] **Step 3 : Porter l'UI + `_acteApply` + shadow `buildReprisBail`**

Répliquer le CSS `.occ-*`, le bloc occupation dans `_acteRenderLogements`, `_acteToggleOcc`, la collecte dans `_acteCollectLogements`, la ligne récap, et le bloc « 3bis » + shadow `buildReprisBail` dans `_acteApply`. Byte-identique au sandbox.

- [ ] **Step 4 : Bump version (5 emplacements)**

Grep `IMMOTRACK_VERSION` et `v15.248` dans `index.html` : bumper les 4 emplacements (title ~l.6, commentaire em ~l.57, footer ~l.3381, const `IMMOTRACK_VERSION` ~l.3441) vers `v15.249`. Puis dans `sw.js` : `CACHE_VER = 'immotrack-v15.249'`.

- [ ] **Step 5 : Vérifs finales**

Run: `node scripts/check-inline-js.mjs` (0 erreur) puis `npm run test:run` (vert).

- [ ] **Step 6 : Parité sandbox ↔ prod**

Vérifier que les corps des fonctions modifiées sont byte-identiques entre `index-test.html` et `index.html` (hors marqueurs sandbox B3-B8 / dataset démo qu'on ne porte JAMAIS).

- [ ] **Step 7 : MAJ BACKLOG + sujet (temps réel)**

Mettre à jour `BACKLOG.md` (statut livré + version + commit) et le doc sujet `docs/subjects/<sujet>.md` (journal). En temps réel, pas en fin de session.

- [ ] **Step 8 (proposé, après OK user) : Commit allowlist + déploiement**

```bash
git add index.html sw.js BACKLOG.md docs/subjects/<sujet>.md
git commit -m "feat(import-acte): bail repris à l'import d'acte (occupation/locataire) — v15.249"
git status
```

(Le post-commit hook push automatiquement → GitHub Pages ~1 min.)

- [ ] **Step 9 : Audit du port**

Dispatcher `superpowers:code-reviewer` sur le diff PROD (intégration : insertions, refs collatérales, parité). Attendre 0 🔴/🟠 avant de clôturer.

---

## Notes de cohérence (auto-revue du plan)

- **Couverture spec** : R1 (Task 7) · R2 (Task 5) · R3 (Task 4 no-signature + Task 5 affichage + Task 7 garde anti-écrasement) · R4 (`type:'nu'` Task 4) · R5 (UI Task 6) · R6 (rattachement Task 2) · R7 (transaction Task 7). Parser §4 (Tasks 1-3). Cas limites §7 : loyer annuel (Task 1 + UI Task 6) · IRL vide (Task 7 Step 4) · doublon signé (Task 7 Step 1) · libre/vacant (Task 1 + Task 8 Step 3).
- **Cohérence des noms** : miroir `acteExtract`/`acteRegroup`/`attachOccupations`/`buildReprisBail` ; inline `_acteExtract`/`_acteRegroup` ; champ porté `logement.occupation = {on, locataire, hc, ch, debut, dg, _matched}` (Task 6 collecte ↔ Task 7 lecture — mêmes clés). `buildReprisBail(occ, entNom, ref, nowISO)` signature identique miroir ↔ shadow.
- **Hors-scope (non traité ici, sous-projets séparés)** : upload DPE, extraction enrichie (prix/copro/syndic), stockage acte PDF, fil rouge de complétion.
