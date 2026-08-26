# CDC — EDL TÉLÉPHONE (le parcours) — VALIDÉ avec Didier le 26/08/2026

> Session dédiée « audit EDL + CDC ». Déclencheur : le mécontentement de Didier sur la prod **v15.545**
> (« EDL sur téléphone ça ne va pas… c'est pire qu'avant »). Objectif : repartir du problème, auditer
> honnêtement l'existant (lots 5→8 compris), puis figer le cap avec Didier — **une décision à la fois,
> chaque écran validé sur maquette**.
>
> **Aucun code n'a été modifié dans cette session.** Les maquettes autonomes qui font foi sont dans
> `mockups/EDL-TELEPHONE/` (gitignoré) :
> - `parcours.html` — le parcours complet entrée + sortie (bascule en haut), volume réel 109 éléments ;
> - `ecran-05-piece.html` — l'écran d'une pièce (entrée + sortie 2 bandes), Cuisine 25 éléments ;
> - `ecran-06b-apercu.html` — la relecture avant signature (entrée/sortie, pop-up de signature) ;
> - `ecran-03-cles.html`, `ecran-04-daaf.html`, `ecran-06-fin.html` — écrans dédiés ;
> - `audit-visuel.html` — le diagnostic à l'échelle ; `decisions.html` — la trame des décisions.
>
> Mesures faites dans un vrai navigateur (Chrome, **375 px**, EDL neuf du modèle 109, modes entrée ET sortie).

---

# PARTIE 1 — L'AUDIT

## 1.1 Le pourquoi de l'EDL (le socle)

L'EDL constate l'état d'un logement à l'entrée et à la sortie d'un locataire, sur un **document signé à
valeur probante** en cas de litige (art. 3-2 et 22, loi 89-462 ; décret 2016-382). Il se remplit **sur le
terrain, debout, une main, sur un téléphone, souvent sans réseau**.

**Ce qu'il doit permettre**, dans l'ordre des gestes réels : parcourir les pièces → pour chaque élément
poser un état, écrire une observation (geste **courant**, pas exceptionnel), prendre des photos → relever
compteurs / clés / détecteur → à la sortie, **comparer entrée vs sortie** élément par élément → relire →
signer.

**Ce qu'il ne doit PAS faire** (invariants, cf. §2.10) : aucun montant, aucune mention de restitution /
délai / retenue du dépôt ; ne jamais rendre l'entrée signée modifiable ou supprimable ; ne pas réinventer
le modèle (109 éléments acquis).

## 1.2 Les hauteurs mesurées (375 px, EDL neuf 109 éléments)

| Écran mesuré | Hauteur | Écrans (÷ 812) |
|---|---:|---:|
| **Avant parcours** (toutes pièces, entrée) | **38 128 px** | ~47 |
| **Prod v15.545** — parcours actif, pièce « Entrée » visible (entrée) | **10 883 px** | ~13 |
| **Prod v15.545** — parcours actif, mode SORTIE | **13 911 px** | ~17 |

Décomposition de la prod (10 883 px), mesurée bloc par bloc :

| Bloc | Hauteur | Toujours à l'écran ? |
|---|---:|---|
| §1 Infos (type/dates/logement/bailleur/locataire) | 1 094 px | oui |
| Mobilier (replié) + Détecteur (DAAF) | 580 px | oui |
| Compteurs + chauffage + thermique + réseaux | 2 336 px | oui |
| Clés | 1 357 px | oui |
| Barre « Pièces : » | 185 px | oui |
| Observations générales | 136 px | oui |
| Photos & Signatures | 1 196 px | oui |
| **Sous-total ADMIN toujours visible** | **6 884 px** | **oui (~8,5 écrans)** |
| Légende des états | 424 px | oui |
| 1 seule pièce (Entrée, la plus petite) | 3 384 px | via parcours |

Pièces individuelles (entrée) : Entrée 3 384 · Séjour 3 659 · **Cuisine 6 956** · WC 4 208 · SdB 5 582 ·
Chambre 3 934 · Extérieurs 2 835.

## 1.3 Le diagnostic central (chiffré)

> **Le parcours « une pièce à l'écran » n'a paginé que les pièces (§4). Il n'a jamais été un parcours de
> l'EDL.** Les 8 sections administratives — **6 884 px, soit 63 % de la hauteur du téléphone** — restent
> dépliées et empilées en permanence, au-dessus et en dessous de la pièce visible.

La cible du CDC-EDL §0.2 (**3 182 px, « une seule chose à l'écran »**) supposait « les 7 sections
administratives repliées à une ligne chacune » — **repli jamais implémenté**. D'où 6 884 (admin) + 424
(légende) + 3 384 (plus petite pièce) = **10 883 px** au lieu de 3 182.

**Pourquoi ça donne « on ne comprend rien » :** à l'ouverture on tombe sur ~5 500 px de formulaires admin
avant d'atteindre la 1ʳᵉ pièce, alors que le rail en bas affiche déjà « Entrée · 1/8 ». Le rail promet une
pièce que l'écran ne montre pas encore. **Le rail ne gouverne que les pièces ; les 6 884 px d'admin n'y ont
aucune entrée.**

## 1.4 Inventaire des lots 5→8 — amélioration ou régression

| Lot | Ce que ça fait | Verdict à l'usage réel |
|---|---|---|
| 5 · une-pièce-à-la-fois | masque les autres pièces | **Demi-gain** : −27 000 px sur les pièces, mais 6 884 px d'admin restent → ~13 écrans. Promesse « une chose à l'écran » **non tenue**. |
| 5 · rail du pouce | sticky bas, feuille des pièces, saut direct | **Bon en soi**, mais ne navigue que les pièces → déconnecté de l'écran d'ouverture. **Le périmètre est le défaut.** |
| 6 · visionneuse photo | grande image `contain`, portrait/paysage | **Bon, à garder** (répond au retour du 25/08 : photos verticales coupées). |
| 7 · verdict déduit | `verdictDe(entrée,sortie)`, jamais saisi/stocké, module testé | **Bon, à garder.** |
| 7 · sortie 2 colonnes | entrée grise verrouillée \| sortie éditable | Fonctionne, mais **1 ligne = 405 px**, total sortie 13 911 px. À revoir (cf §2.6). |
| 8 · signatures | — | **Hors périmètre** de cette session. |
| Modèle 127→109 | 7 pièces, 109 él. | **Bon, à garder** (12·13·25·15·20·14·10 = 109, vérifié). |
| Verrou entrée signée | gardes niveau fonction + retrait DOM | **Bon, à garder** (ne repose pas sur le CSS seul). |

## 1.5 Les 3 défauts pointés par Didier — causes ancrées

**① Zoom à la saisie (iOS).** Mesuré : **218 champs sur 283 sont < 16 px**. Les deux qu'on touche à chaque
élément : input « Élément » = **15 px** (`css/main.css:3154`), textarea Observation = **14 px**
(`css/main.css:3182`) ; en sortie, obs de sortie = **14 px** (`css/main.css:3301`). Le garde « ≥ 16 px »
(`css/main.css:3497-3500`) **existe mais est battu par spécificité** (les règles de carte sont plus
spécifiques ET `!important`). iOS zoome sous 16 px → zoom confirmé en entrée ET en sortie.

**② « Toute une partie toujours présente ».** Le CSS ne masque que `.edl-piece-block`
(`css/main.css:3488`) ; les 8 sections admin (6 884 px) sont hors parcours (cf §1.3).

**③ « Menus non ok / on ne comprend rien ».** Le rail (`index.html:4096`) et `_edlSyncParcours`
(`index.html:32430`) ne connaissent que les pièces ; l'admin, 63 % de la hauteur, n'a aucune représentation
dans le rail.

## 1.6 Ce qui est objectivement bon (à conserver)

Visionneuse `contain` · verdict déduit + module `js/core/edl-parcours.js` (pur, testé) · verrou de
l'entrée signée (niveau fonction) · modèle 109 · **pas de défilement horizontal** (mesuré 375 = 375) ·
**un seul conteneur de défilement** (pas d'imbrication parasite en statique) · le rail comme *widget*
(le concept est bon — son périmètre était faux).

**Conclusion de l'audit :** ce n'est pas « pire partout ». Sur les pièces le parcours a réellement gagné
27 000 px. Mais il s'est arrêté à mi-chemin : il n'a jamais avalé l'admin. **On ne revient pas en arrière —
on finit le parcours.**

---

# PARTIE 2 — LE CAHIER DES CHARGES (décisions validées écran par écran)

## 2.1 Structure retenue

**Le parcours téléphone devient un vrai parcours de l'EDL : une seule étape à l'écran, l'admin devient des
étapes au même titre que les pièces, le rail gouverne TOUT l'EDL.** Fini le mur de 6 884 px d'admin
permanent. *(Validé sur `parcours.html`.)*

## 2.2 Les étapes et leur ordre

**12 étapes** (+1 relecture, cf §2.7), dans cet ordre validé :

1. **Infos du logement** — champs existants de l'en-tête, isolés (validé) ;
2. **Compteurs & équipements** — compteurs + chauffage/ECS + chaudière/ballon + réseaux, **regroupés en une
   seule étape** (relevés d'un même geste sur le terrain) — validé ;
3. **Clés remises** — nombre par type + ajout libre — validé ;
4. **Détecteur de fumée (DAAF)** — 3 réponses + emplacement + photo ; **seul endroit du DAAF** (retiré du
   modèle des pièces, §A.5) — validé ;
5. à 11. **Les 7 pièces** — une pièce par étape (validé, cf §2.6) ;
12. **Observations générales + Signatures** (validé, cf §2.8).

**Étape « Mobilier » conditionnelle** : n'apparaît que si le logement est meublé (`edl-mob-enabled`
coché) — pas d'étape vide pour un logement nu.

## 2.3 Écran par écran — ce qui change / reste / revient

- **Infos** *(écran 1)* — **reste** : champs existants, isolés en étape 1. Aucun ajout, aucun retrait.
- **Compteurs & équipements** *(écran 2)* — **reste** le contenu, **change** l'emballage : une étape unique ;
  en sortie, chaque relevé en **relevé d'entrée figé \| relevé de sortie**. *(`ecran-03-cles.html` illustre le
  motif entrée/sortie ; validé.)*
- **Clés** *(écran 3, `ecran-03-cles.html`)* — **reste** ; en sortie : **remis (entrée) figé \| rendu
  (sortie)** + **alerte si le compte n'y est pas** (ex : 1 badge non rendu). Validé.
- **Détecteur de fumée** *(écran 4, `ecran-04-daaf.html`)* — **reste** ; en sortie : rappel de l'état
  d'entrée + nouveau constat. Validé.
- **Pièce** *(écran 5, `ecran-05-piece.html`)* — cf §2.6. Validé.
- **Relecture avant signature** *(écran 5b, `ecran-06b-apercu.html`)* — **NOUVEAU**, cf §2.7. Validé.
- **Observations + Signatures** *(écran 6, `ecran-06-fin.html`)* — cf §2.8. Validé.
- **PC / tablette large** — **rien ne change** (cf §2.9). Aucune régression PC.

## 2.4 La saisie sans zoom — ≥ 16 px à la source

**Règle (invariant testable) : aucun champ EDL saisissable ne fait moins de 16 px sur mobile.** Corriger
**à la source**, pas par un `!important` de rattrapage. Champs et ancres à corriger :

| Champ | Ancre | Aujourd'hui | Cible |
|---|---|---:|---:|
| Input « nom d'élément » (carte pièce) | `css/main.css:3154` | 15 px | **16 px** |
| Textarea observation (entrée) | `css/main.css:3182` | 14 px | **16 px** |
| Textarea observation de sortie | `css/main.css:3301` | 14 px | **16 px** |
| Obs entrée (mode sortie, si éditable) | `css/main.css:3273` | 14 px | **16 px / lecture seule** |
| Styles inline de `_edlElemRow` | `index.html:32553` (inp 12px), `:32554` (ta 11px) | 12 / 11 px | **16 px** |

Le garde `#ov-edl input/textarea/select/.inp {font-size:16px}` (`css/main.css:3497-3500`) devient
**redondant** une fois les règles ci-dessus corrigées : garder **une seule** source explicite, retirer le
doublon qui perdait la bataille de spécificité.

## 2.5 Repérage et navigation

- **Le rail `[←] ⤒ [→]` gouverne les 12 (+1) étapes** — plus seulement les pièces. Il affiche « Étape 2/12 ·
  Compteurs », recule/avance au pouce. *(Validé sur `parcours.html`.)*
- **Le ⤒ ouvre la feuille de TOUTES les étapes** (admin + pièces, chacune avec son avancement / ses écarts),
  pour sauter directement.
- **Zéro défilement horizontal** (mesuré 375 = 375) ; **aucun 2ᵉ conteneur de défilement imbriqué non
  borné** — la feuille garde `overscroll-behavior:contain` (leçon du bug de prod du rechargement, lot 0).

## 2.6 Le mode sortie (l'écran le plus retravaillé)

Par élément, **deux bandes nettes** (validé, `ecran-05-piece.html`) :

- **Bande grise « 🔒 Entrée — référence signée »**, compacte : l'état d'entrée en **pastille lecture seule**,
  l'observation d'entrée en italique, les **miniatures des photos d'entrée** (verrouillées 🔒 + « +N »
  jusqu'à 8, touche = grande image entrée/sortie via la visionneuse `contain`).
- **Bande accentuée « ✍️ Sortie — à remplir »** (liseré orange) : la zone de travail — les **5 boutons
  d'état** (cible tactile 44 px), l'**observation de sortie**, l'ajout de photo.
- Règles de disposition validées : **les états côte à côte en 1/3 (entrée) · 2/3 (sortie)** ; **les
  observations et les photos en pleine largeur** (sinon une observation longue — jusqu'à 277 caractères
  réels — devient un ruban illisible : mesuré 5 lignes/92 px en 1/3 contre 2 lignes/294 px en pleine
  largeur).
- **Verdict déduit** en bas, jamais saisi ni stocké (`verdictDe`, module testé) : rien constaté →
  *à constater* (ambre) ; **même état → conforme (aucun badge)** ; état différent → *écart* (rouge). Une
  observation de sortie sans changement d'état n'est **pas** un écart (bug corrigé en séance : U→U =
  conforme). L'avertissement « état inchangé ? » reste (prévenir sans décider, `avertObsSortie`).

## 2.7 La relecture avant signature — NOUVEAU (comble le manque P7)

*(Validé sur `ecran-06b-apercu.html`, entrée ET sortie.)* Avant de signer, un **aperçu en lecture seule de
tout ce qui a été rempli** :

- un **bilan** en haut : en sortie *X conformes / Y écarts / Z à constater* ; en entrée *renseignés / non
  renseignés* ;
- **toutes les sections** repliables (Infos, Compteurs, Clés, Détecteur, puis les 7 pièces) au **volume réel** ;
- chaque élément montre l'**état** (en sortie : entrée → sortie + verdict) **et les commentaires** (obs
  d'entrée en gris, obs de sortie en orange) ; les pièces avec écart s'ouvrent d'office ;
- **toucher une ligne signalée** (écart / à constater / clé manquante) ramène à l'élément pour le corriger ;
- **une alerte** liste ce qui reste à vérifier (non constatés, clé non rendue) sans bloquer ;
- le bouton **« Signer l'état des lieux »** (pas de « signer quand même ») ouvre un **pop-up de
  confirmation** qui récapitule les écarts / non-constatés et fait signer **« en connaissance de cause »**
  (→ *Revenir corriger* / *Confirmer et signer*). Si tout est complet et sans écart, le pop-up le dit
  simplement.

## 2.8 Observations générales + Signatures + engagement

*(Validé sur `ecran-06-fin.html`.)*

- **Observations générales** (champ libre) ;
- **le cadre d'engagement du document signé, DISTINCT entre entrée et sortie** — ⚠️ **défaut confirmé sur
  PDF réel le 26/08 : le PDF de sortie affiche l'engagement d'ENTRÉE** (« les locataires s'engagent à
  restituer… ») car `EDL_ENGAGEMENT_TITRE/TXT1/TXT2` sont des `const` **partagés** (`index.html:33213`) →
  absurde à la sortie. Correctif : **nouvelles constantes `EDL_ENGAGEMENT_SORTIE_*`**, sélectionnées selon
  `edl.type`. Texte de sortie validé (verbatim, prototypé dans `EDL_Ferrette-101_SORTIE_v2.pdf`) :
  > **Accord des parties sur l'état des lieux de sortie :** Le présent état des lieux de sortie, établi
  > contradictoirement, décrit l'état du logement au départ du locataire. Les parties reconnaissent les
  > écarts constatés par rapport à l'état des lieux d'entrée. L'usure normale et la vétusté ne sont pas
  > retenues (décret n°2016-382 du 30/03/2016). Les cosignataires conviennent du caractère probant et
  > indiscutable des signatures recueillies par procédé informatique sécurisé au contradictoire des parties.
  > Le présent état des lieux de sortie est comparé à l'état des lieux d'entrée et fait partie intégrante du
  > dossier de location dont il ne peut être dissocié. **Aucun montant, ni retenue ou restitution de dépôt de
  > garantie, ne figure dans le présent document.**

  - **entrée** — « Engagement des locataires » : s'engage à restituer le logement en bon état, vétusté non
    retenue (décret 2016-382), installations à signaler sous 10 jours (texte actuel, inchangé) ;
  - **sortie** — « Accord des parties sur l'état des lieux de sortie » : les parties reconnaissent le constat
    de sortie et **les écarts relevés par rapport à l'entrée**, usure normale/vétusté non retenues,
    comparaison avec l'EDL d'entrée. **Aucun montant, aucune mention de dépôt** ;
- **« Fait à … le … »** + intro de signature (adaptés au mode) ;
- **signatures + PDF = chantier dédié** (valeur probante) : le parcours ne fait que *placer* l'étape.
  « + Ajouter un locataire » prévu pour les colocataires (P6).

## 2.9 Sur quels formats

- **Téléphone ET tablette (< 1024 px)** : le parcours à étapes + le rail.
- **PC (≥ 1024 px)** : **inchangé** — le tableau dense (`_edlPieceHTML`, `index.html:32586`), le sommaire
  d'ancres, la navigation clavier. Le chantier ne touche que le < 1024. Aucune régression PC.

## 2.10 Invariants testables (non négociables)

1. **Aucun champ EDL saisissable < 16 px sur mobile** (écran, tous modes).
2. **Une seule étape visible à la fois** sur téléphone/tablette — aucune section hors de l'étape courante.
3. **La page ne défile jamais horizontalement** sur aucun format ; **aucun conteneur de défilement imbriqué
   non borné**.
4. **Le constat d'entrée signé** reste ni modifiable ni supprimable, sur aucun format (garde niveau fonction).
5. **Aucun montant / mention de restitution / délai / retenue du dépôt** nulle part (écran, PDF, relecture).
6. **Le verdict de sortie = `verdictDe(étatEntrée, étatSortie)`** — jamais stocké ni saisi ; **états
   identiques ⇒ conforme**.
7. **Modèle à 109 éléments** figé.

## 2.11 Changements de code à prévoir (notés, pas faits)

- **Faire du parcours un parcours de l'EDL entier** : chaque section admin devient une étape ; ne plus se
  contenter de masquer `.edl-piece-block` (`css/main.css:3488`) — masquer/afficher **par étape** ; le rail
  et la feuille (`_edlSyncParcours`, `index.html:32430`) référencent les étapes complètes.
- **16 px à la source** : `css/main.css:3154 / 3182 / 3301 / 3273`, `index.html:32553-32554` ; retirer le
  doublon `css/main.css:3497-3500`.
- **Écran de sortie en 2 bandes** (états 1/3·2/3, obs + photos pleine largeur) — réutiliser le rendu et le
  module `edl-parcours.js` existants, pas de réécriture.
- **Nouvel écran de relecture** avant signature (aperçu lecture seule + pop-up « en connaissance de cause »)
  → logique en **module `js/` testé (TDD)**.
- **Constante d'engagement de SORTIE séparée** (ex. `EDL_ENGAGEMENT_SORTIE_*`) — aujourd'hui l'app réutilise
  la même qu'à l'entrée (`index.html:31007-31009`). Source unique avec le PDF.
- **Le rail visible < 1024** cohérent avec le commentaire « téléphone uniquement » (`index.html:4091`) —
  trancher le seuil (retenu : < 1024, tablette avec téléphone, §2.9).
- Gel du monolithe : aucune logique nouvelle inline, aucun CDN runtime, aucune colonne cloud nouvelle.

## 2.11 bis — PDF de l'EDL — PARTIR DE L'EXISTANT (relevé le 26/08, « on ne réinvente pas »)

> Le PDF reste un **chantier dédié**, mais il n'est PAS à construire : `generateEDLPdfNative`
> (`index.html:32884`) existe et est complet. On l'**ajuste**. Facts grounded :

**Ce que le PDF fait DÉJÀ (à ne pas refaire) :**
- **Hors réseau** : jsPDF v2.5.1 inliné base64 (`index.html:26`), photos IndexedDB (`_photoCache`,
  `index.html:31174`) → génération + partage sans signal ; seul l'envoi cloud demande le réseau.
- **Bandeau de marque** : `_pdfDrawBrandzone` (bailleur à gauche / Propryo à droite / filet), `index.html:32920`.
- **Une pièce par page** (`index.html:33065`), tableau `Élément · É · Obs. entrée · S · Obs. sortie`
  (5 colonnes, **la sortie est toujours présente, même sur un EDL d'entrée**, `index.html:33087`).
- **Galerie photos par pièce** : `CELL = 55 mm`, **3 par ligne**, `contain` (`_pdfContain`),
  légende `élément (E/S)` — `index.html:33113-33125`. **Photos à 5,5 cm, pas des vignettes.**
- Compteurs, chauffage/ECS, technologies, clés (NB entrée·sortie + galerie photos), observations,
  engagement, signatures : tout présent.
- **Conséquence majeure — la « feuille de sortie papier » existe déjà** : imprimer l'EDL d'ENTRÉE donne les
  colonnes `S` + `Obs. sortie` **vides**, prêtes à remplir à la main sans l'app. Répond au besoin « pas
  forcément Propryo à la sortie » sans rien construire.

**Ce qui manque vraiment (ajustements de `generateEDLPdfNative`, pas une réécriture) :**
1. **Séparer entrée / sortie en DEUX ENCADRÉS** (tranché le 26/08 sur PDF réel) — **problème constaté :
   « on mélange facilement photos entrée et sortie »** (galerie qui enfile E puis S avec une mini-légende
   6 pt, `index.html:33103-33107`). **Solution validée** (`EDL_SORTIE_2encadres.pdf`) : dans l'annexe, **un
   encadré « ENTRÉE » (fond gris, daté) contenant TOUTES ses photos en grille, puis un encadré « SORTIE »
   (fond orangé, daté) avec les siennes.** Chaque photo est **légendée par l'élément** (« Cuisine › Murs »)
   — **AUCUN état ni verdict rappelé sur les photos** (« on ne rappelle pas les états dans les photos ») :
   l'état/verdict reste dans le tableau des pièces. Grille ~3 photos/ligne.
   **Emplacement (tranché le 26/08) : les photos sont TOUJOURS placées SOUS leur section** — sous les
   compteurs, sous les clés, sous chaque pièce — **pas dans une annexe globale en fin de document.** Chaque
   section porte donc, juste après son tableau, son encadré « 📷 Entrée » puis son encadré « 📷 Sortie »
   (affichés seulement s'il y a des photos de ce côté). Réf. `EDL_SORTIE_photos_sous_sections.pdf`.
   **Style = trame Propryo, pas de style « maison » (tranché le 26/08).** Réutiliser les primitives du
   document réel : bandeau via **`_pdfDrawBrandzone`** (`index.html:7109`, Propryo vectoriel + filet fin
   `228,231,238`), titres de section comme `drawTitle` (gris `20,20,20`), en-têtes de tableau gris charte
   (`60,60,60`/`80,80,80`). Les encadrés photos sont **sobres** : filet fin (`210,214,222`) + en-tête gris
   très clair (`246,247,249`), libellé « Photos — entrée/sortie » + date. **Aucun aplat corail** (charte :
   corail = accent uniquement, jamais un fond/panneau). Réf. on-brand : `EDL_SORTIE_propryo.pdf`.
2. **Taille des photos dans l'annexe appariée** — **compacte**, tranché le 26/08 sur PDF réel : **~38-40 mm**
   par photo (4:3), **deux paires-éléments minimum par page**, pour ne pas exploser le nombre de pages
   (« photos trop grandes, on va avoir beaucoup de pages »). Ne mettre dans l'annexe **que les éléments
   photographiés** (les conformes sans photo n'y figurent pas). Bloc compact : titre élément + verdict sur
   une ligne, mini-libellés ENTRÉE/SORTIE, photos, obs de sortie. Résultat visé : EDL de sortie complet en
   ~3 pages (cf `EDL_Ferrette-101_SORTIE_v2.pdf`). La galerie inline actuelle (55 mm × 3/ligne) est
   remplacée par cette annexe appariée compacte.
3. **Colonne Verdict** dans le tableau des pièces (le parcours l'a, le PDF non).
4. **Engagement de sortie distinct** — aujourd'hui `EDL_ENGAGEMENT_*` est le même en entrée et sortie
   (`index.html:33213`) ; cf §2.8, nouvelle constante `EDL_ENGAGEMENT_SORTIE_*`.
5. **Feuille de sortie papier améliorée** (optionnel) — montrer la **photo d'entrée par élément** en
   référence à côté des cases vides.

> ⚠️ Les photos de l'EDL sont **en couleur** (détail probant) — le « document N&B » de la charte vise
> l'habillage, pas les photos. Le mockup `mockups/EDL-TELEPHONE/pdf-apercu.html` illustre la CIBLE
> (grandes photos appariées) ; le baseline réel est `generateEDLPdfNative`.

## 2.12 Ordre de chantier proposé

1. **16 px à la source** (rapide, corrige le défaut le plus criant) + non-régression PC.
2. **Parcours de l'EDL entier** : sections admin en étapes, rail + feuille sur toutes les étapes (le cœur).
3. **Écran de sortie 2 bandes** (états 1/3·2/3, obs/photos pleine largeur, verdict déduit).
4. **Relecture avant signature** (module testé) + pop-up de signature « en connaissance de cause ».
5. **Engagement de sortie distinct** (nouvelle constante, source unique PDF).
6. Smoke 3 formats (téléphone / tablette / PC) ; gate de sortie.

---

*Fin du CDC. Cap : finir le parcours, pas revenir en arrière. Maquettes de référence dans
`mockups/EDL-TELEPHONE/`. PDF + signatures = chantier dédié séparé.*
