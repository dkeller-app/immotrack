# BUG-POPUP-QUITTANCE — Auto-quittance popup régressé v15.10 (P1)

> **Statut** : ✅ Livré v15.20 (Phase A2, session 2026-05-15)
> **Prio** : P1 (UX cassée, perte de confiance utilisateur)
> **Taille** : XS (~30 min)

---

## Symptôme

Bail avec toggle « 📄 Proposer quittance automatiquement à réception du loyer » activé. User saisit un paiement de loyer dans Mouvements → **aucun popup n'apparaît** pour ouvrir la quittance. Avant, le popup proposait « Ouvrir la quittance ? ».

User remontée : « *J'ai enregistré un mouvement... Je n'ai pas eu le pop up (v14.63)* ».

## Cause racine

Régression introduite par **v15.10 Sprint 11** (livraison Quittances actives + génération auto au boot).

Chaîne d'effets :

1. **v15.10 B4** ajoute `_quittancesAutoGenAtBoot()` qui pré-génère TOUTES les quittances du mois en cours à l'ouverture de l'app (si `DB.params.quittancesAutoGen = true`)
2. **v15.10 B2** ajoute un matching auto silencieux dans `saveMv` : si le paiement correspond à une quittance existante, l'associer (sans notification utilisateur)
3. **Ancien code** auto-quittance (ligne 9132) : si toggle bail `quittAutoGen = true`, créer une quittance + popup `confirm2()` pour proposer de l'ouvrir
4. **Conflit** : la quittance existe DÉJÀ (générée au boot) → l'ancien code passe dans la branche `_exists = true` → affiche `showToast('Quittance déjà existante')` au lieu du popup
5. → User ne voit aucun popup, signale le bug

## Fix livré v15.20

Refonte du flow auto-quittance dans `saveMv` (ligne ~9132) :

```js
// Si toggle bail quittAutoGen actif, TOUJOURS proposer popup (créer OU ouvrir).
if(_bail?.quittAutoGen) {
  let _q = (DB.quittances||[]).find(q => !q._deleted && q.logement === m.qui && q.mois === _mois);
  let _created = false;
  if(!_q) {
    // Création ad hoc (auto-gen boot OFF ou quittance pas générée)
    _q = { /* ... */ };
    DB.quittances.push(_q);
    _created = true;
    saveDB();
  }
  const _msg = _created
    ? `📄 Loyer ${m.qui} — ${_mois} enregistré. Ouvrir la quittance ?`
    : `📄 Quittance ${_mois} déjà générée pour ${m.qui}. Ouvrir maintenant ?`;
  if(confirm2(_msg)) previewQuit(_q.id);
}
```

### Améliorations apportées
- ✅ Popup affiché **dans tous les cas** (création OU quittance préexistante)
- ✅ Message différencié selon le cas (création vs ouverture)
- ✅ Plus de toast inutile « déjà existante » remplacé par action concrète
- ✅ Filtre `_deleted` ajouté (tombstone-safe, évite ressuscitation Drive)

## Tests / Validation

Pas de test Vitest possible (code inline dans index-test.html, dépend de DB + DOM + confirm).

**Validation manuelle attendue** :
1. Activer toggle « Proposer quittance automatiquement à réception du loyer » sur un bail
2. Saisir un paiement de loyer pour ce logement → popup apparaît
3. Cas alternatif : `DB.params.quittancesAutoGen = true` ET toggle bail actif → la quittance est déjà générée, popup propose de l'ouvrir
4. Cas négatif : toggle bail OFF → aucun popup (comportement respecté)

## Impact

Restaure une UX cassée 6 versions (v15.10 → v15.19). Avec Stripe paywall en Phase D, cette fonctionnalité sera commercialement vendue → bug bloquant levé.
