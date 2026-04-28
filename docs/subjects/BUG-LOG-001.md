# BUG-LOG-001 — Logement : référence non modifiable après création

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : XS
**Détecté** : 2026-04-28 (Didier, en utilisant l'app)
**Lié à** : Référentiel → Logements

## Contexte

Quand on crée un logement avec une référence (ex: `F-001`), on ne peut plus la modifier après save. Si typo ou changement de nomenclature → blocage.

C'est probablement un héritage du fait que `ref` sert de clé primaire dans `DB.baux[ref]`, `DB.equipements[ref]`, `DB.irlHistorique` (filter par ref), `DB.assurances` (champ logement), etc.

## Scope

- [ ] Vérifier dans le code si `log-ref` est en `readonly` après save (probable)
- [ ] Implémenter une **migration** de référence : si user change F-001 → F-001-bis, propager dans toutes les collections qui pointent dessus :
  - `DB.baux[oldRef]` → `DB.baux[newRef]` (renommer la clé)
  - `DB.mouvements[*].qui === oldRef` → `newRef`
  - `DB.quittances[*].logement === oldRef` → `newRef`
  - `DB.assurances[*].logement === oldRef` → `newRef`
  - `DB.mrh[*].logement === oldRef` → `newRef`
  - `DB.edl[*].logement === oldRef` → `newRef`
  - `DB.equipements[oldRef]` → `DB.equipements[newRef]`
  - `DB.irlHistorique[*].ref === oldRef` → `newRef`
  - `DB.agenda[*].logement === oldRef` → `newRef`
  - `DB.baux_historique[*].ref === oldRef` → `newRef`
- [ ] Ajouter une confirm modal "Renommer F-001 → F-001-bis ? Cela affectera N mouvements, M baux, etc."
- [ ] Stamper `_modifiedAt` sur tous les objets impactés (Phase 2B)

## Décisions à prendre

- [ ] Renommage immédiat ou en 2 étapes (créer nouveau + supprimer ancien) ?
- [ ] Faut-il interdire le renommage si bail signé en cours (référence figée légalement) ?

## Prompt de démarrage de session

```
On attaque BUG-LOG-001.
Lis BACKLOG.md, docs/subjects/BUG-LOG-001.md.
Confirme le scope (notamment les 10 collections à migrer) et propose un plan
détaillé avant de coder. Estime à XS donc une session courte (<1h).
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite remarque utilisateur dans session pilotage
