# FINANCES-SUIVI-UNIQUE — un seul moteur de suivi des loyers

**Statut** : 🔍 Phase 1 (compréhension partagée) terminée le 2026-10-05 · branche `feat/finances-suivi-unique` · aucun code produit
**Lié à** : `RETOURS-2026-10-05.md` (lot E) · `AUDIT-SUIVI-LOYERS-2026-07-14.md` (C2, C12) · `CDC-FINANCES.md` (P-1, T-5, H-1) · `CDC-R0C.md` (`_computeDetteBail`, dette bornée au bail)

## Cas Arslan reconstitué (Ferrette - 101, export du 05/10 + relevé bancaire)
Bail : 760 € HC + 20 € charges = **780 €**, début 03/05/2026. Locataire précédent (Wieniski) parti le 13/04/2026, 700 € HC.

| Mois payé | Virement (date bancaire) | Encaissé | Dû | Écart réel |
|---|---|---|---|---|
| Mai | 04/05 | 730 | 729,68 (prorata 29/31) | +0,32 |
| Juin | 02/06 | 780 | 780 | 0 |
| Juillet | 27/06 | 780 | 780 | 0 |
| Août | 05/08 | 760 | 780 | −20 (**manque accepté**, panne électrique) |
| Septembre | 01/09 | 780 | 780 | 0 |
| Octobre | 02/10 | 780 | 780 | 0 |

**Pourquoi l'app affiche 283,01 € (juillet) / 323,01 € (KPI)** :
1. Le loyer d'avril de Wieniski (700 × 13/30 = 303,33 €) a été retenu sur son DG (`finNotes`), sans mouvement « Loyers encaissés » → l'app le voit impayé.
2. La compensation se fait **par lot** (`finances-monthly.js:236-264`, `loyer-du-mois.js:409-410`) : les paiements d'Elise remboursent d'abord cette dette (303,01 € après le surplus de mai).
3. Le virement du 27/06 (juillet) est compté en juin (date bancaire, `finances-monthly.js:112`) : l'avance restante (476,99 €) ne couvre pas juillet → 283,01 € HC + 20 € charges de retard.
4. + 20 € de charges d'août = 323,01 €. Le « 40 € » n'est pas un barème : ce sont les charges impayées de juillet et d'août.
5. Onglet Loyers (`etatMoisLot`) : 1 723,01 € « restant dû » pour le même lot (suivi démarré en janvier, `_debutSuivi` `loyer-du-mois.js:290-295`, contre mars pour Finances `app-part2.js:29440`).

Reproduction : `node docs/subjects/FINANCES-SUIVI-UNIQUE/repro-arslan-101.mjs <export.json>`.

## Décisions de Didier (05/10)
1. **Imputation** : le paiement reste rattaché à sa **date bancaire**, avec **cumul compensé par locataire (bail)**. Un virement en avance s'affiche « payé d'avance » et solde le mois suivant ; jamais retard ET avance sur le même lot le même mois ; aucune saisie. Une exception manuelle « ce virement paie tel mois » reste possible pour les cas rares.
2. **Dette d'un locataire sorti** : les arriérés appartiennent au **bail**, jamais au lot. Une retenue sur le DG vaut règlement (comptée encaissée sur le bail sorti). Le reliquat éventuel reste visible à part (« locataire sorti »), hors du retard du lot actuel. Écart d'arrondi sous 1 € (303 vs 303,33) : soldé d'office, trace visible.

## Reste à décider / à faire
- Geste « manque accepté » (montant, motif, date ; ne touche pas au bail) : fiche par lot et par mois.
- Phase 2 : maquette (`mockups/FINANCES-SUIVI/`, 3 formats, clair + sombre), validée avant code.
- Phase 3 : moteur unique `js/core/` (réutiliser/étendre `_computeDetteBail` de R0-C), test Arslan, invariants (pas retard+avance ; I-1).
