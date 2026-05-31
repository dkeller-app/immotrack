# MODALE-LOGEMENT-CONSOLIDATION Phase B — Plan d'implémentation

> **Spec / décisions** : `docs/subjects/MODALE-LOGEMENT-CONSOLIDATION.md` § « ✅ Décisions Phase B validées » (D-B1→D-B13).
> **Mockup validé** : `mockups/MODALE-LOGEMENT-CONSOLIDATION/mockup.html`.

**Goal** : Faire du logement la saisie unique du bien (diagnostics, équipements, bâti hérité de l'immeuble, loyer théorique), alléger le wizard bail à 3 étapes, et router le suivi des diagnostics vers l'Agenda + les actions prioritaires existantes.

**Architecture** : App mono-fichier vanilla JS (`index.html` ~39 k lignes). Source unique = objet `log` (logement) ; le bail lit via `_readLogForBail`/`_lbFill` ; bail signé lit le snapshot gelé `bail.signatures.bailSnapshot.log`. Migrations défensives au boot.

**Tech Stack** : HTML/CSS/vanilla JS, localStorage + Drive sync, jsPDF (bail/quittance), Vitest (tests data-layer ponctuels).

---

## ⚠️ Workflow imposé (règles utilisateur gravées — priment sur le format TDD générique du skill)

Ce plan **n'utilise pas** le format TDD micro-étapes/commit-par-étape du skill writing-plans. Il suit le workflow du projet :

1. **Sandbox-first** : toute modif d'abord dans `index-test.html`. On ne touche `index.html` (PROD) qu'après le **« OK » explicite** du user (`feedback_sandbox_first`).
2. **Phase par phase** : 1 phase = 1 incrément testable visuellement. Diff montré → commit après validation (`feedback_workflow`).
3. **Vérification** après chaque modif : grep symboles + sites collatéraux + CSS dans le bon scope (pas dans un template literal JS) + état localStorage (`feedback_modify_verify`).
4. **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant de dire « tu peux tester » sur toute phase sensible : schéma/migration (B1), Drive sync, génération bail/PDF (B2, B6, B7) (`feedback_audits_par_agents`).
5. **Bump version 5 emplacements** par phase livrée : `<title>` (~L6), `<em>` footer (~L57), label landing (~L3261), `IMMOTRACK_VERSION` (~L3319), `sw.js` CACHE_VER ; + `?v=` sur `main.css` si CSS touché (`feedback_versioning`).
6. **BACKLOG temps réel** : maj `BACKLOG.md` + `docs/subjects/MODALE-LOGEMENT-CONSOLIDATION.md` immédiatement après chaque commit (`feedback_pilotage_realtime`).
7. **Choix prédéfini + ajout libre toujours** : chaque liste de cases a une zone `customs[]` (`feedback_choix_plus_ajout_libre`).
8. **Responsive 3 formats** + **design system** respectés sur toute UI.

**HORS scope** (ne pas faire dans cette passe) : Phase 5 auto-report EDL · Bug B-A (immeuble hérité wrong) · Bug B-B (1ère connexion OAuth) · tout redesign du design system / autres pages.

---

## Découpage en phases

| # | Phase | Dépend de | Sensible (audit) | Décisions |
|---|---|---|---|---|
| B1 | Schéma DB + migrations | — | ✅ schéma/migration | D-B3, D-B4, D-B9 (schéma), D-B1 (imm.typeHabitat), D-B8 (schéma annexes) |
| B2 | Modale onglet Diagnostics unifié + drop DDT 360° | B1 | ✅ génération récap DDT | D-B2, D-B3 (UI), D-B4 (UI) |
| B3 | Bâti → immeuble (hérité + fallback) | B1 | — | D-B1 |
| B4 | Équipements consolidés + annexes 1 bloc | B1 | — | D-B7, D-B8 |
| B5 | Présentation : loyer théo + mise en valeur | B1 | — | D-B9, D-B10 |
| B6 | Bail : retrait régime fiscal + jpay 5 | — | ✅ génération bail | D-B5, D-B6 |
| B7 | Wizard Bail 4→3 étapes | B3, B5 | ✅ PDF légal | D-B13 |
| B8 | Suivi Agenda DIAG + actions prioritaires + login | B1 | — | D-B11, D-B12 |

Ordre d'exécution conseillé : **B1 → B2 → B8 → B3 → B4 → B5 → B6 → B7**.
(B1 fondation ; B2+B8 exploitent immédiatement `log.diagnostics` unifié = preuve que la fondation est saine ; B3/B4/B5 = refonte modale ; B6 petit ; B7 wizard en dernier car il consomme B3+B5.)

---

## Phase B1 — Schéma DB + migrations (FONDATION)

**Objectif** : unifier les structures de données AVANT toute UI, avec migration boot défensive + retrocompat lecture. Aucune UI modifiée.

**Fichiers / ancres** :
- `index-test.html` zone migrations boot (≈ L26960-26985 : bloc qui backfill `log.dpe`/`log.etatRisques` depuis bail) — c'est là qu'on ajoute la migration de consolidation.
- `_diagSave` (≈ L31898-31924) écrit déjà `log.diagnostics[key]` + retrocompat `log.dpe`(string)/`log.dpeDate`.
- `_diagGet` (≈ L31608-31614) lit `log.diagnostics` puis fallback `log.dpe`(string).
- Modale saveLog `log.dpe`(objet) (≈ L35267-35273), `log.etatRisques` (≈ L35275-35281).

**Collision à résorber** : `log.dpe` est **string** (chemin DDT) **et** **objet** (chemin modale) selon qui a écrit en dernier. Cible canonique = `log.diagnostics`.

**Schéma cible `log.diagnostics`** (par diagnostic, clé ∈ dpe/elec/gaz/erp/plomb/amiante/bruit/…) :
```
log.diagnostics[key] = {
  date: 'YYYY-MM-DD',        // date de réalisation
  classe: 'C',               // DPE: classe énergie ; autres: résultat ('Conforme'|'Anomalies'|'Établi'|…)
  ges: 'A',                  // DPE uniquement
  valEner: 145,              // DPE: kWh/m²/an
  depensesEnergie: '900 à 1 200 €', // DPE: D-B4, migré depuis bail.depensesEnergie
  diagnostiqueur: 'Bureau Veritas',
  na: false,                 // non applicable bailleur
  presence: true, conforme: true   // champs existants conservés
}
```
Contexte auto-détection conservé tel quel : `log.anneeConstruction`, `log.installationGazAnnee`, `log.installationElecAnnee`, `log.zoneRisques`.

**Champs scalaires à ajouter sur `log`** (defensive, init si absent) :
- `log.loyerHcRef`, `log.chargesRef`, `log.dgRef`, `log.irlRef` (loyer **théorique** — distincts de `log.hc/ch/dg` qui sont la valeur **live** mutée par l'IRL ; cf L15148, L20169).
- `log.annexes` : passer/garantir une forme structurée `{cave:bool, grenier:bool, parking:bool, garage:bool, box:bool, buanderie:bool, cellier:bool, localVelos:bool, atelier:bool, numIdent:'', customs:[]}` (migration depuis l'ancien texte libre « locaux accessoires » si présent).

**Champ à ajouter sur l'immeuble** : `imm.typeHabitat` (string) dans le schéma `DB.entites[].immeubles[]` (init défensif au boot ; le form vient en B3).

**Migration boot (logique)** :
```
// pour chaque entité → chaque logement log :
// 1) DPE : si log.dpe est une STRING (legacy DDT), la convertir en log.diagnostics.dpe.classe ;
//    si log.dpe est un OBJET (legacy modale), fusionner ses champs dans log.diagnostics.dpe (sans écraser une valeur déjà présente dans log.diagnostics).
// 2) Risques : fusionner log.etatRisques{erp,plomb,amiante,elec,gaz,bruit} dans log.diagnostics[key] correspondants (classe/conforme/presence) sans écraser.
// 3) depensesEnergie : si log.diagnostics.dpe.depensesEnergie absent ET un bail du logement a bail.depensesEnergie → copier (bail le plus récent NON signé prioritaire ; ne jamais lire dans un bailSnapshot signé pour muter log).
// 4) loyerHcRef etc. : si absent → laisser vide (PAS de copie auto depuis log.hc). Alimenté ENSUITE par le bail (push, cf B1-a).
// 5) annexes : si log.annexes est une string → parser en {…, customs:[<string>]} best-effort.
// Idempotent : la migration ne réécrit pas si log.diagnostics[key] déjà peuplé.
```

**✅ DÉCISION B1-a (re-tranchée 2026-05-29)** : le théorique est **alimenté par le bail (push)**, jamais lu en fallback depuis `log.hc` (**pull interdit**).
- **Migration** : `log.loyerHcRef`/`chargesRef`/`dgRef`/`irlRef` laissés **vides** (aucun seed aveugle depuis `log.hc`).
- **Lecture** (UI Présentation B5 + prefill bail) : lire `log.loyerHcRef` **brut**. Vide = affiché vide. **PAS** de `|| log.hc`.
- **Écriture — propagation bail → théorique** (nouvelle sous-tâche, data-layer, rattachée à B1) :
  - **Q1 = a** : à **chaque enregistrement de bail** (brouillon compris), pousser loyer HC / charges / DG / IRL → `log.loyerHcRef` / `chargesRef` / `dgRef` / `irlRef`.
  - **Q2 = b** : une **révision IRL** (qui mute `log.hc` à ≈ L20169) met **aussi** à jour `log.loyerHcRef` (le théorique suit la dernière valeur connue).
  - **Q3 = a** : le bail **fait foi** et **écrase** une valeur théorique saisie manuellement.
  - **Garde** : ne pousser qu'une valeur **non vide** (truthy) — un champ bail laissé blanc ne doit JAMAIS effacer un théorique existant.
  - **Sites** : là où `log.hc/ch/dg` sont déjà écrits depuis le bail (≈ L15148) + révision IRL (≈ L20169). Écritures parallèles aux mêmes endroits.
  - **Bail signé** : la propagation lit la valeur du bail enregistré (non figé côté `log`) ; ne JAMAIS muter un `bail.signatures.bailSnapshot` (immutabilité légale).

**Retrocompat lecture** : ne PAS supprimer les lectures `log.dpe` ailleurs encore. `_diagGet` (L31608) est DÉJÀ le lecteur canonique (lit `log.diagnostics[key]` d'abord) → **on n'ajoute pas de `_logDiag` parallèle** (éviter deux lecteurs). On rend juste le fallback DPE de `_diagGet` robuste à `log.dpe` objet. Repointer les autres lectures au fil de B2.

**⚙️ Ajustements d'implémentation B1 (arrêtés 2026-05-29, après lecture du code) :**
- **Migration risques (`log.etatRisques`) → DÉPLACÉE en B2.** Les valeurs legacy sont du texte libre non structuré (ex. « Conforme / Date diag ») : les parser en `{date, conforme, presence}` dans une migration *sensible* serait fragile. Aucun risque de corruption de type (etatRisques est toujours un objet de strings) et le moteur ne les lit pas aujourd'hui → 0 régression à les laisser en B1. B2 (rebuild modale) gère leur reprise avec l'UI structurée.
- **Migration annexes (string → objet) → DÉPLACÉE en B4.** Convertir le schéma sans toucher le read/write modale (fait en B4) laisserait un état mi-migré qui casse le champ annexes courant. Migration atomique avec l'UI en B4.
- **B1 ne migre donc QUE la collision DPE** (string vs objet = corruption active, le vrai bug) + `depensesEnergie` (bail → `log.diagnostics.dpe`) + **backfill loyer théo depuis le bail existant** (décision migration : « backfill depuis le bail existant »).
- **Garde anti-churn** : aucun init aveugle de `loyerHcRef`/`imm.typeHabitat` (les lecteurs utilisent `|| ''`). On ne mute un `log` que s'il a une vraie donnée legacy à consolider (la détection de changement L26993 ne stampe que les logs réellement modifiés).
- **Fraîcheur canonique** : `saveLog` (L35267) reçoit (a) un guard de type `log.dpe = (objet) ? : {}` (anti-corruption immédiate) + (b) un mirror `log.dpe` → `log.diagnostics.dpe` (Object.assign des 6 champs, préserve `depensesEnergie`/`na`/…) pour que le canonique reste frais après édition modale, avant le rebuild B2.
- **`imm.typeHabitat`** : pas de migration boot ; introduit en B3 où le form le lit/écrit (`|| ''`).
- **Propagation forward** : helper `_pushLoyerTheoFromLive(log)` (garde non-vide) appelé aux **6** sites de mutation live trouvés au grep : `saveBail` L15148 · IRL immédiat L20169 · IRL auto-anniversaire L20215 · IRL undo L20303 · IRL bulk L37949 · import L40281.

**Vérif** :
- grep `log.dpe` / `log.etatRisques` → recenser TOUS les sites lecteurs ; vérifier que la migration ne casse aucun (affichage fiche L33807 lit `log.dpe` string → garder retrocompat tant que B2 ne l'a pas repointé).
- Boot app avec données réelles (copie) : 0 erreur console, logements + baux existants s'affichent identiques.
- localStorage : inspecter `log.diagnostics` peuplé, `log.dpe` legacy intact (retrocompat).

**Audit** : `superpowers:code-reviewer` (migration = Drive-sync sensible : idempotence, pas d'écrasement, immutabilité snapshot signé).

**Acceptation** : migration idempotente vérifiée (re-boot ne change rien), 0 régression d'affichage, audit SHIP. **PAS de UI changée.**

**Bump** + commit `v15.233 - MODALE-LOGEMENT Phase B1 : schéma log.diagnostics unifié + migrations` + maj BACKLOG/subject.

---

## Phase B2 — Modale onglet Diagnostics unifié + drop DDT 360°

**Objectif** : 1 onglet « 🏷 Diagnostics » dans la modale logement (table groupée, fill once), lisant/écrivant `log.diagnostics`. Supprimer les onglets séparés DPE + Risques de la modale et l'écran DDT 360° par-logement. GARDER le moteur de calcul + la génération du récap DDT joint au bail.

**Fichiers / ancres** :
- Modale onglets DPE/Risques actuels : tab DPE (≈ L34557 `log.dpe`), tab Risques (≈ L34566 `log.etatRisques`), saveLog (≈ L35267-35281). → remplacer par 1 onglet `diag`.
- `_renderLogFichePanelDiagnostics` (L31694) : écran DDT 360° par-logement → **retirer le rendu** (l'onglet/bouton « Diagnostics » de la fiche 360°), mais GARDER `_diagStatut` (L31658), `_diagDateExpiration` (L31638), `_ddtComplet` (L31674), `_diagSaveContext`.
- Génération récap DDT imprimable joint au bail (chercher l'appelant de `_ddtComplet`/récap dans la chaîne PDF bail) → **conserver** (loi 89-462 art. 3-3).

**Travail** :
1. Construire l'onglet `diag` (table : Diagnostic / Date / Résultat / Diagnostiqueur / Expire le / Statut) + détail DPE (GES, kWh/m²/an, **€/an** `depensesEnergie`) + contexte auto-détection (année construction héritée immeuble, disabled). Lecture/écriture via `log.diagnostics` (+ helper `_logDiag`).
2. Affichage conditionnel : ne montrer que les diagnostics applicables (réutiliser la logique d'applicabilité de `_DIAGS_CATALOG_INLINE` / `_renderLogFichePanelDiagnostics`).
3. Statut/expiration affichés via `_diagStatut`/`_diagDateExpiration` (réutilisés).
4. saveLog : écrire `log.diagnostics` (forme canonique B1). **Supprimer** les écritures `log.dpe`(objet)/`log.etatRisques` de saveLog. Conserver une retrocompat écriture `log.dpe`(string)=classe SI un lecteur legacy subsiste (sinon repointer L33807 vers `_logDiag`).
5. Repointer l'affichage fiche logement (L33807 DPE) vers `_logDiag(log,'dpe').classe`.
6. Retirer l'entrée « Diagnostics » de la fiche 360° (le bouton « Indications annonce » v15.229 reste).

**Vérif** : grep `_renderLogFichePanelDiagnostics`, `log.etatRisques`, `log.dpe` → tous les lecteurs repointés ou retrocompat OK ; génération bail récap DDT toujours fonctionnelle (test : générer un bail, vérifier la page DDT). CSS dans le bon scope.

**Audit** : `superpowers:code-reviewer` (la chaîne récap DDT touche le bail légal).

**Test visuel** : modale → onglet Diagnostics : saisir DPE (classe/GES/kWh/€/date/diagnostiqueur), ERP, élec/gaz ; statut calculé ; non-applicables masqués. Générer un bail → page DDT présente et correcte. Fiche 360° → plus d'onglet Diagnostics.

**Bump** + commit + BACKLOG.

---

## Phase B8 — Suivi Agenda DIAG + actions prioritaires + login

(placée tôt car elle valide que `log.diagnostics` unifié est exploitable end-to-end)

**Objectif** : pousser les échéances de diagnostics dans l'Agenda (`cat:'DIAG'`) et faire remonter les **expirés** dans les **actions prioritaires existantes** (`_computeUnifiedTodo`). PAS de nouvelle carte dashboard. Rappel au login.

**Fichiers / ancres** :
- `agendaAutoSync()` (L4926) : modèle d'event `{date, cat, titre, logement, rappels:[…], auto:true, autoKey, done:false, createdAt}` ; idempotence via `autoKey` + `existing` Set (L4938). Pattern de purge auto-keys L4935.
- `_computeUnifiedTodo(ctx)` (L9844) : items `{type, severity:'red'|'ora'|'info', score, title, subtitle, contextRef, actionLabel, actionFn}`. Principe anti-doublon (L9895) : « baux à terme = hors À-traiter, déjà dans l'Agenda ».
- `_checkIRLRappelsAuLogin(source)` (L22601) : pattern rappel login.
- `_diagDateExpiration(diagKey, info)` (L31638) : calcul expiration. Durées : DPE 10 ans, élec/gaz 6 ans (réalisation), ERP 6 mois.

**Travail** :
1. Dans `agendaAutoSync`, ajouter une boucle sur les logements × `log.diagnostics` : pour chaque diag applicable avec une date → calculer `_diagDateExpiration` → créer event `cat:'DIAG'`, `autoKey:'DIAG:<ref>:<key>:<expYear>'`, `rappels:[90,30,7]`. Purge des anciens `DIAG:` comme pour IRL.
2. Dans `_computeUnifiedTodo`, ajouter items `type:'diag'` UNIQUEMENT pour les diagnostics **expirés** (action requise) : `severity:'red'`, `title` ex. « DPE expiré — <logement> », `actionFn` ouvrant la modale logement onglet Diagnostics. **Respecter l'anti-doublon** : À-traiter = expirés (action requise maintenant) ; les à-venir restent dans l'Agenda uniquement.
3. Rappel login : dans le flux `_checkIRLRappelsAuLogin` (ou son appelant), ajouter un check « diagnostics expirés » → message au login.

**Vérif** : grep `cat:'DIAG'`, `type:'diag'` ; vérifier idempotence agenda (re-sync ne duplique pas) ; vérifier que les actions prioritaires ne doublonnent pas l'agenda (expirés seulement).

**Test visuel** : un logement avec ERP expiré → apparaît en rouge dans actions prioritaires (hero) ET en « En retard » dans l'Agenda ; un diag expirant dans 60 j → dans l'Agenda (à-venir) mais PAS dans actions prioritaires. Rappel au login si expirés.

**Bump** + commit + BACKLOG.

---

## Phase B3 — Bâti → immeuble (hérité + fallback)

**Objectif** : type d'habitat / période de construction / régime juridique = propriétés de l'immeuble, héritées (lecture seule) dans la modale logement ; éditables sur le logement si aucun immeuble lié.

**Fichiers / ancres** :
- Form immeuble : `imm-periodeConstr` (L2692), `imm-regimeJuridique` (L2704), `imm-annee` (L2690). **Ajouter `imm-typeHabitat`** (select, à placer près de periodeConstr) + lecture/écriture dans saveImmeuble + schéma B1.
- Modale logement bâti : `log-typeHabitat` (L1938), `log-regimeJuridique`, `log-periodeConstr` (L1956). → retirer de la saisie ; remplacer par bloc « Caractéristiques de l'immeuble » hérité lecture seule + lien « Modifier sur la fiche immeuble ».
- Résolution immeuble lié : `log.imm` (nom) dans `log.entity` → trouver `imm` correspondant (cf instrumentation `_logRefreshInherited` ≈ L34481).

**Travail** :
1. Ajouter `imm-typeHabitat` (form + save + render immeuble).
2. Modale logement : si `log.imm` non vide ET immeuble trouvé → afficher les 3 champs hérités en lecture seule (valeurs de l'immeuble) + lien.
3. Si `log.imm` vide (logement autonome) → afficher les 3 champs **éditables** sur le logement (fallback : `log.typeHabitat`/`log.regimeJuridique`/`log.periodeConstr`).
4. À la lecture (bail récap, annonce…) : prendre la valeur immeuble si lié, sinon la valeur logement.

**Vérif** : grep `log-typeHabitat`, `log.typeHabitat`, `imm-typeHabitat`, `_logRefreshInherited` ; cohérence affichage hérité (attention Bug B-A connu : donnée immeuble potentiellement corrompue — ne PAS le corriger ici, juste ne pas régresser).

**Test visuel** : logement lié à un immeuble → 3 champs grisés = valeurs immeuble ; logement autonome → 3 champs éditables.

**Bump** + commit + BACKLOG.

---

## Phase B4 — Équipements consolidés + annexes 1 bloc

**Objectif** : regrouper tout l'équipement physique dans l'onglet Équipements ; 1 seul bloc annexes structuré (dédoublonnage).

**Fichiers / ancres** :
- `log.equipements.*` (migration v15.08, L4675) avec pattern `.customs[]` (ids `logp-*-customs` L2114/2132/2209). Cuisine/sanitaires/technologies/extérieurs sont aujourd'hui dans l'onglet Présentation → les déplacer vers Équipements en gardant les clés.
- `log.annexes` (objet, sérialisé pour `_lbFill.annexes` L14141). Ancien doublon : « Locaux accessoires » (Description) + « Annexes privatives » (Équipements) → fusionner en 1 bloc B1.

**Travail** :
1. Déplacer les sections cuisine/sanitaires/technologies/extérieurs vers l'onglet Équipements (DOM + handlers), clés `log.equipements.*` inchangées → l'annonce continue de lire.
2. Annexes : checkboxes (cave/grenier/parking/garage/box/buanderie/cellier/localVelos/atelier) + champ n° d'identification + zone ajout libre `customs[]` → écrit `log.annexes` (forme B1). Retirer l'ancien champ « Locaux accessoires » texte libre de Description.
3. Vérifier que `_lbFill.annexes` / l'EDL / l'annonce lisent toujours correctement la nouvelle forme.

**Vérif** : grep `log.equipements`, `log.annexes`, `locauxAccessoires`, `customs` ; l'annonce + le bail (annexes) lisent la nouvelle forme ; règle D1 (customs) présente partout.

**Test visuel** : onglet Équipements complet ; cocher/ajouter custom ; annexes 1 seul bloc ; annonce régénérée lit les équipements ; bail annexes OK.

**Bump** + commit + BACKLOG.

---

## Phase B5 — Présentation : loyer théo + mise en valeur

**Objectif** : restaurer le loyer/charges théoriques (cas vacant, ML-1) + structurer la mise en valeur (sans IA).

**Fichiers / ancres** :
- Onglet Présentation modale (LOG-ANNONCE). Champs mise en valeur structurés probablement déjà présents (vérifier) ; sinon les ajouter.
- `log.loyerHcRef/chargesRef/dgRef/irlRef` (schéma B1).
- Création bail : prefill défaut (≈ openBail L14069+, `el('b-hc').value = log.hc||''` L14494) → ajouter fallback sur `log.loyerHcRef` si pas de valeur live.

**Travail** :
1. Section « Conditions de location » dans Présentation : loyer HC théo / charges théo / DG théo + IRL réf (select) + date dispo + garanties acceptées (checkboxes). Écrit `log.loyerHcRef` etc.
2. Mise en valeur structurée : exposition/vue/luminosité/calme/caractère + proximité (min) + services (checkboxes + customs) — vérifier l'existant LOG-ANNONCE, ne pas dupliquer.
3. Prefill bail : à la création (bail non signé, logement vacant) → proposer `log.loyerHcRef` comme défaut.

**Vérif** : grep `loyerHcRef`, prefill bail, générateur annonce lit les champs mise en valeur.

**Test visuel** : saisir loyer théo sur logement vacant ; créer un bail → valeurs proposées ; annonce générée cohérente.

**Bump** + commit + BACKLOG.

---

## Phase B6 — Bail : retrait régime fiscal + jpay défaut 5

**Objectif** : supprimer le champ mort `b-fiscal` ; jour de paiement par défaut = 5.

**Fichiers / ancres** (toutes confirmées) :
- Champ HTML `b-fiscal` (L1473) → supprimer le `<div class="fg">`.
- Lectures/écritures : L13347 (`el('b-fiscal').value = b.fiscal||''`), L14075, L15275 (`fiscal: v('b-fiscal')`), mappings L13976 (`fiscal:'b-fiscal'`) + L14273 (`['b-fiscal','fiscal','text']`) + L14314 zone.
- Affichage fiche bail L33858 (`bail.fiscal?…`) → supprimer.
- `b-jpay` : défaut courant '1' (L13347 `el('b-jpay').value = b.jpay||'1'`) → '5'. Vérifier aussi le défaut à la création (v('b-jpay') / valeur initiale du champ HTML).

**Important** : ne PAS supprimer `bail.fiscal` des objets bail **signés** existants (donnée historique gelée) ; on retire seulement le champ de saisie + les lectures d'affichage. Pour bails signés, l'immutabilité du snapshot doit rester byte-identique → vérifier que retirer l'affichage `bail.fiscal` ne change pas un PDF re-rendu d'un bail signé (le champ n'apparaît dans aucune clause PDF d'après l'audit — confirmer par grep dans les générateurs).

**Vérif** : grep `b-fiscal`, `bail.fiscal`, `.fiscal`, `b-jpay`, `jpay` → tous traités ; aucun générateur PDF ne lit `fiscal`.

**Audit** : `superpowers:code-reviewer` (touche les chemins de génération bail).

**Test visuel** : modale bail sans champ fiscal ; jpay pré-rempli à 5 ; génération bail PDF OK ; bail signé existant re-rendu identique.

**Bump** + commit + BACKLOG.

---

## Phase B7 — Wizard Bail 4→3 étapes

**Objectif** : fusionner « Le bien » + « Finaliser » en un Récapitulatif (bien + diagnostics hérités, lecture seule). 3 étapes : Personnes / Conditions / Récapitulatif.

**Fichiers / ancres** :
- Wizard bail : structure des étapes (stepper + panes step-1..4). `_readLogForBail`/`_lbFill` déjà en place (Phase A/4b) pour lire le bien depuis log. `openBail` prefill (L14069+).
- Type de bail hérité de `log.typeUsage` (D-B13/WB-2).
- Immutabilité bail signé : `bail.signatures.signedAt` → valeurs figées via `bailSnapshot` (F1/G2/H1/I1/I2 déjà implémentés).

**Travail** :
1. Réduire le stepper à 3 étapes ; déplacer les champs « bien » + « Finaliser » (DPE/GES/risques) dans un pane Récapitulatif **lecture seule**, alimenté par `_lbFill` (hérité du log).
2. Conditions : type de bail pré-rempli depuis `log.typeUsage` ; jpay défaut 5 ; DG auto / date fin auto / IRL auto conservés.
3. Personnes : locataires + garants + tél/email (garants déjà présents — ne pas régresser).
4. UX grisage : champ hérité affiché lecture seule avec picto « 🏛 hérité du bien » + lien « Modifier sur la fiche du bien » ; bail signé → figé (immutabilité légale).
5. Diagnostics dans Récap : lus depuis `log.diagnostics` (via `_lbFill`/`_readLogForBail`) en lecture seule.

**Vérif** : grep étapes wizard, `_lbFill`, `log.typeUsage` ; génération bail complète (PDF + aperçu) ; bail signé re-rendu byte-identique (régression interdite).

**Audit** : `superpowers:code-reviewer` **OBLIGATOIRE** (PDF bail légal opposable + immutabilité signé).

**Test visuel** : créer un bail bout-en-bout en 3 étapes ; tous les champs bien auto-remplis ; PDF complet ; bail signé existant inchangé.

**Bump** + commit + BACKLOG. Met à jour le statut sujet → Phase B terminée (si B5 auto-report EDL reste hors scope, le noter).

---

## Self-review (couverture spec)

- D-B1 (bâti→immeuble) → B1 (schéma imm.typeHabitat) + B3 (UI). ✅
- D-B2 (diag modale, drop 360°) → B2. ✅
- D-B3 (source unique log.diagnostics) → B1 (migration) + B2 (UI/repoint). ✅
- D-B4 (conso €/an) → B1 (champ+migration) + B2 (UI). ✅
- D-B5 (retrait fiscal) → B6. ✅
- D-B6 (jpay 5) → B6. ✅
- D-B7 (équipements consolidés) → B4. ✅
- D-B8 (annexes 1 bloc) → B1 (schéma) + B4 (UI). ✅
- D-B9 (loyer théo) → B1 (schéma, décision ouverte migration) + B5 (UI). ✅
- D-B10 (mise en valeur structurée) → B5. ✅
- D-B11 (agenda DIAG) → B8. ✅
- D-B12 (actions prioritaires diag, pas de carte) → B8. ✅
- D-B13 (wizard 3 étapes) → B7. ✅

**Décision B1-a — TRANCHÉE** : théorique poussé par le bail (push, Q1=a / Q2=b / Q3=a), jamais lu en fallback `log.hc` (pull interdit). Garde non-vide. Cf § Phase B1 détaillé.
