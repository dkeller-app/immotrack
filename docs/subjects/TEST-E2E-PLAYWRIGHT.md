# TEST-E2E-PLAYWRIGHT — Infrastructure tests end-to-end + visual regression + a11y

**Status** : ⬜ À faire · **Prio** : P1 V1.1 · **Taille** : L (10-15h setup + maintenance ~30min/sprint)
**Détecté** : 2026-05-14 (question user "est-ce que tu sais tester toute l'application ?")
**Lié à** : Vitest unitaires livrés (446 tests) · MOBILE-AUDIT-ONGLETS · PROD-MONITORING-CI · CI GitHub Actions livré Sprint 4

## Justification (4 critères pré-vol)

1. **Cible** : tous les bailleurs finaux (V1 commerciale = qualité indispensable). Aussi développeur (régression évitée).
2. **Règles respectées** : OK, complète Vitest existant sans dupliquer.
3. **Justification multiple** :
   - 🧑 Cas user réel : « est-ce que tu sais tester toute l'application et le bon rendu et le bon fonctionnement et interface ? »
   - 💻 Code existant : 446 tests Vitest (unitaires) mais ZÉRO E2E, ZÉRO test rendu, ZÉRO a11y
   - 📋 Backlog : MOBILE-AUDIT-ONGLETS prévu Sprint 15 → mutualiser avec Playwright = ROI maximal
4. **5 vues 360°** : axe technique (tests) + axe commercial (qualité avant ship)

## Contexte

ImmoTrack a aujourd'hui :
- ✅ **446 tests Vitest unitaires** (helpers purs : dates, charges, dpe, montant, profile, audit-trail, sanitize, export-comptable, etc.)
- ❌ **0 test E2E** (parcours utilisateur complet)
- ❌ **0 test rendu visuel** (visual regression)
- ❌ **0 test accessibilité** (WCAG 2.1 AA)
- ❌ **0 test performance** (Lighthouse Web Vitals)
- ❌ **0 test cross-browser** (Chrome/Firefox/Safari/Edge)

Avant V1 commerciale (Q4 2026), **OBLIGATOIRE** d'avoir au moins les tests E2E sur les parcours critiques. Sinon ship aveugle = régressions en prod = perte clients.

## Scope — Setup en 6 modules

### Module 1 — Playwright base (~3-4h)
- `npm install -D @playwright/test`
- Config `playwright.config.js` :
  - Serveur local `npx serve` qui sert `index-test.html`
  - 3 navigateurs : Chromium, Firefox, WebKit (Safari)
  - Captures auto en cas d'échec
  - Reporter HTML
- Script `npm run test:e2e` dans package.json
- Premier test smoke : « l'app charge sans erreur console »

### Module 2 — 13 scénarios E2E critiques (~6-8h)
1. **Setup wizard 1ère ouverture** (USER-PROFILE-FILTERS) — choisir profil + sidebar filtrée
2. **Créer bailleur** (SCI Test) + immeuble + logement
3. **Wizard bail 4 étapes** + signature canvas + sauvegarde
4. **EDL entrée** avec photos compteurs
5. **Génération quittance mensuelle** + ouverture modal EMAIL-AUTO
6. **Révision IRL annuelle** + génération lettre + validation envoi
7. **Régularisation charges** (BUG-CHARGE-001 fix) avec décompte
8. **Sortie locataire** + EDL sortie + restitution DG (GESTION-DG si livré)
9. **Import CSV bancaire** (BANK-INTEGRATION V1) + matching auto
10. **Pilotage matriciel** + bulk update IRL avec exclusion DPE F/G
11. **Bloquage bail si DPE G** (LEGAL-DPE-INTERDICTION-LOCATION)
12. **Changement profil** → sidebar reconfigurée
13. **Mobile 320/390/428** sur dashboard + 3 onglets critiques

### Module 3 — Visual regression (~2h)
- Captures écran auto pour chaque scénario
- Diff vs baseline (Playwright `toHaveScreenshot`)
- Stockage screenshots dans `__tests__/e2e/__screenshots__/`
- 2 modes : light + dark
- CI : fail si diff > 0.1% pixels

### Module 4 — Accessibilité a11y (~1-2h)
- `npm install -D @axe-core/playwright`
- Check WCAG 2.1 AA sur chaque page principale
- Fail si erreur "critical" ou "serious" détectée
- Erreurs "minor" en warning (rapport mais pas fail)

### Module 5 — Performance Lighthouse (~1-2h)
- `npm install -D playwright-lighthouse`
- Audit Lighthouse sur dashboard + biens + bail :
  - Performance ≥ 90
  - Accessibility ≥ 95
  - Best Practices ≥ 90
  - SEO ≥ 85 (V2 si site vitrine)
- Web Vitals : LCP < 2.5s, FID < 100ms, CLS < 0.1

### Module 6 — CI GitHub Actions (~1h)
- Étendre `.github/workflows/test.yml` :
  - Job `e2e` : `npm run test:e2e` sur push/PR
  - Upload artifacts (screenshots échecs + rapport HTML)
  - Badge dans README
- Test sur 2 OS : Ubuntu + Windows (couverture Mac via WebKit Linux)

## Architecture fichiers

```
__tests__/
├── helpers/                  ← Vitest unitaires existants (446 tests)
│   ├── dates.test.js
│   ├── charges.test.js
│   ├── dpe.test.js
│   ├── profile.test.js
│   └── ...
└── e2e/                      ← NOUVEAU Playwright
    ├── fixtures/
    │   └── seed-db.json      ← DB de test reproductible
    ├── pages/                ← Page Object Models
    │   ├── DashboardPage.js
    │   ├── BienPage.js
    │   ├── BailPage.js
    │   ├── EDLPage.js
    │   └── ...
    ├── scenarios/
    │   ├── 01-setup-wizard.spec.js
    │   ├── 02-creer-bail.spec.js
    │   ├── 03-edl-entree.spec.js
    │   ├── 04-quittance-email.spec.js
    │   ├── 05-irl-revision.spec.js
    │   ├── 06-regularisation.spec.js
    │   ├── 07-sortie-dg.spec.js
    │   ├── 08-import-csv.spec.js
    │   ├── 09-pilotage-bulk-irl.spec.js
    │   ├── 10-dpe-bloque.spec.js
    │   ├── 11-profile-switch.spec.js
    │   ├── 12-mobile-responsive.spec.js
    │   └── 13-smoke-charge.spec.js
    └── __screenshots__/      ← Baselines visual regression
        ├── chromium/
        ├── firefox/
        └── webkit/

playwright.config.js          ← Config root
```

## Coûts

| Item | Coût |
|---|---|
| Playwright | 0€ (open-source) |
| @axe-core/playwright | 0€ |
| playwright-lighthouse | 0€ |
| GitHub Actions | 0€ (free tier 2000 min/mois public, 500 privé) |
| Stockage screenshots | 0€ (git LFS ou commit direct petits PNG) |
| **Total récurrent** | **0€/mois** |

**Option premium si volume** :
- **Percy** ou **Chromatic** (visual regression cloud) : ~30$/mois — utile si 50+ scénarios
- Pour V1, screenshots locaux Playwright suffisent

## Maintenance par sprint

- ~30 min : à chaque nouveau sprint, mettre à jour les baselines screenshots si UI change intentionnellement
- ~15 min : ajouter 1-2 scénarios E2E si nouvelle fonctionnalité critique

## Décisions à arbitrer

- [ ] **Quand l'attaquer** :
  - **Option A** : Sprint 15bis (juste avant MOBILE-AUDIT-ONGLETS, mutualisation captures)
  - **Option B** : Sprint 6.5 (entre Sprint 6 livré et Sprint 7) — protège tout le reste
  - **Option C** : Reporter V1.2 → tests manuels uniquement en V1
  - → **Recommandation : Option A** (avant MOBILE-AUDIT-ONGLETS, mutualisation maximale)
- [ ] **Visual regression baseline** : multi-browser ou Chromium seul ?
  - → Recommandation : multi-browser (catch les diffs Safari/Firefox)
- [ ] **Threshold diff pixels** : 0.1% strict ou 0.5% tolérant ?
  - → Recommandation : 0.1% pour pages critiques (dashboard, bail), 0.5% pour pages secondaires

## Différenciant interne (pas marché)

ImmoTrack avec Playwright + a11y + perf = qualité **avant** ship V1. Évite les régressions silencieuses post-commercialisation. C'est de la discipline développeur, pas un feature user.

## Limites

- ❌ Pas de tests de charge (k6, JMeter) — V2 SaaS si trafic important
- ❌ Pas de tests cross-device réels (BrowserStack/Sauce Labs ~150€/mois) — V2 si besoin
- ❌ Pas de monkey testing (Gremlins.js) — V2

## Notes utilisateur

> 💬 2026-05-14 : « est-ce que tu sais tester toute l'application et le bon rendu et le bon fonctionnement et interface ? quels agents devons nous solliciter ? »
> 💬 2026-05-14 (suite proposition A/B/C) : « vas y » → Option A retenue (Sprint 15bis avant MOBILE-AUDIT-ONGLETS)

## Journal

- 2026-05-14 : créé · 13 scénarios E2E + visual regression + a11y + Lighthouse + CI GitHub Actions = couverture complète qualité avant V1 commerciale
