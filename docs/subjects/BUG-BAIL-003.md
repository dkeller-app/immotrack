# BUG-BAIL-003 — Bail multi-bailleurs : 2e signature bailleur capturée mais absente du PDF

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : XS (~10-15 min)
**Détecté** : 2026-04-28
**Lié à** : V3-REFONTE-BAIL · BAIL-SNAPSHOT (livré v13.10/11)
**Distinct de** : BUG-BAIL-002 (qui concerne les GARANTS, pas les bailleurs)

## Contexte

Quand l'entité du bail a **2 co-gérants** (et donc 2 signataires bailleur), le wizard affiche bien **2 cadres de signature** dans l'étape finale (un par co-gérant), capture les 2 signatures correctement (`window._wizV2FinalSignatures = { 'bailleur-0':..., 'bailleur-1':... }`), mais **seule la 1re signature apparaît sur le PDF généré**.

## Diagnostic root cause

Dans `buildBailStructure` ([index.html:10092](index.html:10092)) :

```js
{ type:'signature-bailleur', role: `LE BAILLEUR — ${nomSci} (représenté par ${nomGerant})` },
```

**Un seul bloc `signature-bailleur` est émis**, peu importe le nombre de gérants. Pendant ce temps, `previewBailData` ([index.html:10275](index.html:10275)) crée bien `bailleur-0`, `bailleur-1`, etc. dans `_SIGS`.

Conséquence dans le rendu PDF (`genPDFNative`, [index.html:11856](index.html:11856)+) : la boucle qui itère `_BAIL_STRUCTURE` ne trouve qu'UN bloc → seul `_wizV2FinalSignatures.bailleur-0` est dessiné. La signature `bailleur-1` est dans la DB mais jamais rendue.

## Scope du fix

Modifier `buildBailStructure` (~ligne 10092) :
1. Récupérer la liste des signataires via `getBailSignataires(bail, ent)` (déjà disponible)
2. Détecter mode mandataire via `bail.withMandataire && DB.params.mandataire?.actif`
3. Émettre les blocs en fonction :
   - **Mandataire actif** : 1 bloc `signature-bailleur` avec rôle `MANDATAIRE — ${nomMandataire} (pour le compte de ${nomSci})`
   - **1 seul gérant signataire** : 1 bloc avec rôle `LE BAILLEUR — ${nomSci} (représenté par ${gerant})` (comportement actuel)
   - **N gérants signataires (N≥2)** : N blocs avec rôle `CO-GÉRANT ${i+1} — ${nomSci} (représenté par ${gerantN})`

Le rendu PDF (`genPDFNative` signature-bailleur handler) gère déjà le compteur `_sigBailleurFinalIdx` qui itère sur `bailleur-0`, `bailleur-1`, etc. → aucune modif nécessaire côté PDF, le fix est uniquement dans `buildBailStructure`.

## Tests à faire

- [ ] Créer entité fictive avec 2 co-gérants (ex: "Didier Keller, Sophie Keller")
- [ ] Créer bail sur cette entité, signer wizard (2 cadres bailleur visibles)
- [ ] Générer PDF natif → vérifier §18 affiche **2 cadres bailleur** avec 2 signatures distinctes + rôles "CO-GÉRANT 1" / "CO-GÉRANT 2"
- [ ] Vérifier non-régression : entité 1 gérant → 1 cadre "LE BAILLEUR" comme avant
- [ ] Vérifier non-régression : mandataire actif → 1 cadre "MANDATAIRE — ..."

## Notes utilisateur

> 💬 2026-04-29 : "P1 — bug critique : les bailleurs dans bail si deux bailleurs on a bien 2 carré pour signer mais que la première signature est visible sur le PDF."

## Journal

- 2026-04-29 : créé. Distinct de BUG-BAIL-002 (qui concerne garants).
