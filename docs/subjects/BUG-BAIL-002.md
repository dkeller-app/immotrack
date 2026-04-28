# BUG-BAIL-002 — Bail : seule la 1re signature garant apparaît si 2 garants

**Status** : ✅ Obsolète (2026-04-29) · **Prio** : P1 · **Taille** : S
**Détecté** : 2026-04-28
**Vérifié obsolète** : 2026-04-29 par utilisateur — `genActeCautionnementDoc` génère bien 2 actes complets séparés par page-break si `bail.garant2` existe, chacun avec sa case signature dédiée. Bug résolu par la refonte UI dynamique des garants (`_bailLegacyGarantFields()` qui mappe correctement les 2 garants au save).
**Lié à** : BAIL-PRINT-POLISH · BAIL-PDF-NATIF · V3-REFONTE-BAIL

## Contexte
Quand le bail compte 2 garants (cautionnement multiple), seule la signature du 1er garant apparaît dans le PDF. Le 2nd garant n'a pas d'emplacement de signature.

Soit problème de template (1 seule case prévue), soit problème de rendu (la 2e signature existe en données mais n'est pas dessinée).

## Scope
- [ ] Reproduire avec un bail à 2 garants
- [ ] Vérifier : la 2e signature est-elle persistée en DB ?
- [ ] Vérifier le template print : combien d'emplacements de signature garant prévus ?

## Décisions à prendre
- [ ] **Option A** : ajouter une 2e case signature garant (1 case par garant, propre)
- [ ] **Option B** : indiquer "les 2 garants signent dans la même case" (plus simple, mais moins clair juridiquement)
- → Recommandation par défaut : Option A. Le cautionnement engage chaque garant individuellement, donc 1 case = 1 signature = 1 nom imprimé

## Notes utilisateur
> 💬 2026-04-28 : "une seule signature du garant apparait si 2 garants (soit tu rajoutes la deuxième signature, soit tu indiques qu'il faut que les 2 bailleurs signent dans la même case)"

## Journal
- 2026-04-28 : créé
- 2026-04-29 : marqué obsolète après vérification utilisateur. Le code actuel `genActeCautionnementDoc` ([index.html:14956](../../index.html#L14956)) génère déjà : `bloc1 = _cautionnementBlock(garant1)` + `bloc2 = page-break + _cautionnementBlock(garant2)` si `bail.garant2` existe. Chaque bloc contient sa propre case signature "Le Garant".
