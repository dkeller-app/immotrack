# PROD-MONITORING-CI — Activation monitoring prod + CI validation avant V1

**Status** : ⬜ À faire · **Prio** : P1 V1.1 · **Taille** : S (2-3h)
**Détecté** : 2026-05-13 (audit 360°)
**Lié à** : Sprint 4 marathon (stub `js/core/monitoring.js` livré v14.96) + `.github/workflows/test.yml` livré

## Justification (4 critères pré-vol)

1. **Cible** : tous (pré-V1 commerciale OBLIGATOIRE, sinon on ship aveugle).
2. **Règles respectées** : OK, complète Sprint 4 marathon.
3. **Source code existant** : `js/core/monitoring.js` (16 tests Vitest, capture errors + events, anonymisation FNV, opt-in, DSN Sentry/Plausible). **Stub non activé en prod.**
4. **Backlog** : noté implicitement dans EFFORT_DEPLOIEMENT.md mais pas tracké explicitement.

## Contexte

Sprint 4 marathon a livré :
- ✅ `js/core/monitoring.js` (stub avec capture errors + events anonymisés)
- ✅ `.github/workflows/test.yml` (CI Vitest + syntax check)

**MAIS** :
- ⬜ Stub jamais activé en prod (pas de DSN Sentry configuré)
- ⬜ CI jamais déclenchée (vérifier que le workflow tourne sur push)
- ⬜ Pas de dashboard monitoring (Sentry / Plausible) actif

Avant de ship V1 commercialement, **obligatoire** pour détecter les bugs réels en production.

## Scope

### Phase 1 — Setup Sentry (~1h)
- Créer compte Sentry (free tier 5k errors/mois suffit MVP)
- Configurer DSN dans `js/core/monitoring.js` (variable env ou `DB.params.monitoringDsn`)
- Activer capture exceptions JS + promesses non gérées
- Anonymisation : aucune donnée bailleur (nom, IBAN, email) ne doit fuiter (cf opt-in déjà géré)
- Test envoi d'une erreur volontaire → vérifier qu'elle apparaît dans Sentry

### Phase 2 — Setup Plausible (analytics privacy-friendly) (~30min)
- Créer compte Plausible (9€/mois plan Personal 10k pageviews)
- Ajouter snippet dans index.html (data-domain="immotrack.app")
- Tracker uniquement : pageviews + événements anonymes (création bail, génération quittance, etc.)
- **Pas de cookies, pas de fingerprinting** (différent de Google Analytics) → conforme RGPD sans consent banner
- Documentation utilisateur : page « Vie privée » mentionne Plausible

### Phase 3 — Valider CI GitHub Actions (~30min)
- Vérifier que `.github/workflows/test.yml` se déclenche bien sur push
- Si KO : fixer le workflow (token, badge, etc.)
- Ajouter badge dans README

### Phase 4 — Documentation `.env.example` (~30min)
- Créer `.env.example` à la racine :
  ```
  SENTRY_DSN=https://...@sentry.io/...
  PLAUSIBLE_DOMAIN=immotrack.app
  ```
- Documenter dans AGENTS.md la procédure d'activation prod

### Phase 5 — Activation prod (manuel par utilisateur, hors auto-pilote)
- Étape utilisateur après bascule sandbox → prod :
  - Renseigner les DSN dans la version prod
  - Tester monitoring sur une session prod
  - Vérifier que les erreurs remontent dans Sentry dashboard

## Décisions arbitrées
- [x] **Sentry free tier** suffit MVP (5k errors/mois pour <100 users)
- [x] **Plausible plutôt que GA** (privacy-friendly, pas de banner cookies)
- [x] **Anonymisation stricte** : 0 donnée bailleur, juste IDs hashés
- [x] **Opt-in** déjà géré dans `monitoring.js` (utilisateur peut désactiver dans Paramètres)

## Coût récurrent
- Sentry : 0€ (free tier) puis ~26$/mois (Team) si dépassement
- Plausible : ~9€/mois plan Personal
- **Total : ~10€/mois minimum** (vs ~50€/mois sans free tier)

## Notes utilisateur
> 💬 2026-05-13 : audit 360° identifie monitoring pas activé en prod

## Journal
- 2026-05-13 : créé (audit 360° → critique avant ship V1)
