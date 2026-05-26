# BUG-DELIMM-CASCADE — `delImm` ne cascade pas sur les sous-objets

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S (~1h)
**Détecté** : 2026-05-26 (audit code-reviewer post-cleanup v15.187)
**Lié à** : BUG-DRIVE-RESURRECTION (v14.30-32), Phase A v15.184 (`_cascadeDeleteEntity`)

## Problème

`delImm(idx, entIdOverride)` (l.32626+) tombstone uniquement l'objet `ent.immeubles[idx]`
imbriqué dans l'entité. Aucun `_cascadeDeleteImmeuble` n'existe (vérifié via `git log -S`).

Conséquences cross-device après suppression d'un immeuble :
- **Logements de l'immeuble** : restent vivants (avec `imm` pointant vers un immeuble tombstone)
- **Documents `parentType='immeuble'`** avec `parentId=immId` : restent vivants
- **Documents `logRef` des logements** de cet immeuble : restent vivants
- **Baux/EDL/PJ liés à ces logements** : restent vivants

Le payload entité inclut quand même les logements (filtre `l.entity===nom`), mais les
sous-objets pointent vers un immeuble tombstoné → **orphelins logiques** propagés cross-device.

## Solution

Créer `_cascadeDeleteImmeuble(entNom, immId)` sur le modèle de `_cascadeDeleteEntity` :

```js
function _cascadeDeleteImmeuble(entNom, immId) {
  if (!entNom || immId == null) return 0;
  const tombstone = _tombstoneObj;  // helper centralisé v15.185
  let count = 0;

  // 1. Logements de cet immeuble (par imm.nom dans log.imm OU imm.id si trackable)
  const ent = (DB.entites || []).find(e => e && e.nom === entNom);
  const imm = ent && (ent.immeubles || []).find(i => i && +i.id === +immId);
  if (!imm) return 0;
  const immNom = imm.nom;
  const cascadeRefs = new Set();
  (DB.logements || []).forEach((l, i) => {
    if (l && !l._deleted && l.entity === entNom && l.imm === immNom) {
      DB.logements[i] = tombstone({ id: l.id, ref: l.ref, entity: l.entity, imm: l.imm });
      cascadeRefs.add(l.ref);
      count++;
    }
  });

  // 2. Baux / Mouvements / Quittances / EDL / Assurances / MRH / IRL / Documents
  // (même pattern que _cascadeDeleteEntity mais scopé sur cascadeRefs)
  // ... (à compléter en copiant la structure de _cascadeDeleteEntity)

  console.log('[cascadeDeleteImmeuble]', entNom, immNom, '→', count, 'sous-objets tombstones');
  return count;
}
```

Et l'appeler dans `delImm` :

```js
function delImm(idx, entIdOverride) {
  // ... récupération ent + imm ...
  _cascadeDeleteImmeuble(ent.nom, imm.id);
  // tombstone imm dans ent.immeubles[idx]
  ent.immeubles[idx] = _tombstoneObj({ id: imm.id, nom: imm.nom });
  // ...
}
```

Et **symétrique côté merge** : `_mergeEntityPayload` doit appeler `_cascadeDeleteImmeuble`
quand il reçoit un immeuble tombstone d'un autre device.

## Tests

- Test scénario Marion : Didier supprime un immeuble → push Drive → Marion pull → vérifie
  que ses logements/baux/PJ liés à cet immeuble sont aussi tombstone localement.
- Test idempotency : appel multiple ne crée pas de doublons.
- Test ordre : tombstone des sous-objets AVANT tombstone de l'immeuble (sinon `ent.immeubles[idx]` introuvable).

## Journal
- 2026-05-26 : créé suite à audit code-reviewer post-cleanup Drive (session v15.181-189).
  Bug pré-existant (jamais traité), pas une régression. À fixer avec helper centralisé
  `_tombstoneObj` pour cohérence avec Phase B v15.185.
