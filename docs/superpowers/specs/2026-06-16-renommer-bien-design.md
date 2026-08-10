# Renommer un bien (logement) — design

> **Statut** : design figé 2026-06-16, **différé** (priorité = finir la bascule Supabase). À implémenter en session dédiée (mockups → plan → code → audit).
> **Origine** : Didier, 2026-06-16 — « renommer me semble indispensable en utilisation ». Découvert en testant la bascule 2c : le champ Référence est `readOnly` en édition ([index.html:39964](../../index.html), `openNewLog`).
> **Cas d'usage déclaré** : surtout **corriger un nom fraîchement créé** (bien vacant, sans données). Mais le design reste **sûr pour tous les cas** (jamais corrompre un bien avec données).

## Problème

La référence (`logement.ref`) est aujourd'hui l'**identité** du bien, utilisée comme clé de rattachement partout. Elle est volontairement `readOnly` après création → impossible de corriger une faute de frappe sans supprimer/recréer (acceptable pour un bien vacant, mais pas pour un bien avec historique).

## Contrainte centrale : la ref est la clé partout (cartographie 2026-06-16)

`logement.ref` rattache le bien dans **8 endroits** (tous à reporter au renommage) :
- `DB.baux` — **MAP keyée par ref** ([index.html:5128](../../index.html))
- `DB.baux_historique[].ref`
- `DB.mouvements[].qui` (= ref, sauf préfixe `SCI:`)
- `DB.quittances[].logement` (= ref)
- `DB.edl[].logement` (= ref)
- `DB.assurances[].logement` (= ref)
- `DB.agenda[].logement` (= ref)
- `DB.documents[].parentRef`/`.logRef` (si `parentType='logement'`)
- **Dossier Google Drive** : nommé `ref (type etage)` ([index.html:40856](../../index.html)) → renommage auto via `_drvHookRename` (mécanisme existant, avec confirmation).

**Entanglement cloud (bascule Supabase)** : l'`id` de ligne Supabase du logement = `detUuid('logement', norm(ref))` ([store-mapping.js:50](../../js/core/store-mapping.js)). Les FK enfants (baux/mouvements/quittances/edl/assurances/agenda) sont résolues par `logementByRef → detUuid`. Donc **renommer la ref change l'uuid cloud** → la sync voit `delete(ancienne clé) + insert(nouvelle clé)`. Pour un bien **vacant** (cas principal) c'est propre (aucun enfant à orphéliner). Pour un bien avec enfants, le report local (ci-dessous) régénère les bonnes FK → la sync ré-insère les enfants sous le nouvel uuid.

## Patron à réutiliser (éprouvé) : `saveEnt` (renommage bailleur)

Le renommage d'**entité** cascade déjà vers 5 collections (livré v14.51, `saveEnt`, [docs/subjects/BUG-ENT-RENAME-CASCADE.md](../../docs/subjects/BUG-ENT-RENAME-CASCADE.md)) :
```js
// capture prevNom AVANT modif, puis pour chaque collection rattachée :
if (l && !l._deleted && l.entity === prevNom) { l.entity = ent.nom; _stamp(l); renamed++; }
```
On applique **exactement ce patron** à la ref logement (report dans les 8 sites + Drive). Ce n'est donc PAS un hack — c'est la mécanique de renommage déjà en place dans l'app, étendue à un nouvel objet.

> NB : `saveImm` (renommage immeuble) n'a PAS de cascade (bug latent connu — `logement.imm` reste sur l'ancien nom). Hors scope ici, mais à traiter pareil un jour.

## Design

### 1. Logique de renommage (`renameLogement(oldRef, newRef)`)
1. **Validation** du nouveau nom : même garde que la création (`saveParamLog` L40710) — format `^[A-Za-z0-9À-ſ.\-_/ ]{1,60}$` + **unicité** (refus si la ref existe déjà parmi les biens vivants ET les tombstones, anti-collision/résurrection).
2. **Garde-fou bail signé** (seule vraie limite) : si le bien a un **bail signé** (`DB.baux[oldRef].signatures.signedAt` OU un bail signé dans l'historique) → **BLOQUER** avec message clair (« Bail signé : la référence est verrouillée pour préserver la valeur juridique du bail. »). Cohérent avec l'immutabilité légale Supabase (trigger `prevent_locked_mutation`). Hors cas d'usage déclaré → on bloque proprement plutôt que d'ouvrir un chantier d'avenant/re-signature.
3. **Report** (réutilise patron `saveEnt`) : déplacer la clé de map `DB.baux[oldRef]→[newRef]`, et réassigner `ref/qui/logement/parentRef` sur baux_historique, mouvements, quittances, edl, assurances, agenda, documents. `_stamp` chaque ligne touchée.
4. `log.ref = newRef` + `_stamp(log)`.
5. **Drive** : si dossier existe + nom change → `_drvHookRename` (confirmation existante).
6. `_auditLog('rename', 'logement', log.id, newRef, oldRef, newRef)` + `saveDB()` (→ en mode cloud, sync ligne-par-ligne gérée : delete ancienne clé + insert nouvelle + ré-insert enfants sous nouvel uuid).
7. Refresh UI (`_refreshAfterMutation`, re-render fiche/cartes).

### 2. Sûreté pour les cas non-déclarés
- Bien avec mouvements/quittances/EDL mais **sans bail signé** → report complet (patron `saveEnt`), autorisé.
- Bien avec **bail signé** → bloqué (cf. garde-fou).
- Collision de ref → refus à la validation.

### 3. UI (à mocker — règle mockup-first)
- **Point d'entrée** : 2-3 variantes à mocker — (A) bouton « ✏️ Renommer » à côté du champ Référence verrouillé dans la modale d'édition (là où l'utilisateur bute) ; (B) action dans le menu de la fiche 360° du bien ; (C) les deux.
- **Dialogue de renommage** : input nouvelle ref + validation live (format, unicité) + aperçu « X éléments seront mis à jour » + confirmation Drive + cas bloquant bail signé (message dédié).
- Mockups × **3 formats** (PC/tablette/téléphone) × tous les états post-clic (saisie, erreur format, erreur unicité, confirmation Drive, blocage bail signé, succès/toast).

### 4. Qualité
- Module pur testable (`renameLogement` en `js/core/` ou helper testé) + tests Vitest (report exhaustif, collision, blocage bail signé, idempotence).
- **Audit `superpowers:code-reviewer`** obligatoire (report de données sensibles : risque d'orphelinage/perte si un site est oublié).
- Vérifier le round-trip **cloud** (un bien renommé → re-hydrate → cohérent, enfants rattachés au nouvel uuid).

## Hors scope (différé)
- Renommage d'un bien avec **bail signé** (nécessiterait avenant/re-signature ou archivage — chantier juridique).
- Cascade du renommage d'**immeuble** (`saveImm`, bug latent séparé).
- Refonte « id stable découplé de la ref » (ARCHI-IMM-FK-IMMID) : solution architecturale long-terme qui rendrait le renommage trivial (la ref deviendrait un simple libellé). À coordonner avec la fin de la bascule. Ce design-ci est la solution **dans l'architecture actuelle** (les noms SONT les clés), cohérente avec `saveEnt`.

## Décisions captées
- **D1** : réutiliser le patron `saveEnt` (cascade par report), pas réinventer. ✅
- **D2** : bail signé → **bloquer** le renommage (pas d'avenant auto). ✅ (validé implicitement par le cas d'usage « surtout noms fraîchement créés »)
- **D3** : sûr pour tous les cas même si optimisé pour le bien vacant. ✅
- **D4** : UI à mocker avant code (3 variantes × 3 formats × états). ✅
