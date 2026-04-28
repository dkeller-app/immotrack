# DASH-KPI-HC — KPI occupation/rendement brut basés sur loyer HC

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S
**Détecté** : 2026-04-28
**Lié à** : DASH-V2 · BUG-DASH-001

## Contexte
Les KPIs **occupation** et **rendement brut** doivent se baser sur le **loyer HC** (hors charges), même quand on est en mode "réel" (les charges encaissées sont des provisions, pas du revenu).

Drill-down du KPI occupation : **afficher le loyer TTC** (HC + charges + TVA si applicable) pour info, mais le calcul du KPI reste sur HC.

## Scope
- [ ] Identifier les sites de calcul : `_renderKpiOccupation`, `_renderKpiRendementBrut` (ou équivalent)
- [ ] Utiliser `loyerHC` plutôt que `loyerTTC` ou `loyer` (à confirmer la nomenclature)
- [ ] Drill-down occupation : afficher colonne "loyer TTC" en plus du HC
- [ ] Vérifier que le tooltip / légende précise bien "HC"

## Décisions à prendre
- [ ] Le KPI rendement brut doit-il aussi avoir une variante TTC en drill ? (cohérence avec occupation)

## Notes utilisateur
> 💬 2026-04-28 : "pour les KPI occupation et rendement brut, prendre les loyers HC pour le calcul (meme le réelle, enlever les charges). KPI occupation afficher le loyer TTC dans le drill down"

## Journal
- 2026-04-28 : créé
