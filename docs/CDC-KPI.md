# CDC KPI — VALIDÉ le 26/08/2026

Session dédiée « revue des KPI ». Décisions prises en direct avec Didier, mockups validés.
Ce document est la **source unique** du chantier. Il ne réinvente rien : chaque règle est ancrée
sur du code existant, une décision explicite, ou une obligation légale citée.

Mockups validés (locaux, gitignorés) :

| Fichier | Contenu |
|---|---|
| **`mockups/KPI-REVUE/pilotage-fusion.html`** | **L'écran retenu** — Accueil + Parc fusionnés, 3 dispositions, chaîne de clic complète |
| `mockups/KPI-REVUE/accueil-v3.html` | Les 8 familles — 3 styles de débordement (A/B/C), bulles par zone |
| `mockups/KPI-REVUE/accueil-v2.html` | Accueil à 4 familles — historique de la décision |
| `mockups/KPI-REVUE/parc-v1.html` | Carte de navigation avant/après · « Où se déclare repris ? » · fiche post-clic |
| `mockups/KPI-REVUE/loyers-v1.html` | Loyers — vue « À faire » + vue « Tous les loyers » |
| `mockups/KPI-REVUE/revue-kpi.html` | Support d'audit initial (24 cartes) — historique |

---

## 1. Les quatre règles transverses

### R-0 — Finances fait foi

> Tout chiffre en euros affiché n'importe où dans l'app est **lu** depuis le moteur Finances
> (`_computeFinancesMonthly`, `js/core/finances-monthly.js`). Aucun écran ne recalcule un montant
> pour son propre compte. Si un écran a besoin d'un montant que Finances ne rend pas, on **fait
> rendre ce montant par Finances** — on n'écrit pas un second calcul.

**Portée** : couvre aussi les indicateurs **dérivés de l'argent** qui ne sont pas des euros —
compteur de lots payés, pourcentage d'encaissement, classement payé / partiel / impayé.
Un compteur de lots payés est un montant déguisé : si Finances dit qu'il reste 40 € dus sur un lot
et que l'Accueil le classe « payé » avec un autre seuil, il y a deux vérités.

**Exclusion** : l'**occupation**. Elle ne parle pas d'argent mais de baux et de dates. Sa source de
vérité, ce sont les baux — pas Finances.

**Conséquence technique** : `_computeFinancesMonthly` calcule déjà le détail par lot
(`js/core/finances-monthly.js:189-218` — boucle `allLots`, cascade `_computeLoyerChargeAlloc`,
netting `_computeLoyerNetting`) puis **jette les montants** et ne renvoie que `lotsEnRetard`,
une liste de références. Il faut lui faire **rendre** ce qu'il calcule déjà : un `byLot` avec, par lot,
`{ duHC, duCH, encaisse, retard, avance }`. Zéro nouveau calcul, zéro duplication.

### R-1 — Registre neutre : ni tutoiement ni vouvoiement

Tous les textes visibles (libellés, titres, sous-titres, états vides, boutons) sont à **l'infinitif**
pour les actions, en termes génériques. « Restituer le dépôt de Marion Baysang », jamais
« Rends son dépôt ». L'impératif français est du tutoiement déguisé.

**Motif** : Propryo est destiné à la vente. Tutoyer ou vouvoyer suppose que l'utilisateur **est**
le bailleur — faux dès qu'une agence ou un gestionnaire se connecte.

Purger aussi les possessifs implicites : « selon ton contrat » → « selon le contrat ».
La personnalisation reste permise : « Bonjour Didier » est un prénom, pas un registre.

*Mémoire : `feedback_ton_neutre_generique.md`.*

### R-2 — Jamais forcer le dépôt d'un document

Aucune alerte de conformité ne peut exiger qu'un document soit **déposé dans Propryo**.
Toute pièce manquante propose **deux gestes** : « Déposer » et « **Je l'ai déjà** » (classée ailleurs —
dossier papier, disque, autre outil). Après déclaration, **l'app ne redemande plus jamais**.

Seule exception : une pièce à **date de péremption réelle** (attestation d'assurance échue,
entretien de plus de 13 mois). Ce n'est pas une relance, c'est un fait nouveau.

**Ne s'applique pas aux actes** à accomplir (révision IRL, restitution de dépôt) : ce ne sont pas
des pièces, on ne peut pas « les avoir déjà ».

**Rendu** : vert **creux** (déclaré détenu) ≠ vert **plein** (pièce dans l'app). C'est une déclaration,
pas une preuve — la nuance compte quand une SCI est partagée. Dans les deux cas, jamais un défaut.

*Mémoire : `feedback_jamais_forcer_depot_doc.md`.*

### R-3 — Zéro scroll sur les trois formats

| Format | Budget utile | Origine du budget |
|---|---|---|
| PC 1280 | **900 px** | écran 1080 − barres |
| Tablette 834 | **930 px** | iPad 1112 − chrome navigateur − barre de nav |
| Téléphone 390 | **620 px** | iPhone 844 − chrome navigateur − barre de nav |

Toute liste longue **scrolle dans son propre cadre**, jamais la page. Tout détail s'ouvre **en couche**
(panneau centré, scrim, Échap), jamais en dépliage inline — un dépliage fait déborder les trois formats.

⚠️ **Une exception, décidée le 26/08 : l'écran Pilotage sur TÉLÉPHONE** (voir §2.9). La fusion
n'y tient pas en zéro scroll — la page défile d'un seul geste et la matrice coule dans le flux.
Deux zones à défilement indépendant sur 390 px sont intenables.

Remplissage cible : **90-92 %**. Ne pas viser 97 % : il ne resterait aucun tampon pour une carte
qui passe sur deux lignes ou une famille ajoutée plus tard.

---

## 2. Écran PILOTAGE — Accueil et Le parc FUSIONNÉS

**Décision du 26/08 (révision) :** les deux écrans validés séparément n'en font plus qu'un.
Motif : la matrice de conformité et les alertes disent les mêmes faits lus autrement — l'un
agrège **par geste**, l'autre étale **par lot**. Les garder séparés obligeait à un troisième
affichage (la feuille flottante de l'Accueil), qui était une mini-version du Parc filtré.

Mockup validé : `mockups/KPI-REVUE/pilotage-fusion.html` — **disposition 2**.
(`accueil-v2.html`, `accueil-v3.html` et `parc-v1.html` restent comme historique de la décision.)

### 2.1 — Disposition retenue (PC et tablette)

```
Pilotage                                  [Tout] [SCI Ferrette] [Ferrette]
┌──────────┬───────────┬───────────┬────────────┬────────────────┐
│ Encaissé │ Occupation│ Logements │ Rendement  │ Dépôts détenus │   ← bandeau de contexte
└──────────┴───────────┴───────────┴────────────┴────────────────┘
┌────────────────────┬──────────────────────────────────────────┐
│  8 bulles          │  Conformité du parc  [Tous][À compléter] │
│  2 par ligne       │  ● ● ● ● ● ● ●  · 15 lots visibles / 21  │
│  Argent (4)        │  scroll interne                          │
│  Gestion loc. (4)  │                                          │
└────────────────────┴──────────────────────────────────────────┘
```

**Trois dispositions ont été mesurées** avant de choisir — critère : combien de lots restent
visibles sans scroller (parc de 21 lots) :

| | PC | Tablette |
|---|---|---|
| Empilé (bulles → bande → matrice) | 6 lots | 6 |
| **Deux colonnes** ✅ | **15 lots** | **15** |
| Bande de 8 bulles + matrice | 13 lots | 10 |

**Le bandeau de chiffres est en pleine largeur, au-dessus des deux colonnes** — pas dans la
colonne gauche. Ce sont cinq états du parc qui ne dépendent d'aucun filtre : ils cadrent la
lecture des deux blocs. L'app a déjà ce motif (widget `context-bar`).

**La colonne gauche ne scrolle pas** (`overflow:visible`). Marge mesurée entre la dernière
bulle et le bas de colonne : **36 px sur PC**, 149 px sur tablette.
⚠️ **36 px est mince** — un libellé de bulle qui passerait sur une 3ᵉ ligne ferait déborder.
Point de vigilance du chantier ; ne pas masquer par un `overflow:auto`.

### 2.2 — Les HUIT familles d'alerte

**Révision majeure du 26/08.** L'Accueil validé n'avait que 4 familles, toutes financières.
L'audit du catalogue d'alertes a montré que **9 natures d'alerte sur 13 n'étaient couvertes
par aucune** — et l'Accueil v2 supprimait le bloc « À traiter » qui les portait.

Inventaire complet des alertes de l'app, et leur famille :

| # | Alerte | Moteur | Famille |
|---|---|---|---|
| 1 | Impayé de loyer | Finances `byLot` (R-0) | Impayés à relancer |
| 2 | Logement vacant | baux | Logements à relouer |
| 3 | Révision IRL applicable / proche | `AlertRules.irlClassifier` | Loyers à réviser |
| 4 | Dépôt de garantie à restituer | `_computeUnifiedTodo` type `depart` | Dépôts à restituer |
| 5 | Assurance habitation manquante | `AlertRules.mrhManquante` | Documents à renouveler |
| 6 | Assurance habitation expirée / proche | `AlertRules.mrhEcheances` | Documents à renouveler |
| 7 | Assurance PNO expirée / proche | `AlertRules.pnoEcheances` | Documents à renouveler |
| 8 | Diagnostic expiré | `_computeUnifiedTodo` type `diag` | Documents à renouveler |
| 9 | Entretien en retard / < 30 j | `EQUIP_RULES` (12 règles) | Entretiens à réaliser |
| 10 | Régularisation de charges à émettre | `AlertRules.regulAEmettre` | Régularisations à émettre |
| 11 | Fin de bail | `agendaAutoSync` cat `BAIL` | Fins de bail à préparer |
| 12 | Préavis bailleur (6 mois) | `agendaAutoSync` cat `BAIL_PREVIS` | Fins de bail à préparer |
| 13 | Départ locataire en cours | `_computeUnifiedTodo` type `depart` | Fins de bail à préparer |

Catalogue canonique : `AlertRules` — `js/helpers/alert-rules.global.js:157`.

⚠️ **`AlertRules.bauxEcheance` existe mais n'est lue par personne** — `_computeUnifiedTodo`
la saute avec le commentaire « hors scope À traiter ». Elle est reprise par la famille
« Fins de bail à préparer ».

### 2.3 — Le regroupement par zone de navigation

Les 8 familles se rangent dans les zones de la sidebar (`_MENU_ZONES`, `index.html:8594`) :

| Zone | Familles | Ordre interne = coût du retard |
|---|---|---|
| **Argent** | Dépôts à restituer · Loyers à réviser · Impayés à relancer · Régularisations à émettre | rouge → orange |
| **Gestion locative** | Fins de bail à préparer · Documents à renouveler · Entretiens à réaliser · Logements à relouer | rouge → gris |
| **Pilotage** | *aucune* | — |

**Zéro famille dans « Pilotage »**, et c'est juste : Pilotage est là où l'on regarde, pas où
l'on agit. L'Accueil devient une carte de l'app.

### 2.4 — Anatomie d'une bulle

```
┌─────────────────────────┐   liseré 3 px dans la couleur de gravité
│ [icône pleine]   ⟨3⟩    │   pastille pleine + compteur en anneau
│ Impayés à relancer      │   ← objet + à + verbe (R-1). JAMAIS le verbe seul.
│ 2 810 €                 │   ← le chiffre qui dit la gravité
│ Meyer · 67 jours        │   ← le PIRE CAS NOMMÉ
└─────────────────────────┘
```

**Trois règles de rédaction, apprises en corrigeant :**

1. **Jamais le verbe seul.** « Restituer » ne dit pas quoi. Forme retenue : **objet + à + verbe**.
2. **Le chiffre n'est jamais le compte** — il est déjà dans la pastille. Pour les familles sans
   euros, il porte la **gravité** : « 8 mois de retard », « dans 35 jours », « 1 sans assurance »,
   « 1 en retard ».
3. **La 3ᵉ ligne nomme le pire cas.** C'est la seule chose que la bulle perdait par rapport à
   une carte pleine largeur ; elle est rendue.

Relief : ombre douce, voile teinté en dégradé sur le haut, liseré de gravité, icône **pleine**
(glyphe blanc / `#14161d` en sombre), compteur en anneau sur le coin de l'icône, chiffre en 23 px.
En thème sombre les ombres sont remplacées par un filet de lumière `inset 0 1px 0 rgba(255,255,255,.05)`.

⚠️ **Interligne** : à 23 px, `line-height:1.1` coupait le jambage des chiffres. Minimum **1.26**.

### 2.5 — La matrice de conformité

| Colonne | Vérifie | 🟢 plein | ⭕ creux | 🟠 | 🔴 | ⚪ |
|---|---|---|---|---|---|---|
| **Bail** | signé des deux côtés | signé | déclaré détenu | sans date / tacite | échu sans reconduction | lot sans bail |
| **EDL** | état des lieux d'entrée | présent | déclaré détenu | — | absent *(art. 1731)* | lot sans bail |
| **Assurance** | attestation du locataire | valide | déclarée détenue | — | manquante / expirée | pas de locataire |
| **Diagnostics** | DDT (9 obligatoires) | complet | déclarés détenus | incomplet | aucun | — |
| **Entretiens** | les **12** obligations du lot | tous à jour | déclaré fait | > 13 mois | jamais contrôlé | aucun équipement soumis |
| **Caution** | acte de cautionnement | signé | déclaré détenu | garant sans acte | — | pas de garant |
| **Révision** | révision annuelle du loyer | appliquée | *(sans objet)* | — | exigible non appliquée | pas applicable |

**En-têtes en clair, jamais abrégés** (« Assurance », pas « Ass. ») + **bandeau de légende**
permanent sous l'en-tête : *en règle · pièce classée hors de l'app · à compléter · manquant · sans objet*.

**Le point de paiement** précède le montant du loyer : 🟢 soldé · 🟠 partiel · 🔴 retard ·
🔵 avance · ⚪ hors bail. Grammaire reprise de la modale « Suivi des loyers » (`index.html:51598`).
Il supprime la colonne « QUIT. » du mode Gestionnaire.

### 2.6 — La colonne « À faire » — règle anti-redondance

> **Chaque format dit la chose UNE fois.**

- **PC / tablette** — les 7 pastilles portent l'état. « À faire » ne garde donc que **ce
  qu'aucune colonne ne peut dire** : où en est la relocation d'un lot vide. Toutes les autres
  lignes ont la **cellule vide**.
- **Téléphone** — les pastilles disparaissent (place). La colonne porte **tous les gestes**.

**Empilement, pas comptage.** « 4 à faire » est remplacé par les quatre gestes empilés.
**Pas de « Conforme »** : rien à faire = cellule vide, le silence est l'information.

Les huit gestes, à l'infinitif (R-1) — **table indexée sur les libellés de colonnes** :

| Manque | Geste |
|---|---|
| Bail non signé | Signer le bail |
| EDL absent | Faire l'EDL |
| Assurance manquante | Obtenir l'assurance |
| Diagnostics incomplets | Compléter les diagnostics |
| Entretien en retard | Planifier l'entretien |
| Caution non signée | Faire signer la caution |
| Révision exigible | Réviser le loyer |
| *(lot vide)* | voir 2.7 |

⚠️ **Couplage à protéger** : la table des gestes est indexée sur les libellés de `COLS`.
Renommer une colonne sans la répercuter produit des puces `undefined` — c'est arrivé.
Prévoir un garde-fou au chargement : *toute colonne doit avoir un geste*.

### 2.7 — Les lots vacants disent où en est la relocation

**« Vacant » n'est pas un état à afficher, c'est une action à faire.** Le geste dépend du
pipeline de candidatures (`DB.candidats`, champ `logRef` + `statut`, `index.html:18931`) :

| Situation | Geste |
|---|---|
| Aucun candidat | **Relouer — aucun candidat** *(gris)* |
| Candidatures `enCours` | **Étudier 3 candidatures** *(bleu)* |
| Un candidat `valide` | **Établir le bail** *(bleu)* |

Un lot vide peut cumuler : `Relouer — aucun candidat` **et** `Compléter les diagnostics`.
L'ancien affichage « Vacant » masquait le second.

⚠️ Le filtre « Vacants » de la matrice doit tester `log.vacant`, **pas** l'ancien état `vac` du
verdict — la bascule vers l'action l'a cassé une fois (filtre vide).

### 2.8 — La chaîne de clic

**Il n'y a plus de popup d'explication.** Les deux moitiés étant sur le même écran, la bulle
agit directement sur la matrice.

```
① clic sur une bulle
   ├─ famille AVEC colonne (révisions, impayés, documents, entretiens, vacants)
   │     → la matrice se FILTRE · bulle cerclée · bandeau « Entretiens à réaliser ✕ »
   └─ famille SANS colonne (dépôts, fins de bail, régularisations)
         → couche listant les items + « ce geste se fait dans l'onglet Locataires / Charges »
           + pied « Voir tout dans Locataires › »

② clic sur une ligne / carte de lot
   → fiche du lot : les 7 contrôles, un geste par manque

③ clic sur un geste (ex. « Planifier l'entretien »)
   → l'écran d'action réel, avec un ‹ retour.
     Pour un entretien : les équipements du lot issus de EQUIP_RULES, leur dernier contrôle,
     leur base légale, et le formulaire de l'onglet Équipements (index.html:475).
```

**Aucune bulle ne doit être inerte** — à vérifier au chantier, les trois familles sans colonne
l'étaient dans la première version du mockup.

### 2.9 — Téléphone : la seule exception à R-3

**Sur 620 px, la fusion ne tient pas en zéro scroll.** Mesuré : bulles 260 px + bande 67 px +
en-tête 24 px → il ne restait que **2 lots visibles** avec la matrice en cadre à scroll interne.

**Décision : sur téléphone, un seul scroll pour toute la page.**

- Le cadre entier défile ; la matrice **coule dans le flux**, sans cadre à scroll interne.
  Deux zones défilant séparément sur 390 px est intenable.
- L'en-tête de colonnes reste collé (`position:sticky`).
- **La bande de chiffres passe à 2 items** (encaissé + occupation) : −124 px.
- **La matrice devient une LISTE DE CARTES**, plus un tableau. Un tableau à 3 colonnes ne peut
  pas accueillir « Relouer — aucun candidat » dans la dernière — les libellés étaient coupés.

```
┌────────────────────────────────────┐
│ Logt 1                         —   │
│ Relouer — aucun candidat           │
│ Compléter les diagnostics          │
└────────────────────────────────────┘
```

**Les 8 bulles restent visibles au premier écran.** Hauteur totale : ~2 100 px (3,4 écrans),
0 débordement horizontal, 0 texte coupé.

### 2.10 — Ce qui disparaît de l'Accueil actuel

| Élément | Réf. | Motif |
|---|---|---|
| **Donut** payés/impayés | `index.html:10008-10050` | Quatre façons de dire un chiffre. Sa ligne « n payé(s) » affiche `totalPaid` — le total de **tous** les lots (`10015` vs `9864`). Bug réel. |
| Tuile **Agenda** | `index.html:9990` | `_agendaBuild` **n'existe pas** — 1 occurrence dans le dépôt, l'appel lui-même. Le `try/catch` avale l'absence : affiche « Aucune cette semaine » en permanence. |
| Tuile **Logements** | `index.html:9395` | Doublon de l'occupation. |
| Hero **« Reçu {Mois} »** | `index.html:9931` | Absorbé par « Encaissé en août ». |
| Hero **« Occupation % »** | `index.html:9932` | Compte des champs `l.locataire` remplis, pas des baux actifs à une date. |
| Hero **« Net YTD »** | `index.html:9933` | Part à Finances. |
| **MAG** projeté | `index.html:10005` | Projection interdite ailleurs par le CDC Finances. |
| Bloc **« À traiter »** | `index.html:12933-13560` | Absorbé par les 8 bulles — **à condition** que les 8 familles couvrent les 13 alertes (§2.2). |

### 2.11 — Occupation : du comptage de fiches au temps réel

Aujourd'hui (`js/helpers/dash-ctx.global.js:70-78`) : `logs.filter(l => l.locataire)` — aucune
date lue. Un lot dont le bail s'est terminé le 15 mais dont le champ n'a pas été vidé compte
comme occupé ; un bail signé qui démarre le mois prochain compte déjà. Le chiffre ne bouge pas
avec le sélecteur de période.

**Cible : Σ(jours occupés) ÷ Σ(jours de la période × nb lots).** La mécanique de prorata existe
déjà — `duMois` l'applique (`js/core/loyer-du-mois.js:107`). Effet de bord souhaitable : le
chiffre devient sensible à la période.

**Hors R-0** : l'occupation ne parle pas d'argent mais de baux.

---

## 3. AGENDA et ÉQUIPEMENTS

### 3.1 — Un bug bloquant : `_pilStatutDoc('chauffage')`

L'écran Équipements écrit (`index.html:50640`) :

```js
DB.equipements[ref][ruleKey] = { lastDate, interv, notes, updatedAt }   // OBJET indexé par clé de règle
```

Trois lecteurs, un seul faux :

| Lecteur | Réf. | Verdict |
|---|---|---|
| `agendaAutoSync` | `index.html:6185` | ✅ `equipData[rule.key].lastDate` |
| `_computeUnifiedTodo` | `index.html:13767` | ✅ idem |
| `_pilStatutDoc('chauffage')` | `index.html:50901` | ❌ **trois erreurs en quatre lignes** |

Le troisième traite l'objet comme un **tableau** (`.find`), cherche des champs `type` / `nom`
qui n'existent pas, et lit `dernierControle` au lieu de `lastDate`.

**Reproduit :**
```
lot AVEC intervention  →  TypeError : eq.find is not a function
lot SANS intervention  →  undefined  →  la colonne renvoie N/A
```

**Aucun `try/catch` aux deux points d'appel** (`51046` et `51270`) : la table « Suivi documents »
plante entièrement dès qu'un seul lot a un entretien enregistré. Sur un parc vierge elle affiche
N/A partout et paraît fonctionner.

### 3.2 — « Chauffage » → « Entretiens » : un correctif, pas un renommage

Le filtre `/chaud|chauff/i` **rate 8 obligations sur 12**. `EQUIP_RULES` (`index.html:5888-5921`)
définit : chaudière gaz / fioul / bois, ramonage conduit fioul, ramonage conduit bois, ramonage
poêle à bois, entretien poêle granulés, ramonage poêle granulés, entretien insert, ramonage
insert, ramonage cheminée ouverte, entretien climatisation/PAC.

Ni « Ramonage conduit bois/granulés », ni « Ramonage poêle à bois », ni « Entretien
climatisation/PAC » ne matchent. **Un poêle dont le ramonage a un an de retard affiche N/A.**

Second défaut : `eq.find()` ne prend que le **premier** équipement. Chaudière + poêle → seule la
chaudière est vue. La colonne doit appeler `EQUIP_RULES`, pas refaire un filtre à elle.

### 3.3 — Frontière des trois surfaces

`EQUIP_RULES` alimente trois endroits — c'est **sain** (DRY), le problème était la frontière :

| Surface | Rôle |
|---|---|
| **Pilotage** — bulle « Entretiens à réaliser » + colonne « Entretiens » | ce qui presse, et l'état |
| **Agenda** | **quand** — le calendrier, sans alerte rouge concurrente |
| **Équipements** | **où l'on saisit** l'intervention et où l'on décrit le parc technique |

`AGENDA_MAINTENANCES = EQUIP_RULES` (`index.html:5945`) — deux noms pour la même constante,
à unifier.

---
## 4. Écran LOYERS

**Loyers devient le seul écran qui répond à « qui a payé quoi ».**

### Vue « À faire » — inchangée

Les 4 familles existantes (`_LY_FAM`, `index.html:29376`) : Quittances demandées · Impayés ·
Révisions à préparer · Révisions en retard. Une ligne = un lot, un contexte, un montant, un geste.

**Le point de paiement n'y va PAS.** Correction assumée d'une recommandation initiale :
l'onglet est organisé **par famille d'action**, l'en-tête du bloc dit déjà l'état. Un point vert dans
« Impayés » serait absurde ; un point rouge dans « Quittances demandées » impossible.
Ce serait répéter l'en-tête — le défaut qu'on démonte partout ailleurs.

### Vue « Tous les loyers » — À AJOUTER

**Motif** : si Suivi et sa modale 📅 disparaissent, la **vue d'ensemble disparaît**. Loyers ne montre
que ce qui appelle une action — un parc où tout va bien s'affiche vide, et plus aucun écran ne dit
« voilà mes 15 baux et où ils en sont ».

Contenu : **une frise de 12 mois par locataire** + le **solde signé** à droite.

| Élément | Source |
|---|---|
| Frise 12 mois (payé/partiel/retard/avance/hors bail) | `_suiviLoyerStrip` — **existe déjà** |
| Solde signé (`retard 1 530 € · 3 mois`) | `_loyerChipVerdict` + netting `_computeLoyerNetting` |

**Un seul chiffre signé, jamais retard ET avance simultanés** — le netting est déjà écrit.

**Chaque case de la frise EST le point de paiement**, à la maille du mois. Douze mois d'un coup
d'œil au lieu d'un seul point.

**Remplace trois écrans** : Suivi › Suivi comptable, la modale 📅 « Suivi des loyers »,
et la colonne QUIT. du mode Gestionnaire.

### Hauteurs mesurées

| | PC 900 | Tablette 930 | Téléphone 620 |
|---|---|---|---|
| À faire | 898 (100 %) | 928 (100 %) | 618 (100 %) |
| Tous les loyers | 898 (100 %) | 928 (100 %) | 618 (100 %) |

Vérifié : 12 combinaisons, 0 anomalie, 0 troncature.

---

## 5. Ce qui est SUPPRIMÉ

### L'onglet « Tableau de bord » et ses deux modes

**Mode Premium** — 6 widgets recomptent les mouvements bruts au lieu d'appeler Finances :

| Widget | Réf. | Ce qu'il compte | Ce que Finances compte |
|---|---|---|---|
| `flux` Revenus vs Charges | `index.html:14548` | `mvs.filter(loyer).reduce(cr)` — loyers **charges comprises** | `loyersHC` — **hors charges**, après cascade |
| `donut` Charges catégories | `index.html:14849` | `m.db` par **catégorie brute** | ventilation par **ligne 2044**, prêt éclaté capital/intérêts |
| `prog` Progression annuelle | `index.html:14949` | notion propre (`_realiseInclCat`) | cumul du compte de résultat |
| `solde` Solde provisions | `index.html:15164` | recalcul par immeuble | `recupSolde` — **déjà calculé** |
| `rdt` Rendement brut | `index.html:15058` | 12 mois glissants, `l.ch` théorique | — |
| jauge Encaissement | `index.html:9545-9568` | voir ci-dessous | recouvrement R-2 — **déjà calculé** |

**Ce ne sont donc pas deux écrans qui affichent le même nombre. Ce sont deux écrans qui affichent
des nombres différents pour la même question.** L'écart, ce sont les provisions de charges.

**La jauge d'encaissement — le KPI le plus faux, et le plus gros pixel à l'écran :**
- Numérateur = mouvements **datés du mois** ; dénominateur = tranche du mois issue de
  l'**allocation annuelle**. Un rattrapage encaissé en août gonfle le numérateur d'août alors qu'il
  a déjà été imputé sur juillet côté dénominateur.
- **Repli violant l'invariant I-1** : si l'attendu est nul, retombe sur `l.hc + l.ch` — le loyer
  **d'aujourd'hui**. Sur l'année entière : `objMensuel × 12`.
- **Plafond `Math.min(100, …)`** : un mois où deux locataires rattrapent devrait afficher 130 %.

**Mode Gestionnaire** (`_renderDashV4Gestionnaire`, `index.html:11229`) — troisième copie de
« À traiter » (même moteur `_computeUnifiedTodo`), plus les tuiles Vacance parc / Indexation IRL /
Diagnostics / Assurance hab. dérivées de la même liste, plus l'Agenda 15 jours, plus le
« Climat conformité : pluvieux » qui habille un chiffre affiché deux fois dans le même bandeau.
Sa seule vraie valeur — la matrice de conformité — part dans « Le parc ».

**Le « climat météo » n'est pas repris.** *(À dire explicitement : si Didier y tient, le redemander.)*

### L'onglet « Suivi » et ses cinq sous-vues

| Sous-vue | Réf. | Branché ? | Sort |
|---|---|---|---|
| Bouton 📅 « Suivi des loyers » (modale) | `index.html:795` / `51565` | oui — `_suiviLoyerStrip` | → **Loyers** vue « Tous les loyers » |
| **Suivi comptable** | `index.html:51027` | oui — `_pilCumulLocataire` | → **Loyers** |
| **Suivi documents** | `index.html:840-852` | oui | → **Le parc**, matrice unique |
| **Automatisations** | `index.html:51300-51370` | **NON** | **retiré** |
| **Prélèvements** | `index.html:885-897` | **NON** | **retiré** |

**Automatisations — décision Didier : retirer.** `bail.automatisations` compte **13 occurrences dans
tout le dépôt**, toutes dans l'onglet lui-même (barre d'onglets, panneau, rendu, toggle, reset,
héritage). **Aucun moteur ne relit jamais la valeur.** Cocher « Rappel impayé auto J+3 » affiche
« ✓ Automatisation activée », écrit le booléen en base, et aucune relance ne partira jamais.
Deux colonnes avaient **déjà** été retirées pour ce motif exact — le commentaire est encore dans le
code (`index.html:864` : « interrupteur branché sur rien : aucun moteur ne l'a jamais lue »).

Un interrupteur inerte qui répond « ✓ activée » est pire qu'absent : sur une app destinée à la vente,
« l'application avait pourtant activé le rappel » est un problème de responsabilité.
**Le sujet part au backlog** — le brancher demande un expéditeur, une horloge, un journal de ce qui
est parti et une règle de non-répétition. Le CDC Import a déjà gravé « aucun automatisme sans règle ».

**Prélèvements** : écran vide « Bientôt disponible » + un bouton qui affiche un toast.
Retiré, tracé au backlog (`docs/subjects/SEPA-PRELEVEMENTS.md`, à créer — déjà mentionné dans le stub).

### Bilan de navigation

**13 onglets + 2 modes + 5 sous-vues → 11 onglets, aucun mode, aucune sous-vue.**

`_V4_NAV_MODEL` / `_NAV_GROUPS` / `_MENU_ALL` / `_MENU_LABELS` / `_MENU_ZONES` / `_MENU_PRESETS`
à mettre à jour ensemble (`index.html:8542-8600`, `9368-9381`) : retrait de `dashboard` et `pilotage`,
ajout de `parc`. Le groupe « Pilotage » perd son sous-menu.

### « Qui a payé quoi » — 7 endroits, 5 moteurs → 1

| Où | Moteur | Sort |
|---|---|---|
| Accueil — donut et pastilles | `_v4ComputeLotStatus` | supprimé de l'Accueil |
| Onglet **Loyers** | moteur du suivi | **conservé, seul** |
| Suivi — modale 📅 | `_suiviLoyerStrip` | → Loyers |
| Suivi — Suivi comptable | `_pilCumulLocataire` | supprimé |
| Tableau de bord — jauge | calcul inline | supprimé |
| Gestionnaire — colonne QUIT. | dérivé | → point de paiement |
| Finances — recouvrement | `_computeFinancesMonthly` | **source unique (R-0)** |

⚠️ **`_pilCumulLocataire` porte un risque I-1** : son `monthlyFull` lit `bail.hc || log.hc`
(`index.html:51029`), c'est-à-dire le loyer **d'aujourd'hui**. À vérifier avant suppression :
s'assurer qu'aucun autre appelant n'en dépend.

---

## 6. Correctifs relevés en passant

À traiter dans le chantier, ou à ouvrir séparément.

| # | Défaut | Réf. | Gravité |
|---|---|---|---|
| C1 | Ligne « n payé(s) » du donut affiche le total de **tous** les lots | `index.html:10015` vs `9864` | disparaît avec le donut |
| C2 | `_agendaBuild` n'existe pas, `try/catch` masque l'absence | `index.html:9990` | disparaît avec la tuile |
| C3 | Jauge d'encaissement : repli `l.hc + l.ch` → **violation I-1** | `index.html:9563` | disparaît avec la jauge |
| C4 | `/chaud|chauff/i` rate 8 obligations sur 12 + `eq.find` premier seulement | `index.html:50899` | **correctif à faire** |
| C5 | `typeContrat === 'repris'` lu seulement par les générateurs de doc | `index.html:1661` | **correctif à faire** |
| C6 | Aucune section de pièces jointes sur un bail (`parentType:'bail'` prévu, non exposé) | `index.html:16027` | **à brancher** |
| C7 | **`toLocaleString('fr-FR')` sépare les milliers par U+202F** (espace fine insécable), quasi invisible en Schibsted Grotesk : « 2 810 » se lit « 2810 ». Remplacer par U+00A0. | à chercher sur tous les `fmt`/`fmtN` | **à vérifier en prod** |
| C8 | Fenêtre « Net YTD » réécrite en dur alors que `WINDOW_KIND.EXIGIBILITE` la nomme | `index.html:12119` | appeler `computeExigibiliteWindow()` |
| C9 | `_finEntScope` réimplémente `resolveScope` inline — sans cran immeuble, sans paniers, comparaison de référence stricte (casse différente → lot hors périmètre) | `index.html:51313` | brancher `finances-scope.js` |
| C10 | Sparkline 12 mois glissants : 3ᵉ convention de fenêtre sur le même écran, traverse le 31 décembre sans le marquer, ni échelle ni baseline | `index.html:12069-12103` | disparaît avec le Tableau de bord |

---

## 7. Hors périmètre V1 — écarté, avec motif

| Idée | Motif de l'écart |
|---|---|
| Rendement net, TRI, cash-on-cash | Supposent de trancher quelles charges entrent et quel capital est engagé — arbitrages comptables, pas choix de design. Le WHY est la simplicité, pas un second métier. |
| Prévisionnel de trésorerie | Le CDC Finances a tranché : « le tableau est un constat, jamais une prévision ». Ne pas réintroduire la prévision par la porte des KPI. |
| Comparaison au marché, valorisation automatique | Source de données externe → contre la règle « aucun CDN au runtime », et aucun ancrage dans le dépôt. |
| Score de santé, note globale, « climat de conformité » | Chiffre agrégé ni vérifiable ni actionnable. Le climat météo actuel habille un chiffre déjà affiché à côté. |
| Rotation des locataires, délai moyen de paiement | Aucun besoin exprimé, aucun code existant. Pertinents à l'échelle d'une agence, pas sur 37 lots. |
| Automatisations de relance | Chantier à part entière : expéditeur, horloge, journal, non-répétition. Au backlog. |
| Prélèvements SEPA | V2 SaaS — statut PSP/PISP requis. Au backlog. |

---

## 8. Liste des décisions

| # | Décision | Statut |
|---|---|---|
| D1 | **R-0** — Finances fait foi ; couvre les dérivés ; exclut l'occupation | ✅ |
| D2 | **R-1** — ni tutoiement ni vouvoiement, infinitif | ✅ |
| D3 | **R-2** — jamais forcer le dépôt ; « Je l'ai déjà » ; ne pas redemander | ✅ |
| D4 | **R-3** — zéro scroll, budgets 900 / 930 / 620 | ✅ |
| D5 | Refonte de l'Accueil — l'action d'abord, un fait un endroit | ✅ |
| D6 | Une carte par **famille**, groupement **dès 2** | ✅ |
| D7 | Ordre = ce que le retard coûte | ✅ |
| D8 | Cash-flow annuel retiré de l'Accueil | ✅ |
| D9 | État « Rien ne presse » accepté tel quel | ✅ |
| D10 | **Option 1** — trois écrans, trois questions | ⚠️ **révisé par D22** |
| D11 | Tableau de bord **supprimé**, ses 2 modes avec | ✅ |
| D12 | Suivi **supprimé**, éclaté dans Loyers et Pilotage | ✅ |
| D13 | **Automatisations retirées** (6 interrupteurs branchés sur rien) + backlog | ✅ |
| D14 | **Prélèvements retirés** (écran vide) + backlog | ✅ |
| D15 | **Point de paiement** devant le montant du loyer | ✅ |
| D16 | Point de paiement **PAS** dans Loyers (l'en-tête de bloc le dit déjà) | ✅ |
| D17 | « Chauffage » → **« Entretiens »**, lit les 12 règles `EQUIP_RULES` | ✅ |
| D18 | **Bail repris** : Bail / EDL / Caution changent de question | ✅ |
| D19 | Loyers gagne la vue **« Tous les loyers »** (frise 12 mois) | ✅ |
| **D22** | **Accueil et Le parc FUSIONNENT** en un écran « Pilotage » | ✅ 26/08 |
| **D23** | **Disposition 2** — bulles à gauche, matrice à droite, bande de chiffres en pleine largeur au-dessus | ✅ |
| **D24** | **8 familles**, pas 4 — les 13 alertes du dépôt sont couvertes | ✅ |
| **D25** | Bulles **groupées par zone de nav** (Argent / Gestion locative) | ✅ |
| **D26** | Libellé = **objet + à + verbe** ; le chiffre dit la gravité, pas le compte ; 3ᵉ ligne = pire cas nommé | ✅ |
| **D27** | **Actions EMPILÉES**, pas comptées ; « Conforme » supprimé (cellule vide) | ✅ |
| **D28** | « Vacant » devient une **action** dépendant du pipeline de candidatures | ✅ |
| **D29** | « À faire » sur grand écran ne garde que ce qu'aucune colonne ne dit | ✅ |
| **D30** | En-têtes de colonnes **en clair** + bandeau de légende permanent | ✅ |
| **D31** | Clic sur bulle = **filtre la matrice** (ou liste + onglet cible) — plus de popup | ✅ |
| **D32** | **Téléphone : scroll unique**, matrice en liste de cartes — seule exception à R-3 | ✅ |

---

## 9. Ordre de chantier

Un lot = un worktree dédié, détruit après intégration. Un seul chantier à la fois.
Gate commune : **smoke téléphone + tablette + PC**.

### Lot 0 — Socle *(préalable, bloque tout)*

1. `_computeFinancesMonthly` **rend `byLot`** — expose ce qu'il calcule déjà
   (`finances-monthly.js:189-218`). Tests : parité avec `lotsEnRetard`, invariant I-1
   (`__tests__/helpers/finances-invariant-i1.js`).
2. Brancher `finances-scope.js` et `finances-window.js` — retirer `_finEntScope` (C9) et la
   fenêtre en dur (C8).
3. Corriger le séparateur de milliers (C7) — vérifier d'abord s'il est en prod.
4. **Corriger `_pilStatutDoc('chauffage')`** (§3.1) — il plante, c'est un bug vivant.

*Aucun changement visible. Lot le plus risqué et le moins spectaculaire.*

### Lot 1 — Écran PILOTAGE

Disposition 2 · les 8 familles · les bulles · la matrice · le point de paiement ·
« À faire » · la chaîne de clic · le téléphone en cartes à scroll unique.
Occupation en jours (appel de `duMois`). Correctif « Entretiens » (§3.2).
Suppression de l'Accueil actuel et du Tableau de bord.
Mise à jour de `_V4_NAV_MODEL` / `_NAV_GROUPS` / `_MENU_*`.

**C'est le gros lot.** À découper si nécessaire : (a) bulles + bandeau, (b) matrice, (c) chaîne de clic.

### Lot 2 — Loyers

Vue « Tous les loyers » (frise 12 mois + solde signé). Absorption de la modale 📅 et de
Suivi comptable. ⚠️ Vérifier les appelants de `_pilCumulLocataire` avant suppression.

### Lot 3 — Suppressions

Retrait du Tableau de bord (2 modes, ~16 widgets), de Suivi (5 sous-vues), des Automatisations,
des Prélèvements. Purge des presets de menu. **En dernier** : tant que les lots 1-2 ne sont pas
fumés, ces écrans restent le filet.

### Lot 4 — Bail repris

Lecture de `typeContrat === 'repris'` par Bail / EDL / Caution (C5). Section pièces jointes sur
le bail (C6). Bandeau + badge + « Réclamer au vendeur ».

### Lot 5 — Agenda

Redéfinir ce qui reste à l'Agenda une fois les alertes remontées au Pilotage : le calendrier,
sans alerte rouge concurrente. Unifier `AGENDA_MAINTENANCES` et `EQUIP_RULES`.

---

## 10. Points restés ouverts

| # | Question |
|---|---|
| O1 | Le « Climat conformité » (nuage météo) est-il regretté ? Écarté par défaut. |
| O2 | Le séparateur U+202F est-il un défaut **en prod** ou seulement dans le mockup ? |
| O3 | Quels autres appelants dépendent de `_pilCumulLocataire` ? |
| O4 | Les délais légaux cités (art. 22, 17-1, 23, 1731, 1743) sont cités **de mémoire du texte**, non relus dans le code. À faire confirmer. |
| O5 | L'EDL de sortie porte-t-il une donnée de conformité exploitable (1 mois / 2 mois) ? |
| O6 | Seuil d'alerte de vacance (proposé : 60 jours) — arbitrage de gestion, jamais soumis. |
| **O7** | La bulle « Logements à relouer » affiche `− 3 410 €`. Ne devrait-elle pas afficher **« 2 sans candidat »** — plus actionnable qu'un montant déjà perdu ? |
| **O8** | Marge de **36 px** seulement sous la colonne gauche en disposition 2 sur PC. Tient, mais fragile. |
| **O9** | Onglets non revus : **Finances · Charges · Mouvements** (leurs CDC existent, revue de cohérence R-0 à faire) et **Logements · Locataires · Candidatures · EDL** (écrans de saisie, aucune redondance détectée). |

---

*Écrit le 26/08/2026 — session KPI. Révisé le 26/08 (fusion Accueil + Parc, 8 familles).
Aucun code de l'app modifié, aucun commit, `BACKLOG.md` et `docs/CDC-*.md` intouchés.*
