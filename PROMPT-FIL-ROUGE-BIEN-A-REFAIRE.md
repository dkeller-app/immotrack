# PROMPT — Fil rouge « Ajouter un bien » : REPRENDRE (le déployé ≠ le validé)

## VERDICT HONNÊTE (pourquoi cette session repart)

Une v2 du fil rouge a été **déployée en prod** (`origin/main` `f294971`, **v15.481**), mais elle **ne correspond PAS au mockup validé** par le user. L'implémentation s'est contentée d'**enchaîner les modales existantes brutes + un petit toast de continuité en bas de page** — alors que le mockup validé montrait un **vrai parcours guidé lisible** avec **identité obligatoire**, **complétude visible**, et un **récap intelligent**. Les vérifications « au vrai clic » ont été faites en pilotant des fonctions/état isolés (`javascript_tool`), **pas** en reproduisant le parcours réel d'un user avec ses **vraies données** (26 biens réels) — c'est pourquoi les défauts ci-dessous sont passés.

**Règle-mère violée : le mockup validé était le contrat. L'implémentation ne l'a pas honoré.**

---

## LES VRAIS POINTS À CORRIGER (constatés par le user, écran à l'appui)

### P0 — L'import d'acte de vente est CASSÉ / inaccessible (régression prod v15.481)
En intégrant l'acte dans « + Ajouter un bien » (écran de choix acte/manuel) et en **supprimant le bouton « 📜 Importer un acte »** de la barre Biens, l'accès à l'import d'acte est cassé pour le user (« je ne peux plus importer l'acte de vente »). **C'est live en prod.**
→ **Première action à évaluer : REVERTER `f294971` (v15.481)** pour rétablir le bouton acte, puis reprendre proprement. (Le commit précédent `a212c77` = v15.480 avait encore le bouton acte séparé fonctionnel.)

### P1 — « Ce n'est pas un vrai fil rouge » : la continuité est un petit pop-up en bas, peu visible
Après « Immeuble ajouté », l'app affiche un **petit toast discret en bas** « Continuer vers le logement ? [Plus tard] [Continuer →] ». Le user : *« on a un petit pop up en bas pas visible ! ce n'est pas ce qu'on a validé ! »*. Le mockup validé montrait un **parcours guidé prééminent** (fil d'Ariane lisible bailleur → immeuble → logement → bail, un écran à la fois), **pas** un toast qu'on rate.
→ Rétablir l'expérience **validée** : le parcours doit **guider visiblement**, pas proposer discrètement.

### P2 — On peut enregistrer un bien/bailleur avec juste le nom, sans alerte
Le user peut cliquer « Enregistrer » avec **seulement le nom** rempli, **sans aucune alerte** (screenshot « Nouvelle entité » avec juste « SCI DD FREYMING »). Le mockup validé imposait **Identité OBLIGATOIRE** pour un logement (réf, type, surface, loyer) avec **bandeau d'alerte bloquant** si incomplet. Cette garde (décision user 2026-07-11 : `saveParamLog` bloque dans le parcours) **n'a pas été portée** dans la v2.
→ Rétablir la **validation obligatoire** (au minimum pour le logement : réf/type/surface/loyer), avec **alerte bloquante** ; clarifier ce qui est requis pour bailleur/immeuble.

### P3 — Le récap « bien prêt » propose « Bail » pour TOUS les biens, même déjà loués
Écran « Ton bien est en place » : chaque logement affiche un bouton **« 🔑 Bail »**, y compris ceux **déjà loués / avec un bail actif** (immeubles « 9/9 loués », « 6/6 loués »). Le user : *« pourquoi on me propose tous les biens pour les baux ? »*.
→ Ne proposer « Créer le bail » **que pour les logements SANS bail actif** (vacants). Réutiliser la vraie logique d'occupation de l'app (`_bienActiveBail(ref)` existe déjà).

### P4 — Fidélité globale : reconcilier implémentation ⇄ mockup validé
Le récap montre **tout le patrimoine existant** (26 biens) alors que le parcours devrait être centré sur **le bien qu'on est en train de créer**. Reprendre le mockup validé comme référence et vérifier écran par écran que le déployé le respecte (ou re-valider avec le user si on s'en écarte volontairement).

---

## LES RÈGLES DICTÉES (à NE PAS re-violer)

1. **MOCKUP-FIRST** : tout changement UI/UX → mockups (variantes × PC/tablette/mobile × chaque écran post-clic), **validés explicitement** AVANT de coder, testés dans un **vrai navigateur** (pas la preview). Le mockup validé est **le contrat**. Réf : `mockups/fil-rouge-creation-bien-v2/index.html` (celui qui a été validé).
2. **TEST AU VRAI CLIC avec les VRAIES DONNÉES** : reproduire le parcours réel d'un user (cliquer les vrais boutons, sur les 26 biens réels), **PAS** en injectant des données ou en appelant les fonctions. C'est précisément ce raccourci qui a laissé passer P1–P4.
3. **DRY** : réutiliser les modales/saves existants — MAIS vérifier qu'ils délivrent l'UX validée (ex. identité obligatoire). Réutiliser ≠ hériter d'un comportement non conforme sans le vérifier.
4. **« Choix prédéfini + ajout libre »** partout ; **jamais** d'auto-injection du dataset démo.
5. **Stoppable partout, jamais obligé de tout compléter** (OK, à conserver).
6. **AUDIT code-reviewer** avant « prêt à tester » — mais l'audit doit aussi vérifier la **fidélité au mockup validé**, pas seulement la mécanique du code (les audits ont validé le code, pas la conformité UX).
7. **Bump version** (title + `<em>` footer + `IMMOTRACK_VERSION` + ligne Récap DDT + `CACHE_VER` sw.js) à chaque livraison ; prendre le n° libre au-dessus d'`origin/main`.
8. **Worktree neuf depuis `origin/main` à jour** (le clone `Desktop\Immo` est stale). Coordination `.index-queue` si présente.

---

## CE QUI EXISTE DÉJÀ (réutiliser, ne pas repartir de zéro)

- **Mockup validé** : `mockups/fil-rouge-creation-bien-v2/index.html` (parcours guidé lisible, identité obligatoire, complétude, récap). **C'est la cible.**
- **Spec** : `docs/superpowers/specs/2026-07-14-fil-rouge-creation-bien-v2-design.md`. **Plan** : `docs/superpowers/plans/2026-07-14-fil-rouge-creation-bien-v2.md`.
- **Modules purs** : `__tests__/helpers/parcours-bien-model.js` (complétude/arbre, `logementCompleteness`) + `fil-rouge-conductor.js` (machine à états + fil d'Ariane). Mirrors `window.*` via `tools/sync-helpers-global-mirrors.mjs` (⚠ ce générateur a un **bug CRLF** : régénère avec des espaces sur les lignes vides sur poste Windows — normaliser `\r`+lignes-blanches après).
- **Câblage actuel dans `index.html`** : fonctions préfixées `_fr*` (`_frStart`, `_frStartCtx`, `_frStartFromLog`, `_frOpenStep`, `_frShowFr`, `_frAfterSave`, `_frAfterActe`, `_frOfferContinue` = le toast de continuité à revoir, `_frRecapHtml` = le récap qui propose Bail pour tous). Overlay du fil = `#ov-fr`. Wrapper de `window.closeM` pour relâcher `_frMode` (couvre `ov-ent/imm/log/acte`).
- **Vraies fonctions à (ré)utiliser** : `openNewEnt`/`saveEnt`, `addImmForm`/`editImm`/`saveImm`, `openNewLog`/`saveParamLog` (⚠ réintroduire la garde identité obligatoire), `openActeImport`/`_acteApply`, `openBail(ref)`, `_bienActiveBail(ref)` (occupation), `delImm`/`delLog` (tombstone). Fiches = **pages** (`ent-fiche`/`imm-fiche`/`log-fiche`), donc lancer le fil dessus = 1 overlay OK.

## GATES
`node scripts/check-inline-js.mjs` (0 erreur) · `npx vitest run` (suite verte) · `node --check sw.js`.

## DÉMARRAGE ATTENDU
1. Proposer au user de **reverter v15.481** (`f294971`) pour rétablir l'import d'acte cassé en prod, avant tout.
2. Reprendre le **mockup validé** comme référence, lister écran par écran les écarts du déployé (P1–P4), et **re-valider avec le user** le plan de correction AVANT de coder.
3. Corriger en **testant au VRAI CLIC sur les vraies données**, audit de **fidélité** inclus.
