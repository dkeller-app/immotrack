# Contre-audit indépendant : « Signé hors Propryo » (étapes 1 à 6)

**Périmètre** : `git diff cb10241 HEAD` sur `feat/bail-en-cours` (commits 365a18a → f237500). **Référence** : `docs/subjects/BAIL-EN-COURS-SIGNE-HORS-PROPRYO.md`. **Date** : 2026-10-06.
**Méthode** : lecture du diff et de tous les sites appelés (saveBail, store-sync, store-mapping, preserve-fields, attachments, relais, lecteurs de `DB.edl`), puis exécution des tests dans une copie `git archive` (255 fichiers et 6 322 tests verts au départ), puis 8 mutations ciblées.

## Verdict global : **À CORRIGER**

Le socle est sain. Il n'y a pas de fausse preuve par les chemins directs. Le verrou cloud et l'archivage se comportent comme prévu, l'annulation de session passe bien par le contrôle préalable, et les tests rougissent sur les points critiques.
Il reste **un trou bloquant** : on peut déclarer « signé hors Propryo » depuis « Modifier le bail » alors qu'une signature à distance est **vivante**, sans aucun contrôle au relais. S'y ajoutent **deux défauts à corriger** :
- une déclaration effacée en silence quand la composition du bail change ;
- un PDF partiellement signé qui peut se retrouver rattaché à un bail externe.

---

## Findings

### 🔴 1. Déclaration « signé hors Propryo » sur un bail dont la signature à distance est vivante : aucun contrôle au relais, lien laissé actif, signature électronique perdue

- **Où** :
  - `js/app/app-part1.js:16742` : la case est affichée dans tous les cas sauf `electronique`, donc aussi avec une `remoteSession` en `sent`, `chaining`, `unreachable` ou `access-lost`.
  - `16926-16968` (`_bailExterneIntention`) : l'état `non` ou `partiel` avec la case cochée donne `declarer`.
  - `16970-16988` (`_bailExterneAppliquer`) : la `remoteSession` est archivée (`remplace-par-externe`).
  - `16906` : la purge du relais n'a lieu que si l'on vient de `sessionExpireeSigneHors` (`window._bailExtPurge`).
  - `4484-4491` : `_pollRemoteSignSessions` ne lit que `signatures.remoteSession`. La session archivée n'est donc **plus jamais interrogée**.
- **Scénario A (signature réelle perdue)** :
  1. Le locataire signe le lien à 10 h 00.
  2. Le poll passe toutes les 30 s et n'a pas encore vu la signature. L'état local est `sent`, la case est visible.
  3. Le bailleur coche « Bail signé en dehors de Propryo » et enregistre.
  4. Le bail devient `externe`, puis il est scellé et verrouillé au cloud.
  5. La session `completed` du relais (PDF signé, preuve, certificat) n'est jamais récupérée et disparaît à l'expiration de la durée de vie. C'est exactement ce que `_rsPreflight` existe pour empêcher (« completed → récupérer »). Ici, il est contourné.
- **Scénario B (lien laissé actif)** :
  1. Le bailleur fait signer le papier et déclare le bail externe pendant que la session est `sent`.
  2. Le lien envoyé au locataire reste valide.
  3. Le locataire signe électroniquement plus tard, et personne ne le voit.
  4. Le locataire croit avoir signé un bail dans Propryo. Propryo dit « signé sur papier le … ».
- Même trou pour `unreachable` et `access-lost` : la conception (§3.1) interdit d'agir dans ces états, parce que le bail est peut-être déjà signé.
- **Correctif** (sans bloquer : on redirige vers le geste qui contrôle) :
  - Dans `_bailRenderSignatureDateField`, quand `bail.signatures.remoteSession.sessionId` existe et que le formulaire n'a pas été ouvert par `sessionExpireeSigneHors`, masquer la case et afficher « Une signature à distance est en cours : utilise « Signé hors Propryo » sur la session ».
  - Proposer ce bouton aussi pour `sent` / `chaining`. `_rsPreflight` demande déjà la confirmation « le lien sera invalidé » et purge à l'enregistrement.
  - Dans `saveBail`, refuser par sécurité `declarer` si `existant.signatures.remoteSession.sessionId` est présent et que `window._bailExtEtatRelais` est vide.
  - Ajouter un test **comportemental** pour ce chemin.

### 🟠 2. Composition modifiée et déclaration dans le même enregistrement : la déclaration est appliquée, puis effacée

- **Où** :
  - `app-part1.js:17949-17954` : sur un bail `partiel` (`bailleur-seul`, `bailSnapshot` présent, non verrouillé), un changement de locataire ou de garant pose `_resetSignaturesAfterSave = true`.
  - `:18090` : `_bailExterneAppliquer` pose la déclaration.
  - `:18135-18137` : `if (_resetSignaturesAfterSave) delete DB.baux[ref].signatures`.
- **Scénario** :
  1. Session expirée, bailleur signé dans l'app. On clique « Signé hors Propryo », la case est pré-cochée.
  2. On ajoute le colocataire qui figure sur le papier.
  3. On confirme « Composition modifiée… signatures réinitialisées », puis la déclaration.
- **Résultat** :
  - le bail est **non signé** ;
  - `signaturesAnnulees` contient une entrée `remplace-par-externe` qui ment, et l'historique affiche « Signature en cours remplacée par signé hors Propryo » ;
  - le journal d'audit et le toast disent « signé hors Propryo le … » ;
  - le PDF choisi est **abandonné en silence** : `_bailExterneApresSave` sort parce que l'état n'est pas `externe` (`:16907`).
- **Correctif** : une déclaration remplace de toute façon la signature partielle, qu'elle archive. Faire `if (_ext.action === 'declarer') _resetSignaturesAfterSave = false;` avant `:18017`, ou conditionner `:18135` à `!_ext.action`. Ajouter un test qui exécute ce chemin.

### 🟠 3. L'archivage d'un PDF partiel encore en cours peut poser `cloudPdfKey` sur un bail devenu « externe » (artefact assimilable à une fausse preuve, gravé au journal)

- **Où** :
  - `app-part1.js:3264-3277` (`_archiveBailTerminee`) : écrit `cloudPdfKey = path` et `archiveTermine` sur le bail **courant** `DB.baux[ref]`, sans regarder son mode ni son `signedAt`. Si l'objet a changé, il y recopie aussi `proof`, `contentHash` et `certRef`.
  - Le garde ajouté à `__immoArchiveBailPdf` (`:3209`) n'agit qu'**à l'entrée**.
- **Scénario** :
  1. Le bailleur signe seul. `__immoArchiveBailPdf` téléverse le PDF partiel, avec réessais et attente progressive : plusieurs secondes, voire plus sur un réseau faible.
  2. Pendant ce temps, l'utilisateur déclare le bail externe ou corrige la date. `saveBail` a remplacé l'objet.
  3. À la fin du téléversement, le bail externe porte le `cloudPdfKey` d'un PDF **signé par le bailleur seul**.
  4. La fiche affiche « PDF du bail » et « Partager le PDF signé » (`app-part2.js:17680-17681`), et la carte Documents affiche « PDF » (`:16146/16168`).
  5. Si la ligne est déjà verrouillée, `_journaliserVerrouilles` journalise `signatures.cloudPdfKey`, qui est autorisé (`bail-modifications.js:143`). L'artefact devient **permanent** dans `baux_evenements`.
- **Correctif** : dans `_archiveBailTerminee`, si `cur.signatures.mode === 'externe'` ou si `cur.signatures.signedAt !== bailInitial.signatures.signedAt`, ne rien écrire sur `cur.signatures`. Rattacher plutôt `cloudPdfKey` à l'entrée correspondante de `cur.signaturesAnnulees` (même `signatures.signedAt`), où elle a sa place (preuve de la signature partielle archivée). Le même rattachement sert à « Annuler la session » : aujourd'hui, `cur.signatures` absent fait `return` et la clé du PDF partiel n'est jamais notée dans l'archive. Ajouter un test.

### 🟡 4. Hors ligne : l'EDL externe est refusé APRÈS la saisie

- **Où** : `app-part2.js:26166`. Le commentaire dit « avant de saisir le moindre champ », mais le refus tombe à l'enregistrement.
- **Évaluation** : acceptable, puisque le garde de `saveDB` refuserait de toute façon une écriture non étiquetée. Mais c'est un blocage évitable, alors que Didier demande de ne jamais bloquer.
- **Correctif** : hors ligne, enregistrer l'EDL **sans pièce jointe** avec `saveDB({quoi:'edl'})`. L'EDL est remonté par le rejeu hors ligne. Ne refuser que la pièce jointe (« à joindre au retour du réseau »). À défaut, désactiver le bouton « + Ajouter un EDL fait hors Propryo » hors ligne, avec la raison.

### 🟡 5. « Retirer le PDF » du bail externe n'est pas annulable et peut détruire le seul exemplaire

- **Où** :
  - `app-part1.js:16864-16870` et `:16910` (retrait à l'enregistrement) passent par `_attachmentDelete`, qui purge IndexedDB (`:12060`).
  - Le message affirme « le fichier déjà envoyé au cloud est conservé ». C'est vrai seulement si le téléversement en tâche de fond a abouti.
- **Scénario** : on dépose, le téléversement échoue (réseau), on retire. Le binaire est perdu.
- **Correctif** : faire un tombstone sans purge IndexedDB, comme `delEDL`, et passer par `_undoOp`. Ou avertir quand `!doc.cloudKey`.

### 🟡 6. Résultat de `saveDB` ignoré sur les nouveaux chemins

- **Où** :
  - `saveBail` (`:18229`) : la déclaration et le retrait affichent « signé hors Propryo le … » même si l'écriture est refusée (hors ligne, quota). `_bailExterneApresSave` tente ensuite le dépôt.
  - `annulerSessionSignature` (`:5384-5388`) : `saveDB()` n'est pas vérifié avant `pf.purge()`, qui supprime la session au relais.
- **Évaluation** : défaut ancien pour `saveBail` hors journal, mais les nouveaux messages l'aggravent.
- **Correctif** : même schéma que la branche journal (`_okJ === false` → retour en arrière et message), et faire la purge seulement si l'écriture a réussi.

### 🟡 7. Hygiène XSS : `fd()` rend la valeur brute si elle n'est pas une date

- **Où** : nouveaux sites qui injectent `fd(...)` sans échappement :
  - `_edlExtMeta` (`app-part2.js:26137`, `fd(e.date)` en pleine longueur) ;
  - carte EDL externe de la fiche (`:16954`, `${edl.type}` aussi) ;
  - cartes d'historique (`fd(ev.declareLe|envoyeeLe|signeLe|ancienneDate)`, limitées à 10 caractères par `_ymd`).
- **Évaluation** : les données peuvent venir d'un co-gestionnaire de SCI (`legacy_raw`). C'est cohérent avec l'existant (`rEDLList`), mais du code neuf devrait faire `escHtml(fd(...))`. Le reste est propre : noms de fichiers échappés ou passés par `textContent`, `_lyQ` dans les `onclick`, identifiants numériques `nid()`, fichiers contrôlés par `_avenantLireFichier` (10 Mo, PDF ou image).

### 🟡 8. EDL externe de sortie : mauvais locataire enregistré après une relocation

- **Où** : `app-part2.js:26172`. `locataire` = locataires du bail **courant**, sinon `log.locataire`.
- **Scénario** : on classe après coup l'EDL de sortie de l'ancien locataire alors qu'un nouveau bail existe. La fiche EDL porte le nom du nouveau locataire.
- **Correctif** : prendre le bail (courant ou `baux_historique`) dont la période contient la date, ou rendre le nom modifiable.

### 🟡 9. Retrait puis re-déclaration à la MÊME date avant un flush réussi : identité confondue

- **Où** : `store-sync.js:366-369`. Une ligne de référence verrouillée avec le même `signedAt` garde son identifiant : ce n'est pas un successeur.
- **Scénario** :
  1. Retrait et modification de termes, hors journal puisque `!_ext.action` (`app-part1.js:18103`).
  2. Le flush échoue (réseau), puis on re-déclare à la même date.
  3. La ligne verrouillée n'est pas réécrite. Les termes changés ne sont pas dans `CHAMPS_VIE`, donc ils ne sont pas journalisés et sont **perdus au rechargement**, comme l'archive `externe-retire` locale.
- **Évaluation** : probabilité faible, puisqu'il faut un flush en échec.
- **Correctif** : traiter un objet `signatures` remplacé (`externe.declareLe` différent) comme un successeur dans `_identifierBaux`. Ou bien, à la re-déclaration, refuser la même date tant que la ligne de référence verrouillée n'a pas été archivée.

### 🟡 10. Poids des archives

`signaturesAnnulees` garde l'objet `signatures` complet, y compris `finales` et `paraphes` en base64 pour une signature `bailleur-seul`. Ces images restent dans la base JSON, dans le miroir local et dans `legacy_raw`. La règle « rien n'est détruit » est respectée, mais le stockage s'alourdit, dans une base de quelque 700 Ko. À surveiller : on pourrait sortir les images vers IndexedDB ou le cloud, avec une référence.

### 🟡 11. Matrice : suppression du repli « nom de fichier EDL » sans transition

`_pilStatutDoc('edl')` (`app-part2.js:26301`) ne reconnaît plus un PDF « EDL… » déposé dans les documents du logement. Ce choix suit la conception, mais les utilisateurs qui avaient appliqué cette astuce voient de nouveau « Faire l'EDL ». Proposition : quand un tel document existe, l'action de la matrice propose « Classer comme EDL fait hors Propryo ».

### 🟡 12. Tests : l'ordre dans `saveBail` n'est vérifié que par une expression régulière sur le source

Le test « saveBail — ordre et garde-fous » (`bail-signe-externe-saisie.test.js`) contrôle la présence de chaînes. Il n'a pas vu le 🟠 2. Ajouter au moins deux tests qui exécutent le vrai `saveBail` (ou un extrait) : « composition modifiée et déclaration », « session vivante et déclaration ».

### 🟡 13. Droits

Aucun contrôle côté client : un membre `lecture_seule` voit et peut cocher la case. C'est la RLS qui refuse au cloud. En local, le bail est scellé et verrouillé jusqu'à la réhydratation. C'est le comportement générique de l'app (`_appReadOnly` est inerte, `app-part3.js:346`), pas une régression. À traiter avec les droits par SCI.

---

## Vérifié et trouvé correct

- **Pas de fausse preuve par les chemins directs** :
  - `declarerSignatureExterne` ne produit ni `finales`, ni `paraphes`, ni `proof`, ni `contentHash`, ni `certRef`, ni `cloudPdfKey`, ni `remoteSession` ;
  - les gardes sont en place dans `__immoArchiveBailPdf` (`:3209`), `_buildBailCertificatePdf` (`:4569`, exception), `_regenBailCertificate` (`:4788`), `openRemoteSignModal` (refus avec message adapté) et la clause de reconduction des garages (`bail-echeance.js:74`, plus la copie globale, vérifiée par le test anti-dérive) ;
  - l'aperçu d'un bail externe ouvre le PDF déposé ou le document « établi à partir de la saisie », avec le bandeau, sans « Démarrer signature » ni « PDF » ;
  - aucune mention « signé électroniquement » n'est générée.
- **Verrou cloud** :
  - `signatureSource:'externe'` est posé avant `sealSignedBaux`, qui ne l'écrase pas (`store-sync.js:170`) ;
  - `store-mapping.js:142-151` produit `signature_source='externe'`, `locked=true` et le hash des termes ;
  - `archiveEnAttente` ne retient que `avec-locataire`, donc le scellement est immédiat ;
  - décoche et re-datation donnent un **successeur** (identifiant neuf), l'ancienne ligne est **archivée** en phase 0 et jamais réécrite ;
  - la re-datation produit un objet neuf, sans `contentHashTerms` ni `locked`, donc avec une empreinte recalculée ;
  - les modifications ordinaires d'un bail externe passent par le journal (`bailSigneComplet` vrai) ;
  - `parentType:'bail'` est résolu correctement pour le PDF, jamais `'edl'` (CHECK 0040).
- **Pas de perte de données** :
  - `_rsPreflight` est une factorisation fidèle de l'ancien contrôle de « Relancer » : `completed` → récupération, injoignable / accès perdu / indéterminé → refus, `pending` → confirmation ;
  - « Annuler la session » archive l'objet `signatures` complet (signature du bailleur comprise) avec un résumé des signataires ;
  - la décoche archive tout et laisse le PDF en place ;
  - la case ne fait rien sur un bail électronique, même cochée par manipulation ;
  - `delEDL` sur un EDL externe met l'EDL et son document en tombstone dans le **même** instantané d'annulation, sans purge IndexedDB, donc l'annulation restaure les deux ;
  - le fichier cloud n'est jamais supprimé (aucun `storage.remove` dans le code) ;
  - `signaturesAnnulees` survit aux réenregistrements (`_preserverBailExistant`).
- **Lecteurs d'EDL avec `pieces=[]`, `signatures={}`** :
  - `edlSortieQuiFaitFoi` et `_calculerDelaiRestitution` donnent 1 mois, ou 2 si `dgRetenu`, le choix prudent ;
  - `_dgVgEntreeDate`, `_dgVgSeedFromEdl` (aucune ligne), l'assistant de départ, l'envoi des photos (rien à envoyer), la détection de doublon, la suppression en cascade et `edl-conflit` restent sans effet indésirable ;
  - éditeur, visionneuse, galerie, PDF généré, partage de photos et modèle de pièces sont gardés ;
  - `edlLoadRef` ignore l'EDL externe, avec un message ;
  - la casse `'Entrée'` / `'Sortie'` est corrigée dans la matrice et dans Documents.
- **Matrice** : `bailleur-seul` donne « Signature en cours » (constat 0.3 corrigé). Le bail repris déclaré passe à OK. L'EDL d'entrée du locataire précédent n'est plus compté.
- **Partage SCI** : `_espaceId` est posé sur l'EDL externe, sur son document et sur le PDF du bail.

## Mutations (copie `git archive` dans le répertoire de travail temporaire, jamais dans le dépôt)

| # | Mutation | Résultat |
|---|---|---|
| M1 | Retrait du garde `externe` de `__immoArchiveBailPdf` | 🔴 1 test rouge (gardes « preuve électronique ») |
| M2 | Retrait du garde `externe` de `bail-echeance.js` | 🔴 2 rouges (clause des garages, dérive du miroir) |
| M3 | Décoche sans archive (`archiver('externe-retire')` supprimé) | 🔴 1 rouge |
| M4 | `_rsPreflight` : branche `completed` neutralisée | 🔴 3 rouges (récupération, annulation, déclaration) |
| M5 | « Annuler la session » sans écriture dans `signaturesAnnulees` | 🔴 3 rouges |
| M6 | Déclaration sur signature partielle sans archive | 🔴 2 rouges |
| M7 | `delEDL` sans tombstone du PDF de l'EDL externe | 🔴 1 rouge |
| M8 | Branche journal non contournée (`!_ext.action` retiré) | 🔴 1 rouge, mais **par un test statique sur le source** (voir 🟡 12) |

M4b (« completed » ajouté à la liste blanche) est un mutant équivalent : la branche `completed` sort avant.

**Conclusion sur les tests** : les points critiques sont réellement couverts. Il manque la couverture du comportement de `saveBail` dans les cas combinés (findings 🔴 1 et 🟠 2).

---

## Résumé (200 mots max)

**Verdict : À CORRIGER.** Le socle est sain : pas de fausse preuve par les chemins directs, verrou cloud correct (`signature_source='externe'`, décoche et re-datation donnent un successeur, l'ancienne ligne est archivée), annulation de session protégée par le contrôle préalable au relais, archives complètes, suppression d'EDL annulable. Les 8 mutations critiques font rougir les tests.

- 🔴 1 : « Modifier le bail » permet de déclarer « signé hors Propryo » pendant une signature à distance vivante, sans contrôle au relais. Une signature déjà faite au relais peut être perdue, le lien reste actif et le poll s'arrête.
- 🟠 2 : une composition modifiée et une déclaration dans le même enregistrement font effacer la déclaration par `_resetSignaturesAfterSave`. Le PDF est abandonné en silence et l'archive ment.
- 🟠 3 : `_archiveBailTerminee` peut poser le `cloudPdfKey` d'un PDF signé par le seul bailleur sur un bail devenu externe. L'artefact est affiché comme « PDF du bail signé » et journalisé de façon permanente.
- 🟡 : EDL refusé hors ligne après la saisie ; retrait du PDF non annulable ; résultat de `saveDB` ignoré ; `fd()` non échappé ; mauvais locataire sur un EDL de sortie après relocation ; même date re-déclarée avant un flush ; poids des archives ; tests de `saveBail` statiques.

---

## Suivi des corrections (2026-10-06, commit « Signé hors Propryo audit »)

Principe tenu : des alertes, pas de blocage ; rien d'irrécupérable détruit ; aucune fausse preuve. Tests : `__tests__/helpers/bail-signe-externe-audit.test.js` (le **vrai** `saveBail` est exécuté dans un `with` à proxy, plus `_archiveBailTerminee`, `annulerSessionSignature`, `edlExterneCreer`, `sessionExpireeSigneHors`, `_renderRemoteSignBadge`, `_bailRenderSignatureDateField`…). 14 mutations locales annulées : toutes font rougir au moins un test. Suite complète : 257 fichiers, 6 375 tests verts.

| # | Finding | Statut | Correctif |
|---|---|---|---|
| 🔴 1 | Déclaration pendant une session à distance vivante | **Corrigé** | Case masquée dans « Modifier le bail » dès qu'une `remoteSession` existe (note renvoyant vers la session). « Signé hors Propryo » proposé sur la session aussi en cours d'envoi (`sent` / `chaining`), via `_rsPreflight`, qui réaffiche la case. Refus de secours `_bailExterneRefusSecours` dans `saveBail` (message clair, rien modifié) si aucun état relais n'a été contrôlé. |
| 🟠 2 | Déclaration effacée par la réinitialisation de composition | **Corrigé** | `_bailCompoResetDemande` : la réinitialisation n'est plus demandée quand le même enregistrement déclare le bail. La signature partielle est archivée (`remplace-par-externe`), la déclaration porte la composition saisie, le PDF choisi est déposé, le toast le dit. |
| 🟠 3 | `_archiveBailTerminee` sur un bail devenu externe | **Corrigé** | Si la signature courante est externe, absente ou de `signedAt` différent, rien n'est posé sur elle : la clé du PDF va dans l'entrée d'archive de sa signature (aussi pour « Annuler la session »). |
| 🟡 4 | EDL externe refusé hors ligne | **Corrigé** | L'EDL est enregistré (`saveDB({quoi:'edl'})`), seule la pièce est reportée avec un message ; « Ajouter le PDF » hors ligne explique pourquoi. |
| 🟡 5 | « Retirer le PDF » destructeur | **Corrigé** | Confirmation aussi dans « Modifier le bail » ; sans `cloudKey` le document est retiré de la liste mais le binaire local est conservé, et le message le dit. |
| 🟡 6 | `saveDB` ignoré | **Corrigé** | `saveBail` (déclaration / retrait) : écriture vérifiée, retour arrière complet et message si refus ; hors ligne, refus avant toute écriture. « Annuler la session » : le relais n'est purgé qu'après une écriture réussie, sinon bail remis tel quel. |
| 🟡 7 | `fd()` non échappé | **Corrigé** | `escHtml(fd(...))` dans les cartes d'historique, `_edlExtMeta` et la carte EDL externe (type compris). |
| 🟡 12 | Tests statiques sur `saveBail` | **Corrigé** | Voir tests exécutés ci-dessus (cas combinés 🔴 1 et 🟠 2 inclus). |
| 🟡 8 | Mauvais locataire d'un EDL de sortie après relocation | **Non traité** | Hors périmètre demandé ; demande de choisir le bail d'après la date, à instruire séparément. |
| 🟡 9 | Re-déclaration à la même date avant flush réussi | **Non traité** | Probabilité faible (il faut un flush en échec) ; toucher `_identifierBaux` (store-sync) risque la mécanique de verrou. |
| 🟡 10 | Poids des archives de signature | **Non traité** | Sortir les images vers IndexedDB / cloud est un chantier de stockage à part ; la règle « rien n'est détruit » est respectée. |
| 🟡 11 | Matrice : PDF « EDL… » déposé comme simple document | **Non traité** | Choix de conception ; proposition « Classer comme EDL fait hors Propryo » à décider avec Didier. |
| 🟡 13 | Droits côté client | **Non traité** | La RLS du cloud refuse l'écriture ; les droits par SCI relèvent d'un autre chantier. |
