# BUG-DASH-001 — Dashboard : temporalité des baux + montants historiques au mois choisi

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (élargi 2026-05-01)
**Détecté** : 2026-04-28 (élargi 2026-05-01)
**Lié à** : DASH-V2 · V3-REFONTE-LOYERS · IRL-VALIDATION (livré v13.33)

## Contexte
Quand l'utilisateur sélectionne un mois dans le dashboard, les KPIs (occupation, loyers, rendement, montants attendus vs perçus) doivent refléter **l'état réel à cette date**. Deux dimensions de temporalité :

### Dimension 1 — Quels baux sont actifs ce mois-là ?
Filtrer les baux par leur période de validité :
- Un bail terminé avant le mois sélectionné ne doit plus compter
- Un bail nouveau démarrant après le mois sélectionné ne doit pas compter

### Dimension 2 — Quel était le MONTANT du bail à cette date ? (ajout 2026-05-01)
Pour le calcul "loyer attendu vs loyer perçu" du mois choisi, prendre le **montant historique du bail à cette date**, pas le montant actuel.

**Exemple concret** :
- Bail démarré 1er janvier 2024 à 800 € HC
- Révision IRL appliquée 1er janvier 2025 → 825 € HC
- Consultation dashboard "mai 2024" → loyer attendu DOIT être 800 € (et non 825 €)
- Consultation dashboard "février 2025" → loyer attendu DOIT être 825 €

→ Donc parcourir l'historique des révisions IRL du bail (`bail.revisions[]` ou équivalent) et trouver le montant en vigueur à la date du mois sélectionné. Idem pour les charges, le DG (rare), etc.

## Scope

### A. Filtrer les baux par période (Dimension 1)
- [ ] Identifier tous les sites qui calculent des KPIs sur la période (occupation, rendement, loyers attendus, charges, mouvements)
- [ ] Pour chaque site, filtrer les baux par `dateDebut <= dernierJourDuMois && (dateFin == null || dateFin >= premierJourDuMois)`
- [ ] Tester avec entrée/sortie locataire en milieu de mois (occupation au prorata ?)

### B. Montant du bail à la date (Dimension 2 — ajout 2026-05-01)
- [ ] Helper `_loyerHCAtDate(bail, date)` qui retourne le montant HC en vigueur à `date` :
  - Parcourir `bail.revisions[]` triées par date d'application (ascendante)
  - Retourner la révision dont la date d'application est la plus récente <= `date`
  - Sinon retourner le `bail.loyerHC` initial
- [ ] Idem pour les charges : `_chargesAtDate(bail, date)`
- [ ] Idem pour le DG (rarement révisé mais possible) : `_dgAtDate(bail, date)`
- [ ] Remplacer toutes les lectures directes `bail.loyerHC` / `bail.charges` dans les calculs dashboard par les helpers temporels
- [ ] Vérifier que les **mouvements perçus** ne sont pas impactés (ils ont leur propre date et montant, pas besoin d'historique)

### C. Tests
- [ ] Bail avec 2 révisions IRL, naviguer dashboard avant/pendant/après chaque révision → vérifier loyer attendu cohérent
- [ ] Bail terminé en cours d'année + bail nouveau qui démarre après → vérifier que le mois "vide" entre les deux ne compte aucun bail
- [ ] Bail à cheval sur révision IRL en milieu de mois (rare) : prorata ou montant fin de mois ?

## Décisions à prendre
- [ ] **Occupation** : au jour près (prorata) ou booléen "occupé pendant tout/partie du mois" ?
- [ ] **Rendement brut sur le mois** : loyer attendu (prorata si entrée/sortie partielle) ou loyer encaissé ?
- [ ] **Révision IRL en milieu de mois** : prendre le montant à la fin du mois (cas usuel) ou prorata jour par jour ?
  - Recommandation : montant à la fin du mois (les locataires paient en général en début de mois, peu importe la révision)

## Notes utilisateur
> 💬 2026-04-28 : "Tableau de bord : attention, il faut prendre les baux qui étaient en vigueur dans le choix du mois"
> 💬 2026-05-01 : "dans tableau de bord, il faut prendre le montant du bail à date pour le calcul des montants entre loyer perçu et le montant attendu"

## Journal
- 2026-04-28 : créé
- 2026-05-01 : scope élargi → ajout Dimension 2 (montant du bail à la date du mois choisi, pas le montant actuel). Helper temporel `_loyerHCAtDate(bail, date)` à introduire pour parcourir `bail.revisions[]`.
