# BUG-DRIVE-SAVELOOP — Boucle de sauvegarde infinie + auto-pull jamais déclenché

**Status** : ✅ Fixé v15.118 · **Prio** : **P0 critique** (sync inter-onglets/appareils cassée + FAB figé) · **Taille** : XS (fix) · **Présent depuis** : v14.0
**Détecté** : 2026-05-20 (user, conditions réelles, 2 onglets Opera)

## Symptômes user
1. FAB Drive (haut droite) **figé sur « Sauvegarde… »** en permanence.
2. Une modif faite dans un onglet **n'apparaît jamais dans l'autre onglet** (ni sur un autre appareil).
3. Le compteur de pull « 44 modif(s) locale(s) plus récente(s) que Drive » ne descend jamais à 0.
4. Toast vert « ✓ Drive » qui réapparaît en boucle.

## Cause racine

Boucle de rétroaction dans le push Drive :

```js
function _driveAutoSave() {                       // déclenché par _markDriveDirty (debounce 800ms)
  if(_driveToken && _driveUnsaved && !_driveSaving) _driveAutoSaveNow();
}

async function _driveAutoSaveNow() {
  _driveSaving=true; ...
  try { ...push... ; _driveUnsaved=false; }       // succès : on se croit propre
  finally {
    _driveSaving=false;
    saveDB();          // ← saveDB() appelle _markDriveDirty() !
    ...
  }
}
```

`saveDB()` appelle **inconditionnellement** `_markDriveDirty()` qui :
- remet `_driveUnsaved = true`,
- re-planifie `_driveAutoSave` 800 ms plus tard.

→ Après CHAQUE push réussi, l'état est re-marqué « sale » → un nouveau push part 800 ms après →
**boucle infinie** de sauvegarde (~1 push/seconde), pour toujours.

### Conséquence aggravante (le vrai poison)
`_driveAutoPull` (sync multi-device, toutes les 60 s + au focus) commence par :
```js
async function _driveAutoPull() {
  if (_drivePulling || _driveSaving) return;
  if (!_driveTokenValid()) return;
  if (_driveUnsaved) return;      // ← sort si modifs locales en attente
  ...
}
```
Comme `_driveUnsaved` est **toujours true** (la boucle le remet à chaque cycle), `_driveAutoPull`
sort immédiatement à chaque appel → **le tab ne fait JAMAIS de pull** → il ne reçoit jamais les
modifs des autres onglets/appareils. D'où le symptôme « la modif n'apparaît pas dans l'autre onglet ».

Quand 2 onglets sont ouverts, les deux bouclent et se poussent mutuellement leur version sur Drive
sans jamais pull → ping-pong permanent, aucune convergence.

## Fix v15.118

Dans le `finally` de `_driveAutoSaveNow`, **ne plus appeler `saveDB()`** (le push ne mute pas la DB).
On persiste juste `localStorage` directement, **sans** `_markDriveDirty()` :
```js
finally {
  if(_driveRetryCount === 0 || _driveRetryCount >= _DRIVE_MAX_RETRIES){
    _driveSaving=false;
    try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch(_) {}  // au lieu de saveDB()
    _updateDriveFab();
  }
}
```
Effet : après un push réussi, `_driveUnsaved` reste `false` (posé dans le try) → pas de re-planification →
plus de boucle → `_driveAutoPull` peut enfin tourner → sync inter-onglets/appareils rétablie → FAB
repasse sur `✓ Drive · à l'instant`.

Bonus : ça évite aussi des entrées undo/audit parasites (saveDB déclenchait `_undoOnSaveDB` /
`_auditFlushPending` à chaque push, ce qui n'a aucun sens pour une synchro).

Logs diagnostic ajoutés : `[drive] push → début (N entité(s))` + `[drive] push ✓ terminé en Xms`.

**915 tests Vitest OK.** Test Drive réel côté user requis.

## Journal
- 2026-05-20 : détecté (2 onglets ne se synchronisent pas + FAB figé). Cause = saveDB() dans le finally de _driveAutoSaveNow → boucle infinie + auto-pull jamais exécuté. Fix v15.118 (persist localStorage direct sans markDirty). Bug latent depuis v14.0.
