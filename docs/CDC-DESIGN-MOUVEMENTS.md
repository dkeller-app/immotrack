# CDC DESIGN — Onglet Mouvements

**Statut : VALIDÉ par Didier le 2026-08-18.** Fait foi pour le chantier code.
Périmètre : re-skin de `#p-loyers` (Loyers & Mouvements). **Aucune fonctionnalité n'est ajoutée, retirée ou déplacée** — le fonctionnel reste régi par `docs/CDC-IMPORT.md`, `docs/CDC-FINANCES.md`, `docs/CDC-V1-LIGHT.md`.

Sources de la décision :
- `mockups/MOUVEMENTS-CHARTE/audit-charte.html` — 19 écarts, avant/après rendus en vrai DOM
- `mockups/MOUVEMENTS-CHARTE/mouvements-reskin.html` — écran re-skiné, 3 formats × clair/sombre × 7 états
- `docs/charte-graphique-propryo.md` — charte validée 2026-06-19

---

## 1. Décisions TRANSVERSES (valent pour tous les onglets, pas seulement Mouvements)

### 1.1 Échelle typographique — 7 crans, VALIDÉE

> **Amendée le 18/08 en séance design Finances** : un 7ᵉ cran `--fs-hero` a été ajouté. L'échelle avait
> été dérivée de Mouvements, un écran de liste sans grand chiffre ; Finances aligne sept tailles de
> chiffres (héro 40, KPI 27, drill 22, ratios 21, alerte 18, décomposition 17, fuite 16) et son grand
> chiffre de héro est une décision validée en séance (`mockups/FINANCES-PNL-REVUE/hero-AB.html`).
> Plutôt que laisser chaque page réinventer son 40, son 38 ou son 27, l'exception est **nommée** :
> - `--fs-hero` = **36 px** Schibsted 800 — **l'unique** grand chiffre d'une page, au plus un par écran ;
> - les chiffres de carte (27 / 22 / 21) descendent sur `--fs-h1` = 20 px, même police, même graisse ;
> - les autres (18 / 17 / 16) descendent sur `--fs-num` = 16 px.
>
> Finances passe ainsi de 7 tailles de chiffres à 3. Mouvements n'utilise pas `--fs-hero`.

La charte ne définissait **aucune** taille, graisse ni interligne. C'est une lacune de la charte, pas seulement du code : la décision ci-dessous doit **remonter dans `docs/charte-graphique-propryo.md`** (à faire par le pilotage, pas par la session design).

| Token | Valeur | Famille / graisse | Usage |
|---|---|---|---|
| `--fs-hero` | 36 px | Schibsted Grotesk 800 | l'unique grand chiffre d'une page — **au plus un par écran**. Non utilisé sur Mouvements |
| `--fs-h1` | 20 px | Schibsted Grotesk 800 | titre d'écran, **et chiffre de carte** (KPI, ratio, récap de drill) |
| `--fs-num` | 16 px | Schibsted Grotesk 800 | chiffre clé, totaux |
| `--fs-md` | 14 px | Inter 600 | texte fort, libellé de ligne |
| `--fs-base` | 13 px | Inter 400 | corps de tableau |
| `--fs-sm` | 12 px | Inter 400 | méta, secondaire |
| `--fs-xs` | 10,5 px | Inter 800, capitales, `letter-spacing:.07em` | étiquettes, en-têtes de colonne |

Règles d'application :
- les 6 tokens sont posés dans `:root` ; **aucune taille de police en dur ailleurs**, dans `css/main.css` comme en style inline dans `index.html` ;
- mobile : **mêmes crans**, on monte simplement d'un cran le libellé et le montant de la ligne ;
- cette échelle a été choisie parce qu'elle déplace le moins de choses (13 px de corps de tableau contre 13,5 aujourd'hui).

État actuel corrigé : 9 tailles posées une par une (17 / 15 / 14,5 / 13,5 / 12,5 / 12 / 11,5 / 11 + variantes mobiles), et `--font-base:17px` (`css/main.css:31`) n'est utilisé nulle part sur cet écran.

### 1.2 Polices — vendorisation et purge, VALIDÉE

Inventaire mesuré avant décision :

| Famille | Chargée aujourd'hui | Références réelles | Décision |
|---|---|---|---|
| Manrope | oui | 86 | **supprimée** → Schibsted Grotesk |
| Inter | oui | 65 | conservée (charte) |
| JetBrains Mono | oui | 24 | **supprimée** → stack mono système |
| IBM Plex Sans | oui | 19 | **supprimée** → Inter |
| Schibsted Grotesk | oui | 3 (dont le token) | conservée — aujourd'hui chargée pour rien, `--display` n'a aucun consommateur |
| IBM Plex Mono | **non** | 1 | **supprimée** — déjà inopérante, elle tombe sur Menlo |

Décisions :
1. **Vendoriser 2 fichiers variables, sous-ensemble latin**, avec `@font-face` local et `font-display:swap` :
   - Inter variable (~100 ko, couvre 400→700)
   - Schibsted Grotesk variable (~45 ko, couvre 700/800) — licence OFL
   - total ≈ 145 ko, contre 5 familles distantes aujourd'hui.
2. **Mono = stack système** : `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`. 0 ko, aucune dépendance. Le mono ne porte l'identité nulle part (références, IBAN, extraits de code) et la charte ne le nomme pas.
3. **Couper les DEUX points de chargement distant**, pas un :
   - `index.html:18-21` — 2 `preconnect` + le `<link>` Google Fonts des 5 familles
   - `js/app/supabase-entry.js:1421-1424` — injecte **en plus** un second lien Google Fonts (Schibsted + Inter)
   Conforme à la règle projet « aucun CDN au runtime » (`js/vendor/` contient déjà Supabase et XLSX pour cette raison).

**Point de vigilance à lever pendant le chantier :** Manrope porte notamment `.tbl .num` (`css/main.css:2100`), qui s'appuie sur `font-variant-numeric:tabular-nums`. La présence de chiffres tabulaires dans Schibsted Grotesk **n'est pas vérifiée**. Règle retenue d'emblée, qui évite le risque :
- **Schibsted Grotesk** uniquement pour les titres et les chiffres clés **isolés** (`--fs-h1`, `--fs-num`) ;
- **Inter en `tabular-nums`** pour **toutes les colonnes de tableau**.
Les colonnes de montants restent alignées quoi qu'il arrive.

---

## 2. Les 19 écarts retenus

Tous validés. Aucun écart écarté.

| # | Écart | Décision |
|---|---|---|
| a1 | 5 familles chargées depuis un CDN | § 1.2 |
| a2 | aucun composant n'utilise les polices de la charte | 3 remplacements globaux dans `css/main.css` : Manrope → Schibsted, IBM Plex Sans → Inter, IBM Plex Mono → mono système |
| a3 | 9 tailles, aucune échelle | § 1.1 |
| b1 | l'écran n'a pas de titre | bloc titre + phrase, sur le modèle de `#p-candidats` (`index.html:381-384`). Titre « Mouvements », sous-titre « Tout ce qui est entré et sorti de tes comptes — la source du **payé**. » (modèle 2 sources, `docs/CDC-FINANCES.md`) |
| b2 | totaux = le texte le plus discret de la page | étiquette `--fs-xs` capitales `--t3`, valeur Schibsted 800 à `--fs-num`, chiffres tabulaires. Reprise de la mise en forme du mockup déjà validé `mockups/MOUVEMENTS-REGLES/page-mouvements.html`. **Aucun calcul ne change** (le solde reste supprimé, cf. CDC ⑨.3) |
| c1 | liseré corail sur chaque carte mobile (×15) | liseré `var(--bor2)` neutre par défaut, teinté `--ora` **uniquement** quand `_mvEtatLabel(m)` renvoie « à classer » ou « non affecté ». La fonction existe déjà (`index.html:16795`) et sert déjà au filtre État — on la réutilise, on ne la recopie pas |
| c2 | `--blu` contient du corail | renommer `--blu` → `--acc` partout (même valeur, remplacement sûr), puis reprendre un par un les 6 composants qui s'en servaient comme d'un bleu |
| c3 | survol corail 4 % en dur, invisible en sombre | `.tbl tr:hover td{background:var(--sur2)}` (`css/main.css:2102`). Le survol est un état neutre, pas une sélection |
| d1 | popover peint sur `--bg` | `background:var(--sur)` + `box-shadow:var(--shadow-lg)` (`index.html:310`). Les deux tokens existent déjà |
| d2 | badges à fond `rgba()` figé, jamais redéfini en sombre | une paire de tokens par couleur sémantique (`--ora` / `--ora-bg`, etc.) redéfinie dans les **deux** thèmes, puis `.badge.ora{background:var(--ora-bg);color:var(--ora);border:1px solid var(--ora)}` (`css/main.css:2288-2294`). La bordure est ce qui rend le badge lisible en sombre |
| d3 | le thème de boot n'existe pas en CSS | `index.html:2` démarre sur `data-theme="light"` et **aucun bloc `[data-theme="light"]` n'existe** dans `css/main.css`. Les 12 tokens `--cta`, `--cta-h`, `--cta-text`, `--pos`, `--pos-soft`, `--neg`, `--neg-soft`, `--warn`, `--warn-soft`, `--info`, `--info-soft`, `--acc2` ne sont définis que dans `[data-theme="sobre"]`, `[colore]` et `[dark]` — jamais dans `:root`. Correction : les faire descendre dans `:root`. **Portée exacte, vérifiée le 18/08 :** `_normalizeTheme()` (`index.html:8323`) mappe `'light'` → `'sobre'`, et le défaut est `'dark'` (`index.html:8364`) — l'attribut n'est donc **jamais laissé sur `light` en fonctionnement**. L'écart est un **flash au boot** (entre le parse du HTML et l'exécution de l'init du thème), pas un état permanent. Il reste à corriger — sur une page dont les couleurs sémantiques *sont* le contenu, le flash est visible — mais il ne justifie pas de passer en tête de lot pour cette raison |
| e1 | 5 rayons de bordure sur un écran | échelle de rayons unique, même principe que l'échelle typo |
| e2 | la barre du haut mélange « filtrer » et « agir » | un filet vertical entre le 7ᵉ et le 8ᵉ contrôle + retirer les émojis des 3 boutons d'action (l'icône 🏦 ne reste que sur le **filtre** Compte). **Aucun contrôle ne change de place** — le CDC ⑨.4 (« on ne déplace rien ») reste respecté. Le regroupement des actions dans un menu « ⋯ » a été examiné et **non retenu** |
| f1 | aucun état vide | branche `if (!mvs.length)` émettant une ligne `<td colspan="7">` dans `rMv()` (`index.html:16871`). Le CSS l'attend déjà (`css/main.css:2548`) et n'a jamais rien reçu. **Deux versions** : filtre sans résultat / app neuve |
| f2 | compteur « à finir de classer » jamais livré | rétabli via `_mvEtatLabel(m)`. Rattrapage d'un mockup déjà validé, pas une nouveauté |
| f3 | pas d'état « ligne sélectionnée » | **ajout validé** — un seul état, « dernière ligne ouverte » : `openEditMv(id)` mémorise l'id, `rMv()` repose la classe et fait un `scrollIntoView` si la ligne est hors écran. Fond `--acc-soft` + filet corail 3 px à gauche. **Pas de sélection multiple, pas de cases à cocher** : le CDC ⑦.6 les a explicitement écartées |
| g1 | onglets et en-têtes inatteignables au clavier | `.tab` → `<button role="tab" aria-selected>` ; en-têtes filtrants → `<th><button class="th-filter">`. Aujourd'hui ce sont des `div`/`th` porteurs de `onclick`, dont les règles `:focus-visible` sont mortes. ⚠️ **Correction de l'audit** : celui-ci renvoyait à `index.html:163-165` comme « modèle déjà en place et validé » — c'est faux. Ces onglets-là portent bien `role="tab"` et `aria-selected`, mais **restent des `div`** : l'ARIA est posée sur un élément non focusable, ce qui est pire que rien (un lecteur d'écran l'annonce comme un onglet, le clavier ne l'atteint pas). Mesuré dans toute l'app : **56 `<div class="tab">`, 0 `<button class="tab">`, 0 `tabindex`, 3 `<th onclick>`**. Il n'existe donc aucun modèle correct à copier — il faut en poser un. Voir § 4, lot 4 |
| g2 | 2 conventions de focus, aucune n'est celle de la charte | un token `--focus-ring` unique (`0 0 0 3px var(--acc-soft)` + `outline:2px solid var(--acc)`) appliqué à tous les `:focus-visible`. Le corail sur le focus est un usage **explicitement prévu** par la charte |
| g3 | actions en émojis nus, croix des filtres actifs non-bouton | line-icons `currentColor` + `aria-label` explicites incluant la date et le libellé du mouvement ; la croix devient un vrai `<button>`. Conforme à la règle projet : line-icons propres, **on garde la couleur qui différencie** (pastilles teintées par catégorie, états) |

---

## 3. Ce qui NE change pas

Garde-fous. Un chantier qui touche à l'un de ces points sort du CDC.

- **Aucun contrôle ne change de place** dans la barre du haut (CDC ⑨.4).
- **Aucun calcul ne change.** Le « solde » reste supprimé — additionner un dépôt de garantie, un loyer, du capital de prêt et des charges récupérables ne produit rien d'interprétable (CDC ⑨.3). Les totaux restent une **somme de contrôle**, Finances reste maître des KPI.
- **Les 7 colonnes restent les 7 colonnes** : Date · Libellé · Catégorie · Affectation · Montant · Facture · Actions. Le CSS mobile les positionne par `nth-child` (`css/main.css:2509-2552`) — tout déplacement de colonne casse le mobile dans le même geste.
- **Pas de sélection multiple, pas de tableau éditable** (CDC ⑦.6).
- **Pas d'import bancaire par staging sur cette page** — il passe par « Importer banque » (CDC ⑦.6).
- Les tokens clairs et sombres de `css/main.css` **sont déjà conformes** à la charte (dark : `css/main.css:155-200`). Le problème n'est pas la palette, ce sont les composants qui ne l'utilisent pas. **Ne pas retoucher les palettes.**
- `index.html` doit rester en **CRLF** (le tooling le reflippe LF → casse la parité `data-defaults`).

---

## 4. Ordre de chantier

Quatre lots. **L'ordre est contraignant** : chaque lot dépend du précédent.

### Lot 0 — Socle de tokens (TRANSVERSE, bloque tout le reste)
Écarts **d3, a3, e1, c2, g2, d2**.
Touche `css/main.css` globalement, sans rien changer visuellement à fonctionnalité constante — c'est ce qui rend les lots suivants écrivables.
1. faire descendre les 12 tokens orphelins dans `:root` (d3) ;
2. poser les 6 tokens de taille (a3) et l'échelle de rayons (e1) ;
3. renommer `--blu` → `--acc` partout (c2) ;
4. poser `--focus-ring` (g2) et les paires `--X` / `--X-bg` des couleurs sémantiques (d2).

### Lot 1 — Polices (TRANSVERSE, dépend du lot 0)
Écarts **a1, a2**.
Vendoriser les 2 fichiers variables, couper les 2 points de chargement distant, passer les 3 remplacements globaux.
**Vérification obligatoire avant de clore le lot :** les colonnes de montants restent alignées (`tabular-nums` sur Inter, cf. § 1.2).

### Lot 2 — Mouvements, conformité charte
Écarts **b1, b2, c1, c3, d1, e2**.
Premier lot où l'écran change de visage. Le CSS mobile par `nth-child` est repris **dans le même lot** que c1 — il ne peut pas être traité à part.

### Lot 3 — Mouvements, états
Écarts **f1, f2, f3**.
Les trois états qui manquent : vide (×2 versions), compteur « à finir de classer », dernière ligne ouverte.

### Lot 4 — Mouvements, accessibilité
Écarts **g1, g3**.
`div`/`th` cliquables → vrais boutons, émojis → line-icons + `aria-label`.

**Ce lot pose un composant, il ne fait pas que corriger un écran.** Il n'existe aujourd'hui aucun onglet correct dans l'app à recopier : 56 `<div class="tab">`, 0 `<button class="tab">`, 0 `tabindex`, 3 `<th onclick>`. Le lot doit donc produire **un composant onglet unique et réutilisable** (`<button role="tab">` + `aria-selected` + `--focus-ring` du lot 0), l'appliquer aux 3 onglets de Mouvements, et le laisser disponible pour les 55 autres. Les autres onglets sont **hors périmètre de ce CDC** — ils seront repris tab par tab, chacun dans son propre CDC design. Ne pas convertir les 56 d'un coup dans ce lot.

### Conditions communes à tous les lots
- worktree dédié, **jamais de commit depuis `Desktop\Immo`** (hook auto-push prod) ; worktree détruit après intégration ;
- bump de version `index.html` (title + footer) + message de commit à chaque lot livré ;
- audit par l'agent `superpowers:code-reviewer` **avant** de dire « prêt à tester » — les lots 0 et 1 sont transverses, ils y passent obligatoirement ;
- smoke user sur les **3 formats**, en clair **et** en sombre ;
- `BACKLOG.md` mis à jour **à la livraison de chaque lot**, pas en fin de session.

---

## 5. Références

| Quoi | Où |
|---|---|
| Audit, 19 écarts avant/après | `mockups/MOUVEMENTS-CHARTE/audit-charte.html` |
| Écran re-skiné, 3 formats × 2 thèmes × 7 états | `mockups/MOUVEMENTS-CHARTE/mouvements-reskin.html` |
| Mise en forme des totaux (b2) | `mockups/MOUVEMENTS-REGLES/page-mouvements.html` |
| Charte | `docs/charte-graphique-propryo.md` |
| Fonctionnel de l'écran | `docs/CDC-IMPORT.md` (⑦.6, ⑨.1, ⑨.3, ⑨.4) |
| Modèle 2 sources (le « payé ») | `docs/CDC-FINANCES.md` |
| Markup de l'écran | `index.html:292-356` |
| Rendu des lignes | `index.html:16830` (`rMv()`) |
| CSS tableau / badges / mobile | `css/main.css:2091-2105`, `2288-2294`, `2509-2552` |
