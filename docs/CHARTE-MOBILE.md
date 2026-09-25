# CHARTE MOBILE — la barre « grade banque » de Propryo

> **Statut : VALIDÉE par Didier le 25/09/2026 — 16 règles (M-1 → M-16).**
> Gate permanent : tout chantier qui touche un écran mobile la passe **avant merge**, au même titre que
> le smoke 3 formats et l'audit code-reviewer. Le pilotage la verse dans `docs/`.

Chaque règle est **testable ou mesurable**, vérifiable dans un vrai navigateur. Ce document ne cite
volontairement **aucun numéro de ligne** et **aucun défaut daté** : il fixe la barre, il ne décrit pas
l'état du code à un instant donné.

**Format de référence** : téléphone **375 px** de large, **620 px** de hauteur utile, thème **clair ET
sombre**, au **volume réel du parc** (jamais deux lignes d'exemple : un écran vide paraît toujours propre).

**Tokens et typographie** : `design.md` fait foi.

---

## Le principe

Une app de banque sur téléphone n'est pas « jolie » : elle est **sûre, dense sans être serrée, et
prévisible**. On voit l'essentiel sans scroller, on agit d'un pouce, rien ne déborde, chaque action dit
ce qu'elle a fait. Propryo tient cette barre parce qu'elle est **destinée à la vente** et manipule de
l'argent, des baux et des documents à valeur probante.

---

## M-1 — Zéro scroll de page ; toute liste scrolle dans son cadre

**Énoncé.** La *page* ne défile jamais. L'écran est un cadre fixe (en-tête + zone de contenu + barre de
nav). Les listes longues défilent **dans leur propre zone** ; le reste de l'écran ne bouge pas. Le socle
mono-scroll existant (un seul conteneur de contenu scrolle, la page non) est un acquis à préserver.

**Budgets de hauteur utile** (`docs/CDC-KPI.md` §1 R-3) :

| Format | Largeur | Hauteur utile |
|---|---|---|
| PC | 1280 | 900 px |
| Tablette | 834 | 930 px |
| **Téléphone** | **390** | **620 px** |

**Mesurable.** `document.documentElement.scrollHeight === clientHeight`. Le contenu long vit dans un
conteneur `overflow-y:auto` **borné**. Remplissage cible du premier écran : **90–92 %** (jamais 97 % :
aucun tampon pour une carte qui passe sur deux lignes).

**Vérifier.** À 375 px, la barre de nav du bas reste collée quand on scrolle le contenu.

**Exception gravée.** L'écran **Pilotage sur téléphone** défile d'un seul geste (page unique, matrice en
flux) — décision du 26/08 (`docs/CDC-KPI.md` §2.9, §3.2). Aucune autre exception sans décision écrite.

---

## M-2 — Tout détail s'ouvre en couche, jamais en dépliage inline

**Énoncé.** Un détail (fiche, sélecteur, filtre, confirmation) s'ouvre en **couche**. Jamais un accordéon
qui pousse le reste de la page vers le bas : un dépliage inline fait déborder les trois formats.

- **Téléphone (≤ 767 px)** : la couche est une **page plein écran** — voir **M-16**.
- **Tablette / PC (≥ 768 px)** : panneau ou bottom-sheet, scrim derrière, fermeture par ✕ **et** Échap.

**Mesurable.** Ouvrir un détail n'augmente pas le `scrollHeight` de la page sous-jacente. Au-delà de
767 px, la couche a un scrim (opacité ≥ .4) et se ferme au geste Échap / retour.

**Vérifier.** Réutiliser le composant de couche existant, ne pas en réinventer un
([[feedback_dry_reuse_no_copy]]).

---

## M-3 — La couche passe AU-DESSUS du chrome ; son CTA n'est jamais occulté

**Énoncé.** Une couche plein écran couvre **tout** l'écran, barre de nav du bas comprise. Son bouton
d'action primaire (Suivant, Valider, Signer, Créer) est **entièrement visible et tappable**, jamais
recouvert par la barre de nav ni par le clavier.

**Deux mises en œuvre conformes** : soit la barre de nav est **masquée** tant qu'une couche est ouverte,
soit la couche a un `z-index` **supérieur** à celui de la barre de nav.

**Mesurable (invariant).** Tant qu'une couche plein écran est ouverte, **aucune barre de nav n'est visible
par-dessus** : `display:none` sur la barre, ou `z-index(couche) > z-index(barre de nav)`. Le rectangle du
CTA primaire ne recoupe **jamais** celui d'une barre de nav visible.

**Vérifier.** À 375 px, ouvrir chaque couche et constater que la barre du bas n'est plus visible et que le
CTA du pied est entier. Une couche empilée sur une autre (ex. une popup lancée depuis une fiche) passe
au-dessus de celle qui l'a ouverte.

---

## M-4 — Une seule action primaire par écran

**Énoncé.** Un écran = **un** bouton primaire corail. Le reste est secondaire (ghost / neutre).
(`design.md` §6 : « Un seul bouton primaire (corail) par vue ».)

**Mesurable.** Boutons au style primaire (fond `--accent`) visibles hors couche : **≤ 1**.

**Vérifier.** Sur chaque écran, l'action la plus probable saute aux yeux ; les autres ne rivalisent pas.

---

## M-5 — Disclosure progressive : l'essentiel d'abord, le détail à la demande

**Énoncé.** Le premier écran montre **ce qui presse et ce qu'on regarde en premier**. Les filtres,
réglages et données de second rang s'atteignent par un geste ; ils ne s'empilent pas en tête d'écran.

**Mesurable.** Hauteur de **chrome avant la première donnée métier** (filtres + boutons + onglets +
totaux) : **≤ 620 px** sur téléphone. Au-delà, on scrolle avant de voir l'info — échec.

**Vérifier.** La première ligne de la liste (un mouvement, un loyer, un événement) est visible, ou à un
demi-scroll au plus.

---

## M-6 — Pas de tableau dense à 375 px : cartes empilées à la place

**Énoncé.** Aucune donnée essentielle ne vit dans une colonne qui déborde à droite. Un tableau à
plusieurs colonnes se **transforme en cartes empilées** (une ligne = une carte label/valeur) sous
1024 px. Le montant, la date et l'état d'un enregistrement sont **toujours visibles sans scroll
horizontal**.

**Mesurable (invariant).** Aucune `<table>` visible plus large que le viewport. Pour tout enregistrement
de la liste, ses champs-clés (montant, date, statut) sont dans le viewport à 375 px.

---

## M-7 — Zéro débordement horizontal

**Énoncé.** La page ne défile **jamais** horizontalement, sur aucun format. Un scroll horizontal délibéré
(bandeau de mois, galerie) reste **borné dans sa propre zone** et ne pousse pas la page.

**Mesurable (invariant).** `document.documentElement.scrollWidth === clientWidth`. Aucun élément avec
`right > viewport + 1 px` hors d'un conteneur à scroll horizontal explicite.

---

## M-8 — Saisie sans zoom (≥ 16 px) et navigation au pouce (cibles 44 px)

**Énoncé.** (`docs/CDC-EDL-TELEPHONE.md` §2.4 et §2.10, généralisé à toute l'app.)

1. **Aucun champ saisissable < 16 px** sur mobile — en dessous, iOS zoome à la mise au point. Corriger
   **à la source**, pas par un `!important` de rattrapage.
2. **Toute cible tactile ≥ 44 px** de haut (`design.md` §9). Les actions fréquentes vivent **en bas**
   (rail du pouce), pas en haut d'écran.
3. Conteneurs à défilement : `overscroll-behavior:contain` (pas de rebond qui recharge la page).

**Mesurable (invariants).** `min(font-size des inputs visibles) ≥ 16 px`. `min(hauteur des
boutons / onglets / liens) ≥ 44 px`.

---

## M-9 — Icônes = line-icons `currentColor`, jamais d'emoji multicolore

**Énoncé.** Les pictogrammes sont des **SVG line-icons** en `currentColor`. On **garde la couleur qui
différencie** (pastilles teintées par catégorie, états, frise color-codée) : la règle vise l'emoji
multicolore système, pas la couleur sémantique. Un pictogramme **ne porte jamais seul une action** : il
est doublé d'un libellé texte (voir **M-10**).

**Mesurable.** Zéro caractère du plan emoji (`\u{1F000}–\u{1FAFF}`, `\u{2600}–\u{27BF}`) rendu comme
icône d'UI dans un bouton, un onglet, une puce ou une vignette.

---

## M-10 — Un pictogramme seul ne porte jamais l'information

**Énoncé.** Sur téléphone il n'y a **pas de survol** : un `title=` n'apparaît jamais. Toute information
ou action portée uniquement par une icône ou un `title=` est **invisible**. Chaque action a un **libellé
texte visible** ; toute donnée a un label lisible.

**Mesurable.** Aucun bouton/lien d'action sans texte visible **ni** `aria-label`. Aucune donnée dont le
sens ne tient que dans un `title=`.

---

## M-11 — Feedback immédiat sur chaque action

**Énoncé.** Toute action tactile produit un retour **immédiat et honnête** : état pressé, chargement,
puis résultat (toast de succès / d'erreur). Jamais un bouton qui répond « ✓ activé » sans que rien ne se
passe (`docs/CDC-KPI.md` §5).

**Mesurable.** Chaque bouton a un état `:active` / pressé visible ; une action asynchrone montre un état
de chargement ; le résultat est confirmé par un toast ou un changement d'état visible à l'écran.

---

## M-12 — États vides et d'erreur soignés

**Énoncé.** Un écran sans donnée n'est **jamais** une ligne grise. Il porte une icône sobre, une phrase
qui explique, et — si une action est possible — **un** CTA. (`design.md` §8.)

**Mesurable.** Tout état vide a : (1) un visuel, (2) un texte d'explication, (3) au plus un CTA.

---

## M-13 — Registre neutre : infinitif, générique

**Énoncé.** (`docs/CDC-KPI.md` §1 R-1.) Tous les textes visibles sont à **l'infinitif** pour les
actions, en **termes génériques**. Ni tutoiement ni vouvoiement : Propryo est destiné à la vente,
l'utilisateur n'est pas forcément le bailleur (agence, gestionnaire, particulier). « Restituer le
dépôt », jamais « Rends ton dépôt ». Pas de possessifs implicites (« ton compte » → « le compte »).

**Mesurable.** Zéro occurrence de « ton / ta / tes / tu » et zéro impératif de 2ᵉ personne dans les
textes d'UI.

---

## M-14 — Jamais de troncature : on affiche en entier, ou pas du tout

**Énoncé.** *(Non négociable, Didier 02/09.)* Aucun texte porteur de sens n'est **coupé par des points
de suspension** (`…`, `text-overflow:ellipsis`, `-webkit-line-clamp` avec coupe). Soit l'élément affiche
la phrase **complète** (au besoin sur plusieurs lignes : le retour à la ligne est autorisé), soit on
**ne l'affiche pas** et on choisit un libellé plus court qui, lui, tient en entier.

**Portée.** Titres, valeurs (KPI, montants), sous-lignes, aperçus, chips, cellules. Un montant ou un nom
propre coupé est un défaut, jamais une solution.

**Mesurable (invariant).** Aucun nœud de texte visible avec `text-overflow:ellipsis` actif
(`scrollWidth > clientWidth` sur un élément en `overflow:hidden`) **ni** de `…` littéral de coupe.
Vérifier au volume réel : les noms et adresses longs sont la norme, pas l'exception.

**Si une info ne tient pas** : (1) la raccourcir à une forme complète courte (« 1 impayé · 1 départ »
plutôt qu'une phrase coupée), (2) la passer sur deux lignes, ou (3) la déplacer dans le détail (au tap).
Jamais la couper.

---

## M-15 — La couleur est un jugement, pas une décoration

**Énoncé.** *(Doctrine Didier 02/09, non négociable.)* Une couleur ne se met jamais « pour faire joli ».
**Palette à 3 rôles, PAS de rouge** : le corail est la couleur de l'app et joue l'alerte à la place du
rouge.

| Rôle | Couleur | Règle |
|---|---|---|
| **Actions OU importance** (bouton, alerte à regarder, taux bas / en défaut, ce qui presse) | **corail** | LA couleur de l'app. Remplace le rouge : pas de rouge en plus du corail. |
| **Positif** (soldé, en bonne voie, « Tout est à jour ») | **vert** | Ce qui va bien. |
| **Factuel** (montant absolu : encaissé de l'année, dépôts, un solde) | **neutre / encre** | Un total n'est ni bon ni mauvais : jamais de vert décoratif. |

**Ce qui n'est PAS corail** : un nom, un titre, un libellé neutre. Corail ≠ « mise en avant » : un prénom
n'est ni une action ni une importance (contraste par le poids ou deux tons). Un **statut** (« déjà
édité ») n'est pas corail non plus, sinon on ne sait plus si le corail dit « clique » ou « état ».

**Seuils (une règle, tous formats).** Un taux **dans la cible = vert**, **en dessous = corail**.
Cible : **recouvrement ≥ 95 %**. Appliquer avec bon sens (une progression de mois en cours reste verte
tant qu'elle avance normalement ; le corail marque ce qui est réellement bas ou en retard).

**Exception — barres de progression.** Une barre qui se remplit (encaissé du mois, avancement) reste
**verte en permanence**. C'est un indicateur de remplissage, pas un jugement : jamais colorée par seuil.

**Exception — occupation.** Le taux d'occupation reste **neutre (encre) en permanence**, quel que soit le
niveau : l'utilisateur sait déjà qu'il a des vacants, pas d'alarme couleur en plus. Le niveau se lit à la
**position de l'aiguille** de la jauge, jamais par la couleur.

**Mesurable.** Zéro rouge dans l'UI. Aucun montant absolu coloré. Tout taux jugé porte vert (cible) ou
corail (en dessous), hors les deux exceptions ci-dessus. Les 3 formats appliquent les mêmes règles.

---

## M-16 — Téléphone : pages plein écran, jamais de pop-up partiel

**Énoncé.** *(Non négociable, Didier 03/09.)* Sur téléphone, **aucun** pop-up, modale, volet ou
bottom-sheet qui ne prend pas tout l'écran. Un tap sur un bouton ouvre une **page entière** : on n'a pas
de place sur un petit écran, donc on l'utilise au maximum. Une page = **une étape** : on ne superpose pas
deux étapes à l'écran.

**Composant « page »** : barre du haut (← retour ou ✕ + titre) · corps `overflow-y:auto` · **pied
d'action collant** portant l'action primaire, jamais occulté (M-3). **Pas de barre de nav du bas** sur ces
sous-pages : le pied d'action la remplace.

**Portée.** Tout ce qui était volet ou modale : modifier, ajouter, filtrer, trier, menu ⋮, renommer,
confirmations (archiver…), étapes d'un parcours. **Ne change pas** les vraies pages de fond (liste,
fiche), qui gardent la barre de nav du bas.

**Mesurable.** À 375 px, toute couche ouverte occupe **100 % du viewport** (largeur et hauteur) ; son en-tête
porte un retour/✕ et un titre ; son CTA primaire est dans un pied collant, entièrement visible ; la barre
de nav du bas n'est pas visible.

---

## Fondations design (`design.md` fait foi)

Ces points ne sont pas propres au mobile mais **conditionnent** la barre :

- **Corail = accent uniquement** (CTA, focus, lien, un chiffre clé). Jamais de grand aplat corail.
- **Texte sur corail = token `--accent-on`** (`#ffffff` en clair, `#1a0d09` en sombre) : contraste AA
  4,5:1 exigé dans les deux thèmes.
- **Titres / KPI / chiffres** en Schibsted Grotesk 800 ; **corps** en Inter ; `tabular-nums` sur les
  valeurs. Séparateur de milliers : `U+00A0` (`docs/CDC-KPI.md` C7).
- **Système KPI unique** : sur téléphone, **grille 2×2 de tuiles compactes**, jamais des cartes géantes
  empilées pleine largeur ; jamais de valeur tronquée (M-14) ; un chiffre affiché deux fois = un de trop.
- **Choix prédéfini + ajout libre** partout où on propose des options.

---

## Comment ce gate s'applique à un chantier

Avant de dire « prêt à tester », un chantier mobile fournit cette check-list **cochée et mesurée dans un
vrai navigateur à 375 px, clair et sombre, au volume réel** :

- [ ] **M-1** page ne scrolle pas · liste dans son cadre · premier écran 90–92 %
- [ ] **M-2** détails en couche · zéro dépliage inline · (≥ 768 : scrim + Échap)
- [ ] **M-3** barre de nav masquée (ou sous la couche) tant qu'une couche est ouverte · CTA jamais recouvert
- [ ] **M-4** ≤ 1 bouton primaire par écran
- [ ] **M-5** chrome avant la première donnée ≤ 620 px
- [ ] **M-6** aucune table plus large que le viewport · montant / date / état visibles
- [ ] **M-7** `scrollWidth === clientWidth` · zéro débordement horizontal
- [ ] **M-8** inputs ≥ 16 px · cibles ≥ 44 px · `overscroll-behavior:contain`
- [ ] **M-9** zéro emoji d'UI · line-icons `currentColor`
- [ ] **M-10** aucune action / donnée portée par une icône ou un `title=` seul
- [ ] **M-11** feedback immédiat et honnête sur chaque action
- [ ] **M-12** états vides / erreur soignés (visuel + texte + ≤ 1 CTA)
- [ ] **M-13** infinitif, générique, zéro tutoiement / vouvoiement
- [ ] **M-14** zéro troncature `…` · tout texte en entier (ou libellé plus court qui tient)
- [ ] **M-15** 3 rôles sans rouge · exceptions barres de progression (vert) et occupation (neutre)
- [ ] **M-16** téléphone : couche = page plein écran · une étape · pied d'action collant · pas de nav du bas

**Ne jamais casser un écran déjà conforme** : un chantier ne fait pas régresser une règle sur un écran qui
la tenait avant lui.

---

*Validée le 25/09/2026 par Didier. Décisions de validation : 16 règles (M-16 intégrée) ; version épurée
(énoncé + mesurable, sans numéro de ligne ni défaut daté) ; M-2 réconciliée avec M-16 (sur téléphone, la
couche est une page plein écran ; bottom-sheet réservé ≥ 768). Source de travail :
`mockups/MOBILE-UX/CHARTE-MOBILE.md` (proposition Phase 1 du 01/09).*
