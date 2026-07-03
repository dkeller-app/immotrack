# Passation ouvrière → session maître — Lot CANDIDATURE relance/inbox + refonte fiche

> **De** : session ouvrière (dev sandbox candidature).
> **Pour** : session maître (unique intégrateur `index.html` → `main`).
> **Protocole** : `docs/INDEX-COMMIT-PROTOCOL.md` · File : `C:\Users\Did_K\Desktop\Immo\.index-queue\QUEUE.md`
> **Date** : 2026-06-08

---

## TL;DR

5 livrables « candidature en ligne », **développés + validés visuellement + audités `code-reviewer` (APPROUVÉ pour prod, 0 bloquant)** dans le **sandbox `index-candidature-test.html`**. **Rien n'est encore dans `index.html` (prod)** → c'est un **portage depuis sandbox** (comme bail-sign-c3 / REPORTING-BAILLEUR), pas un cherry-pick index.html.

**Le relais (409→200) est DÉJÀ en prod** (déployé Cloudflare + branche `relay-bail-sign` poussée) — rien à faire côté relais.

---

## Sources de vérité (à lire avant de porter)

- **Sandbox (code à porter)** : `index-candidature-test.html` (sur disque, arbre partagé).
- **Plans (code verbatim + ancres)** :
  - `docs/superpowers/plans/2026-06-05-candidature-relance-inbox.md` (T13b / T13c / T13d)
  - `docs/superpowers/plans/2026-06-08-fiche-candidat-large.md` (refonte fiche)
- **Specs** : `docs/superpowers/specs/2026-06-05-candidature-relance-inbox-design.md` · `…2026-06-08-fiche-candidat-large-design.md`
- **Audit sandbox (Task 15)** : `superpowers:code-reviewer` → **APPROUVÉ POUR PROD**, 0 bloquant. Seul point reporté ici = I1 (helpers `main.js`, ci-dessous).

---

## Les 5 livrables à porter dans `index.html`

> Tout existe déjà dans `index.html` pour la **base** candidature (Phase 8). Ce lot **ajoute/modifie** par-dessus. Les fonctions/CSS ci-dessous sont à recopier **à l'identique du sandbox** (déjà audité). Repérer les zones par les noms de symboles (les n° de ligne du sandbox ne correspondent pas à index.html).

1. **T13b — popup complément** : remplacer l'ancienne `demanderComplementCandidat` (basée `prompt()`) par la version popup + ajouter `_complCandCtxHtml`, `_complRenderStep1`, `_complSaveManual`, `_complReopen`, `_complRenderStep2`. CSS : ajouter `#ov-invite-candidat{z-index:300}` (sinon la popup s'ouvre DERRIÈRE la fiche). Réutilise la modale `ov-invite-candidat` + `_invState` + `_invShare*` (déjà en prod).
2. **T13c — auto-pull** : bloc scheduler après `_relayPullCandidatures` (`_autoPullInFlight`, `_autoPullLastTs`, `_autoPullTimer`, `_AUTO_PULL_INTERVAL`, `_autoPullCandidatures`, `_startAutoPullTimer`, IIFE `_initAutoPull` = visibilitychange + setInterval 3 min) ; câbler `_autoPullCandidatures('open')` dans l'entrée `candidats:` de `go()`.
3. **T13d — notification** : surfaces `_renderCandInboxBanner` / `_renderInboxSurfaces` / `_candMarkAllSeen` ; `<div id="cand-inbox-banner"></div>` entre `#v4h-hero` et `.v4h-row1` ; entrée Candidats + badge dans le More-sheet (`more-candidats-badge`) ; bloc CSS notif (`.cand-inbox`, `.ni-pastille`, `.v4-bn-badge`, `.more-badge`, `.cand-new-pill`, `tr.cand-row-new`, responsive 560px) ; **badge sidebar V4** (`v4s-cand-badge` calculé dans `_renderSidebarV4` + `.v4s-bd-new` rouge + maj dans `_renderInboxSurfaces`) ; flag `vu` : posé `false` dans la branche `isNew` de `_relayPullCandidatures`, mis `true` dans `openFicheCandidat` (après la garde) + dismiss ; extension du **retour** de `_relayPullCandidatures` (`created`/`updated`/`newNames` + toast `nouveauDossierToast` si `created>0`, même en auto-pull silencieux) ; pill « ● Nouveau » + classe `cand-row-new` dans `rCandidats` ; appels `_renderInboxSurfaces()` en fin de `go()` + dans `rAccueil`.
4. **Refonte fiche large** : CSS `#ov-fiche-candidat` (`.modal` → `width:92vw;max-width:1280px` ; `.fc-layout`/`.fc-main`/`.fc-side` sticky/`.fc-sub-stack` ; media 1000px → 1 col + sticky off, 560px → modale 96vw + `.fc-actions .btn` pleine largeur) + **ré-emballage** du template `openFicheCandidat` en 2 colonnes (gauche = pipeline, Identité|[Situation+Garant], Pièces ; droite collée = Score + Conversion). **Contenu interne des cartes inchangé** (pur ré-emballage).
5. **Fix 409→200 (client)** : `js/core/relay-client.js` `relayFetchResult` resynthétise `{_status:409}` quand `body.status!=='submitted'` (200) OU HTTP 409 (legacy). **Module partagé, hors index.html** (cf. git ci-dessous).

---

## I1 — `js/main.js` (OBLIGATOIRE, sinon prod cassée)

`js/main.js` doit **importer + exposer sur window** les 4 nouveaux helpers de `js/core/candidature.js` :
`buildComplementShareMessage`, `shouldAutoPull`, `countUnreadCandidats`, `nouveauDossierToast`
(ajouter à l'`import { … } from './core/candidature.js'` + 4 lignes `window.X = X;`, à côté des 6 helpers candidature déjà exposés). Sans ça : `shouldAutoPull is not defined` en prod (le sandbox a des mirrors inline, pas la prod).

---

## Git — où vit quoi (état au 2026-06-08)

| Élément | État | Action maître |
|---|---|---|
| `index-candidature-test.html` (sandbox) | committé local sur `main` (non poussé), source de vérité | **lire sur disque** pour porter |
| `js/core/candidature.js` (4 helpers) + `js/core/relay-client.js` (409) + tests | committés **local** sur `main` (commits `56987d2`, `ab74159`, `ee20fdb`, `1323a00`), **non poussés** | **amener sur `origin/main`** (modules `js/core` + tests = hors domaine index.html, pas de conflit) — cherry-pick les hunks `js/core/*` + `__tests__/*`, OU re-dériver depuis sandbox |
| `js/main.js` (I1) | **PAS encore fait** | à modifier (import + window) |
| `index.html` (prod) | **PAS encore touché** | **porter** (worktree dédié) puis intégrer via la file |
| Relais (`relay-bail-sign`) | **déployé + poussé** (`e7555ef`, Worker live) | rien |
| `docs/legal/RGPD-REGISTRE.md` v1.1 | committé local (`91624a6`) | amener sur origin/main (doc, hors index.html) |

⚠️ `main` local est **divergent** (commits multi-sessions + `origin/main` en avance) — à régulariser avant/pendant l'intégration.

---

## Procédure recommandée (maître)

1. **Rebaser** sur le `origin/main` du moment (la file indique la dernière version PROD ; au 2026-06-08 ≈ v15.263 bail-sign + REPORTING-BAILLEUR en cours → **prendre v15.265+** après les intégrations en attente).
2. **Worktree dédié** off `origin/main` (`git worktree add ../Immo-candidature -b candidature-prod origin/main`) — **jamais l'arbre partagé** (cf. incident v15.261).
3. **Porter** les 5 livrables (ci-dessus) dans `index.html` + **I1** dans `js/main.js`, en recopiant du sandbox (audité). Amener aussi les modules `js/core/candidature.js` + `relay-client.js` sur la base.
4. **Bump version aux 5 spots** : `<title>`, `<em>` footer, footer texte, const `IMMOTRACK_VERSION`, `sw.js` CACHE_VER.
5. **🔍 AUDIT AGENT du diff PROD** (`superpowers:code-reviewer`) — **obligatoire** (transcription + I1 + non-régression). Corriger les findings.
6. **Gates** : `node scripts/check-inline-js.mjs` (4/0) · `node --check sw.js` · `npx vitest run` vert · 5 spots version cohérents + 0 résidu ancienne version · parité sandbox↔prod sur les blocs portés · smoke test localhost (fiche large + popup complément + auto-pull + notif, 0 erreur console).
7. **Push la branche** + inscrire **✅ prêt à intégrer** dans `.index-queue\QUEUE.md` (ligne `claude/candidature-prod` existe déjà en `🔨 en cours` v15.249 — la mettre à jour : nouvelle version, base, dernier commit).
8. **Intégrer** sur `main` (worktree jetable, cherry-pick/merge, FF) **après feu vert user**, mettre à jour BACKLOG + journal de la file.

---

## Points de vigilance (déjà vérifiés par l'audit sandbox — re-vérifier sur le diff prod)

- **`ownerToken`/`APP_KEY` jamais en URL/log/partage candidat** ; le lien repartagé = URL publique `_buildCandidatUrl` (`/d/<linkId>`).
- **Score jamais calculé/transmis côté relais** (recalcul local `_calculConfiance`).
- **Rétrocompat 409→200** : sentinel `{_status:409}` préservé → pull (`res._status===409 → skip`) inchangé, **0 régression**.
- **Refonte fiche = ré-emballage** : tous les handlers/IDs préservés (`toggleCandidatPiecesVerifiees`, `setCandidatStatut`, `refuserCandidat`, `demanderComplementCandidat`, `convertCandidatToBail`, `_editCandidatFromFiche`, GED).
- **RGPD** : registre v1.1 à jour (canal en ligne + auto-pull + TTL relais). RIB exclu au stade candidature.
