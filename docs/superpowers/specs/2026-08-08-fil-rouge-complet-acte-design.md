# Fil rouge COMPLET — acte → rapprochement → complétion 100 % → baux

**Date** : 2026-08-08
**Statut** : design VALIDÉ (mockup v2 approuvé par le user le 2026-08-08 après retours du 17/07)
**Contrat visuel** : `mockups/fil-rouge-complet/index.html` (local, gitignoré) — 7 écrans, charte Propryo, vérifié vrai clic.
**Base build** : worktree neuf depuis `origin/main` (`b26240e`, v15.494). Tous les numéros de ligne ci-dessous = v15.494.
**Complète** : `docs/superpowers/specs/2026-07-14-fil-rouge-creation-bien-v2-design.md` (fil manuel, DÉPLOYÉ v15.494 — inchangé ici).

---

## 1. Objectif (demande user)

> « Un vrai fil rouge qui permette d'intégrer un acte de vente (ce qui est codé me semble ok), qui rapproche les infos vs ce qu'il y a déjà dans l'app (même bailleur ? même immeuble ?) et après un déroulé étape par étape jusqu'à la création du bail. L'utilisateur peut stopper quand il veut mais s'il suit le fil rouge du début à la fin, bailleur, immeuble, tous les biens et tous les baux sont complétés à 100 %. On réutilise le code déjà existant et les visuels déjà existants. On ne réinvente rien. Par contre on s'assure de bien faire la transition. »

## 2. Décisions user (mockup v2, retours du 17/07 — NE PAS re-violer)

1. **Écran vérif acte = l'écran EXISTANT COMPLET** (`_acteRenderVerif`), éditable : logements interprétés modifiables (✏️ regrouper, 🗑 supprimer, ➕ ajouter), toggle 🔑 Loué/Vacant (bail repris art. 1743), annexes 3 modes. **Pas de version condensée.**
2. **L'étape « récap » DISPARAÎT** (« si on a déjà validé en 2, pourquoi 3 ? ») : la création se fait **en bas de l'écran vérif** (synthèse 1 ligne + bouton « ✓ Tout est bon — créer »). Le wizard acte passe de 3 jalons à 2 (dépôt / vérif & création).
3. **Fil de complétion = ACCORDÉON poussé** (« tout à plat c'est illisible ») : UN nœud ouvert à la fois (« tu es ici »), fiches terminées repliées en ligne ✓, suivantes visibles mais fermées ; finir une fiche la replie et ouvre la suivante.
4. **Transition post-acte conservée** (écran « Patrimoine créé — le fil continue ») à la place du « Succès » cul-de-sac.
5. **Pause/reprise** : on peut mettre en pause n'importe où et revenir plus tard — état persisté, bandeau de reprise sur la page Biens qui rouvre le fil au nœud exact.
6. Rappels toujours valides : porte UNIQUE (choix acte/manuel dedans), stoppable partout, rien d'obligatoire, jamais de fusion automatique au rapprochement, DRY absolu.

## 3. Existant RÉUTILISÉ (rien de recopié) — v15.494

| Brique | Fonctions réelles | Lignes |
|---|---|---|
| Porte unique + fil manuel | `_frStart`/`_frShowFr('start')`/écrans propres `_frSubmitEnt/Imm/Log` | 44064 / 44162-44220 |
| Wizard acte | `openActeImport`, `_acteSetStep`, `_acteRenderVerif`, `_acteCollectVerif`, `_acteApply` (transaction+rollback), `_acteNextStep`/`_actePrevStep` | 41072 / 41083 / 41259 / 41554 / 41656 / 41613-41622 |
| Rapprochement bailleur (existant) | `_acteFindDupEntity` (SIREN 9 chiffres puis nom strict) + bandeau `acte-dup` | 41176 / 41265-41272 |
| Pont acte→fil | `_frAfterActe(ent, immName)` | 44097 |
| Saves réels | `openNewEnt`/`saveEnt` · `addImmForm`/`editImm`/`saveImm` · `openNewLog`/`saveParamLog` (garde identité `_frMode`) · `openBail(ref)` | 43613/44245 · 43704/43842 · 42605/43366 · 18499 |
| Occupation / vacance | `_bienActiveBail(ref)` | 31654 |
| Modules purs (source `__tests__/helpers/`, mirrors `js/helpers/*.global.js` via `tools/sync-helpers-global-mirrors.mjs`) | `ParcoursBienModel` (`identiteParcours`, `isRentable`, `buildParcoursTree`, `canCreateLogement`) · `FilRougeConductor` (`STEPS`, `entryStep`, `advance`, `breadcrumb`) · `AdresseParser` (`parseAdresse`, `formatAdresse`) — **AdresseParser jamais branché sur l'acte** | — |
| Bandeau/overlay du fil | `#ov-fr` (3206+), `_frAttachBread`, wrapper `closeM` (`_frInstallCloseHook`) | 44019-44032 |

## 4. Les 5 manques (audit v15.494) → 6 deltas

| # | Manque | Delta |
|---|---|---|
| 1 | Acte finit sur « Succès » cul-de-sac | **D4 Transition** : `_frAfterActe` ouvre l'écran transition dans `#ov-fr` |
| 2 | Rapprochement immeuble inexistant (« IMMEUBLE — toujours créé », 41696) | **D1 module pur match** + **D2 bandeau/popup + branche `_acteApply`** |
| 3 | Étape récap redondante | **D3 fusion** : création en bas de vérif, stepper 2 jalons |
| 4 | Pas de complétude au-delà du binaire louable | **D5 modèle de complétude** (tâches + %) + **écran accordéon** |
| 5 | `_frCtx` non persisté, pas de reprise | **D6 persistance + bandeau reprise** |

### D1 — Module pur `acte-rapprochement`
`__tests__/helpers/acte-rapprochement.js` (+ mirror global). `matchImmeuble(entite, {adr, cp, ville})` → `{imm, idx, strength:'identique'|'proche'}[]`, trié fort→faible. Normalisation via `parseAdresse` + canon (minuscules, sans accents, abréviations `r.`→`rue`, `av.`→`avenue`, `bd`→`boulevard`) : « identique » = n°+voie+ville égaux après canon ; « proche » = même voie+ville, n° différent/plage. **Match restreint à l'entité choisie** (les liens app sont par NOM — `log.imm` — donc rattacher = pointer le nom d'un immeuble de CETTE entité).

### D2 — Bandeau + popup immeuble dans le wizard acte
Dans `_acteRenderVerif`, sous la section Immeuble : si `_acteFindDupImm()` (wrapper inline qui appelle le module avec l'entité effective = `dupEntity` choisi ou null) renvoie des candidats → bandeau ambre miroir du bandeau bailleur (« Un immeuble existant ressemble à cette adresse ») avec **picker INLINE dans le bandeau** (liste radio : candidats + force du match + « ➕ Créer un nouvel immeuble »). ⚠️ Écart assumé vs mockup (qui montrait une popup) : le wizard acte est déjà un overlay, et la règle v2 « un seul overlay à tout instant » interdit d'en empiler un 2ᵉ — le picker se déplie dans le bandeau. Même traitement pour le choix bailleur (rattacher / créer) : radio inline dans le bandeau existant. Choix stocké `_acteDraft.dupImmeuble` (`{immId}` ou null). **Jamais automatique** ; recalculé si le user change l'adresse ou le choix d'entité. Dans `_acteApply` §2 : si `dupImmeuble` résolu → **ne pas créer** d'immeuble, `im = existant` (les logements pointent `log.imm = im.nom` existant ; réfs garanties uniques par `uniqueRef` existant ; `nbLots` existant += lots ajoutés ; note d'import ajoutée aux notes). Sinon comportement actuel inchangé.

### D3 — Fusion récap → vérif
`_acteNextStep` : en `verif` → `_acteCollectVerif()` puis **`_acteApply()` direct** (plus de passage `recap`). `_acteSetStep` : jalons `['depot','verif']`, libellé bouton « ✓ Tout est bon — créer », hint « Rien n'est écrit avant ce clic ». Une **ligne de synthèse** (pills : 🔗 bailleur rattaché / ✚ immeuble ou 🔗 immeuble rattaché / ✚ N biens / 🔑 N baux repris / 🔗 N annexes) rendue en bas de l'écran vérif, recalculée par `_acteCollectVerif` à chaque changement. Le markup de l'étape récap et `_acteRenderRecap` sont retirés (code mort sinon).

### D4 — Transition (la soudure acte → fil)
`_frAfterActe` n'ouvre plus `done` : il ouvre `#ov-fr` étape **`transition`** (nouvel écran `_frShowFr('transition')` : hero ✓ « Patrimoine créé — le fil continue » + résumé chiffré + 2 choix « Continuer — compléter à 100 % » → `completion` / « Plus tard — c'est gardé » → ferme + pose l'état de reprise). L'écran succès du wizard acte n'est plus jamais montré dans le fil (la branche hors-fil `_frOfferContinue('acte')` reste). Étapes ajoutées au conducteur pur (`FilRougeConductor.STEPS` + `advance`) : `transition`, `completion`.

### D5 — Modèle de complétude + écran accordéon
**Module pur** (extension `parcours-bien-model.js`) : `completionModel({entite, immeuble, logements, bauxByRef, activeBailRefs})` → `{nodes:[{kind:'ent'|'imm'|'log', id/ref, name, sub, badge:'loue'|'vac'|'rent'|null, tasks:[{id,label,detail,status:'done'|'todo'|'warn',action?}], full:boolean}], pct}`.
Tâches (v1, extensible) :
- **Bailleur** : identité (nom — posée) · gérant (`gerants.length||gerant`) · coordonnées (`emailEnvoi`) · IBAN (`iban`).
- **Immeuble** : adresse (`adr`+`ville`) · valeur/prix (`valeurEstimee>0`) · année (`annee>0`) · équipements communs (au moins un flag ou custom).
- **Logement** : caractéristiques (`canCreateLogement` : réf+type+surface) · n° fiscal (`numFiscal`, warn — obligatoire depuis 2024) · DPE (`dpe` renseigné) · **bail** :
  - bien occupé par un bail repris de l'acte (`bail.source?.import==='acte'` et `!bail.reprisVerifie`) → tâche **warn « Vérifier le bail repris »** ; boutons « Ouvrir le bail » (`openBail(ref)`) + « ✓ Vérifié » explicite (pose `bail.reprisVerifie=true` — jamais silencieux) ;
  - bien vacant louable (`isRentable` et `!activeBail`) → tâche « Créer le bail » (`openBail(ref)`) **ou « Vacant assumé »** (pose `log.vacantAssume=true`, la tâche passe done) — le 100 % reste atteignable sans forcer un bail ;
  - bien occupé par un bail normal → tâche done.
**Écran** `_frShowFr('completion')` : hero (titre + % + barre) + timeline verticale ACCORDÉON (un nœud ouvert = premier incomplet, ou choix manuel par clic d'en-tête ; nœud plein → replié ✓). Chaque nœud : tâches ✓/!/○ + bouton « Compléter → » qui ouvre l'**écran existant** (`openNewEnt(ent.id)` / `editImm(idx, entId)` / `openNewLog(ref)` / `openBail(ref)`). Au retour (save → `_frAfterSave`, ou fermeture de la modale via le wrapper `closeM`), le fil **rouvre `completion`** et recalcule. Nœuds = l'immeuble du fil courant + ses logements + le bailleur (pas tout le patrimoine — fidélité P4).

### D6 — Persistance + reprise
`DB.params.frCompletion = {entId, immName, dismissed:false}` posé à l'entrée en complétion (et par « Plus tard » depuis la transition), sauvé par `saveDB()` (params = déjà synchronisé cloud). Le % n'est PAS stocké (recalcul live). Page Biens (`rBiens`, 34024) : si état présent, `!dismissed` et `pct<100` → **bandeau de reprise** (🧭 nom immeuble + mini-barre % + « Reprendre → » = `_frStartCompletion(entId, immName)` / « Masquer » = `dismissed=true`). À 100 % : état purgé (`delete DB.params.frCompletion`). Le fil manuel peut aussi y déboucher plus tard (hors périmètre v1).

## 5. Hors périmètre

- Refonte du wizard bail, des fiches, du parcours manuel v15.494 (relais uniquement).
- Rapprochement immeuble inter-entités (le match reste dans l'entité choisie).
- Migration clé string→ID (`ARCHI-DB-DOUBLONS`) — on respecte les liens par NOM existants.
- Brancher la complétion à la fin du fil MANUEL (extension naturelle, session ultérieure).
- Unification `_acteApply` ↔ `save*` (constat d'audit n°5) — on garde les 2 voies, on n'en crée pas de 3ᵉ.

## 6. Garde-fous & gates (règles gravées)

- **TEST AU VRAI CLIC avec les vraies données** (26 biens réels + compte frais) : parcours complet acte→rapprochement (2 popups)→création→transition→complétion accordéon→bail→pause→reprise→100 %. Jamais de vérif par injection/appel direct.
- **Fidélité au mockup** vérifiée écran par écran (l'audit code-reviewer doit auditer LA FIDÉLITÉ, pas que la mécanique).
- DRY : aucun formulaire recopié ; grep de non-recopie au diff.
- `index.html` reste **CRLF** ; mirrors regénérés par `tools/sync-helpers-global-mirrors.mjs` puis normalisés (bug lignes vides avec espaces).
- Gates : `node scripts/check-inline-js.mjs` (0 erreur) · `npx vitest run` (suite verte) · `node --check sw.js`.
- Audit `superpowers:code-reviewer` AVANT « prêt à tester ». Bump version complet (title + footer + `IMMOTRACK_VERSION` + Récap DDT + `CACHE_VER` sw.js) au n° libre au-dessus d'`origin/main`. Coordination `.index-queue/QUEUE.md`.
