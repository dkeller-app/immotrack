# BUG-ENT-RENAME-CASCADE — Renommage entité ne propage pas vers logements/baux/quittances

**Status** : 🔥 P0 (perte fonctionnelle) · à corriger en session dédiée
**Prio** : P0 · **Taille** : XS (~30 min)
**Détecté** : 2026-05-05 (session DASH-PROFILES Phase 1 v2)
**Lié à** : `ARCHI-DB-DOUBLONS` (refonte structurelle clés string → ID stable, plus large)

## Symptômes
- Utilisateur renomme une entité bailleur dans le formulaire (ex : "Perso — Didier Keller" → "Didier Keller")
- Le dashboard avec entité renommée sélectionnée affiche **tous les KPIs à zéro** (cash-flow 0€, 0/0 logements occupés)
- L'onglet Loyers/Mouvements continue de fonctionner correctement (filtré par logement.ref direct)
- Aucun message d'erreur, aucune alerte visuelle

## Root cause (confirmé 2026-05-05)

`saveEnt()` (lignes 23471-23510 de `index.html`) modifie `entite.nom` mais **ne propage pas** le nouveau nom aux collections qui stockent l'ancien nom comme **clé de jointure string** :

- `DB.logements[].entity` (~136 occurrences de `.entity` dans le code)
- `DB.baux[].entity`
- `DB.baux_historique[].entity`
- `DB.quittances[].entity`

Ligne 7292 (filtrage dashboard) :
```js
const scopeLogs = activeEnt ? aliveLogs.filter(l => l.entity === activeEnt) : aliveLogs;
```
Le sélecteur dashboard envoie `e.nom` (nouveau nom). Les logements gardent l'ancien nom → 0 match → KPIs vides.

## Reproduction

1. Créer une entité "Test Bailleur"
2. Lui rattacher 1 logement (qui obtient `entity = "Test Bailleur"`)
3. Éditer l'entité → renommer en "Bailleur Test"
4. Aller au dashboard → sélectionner "Bailleur Test"
5. ❌ Tous les KPIs à zéro alors que le logement existe et a des mouvements

## Fix proposé (~20 lignes)

Dans `saveEnt()` ligne 23497, après `DB.entites[i] = ent;`, ajouter une cascade conditionnelle :

```js
// v14.X BUG-ENT-RENAME-CASCADE : propage le renommage vers les collections
// qui stockent entity comme clé string (cf #ARCHI-DB-DOUBLONS pour refonte structurelle)
if (existing && prevNom && prevNom !== ent.nom) {
  const now = Date.now();
  let renamed = 0;
  (DB.logements || []).forEach(l => {
    if (l.entity === prevNom) { l.entity = ent.nom; l._modifiedAt = now; renamed++; }
  });
  Object.values(DB.baux || {}).forEach(b => {
    if (b && b.entity === prevNom) { b.entity = ent.nom; b._modifiedAt = now; renamed++; }
  });
  (DB.baux_historique || []).forEach(b => {
    if (b.entity === prevNom) { b.entity = ent.nom; b._modifiedAt = now; renamed++; }
  });
  (DB.quittances || []).forEach(q => {
    if (q.entity === prevNom) { q.entity = ent.nom; q._modifiedAt = now; renamed++; }
  });
  if (renamed > 0) console.log(`Cascade rename : ${renamed} records mis à jour ("${prevNom}" → "${ent.nom}")`);
}
```

## Bonus défensif : normalisation Unicode à la saisie

**Piège découvert** : le bug de l'utilisateur (cas "Perso — Didier Keller") utilisait un **em-dash U+2014** (`—`), pas un trait d'union normal U+002D (`-`). Trois caractères se ressemblent visuellement mais ne matchent pas en `===` :

| Caractère | Unicode | Apparence | Saisie |
|---|---|---|---|
| `-` | U+002D | trait d'union | clavier standard |
| `–` | U+2013 | tiret demi-cadratin (en-dash) | correcteur auto Mac/Word |
| `—` | U+2014 | tiret cadratin (em-dash) | correcteur auto Mac/Word |
| ` ` | U+00A0 | espace insécable (NBSP) | invisible vs U+0020 |

**Reco** : à la saisie du nom (input `#ent-nom`), normaliser :
```js
const nom = v('ent-nom').normalize('NFC').replace(/[–—]/g, '-').replace(/ /g, ' ').trim();
```
Évite les pièges Unicode invisibles à l'œil pour les futures saisies.

## Migration de la donnée existante (utilisateurs déjà touchés)

Pour les utilisateurs déjà affectés par le bug (au moins l'utilisateur principal en témoignage), on a 2 options :

**Option A** : helper de migration au démarrage (auto)
- Au boot : détecter logements/baux dont `entity` ne match aucune entité active → si UNE entité supprimée correspond avec `_deleted=true`, proposer cascade automatique vers entité active la plus proche par fuzzy match
- Risqué (faux positifs)

**Option B** : helper console + UI manuelle
- Bouton dans Paramètres "Détecter et réparer les rattachements orphelins"
- Liste les `entity` orphelines + propose de les rattacher manuellement
- Sujet associé : `BUG-ENT-ORPHANS-CLEANUP`

**Reco** : Option B (lié à `BUG-ENT-ORPHANS-CLEANUP`).

## Tests à écrire

1. **Test renommage cascade** : créer entité + logement, renommer, vérifier `logement.entity` à jour
2. **Test renommage Unicode** : nom avec em-dash → renommage avec trait d'union → cascade
3. **Test multiplet** : 1 entité + N logements + M baux + K quittances → cascade unique met tout à jour

## Effort estimé
- Fix `saveEnt()` : 5 min
- Normalisation Unicode à la saisie : 5 min
- Test manuel : 10 min
- Commit + bump version : 5 min
- **Total : ~30 min**

## Notes utilisateur
> 💬 2026-05-05 : "plus rien ne remonte pour l'appartement de Delle. J'ai modifié le nom du bailleur en Didier Keller idem gérant de Perso - Didier Keller"
> 💬 2026-05-05 : "je viens de voir que le bien est supprimé... comment je fais pour restaurer ?"
> ↳ En réalité le bien n'était pas supprimé, juste invisible (rattaché à l'ancien nom).

## Journal
- 2026-05-05 : Bug détecté pendant la session DASH-PROFILES (utilisateur ne voyait plus ses KPIs après renommage entité). Diagnostic systématique avec skill `superpowers:systematic-debugging`. Hypothèse H1 confirmée. 3 records migrés en console (1 logement + 1 bail + 1 quittance). Sujet créé pour fix prod en session dédiée.
