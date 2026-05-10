# Tests & Fixtures — ImmoTrack

## Objectif
Données de test reproductibles + infrastructure de test pour les sessions Claude (TDD, debugging, frontend-design, brainstorming).

---

## Fichiers

### `fixtures.json` (livré)
Snapshot anonymisé d'un état ImmoTrack réaliste :
- 1 SCI IS avec 2 immeubles + 1 propriétaire particulier LMP
- 5 logements (4 occupés, 1 vacant archivé)
- 4 baux actifs avec révisions IRL + flag DPE F (test gel IRL)
- 12 mouvements 12 mois (loyers + charges + travaux + assurance)
- 5 quittances + 2 MRH + 1 EDL entrée
- Table IRL T4-2023 → T2-2025

**Tous les noms / IBAN / SIREN / téléphones / emails sont fictifs.**

### Tests à venir (Sprint 1+)
- `__tests__/helpers/dates.test.js` — `_loyerHCAtDate(bail, date)` (helper temporel BUG-DASH-001)
- `__tests__/helpers/irl.test.js` — gel IRL DPE F/G + révisions
- `__tests__/helpers/charges.test.js` — répartition tantième + compteur (CHARGE-REGLES)
- `__tests__/helpers/calc-2044.test.js` — mapping catégories → lignes 2044 (LEGAL-2044)

---

## Comment utiliser ces fixtures

### Dans une session de brainstorming / frontend-design
```
Je travaille sur DASH-PROFILES Phase 2. Charge __tests__/fixtures.json
pour avoir des données réalistes et produis les mockups en montrant
la lentille Financier sur les mouvements 2026 + lentille Échéances
sur les baux (3 baux qui se terminent dans <12 mois si on prend ALPHA-001).
```

### Dans une session de TDD
```js
// __tests__/helpers/dates.test.js
import { describe, it, expect } from 'vitest'
import fixtures from './fixtures.json'

describe('_loyerHCAtDate', () => {
  it('renvoie le HC initial avant toute révision', () => {
    const bail = fixtures.baux['ALPHA-001'] // 650€ initial, révisé 1er jan 2025
    expect(_loyerHCAtDate(bail, '2024-06-15')).toBe(650)
  })

  it('renvoie le HC révisé après application IRL', () => {
    const bail = fixtures.baux['ALPHA-001']
    expect(_loyerHCAtDate(bail, '2025-03-15')).toBe(665.4)
  })

  it('renvoie 0 pour un bail en DPE F (gel loi Climat)', () => {
    const bail = fixtures.baux['PERS-001'] // DPE F
    // À implémenter : computeIRLRevision doit retourner 0
  })
})
```

### Dans une session debugging
```
J'ai un bug sur les KPIs occupation pour mai 2024. Charge fixtures.json,
filtre les logements avec bail actif au 2024-05-15, et calcule le ratio
occupé/total. ALPHA-001 a démarré 2024-01-01, donc actif. ALPHA-002 démarre
2025-06-01, donc PAS actif en mai 2024. Etc.
```

---

## Cas d'usage couverts par fixtures.json

| Scénario | Comment l'invoquer |
|---|---|
| Bail avec révision IRL historique | `baux['ALPHA-001'].revisions[]` (650→665.4€ jan 2025) |
| Colocation 2 locataires | `baux['ALPHA-002'].locataires[]` (Sophie + Paul) |
| Logement vacant | `logements[3]` (BETA-002 garage) |
| Logement archivé | `logements[3]` (BETA-002 `archived: true`) |
| DPE F (gel IRL loi Climat) | `baux['PERS-001'].dpe === 'F'` |
| Particulier sans immeuble (logement standalone) | `entites[1]` (Marie Particulier) + `logements[4]` (PERS-001) |
| Ratio occupation Immeuble Alpha | 2 occupés / 2 total = 100% |
| Ratio occupation Immeuble Beta | 1 occupé / 2 total = 50% (BETA-002 archivé doit être exclu) |
| Mouvements 12 mois | `mouvements[]` (loyers récurrents + 1 régul + 1 travaux + 1 PNO) |
| Quittances payées | `quittances[].paye === true` |

---

## Conventions

### Nommage des entités test
- Préfixe `Test`, `LOCATAIRE-X`, `Étudiant`, etc. — JAMAIS de vrais noms
- IBAN : `FR76 0000 0000 0000 0000 0000 000` (zéros)
- SIREN : `111 222 333` (séquences évidentes fictives)
- Téléphones : `06 XX XX XX XX` avec X répétés
- Emails : `*.test@example.com` (RFC 2606)

### Anonymisation
Si tu enrichis les fixtures, **garde l'anonymisation**. Aucune donnée réelle ne doit y entrer (RGPD + sécurité).

### Versioning
- Bump `_meta.version` à chaque modification structurelle
- Documenter le changement dans le commit Git

---

## Setup Vitest (à venir, Sprint 1 étape 3)

Pas encore en place. Plan :
```bash
npm install -D vitest
# package.json : "test": "vitest"
# vitest.config.js minimal : ESM + jsdom env
```

Le défi : `index.html` est un monolithe vanilla, les helpers ne sont pas exportés en modules. Stratégie :
1. **Court terme** : extraire 1 helper pur dans `__tests__/extracted/dates.js` (copie) pour tester l'API
2. **Moyen terme** (post-AUDIT) : si ARCHI-MODULAR retenu, les helpers seront naturellement exportés depuis `js/core/utils.js` → tests directs

---

**Dernière mise à jour** : 2026-05-10
