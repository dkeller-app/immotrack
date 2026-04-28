# BAIL-TRAVAUX-INTERLOC — Champ "Travaux réalisés depuis précédent locataire" manquant dans le formulaire

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : XS (~30 min)
**Détecté** : 2026-04-29
**Lié à** : BAIL-PRINT-POLISH, encadrement loyers (zone tendue)

## Contexte

Le placeholder `{{TRAVAUX_INTER_LOC}}` existe dans le template bail HTML ([index.html:3449](index.html:3449)) :
```
<p>Travaux d'amélioration réalisés depuis le départ du précédent locataire :
   <strong>{{TRAVAUX_INTER_LOC}}</strong>.</p>
```

Le data model a aussi le champ initialisé ([index.html:3774](index.html:3774)) :
```js
precedentLoc:'', precedentLoyerDetail:'', travaux_inter_loc:''
```

**MAIS** : aucun input dans le formulaire Modifier bail pour saisir cette valeur. Le placeholder reste donc toujours vide ou non-substitué dans le PDF.

## Importance juridique

Ce champ est **essentiel pour l'encadrement des loyers** (zones tendues — Paris, Lyon, Bordeaux, etc.) :
- Article 17 c) loi 89-462 : majoration possible du loyer plafond si **travaux d'amélioration** réalisés entre 2 locataires
- Le bailleur DOIT mentionner les travaux pour justifier la majoration
- En cas de contestation, c'est cette mention dans le bail qui sert de preuve

## Scope cible

### Dans le formulaire Modifier bail (étape 3 Loyer)

Ajouter un champ après "Loyer du précédent locataire" (ou dans la section zone tendue) :

```html
<div class="fg" id="b-travaux-inter-loc-wrap" style="display:none">
  <label>Travaux d'amélioration réalisés depuis le précédent locataire
    <span class="mu sm">(justifie majoration en zone tendue)</span>
  </label>
  <textarea class="inp" id="b-travaux-inter-loc" rows="3"
    placeholder="Ex: réfection complète de la salle de bain (5000 €), remplacement chaudière (3500 €)..."></textarea>
</div>
```

### Visibilité conditionnelle

Le champ doit s'afficher uniquement si pertinent :
- Mode `b-zoneTendue` checked OU `b-encadrementLoyers` checked OU `b-precedentLoc` valeur "moinsde18" (majoration justifiable)

### Liaison form ↔ data

- Au save : `bail.travaux_inter_loc = v('b-travaux-inter-loc')`
- Au load (`openBail`) : `el('b-travaux-inter-loc').value = bail.travaux_inter_loc || ''`

### Vérification template substitution

S'assurer que `{{TRAVAUX_INTER_LOC}}` est bien remplacé dans le rendu HTML/PDF (probablement déjà OK via le système de substitution des templates, à vérifier).

Si vide : afficher "Néant" ou "Aucun" plutôt que `{{TRAVAUX_INTER_LOC}}` brut.

## Notes utilisateur

> 💬 2026-04-29 : "où se trouve dans bail la case pour les travaux réalisés ?"

## Journal

- 2026-04-29 : créé. Le data model + template attendent ce champ depuis longtemps mais l'input form n'a jamais été ajouté.
