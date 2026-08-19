# CDC Finances — validé par Didier en revue ligne par ligne

> **Statut : ✅ REVUE TERMINÉE — les 9 sections passées avec Didier, décisions validées une par une.**
> Support de revue : `mockups/FINANCES-PNL-REVUE/revue-pnl.html`.
> Mockups produits en séance (tous locaux, double-clic) : `hero-AB.html` (grand chiffre) ·
> `couleurs.html` (code couleur) · `ratios.html` · `colonnes.html` (mouvements post-datés) ·
> `argent-a-recuperer.html` · `page-finances.html` (page complète) · `responsive.html` (audit par
> appareil) · `popups.html` (drills existants + ajout).
> Ancrage code : index.html v15.504.

---

## 0. Principe directeur (gravé en séance)

> **Aucun chiffre de Finances n'est calculé sur une valeur « actuelle » appliquée au passé.
> Tout se lit sur l'historique du mois concerné.**

Rappel des 2 sources (règle existante, confirmée) : **le bail donne le dû** (barème historisé,
`duMois` / `_duMoisLot`), **l'import bancaire donne le payé**. La quittance ne pilote aucun calcul.

### I-1 · Invariant HISTORIQUE DES BAUX — testable, à re-vérifier à chaque évolution

Aucune surface de Finances ne lit un loyer « actuel » ou « moyen » pour un mois passé. Toute valeur de dû
passe par `duMois(lot, mois)`.

**Infractions restantes dans le code, supprimées par ce chantier :**
- `bail.hc × nombre de mois` (attendu du widget impayé, index.html:49527) → facturerait rétroactivement une
  IRL d'août depuis janvier. **Disparaît avec K-1.**
- `loyerMensuelMoyen × occDays/30,44` (attendu du ratio de recouvrement) → moyenne qui écrase l'historique.
  **Disparaît avec R-2.**

**Test d'invariant à écrire (anti-régression, système vivant) :** un lot à 800 € de janvier à juillet,
indexé à 850 € au 1ᵉʳ août — après application de l'IRL, **aucun chiffre des mois de janvier à juillet ne
bouge**, sur toutes les surfaces : tableau, ratios, drills, popups, clé de répartition P-4.

---

## 1. Périmètre (section ① du support)

**P-1 · Trois crans : Tout / bailleur / immeuble.** Pas de cran logement (décision Didier : peu utile ;
le détail par lot reste accessible en lecture via le drill « Voir par logement »).
Contrôle unique en cascade en haut de page. Le cran **bailleur pilote la pastille globale** de la sidebar
(une seule vérité) ; le cran immeuble est local à Finances mais **transmis aux pages cibles**.

**P-2 · Aucun lot invisible.** Les lots sans bailleur sont regroupés sous « **Sans bailleur (à rattacher)** »,
ceux sans immeuble sous « **Sans immeuble (à rattacher)** ». Paniers sélectionnables, avec le nombre de lots.
Corrige les constats 13 (lot sans entité exclu de la vacance mais compté en impayé) et 21.

**P-3 · Un seul résolveur de périmètre** (`scopeWeight` étendu), consommé par les 4 moteurs. Fin du
filtrage maison par moteur (constat C7).

**P-4 · Répartition des frais du bailleur en vue immeuble — clé MENSUELLE au potentiel locatif.**
Frais concernés : comptable, frais bancaires, CFE, assurance SCI — tout ce qui n'est rattachable à aucun immeuble.
Pour chaque mois M et chaque lot :
1. **bail actif ce mois-là → le loyer HC dû DE CE MOIS**, lu sur le barème historisé (800 € en janvier,
   850 € en août après IRL ou travaux — jamais rétroactif) ;
2. **pas de bail ce mois-là → `loyerHcRef`** (loyer souhaité de la fiche, poussé par le bail et par l'IRL
   via `_pushLoyerTheoFromLive`), repli `hc` ;
3. aucune valeur → 0.

Poids de l'immeuble pour M = son potentiel du mois ÷ potentiel total du bailleur ce mois-là.
**Chaque frais est réparti avec les poids du mois où il tombe.** Repli au nombre de lots si le potentiel
total d'un mois est nul. **Taux plein du mois** (pas le prorata d'entrée/sortie).
Écarté explicitement : répartition égale par immeuble (l'actuel, `1/nbImm` — faux dès que les immeubles
diffèrent en taille) et répartition au prorata des loyers **encaissés** (la vacance d'un immeuble
déplacerait les frais sur les autres).
**Invariants à tester : Σ vues immeuble = vue bailleur, mois par mois ET sur l'année.**
Affichage : clé annoncée en haut de page, mention « quote-part » sur la ligne, calcul visible au clic.

**P-5 · Le sélecteur immeuble s'affiche toujours**, même avec un seul immeuble (aujourd'hui masqué sous 2 —
l'utilisateur ne voit pas son périmètre).

**P-6 · Le garde-fou « immeuble hors périmètre → Tous »** reste mais le **dit**, au lieu d'agir en silence.

---

## 2. Fenêtre temporelle

**F-1 · Une seule fenêtre : année civile bornée au mois écoulé**, appliquée à **tous** les blocs.
Le **sélecteur d'année est conservé** (4 années glissantes, défaut = année en cours).
La fenêtre effective est écrite en clair en haut de page : « du 01/01 au 31 août 2026 · 8 mois ».

Ce que ça corrige (constat 33 / C2) — l'état actuel vérifié en séance :

| Bloc | Fenêtre réelle aujourd'hui | |
|---|---|---|
| Tableau P&L + héro | 01/01 → mois courant | ✔ |
| Comparatif N-1 | même période forcée | ✔ |
| Occupation / vacance | 01/01 → aujourd'hui | ✔ |
| Impayé de l'exercice | 01/01 → aujourd'hui | ✔ |
| Loyers encaissés / charges | année civile pleine (`startsWith(yr)`) | ≈ |
| **Régularisation de charges** | **01/01 → 31/12 même en août** | ✗ |
| **IRL sous-indexée** | **projection annualisée** | ✗ |

Correctif : `_finRegulAFaire` **reçoit `lastMonth`** (le paramètre existe déjà, index.html:50641, il n'est
simplement pas passé) ; l'IRL est exprimée en « manque à gagner depuis le 1er janvier », plus en €/an.

**N-1 · La note « exercice en cours » devient factuelle** : « Chiffres arrêtés au 31 août 2026 · 8 mois —
tous les blocs de la page utilisent cette même période. »

**Hors V1, noté** : mode « 12 derniers mois glissants ». Quasi gratuit une fois le résolveur de fenêtre
unique en place, mais ne recoupe aucun document fiscal → pas en V1.

### F-1 v2 — précision apportée par la décision « B » sur les mouvements post-datés

Décision Didier : **un mouvement daté après le mois courant COMPTE dans les totaux de l'exercice**
(« c'est le plus juste sur l'année à l'instant donné » — l'argent est déjà là, il ne doit pas être invisible).
Aujourd'hui il est purement ignoré (`if (!b) return`) : ni dans son mois, ni dans l'annuel (constat 26).

Cela impose de **nommer deux fenêtres distinctes** — ce n'est pas une entorse à R-1, ce sont deux questions
différentes, chacune avec une définition unique :

| Fenêtre | Sert à | Étendue |
|---|---|---|
| **Fenêtre de constat** | ce qui est passé sur le compte : loyers encaissés, charges payées, cash-flow, colonne Année | 01/01 → **dernier mois contenant un mouvement connu** (septembre compris si un loyer y est déjà encaissé) |
| **Fenêtre d'exigibilité** | ce qui est dû : retard, recouvrement, relances | 01/01 → **dernier mois échu** — on ne peut pas être en retard sur un loyer qui n'est pas encore dû |

Conséquences :
- **Le libellé de période change** : « Exercice 2026 · tout ce qui est saisi au 13/09 », plus « 8 mois écoulés ».
- **Le comparatif N-1 s'aligne sur la même étendue de mois** que N, sinon la variation compare 9 mois à 8.
- **Les colonnes de mois non échus restent visuellement distinctes** (grisées, marquées « à venir ») tout en
  étant comptées — l'utilisateur doit voir d'où vient le dépassement.
- Le recouvrement ne peut pas dépasser 100 % du fait d'un loyer payé d'avance : son dénominateur suit la
  fenêtre d'exigibilité, et un encaissement anticipé est imputé au mois qu'il couvre (cascade + avance).

---

## 3bis. En-tête et pied du tableau (section ④)

**E-1 · Si un chiffre a besoin d'une note de bas de page pour être compris, on corrige le chiffre ou son
libellé — on n'ajoute pas de note.** La note de bas de carte est **supprimée**. Ses contenus sont
redistribués : « cash-flow réel = ce qui bouge sur ton compte » → popup du cash-flow · « la base 2044 ne
déduit que les intérêts » → popup de la ligne 2044 · « N-1 sur la même période » → en-tête de colonne N-1.

**E-2 · CADUC** — « Voir par logement » est supprimé (cf D-5) : la maille s'arrête à l'immeuble.

---

## 3ter. Colonnes du tableau (section ⑤ — mockup `colonnes.html`)

**T-1 · Colonne « Année » = somme des colonnes mois**, jamais un recalcul séparé. C'est cette propriété qui
rend le tableau vérifiable à l'œil. (Constat 37 : arrondi au centime avant sommation, écart de quelques
centimes accepté.)

**T-2 · Colonne « N-1 »** — inchangée ; le **drill doit s'aligner dessus** (aujourd'hui son total N inclut
les avoirs et son total N-1 les exclut — constat 28). Réglé par R-1.

**T-3 · Colonne « Var. »** — règle unique de variation, partagée avec le héro (cf H-5).

**T-4 · Colonne « % loyers »** — inchangée : poids de la ligne rapporté aux loyers HC encaissés de l'année.

**T-5 · Colonnes mois** — mouvements post-datés comptés et affichés grisés (cf F-1 v2).
**Ordre conservé : du plus récent au plus ancien** (mois en cours visible sans défiler).

---

## 3. Catégories (le bandeau d'alerte disparaît)

**M-1 · Plus aucune catégorie « non classée » possible.** Le nom reste libre (règle « choix prédéfini +
ajout libre » respectée), mais toute catégorie créée — à la main ou par l'import — doit être rattachée à
l'une des **23 catégories du référentiel** `STD_CATEGORIES`. Rattachement à une **catégorie**, pas à une
ligne 2044 : c'est ce qui rend enfin exprimables les 10 catégories hors-2044 (Prêt, dépôt de garantie,
virement interne, CCA, acquisition, travaux de construction, frais bancaires, charges récupérables,
acompte de départ, divers non déductible). L'alias hérite du traitement fiscal **et** cash-flow de sa mère.

Justification retenue : la 2044 seule ne couvre pas tout ce qui bouge sur le compte (capital du prêt, DG,
virements internes, apports d'associé, achat du bien, dépenses privées) — mais le référentiel de l'app, si.

**Conséquence : le bandeau « ⚠️ N catégories non reliées » est SUPPRIMÉ de la page** — l'état qu'il
signalait devient impossible.
**Migration one-shot** au premier chargement : les catégories maison existantes sont listées et rattachées
une fois, de façon bloquante (sinon des montants déjà saisis restent invisibles).
Effet de bord : `DB.catMapping` comme table parallèle n'a plus lieu d'être.

**M-2 · Le mapping doit être passé au bilan.** Vérifié en séance : la prévisualisation 2044 honore bien le
mapping (`_legal2044BuildOpts`), mais **`legal-bilan.js:50` et `:57` appellent `_compute2044` sans
`mapping`** → une charge dans une catégorie maison est comptée dans le tableau et **disparaît du drill
« Voir par logement »**. Sans ce correctif, le total ne peut pas égaler la somme des logements.

---

## 4. Héro (section ② du support)

**H-4 · Le grand chiffre reste « Cash-flow réel »**, mensualité de prêt **entière** incluse.
Arbitré sur mockup `hero-AB.html` contre « Résultat avant impôts » (nom de la maquette `pl-revise.html`
du 19/06, **amendée sur ce point**). Motif : le cash-flow est toujours calculable et recoupable avec le
relevé bancaire, alors que le résultat avant impôts **exige les intérêts saisis** pour exister
(capital = échéances − intérêts). **H-4 v2 : le chip « Enrichissement » est SUPPRIMÉ.**
Motif Didier : l'enrichissement par amortissement est **théorique** (« faut-il encore pouvoir vendre le
bien »), et il a le même défaut que la ligne 2044 — il exige les intérêts saisis pour exister. Deux
indicateurs qui se verrouillent faute d'intérêts sur le même écran, c'est deux fois le même problème.
Le capital remboursé reste visible là où il est factuel : ligne « Prêt » et son info-bulle « dont intérêts ».
**Le héro n'affiche plus qu'un seul chiffre, et il est toujours calculable.**

**H-1 · Ordre d'imputation expliqué à l'écran.** La règle (décision Didier du 09/07, inchangée) :
pour chaque (lot, mois), l'argent reçu paie **1. le loyer HC du mois → 2. les charges du mois →
3. les arriérés de loyer (les plus vieux d'abord) → 4. les arriérés de charges → 5. reliquat**.
Le dû est lu sur le barème du mois. Conséquence à assumer et à écrire : sur un paiement partiel,
**le manque tombe d'abord sur les charges**.

**H-2 · Encaissements non affectés rendus visibles.** Un encaissement de loyer **sans lot rattaché**
compte aujourd'hui dans le total mais dans aucun lot : le total est juste, le détail est faux (les
locataires concernés apparaissent en impayé). Nouvelle ligne « ⚠️ Encaissements non affectés — X € ».

**H-2b · CAF / APL : la ventilation devient obligatoire.** Aucune notion de tiers payeur n'existe dans
l'app ; l'aide de l'import suppose déjà que l'utilisateur ventile à la main. Désormais un encaissement de
loyer sans lot **bloque la validation de l'import** tant qu'il n'est pas réparti (l'écran de répartition
existe). Aucune donnée nouvelle à saisir. *Noté hors V1 : notion de tiers payeur au bail (montant CAF
mensuel déclaré → pré-ventilation automatique).*

**H-5 · Une seule règle de variation N-1.** Trois conventions cohabitent aujourd'hui (héro : ÷|N-1| ;
tableau : « — » si N-1 ≤ 0 ; synthèse : 0 %) — constat 34. Règle unique : N-1 **même période**, et
**« n/a »** explicite quand N-1 est nul ou négatif (jamais un « 0 % » qui ressemble à de la stabilité).

**H-6 · Garde `capital ≥ 0` rétablie** (constat 27). Si `échéances = 0` alors que des intérêts existent
(prêt non importé), afficher « prêt non importé » plutôt qu'un capital négatif.

**H-7 · Intérêts d'emprunt répartis au prorata des échéances payées** (constat 26). Aujourd'hui datés du
31/12, donc hors fenêtre toute l'année : la base 2044 reste verrouillée et le message « renseigne tes
intérêts » revient à tort. Les intérêts sont une donnée annuelle, pas un flux de compte.

**Nouvelle sous-ligne : « dont rattrapage d'un mois antérieur »**, cliquable. Le P&L reste tenu **en
encaissement** (le mois qui reçoit porte le montant, comme l'exige la 2044) ; la sous-ligne explique
pourquoi un mois peut dépasser son dû. Écartée : la réattribution du rattrapage au mois d'origine
(le tableau ne correspondrait plus au relevé bancaire ni à la déclaration).

Lignes du héro validées sans modification : Loyers encaissés (HC), Recettes diverses, Cash-flow net,
Cash-flow réel.

---

## 4bis. Ratios (section ③ — mockup `ratios.html`)

**R-1 · UN CHIFFRE = UN CALCUL, UN SEUL.** Règle transverse la plus structurante de la session.
Aucune information de la page ne peut provenir d'une seconde source qui la recalcule à sa façon.
Tous les blocs consomment le **même socle** (dû = barème historisé, payé = import), le **même périmètre**,
la **même fenêtre**. C'est la cible du chantier : replier `_computeFinancesSummary`, `_finChargeBuckets`,
`computeRegul` et `_computeBilanAnnuel` sur le moteur mensuel.

**R-3 · Finances est l'onglet MAÎTRE des KPI.** Tout chiffre financier affiché ailleurs — cartes de
l'Accueil, fiche entité, fiche immeuble, fiche logement — **lit ce socle**, il ne le recalcule pas.
Aucune page ne peut afficher un montant financier qui ne soit pas produit par le moteur de Finances.

**Il reste 2 ratios : Recouvrement et Occupation.**

**R-2 · Recouvrement = tous les encaissements ÷ tout le dû, CHARGES COMPRISES.**
- Dénominateur : dû **CC** de la période (loyer HC + provisions), lu **mois par mois sur le barème
  historisé** — jamais un loyer moyen, jamais un loyer actuel appliqué au passé.
- Numérateur : **tous les encaissements** imputés à ce dû, sans distinction loyer/charges.
- Motif (Didier) : en HC seul, 800 € versés sur un dû de 800 + 100 affichent **100 %** alors qu'il manque
  100 € — la cascade servant le loyer d'abord, le manque tombe sur les charges et devient invisible.
- **Supprimés** : `attenduHCTheo` (dû recalculé depuis le bilan via `loyerMensuelMoyen × occDays/30,44`,
  soit une 2ᵉ définition du dû qui écrase l'historique) et le plancher `max(attendu, encaissé)` qui
  bornait le ratio à 100 % pour le rendre « joli ».
- Les **rattrapages d'exercices antérieurs sont hors ratio** et affichés à côté (« + 620 € d'arriéré 2025 ») :
  chaque euro est imputé à un mois de dû précis, donc un euro qui solde 2025 appartient à 2025.
- Le retard affiché à côté du ratio est lui aussi **loyer + charges**.
- Le compteur « N impayés » vient du même moteur (lots avec retard résiduel > 0), plus d'une liste à part.

**R-4 · « Occupation » = moyenne de la période, PARTOUT dans l'app** (jours loués ÷ jours louables sur la
fenêtre). Corrige le constat 39 (sémantique double : instantané ailleurs, moyenne ici). L'état du jour
reste affiché comme information distincte : « 1 lot vide depuis le 12 mai ».

**R-5 · La jauge « Poids des charges » est SUPPRIMÉE.** Décision Didier : l'information est déjà portée
par le cash-flow (positif = les encaissements dépassent les charges), et qui veut le pourcentage peut le
calculer depuis le tableau.
Motif décisif : le ratio est **faux silencieusement** dès qu'il y a un prêt sans intérêts saisis — l'app
connaît la mensualité entière mais pas sa décomposition, donc « hors prêt » oublie les intérêts
(sous-estime) et « prêt entier » compte du capital (sur-estime). Il affichait par ailleurs 3 130 € face
aux 5 850 € du tableau, sur le même écran, sans explication (constats 29, 32, 33).
**Conséquence : `_finChargeBuckets` n'a plus d'usage** une fois le résultat net N-1 repris sur le moteur
mensuel → un des 4 moteurs disparaît complètement.

---

## 4ter. Lignes du tableau (section ⑥)

**Cadrage donné par Didier :** « le P&L n'est pas la 2044 — je veux un cash-flow ». La page répond à
« est-ce que je dois remettre de ma poche ce mois-ci ? ». L'enrichissement par amortissement est théorique
et suppose de pouvoir vendre ; il ne pilote pas l'écran.

### Structure finale du tableau

```
▸ REVENUS LOCATIFS
    Loyers hors charges encaissés
      ↳ dont loyer en retard              (orange, cliquable)
      ↳ dont loyer perçu d'avance         (bleu, cliquable)
      ↳ dont rattrapage d'un mois antérieur  (gris, cliquable)   ← NOUVEAU
    Recettes diverses                     (conditionnelle)
▸ CHARGES PROPRIÉTAIRE
    Prêt (mensualité entière)             + info-bulle « dont intérêts »
    Taxe foncière
    Travaux & entretien
    Honoraires & gestion
    Assurance PNO / GLI
    Charges de gestion hors foncier       (CFE, taxe vacance — conditionnelle)
    Autres charges propriétaire           (2044 · 225/226 — conditionnelle)   ← NOUVEAU
    = Total charges propriétaire          (somme exacte des lignes visibles)
▸ CHARGES RÉCUPÉRABLES
    Payées par les locataires (provisions encaissées)
      ↳ dont charges en retard            (orange, cliquable)
    Avancé pour les locataires            (récupérable)                        ← SCINDÉ
    Resté à ta charge                     (vacance / non récupérable → bascule en 225)
    = Solde de trésorerie des charges
  Cash-flow réel                          (ligne nette, en gras)
  Cash-flow net                           (grisée)
```
**Supprimée : la ligne « Base imposable foncier [2044] ».**

### Décisions

**L-1 · Tolérance de début de mois partagée.** Le retard du tableau neutralise le mois courant avant le 10 ;
le widget « Loyer impayé » du même écran compte le mois entier dès le 1ᵉʳ (constat 45). Le widget lira le
retard du tableau — plus de calcul propre.

**L-2 · Ajout de « Autres charges propriétaire » (2044 · 225/226)** — constat 25 confirmé : ces montants
entrent dans le Total mais **aucune ligne ne les affiche**, donc la somme des lignes visibles ≠ total.
Ligne conditionnelle, avec son drill.

**L-3 · « Prêt » reste une échéance entière** (convention validée), + info-bulle « dont intérêts : X € ».

**L-4 · Le Total charges propriétaire est vérifiable à l'œil** : somme exacte des lignes visibles.

**L-5 · « Payées par toi pour eux » est SCINDÉE en deux** (constat C6) :
- « **Avancé pour les locataires** » — vraiment récupérable, seul à entrer dans le Solde ;
- « **Resté à ta charge** » — mois de vacance, lot sans bail, lot non récupérable → **bascule dans
  « Autres charges propriétaire » (ligne 225 : charges récupérables non récupérées)**.
La boucle se referme sur L-2, et **le cash-flow réel ne bouge pas d'un centime** (déplacement, pas ajout).

**L-6 · Le « Solde » est renommé « Solde de trésorerie des charges »** (constat C1). Il ne peut pas
coïncider avec le widget Régularisation : ici un **net de trésorerie signé sur la période**, là-bas une
**créance contractuelle** (positifs seulement, année pleine, provisions théoriques). La régularisation
détaillée étant hors V1, on garde ce solde et on nomme ce qu'il est. Sort du widget → section ⑧.

**L-7 · Suppression de la définition legacy du cash-flow réel** (constat 38 : deux définitions cohabitent,
l'ancienne `résultat net − capital` est morte mais présente). Elle disparaît pour ne pas pouvoir revenir.

**L-8 · La ligne « Base imposable foncier [2044] » SORT du tableau.** Elle est verrouillée la plupart du
temps (sans intérêts saisis elle n'existe pas), c'est une estimation avouée (forfait 20 €/local, déficit
foncier, micro/réel non repris), et elle mélange trésorerie et fiscal. La 2044 reste dans sa
**prévisualisation dédiée** en bas de page, calculée sur l'année civile entière avec le bon mapping.
**Conséquence : la saisie des intérêts n'est plus un pré-requis pour lire Finances — seulement pour déclarer.**

**L-9 · Charges annuelles pas encore payées : on ne fait rien.** La taxe foncière vaut 0 € tant qu'elle
n'est pas prélevée, donc le cash-flow d'un exercice en cours paraît meilleur qu'il ne finira. Le biais est
déjà neutralisé par la colonne N-1 bornée à la même période (2025 avait aussi sa taxe en octobre).
**Le tableau est un constat, jamais une prévision** — on n'introduit pas une 3ᵉ nature de chiffre.

**Lignes inchangées** : Taxe foncière (227), Travaux (224/224bis), Honoraires (221), Assurance (223),
Charges de gestion hors foncier (CFE/TLV — dans le résultat de gestion, hors 2044), Recettes diverses (213),
Loyers HC, dont retard, dont avance, Cash-flow net.

---

## 4quater. Drills — ce qui s'ouvre au clic (section ⑦)

**X-1 · Finances est AGNOSTIQUE DU RÉGIME FISCAL.** La page mesure de la trésorerie. Le déclaratif est un
**module optionnel branché en sortie**, jamais une contrainte sur l'écran. Cadrage Didier : « en SCI je n'ai
pas besoin de la 2044 mais je veux savoir comment évoluent mes finances ». Selon le statut le formulaire
diffère (2044 en nom propre, 2072 pour une SCI à l'IR, liasse à l'IS) : **aucun chiffre affiché ne doit
dépendre d'un formulaire.**

**D-1 · « Détail des mouvements »** — devient une **lecture** du même calcul, jamais un recalcul (constat 28 :
son total N inclut les avoirs, son total N-1 les exclut → il ne retombe pas sur la ligne qu'il détaille).

**D-2 · « Cause du retard »** et **D-3 · « Qui a payé d'avance »** — déjà à la cible. Format C-1 : le pourquoi
en tête, puis le détail. Une seule action, sur le retard : « 📄 Lettre de relance ».

**D-4 · « ⇄ Comparer 2 mois » : SUPPRIMÉ.** Le tableau affiche déjà tous les mois côte à côte, plus N-1 et la
variation — la comparaison est native. Ne servait qu'à comparer deux mois non adjacents sans défiler.

**D-5 · « Voir par logement » : SUPPRIMÉ.** Décision Didier : **la maille s'arrête à l'immeuble**, pas de
niveau logement (peu d'intérêt). La répartition des dépenses de niveau bailleur (comptable, frais bancaires,
CFE, assurance SCI) suit les règles de **P-4** (clé mensuelle au potentiel locatif).
**Précision** : il n'y a plus de *vue* par logement, mais les popups d'anomalie **nomment le lot et le
locataire** concernés — sinon la lettre de relance est impossible. C'est de l'explication, pas un périmètre.

**D-6 · « 🧮 Renseigner les intérêts » : RETIRÉ de cette page** — L-8 ayant supprimé la ligne 2044, plus rien
ici n'a besoin des intérêts. L'accès reste dans le module déclaratif.

---

## 4quinquies. Bloc « Argent à récupérer » (section ⑧ — mockup `argent-a-recuperer.html`)

**K-1 · LE BLOC EST SUPPRIMÉ INTÉGRALEMENT** (les 5 éléments).

Motif : il ne fait que **répéter le tableau avec d'autres calculs** — et c'est précisément ce qui produisait
les écarts constatés. Quatre widgets recalculaient à leur façon, avec d'autres fenêtres et d'autres
périmètres, ce que le tableau sait déjà :

| Poste supprimé | L'information vit désormais |
|---|---|
| 🚩 Loyer impayé | sous-ligne « dont loyer en retard » du tableau (orange, cliquable) |
| Charges impayées | sous-ligne « dont charges en retard » |
| ⚖️ Régularisation | ligne « Solde de trésorerie des charges » |
| ⏳ Vacance | ratio d'**occupation** + son montant (cf K-2) |
| 📈 IRL sous-indexée | page **Révision IRL** dédiée |

**Découverte en séance (hors audit) : ces créances ne s'additionnent pas.** Les charges impayées sont déjà
contenues dans le solde de charges avancées — si le locataire ne verse pas ses provisions, le solde est
mécaniquement plus négatif d'autant. Tout total les comptait deux fois. **Aucun total n'est reconstruit.**

**Effet de bord majeur : trois des quatre moteurs concurrents disparaissent** avec le bloc
(`computeRegul` côté widget, `_finIrlSousIndexation`, l'impayé recalculé par `_computeFinancesSummary`).
Combiné à R-5 (`_finChargeBuckets`) et à L-8, il ne reste que **le moteur mensuel**.

**K-2 · Le manque à gagner de la vacance est affiché SOUS le taux d'occupation**, en euros
(« 75 % · moyenne sur 8 mois · 4 lots · **5 200 € de manque à gagner** »). Il **qualifie** le pourcentage au
lieu de se faire passer pour une créance. Explicitement marqué **théorique** dans son popup (« le loyer que
le lot aurait produit s'il avait été loué »). Calculé sur **la même base que P-4** — loyer de référence du
lot (bail en cours → `loyerHcRef`) × jours vides — et sur **la même fenêtre** que le reste de la page.

---

## 4sexies. Exports & déclaratif (section ⑨)

**Z-1 · La prévisualisation 2044 reste, et devient le SEUL lieu du fiscal.** Depuis L-8 (retrait de la ligne
du tableau), les deux « bases 2044 » qui cohabitaient sur la même page n'existent plus : il n'en reste
qu'une, ici, calculée sur **l'année civile pleine** — sa vraie fenêtre. C'est le seul bloc de la page qui
échappe à F-1, et c'est assumé et écrit.

**Z-2 · Constat 31 : PÉRIMÉ, vérifié en séance.** Le support annonce que le mapping utilisateur n'est pas
transmis à la prévisualisation. C'est faux depuis un correctif : `_legal2044BuildOpts` construit bien
`mapping` et le passe à `_compute2044` (index.html:33851 → 50740). **Le trou restant est ailleurs** : le
**bilan annuel** ne le reçoit toujours pas (cf M-2, `legal-bilan.js:50` et `:57`).

**Z-3 · Le déclaratif est un module optionnel** (cf X-1). Prévoir dès la structure que le formulaire dépend
du statut — 2044 en nom propre, 2072 pour une SCI à l'IR, liasse à l'IS. **Hors V1**, mais le module ne doit
pas être écrit comme si « déclaration » signifiait « 2044 ».

---

## 5. Code couleur (transverse — mockup `couleurs.html`)

**C-1 · Grammaire à deux supports, jamais mélangés :**

| Support | Sens |
|---|---|
| **Couleur du texte** | le **flux** : vert = l'argent entre, rouge = l'argent sort |
| **Texte gris** | informatif, pas un flux (rattrapage, zéros) |
| **Fond de case + pastille** | **signalement** : ce chiffre s'écarte du dû → orange = retard, bleu = avance |

Rouge veut dire « ça sort », **jamais** « ça va mal » — c'est pourquoi le retard garde l'orange.
Palette close : **vert, rouge, gris, orange, bleu**. Rien d'autre.

**Retard : aucune tolérance de montant** — orange dès 0,01 € (seuil technique anti-arrondi uniquement).
Le loyer du mois courant non encore échu n'est pas un retard (tolérance de date, à confirmer section ⑥).
**Avance : fond coloré aussi** (décision Didier) — « une avance doit être vue et comprise, ce n'est pas anodin ».

**Supprimé** : le bleu vif de la ligne « Base 2044 » (`#2563eb`) — troisième usage du bleu sans sens propre.
**Corrigé** : les bleus codés en dur passent en variables de thème (invisibles/criards en sombre).
**a11y** : jamais la couleur seule — pastille + montant + libellé (vérifié en simulation deutéranopie).

### Structure RÉELLE des popups — socle existant à PRÉSERVER (`_finDrillLigne`, index.html:50628)

Constaté en séance : les drills sont bien plus riches que ce que la revue supposait. **Quatre blocs, à garder tels quels** :

1. **Récap** — montant + badge de variation vs N-1 (ou « nouveau poste ») + « N pièces · N biens ».
2. **Alerte « non ventilé »** (si des mouvements ne sont rattachés à aucun bien) — montant concerné,
   badge **« X % du poste »**, la ligne du mouvement ciblé, le **sélecteur d'affectation complet**
   (Logement / Immeuble / SCI-entité / Récupérable), bouton **« Affecter ce mouvement »**, et lien
   **« ✂️ ventiler »** si la ligne couvre plusieurs biens. Un mouvement à la fois, jamais d'affectation
   de masse hétérogène.
3. **Répartition par bien** — tuiles nom / montant / %, ou « Intégralement sur X » si un seul bien.
4. **Mouvements** groupés par mois, chaque ligne portant son badge : le bien · **« non ventilé » + ✂️** ·
   **« ⚠ SCI X % »** (frais bailleur réparti, avec le total brut en infobulle).

**Conséquences :**
- **H-2 est en grande partie DÉJÀ FAIT** : l'alerte « mouvement non rattaché » existe, chiffrée en % du
  poste, et elle est **actionnable sur place**. Ce qui reste de H-2 : la même information doit exister
  **au niveau de la ligne du tableau**, pas seulement dans le popup qu'il faut ouvrir pour la découvrir.
- **P-4 dispose déjà de son affichage** : le badge « ⚠ SCI X % » montre la quote-part et son total brut.
  Notre chantier ne change que **la clé** (aujourd'hui `1/nbImm`, demain potentiel locatif mensuel) — et
  l'infobulle doit énoncer la nouvelle clé.
- Les popups portent donc **trois alertes** : non-ventilé au niveau du poste (bloc d'action), non-ventilé
  au niveau de la ligne (badge + ✂️), quote-part SCI (badge). **Aucune ne doit disparaître.**

**C-2 v4 · Un popup explique, il ne redirige pas — mais il CORRIGE.**
Distinction à respecter : sont autorisées les actions qui **corrigent la donnée que le popup affiche**
(affecter un mouvement, le ventiler) et **une** action métier issue de l'anomalie (lettre de relance).
Sont interdits les liens de navigation exploratoire (« voir la fiche », « historique », « aller à… »).

**C-2 · Un popup explique, il ne redirige pas.** Contenu : **le pourquoi en tête**, puis le détail chiffré.
Aucun lien de navigation exploratoire. **Exception unique : l'action directement issue de l'anomalie** —
« 📨 Créer une relance » sur un retard (la fiche de relance existe côté Quittance). Le popup d'avance,
lui, n'a aucune action.
Aujourd'hui la cellule orange ouvre la liste des mouvements, qui n'explique pas la couleur : à corriger.

---

## 5bis. Responsive — AUDIT de l'existant (mockup `responsive.html`)

**Le responsive fonctionne ; ce qui suit est un audit, pas une refonte.** Trois breakpoints, à trois
endroits du fichier :

| Règle | Où | Effet |
|---|---|---|
| `max-width:760px` | index.html:49539 | ratios 3 → 2 colonnes, héro 40 → 32 px |
| `max-width:480px` | index.html:49544 | ratios → 1 colonne |
| `max-width:680px` | index.html:50404 | `.b4-midwrap{display:none}` **et** `.b4-hint{display:none}` |

**Ce qui est sain et doit être repris tel quel** : le héro en `flex-wrap` s'empile sans règle dédiée ;
la grille 3 panneaux (`b4-left` / `b4-midwrap` / `b4-right`) absorbe la contrainte par le conteneur
central ; **`table-layout:fixed` sur `.b4-left`** — indispensable, sinon les libellés en `nowrap`
imposent leur largeur et le tableau déborde (erreur commise puis corrigée en séance).
Leçon reportable : **fixer la largeur SUR LA TABLE**, pas sur les cellules ; la colonne « Poste » prend
alors ce qui reste.

**Constats :**
1. **Trois valeurs de bascule** (760 / 680 / 480) pour une seule page, dont une dans un bloc CSS injecté
   séparément. Entre 680 et 760 px (iPad portrait) les mois sont masqués alors que les ratios sont encore
   sur deux colonnes. → **une seule valeur**.
2. **Sous 680 px, la disparition des mois est muette** : `.b4-hint` est masqué par la même règle. On perd
   l'accès au détail mensuel **et** l'information qu'il existe.
3. **`repeat(3,1fr)` à corriger** : avec R-5 il n'y a plus que 2 ratios ; la règle des 760 px devient
   inutile, seule celle des 480 px sert.
4. **Aucune règle d'orientation ni de hauteur dans toute l'app.** Seule la largeur décide. En téléphone
   **paysage (844 × 390)** la largeur repasse au-dessus de tous les breakpoints → **le tableau complet
   revient**, mois compris. Pivoter l'écran est donc déjà la solution — mais rien ne le dit.

**Décisions :**

**RS-1 · Sous le breakpoint, option B retenue** (validée sur mockup) : un **sélecteur de mois** dans
l'en-tête de la carte remplace les colonnes ; une seule colonne de mois s'affiche, **cases toujours
cliquables** (donc les popups restent accessibles sur téléphone — c'est ce qui se perdait).
Le panneau droit (N-1 / Var. / % loyers) est masqué en dessous du breakpoint : **~230 px récupérés**,
le comparatif reste dans le popup.

**RS-2 · Compactage en hauteur — règle à CRÉER** (n'existe nulle part) : sous ~480 px de haut
(téléphone paysage), le héro et les jauges se compactent (grand chiffre 34 → 22 px, meters masqués)
pour rendre ~100 px au tableau. Sans ça, héro + ratios consomment les deux tiers de l'écran.

**RS-3 · Une seule valeur de bascule** pour toute la page, et le message de repli reste visible :
« ↔ détail mensuel : fais pivoter l'écran ou ouvre sur un écran plus large ».

**RS-4 · Popups** : le pattern de l'app est bon (flex colonne, `max-height` en vh, **corps seul
scrollable**). Vérifié jusqu'au pire cas — téléphone paysage, popup à 9 lignes : 329 px dans 392,
en-tête et pied restent visibles. **Rien à changer.**

---

## 6. À transmettre à la session de pilotage

- **Fiche de relance depuis Quittance** — l'écran de création de relance existe côté Quittance ; le popup
  de retard de Finances doit l'appeler. À cadrer par le pilotage (rattachement, modèle, traçabilité).
- Rappel : le filtre immeuble ne suit sur aucune des 4 destinations des widgets « Argent à récupérer »
  (constat 22) — traité par P-1, mais à confronter à C-2 en section ⑧.

---

## 7. Verdicts

| Section | Éléments | Verdict |
|---|---|---|
| ① Barre de périmètre & bandeaux | 5 | ✏️ à corriger (5/5) |
| ② Héro « Cash-flow réel » | 9 | ✏️ à corriger (4/9) · ✅ OK (5/9) |
| ③ Les 3 ratios | 3 | ✏️ à corriger (2/3) · ❌ supprimé (1/3) |
| ④ En-tête / pied du compte de résultat | 2 | ✏️ à corriger (1/2) · ❌ supprimé (1/2) |
| ⑤ Colonnes du tableau | 5 | ✅ OK (3/5) · ✏️ à corriger (2/5) |
| ⑥ Lignes du tableau | 18 | ✅ OK (6) · ✏️ à corriger (11) · ❌ supprimée (1) · ➕ 2 lignes ajoutées |
| ⑦ Drills (post-clic) | 6 | ✏️ à corriger (3) · ❌ supprimés (3) |
| ⑧ Bloc « Argent à récupérer » | 5 | ❌ bloc supprimé (5/5) |
| ⑨ Exports & déclaratif | 2 | ✏️ à corriger (1) · ✅ constat périmé (1) |

**Bilan : 5 blocs supprimés, 2 lignes ajoutées, 3 moteurs sur 4 éliminés.**

---

## 8. Structure finale de l'onglet Finances

```
┌ BARRE DE PÉRIMÈTRE ────────────────────────────────────────────────┐
│  Périmètre : [ Tout ▾ ]→[ bailleur ▾ ]→[ immeuble ▾ ]              │  P-1, P-2, P-5
│    + paniers « Sans bailleur » / « Sans immeuble » (à rattacher)    │
│  Exercice : [ 2026 ▾ ]   ·   « tout ce qui est saisi au 13/09 »     │  F-1, F-1 v2
│  Clé de répartition des frais bailleur : potentiel locatif mensuel  │  P-4
└────────────────────────────────────────────────────────────────────┘

┌ HÉRO ──────────────────────────────────────────────────────────────┐
│  Cash-flow réel · exercice 2026            + 8 831 €                │  H-4
│  ▲ +12,4 % vs 2025 (même période)                                   │  H-5
│  Loyers encaissés (HC) → + Recettes diverses → − Charges (prêt      │
│  entier) → = Cash-flow net → ± Charges récupérables → = Cash-flow réel │
└────────────────────────────────────────────────────────────────────┘

┌ 2 RATIOS ──────────────────────────────────────────────────────────┐
│  Recouvrement 98,5 %  (encaissé ÷ dû CC, barème historisé)          │  R-2
│  Occupation   75 %    + 5 200 € de manque à gagner (théorique)      │  R-4, K-2
└────────────────────────────────────────────────────────────────────┘

┌ COMPTE DE RÉSULTAT (tableau) ──────────────────────────────────────┐
│  Poste + Année figés · mois défilants (récent → ancien) ·           │  T-1..T-5
│  N-1 même période + Var. + % loyers                                 │
│  → structure détaillée : § 4ter                                     │
└────────────────────────────────────────────────────────────────────┘

┌ DÉCLARATIF (optionnel) ────────────────────────────────────────────┐
│  🧾 Prévisualiser la 2044 — année civile pleine                     │  Z-1..Z-3
└────────────────────────────────────────────────────────────────────┘
```

**Sources, une fois pour toutes :** le **dû** vient du barème historisé (`duMois`), le **payé** vient de
l'import bancaire. Tout le reste en découle. Un seul moteur : le moteur mensuel.

---

## 9. Ce qui DISPARAÎT de la page

| Élément | Décision |
|---|---|
| Bloc « Argent à récupérer » (4 widgets + total) | K-1 — redondant avec le tableau, additionnait 4 natures |
| Jauge « Poids des charges » | R-5 — fausse sans les intérêts saisis |
| Ligne « Base imposable foncier [2044] » | L-8 — le P&L n'est pas la 2044 |
| Chip « Enrichissement » | H-4 v2 — théorique, et exige les intérêts |
| Bandeau « N catégories non reliées » | M-1 — l'état qu'il signalait devient impossible |
| Note de bas de carte du tableau | E-1 — si ça a besoin d'une note, on corrige le libellé |
| Drill « ⇄ Comparer 2 mois » | D-4 — la comparaison est native dans le tableau |
| Drill « Voir par logement » | D-5 — la maille s'arrête à l'immeuble |
| Bouton « 🧮 Renseigner les intérêts » | D-6 — plus rien ici n'en a besoin |
| Bleu vif de la ligne 2044 | C-1 — 3ᵉ usage du bleu sans sens propre |
| Définition legacy du cash-flow réel | L-7 — code mort qui pourrait revenir |

**Code qui devient sans emploi :** `_computeFinancesSummary`, `_finChargeBuckets`, `_finIrlSousIndexation`,
`attenduHCTheo`, `computeRegul` **côté widget** (la page Régularisation garde le sien), `_finB4On()` (déjà
documenté mort). `_computeBilanAnnuel` reste pour l'occupation/vacance mais **passe sous le socle** et
reçoit enfin le `mapping` (M-2).

---

## 10. Hors V1 — noté, pas fait

- Mode « **12 derniers mois glissants** » (quasi gratuit une fois le résolveur de fenêtre unique en place).
- **Tiers payeur au bail** (montant CAF mensuel déclaré → pré-ventilation automatique du virement groupé).
- **Régularisation de charges détaillée** (décision antérieure : le solde signé suffit).
- **Déclaratif multi-statuts** : 2072 (SCI à l'IR), liasse (SCI à l'IS). La structure doit l'anticiper (Z-3).
- **Manque à gagner de la vacance côté Biens**, à côté du lot vacant, là où on agit pour relouer.

---

## 11. Ordre de chantier suggéré

1. **Socle** — résolveur de périmètre unique (P-1/P-3) + fenêtres nommées (F-1 v2) + invariant historique
   testé (I-1). Rien d'autre ne peut être juste avant ça.
2. **Suppressions** (§ 9) — c'est là que tombent 3 des 4 moteurs. À faire tôt : la suite est plus simple.
3. **Tableau** — lignes ajoutées/scindées/renommées (L-2, L-5, L-6), total vérifiable (L-4).
4. **Ratios** sur le socle (R-2, R-4, K-2).
5. **Couleurs + popups** (C-1, C-2) — dont la lettre de relance depuis un retard.
6. **Catégories** (M-1) : rattachement obligatoire + migration one-shot bloquante.
7. **Répartition immeuble** (P-4) avec ses invariants de somme.
8. **Propagation** (R-3) : Accueil et fiches lisent le socle, ne recalculent plus.

**Gate de sortie** : audit par `superpowers:code-reviewer`, tests d'invariants (Σ immeubles = bailleur mois
par mois · Σ lignes = total charges · annuel = Σ mois · IRL d'août ne modifie aucun mois antérieur),
smoke sur les 3 formats.

---

## 12. Complément 14/08 — le paiement des charges APRÈS régularisation (validé)

**Le circuit** (mécanique existante, confirmée dans le code) :
1. La régul produit une **créance signée** (écran Régularisation — détail hors V1, le solde suffit).
2. Le règlement du solde par le locataire ne doit **JAMAIS être classé « Loyers encaissés »** : la cascade
   le confronterait au dû du barème, n'y trouverait rien à couvrir → **fausse avance qui roule** de mois
   en mois (mécanisme Yardin, mais infondé).
3. **Bonne catégorie : « Charges récupérables (eau, énergie…) », en crédit.** Le moteur mensuel calcule ce
   poste **en net** (`db − cr`, finances-monthly.js:117) : l'encaissement nette « Avancé pour les
   locataires » → le « Solde de trésorerie des charges » remonte vers zéro → compté dans le **cash-flow
   réel**, neutre pour le **cash-flow net** (transit) et pour la 2044 (la part jamais récupérée remonte
   seule en ligne 225 via la catégorie automatique).
4. **Trop-perçu remboursé au locataire** : symétrique — débit sur la même catégorie.
5. **Loyer + solde payés en un seul virement** : rôle du **✂️ découpage** (2 parts : 211 + récupérable).

**Correctifs V1 validés (deux textes, zéro moteur) :**
- **T1** · le `descHors` de « Divers (non déductible) » cite « régularisation de solde locataire »
  (index.html:4100) → oriente vers une catégorie qui rend le paiement **invisible** du P&L. À réécrire :
  pointer vers « Charges récupérables (eau, énergie…) ».
- **T2** · le **popup d'avance** gagne une ligne : « si ce montant est un solde de charges
  (régularisation), reclasse-le en Charges récupérables ».

**Évolution notée, pas V1** : l'import propose la catégorie récupérable quand un crédit d'un locataire ne
colle à aucun dû ET qu'une régularisation signée du même montant existe pour ce lot.
