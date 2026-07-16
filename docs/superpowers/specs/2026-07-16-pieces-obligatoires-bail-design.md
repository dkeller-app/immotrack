# Pièces obligatoires du bail — SC1 : moteur de complétude (design)

**Date :** 2026-07-16
**Statut :** design validé (brainstorming), avant plan d'implémentation
**Mockup validé :** `mockups/PIECES-OBLIGATOIRES-BAIL/index.html` (variante C, modes clair/sombre, PC/tablette/téléphone)

## Contexte & problème

À la signature d'un bail, la loi impose de remettre au locataire un ensemble de pièces
obligatoires (loi n° 89-462 art. 3-3 pour le Dossier de Diagnostic Technique, + notice,
règlement de copropriété, etc.). Sanction art. 3-4 : jusqu'à 1 an de prison + 20 000 €
pour un bail non conforme.

L'app génère déjà correctement les annexes **textuelles** (notice d'information intégrale
[index.html:19101], grille de vétusté §8.2, inventaire mobilier via l'EDL, tableau d'annexes),
et sait déjà **quels diagnostics sont applicables** (`_DIAGS_CATALOG_INLINE.isApplicable`
[index.html:34476]). **Le trou** : rien ne relie « ce diagnostic applicable » ↔ « son vrai
fichier PDF est-il joint et prêt à être remis au locataire ? ». Le bailleur n'a aucune vue
de ce qui manque, et les fichiers ne partent pas avec la signature.

Ce chantier (SC1) construit **le socle** : détecter et signaler les pièces-fichiers
obligatoires manquantes. **L'envoi des fichiers avec le bail signé est SC2** (hors scope ici).

## Décisions de cadrage (validées)

1. **SC1 d'abord**, socle type-de-bail-aware (vide/meublé/garage/mobilité/étudiant).
2. **Avertir sans bloquer** à la signature (bandeau non bloquant, jamais de blocage).
3. **Complétude = fichier PDF réel** (ou marqué non applicable). Des données saisies sans PDF
   ne comptent pas comme « présent » (rien à remettre au locataire).
4. **Applicabilité pilotée par les champs déjà saisis** (`log.anneeConstruction`,
   `log.installationGazAnnee`, `log.installationElecAnnee`, `log.zoneRisques`…). Si un champ
   décisif manque → état **« à vérifier »**, jamais masqué à tort.
5. **Un fichier peut couvrir plusieurs pièces** (un dossier de diagnostics unique contient
   souvent DPE + plomb + amiante + gaz + élec). Modèle : `requirementKeys[]` (tableau), pas
   une clé unique.
6. **Le meublé n'ajoute aucune pièce** à cette checklist : l'inventaire mobilier est déjà géré
   par l'EDL d'entrée (décret 2015-981). Le type de bail ne change que **quels diagnostics du
   DDT s'appliquent**.

## Périmètre exclu (→ SC2)

Fusion / envoi des fichiers avec le bail signé (présentiel + distance). SC1 ne fait que
**détecter, signaler, et fournir le point d'attache**.

## Architecture

Quatre composants, du plus isolé au plus intégré.

### Composant 1 — Moteur (module pur, testable)

Nouveau `js/helpers/bail-required-docs.js`, mirroré `js/helpers/bail-required-docs.global.js`
(exposé `window.BailRequiredDocs`), aligné sur le pattern existant `georisques-erp-detector`.

Fonction pure principale :

```
computeRequiredDocs({ log, imm, bailType, documents }) → RequiredPiece[]
```

`RequiredPiece = { key, label, legal, level, kind, state, why, files[] }`

- `key` : `'dpe' | 'crep' | 'amiante' | 'elec' | 'gaz' | 'erp' | 'bruit' | 'copro' | 'anah' | 'permis'`
- `level` : `'logement' | 'immeuble'` (où le fichier s'attache — jamais `'bail'` pour les
  diagnostics, cf. §Stockage)
- `kind` : `'diagnostic' | 'file'`
- `state` : `'ok'` (fichier joint) · `'miss'` (applicable, aucun fichier) · `'verify'`
  (applicable mais un champ décisif manque) · `'na'` (non applicable → replié)
- `why` : le critère qui rend la pièce requise/non requise (« Construit avant 1997 »,
  « Installation > 15 ans », « Immeuble en copropriété », « Construit après 1949 »…)
- `files[]` : les entrées `DB.documents` qui satisfont cette pièce (via `requirementKeys`)

**Réutilisation** :
- Les 7 diagnostics du DDT réutilisent **tel quel** `_DIAGS_CATALOG_INLINE` + `isApplicable(log)`
  (l'app encode déjà : CREP < 1949, amiante < 07/1997, gaz/élec > 15 ans, ERP si `zoneRisques`).
  Le moteur n'ajoute que la résolution de `state` en croisant avec les fichiers attachés.
- Pièces non-diagnostic ajoutées avec leurs prédicats : `copro` (immeuble en copropriété),
  `anah` (logement conventionné), `permis` (zone permis de louer).

**Règle `verify`** : une pièce diagnostic est `verify` si elle *pourrait* être applicable mais
qu'un champ décisif est absent/indéterminé — ex. gaz/élec sans année d'installation, ou ERP en
état `ERP_INDETERMINE` (tri-état Géorisques déjà en place). Sinon `miss` (applicable, connu) ou
`na` (non applicable, connu).

**Type-de-bail-aware** : `bailType` module l'ensemble des diagnostics applicables (garage/parking
retire l'essentiel du DDT ; vide/meublé/mobilité/étudiant partagent le même socle DDT). Aucune
pièce « inventaire » n'est jamais retournée.

### Composant 2 — Lien fichier ↔ pièces (`requirementKeys[]`)

Seule modification de modèle. Ajout d'un champ optionnel `requirementKeys: string[]` à l'entrée
`DB.documents` (créée par `_attachmentSaveForEntity` [index.html:13525]).

- À la pose : le bouton « Joindre le dossier complet » ou « Joindre » d'une pièce estampille
  le fichier avec les clés cochées (`['dpe','amiante','elec']` pour un dossier groupé).
- Migration : nulle. Les documents existants non étiquetés restent sans `requirementKeys`
  (n'auto-satisfont aucune pièce ; l'utilisateur peut re-joindre ou relier).
- **Persistance cloud (à ne pas oublier)** : ajouter `requirement_keys` (jsonb) au mapper
  `documents()` [js/core/store-mapping.js:54] **et** une colonne Supabase (migration).
  Sans ça, le tag persiste en IndexedDB mais pas dans le cloud → checklist vide sur un 2ᵉ
  appareil. Tests `store-mapping` / `store-sync` à compléter.

### Composant 3 — Checklist (UI, variante C validée)

Panneau **« Pièces obligatoires du bail »** rendu dans le contexte du bail (fiche logement),
calculé pour le type de ce bail. Conforme au mockup validé :

- Anneau de complétude « N/M jointes » (compte les pièces `kind:file` applicables ; `na` exclus).
- Bandeau « Joindre le dossier complet » (1 PDF → coche les diagnostics couverts).
- Tri : **À traiter** (`miss` + `verify`, en tête, ambre) puis **Jointes** (`ok`).
- Par ligne : case (✓ vert / vide / `?` ambre pour `verify`), libellé, **pastille du critère**
  (`why`), source `📄 fichier.pdf` si joint, action (Joindre / Vérifier / Voir).
- `<details>` replié en bas : « Pièces non demandées pour ce logement » (les `na`, avec raison).
- Modale Joindre : drop-zone (réutilise le handler d'upload existant), cases « ce document
  couvre : … », rappel légal de la pièce, échappatoire « Je n'ai pas ce diagnostic ».

Réutilise le pattern `_renderAttachmentSection` / `_handleAttachmentUpload` [index.html:35169].
Les pièces de niveau immeuble (règlement copro) pointent vers « 📁 Documents communs » existant.
Responsive PC/tablette/téléphone + modes clair/sombre (charte Propryo : corail = accent seul).

### Composant 4 — Avertissement à la signature (non bloquant)

Aux points d'entrée de la signature — présentiel `previewBailData` [index.html:19343] et distance
`_confirmRemoteSignSend` [index.html:6837] — appeler `computeRequiredDocs` ; s'il reste des
pièces `miss`/`verify`, afficher un **bandeau non bloquant** listant ce qui manque, avec deux
actions : « Compléter » (ouvre la checklist) et « Signer quand même » (poursuit). Jamais de
blocage. C'est le point d'accroche que SC2 utilisera pour joindre effectivement les fichiers.

## Stockage & persistance (réutilisation, pas de neuf)

Le stockage réutilise le pipeline éprouvé : `_attachmentSaveForEntity` → `DB.documents[]` +
IndexedDB (binaire) + copie Drive (fond) + sync Supabase via `documents()` mapper. **Les fichiers
s'attachent au bon niveau**, la checklist n'est qu'une *vue* contextuelle au bail :

- Diagnostics → **logement** (`parentType:'logement'`) : réutilisés par tous les baux successifs
  du logement (un DPE vaut ~10 ans, on ne le re-téléverse pas par bail).
- Règlement de copropriété → **immeuble**.
- Cloisonnement RLS/SCI respecté via `_drvResolveDocEntity` [index.html:13668].

## Tests

- **`bail-required-docs.js`** (Vitest, module pur) : ensemble requis par type de bail ;
  bascules d'applicabilité (année < 1949, < 1997, > 15 ans, copro, anah, permis) ; résolution
  `ok`/`miss`/`verify`/`na` ; champ manquant → `verify` ; ERP indéterminé → `verify` ; comptage
  de complétude ; un fichier à `requirementKeys` multiples satisfait plusieurs pièces.
- **`store-mapping` / `store-sync`** : `requirement_keys` round-trip local ↔ cloud.
- **Audit `superpowers:code-reviewer`** obligatoire avant « prêt à tester » (règle gravée).

## Ce qui n'est PAS refait (anti-réinvention)

Notice d'information, grille de vétusté, inventaire mobilier (EDL), état des lieux, tableau
d'annexes du bail, moteur d'applicabilité des diagnostics, auto-DPE ADEME, auto-ERP Géorisques,
pipeline de pièces jointes, sync cloud — **tout existe déjà et est réutilisé**.
