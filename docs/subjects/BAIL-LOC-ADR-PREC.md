# BAIL-LOC-ADR-PREC — Adresse précédente par locataire (au lieu d'un champ unique)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S (1-2h)
**Détecté** : 2026-04-29
**Lié à** : BAIL-PRINT-POLISH

## Contexte

Aujourd'hui dans le formulaire Modifier bail, le champ "Adresse précédente" est **unique** ([index.html:2260](index.html:2260)) :
```html
<input id="b-adrLoc" placeholder="Adresse avant entrée dans le logement">
```

Stocké dans `bail.adrLoc` (single string).

**Cas problématique** : 2 locataires venant d'adresses différentes. L'utilisateur concatène à la main avec " / " :
> `"24 rue du général de Gaulle - 68560 HIRSINGUE / 14 rue du Rossberg - 68480 FERRETTE"`

C'est lisible mais pas propre :
- Pas structuré dans la donnée
- Pas réexploitable (export, courrier, etc.)
- L'utilisateur doit gérer manuellement la concatenation

**Cas symétrique** : couple (2 locataires) venant d'1 même adresse (commune). Aujourd'hui : OK avec champ unique. Avec champ par locataire : friction = 2 fois la même saisie.

## Scope cible

Dans chaque bloc locataire (rendu par `renderBailLocs`) :
- Nouveau champ "Adresse précédente"
- Stockage dans `bail.locataires[i].adressePrecedente`

Pour le cas couple :
- À l'ajout du 2e locataire : checkbox "Même adresse précédente que locataire 1" (cochée par défaut si couple détecté ?)
- Si cochée : l'input adresse du loc 2 est désactivé et copie celle du loc 1 (live sync)
- Si décochée : input libre

Migration data :
- À l'ouverture d'un bail existant avec `bail.adrLoc` (legacy) : copier dans `bail.locataires[0].adressePrecedente` au 1er ouverture, marquer `_adrLocMigrated=true`
- Pour 2e locataire : checkbox "Même adresse" cochée par défaut (UX la moins disruptive)

Affichage bail PDF (§ "Entre les soussignés") : adapter le rendu pour utiliser les adresses individuelles si présentes, fallback `bail.adrLoc` legacy.

## Décisions à prendre

- [ ] Migration auto au 1er chargement OU prompt utilisateur ?
  - **Reco** : auto silencieuse. Le champ legacy reste dispo en fallback.

- [ ] Checkbox "Même adresse" cochée par défaut ?
  - Couple statistique : oui (cas le plus fréquent)
  - **Reco** : cochée par défaut, user peut décocher si besoin

- [ ] Si "Même adresse" cochée puis user modifie l'adresse loc 1 → loc 2 suit en live ?
  - **Reco** : oui (live sync via input listener)

## Notes utilisateur

> 💬 2026-04-29 : "ajouter adresse précédente dans la bulle locataire. Le cas 2 locataires et une seule adresse"

## Journal

- 2026-04-29 : créé
