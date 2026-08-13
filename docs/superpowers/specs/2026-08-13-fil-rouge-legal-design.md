# Fil rouge — fini la coquille : complétion en 2 paliers, le LÉGAL d'abord

**Date** : 2026-08-13
**Statut** : design VALIDÉ par le user (mockup approuvé + liste des tâches approuvée)
**Contrat visuel** : `mockups/fil-rouge-completion-v2/index.html` (local, gitignoré) — 2 écrans, vérifié vrai clic PC/tablette/mobile × clair/sombre.
**Base build** : worktree `Immo-wt-filrouge-complet`, branche `feat/fil-rouge-legal` depuis `origin/main` (`0787f6f`, v15.502).
**Complète** : `2026-08-08-fil-rouge-complet-acte-design.md` (fil complet post-acte, déployé v15.500).

---

## 1. Le constat user (smoke v15.500)

> « dans fil rouge, on traverse sans tout remplir les données immeubles, logements and co ! pourquoi ? c'est trop léger. on a l'impression que c'est fini alors qu'on a juste créé une coquille »

Vérifié dans le code déployé :

1. **Le fil MANUEL ne débouche jamais sur la complétion.** Il finit sur l'étape `done` (`_frShowFr`, index.html:44679) : « 🎉 Ton bien est en place … tout est déjà en place », alors que le parcours n'a demandé que **6 champs** (nom du bailleur · adresse de l'immeuble · réf/type/surface/loyer du lot). `_frSetCompletionState` n'est appelé QUE par `_frAfterActe` (44540) → aucun état de reprise, aucun bandeau, aucune liste de ce qui manque. L'écran annonce le contraire de la réalité.
2. **Le « 100 % » post-acte lui-même est partiel** : `completionModel` ne compte que 4 tâches par fiche, et sa tâche « DPE » ignore le catalogue légal complet que l'app possède déjà.

## 2. Décisions user (2026-08-13)

- **« sépare. il faut que le légal soit en place ! »** → complétion en **2 paliers** :
  - **⚖ Obligations légales** — ce que le fil pousse réellement ; compteur de tête = « X % EN RÈGLE ».
  - **📋 Confort de gestion** — jamais présenté comme un manque, ne fait pas baisser le compteur légal.
- **Chaque ligne du palier légal porte sa source** (rendue sous le libellé). Rien n'y figure sans justification.
- **La fin du fil manuel** cesse de dire « tout est en place » et enchaîne sur la complétion (écran de transition + accordéon **déjà livrés** pour l'acte).
- Arbitrages explicitement tranchés : **IBAN → confort** (on peut louer sans) · **« Créer le bail » reste dans le palier légal** (c'est l'aboutissement du fil, avec la sortie « vacant assumé » qui ne bloque jamais).

## 3. La liste validée

### ⚖ Palier 1 — Obligations légales

| Fiche | Tâche | Source affichée |
|---|---|---|
| Bailleur | Identité (nom, forme, SIREN) | Mention obligatoire du bail — contrat type, décret 2015-587 |
| Bailleur | Gérant / représentant légal | Sans lui, le bail n'est pas valablement signé |
| Bailleur | Adresse du siège | Mention obligatoire du bail — contrat type, décret 2015-587 |
| Immeuble | Adresse complète | Désignation du logement — mention obligatoire du bail |
| Immeuble | **Année de construction** | Détermine amiante (< 1997) et plomb (< 1949) — *dépendance affichée* |
| Immeuble | Copropriété ou mono-propriété | Art. 3 loi du 6 juillet 1989 — extraits du règlement à annexer |
| Logement | Surface habitable + désignation | Art. 3 loi 89-462 |
| Logement | **Diagnostics à annexer au bail** | Dossier de diagnostic technique — art. 3-3 loi du 6 juillet 1989 |
| Logement | **Classe DPE louable ?** | Loi Climat 2021 — calendrier d'interdiction, aucun contournement |
| Logement | N° fiscal du logement | Obligation déclarative propriétaire (« Gérer mes biens immobiliers ») |
| Logement | Créer le bail *(ou « vacant assumé »)* | — (aboutissement du fil, jamais bloquant) |

### 📋 Palier 2 — Confort de gestion

Bailleur : IBAN · email d'envoi · RCS + capital · signature + logo.
Immeuble : syndic · équipements communs · prix d'acquisition · surface totale / contenance.
Logement : chauffage & ECS · tantièmes / n° de lot · étage / n° d'appartement · annexes · équipements & mobilier · photos.

## 4. Réutilisation — ce que l'app sait DÉJÀ (rien à réinventer)

| Brique existante | Usage dans le fil |
|---|---|
| `_DIAGS_CATALOG_INLINE` (index.html ~37485) — 9 diagnostics, `isApplicable(log)` (année de construction, zones), `validityYears`, `legal` | Alimente la tâche « Diagnostics à annexer » : **seuls les diagnostics applicables à CE bien** sont réclamés ; ceux dont l'applicabilité est indéterminée (`null`, année manquante) sont annoncés comme « à déterminer » |
| `_dpeInterditLocationAuDate(dpe, dateRef)` + `_DPE_INTERDICTION_CALENDRIER` (~4506) | Alimente la tâche « Classe DPE louable ? » : verdict `interdit` + `raison` déjà formatée |
| `_diagGet(log, key)` (~37512) | Lecture tolérante d'un diagnostic (objet moderne / string legacy) |
| Transition + accordéon `#ov-fr` + reprise `DB.params.frCompletion` (v15.500) | Réutilisés tels quels pour la sortie du fil manuel |
| `openNewEnt` / `editImm` / `openNewLog` / `openBail` | Cibles des boutons « Compléter la fiche » — aucun formulaire recopié |

## 5. Architecture — la contrainte de pureté

`completionModel` vit dans le module PUR `__tests__/helpers/parcours-bien-model.js` (testé Vitest, mirroré `window.ParcoursBienModel`). Il **ne peut pas** appeler `_DIAGS_CATALOG_INLINE` ni `_dpeInterditLocationAuDate`, qui sont inline dans `index.html`.

**Décision** : injection par l'appelant. La signature devient :

```js
completionModel({ entite, immeuble, logements, bauxActifs, diagsParLot, dpeParLot })
```

- `diagsParLot[ref]` = `{ requis:[{key,label}], indetermines:[{key,label,cause}], fournis:[key] }` — construit inline par un nouveau `_frDiagsRequis(log, imm)` qui interroge le catalogue existant.
- `dpeParLot[ref]` = `{ classe, interdit:bool, raison }` — sortie de `_dpeInterditLocationAuDate`.

Le modèle pur reste pur et testable ; toute la connaissance légale reste à sa place actuelle (une seule source).

**Sortie enrichie** : chaque `task` porte désormais `palier: 'legal' | 'confort'` et `src: string|null`. `completionModel` renvoie `{ nodes, pct, pctLegal }` — `pct` inchangé (compat) et `pctLegal` = le compteur poussé par l'UI.

## 6. Comportements

- Le compteur de tête affiche **`pctLegal` % « EN RÈGLE »** ; la barre secondaire montre la complétude totale, sans jamais alerter.
- Un nœud est **vert** dès que son palier légal est complet (le confort restant n'empêche pas le vert).
- Fin du fil manuel : l'étape `done` route vers `transition` (comme `_frAfterActe`) et pose `_frSetCompletionState`. Le récap de `done` (`_frRecapHtml`, ce qui vient d'être créé) est conservé **dans** l'écran de transition.
- **Biens existants non impactés** : le bandeau de reprise ne s'affiche que si `DB.params.frCompletion` existe, donc uniquement pour un fil en cours. Les 26 biens du parc ne deviennent pas « incomplets » du jour au lendemain. *(Lancer la complétion depuis la fiche d'un bien ancien = hors périmètre, à décider plus tard.)*

## 7. Hors périmètre

- Lancer la complétion sur un bien existant depuis sa fiche.
- Refonte des fiches elles-mêmes (on ne fait qu'y renvoyer).
- Contrôle de validité/péremption des diagnostics (`validityYears` existe, mais le fil ne demande que la présence — la péremption est un sujet Diagnostics à part).
- Dark mode des blocs `fr-comp-*` (dette v15.500 assumée, follow-on).

## 8. Garde-fous & gates

- **TEST AU VRAI CLIC** : fil manuel complet → transition → accordéon 2 paliers → compléter une fiche → retour → bandeau de reprise ; + non-régression du fil post-acte (v15.500) et de la garde identité.
- **Fidélité au mockup** vérifiée écran par écran (l'audit doit auditer la conformité UX, pas seulement la mécanique).
- DRY : aucun formulaire recopié, aucune duplication du catalogue de diagnostics.
- `index.html` reste **CRLF** ; mirrors regénérés par `tools/sync-helpers-global-mirrors.mjs` puis normalisés.
- Gates : `node scripts/check-inline-js.mjs` (0 erreur) · `npx vitest run` (baseline v15.502 verte) · `node --check sw.js`.
- Audit `superpowers:code-reviewer` AVANT « prêt à tester ». Bump de version complet au n° libre au-dessus d'`origin/main`.
