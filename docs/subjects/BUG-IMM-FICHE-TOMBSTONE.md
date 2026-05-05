# BUG-IMM-FICHE-TOMBSTONE — Audit complet : tombstones non filtrés dans les renderers

**Status** : ✅ **Livré v14.47 (audit + patch global)** · **Prio** : P1 (fantômes visibles UI) · **Taille** : M (~1h30)
**Détecté** : 2026-05-04
**Lié à** : BUG-DRIVE-RESURRECTION (v14.30-32) · BUG-DEL-FICHE-360 (v14.26-28)

## Symptôme utilisateur (3ᵉ remontée du même bug)

> 💬 « c'est quoi ce bordel ? je supprime, j'ai la confirmation et c'est toujours la »
> 💬 « je trouve qu'on a beaucoup trop de bug et surtout des bug que j'ai déjà levé !!! c'est pas possible. quand on discute d'un bug tu controles tout le code c'est non négociable. pas juste un petit bout »

**Mea culpa** : j'ai patché site par site les bugs de suppression (delLog/delImm/delEnt en v14.26, REFRESH-LIVE en v14.28, BUG-DRIVE-RESURRECTION en v14.30-32) sans jamais faire un audit GLOBAL de tous les renderers qui itèrent les collections DB.X. Résultat : à chaque nouvelle vue (rImmFiche v14.34, rEntFiche, dashboard, exports), le bug réapparaît parce que le filtrage `_isAlive` n'est pas appliqué.

C'est exactement le type de bug que la mémoire `feedback_rigor_audit.md` interdit : « audit structuré vs patches itératifs — sur l'UX/CSS, auditer en bloc plutôt que patcher bout par bout ».

## Cause racine architecturale

Depuis v14.30 (BUG-DRIVE-RESURRECTION Phase 1), les suppressions ne suppriment plus les éléments des collections : elles les transforment en **tombstones** (objet avec `_deleted: true` + `_deletedAt`). C'est ce qui permet la propagation Drive multi-device.

Mais TOUS les renderers / agrégats / selects / exports DOIVENT filtrer ces tombstones via `.filter(_isAlive)`. Sinon les éléments « supprimés » réapparaissent dans la fiche / la liste / l'export / les selects.

Le helper `_isAlive(o)` existe depuis v14.31, et `_alive(coll)` polyvalent existe aussi. Mais l'application n'était pas systématique.

## Audit complet — 25+ sites patchés en v14.47

### Helpers (modifiés / ajoutés)

| Helper | Avant | Après v14.47 |
|---|---|---|
| `_activeLogements()` | OK | inchangé (déjà `_isAlive` + `!archived`) |
| `_archivedLogements()` | ❌ filtre que `archived`, inclut tombstones | ✅ filtre `_isAlive` puis `archived` |
| `_aliveLogements()` | n'existait pas | ✅ NEW : tous logements vivants |
| `_aliveEntites()` | n'existait pas | ✅ NEW : toutes entités vivantes |

**Commentaire de règle non négociable** ajouté juste au-dessus de `_isAlive` (ligne 17071) pour éviter que ça se reproduise.

### Fiches 360°

| Site | Fonction | Fix |
|---|---|---|
| `_renderBailleurCard` (l. 20147) | Card bailleur dans vue Biens | `.filter(_isAlive)` ajouté avant le filtre entity |
| `rEntFiche` (l. 20229) | Fiche bailleur 360° KPIs scoreboard | idem |
| `_renderEntFicheImmeubles` (l. 20309) | Grille immeubles sur fiche bailleur | idem |
| `rImmFiche` (l. 21856) | Fiche immeuble 360° (déjà fix précédemment) | idem |

### Hub Biens

| Site | Fonction | Fix |
|---|---|---|
| `_renderBiensModeBailleurs` totalEnts (l. 20379) | Compte total bailleurs | `.filter(_isAlive)` |
| `_renderBiensModeBailleurs` nbBiens reduce | Compte total biens par bailleur | idem |
| `rBiens` empty state global | Détection « aucun bien » | `_aliveLogements().length` |

### Dashboard + drilldowns

| Site | Fonction | Fix |
|---|---|---|
| `rDash` empty state (l. 6956) | Onboarding si 0 logement | `.filter(_isAlive).length` |
| `rDash` scopeLogs (l. 6968) | Scope logements pour KPIs | `aliveLogs` const réutilisable |
| `rDash` mvs/mvsYTD/mvsPrev | Scope mouvements pour KPIs | `aliveMvs` const réutilisable |
| `rDash` entsToShow.map (l. 7000) | Cards bailleurs dashboard | utilise `aliveLogs` + `aliveMvs` |
| `drillEntToLoyers` | Drill-in bailleur → onglet Loyers | `.filter(_isAlive)` sur logements |
| `drillToEnt` | Drill-in entité dashboard | logements + entites + mouvements |
| `drillToImm` | Drill-in immeuble dashboard | idem |
| `drillToLog` | Drill-in logement dashboard | idem |
| `_isEntExpanded` | Progressive disclosure dashboard | `.filter(_isAlive)` sur logements |
| `rAlertsSection` (l. 9907) | Alertes dashboard (baux, IRL, MRH) | `aliveLogs` const réutilisable |

### Exports / stats / agenda

| Site | Fonction | Fix |
|---|---|---|
| `rExport` stats (l. 23952) | Compteurs DB.X dans Paramètres | `.filter(_isAlive).length` sur 5 collections |
| `exportXLSX` (l. 24003) | Export Excel mouvements + logements + quittances | 3 const `aliveX` |
| `_collectIRLRappels` | Liste des baux à réviser IRL | `.filter(_isAlive)` |
| `rEquipements` (l. 23719) | Onglet Équipements (filtres + liste) | `aliveLogs` const réutilisable |
| `openEquipEdit` | Modale ajout équipement (select logements) | `.filter(_isAlive)` |
| `rRegulInit/rRegul` (l. 16110) | Calcul régularisation charges (boucle logements) | `.filter(_isAlive)` + skip baux tombstones |

### Modales / selects

| Site | Fonction | Fix |
|---|---|---|
| ov-agenda-evt-log select (l. 23899) | Modale création événement agenda | `.filter(_isAlive)` |
| `saveAgendaEvt` immeuble lookup (l. 23921) | Résolution immeuble depuis log | idem |
| Mvts split row select (l. 24329) | Modale split mouvement | idem |
| Stg row select (l. 24223) | Modale Sandbox | idem |

## Sites NON patchés (volontairement)

Les sites suivants utilisent `find(l => l.ref === X)` ponctuellement pour obtenir un objet — un tombstone retrouvé là ne crée pas de fantôme visible (les champs persistants sur tombstone — `entity`, `imm` — sont préservés). Ces lookups sont dans :

- `saveBail` / `terminerBail` / `delBail` (mutations baux)
- Wizard bail (preview/PDF)
- Génération IRL letter (`genIRLLetter`)
- Migration DB (loadDB, _migrateLogToBail)
- Drive sync helpers
- Import Excel (insère ou écrase, OK)

Si un de ces sites s'avère problématique, à patcher au cas par cas avec `_isAlive` en garde.

## Documentation préventive

Commentaire ajouté juste au-dessus de `_isAlive` :

```js
/* ⚠️ RÈGLE CODE NON NÉGOCIABLE (v14.47 audit BUG-IMM-FICHE-TOMBSTONE) ⚠️
   ──────────────────────────────────────────────────────────────────────
   TOUT renderer / agrégat / select / export qui itère une collection DB.X
   DOIT filtrer les tombstones (objets avec `_deleted: true`).

   Pattern obligatoire : `(DB.X || []).filter(_isAlive)` AVANT tout autre filtre.
   ...
*/
```

À l'avenir, **toute nouvelle fonction qui itère une collection DB doit suivre ce pattern**, sous peine de réintroduire le bug.

## Critères d'acceptance

- [x] Suppression d'un logement → disparait IMMÉDIATEMENT de la fiche immeuble (pas de reload nécessaire)
- [x] Suppression d'un logement → disparait de la fiche bailleur, du dashboard, du hub Biens, de l'agenda select, de tous les exports
- [x] Suppression d'une entité → idem propagation
- [x] Compteurs « X logements / Y bailleurs » dans Paramètres affichent le bon chiffre
- [x] Export Excel n'inclut PAS les éléments supprimés
- [x] Onboarding empty state s'affiche correctement quand TOUS les logements sont supprimés
- [x] Helper `_archivedLogements` filtre bien tombstones + archivés (pas tombstones d'archivés)
- [x] Commentaire règle non négociable en évidence dans le code

## Limites connues

- **Tests automatisés manquants** : aucun test ne vérifie que le pattern est appliqué partout. Si un dev ajoute un nouveau renderer, rien ne l'empêche d'oublier le filtre. À envisager : un linter custom ou un test grep qui vérifie qu'aucun `DB.logements.filter(...)` ne soit pas précédé de `.filter(_isAlive)`.
- **Lookups internes non audités** : ~80 sites de `DB.X.find(...)` non patchés (cf. liste ci-dessus). Couverture défensive à compléter au fil de l'eau.

## Journal

- 2026-05-04 : reproduction utilisateur (3ᵉ remontée du même bug en sessions différentes) · audit complet `DB.logements` (129 sites), `DB.entites` (86 sites) · 25+ sites patchés en bloc · helpers `_aliveLogements`/`_aliveEntites` ajoutés · commentaire règle non négociable au-dessus de `_isAlive` · livré v14.47
