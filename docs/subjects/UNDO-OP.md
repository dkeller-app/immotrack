# UNDO-OP — Bouton « Annuler la dernière opération » multi-niveau

**Status** : ✅ Livré v14.21-24 (2026-05-02) · **Prio** : P0 · **Taille** : M (~4-6h)
**Détecté** : 2026-05-02
**Lié à** : DRIVE-ARBORESCENCE (Phase A livrée v14.20 — partage hooks suppressions) · DRIVE-2F (OCC futur, complémentaire)

## Résumé livraison
- **v14.21** (commit `07e591a`) Phase 1 : cœur stack RAM 20 niveaux + helpers `_undoSnapshot`/`_undoOp`/`_undoUndo`/`_undoClear`/`_undoOnSaveDB`/`_undoOnSaveDBSuccess` + hook saveDB symétrique + init aux 2 sites loadDB
- **v14.22** (commit `9b9cf3f`) Phase 2 : UI — CSS `#fab-undo` bottom-left, `_undoUIInit()` injection FAB + listener Ctrl+Z global avec guard `_inEditableField`, helper `_undoToast(message, type)` pour bouton « Annuler » inline
- **v14.23** (commit `bb1f23d`) Phase 3 : 11 wrappers `_undoOp` sur les suppressions critiques (delLog, delImm, delEnt, delMv, delBail, delBailHist, delAss, delMrh, delIRL, delQuit, delEDL) avec libellés explicites + `_undoToast`
- **v14.24** (commit `4c5b4f5`) Phase 4 : flag `_drivePullChangedDB` + helper `_drvMark()` — 24 instrumentations dans `_mergeEntityPayload` + 2 dans `_mergeGlobalPayload` ; `_driveLoadEntityFiles` vide la stack undo après pull avec modifs externes (multi-device safety)

## Contexte
Demande utilisateur 2026-05-02 :
> 💬 « Optimisation très urgente et importante à faire. Il faut un bouton annuler dernière opération. Il faut pouvoir revenir en arrière plusieurs fois si nécessaire non ? »

L'app ImmoTrack n'a aujourd'hui aucun mécanisme d'annulation. Une fausse manipulation (suppression accidentelle d'une entité, d'un logement, d'un bail, d'un EDL) est immédiate et irréversible côté DB. Drive et la corbeille Drive (mise en place via DRIVE-ARBORESCENCE Phase A) servent de filet long-terme, mais pas pour la fenêtre courte « je viens de cliquer, je m'en rends compte tout de suite ».

UNDO-OP introduit un mécanisme d'annulation multi-niveau standard (Ctrl+Z + bouton + toast inline) qui couvre 99 % des fausses manips dans la session courante.

## Décisions arbitrées (Q&A 2026-05-02)

| # | Question | Réponse | Justification |
|---|----------|---------|---------------|
| Q1 | Cas d'usage déclencheur ? | **A — Suppression accidentelle** d'entité / immeuble / logement / bail / EDL | Le besoin réel exprimé. |
| Q2 | Scope des opérations annulables ? | **B — Toute écriture DB** (création / modif / suppression) | Instrumentation unique dans `saveDB()` ; impossible d'oublier d'instrumenter une nouvelle fonction `delX` à l'avenir. |
| Q3 | Profondeur + persistance ? | **A — RAM only**, ~20 niveaux, perdu au refresh | Drive + corbeille Drive Phase A couvrent déjà le long-terme. Pas de complexité IndexedDB ou fichier Drive dédié. |
| Q4 | Granularité (1 saveDB = 1 entrée ?) ou regroupement ? | **C — Hybride avec libellés** : auto-debounce 500 ms générique + libellés explicites pour les suppressions critiques | Libellé clair sur les opérations à risque (« Suppression du logement F-001 »), anonyme ailleurs. |
| Q5 | UI : où et comment ? | **D — Combo toast inline + FAB bas-gauche + Ctrl+Z** | Toast = réflexe immédiat, FAB = filet 30 s plus tard, Ctrl+Z = bonus desktop. |
| Q6a | Multi-device : vider stack au pull Drive externe ? | **Oui** | Évite d'écraser le travail d'un autre device en undo-ant local. |
| Q6b | Suppression Drive folder Phase A : untrash auto à l'undo ? | **Non en V1** (folder reste à la corbeille 30 j), V2 si demande | Limite la complexité initiale ; toast prévient l'utilisateur. |
| Q6c | Confirm dialog avant un undo ? | **Non** | Doit être ultra-rapide pour servir le réflexe « oups ». |
| Q6d | Redo (Ctrl+Y) ? | **Non en V1** | Pas demandé. Refaire l'op manuellement reste simple. |
| Q6e | Mode readonly Drive bloque undo ? | **Oui** | Cohérent : l'undo est un saveDB déguisé, doit suivre les mêmes règles. |

## Architecture cible

**3 acteurs au runtime** :

1. **Capteur** — hook dans `saveDB()` (~l.5709 `index.html`). À chaque écriture DB :
   - Si `_undoNextLabel` non null (set par `_undoOp`) → push immédiat avec libellé.
   - Sinon → snapshot capturée immédiatement, push différé 500 ms (auto-debounce → entrées « Modification » anonymes).

2. **Stack** — `_undoStack: Array<{label: string, snapshot: object, ts: number}>`, capée à `UNDO_MAX = 20` (FIFO `shift()`). Vidée à 2 occasions : (a) refresh navigateur (RAM only), (b) pull Drive ayant détecté une modif externe.

3. **Restituteur** — 3 surfaces d'activation appellent toutes `_undoUndo()` :
   - **Toast inline** post-`_undoOp` (8 s, bouton « ↶ Annuler »)
   - **FAB** position fixed bottom-left, visible si stack non vide
   - **Ctrl+Z** (avec guard `_inEditableField` pour ne pas court-circuiter l'undo natif des inputs)

`_undoUndo()` pop la dernière entrée → wipe DB + `Object.assign(DB, snapshot)` → `saveDB()` (push Drive) → re-render via `go(currentPage)` → toast confirmation.

**Wrapper métier `_undoOp(label, fn)`** appliqué aux fonctions critiques :
- `delEnt`, `delImm`, `delLog`, `delBail`, `delEDL`, `delMouvement`, `delQuittance`, `delIRL` (~8 sites)

```js
function delLog(ref) {
  if (!confirm2(`Supprimer le logement ${ref} ?`)) return;
  _undoOp(`Suppression du logement ${ref}`, () => {
    // ... code existant inchangé ...
  });
}
```

**Subtilité critique** : la snapshot capture l'état **AVANT** l'écriture en cours. Le `structuredClone(DB)` est exécuté immédiatement (synchrone) avant que l'écriture ne soit committée ; seul le `push` dans la stack est différé en mode debounce.

## Scope par phase

### Phase 1 — Cœur undo + hook saveDB (P0/S, ~2 h)
- [ ] Bloc état + helpers (`_undoStack`, `_undoSnapshot`, `_undoCapture`, `_undoOp`, `_undoUndo`, `_undoClear`, `_undoUIRefresh`) inséré près de `saveDB`
- [ ] Hook minimal dans `saveDB()` (capture pré-écriture)
- [ ] Flag `_undoSuppressCapture` pour éviter récursion lors du restore
- [ ] **Tests console** : `_undoOp('test', () => DB.params.test=42); _undoUndo()` → DB.params.test === undefined
- [ ] **Commit** « v14.21 : UNDO-OP Phase 1 — cœur stack + hook saveDB »

### Phase 2 — UI (FAB + Ctrl+Z + toast inline) (P0/S, ~1.5 h)
- [ ] FAB bottom-left injecté au boot (cohérence design system : variables CSS, dark mode, responsive 44 px touch)
- [ ] Tooltip dynamique sur FAB avec libellé prochain undo
- [ ] Listener `keydown` global avec guard `_inEditableField`
- [ ] Toast inline étendu : helper `showToast` accepte déjà `extraHTML` (l.5817) → utiliser pour bouton « ↶ Annuler » dans les toasts post-`_undoOp`
- [ ] **Tests visuels** : suppression logement → toast inline visible → clic Annuler → logement revient ; FAB visible avec tooltip ; Ctrl+Z dans textarea = natif (pas notre undo)
- [ ] **Commit** « v14.22 : UNDO-OP Phase 2 — UI FAB + Ctrl+Z + toast inline »

### Phase 3 — Wrappers `_undoOp` sur les ~8 fonctions critiques (P0/S, ~1 h)
- [ ] `delEnt`, `delImm`, `delLog`, `delBail` (à grep — peut être différentes signatures), `delEDL`, `delMouvement`, `delQuittance`, `delIRL`
- [ ] Vérifier qu'aucune n'a déjà un workflow async pré-suppression (Drive trash) qui interagirait mal — si oui, capturer le snapshot AVANT l'attente Drive
- [ ] **Tests visuels** : 1 par 1 — supprimer puis undo, vérifier réapparition complète
- [ ] **Commit** « v14.23 : UNDO-OP Phase 3 — wrappers libellés sur 8 suppressions critiques »

### Phase 4 — Hook pull Drive (vidage stack multi-device) (P1/XS, ~30 min)
- [ ] Identifier le merge point dans `_driveLoadEntityFiles` (~l.22890+) où `_drvWins` peut retourner true
- [ ] Set un flag local `pullChangedDB` quand au moins 1 merge wins
- [ ] Après merge complet : `if (pullChangedDB) _undoClear('drive_pull')` + toast info
- [ ] **Tests** : modif sur device A, ouvrir l'app sur device B → toast « historique effacé » visible
- [ ] **Commit** « v14.24 : UNDO-OP Phase 4 — vidage stack au pull Drive externe »

### Phase 5 — Sync pilotage final
- [ ] Update `BACKLOG.md` : UNDO-OP → ✅ Livré v14.21-24
- [ ] Update `docs/subjects/UNDO-OP.md` : status + journal détaillé
- [ ] **Commit** « v14.X : Pilotage : UNDO-OP livré »

## Edge cases & erreurs

| Cas | Traitement |
|-----|------------|
| DB volumineuse (>10 Mo) | `structuredClone` synchrone → si latence perçue, baisser `UNDO_MAX` à 10. Pas de pré-optimisation. |
| Stack pleine (>20) | `shift()` la plus ancienne, transparent |
| Undo en mode readonly Drive | Guard explicite avant pop → toast warn, stack intacte |
| Photos IndexedDB | Restaurées implicitement (les binaires ne sont jamais purgés en cascade) |
| Drive folders trashés (Phase A) | Restent à la corbeille en V1 ; toast undo précise « le dossier Drive reste à la corbeille (récup 30 j) » |
| Wizard multi-step | Auto-debounce 500 ms agrège ; étapes lentes → multiples entrées (acceptable) |
| Multi-tabs ouverts | Stacks RAM séparées par tab. Pull Drive vide les deux. Pas de sync inter-tabs (V2 si demande) |
| Ctrl+Z dans champ éditable | Pas intercepté → undo natif du navigateur |
| Récursion saveDB↔undo | Flag `_undoSuppressCapture` |
| Refresh F5 | Stack RAM perdue (voulu, Q3=A) |

## Tests manuels (critères de validation)

1. **Suppression entité** → toast « Annuler » → clic → entité revient avec immeubles/logements ✓
2. **Suppression logement** → undo → logement + bail + EDL + mouvements liés tous restaurés ✓
3. **Modif fiche en rafale** (5 champs <500 ms) → 1 seul undo restaure l'état d'origine ✓
4. **21 modifs consécutives** → la 21e éjecte la 1ère (stack toujours ≤ 20) ✓
5. **Drive déconnecté** → undo → toast warn, **rien n'est modifié** ✓
6. **Ctrl+Z dans textarea Notes** → undo natif de frappe (pas notre undo global) ✓
7. **Ctrl+Z hors champ éditable** → notre undo se déclenche ✓
8. **F5 puis Ctrl+Z** → FAB caché, Ctrl+Z sans effet (stack vidée) ✓
9. **Modif device A → ouverture device B** → toast « historique effacé » + stack vidée ✓
10. **Suppression logement → undo** → toast précise « Le dossier Drive reste à la corbeille » ✓

## Limites V1 (out-of-scope, pour V2)
- ❌ Pas de redo (Ctrl+Y)
- ❌ Pas d'untrash auto des dossiers Drive supprimés à l'undo (corbeille Drive 30 j manuelle)
- ❌ Pas de persistance entre sessions (RAM only)
- ❌ Pas de sync stack inter-tabs
- ❌ Pas de diff structurel (full snapshot DB par entrée)

## Notes utilisateur
> 💬 2026-05-02 : « Il faut un bouton annuler dernière opération. Il faut pouvoir revenir en arrière plusieurs fois si nécessaire »
> 💬 2026-05-02 : Q1=A (suppression), Q2=B (toute écriture), Q3=A (RAM 20), Q4=C (hybride libellés), Q5=D (combo), Q6 OK en bloc

## Journal
- 2026-05-02 : créé · brainstorm Q1→Q6 finalisé · spec validée par utilisateur · prêt pour writing-plans
- 2026-05-02 : ✅ Livré v14.21-24 · 4 phases en ~3h · stack 20 niveaux RAM · 11 suppressions wrappées · multi-device safety via vidage au pull Drive · approche subtile validée : `_undoLastSnapshot` capturé en fin de saveDB(N) sert de « prev » au saveDB(N+1) suivant (sémantique pré-modif sans intercepter chaque mutation). Code modifié : ~330 lignes ajoutées / ~30 modifiées sur `index.html`. Spec et plan committés en amont (`9b66946` + `4a5e2f1`).
