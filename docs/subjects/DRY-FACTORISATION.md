# DRY-FACTORISATION — Blocs de code écrits plusieurs fois (audit complet 2026-07-06)

**Status** : ⬜ À faire (rapport livré, priorisation user attendue) · **Prio** : P1 (3 divergences = bugs latents) · **Taille** : L (5 chantiers découpables)
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
