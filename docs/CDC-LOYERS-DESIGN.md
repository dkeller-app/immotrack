# CDC — Onglet Loyers : design validé

**Session design du 18–19 août 2026.** Toutes les décisions ci-dessous ont été prises par Didier,
une par une, sur maquettes peuplées au volume réel (37 lots, 4 bailleurs, 6 immeubles, vacants,
lot sans immeuble, lot sans bailleur, noms longs). Hauteurs mesurées dans le navigateur, jamais annoncées.

**Statut : figé.** Ce document remplace les décisions correspondantes de `docs/CDC-QUITTANCES-IRL.md`
(les écarts sont signalés). Aucune ligne de l'app n'a été touchée pendant la session.

**Maquettes de référence** (gitignorées, autonomes, double-clic) :
`ecran-loyers.html` · `quittance-directions.html` · `etat-quittances.html` · `redater-irl.html` ·
`frise-irl.html` · `decisions.html` (les 21 décisions) · `index.html` (galerie).
Sources dans `_src/`, réassemblage : `node _src/build.cjs`.

---

## 0. Le principe directeur

> « On ne retrouve pas une quittance. On permet à l'utilisateur d'éditer, comme pour l'EDL.
> On ne fait pas de liste infinie. Quand on a édité une quittance, l'app retient (pour le KPI de suivi)
> mais on ne garde pas le document en visuel. Si l'utilisateur veut une quittance passée, il la réédite. »

> « L'app doit prévenir mais pas bloquer tout le temps l'utilisateur. On garde des garde-fous partout,
> mais pas bloquants. »

Ces deux phrases commandent tout le reste. Elles abrogent la décision D6 du CDC-QUITTANCES-IRL
(« quittance seulement si le mois est soldé »).

---

## 1. Les 21 décisions

### Structure de l'écran

**V1 — L'écran Loyers est un tableau de bord (composition M5).**
Trois tuiles en toutes lettres, en haut : **Impayés** (montant en euros + nombre de lots) ·
**À remettre** (nombre de quittances) · **À préparer** (nombre de révisions IRL). **Une seule liste
à la fois** est affichée dessous ; la tuile cliquée l'affiche ; **les impayés sont affichés par défaut**.
Motif : « on mélange des quittances (document obligatoire) avec des loyers non payés — 2 niveaux de
priorités ». Mesuré **736 px** sur le mois chargé (l'écran livré v15.537 : 3 691 px, soit 4,1 écrans).
*Remplace la variante A validée le 18/08 puis invalidée le 19/08.*
Cinq autres compositions ont été construites et écartées (M1 par priorité, M2 par métier, M3 l'urgent
d'abord, M4 deux colonnes, M6 tuiles + listes) ; elles restent sur `ecran-loyers.html` pour mémoire.

**V2 — Le groupement bailleur > immeuble est une colonne, pas des lignes.**
Zéro ligne d'en-tête consommée (l'écran livré en dépense 45 pour 32 lignes de données, parce que
`_lyBloc` appelle `_lyGrouper` dans chaque bloc). À 390 px la colonne redevient une ligne fusionnée
« bailleur · immeuble ».

**V15 — Densité « Confort » et lignes allégées.**
Lignes de 40 px, écarts élargis. Une ligne **ne répète pas** ce que dit l'en-tête de son bloc
(« juillet 2026 », pas « juillet 2026 soldé, non quittancé ») ; le détail du calcul IRL (indices,
date de bail) vit dans la fenêtre de validation, pas dans la liste.

**V3 / V4 — La frise IRL est un ruban de 12 tuiles, placé sous les révisions, toujours affiché.**
Un chiffre par mois, clic = la liste des lots concernés. Elle n'est ni repliée ni optionnelle.

### Le geste « faire une quittance »

**V6 — Direction « Le document ».**
L'éditeur **ouvre la quittance elle-même**, plein écran, déjà remplie depuis le barème du mois —
transposition littérale du geste EDL (`openNewEDL` ouvre l'objet, `_edlPrefill` le remplit).
Le rail de gauche ne porte que le choix du **mois**. **Rééditer = revenir sur un mois passé**, même geste.
Deux autres directions ont été construites et écartées (« dans la ligne », « la tournée ») ;
de la tournée on garde l'enchaînement « Éditer → lot suivant » quand on entre par la porte globale
et que plusieurs lots attendent.

**V10 — Une seule porte.** La quittance libre est un **mode à l'intérieur** de l'éditeur, jamais un
second bouton dans l'écran (règle « une porte, le choix dedans », héritée du fil rouge création de bien).

**V12 — La quittance libre peut partir d'un logement existant**, champs modifiables ensuite.

**V11 — La quittance libre : l'app retient la saisie**, étiquetée « saisie libre », rejouable et
rééditable (calque EDL : la saisie est l'état, le document se regénère). Elle est **exclue de tous
les calculs** : ni suivi des loyers, ni 2044 — elle ne prouve aucun encaissement.

### Avertir, ne pas bloquer

**V7 — Quittance sur un mois non soldé : ouverte.**
Bandeau d'avertissement nommant les mois et le reste dû, reçu partiel proposé en un clic,
**et une confirmation explicite à cocher** (« je sais que ce document vaut reçu »).
*Écart assumé avec le CDC-QUITTANCES-IRL D6, qui est abrogé.*
Fondement du garde-fou : l'article 21 de la loi du 6 juillet 1989 fait de la quittance un reçu ;
remise à un locataire qui n'a pas payé, elle vaut preuve de paiement contre le bailleur.

**V8 — Le critère est PAYÉ, pas ÉCHU.**
Un mois futur couvert par une avance se quittance normalement, avec sa vraie date de paiement.
**Aucun avertissement ni étiquette « mois non échu »** : la période du document et la date d'édition
le disent déjà. Un mois futur non couvert retombe simplement dans le garde-fou V7.

**V9 — Étiquette « sans paiement constaté ».**
Une quittance émise sans paiement rattaché porte cette étiquette **dans l'app uniquement**
(fiche du lot, panneau du mois, rail de l'éditeur). Au survol : **qui a confirmé et quand**
(utile pour le partage SCI). **Le document remis au locataire ne change pas** — une mention de ce
genre en ferait un document bâtard, ni quittance ni reçu.

**V20 — Les blocages qui viennent de la loi deviennent des avertissements.**
Gel DPE F/G (loi Climat & Résilience, art. 23) et cycle éteint (art. 17-1) **gardent leur bouton**
(« Réviser quand même », « Appliquer quand même »). La fenêtre cite la règle, dit ce que ça engage,
et demande une confirmation à cocher :
- **DPE F/G** : la révision n'est pas opposable au locataire, qui peut refuser de payer et réclamer
  le remboursement du trop-versé ;
- **Cycle éteint** : les mois passés ne sont plus réclamables ; appliquée aujourd'hui, l'augmentation
  vaut pour l'avenir et reste contestable.

**V21 — Le blocage « DPE absent » est levé.**
On révise, avec l'avertissement que l'app ne peut pas vérifier si le gel F/G s'applique — et le rappel
qu'un **garage, une cave ou un parking n'a pas de DPE par nature** : le gel ne les vise pas.
**Exception assumée, sans bouton** : « bail de moins d'un an » et « indice non publié ».
Ce ne sont pas des verrous — la date n'est pas arrivée, ou l'INSEE n'a rien publié : il n'y a rien
à débloquer. L'écran le dit explicitement.

### L'état, pas l'archive

**V13 — L'état « quittancé » vit à deux endroits, et nulle part ailleurs.**
1. **Écran Loyers** : la pastille « Quittances éditées ce mois · n » de la bande Suivi ouvre
   l'état du **mois courant** (qui, quand, ↺ Rééditer).
2. **Fiche du bien** : une ligne de **12 cases par année** (✓ quittancé + date / à quittancer /
   reste dû / à venir) — le calque de l'écran EDL du logement. Clic sur une case = l'éditeur s'ouvre
   sur ce mois.

Contrainte dure : **compact et très compréhensible**, et **aucune des deux surfaces ne grossit avec
l'historique**.

**V5 — Une date de paiement ne s'affiche que si elle correspond réellement à ce qui est quittancé ou
constaté — sinon rien.** Étendu à **tous les cas** (voir §4).

### Modifier la timeline du bail

**V16 — Un seul geste : ✏️ Modifier, par ligne.**
Chaque ligne modifiable de la timeline porte son ✏️. Le panneau liste les éléments **de cette ligne**
(date d'effet, loyer HC, charges — ou début/fin/montants pour une période), chacun marqué
**inchangé / modifié**. L'app déduit l'effet :
- **date seule** → la frontière entre deux périodes se déplace, montants intacts ;
- **montant seul** → le loyer change sur la même fenêtre de dates ;
- **les deux** → une seule écriture.

Le bas de la fenêtre n'affiche **que les conséquences de ce qui a été touché**.
Le bouton **« ＋ Ajouter une période »** reste, en haut de la timeline, pour ce qui n'existe pas
encore comme ligne. Couple habituel : **＋ ajoute, ✏️ modifie.**
*Remplace la proposition initiale de deux gestes séparés (« Re-dater » à côté de « Corriger une période »).*

**V17 — Modifier une ligne qui rend un document faux REFAIT ce document.**
Ce n'est pas un simple avertissement. Avant d'enregistrer, le panneau affiche un bloc
**« Ce qui sera refait — n documents »** (quittances des mois touchés, lettre de révision), et le bouton
principal devient **« Enregistrer et refaire les n documents »** (secondaire : « Enregistrer sans refaire »).
Pour un document déjà remis : « c'est la nouvelle qui fait foi — pense à la lui renvoyer ».
**Aucun verrou**, y compris sur un mois déjà quittancé.
*Motif : « on refait la quittance ! si on a modifié c'est qu'on a vu une erreur non ? »
Précédent existant dans l'app : `index.html:37786` avertit déjà (confirm) au lieu de bloquer.*

**V18 — La lettre de révision déjà générée suit la même règle** : refaite, nommée dans le même bloc ;
l'ancienne version reste dans l'historique, marquée « remplacée ».

**V19 — Une date d'effet hors du 1er du mois est ramenée au 1er**, avec un message qui dit ce que
l'app a fait de la saisie. Jamais un refus, jamais un mois coupé en deux : tout le calcul du dû
repose sur des périodes qui commencent le 1er.

### Vocabulaire

**V14 — Trois règles de langue, non négociables.**
- « **Impayés** » remplace « Pas à jour » (« ça ne veut rien dire, il faut un terme punch »).
- « **IRL non appliquées** » remplace « Perdues ». Ne pas appliquer une révision **peut être un choix**,
  et la révision revient à chaque anniversaire du bail sur les indices du moment ; seul le cycle passé
  s'éteint. Libellé de ligne : « Cycle du JJ/MM/AAAA non appliqué, éteint le JJ/MM/AAAA ».
- **Jamais une icône + un chiffre sans mot.** Les compteurs muets de la ligne de titre sont supprimés
  (« c'est non explicite pour un utilisateur ») ; l'information chiffrée vit dans les en-têtes de blocs
  et les tuiles, toujours avec son libellé.

---

## 2. Ce qui disparaît

- Le panneau « **Quittances toutes années** », la galerie de documents, les filtres par année,
  la recherche dans les quittances, l'export « tout ».
- La notion de **version** d'une quittance (« v2 », « rééditée le… ») : rien n'est stocké, donc rien
  n'est versionné. Plus de question « écraser ou garder ».
- Le **verrou** « quittance seulement si le mois est soldé » (CDC D6).
- Le **verrou** « révision impossible sans DPE ».
- Les blocages durs sur gel DPE F/G et cycle éteint (remplacés par des avertissements).
- L'étiquette « mois non échu ».
- Les compteurs icône+chiffre sans libellé.
- Le geste « Re-dater » séparé (fondu dans ✏️ Modifier).

---

## 3. Invariants

1. **I-ÉTAT** — Ce qui est mémorisé pour une quittance est un **état** `(lot, mois, date d'édition,
   étiquettes)`, jamais un fichier. Un mois = un état ; aucun doublon possible
   (`_creerQuittance` le garantit déjà).
2. **I5 (existant, confirmé)** — Le document est **toujours regénéré depuis le barème du mois**
   (`_duMoisLot`), jamais depuis le loyer courant. Une quittance de juin 2026 rééditée en 2027 porte
   le loyer de juin 2026.
3. **I7 (existant, confirmé)** — Un appel = **un mois = un document**. Jamais de document « mai à juillet ».
4. **I-DATE (V5)** — Aucune date de paiement affichée qui ne corresponde pas réellement au mois
   quittancé ou constaté. En l'absence de rattachement : **rien**.
5. **I-1ER** — Une période de barème commence le **1er du mois**. Aucune saisie ne peut créer un mois
   à cheval sur deux tarifs.
6. **I-LIBRE** — Une saisie libre n'alimente **aucun calcul** : ni suivi des loyers, ni 2044.
7. **I-REFAIT** — Toute modification qui rend un document faux **propose de le refaire**, et le nomme
   avant d'enregistrer.
8. **I-MOT** — Aucune information chiffrée sans libellé en toutes lettres.

---

## 4. Le correctif « date de paiement » — inventaire audité

Règle V5 appliquée à **toutes** les surfaces. Audit fait dans le code le 19/08.

| # | Surface | Où | Origine de la date | Verdict | Correctif |
|---|---|---|---|---|---|
| 1 | **Quittance** (aperçu, impression, PDF partagé, PDF archivé Drive, PJ email) | `index.html:27853→27985` | dernier encaissement du **lot** ≤ date d'émission ; replis : champ legacy, puis **date d'émission** | **FAUX** | date du paiement imputé à **ce** mois, sinon **rien** |
| 2 | **Reçu de paiement partiel** | `index.html:27956` + `28662` | idem, borné à **aujourd'hui** — émis sur un mois en retard, donc faux presque toujours | **FAUX** | date(s) des versements imputés à ce mois, sinon rien |
| 3 | **Fiche 360 · Compta** — badge « ✓ payé / ⏳ non confirmé » | `index.html:37433` | `q.datePaiement`, champ legacy **plus jamais écrit** | **FAUX** (verdict inversé) | supprimer le badge — l'état du mois existe déjà via `duMois()` |
| 4 | **Dashboard solo** — « ✓ Payé JJ/MM » | `index.html:10510` | mouvement réel rattaché au **mois calendaire de sa date** (7e moteur résiduel) | **FAUX** | brancher sur la source unique d'imputation |
| 5 | **Fiche 360 · Documents** | `index.html:39222` | date d'émission **sans étiquette** | ambigu | préfixer « éditée le » (`_lyQuittancesDuMois` le fait déjà bien) |
| 6 | **Email « reçu de DG »** — « versé le » | `email-compose.js:448` | saisie, **pré-remplie à aujourd'hui** | risque | défaut = date du mouvement DG s'il existe, sinon vide |
| 7 | **Restitution du DG** | `index.html:48727` | `td()` par défaut, jamais confronté au virement réel | risque | proposer la date du mouvement, pas « aujourd'hui » |
| 8 | **Attestation de logement libéré** — « en date du » | `email-compose.js:756` | `promptVal(…, td())` | risque | défaut = date de sortie de l'EDL, sinon vide |

**Vérifiés propres, à ne pas toucher** : courrier de relance / mise en demeure, lettre IRL, décompte de
régularisation, template email `quittance` (sans date), écran Loyers, suivi mois par mois + drill,
timeline onglet Bail, liste compta des mouvements, import bancaire (aucune date dérivée, traçabilité
relevé complète).

> **Contrainte technique connue.** La cascade d'imputation **détruit les dates** :
> `recuParYm[ym] += m.cr` (`index.html:12554`) agrège des montants seuls, et `_loyerArrearsPass`
> ne manipule aucune date. Aucune structure ne sait aujourd'hui dire « le mois M a été soldé par le
> mouvement du JJ/MM ». **Deux issues** : faire remonter les mouvements imputés à travers la cascade
> (permet « reçu le JJ/MM », et « soldé par N versements, le dernier le JJ/MM »), ou ne jamais afficher
> de date — ce que fait déjà le repli PDF texte (`email-pdf-attachment.js:335`).
> **Le lot 0 du chantier doit trancher ce point en premier : tout le reste en dépend.**

---

## 5. Ordre de chantier

Chaque lot est livrable et testable seul. L'ordre suit les dépendances.

**Lot 0 — Le socle des dates (prérequis).**
Faire remonter les dates des mouvements imputés à travers `_loyerArrearsPass` / `etatMoisLot`,
ou acter l'absence de date. Sans ce lot, les lots 3 et 4 ne peuvent pas être justes.

**Lot 1 — Vocabulaire et lisibilité (sans risque, gain immédiat).**
Renommages V14 (« Impayés », « IRL non appliquées », libellés de motifs), suppression des compteurs
muets, textes des familles. Aucune logique touchée.

**Lot 2 — L'écran Loyers M5.**
Tuiles, une liste à la fois, groupement en colonne, densité Confort, lignes allégées, ruban toujours
affiché, bande Suivi + panneaux. Gate : 3 formats × 2 thèmes, hauteur mesurée, 0 débordement à 390 px.

**Lot 3 — Le correctif des dates de paiement.**
Les 8 surfaces du §4, dans l'ordre du tableau. Tests unitaires sur les cas : rattrapage de 5 mois,
avance, paiement partiel, aucun paiement.

**Lot 4 — L'éditeur de quittance.**
Direction « Le document » : ouverture pré-remplie, rail des mois, réédition, mode saisie libre,
garde-fou V7 (bandeau + confirmation), étiquette V9, enchaînement « lot suivant ».

**Lot 5 — L'état, pas l'archive.**
Retrait du panneau toutes-années, pastille du mois, état 12 mois dans la fiche du bien.
Migration : les entrées `DB.quittances` existantes deviennent des états (rien à jeter, le schéma
convient déjà).

**Lot 6 — La timeline : ✏️ Modifier.**
Geste unifié, déduction de l'effet, bloc « Ce qui sera refait », regénération des documents impactés.

**Lot 7 — Les garde-fous non bloquants.**
Boutons « Réviser quand même » sur gel DPE F/G, DPE absent, cycle éteint + fenêtres d'avertissement.
Vérifier qu'aucun bouton n'apparaît sur « bail < 1 an » et « indice non publié ».

---

## 6. Points laissés ouverts

- **Traçabilité du geste forcé** : V9 prévoit « qui a confirmé et quand » au survol. Le champ n'existe
  pas encore en base ; à créer au lot 4, avec le partage SCI en tête.
- **Renvoi automatique d'un document refait** (V17) : l'app ne sait pas si le locataire a reçu
  l'ancien. Elle le dit et s'arrête là ; un envoi automatique n'a pas été demandé.

---

*Écrit le 19/08/2026 à l'issue de la session design. Les 21 décisions sont consultables une par une
dans `decisions.html`, avec pour chacune le contexte et l'option retenue.*
