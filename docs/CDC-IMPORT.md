# CDC — Import bancaire (validé section par section avec Didier)

> Méthode : mêmes règles que la revue Finances — on découpe, on valide la logique élément par élément,
> **on ne code rien tant que tout n'est pas validé**. Audit de l'existant : `AUDIT-EXISTANT.md`.
> Mockups : `import-recap.html` (bandeau de lecture), `doublons.html`.
> Ancrage code : index.html v15.505 + `js/core/bank-import.js`.

---

## 0. Principes transverses

**T-1 · ON NE CACHE RIEN.** Aucune ligne n'est écartée, corrigée ou masquée en silence. Tout doute est
remonté à l'utilisateur, visible dans l'écran d'import, et réversible.

**R-A · Zéro règle dans le code.** Les mots-clés livrés deviennent un jeu de règles **en données**,
visible et éditable au même endroit que les règles créées par l'utilisateur.

**R-B v2 · Trois états, pas de match automatique.**
- **Règle** (validée par l'utilisateur) → automatisable, classement déterministe → onglet **Reconnus** ;
- **Proposition** (heuristique) → **toujours soumise**, reste dans **À compléter** même complète ;
- **Non détecté** → à classer.
⚠️ Aujourd'hui `_bankLineDone` fait basculer en « Reconnus » toute ligne dont catégorie + bien sont
remplis, **y compris par une proposition** : à corriger, c'est du classement automatique déguisé.

**R-C · Cas multi-bailleur** (ICARUS facture toutes les SCI) : une **seule** règle, dont l'affectation peut
valoir « **le bailleur du compte** » — résolu à l'import depuis le compte reconnu.

**R-D · Une règle reste simple et fonctionnelle.** À cadrer en section ⑦.

---

## ① Le fichier accepté ✅

**①.1 · Formats : OFX (privilégié) + Excel (.xlsx/.xls). CSV ABANDONNÉ.**
Motif : le CSV est un format libre, illisible pour l'utilisateur, et à l'origine de la totalité des bugs
de lecture constatés. Reconnaissance **par signature réelle**, fini le « sinon c'est du CSV ».
Fichier non reconnu → refus explicite : « exporte en OFX depuis ta banque, ou enregistre ton relevé en .xlsx ».
**Le lecteur CSV est retiré du code** (un CSV mal lu n'échoue pas franchement : il importe des montants
faux sans le dire).
*Effet de bord accepté : un compte alimenté uniquement en CSV repartira par l'écran « premier import ».*

**①.2** Taille max 5 Mo, inchangé. **①.3** Encodage UTF-8 strict → Windows-1252 conservé (l'OFX SGML
français en a besoin). **①.5** Message d'échec réécrit pour le nouveau périmètre.

**①.4 · Excel multi-feuilles** : on lit **la feuille qui contient des mouvements** (colonne de dates +
colonne de montants). Une seule correspond → aucune question. Plusieurs → on affiche leur nom et le nombre
de lignes, l'utilisateur choisit.

---

## ② La lecture du fichier ✅

**②.1 · OFX (I-3)** — l'extraction des balises **ne s'arrête plus au premier retour à la ligne** (un `MEMO`
sur deux lignes est aujourd'hui tronqué : RUM, référence de mandat, motif). Le libellé agrège **toutes** les
balises textuelles : `NAME`, `MEMO`, `PAYEE`, `EXTDNAME`, `REFNUM`, `CHECKNUM`.

**②.2 · Début des données trouvé PAR LE CONTENU, en silence.** On teste les 20 premières lignes comme
candidat en-tête : une colonne contient-elle des dates valides sur ≥ 80 % des lignes, une ou deux des
montants, le nombre de colonnes est-il stable. Les **noms d'en-têtes ne servent que de bonus de confiance**.
Écarté explicitement : demander à l'utilisateur où est l'en-tête (« ce n'est pas à moi d'expliquer à l'app
comment lire un fichier »). Règle un coup : préambule, lignes de total, fichier sans en-tête, template
propre à chaque banque.

**②.3 · La DATE D'OPÉRATION fait foi** (pas la date de valeur) : c'est le jour où l'argent a bougé, celui
que dit le locataire et que porte la quittance. Priorité si en-têtes présents : opération > comptabilisation
> valeur ; sinon la première colonne de dates. **La colonne retenue est affichée dans le récapitulatif.**

**②.4 · Orientation débit/crédit — prouvée, pas devinée.**
Reconnaissance : deux colonnes **jamais remplies ensemble** = couple débit/crédit ; une colonne avec des
positifs **et** des négatifs = montant signé ; une colonne texte à deux valeurs = colonne de sens ;
`(487,00)` = négatif (**parenthèses comptables à ajouter au parseur**).
Ordre de résolution : **solde → signes → en-têtes → convention**.
À défaut de preuve : le récapitulatif montre **3 lignes réelles** (« 04/08 · PRLV EDF → dépense 399,94 € »)
et **un bouton « ⇄ les montants sont inversés »** corrige tout d'un coup.

**②.5 · Le solde certifie la lecture.** `solde(n) − solde(n−1) = crédit − débit` sur toutes les lignes →
prouve d'un coup : bonnes colonnes, aucune ligne oubliée, aucune ligne parasite, montants bien lus, sens
non inversé. **Informe, ne bloque pas** ; en cas d'écart, **montre la ligne où ça décroche**.
Didier : « normalement ce cas ne doit pas se produire » → traité comme une **anomalie**, pas un avertissement
de confort.

**I-2 · Libellé intégral.** CSV lu caractère par caractère (un `\n` entre guillemets ne termine pas
l'enregistrement — bug actuel : le fichier est découpé en lignes **avant** interprétation des guillemets).
Libellé stocké = texte complet, retours à la ligne remplacés par une espace. **Aucune troncature nulle part :
n'importe quel mot ou référence doit pouvoir servir de motif de règle.** L'empreinte anti-doublon se calcule
sur l'enregistrement reconstitué.

---

## ③ Le récapitulatif de lecture ✅ (mockup `import-recap.html`)

**③.1 · Dans le bandeau fichier existant**, sur une deuxième ligne, replié :
`✔ Solde vérifié sur 142 lignes · date d'opération · feuille « Compte courant » · 3 lignes écartées · détail de la lecture ▾`
Aucun écran ni clic supplémentaire. Le détail déplie : feuille retenue et pourquoi les autres sont écartées,
date retenue, orientation des montants et ce qui l'a prouvée, période, motif des lignes écartées, les 3
premières lignes telles qu'elles seront importées, bouton d'inversion.
En cas d'anomalie : la ligne passe en orange et **le détail s'ouvre tout seul**.

**③.2 · Montants** — parenthèses comptables à gérer · lignes à 0 € ignorées (inchangé) · devise autre que
l'euro → ligne **écartée et signalée** plutôt qu'importée à un montant faux · stockage au centime.

**③.3 v2 · Dates aberrantes : on IMPORTE et on MARQUE.** Une date invalide ou éloignée de plus de 12 mois
de la période du fichier n'est pas écartée : la ligne atterrit dans **« À compléter »** avec un badge
`⚠ date douteuse`. **Corollaire :** le compteur « N lignes écartées » devient **cliquable** — il liste les
lignes non retenues avec leur motif et permet de les réintégrer (aujourd'hui elles disparaissent sans trace).

**③.4** Position : dans l'écran de revue existant, ne s'intercale nulle part.
**③.5** Actions correctives : `⟳ Changer de fichier` (existant) + `⇄ Les montants sont inversés` (nouveau).

---

## ④ Le compte bancaire ✅

**④.1 · Bailleur OBLIGATOIRE sur le compte.** Un compte appartient toujours à quelqu'un : ce n'est pas un
filtre, c'est un fait. Débloque : la règle « bailleur du compte » (R-C) · les biens proposés découlent du
bailleur · un garde-fou devient possible (un mouvement du compte de la SCI X ne peut pas être affecté à un
bien d'une autre entité — rien ne l'empêche aujourd'hui).
Échappatoire explicite : **« compte mixte — plusieurs bailleurs »**, qui désactive la règle dynamique et
impose le classement manuel.

**④.2 · Reconnaissance du fichier.** OFX : `ACCTID` + `BANKID`, fiable (existant). **Excel : on cherche
l'IBAN ou le numéro de compte dans le préambule** — les lignes qu'on écarte de l'import servent à identifier
le compte. À défaut : on demande, dernier compte utilisé pré-sélectionné, et **on ne mémorise rien**.
⚠️ **Ne pas transposer le hash d'en-têtes du CSV** : il identifie un *format*, pas un compte — deux comptes
de la même banque produiraient le même identifiant (collision → pointeur faussé, doublons non détectés).

**④.3** L'écran de création de compte gagne le choix du bailleur. **④.5** « Mes comptes » affiche le bailleur.
**④.4** La barre de périmètre reste, bailleur **affiché en dur** (vient du compte), avec un **affinage
optionnel par immeuble**.

---

## ⑤ La période importée ✅

**⑤.1 · Le compte mémorise les 10 dernières empreintes** au lieu d'une seule ; on coupe après la plus
récente retrouvée. Une seule suffit pour rester déterministe — un chevauchement partiel, une ligne
disparue ou un libellé retouché ne cassent plus la reprise.

**⑤.2 · Import rétroactif accepté et annoncé.** Quand la date la plus récente du fichier est antérieure au
pointeur : bandeau « 📅 Import rétroactif — ce fichier couvre janv→juin, antérieur à ton dernier import du
31/08. Toutes les lignes sont proposées, les doublons déjà en base sont détectés. »
**🐛 BUG À CORRIGER (trouvé en séance)** : `_bankComputeLastImport` recalcule le pointeur comme la date max
des lignes importées et **écrase** l'ancien → importer juin **fait reculer** le pointeur de fin août à fin
juin, et l'import suivant repropose juillet-août. **Le pointeur ne recule jamais** : on garde la date la
plus récente entre l'ancien et le nouveau.

**⑤.3** Le premier import garde ses 3 choix (date / tout / sélection manuelle) — au premier import l'app ne
peut pas deviner, et depuis ⑤.2 le choix est moins engageant.

*Existant conservé : gestion des fichiers chronologiques croissants **et** décroissants (correctif 13/07,
Crédit Agricole) · message « ✓ Tout est déjà importé » · reset pointeur depuis Mes comptes.*

---

## ⑥ Les doublons ✅ (mockup `doublons.html`)

**⑥.1 · Le FITID devient la stratégie n° 1 en OFX.** C'est l'identifiant unique de transaction fourni par
la banque, plus fiable que toute empreinte calculée. Il tranche **avant** l'empreinte et **dans les deux
sens** (identique = doublon certain ; différent = pas un doublon). Aujourd'hui il n'est consulté qu'en
second rang, contre les seuls mouvements sans empreinte → une banque qui **réémet un relevé avec un libellé
retouché** (« en cours » → « définitif ») passe pour du nouveau. L'empreinte reste la stratégie principale
pour Excel, qui n'a pas d'identifiant de transaction.

**⑥.2 · Certains écartés en silence, probables à trancher.**
- **Doublons certains** (même empreinte, même FITID) → écartés automatiquement, **repliés en une ligne de
  résumé** (« 🚫 2 doublons écartés — aucun doute · voir le détail ▾ »). Zéro clic.
- **Doublons probables** (date ±3 j + montant ±1 €, ou somme des parts du jour) → **« à décider »** :
  ni exclus ni inclus, carte de comparaison complète, et **l'import reste bloqué tant qu'il en reste un
  non tranché** (même logique que le garde-fou existant sur les « Reconnus »).
Cas qui motive la décision : deux loyers de 850 € à deux jours d'écart, **deux locataires différents** —
aujourd'hui écarté par défaut, donc un vrai loyer disparaît sans que rien ne le signale.

*Existant conservé : les 3 stratégies de détection (dont « relevé déjà importé puis découpé = somme des
parts du jour ») · la carte de comparaison en vis-à-vis · « ✓ Confirmer le doublon » / « Importer quand
même » · l'annulation d'une décision.*

---

## ⑦ Le classement — règles & propositions ✅ (mockups `creer-regle.html`, `liste-vs-tableau.html`)

### Le modèle, en trois phrases

> **L'app propose. Tu valides. Si tu veux que ce soit automatique, tu en fais une règle.**

**R-A v2 · AUCUNE RÈGLE LIVRÉE.** La liste des règles **démarre vide** et ne contient que ce que
l'utilisateur a créé. Une mise à jour de l'app ne peut **jamais** créer, modifier ou supprimer une règle :
les règles sont les données de l'utilisateur, pas celles de l'app.
**Les 12 mots-clés ne deviennent donc PAS des règles** — ils restent le moteur de **propositions** (✨),
qui n'applique jamais rien seul.

**R-B v2 · Trois états.** **Règle** (créée par l'utilisateur) → automatique, onglet **Reconnus** ·
**Proposition** (✨) → reste dans **À compléter** même complète · **Non détecté** → à classer.
⚠️ Correction nécessaire : `_bankLineDone` fait aujourd'hui basculer en « Reconnus » toute ligne dont
catégorie + bien sont remplis, **y compris par une proposition** — c'est du classement automatique déguisé.

### ⑦.1 · Ce qu'une règle sait dire — 3 critères

**Motif** (le libellé contient ce texte, insensible casse/accents) · **Sens** (dépense / recette / les deux,
**nouveau**) · **Compte** (optionnel, existant).
Le sens règle un vrai bug : une règle « EDF » attrape aujourd'hui le prélèvement **et** le remboursement de
trop-perçu, et classe le remboursement en charge.
Écarté pour l'instant : la fourchette de montant (« entre 380 et 420 € ») — un montant qui change casse la
règle en silence. À reconsidérer seulement si un cas réel le réclame.

### ⑦.2 v2 · Quand plusieurs règles correspondent

Comment ça arrive : motifs emboîtés (« EDF » puis « EDF CLIENTS PARTICULIERS ») · motif générique trop
large (« VIR ») · deux motifs sans rapport dans le même libellé · **et le cas légitime** : une règle donne
la catégorie, une autre le bien (« SYNDIC » → *Charges de copropriété* + « LES TILLEULS » → *immeuble
Ferrette*).

- **Règles complémentaires** (champs différents) → **on applique les deux**, avec l'origine de chaque champ
  affichée : `⚙ catégorie : règle « SYNDIC » · bien : règle « LES TILLEULS »`.
- **Règles en conflit** (même champ, valeurs différentes) → **aucun automatisme** : la ligne reste dans
  « À compléter », marquée `⚠ 2 règles possibles`, **les candidates affichées avec leur résultat**, tu choisis.
- Deux règles aboutissant à la même valeur ne sont pas un conflit.
- **Les flèches ↑↓ disparaissent** : plus d'ordre à maintenir.

### ⑦.3 · Une règle se corrige là où on la rencontre

Depuis la ligne d'import : **choisir** celle qui s'applique · **modifier** (motif, sens, cible) ·
**supprimer** celle qui est fausse ou trop large.
**Après modification ou suppression, les autres lignes de l'import se reclassent immédiatement** — sinon on
corrigerait dix fois la même chose.

### ⑦.4 · Créer une règle — un écran avec aperçu en direct (mockup `creer-regle.html`)

Aujourd'hui : un `prompt()` du navigateur où l'on tape un motif **à l'aveugle**, sans voir ce qu'il attrape,
sans pouvoir choisir le compte ni le sens.
Cible : un écran qui affiche, **mis à jour à chaque frappe** :
- les **lignes de l'import en cours** qui correspondent ;
- le **nombre de mouvements déjà en base** concernés ;
- une **alerte** si le motif est trop court (< 4 caractères) ou attrape des lignes de natures différentes.
Démonstration du mockup : `EDF CLIENTS PARTICULIERS` → 2 lignes · 17 en base ✔ · `VIR` → **5 lignes de
natures différentes et 142 mouvements en base** ⚠. C'est précisément ce que le `prompt()` ne peut pas dire.
**Repris de l'existant** : le bouton « 💾 Mémoriser la règle », le motif pré-rempli, le critère compte, le
picker de catégorie, l'affectation à 4 niveaux (`_AFF_NIV` = log / imm / sci / **recup**, index.html:4252),
et le principe « la catégorie propose le niveau, tu peux changer ».
**Nouveau** : l'aperçu en direct, le critère de sens, les alertes, l'affectation « bailleur du compte ».

### ⑦.5 · Le match locataire — 5 corrections

**a · Frontière de mot** : le nom est cherché comme **mot entier**, plus comme sous-chaîne (fin de « Marc »
qui matche `SUPERMARCHE`).
**b · Tous les baux évalués** : si plusieurs lots correspondent (deux locataires au même loyer, mot de nom
commun), **proposition ambiguë** avec les candidats affichés — jamais de gagnant arbitraire par ordre des clés.
**c · Le dû comparé est celui du MOIS du relevé** (`duMois`), plus le loyer d'aujourd'hui.
**d · Les baux clôturés redeviennent candidats**, mention « ancien locataire », pour reconnaître un arriéré
versé après le départ (aujourd'hui ce versement ne matche plus rien).
**e · Le montant n'est plus un critère mais un indicateur** : le nom suffit à proposer, le montant gradue la
confiance et **l'écart s'affiche** (« montant 680 € · dû du mois 850 € »). Fin du seuil ±5 € qui
disqualifiait les paiements partiels, rattrapages et avances. Un montant seul ne propose que s'il n'y a
**qu'un** lot dont le dû corresponde.

### ⑦.6 · Pas de sélection multiple, pas de tableau éditable

La **liste + la fenêtre** restent l'unique outil de classement. La fenêtre est conservée telle quelle : elle
porte la **navigation séquentielle** (« Vérifier 3 / 11 » + progression + pastilles), le titre adaptatif, le
bandeau de confiance, l'**éditeur d'affectation contextuel** et le **découpage ✂️**.
Écartés après examen : le tableau éditable (perdrait l'affectation contextuelle, rendrait le niveau
« Récupérable » inaccessible, tronquerait les libellés) et la **sélection multiple** (« trop dangereux » —
on classerait sans regarder). Le staging de mouvements de la page « Import » disparaît **sans rien laisser**.
**Le levier de volume, c'est la règle** : une fois « EDF » mémorisé, les lignes se classent seules,
y compris dans l'import en cours (⑦.3).

### ⑦.7 · Où se gèrent les règles — deux accès, une seule liste

- **Onglet Réglages** : la liste complète, conservée.
- **Page Loyers & Mouvements** : création et modification au moment où la règle sert, y compris pendant un import.
**Création à froid possible** dans les deux cas, sans partir d'une ligne. L'**aperçu en direct fonctionne
sans import** : il s'appuie alors sur les mouvements déjà enregistrés (« ce motif correspond à 17 mouvements
existants »). Pendant un import, il montre les deux.
Ajouté à la liste existante : le **sens** et une colonne **« utilisée »** (« 23 mouvements classés ·
dernière fois le 12/08 ») pour repérer une règle obsolète ou trop large. Retiré : les flèches ↑↓.
Les deux accès utilisent les **mêmes outils que la saisie d'un mouvement** — on ne réinvente aucun sélecteur.

### Note — niveau « Récupérable » (chantier séparé)

Deux modes de répartition : **vers un compteur de charges** (les compteurs collectifs existent, avec leurs
5 clés : tantièmes, surface, sous-compteurs, proportionnel, forfait) ; **à défaut → division égale par le
nombre de lots** de l'immeuble. **À approfondir dans un chantier dédié** (demande Didier) — vérifier
notamment si la clé « proportionnel » existante recouvre déjà cette division par lots.

## ⑧ Revue & validation de l'import ✅ (mockup `reconnus.html`)

**Existant conservé, à ne pas casser** : les 3 onglets avec compteurs · le message qui prévient qu'une ligne
complétée change d'onglet · le **garde-fou en cascade** (index.html:49940) qui bloque la validation tant
qu'il reste des lignes à compléter, puis tant que les « Reconnus » n'ont pas été parcourus · l'exclusion
réversible avec compteur · la navigation séquentielle dans la fenêtre · la confirmation avant import ·
la trace au journal d'audit · la mise à jour du pointeur · le rafraîchissement de la liste.

**⑧.1 · Ce qui bloque la validation.**
Bloquent : une **ligne non classée** (existant) · un **doublon probable non tranché** (nouveau, cf ⑥.2 —
aujourd'hui les doublons sont hors du flux donc ne bloquent rien) · une **règle en conflit** non arbitrée
(couvert : la ligne reste dans « À compléter »).
Ne bloque pas : une **date douteuse** — elle reste signalée par son badge, et **la date devient modifiable**.

**⑧.1b · TOUT est modifiable sur un mouvement, y compris la date** (demande Didier : il déplace la date
d'un loyer payé le 30 du mois précédent). Aucun champ verrouillé, depuis l'import comme depuis la page
Mouvements.
**La date d'origine du relevé est conservée** avec un marqueur `date modifiée · relevé : 30/08` et un retour
possible — sinon un écart avec le relevé devient inexplicable six mois plus tard.
*À vérifier au smoke : avec la cascade + le netting décidés côté Finances, déplacer la date ne devrait plus
être nécessaire (un loyer de septembre payé le 30/08 devient une avance qui couvre septembre). Si ce n'est
pas le cas, c'est un bug à corriger, pas une date à corriger à la main.*

**⑧.2 · L'onglet « Reconnus » reste en LISTE PLATE**, avec son garde-fou de défilement (décision Didier ;
le groupement par règle a été mocké puis écarté).
La détection d'une règle trop large est portée ailleurs : la colonne **« utilisée »** de la liste des règles
(⑦.7) et l'**aperçu à la création** (⑦.4).

**⑧.3 · Le récapitulatif après import passe en LANGAGE TRÉSORERIE.**
« 138 mouvements importés · + 16 900 € encaissés · − 6 337 € de charges · cash-flow + 10 563 € · 4 lignes
non affectées à un bien ». L'impact fiscal reste accessible, **replié**.
Motif : le récap actuel (`_bankImportRecap`) est structuré par lignes 2044, ce qui contredit **X-1**
(l'app est agnostique du régime fiscal — en SCI la 2044 n'est pas le bon formulaire).

## ⑨ Design de l'onglet Mouvements ✅ (mockups `page-mouvements.html`, `filtres.html`, `mobile-mouvements.html`)

**⑨.1 · Colonnes : 9 → 7.** Deux fusions :
- **Immeuble + Qui → « Affectation »**, avec l'**icône du niveau** (`⌂` logement · `▤` immeuble · `🏛` SCI ·
  `⚡` compteur). Motif : aujourd'hui deux colonnes disent la même chose à deux niveaux et il faut deviner
  laquelle est remplie — pire, elles se répètent (`Ferrette · … · Ferrette · 001`).
- **Débit + Crédit → « Montant » signé**, en s'appuyant sur le code couleur validé côté Finances
  (rouge = sort, vert = entre).
Colonnes finales : **Date · Libellé · Catégorie · Affectation · Montant · Fact. · actions**.

**⑨.2 · UN SEUL badge dans la liste : `⚠ à classer` / `⚠ non affecté`**, affiché **dans la colonne
concernée** (catégorie ou affectation) — là où l'information manque.
Écarté après discussion : les badges de provenance sur chaque ligne (« trop de badges, on fait une app
simple »). Le raisonnement retenu : **la liste montre ce qui demande une action ; le reste s'explique au
clic ou se filtre**.
- `🏦 compte` et `✋ saisi` → deviennent des **filtres** (⑨.4), pas des badges répétés 140 fois ;
- `⚙ règle`, `✂️ découpage`, `📅 date modifiée` → dans le **bloc Provenance de la fiche** (⑩).

**⑨.3 · Totaux : Crédits · Débits · Lignes affichées. Le « Solde » est SUPPRIMÉ.**
Motif Didier : « on mélange des choux et des carottes » — additionner un dépôt de garantie, un loyer, du
capital de prêt et des charges récupérables en transit ne produit rien d'interprétable.
Ce qui reste est assumé comme une **somme de contrôle** : elle sert à **réconcilier avec le relevé**
(un relevé additionne lui aussi tout ce qui entre et tout ce qui sort) et à vérifier un filtre homogène
(« Travaux 2026 »). Aucun indicateur de gestion ici — Finances reste maître des KPI (R-3).

**⑨.4 · Filtres : ON NE DÉPLACE RIEN.**
Examiné puis **écarté** : rassembler tous les filtres dans une barre unique. Constat de Didier, exact —
« c'est juste déplacer le filtre », et mon comptage de clics était biaisé (6 contre 6 à la loyale).
Onglets, menus dans les en-têtes, recherche et dates **restent où ils sont**.
**Seul ajout : la ligne des filtres actifs**, sous la barre du haut :
`± Dépenses ✕   🏷 Travaux ✕   🏠 Freyming ✕      3 lignes sur 15 · tout effacer`
Motif : aujourd'hui, une fois filtré, le seul indice est deux en-têtes qui passent en bleu — on voit
3 lignes sur 15 sans savoir pourquoi. Plus les **deux filtres manquants** : `compte` et `état (à classer)`,
à la mécanique des menus existants.

**⑨.5 · Mobile : le rendu existant est CONSERVÉ** (`css/main.css:2494`, v15.145 MOBILE-AUDIT — la table
devient des cartes empilées en CSS pur : liseré bleu, date en petit, libellé en titre, ligne méta, montant
positionné à droite).
Adaptations validées sur mockup :
- la méta passe sur **deux lignes** (catégorie, puis affectation en gras) — plus aucune troncature ;
- le nom de catégorie est **coupé avant la parenthèse** (`Charges récupérables (eau, énergie…)` →
  `Charges récupérables`) : le complément est une aide à la saisie, inutile dans une liste ;
- le **libellé reste tronqué sur une ligne** (60 à 200 caractères, illisible en entier sur 390 px),
  complet au clic.
⚠️ **Ce CSS positionne les cellules par `nth-child`** : passer de 9 à 7 colonnes le casse.
**À reprendre dans le même lot que ⑨.1, jamais séparément.**

## ⑩ Les post-clics du tableau ✅ (mockups `mouvement-provenance.html`, `ventilation.html`)

**⑩.1 · ✏ Fiche (`openEditMv` → `ov-mv`) — le formulaire ne change pas.**
Champs conservés à l'identique : Date * · Catégorie * (picker) · Libellé * · Affectation (4 niveaux) ·
Débit (charge) € / Crédit (recette) € · ⚡ Compteur collectif lié · N° Facture (+ bouton 🔢 Auto).
**Seul ajout : le bloc « 🧾 Provenance »** en tête, qui reçoit tout ce qui a été retiré de la liste (⑨.2) :
- origine (import + compte / saisi à la main / découpage) et **date d'import** ;
- **la règle qui a classé**, avec le lien *modifier la règle* ;
- pour une part de découpage : **la ligne d'origine et les mouvements liés**, avec *↩ défaire le découpage* ;
- **la date du relevé si elle a été modifiée**, avec *revenir à la date du relevé* et la mention de l'effet
  sur la réconciliation bancaire.
Le bloc **se réduit à 3 lignes** pour un mouvement saisi à la main : il ne pèse que sur ceux qui ont une histoire.

**⑩.2 · ✂️ Ventilation (`openSplitMvList`) — l'écran est conservé, il est solide.**
Existant à ne pas casser : sens par part en boutons colorés · libellé · montant · suppression de part (bloquée
à 2 minimum) · **picker de catégorie ET zone d'affectation par part** · **contrôle d'équilibre en temps réel**
(« Net réparti · reste ✅ équilibré / net bancaire ») avec **bouton de confirmation désactivé tant que ça ne
boucle pas** (tolérance 0,005 €) · **3 pré-remplissages** (relevé de gérance = 1 crédit par loyer + frais en
débit · par logements · manuel) avec leurs bandeaux d'aide · **le même écran sert à l'import et au tableau**.
Vérifié aussi : changer la catégorie d'une part **re-dérive le sens** (recette→crédit) **et le niveau
d'affectation**, puis vide l'affectation pour repartir propre (`_spMvOnCat`).

**Ajouts validés :**
- **une DATE par part**, pré-remplie à celle du virement, modifiable, avec un marqueur `📅 ≠ virement`.
  Motif : un relevé de gérance d'août peut contenir le loyer de juillet d'un locataire en retard — aujourd'hui
  les parts héritent toutes de la date du virement, donc ce loyer est compté en août et le suivi devient faux ;
- **un N° de facture par part** (les frais de gestion sont une facture) ;
- **le lien de groupe** entre les parts (cf ⑩.1) ;
- **mobile** : les grilles de chaque part passent **en colonne** sous 768 px (sens + croix, libellé, montant,
  catégorie, affectation, date + facture), et le **bandeau d'équilibre reste collé en bas** — c'est lui qui
  débloque le bouton.

**⑩.3 · 🗑 Suppression — RIEN À CHANGER.** Confirmation, **tombstone** (pour que la synchro entre appareils
ne fasse pas réapparaître le mouvement), **annulation possible** (`_undoOp`), trace au journal d'audit.

---

## Récapitulatif

### Ce qui DISPARAÎT

| Élément | Décision |
|---|---|
| Le lecteur **CSV** | ①.1 — format ambigu, source de tous les bugs de lecture |
| Le **staging de mouvements** de la page « Import » | les mouvements passent uniquement par l'import bancaire |
| Le `prompt()` de création de règle | ⑦.4 — remplacé par un écran avec aperçu en direct |
| Les **flèches ↑↓** de la liste des règles | ⑦.2 — plus d'ordre à maintenir |
| Le **« Solde »** du bandeau de totaux | ⑨.3 — mélangeait DG, capital de prêt et charges en transit |
| Les colonnes **Immeuble** et **Qui** séparées | ⑨.1 — fusionnées en « Affectation » |
| Les colonnes **Débit** et **Crédit** séparées | ⑨.1 — fusionnées en « Montant » signé |
| Le récap post-import **par lignes 2044** | ⑧.3 — passe en langage trésorerie |

### Ce qui S'AJOUTE

Lecture **Excel natif** · détection des colonnes **par le contenu** · **contrôle par le solde** ·
**bandeau de lecture** (feuille, date retenue, lignes écartées) · **bailleur obligatoire** sur le compte ·
**10 empreintes** de reprise · **FITID en priorité** pour les doublons · **doublons probables à trancher** ·
critère de **sens** sur les règles · **aperçu en direct** à la création d'une règle · affectation
**« bailleur du compte »** · **ligne des filtres actifs** · **bloc Provenance** dans la fiche ·
**date et n° de facture par part** de ventilation.

### Bugs identifiés, à corriger indépendamment des choix de conception

1. **Libellé tronqué à 200 caractères** à la création du mouvement (index.html:50082) — contredit I-2.
2. **Le pointeur de reprise recule** après un import rétroactif (⑤.2).
3. **Le moteur de propositions existe en double** (module + réplique inline).
4. **`includes` sans frontière de mot** dans le match locataire (« Marc » matche `SUPERMARCHE`).
5. **Le premier bail qui matche gagne** — deux lots au même loyer → affectation au hasard de l'ordre des clés.
6. **Le loyer attendu est celui d'aujourd'hui**, pas celui du mois du relevé.
7. **Les baux clôturés sont exclus** → un arriéré versé après le départ ne matche plus rien.
8. **La restriction de compte d'une règle tombe** si le compte est inconnu.
9. **Le CSS mobile repose sur `nth-child`** → la fusion des colonnes (⑨.1) le casse si on ne le reprend pas
   dans le même lot.
10. **`_bankLineDone`** fait passer en « Reconnus » une ligne classée par une simple proposition (R-B v2).

### Ordre de chantier suggéré

1. **Lecture des fichiers** : OFX + Excel, retrait du CSV, détection par le contenu, contrôle par le solde,
   libellé intégral (bugs 1 et 3). Rien d'autre ne peut être juste avant.
2. **Compte & reprise** : bailleur obligatoire, identifiant Excel, 10 empreintes, pointeur qui n'recule pas (bug 2).
3. **Doublons** : FITID en priorité, probables à trancher.
4. **Règles** : critère de sens, conflit vs complémentaire, écran de création avec aperçu, reclassement immédiat.
5. **Propositions** : les 5 corrections du match locataire (bugs 4 à 7).
6. **Revue** : garde-fous, « Reconnus » = règles uniquement (bug 10), récap trésorerie.
7. **Tableau** : colonnes fusionnées **+ mobile dans le même lot** (bug 9), badge unique, totaux, filtres actifs.
8. **Post-clics** : bloc Provenance, date et facture par part, mobile de la ventilation.

**Gate de sortie** : audit par `superpowers:code-reviewer`, et smoke sur les 3 formats avec un vrai relevé OFX
et un vrai fichier Excel.

---

## Reste à traiter

**La revue est terminée — 10 sections passées.**

Chantiers séparés, hors périmètre :

| Sujet | Note |
|---|---|
| **Répartition des charges récupérables** (compteurs collectifs, 5 clés existantes + division par lots à défaut) | demandé par Didier : « on devra travailler sur ce point plus tard » |
| **Import en masse de biens et logements** (page « Import ») | « à retravailler » |
| **Réconciliation bancaire** comme fonction à part entière | évoqué en ⑨.3, plus ambitieux qu'un bandeau de totaux |

**Bugs identifiés à corriger, indépendamment des décisions :**
- le pointeur qui recule après un import rétroactif (⑤.2) ;
- le moteur de propositions **écrit en double** (module + réplique dans index.html) ;
- `includes` sans frontière de mot dans le match locataire (« Marc » matche `SUPERMARCHE`) ;
- le premier bail qui matche gagne (deux lots au même loyer → affectation au hasard) ;
- le loyer attendu pris **au tarif d'aujourd'hui** au lieu du barème du mois ;
- les baux clôturés exclus → un arriéré versé après le départ ne matche plus rien ;
- la restriction de compte d'une règle **tombe** si le compte est inconnu.
