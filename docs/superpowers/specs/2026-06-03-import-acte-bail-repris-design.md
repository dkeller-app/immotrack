# Design — Bail repris à l'import d'acte (extraction occupation / locataire)

**Date** : 2026-06-03
**Prio** : P2 · **Taille** : M · **Statut** : design validé (UX variante A + modèle), en attente revue spec puis plan d'implémentation.

**Spec de base** : `docs/superpowers/specs/2026-06-01-import-acte-vente-design.md` (wizard création entité/immeuble/logements/annexes).
**Supersede** : `docs/superpowers/specs/2026-06-02-import-acte-bail-dpe-design.md` **D7 et D8 uniquement** (voir §0). Les décisions D9–D13 de cette spec (extraction enrichie prix/copro/syndic, stockage acte PDF, fil rouge) restent valides comme travaux **séparés et différés** ; le DPE est un **sous-projet distinct** également différé.

**Mockup validé (vrai navigateur, variante A retenue par l'utilisateur)** :
`mockups/import-acte-vente/occupation-locataire.html` — 3 variantes hybride opt-in (A toggle dans la carte logement [retenue] · B section dédiée · C bande segmentée), × PC/tablette/téléphone × clair/sombre × vue Vérif↔Récap.

---

## 0. Correction d'une décision antérieure (D7 superseded — preuve par le code)

La spec 2026-06-02 décidait (**D7**) : « bail repris = pré-remplir le **cache d'occupation** du logement (`log.locataire/hc/ch/debut/fin/dg`), **PAS** de création d'objet `DB.baux[ref]` » — au motif que remplir l'occupation seule serait « suffisant pour le tableau de bord / vacance ».

**C'est factuellement faux.** Vérifié dans `index.html` (PROD v15.248) :

- `_v4ComputeLotStatus(log, yr, mo, mvs)` (l.6483) : si `log.locataire` est rempli (occupé), le **loyer attendu** est calculé **uniquement** via `_getActiveBailHcChProrated(log.ref, …)` (l.6519-6527). Il ne lit **jamais** `log.hc/log.ch` comme attendu (ils ne servent qu'au libellé « théo » du cas vacant, l.6494, et au prorata d'affichage l.6530).
- `_getActiveBailHcChProrated(ref, yr, mi)` (l.9679) : `const bails = _getAllBailsForLog(ref); if (!bails.length) return 0;` (l.9682-9683) → **sans objet bail, l'attendu = 0**, sans aucun fallback sur `log.hc`.
- Conséquence (l.6536-6541) : `attendu <= 0.5` + locataire présent → le lot est **classé/coloré « vacant »**. On obtient un logement avec un **nom de locataire mais affiché vacant, 0 € attendu** = état « à moitié occupé » incohérent au dashboard.
- `agendaAutoSync` (révisions IRL) lit également `DB.baux[ref].debut` ; sans objet bail, aucune révision n'est planifiée.

**Décision corrigée, validée par l'utilisateur cette session** : l'opt-in crée un **vrai objet `DB.baux[ref]`** (un « bail repris »), **sans signature**, marqué `typeContrat:'repris'`. C'est le seul moyen d'avoir un dashboard cohérent (loyer attendu, statut payé/impayé, vacance) et des révisions IRL fonctionnelles.

D8 (UI) est superseded par la **variante A** du nouveau mockup (toggle dans la carte logement), plus aboutie que l'ancien bloc `.occ` Loué/Vacant.

---

## 1. Objectif

À l'import d'un acte de vente d'un bien **occupé**, extraire **locataire + loyer (HC + charges) + date de début** et permettre, en un opt-in par logement, de **reprendre le bail en cours** (Art. 1743 C. civ. : l'acquéreur d'un bien loué est tenu de respecter le bail existant). L'opt-in crée un **bail repris** cohérent (objet `DB.baux[ref]` + cache dénormalisé), modifiable ensuite via le module Bail existant.

**Principes gravés** :
- **Aucune écriture aveugle** : toute valeur extraite est `✨ à vérifier` (présente) ou `à compléter` (absente) et n'est persistée qu'après validation explicite à l'étape Vérification puis Récap.
- **Réutilisation, pas réinvention** : on s'appuie sur le schéma bail (`saveBail`), le parser (`_acteExtract`/`_acteRegroup`), la transaction atomique (`_acteApply`). Aucun mécanisme parallèle.
- **Pas de bail signé bidon** : un bail repris **n'a pas de signature** ImmoTrack (on n'a pas authoré ce contrat) ; il n'est jamais proposé à l'impression « comme le nôtre ». L'immutabilité légale du bail signé n'est pas concernée.

---

## 2. Décisions verrouillées

| # | Décision | Justification |
|---|---|---|
| **R1** | **Opt-in = création d'un objet `DB.baux[ref]` (bail repris)** + cache dénormalisé (`log.locataire/hc/ch/debut/dg`), pas seulement le cache. | §0 : sans objet bail, dashboard + IRL incohérents (`_getActiveBailHcChProrated` renvoie 0). |
| **R2** | **Marquage : `typeContrat:'repris'`** (3ᵉ valeur exclusive de l'axe `initial`/`renouvellement`). | Choix utilisateur (YAGNI). `repris` = origine du contrat (hérité), parallèle à initial/renouvellement. Un seul champ, pas de double état. |
| **R3** | **Pas de signature** sur un bail repris (`signatures` absent/vide). Fiche bail l'affiche « Bail repris » ; aucune impression « comme le nôtre ». | On n'a pas rédigé ni signé ce bail ; on l'a hérité. |
| **R4** | **Régime du bail repris = `type:'nu'` par défaut** (l'acte précise rarement meublé/nu), éditable ensuite dans le module Bail. | Best-effort. `nu` = cas majoritaire ; correction d'un clic après import si besoin. |
| **R5** | **UI = variante A** : toggle « Reprendre le bail en cours » dans la carte de chaque logement détecté occupé, dépliant locataire/loyer HC/charges/date (+ DG si extrait), chaque champ tagué `✨ à vérifier`/`à compléter` avec « ⓘ d'après l'acte ». | Mockup validé. L'occupation est intrinsèquement par-logement → zéro étape de rattachement. |
| **R6** | **Extraction par logement** via recoupement des **numéros de lot** (`_lots`) ; à défaut de découpage par lot dans l'acte, occupation **non rattachée** → toggles off par défaut, l'utilisateur active/saisit. | Conservateur : on ne devine pas le rattachement d'un locataire à un logement sans signal explicite. |
| **R7** | **Création dans la transaction atomique de `_acteApply`** (après la boucle logements), avec entrée `_rollback` par bail créé + `_stamp(ent)`, **un seul `saveDB()`**. | Aligné sur l'atomicité déjà en place (annexes, audit). Pas de DB à moitié écrite. |

---

## 3. Modèle de données — l'objet « bail repris »

Écrit dans `DB.baux[log.ref]` à l'opt-in, sur le modèle de `saveBail` mais **minimal et sans signature** :

```js
DB.baux[ref] = {
  locataires: [{ nom: '<nom extrait/saisi>' /* civilité/adresse facultatives */ }],
  nom: '<nom extrait/saisi>',          // compat lectures historiques
  type: 'nu',                          // R4 — régime par défaut, éditable
  typeContrat: 'repris',               // R2 — NOUVELLE valeur d'axe
  entity: ent.nom,
  debut: '<AAAA-MM-JJ extrait/saisi>',
  fin: '',                             // bail en cours, échéance calculée par tacite reconduction
  hc: <number>, ch: <number>, dg: <number|0>,
  irl: '',                             // indice de révision : inconnu de l'acte → vide (révision dormante)
  jpay: '', modalitePaiement: 'echeoir',
  source: { import: 'acte', acteRef: '<fileName>', importeLe: '<ISO>' },  // traçabilité
  // PAS de `signatures` (R3)
};
```

Cache dénormalisé écrit sur le logement (identique à `saveBail` l.15428-15432) :
`log.locataire = nom` · `log.hc = hc` · `log.ch = ch` · `log.dg = dg` · `log.debut = debut` · `log.fin = ''`.

**Nouvelle valeur `typeContrat:'repris'` — sites d'affichage à compléter** (sinon « repris » s'affiche brut ou retombe dans la branche « Contrat initial ») :
- `<select id="b-typeContrat">` (l.1452) : ajouter `<option value="repris">Bail repris (acquisition d'un bien occupé)</option>`.
- `typeContratMap` fiche bail (l.34085) : ajouter `repris:'Repris (Art. 1743)'`.
- Branches d'impression `typeContrat==='renouvellement' ? … : '… initial …'` (l.15754, 16027, 17178, 19120) : ajouter une branche `repris` **ou** garder ces baux hors impression (R3). À traiter explicitement au plan (ne pas laisser tomber dans la branche « initial » qui afficherait un texte juridique faux).

---

## 4. Parser — extraction de l'occupation (`_acteExtract` + `_acteRegroup`)

Le parser est inline dans `index.html` (`_acteExtract` l.35628, `_acteRegroup` l.35786) avec un **miroir testé** dans `__tests__/helpers/acte-extract.js` (+ `acte-extract.test.js`). Toute modif se fait **dans les deux** + cas de test (parité).

### 4.1 `_acteExtract` — nouvelle section « occupation »

Produire `out.occupations = [{ lots:[…], locataire, hc, ch, debut, dg, _src:{…} }]` (best-effort, conservateur). Ancrer sur les clauses d'état locatif sur le **texte normalisé** `N` :

- **Détection occupé** : `actuellement\s+lou[ée]`, `donn[ée]\s+à\s+bail`, `occup[ée]\s+par` (hors « occupé par le vendeur »), `aux\s+termes\s+d['’]un\s+bail`, `[ée]tat\s+locatif`, `BAUX`.
- **Date de bail** : `bail\s+(?:en\s+date\s+)?du\s+(\d{1,2}[\/\.\s]\d{1,2}[\/\.\s]\d{2,4})` → ISO `AAAA-MM-JJ`.
- **Loyer** : `moyennant\s+un\s+loyer\s+(?:mensuel\s+)?de\s+([\d  .,]+)\s*(?:€|euros?)` → number. ⚠ Distinguer **mensuel vs annuel** (« par an »/« annuel ») : si annuel, diviser par 12 et **taguer à vérifier** (ne jamais persister un loyer annuel comme mensuel).
- **Charges** : `provision\s+(?:pour|de)\s+charges\s+de\s+([\d  .,]+)\s*(?:€|euros?)`.
- **Dépôt de garantie** : `d[ée]p[ôo]t\s+de\s+garantie\s+(?:de\s+)?([\d  .,]+)\s*(?:€|euros?)`.
- **Locataire** : après `lou[ée]\s+à\s+` / `à\s+(M\.|Mme|Monsieur|Madame|la\s+soci[ée]t[ée])\s+([A-ZÀ-Ÿ]…)` jusqu'au délimiteur.
- **Rattachement par lot** : si la clause cite des numéros de lot (`lots?\s+(?:n[°os]\s*)?(\d+(?:\s*(?:et|à|,|&)\s*\d+)*)`), renseigner `lots:[…]`. Sinon `lots:[]`.

- **Détection libre (= pas d'occupation)** : `libre\s+de\s+toute\s+(?:location|occupation)`, `vendu\s+libre`, `occup[ée]\s+par\s+(?:le|la)\s+vendeu`, `libre\s+de\s+location`. Si détecté et aucune clause occupée → `out.occupations = []` (tous vacants).

**Défensif** : ancre absente → `out.occupations = []`, jamais d'exception. Champs partiels → propriétés absentes (l'UI les marque « à compléter »).

### 4.2 `_acteRegroup` — rattachement aux logements

Après construction de `out.logements` (qui portent `_lots:[…]`), pour chaque occupation :
- recouper `occ.lots` avec `logement._lots` → attacher `logement.occupation = { locataire, hc, ch, debut, dg, _src, _matched:true }` au(x) logement(s) correspondant(s) ;
- si `occ.lots` est vide **et** qu'il n'y a qu'**un seul** logement → attacher à ce logement (`_matched:true`) ;
- sinon (ambigu) → empiler dans `out.notes` (« L'acte mentionne un bail mais sans lot identifiable — active et saisis l'occupation manuellement. ») et **ne rien attacher** (toggle off par défaut).

Chaque rattachement automatique émet une **note de vérification** (cohérent avec le regroupement de lots existant l.35829).

---

## 5. UI — variante A (étape Vérification)

Dans `_acteRenderVerif` / `_acteRenderLogements`, sous chaque carte logement, ajouter un bloc occupation :

- **En-tête** : titre « Occupation » + toggle iOS « Reprendre le bail en cours » (`.occ-switch`/`.occ-slider`). État par défaut = **on** si `logement.occupation._matched`, sinon **off**.
- Si **détecté** : badge vert « détecté » (`.occ-detected`).
- **Corps (si on)** : champs `Locataire` · `Loyer HC (€)` · `Charges (€/mois)` · `Date d'effet` (+ `Dépôt de garantie (€)` si extrait), chacun via `_acteFieldBlock` (l.35938) → tag `✨ à vérifier` (valeur présente) / `à compléter` (vide) + lien repliable « ⓘ d'après l'acte » citant `_src`.
- **Note** : encart info « Bail repris (Art. 1743) — pas de signature, finalisable ensuite dans le module Bail » (`.occ-note`).
- Si **off** : message « Logement vacant — tu pourras créer un bail plus tard » (`.occ-vacant`).

**Collecte** : étendre `_acteCollectLogements` pour lire l'état du toggle + les champs occupation dans `d.logements[i].occupation = { on, locataire, hc, ch, debut, dg }`. Re-rendu préserve les saisies (comme annexes).

**Récap** (`_acteRenderRecap`) : ligne « 🔑 N bail(s) repris » avec badge `Art. 1743` listant les logements concernés (calculée depuis l'état, source unique).

**Responsive / design system** : réutiliser tokens `css/main.css` + classes `.acte-*`/`.inp` ; toggles et champs passent en 1 colonne sur téléphone (mockup validé). Light/dark OK.

---

## 6. Application (`_acteApply`)

Après la boucle de création des logements (`createdLogs` prêts avec leur `.ref`, après l.36516) et **avant** le `saveDB()` final :

```
DB.baux = DB.baux || {};
createdLogs.forEach((log, i) => {
  const occ = (d.logements[i] || {}).occupation;
  if (!occ || !occ.on) return;
  if (DB.baux[log.ref] && (DB.baux[log.ref].signatures?.length)) return; // ne jamais écraser un bail signé
  const bail = { /* §3, depuis occ + ent.nom + ref */ };
  DB.baux[log.ref] = bail;
  _rollback.push(() => { delete DB.baux[log.ref]; });   // atomicité
  // cache dénormalisé sur le log
  log.locataire = occ.locataire || ''; log.hc = +occ.hc||0; log.ch = +occ.ch||0;
  log.dg = +occ.dg||0; log.debut = occ.debut || ''; log.fin = '';
  if (typeof _auditLog === 'function') _auditLog('create', 'bail', log.ref, ent.nom + '/' + log.ref + ' (repris)');
});
_stamp(ent);   // déjà appelé dans _acteApply ; s'assurer qu'il l'est après ces écritures
```

Le `saveDB()` unique existant persiste le tout ; en cas d'échec, le `_rollback` retire les baux + logements + audit (déjà en place).

---

## 7. Cas limites & garde-fous

1. **Loyer annuel** : si l'acte exprime un loyer annuel, convertir /12 **et** garder le champ tagué « à vérifier » (jamais persister un montant annuel comme mensuel).
2. **IRL inconnu** (`irl:''`) : aucune révision planifiée tant que l'indice n'est pas saisi (comportement identique à un bail manuel sans IRL). À **vérifier** que `agendaAutoSync` ne lève pas d'exception sur `irl` vide (test dédié).
3. **Pas de signature** (R3) : la fiche bail affiche « Bail repris » ; le module Bail ne propose pas d'imprimer/signer « comme le nôtre ». Vérifier qu'un bail sans `signatures` n'est pas traité comme verrouillé/immuable de travers.
4. **Lot ambigu / multi-logements** : pas de rattachement auto, toggle off, note de vérification (R6).
5. **Ré-import / doublon** : ne **jamais** écraser un `DB.baux[ref]` portant des signatures (bail signé existant). Logement réimporté = nouvelle `ref` (uniqueRef) de toute façon.
6. **Bien vendu libre** : occupations vides, tous toggles off.
7. **RGPD** : l'acte ne quitte pas le navigateur (parsing local pdf.js) ; fixtures de test **anonymisées** ; ne pas committer `actes/`.
8. **Sécurité** : assainir les valeurs extraites avant injection DOM (réutiliser `escHtml`) ; bornage des nombres.
9. **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant tout « prêt à tester » (création multi-objets + Drive + occupation = sensible).

---

## 8. Tests

- **Vitest `acte-extract.js`** (miroir) : extraction occupation — détecté complet (lots multiples groupés, ex. « lots 5 et 6 »), détecté partiel (loyer sans charges), libre/vacant, ambigu (pas de lot → note), loyer annuel converti+tagué, date FR→ISO, DG présent/absent. Cas dégradés : ancre absente, texte vide → `occupations:[]` sans exception. Fixtures **anonymisées**.
- **Intégration `_acteApply`** : opt-in on → `DB.baux[ref]` créé avec `typeContrat:'repris'`, sans `signatures`, cache `log.*` synchronisé ; opt-in off → pas de bail, logement vacant ; rollback si `saveDB` échoue (aucun bail orphelin) ; non-régression annexes/atomicité.
- **Cohérence dashboard** : un logement importé en bail repris ressort **occupé** avec loyer attendu = hc+ch (prorata), pas « vacant » (le bug de §0).
- **IRL** : bail repris sans `irl` → `agendaAutoSync` ne crashe pas, aucune révision planifiée ; saisie ultérieure de l'IRL → révision planifiée normalement.
- **Affichage `typeContrat:'repris'`** : select, fiche bail (« Repris (Art. 1743) »), pas de texte « Contrat initial » erroné en impression.
- **Visuel (vrai navigateur)** : 4 actes réels (`actes/`, non commités), 3 formats, light/dark ; toggles, citations source, récap « N baux repris ».
- **Non-régression** : `node scripts/check-inline-js.mjs` 0 erreur · `npx vitest run` vert · parité sandbox↔prod.

---

## 9. Découpage en phases (à détailler dans le plan)

> Pré-requis : **sandbox-first** (`index-test.html`) → vérifs → audit code-reviewer → **OK user explicite** → port PROD (`index.html`) byte-identique + bump version 4 emplacements + `sw.js` CACHE_VER + MAJ BACKLOG.
> ⚠ La session parallèle édite `index-test.html` et `index-candidature-test.html` — re-lire les régions avant édition, ne jamais committer ses changements.

- **Phase 1 — Parser (cœur de risque)** : section « occupation » dans `_acteExtract` + rattachement dans `_acteRegroup` (inline + miroir `__tests__/helpers`). Tests Vitest complets. *TDD.*
- **Phase 2 — `typeContrat:'repris'`** : option select (l.1452) + `typeContratMap` (l.34085) + branches d'impression (l.15754/16027/17178/19120). Tests d'affichage.
- **Phase 3 — UI variante A (Vérif)** : bloc occupation par carte logement + `_acteCollectLogements` étendu + récap « N baux repris ». Responsive + light/dark.
- **Phase 4 — `_acteApply`** : création `DB.baux[ref]` bail repris + cache + rollback + `_stamp` dans la transaction atomique. Tests intégration + cohérence dashboard + IRL.
- **Phase 5 — Audit code-reviewer + tests visuels 4 actes + responsive**, puis (après OK user) port PROD + déploiement + bump + BACKLOG.

---

## 10. Hors-scope (YAGNI / sous-projets séparés)

- **Upload DPE** à l'import (surface habitable + classe énergie/GES) — **sous-projet distinct**, différé.
- **Extraction enrichie** (prix de vente, régime copro + nb lots, syndic, type habitat, année) — D9–D11 de la spec 2026-06-02, différé.
- **Stockage de l'acte PDF** joint à l'immeuble — D13 de la spec 2026-06-02, différé.
- **Fil rouge de complétion** post-import — D12 de la spec 2026-06-02, différé.
- **État civil complet / clauses / co-locataires détaillés** du bail repris : on capte le nom + loyer + date ; le reste se complète via le module Bail.
- **OCR / LLM** pour actes scannés : différé (cf. §12 spec 2026-06-02).
- **Refonte ARCHI-DB-DOUBLONS** (liens par chaîne) : on suit le modèle existant (rattachement occupation par `_lots`).

---

## 11. Ancres techniques (PROD `index.html` v15.248 — re-vérifier au plan, lignes mouvantes)

| Élément | Ligne | Usage |
|---|---|---|
| `_acteExtract(rawText)` | 35628 | ajouter section « occupation » → `out.occupations` |
| `_acteRegroup(ext)` | 35786 | rattacher occupations aux logements (`_lots`) |
| `_acteRenderVerif` | 35956 | injecter le bloc occupation |
| `_acteFieldBlock` | 35938 | champs « ✨ à vérifier / à compléter » + source |
| `_acteRenderLogements` | 36042 | rendu par carte logement |
| `_acteCollectLogements` | (proche 36240) | lire l'état toggle + champs occupation |
| `_acteRenderRecap` | 36312 | ligne « N baux repris » |
| `_acteApply` | 36363 | création bail repris dans la transaction |
| `mkLog` (init occupation) | 36496 | `locataire/hc/ch/debut/fin/dg/irl` initialisés |
| boucle logements (`createdLogs`) | 36502-36516 | point d'insertion (après) |
| `saveBail` (sync cache) | 15428-15432 | modèle du cache dénormalisé |
| `_v4ComputeLotStatus` | 6483 | preuve §0 (attendu via bail uniquement) |
| `_getActiveBailHcChProrated` | 9679 | preuve §0 (`return 0` si pas de bail) |
| `<select id="b-typeContrat">` | 1452 | ajouter option `repris` |
| `typeContratMap` (fiche bail) | 34085 | mapper `repris` |
| branches impression typeContrat | 15754, 16027, 17178, 19120 | brancher/exclure `repris` |
| miroir parser | `__tests__/helpers/acte-extract.js` (+ `.test.js`) | parité + tests |
