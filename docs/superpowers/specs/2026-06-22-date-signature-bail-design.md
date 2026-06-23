# Date de signature du bail — saisie manuelle (design)

Date : 2026-06-22 · Statut : validé (brainstorming) · Version cible : v15.344+

## Contexte

La date de signature d'un bail (`bail.signatures.signedAt` + `signedBailleurAt` / `signedLocataireAt`)
est aujourd'hui posée automatiquement à `new Date()` au clic « Terminer » du wizard
(`_wizV2PersistSignatures`, index.html). Or la signature réelle (papier, présentiel) a souvent
lieu à une autre date que le clic dans l'app. Besoin : pouvoir saisir cette date **avant** de signer.

Un bail signé reste **immuable** : on ne modifie pas sa date après coup (`signedAt` fait partie du
hash légal `js/core/bail-content-hash.js`). La date se fixe donc au moment de signer, puis est figée.

## Décisions (validées avec l'utilisateur)

- **Emplacement** : champ dans le formulaire bail, à côté de « Ville de signature » (slot `.fg` vide,
  `index.html:1619`).
- **Libellé** : « Date de signature du bail ».
- **Valeur par défaut** : vide (si vide à la signature → aujourd'hui).
- **Date future** : autorisée (« prévue »).
- **Une fois signé** : le champ éditable est masqué et remplacé par un affichage lecture
  « 🔒 Signé le JJ/MM/AAAA ».
- **Portée** : signature présentielle (wizard). La signature à distance garde son horodatage réel
  (hors scope).

## Modèle de données

- `bail.dateSignaturePrevue` : `"YYYY-MM-DD"` (champ propre au bail, comme `villeSignature`).

## Implémentation

1. **HTML** (`index.html:1619`, `.fg` vide à côté de ville signature) : groupe à deux états
   (édition `b-dateSignature` / lecture « Signé le … »).
2. **Chargement** (`openBail`, ~17757) : si `bail.signatures.signedAt` → masquer l'input, afficher
   « 🔒 Signé le » `fd(signedBailleurAt||signedAt)` ; sinon afficher l'input = `bail.dateSignaturePrevue||''`.
   Réutilisé dans le 2e loader (~15786).
3. **Sauvegarde** : `getBailDataFromForm` (~18956) émet `dateSignaturePrevue: v('b-dateSignature')` ;
   `saveBail` ajoute un carryover (patron `fiscal` 18787) : si le champ est vide mais une valeur
   existe, on la préserve (évite l'effacement au re-save d'un bail signé).
4. **Signature** (`_wizV2PersistSignatures`, ~21594) : `signedAt` / `signedBailleurAt` /
   `signedLocataireAt` = `resolveSignatureTimestamp(dateSignaturePrevue, nowISO)`. `capturedAt` reste
   l'instant réel (forensic). Lecture de `dateSignaturePrevue` via `window.opener.DB.baux[ref]`
   (fallback localStorage), comme le snapshot.
5. **Propagation** : PDF §18 (`signedBailleurAt||signedAt`) et pastilles « Bail signé le … » lisent
   déjà ces champs → date choisie reflétée automatiquement.

## Helper pur (testable, TDD)

`resolveSignatureTimestamp(planned, nowISO)` :
- `planned` = `YYYY-MM-DD` valide (round-trip vérifié) → `planned + "T12:00:00.000Z"` (midi UTC :
  `slice(0,10)` et `toLocaleDateString` fr restent sur le bon jour).
- sinon (vide / format invalide / date impossible type 30/02) → `nowISO`.

Miroir inline dans le wizard (regex + isNaN ; l'input `type=date` ne produit que des dates valides).

## Vérification

- TDD : tests `resolveSignatureTimestamp` (date valide → midi UTC ; vide/invalide/30-02 → now).
- Parité `index.html` ↔ `index-test.html`.
- `node scripts/check-inline-js.mjs`, suite Vitest.
- Audit `superpowers:code-reviewer` (flux signature = sensible légal).
- Bump version (title + `<em>` + landing + `IMMOTRACK_VERSION` + `sw.js CACHE_VER`).
- Push origin HEAD:main.
