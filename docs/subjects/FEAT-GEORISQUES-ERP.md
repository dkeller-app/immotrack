# FEAT-GEORISQUES-ERP — Détection automatique ERP / IAL depuis l'adresse (Géorisques + BAN)

**Status** : 🔄 CODÉ SANDBOX + 🛡 AUDITÉ ×2 (SHIP), EN ATTENTE TEST VISUEL · **Prio** : P2 · **Taille** : M
**Détecté / décidé** : 2026-06-02 · **Sujet créé** : 2026-06-02
**Lié à** : MODALE-LOGEMENT-CONSOLIDATION B2 (onglet Diagnostics unifié — c'est là que vit l'UI) · BAILLEUR-DIAGNOSTICS-DDT (annexe État des Risques au bail).

## Objectif

Dans l'onglet **Diagnostics** de la modale Logement, déterminer **automatiquement depuis l'adresse du bien** si un **ERP / IAL** (État des Risques et Pollutions / Information Acquéreurs Locataires) est **légalement obligatoire** (à annexer au bail), afficher **quels risques** s'appliquent, et afficher la mention **« vérifiez les informations sur georisques.gouv.fr »**.

## Décisions verrouillées (session précédente, via AskUserQuestion)

- **Ambition** : « Tout intégré dans l'app » (pas de simple deep-link).
- **Scope** : « ERP fiable + détail affiché » — la case « Zone à risques (ERP) » est déterminée automatiquement depuis risques + sismicité + radon ; **termites / mérule / PEB restent manuels**.
- **Déclencheur** : « Auto à l'ouverture » de l'onglet Diagnostics, avec **cache par adresse** (180 j), et **jamais d'écrasement d'un choix manuel**.

## Sources de données (gratuites, sans clé, CORS *, appelables côté navigateur — AUCUN backend)

- **BAN** `https://api-adresse.data.gouv.fr/search/?q=<adresse>&limit=1` → code INSEE + lon/lat.
- **Géorisques** `https://www.georisques.gouv.fr/api/v1` :
  - `zonage_sismique?code_insee=…` (snake) → `data[0].code_zone` (1..5).
  - `radon?code_insee=…` (snake) → `data[0].classe_potentiel` (1..3).
  - `gaspar/pprn|pprt|pprm?codeInsee=…` (**camelCase obligatoire**) → `{totalElements, content:[{libPpr}]}`.

### ⚠️ GOTCHAS API (vérifiés live 2026-06-02)

1. **camelCase vs snake_case** : les endpoints `gaspar/ppr*` attendent `codeInsee` (camelCase). Passer `code_insee` (snake) est **silencieusement ignoré** → l'API renvoie le **dataset NATIONAL entier** (~6579 éléments, HTTP 200) → faux positif massif. Tous les autres endpoints utilisent `code_insee` (snake).
2. **Arrondissements PLM** : Paris/Lyon/Marseille → les citycodes BAN sont des codes d'arrondissement (751xx, 6938x, 132xx). `gaspar/ppr*` ne connaît QUE la commune mère (Paris→75056, Lyon→69123, Marseille→13055) ; sismique/radon acceptent l'arrondissement (avec fallback commune mère si vide).

## Règle légale (Code env. art. L.125-5 / R.125-23..27 ; décret 2022-1289)

ERP obligatoire **si** : PPR (naturel **OU** technologique **OU** minier, `count>0`) **OU** sismicité **zone ≥ 2** **OU** radon **catégorie 3**.

### Tri-état strict (mémoire « si tu ne sais pas, dis-le »)

- `required: true` dès qu'un signal déclenche (un trigger positif l'emporte TOUJOURS).
- `required: false` **UNIQUEMENT** si les **CINQ** signaux légaux (sismique + radon + PPRN + PPRT + PPRM) sont **définitivement connus** et qu'aucun ne déclenche. *(Une réponse API « 0 PPR » = `{count:0}` est un signal CONNU ; seul un échec réseau laisse le signal à `null`.)*
- `required: 'indetermine'` dès qu'un signal requis manque → **l'UI n'affirme RIEN** (mention georisques.gouv.fr).

> **Note audit** : la version initiale ne récupérait que `pprn` → un faux « non requis » possible pour une commune Seveso (PPRT seul) ou bassin minier (PPRM seul). Corrigé : les 5 signaux sont récupérés et requis pour un verdict `false`.

## Implémentation (v15.252)

### Logique PURE testée
- `__tests__/helpers/georisques-erp-detector.js` — `GEORISQUES_API`, `BAN_API`, `ERP_INDETERMINE`, `parentInsee`, `banUrl`/`seismicUrl`/`radonUrl`/`pprnUrl`/`pprtUrl`/`pprmUrl`/`georisquesReportUrl`, `parseBan`/`parseSeismic`/`parseRadon`/`parsePpr`, `decideErp`.
- `__tests__/helpers/georisques-erp-detector.test.js` — **44 tests** (gotcha camelCase verrouillé, tri-état complet 5 signaux, dégradation gracieuse). Fixtures = valeurs live réelles.
- Mirror navigateur auto-généré `js/helpers/georisques-erp-detector.global.js` (`window.GeorisquesErpDetector`) via `tools/sync-helpers-global-mirrors.mjs` (4ᵉ entrée PAIRS).

### Orchestration réseau inline (index-test.html)
- `_erpFetchJson(url, attempts)` — fetch + retry 3× (backoff 400·(i+1) ms ; l'API coupe parfois le TLS).
- `_erpDetectFromAddress(address)` — BAN → `parentInsee` → `Promise.all` des 5 signaux (chaque échec individuel `→ null`, ne throw jamais) → fallback sismicité arrondissement→commune mère → `decideErp`. Retourne `{required, reasons, commune, codeInsee, postcode, seismicZone, radonCategory, pprNames, georisquesUrl, addrKey, detectedAt}`.

### UI onglet Diagnostics (index-test.html, `_logDiagRenderTab`)
- Bloc « 🗺️ État des Risques (ERP / IAL) » : bouton **« 🔎 Détecter via l'adresse »** (`#logdiag-erp-btn`) + panneau détail (`_logDiagErpDetailHtml`) : badge tri-état coloré (🛑 obligatoire / ✅ non obligatoire / ❓ indéterminé) + commune/INSEE + sismicité/radon + liste des motifs + lien **« Vérifiez sur georisques.gouv.fr »**.
- `_logDiagMaybeAutoDetectErp()` — auto-détection silencieuse à l'ouverture, gardée par cache (`addrKey` + TTL 180 j) et flag `_erpAutoTried` (anti-boucle de re-render, posé AVANT l'async).
- `_logDiagRunErpDetection(manual)` — déclenchement manuel (toasts + spinner) ou auto.
- `_logDiagApplyErpResult(res)` — **non-clobber** : n'écrit `ctx.zoneRisques` que si l'utilisateur n'a pas touché la case (`_manualZoneRisques`) ; `indetermine` ne touche jamais la case.

### Persistance
- `ctx._manualZoneRisques` (brouillon) ↔ `log.zoneRisquesManual` (canonique) — posé par `_logDiagSetCtx('zoneRisques')`, persisté/réhydraté.
- `_logDiagDraft.erpAuto` ↔ `log.diagnostics.erpAuto` (cache de la dernière détection).
- **Immutabilité bail signé** : ces écritures ne touchent QUE le log vivant / le brouillon — jamais le `bailSnapshot` figé (confirmé par audit, traçage `_captureBailSnapshot` deep-clone whitelist sans `zoneRisques`/`erpAuto`).

## Vérifications

- `node scripts/check-inline-js.mjs index-test.html` → **4 blocs / 0 erreur**.
- `node tools/sync-helpers-global-mirrors.mjs` → tous mirrors synchronisés (13 déclarations function).
- `npx vitest run` → **1385/1385** (43 fichiers ; +44 ERP).
- **🛡 Audit `superpowers:code-reviewer` ×2 → SHIP** : (1) audit initial 0 BLOCKER (légal tri-état, gotcha camelCase, XSS escapé, non-clobber, anti-boucle, immutabilité bail signé confirmée) + 3 NITs ; (2) re-audit du fix pprt/pprm (5 signaux) → SHIP, régression-free, sens conservateur confirmé.

## Reste à faire

- **TEST VISUEL** (sandbox `index-test.html`, navigateur réel) : ouvrir un logement avec adresse renseignée → onglet Diagnostics → vérifier auto-détection + panneau + non-clobber après toggle manuel.
- **Sync PROD** (`index.html` + `sw.js` CACHE_VER) APRÈS « OK » explicite user — différée avec le reste de Phase B.

## Idées V2 (hors scope)

- Récupérer aussi SIS (pollution des sols), recul du trait de côte, retrait-gonflement argiles (RGA) pour un détail plus complet du Cerfa ERP.
- Bouton « Annexer l'ERP au bail » qui génère un récap PDF horodaté lié au rapport Géorisques.
