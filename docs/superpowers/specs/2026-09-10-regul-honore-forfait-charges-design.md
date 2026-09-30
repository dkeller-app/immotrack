# Design — La régularisation de charges honore le forfait (art. 23-1)

**Statut** : validé en chat 10/09/2026 (GO Didier : « par date » + badge + option A). Chantier ARGENT.
**Worktree** : `admiring-galileo-1fb6e1`. **Branche** : `claude/admiring-galileo-1fb6e1`.

## §0 — Problème

L'avenant au bail pose `bail.chForfait` (index.html `_avenantSave`, ~24128) quand les charges
passent « au forfait » (art. 23-1, non régularisable). Mais `computeRegul` (index.html ~26466)
**ne lit pas ce flag** → un bail au forfait serait quand même régularisé annuellement = illégal.

Le flag seul est **insuffisant et dangereux** : il est non daté. Régulariser un exercice **N-1**
après la signature d'un avenant forfait (usage courant : la fenêtre régul par défaut est l'année
courante, mais on édite les dates pour N-1) effacerait à tort une régul 100 % légitime (perte
d'argent). Symétriquement l'année de transition (straddle) mélange une fraction provisions
(régularisable) et une fraction forfait (non). Il faut donc honorer le forfait **par date**.

## §1 — Source de la date d'effet (déjà persistée)

`bail.avenants[]` = `[{no, dateEffet, ville, objets:[{k,data}], html, createdAt}]`. Chaque objet
charges porte `data.mode` ∈ { « Révision du montant des provisions », « Passage au forfait de
charges », « Passage aux provisions avec régularisation » }. Règle existante (24128) :
`chForfait = mode.toLowerCase().indexOf('forfait') >= 0`. La **timeline forfait** est donc
entièrement reconstructible depuis les avenants (dateEffet + mode), y compris un retour aux
provisions par un avenant ultérieur.

## §2 — Primitif pur `bailForfaitActifLe(bail, dateIso) → bool`

Module `js/core/avenant.js` (pur, exporté), attaché `window.bailForfaitActifLe` dans `js/main.js`
(à côté de `buildAvenantHtml`/`loyerTravauxGuard`, ~585-589). Testé `__tests__/helpers/avenant.test.js`.

Algorithme :
1. Collecter les avenants dont un objet `k==='charges'` a un `data.mode` non vide ; trier par `dateEffet` (ISO, tri lexical).
2. Aucun avenant charges → **fallback** : renvoyer `bail.chForfait === true` (couvre forfait day-1 / legacy, actif pour toute date).
3. Sinon : appliquer les avenants dans l'ordre, `état = (mode contient « forfait »)`, en ne retenant que ceux dont `dateEffet <= dateIso`. Si aucun ne s'applique (date antérieure au 1er avenant charges) → régime d'origine = **provisions** = `false`.
4. Renvoyer l'état booléen.

Défensif : `bail` absent ou `dateIso` vide → `false`.

## §3 — `computeRegul` : post-passe unique (index.html, avant le `return` ~26690)

Zéro modification des 3 chemins de répartition. Après construction de `res`, pour chaque entrée `e` :
- Garde : `if (typeof window.bailForfaitActifLe !== 'function') return;` (statu quo, jamais de crash — style existant `typeof _calcCcRepartition`).
- Ne traiter que les entrées à forfait pertinent (petit court-circuit : si `!e.bail || (!e.bail.chForfait && !(e.bail.avenants||[]).some(charges-mode))` → skip).
- **Charges** : `details[]` → garder `d` si `!bailForfaitActifLe(e.bail, d.date)` ; sommer les exclus dans `excluCharges`. `e.charges = Σ(gardés)`.
- **Provisions** : `moisDetails[]` → garder `m` si `!bailForfaitActifLe(e.bail, m.mois+'-01')` (l'effet avenant est clampé au 1er du mois) ; sommer les exclus dans `excluProvisions`. `e.provisions = Σ(gardés.ch)`.
- Poser `e.forfait = { effet, partiel:(gardés>0 && exclus>0), excluCharges, excluProvisions }` où `effet` = plus ancienne date d'effet forfait active dans la fenêtre (pour l'affichage).

Invariant vérifié à l'audit : `Σ details.montant === charges` et `Σ moisDetails.ch === provisions`
(les 3 chemins poussent une ligne `details` de même montant que l'incrément `charges` ;
`moisDetails` porte `ch` par mois sommé dans `provisions`). Le recompute est donc exact.

Comme **tout** dérive de `computeRegul` (`rRegul`, `_rgClotureCompute`, `_openRegulDoc`,
2044, reporting bailleur, `_departEstimDu`), la correction se propage partout (DRY).

## §4 — UI : badge discret (ton infinitif, réutilise `.rg-badge`)

- Ligne `rg-log` (rRegul, ~26811) : si `r.forfait`, ajouter
  `Forfait depuis JJ/MM/AAAA — non régularisable`, ou si `partiel`
  `Forfait dès JJ/MM/AAAA — période antérieure régularisée`.
- Ligne détail (~26823) : note expliquant l'exclusion + montant exclu (charges/provisions).
- Panneau clôture `_rgClotureLocataire` (~25798) : même mention, car `regulDu` en dépend.
- Badge = texte seul (pas un bouton d'action → règle « jamais d'icône seule » non concernée).

## §5 — Limite connue assumée (Option A — GO)

`computeRegul` valorise les provisions en `mois × bail.ch` **plat**, pas le barème daté
`DB.loyerBareme`. Sur l'année straddle, si l'avenant a aussi changé le **montant** des charges,
les provisions des mois *avant* forfait seraient valorisées au *nouveau* montant. Imprécision
**pré-existante** (touche déjà tout avenant modifiant le montant), **hors périmètre** de ce
chantier. À traiter séparément si souhaité (dériver les provisions du barème daté).

## §6 — Tests

**Vitest** (`__tests__/helpers/avenant.test.js`), sur `bailForfaitActifLe` :
- Aucun avenant + `chForfait:true` → `true` à toute date ; `chForfait` absent → `false`.
- Avenant « forfait » au 2026-07-01 → `false` au 2026-06-30, `true` au 2026-07-01 / plus tard.
- Avenant forfait 2026-07-01 puis « retour provisions » 2027-01-01 → `true` entre, `false` après.
- Date antérieure au 1er avenant charges → `false` (provisions d'origine), même si `chForfait:true` aujourd'hui.
- Robustesse : `bail` null, `dateIso` vide, `avenants` absent.

`computeRegul` : non unit-testé (inline, comme aujourd'hui) → couvert par smoke 3 formats + audit.

## §7 — Gate

`npx vitest run` (nouveaux tests forfait verts) · `node scripts/check-inline-js.mjs` = 5|0 ·
CRLF index.html = 0 bare LF · bump version (title+footer) · audit `superpowers:code-reviewer`
**+ 2ᵉ passe adversariale argent** · MAJ `docs/subjects/AVENANT-BAIL.md` §5 + `BACKLOG.md` ·
smoke 3 formats (Didier).
