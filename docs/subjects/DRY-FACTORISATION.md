# DRY-FACTORISATION — Blocs de code écrits plusieurs fois (audit complet 2026-07-06)

**Status** : 🔄 Chantier 1 ✅ livré v15.428 · chantiers 2-5 à faire · **Prio** : P1 (3 divergences = bugs latents) · **Taille** : L (5 chantiers découpables)
**Demandé par** : user 2026-07-06 (« audit si tu trouves des blocs de code écrits plusieurs fois et non pas un rappel de bloc »)
**Base auditée** : Immo-wt-quickwins v15.418+ (agent general-purpose, lignes vérifiées)

## ⚠️ 3 DIVERGENCES AVÉRÉES (bugs latents, à trancher en premier)

1. **MRH manquante — 6 sites, 1 divergent** : le widget legacy (l.13338) teste `DB.assurances…type==='MRH locataire'` alors que TOUS les autres (todo, alerts, gestionnaire, solo) testent `DB.mrh` → le widget peut dire « manquante » quand le todo dit OK.
2. **Régularisation à émettre — 2 écritures divergentes** : todo l.12214 (loyers perçus N-1 + régul absente année courante) vs widget l.13350 (absente N OU N-1, sans condition).
3. **IRL applicable — 3 écritures divergentes** : alerts intègre « lettre envoyée » et ne filtre pas `dejaApplique` ; le todo filtre ; le widget ignore la lettre.

## TOP 5 factorisations par ROI

1. **Catalogue de règles d'alertes** `_ALERT_RULES` (js/core, testé Vitest) consommé par `_computeUnifiedTodo` (265 l.), `rAlertsSection` (200 l.), widgets legacy — règles MRH/PNO/IRL/régul/baux/DG/impayés réécrites 2 à 6×. Résout les 3 divergences.
2. **`_buildDashCtx(yr, mo, activeEnt, {withPrev})`** : le bloc scopeLogs/matchMv/mvs/mvsYTD copié-collé rAccueil l.8384 ↔ rDash l.10508 (~28 lignes byte-identiques, le commentaire assume la copie) + 2 sites partiels (rAlertsSection, fiscal 2044 l.49069).
3. **`_BAIL_FIELD_MAP` = source unique du formulaire bail** avec flags {copy, highlight} → dériver fill (openBail l.18020, 170 lignes manuelles), copie (copyBailFrom l.17868), lecture (getBailDataFromForm l.19309), historique (openBailHist l.16021). Les 11 checkboxes mobilier énumérées 3× alors que `_MOB_IDS` (l.18646) existe. Chaque nouveau champ = 4 modifs synchrones aujourd'hui.
4. **`_dashKpis(ctx)`** : occupation (nbTotal/nbOcc/nbVacants/pctOcc) calculée 6×, totaux mouvements (6 reduces) 3× — synergie avec le point 2.
5. **`_bindPopoverDismiss(pop, onClose)`** : l'unification menus ⋮ (v15.407) tient ; restent 3 popovers non-menus avec chacun leur câblage clic-extérieur/Esc (filtres Biens, menu Compte, menu mobile). ROI modeste.

## Duplication ASSUMÉE (pattern shadow — PAS de la dette)

Helpers dupliqués index.html ↔ js/core/*.js couverts par tests Vitest miroir (bank-import, diagnostics, email-*, entity-cascade, equipements, gestion-dg-impayes, group-by-imm, irl-*, quittances-actives, utils…) — décision d'archi documentée. Déjà dé-dupliqués : charges.js/dpe.js/dashboard-temporel.js (re-exports) + 8 modules .global.js (source unique réelle).

## Ordre proposé

Chantier 1 (catalogue d'alertes) en premier : c'est lui qui porte les 3 bugs latents ET il prépare
l'extension de la surface « À traiter » au mode Premium (suite naturelle de DASH-ACTIONS-REFONTE).
Puis 2+4 ensemble (ctx + KPIs), puis 3 (bail), 5 en fil de l'eau.

## Journal

- 2026-07-06 : audit livré (agent, 2 passes — la 1re tuée par la limite de session). Rapport complet ci-dessus. Attente priorisation user.

- 2026-07-08 : ✅ **Chantier 1 LIVRÉ v15.428** origin/main (6c16216). Catalogue canonique `__tests__/helpers/alert-rules.js` (6 règles pures, 20 tests dont bornes/tombstones/jour-J) + wrapper généré `js/helpers/alert-rules.global.js` (window.AlertRules, paire ajoutée au sync tool). 3 consommateurs recâblés (_computeUnifiedTodo, rAlertsSection, widgets legacy irl/bail/mrh/regul) → les 3 DIVERGENCES AVÉRÉES sont mortes et verrouillées par tests nommés. + LIBELLÉS anti-jargon (demande user) : « MRH » → « Assurance habitation »/« Ass. hab. » sur ~26 sites UI (PDF bail et onglet Excel MRH_Locataires conservés exprès). Audit code-reviewer PASS (0 bloquant/0 important, 6 mineurs → 3 corrigés avant push : normalisation minuit, libellé RGPD, tests bornes ; consignés : PNO bannière scopée entité, widget régul référé à aujourdhui, sandbox hors périmètre). Restent : chantiers 2+4 (ctx+KPIs dashboard), 3 (formulaire bail), 5 (dismiss popovers).

- 2026-07-09 : ✅ **Chantiers 2+4 LIVRÉS v15.432** origin/main (0f33620). Module canonique `__tests__/helpers/dash-ctx.js` (buildDashCtx + makeMatchMv + occupationKpis + mvTotals, 13 tests) + wrapper `js/helpers/dash-ctx.global.js` (window.DashCtx). Chantier 2 : bloc ctx (scope+matchMv+mvs/mvsYTD/mvsPrev, 28 lignes byte-identiques) recâblé dans rDash + rAccueil → 0 `const matchMv` dupliqué. Chantier 4 : occupationKpis (6 sites) + mvTotals (4 sites) → 0 `nbVacants = Math.max` dupliqué. Audit code-reviewer PASS, RIEN à corriger (équivalence exacte confirmée, aucun orphelin, 6 points adversariaux vérifiés). Gates check-inline-js 5/0, Vitest 1826 verts, vérif navigateur 3 modes+Accueil (occupation 67%, 0 erreur console). **Restent : chantier 3 (formulaire bail, 5 listes de champs), chantier 5 (dismiss popovers).**

- 2026-07-09 : ✅ **Chantiers 2+4 LIVRÉS v15.438** origin/main (67c92b5). Module `__tests__/helpers/dash-ctx.js` (buildDashCtx/makeMatchMv/occupationKpis/mvTotals, 14 tests) + wrapper `js/helpers/dash-ctx.global.js` (window.DashCtx). Chantier 2 : le bloc scope+matchMv+mvs/mvsYTD/mvsPrev/refYrMo (copié-collé quasi byte-identique rDash↔rAccueil) → source unique ; withPrev pour rDash (deltas), pas pour rAccueil. Chantier 4 : KPIs occupation (6 renders) + totaux mvs (4 renders) factorisés. Audit code-reviewer PASS (0 bloquant/0 important, équivalence prouvée site par site ; 2 suggestions appliquées : dernier îlot _renderAccueil recâblé + test contrat de type occupied=tableau). Vérif navigateur : les 4 rendus (Premium/Solo/Gestionnaire/Accueil) OK sans erreur, chiffres corrects. **Restent chantiers 3 (formulaire bail — 5 listes de champs, RISQUÉ car touche le highlight signature légale → session dédiée stable) et 5 (dismiss popovers, petit).**
