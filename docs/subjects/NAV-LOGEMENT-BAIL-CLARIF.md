# NAV-LOGEMENT-BAIL-CLARIF — Clarifier la redondance perçue "Logements" vs "Baux" dans la sidebar

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S (~2-3h) · décision structurante
**Détecté** : 2026-05-17 (user : « dans la sidebar, logements = baux »)
**Lié à** : ARCHI-DB-DOUBLONS (P1, séparation log/bail) · V3-REFONTE-NAV-ONGLETS (Sprint 19D) · PATRIMOINE-NAV-UNIFY ✅ v14.3 · LOG-CANDIDATS (P1)

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs (clarté de navigation = friction réduite)
2. **Règles** : simplicité d'utilisation + design consistency + ne pas casser la fiche 360°
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « dans la sidebar, logements = baux » (redondance perçue)
   - 💻 Code existant : sidebar = `🏠 Biens` (hub Bailleurs/Immeubles/Logements, l. 79) + `📋 Baux & Locataires` (l. 86)
   - 📋 Backlog : croise ARCHI-DB-DOUBLONS (P1) + V3-REFONTE-NAV-ONGLETS (Sprint 19D)
4. **5 vues 360°** : UX (clarté nav) + cycle de vie (vacant/loué/historique) + architecture (modèle log≠bail)

## Constat

L'utilisateur perçoit un **doublon** entre :
- **🏠 Biens > Logements** (le bien physique)
- **📋 Baux & Locataires** (les contrats)

### Nuance technique : logement ≠ bail (diverge dans 2 cas)

```
1 logement loué      →  1 bail actif         ✅ se confondent (cas courant ~80%)
1 logement VACANT    →  0 bail               ❌ logement sans bail
1 logement re-loué   →  2-3 baux successifs   ❌ 1 logement, plusieurs baux dans le temps
```

→ La fusion "logement = bail" est vraie 80% du temps mais fausse pour les vacants + l'historique. C'est le cœur de **ARCHI-DB-DOUBLONS**.

### Contenu réel des onglets (audit code 2026-05-17)

| Onglet | Contenu |
|---|---|
| Biens > Logements | bien physique (loué ou vacant) → clic = fiche 360° |
| Baux & Locataires (`#p-baux`) | baux actifs (cards) + historique (table) + bouton "+ Nouveau bail" + filtre immeuble |

## Options

### Option A — Fusion totale
Supprimer "Baux & Locataires" de la sidebar. Tout via **Biens** : chaque logement → fiche 360° (bail actif + historique + locataire).
- ✅ Simplicité maximale, cohérent avec la fiche 360° qui agrège déjà tout
- ❌ Perte de la vue transversale "baux à échéance / à renouveler" (utile multi-lots)
- ❌ Où gérer candidats (LOG-CANDIDATS) + vacance ?

### Option B — Clarification + renommage (recommandé)
- **Biens** = gestion **par bien** (inchangé, fiche 360°)
- **"Baux & Locataires"** → renommer **"Locataires"** ou **"Suivi baux"** et recentrer sur :
  - échéances + renouvellements + baux à terme
  - pipeline candidats (LOG-CANDIDATS)
  - locataires actuels (vue personnes)
- ✅ Pas de doublon si rôles distincts (gestion par bien vs vue transversale)
- ❌ Demande d'expliquer la différence (le nom actuel induit la confusion)

→ **Reco** : Option B. Le doublon ressenti vient du **nom**, pas de la fonction. Une vue transversale échéances + candidats ne fait pas doublon avec la gestion par bien.

## Vision user précisée (2026-05-17)

> 💬 « je ferais un onglet bien où on a la visu de tous les logements »

→ L'utilisateur veut un **onglet "Bien" dont la vue par défaut = tous les logements** (la liste/grid des appartements, pas le toggle 3 modes Bailleurs/Immeubles/Logements actuel qui démarre sur "Immeubles").

Concrètement :
- Le hub **Biens** existe déjà (PATRIMOINE-NAV-UNIFY v14.3) mais démarre sur l'onglet **Immeubles** → l'utilisateur veut que **Logements** soit la vue par défaut (ou l'entrée mise en avant).
- Combiné avec UX-GROUP-BY-IMMEUBLE : la vue Logements affiche les appartements **groupés par immeuble** (intercalaires) → on retrouve la hiérarchie sans perdre le focus "logements".
- L'onglet "Baux & Locataires" → recentré (Option B) sur échéances + candidats + locataires.

→ Cela renforce **Option B** : l'onglet Bien = point d'entrée patrimoine centré logements (groupés par immeuble), et Baux/Locataires = vue transversale distincte.

## Décisions à arbitrer

- [ ] **D1** : Option A (fusion) ou B (clarification + renommage) ? → user penche pour **B** (onglet Bien centré logements)
- [ ] **D2** : si B, nouveau nom pour "Baux & Locataires" ? ("Locataires" / "Suivi baux" / "Échéances & locataires")
- [ ] **D3** : où placer le pipeline candidats (LOG-CANDIDATS) — dans cet onglet recentré ?
- [ ] **D4** : coordonner avec ARCHI-DB-DOUBLONS (P1) pour ne pas faire 2× la refonte du modèle
- [ ] **D5** : vue par défaut du hub Biens = **Logements** (au lieu d'Immeubles) ? + logements groupés par immeuble (cf UX-GROUP-BY-IMMEUBLE)

## Coordination

⚠️ Croise **Sprint 19D V3-REFONTE-NAV-ONGLETS** (déjà au backlog, traite le renommage Loyers→Mouvements + label Baux). Cette décision devrait être **intégrée dans Sprint 19D** plutôt que traitée séparément.

## Notes utilisateur

> 💬 2026-05-17 : « on a baux dans les onglets mais je pense qu'on devrait avoir bien (appartement) dans la side bar non ? »
> (Réponse pilotage : "Biens" existe déjà dans la sidebar via le hub PATRIMOINE-NAV-UNIFY v14.3 — toggle Bailleurs/Immeubles/Logements. Problème = découvrabilité.)
> 💬 2026-05-17 : « dans la sidebar, logements = baux »
> 💬 2026-05-17 : « on fera en sprint toutes les modifications »
> 💬 2026-05-17 : « je ferais un onglet bien où on a la visu de tous les logements »

## Journal

- 2026-05-17 : créé · redondance perçue Logements/Baux · nuance log≠bail (vacant + historique) · Option B (renommage) recommandée · à intégrer dans Sprint 19D V3-REFONTE-NAV-ONGLETS · décisions D1-D4 reportées
- 2026-05-17 : **vision user précisée** — onglet "Bien" avec vue par défaut = tous les logements (groupés par immeuble cf UX-GROUP-BY-IMMEUBLE). Renforce Option B. Ajout décision D5 (vue par défaut hub Biens = Logements au lieu d'Immeubles).
