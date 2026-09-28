# CDC — Avenant au bail : refonte (temps 2)

**Statut** : figé le 28/09/2026. Maquette validée (`mockups/AVENANT-REFONTE/MAQUETTE.html`, fichier local). Décisions A à D prises dans le chat.
**Origine** : incident du 27/09 (départ d'un colocataire : pas de signature, document sur 2 à 4 pages, bail non modifié, historique vide). Audit : `mockups/AVENANT-AUDIT/RAPPORT.md`. Le temps 1 (correctifs immédiats) est déployé en v15.681.
**Complète** `docs/subjects/AVENANT-BAIL.md` (CDC d'origine : 12 objets, rédaction, garde-fous du loyer), qui reste valable pour tout ce que ce document ne modifie pas.

---

## §0 — Intention

Un avenant doit faire trois choses :
- **Produire un acte juste** : une page, signable par chaque partie, qui nomme les personnes concernées, garants compris.
- **Mettre à jour les données du bail** une fois signé, et les dater à sa date d'effet.
- **Se retrouver ensuite** : liste, statut, PDF signé, historique.

Le PDF du bail signé ne change **jamais**. L'avenant le modifie juridiquement, et l'app affiche le bail « tel qu'il s'applique » (bail signé + avenants signés).

## §1 — Décisions validées (28/09)

| | Décision |
|---|---|
| **A · Stockage** | Les avenants, leurs signatures, la composition datée et le rattachement des garants vivent **à côté du bail**, dans une table dédiée du cloud. La ligne du bail signé est verrouillée : ce qu'on y écrit est aujourd'hui perdu au rechargement (`store-sync.js:295`, trigger migration 0014). La table suit le patron de `baux_evenements` (migration 0017, créée pour cela et jamais branchée), avec en plus `legacy_raw`, `bailDebut` (plusieurs baux successifs partagent le même identifiant de bail par logement) et la RLS par entité (partage SCI). |
| **B · Application** | Un avenant **ne s'applique qu'une fois signé par toutes les parties**. Ses changements sont **datés à la date d'effet** écrite dans l'avenant, qui peut précéder la signature (départ au 30/09 signé le 05/10). Les mois déjà quittancés restent protégés (clamp existant `_baremeClampDateEffet`). Avant la signature, aucune donnée du bail ne change. ⚠ Ceci change le comportement v15.681, où loyer et charges s'appliquent dès l'enregistrement. |
| **C · Signature** | Lot 1 : **sur cet appareil** et **sur papier** (dépôt du scan ou « Je l'ai déjà »). La signature **à distance** vient ensuite, quand l'envoi du code par e-mail sera débloqué (domaine propryo.fr, même blocage que le bail). |
| **D · Couples** | La situation des locataires (**colocataires / époux / partenaires de PACS**) est demandée **à la création du bail**, parce qu'elle change la clause 9 bis. Pour un bail existant, elle est demandée au premier avenant qui touche la composition, et elle est stockée hors de la ligne verrouillée (§1 A). |

## §2 — Textes applicables (verbatim Légifrance, relevés le 28/09/2026)

**Loi n° 89-462, art. 8-1 I** (en vigueur depuis le 01/07/2021) : « La colocation est définie comme la location d'un même logement par plusieurs locataires, constituant leur résidence principale, et formalisée par la conclusion d'un contrat unique ou de plusieurs contrats entre les locataires et le bailleur, à l'exception de la location consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat. »

**Art. 8-1 VI** : « La solidarité d'un des colocataires et celle de la personne qui s'est portée caution pour lui prennent fin à la date d'effet du congé régulièrement délivré et lorsqu'un nouveau colocataire figure au bail. A défaut, elles s'éteignent au plus tard à l'expiration d'un délai de six mois après la date d'effet du congé.
L'acte de cautionnement des obligations d'un ou de plusieurs colocataires résultant de la conclusion d'un contrat de bail d'une colocation identifie nécessairement, sous peine de nullité, le colocataire pour lequel l'extinction de la solidarité met fin à l'engagement de la caution. »

**Code civil, art. 1751, al. 1** (en vigueur depuis le 27/03/2014) : « Le droit au bail du local, sans caractère professionnel ou commercial, qui sert effectivement à l'habitation de deux époux, quel que soit leur régime matrimonial et nonobstant toute convention contraire et même si le bail a été conclu avant le mariage, ou de deux partenaires liés par un pacte civil de solidarité, dès lors que les partenaires en font la demande conjointement, est réputé appartenir à l'un et à l'autre des époux ou partenaires liés par un pacte civil de solidarité. »

**Code civil, art. 220, al. 1** : « Chacun des époux a pouvoir pour passer seul les contrats qui ont pour objet l'entretien du ménage ou l'éducation des enfants : toute dette ainsi contractée par l'un oblige l'autre solidairement. »

**Code civil, art. 515-4, al. 2** : « Les partenaires sont tenus solidairement à l'égard des tiers des dettes contractées par l'un d'eux pour les besoins de la vie courante. […] »

Conséquences retenues :
- La règle des 6 mois et la fin de solidarité de la caution ne s'appliquent qu'à une **colocation**.
- Pour des époux ou partenaires de PACS au bail dès l'origine, l'app **n'écrit pas** cette règle.
- Le départ d'un époux ou partenaire relève d'une autre situation (séparation, divorce : art. 1751 al. 2). L'app ne rédige pas cet acte : elle le signale et n'applique rien.

## §3 — Clause 9 bis du bail (existant : `index.html:21922` et `:25533`)

**Aujourd'hui** : la variante « colocation » (6 mois) est écrite dès qu'il y a 2 locataires ou plus (`locs.length >= 2`). Couples mariés ou pacsés compris, donc à tort au regard de l'art. 8-1 I. Elle ne mentionne pas non plus la fin de l'engagement de la caution du sortant.

**À faire** :
- 3 variantes pilotées par la situation (§1 D) :
  - colocataires : texte actuel, complété par la caution du sortant (art. 8-1 VI al. 1) ;
  - époux ;
  - partenaires de PACS : cotitularité seulement sur demande conjointe (art. 1751).
- La variante « locataire seul » reste inchangée.
- **La rédaction exacte des variantes époux et PACS est soumise à Didier avant le code** (règle : ne pas inventer de clause).
- Les baux déjà signés ne sont **pas** régénérés.

## §4 — Garants

- **Aujourd'hui** : champs `garant`/`garant2` (2 au maximum) sans lien avec un locataire (`index.html:20366-20380`). L'acte de cautionnement liste tous les locataires (`_cautionnementBlock` 52046).
- **À faire** :
  - chaque garant est **rattaché à un colocataire** (obligatoire à peine de nullité, art. 8-1 VI al. 2) — y compris une caution qui garantit **tous** les colocataires : l'acte désigne alors LE colocataire dont le départ met fin à son engagement (service-public F34661 : « Soit une caution s'engage pour l'ensemble des colocataires. L'acte de cautionnement doit indiquer le colocataire dont le départ du logement mettra fin à l'engagement de la caution. »). Modèle : `garant.colocataireDesigne` (un seul), `garant.portee` = « ce colocataire » | « tous les colocataires » ;
  - 🔴 **défaut actuel** : l'acte généré (`_cautionnementBlock`) liste « Locataire(s) : A, B » sans désignation → nul en colocation ; priorité du lot 4 ;
  - saisie à la création du bail, et rattachement demandé au premier avenant pour un bail existant ;
  - l'acte de cautionnement nomme le colocataire garanti.
- **Avenant, départ** : la caution du sortant est reprise automatiquement, nommée dans l'article, et son engagement prend fin avec la solidarité du sortant.
- **Avenant, remplacement ou ajout** : saisie de l'entrant **et de sa caution**. L'acte de cautionnement est généré aux bons noms (entrant + nouvelle caution) et signé avec l'avenant.
- **Objet caution** : ajout, remplacement ou mainlevée, rattachés à un colocataire, avec mise à jour des garants à la signature.

## §5 — Mise à jour du bail, objet par objet (à la signature, datée à l'effet)

| Objet | Donnée mise à jour |
|---|---|
| Colocataire | Composition : sortie datée + fin de solidarité (date d'effet du congé + 6 mois, ou date d'entrée d'un nouveau colocataire) ; entrant avec sa date d'entrée |
| Garant / caution | Garants rattachés (§4) |
| Loyer, charges | Barème daté + `log.hc/ch` (mécanisme actuel, déplacé au moment de la signature) |
| Forfait de charges | Mode de charges daté, **lu par la régularisation** (reprendre `bailForfaitActifLe`, codé sur la branche `claude/admiring-galileo-1fb6e1` mais jamais mergé) |
| Annexe / dépendance | Désignation du bien loué ; supplément de loyer au barème |
| Durée | Date de fin du bail (échéances, préavis, alertes) |
| Paiement / RIB | Jour de paiement, IBAN du bailleur |
| Destination | Usage du logement |
| Correction | Le champ corrigé, choisi dans une liste des champs du bail (plus de texte libre) |
| Travaux, sous-location, clause libre | Aucune donnée : l'avenant est la preuve de l'accord |

**Bloc « Bail en cours »** : affiche les valeurs en vigueur à la date du jour, en indiquant l'avenant qui les a modifiées (« Charges 95,00 € · avenant n° 1 »).

## §6 — Composition datée : écrans et documents à brancher

La fonction pure `presents(date)` / `solidaires(date)` est la **source unique** : aucun écran ne lit plus la liste brute des locataires pour savoir qui est au bail. Consommateurs recensés par l'audit du 28/09 :
- quittances : `_creerQuittance` 29620, `_buildQuittanceHtml` 29748 ;
- e-mails : 29079, 29540, 29565, 29915 ;
- relances : 30978 (présents, plus le sortant et sa caution pour les dettes antérieures à la fin de solidarité) ;
- lettre IRL : 31707, 31997 ;
- régularisation : `clipBail` 28141, `_ccLogOccupations` 40741 ;
- EDL : 33220 ;
- congé et assistant de départ : 25408, 27723-27923 (le départ d'un colocataire n'est **pas** la fin du bail) ;
- dépôt de garantie : 53941, `_departState` 27617 (pas de restitution partielle) ;
- acte de cautionnement : 52046 ;
- `log.locataire` : 20656, 36942 ;
- historique : `bail-historique.js` ;
- tableau de bord : 13147, 13371 ;
- 2044 : `legal-bilan.js` 392 ;
- rapprochement bancaire : `bank-import.js` 1026 (sortants = payeurs possibles sur leur période) ;
- RGPD : `rgpd.js` 10.

**« Modifier le bail »** (`saveBail` 20461) : sur un bail signé, retirer ou ajouter un locataire renvoie vers l'avenant. Plus de disparition sans date, plus de remise à zéro des signatures. À vérifier au passage : le faux positif « composition modifiée » dû aux champs garants disparus du DOM (`v('b-garant')`, 20529).

## §7 — Document (moteur PDF partagé `doc-native`)

Défauts mesurés avec le jsPDF réel de l'app sous Node : 2 locataires → 2 pages, 3 → 3 pages.

**Corrections dans `__tests__/helpers/doc-native.js`**, miroir régénéré par `tools/sync-helpers-global-mirrors.mjs` :
- **D1-D3** : hauteur réelle du cadre de signature calculée avant de dessiner ; tous les cadres d'une zone sur la même page ; plus de `maxY` mélangé entre deux pages.
- **D4** : pas de page créée pour le seul pied.
- **D5** : `h3` reconnu, gardé avec son paragraphe.
- **D6** : « Fait à » + zone de signature gardés ensemble.
- **D7** : `pro-kv` rendu en clé/valeur.
- **Pagination** « page x / y » optionnelle (troisième paramètre de `_docHtmlToNativeBlob`, activé pour l'avenant seulement, pour ne pas changer l'aspect des quittances). Paraphes seulement si l'avenant fait plus d'une page.

**Avenant** (`buildAvenantHtml`) :
- parties en blocs (`docParties`), plus de tableau `pro-kv` qui répète le titre ;
- une seule mention de non-novation ;
- « Fait le » = **date de signature**, et non plus la date d'effet ;
- `docLieu` + `docSignzone` jusqu'à 3 cadres sur une ligne, grille au-delà ;
- images de signature à l'intérieur des cadres une fois signé.

La signature enregistrée du bailleur (`ent.signature`) n'est **jamais** apposée seule sur un avenant : chaque partie signe l'acte.

**Tests** : harnais Node (jsPDF décodé depuis `index.html:40-42`) qui compte les pages, pour 1, 2 et 3 locataires, et place un cadre de signature au ras du bas de page.

**Impact** : quittances, décompte, lettre IRL, relances, reçus, congés. Même moteur ; les corrections ne changent que les cas qui cassaient déjà.

## §8 — Signature (réutilisation, zéro recopie)

- **Choix par signataire** : même fenêtre que le bail (`ov-send-b`, `_bsdModeSeg`). Signataires bailleur résolus par `BailSignataires.resolveBailleurSigners` (gérant, co-gérants, mandataire, « représenté par »). Parties : bailleur, colocataires restants, sortant, entrant ; la caution signe son acte de cautionnement.
- **Sur cet appareil** : capture sur canevas (logique `_edlInitSig`/`_edlGetSig` à **factoriser**, pas recopier) → images injectées dans `docSignzone({sig,label})` → PDF `DocNative` → empreinte `_sha256Hex` → certificat (`_buildBailCertificatePdf` paramétré avec le libellé du document) + fusion `_mergeCertificateIntoBail` → envoi au cloud `_uploadCloudRetry`.
- **Sur papier** : dépôt du scan comme pièce jointe `parentType:'bail'` (prévu par `js/core/attachments.js:26`, jamais affiché), ou « Je l'ai déjà » (règle de la mémoire : jamais forcer le dépôt).
- **À distance (plus tard)** : relais réutilisé tel quel. Il faudra que `DocNative` émette les ancres des cadres (`BuildSignManifest`), rendre génériques les textes « bail » du relais, et découpler le suivi et la clôture de `DB.baux[ref].signatures.remoteSession`.

## §9 — Écrans (maquette validée)

- **Onglet Bail de la fiche logement** (`_renderLogFichePanelBail`) : blocs **Occupants**, **Garants** et **Avenants** (patron `.logf-doc-card`, statuts Brouillon / À signer / Signé / Annulé) entre « Bail en cours » et l'historique. Carte d'historique « Avenant » avec pied `hl-foot` (Revoir, PDF signé, Faire signer).
- **Onglet Documents** : avenants signés ajoutés.
- **Création (PC et tablette)** : 2 colonnes formulaire / aperçu, comme `#ov-avenant`, avec :
  - le sortant choisi dans la liste des locataires ;
  - la date d'effet du congé et la fin de solidarité calculée ;
  - la caution concernée nommée ;
  - un encadré « Ce que l'enregistrement change » ;
  - un seul bouton corail : « Enregistrer et faire signer ».
- **Téléphone (M-16)** : 4 pages plein écran (objets → champs → aperçu → signatures), pied collant, cibles ≥ 44 px, champs ≥ 16 px. `openBailMenu` devient aussi une page sur téléphone.
- **Statuts** : Brouillon (rien d'appliqué, modifiable, supprimable) → À signer (enregistré, figé) → Signé (appliqué) · Annulé (conservé, barré, plus appliqué ; possible seulement avant l'application ou par un nouvel avenant).

## §10 — Lots (1 lot = 1 branche = 1 version, audit code-reviewer avant « prêt à tester », GO Didier avant déploiement)

1. **Moteur PDF** (§7) : utile à tous les documents. Harnais de pages.
2. **Stockage + liste + statuts** (§1 A, §9) : migration 0054 (`node scripts/db-run.mjs migrate`, jamais `db push`), collection synchronisée, reprise des `bail.avenants[]` et événements `avenant` existants, bloc Avenants et historique.
3. **Signature sur l'appareil + papier** (§8) et application à la signature (§1 B, §5 loyer/charges/durée/paiement/destination/annexe/correction).
4. **Situation des locataires + garants rattachés + clause 9 bis** (§1 D, §3, §4) : textes des variantes époux et PACS validés par Didier avant le code.
5. **Composition datée** (§6) : le plus gros lot, consommateur par consommateur.
6. **Signature à distance** (§8) : quand le domaine propryo.fr sera actif.

Dépendance externe : le correctif « clôture puis relocation d'un bail signé verrouillé », en cours dans une session séparée, touche le même verrou cloud que le lot 2 → vérifier l'état de ce chantier avant de commencer le lot 2.
