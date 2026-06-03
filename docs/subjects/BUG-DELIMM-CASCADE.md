# BUG-DELIMM-CASCADE — `delImm` ne cascade pas sur les sous-objets

**Status** : ✅ **Livré PROD v15.248** (cascade + confirmation détaillée, audité 2× sandbox + 1× port) · **Prio** : P2 · **Taille** : S
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
- 2026-06-03 : **implémenté en sandbox** (`index-test.html`, v15.248). Symptôme rapporté par user
  « suppression d'immeuble ne fonctionne pas » → diagnostic : toutes les vues groupent les
  logements par `l.imm` (string), donc tombstoner le seul objet immeuble laisse ses logements
  vivants → l'immeuble reste affiché. Décision user : **« Cascade + confirmation détaillée »**.
  - `_cascadeDeleteImmeuble(entNom, immNom, immId, dryRun)` créé après `_cascadeDeleteEntity`.
    Tombstone SCOPÉ (entity+imm) : logements + baux + mouvements + quittances + edl + assurances
    (incl. PNO `portee==='immeuble'`) + mrh + candidats + baux_historique + irlHistorique +
    documents (9 parentTypes). IDs collectés DURANT chaque passe (pas re-filtrés) car
    `_tombstoneObj` perd `portee`. **Mode `dryRun`** : renvoie un décompte par catégorie sans
    muter → alimente la confirmation détaillée de `delImm` (source unique, zéro drift annoncé/réel).
  - `delImm` réécrit : confirmation listant CHAQUE catégorie non-nulle ; cascade dans `_undoOp`
    (1 seul `saveDB` → Ctrl+Z restaure tout le bloc) ; `_stamp(ent)` pour gagner au merge Drive ;
    offre corbeille Drive du dossier immeuble.
  - **Propagation cross-device** : OK via `_buildEntityPayload(ent)` de l'entité VIVANTE — les
    tombstones des sous-objets sont inclus (champs de filtrage préservés) → pas besoin de
    symétrie merge-side (la suggestion initiale §66 est superseded ; même modèle que
    `_cascadeDeleteEntity` : device B reçoit les tombstones, ne re-run pas la cascade).
  - **Vérifs** : check-inline-js 4/0 · vitest 1411 · harness déterministe 41/41 (dry-run pur sans
    mutation + run réel identique + scoping n'effleure ni l'autre immeuble ni l'autre entité +
    edge cases 0-logement / args manquants). **Double audit `superpowers:code-reviewer`** : 1er
    passe 0 🔴 (a trouvé un bug : doc d'assurance PNO raté car `portee` perdu → corrigé en
    collectant les IDs pendant les passes ; + 🟠 confirmation sous-déclarait → corrigé via dry-run) ;
    2e passe (re-audit du refacto dry-run) **0 🔴 / 0 🟠 / 0 🟢**, pureté dry-run confirmée.
  - **Reste** : port PROD (`index.html`) après OK user + bump 4 emplacements + sw.js CACHE_VER.
    ⚠ Au port : remplacer le bloc PNO inline v15.240 de `delImm` prod par cet appel ; re-grep
    parité ; la fonction est un superset défensif identique sandbox/prod.
- 2026-06-03 (suite) : **porté PROD v15.248** (commit allowlist → auto-push GitHub Pages).
  `_cascadeDeleteImmeuble` inséré après `_cascadeDeleteEntity` + `delImm` réécrit (bloc PNO inline
  v15.240 supprimé, remplacé par la branche `portee==='immeuble'` de la cascade). Parité vérifiée :
  les 2 corps de fonctions sont **byte-identiques** sandbox↔prod (5696 + 4386 chars). Vérifs :
  check-inline-js 4/0 · vitest 1411 · 6 hunks diff (4 bumps version + delImm + cascade, zéro hunk
  parasite). **Audit `superpowers:code-reviewer` du port** (intégration : insertion, refs
  collatérales, bloc PNO supprimé superseded, sécu Drive cross-device, cohérence avec
  `_cascadeDeleteEntity`) → **0 🔴 / 0 🟠 / 0 🟢**, « safe to ship ». Sujet clos.

## Follow-ups découverts par l'audit (hors périmètre de ce fix — à arbitrer en pilotage)
- **Orphelins agenda** : `DB.agenda` est synchronisé par `_buildEntityPayload` (filtre
  `entite/logement/immeuble`) mais N'EST tombstoné par AUCUNE cascade (ni immeuble, ni entité).
  Le sous-système agenda supprime par splice (pas de tombstone) → une suppression locale ne se
  propage pas cross-device (resurrection au merge via LWW). Bolter un cleanup local-only ici
  serait une solution « passable » (interdit). **Vrai fix = donner un mécanisme de tombstone à
  l'agenda** puis cascader entité+immeuble+logement de façon cohérente. Sujet dédié à créer.
- **Noms d'immeubles dupliqués** : `saveImm` n'impose pas l'unicité du `nom` dans une même
  entité. Comme tout résout l'immeuble par `nom` (dette ARCHI-DB-DOUBLONS), 2 immeubles homonymes
  → la cascade supprime les logements des DEUX. Garde d'unicité à ajouter dans `saveImm` (ou
  résolution par id), à tracker sous ARCHI-DB-DOUBLONS.
