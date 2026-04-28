# DRIVE-2J — Field-level conflict resolution

**Status** : ⬜ À faire · **Prio** : P3 · **Taille** : M (5-7h)
**Lié à** : DRIVE-2B (timestamps livré), DRIVE-2F, DRIVE-2G
**Priorité** : Nice-to-have, V1+

## Contexte

Aujourd'hui Phase 2B fait un merge **par-objet** : si User A modifie loyer du bail X et User B modifie DG du même bail X, le `_modifiedAt` de l'objet bail entier est mis à jour des deux côtés. Au merge :
- Drive plus récent → écrase tout (perd la modif de l'autre user)
- Local plus récent → garde tout local (perd la modif Drive)

Solution : merger **field par field** au lieu d'object par object.

## Scope

### Phase 2J-1 : structure de données
- [ ] Au lieu de `obj._modifiedAt` (1 timestamp par objet), stocker `obj._modifiedFields = { hc: 'iso', ch: 'iso', ... }` (1 timestamp par champ modifié)
- [ ] Helper `_stampField(obj, fieldName)` au lieu de `_stamp(obj)` global
- [ ] Migrer les 9 fonctions de save : remplacer `_stamp(obj)` par boucle sur les champs effectivement modifiés
  - Nécessite tracker les champs modifiés au save (diff avant/après) ou stamper TOUS les champs au save (granularité par-champ mais même date)

### Phase 2J-2 : merge field-level
- [ ] Au merge, pour chaque champ de l'objet :
  - Compare `driveObj._modifiedFields[field]` vs `localObj._modifiedFields[field]`
  - Drive plus récent → prendre champ Drive
  - Local plus récent → garder champ local
- [ ] Si même champ modifié des 2 côtés à des `_modifiedAt` différents (vrai conflit) :
  - Toast `User1 et toi avez modifié 'loyer' du bail F-001 en conflit. Garde lequel ?`
  - Modal de résolution avec preview des 2 valeurs

### Phase 2J-3 : impact backup et payload
- [ ] Mettre à jour `_buildEntityPayload` pour inclure `_modifiedFields`
- [ ] Vérifier que la taille du payload n'explose pas (ajout d'1 ISO date par champ → ~30 bytes/field × 50 fields/bail × N baux = peut grossir)
- [ ] Strategie : ne stocker `_modifiedFields` que pour les champs modifiés depuis la création (pas tous les champs)

### Phase 2J-4 : tests
- [ ] Scénario 1 : User A modifie loyer, User B modifie DG sur même bail → after merge : les deux modifs préservées
- [ ] Scénario 2 : User A et User B modifient le MÊME champ → modal conflit s'affiche
- [ ] Scénario 3 : modif sur champ jamais modifié avant (pas de timestamp) → fallback sur `_modifiedAt` global

## Décisions à prendre

- [ ] **Tracker les champs modifiés au save** : diff avant/après OU stamper TOUS les champs au save ?
  - Diff avant/après : précis mais nécessite snapshot avant
  - Stamper tous : simple mais perd la précision (si user save sans rien changer, tous les fields sont mis à jour)
  - **Reco** : stamper tous les champs au save ; le coût en faux positifs (champ marqué récent même si pas modifié) est faible

- [ ] **Conflit même-champ : auto-merge ou modal user ?**
  - Auto-merge (last-write-wins) : pas idéal mais transparent
  - Modal : interrompt l'UX
  - **Reco** : modal mais avec "ne plus me demander pour cette session"

- [ ] **Quel scope objects** : tous ou seulement bail+mouvement (le reste est moins critique) ?
  - **Reco** : tous les objets pour cohérence

## Prompt de démarrage de session

```
On attaque DRIVE-2J.
Lis : BACKLOG.md, docs/subjects/DRIVE-2J.md, docs/subjects/DRIVE-2B (commit 619f8ff).

Prérequis : DRIVE-2H + 2F + 2G livrés.

Workflow :
1. Confirme stratégie tracking champs (diff vs stamp-all)
2. Refactor _stamp en _stampField + boucle dans 9 fonctions save
3. Refactor _drvWins → _drvWinsField avec timestamp par-champ
4. Modal de résolution de conflit même-champ
5. Tests 3 scénarios

Estimation : 5-7h.
Important : c'est un nice-to-have. Ne PAS le faire avant DRIVE-2H/2F/2G qui sont bloquants.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite réflexion conflit multi-users session pilotage
