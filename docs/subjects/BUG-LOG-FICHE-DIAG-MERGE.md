# BUG-LOG-FICHE-DIAG-MERGE — Retirer Diagnostics + Risques + DPE du wizard édition bien → tout dans fiche 360°

**Status** : ⬜ À faire · **Prio** : P1 V1.1 · **Taille** : S (1-2h)
**Détecté** : 2026-05-14 (user identifie 3 onglets redondants dans le wizard édition bien)
**Re-cadré 2026-05-14** : proposition user de **déplacer** vers la fiche 360 (gestion légale dédiée) plutôt que fusionner dans le wizard
**Lié à** : BAILLEUR-DIAGNOSTICS-DDT (livré v15.05-06) · LEGAL-DPE-INTERDICTION-LOCATION (livré v15.05) · IRL-DPE-FG (livré v13.31) · `feedback_design_consistency.md`

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs — réduit la friction onboarding bien (wizard plus court) + concentre le légal là où il est géré.
2. **Règles respectées** : OK — simplicité d'utilisation (vision user) + design consistency + cohérence avec BAILLEUR-DIAGNOSTICS-DDT.
3. **Justifications multiples** :
   - 🧑 Cas user 2026-05-14 : « onglet diagnostique et risques (dans le bien) redondant »
   - 🧑 Cas user 2026-05-14 : « et DPE dans bien aussi »
   - 🧑 Cas user 2026-05-14 (proposition arbitrage) : « **je proposerais de mettre plutot dans la fiche bien car c'est du légal** » → déplacement vers la fiche 360°
   - ⚖️ Cadre légal : DPE + ERP + CREP + amiante + gaz + élec + termites + mérule + bruit aérien = **tous des diagnostics** au sens loi 89-462 art. 3-3 (Dossier Diagnostic Technique unique)
   - 💻 Code existant : BAILLEUR-DIAGNOSTICS-DDT (Phase 1 sous-onglet "Diagnostics" sur LOG-FICHE-360 livré v15.05-06) — couvre les 9 diagnostics dans **UNE seule UI dédiée** sur la fiche 360
   - 📋 Backlog : trou de cohérence détecté
4. **5 vues 360°** : axe UX (wizard édition allégé) + axe légal (DDT centralisé fiche 360 gestion)

## Constat

Le wizard édition d'un bien (fiche logement) contient actuellement **3 onglets séparés** :
- **Diagnostics**
- **Risques**
- **DPE**

→ **Redondants** au sens légal et UX :
- **ERP** (État des Risques et Pollutions) = un diagnostic à part entière (art. L125-5 Code env.)
- **DPE** (Diagnostic de Performance Énergétique) = le diagnostic le plus connu mais légalement = 1 diagnostic parmi les 9 du DDT
- Tous les autres diagnostics (CREP plomb, amiante, gaz, élec, termites, mérule, bruit aérien) sont déjà dans "Diagnostics"

Cette séparation force l'utilisateur à chercher dans 3 onglets ce qui devrait être centralisé en 1.

## Scope

### Approche choisie 2026-05-14 : DÉPLACEMENT plutôt que fusion

**Avant** :
- Wizard édition bien (modale "Modifier : D-...") = 5+ onglets dont **Diagnostics + Risques + DPE**
- Fiche 360° = sous-onglet "Diagnostics" (BAILLEUR-DIAGNOSTICS-DDT) qui re-couvre la même chose

**Après** :
- Wizard édition bien = **onglets allégés** (Identité, Description, Équipements, Annexes — sans légal)
- Fiche 360° sous-onglet "Diagnostics" = **source unique** de saisie + consultation des 9 diagnostics légaux

### Phase 1 — Audit code wizard édition bien (~15min)
- Grep wizard édition logement (`Modifier : ${ref}` ou similaire) pour identifier les 3 onglets à retirer
- Lister les champs de chaque onglet pour les recoller dans le sous-onglet Diagnostics fiche 360 si pas déjà présents

### Phase 2 — Retrait des 3 onglets du wizard édition (~30min)
- Supprimer les onglets **Diagnostics + Risques + DPE** du wizard édition bien
- Conserver uniquement les onglets ergonomie rapide : Identité, Description, Équipements (locataire — cf EQUIP-CONTROLES-PERIODIQUES livré v15.08), Annexes
- Ajouter une bannière info dans le wizard : « 📊 Les diagnostics légaux (DPE, ERP, plomb, amiante, gaz, élec, termites…) se gèrent dans la fiche du bien → sous-onglet Diagnostics »

### Phase 3 — Enrichir le sous-onglet Diagnostics fiche 360° si manquant (~30min)
- BAILLEUR-DIAGNOSTICS-DDT a livré le sous-onglet avec les 9 diagnostics DDT
- Vérifier qu'il **couvre bien tous les champs** qui étaient dans les 3 onglets wizard (DPE classe + ges + valeur kWh + date, ERP, etc.)
- Si manque : compléter le sous-onglet (pas créer de nouveaux champs DB, juste l'UI saisie/édition complète)

### Phase 4 — Migration / rétrocompatibilité (~15min)
- Les champs DB (`logement.dpe`, `logement.ges`, `logement.diagsRisques.*`) **ne changent pas**
- Migration silencieuse : aucune
- Rétrocompatibilité : préservée car on ne touche pas la structure DB

### Phase 5 — Vérification cohérence (~15min)
- LEGAL-DPE-INTERDICTION-LOCATION (helper `_dpeInterditLocationAuDate`) lit toujours `logement.dpe`
- IRL-DPE-FG (gel révision IRL) lit toujours `logement.dpe`
- PILOTAGE-MATRICIEL sous-onglet Suivi documents lit toujours les diagnostics
- → Tous les consommateurs continuent de fonctionner (la source DB est inchangée)

### Phase 6 — Tests Vitest (~15min)
- Test : 3 onglets Diagnostics + Risques + DPE non présents dans le wizard édition après refonte
- Test : sous-onglet Diagnostics fiche 360 affiche correctement DPE + Risques (couverture exhaustive)
- Test : helpers existants (`_dpeInterditLocationAuDate`, `_bailGelDpeFG`) renvoient les mêmes résultats qu'avant

## Décisions arbitrées 2026-05-14

- [x] **Approche déplacement** (pas fusion) : retrait des 3 onglets du wizard édition + tout géré dans la fiche 360° sous-onglet Diagnostics (cf BAILLEUR-DIAGNOSTICS-DDT)
- [x] **Justification user** : « c'est du légal » → la gestion des diagnostics relève de la fiche bien (vue de gestion dédiée), pas du formulaire de saisie initial
- [x] **Pas de migration DB** : structures `logement.dpe`, `logement.ges`, etc. inchangées (seule l'UI bouge)
- [x] **Sprint 17 (Polish UX final)** ou anticipation Sprint 10-11 si cohérent avec autre refonte UX

## Différenciant marché

| Solution | Diagnostics groupés ou éclatés |
|---|---|
| Rentila | éclatés (DPE seul + reste à part) |
| BailFacile | partiel |
| Qalimo V2 | groupés dans 1 section |
| **ImmoTrack actuel** | ❌ éclatés en 3 onglets |
| **ImmoTrack après BUG-LOG-FICHE-DIAG-MERGE** | ✅ groupés cohérence DDT |

## Notes utilisateur

> 💬 2026-05-14 : « onglet diagnostique et risques (dans le bien) redondant »
> 💬 2026-05-14 : « et DPE dans bien aussi »
> 💬 2026-05-14 (arbitrage) : « je proposerais de mettre plutot dans la fiche bien car c'est du légal »

## Journal

- 2026-05-14 : créé · proposition fusion 3 onglets en 1 dans wizard édition
- 2026-05-14 (re-cadré) : **approche DÉPLACEMENT** (user) — retrait des 3 onglets du wizard édition bien (formulaire de saisie initial, pas de friction onboarding) + tout géré dans la fiche 360° sous-onglet Diagnostics (vue de gestion légale dédiée, déjà couvert par BAILLEUR-DIAGNOSTICS-DDT v15.05-06). Pas de migration DB nécessaire.
