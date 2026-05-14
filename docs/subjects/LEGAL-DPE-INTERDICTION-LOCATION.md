# LEGAL-DPE-INTERDICTION-LOCATION — Bloquer création/renouvellement bail si DPE interdit à la location

**Status** : ✅ Livré v15.05 (Sprint 7 V1.1, 2026-05-13) · **Prio** : P1 V1.1 · **Taille** : S (2-3h → ~2h réalisé)
**Détecté** : 2026-05-13 (audit 360°)
**Lié à** : IRL-DPE-FG (livré v13.31) · BAILLEUR-DIAGNOSTICS-DDT · BAIL wizard

## Justification (4 critères pré-vol)

1. **Cible** : tous les bailleurs (solo + SCI + pro + mandataire). 7% du parc locatif FR concerné en 2025 (DPE G).
2. **Règles respectées** : OK, étend IRL-DPE-FG existant sans dupliquer.
3. **Source légale** : Loi Climat & Résilience 2021-1104, art. 23 + décret 2022-945. **Calendrier interdictions** :
   - 1er janvier 2023 : G+ (conso > 450 kWh/m²/an) interdits **nouvelle location**
   - 1er janvier 2025 : G interdits nouvelle location
   - 1er janvier 2028 : F interdits nouvelle location
   - 1er janvier 2034 : E interdits nouvelle location
4. **Backlog** : extension naturelle de IRL-DPE-FG livré (qui ne couvre que le gel des révisions IRL, pas la création de bail).

## Contexte

`IRL-DPE-FG` (livré v13.31) gère **uniquement le gel de la révision IRL** pour les baux EN COURS sur DPE F/G. Mais il ne **bloque pas la création** d'un nouveau bail sur un logement DPE interdit. C'est un trou légal critique pour la V1 commerciale.

## Scope

### Phase 1 — Helper de validation (~1h)
- Helper `_dpeInterditLocationAuDate(dpe, dateRef)` :
  - Retourne `{ interdit: bool, raison: string, anneeBlocage: number }`
  - Calendrier : G+ → 2023, G → 2025, F → 2028, E → 2034
  - Tests Vitest dans `__tests__/helpers/dpe.test.js` étendu (10+ cas calendrier)

### Phase 2 — Bloquage wizard bail (~1h)
- Étape "Conditions" du wizard bail : check `_dpeInterditLocationAuDate(logement.dpe, bail.debut)`
- Si interdit → **modale rouge** :
  - Titre : « ⚠️ Création de bail bloquée — DPE interdit à la location »
  - Message : « Le logement est classé DPE {dpe}. Selon la loi Climat 2021-1104, ce DPE est interdit à la nouvelle location depuis le {date_interdiction}. Vous ne pouvez pas créer un nouveau bail. »
  - 2 boutons : « Mettre à jour le DPE » (redirige vers fiche logement section diagnostics) / « Annuler »
- **Override impossible** (différent de DDT bloquage qui a override "à mes risques") — c'est une interdiction stricte avec amende 15 000€

### Phase 3 — Alerte dashboard lentille Conformité (~30min)
- Liste des logements vacants avec DPE interdit
- Tooltip : « X logements ne pourront pas être reloués sans travaux énergétiques »
- Renvoyer vers diagnostic + simulation rénovation (lien V1.2 GESTION-TRAVAUX)

### Phase 4 — Génération annonce désactivée (~30min)
- Couplé `LOG-ANNONCE` (sujet V1.2) : si DPE interdit, le bouton "Générer annonce" est désactivé avec message d'avertissement
- Sinon, mention obligatoire DPE + calendrier interdiction dans l'annonce (loi Climat)

## Décisions arbitrées
- [x] **Override strict** (pas de "à mes risques") — la loi est claire, amende 15 000€
- [x] **Pas d'alerte popup au login** (différent de IRL où alerte mois anniversaire) — l'alerte est au moment de la création bail uniquement
- [x] **Couvre les renouvellements** : un bail qui se renouvelle après la date d'interdiction = considéré comme nouvelle location (jurisprudence à confirmer mais sécuritaire)

## Différenciant marché
| Solution | Blocage DPE interdit |
|---|---|
| Rentila | ❌ |
| BailFacile | ❌ |
| Qalimo V2 | partial (warning sans blocage strict) |
| **ImmoTrack après LEGAL-DPE-INTERDICTION-LOCATION** | ⭐ blocage strict = protection légale différenciante |

## Notes utilisateur
> 💬 2026-05-13 : audit 360° identifie ce trou (cycle de vie + obligation légale)

## Journal
- 2026-05-13 : créé (audit 360° → identifié comme trou critique V1.1)
- 2026-05-13 : ✅ Livré v15.05 (Sprint 7 V1.1, ~2h) :
  - Helper `_dpeInterditLocationAuDate(dpe, dateRef)` dans `js/core/utils.js` + inline shadow dans `index-test.html`. Retour `{ interdit, raison, anneeBlocage, dateBlocage, classe }`. Calendrier inline `DPE_INTERDICTION_CALENDRIER` exposé via `_dpeInterdictionCalendrier()` pour UI.
  - Tests Vitest étendus dans `__tests__/helpers/dpe.test.js` : 20 nouveaux tests (DPE A-D jamais interdits, G interdit 2025, F interdit 2028, E interdit 2034, edge cases dont case-insensitive + Date object + dateRef vide).
  - Bloquage `saveBail()` (ligne ~10230) : intercepte avant écriture DB, appelle `_dpeShowInterdictionModal(verdict, ref)` → modale rouge `#ov-dpe-interdit` avec bandeau ⛔ + raison + calendrier complet + boutons "Annuler" / "✦ Mettre à jour le DPE" (redirige fiche logement).
  - **Override impossible** comme spécifié (amende 15 000 €).
  - Couvre nouvelle création **ET renouvellement** (le check est sur `bail.debut`).
