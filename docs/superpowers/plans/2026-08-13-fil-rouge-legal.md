# Fil rouge — complétion 2 paliers (le LÉGAL d'abord) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que la fin du fil manuel cesse d'annoncer « tout est en place », et que la complétion sépare les **obligations légales** (ce que le fil pousse, sourcé ligne par ligne) du **confort de gestion**, en s'appuyant sur le catalogue de diagnostics et le calendrier DPE que l'app possède déjà.

**Architecture:** Le modèle pur `completionModel` gagne un axe `palier` + des tâches enrichies ; la connaissance légale (catalogue diagnostics, interdiction DPE) reste inline et lui est **injectée** (le module reste pur/testable). L'écran accordéon existant rend deux groupes. La fin du fil manuel route vers la transition déjà livrée.

**Base:** worktree `C:\Users\Did_K\Desktop\Immo-wt-filrouge-complet`, branche `feat/fil-rouge-legal` (depuis `origin/main` `0787f6f`, v15.502).

**Spec:** `docs/superpowers/specs/2026-08-13-fil-rouge-legal-design.md` · **Contrat visuel:** `mockups/fil-rouge-completion-v2/index.html`

⚠️ Transverse : `index.html` reste **CRLF** (Edit uniquement, jamais un script qui réécrit) · les `js/helpers/*.global.js` sont GÉNÉRÉS (`node tools/sync-helpers-global-mirrors.mjs` puis `sed -i 's/^[ \t]\+$//' <fichier>`, revert des mirrors parasites) · numéros de ligne = v15.502, re-localiser au grep.

---

### Task 1 : `completionModel` — 2 paliers + tâches enrichies (module pur, TDD)

**Files:** Modify `__tests__/helpers/parcours-bien-model.js` + `__tests__/helpers/parcours-bien-model.test.js` · Generated: `js/helpers/parcours-bien-model.global.js`

- [ ] **Step 1 : tests qui échouent** — ajouter au describe `completionModel` existant :

```js
describe('completionModel — 2 paliers (légal / confort)', () => {
  const ENT = { id:'e1', nom:'SCI T', gerants:[], gerant:'', siege:'', emailEnvoi:'', iban:'' };
  const IMM = { id:'i1', nom:'12 rue X', adr:'12 rue X', ville:'Ferrette', annee:0, valeurEstimee:0, regimeJuridique:'', equipementsCommuns:{customs:[]} };
  const LOG = { ref:'F-102', imm:'12 rue X', type:'T2', surf:44, hc:508, numFiscal:'', dpe:null };
  const base = { entite:ENT, immeuble:IMM, logements:[LOG], bauxActifs:{},
    diagsParLot:{ 'F-102': { requis:[{key:'dpe',label:'DPE'},{key:'erp',label:'ERP'}], indetermines:[{key:'amiante',label:'Amiante',cause:'annee'}], fournis:[] } },
    dpeParLot:{ 'F-102': { classe:'', interdit:false, raison:'' } } };

  it('chaque tâche porte un palier legal|confort', () => {
    const m = completionModel(base);
    const all = m.nodes.flatMap(n => n.tasks);
    expect(all.every(t => t.palier === 'legal' || t.palier === 'confort')).toBe(true);
  });
  it('le palier légal contient exactement les tâches validées', () => {
    const m = completionModel(base);
    const legal = id => m.nodes.flatMap(n => n.tasks).find(t => t.id === id).palier;
    ['identite','gerant','siege','adresse','annee','regime','caracteristiques','diagnostics','dpeLouable','numFiscal','bail']
      .forEach(id => expect(legal(id)).toBe('legal'));
    ['iban','coordonnees','rcsCapital','signatureLogo','syndic','equipements','valeur','surfaceTotale',
     'chauffageEcs','tantiemes','etage','annexes','mobilier','photos'].forEach(id => expect(legal(id)).toBe('confort'));
  });
  it('les tâches légales portent une source, jamais les tâches confort', () => {
    const m = completionModel(base);
    const all = m.nodes.flatMap(n => n.tasks);
    expect(all.filter(t => t.palier==='legal' && t.id!=='bail').every(t => !!t.src)).toBe(true);
    expect(all.filter(t => t.palier==='confort').every(t => !t.src)).toBe(true);
  });
  it('pctLegal ne compte QUE le palier légal (le confort ne le fait pas baisser)', () => {
    const m = completionModel(base);
    const L = m.nodes.flatMap(n => n.tasks).filter(t => t.palier === 'legal');
    expect(m.pctLegal).toBe(Math.round(L.filter(t=>t.status==='done').length / L.length * 100));
    expect(m.pct).not.toBe(undefined); // compat conservée
  });
  it('nœud « full » = palier légal complet (le confort restant n\'empêche pas le vert)', () => {
    const m = completionModel({ ...base,
      entite:{ ...ENT, gerant:'D. K.', siege:'1 rue Y' } });
    const nEnt = m.nodes.find(n => n.kind === 'ent');
    expect(nEnt.tasks.filter(t=>t.palier==='confort').some(t=>t.status!=='done')).toBe(true);
    expect(nEnt.full).toBe(true);
  });
  it('diagnostics : done seulement si tous les requis sont fournis ; détail des indéterminés exposé', () => {
    const m = completionModel(base);
    const d = m.nodes.flatMap(n=>n.tasks).find(t => t.id === 'diagnostics');
    expect(d.status).toBe('todo');
    expect(d.diags.requis.map(x=>x.key)).toEqual(['dpe','erp']);
    expect(d.diags.indetermines[0].cause).toBe('annee');
    const ok = completionModel({ ...base, diagsParLot:{ 'F-102': { requis:[{key:'dpe',label:'DPE'}], indetermines:[], fournis:['dpe'] } } });
    expect(ok.nodes.flatMap(n=>n.tasks).find(t=>t.id==='diagnostics').status).toBe('done');
  });
  it('DPE louable : interdit ⇒ warn + raison ; classe saine ⇒ done ; classe absente ⇒ todo', () => {
    const ko = completionModel({ ...base, dpeParLot:{ 'F-102': { classe:'G', interdit:true, raison:'DPE G interdit…' } } });
    const t = ko.nodes.flatMap(n=>n.tasks).find(x=>x.id==='dpeLouable');
    expect(t.status).toBe('warn'); expect(t.detail).toContain('interdit');
    const ok = completionModel({ ...base, dpeParLot:{ 'F-102': { classe:'D', interdit:false, raison:'' } } });
    expect(ok.nodes.flatMap(n=>n.tasks).find(x=>x.id==='dpeLouable').status).toBe('done');
  });
  it('entrées d\'injection absentes ⇒ pas de crash (diagnostics/DPE en todo)', () => {
    const m = completionModel({ entite:ENT, immeuble:IMM, logements:[LOG], bauxActifs:{} });
    expect(m.nodes.flatMap(n=>n.tasks).find(t=>t.id==='diagnostics').status).toBe('todo');
    expect(m.pctLegal).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2 :** `npx vitest run __tests__/helpers/parcours-bien-model.test.js` → FAIL.

- [ ] **Step 3 : implémenter.** Réécrire `completionModel` avec la signature `{ entite, immeuble, logements, bauxActifs, diagsParLot, dpeParLot }`. Ajouter à l'helper `T(...)` les options `palier` (défaut `'confort'`) et `src`. Composition exacte des nœuds :

*Bailleur* — `identite` (nom, legal, src « Mention obligatoire du bail — contrat type, décret 2015-587 ») · `gerant` (legal, src « Sans lui, le bail n'est pas valablement signé ») · `siege` (`_s(ent.siege)!==''`, legal, src idem contrat type) · `iban` (confort) · `coordonnees` (confort) · `rcsCapital` (`_s(ent.rcs)!=='' && _s(ent.capital)!==''`, confort) · `signatureLogo` (`!!ent.signature && !!ent.logo`, confort).

*Immeuble* — `adresse` (legal, src « Désignation du logement — mention obligatoire du bail ») · `annee` (legal, src « Détermine amiante (< 1997) et plomb (< 1949) », detail « tant qu'elle manque, l'app ne peut pas dire quels diagnostics sont exigés ») · `regime` (`_s(imm.regimeJuridique)!==''`, legal, src « Art. 3 loi du 6 juillet 1989 — extraits du règlement à annexer ») · `syndic` (`!!imm.syndic`, confort) · `equipements` (confort, calcul `hasEq` existant) · `valeur` (confort) · `surfaceTotale` (`_s(imm.surfaceTotale)!==''`, confort).

*Logement* — `caracteristiques` (legal, `isRentable` inchangé, src « Surface habitable = mention obligatoire du bail (art. 3 loi 89-462) ») · `diagnostics` (legal, src « Dossier de diagnostic technique — art. 3-3 loi du 6 juillet 1989 », porte `diags` = l'entrée `diagsParLot[ref] || {requis:[],indetermines:[],fournis:[]}` ; `done` ⟺ `requis.length>0 && requis.every(r => fournis.includes(r.key)) && indetermines.length===0`) · `dpeLouable` (legal, src « Loi Climat 2021 — calendrier d'interdiction, aucun contournement » ; `interdit` → `warn` + `detail = raison` ; `classe` non vide et non interdit → `done` ; sinon `todo`) · `numFiscal` (legal, `warn` si absent, src « Obligation déclarative propriétaire (Gérer mes biens immobiliers) ») · `bail` (legal, logique existante inchangée : repris-à-vérifier / en place / vacant assumé / à créer — **pas de `src`**) · `chauffageEcs` (`!!(l.chauffage && Object.keys(l.chauffage).length) || !!(l.ecs && Object.keys(l.ecs).length)`, confort) · `tantiemes` (`_num(l.tantiemes)!==''`, confort) · `etage` (`_s(l.etage)!==''`, confort) · `annexes` (au moins une annexe vraie ou un custom, confort) · `mobilier` (`(l.mobilier||[]).length>0`, confort) · `photos` (`(l.photos||[]).length>0`, confort).

Puis : `n.full = tâches LÉGALES toutes done` (le confort n'entre plus dans `full`) ; `pct` = inchangé (toutes tâches, compat) ; **nouveau** `pctLegal` = ratio sur le palier légal seul. Retour : `{ nodes, pct, pctLegal }`.

- [ ] **Step 4 :** relancer la suite du module → PASS (existants + 8 nouveaux). Les tests v15.500 qui asseyaient `full` sur TOUTES les tâches doivent être ajustés **si et seulement si** ils cassent — dans ce cas, corriger l'attente en expliquant en commentaire que `full` = palier légal (décision 13/08), sans toucher aux autres assertions.

- [ ] **Step 5 : mirror + gates + commit**
```bash
node tools/sync-helpers-global-mirrors.mjs && sed -i 's/^[ \t]\+$//' js/helpers/parcours-bien-model.global.js
git checkout -- js/helpers/ 2>/dev/null; node tools/sync-helpers-global-mirrors.mjs && sed -i 's/^[ \t]\+$//' js/helpers/parcours-bien-model.global.js
npx vitest run && node scripts/check-inline-js.mjs
git add __tests__/helpers/parcours-bien-model.* js/helpers/parcours-bien-model.global.js
git commit -m "Fil rouge legal 1/4 : completionModel en 2 paliers (legal source / confort) + taches enrichies"
```
⚠️ Vérifier que le mirror exporte bien `completionModel` (bug v15.500 : la liste d'exports du générateur avait été oubliée).

---

### Task 2 : injection de la connaissance légale (inline) + rendu 2 paliers

**Files:** Modify `index.html`

- [ ] **Step 1 : `_frDiagsRequis(log, imm)`** — nouvelle fonction inline près de `_frCompModel` (grep). Elle interroge le catalogue EXISTANT, sans le dupliquer :

```js
/** Diagnostics réclamés pour CE lot, d'après le catalogue légal existant (_DIAGS_CATALOG_INLINE).
 *  isApplicable renvoie true (requis) / false (sans objet) / null (indéterminable — donnée manquante). */
function _frDiagsRequis(log, imm){
  const out = { requis:[], indetermines:[], fournis:[] };
  if (typeof _DIAGS_CATALOG_INLINE === 'undefined') return out;
  // le catalogue lit anneeConstruction sur le LOT : on retombe sur l'année de l'immeuble
  const ctx = Object.assign({}, log, { anneeConstruction: log.anneeConstruction || (imm && imm.annee) || 0 });
  _DIAGS_CATALOG_INLINE.forEach(function(d){
    let ap = null;
    try { ap = d.isApplicable(ctx); } catch(e) { ap = null; }
    if (ap === false) return;
    const item = { key:d.key, label:d.label, cause: (!ctx.anneeConstruction && (d.key==='amiante'||d.key==='crep')) ? 'annee' : 'donnee' };
    if (ap === null) out.indetermines.push(item); else out.requis.push(item);
    const g = (typeof _diagGet === 'function') ? _diagGet(log, d.key) : null;
    if (g && (g.date || g.classe || g.presence || g.resultat)) out.fournis.push(d.key);
  });
  return out;
}
```
⚠️ Vérifier au grep la forme réelle retournée par `_diagGet` (champs `date`/`classe`/`presence`…) et n'utiliser que des champs existants ; adapter la condition « fourni » en conséquence.

- [ ] **Step 2 : brancher l'injection dans `_frCompModel`** — construire `diagsParLot` et `dpeParLot` pour les logements du fil, et les passer à `completionModel` :
```js
  const diagsParLot = {}, dpeParLot = {};
  logs.forEach(function(l){
    diagsParLot[l.ref] = _frDiagsRequis(l, imm);
    const classe = (l.dpe && typeof l.dpe === 'object') ? (l.dpe.classe || l.dpe.lettre || '') : (typeof l.dpe === 'string' ? l.dpe : '');
    const v = (typeof _dpeInterditLocationAuDate === 'function') ? _dpeInterditLocationAuDate(classe, new Date()) : { interdit:false, raison:'' };
    dpeParLot[l.ref] = { classe: classe, interdit: !!v.interdit, raison: v.raison || '' };
  });
```

- [ ] **Step 3 : rendu 2 paliers dans `_frCompHtml`** (fidélité mockup écran ②) :
  - hero : gros chiffre = `pctLegal` + libellé **« EN RÈGLE »** ; deux barres — « ⚖ Obligations légales x/y » (accent) et « 📋 Fiche complète x/y » (neutre) ; phrase « Le fil ne pousse qu'une chose : que le légal soit en place… ».
  - nœud : deux jauges `⚖ x/y` (verte si palier légal complet, sinon ambre) et `📋 x/y` (neutre).
  - nœud ouvert : deux groupes — `⚖ Obligations légales — à mettre en place` puis `📋 Confort de gestion — quand tu veux`.
  - tâche : sous le libellé, `detail` puis, si `t.src`, un bandeau ambre `⚖ <src>` (classe `fr-comp-src`).
  - tâche `diagnostics` : rendre « **N requis** pour ce bien : DPE · ERP » + si `indetermines.length` une ligne bleue « ↳ N à déterminer (Amiante, Plomb) — renseigne l'**année de construction** de l'immeuble ».
  - fin de timeline : « Quand les pastilles ⚖ sont vertes : le bien est louable en règle ».
  - CSS : ajouter `.fr-comp-src` + les variantes de jauge, en réutilisant les tokens du bloc `fr-comp-*` existant.
  - ⚠️ XSS : tout via `escHtml` (les labels de diagnostics viennent du catalogue, les noms du DB).

- [ ] **Step 4 : vérification navigateur au vrai clic** — serveur `npx --yes http-server "C:/Users/Did_K/Desktop/Immo-wt-filrouge-complet" -p 8812 -c-1 --silent`, page `?sandbox=1`, DB seedée en console (jamais de dataset démo). Vérifier : hero « X % EN RÈGLE » + 2 barres · 2 groupes dans le nœud ouvert · les sources s'affichent sur les lignes légales et **aucune** sur le confort · un immeuble **sans année** → la ligne Diagnostics annonce les indéterminés ; renseigner l'année via la vraie fiche → au retour, ils passent en requis · un lot DPE « G » → tâche `dpeLouable` en warn avec la raison de l'app · un nœud dont le légal est complet mais pas le confort → **vert**. 0 erreur console. Nettoyage.

- [ ] **Step 5 : gates + commit**
```bash
node scripts/check-inline-js.mjs && npx vitest run
git add index.html
git commit -m "Fil rouge legal 2/4 : injection catalogue diagnostics + verdict DPE, rendu accordeon en 2 paliers"
```

---

### Task 3 : la fin du fil manuel enchaîne sur la complétion

**Files:** Modify `index.html`

- [ ] **Step 1 : router `done` → `transition`.** Dans `_frShowFr`, l'étape `done` du fil manuel ne doit plus être un cul-de-sac. Deux points à traiter (grep `kind==='done'` et `_frNextChoice`) :
  - l'écran `transition` (livré v15.500) doit afficher **le récap de ce qui vient d'être créé** (`_frRecapHtml()`), qui vivait dans `done` — le déplacer dans le corps de `transition` (il y est déjà partiellement : vérifier et compléter).
  - le choix « C'est bon, terminer » de l'écran `next` (`_frNextChoice('finish')` → `advance('next','finish')`) doit désormais mener à `transition` au lieu de `done`. **Ne PAS toucher au conducteur pur** si `advance('next','finish')` retourne `'done'` : router côté DOM dans `_frOpenStep`/`_frNextChoice` serait un contournement — préférer la voie propre : modifier la table de transition du module pur `fil-rouge-conductor.js` (`next + finish → 'transition'`) + son test, régénérer le mirror. L'étape `done` reste dans `STEPS` (compat, plus atteignable par le fil manuel).
  - poser l'état de reprise : appeler `_frSetCompletionState(entId, immName)` au moment où le fil manuel atteint `transition` (comme `_frAfterActe` le fait pour l'acte).
- [ ] **Step 2 : adapter le texte de `transition`** au cas manuel : le compte affiché doit être « il reste N infos **obligatoires** » calculé sur le **palier légal** (`pctLegal`/tâches légales restantes), pas sur toutes les tâches. Réutiliser `_frCompModel()`.
- [ ] **Step 3 : vérification navigateur au vrai clic** — fil manuel complet : « + Ajouter un bien » → « Saisir à la main » → bailleur → immeuble → logement → « C'est bon, terminer » → **écran transition** (plus « tout est déjà en place ») avec le récap du bien créé et le nombre d'obligations restantes → « Compléter maintenant » → accordéon 2 paliers → compléter une fiche via le vrai écran → retour au fil → « Plus tard » → **bandeau de reprise sur la page Biens** → F5 → toujours là → Reprendre. Vérifier aussi la **non-régression du fil post-acte** (v15.500) : import → transition → accordéon, inchangé. Un seul overlay à tout instant, 0 erreur console.
- [ ] **Step 4 : gates + commit**
```bash
node scripts/check-inline-js.mjs && npx vitest run && node --check sw.js
git add index.html __tests__/helpers/fil-rouge-conductor.* js/helpers/fil-rouge-conductor.global.js
git commit -m "Fil rouge legal 3/4 : la fin du fil manuel enchaine sur la completion (fini « tout est deja en place »)"
```

---

### Task 4 : vérification finale, bump, audit

- [ ] **Step 1 : rebase** sur `origin/main` frais (`git fetch && git rebase origin/main`), résoudre les conflits en comprenant les deux intentions (d'autres chantiers touchent `index.html` : signature, EDL).
- [ ] **Step 2 : bump** au n° libre au-dessus d'`origin/main` (à ce jour v15.502 → v15.503, re-vérifier après le fetch) : `<title>`, `<em>` du footer, `IMMOTRACK_VERSION`, ligne Récap DDT, `CACHE_VER` de `sw.js`. Édition **binaire-safe** (préserver CRLF).
- [ ] **Step 3 : gates** — `node scripts/check-inline-js.mjs` (0 erreur) · `npx vitest run` (baseline v15.502 + ~8 nouveaux) · `node --check sw.js` · CRLF binaire vérifié au comptage d'octets (PowerShell, pas awk/sed).
- [ ] **Step 4 : parcours complet au vrai clic** — les deux entrées (manuelle ET acte) jusqu'à 100 % légal, reprise après F5, non-régression de la garde identité du fil manuel (réf seule → bloqué).
- [ ] **Step 5 : audit `superpowers:code-reviewer`** — brief : conformité au mockup écran par écran (2 paliers, sources visibles, hero « EN RÈGLE »), **exactitude des sources légales affichées** (aucune affirmation non ancrée), non-duplication du catalogue de diagnostics, pureté du module (aucun accès inline), XSS, non-régression v15.500.
- [ ] **Step 6 :** NE PAS PUSHER — présenter le bilan et attendre le GO du user.

---

## Self-review

- Couverture spec : §2 décisions → Tasks 1-3 · §3 liste → Task 1 Step 3 · §4 réutilisation → Task 2 Steps 1-2 · §5 pureté par injection → Task 1 (signature) + Task 2 (appelant) · §6 comportements → Tasks 1 (`full`/`pctLegal`) et 3 (fin du fil manuel) · §8 gates → Task 4.
- Types cohérents : `diagsParLot[ref] = {requis[],indetermines[],fournis[]}` produit en Task 2 Step 1, consommé en Task 1 Step 3 ; `pctLegal` produit en Task 1, consommé en Tasks 2-3.
- À vérifier au build (ancres susceptibles d'avoir bougé) : forme exacte du retour de `_diagGet`, table de transition de `fil-rouge-conductor`, emplacement de `_frRecapHtml` dans `transition`. Ce sont des greps, pas des inventions.
