# Partage par SCI — câblage Storage par entité (brique front-end)

> Suite de l'audit 2026-06-18 (C1). Le socle RLS tables (`0029`/`0030`) + la frontière sécurité
> Storage (`0031`) sont écrits. Cette brique rend l'upload des fichiers RÉELLEMENT par-SCI.
> **Rien n'est activable** (pas de membre scopé, pas d'UI d'invitation) tant que cette brique +
> test:rls + audit ne sont pas verts.

## État acquis
- `supabase/migrations/0029_p1_partage_sci_socle.sql` — backfill + `entite_membre` + helpers. **Audité.**
- `supabase/migrations/0030_p1_partage_sci_rls.sql` — RLS tables par-entité. **Audité (table-level étanche).**
- `supabase/migrations/0031_p1_partage_sci_storage.sql` — policies Storage par-entité (corrige C1). **À auditer AVEC le câblage + test:rls.**
- `supabase/tests/p1-partage-sci.test.mjs` — isolation tables. À compléter (test Storage cross-SCI).

## Convention de chemin (décidée, cf 0031)
- Fichier d'une SCI : `<espace_id>/<entite_id>/files/<clé>`  (seg2 = `entite_id` uuid déterministe)
- Orphelin (sans SCI résoluble) : `<espace_id>/_orphelin/files/<clé>`  (membre plein seulement)
- LEGACY (uploads d'avant) : `<espace_id>/files/<clé>`  → `safe_uuid('files')`=NULL → membre plein seulement.
  **Aucune re-migration nécessaire** : le propriétaire (membre plein) lit tout ; les anciens fichiers
  restent invisibles d'un éventuel scopé (acceptable — aucun scopé n'existe).

## entite_id côté front (déterministe, sans round-trip)
`entite_id = makeDetUuid(ownerId)('entite', norm(nom))` où `norm = s => String(s||'').trim().toLowerCase()`
(cf `js/core/det-uuid.js` + `js/core/store-mapping.js` mapper `entites`). `ownerId` = `esp.ownerId`
résolu à `onLoggedIn` (`js/app/supabase-entry.js`). **Réutiliser EXACTEMENT le même `norm` et le même
namespace** sinon l'uuid diffère de celui des lignes (RLS refuserait l'accès au scopé légitime).

## Résolution de la SCI (nom d'entité) par objet — GROUNDED sur le code réel
- `DB.logements` = ARRAY ; `logForRef = ref => (DB.logements||[]).find(l => l.ref === ref)`. Champ SCI = `l.entity` (NOM).
- **Bail** (`DB.baux[ref]`, ref = ref logement) → `bail.entity || logForRef(ref)?.entity` (cf index.html:5409).
- **EDL** (`edl.logement` = ref logement) → `logForRef(edl.logement)?.entity` (cf index.html:27189/27749/28193).
- **Document** (`doc.parentType`,`doc.parentRef`/`parentId`) :
  - `logement` → `logForRef(parentRef)?.entity`
  - `entite`   → `parentRef` (c'EST le nom d'entité)
  - `immeuble` → trouver l'immeuble (`DB.immeubles`/`l.imm`) → entité de son logement, ou nom entité de l'immeuble
  - `mouvement`→ via le mouvement (logement→entité, ou `qui='SCI:<nom>'`)
  - non résoluble → orphelin (`_orphelin`).

## Helper unique (à ajouter dans index.html, près de `__immoArchiveBailPdf`)
```js
// Nom de SCI (entité) → segment de chemin Storage. '' / null → '_orphelin'.
function _cloudEntiteSeg(entiteNom){
  if (!entiteNom || !String(entiteNom).trim()) return '_orphelin';
  if (typeof window.__immoEntiteUuid === 'function') {
    const u = window.__immoEntiteUuid(entiteNom);   // exposé par supabase-entry.js
    return u || '_orphelin';
  }
  return '_orphelin';
}
function _cloudEntiteForLog(ref){ const l=(DB.logements||[]).find(x=>x.ref===ref); return l?l.entity:null; }
```

## Modifs `js/app/supabase-entry.js` (push-direct, PAS de bump ; base origin/main)
1. `let _cloudOwnerId = null` ; à `onLoggedIn` après resolveEspace : `_cloudOwnerId = esp.ownerId`.
2. Importer/instancier `makeDetUuid` (déjà importé par supabase-boot ; ré-exposer via une fonction) :
   `window.__immoEntiteUuid = nom => { try { return makeDetUuid(_cloudOwnerId)('entite', String(nom||'').trim().toLowerCase()); } catch(e){ return null; } }`.
   (entry doit importer `makeDetUuid` depuis `../core/det-uuid.js`.)
3. `__immoCloudUpload(idbKey, blob, contentType, entiteSeg)` → chemin
   `_cloudEspaceId + '/' + (entiteSeg||'_orphelin') + '/files/' + idbKey` ; **retourne le chemin complet**
   (string) au lieu de `true` (et `null`/`false` si échec) — pour stocker la référence exacte.
4. `__immoCloudFileUrl(pathOrKey, expiresIn)` → si `pathOrKey` contient `'/'` : `createSignedUrl(pathOrKey)` ;
   sinon (clé nue LEGACY) : `createSignedUrl(_cloudEspaceId + '/files/' + pathOrKey)`. Rétro-compat.

## Modifs `index.html` (worktree off origin/main, BUMP version, check-inline-js)
Pour CHAQUE site d'upload : résoudre le nom de SCI → `seg = _cloudEntiteSeg(nom)` → passer en 4e arg →
**stocker le chemin retourné** (pas la clé nue) :
- `__immoArchiveBailPdf(ref)` (5912) : `seg` via bail ; `bail.signatures.cloudPdfKey = <chemin retourné>`.
- `_ingestSignedBailArtifacts` (6695/6696) : idem pour PDF + cert.
- `_drvUploadAttachmentNow(doc)` (13910) : `seg` via doc.parent ; stocker `doc.cloudKey = <chemin>` (NOUVEAU
  champ, NE PAS écraser `idbKey` qui reste la clé IndexedDB locale).
- `uploadEDLPDFToDrive` (27724) : `seg` via edl ; `edl.cloudPdfKey = <chemin>`.
- `edlSyncDrive` photos (28158) : `seg` via edl ; `ph.cloudKey = <chemin>` (NOUVEAU champ).
Pour CHAQUE lecture : passer le chemin stocké (`cloudPdfKey`/`cloudKey`) à `__immoCloudFileUrl` ; si absent,
fallback clé nue (LEGACY). `_downloadPhotoFromDrive(driveFileId, idbKey, cloudKey)` : ajouter 3e arg
`cloudKey` ; brancher : `__immoCloudFileUrl(cloudKey || idbKey)`. MAJ des ~6 appelants
(13636/13743/14120/26077/29063 + def 29017) pour passer `pj.cloudKey`/`ph.cloudKey`.

## Realtime (différé, sévérité moindre)
`espace:<id>` (0025) reste espace-level. À scoper `espace:<id>:<entite>` AVANT activation du partage.
Pas de binaire transitant ; aucun scopé n'existe → non bloquant pour cette brique.

## Vérification (NON négociable avant « prêt »)
1. `node scripts/check-inline-js.mjs` (depuis le worktree) — syntaxe inline OK.
2. Compléter `p1-partage-sci.test.mjs` : un scopé SCI-A ne peut PAS `list`/`download` un objet sous
   `<espace>/<entiteB>/…` ni sous `<espace>/files/…` (legacy) ; le plein lit tout. `npm run test:rls`.
3. Audit `superpowers:code-reviewer` de 0031 + du câblage ENSEMBLE (cohérence chemins↔policies, pas de
   fuite, propriétaire intact). Règle [[feedback_audits_par_agents]].
4. Appliquer 0029→0031, re-test:rls contre la base migrée.

## Ordre de landing
0029 → 0030 → 0031 (migrations) ; entry helpers ; index.html (bump) ; tests ; audit ; apply. Puis seulement :
écran d'invitation / gestion membres (autre brique).
