# BUG-LOCATAIRE-CONCAT — Nom du locataire ré-concaténé à l'infini (baux multi-locataires)

**Status** : ✅ Code fixé v15.115 (corruption stoppée) · ⚠️ Réparation données manuelle à faire côté user · **Prio** : **P0 critique** (corruption de données) · **Taille** : XS (fix) + manuel (repair)
**Détecté** : 2026-05-20 (user, conditions réelles, bail F-001 multi-locataires)

## Symptôme

Sur un bail à plusieurs locataires, le nom du **Locataire 1** s'allonge à chaque cycle de sauvegarde :
```
"AUDRIN Faustine, BIRRINNI"
"AUDRIN Faustine, BIRRINNI, BIRRINNI"
"AUDRIN Faustine, BIRRINNI, BIRRINNI, BIRRINNI"
```
Le nom du colocataire (`BIRRINNI`) est ré-ajouté indéfiniment. Divergence observée entre 2 onglets (3× vs 1×) car l'un a subi plus de cycles save.

## Cause racine

Conflit d'usage de `log.locataire` (champ logement) entre deux modèles :
- **Modèle legacy mono-locataire** : `log.locataire` = nom d'un seul locataire (champ texte `#log-loc` de la fiche logement, ligne 31801).
- **Modèle V3 multi-locataires** : `log.locataire` est **dérivé** = jointure de TOUS les noms (`(bail.locataires||[]).map(l=>l.nom).join(', ')`, écrit en `saveBail` L13837 et import L36273).

`_syncLogToBail(ref, log)` (L31705, ajouté v14.16 ARCHI-DB-DOUBLONS Phase 3b) propageait `log.locataire` → `bail.locataires[0].nom` **sans distinguer mono/multi**. Boucle infernale :
```
saveBail   : log.locataire = join(loc[]) = "X, Y"
saveLog    : _syncLogToBail → loc[0].nom = log.locataire = "X, Y"
saveBail   : log.locataire = join(loc[]) = "X, Y" + ", " + "Y" = "X, Y, Y"
…
```

## Fix livré v15.115

`_syncLogToBail` ne propage l'identité (`nom`/`tel`/`email`) depuis la fiche logement vers `bail.locataires[0]` **QUE si le bail est mono-locataire** (`bail.locataires.length <= 1`). Pour les baux multi-locataires, le wizard bail (`bail.locataires[]`) est la **seule source de vérité** de l'identité ; `_syncLogToBail` ne touche plus aux noms.

- Mono-locataire : `log.locataire` == l'unique nom (pas de séparateur de jointure) → propagation idempotente, comportement legacy préservé (édition du nom depuis la fiche logement OK).
- Multi-locataires : skip → plus de corruption.

`tel`/`email` ne concaténaient pas (valeur unique `locs[0]?.tel`), mais le bloc entier est gardé sous le même `if` car pour un multi-locataire ces champs ne doivent pas non plus venir de la fiche logement (1 seul champ tel/mail côté logement).

**Validation** : 915 tests Vitest OK. À tester côté user sur F-001 (modifier puis re-sauver plusieurs fois → le nom ne doit plus s'allonger).

## Réparation des données déjà corrompues (manuel)

Auto-réparation écartée : risque de mutiler un nom légitime contenant une virgule. La corruption étant stoppée, une correction manuelle tient désormais.

**Procédure user** :
1. Ouvrir le bail affecté (ex F-001) → onglet « Personnes ».
2. Corriger le nom du Locataire 1 (retirer les « , BIRRINNI » en trop → « AUDRIN Faustine »).
3. Enregistrer. Le nom reste propre (bug corrigé).

**Snippet console pour lister les baux multi-locataires à vérifier** :
```js
Object.entries(DB.baux)
  .filter(([r,b]) => (b.locataires||[]).length >= 2)
  .forEach(([r,b]) => console.log(r, '→', JSON.stringify((b.locataires||[]).map(l=>l.nom))));
```

## Journal
- 2026-05-20 : détecté par user (F-001), cause racine `_syncLogToBail` L31705, fix mono/multi guard livré v15.115, réparation données manuelle documentée.
