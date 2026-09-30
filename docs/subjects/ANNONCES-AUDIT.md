# ANNONCES — Audit du générateur + mentions obligatoires

> Session du 25/09/2026 · aucune ligne de code modifiée · réf. BACKLOG.md:427 (remarque n° 5 du 25/09)
> Numéros de ligne `index.html` relevés sur `main` @ `17275e5`.

---

## Partie 1 — Le générateur existant

### 1.1 En une phrase

Le moteur `js/helpers/annonce-generator.global.js` (592 l., miroir généré de `__tests__/helpers/annonce-generator.js`) est **chargé à chaque démarrage mais sans aucune porte d'entrée**. Il lit encore le modèle de mai 2026 : la moitié de ses banques de phrases n'a plus de donnée pour se déclencher, et il **ne produit aucune des mentions DPE obligatoires**, ni la période de construction, ni les mentions d'encadrement.

### 1.2 Ce qui est branché aujourd'hui

| Élément | Où | État |
|---|---|---|
| Chargement du module | `index.html:4218-4219` | chargé (`window.AnnonceGenerator`) |
| Modale `#ov-annonce` | `index.html:2760-2836` | HTML présent, inatteignable |
| `openAnnonce(ref)` | `index.html:49834-49869` | **aucun appelant** — verrouillé par `__tests__/helpers/biens-migration.test.js:109-114` |
| `_annonceRegen/Copy/PDF/Email/ShowDpeWarn…` | `index.html:49871-50001` | vivantes, joignables seulement depuis la modale |
| Bouton « 📢 Annonce » ligne de liste | `index.html:37722-37725` | `const annonceBtn = '';` — « BIENS (P1-9) débranché » |
| Boutons Annonce fiche logement | `index.html:45377-45381` | retirés (« décision 7 du 11/08 ») ; reste « Inviter un candidat » |
| Onglet Présentation | `index.html:2745-2750` | supprimé ; `setLogModalTab('presentation')` → `'ident'` (`:46182`) |
| `_initAnnonceSchemaIfNeeded` | déf. `index.html:37462`, appel `:6006` | **toujours actif** : recrée à chaque boot des sous-objets vides (`presentation`, `quartier`…) |

Décision écrite correspondante : `mockups/BIENS-SIMPLIFIES/arbitrages.html:135-141` — « Générateur d'annonces : débranché, moteur conservé » ; réactivation = « rebrancher un bouton » (`impacts.html:217-224`).

### 1.3 Champs lus → existent-ils encore ?

Lignes = `js/helpers/annonce-generator.global.js`.

| Champ lu | Lignes | Aujourd'hui | Verdict |
|---|---|---|---|
| `log.type` | 157-209, 227, 244 | texte libre `T2`… (`index.html:50143`). Les tests `=== 'Maison'` / `'Studio'` (160, 221, 227, 266, 272) ne matchent jamais : la maison vit dans `imm.typeHabitat` (`:3481`) | ⚠️ sémantique morte |
| `log.surf` | partout | `index.html:50145` | ✅ |
| `log.npp` | 188, 244, 305, 531 | **chaîne**, souvent vide (`:50163`) → « `undefined` pièces » (188, 244) | ⚠️ |
| `log.etage` | 97-103 | texte libre (`:50145`) | ✅ |
| `log.typeUsage === 'habitation-meuble'` | 180, 192, 242, 530 | 7 valeurs (`:2354-2362`) : `mobilite`/`etudiant` (meublés par nature) ignorés ; `garage`/`local-pro` produisent « Appartement… » (244) | ⚠️ |
| `log.dpe.classe`, `.ges` | 130, 551 | copie legacy régénérée (`:49055-49063`) ; source canonique `log.diagnostics.dpe` | ✅ (lire `_diagGet`) |
| `log.dpe.valConv` | 233, 394, 551 | **plus alimenté** — écran et ADEME écrivent `valEner` (`:48840`, `:46820`) → « `?` kWh » (394) | ❌ renommé |
| `log.presentation.*` (expo, vue, lumière, calme, caractère) | 156-275, 345-392, 487, 501 | **aucune saisie depuis BIENS P1-9** | ❌ mort (≈ 60 % des banques storytelling / haut-gamme) |
| `log.quartier.*` | 400-441 | **aucune saisie** ; objet vide → la section « LE QUARTIER » sort vide, l'adresse disparaît (régression) | ❌ |
| `log.exterieurs.*` | 156-272, 356-368 | saisi (`:49755-49758`) ; `loggia` ignoré | ✅ |
| `log.equipements.cuisine/sanitaires/technologies` | 303-390 | saisi (`:49729-49752`) ; `frigo` ignoré | ✅ |
| `log.annexes.cave/parking/customs` | 385-388 | saisi (`:49761-49770`) ; garage, grenier, cellier… ignorés | ✅ partiel |
| `log.locationInfo.disponibilite/garanties_acceptees` | 504, 547-549 | saisi en Identité (`:49808-49814`) | ✅ |
| `imm.ville/codePostal/adr/regimeJuridique/equipementsCommuns` | divers | saisi (`:50605-50629`) | ✅ |
| `bail.hc/ch/dg` | 477-479 | **bail reconstitué** (`index.html:49847-49851`) : copie de `DB.baux[ref]`, puis repli `loyerHcRef`/`chargesRef`/`dgRef` **seulement si vide** | ❌ **voir 1.4** |
| « Honoraires : aucun » | 550 | **codé en dur** | ❌ faux pour un mandataire |

**Données existantes que le générateur ne lit pas :**

| Donnée | Où | Utile pour |
|---|---|---|
| `periodeConstr` (3 tranches légales) | `imm.periodeConstr` `:3472-3477` ; `_periodeLegale` `:42922` | description (pas une mention obligatoire) |
| `diagnostics.dpe.depensesEnergie` | `:48840`, ADEME `:46779` | **mention obligatoire R126-23** |
| `diagnostics.dpe.valEner` | `:48840` | description |
| ERP (état des risques) | catalogue diag `:42948` ; détecteur Géorisques `:4225` | **mention obligatoire R125-25** |
| Mandataire loi Hoguet | Référentiel → Mandataire `:1042-1050` | honoraires HCL (arr. 2017) |
| `bail.zoneTendue / encadrementLoyers / loyerRefMajore / complementLoyer` | **au bail seulement** `:1712-1748`, `:20905-20910` | mentions encadrement — rien au logement vacant |

### 1.4 Défaut d'argent : l'annonce afficherait le loyer de l'ancien locataire

`openAnnonce` (`index.html:49847`) copie `DB.baux[ref]`. Un logement vacant **garde son bail clos** dans `DB.baux[ref]` (c'est `_bienActiveBail`, `:36755`, qui l'écarte). Donc `bail.hc` n'est pas vide et **le loyer de l'ancien bail l'emporte sur le loyer souhaité `log.loyerHcRef`**. Idem charges et dépôt. Pour un bien à relouer, l'ordre doit s'inverser : loyer de référence d'abord.

### 1.5 Ce qu'il produit aujourd'hui sur un vrai logement

Logement vacant du jeu de démonstration `D-103` (`index.html:4543-4546`) — T2, 50 m², 2ᵉ, Strasbourg, 700 € HC + 100 €, DG 700 €, immeuble copropriété, aucun équipement ni DPE saisi, sous-objets vides tels que `_initAnnonceSchemaIfNeeded` les crée. **Sortie réelle** du moteur exécuté sous Node (format « leboncoin »), extraits :

Ton **factuel** :
```
T2 50m² undefined pièces - Strasbourg 67000
Appartement de type T2 d'une surface habitable de 50 m² composé de undefined pièces
principales, situé au 2ème étage, dans un immeuble en copropriété, 67000 Strasbourg.
Composition : entrée, séjour, cuisine non équipée, 0 chambre, salle de bain .
✨ LES ATOUTS            ← vide
📍 LE QUARTIER           ← vide
📂 DOSSIER À FOURNIR
✓ Justificatif de domicile actuel < 3 mois     ← NON AUTORISÉ (1.6)
✓ RIB français à votre nom                      ← NON AUTORISÉ (1.6)
💰 PRATIQUE
Loyer : 700 € HC + 100 € charges = 800 € CC/mois
Dépôt de garantie : 700 €
Honoraires : aucun (annonce directe propriétaire)
                         ← ni DPE, ni dépenses d'énergie, ni Géorisques, ni modalité des charges
```

Ton **storytelling** (défaut de la modale) :
```
T2 50m² à louer - Strasbourg
T2 50m² à Strasbourg.
Le séjour à l'agencement réfléchi accueille vos moments du quotidien avec cuisine
équipée attenante. Une chambre principale confortable pour vos moments de récupération.
Pour le quotidien : salle de bain avec douche italienne.
```

Constats :
- « undefined » ×2, « 0 chambre », « salle de bain . », deux sections vides ;
- **le moteur ment** en storytelling : « cuisine équipée attenante » (l. 325, émis sans condition hors cuisine ouverte) et « douche italienne » (l. 338 : `'avec ' + (sanits.bain ? 'baignoire' : 'douche italienne')` → douche par défaut) alors que rien n'est saisi — contraire à la « règle anti-mensonge » de son propre en-tête (l. 26-28) ;
- **deux pièces de dossier interdites** ;
- **quatre mentions obligatoires absentes** (modalité des charges, classes énergie/climat, dépenses d'énergie, Géorisques).

### 1.6 La liste « Dossier à fournir » demande des pièces interdites

`genererDossier` (l. 446-458) demande « Justificatif de domicile actuel < 3 mois » et « RIB français à votre nom ». Ni l'un ni l'autre n'est dans la liste limitative (décret 2015-1437, art. 22-2 loi 89-462 ; liste vérifiée sur service-public.gouv.fr/particuliers/vosdroits/F1169, « Vérifié le 10 avril 2025 ») : le justificatif de domicile autorisé est **un seul parmi** 3 dernières quittances / attestation d'hébergement / élection de domicile / dernier avis de taxe foncière. Service-public : « Si le propriétaire (ou l'agence immobilière) réclame un justificatif non autorisé, il encourt une amende pouvant aller jusqu'à 3 000 € ».
L'app a déjà la bonne source : `PIECES_REQUISES = ['identite','domicile','situation','ressources']` (`js/core/candidature.js:30`) et le commentaire `:52-56` qui exclut explicitement le RIB.

### 1.7 Tests

`__tests__/helpers/annonce-generator.test.js` : ≈ 112 cas, **tous écrits contre l'ancien modèle** (`valConv`, `presentation`, `quartier`, `type 'Maison'`) — verts sans rien prouver sur le modèle actuel.

---

## Partie 2 — Mentions obligatoires (textes cités mot pour mot)

Tous les extraits ci-dessous ont été relus le 25/09/2026 directement sur legifrance.gouv.fr (texte brut de la page, version « en vigueur au 25/09/2026 »).

### 2.1 Qui est visé

- **Tout bailleur non professionnel** — loi 89-462, art. 2-1 (créé par loi 2022-217) + **arrêté du 21 avril 2022**, art. 1, en vigueur au 1er juillet 2022 :
  > « Toute annonce émise par un non-professionnel relative à la mise en location d'un logement soumis à la loi susvisée du 6 juillet 1989 doit, quel que soit le support utilisé, indiquer : »
  URL : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000045632395/
- **Professionnels (agent, mandataire loi Hoguet)** — **arrêté du 10 janvier 2017**, art. 4 (version au 01/04/2022) :
  > « I. - Toute publicité effectuée par l'un des professionnels visés à l'article 1er, et relative à la location ou à la sous-location non saisonnière d'un bien déterminé, doit, quel que soit le support utilisé, indiquer : »
  URL : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000033889162
- **DPE et Géorisques : tous**, particuliers compris (voir 2.5 et 2.7).

Les deux listes sont identiques, à deux différences près : les honoraires d'agence (pro seulement) et l'abréviation « /mois » « CC » (particulier : partout ; pro : « sur les supports physiques »).

### 2.2 Loyer charges comprises et charges

Arrêté 21/04/2022, art. 1 :
> « 1° Le montant du loyer mensuel, augmenté le cas échéant du complément de loyer et des charges récupérables, suivi de la mention « par mois » et, s'il y a lieu, de la mention « charges comprises ». Celles-ci peuvent respectivement être abréviées en « /mois » et « CC » ;
> 2° Le cas échéant, le montant des charges récupérables inscrit dans le contrat de location et dans tous les cas les modalités de règlement desdites charges ; »

→ **« dans tous les cas les modalités de règlement »** : provision avec régularisation, ou forfait. Aujourd'hui aucune donnée au logement (seul `bail.chForfait`, posé par avenant, `index.html:25145`).
→ Le montant affiché en premier inclut **le complément de loyer** s'il existe.

### 2.3 Dépôt de garantie

> « 4° Le montant du dépôt de garantie éventuellement exigé ; »

Plafonds (contrôle de saisie, pas une mention) : 1 mois HC (art. 22), 2 mois en meublé (art. 25-6), **aucun** en bail mobilité (art. 25-17 : « Aucun dépôt de garantie ne peut être exigé par le bailleur. »).

### 2.4 Honoraires

Particulier (arr. 2022) :
> « 6° Le cas échéant, le montant toutes taxes comprises des honoraires à la charge du locataire dus au titre de la réalisation de l'état des lieux ; »

Professionnel (arr. 2017, art. 4-I) :
> « 6° Le montant total toutes taxes comprises des honoraires du professionnel mis à la charge du locataire, suivi ou précédé de la mention " honoraires charge locataire ", pouvant être abréviée en " HCL " sur les supports physiques ;
> 7° Le cas échéant, le montant toutes taxes comprises des honoraires à la charge du locataire dus au titre de la réalisation de l'état des lieux. »

→ Pour un particulier, **rien n'impose d'écrire « Honoraires : aucun »** ; la ligne codée en dur n'est pas fausse pour lui mais l'est pour un mandataire.

### 2.5 Surface, meublé, commune

> « 5° Le cas échéant, le caractère meublé de la location ;
> […]
> 7° La commune et, le cas échéant, l'arrondissement au sens de l'article L. 2511-3 du code général des collectivités territoriales, dans lesquels se situe le bien objet de la publicité ;
> 8° La surface du bien loué exprimée en mètres carrés de surface habitable au sens de l'article R. 156-1 du code de la construction et de l'habitation. »

(Arrondissement : Paris, Lyon, Marseille.)

### 2.6 DPE — classes, dépenses, F/G

**CCH L126-33** (version au 25/08/2021) — URL : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043976944
> « I.- En cas de vente ou de location d'un bien immobilier, le classement du bien au regard de sa performance énergétique et de sa performance en matière d'émissions de gaz à effet de serre et, pour les biens immobiliers à usage d'habitation et à titre d'information, une indication sur le montant des dépenses théoriques de l'ensemble des usages énumérés dans le diagnostic de performance énergétique sont mentionnés dans les annonces relatives à la vente ou à la location, y compris celles diffusées sur une plateforme numérique, selon des modalités définies par décret en Conseil d'Etat. »
> « III.-Tout manquement par un non-professionnel à l'obligation d'information mentionnée au présent article est passible d'une amende administrative dont le montant ne peut excéder 3 000 €. »

**R126-21** (presse écrite) — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043818609
> « Ces mentions, respectivement précédées des mots : “ classe énergie ” et : “ classe climat ” doivent être en majuscules et d'une taille au moins égale à celle des caractères du texte de l'annonce. »

**R126-22** (internet) — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043818611
> « […] ou présentée au public par un réseau de communication électronique, mentionne, de façon lisible et en couleur, les classements énergétique et climatique du bien sur les échelles de référence respectivement prévues par le e et le f de l'article R. 126-16. »

→ Un texte copié-collé sur un site ne porte pas de couleur : l'échelle colorée est affichée par le site d'annonces à partir des cases DPE qu'il fait remplir. L'app doit fournir les **lettres** (texte) **et** une **étiquette colorée** dans le PDF / l'image.

**R126-23** (dépenses) — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043934809
> « Cette indication, d'une taille au moins égale à celle des caractères du texte de l'annonce, est précédée de la mention : “ Montant estimé des dépenses annuelles d'énergie pour un usage standard : ”, et précise l'année de référence des prix de l'énergie utilisés pour établir cette estimation. »

→ **L'année de référence des prix n'existe nulle part dans l'app** (0 occurrence). L'import ADEME ne la ramène pas (`index.html:46763` : champs importés).

**R126-24** (F/G) — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043818615
> « Cette mention, dont les termes et conditions sont précisés par arrêté des ministres chargés de la construction et de l'énergie, est précédée des mots : " Logement à consommation énergétique excessive : ". Elle doit être d'une taille au moins égale à celle des caractères du texte de l'annonce. »

**Arrêté du 22 décembre 2021**, art. 1 — https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000044593048
> « a) Pour les biens immobiliers dont la classe est F au sens de l'article L. 173-1-1 du code de la construction et de l'habitation :
> « classe F. » ;
> b) Pour les biens immobiliers dont la classe est G au sens de l'article L. 173-1-1 du code de la construction et de l'habitation :
> « classe G. » »

→ Texte à produire : « Logement à consommation énergétique excessive : classe F. » (ou G).
→ Décence (loi 89-462 art. 6) : G interdit à la location depuis le 01/01/2025, F au 01/01/2028, E au 01/01/2034. Le bandeau existant `_annonceShowDpeWarn` couvre déjà ce calendrier.
→ DPE vierge / logement non soumis : **aucun texte trouvé** qui impose une mention.

### 2.7 Géorisques (non demandé, mais obligatoire)

**C. env. R125-25** (version au 01/01/2023) — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031391828
> « I.-L'annonce relative à la vente ou la location d'un bien pour lequel doit être établi l'état des risques mentionné à l'article L. 125-5, quel que soit son support de diffusion, comporte la mention suivante : “ Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www. georisques. gouv. fr ”. »

(Les espaces dans l'URL sont ceux de Légifrance ; écrire `www.georisques.gouv.fr`.)

### 2.8 Zone tendue — encadrement des loyers

Arrêté 21/04/2022, art. 1 (identique au 3° de l'arrêté 2017) :
> « 3° Pour les biens situés dans les territoires où s'applique l'arrêté prévu au I de l'article 140 de la loi susvisée du 23 novembre 2018, le montant du loyer de référence majoré précédé de la mention « loyer de référence majoré (loyer de base à ne pas dépasser) », le montant du loyer de base précédé de la mention « loyer de base » et, le cas échéant, le montant du complément de loyer exigé, précédé de la mention « complément de loyer ». Ces montants sont précédés de la mention « Zone soumise à encadrement des loyers ». La taille des caractères du montant mentionné au 1° est plus importante que celle du loyer de référence majoré, du loyer de base et du complément de loyer ; »

- S'applique **uniquement aux territoires d'encadrement** (art. 140 ELAN : Paris, Lille, Plaine Commune, Lyon-Villeurbanne, Est Ensemble, Bordeaux, Montpellier, Pays basque, Grenoble partiel — liste service-public). **La zone tendue « simple » (décret 2013-392) n'impose aucune mention d'annonce.**
- ⚠️ **Échéance** — ELAN art. 140-I (version au 24/08/2022) : « A titre expérimental et pour une durée de huit ans à compter de la publication de la présente loi » (JORF du 24/11/2018) → **fin au 24/11/2026**, soit dans deux mois. Aucune prolongation trouvée sur Légifrance au 25/09/2026. À re-vérifier le jour du code.
- ⚠️ Le loyer de référence majoré est fixé par arrêté préfectoral « exprimés par un prix au mètre carré de surface habitable » ; l'app le stocke en €/m²/mois **sur le bail** (`index.html:1742`). Le texte d'annonce dit « le montant » sans préciser €/m² ou €/mois.
- Règle de mise en forme : le loyer CC (1°) en caractères **plus grands** que ces trois montants → possible dans le PDF, impossible dans un texte copié-collé.

### 2.9 Synthèse

| Mention | Texte | Particulier | Pro | Donnée dans l'app | Générateur actuel |
|---|---|---|---|---|---|
| Loyer CC « par mois » | arr. 2022 1° / 2017 4-I-1° | ✅ | ✅ | `loyerHcRef` + `chargesRef` | ⚠️ ancien bail prioritaire |
| Charges + **modalité** | 2° | ✅ | ✅ | montant ✅ · modalité ❌ | ❌ modalité absente |
| Dépôt de garantie | 4° | ✅ | ✅ | `dgRef` | ⚠️ idem 1.4 |
| Meublé | 5° | ✅ | ✅ | `typeUsage` | ⚠️ `mobilite`/`etudiant` ignorés |
| Honoraires HCL | 2017 6° | — | ✅ | Mandataire (Référentiel), **montant absent** | ❌ « aucun » en dur |
| Honoraires état des lieux | 2022 6° / 2017 7° | ✅ le cas échéant | ✅ | ❌ | ❌ |
| Commune (+ arrdt) | 7° / 4-II-1° | ✅ | ✅ | `imm.ville` | ✅ (arrdt ❌) |
| Surface habitable m² | 8° / 4-II-2° | ✅ | ✅ | `log.surf` | ✅ |
| Classe énergie + classe climat | L126-33, R126-21/22 | ✅ | ✅ | `diagnostics.dpe.classe/ges` | ⚠️ ligne DPE si classe, pas le libellé « classe climat » |
| Dépenses annuelles + **année des prix** | R126-23 | ✅ | ✅ | montant ✅ · année ❌ | ❌ |
| « Logement à consommation énergétique excessive : classe F. » | R126-24, arr. 22/12/2021 | ✅ | ✅ | classe ✅ | ❌ (bandeau d'avertissement seul, rien dans le texte) |
| Géorisques | R125-25 | ✅ | ✅ | ERP au catalogue | ❌ |
| Encadrement (3 montants + intitulé) | 3° | ✅ | ✅ | **bail seul**, pas le « loyer de base » | ❌ |
| Pièces du dossier conformes | art. 22-2, décret 2015-1437 | ✅ | ✅ | `PIECES_REQUISES` | ❌ **2 pièces interdites** |

**Conclusion** : une annonce produite aujourd'hui serait **non conforme sur 7 points** et exposerait le bailleur à deux amendes distinctes (DPE : 3 000 € ; pièce de dossier interdite : 3 000 €).
