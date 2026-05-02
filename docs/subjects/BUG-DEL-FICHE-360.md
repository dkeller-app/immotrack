# BUG-DEL-FICHE-360 — La suppression ne ferme pas la modale / ne quitte pas la fiche 360°

**Status** : ✅ **Livré v14.26** · **Prio** : P1 (régression UX) · **Taille** : XS (~30 min)
**Détecté** : 2026-05-02
**Lié à** : UNDO-OP (v14.21-24, frosty-stonebraker) · ARCHI-DB-DOUBLONS · FICHES-PARITE-360

## Symptôme utilisateur

> 💬 2026-05-02 : « quand je supprime, ça ne supprime pas directement avec soit retour en arrière soit disparition de la bulle »

Reproduction :
1. Ouvrir la fiche 360° d'un logement / immeuble / bailleur (ou la modale d'édition)
2. Cliquer sur 🗑 Supprimer
3. Confirmer
4. **Bug** : la modale reste ouverte, ou la page fiche 360° reste affichée avec un identifiant désormais orphelin (élément supprimé en DB mais panneau persistant). L'utilisateur doit cliquer manuellement « ✕ » ou recharger.

## Cause racine

Lors de la session frosty-stonebraker (UNDO-OP v14.21-24), les fonctions `delLog` / `delImm` / `delEnt` / `delBail` ont été enveloppées dans `_undoOp(label, fn)` pour permettre l'annulation Ctrl+Z. La mutation DB est désormais **différée** dans la closure `fn`, mais aucun appel à `closeM()` ou `closeXFiche()` n'a été ajouté avant ou après l'`_undoOp`.

Avant la refacto (v14.20), la mutation immédiate suivie de `rBaux()` / `rBiens()` / `rBailleurs()` masquait partiellement le bug parce que la liste sous-jacente disparaissait — mais la modale ouverte ou la page fiche 360° en cours restait à l'écran.

## Fix v14.26

Pour chaque fonction de suppression, ajout **avant** l'`_undoOp` :
1. `closeM('ov-X')` pour fermer une éventuelle modale d'édition de la même catégorie
2. Si on est sur la fiche 360° de l'élément en train d'être supprimé, appeler `closeXFiche()` pour rediriger vers le hub Biens

```js
function delLog(ref) {
  if(!confirm2(`Supprimer le logement ${ref} ? ...`)) return;
  // BUG-DEL-FICHE-360 v14.26
  closeM('ov-log');
  if(currentPage === 'log-fiche' && _currentLogFicheRef === ref) closeLogFiche();
  _undoOp(`Suppression du logement ${ref}`, () => { ... });
  _undoToast(`Logement ${ref} supprimé`);
}
```

Pattern appliqué aux 4 fonctions :

| Fonction | Modal fermée | Redirect fiche 360° |
|---|---|---|
| `delLog(ref)` | `ov-log` | `closeLogFiche()` si `_currentLogFicheRef === ref` |
| `delImm(idx)` | `ov-imm` | `closeImmFiche()` si `_currentImmFiche.entId/immId` matchent |
| `delEnt(id)`  | `ov-ent` | `closeEntFiche()` si `_currentEntFiche === id` |
| `delBail(ref)` | `ov-bail` | refresh `rLogFiche()` si on est sur la fiche logement (pas un closeFiche, le logement existe toujours, c'est juste son bail courant qui change) |

## Compatibilité UNDO-OP préservée

Le pattern `_undoOp` reste intact : la fermeture de la modale / fiche se fait **avant** l'enregistrement de l'opération annulable, donc Ctrl+Z restaurera bien la donnée en DB. Si l'utilisateur veut revoir la fiche après undo, il devra rouvrir manuellement (acceptable car c'est l'inverse du flux normal).

## Critères d'acceptance

- [x] Cliquer sur 🗑 dans une fiche 360° de logement → modale fermée + redirect vers Biens
- [x] Cliquer sur 🗑 dans une fiche 360° d'immeuble → redirect Biens (mode bailleurs)
- [x] Cliquer sur 🗑 dans une fiche 360° de bailleur → redirect Biens
- [x] Cliquer sur 🗑 dans la modale d'édition → modale fermée
- [x] Cliquer sur 🗑 dans la liste tabulaire (rBaux, rBiens, …) → comportement existant préservé
- [x] FAB Annuler (Ctrl+Z) reste fonctionnel pour les 4 cas
- [x] Aucune régression sur le toast de confirmation

## Journal

- 2026-05-02 : créé · fix livré v14.26 (commit à venir) · diagnostic post-merge frosty-stonebraker · 4 sites patchés (delLog/delImm/delEnt/delBail)
