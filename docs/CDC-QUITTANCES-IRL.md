# CDC — Quittances & Révisions de loyer (IRL)

**Statut : VALIDÉ par Didier le 18/08/2026** — session dédiée « quittances & IRL ».
**Révisé le 25/08/2026** après retour sur l'écran réel : D22 (aucune fenêtre au démarrage), D23 (le DPE informe,
il ne bloque pas), D24 (ruban à trois états), D25 (l'IRL en tête), D26 (les documents passent au **texte natif** :
2,4 Ko et 1 page, contre 449 Ko et 2 pages) — et D16/D17 corrigées en conséquence.
Maquettes de référence, dans `mockups/QUITTANCES-IRL/` (gitignoré) :

| Fichier | Ce qu'il fixe |
|---|---|
| `scenarios-onglets.html` | Le choix de navigation (scénario A retenu) |
| `etats-loyers.html` | L'écran du mois, le tri par « quittance demandée », « Faire une quittance », états vides |
| `revision-irl.html` | Le calendrier Gantt, les états de révision, la fenêtre de validation, l'historique, la lettre |
| `retraits-et-rappels.html` | Le courrier de relance unique + l'inventaire complet des retraits |
| `demarrage-sans-popup.html` | Le démarrage sans fenêtre + la pastille de menu et ce qu'elle compte (D22) |
| `ruban-et-dpe.html` | Le ruban des révisions lisible, l'ordre des blocs, le rappel DPE (D23 à D25) |
| `pdf-rendu.html` | Le diagnostic du PDF actuel : d'où viennent le flou (184 DPI) et la 2ᵉ page (marges comptées deux fois). ⚠️ Ses correctifs « garder l'image » sont **caducs** — voir D26 |

Aucun code n'a été modifié par cette session. Ce fichier et les 4 maquettes sont les seuls livrables.

---

## 1. Le constat qui justifie le chantier

Les deux onglets actuels **ne détiennent aucune donnée en propre**. Le dû est dans le bail et le barème
(`duMois`, [js/core/loyer-du-mois.js:96](../js/core/loyer-du-mois.js)), le payé dans les mouvements, l'historique
dans la timeline du bail (v15.496). Ce sont deux **listes de tâches** — donc deux endroits à visiter pour savoir
qu'il n'y a rien à faire.

Défauts relevés, référencés :

| # | Constat | Référence |
|---|---|---|
| C1 | **Trois chemins de génération concurrents et non alignés** : `genAllQuit()` (émet pour tout lot occupé, sans regarder le paiement ni les dates du bail, et écrit `datePaiement = aujourd'hui`), `_quittancesAutoGenAtBoot()` (respecte les dates, ignore le paiement), et le popup au save d'un mouvement (seul chemin adossé à un paiement réel) | index.html:28557 · 28507 · 16269 |
| C2 | **Trois réglages pour la même idée** : `params.quittancesAutoGen` (global), `bail.quittAutoGen` (par bail), colonne « 🧾 » de Pilotage — plus la case `bail.quittanceDemandee` qui, elle, ne sert qu'à un point de couleur sur le dashboard | index.html:1090 · 1602 · 48736 · 10712 |
| C3 | **Un 7ᵉ moteur d'imputation** : `_matcheMois()` rattache un paiement au mois de sa propre date. Un loyer d'août payé le 2 septembre compte pour septembre — août reste impayé à vie. Contredit frontalement le résolveur unique décidé le 09/07 | js/core/quittances-actives.js:100 |
| C4 | **Le montant de la quittance vient du bail courant**, jamais du barème : une quittance d'un mois passé porte le tarif d'aujourd'hui | index.html:28563 · 16281 |
| C5 | **L'onglet Quittances est un historique, pas une file de travail** : il ne montre que les quittances déjà émises, jamais un loyer encaissé restant à quittancer | rQuit() — index.html:27692 |
| C6 | **Un bouton efface toute la traçabilité IRL** (`DB.irlHistorique`) alors que le barème garde ses périodes → un loyer sans explication | index.html:541 |
| C7 | **L'historique IRL fait doublon** avec la timeline « Historique du bail » livrée en v15.496 | index.html:538 vs 37600+ |
| C8 | **La prescription d'un an (art. 17-1) n'existe pas** : `computeIRLRevision` calcule toujours sur l'année en cours et propose la révision quel que soit le retard | index.html:24903 |
| C9 | **La table INSEE est figée dans le code** et s'arrête à T1 2026 : T2 2026 (148,37, publié le 12/07/2026) manque → « Index T2 2026 manquant » sur tout bail à réviser aujourd'hui | IRL_DEFAULT — index.html:4114 |
| C10 | **Commentaire périmé** : index.html:12513 affirme encore que le dû d'un mois quittancé = la quittance figée (« B3 »). Le code ne le fait plus depuis le 16/07 | index.html:12513 |
| C11 | **Deux interrupteurs branchés sur rien** : colonne « 📈 révision IRL automatique » de Pilotage (aucun moteur), et le hub Communications marqué `@deprecated` sans appelant | index.html:48736 · 27810 |

---

## 2. Les décisions

### Navigation

**D1 — Un seul onglet « Loyers ».** Les onglets *Quittances* et *Loyer (IRL)* fusionnent en un onglet unique qui ne
contient que **ce qu'il y a à faire ce mois-ci** sur les loyers. Zone Argent de la sidebar :
**Mouvements · Loyers · Charges · Finances**. 13 entrées de menu au lieu de 14.

**D2 — « Loyers & mouvements » est renommé « Mouvements ».** C'est déjà son libellé en sous-onglet
(`_NAV_GROUPS`, index.html:7989). Sans ce renommage, deux entrées du menu contiennent le mot « Loyers ».

### Ce que l'écran montre — et surtout ne montre pas

**D3 — La quittance n'est pas omniprésente.** Le bloc « Quittances demandées » ne liste que les baux dont la case
**« 🧾 le locataire demande une quittance mensuelle »** est cochée (`bail.quittanceDemandee`, index.html:1608,
art. 21 loi 1989 : le bailleur la transmet *à qui en fait la demande*). Sur 12 lots, 2 ou 3 la cochent : les autres
ne produisent **aucune ligne**. L'écran grandit avec les problèmes, pas avec le parc.

**D4 — Pour tous les autres : « ＋ Faire une quittance ».** Bouton principal, permanent, indépendant de toute ligne.
Deux choix : **le logement, puis le mois**. Aucun montant à saisir — il est lu au **barème du mois choisi** (une
quittance de juin 2026 porte le loyer de juin 2026, même s'il a été révisé depuis). Les mois non soldés restent
visibles mais non sélectionnables, avec leur motif (« reste 120,00 € »).

**D5 — L'écran du mois tient en quelques lignes.** Trois blocs, chacun replié à une ligne quand il est vide :
1. 🧾 **Quittances demandées** (case cochée + mois soldé)
2. ⏳ **Pas à jour** — loyer **et** charges
3. 📈 **Révisions à préparer**

Plus deux lignes repliées : « Quittances éditées ce mois » et « Calendrier des révisions à venir ».

**D25 — L'ordre des blocs de l'onglet Loyers : l'IRL en premier.**
*(Ajouté le 25/08, demande explicite.)* Remplace l'ordre de D5 :
1. 📈 **Révisions à préparer** — 2. 🏷 **DPE à compléter** (information, D23) — 3. 🧾 **Quittances demandées** —
4. ⏳ **Pas à jour** (loyer et charges).
Puis, repliés : le calendrier des révisions · les non révisables · les quittances éditées ce mois · le suivi mois
par mois. **Pourquoi cet ordre** : une révision arrive une fois par an et par bail et **se perd** si on l'oublie
(prescription d'un an, D15) ; une quittance se rattrape à tout moment. Le rare et périssable passe avant le
fréquent et rattrapable. Le rappel DPE est juste sous l'IRL parce qu'il parle du bloc du dessus.

**D25 — arbitrage tranché le 26/08 (Didier, sur maquette `d25-ordre-blocs.html` au volume réel) : OPTION A.**
D25 se réalise **sur le socle « tableau de bord à tuiles »** validé le 18/08 (une seule liste à l'écran), en réordonnant
les tuiles **Révisions à préparer → Quittances demandées → Pas à jour** (défaut = Révisions), puis dessous le ruban,
le bloc DPE et le lien Suivi. L'IRL est bien en tête. **Écartée : l'option B** (les 4 familles empilées d'un coup) —
mesurée à 1729 px sur PC en mois chargé contre 1252 px pour A, et elle reviendrait sur le socle tuiles déjà en prod.
B ne serait rouverte que par une maquette dédiée si « voir les 4 familles sans un clic » devenait prioritaire.

### Quand une quittance est possible

**D6 — Mois soldé = quittance ; sinon, reçu.** La quittance n'est proposée que si le cumul encaissé imputé au mois
atteint le dû du mois, **au centime**. En dessous : bouton « Reçu de paiement partiel », jamais une quittance
(art. 21 : *« dans tous les cas de paiement partiel, le bailleur délivre un reçu »*).

**D7 — L'imputation n'est pas réinventée : elle est consommée.** Le rattachement d'un paiement à un mois est déjà
tranché (décisions du 09/07 et 14/07) et codé :
- cascade **loyer HC du mois → charges du mois → arriérés de loyer les plus vieux d'abord → arriérés de charges**
  (`_loyerArrearsPass`, [js/core/loyer-du-mois.js:212](../js/core/loyer-du-mois.js)) ;
- **netting avance↔retard** (`_computeLoyerNetting`, idem:263) : une avance couvre les mois suivants avant qu'un
  retard naisse ;
- « un paiement n'est pas rattaché au mois calendaire de sa date, il comble d'abord le plus vieux mois non couvert »
  (`_computeLoyerStatut`, [js/core/loyer-statut.js:31](../js/core/loyer-statut.js)) ;
- écrit dans [docs/CDC-FINANCES.md § H-1](../docs/CDC-FINANCES.md).

**Un mois est quittançable quand il ne porte plus aucun résidu** : `retardMois[idx].loyer === 0 && retardMois[idx].charge === 0`.
Ce seul prédicat donne gratuitement le rattrapage, le paiement en plusieurs fois et l'avance.
`_matcheMois()` (C3) est **supprimé**, pas corrigé.

**D8 — Une quittance = un mois.** Quand un rattrapage solde trois mois d'un coup, un geste (« Éditer les 3 »)
produit **trois documents datés**. Jamais un document « juin à août ». L'attestation annuelle de loyers
(CAF, déclaration du locataire) est **hors V1**.

**D9 — Un mois échu non soldé : une ligne par lot, jusqu'au solde.** « COLMAR-4 · Muller — 6 mois non soldés depuis
mars 2026 — 4 140,00 € — *Relancer* ». Une seule ligne quel que soit le nombre de mois. Le détail mois par mois est
à un clic, dans l'écran **Suivi** qui existe déjà. **Aucun document n'est émis** pour ces lignes.

**D10 — Les charges ont leur place dans « Pas à jour ».** La cascade (D7) impute le loyer avant les charges : un
locataire peut avoir son loyer soldé et 250 € de charges en souffrance. La ligne l'écrit en clair et propose le
même geste que pour un loyer impayé (D11).

**D11 — Un seul courrier de relance.** Un unique document, au gabarit unique déjà validé, dont le **tableau**
détaille ce qui manque : loyer, charges, arriérés. Que le manque porte sur le loyer, les charges ou les deux, c'est
le même bouton — seul le tableau change. Les modèles existants (`rappel-impaye-1/2/3`) fournissent le texte et
l'escalade (rappel → relance → mise en demeure) selon l'ancienneté. **Pas de second document « rappel de charges ».**

### Révision IRL

**D12 — Effet au 1ᵉʳ jour du mois de l'anniversaire du bail.** Bail signé le 15/09 → la révision prend effet au
**01/09** de chaque année. *(Écart avec le code actuel : `computeIRLRevision` place la révision au jour anniversaire
et ne cale jamais l'effet sur le 1ᵉʳ du mois.)*

**D13 — Proposée un mois avant.** La ligne apparaît dans « Révisions à préparer » dès le **1ᵉʳ du mois précédent**
(effet 01/09 → rappel dès le 01/08), pour laisser le temps de préparer et remettre la lettre avant que le nouveau
loyer s'applique. *(Écart : l'alerte actuelle se déclenche à 30 jours glissants, pas au 1ᵉʳ du mois.)*

**D14 — Une révision en retard n'est jamais rétroactive.** Validée après la date d'effet prévue, elle s'applique au
**1ᵉʳ du mois suivant la validation**. C'est la règle Q1 déjà codée
(`_baremeComputeDateEffetIRL` / `_baremeClampDateEffet`) et c'est aussi l'art. 17-1 (*« si le bailleur manifeste sa
volonté dans le délai d'un an, la révision prend effet à compter de sa demande »*). Jamais avant un mois déjà quittancé.

**D15 — Prescription d'un an (art. 17-1) : le cycle périmé est fermé.** Au-delà d'un an après la date d'effet prévue,
la révision de ce cycle **n'est plus proposée**. Elle bascule dans un bloc informatif « ⌛ Perdue », qui indique une
fois ce qu'elle aurait rapporté (« ≈ 14,80 €/mois »). Seul le **cycle en cours** reste révisable, sur le loyer
**actuel** — pas sur celui qu'on aurait eu sans l'oubli. L'app ne propose jamais un geste non opposable au locataire.

**D16 — Un calendrier des révisions, replié en bas de l'onglet Loyers.** Douze mois glissants.
*(Révisé le 25/08 — le chantier a remplacé le Gantt « 1 lot × 12 mois » par un **ruban de 12 tuiles** agrégées,
`IrlCalendrier.rubanRevisions` : 33 lignes sur le parc réel faisaient monter l'écran à 3 691 px. Le remplacement
est conservé ; voir **D24** pour ses états.)* Sur téléphone le ruban défile **dans son propre cadre** ; la page ne
déborde pas. Clic sur une tuile = la liste des lots de ce mois.

**D17 — Les non-révisables sont visibles mais muets — et il n'y en a que deux sortes.**
*(Corrigé le 25/08 : « on ne bloque pas l'IRL à cause du DPE, on informe ».)*
Deux motifs seulement retiennent un lot hors des révisions :
- **DPE renseigné F ou G** → loyer gelé. C'est la **loi** (Climat & Résilience, art. 23) qui interdit, pas l'app.
- **Bail de moins d'un an** → la première révision n'est pas encore due.

Un **indice non encore publié** n'est pas un blocage non plus : le lot reste annoncé, avec la date de publication
attendue de l'INSEE (D20).

**D23 — Un DPE absent ou périmé n'empêche AUCUNE révision : il informe.**
*(Ajouté le 25/08. Maquette : `ruban-et-dpe.html`, sections 3 et 4.)*
Aujourd'hui `computeIRLRevision` renvoie `{dpeManquant:true}` **sans rien calculer**, et `applyIRL` refuse
d'appliquer (index.html:24925 et 25957) : sur le parc réel, 6 lots sont sortis des révisions parce qu'un DPE
n'a jamais été saisi. Désormais :
- la révision est **calculée et proposée normalement**, avec une pastille « DPE inconnu » et la phrase
  « à vérifier avant d'envoyer : un F ou G ne se révise pas » ;
- un bloc d'information **« 🏷 DPE à compléter »**, placé juste sous les révisions, dit combien de lots n'ont pas
  de DPE en base — **sans retenir quoi que ce soit** ;
- **saisie rapide sur place** : une ligne par lot, la classe en un clic (A→G) + la date de réalisation, écrite sur
  la **fiche du bien** (`log.diagnostics.dpe`, la source de vérité depuis v15.233), pas dans un champ local ;
- **case « non concerné »** pour les garages, caves et parkings : pas de DPE exigible, donc plus jamais réclamé ;
- **DPE de plus de 10 ans** traité comme un DPE manquant (il n'est plus valable) — l'app sait déjà le détecter
  (`dpeExpire`), elle se contentait d'un avertissement discret ;
- saisir un **F ou un G** est la seule chose qui change quelque chose : le lot bascule immédiatement en loyer gelé
  et sort des révisions (D17).

Sur le parc réel, cette seule décision fait passer les non révisables de **16 lots à 10**.

**D24 — Le ruban n'a que trois états : à faire, faite, rien.**
*(Ajouté le 25/08, après constat sur l'écran réel : six tuiles rayées orange affichant « — ».)*
- La **hachure « mois de rappel (M-1) » disparaît** du ruban. Elle avait un sens sur le Gantt, où la bande était
  collée à son pavé d'effet sur la même ligne ; agrégée en tuiles, elle produit une case rayée sans voisin ni
  chiffre. Le rappel M-1 reste ce qu'il est : ce qui fait apparaître la ligne dans « Révisions à préparer » (D13).
- Les révisions **déjà faites** deviennent visibles : tuile verte, chiffre + « faite ». Aujourd'hui la tuile lit
  `const n = m.nbEffet` (index.html:29755) alors que `nbFaite` est calculé et **jamais rendu** — un mois dont la
  révision est appliquée affiche « — » comme s'il ne s'y était rien passé.
- Le 🔒 des non-révisables reste en coin de tuile, hors compteur.
- **Règle** : toute tuile colorée porte un chiffre et un mot. Le gris veut dire « rien ce mois-ci », et c'est vrai.

**D18 — La fenêtre de validation est conservée telle quelle** (`ov-irl-valid`, `_irlValidConfirm`), avec sa date
d'effet modifiable et ses garde-fous. Une seule chose est ajoutée : la phrase **« Les mois passés ne changent pas —
aucune quittance déjà émise, aucun loyer déjà dû n'est recalculé. »**

**D19 — Un seul historique : celui du bail.** La révision écrit son événement dans la timeline « Historique du bail »
(v15.496). La lettre s'y re-télécharge depuis la ligne. Le sous-onglet « Historique » de l'IRL et son bouton
« 🗑 Effacer tout l'historique » disparaissent — rien ne justifie de pouvoir effacer une trace financière (C6).

### Les documents produits

**D26 — TOUS les documents passent au TEXTE NATIF. La rasterisation est abandonnée.**
*(Décidé le 25/08/2026. Remplace la première version de D26, qui conservait l'image : elle reposait sur une
lecture erronée d'une remarque de Didier sur le copier-coller. Critères réels, énoncés par lui : « un PDF qui rend
bien et qui ne soit pas trop lourd ». Le texte sélectionnable ou non n'est pas un critère.)*

**Mesure faite le 25/08 sur la lettre de révision IRL, les deux versions côte à côte :**

| | Image (aujourd'hui) | Texte natif (démo) |
|---|---|---|
| Poids | **449 Ko** | **2,4 Ko** — 190 fois moins |
| Pages | 2 (dont une bande de 4,9 mm) | 1 |
| Netteté | 184 DPI, pixellise dès le zoom | vectoriel, net à tout zoom et à l'impression |
| Accents et € | — | encodés nativement (WinAnsi), **aucune police à embarquer** |

Démo produite avec pdf-lib (présent dans `node_modules`) ; l'app utilise jsPDF — même principe, mêmes ordres de
grandeur. Fichier : `Downloads/Lettre-revision-IRL-NATIVE-demo.pdf`.

**Le moteur existe déjà et tourne en production** — c'est le point qui rend la décision facile.
`PDF_NATIVE` (index.html:24313) porte marges, format A4, `FONT_FAMILY: "helvetica"`, tailles, couleurs, bordures,
fonds de tableau, et un `drawText` avec retour à la ligne, alignement et couleur. Le bail y est passé en **v13.05**
(commentaire index.html:24310 : « anciennes fonctions html2canvas supprimées, remplacées par `genPDFNative` »), et
il gère déjà les **signatures et paraphes en image** posés sur du texte vectoriel — la seule vraie objection au
natif tombe donc d'elle-même.

**Portée : TOUS les documents émis** *(étendu le 25/08 : « on fait ça pour tous les documents »)*.
Inventaire complet des générateurs PDF de l'app, vérifié fichier par fichier :

| Document | Chemin | État |
|---|---|---|
| Bail | `genPDFNative` (v13.05), paraphes/signatures en image | ✅ déjà natif |
| EDL entrée / sortie | `generateEDLPdfNative` — index.html:32461, **zéro html2canvas**, `addImage` seulement pour les photos | ✅ déjà natif |
| Acte de cautionnement signé | `_genPdfCautionnement` — email-pdf-attachment.js:662 | ✅ déjà natif |
| Récap bail signé (annexe mail) | `_genPdfBailSigne` — idem:524 | ✅ déjà natif |
| Récap EDL signé (annexe mail) | `_genPdfEdlSigne` — idem:591 | ✅ déjà natif |
| **Quittance** | `_genPdfQuittance` — idem:245 → `_rasterizeHtmlToPdfBlob` | ❌ **à convertir** |
| **Lettre de révision IRL** | `_genPdfIrlRevision` — idem:729 → idem | ❌ **à convertir** |
| **Décompte de régularisation de charges** | `_genPdfDecompteRegul` — idem:435 → idem | ❌ **à convertir** |
| **Récap DDT (diagnostics)** | `_ddtRecapPDF` — index.html:40789, jsPDF **+ html2canvas** sur `#ddt-recap-content` | ⚠️ **mixte, à convertir** |

**Quatre documents à convertir, pas neuf.** L'**EDL est le modèle** : texte natif partout, `addImage` uniquement
là où c'est vraiment une image (photos, signature, logo).

**Garde-fou obligatoire, déjà écrit** : `MontantDoc.hardenJsPdfText` (js/helpers/montant-doc.global.js:158)
enveloppe `pdf.text` pour assainir les caractères que les polices standard n'encodent pas **et les signaler en
console** — posé après l'audit du 13/08 (« sans ça, un caractère non couvert disparaîtrait silencieusement d'un
document légal »). EDL et DDT l'utilisent déjà ; les quatre conversions **doivent** passer par lui. C'est la
différence entre jsPDF, qui laisse tomber le caractère en silence, et un document juste.

**Ce qu'il faut faire** (DRY, cf. la règle « réutiliser, jamais recopier ») :
1. **Extraire `PDF_NATIVE` en module partagé** (`js/helpers/pdf-native.global.js`). Aujourd'hui il est défini
   **dans la source stringifiée** de la fenêtre d'aperçu du bail, donc inatteignable depuis la fenêtre principale.
   C'est le seul vrai travail de ce chantier.
2. **Un builder de structure par document**, sur le modèle de `buildBailStructure` (qui produit déjà des
   `{type:'p'|'h3'|…, text}`) : quittance, lettre IRL, décompte. Le gabarit unique (`doc-template.global.js`)
   reste la référence de mise en page ; il décrit désormais une structure, plus seulement du HTML.
3. **`_rasterizeHtmlToPdfBlob` n'est plus appelé du tout** — et `_ddtRecapPDF` abandonne lui aussi html2canvas.
   Une fois les quatre convertis, la fonction est **supprimée**, et html2canvas cesse d'être décodé depuis base64
   (~200 Ko) à chaque téléchargement de document.
4. **Le logo bailleur et la signature** restent des images, posées par `addImage` sur leur seule zone — comme le
   fait déjà l'EDL pour ses photos.
5. **Tout passe par `MontantDoc.hardenJsPdfText`**, sans exception.

**Ce qu'on perd, et qui est assumé** : le PDF n'est plus le décalque pixel du HTML d'aperçu. Deux rendus à tenir
alignés — l'aperçu écran et le PDF. C'est le prix d'un document qui pèse 2 Ko et reste net ; le bail le paie déjà
depuis la v13.05.

**Police** : Helvetica standard, comme le bail. Embarquer Schibsted Grotesk pour coller à la charte ajouterait
100 à 300 Ko par document et n'est **pas** V1 — à rouvrir seulement si la charte l'exige sur les documents émis.

**Hors V1** : rien de particulier. Un document de deux pages pleines ne pose plus le problème de découpe qu'avait
l'image : le moteur natif pagine sur les sauts de ligne, comme il le fait déjà pour le bail (des dizaines de pages).


### Indice INSEE

**D20 — La table INSEE part dans Paramètres et se met à jour toute seule via l'API INSEE.**
Vérifié en direct le 18/08/2026 :

```
GET https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001515333?startPeriod=2024-Q1
```

| Point | Constat vérifié |
|---|---|
| Authentification | **Aucune** — 200 en anonyme (l'API BDM est ouverte ; l'ancien portail à jeton a fermé le 10/09/2025) |
| CORS | **Ouvert** — `Access-Control-Allow-Origin` renvoyé en écho de l'`Origin`, préflight `OPTIONS` → 200. **Appel direct depuis le navigateur, aucun Worker relais nécessaire** |
| Format | **SDMX XML uniquement** (`Accept: application/json` ignoré) → `DOMParser` natif, **zéro dépendance**, conforme à la règle « aucun CDN au runtime » |
| Série | IDBANK **001515333** — « Indice de référence des loyers (IRL) », `FREQ=T`, base 100 = T4 1998 |
| Champs utiles | `TIME_PERIOD` (`2026-Q2`), `OBS_VALUE` (`148.37`), `DATE_JO` (publication au JO : `2026-07-12`), `LAST_UPDATE` |
| Débit | 30 appels/min annoncés (en-tête observé : 100). **Une lecture par ouverture d'app suffit** |

Règles d'usage :
- lecture **au boot, au plus une fois par jour** (horodatage en base), silencieuse ;
- `IRL_DEFAULT` reste le **filet de sécurité hors ligne** (file://, API injoignable) — jamais supprimée ;
- une valeur venue de l'API **n'écrase jamais** une valeur saisie à la main : divergence = signalée, pas corrigée d'office ;
- l'écran affiche la **date de publication au JO** de chaque indice : c'est elle qui explique pourquoi un trimestre
  n'est pas encore disponible (publication ~6 semaines après la fin du trimestre).

### Réglages et signalement

**D21 — Un seul interrupteur survit : la case du bail.** `bail.quittanceDemandee` devient le seul réglage lié aux
quittances, et c'est lui qui décide de ce qui s'affiche (D3). Il doit devenir une question posée **une fois, au
moment du bail** (« ce locataire veut-il sa quittance chaque mois ? »), pas une case perdue dans un formulaire.
Les trois autres réglages (C2) disparaissent.

**D22 — Aucune fenêtre ne s'ouvre au démarrage ; un compteur attend sur le menu.**
*(Ajouté le 25/08/2026 — oubli de la première rédaction, constaté par Didier : la popup était toujours là.
Maquette : `demarrage-sans-popup.html`.)*
La modale de rappel IRL ouverte au boot (`ov-irl-rappel`, via `_checkIRLRappelsAuLogin`, index.html:30755,
programmée index.html:57583) est **supprimée**. Elle contredisait trois décisions : elle se déclenche sur
`rev.isApplicable` — donc **après** l'anniversaire, jamais au rappel M-1 de D13 ; elle porte un bouton
« 💶 Valider IRL » qui **applique une révision depuis une fenêtre ouverte automatiquement**, hors de la fenêtre
de validation de D18 ; et elle interrompt là où D5 met le travail dans l'écran.

À la place : une **pastille rouge sur l'entrée de menu « Loyers »**, qui compte **exactement les lignes de
l'écran** — quittances demandées prêtes à éditer + lots pas à jour + révisions à préparer. Ni les
« non révisables » (gelé DPE, bail < 1 an, indice non publié) ni les « perdues » (D15) n'y entrent : rien à y
faire, rien à compter. Écran vide = pas de pastille. Info-bulle au survol détaillant les trois nombres.

**Rien à inventer** : le mécanisme existe et couvre déjà les trois surfaces (sidebar, barre du bas quand la page
est masquée, feuille « Plus ») — `_renderInboxSurfaces` (index.html:18727, candidatures) et
`_updateAgendaBadge` (index.html:50294, agenda). On y branche « Loyers ».

---

## 3. Ce qui disparaît

Validé en bloc. **Aucune donnée n'est supprimée** : `DB.quittances` et `DB.irlHistorique` restent en base, et les
quittances d'un logement restent consultables depuis sa fiche.

### Retiré

| Élément | Référence | Raison |
|---|---|---|
| Onglet « Quittances » (liste, filtres, bascule cartes/tableau) | index.html:650 · `rQuit()` | absorbé par « Loyers » |
| Bouton « ⚡ Générer ce mois » | `genAllQuit()` — index.html:28557 | émet sans regarder le paiement (contraire à D6) |
| Bouton « + Manuelle » (montants tapés à la main) | `openQuitManuelle()` — index.html:28966 | remplacé par « Faire une quittance » (D4) |
| Génération automatique au démarrage | `params.quittancesAutoGen` · `_quittancesAutoGenAtBoot()` | émettait sans paiement |
| Toggle « quittance auto à l'encaissement » du bail + son popup au save d'un mouvement | `bail.quittAutoGen` · index.html:16269 | remplacé par la case « demande » (D21) |
| Colonne « 🧾 » de Pilotage › Automatisations | `_PIL_AUTOM_KEYS` — index.html:48736 | 3ᵉ réglage pour la même idée |
| Colonne « 📈 révision IRL automatique » de Pilotage | idem | interrupteur branché sur rien (C11) |
| Onglet « Loyer (IRL) » et ses 3 sous-onglets | index.html:426 · `rIRL()` | absorbé par « Loyers » |
| Sous-onglet « Historique » de l'IRL + bouton « 🗑 Effacer tout l'historique » | index.html:538-541 | doublon + destruction de trace (C6, C7) |
| Panneau « ✉ Aperçu lettre » et son sélecteur de bail | `irl-letter-pane` — index.html:502 | l'aperçu suit le clic |
| **Popup de rappel IRL au démarrage** + son toast | `ov-irl-rappel` · `_checkIRLRappelsAuLogin` — index.html:30755 · 57583 | remplacée par la pastille de menu (D22) |
| `_matcheMois()` / `_matchPaiementQuittance()` | js/core/quittances-actives.js:100 · 121 | 7ᵉ moteur d'imputation (C3) |

### Déménage

| Élément | Vers |
|---|---|
| Table IRL INSEE + « ↺ Sync INSEE » (index.html:523, `rIRLParams()`) | **Paramètres**, alimentée par l'API (D20) |
| Onglet « Loyers & mouvements » | renommé **« Mouvements »** (D2) |

### Conservé tel quel

Fenêtre de validation de la révision (`ov-irl-valid`, `_irlValidConfirm`) · liste des quittances d'un logement dans
sa fiche (`_renderQuitForLog`, index.html:37567) · timeline « Historique du bail » (`bail-historique.js`) ·
écran **Suivi** (cible du lien « Détail mois par mois ») · gabarit unique des documents
(`doc-template.global.js`) et popup de partage (`_docShareOpen`), envoi e-mail toujours coupé
(`DOC_ENVOI_ACTIF = false` : on télécharge).

---

## 4. Invariants testables

À encoder en tests Vitest, chacun doit échouer si le comportement régresse.

| # | Invariant |
|---|---|
| **I1** | **Aucune quittance émise ne modifie un calcul.** Émettre, modifier ou supprimer une quittance laisse `duMois(ref, ym)` strictement inchangé pour tous les mois du lot. |
| **I2** | **Aucune révision ne modifie un mois déjà quittancé.** Pour tout `ym` porteur d'une quittance émise, `duMois` après `_applyIRLValidated` = `duMois` avant. |
| **I3** | **Aucune date d'effet rétroactive.** `dateEffet ≥ 1ᵉʳ du mois de l'anniversaire` **et** `dateEffet > dernier mois quittancé`, quelles que soient les valeurs saisies dans la modale. |
| **I4** | **Une quittance n'existe que sur un mois soldé.** Pour toute quittance émise, le mois correspondant a un résidu nul dans `_loyerArrearsPass` (loyer **et** charges). |
| **I5** | **Le montant de la quittance est celui du barème du mois**, pas du bail courant : après une révision, ré-éditer une quittance d'un mois antérieur produit le même montant qu'avant. |
| **I6** | **Une seule source d'imputation.** Aucun appel à un rattachement paiement→mois hors `_loyerArrearsPass` / `_computeLoyerNetting` / `_computeLoyerStatut`. |
| **I7** | **Une révision = un mois.** `N` mois soldés simultanément produisent `N` quittances distinctes, une par `ym`, jamais un document multi-mois. |
| **I8** | **Prescription.** Une révision dont la date d'effet prévue remonte à plus d'un an n'est jamais proposée à l'application ; seul le cycle en cours l'est. |
| **I9** | **Rappel M-1.** Une révision d'effet `01/M` apparaît dans « à préparer » du `01/(M-1)` au `31/(M-1)`, et pas avant. |
| **I10** | **Loyer gelé.** Un lot au DPE F ou G n'apparaît jamais dans « à réviser » et `applyIRL` reste bloqué. |
| **I11** | **L'API INSEE n'écrase rien.** Une valeur d'indice saisie à la main survit à une synchronisation ; une divergence est signalée, pas corrigée. |
| **I12** | **Hors ligne.** Sans réseau, `IRL_DEFAULT` prend le relais et aucun écran ne casse. |
| **I13** | **Pas d'émission automatique.** Aucun chemin de code ne crée une quittance sans clic explicite (ni au boot, ni au save d'un mouvement). |
| **I14** | **Aucune modale au démarrage.** Après un boot complet (legacy, sandbox et cloud post-hydratation), aucun overlay n'est ouvert : `document.querySelectorAll('.ov:not(.hidden)')` est vide, quel que soit le nombre de révisions en attente. |
| **I15** | **La pastille égale l'écran.** Le compteur de l'entrée « Loyers » = nombre de lignes actionnables de l'écran Loyers (quittances demandées prêtes + lots pas à jour + révisions à préparer), et vaut 0 — donc pas de pastille — quand l'écran n'a rien à proposer. Les non-révisables et les révisions perdues n'y entrent jamais. |
| **I16** | **Le DPE ne retient rien.** Un lot sans DPE, ou dont le DPE a plus de 10 ans, produit une révision calculée et proposable ; seul un DPE **renseigné F ou G** l'en exclut. `applyIRL` ne refuse plus pour DPE manquant. |
| **I17** | **Le DPE saisi depuis Loyers est écrit sur le bien** (`log.diagnostics.dpe`) et nulle part ailleurs ; un lot marqué « non concerné » ne réapparaît jamais dans le rappel. |
| **I18** | **Aucune tuile colorée sans chiffre.** Toute tuile non grise du ruban porte un nombre ≥ 1 et un libellé ; `nbFaite` est rendu ; aucune tuile n'est hachurée. |

---

## 5. Hors V1

- Attestation annuelle de loyers pour le locataire (CAF, déclaration de revenus).
- Révision IRL appliquée automatiquement sans validation (**écarté**, pas différé : une automatisation qui déplace
  de l'argent sans validation est exclue).
- Second document « rappel de charges » distinct du courrier de relance (D11).
- Décompte de régularisation annuelle des charges dans le même onglet — il reste dans **Charges**, mais l'écran
  « Loyers » est conçu pour l'accueillir plus tard sans refonte.
- Notion de tiers payeur (CAF/APL) au bail — déjà notée hors V1 dans CDC-FINANCES § H-2b.

---

## 6. Notes de code à traiter pendant le chantier

Relevées pendant l'audit, à ne pas perdre :

1. **Commentaire périmé, index.html:12513** : affirme encore que le dû d'un mois quittancé = la quittance figée
   (« B3 »). Le code ne le fait plus depuis la décision du 16/07. À corriger, sinon le prochain lecteur ré-introduira
   la 3ᵉ source.
2. **`EMAIL_HUB_CATALOG` / `_openCommsHub`** (index.html:27810+) sont marqués `@deprecated` sans appelant actif
   depuis v15.16. À trancher pendant le chantier : supprimer, ou ré-exposer.
3. **`_matchPaiementQuittance`** (quittances-actives.js:121) tolère un écart de montant (`toleranceAmount`) —
   disparaît avec D7, avec ses tests miroir.
4. **`computeIRLRevision`** doit changer de calendrier (D12/D13) : anniversaire → 1ᵉʳ du mois, alerte 30 jours
   glissants → 1ᵉʳ du mois précédent. Vérifier les 5 appelants (dashboard, matrice, agenda, fiche, drill).
5. **`IRL_DEFAULT`** doit rester (filet hors ligne) mais cesse d'être la source de vérité.
5bis. **Le blocage DPE est à défaire en deux endroits** (D23) : `computeIRLRevision` sort en
   `{dpeManquant:true}` **avant tout calcul** (index.html:24925) et `applyIRL` refuse d'appliquer
   (index.html:25957). Le calcul n'a jamais eu besoin du DPE — seul le **gel F/G** doit continuer à exclure.
   Vérifier au passage les 5 appelants qui testent `rev.dpeManquant` pour afficher « 📋 Saisir DPE ».
5ter. **Le ruban** (D24) : retirer la classe `.rap` posée par index.html:29755
   (`(!n && m.nbRappel ? ' rap' : '')`), rendre `nbFaite` (calculé irl-calendrier.js:302, jamais affiché),
   et mettre la légende à jour. `nbRappel` peut rester calculé pour d'autres surfaces, mais ne colore plus rien.
6. **Les PDF émis sont des images, et débordent sur une 2ᵉ page** (constaté le 25/08/2026 sur un
   `Lettre-revision-IRL-F-201.pdf` réel : jsPDF 2.5.1, 2 pages, un seul XObject JPEG 1402 × 2066 px,
   zéro caractère de texte — les 14 polices `Type1` déclarées sont les polices standard que jsPDF met
   toujours dans le dictionnaire, aucune n'est utilisée).
   - **Cause « image »** : `_emailGenIRLPdf` → `_buildIRLLetterHtml` → `_rasterizeHtmlToPdfBlob`
     (js/core/email-pdf-attachment.js:115) → html2canvas `scale:2` → JPEG 0.95 → `addImage`.
     Choix v15.107/v15.111 « Option A » (fidélité à l'aperçu). Un chemin **texte natif** existe en secours
     (même fichier, l. 760+) mais n'est jamais emprunté en usage normal.
     **→ Ce diagnostic reste utile pour comprendre l'existant, mais la voie retenue est D26 : texte natif.**
   - **Cause « 2 pages »** : marges cumulées. imgW = 210−16 = 194 mm → imgH = 2066×194/1402 = **285,9 mm**,
     pour une hauteur utile de 297−16 = **281 mm** → débordement de **4,9 mm** (≈ 18 px), et la boucle
     `while (renderedMm < imgH)` ouvre une page pour cette bande. Le conteneur de rendu applique
     `padding:30px` (≈ 8,3 mm) **en plus** des 8 mm de jsPDF, alors que le chemin impression du même
     document utilise `@page{margin:1.8cm 2cm}` (`QUIT_PRINT_CSS`, index.html:28814) : deux jeux de marges
     pour un seul document.
   - **Cause « flou »** : 1402 px étalés sur 194 mm = **184 DPI** (un document se lit à partir de 300), et un
     encodage **JPEG** — le pire format pour du texte noir sur blanc, il crée des halos autour des glyphes.

---

## 7. Ordre de chantier

Chaque étape est livrable et testable seule. Worktree dédié, détruit après intégration ; jamais de commit depuis
`Desktop\Immo`.

| Étape | Contenu | Gate |
|---|---|---|
| **1. Le socle du verdict** | Exposer « ce mois est-il soldé ? » depuis la cascade existante (`_loyerArrearsPass`) sous forme d'un sélecteur unique par (lot, mois). Supprimer `_matcheMois` et `_matchPaiementQuittance`. | Tests I4, I6 verts ; aucun écran modifié |
| **2. La quittance lit le barème** | `_buildQuittanceHtml` prend son montant de `duMois(ref, ym)` au lieu de `bail.hc/ch`. | Tests I1, I5 ; ré-édition d'une quittance ancienne identique à l'originale |
| **3. Couper les émissions automatiques** | Retirer `genAllQuit`, `_quittancesAutoGenAtBoot`, le popup au save de mouvement, les trois réglages (D21). | Test I13 ; smoke : aucune quittance n'apparaît sans clic |
| **4. L'onglet « Loyers »** | Nouvelle page : 3 blocs (D5), tri par `quittanceDemandee` (D3), « Faire une quittance » (D4), courrier de relance unique (D11). Retrait de l'onglet Quittances. | Gate 3 formats + 1 écran PC |
| **5. Le calendrier IRL** | Nouveau calendrier (D12/D13/D16/D17), prescription (D15), bloc « à préparer » dans l'onglet Loyers. Retrait de l'onglet IRL et de ses sous-onglets sauf la table. **Retrait de la popup de démarrage + pastille de menu (D22)**, branchée sur le mécanisme existant `_renderInboxSurfaces`. | Tests I8, I9, I10, **I14, I15** ; gate 3 formats ; smoke : lancer l'app deux jours de suite, aucune fenêtre |
| **4bis. Tous les documents en texte natif** | Extraire `PDF_NATIVE` (index.html:24313) en module partagé ; un builder de structure par document sur le modèle de `buildBailStructure` ; convertir les **4 restants** — quittance, lettre IRL, décompte de charges, récap DDT ; tout via `MontantDoc.hardenJsPdfText` ; logo et signature en `addImage` ; **supprimer `_rasterizeHtmlToPdfBlob`** et le chargement de html2canvas au téléchargement (**D26**). | Smoke sur les 4 : **1 page** quand c'est prévu, **< 20 Ko**, net au zoom 400 %, accents et € corrects, aucun avertissement `[pdfSafeText]` en console ; l'aperçu écran reste fidèle au PDF |
| **5bis. DPE informatif, ruban lisible, IRL en tête** | Défaire le blocage DPE dans `computeIRLRevision` + `applyIRL`, bloc « DPE à compléter » et sa saisie rapide écrite sur le bien (**D23**) ; ruban à trois états, hachure retirée, `nbFaite` rendu (**D24**) ; ordre des blocs IRL → DPE → quittances → pas à jour (**D25**). | Tests **I16, I17, I18** ; gate 3 formats ; smoke : les 6 lots « DPE non renseigné » réapparaissent en révisables, non révisables 16 → 10 |
| **6. Historique unifié** | La révision écrit dans la timeline du bail ; retrait du sous-onglet Historique et du bouton d'effacement (D19). | Test I2 ; smoke : révision visible sur la fiche |
| **7. API INSEE** | Table déplacée dans Paramètres, synchronisation au boot (D20), `IRL_DEFAULT` en filet. | Tests I11, I12 ; smoke hors ligne |
| **8. Navigation** | Renommage « Mouvements » (D2), zone Argent à 4 entrées, sidebar + barre du bas + feuille Plus + menu personnalisable. | Gate 3 formats ; audit agent SÛR |

**Gate de sortie (non négociable, CDC-V1-LIGHT § 6)** : fonctionnel complet sur téléphone + tablette + PC · 0 erreur
console · données réelles intactes · tests verts · audit par agent `superpowers:code-reviewer` **SÛR** · smoke explicite
de Didier. Onglet validé = figé.
