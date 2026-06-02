# FEAT-GEORISQUES-ERP — Détection automatique ERP / IAL depuis l'adresse (Géorisques + BAN)

**Status** : ✅ Phase 1 (détection adresse) CODÉE + 🛡 AUDITÉE ×2 + TEST VISUEL OK (2026-06-02) · 🆕 Phase 2 (câblage doc ERRIAL ↔ ligne ERP + suivi validité 6 mois) À FAIRE · Sync PROD différée (dépend B2) · **Prio** : P2 · **Taille** : M (Phase 1) + M (Phase 2)
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

### Correctif v15.253 — lien officiel = ERRIAL (pas le deep-link Géorisques)

Le lien « Vérifiez sur georisques.gouv.fr » pointait vers
`…/connaitre-les-risques-pres-de-chez-moi/rapport2?codeInsee=…` → **404 / page vide**
en navigation directe (Géorisques est une SPA Angular, les routes profondes ne sont pas
servies de façon fiable ; vérifié live 2026-06-02). `georisquesReportUrl()` renvoie
désormais la racine **ERRIAL** (`https://errial.georisques.gouv.fr/`), service officiel
de l'**État des Risques réglementé à annexer au bail**. ERRIAL n'accepte aucun paramètre
de pré-remplissage documenté → on ne deep-linke pas (pas de param inventé qui re-casserait) ;
l'utilisateur saisit l'adresse, déjà affichée dans le panneau ERP. Signature conservée pour
compat d'API (args ignorés). Tests mis à jour (toujours 44, le test d'URL assert ERRIAL + `not.toContain('rapport2')`).

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

- ✅ **TEST VISUEL FAIT (2026-06-02)** : sur Logt 1 (Morschwiller-le-Bas 68218), le panneau détecte « ERP/IAL obligatoire · sismicité zone 3 » **depuis l'adresse via l'API, avant tout upload de document** ; case « Zone à risques (ERP) » cochée auto. Cohérence confirmée par l'ERRIAL officiel (SISMICITÉ 3/5). Lien « Vérifiez sur georisques.gouv.fr » → corrigé en ERRIAL (v15.253).
- **Sync PROD** (`index.html` + `sw.js` CACHE_VER) APRÈS « OK » explicite user — différée avec le reste de Phase B (dépend de B2 : les `_logDiag*` n'existent pas encore en PROD).

## Phase 2 — câblage doc ERRIAL ↔ diagnostic ERP + suivi validité (À FAIRE, prio à fixer)

**Problème constaté au test visuel 2026-06-02** : **3 signaux ERP déconnectés** sur le même écran Diagnostics —
1. Panneau adresse v15.252 : « obligatoire · sismicité zone 3 » + case ☑ « Zone à risques » → ✅ marche (API).
2. Scan PDF (B2) : puce indicative « État des risques (ERP) » reconnue dans l'ERRIAL joint → ✅ s'affiche.
3. Ligne DDT « État des risques » : reste **« ❓ À renseigner »** (date vide, résultat « — »).

L'utilisateur a le document officiel ERRIAL natif (établi le 02/06/2026) mais **rien ne le relie** au diagnostic ERP ni n'en suit la validité. Cause : la couverture détectée est « indicative, jamais écrite dans les résultats » (par design conservateur, index-test.html ~35356).

**Scope à câbler :**
1. **Extraction de la date « Établi le … » de l'ERRIAL** → suggérer la « Date réalisée » de la ligne ERP en « ✨ à vérifier » (ajouter l'ancre `établi le` au moteur de suggestion de date, qui ne connaît aujourd'hui que repérage/réalisation/visite/exécution). Validité ERP = **6 mois** → expiration auto = établi + 6 mois.
2. **Lier le PDF ERRIAL au diagnostic ERP** comme justificatif ; proposer « Établi » sur la ligne quand un ERRIAL est joint (toujours en « à vérifier », jamais d'écriture auto silencieuse).
3. **Suivi validité + message de renouvellement** (le besoin neuf exprimé par l'user) : croiser `établi + 6 mois` avec aujourd'hui →
   - **doc joint mais périmé/proche** : message « Ton État des Risques date du JJ/MM/AAAA (> 6 mois) → re-télécharge un état des risques à jour sur ERRIAL » + lien `errial.georisques.gouv.fr`.
   - **pas de doc joint mais API dit obligatoire** : message « ERP obligatoire ici → télécharge ton État des Risques sur ERRIAL et joins-le au bail ».
   - réutiliser le **moteur d'expiration existant** (Agenda + actions prioritaires) ; l'ERP a une validité **courte (6 mois)** vs les autres diagnostics.
4. **Particularité légale à exploiter** : contrairement aux autres diagnostics (diagnostiqueur pro requis), l'ERP/ERRIAL se régénère **gratuitement par le bailleur lui-même** sur le site → le message pousse vers l'auto-téléchargement (pas vers un pro).

**Contraintes** : mockup-first (3 formats + tout post-clic) → validation user AVANT code · audit `superpowers:code-reviewer` (livrable lié au bail = sensible) · immutabilité bail signé · cohérent avec le non-clobber v15.252 (ne jamais écraser une saisie manuelle).

**À décider avant d'attaquer** : prio ? les 6 mois sont-ils en dur ou configurables ? le message va dans le panneau ERP, la ligne DDT, ou les deux ?

## Idées V2 (hors scope)

- Récupérer aussi SIS (pollution des sols), recul du trait de côte, retrait-gonflement argiles (RGA) pour un détail plus complet du Cerfa ERP. *(NB : l'ERRIAL officiel les liste déjà en annexe — argile, pollution sols/ICPE, CAT-NAT.)*
- Bouton « Annexer l'ERP au bail » qui génère un récap PDF horodaté lié au rapport Géorisques.
