# Sous-menus dépliables dans la sidebar (chantier NAV-SOUS-MENUS)

**Date** : 2026-07-16
**Statut** : design validé (variante A)
**Socle** : refonte navigation `_V4_NAV_MODEL` / `_NAV_GROUPS` (v15.456, déployée `origin/main`)
**Mockup validé** : `mockups/nav-sous-menus/index.html` (variante A, 3 formats, clair/sombre)

---

## 1. Problème

La refonte nav a regroupé ~14 onglets plats en **8 onglets-parents / 3 zones**. Cinq de ces parents « représentent » un **groupe de pages sœurs** (modèle `_NAV_GROUPS`, `index.html:7667`) : leurs sous-pages n'apparaissent aujourd'hui **que comme une barre de sous-onglets in-page** (`_navSubtabsHtml`, `index.html:7720`), donc invisibles dans la sidebar tant qu'on n'a pas cliqué dans le parent.

Retour utilisateur : *« On a regroupé différents onglets sous un seul onglet, mais maintenant ça manque de visuel. Je voudrais des ouvertures de sous-menus (possible de laisser ouvert) pour chaque onglet. »*

**But** : exposer les sous-pages de chaque groupe comme un **sous-menu dépliable directement dans la sidebar**, qui reste ouvert entre les sessions, sans recréer aucune page.

## 2. Périmètre

Les 5 onglets-groupes concernés (source = `_NAV_GROUPS`) :

| Onglet sidebar (parent) | Sous-pages (enfants existants) |
|---|---|
| **Pilotage** (`dashboard`) | Tableau de bord (`dashboard`) · Finances (`finances`) · Suivi (`pilotage`) |
| **Locataires** (`baux`) | Baux en cours (`baux`) · Candidatures (`candidats`) |
| **Agenda** (`agenda`) | Agenda (`agenda`) · Équipements (`equipements`) |
| **Loyers & mouvements** (`loyers`) | Mouvements (`loyers`) · Quittances (`quittances`) |
| **Révisions** (`irl`) | Loyer / IRL (`irl`) · Charges (`regul`) |

Onglets **autonomes** (aucun sous-menu, inchangés) : Accueil, Logements (`biens`), États des lieux (`edl`).

**Hors périmètre** : toute refonte de l'archi Pilotage/Suivi/Gestionnaire (= chantier B distinct). Ici on ne touche qu'à la **présentation nav** — 0 page fusionnée, 0 moteur de calcul.

## 3. Décisions de conception (validées avec l'utilisateur)

- **Comportement = Variante A — Accordéon multi, persistant.** Plusieurs groupes peuvent rester dépliés simultanément. **Rien ne se referme automatiquement** quand on navigue. L'utilisateur seul déplie/replie (chevron).
- **Persistance** : ensemble des groupes ouverts stocké en **`localStorage` par appareil** (clé via `_lsKey('immo_nav_open')`, cohérent avec le menu perso `_menuGetOn`). *(Pas `DB.params` : préférence d'affichage locale, non synchro cloud.)*
- **État initial** (aucune valeur stockée) : seul le groupe de la page courante est déplié.
- **Clic parent** : le **label + l'icône** naviguent vers la 1re page-enfant visible (`_navSidebarLanding`) **et** ouvrent le groupe ; le **chevron seul** déplie/replie **sans naviguer**.
- **Barre de sous-onglets in-page conservée** (`_navSubtabsHtml` inchangé) — additif, double point d'entrée, zéro risque de régression.
- **Compatibilité menu perso** : un enfant masqué par le menu perso disparaît du sous-menu ; si un groupe tombe à **< 2 enfants visibles**, le parent **redevient un lien simple** (pas de chevron ni de sous-menu) — même règle que `_navSubtabsHtml` (`tabs.length < 2 → ''`).
- **3 formats** : PC/tablette = sidebar dépliable ; téléphone = bottom-nav inchangé (5 cibles) + sous-menus en **accordéon dans la feuille « Plus »**. Clair + sombre.
- **Design system** : réutilisation des tokens et classes `.v4s-*` existants ; aucun composant « à part ». Icônes = line-icons `currentColor` (icônes enfants tirées de `_V4_NAV_ICONS`).
- **Legacy** : le mécanisme mort `_toggleSidebarSection` (ancienne sidebar) n'est **pas** ressuscité ; on branche exclusivement sur `_V4_NAV_MODEL` / `_NAV_GROUPS`.

## 4. Architecture

### 4.1 Modèle (réutilisé, non dupliqué)
- `_NAV_GROUPS` (`index.html:7667`) reste **la source unique** parent → enfants.
- `_NAV_PAGE_GROUP` (`:7674`) : page → son groupe.
- `_navSidebarRep` (`:7678`) : page courante → id du parent qui la représente (surlignage).
- `_navSidebarLanding` (`:7685`) : parent → 1re page-enfant encore visible (cible de clic).
- `_menuGetOn` (`:7708`) / `_menuItemVisible` (`:7714`) : filtre menu perso.
- `_V4_NAV_ICONS` (`index.html:8388`) : icônes SVG (parents + enfants).

### 4.2 Fonction pure testable (nouvelle)
`navSubmenuModel(page, menuOn, openSet)` → pour un item de nav donné, renvoie l'objet de rendu :
```
{ kind: 'link' | 'group', parentActive, children:[{id,lb,ic,active}], open }
```
Règles encapsulées : filtrage enfants par `menuOn`, dégradation en `link` si `< 2` enfants visibles, calcul `parentActive` (via `_navSidebarRep`), calcul `open` (groupe ∈ openSet **OU** groupe de `page` si openSet vide au 1er chargement). **Sans DOM ni localStorage** → mirror inline + `__tests__/helpers/nav-submenu.js` + tests Vitest (cf. §7).

### 4.3 État persistant (nouveau, minimal)
- `_navOpenKey()` → `_lsKey('immo_nav_open')`.
- `_navOpenGet()` : lit le tableau d'ids groupes ouverts ; défaut = `null` (→ le modèle ouvre le groupe courant).
- `_navOpenSet(setArr)` : persiste.
- `_navToggleGroup(groupId)` : bascule l'appartenance + persiste + met à jour le DOM (classe `.open` sur le parent + `max-height` du `.v4s-sub`), **sans re-render complet** (évite le flicker).

### 4.4 Points de greffe (modifs)
1. **`_v4NavHtml(counts, candUnread, showDash)`** (`index.html:8472`) — pour chaque item de `_V4_NAV_MODEL`, appeler `navSubmenuModel` ; si `kind==='group'`, émettre : rangée parent (icône + label cliquables `go(landing)` + `<span class="v4s-chev">` `onclick` → `_navToggleGroup`) **suivie** d'un `<div class="v4s-sub">` contenant les enfants (`go(childId)`). Sinon, rendu lien actuel inchangé.
2. **`go(page, elNav)`** (`index.html:7731`) — après la mise à jour du surlignage existant, appeler `_navSyncSubmenu(page)` : s'assure que le groupe de `page` est ouvert (ajout à openSet + persist) et met à jour les classes `.act` des enfants + `.open`/`has-active` du parent. (N'introduit pas de re-render complet.)
3. **`_renderPlusSheet` / feuille « Plus »** (`index.html:7895`) — même logique de rendu enfants en accordéon (réutilise `navSubmenuModel`).
4. **`css/main.css`** — ajouter le bloc `.v4s-sub`, `.v4s-a .v4s-chev`, `.v4s-child` (cf. §5), sous le sélecteur `body[data-dash-v4="on"]`, en réutilisant `--sur2/--sur3/--bor/--t2/--t3/--cta`.

### 4.5 Ce qu'on ne touche pas
- `_navSubtabsHtml` (barre in-page) — conservée telle quelle.
- `_renderSidebarV4` (`:8492`) — structure inchangée hors du `<nav>` peuplé par `_v4NavHtml`.
- Le routeur `go()` et les pages `#p-<id>` — 0 page fusionnée.

## 5. CSS (extension, tokens réutilisés)
```css
body[data-dash-v4="on"] .v4s-sb-nav .v4s-a .v4s-chev{
  margin-left:auto;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;
  color:var(--t3);border-radius:5px;transition:transform .18s ease,background .15s;flex:0 0 auto}
body[data-dash-v4="on"] .v4s-sb-nav .v4s-a .v4s-chev svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.4}
body[data-dash-v4="on"] .v4s-sb-nav .v4s-a.open .v4s-chev{transform:rotate(90deg)}
body[data-dash-v4="on"] .v4s-sb-nav .v4s-a.has-active .v4s-ic{color:var(--cta)}
body[data-dash-v4="on"] .v4s-sub{max-height:0;overflow:hidden;transition:max-height .22s ease}
body[data-dash-v4="on"] .v4s-a.open + .v4s-sub{max-height:240px}
body[data-dash-v4="on"] .v4s-sub-in{margin-left:19px;padding-left:12px;border-left:1.5px solid var(--bor)}
body[data-dash-v4="on"] .v4s-child{display:flex;align-items:center;gap:9px;padding:6px 9px;border-radius:7px;
  color:var(--t3);font-size:12px;font-weight:500;position:relative;cursor:pointer}
body[data-dash-v4="on"] .v4s-child .v4s-ic{width:14px;height:14px;color:var(--t3)}
body[data-dash-v4="on"] .v4s-child:hover{background:var(--sur2);color:var(--t1)}
body[data-dash-v4="on"] .v4s-child.act{background:var(--acc-soft,rgba(255,106,74,.13));color:var(--t1);font-weight:600}
body[data-dash-v4="on"] .v4s-child.act .v4s-ic{color:var(--cta)}
body[data-dash-v4="on"] .v4s-child.act::before{content:"";position:absolute;left:-13.5px;top:6px;bottom:6px;width:2px;background:var(--cta);border-radius:2px}
```
(Le chevron réutilise le motif `polyline 9 18 15 12 9 6` de `_V4_NAV_ICONS`, rotation 90° à l'ouverture. La barre active enfant reprend `.v4s-a.act::before`.)

## 6. Accessibilité
- Parent groupe : `aria-expanded` sur le chevron (`true`/`false`), `role="button"`, cible tactile ≥ 40 px (padding existant `.v4s-a` = 8 px + 16 px icône OK ; vérifier le chevron mobile).
- Sous-menu : conteneur `role="group"`, `aria-label` = nom du parent.
- Navigation clavier : chevron focusable (Tab), Enter/Espace = toggle.

## 7. Tests
- **Vitest (pur)** — `__tests__/helpers/nav-submenu.test.js` sur `navSubmenuModel` :
  - groupe à 2+ enfants visibles → `kind:'group'`, enfants filtrés corrects, `open` selon openSet ;
  - groupe réduit à < 2 enfants par le menu perso → `kind:'link'` (pas de chevron) ;
  - `parentActive` correct quand la page courante est un enfant ;
  - openSet vide (1er chargement) → seul le groupe de la page courante ouvert ;
  - item autonome (biens/edl/accueil) → `kind:'link'`.
- **Smoke navigateur (manuel, mockup + prod déployée)** : déplier 2-3 groupes, naviguer → restent ouverts ; recharger → état conservé (localStorage) ; masquer une page via menu perso → enfant disparu / groupe dégradé ; 3 formats (PC/tablette/téléphone feuille Plus) ; clair + sombre.
- **Audit `superpowers:code-reviewer`** obligatoire avant « prêt à tester » (règle gravée).

## 8. Livraison
- Sandbox-first : `index-test.html` d'abord si applicable, puis `index.html` après OK user.
- Bump version `v15.X` (title + footer + `sw.js`) à `origin+1`.
- Scan noncaractères avant push. Rebase `origin/main`, `git push origin HEAD:main` (ou file `.index-queue/QUEUE.md` si session maître active sur `index.html`).
- BACKLOG.md mis à jour (statut + version + commit `Pilotage : …`).

## 9. Risques / points de vigilance
- **`go()` est appelé très souvent** : `_navSyncSubmenu` doit être O(1)/léger (toggle de classes ciblé, pas de re-render de toute la sidebar).
- **Hauteur `max-height` figée** (`240px`) : suffisante pour 3 enfants ; si un groupe dépasse, prévoir `max-height` calculé ou valeur généreuse.
- **Double surlignage** : veiller à ce que le parent (`.act` via `_navSidebarRep`) et l'enfant courant (`.v4s-child.act`) soient cohérents (parent = `has-active`, pas `act` plein s'il y a un enfant actif — à cadrer en plan).
- **Feuille « Plus » mobile** : l'accordéon doit fonctionner dans un conteneur `overflow:auto` (transitions `max-height` OK).
