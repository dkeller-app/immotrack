# Fil rouge « Ajouter un bien » — v2 (parcours guidé, un écran à la fois)

**Date** : 2026-07-14
**Statut** : design validé (mockup approuvé), prêt pour plan d'implémentation
**Remplace** : `2026-07-09-fil-rouge-creation-bien-design.md` (v1 `8b804e3` v15.464 — **DÉPLOYÉE PUIS REVERTÉE** `c863f3a` v15.469)
**Base build** : worktree `feat/fil-rouge-bien-v2` sur `origin/main` (`fd55c31`, v15.473)
**Mockup de référence (jetable, local)** : `mockups/fil-rouge-creation-bien-v2/index.html`

---

## 1. Pourquoi (le rejet de la v1)

La v1 était une **coquille plein écran** `#ov-parcours-bien` (overlay `.ov`) affichant un **arbre de patrimoine à remplir**. Trois bugs constatés en prod, tous rejetés par le user :

1. **Superposition** — la coquille `.ov` (dernière du DOM) partageait `z-index:200` avec les modales qu'elle lançait (#ov-ent/#ov-imm/#ov-log) → elles s'ouvraient **derrière** elle.
2. **Patrimoine vide** — l'entrée manuelle atterrissait sur « choisis d'abord un bailleur » (arbre vide).
3. **Porte séparée** — l'enchaînement était gardé par `if(!_pbActive)` : « importer un acte » depuis Logement (bouton normal) ne déclenchait rien.

Retours ultérieurs du user sur les itérations de refonte (mockup) :
- Un fil rouge doit **guider une étape à la fois** et **pousser vers l'avant**, pas afficher un tableau à plat.
- Le **fil d'Ariane** doit rester visible et **continu**, et **continuer jusqu'au bail**.
- **L'utilisateur doit toujours pouvoir s'arrêter** ; **rien n'est obligatoire** (pas de complétion forcée).

## 2. Principe retenu

**Le fil rouge = un chef d'orchestre qui enchaîne les modales EXISTANTES, une à la fois, avec un fil d'Ariane persistant.**

- **Séquence guidée auto-poussée** : Bailleur → *(auto)* Immeuble → *(auto)* Logement → « et ensuite ? » → Bien prêt → *(optionnel)* Bail.
- **Un seul overlay à tout instant** — non par une coquille, mais parce qu'on **ouvre une modale existante après fermeture de la précédente**. Le bug de superposition disparaît **par construction** (plus jamais deux `.ov` empilés).
- **Fil d'Ariane** persistant : `① Bailleur ─ ② Immeuble ─ ③ Logement ─ ④ Bail`, maillons reliés par un **segment continu** (vert = fait, dégradé vert→corail = en cours). C'est **la seule pièce d'UI vraiment neuve** ; elle s'**attache** aux modales existantes.
- **Stoppable partout, rien de forcé** : sortie « Plus tard — c'est gardé » sur **chaque** écran (+ croix ✕). À « Bien prêt » le choix est « Terminer sans bail » vs « Créer le bail ». Le bail est un plus, jamais un passage obligé.

## 3. Réutilisation (DRY — NON NÉGOCIABLE, [[feedback_dry_reuse_no_copy]])

**Aucun formulaire recopié, aucune logique de création réinventée.** Le fil rouge APPELLE les fonctions réelles de `index.html` (`origin/main fd55c31`) :

| Étape | Fonctions existantes appelées (jamais recopiées) | Ligne (fd55c31) |
|---|---|---|
| Bailleur | `openNewEnt(id?)` (#ov-ent) → `saveEnt()` | 43001 / 43371 |
| Immeuble | `addImmForm(entId)` / `editImm(idx,entId)` (#ov-imm) → `saveImm()` | 43092 / 43127 / 43230 |
| Logement | `openNewLog(ref?)` + `setLogModalTab('ident')` + `refreshLogImmSelect()` (#ov-log) → `saveParamLog()` | 42012 / 39306 / 43499 / 42770 |
| Import acte | `openActeImport()` → commit dans `_acteApply()` | 40480 / 41064 |
| Suppression | `delImm(idx,entId)` / `delLog(ref)` — **tombstone canonique**, JAMAIS un 2ᵉ chemin ([[feedback_wrapping_context]]) | 43294 / 42961 |
| Bail | relais `openBail(ref)` — le wizard bail existant prend la main | 18206 |
| Complétude / normalisation | module pur **`parcours-bien-model`** (déjà audité, 15 tests) à **restaurer** depuis la branche `feat/fil-rouge-creation-bien` + mirror `window.ParcoursBienModel` + entrée `tools/sync-helpers-global-mirrors.mjs` | — |

Schéma réel à respecter (rappel v1) : logement = `surf` (surface), `hc`/`ch` (loyer), `dpe` = **objet** `{classe|lettre|note}`. Bailleur↔logement = `l.entity` (NOM). Logement↔immeuble = `l.imm` (NOM). Immeubles dans `ent.immeubles[]`.

## 4. Ce qui est réellement NEUF (couche mince uniquement)

1. **Conducteur du fil** — un état `_frMode` (actif/inactif) + `_frStep` + `_frCtx` (entité/immeuble courants). **Hooks post-save gardés** posés dans les save existants : `saveEnt`/`saveImm`/`saveParamLog`/`_acteApply` appellent, en fin de succès, un `_frAfterSave(kind,obj)` **inerte hors fil rouge** (`if(!_frMode) return;`). C'est le pattern `_pbAfterSave` de la v1 (qui était correct) — on **corrige** seulement : (a) l'auto-avance **ouvre la modale existante suivante** au lieu de re-render un arbre ; (b) le déclenchement ne dépend plus d'une porte pré-ouverte (voir §6).
2. **Fil d'Ariane** — barre `bailleur ─ immeuble ─ logement ─ bail` **injectée dans l'en-tête des modales existantes** quand `_frMode` (voir §5), rendue par `_frRenderBread()` depuis `_frCtx`.
3. **Écran « et ensuite ? »** — après un logement enregistré : `+ Un autre logement ici` (rouvre #ov-log même immeuble) · `+ Un autre immeuble` (rouvre #ov-imm) · `C'est bon → Bien prêt`.
4. **Bien prêt** — récap (réutilise `parcours-bien-model` pour l'état) + boutons `✍ Créer le bail` (→ `openBail(ref)`) / `Terminer`.
5. **Carte de continuité** — après une création faite hors fil rouge (bouton normal), proposition non-bloquante « ✓ créé — continuer ? » [Continuer]/[Plus tard] (voir §6).
6. **Points d'entrée** « + Ajouter un bien » posés sur les surfaces (Accueil, Biens, fiches bailleur/immeuble/logement) — voir §7.

## 5. Attache du fil d'Ariane aux modales existantes (LE point d'implémentation)

Les modales `#ov-ent`/`#ov-imm`/`#ov-log` sont des overlays `.ov` **séparés**. Le fil d'Ariane doit rester visible à travers la séquence sans dupliquer de markup.

**Décision** : un **seul** nœud DOM `#fr-bread` (la barre), **déplacé/affiché en tête de la modale active** quand `_frMode` est vrai, masqué sinon. À l'ouverture de chaque modale existante par le conducteur, `_frAttachBread(modalId)` insère `#fr-bread` juste sous l'en-tête de cette modale et appelle `_frRenderBread()`. Aucune retouche du corps des modales ; on n'ajoute qu'un conteneur d'ancrage. (Alternative écartée : dupliquer la barre dans chaque modale = recopie, rejetée par DRY.)

> À valider au build : soit ancrage par insertion (`insertBefore` dans `.m-body` de la modale), soit barre flottante fixe au-dessus de la modale. Trancher en test navigateur réel sur les 3 modales.

## 6. Déclencheur (deux voies, jamais une porte cachée)

- **Voie A — depuis le fil rouge** (`+ Ajouter un bien`) : `_frMode=true`, on ouvre `openNewEnt()` ; les hooks post-save poussent automatiquement à l'étape suivante.
- **Voie B — depuis une action normale** (créer un bailleur/immeuble depuis son bouton habituel, ou `openActeImport` depuis Logement) : `_frMode` **reste faux**. En fin de save, si le résultat n'est pas « prêt à louer », `_frOfferContinue(kind,obj)` affiche la **carte de continuité**. « Continuer » passe `_frMode=true`, pose `_frCtx` sur l'objet créé, et ouvre la **modale existante suivante** (auto-poussée ensuite). Ainsi le fil démarre **depuis les actions**, sans dépendre d'un mode pré-armé (corrige le bug #3).

## 7. « + Ajouter un bien » PARTOUT + pré-remplissage

- **Accueil** : CTA « + Ajouter un bien » + « 📜 Importer un acte » (réutilise `openActeImport`).
- **Onglet Biens** : bouton existant `#biens-add-btn` (`openBiensAdd`, ligne 31197) rebranché sur le fil v2 ; « Importer un acte » déjà présent.
- **Fiche bailleur / immeuble / logement** : bouton « + Ajouter un bien » → démarre le fil **toujours neutre** (décision user 2026-07-13 : pas de pré-remplissage contextuel depuis le bouton ; l'étape bailleur repart de zéro). Les boutons contextuels existants (`+ Immeuble` sur fiche bailleur, etc.) restent et déclenchent, eux, la **continuité** (voie B).
- Import acte reste un **point de départ** : pré-remplit bailleur+immeuble+lot (`_acteApply`) puis, via la continuité, amène au logement à confirmer.

## 8. Complétude & « rien d'obligatoire »

- Minimum louable d'un logement = identité (réf/type/surface/loyer) — c'est déjà la garde de `saveParamLog`. Les diagnostics (dpe…) restent optionnels ; un logement identité-OK mais diagnostics-manquants = « à compléter » (non bloquant).
- **Aucun gate dur** n'empêche de sortir. Le fil d'Ariane et le récap **signalent** l'état (« à compléter »), mais « Plus tard — c'est gardé » est toujours disponible. Le bail est optionnel.
- Aucune auto-injection de dataset démo ([[feedback_no_demo_autoinject]]).

## 9. Tests & garde-fous (les règles violées la dernière fois)

- **TEST AU VRAI CLIC** obligatoire : piloter l'UI par de vrais clics reproduisant le parcours user (import acte depuis Logement, +Bien depuis chaque surface, chaîne bailleur→immeuble→logement→bail, sortie « Plus tard » à chaque étape). **Ne pas** « vérifier » par injection de données / appel direct de fonctions.
- **Vérifier l'empilement en réel** : à chaque passage de modale, confirmer qu'il n'y a **qu'un** overlay `.ov` visible (pas de superposition).
- **DRY** : grep de non-recopie (aucun nouveau champ de formulaire bailleur/immeuble/logement dans le diff).
- **Module dérivé** : `index-test.html` (sandbox) mis à jour en miroir ([[feedback_sandbox_first]]) ; `parcours-bien-model` re-généré via `node tools/sync-helpers-global-mirrors.mjs`.
- **Gates** : `node scripts/check-inline-js.mjs` (0 erreur) + `npx vitest run` (suite verte, dont les tests `parcours-bien-model`) + `node --check sw.js`.
- **Audit `superpowers:code-reviewer`** AVANT « prêt à tester » ([[feedback_audits_par_agents]]).
- **Bump version** (title + `<em>` footer + `IMMOTRACK_VERSION` + ligne Récap DDT + `CACHE_VER` sw.js) au n° libre au-dessus de l'`origin/main` courant ([[feedback_versioning]]).
- **Coordination `index.html`** via `.index-queue/QUEUE.md` ([[feedback_index_commit_coordination]]).

## 10. Hors périmètre

- Refonte du wizard bail (on ne fait que le relais `openBail`).
- Pré-remplissage contextuel depuis le bouton « + Ajouter un bien » (décidé neutre).
- Édition avancée dans le récap (au-delà des rattachements existants).
