# Renommer un bien (logement) — design (rafraîchi post-bascule)

> **Statut** : design figé 2026-06-16 (spec d'origine), **rafraîchi 2026-07-06** après la fin de la bascule Supabase + le retrait total de Google Drive. À implémenter : mockup dialogue → plan → module pur testé → code → audit.
> **Origine** : Didier — « renommer me semble indispensable en utilisation ». Le champ Référence est `readOnly` en édition (`openNewLog`).
> **Cas d'usage principal** : corriger un nom fraîchement créé (bien vacant, sans données). Le design reste **sûr pour tous les cas** (jamais corrompre un bien avec données).

## Problème
`logement.ref` est l'**identité** du bien, utilisée comme clé de rattachement partout, et `readOnly` après création → impossible de corriger une faute sans supprimer/recréer.

## Contrainte centrale : la ref est la clé partout
`logement.ref` rattache le bien dans ces sites (tous à reporter au renommage) :
- `DB.baux` — **MAP keyée par ref**
- `DB.baux_historique[].ref`
- `DB.mouvements[].qui` (= ref, sauf préfixe `SCI:`)
- `DB.quittances[].logement` (= ref)
- `DB.edl[].logement` (= ref)
- `DB.assurances[].logement` (= ref)
- `DB.agenda[].logement` (= ref)
- `DB.documents[].parentRef`/`.logRef` (si `parentType='logement'`)

**⚠️ CHANGEMENT vs spec d'origine — plus de Google Drive.** Le Drive a été **retiré** (cutover CONNEXION lot B). Il n'y a **plus** de dossier Drive à renommer ni d'appel `_drvHookRename`. Cette étape est **supprimée** du design.

**Entanglement cloud (Supabase).** L'`id` de ligne Supabase du logement = `detUuid('logement', norm(ref))`. Les FK enfants (baux/mouvements/quittances/edl/assurances/agenda/documents) sont résolues par `logementByRef → detUuid`. Donc **renommer la ref change l'uuid cloud** → la sync ligne-par-ligne voit `delete(ancien uuid) + insert(nouveau uuid)` pour le logement, et **ré-insère les enfants sous le nouvel uuid** (leurs FK ayant été réassignées localement).
- Bien **vacant** (cas principal) : propre, aucun enfant à orphéliner.
- Bien avec enfants **sans bail/EDL signé** : le report local régénère les bonnes FK → sync ré-insère proprement.
- **À VÉRIFIER à l'implémentation** (round-trip cloud) : un bien renommé → `saveDB` → re-hydrate → cohérent, enfants rattachés au nouvel uuid, zéro orphelin. C'est le point de risque #1 (test dédié).

## Patron à réutiliser (éprouvé) : `saveEnt` (renommage bailleur)
Le renommage d'**entité** cascade déjà vers 5 collections (livré v14.51, `saveEnt`) :
```js
// capture prevNom AVANT modif, puis pour chaque collection rattachée :
if (l && !l._deleted && l.entity === prevNom) { l.entity = ent.nom; _stamp(l); renamed++; }
```
On applique **exactement ce patron** à la ref logement. Ce n'est PAS un hack — c'est la mécanique de renommage déjà en place, étendue à un nouvel objet.

## Design

### 1. Logique de renommage — module PUR testable `renameLogement(db, oldRef, newRef) → { ok, error?, touched }`
Extraire la logique en helper pur (`js/core/rename-logement.js` ou équivalent) prenant le `DB` + les 2 refs, retournant le compte d'éléments touchés (ou une erreur), SANS DOM/réseau → testable Vitest.

1. **Validation du nouveau nom** : même garde que la création (`saveParamLog`) — format `^[A-Za-z0-9À-ſ.\-_/ ]{1,60}$` + **unicité** (refus si la ref existe déjà parmi les biens vivants ET les tombstones `_deleted`, anti-collision/résurrection). Refus si `oldRef === newRef` (no-op).
2. **Garde-fou immutabilité légale (seule vraie limite)** : BLOQUER si le bien a un **bail signé** (`DB.baux[oldRef].signatures.signedAt`/`.locked`, OU un bail signé dans `baux_historique`) **OU un EDL signé/verrouillé** (`DB.edl[].logement===oldRef && (signedAt||locked)`). Message clair : « Bail/EDL signé : la référence est verrouillée pour préserver la valeur juridique. » Cohérent avec le trigger DB `prevent_locked_mutation` (défense en profondeur : même si le client tentait, la base refuserait delete/update d'une ligne verrouillée). Hors cas d'usage déclaré → on bloque proprement plutôt que d'ouvrir un chantier d'avenant/re-signature.
3. **Report** (patron `saveEnt`) : déplacer la clé de map `DB.baux[oldRef]→[newRef]`, réassigner `ref/qui/logement/parentRef/logRef` sur baux_historique, mouvements (qui, hors `SCI:`), quittances, edl, assurances, agenda, documents (`parentType==='logement'`). `_stamp` chaque ligne touchée. Compter les `touched`.
4. `log.ref = newRef` + `_stamp(log)`.
5. **Audit + persist** (orchestration, hors module pur) : `_auditLog('rename','logement',log.id,newRef,oldRef,newRef)` + `saveDB()` (→ sync cloud delete/insert/re-children).
6. Refresh UI (`_refreshAfterMutation`, re-render fiche/cartes).

### 2. Sûreté — matrice de cas
- Vacant → report vide/minime, autorisé.
- Avec mouvements/quittances/EDL **sans bail/EDL signé** → report complet, autorisé.
- **Bail OU EDL signé** → bloqué (garde-fou).
- Collision de ref (vivant ou tombstone) → refus à la validation.
- `oldRef === newRef` → no-op silencieux.

### 3. UI (mockup-first)
- **Point d'entrée** : bouton « ✏️ Renommer » à côté du champ Référence verrouillé dans la modale d'édition du logement (là où l'utilisateur bute), + éventuellement action fiche 360°. (Variantes à valider au mockup.)
- **Dialogue** : input nouvelle ref + **validation live** (format, unicité) + **aperçu « N éléments seront mis à jour »** (baux, mouvements, quittances…) + **blocage bail/EDL signé** (message dédié) + succès/toast. **PLUS de confirmation Drive** (Drive retiré).
- Mockup × **3 formats** (PC/tablette/téléphone) × états post-clic (saisie, erreur format, erreur unicité, blocage signé, succès).

### 4. Qualité (non négociable)
- **Module pur** `renameLogement` + tests Vitest : report exhaustif des 8 sites, collision (vivant + tombstone), blocage bail signé, blocage EDL signé, idempotence, no-op même-ref.
- **Audit `superpowers:code-reviewer`** obligatoire (report de données sensibles : risque d'orphelinage/perte si un site est oublié + immutabilité légale).
- **Round-trip cloud** vérifié (bien renommé → re-hydrate → cohérent, enfants sous nouvel uuid, 0 orphelin).
- Bump version + sandbox-first si applicable.

## Hors scope (différé)
- Renommage d'un bien avec **bail/EDL signé** (nécessiterait avenant/re-signature/archivage — chantier juridique).
- Cascade du renommage d'**immeuble** (`saveImm`, bug latent séparé — `logement.imm` reste sur l'ancien nom).
- Refonte « id stable découplé de la ref » (long-terme : la ref deviendrait un simple libellé, renommage trivial). Ce design-ci est la solution **dans l'architecture actuelle** (les noms SONT les clés), cohérente avec `saveEnt`.

## Décisions captées
- **D1** : réutiliser le patron `saveEnt` (cascade par report), pas réinventer. ✅
- **D2** : bail/EDL signé → **bloquer** (pas d'avenant auto). ✅
- **D3** : sûr pour tous les cas même si optimisé pour le bien vacant. ✅
- **D4** : UI mockée avant code. ✅
- **D5 (nouveau 2026-07-06)** : Drive retiré → aucune étape Drive ; renommage géré par la sync Supabase (delete ancien uuid + insert nouveau + ré-insert enfants). ✅
