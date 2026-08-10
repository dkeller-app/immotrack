# Re-skin Propryo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin l'app ImmoTrack/Propryo sur la charte Propryo (corail = accent unique, base neutre, typo Schibsted/Inter, 2 modes Clair + Sombre bien contrastés) **sans toucher au code métier, aux données ni aux widgets**, et câbler le bouton Retour du navigateur (History API).

**Architecture :** Re-skin par **re-valorisation des tokens CSS existants** (`--bg`, `--sur`, `--acc`, …) dans `css/main.css` — mêmes noms, nouvelles valeurs par mode → zéro site d'usage CSS/HTML touché. Collapse 3 thèmes → 2 modes. Overrides ciblés là où la re-valorisation créerait des aplats corail. Bouton Retour = `pushState` dans `go()` + un handler `popstate` (JS, `index.html`).

**Tech Stack :** HTML/CSS/JS vanilla (pas de framework, pas de bundler). `css/main.css` (~8k lignes) + `index.html` (~50k lignes, monolithe). Vérif via grep + `getComputedStyle` (serveur de preview) + revue visuelle. Spec : `docs/superpowers/specs/2026-06-24-reskin-propryo-design.md`.

---

## Préalables & coordination (à lire avant de commencer)

- **Ce clone (`C:\Users\Did_K\Desktop\Immo`) est STALE** (~234 commits derrière `origin/main`). **Tout le travail se fait dans un worktree depuis `origin/main`** (Task 0). Les n° de ligne réels sont ceux du worktree, PAS ceux du clone.
- **`index.html` est partagé avec la session « Drive refonte ».** Les tâches qui touchent `index.html` (Task 3 toggle, Task 4 font, Task 6 graphes, Task 7 Retour) **passent par la file `.index-queue`** (protocole `docs/INDEX-COMMIT-PROTOCOL.md`) : l'ouvrière n'intègre pas `index.html` sur main elle-même, elle s'inscrit dans `.index-queue/QUEUE.md` et le maître intègre en FIFO. `css/main.css` n'est pas contendu → peut être livré directement sur la branche du worktree.
- **Versioning** (règle non négociable) : à chaque commit livré, incrémenter `v15.XXX` dans `index.html` (`<title>` + footer) ET dans le message de commit. Lire la version courante dans le worktree et incrémenter d'un patch par lot.
- **Audit `code-reviewer` obligatoire** (Task 8) avant de dire « prêt à tester » (re-skin transverse = sujet sensible).
- **Règle d'or** : on ne change que la couche visuelle. Aucun widget/graphe/drill-down/donnée/logique métier supprimé ou déplacé.

---

## Task 0: Worktree depuis origin/main

**Files:**
- Aucune modif de fichier ; setup git.

- [ ] **Step 1: Fetch + créer le worktree**

```bash
git fetch origin
git worktree add C:/Users/Did_K/Desktop/immo-wt-reskin -b feat/reskin-propryo origin/main
```

- [ ] **Step 2: Vérifier qu'on est bien sur la lignée prod**

```bash
cd C:/Users/Did_K/Desktop/immo-wt-reskin
git log --oneline -1
```
Expected : le HEAD = dernier commit `origin/main` (PAS `a2f8419` du clone stale).

- [ ] **Step 3: Localiser les blocs de thème et la version**

```bash
grep -nE "data-theme=\"(sobre|colore|dark)\"|^:root" css/main.css | head
grep -nE "v15\.[0-9]+" index.html | head -4
```
Noter les n° de ligne des blocs `:root`, `[data-theme="sobre"]`, `[data-theme="colore"]`, `[data-theme="dark"]` et la version courante. **Tout le reste du plan se fait dans ce worktree.**

---

## Task 1: Re-valoriser les tokens CLAIR (css/main.css)

Applique les valeurs Propryo CLAIR à `:root` (fallback), `[data-theme="sobre"]` et `[data-theme="colore"]` (colore devient un alias de clair ; il sera retiré du cycle en Task 3). **Ne change que les valeurs**, garde tous les noms de variables.

**Files:**
- Modify: `css/main.css` (blocs `:root`, `[data-theme="sobre"]`, `[data-theme="colore"]`)

- [ ] **Step 1: Remplacer les valeurs des 3 blocs clair par ce set exact**

Pour CHACUN des blocs `:root`, `[data-theme="sobre"]`, `[data-theme="colore"]`, mettre ces valeurs (garder les variables non listées telles quelles) :

```css
  --bg:#f4f5f8;
  --sur:#ffffff;
  --sur2:#f7f8fb;
  --sur3:#eef1f6;
  --bor:#e4e7ee;
  --bor2:#eef0f5;
  --t1:#101521;
  --t2:#3c4658;
  --t3:#6e7888;
  --acc:#ff5a3c;
  --acc2:#e8431f;
  --acc-soft:#ffe7e0;     /* AJOUT : halo focus corail */
  --cta:#ff5a3c;
  --cta-h:#e8431f;
  --pos:#1a8f6f;
  --neg:#d23f3f;
  --warn:#b27a12;
  --info:#42506a;
  --pur:#7b6bb0;
  --blu:#ff5a3c;
  --grn:#1a8f6f;
  --red:#d23f3f;
  --ora:#b27a12;
  --neutral-soft:#eef1f6; /* AJOUT : pastille neutre (icônes/piliers) */
  --neutral-ink:#42506a;  /* AJOUT */
```

- [ ] **Step 2: Vérifier que le serveur de preview résout bien les valeurs (mode clair = sobre)**

Démarrer/réutiliser le serveur de preview rooté projet, naviguer vers `index.html` (mode sobre par défaut), puis :

```js
// preview_eval
(function(){var cs=getComputedStyle(document.documentElement);
 return {acc:cs.getPropertyValue('--acc').trim(), bg:cs.getPropertyValue('--bg').trim(),
         t1:cs.getPropertyValue('--t1').trim(), pos:cs.getPropertyValue('--pos').trim()};})()
```
Expected : `acc:#ff5a3c`, `bg:#f4f5f8`, `t1:#101521`, `pos:#1a8f6f`.

- [ ] **Step 3: Revue visuelle rapide (1 écran)**

Charger l'Accueil. Vérifier : fond gris clair neutre (plus de pêche), boutons primaires corail, textes encre. Aucun écran cassé.

- [ ] **Step 4: Commit (css uniquement, pas index.html)**

```bash
git add css/main.css
git commit -m "Re-skin Propryo : tokens CLAIR (Sobre/Coloré → charte corail/neutres)"
```

---

## Task 2: Re-valoriser les tokens SOMBRE + ombres→halos (css/main.css)

**Files:**
- Modify: `css/main.css` (bloc `[data-theme="dark"]`)

- [ ] **Step 1: Remplacer les valeurs du bloc `[data-theme="dark"]` par ce set exact**

```css
  --bg:#14161d;
  --sur:#1e222c;
  --sur2:#262b37;
  --sur3:#2e3442;
  --bor:rgba(255,255,255,.12);
  --bor2:rgba(255,255,255,.08);
  --t1:#f2f5fa;
  --t2:#cdd6e3;
  --t3:#9aa6b8;
  --acc:#ff6a4a;
  --acc2:#ff8163;
  --acc-soft:rgba(255,106,74,.18);
  --cta:#ff6a4a;
  --cta-h:#ff8163;
  --pos:#3fd6a3;
  --neg:#ff7a7a;
  --warn:#f1bd55;
  --info:#aeb9cb;
  --pur:#8f7fc4;
  --blu:#ff6a4a;
  --grn:#3fd6a3;
  --red:#ff7a7a;
  --ora:#f1bd55;
  --neutral-soft:rgba(255,255,255,.07);
  --neutral-ink:#aeb9cb;
```

- [ ] **Step 2: Ombres → halos dans le bloc dark**

Repérer les vars d'ombre définies dans `[data-theme="sobre"]` (`grep -nE "--shadow" css/main.css`). Les **surcharger dans le bloc dark** par des bordures/halos :

```css
  --shadow:0 0 0 1px rgba(255,255,255,.05);
  --shadow-card:0 0 0 1px rgba(255,255,255,.06);
  --shadow-card-hover:0 0 0 1px rgba(255,255,255,.12);
  --shadow-lg:0 0 0 1px rgba(255,255,255,.11), 0 40px 90px -40px rgba(0,0,0,.7);
```
(Adapter aux noms exacts trouvés par le grep.)

- [ ] **Step 3: Vérifier le rendu sombre (computed-style)**

preview_eval : passer en sombre (`document.body`/`html` selon le mécanisme — `[data-theme="dark"]`), puis lire sur un élément carte sa couleur de fond + bordure :

```js
(function(){document.documentElement.setAttribute('data-theme','dark');
 var c=document.querySelector('.card')||document.querySelector('.kpi');
 var s=getComputedStyle(c);
 return {bg:getComputedStyle(document.body).backgroundColor, cardBg:s.backgroundColor, cardBorder:s.borderColor};})()
```
Expected : fond ≈ `rgb(20,22,29)`, carte nettement plus claire (≈ `rgb(30,34,44)`), bordure visible (≈ `rgba(255,255,255,.12)`).

- [ ] **Step 4: Revue visuelle sombre (3-4 écrans denses : Accueil, Loyers, une fiche, Finances)**

Critère : chaque carte/bloc se détache nettement du fond, bordures visibles, textes lisibles. C'est le critère d'acceptation n°1 (« contraste + lisibilité »).

- [ ] **Step 5: Commit**

```bash
git add css/main.css
git commit -m "Re-skin Propryo : tokens SOMBRE contrasté (surfaces détachées + bordures visibles + ombres→halos)"
```

---

## Task 3: Collapse 3 thèmes → 2 modes (index.html) — VIA .index-queue

**Files:**
- Modify: `index.html` (fonctions `toggleTheme`, `setTheme`, constante `_THEME_LABELS`, chargement initial du thème)

- [ ] **Step 1: Lire le code de thème actuel dans le worktree**

```bash
grep -nE "toggleTheme|setTheme|_THEME_LABELS|immotrack_theme_mode" index.html
```
Lire ces fonctions pour connaître leur forme exacte avant d'éditer.

- [ ] **Step 2: `toggleTheme` ne cycle plus que Clair↔Sombre**

Remplacer la logique de cycle (sobre→colore→dark→sobre) par un bascule binaire :

```js
function toggleTheme(){
  var cur = document.documentElement.getAttribute('data-theme');
  var next = (cur === 'dark') ? 'sobre' : 'dark';   // Clair (sobre) ↔ Sombre (dark)
  setTheme(next);
}
```

- [ ] **Step 3: Coercition au chargement + labels 2 modes**

Là où le thème est lu depuis localStorage (`immotrack_theme_mode`), coercer toute valeur hors {`sobre`,`dark`} (dont `colore`) vers `sobre` :

```js
var saved = localStorage.getItem('immotrack_theme_mode');
if(saved !== 'sobre' && saved !== 'dark') saved = 'sobre';   // 'colore' (legacy) → clair
```
Et réduire `_THEME_LABELS` à 2 entrées : `{ sobre:'🌞', dark:'🌙' }`.

- [ ] **Step 4: Bump version + inscrire dans .index-queue**

Incrémenter la version (`<title>` + footer). Suivre `docs/INDEX-COMMIT-PROTOCOL.md` : ajouter l'entrée dans `.index-queue/QUEUE.md` (ne PAS intégrer index.html sur main soi-même).

- [ ] **Step 5: Vérifier**

Charger l'app, cliquer le toggle thème : il alterne Clair/Sombre uniquement. Forcer `localStorage.setItem('immotrack_theme_mode','colore')` puis recharger : doit afficher Clair (pas de thème cassé).

---

## Task 4: Typographie Schibsted Grotesk + Inter (index.html) — VIA .index-queue

**Files:**
- Modify: `index.html` (`<head>` : link Google Fonts ; bloc de variables typo ; règles titres/KPI)

- [ ] **Step 1: Ajouter le link Google Fonts dans `<head>`**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Définir `--font` / `--display` et les appliquer**

Dans `css/main.css` (`:root`), ajouter :
```css
  --font:'Inter',system-ui,-apple-system,sans-serif;
  --display:'Schibsted Grotesk','Inter',system-ui,sans-serif;
```
Faire pointer `body{font-family:var(--font)}` et appliquer `font-family:var(--display);font-weight:800;letter-spacing:-.02em` aux titres de section + aux gros chiffres KPI (repérer les classes via `grep -nE "\.kpi|\.k-val|h1|h2|\.dw-|\.card-title" css/main.css`).

- [ ] **Step 3: Vérifier (computed-style)**

```js
(function(){var t=document.querySelector('h1,.card-title,.kpi');
 return getComputedStyle(t).fontFamily;})()
```
Expected : contient `Schibsted Grotesk` (titres) / `Inter` (corps).

- [ ] **Step 4: Bump version + .index-queue + (css commit séparé)**

```bash
git add css/main.css
git commit -m "Re-skin Propryo : typo Schibsted Grotesk (display) + Inter (texte)"
```
(Le `<head>` index.html passe par `.index-queue`.)

---

## Task 5: Overrides anti-aplat corail + focus (css/main.css)

`--acc`/`--blu`/`--cta` étaient bleu/teal (neutres visuellement) ; en corail vif, tout aplat « crie ». Auditer et corriger.

**Files:**
- Modify: `css/main.css` (règles `.ni.act`/`.bp`/focus + tout aplat accent)

- [ ] **Step 1: Auditer les aplats accent**

```bash
grep -nE "background(-color)?:\s*var\(--(acc|acc2|blu|cta)" css/main.css
```
Pour chaque hit : si c'est un **CTA/bouton primaire** → OK (garder). Si c'est un **grand fond/bandeau/en-tête/nav** → à neutraliser.

- [ ] **Step 2: Item de nav actif → liseré corail (pas de fond plein)**

Repérer `.ni.act` (`grep -nE "\.ni\.act" css/main.css`). Remplacer un éventuel fond dégradé bleu par :
```css
.ni.act{
  background:var(--sur3);             /* surface neutre discrète */
  color:var(--t1);
  box-shadow:inset 3px 0 0 var(--acc);/* liseré corail gauche */
}
```

- [ ] **Step 3: Focus rings en halo corail**

Pour les inputs/boutons focus (`grep -nE ":focus|focus-within|box-shadow.*--blu|--acc" css/main.css`), uniformiser :
```css
.inp:focus, .inp:focus-within, button:focus-visible{
  border-color:var(--acc);
  box-shadow:0 0 0 4px var(--acc-soft);
}
```

- [ ] **Step 4: Re-grep — aucun aplat corail résiduel**

```bash
grep -nE "background(-color)?:\s*var\(--(acc|acc2|blu|cta)" css/main.css
```
Expected : ne reste que des CTA/boutons (petits éléments d'action), zéro grand aplat.

- [ ] **Step 5: Revue visuelle (nav + focus, clair & sombre) + commit**

```bash
git add css/main.css
git commit -m "Re-skin Propryo : overrides anti-aplat corail (nav actif liseré, focus halo)"
```

---

## Task 6: Règle « couleur = sens » sur les graphes réels (index.html) — VIA .index-queue

Les tokens sémantiques sont déjà bons (Task 1/2 : `--pos`/`--neg`/`--warn`). Reste à traiter les **séries de TENDANCE** : ligne neutre + point corail sur le mois courant (pas de vert/rouge). Les graphes BIPOLAIRES (signe = info) restent en `--pos`/`--neg`.

**Files:**
- Modify: `index.html` (code de rendu des sparklines de tendance : occupation, rendement, dépôts, loyers — repérer le code SVG/canvas)

- [ ] **Step 1: Localiser les graphes de tendance**

```bash
grep -nE "spark|polyline|sparkline|drawSpark|<svg|chartLine|occupation|rendement" index.html | head -40
```
Identifier : (a) les sparklines de TENDANCE (occupation/rendement/dépôts/loyers) → neutre+corail ; (b) le cash-flow et les barres provisions/charges (BIPOLAIRES) → restent sémantiques.

- [ ] **Step 2: Tendances → trait neutre `--t2` + point corail mois courant**

Pour chaque sparkline de tendance, forcer le `stroke` du trait à `var(--t2)` (neutre) et ajouter/teinter le marqueur du dernier point en `var(--acc)`. (Réutiliser le patron validé dans `mockups/redesign-app/dashboard-reel-propryo.html` : `<polyline stroke="var(--ink-2)">` + `<circle fill="var(--accent)">` — ici l'équivalent app = `--t2` / `--acc`.)

- [ ] **Step 3: Vérifier que le bipolaire reste sémantique**

Cash-flow +/−, provisions vs charges, deltas ▲▼, montants négatifs : confirmer qu'ils utilisent toujours `--pos`/`--neg`. Ne PAS y toucher.

- [ ] **Step 4: Vérif visuelle (Accueil, clair + sombre) + bump + .index-queue**

Sparklines de tendance = traits neutres avec un point corail ; courbes bipolaires = vert/rouge. Bump version, inscrire dans `.index-queue`.

---

## Task 7: Bouton Retour — intégration History API (index.html) — VIA .index-queue

Tâche la plus risquée → **lire le code réel d'abord**, petits pas, vérif manuelle.

**Files:**
- Modify: `index.html` (fonction `go()`, listener `hashchange` existant, ajout d'un listener `popstate`, boot)

- [ ] **Step 1: Lire le code de navigation réel**

```bash
grep -nE "function go\(|addEventListener\('hashchange'|openLogFiche|openImmFiche|openEntFiche|pushState|replaceState|currentPage" index.html
```
Lire `go()`, le listener `hashchange`, et les `open*Fiche`/`close*Fiche` pour connaître l'état exact (`currentPage`, format du hash).

- [ ] **Step 2: `go()` pousse un état d'historique (sauf si navigation issue de l'historique)**

Ajouter à la fin de `go(page, ...)` :
```js
function go(page, /* …args existants… */ opts){
  /* … corps existant inchangé (montre/masque les pages) … */
  if(!(opts && opts.fromHistory)){
    try{ history.pushState({page:page}, '', '#'+page); }catch(e){}
  }
}
```
(Adapter à la signature réelle ; ne pas casser les appels existants — `opts` optionnel en dernier.)

- [ ] **Step 3: Handler `popstate` unique**

Ajouter (une seule fois, près du listener hashchange) :
```js
window.addEventListener('popstate', function(e){
  var page = (e.state && e.state.page) || (location.hash ? location.hash.slice(1).split('-')[0] : '') || 'accueil';
  // les routes fiche (#log-fiche-…/#imm-fiche-…/#ent-fiche-…) restent gérées par le routeur fiche existant ;
  // pour les pages normales, restaurer sans re-pousser :
  if(!/^#(log|imm|ent)-fiche-/.test(location.hash)){
    go(page, /* …args par défaut… */ {fromHistory:true});
  }
});
```
**Attention** : le listener `hashchange` existant fire aussi sur back/forward. Vérifier qu'il n'y a pas de double-traitement avec `popstate` (si conflit, faire en sorte que `popstate` gère les pages et `hashchange` les fiches, sans recouvrement).

- [ ] **Step 4: `replaceState` au boot vers `#accueil`**

Là où l'app rend l'accueil après login (`__immoRender`/`go('accueil')`), ajouter une fois :
```js
try{ history.replaceState({page:'accueil'}, '', '#accueil'); }catch(e){}
```
pour que Retour depuis l'accueil ne retombe pas sur une URL d'auth.

- [ ] **Step 5: Vérification MANUELLE (comportement réel)**

Charger l'app (connecté). Naviguer Accueil → Loyers → Finances. Presser **Retour** : doit revenir à Loyers, puis Accueil (PAS la connexion). Ouvrir une fiche logement → Retour : ferme la fiche, revient à la liste. Vérifier qu'un **vrai F5** redemande bien le mot de passe (`persistSession:false` conservé — comportement voulu).

- [ ] **Step 6: Bump version + .index-queue**

Inscrire dans `.index-queue` avec note « History API bouton Retour ».

---

## Task 8: Vérification finale + audit code-reviewer

**Files:**
- Aucune modif (sauf correctifs issus de l'audit).

- [ ] **Step 1: Parité fonctionnelle — revue page par page**

Parcourir toutes les pages (Accueil, Tableau de bord, Logements, Locataires, Loyers, Baux, Candidats, Agenda, Équipements, Finances, Révision IRL, Régularisation, Reçus & Quittances, États des lieux, Pilotage, Import, Paramètres) en **clair ET sombre**. Critère : tout rend, aucun widget/graphe/drill-down perdu, rien de cassé.

- [ ] **Step 2: Audit identité (grep)**

```bash
grep -nE "background(-color)?:\s*var\(--(acc|acc2|blu|cta)" css/main.css
```
Expected : que des petits éléments d'action. Aucun grand aplat corail.

- [ ] **Step 3: Contraste AA (les 2 modes)**

Vérifier le contraste texte/fond sur cartes, badges, secondaires — surtout en Sombre. Outil axe ou contrôle manuel des paires `--t2`/`--sur`, `--t3`/`--sur`, badges.

- [ ] **Step 4: Test bouton Retour (rejouer Task 7 Step 5)**

- [ ] **Step 5: Audit `code-reviewer` (obligatoire)**

Dispatcher l'agent `superpowers:code-reviewer` sur le diff complet (css/main.css + index.html). Corriger les bloquants. Ne PAS dire « prêt à tester » avant un audit PASSANT.

- [ ] **Step 6: Livraison**

Pousser la branche `feat/reskin-propryo` (css/main.css) ; intégrer les morceaux `index.html` via `.index-queue` (maître FIFO). Mettre à jour `BACKLOG.md` (statut + version) immédiatement.

---

## Self-review (couverture du spec)

- §4 mapping tokens clair → **Task 1** ; sombre → **Task 2**. ✅
- §3/§5 corail accent + anti-aplat → **Task 5**. ✅
- §3 typo → **Task 4**. ✅
- §6.1 collapse 3→2 modes → **Task 3**. ✅
- §6.2 logo « ImmoTrack » gardé → **rien à faire** (hors périmètre, conforme). ✅
- §7 couleur=sens → **Task 6** (tokens déjà bons via Task 1/2 ; tendances en Task 6). ✅
- §8 bouton Retour → **Task 7**. ✅
- §11 vérif (parité, AA, anti-aplat, Retour, code-reviewer) → **Task 8**. ✅
- §10 coordination .index-queue + worktree → **Préalables + Task 0 + tâches index.html**. ✅
