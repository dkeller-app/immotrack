# BUG-DEL-FICHE-360 + UX-IMM-MODAL — Suppression silencieuse + bulle entité/immeuble imbriquée

**Status** : ✅ **Livré v14.26 (suppression) + v14.27 (modale immeuble autonome)** · **Prio** : P1 (régression UX) · **Taille** : XS+S (~30 min + ~45 min)
**Détecté** : 2026-05-02
**Lié à** : UNDO-OP (v14.21-24, frosty-stonebraker) · ARCHI-DB-DOUBLONS · FICHES-PARITE-360

---

## Volet 1 — v14.26 : suppression ne ferme pas la modale / la fiche 360°

### Symptôme
> 💬 « quand je supprime, ça ne supprime pas directement avec soit retour en arrière soit disparition de la bulle »

### Cause
Lors du wrap `_undoOp` (v14.23), la mutation DB est désormais **différée** dans la closure. Aucun `closeM()` ni `closeXFiche()` n'avait été ajouté → la modale ouverte ou la fiche 360° en cours restait à l'écran.

### Fix v14.26
Pour chaque fonction de suppression, ajout **avant** `_undoOp` :

| Fonction | Modal fermée | Redirect fiche 360° |
|---|---|---|
| `delLog(ref)` | `ov-log` | `closeLogFiche()` si `_currentLogFicheRef === ref` |
| `delImm(idx)` | `ov-imm` | `closeImmFiche()` si `_currentImmFiche.entId/immId` matchent |
| `delEnt(id)`  | `ov-ent` | `closeEntFiche()` si `_currentEntFiche === id` |
| `delBail(ref)` | `ov-bail` | refresh `rLogFiche()` si on est sur la fiche du bien |

Le wrapper `_undoOp` reste intact (Ctrl+Z restaure toujours la donnée en DB).

---

## Volet 2 — v14.27 : modale immeuble autonome (« 1 création = 1 bulle »)

### Symptôme
> 💬 « on a toujours le problème entre les bulles entité et immeuble »
> 💬 (rappel 2026-05-02) « la création immeuble se fait dans la bulle bailleur pourquoi? c'est nul. en plus il y a plusieurs boutons enregistré un ou dessus de l'autre. une création une bulle »

Reproduction :
1. « + Bailleur » → modale entité s'ouvre. La modale contient une section « Immeubles » + bouton « + Immeuble ».
2. Clic « + Immeuble » → la modale `#ov-imm` s'empile **par dessus** `#ov-ent`. Deux bulles superposées.
3. Pire : « + Immeuble » depuis vue Biens (1 entité existante) ouvrait `ov-ent` AUTOMATIQUEMENT puis `ov-imm` dessus.

### Cause
Reliquat de la version inline (avant v14.20) : la modale entité hébergeait la liste + le bouton de création. v14.20 a extrait le formulaire en modale dédiée, mais le bouton est resté dans `ov-ent`. Résultat : `ov-ent` est un passage obligé pour atteindre `ov-imm`.

### Fix v14.27 — refonte complète des flux

**HTML**
- ❌ Section « Immeubles » + bouton `+ Immeuble` retirés de `ov-ent`
- ❌ `ent-imm-list` / `ent-add-imm-btn` / `ent-imm-hint` retirés (remplacés par un texte d'info masqué)
- ✅ Hidden input `imm-ent-id` ajouté dans `ov-imm` → la modale immeuble est **autoportante** (porte sa propre référence d'entité)

**JS — fonctions imm refactorées avec `entIdOverride`**
- `addImmForm(entIdOverride)` — accepte l'entId en param, écrit dans `imm-ent-id`. Fallback legacy : `ent-edit-id` (modale entité) puis `_currentEntFiche` (fiche bailleur).
- `editImm(idx, entIdOverride)` — idem
- `delImm(idx, entIdOverride)` — idem + fallback `_currentImmFiche.entId`
- `saveImm()` — lit l'entId depuis `imm-ent-id` (fallback `ent-edit-id`). Refresh contextuel : `rEntFiche()` ou `rBiens()` selon page courante.
- `_syncOvImmEntLabel()` — résout l'entité par cascade (`imm-ent-id` → `ent-edit-id` → `_currentEntFiche`).

**JS — flux de création directs (plus d'ov-ent intermédiaire)**
- `openNewImm()` (bouton vue Biens) :
  - 0 entité → toast + `openNewEnt()` (création bailleur d'abord)
  - 1 entité → `addImmForm(ents[0].id)` direct
  - N entités → picker `#ov-imm-picker` → `addImmForm(entId)` direct
- `_confirmImmPicker()` → `addImmForm(entId)` direct (plus d'`openNewEnt()`)

**Fiche bailleur 360°**
- ✅ Bouton « + Immeuble » ajouté en haut de la grille immeubles : `addImmForm(${ent.id})`
- ✅ Empty state remis à jour : « Cliquez + Immeuble ci-dessus »

**Menu ⋮ carte building (vue Biens + fiche bailleur)**
- ❌ Avant : `if(ref) → actions logement` masquait `else if(kind==='building')` (jamais atteint quand l'immeuble avait des logements)
- ✅ Après : `if(kind==='building')` PRIORITAIRE → menu immeuble dédié :
  - 📋 Voir détails (→ `openImmFiche`)
  - ✏ Modifier l'immeuble (→ `editImm` direct, sans ov-ent)
  - 🗑 Supprimer l'immeuble (→ `delImm` direct)
- Cas « Logements isolés » (carte virtuelle d'orphelins) : retombe sur le menu logement legacy

### Compat / non-régression
- `renderImmList(imms)` reste défini en no-op safe (early-return si `ent-imm-list` absent) — pas de crash sur appels legacy depuis `openNewEnt`.
- `_syncEntImmAddBtn()` idem (early-return si `ent-add-imm-btn` absent).
- Les hooks DRIVE-ARBORESCENCE (`_drvHookEnsureImmeuble`, `_drvHookRename`, `_drvHookTrash`) sont préservés à l'identique dans `saveImm` / `delImm`.
- L'UNDO-OP reste fonctionnel sur `delImm`.

---

## Critères d'acceptance

### v14.26 (suppression)
- [x] Cliquer 🗑 dans fiche 360° logement → modale fermée + redirect Biens
- [x] Cliquer 🗑 dans fiche 360° immeuble → redirect Biens (mode bailleurs)
- [x] Cliquer 🗑 dans fiche 360° bailleur → redirect Biens
- [x] Cliquer 🗑 dans modale d'édition → modale fermée
- [x] FAB Annuler (Ctrl+Z) reste fonctionnel
- [x] Aucune régression sur le toast de confirmation

### v14.27 (modale immeuble autonome)
- [x] Modale entité ne contient PLUS de section Immeubles
- [x] « + Immeuble » depuis fiche bailleur 360° → `ov-imm` direct (pas d'ov-ent)
- [x] « + Immeuble » depuis vue Biens (1 entité) → `ov-imm` direct
- [x] « + Immeuble » depuis vue Biens (N entités) → picker → `ov-imm` direct
- [x] Menu ⋮ carte immeuble → 3 actions (voir / modifier / supprimer) — plus le menu logement par erreur
- [x] Édition immeuble depuis menu ⋮ → `ov-imm` seul, pas d'`ov-ent` derrière
- [x] Suppression immeuble : modale fermée + fiche bailleur/Biens refresh + UNDO fonctionnel
- [x] Création immeuble depuis fiche bailleur : refresh immédiat de la liste

---

## Volet 3 — v14.28 : REFRESH-LIVE après chaque mutation (création + édition + suppression)

### Symptôme
> 💬 « quand on enregistre, le logement / entité ou autre ne s'affiche pas directement. C'est idem que la suppression. Il faut que si supprimer ça disparaisse de suite, si créé apparition direct »

Reproduction : sur la fiche immeuble 360°, cliquer « + Ajouter un logement » → toast « Logement enregistré » → la page reste vide (KPIs à 0, liste vide). Reload manuel nécessaire.

### Cause
Les fonctions de sauvegarde (`saveParamLog`, `saveBail`, `saveMv`, `saveQuit`, `saveEnt`, `saveImm`) appelaient seulement le renderer de leur **onglet d'origine** (`rBiens`, `rBaux`, `rMv`, `rQuit`, `rBailleurs`). Si l'utilisateur était sur une **fiche 360°** (log/imm/ent), la page restait figée car son `rXxxFiche()` n'était pas dans la chaîne d'appel.

Idem pour les fonctions de suppression wrappées dans `_undoOp` : la closure de mutation n'incluait pas de refresh des fiches 360°.

### Fix v14.28 — helper centralisé `_refreshAfterMutation()`

**Helper unique** déclaré près de `currentPage` :

```js
function _refreshAfterMutation() {
  switch(currentPage) {
    case 'log-fiche': rLogFiche(); break;
    case 'imm-fiche': rImmFiche(); break;
    case 'ent-fiche': rEntFiche(); break;
    case 'biens':     rBiens();    break;
  }
}
```

**Sites patchés** (appel ajouté après `saveDB()` ou dans la closure `_undoOp`) :

| Catégorie | Fonction | Site |
|---|---|---|
| Save | `saveParamLog` | après `rBiens()` |
| Save | `saveBail` | après `rBaux()` |
| Save | `terminerBail` | après `rBaux()` |
| Save | `saveMv` | après `rMv()` |
| Save | `saveQuit` | après `rQuit()` |
| Save | `saveEnt` | après `rBailleurs()` |
| Save | `saveImm` | après `closeM('ov-imm')` (remplace switch custom v14.27) |
| Save | `saveAss` | après `rAss()` |
| Save | `saveMrh` | après `rAss()` |
| Del | `delLog` | dans `_undoOp` closure |
| Del | `delImm` | dans `_undoOp` closure (remplace switch custom v14.27) |
| Del | `delEnt` | dans `_undoOp` closure |
| Del | `delBail` | dans `_undoOp` closure (remplace check explicite log-fiche) |
| Del | `delMv` | dans `_undoOp` closure |
| Del | `delQuit` | dans `_undoOp` closure |
| Del | `delEDL` | dans `_undoOp` closure |
| Del | `delAss` | dans `_undoOp` closure |
| Del | `delMrh` | dans `_undoOp` closure |
| Del | `delIRL` | dans `_undoOp` closure |

### Critères d'acceptance

- [x] Création d'un logement depuis fiche immeuble 360° → la carte logement apparaît immédiatement + KPIs (Logement/Loué/Loyer HC) mis à jour
- [x] Création d'un mouvement depuis sous-onglet Compta de la fiche logement → la ligne apparaît immédiatement + KPIs annuels mis à jour
- [x] Édition d'un bail depuis fiche logement → bandeau Locataire actuel mis à jour immédiatement
- [x] Suppression d'un logement, immeuble, entité, bail, mouvement, quittance, EDL → carte/ligne disparaît immédiatement
- [x] FAB Annuler (Ctrl+Z) reste fonctionnel sur toutes les suppressions
- [x] Aucun appel sur page non concernée (helper ne fait que switch sur `currentPage`)

## Journal

- 2026-05-02 (matin) : créé · fix v14.26 livré (commit `8743d69`) · 4 sites patchés (delLog/delImm/delEnt/delBail)
- 2026-05-02 (midi) : volet 2 (UX-IMM-MODAL) livré v14.27 · refonte complète flux modale immeuble · principe « 1 création = 1 bulle » respecté à 100% · menu ⋮ carte building corrigé (kind prioritaire sur ref)
- 2026-05-03 : volet 3 (REFRESH-LIVE) livré v14.28 · helper centralisé `_refreshAfterMutation()` · 19 sites patchés · création/édition/suppression désormais reflétées instantanément sur fiche 360° courante
