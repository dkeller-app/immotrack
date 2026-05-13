# VEILLE-QALIMO-V2 — Analyse nouvelle version Qalimo (2026)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S (2-3h analyse + rapport)
**Détecté** : 2026-05-13
**Lié à** : BIZPLAN · CARTE_POSITIONNEMENT · DASH-PROFILES · LOG-FICHE-360 · LOG-LISTE-CARDS

## Contexte
Demande utilisateur 2026-05-13 :
> 💬 « Faire aussi une analyse de qalimo ils ont sorti une nouvelle version. »

Qalimo est le concurrent référence visuelle d'ImmoTrack (les sujets LOG-LISTE-CARDS, LOG-FICHE-360 ont été inspirés des captures Qalimo 2026-05-01). Si Qalimo a sorti une nouvelle version, nouveau scan nécessaire pour :
1. Identifier ce qu'ils ont ajouté (features nouvelles à benchmarker)
2. Identifier ce qu'ils ont supprimé ou refondu (peut-être des features qu'on a copiées et qui n'ont pas marché chez eux)
3. Repositionner les différenciants ImmoTrack vs Qalimo V2

## Scope

### Phase 1 — Capture de l'état actuel Qalimo V2 (~1h)
- Aller sur app.qalimo.com (ou équivalent) avec compte test
- Captures d'écran systématiques de chaque écran clé :
  - Dashboard (lentilles éventuelles ?)
  - Vue Biens (liste cartes)
  - Fiche 360° bien (sous-onglets)
  - Wizard bail
  - Onglet Locataires
  - Quittances
  - Charges / Régul
  - IRL
  - EDL
  - Paramètres
- Captures landing page marketing
- Captures pricing (changements ?)

### Phase 2 — Analyse comparative (~1-2h)
Produire `docs/strategie/VEILLE-QALIMO-V2-2026.md` avec :

**Section A — Nouveautés Qalimo V2** (vs V1 référence avril 2026)
- Nouvelles features visibles
- UX modifiée (ergonomie, navigation, layout)
- Pricing changements

**Section B — Comparaison feature-par-feature**
Tableau matriciel ImmoTrack vs Qalimo V2 sur :
- Dashboard (KPIs, lentilles, sparklines)
- Vue Biens (cartes, photos, ratios)
- Fiche 360°
- Bail (wizard, signature, types)
- EDL (photos, délégué, comparatif)
- Charges/Régul (répartition, transparence)
- IRL (validation, gel DPE)
- Légal/Fiscal (2044, bilan, CRG)
- Sync (Drive, multi-device)
- Mobile (PWA, responsive)
- Sécurité (XSS, RGPD)

**Section C — Repositionnement différenciants ImmoTrack**
- Différenciants à garder (toujours absents Qalimo)
- Différenciants à pousser (ImmoTrack mieux fait)
- Lacunes à combler (Qalimo mieux)

**Section D — Updates à pousser en backlog**
Pour chaque lacune identifiée, créer ou enrichir un sujet docs/subjects/ correspondant.

### Phase 3 — Update CARTE_POSITIONNEMENT.md (~30min)
- Repositionner ImmoTrack sur l'axe X (solo↔pro) et Y (prix↔richesse fonctionnelle) si nécessaire
- Update sections concurrence du BIZPLAN.md si changement marché significatif

## Méthodologie
- Skill `anthropic-skills:xlsx` peut aider à exploiter `ImmoTrack_Comparatif_Concurrents_2026.xlsx` existant
- WebFetch sur landing Qalimo + blog Qalimo pour détecter les annonces V2
- Skill `superpowers:brainstorming` si besoin d'arbitrer une priorité features

## Livrables
1. `docs/strategie/VEILLE-QALIMO-V2-2026.md` (analyse complète)
2. Update `docs/strategie/CARTE_POSITIONNEMENT.md` si nécessaire
3. Issues backlog créées pour les lacunes identifiées (1 par lacune)

## Notes utilisateur
> 💬 2026-05-13 : "Faire aussi une analyse de qalimo ils ont sorti une nouvelle version. faire ton retour"

## Journal
- 2026-05-13 : créé · à faire en session courte dédiée (~2-3h), idéalement avec captures user
