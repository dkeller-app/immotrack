# BAIL-EN-COURS-SIGNE-HORS-PROPRYO : bail signé hors Propryo, EDL fait hors Propryo, session de signature expirée

**Statut** : 🧭 Conception (aucun code écrit) · **Prio** : P1 · **Branche** : `feat/bail-en-cours` · **Date** : 2026-10-06
**Origine** : RETOURS-2026-10-05 §C2 (bail/EDL externes) et §C4 (session expirée). Les maquettes validées sont dans `mockups/BAIL-EN-COURS/captures/` : `bail-hors-*`, `edl-docs-ajout-*`, `edl-docs-resultat-*`, `signature-expiree-actions-*`, `signature-expiree-confirm-*`.
**Lié à** : AUDIT-BAIL-SIGNE-SESSION-EXPIREE-2026-07-15 · BAIL-SIGNE-MODIFS (journal `baux_evenements`, migrations 0054/0055) · AVENANT-REFONTE (« signé sur papier »).

> Les numéros de ligne renvoient à la copie de travail du 06/10. Ils ont bougé depuis RETOURS-2026-10-05 : par exemple, `saveBail` est maintenant en `app-part1.js:17445` et `_bailSigned` en `app-part1.js:18241`.

---

## 0. Ce que j'ai trouvé en lisant le code (à corriger dans ce chantier)

1. **Le correctif A3 du lot A ne marche pas sur de vraies données.** `_pilStatutDoc` (`app-part2.js:25977`) teste `e.type === 'entree' || !e.type`. Or `saveEDL` écrit `'Entrée'` / `'Sortie'` (`app-part2.js:7818`), et `store-mapping.js:162` n'accepte que ces deux valeurs. Résultat : un EDL d'entrée saisi dans Propryo n'est **jamais** reconnu. Seul le repli par nom de fichier fonctionne. Le test `__tests__/helpers/bail-en-cours-lot-a.test.js:58-59` passe parce qu'il fabrique `type:'entree'`, une valeur que l'app n'écrit jamais.
2. **Même erreur de casse dans l'onglet Documents du logement** (`app-part2.js:16125` et `16128`). Le test `e.type === 'sortie'` ne matche jamais, donc tout EDL s'affiche « Entrée ».
3. **Un bail signé par le bailleur seul ressort « signé » dans la matrice.** La signature en présence pose `signedAt` dès le mode `'bailleur-seul'` (`app-part1.js:21311` et `21419`). `_pilStatutDoc` (`25970`) ne regarde que `signedAt`, ce qui donne « OK ». Pourtant `bailSigneComplet` (`bail-modifications.js:16`), le scellement cloud (`store-sync.js:164`) et la fiche (`app-part2.js:17512-17514`) excluent ce mode.
4. **`__immoArchiveBailPdf` (`app-part1.js:3202-3208`) considère comme complet tout bail qui a `signedAt` et un mode différent de `'bailleur-seul'`.** Si on lui présente un bail « externe », il fabrique une preuve de signature en présence et un certificat. Ce serait une **fausse preuve électronique**, et il faut un garde.
5. **La clause de tacite reconduction des garages est déduite de `signedAt`** (`bail-echeance.js:71-87`, copie dans `js/helpers/bail-echeance.global.js:94-108`). Un garage déclaré « signé hors Propryo » après le 04/09/2026 se verrait attribuer la clause du contrat Propryo, qu'il ne contient pas.
6. **Le cloud refuse `parentType:'edl'` pour un document.** La contrainte `documents_parent_type_check` (migration 0040, l. 29-31) ne contient pas `'edl'`, alors que `js/core/attachments.js:26-29` l'autorise. Un document rattaché à un EDL deviendrait une ligne poison (erreur 23514 retentée en boucle). Il faut donc rattacher les pièces d'EDL au **logement**.

---

## 1. Modèle de données : « signé hors Propryo » sans fausse signature électronique

### 1.1 Décision : on garde `signedAt` comme critère « contrat conclu » et on ajoute un mode explicite

Environ 90 sites lisent `bail.signatures.signedAt`. Pour l'immense majorité, la question posée est « **le contrat est-il conclu ?** » : gel des termes, journal des modifications, diagnostics jugés à la conclusion, avenants, verrou cloud, renommage bloqué. Pour un bail signé sur papier, la bonne réponse est **oui**. Inventer un second critère obligerait à revoir ces 90 sites, avec un vrai risque d'oubli.

Seuls une dizaine de sites demandent en réalité « **Propryo détient-il une preuve électronique ?** » (PDF signé, certificat, preuve, relais, clause du contrat type). Ceux-là doivent tester le **mode**.

Forme cible de `bail.signatures` pour un bail signé hors Propryo :

```js
signatures: {
  format: 2,                       // FORMAT_SIGNATURES (bail-paraphes.js:40) : _appAJourPourSigner le lit
  mode: 'externe',                 // NOUVEAU : ni 'avec-locataire', ni 'distance', ni 'bailleur-seul'
  signatureSource: 'externe',      // posé AVANT le scellement : sealSignedBaux n'écrase que s'il est vide (store-sync.js:170)
  signedAt: 'AAAA-MM-JJT12:00:00.000Z',   // date saisie, midi UTC (même convention que sigBaseISO, app-part1.js:21302-21303)
  persistedAt: '<ISO instant>',    // instant technique (comme la signature en présence)
  externe: {                       // la DÉCLARATION, figée avec le reste de `signatures`
    date: 'AAAA-MM-JJ',
    origine: 'papier' | 'repris' | 'session-expiree',
    declareLe: '<ISO>', declarePar: '<nom affiché>'
  },
  bailSnapshot: { … }              // termes déclarés, capturés à la déclaration (même routine que _captureBailSnapshot, app-part2.js:8319)
}
```

Ce que l'objet ne contient **jamais** : `finales`, `paraphes`, `parapheImg`, `proof`, `contentHash` (empreinte du PDF), `certRef`, `cloudPdfKey`, `remoteSession`, `signedBailleurAt`, `signedLocataireAt`. On ne fabrique aucune image de signature, aucune preuve, aucun certificat.

`contentHashTerms` et `locked` sont posés par `sealSignedBaux` au flush (§2). L'empreinte porte alors sur les **termes déclarés** (`bail-content-hash.js:37-62`), pas sur un document signé. Le libellé affiché doit le dire.

**Le PDF facultatif n'est PAS dans `signatures`** (voir §1.3).

### 1.2 Helper central (nouveau module pur `js/core/bail-signature-etat.js`, exposé par `js/main.js`)

```
etatSignatureBail(bail) → { etat: 'non' | 'partiel' | 'electronique' | 'externe', conclu: bool, date: 'AAAA-MM-JJ' | null }
  conclu = signedAt présent ET mode ≠ 'bailleur-seul'        (= bailSigneComplet, bail-modifications.js:16)
  externe = conclu ET mode === 'externe'
  electronique = conclu ET mode ≠ 'externe'                   ('avec-locataire', 'distance', legacy sans mode)
  partiel = signedAt ET mode === 'bailleur-seul'
preuveElectronique(bail) → etat === 'electronique'
declarerSignatureExterne(bail, { date, origine, now, auteur }) → nouvel objet `signatures` (pur)
retirerSignatureExterne(bail, { now, auteur, motif }) → { archive }   // entrée pour bail.signaturesAnnulees
```

`_bailSigned` (`app-part1.js:18241`) reste « `signedAt` présent ». Il sert au gel des annexes et des locaux privatifs, et c'est juste pour un bail externe. On ne le renomme pas.

### 1.3 Pièce jointe du bail externe : un document À CÔTÉ du bail

Dès le premier flush, la ligne du bail est verrouillée (§2). Une référence `signatures.externe.pjDocId` ajoutée ou remplacée après coup **ne serait jamais réécrite au cloud**. `cheminAutorise` (`bail-modifications.js:291-301`) n'accepte sous `signatures.` que `cloudPdfKey`, `proof`, `contentHash` et `certRef` (`ARTEFACTS_SIGNATURE`, l. 143). Le scan perdrait donc son lien au rechargement.

On reprend le modèle de l'avenant signé sur papier (`_avenantRattacherScan`, `app-part1.js:22995`) : un `DB.documents` créé par `_attachmentSaveForEntity` (`app-part1.js:11843`) avec :

```js
{ parentType:'bail', parentId:<ref nue>, parentRef:<ref nue>, logRef:<ref nue>, category:'bail',
  nature:'bail-signe-externe', bailSignedAt:<signatures.signedAt>, bailDebut:<bail.debut>,
  _espaceId:<bail._espaceId si présent> }   // routage du partage SCI, comme les entrées de journal
```

On le retrouve avec `_bailScanExterne(ref, bail)` : le document vivant le plus récent avec `nature='bail-signe-externe'`, la même ref, le même `bailSignedAt` et le même espace. Le lien passe par `signedAt`, exactement comme `journalDuBail` (`bail-modifications.js:337-347`). Ajouter, remplacer ou retirer le PDF ne touche jamais la ligne du bail. Côté cloud, `parentType:'bail'` est autorisé (0040) et son `parent_id` se résout par `parentRef` (`store-mapping.js:110`). `category:'bail'` le tient hors de la section « Documents libres » (filtrée sur `'documents'`, `app-part2.js:16196-16204`).

### 1.4 Recensement des consommateurs de « signé »

**A. « Contrat conclu » : un bail externe est signé, aucun changement de logique**

| Site | Effet pour un bail externe |
|---|---|
| `bail-modifications.js:16` `bailSigneComplet`, `:337` `journalDuBail`, `:365` `reappliquerJournalBaux` | Les modifications sont journalisées et réappliquées comme pour tout bail signé |
| `app-part1.js:17691-17718` (journal de `saveBail`) | Idem |
| `store-sync.js:156-173` `sealSignedBaux`, `:357` `_identifierBaux`, `:466` `_journaliserVerrouilles` | Scellement et journal automatique (voir §2) |
| `store-mapping.js:132-153` | `signature_source='externe'`, `locked` |
| `app-part1.js:16088-16089` (`b-irlMois` figé), `:18054`, `:18062`, `:18074` (mois et clause IRL figés), `contrat-type.js:55` | Termes gelés à la déclaration. La version de clause conservée est celle du bail **tel que saisi**, puisque Propryo n'a rien imprimé |
| `app-part1.js:17439` / `diagnostics.js:324` (pas de contrôle DDT), `app-part2.js:14632` / `diagnostics.js:336` (`_ddtDateBailEnPlace`) | Les diagnostics sont jugés à la **vraie** date de signature : c'est exactement l'effet attendu du lot A6 |
| `app-part1.js:17295` (Visale) | Plus d'alerte de visa expiré |
| `avenant-registre.js:73`, `app-part1.js:22512` (date du bail dans l'avenant), `:22825` | Un avenant reste possible sur un bail externe |
| `rename-logement.js:18`, `normalisation-loyers.js:38` et `:70` | Le bail est protégé comme un bail signé (le nom d'affichage B3 couvre le besoin de renommer) |
| `app-part2.js:8676`, `:8909`, `:8933`, `:22446` (migrations « ne pas toucher un signé ») | Bail intouchable |
| `bail-historique.js:99` | `signe:true` (mention « hors Propryo » possible) |
| `app-part3.js:1003` (synchro entre onglets) | Inchangé |
| `app-part1.js:18780-18782`, `:20039-20043`, `:23874`, `:23987` (`_bailSigned`) | Inchangé |

**B. « Preuve électronique » : à adapter (le bail externe n'en a pas)**

| Site | Changement |
|---|---|
| `app-part1.js:3202-3208` `__immoArchiveBailPdf` | `if (mode==='externe') return;` dès l'entrée. Ne jamais fabriquer preuve, certificat ou `cloudPdfKey` |
| `app-part1.js:4777-4783` `_regenBailCertificate` / `_buildBailCertificatePdf` | Refus explicite pour un bail externe (pas de preuve) |
| `app-part1.js:5283` `openRemoteSignModal` | Refuse déjà (`signedAt` et mode ≠ `'bailleur-seul'`) : message à adapter, « Bail déclaré signé hors Propryo » |
| `app-part1.js:17908` `openBailSignatureFlow` | Passe par la fonction ci-dessus, donc refus. Bouton « Signer le bail » masqué (`complet` vrai, `app-part2.js:17574` et `17579`) |
| `app-part1.js:4334` `_renderRemoteSignBadge` | Affiché seulement s'il y a une `remoteSession` : celle-ci est **archivée** à la déclaration (voir §3) |
| `app-part1.js:17937` `previewSignedBailRef`, `:17977` `previewBailRef` | Pour un bail externe : ouvrir le scan s'il existe. Sinon, aperçu avec le bandeau « Document établi par Propryo à partir de la saisie : le bail signé est l'exemplaire papier » (jamais « tel que signé ») |
| `app-part1.js:20664` `_BAIL_SIGNED` (réinjection des signatures dans le PDF) | Rien à réinjecter (pas de `finales`). À vérifier : le PDF généré ne doit porter aucune mention « signé électroniquement » |
| `bail-echeance.js:71-87` et `js/helpers/bail-echeance.global.js:94-108` | `_instantSignature` → `NaN` si `mode==='externe'` (constat 0.5) |
| `backup.js:125-126` | Rien (pas de `cloudPdfKey`). Ajouter le scan externe à la sauvegarde s'il a une `cloudKey` (comme les autres documents) |
| `app-part1.js:8284` `resetBailSignatures` | Pour un bail externe : libellé « Retirer “signé hors Propryo” » et même chemin que la décoche (§2.4) |

**C. Affichage**

| Site | Changement |
|---|---|
| `app-part2.js:25970` `_pilStatutDoc('bail')` | `etatSignatureBail` : `conclu` → `_ok` · `partiel` → `{statut:'partial', label:'Signature en cours'}` (corrige 0.3) · sinon la logique actuelle |
| `app-part1.js:7547-7575` (matrice, bail repris) | Inchangé : `_ok` sort « Réclamer le bail au vendeur » (`_PIL_MTX_ACT_REPRIS`, l. 7544) |
| `app-part2.js:17510-17519` (badge de la fiche) | `externe` → « ✓ Signé hors Propryo » |
| `app-part1.js:15648` (badge de rBaux) | Idem |
| `app-part2.js:16094-16116` (Documents › Bail) | Carte « Bail signé hors Propryo — <locataire> », méta « Signé le … · <nom du scan> · <taille> », « Ouvrir » (le scan) ou « Ajouter le PDF » (maquette `edl-docs-resultat`) |
| `app-part1.js:16573` `_bailRenderSignatureDateField` | Bail externe : le champ date **reste éditable** (§2.3). Électronique : inchangé (« 🔒 Signé le … ») |

---

## 2. Verrou cloud : transitions sans migration SQL

**Aucune migration n'est nécessaire.** La colonne `signature_source` accepte déjà `'externe'` (0015, `baux_signature_source_chk`). `baux_locked_provenance_chk` exige une provenance pour verrouiller, et `'externe'` la fournit. `baux_immotrack_hash_chk` ne concerne que `'immotrack'`. Enfin, 0014 et 0055 autorisent l'INSERT d'une ligne déjà verrouillée et l'archivage unique d'une ligne verrouillée. Le schéma a été pensé pour ce cas : le commentaire de 0014 dit « un signé importé entre déjà verrouillé ».

### 2.1 Non signé → signé hors Propryo (case cochée dans « Modifier le bail »)

1. **`saveBail`** (`app-part1.js:17445`). La case est lue comme une intention, **hors** de `CHAMPS_BAIL` : elle ne doit jamais entrer dans le journal ni dans `diffModificationsBail`. Une date vide est refusée avec un message ; le bouton « Prendre la date de début (JJ/MM/AAAA) » la remplit (question 3). Une date dans le futur demande une confirmation (`confirm2`), comme pour l'avenant (`app-part1.js:23017`).
2. Avant `DB.baux[ref] = bail` (`:17722`), on écrit `bail.signatures = declarerSignatureExterne(...)` **après** l'application des autres champs du formulaire. Le `bailSnapshot` capture donc les termes enregistrés dans ce même passage, et l'empreinte n'a pas à être recalculée plus tard. On pose aussi `dateSignaturePrevue = date`.
3. Une `remoteSession` éventuelle et une signature partielle (`'bailleur-seul'`) **ne sont pas écrasées en silence**. Elles sont copiées dans `bail.signaturesAnnulees` (§3) avec le motif `'remplace-par-externe'`.
4. `_stamp(bail)` puis `saveDB()` déclenchent le flush. `sealSignedBaux` calcule `contentHashTerms`, garde `signatureSource:'externe'` et pose `locked:true`. `archiveEnAttente` (`store-sync.js:131-141`) ne retient que le mode `'avec-locataire'`, donc le scellement est **immédiat**.
5. `store-mapping.js:150-151` produit `signature_source='externe'`, `content_hash=<hash>`, `locked=true`. La 1ʳᵉ transition (baseline non verrouillée) est un upsert accepté par le trigger (`old.locked=false`). Les flushs suivants ignorent la ligne (`store-sync.js:560`).
6. Le scan éventuel est déposé **après** l'enregistrement, comme `_avenantSignePapierOk` (`app-part1.js:23012-23033`). Le fichier est mis en attente pendant la saisie. Si le dépôt échoue, le bail reste déclaré signé et un message dit de déposer le PDF plus tard. Rien n'est bloqué.

### 2.2 Ce qui reste modifiable une fois la ligne verrouillée

- **Termes, locataires, garants** : par « Modifier le bail », journalisés dans `baux_evenements`, type `'modification'` (chemin existant, `app-part1.js:17691-17718`, migration 0054). Le texte de confirmation dit « bail signé hors Propryo le … » au lieu de « bail signé ».
- **Vie du bail** (départ, DG, IRL, apurement…) : journal automatique (`CHAMPS_VIE`, `bail-modifications.js:110-131`).
- **Scan** : ajouter, remplacer ou retirer à tout moment (document à part, §1.3).
- **Date de signature** : correction possible, traitée comme une re-déclaration (§2.3).
- **Jamais modifiable** : l'objet `signatures` lui-même (mode, `signedAt`, `externe`, `bailSnapshot`, empreinte).

### 2.3 Corriger la date d'un bail externe

Changer `signedAt`, c'est changer l'identité du bail signé (`memeBailSigne`, `bail-modifications.js:251`). On procède en une seule opération, après confirmation (« Corriger la date de signature : la déclaration précédente est archivée, une nouvelle est enregistrée ») :

- l'ancien objet `signatures` est archivé dans `bail.signaturesAnnulees` (motif `'externe-redate'`) ;
- un objet `signatures` **neuf** est produit, **sans** `contentHashTerms` ni `locked` (sinon `sealSignedBaux` garderait l'ancienne empreinte, `store-sync.js:169`).

Au flush, `_identifierBaux` (`store-sync.js:366-369`) voit une baseline verrouillée et un autre `signedAt`. C'est un **successeur** : il reçoit un `_bailUid` neuf, l'ancienne ligne est **archivée** en phase 0 (`:509-547`, migration 0055), et la nouvelle ligne est insérée verrouillée avec sa propre empreinte. Les entrées de journal de l'ancienne date restent rattachées à la ligne archivée. Comme leurs valeurs sont déjà dans le bail vivant, la nouvelle ligne les contient.

### 2.4 Décocher « Bail signé en dehors de Propryo »

Ce geste n'est possible que pour le mode `'externe'` : la case n'est pas affichée sur un bail signé électroniquement. Une confirmation est demandée (« Le bail redevient non signé. La déclaration est conservée dans l'historique (et au cloud). Le PDF déposé reste dans les documents »).

- `bail.signaturesAnnulees.push({ at, par, motif:'externe-retire', signatures:<copie> })`, puis `delete bail.signatures` (même geste que `resetBailSignatures`, `app-part1.js:8302`).
- Cloud : la baseline était verrouillée et le bail n'a plus de signature, c'est donc un successeur. L'ancienne ligne est archivée (elle reste intacte, c'est la trace de la déclaration). Le bail repart sur une ligne neuve, non verrouillée et modifiable.
- Le scan reste en place (`bailSignedAt` pointe vers l'ancienne déclaration). Une nouvelle déclaration propose de le réutiliser, ce qui le recopie dans un nouveau document : jamais de réécriture d'un document existant.
- Si l'on décoche avant le premier flush, rien n'a été verrouillé : la ligne est simplement réécrite.
- **Ordre dans `saveBail`** : la décoche est traitée **avant** la branche journal (comme `_resetSignaturesAfterSave`, `:17528-17549`). Les modifications faites dans le même enregistrement partent alors dans la nouvelle ligne, et non dans un journal rattaché à une déclaration retirée.

`signaturesAnnulees` est un champ de premier niveau du bail. `saveBail` reconstruit l'objet à partir du formulaire, donc on vérifie qu'il est bien conservé par le correctif générique `_preserverChampsExistants` (variante bail, `js/core/preserve-fields.js`). Il n'entre ni dans `bailLegalContent` (liste blanche), ni dans `CHAMPS_BAIL`, ni dans `CHAMPS_VIE`. Sur une ligne non verrouillée, il part au cloud dans `legacy_raw`. Après archivage, la ligne archivée garde l'objet `signatures` d'origine.

### 2.5 Bail repris (`typeContrat:'repris'`)

Même case, même mécanisme, avec `origine:'repris'`. La date est celle de la signature du bail d'origine (vendeur et locataire), qui peut être antérieure de plusieurs années. Effets : la matrice passe de « Réclamer le bail au vendeur » à OK (`app-part1.js:7567-7571`). `garageContratAppReconductible` rend déjà `false` pour un bail repris (`bail-echeance.js:84`).

---

## 3. Signature à distance expirée : « Relancer », « Signé hors Propryo », « Annuler la session »

### 3.1 Où agir

Branche `expired` / `error` de `_renderRemoteSignBadge` (`app-part1.js:4391-4395`). Les trois boutons et la légende suivent la maquette `signature-expiree-actions`. Ils ne sont **pas** proposés sur `unreachable`, `access-lost`, `sent` ou `chaining` : l'état réel y est inconnu ou la session est vivante, et le bail est peut-être signé. Rappel : `expired` n'est posé que si le TTL du relais (14 jours) est dépassé (`:4515-4519`, `REMOTE_SIGN_TTL_MS` `:4015`).

### 3.2 Règle commune : contrôler l'état réel avant toute action

Pour les trois gestes, on fait d'abord le **même contrôle préalable** que « Relancer » (`openRemoteSignModal`, `app-part1.js:5295-5340`), factorisé en `_rsPreflight(ref)` :

| État réel au relais | « Annuler la session » / « Signé hors Propryo » |
|---|---|
| `completed` | **On n'annule rien** : on récupère la signature (`_completeRemoteSign`, `:4796`) et on le dit (« Ce bail a été signé à distance, signature récupérée ») |
| 404 → `expired` | Rien à perdre au relais : on continue |
| `pending` / `sent` / `chaining` (la session vivait encore) | Confirmation « le lien en cours sera invalidé », puis `_bsRelayDeleteSession` (`:4067`), puis on continue |
| relais injoignable, accès perdu, état inattendu | **Refus** (on ne touche à rien), comme aujourd'hui `:5300-5336` |

### 3.3 Sort d'une signature déjà recueillie (ex. le bailleur a signé, pas le locataire)

**Règle** : un bail n'est conclu que lorsque **toutes** les parties ont signé la **même** version. Une signature partielle n'a aucun effet juridique seule, et ne peut pas resservir pour une version qui peut avoir changé depuis. Annuler la session la **retire de l'état courant**, mais elle est **conservée** en archive : rien n'est détruit de ce que Propryo détient.

Deux cas existent dans le code :
- **Bailleur signé dans l'app, locataire à distance** : `signatures.mode='bailleur-seul'` avec `finales`, `paraphes`, `signedBailleurAt`, `signedAt`, `bailSnapshot` et `remoteSession` (`app-part1.js:21311-21430` puis `:4453`). Cette signature n'est jamais scellée (`store-sync.js:164`), la ligne reste modifiable.
- **Signataire distant ayant signé au relais** : seul `remoteSession.signers[i].signedAt` est connu de l'app. Le PDF partiel tamponné vivait au relais et a disparu à l'expiration du TTL. L'app ne pouvait de toute façon pas le lire (le relais ne rend un résultat que pour une session `completed`). Annuler n'y change rien.

**État final après « Annuler la session »** :

```js
bail.signatures = undefined            // le bail est « non signé » partout ; le bouton « Signer le bail » revient
bail.signaturesAnnulees = [ …, {
  at: '<ISO>', par: '<nom>', motif: 'session-annulee',   // ou 'remplace-par-externe' depuis « Signé hors Propryo »
  etatRelais: 'expired' | 'pending-invalidee',
  resume: { envoyeeLe: rs.createdAt, signataires: [{ role, nom, signedAt }] },   // lisible sans fouiller l'objet
  signatures: <copie intégrale de l'ancien objet signatures, remoteSession comprise>
}]
```

- **Ligne cloud** : pas verrouillée (ni `'bailleur-seul'` ni session en attente ne sont scellés), donc la ligne est réécrite normalement, archive comprise, dans `legacy_raw`. **Pas d'entrée dans `baux_evenements`** : ce journal ne sert qu'aux lignes verrouillées (`journalDuBail` filtre `type==='modification'` sur un `signedAt`, `bail-modifications.js:344`). Une entrée `'autre'` sans `signedAt` serait rattachée à la ligne historique du logement (`store-sync.js:446`), pas forcément celle du bail courant. La trace va dans le bail lui-même et dans `_auditLog('update','bail',ref,'Session de signature à distance annulée')`.
- **Polling** : `_pollRemoteSignSessions` (`:4476-4497`) ne lit que `signatures.remoteSession`. Une session archivée n'est plus jamais interrogée.
- **« Relancer » après une annulation** : nouvelle session, tous les signataires signent à nouveau, le bailleur compris. C'est cohérent : une signature vaut pour un contenu donné.
- **Affichage** : « Historique du bail » peut lister les sessions annulées depuis `signaturesAnnulees` (aucune nouvelle collection). C'est facultatif dans ce lot.

**« Signé hors Propryo » depuis la session expirée** : même contrôle préalable, puis la petite fenêtre de déclaration (date, PDF facultatif, avec la même règle de date qu'au §2.1). Ensuite on archive `remoteSession` et l'éventuelle signature partielle (motif `'remplace-par-externe'`) et on applique `declarerSignatureExterne` avec `origine:'session-expiree'`. Le §2.1 s'applique pour le verrou.

---

## 4. EDL fait hors Propryo

### 4.1 Décision de stockage : une entrée `DB.edl` marquée `externe`, plus un document rattaché au logement

```js
// DB.edl
{ id: nid(), type: 'Entrée' | 'Sortie',        // casse RÉELLE de saveEDL (app-part2.js:7818)
  date: 'AAAA-MM-JJ', logement: <ref>, locataire: <noms du bail en cours, figés>,
  externe: { declareLe: '<ISO>', declarePar: '<nom>', pjDocId: <id document> | null },
  pieces: [], signatures: {},                   // AUCUN signedAt : on ne simule pas une signature
  _modifiedAt, _espaceId? }
// DB.documents (si PDF/photo)
{ parentType: 'logement', parentId: log.id, parentRef: ref, logRef: ref, category: 'edl',
  nature: 'edl-externe', edlId: <id EDL> }
```

**Pourquoi `DB.edl` et pas un simple document ?** Les lecteurs d'EDL qui comptent le trouvent ainsi **sans code spécifique** :
- l'assistant de départ (`_departState`, `app-part1.js:26044-26062` : étape « EDL de sortie » faite) ;
- le délai de restitution du DG (`_calculerDelaiRestitution`, `gestion-dg-impayes.js:88-112` et `app-part2.js:300-319`, via `edlSortieQuiFaitFoi`, `edl-parcours.js:193`) ;
- `_edlsDuBail` (`app-part1.js:26005`) et la date d'entrée de la grille de vétusté (`_dgVgEntreeDate`, `app-part2.js:26108`) ;
- l'Accueil, via `_computeUnifiedTodo` et les étapes de départ.

Le PDF est **facultatif** (maquette) : un document sans fichier n'aurait pas de sens, alors qu'un EDL sans pièce jointe en a un.

**Cloud** : table `edl`, `type_edl` et `date_edl` renseignés, `pieces=[]`, `signed_at=null`. Pas de verrou (l'EDL n'est pas scellé, `store-sync.js:89-92`). Le marqueur `externe` voyage dans `legacy_raw`. **Aucune migration.** Le document est rattaché au **logement** (`parentType:'logement'`), parce que `'edl'` est refusé par le CHECK cloud (constat 0.6).

### 4.2 Lecteurs à adapter

| Site | Changement |
|---|---|
| `app-part2.js:25974-25981` `_pilStatutDoc('edl')` | Remplacer le test par `_edlEntreeDuBail(bail, log)` : `type==='Entrée'`, même logement, non supprimé, date dans `[bail.debut − 31 j, début du bail suivant[` (un EDL sans date reste candidat, comme dans `edlSortieQuiFaitFoi`). L'EDL d'entrée du **locataire précédent** ne compte plus. **Supprimer le repli par nom de fichier** (`/\bedl\b|etat des lieux/`) : l'EDL externe le remplace. Corriger le test du lot A (`'entree'` → `'Entrée'`). |
| `app-part2.js:16118-16149` (Documents › États des lieux) | Formulaire « Ajouter un EDL fait en dehors de Propryo » (sens, date, pièce jointe, Annuler / Enregistrer l'EDL), puis la carte « EDL d'entrée — fait hors Propryo » avec Ouvrir (le PDF) et Supprimer (maquettes `edl-docs-*`). Corriger `'sortie'` → `'Sortie'` (constat 0.2). « Ouvrir » sert le PDF via `_handleAttachmentOpen(pjDocId)`, pas `openEditEDL`. |
| `app-part2.js:3985-4022` `rEDLList` (onglet États des lieux) | Ligne visible (question 2) avec le badge « Hors Propryo » à la place de « Brouillon » (sinon `:4005-4006` affiche « Brouillon »). Actions : Ouvrir le PDF, Supprimer. **Pas** de Modifier/Reprendre, Voir l'EDL, Photos ni PDF généré. |
| `openEditEDL` (`:4106`), `edlOpenView`, `downloadEDLPdfNative`, `edlOpenGallery`, `_edlListMore` (`:4030`) | Garde en tête : EDL externe → ouvrir le PDF ou « EDL fait hors Propryo : pas de saisie ». |
| `app-part2.js:4650-4652` `edlLoadRef` (reprendre l'entrée dans une sortie) | Ignorer les EDL externes (aucune pièce à reprendre) ; s'il n'y a que celui-là, message « EDL d'entrée fait hors Propryo : saisie à partir du modèle ». |
| `app-part2.js:4072` détection de doublon | On la garde : un EDL externe et un EDL Propryo au même logement, même sens et même date, c'est un vrai doublon à signaler. |
| `app-part2.js:16235` `_collectCompteurReleves`, `:30986` (compteur) | Rien (pas de relevés). |
| `edl-conflit.js:201`, `rename-logement.js:22` | Rien : un EDL externe n'est pas « signé » au sens électronique, il ne verrouille pas la référence du logement. |

### 4.3 Sens entrée/sortie et restitution du DG

Pour un EDL de sortie externe, il n'y a pas de pièces, donc pas de dégradation détectable. `_calculerDelaiRestitution` rend donc **1 mois**, ou **2 mois** si `bail.dgRetenu > 0` (`gestion-dg-impayes.js:91`). C'est le comportement actuel « sans EDL comparable », et c'est le délai le plus court, donc le plus prudent pour le bailleur face à la pénalité de l'art. 22. **Pas de nouveau champ.** Les retenues se saisissent dans l'assistant de départ, comme aujourd'hui.

### 4.4 Suppression, pièce jointe, synchronisation

- **Supprimer** passe par `delEDL` (`app-part2.js:8008`) : tombstone, `_undoOp`, `saveDB({quoi:'edl'})`. On ajoute, **dans le même** `_undoOp`, le tombstone des métadonnées du document (`_deleted`, `_modifiedAt`), **sans** `_attachmentDelete`. Celui-ci purge le cache IndexedDB (`app-part1.js:11905-11921`), ce qui casserait l'annulation sur l'appareil. Le fichier stocké au cloud reste (politique « preuve légale », même endroit).
- **Remplacer le PDF** : nouveau document, puis tombstone de l'ancien, comme `_avenantRattacherScan`.
- **Ordre** : l'EDL est enregistré d'abord, le PDF ensuite. Un échec du dépôt laisse l'EDL sans PDF, avec un message.
- **Hors ligne** : l'écriture n'est **pas** marquée `quoi:'edl'`. Le garde hors ligne (`app-part1.js:2652`) la refuse et l'utilisateur le voit. Seule la saisie terrain d'un EDL Propryo est autorisée hors ligne, et elle ne remonte que des EDL, sans documents.
- **Partage SCI** : poser `_espaceId` du logement ou du bail sur l'EDL et sur le document. `saveEDL` documente la perte de ce marqueur quand on remplace un objet (`store-sync.js:236-254`).

---

## 5. Plan de code, tests, vérification, risques

### 5.1 Étapes (1 étape = 1 commit, version incrémentée, BACKLOG mis à jour à chaque livraison)

1. **Socle pur et corrections de lecture.** Créer `js/core/bail-signature-etat.js` et l'exposer dans `js/main.js`. Brancher `_pilStatutDoc` (bail : constat 0.3 ; EDL : `_edlEntreeDuBail` et casse `'Entrée'`, constat 0.1 ; retrait du repli par nom). Corriger la casse dans Documents (0.2). Ajouter les gardes « preuve électronique » : `__immoArchiveBailPdf`, `_regenBailCertificate`, `bail-echeance` (module et copie globale). Aucune UI nouvelle.
2. **« Modifier le bail » : case et date.** Case sous `b-dateSign-fg` (`index.html:1886-1897` ; HTML de la coquille modifié avec accord, puis `node tools/stamp-app-parts.mjs`). Brancher `saveBail` (déclaration, décoche, re-déclaration, ordre §2.4), `_bailRenderSignatureDateField`, badges (fiche, rBaux), carte Documents › Bail, aperçus, `resetBailSignatures`.
3. **PDF du bail externe.** Fichier mis en attente dans la modale, dépôt après l'enregistrement, `_bailScanExterne`, Remplacer / Retirer, ajout plus tard depuis la fiche et depuis Documents.
4. **Session expirée.** `_rsPreflight` factorisé (utilisé aussi par Relancer), boutons « Signé hors Propryo » et « Annuler la session », fenêtre de confirmation (maquette), `signaturesAnnulees`, audit.
5. **EDL externe.** Formulaire dans Documents, enregistrement `DB.edl`, document du logement, lecteurs du §4.2, suppression et annulation.
6. **Finitions.** Historique du bail (sessions annulées et déclaration externe), tests de bout en bout et vérification navigateur.

### 5.2 Tests Vitest

- `__tests__/helpers/bail-signature-etat.test.js` : `etatSignatureBail` pour non / partiel / électronique (`avec-locataire`, `distance`, ancien format sans mode) / externe. `declarerSignatureExterne` : `signedAt` à midi UTC, `signatureSource:'externe'`, `format:2`, **aucun** `proof`, `finales` ni `cloudPdfKey`, bail repris, date invalide refusée. `retirerSignatureExterne` : archive complète. Annulation de session : résultat attendu pour chaque état du relais (`completed` → récupérer, 404 → archiver, `pending` → confirmer puis supprimer, indéterminé → refuser).
- `store-sync.test.js` (faux magasin existant) : un bail externe est scellé avec `signatureSource` **conservé** à `'externe'` et `locked`. La décoche donne un successeur, l'ancienne ligne archivée en phase 0 et un upsert non verrouillé. La re-datation donne un archivage puis une nouvelle ligne verrouillée avec une empreinte **recalculée**. Une modification après déclaration produit une entrée de journal automatique.
- `store-mapping.test.js` : ligne `baux` externe (`signature_source='externe'`, `locked=true`, `content_hash` non nul). Document `parentType:'bail'` (résolution de `parent_id`). Document du logement `category:'edl'`. EDL externe (`type_edl`, `pieces=[]`, `signed_at=null`).
- `bail-modifications.test.js` : journal et réapplication sur un bail externe ; `cheminAutorise` refuse toujours `signatures.externe`.
- Test de `bail-echeance` : garage externe postérieur au 04/09/2026 → `false` (module **et** copie globale).
- `bail-en-cours-lot-a.test.js` corrigé : EDL `'Entrée'` → ok ; EDL du locataire précédent → absent ; EDL externe → ok ; bail en `'bailleur-seul'` → partiel ; bail externe → ok, y compris un bail repris dans la matrice.
- `edl-parcours.test.js` : `edlSortieQuiFaitFoi` retient une sortie externe. Délai de restitution : sortie externe → 1 mois ; avec `dgRetenu` → 2 mois.
- `__immoArchiveBailPdf` et `_regenBailCertificate` (extraits par vm, comme le lot A) : rien n'est produit pour un bail externe.
- Facultatif, **avec l'accord de Didier** (écrit dans la base hébergée) : `supabase/tests/` sur le modèle de `bail-signe-cloture.test.mjs`. INSERT d'une ligne externe verrouillée accepté, UPDATE refusé, archivage accepté.

### 5.3 Vérification dans le navigateur (PC 1280, tablette 768, téléphone 390, en clair et en sombre)

1. Bail non signé → Modifier → cocher, date, PDF → Enregistrer. Vérifier : badge « Signé hors Propryo », matrice OK, carte Documents, bouton « Signer le bail » absent. Recharger, puis ouvrir sur un 2ᵉ appareil : état identique et ligne cloud verrouillée (`signature_source='externe'`).
2. Sur ce bail : changer les charges. Le journal s'affiche, et l'état est intact après rechargement.
3. Ajouter, remplacer puis retirer le PDF plus tard. Vérifier après rechargement.
4. Corriger la date de signature, puis décocher. Après chaque étape : rechargement, badge et matrice corrects, aucune erreur de synchronisation (indicateur de sync, console).
5. Bail repris : « Réclamer le bail au vendeur » disparaît après la case.
6. Session expirée (simulée sur un bail de test) : « Annuler la session » (fenêtre, « non signé », archive présente) ; « Signé hors Propryo » ; « Relancer » inchangé. Une session en réalité `completed` doit être **récupérée**, pas annulée.
7. EDL externe entrée puis sortie : Documents, onglet États des lieux, matrice, assistant de départ (étape EDL faite), délai du DG. Supprimer puis annuler la suppression.
8. Coupure réseau : le formulaire d'EDL externe est refusé avec un message.
9. Mobile : zones tactiles d'au moins 44 px, texte des champs d'au moins 16 px, pas de défilement horizontal, couleurs uniquement en variables CSS (les badges actuels ont des hex codés en dur ; ne pas en ajouter).

### 5.4 Risques

- **Verrou irréversible** : une case cochée par erreur puis synchronisée laisse une ligne archivée au cloud. C'est voulu (trace), mais la décoche doit être claire et confirmée.
- **Empreinte périmée** : si la re-datation ne vide pas `contentHashTerms`, la ligne reçoit une empreinte fausse, définitivement. Ce cas est couvert par un test dédié.
- **Lien du PDF par `signedAt`** : une re-datation sépare l'ancien scan. Il faut le proposer à la réutilisation (§2.4).
- **Fausse preuve** : un oubli dans la liste B (§1.4) peut produire un « certificat » sur un bail papier. Les deux points d'entrée ont un garde et un test.
- **Lecteurs d'EDL** : une cinquantaine de sites lisent `DB.edl`. Ceux qui ouvrent l'éditeur ou produisent un PDF ont besoin du garde `externe`. Les autres sont sans effet (pas de pièces, de relevés ni de signatures).
- **Partage SCI** : `_espaceId` doit être posé sur les documents et sur l'EDL externe, sinon le routage part vers le mauvais espace.
- **Le lot A est déjà livré avec le test `'entree'`** : la matrice affiche aujourd'hui « Faire l'EDL » à tort sur les EDL saisis dans Propryo, jusqu'à l'étape 1.

---

## 6. Questions ouvertes pour Didier

1. **Annuler une session alors que le bailleur avait déjà signé dans l'app** : sa signature est archivée (pas effacée) et il devra signer de nouveau lors d'une relance. **Recommandation : oui.** Une signature vaut pour une version précise du bail, et la relance repart d'un document à jour signé par tous.
2. **EDL externe visible aussi dans l'onglet « États des lieux »**, avec le badge « Hors Propryo » et sans édition. **Recommandation : oui.** Sinon l'onglet affiche « Aucun état des lieux » pendant que la matrice dit OK.
3. **Bail repris dont on ignore la date de signature** : la date est obligatoire, mais un clic « prendre la date de début » la remplit, avec la mention « date approximative » (`externe.dateApprox:true`). **Recommandation : oui.** Jamais de blocage, et jamais une date inventée en silence.

## Journal
- 2026-10-06 : conception rédigée (lecture du code : app-part1/2/3, store-sync, store-mapping, bail-modifications, bail-content-hash, migrations 0014-0017, 0040, 0054, 0055, attachments, edl-parcours, gestion-dg-impayes, bail-echeance). Aucun code modifié. Trois défauts existants relevés au passage (§0) : casse des types d'EDL (le correctif A3 est inopérant), bail `'bailleur-seul'` vu comme signé dans la matrice, CHECK cloud qui refuse `parentType:'edl'`.
