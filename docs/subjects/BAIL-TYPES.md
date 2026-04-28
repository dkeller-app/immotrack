# BAIL-TYPES — Ajout 5 types de bail (meublé/garage/mobilité/étudiant + Autre)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : L (5 phases A-E, ~7-10h cumulés)
**Lié à** : `project_bail_types.md` (mémoire détaillée), BAIL-PDF-NATIF (à faire avant), BAIL-PRINT-POLISH
**Prérequis** : BAIL-PDF-NATIF (refonte PDF) terminé pour avoir une base saine de génération

## Contexte

Aujourd'hui, le bail est mono-type "nu" implicite. Il faut ajouter 5 types pour couvrir le marché de la gestion locative résidentielle particulière, en gardant la **rétrocompatibilité totale** avec les baux existants (qui deviennent type "nu" par défaut).

## Périmètre validé (Q2 utilisateur 2026-04-25)

| # | Type | Couverture |
|---|---|---|
| 1 | Bail nu | Existant, type par défaut, rétrocompat |
| 2 | Bail meublé | Loi ALUR 2014, 1 an, mobilier obligatoire (décret 2015-981) |
| 3 | Bail garage/parking | Code civil libre (art. 1709+), simplifié |
| 4 | Bail mobilité | Loi ELAN 2018, 1-10 mois, **DG interdit** |
| 5 | Bail étudiant | Variante meublé, 9 mois fixe non reconductible |
| 6 | Autre / Cas particulier | Disclaimer "Consultez un notaire", form libre |

**HORS SCOPE** : bail commercial (recommandation = notaire, géré via "Autre" si besoin).

## Scope — 5 phases A-E

### Phase A — Infrastructure types (~2-3h)
- [ ] Champ `bail.type` (default 'nu', rétrocompat)
- [ ] Sélecteur en étape 2 du wizard ("Type de bail")
- [ ] Adaptation DG default selon type (cf. Q4 ci-dessous)
- [ ] Adaptation durée default selon type
- [ ] Badge type sur la carte de bail :
  - 📚 meublé · 🚗 garage · 🚀 mobilité · 🎓 étudiant · 📋 autre
  - Défaut nu = pas de badge
- [ ] Pour cette phase, tous les types utilisent le template "nu" existant (pas encore de templates dédiés)
- [ ] Disclaimer popup pour type "Autre"

### Phase B — Bail meublé complet (~2-3h)
- [ ] Section "Mobilier" en étape 3 (les 11 catégories décret 2015 — checkboxes ou liste libre)
- [ ] Clauses spécifiques meublé (durée 1 an, tacite reconduction, conditions de sortie)
- [ ] Template Word/HTML meublé (basé sur nu, modifications ciblées)

### Phase C — Bail garage (~1-2h)
- [ ] Form simplifié quand `type=garage` : masquer chauffage, ECS, diagnostics, encadrement
- [ ] Template Word/HTML garage (court, références code civil)

### Phase D — Bail mobilité (~1-2h)
- [ ] Nouveau champ "Motif mobilité" (mutation pro / formation / stage / mission temporaire / autre)
- [ ] DG verrouillé à 0 (interdit par loi ELAN)
- [ ] Template Word/HTML mobilité (références loi ELAN art. 107)

### Phase E — Bail étudiant (~30 min)
- [ ] Variante meublé, durée 9 mois fixe
- [ ] Pas de tacite reconduction
- [ ] Réutilise infra Phase B

## Décisions transverses

### Q4 — DG par type : politique souple
- **Valeur pré-remplie selon type** :
  - nu : 1 × HC (1 mois loyer)
  - meublé : 2 × HC (2 mois)
  - étudiant : 2 × HC
  - mobilité : 0 € (verrouillé, info légale)
  - garage : pas de pré-remplissage (libre)
  - autre : pas de pré-remplissage
- **Modifiable** par l'utilisateur
- **Popup alert** si l'utilisateur modifie la valeur pré-remplie pour les types où le légal est strict :
  > *"Vous modifiez le DG par rapport à la règle légale (X mois pour bail Y). Confirmer cette valeur non standard ?"*
- Pour mobilité spécifiquement : DG verrouillé à 0, message si tentative de modification.

### Q1 — Phasing
Étape par étape, 1 commit + retest utilisateur entre chaque phase.

### Q3 — Session dédiée
À traiter dans une session ImmoTrack dédiée (pas un mix avec d'autres sujets), avec rappel de cette mémoire en démarrage.

## Références légales

- **Bail nu** : loi 89-462 du 6 juillet 1989, art. 22 (DG = 1 mois HC max)
- **Bail meublé** : loi ALUR 2014 + décret 2015-981 (mobilier, 11 catégories obligatoires)
- **Bail mobilité** : loi ELAN 2018, art. 107 (DG interdit, 1-10 mois)
- **Bail étudiant** : loi 89 modifiée par ALUR (9 mois non reconductible, meublé)
- **Bail garage non rattaché** : code civil art. 1709 et suivants (libre)

## Prompt de démarrage de session

```
On attaque BAIL-TYPES — phase {A/B/C/D/E}.
Lis : BACKLOG.md, docs/subjects/BAIL-TYPES.md, project_bail_types.md (mémoire détaillée).

Workflow :
1. Confirme la phase à attaquer
2. Vérifier que BAIL-PDF-NATIF est livré (prérequis si Phase B+)
3. Implémentation
4. Retest utilisateur entre chaque phase
5. Commit phase par phase, bump version

Estimation Phase A : 2-3h. Phase B : 2-3h. Phase C : 1-2h. Phase D : 1-2h. Phase E : 30 min.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-25 : périmètre validé Q1-Q4 dans session bail wizard (mémoire `project_bail_types.md`)
- 2026-04-28 : créé doc subject pilotage suite vérification mémoires (j'avais réduit à BAIL-MEUBLE dans le BACKLOG initial)
