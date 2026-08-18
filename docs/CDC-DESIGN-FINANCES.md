# CDC DESIGN — Onglet Finances

**Statut : VALIDÉ par Didier le 2026-08-18.** Fait foi pour le chantier code.
Périmètre : re-skin de `#p-finances`. **Aucune fonctionnalité n'est ajoutée, retirée ou déplacée** — le fonctionnel est régi par `docs/CDC-FINANCES.md`, figé le 14/08 après revue ligne par ligne.

Sources de la décision :
- `mockups/DESIGN-ONGLETS/FINANCES-RESKIN.html` — l'onglet re-skiné, 4 formats × 2 thèmes × 4 états
- `mockups/DESIGN-ONGLETS/FINANCES-COULEUR-AVANCE.html` — arbitrage de la 5ᵉ couleur sémantique
- `mockups/DESIGN-ONGLETS/CHARTE-CALIBRATION-CLAIR.html` — calibration du mode clair
- `docs/CDC-FINANCES.md` — structure cible (§8), lignes (§4ter), code couleur (§5), responsive (§5bis)
- `docs/charte-graphique-propryo.md`

---

## 0. Cadrage — ce CDC vise la structure CIBLE, pas la page d'aujourd'hui

Le chantier Finances **étape 2 (rebranchement) n'est pas codé**. L'étape 1 « socle » est dans main depuis le 17/08 mais ses modules ne sont pas branchés. Le CDC fonctionnel prévoit **5 blocs supprimés, 2 lignes ajoutées**, le bloc « Argent à récupérer » retiré et les drills revus : la page actuelle va être largement vidée.

**Conséquence, et c'est la recommandation la plus importante de ce document :**

> Le re-skin **ne doit pas être un chantier séparé qui repasserait après l'étape 2**. Il doit être **intégré à l'étape 2**, qui réécrit déjà le rendu de la page. Traiter les deux séparément revient à écrire deux fois le même CSS, et à re-skiner du code qui sera supprimé la semaine suivante.

Les lots **0 (tokens)** et **1 (polices)** du CDC Mouvements restent des préalables communs aux deux onglets — ils passent avant, et ils ne dépendent pas de l'étape 2.

---

## 1. Amendements à la CHARTE (transverses — ils dépassent Finances)

Deux décisions prises en séance design le 18/08. Elles amendent `docs/charte-graphique-propryo.md` et leur place de chantier est le **lot 0**, avec les tokens. Le pilotage doit les faire remonter dans la charte.

### 1.1 Cinquième couleur sémantique — `--adv` (bleu = avance) · VALIDÉE

Le CDC Finances §5 ferme la palette à cinq couleurs — vert, rouge, gris, orange, **bleu** — avec une grammaire à deux supports qui ne se mélangent jamais : **la couleur du texte dit le flux**, **le fond de case dit le signalement**. La charte n'avait aucun bleu. `--info` (`#42506a` en clair) est un gris bleuté, et le gris a déjà un sens dans cette grammaire (« informatif, pas un flux ») : le faire porter l'avance aurait confondu les deux.

Candidat retenu **A (bleu)** contre **B (violet `--pur`)**, sur mesure de contraste :

| Couleur d'avance sur la surface | A · bleu | B · violet |
|---|---|---|
| Clair | **5,17:1** | 4,59:1 |
| Sombre | **7,35:1** | 4,54:1 |

Valeurs (après calibration §1.2) :

| Token | Clair | Sombre |
|---|---|---|
| `--adv` | `#2e6db1` | `#7ab6ea` |
| `--adv-bg` | `rgba(46,109,177,.12)` | `rgba(122,182,234,.16)` |

La règle « corail = accent uniquement » n'est pas touchée : une couleur de donnée n'est pas un accent, exactement comme `--pos` et `--neg` n'en sont pas.

### 1.2 Calibration des couleurs sémantiques du mode clair · VALIDÉE (option 1)

**Mesuré** : la grammaire du CDC §5 demande du texte coloré posé sur un fond teinté. En mode clair, **aucune** de ces combinaisons n'atteignait le seuil AA de 4,5:1 — et l'orange de la charte ne l'atteignait pas non plus **seul sur blanc**, indépendamment de Finances.

| Pire cas, mode clair | Verdict |
|---|---|
| Charte actuelle | **3,15** — sous le seuil |
| Option 1 · assombrir les couleurs | **4,53** — tout passe |
| Option 2 · variante « sur fond » | 3,69 — les cellules passent, **l'orange sur blanc reste faux** |
| Option 3 · alléger les fonds | 3,41 — **insuffisant**, et le signalement s'efface |

**Option 1 retenue.** Teinte et saturation conservées à l'identique, seule la luminosité descend, du strict minimum. Valeurs **dérivées par le mockup**, pas choisies :

| Token | Avant | Après |
|---|---|---|
| `--pos` | `#1a8f6f` | `#16795e` |
| `--neg` | `#d23f3f` | `#c92f2f` |
| `--warn` | `#b27a12` | `#8f620e` |
| `--adv` | `#2f6fb5` | `#2e6db1` |

En **mode sombre**, un seul ajustement : `--neg` `#ff7a7a` → `#ff7f7f` (le rouge sur fond de retard était à 4,41, il passe à 4,56). Tout le reste est entre 5 et 9.

**Portée : toutes les surfaces de l'app en mode clair** — badges, alertes, pastilles d'échéance — pas seulement Finances. Point de vigilance assumé et vu en séance : `#8f620e` tire nettement plus vers le brun que `#b27a12`, et c'est la couleur du retard, très présente.

### 1.3 Rappel — `--fs-hero`, 7ᵉ cran typographique

Ajouté le 18/08 à cause de cet onglet. Détail dans `CDC-DESIGN-MOUVEMENTS.md` §1.1. Finances aligne aujourd'hui **sept tailles de chiffres** (héro 40 / mobile 32 / KPI 27 / drill 22 / ratios 21 / alerte 18 / décomposition 17 / fuite 16) ; elles descendent sur **trois crans** : `--fs-hero` 36 px pour l'unique grand chiffre, `--fs-h1` 20 px pour les chiffres de carte, `--fs-num` 16 px pour le reste.

---

## 2. Les écarts de l'onglet Finances

Tous validés. `--` = pas d'équivalent Mouvements.

### A · Typographie

| # | Écart | Décision |
|---|---|---|
| F-a1 | polices écrites en dur — `'Inter'` littéral ~20 fois, `'Manrope'` 8 fois, jamais `var(--font)` / `var(--display)`. **Manrope porte TOUS les chiffres de l'onglet** | remplacement global, cf. lot 1 |
| F-a2 | ~14 tailles de police sur la surface Finances | les 7 crans ; 7 tailles de chiffres → 3 |
| F-a3 | une seule occurrence de tout l'onglet utilise `var(--display)` (`#ov-dash-drill .fdr-recap .big`) — le reste écrit la famille en dur | cohérence par les tokens |

### B · Couleurs en dur et corail

**24 couleurs en dur** sur `index.html:51195-52150`.

| # | Écart | Décision |
|---|---|---|
| F-b1 | **cinq bleus qui n'appartiennent à aucune palette Propryo** : `#5c8aff` ×3 (liens et chevron « › » des lignes cliquables), `#2563eb` (badge `.b4-tag`), `#1a4fb0`, `#185fa5`, `#cfe0fb`, `#eef4ff` — reste du design V4 | liens et chevrons → `--acc` ; le reste → tokens. Le CDC §5 avait déjà tranché la suppression du `#2563eb` (« 3ᵉ usage du bleu sans sens propre ») |
| F-b2 | **halo vert décoratif** `radial-gradient(rgba(52,211,153,.18))` + dégradé de surface `linear-gradient(135deg,--sur,--sur2)` sur le héro | supprimés. Surfaces neutres, la charte ne prévoit pas de décor coloré ; ce vert n'est dans aucune palette |
| F-b3 | **la barre de défilement des mois est peinte en corail** (`scrollbar-color:var(--acc)`, pouce de 13 px) | neutre (`--t3` sur `--sur3`), 10 px. Le corail est un accent, il ne peint pas le mobilier |
| F-b4 | survol de ligne `rgba(255,90,60,.06)` en dur sur `.b4-clk` | `var(--sur2)` — même correction que l'écart c3 de Mouvements |
| F-b5 | **le mois courant est peint en `--acc-soft`** (`index.html:52127`) | **voir §3.1 — c'est le défaut le plus grave de l'onglet** |

### C · Mode sombre

| # | Écart | Décision |
|---|---|---|
| F-c1 | **fonds quasi blancs sur les lignes du P&L** : `.b4-info{background:#fafcff}`, `.b4-locked{background:#f5f6f8}`, pastille du bouton bascule `::after{background:#fff}` — en sombre, **des lignes blanches dans un tableau noir** | tokens de surface (`--sur2` / `--sur3`), redéfinis dans les deux thèmes |
| F-c2 | badge `.b4-tag{background:#2563eb;color:#fff}` jamais redéfini en sombre | supprimé (cf. F-b1) |
| F-c3 | **six replis en dur** — `var(--pos-soft,…)`, `var(--warn,#b27a12)`, `var(--bor2,var(--bor))`, `var(--r,10px)`, `var(--rl,12px)`, `var(--bg-success,…)` : l'auteur savait que les tokens pouvaient manquer | les replis disparaissent une fois les 12 tokens orphelins descendus dans `:root` (écart d3 de Mouvements, lot 0) |
| F-c4 | **`var(--acc-hover)` utilisé 3 fois — ce token n'existe nulle part**, ni dans `css/main.css` ni dans `index.html`. Le repli s'applique toujours | remplacé par `--acc2`, qui existe |

### D · Densité

| # | Écart | Décision |
|---|---|---|
| F-d1 | **7 rayons de bordure** (20 / 14 / 12 / 10 / 9 / 8 / 7 / 6) | **3** : `--r` 8 px (contrôles), `--rl` 14 px (cartes), `--rp` 999 px (pastilles) |
| F-d2 | **trois valeurs de bascule** (760 / 680 / 480) pour une seule page, dont une dans un bloc CSS injecté séparément — entre 680 et 760 px (iPad portrait) les mois sont masqués alors que les ratios sont encore sur deux colonnes | **une seule valeur** (RS-3 du CDC). `repeat(3,1fr)` devient `1fr 1fr` : avec R-5 il n'y a plus que 2 ratios |

### E · États

| # | Écart | Décision |
|---|---|---|
| F-e1 | **aucun état vide** | **deux** états, rendus dans le mockup : « exercice vide » (le périmètre est bon, la période est creuse → changer d'exercice ou importer) et « app neuve » (explique le modèle 2 sources : le bail donne le dû, l'import donne le payé, aucune saisie comptable à faire) |
| F-e2 | **sous 680 px, la disparition des mois est muette** — `.b4-hint` est masqué par la même règle, on perd l'accès au détail mensuel **et** l'information qu'il existe | **RS-1** : sélecteur de mois dans l'en-tête de la carte, une colonne affichée, **cases toujours cliquables** (les popups restent accessibles sur téléphone) ; panneau droit masqué, ~230 px récupérés, le comparatif reste dans le popup. **RS-3** : message de repli visible |
| F-e3 | **aucune règle d'orientation ni de hauteur dans toute l'app** — seule la largeur décide | **RS-2**, règle à créer : sous ~480 px de haut (téléphone paysage), héro 36 → 22 px, jauges masquées, cartes resserrées. Sans ça, héro + ratios mangent les deux tiers de l'écran |
| F-e4 | **alignement des 3 panneaux cassé sur les lignes de groupe** | **voir §3.2 — trouvé en construisant le mockup** |

### F · Accessibilité

| # | Écart | Décision |
|---|---|---|
| F-f1 | **les commandes de Finances sont focusables mais n'ont aucun contour de focus** | la règle globale (`css/main.css:294-301`) ne liste que `.btn`, `.ni`, `.m-close`, `.sb-icon-btn`, `.sb-collapse-btn`, `.tbl tr[onclick]`, `.tb-menu`, `.tab`, `.tbl th[onclick]`. **Aucune commande de Finances n'y correspond** — ni `.leakrow`, ni les cellules du P&L (elles sont dans `.b4-pane`, pas `.tbl`), ni `.b4-toggle`, ni les ratios. On tabule dessus à l'aveugle. **Plus vicieux que sur Mouvements**, où les éléments n'étaient pas focusables du tout et où le navigateur les sautait. Corrigé par le token `--focus-ring` du lot 0, appliqué à `:focus-visible` sans liste d'exceptions |
| F-f2 | la couleur de focus est `var(--fg-info)`, un gris bleuté — pas le corail que la charte réserve explicitement au focus | `--focus-ring` en corail (écart g2 de Mouvements, même correction) |

**Bon point, vérifié et non supposé :** contrairement à Mouvements, les commandes de Finances **sont atteignables au clavier** — `.leakrow` porte `role="button" tabindex="0" onkeydown` (`index.html:52678`) et les cellules cliquables du P&L aussi (`index.html:51986`). Seul le retour visuel manque.

---

## 3. Les deux décisions design propres à cet onglet

### 3.1 · Le mois courant se marque dans l'EN-TÊTE, jamais dans les cases

**Le défaut le plus grave trouvé sur cet onglet**, et il n'était pas cosmétique.

L'app peint aujourd'hui la colonne du mois courant avec `--acc-soft` (`index.html:52127`), un corail soft rosé-orangé. Deux problèmes cumulés :

1. **Ça se lit comme une alerte** — première réaction de Didier devant le mockup : « on dirait qu'il y a un problème ! ». Le fond rosé-orangé se confond avec `--warn-bg`, le fond de retard.
2. **Ça écrase le vrai signalement.** Mesuré sur la case d'août de la ligne « Loyers encaissés », qui porte à la fois le mois courant et une avance :

| Variante | Fond réel de cette case |
|---|---|
| **En-tête seul** | `rgba(46,109,177,.12)` — le bleu d'avance, intact |
| Fond neutre `--sur2` | `#f7f8fb` — **signalement écrasé** |
| Corail (l'app aujourd'hui) | `#ffe7e0` — **signalement écrasé** |

Autrement dit : **un retard ou une avance survenus dans le mois en cours — les plus récents, ceux qui comptent le plus — sont invisibles aujourd'hui.**

La priorité CSS serait rattrapable ; le conflit de sens ne l'est pas. **Deux informations différentes se disputent le même canal visuel**, le fond de la case. Même priorité corrigée, une colonne teintée ferait lire différemment les cases de signalement qui sont dedans et celles qui sont dehors.

**Décision retenue :** le mois courant se marque **uniquement dans l'en-tête de colonne** — libellé en `--t1` plein + filet corail 2 px sous le `<th>` (`box-shadow:inset 0 -2px 0 var(--acc)`) — plus un simple trait de séparation vertical neutre (`border-left:1px solid var(--bor)`) sur la colonne. Le corail y est légitime : un en-tête n'est pas une case de donnée. **Aucune case n'est peinte**, la grammaire « fond = signalement » du CDC §5 reste entière.

### 3.2 · Alignement des trois panneaux — le piège du layout, à reprendre tel quel

Le tableau est un layout à trois panneaux : `left` (Poste + Année, figé) · `midwrap` (mois défilants) · `right` (N-1 / Var. / % loyers). Les lignes de groupe (« Revenus locatifs », « Charges propriétaire », « Charges récupérables ») **ne portent leur titre que dans le panneau gauche**. Les cellules vides des deux autres panneaux s'effondrent : **26 px à gauche contre 15 px ailleurs**, soit 11 px de dérive à chaque groupe — et tout ce qui suit est décalé.

**Deux garde-fous cumulés, les deux nécessaires :**
1. hauteur de ligne explicite — `.pane tr.grp td{height:26px;padding-top:0;padding-bottom:0}` ;
2. **une espace insécable émise dans les cellules vides** — sans contenu, la boîte de ligne n'existe pas du tout et la hauteur CSS ne suffit pas.

Mesuré après correction : **0 ligne désalignée** sur 22, hauteurs cumulées identiques au pixel (747 px), en PC, tablette et paysage.

**À conserver du CDC §5bis, vérifié en séance et non négociable :** `table-layout:fixed` **sur la table** `.left`, pas sur les cellules — sinon les libellés en `nowrap` imposent leur largeur et le tableau déborde. La colonne « Poste » prend ce qui reste.

---

## 4. Ce qui NE change pas

Garde-fous. Un chantier qui touche à l'un de ces points sort du CDC.

- **La structure, les lignes, les formules, les fenêtres et les drills** viennent intégralement de `docs/CDC-FINANCES.md`. Le re-skin ne déplace aucune fonctionnalité.
- **Le principe gravé** : aucun chiffre calculé sur une valeur « actuelle » appliquée au passé. Toute valeur de dû passe par `duMois(lot, mois)` (invariant I-1).
- **Les 2 sources** : le bail donne le dû, l'import bancaire donne le payé. La quittance ne pilote aucun calcul.
- **La grammaire du code couleur §5** : le texte dit le flux, le fond dit le signalement, les deux ne se mélangent jamais. Palette close : vert, rouge, gris, orange, bleu. **Jamais la couleur seule** — pastille + montant + libellé.
- **Le pattern des popups** (RS-4) : flex colonne, `max-height` en vh, corps seul scrollable. Vérifié jusqu'au pire cas en séance. **Rien à changer.**
- Les tokens sombres de `css/main.css` restent conformes à la charte. **Ne pas retoucher les palettes** au-delà de la calibration §1.2.
- `index.html` doit rester en **CRLF**.

---

## 5. Ordre de chantier

### Préalables communs avec Mouvements
- **Lot 0 — socle de tokens.** Les 12 tokens orphelins dans `:root`, les 7 crans typo (dont `--fs-hero`), l'échelle de rayons, `--blu` → `--acc`, `--focus-ring`, les paires `--X` / `--X-bg`. **+ les deux amendements de charte du §1** : `--adv` / `--adv-bg` et la calibration du mode clair.
- **Lot 1 — polices.** Vendorisation Inter + Schibsted, mono système, coupe des 2 points de chargement distant, remplacements globaux. **Vérification obligatoire :** les colonnes de montants restent alignées (`tabular-nums` sur Inter).

### Puis, DANS l'étape 2 du chantier Finances — pas après
Le re-skin n'a pas de lot à lui. Il s'exécute avec le rebranchement, écran par écran, dans l'ordre déjà prévu par `docs/CDC-FINANCES.md` §11 :

| Au moment où l'étape 2 écrit… | …elle applique |
|---|---|
| la barre de périmètre | tokens, rayons, focus |
| le héro | `--fs-hero`, suppression du halo vert et du dégradé (F-b2) |
| les ratios | `--fs-h1` sur les valeurs, grille `1fr 1fr` (F-d2) |
| le compte de résultat | **§3.1 (mois courant) et §3.2 (alignement)**, F-b1, F-b3, F-b4, F-c1, F-c2 |
| les drills | F-b1, F-c3, F-c4 |
| le responsive | RS-1, RS-2, RS-3 — une seule bascule, sélecteur de mois, compactage en hauteur |
| les états | F-e1, les deux états vides |

### Conditions communes
- worktree dédié, **jamais de commit depuis `Desktop\Immo`** ; worktree détruit après intégration ;
- bump de version `index.html` (title + footer) + message de commit à chaque lot ;
- audit par l'agent `superpowers:code-reviewer` **avant** de dire « prêt à tester » — obligatoire pour les lots 0 et 1, transverses ;
- smoke user sur les **4 formats** (PC, tablette, téléphone, **téléphone paysage** — RS-2 ne se voit que là), en clair **et** en sombre ;
- `BACKLOG.md` mis à jour à la livraison de chaque lot.

---

## 6. Références

| Quoi | Où |
|---|---|
| Onglet re-skiné, 4 formats × 2 thèmes × 4 états | `mockups/DESIGN-ONGLETS/FINANCES-RESKIN.html` |
| Arbitrage de la 5ᵉ couleur sémantique | `mockups/DESIGN-ONGLETS/FINANCES-COULEUR-AVANCE.html` |
| Calibration du mode clair | `mockups/DESIGN-ONGLETS/CHARTE-CALIBRATION-CLAIR.html` |
| Fonctionnel de l'onglet (figé 14/08) | `docs/CDC-FINANCES.md` |
| Décisions transverses typo / polices | `mockups/DESIGN-ONGLETS/CDC-DESIGN-MOUVEMENTS.md` §1 |
| Charte | `docs/charte-graphique-propryo.md` |
| CSS scoped de l'onglet | `index.html:51195-51290` |
| CSS du tableau P&L (`b4-*`), injecté séparément | `index.html:52114-52145` |
| Rendu de l'onglet | `index.html:51454` (`rFinances()`), `_finRenderPLv2` |
| Règle de focus globale, qui ne couvre pas Finances | `css/main.css:294-311` |
