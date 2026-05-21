# V3-REFONTE-ASSURANCES — Déplacer la gestion des assurances dans les fiches + retirer l'onglet

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (~3-4h)
**Détecté** : 2026-05-17 (user : « l'onglet assurance est HS aussi je pense. il n'a pas de grosse utilité (on y va une fois par an) … on le gère dans biens ? »)
**Lié à** : MRH-AUTO-LOC (P2) · BUG-LOG-FICHE-DIAG-MERGE (même pattern : déplacer vers la fiche) · LOG-FICHE-360 · NAV-LOGEMENT-BAIL-CLARIF · alertes dashboard

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs — réduit le nombre d'onglets peu utilisés, concentre l'assurance là où elle est gérée (par bien/bail)
2. **Règles** : simplicité + design consistency + cohérence avec BUG-LOG-FICHE-DIAG-MERGE (le légal/contractuel se gère dans la fiche)
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « l'onglet assurance est HS … on y va une fois par an … on le gère dans biens ? »
   - 💻 Code existant : `rAss()` (l. ~16481) = tableau `<table class="tbl">` à l'ancienne, peu engageant
   - 📋 Backlog : même logique que BUG-LOG-FICHE-DIAG-MERGE (déplacement vers fiche 360°)
   - ⚖️ Cadre légal : PNO + MRH = obligations → ne pas perdre les alertes d'échéance
4. **5 vues 360°** : UX (onglet allégé) + légal (PNO/MRH obligatoires) + cycle de vie (renouvellement annuel)

## Constat

L'onglet Assurances :
- N'est consulté qu'~1×/an (renouvellement)
- Visuellement = tableau brut (pas refondu)
- Fait un onglet de plus dans une sidebar déjà chargée

→ Proposition user : **retirer l'onglet** et gérer les assurances **dans les fiches** (Biens).

## ⚠️ Nuance critique : niveau de rattachement variable

Les assurances n'ont PAS toutes le même niveau logique :

| Assurance | Niveau | Fiche cible |
|---|---|---|
| **PNO** (Propriétaire Non Occupant) | Immeuble **ou** logement | Fiche immeuble (si contrat global) OU fiche bien |
| **GLI** (Garantie Loyers Impayés) | Bail | Fiche bail |
| **MRH** (Multirisque Habitation locataire) | Locataire/bail | Fiche bail (attestation vérifiée 1×/an = obligation locataire) |

→ On ne peut pas tout mettre « dans le logement » : il faut router selon le type.

## ⚠️ Ne PAS perdre la vue transversale des échéances

**PNO + MRH = obligations légales.** Disperser sans garder une vue d'ensemble = risque d'oubli de renouvellement → trou de couverture. La vue « assurances à renouveler ce trimestre » doit rester accessible :
- Soit dans le **dashboard / page accueil** (carré "À traiter" — déjà existant)
- Soit dans un **bloc alertes** transversal

## Scope (proposé)

### Phase 1 — Audit `rAss()` (~20min)
- Localiser `rAss()` + structure data `DB.assurances`, `DB.mrh`
- Lister les champs par contrat (compagnie, n°, échéance, garanties, montant)
- Identifier le rattachement actuel (par logement ? par bail ?)

### Phase 2 — Sous-onglets Assurance dans les fiches (~90min)
- **Fiche bien (logement)** → sous-onglet/section "🛡 Assurances" : PNO du bien
- **Fiche immeuble** → section PNO si contrat global immeuble
- **Fiche bail** → section GLI + attestation MRH locataire (à vérifier 1×/an)
- Réutiliser le composant cards (cohérent design system)

### Phase 3 — Vue transversale échéances conservée (~30min)
- Bloc "Assurances à renouveler" dans le dashboard / page accueil (carré "À traiter")
- Alerte j-60/j-30 avant échéance PNO/MRH/GLI

### Phase 4 — Retrait onglet sidebar (~15min)
- Retirer l'entrée "Assurances" de la sidebar
- Bannière de redirection si lien direct : « Les assurances se gèrent désormais dans la fiche du bien / du bail »

### Phase 5 — Migration / rétrocompat (~15min)
- `DB.assurances` + `DB.mrh` **inchangés** (seule l'UI bouge)
- Aucune migration DB

### Phase 6 — Tests Vitest (~20min)
- Helper de routage `_assuranceNiveau(type)` → 'immeuble' | 'logement' | 'bail'
- Échéances : `_assurancesAEcheance(date, j)` retourne les contrats à renouveler

## Décisions à arbitrer

- [ ] **D1** : PNO rattachée au logement OU à l'immeuble (selon que le contrat est par lot ou global) ? → supporter les 2
- [ ] **D2** : où placer la vue transversale échéances — dashboard "À traiter" (reco) ou bloc dédié ?
- [ ] **D3** : retrait total de l'onglet OU le garder caché en mode "avancé" pour les gros patrimoines ?
- [ ] **D4** : coordination avec Sprint 19G (qui prévoyait de refondre l'onglet en cards — ce sujet le REMPLACE par un déplacement)

## Coordination

⚠️ Ce sujet **remplace** la version initiale du Sprint 19G (qui prévoyait juste une refonte de l'onglet en cards). Décision user 2026-05-17 : pas refondre l'onglet mais le **déplacer dans les fiches** (même pattern que BUG-LOG-FICHE-DIAG-MERGE).

## Notes utilisateur

> 💬 2026-05-17 : « l'onglet assurance est HS aussi je pense. il n'a pas de grosse utilité (on y va une fois par an en théorie et visuellement ce n'est pas fou. on le gère dans biens ? »

## Journal

- 2026-05-17 : créé · déplacement assurances vers les fiches (pas refonte onglet) · nuance niveau de rattachement (PNO immeuble/logement, GLI bail, MRH locataire) · conserver vue transversale échéances (obligations légales) · remplace l'approche initiale Sprint 19G
