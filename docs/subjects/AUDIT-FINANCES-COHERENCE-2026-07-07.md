# AUDIT-FINANCES-COHERENCE — audit complet page Finances (2026-07-07)

> **Déclencheur** (user, capture v15.42x) : « comment on peut avoir une différence de charges à récupérer
> entre le tableau et le widget ? quand je dis que j'ai peur c'est véridique !! tu fais TOUT l'audit. »
> Écran : tableau Solde charges récupérables **−1 957,03 €** vs widget Régularisation **+2 137,00 €**.
>
> **Méthode** : 4 audits parallèles (agents code-reviewer) sur v15.423 : ① moteur mensuel + tableau,
> ② widgets « Argent à récupérer », ③ divergence Solde/régul (question exacte), ④ hero/synthèse/inter-pages.
> ①③ complétés en session maître (agents tombés : stall + limite session). Lecture seule, rien corrigé.

## Verdict global

**Aucune erreur d'arithmétique** : chaque chiffre est la somme exacte de ce que son moteur calcule
(vérifié avec les chiffres réels de l'écran : Cash-flow net −1 363,78 + Solde −1 957,03 = Cash-flow réel
−3 320,81 ✓ ; total leaks 4 424,77+12 329,90+0+2 137,00 = 18 891,67 ✓).
**Le problème est structurel** : la page fait cohabiter **4 moteurs de calcul** avec des définitions,
des fenêtres temporelles, des conventions de signe et des périmètres différents, **sans jamais l'annoncer** :

| Moteur | Alimente | Base |
|---|---|---|
| `_computeFinancesMonthly` (js/core/finances-monthly.js) | tableau P&L, hero cash-flow, cartes Accueil/Dashboard | mouvements réels, mois écoulés, net signé |
| `_computeFinancesSummary` + `_finChargeBuckets` (js/core/finances-summary.js + index) | ratios, « Argent à récupérer » | mouvements année pleine, db>0 seulement |
| `computeRegul` (index ~25426) | widget Régularisation, page Régul | provisions DUES par bail × charges RÉPARTIES par compteurs, année pleine, positifs seulement |
| `_computeBilanAnnuel` (js/core/legal-bilan.js) | vacance, drill « par logement » | moteur 2044 (loyers CC, sans intérêts ni prêt) |

---

## 1. LA question : Solde tableau (−1 957,03) vs widget Régularisation (+2 137,00)

Les deux chiffres mesurent **deux choses différentes** :
- **Tableau** = flux de trésorerie réels : part charges des loyers **encaissés** (858,34) − charges
  récupérables **payées** (2 815,37), bornés aux **7 mois écoulés**, net signé toutes entrées confondues.
- **Widget** = créance de régularisation : par bail, charges réelles **réparties** (compteurs/direct/prorata)
  − provisions **dues** (mois de loyer encaissés × `ch` du bail), sur l'**année pleine**, en ne sommant
  **que les soldes positifs** (à récupérer), part bailleur retirée.

Causes d'écart identifiées (toutes CONFIRMÉES par code) :

| # | Cause | Statut | Réfs |
|---|---|---|---|
| C1 | Widget somme les positifs seulement (`if (solde > 0)`) ; tableau = net signé (trop-perçus inclus) | Légitime dans l'intention, **incompréhensible à l'écran** | index 48208 vs module:100 |
| C2 | Fenêtres : tableau borné mois écoulés ; widget année pleine (`_finRegulAFaire` appelé sans lastMonth) | **BUG de cohérence** (choix jamais affiché) | index 47270, 48187+ |
| C3 | Provisions : part CH **réellement encaissée** (prorata paiement partiel) vs **mois entier × ch dès 1 € de loyer** dans le mois (0 si impayé total) | Légitime (régul contractuelle) mais divergence mécanique avec 12 329,90 € d'impayés | 25488-25503 vs module:81 |
| C4 | `bail.ch` **ACTUEL** appliqué rétroactivement (révision en cours d'année réécrit le passé) vs `_finHcRatio` historisé (bail actif à la date) | **BUG** (méthodes contradictoires entre les 2 moteurs) | 25499 vs 47478-47488 |
| C5 | Avoirs/crédits sur charges récup : **nettés** dans le tableau (db−cr), **ignorés** par computeRegul (`m.db>0`, jamais de déduction des cr) | **BUG** — un avoir eau/énergie réduit le tableau, pas le widget | module:91 vs index 25542 |
| C6 | Part bailleur (vacance, `compteCharges:false`, lot sans bail) : **retirée** par computeRegul (non récupérable), mais **incluse** dans « Payées par toi pour eux » du tableau → le Solde présente de la part bailleur comme « à récupérer » | **BUG de libellé/concept** côté tableau | 25561-25587 vs module:72,91 |
| C7 | Périmètre entité : régul filtré par immeubles de l'entité (lots sans `imm` exclus) vs `_finScopeWeight` (SCI prorata) | **BUG** (périmètres non superposables) | 48201-48206 |

SAIN vérifié : les **ensembles de catégories matchent** (flag `recup` + 229/230 des deux côtés — index
4134-4147) ; la **TEOM** (part récupérable de la taxe foncière) est absente **des deux** moteurs (manque
commun, pas une cause d'écart — mais la vraie régul légale l'inclut → à traiter un jour).

**Conclusion** : les deux nombres ne peuvent PAS coïncider par construction. L'écart de 179,97 € est la
somme de C1-C7 sur ses données. Ni l'un ni l'autre n'est « faux » dans son référentiel — mais l'écran
présente deux « charges à récupérer » sans dire que ce sont deux concepts.

---

## 2. Bloc « Argent à récupérer » (audit ②, 24 constats)

### Critiques
1. **Total = somme de 4 unités hétérogènes** (vacance €YTD passé + impayé €YTD + IRL **€/an projeté** +
   régul solde d'exercice) sans l'annoncer — finances-summary.js:46-48. Le test unitaire grave ce mélange.
2. **Signes affichés incohérents avec le total** : en lisant l'écran (−4 424,77 + 12 329,90 + 0 + 2 137)
   on obtient **10 042,13**, pas 18 891,67. Le total = somme de valeurs absolues, jamais dit — index 48231-48238.
3. **La vacance passée n'est pas « récupérable »** (loyer non né ≠ créance) — conceptuellement hors sujet
   dans ce total.

### Impayé (12 329,90 € · « 14 locataires »)
4. `bail.hc` ACTUEL × tous les mois écoulés (pas d'historique → faux après révision IRL en cours d'année) — 47262-47264.
5. Mois inclusifs (+1) : tout mois entamé = mois entier dû ; **le mois courant est dû dès le 1er** →
   au 7 juillet, tout loyer de juillet pas encore encaissé est « impayé » plein — 47256, 47248.
6. Bases hétérogènes : attendu = lots avec bail courant ; encaissé = TOUS les 211 du périmètre (arriérés N-1,
   anciens locataires, recettes immeuble) → chaque euro « sans attendu en face » masque un impayé réel — 47259-47264 vs 47490+.
7. `Math.max(0, …)` appliqué au GLOBAL : les trop-payés des uns compensent les impayés des autres — 47266.
8. **Le COMPTE (14) et le MONTANT viennent de deux formules incompatibles** : compte = `_calculerLoyerImpayeCumule`
   (hc+ch, vie entière du bail, **tous les crédits du lot comptés comme loyer — un DG encaissé, une CAF,
   une indemnité effacent de l'impayé !**) ; montant = HC exercice net global — gestion-dg-impayes.js:116-131.
9. `scopedLogs` ne filtre ni `_deleted` ni `archived`, bail non testé `_isAlive` → lots supprimés = impayé
   fantôme structurel — 47244 (à comparer à 47207 qui filtre).

### Vacance (4 424,77 €)
10. SAIN sur la base : HC, borné à aujourd'hui, filtre immeuble appliqué — legal-bilan.js:30-34,64-81.
11. Double-compte partiel avec l'impayé sur les mois charnières (mois d'entrée/sortie compté plein en
    attendu + jours vacants du même mois en manque à gagner).
12. Lot jamais loué → vacance 0 (pas de loyer de référence) ; réf = dernier bail par ordre d'insertion, pas par date.
13. Lots sans entité : exclus de la vacance (itération par entités), inclus dans l'impayé → périmètres non superposables.

### IRL (« +0,00 €/an »)
14. Filtres entité/immeuble : SAIN — 48177.
15. **Cinq chemins produisent un 0,00 trompeur** (DPE manquant, **table IRL non à jour → TOUT le parc à 0**,
    pasEncoreApplicable, date bail manquante, anniversaire pas atteint) + `catch(e){}` silencieux →
    « 0,00 » se lit « tout est indexé » alors que ça peut vouloir dire « incalculable » — 48180-48181, 23469-23568.
16. IRL calcule sur `log.hc`, impayé sur `bail.hc` → si drift entre les deux champs, widgets contradictoires.

### Régul (2 137,00 €)
17. SAIN : périmètre entité aligné page Régul, borne année pleine cohérente avec la page, `regulImpact` =
    même nombre — 48187-48213, finances-summary.js:33.
18. **Trop-perçus (dette envers locataires) invisibles partout** : ni widget, ni résultat, ni total —
    résultat net legacy surestimé ; la page Régul affiche un net signé → surprise à la navigation — 48208-48209 vs 25672-25674.
19. Provisions reconstituées au `ch` actuel (cf C4).
20. `catch` → « +0,00 € » silencieux — 48212.
21. Lots sans immeuble exclus du régul en vue entité — 48201-48206.

### Navigation (règle d'or « chaque ligne t'envoie agir »)
22. **Le filtre immeuble (#fin-imm) ne suit sur AUCUNE des 4 destinations** (IRL, Régul, Quittances, Biens) —
    chaque page a son propre sélecteur jamais pré-rempli.
23. **Vacance → Biens : ni filtre entité, ni pré-filtre « vacant »** — la seule page qui ne suit même pas l'entité — 48232, 33335.
24. Impayé → Quittances filtre « impayée » = une **3e** source de vérité (statuts de quittances ≠ formule
    du montant ≠ formule du compte) — 10436-10442.

---

## 3. Tableau P&L + moteur mensuel (audit ① complété en session)

25. **[IMPORTANT · CONFIRMÉ] Ligne invisible dans le tableau v2** : le bucket `autres` (225/226 — indemnités
    éviction, autres charges déductibles) est compté dans « Total charges propriétaire » (module:98) mais
    n'a **AUCUNE ligne** dans ROWS (index 47635-47654) → la somme des lignes visibles ≠ total affiché.
26. **[IMPORTANT · CONFIRMÉ] Mouvements datés après le mois courant invisibles de l'exercice** (module:59
    `if (!b) return`) — dont **les intérêts d'emprunt créés par l'app elle-même au 31/12** (index 47938) :
    l'utilisateur saisit ses intérêts, la base 2044 reste « verrouillée » toute l'année, le chip réclame
    « renseigne tes intérêts » à tort.
27. **[IMPORTANT · CONFIRMÉ] Prêt payé sans mouvements « Prêt »** (compte non importé) : coût du crédit
    absent du réel ; et si intérêts saisis, `capital = 0 − intérêts` → **capital remboursé négatif** dans
    le chip Enrichissement (garde `capitalPret>=0` du legacy perdue en B4) — 47396-47398.
28. **[IMPORTANT · CONFIRMÉ] Drill incohérent avec lui-même** : total N inclut les crédits/avoirs
    (v15.398) mais le total N-1 de la MÊME modale les exclut (`if (!((m.db||0)>0)) return`) — 48026.
29. **[IMPORTANT · CONFIRMÉ] Ratio « Poids des charges » ≠ « Total charges » du tableau** sur le même
    écran (buckets année pleine sans prêt avec intérêts vs mensuel mois écoulés avec prêt entier sans
    intérêts) — aucune explication — 47441-47443 vs module:98.
30. **[IMPORTANT · CONFIRMÉ] Drill « Voir par logement » = 4e définition du cash-flow** (loyers CC + 213
    − charges 2044 avec 229, sans intérêts ni prêt), appelé par lot sans les charges immeuble ni le
    mapping utilisateur → ne réconcilie avec RIEN d'autre sur la page — 47857-47875, legal-bilan.js:57-78.
31. **[IMPORTANT · CONFIRMÉ] Mapping utilisateur (`DB.catMapping`) honoré par le P&L mais IGNORÉ par la
    2044/bilan** (aucun appel `_compute2044` ne passe `opts.mapping`) → une catégorie mappée compte dans
    Finances et tombe en « non mappés » dans la prévisu 2044 ouverte depuis la même page.
32. **[MINEUR · CONFIRMÉ]** Remboursements purs (cr sans db) : comptés par le moteur mensuel (net),
    ignorés par `_finChargeBuckets` (db>0) → ratios ≠ tableau dès qu'un avoir existe — 47512 vs module:85.
33. **[MINEUR · CONFIRMÉ]** Fenêtres summary (année civile pleine) vs tableau (mois écoulés) — divergence
    sur mouvements post-datés (cas réel : intérêts du 31/12 comptés dans le ratio, absents du tableau).
34. **[MINEUR · CONFIRMÉ]** Deux conventions de % d'évolution sur le même écran (hero : |N-1| ; tableau :
    « — » si N-1 ≤ 0 ; summary : 0 %) — 47400 vs 47675.
35. **[MINEUR · CONFIRMÉ]** Drills Accueil/Dashboard en BRUT (cr−db toutes catégories : cautions, DG,
    virements internes inclus ; intérêts double-comptés avec l'échéance) alors que les cartes sont nettes →
    le total de la modale ne retombe pas sur la carte cliquée — 12656-12664, 11349-11379.
36. **[MINEUR · CONFIRMÉ]** Libellé widget régul « déjà déduit du résultat net » périmé : en B4 le
    « résultat net » n'est plus affiché et le cash-flow ne déduit pas la régul — 48237.
37. **[MINEUR]** Clamp `provisions = max(0, …)` par mois : mois de remboursement de loyer → recupSolde
    localement faussé (centimes) — module:97. + arrondis mois sommés (centimes) — module:104-116.
38. **[INFO]** Deux définitions de « Cash-flow réel » dans le code (Enrichissement legacy = resultatNet −
    capital ; B4 = module) — le legacy est mort (`_finB4On()` = true en dur) mais bombe de régression si
    le flag redevient conditionnel. Écart algébrique = recettesDiverses + recupSolde + regulImpact.
39. **[INFO]** Commentaires faux (« recettes diverses exclues » alors qu'incluses — 9024, 11292) ;
    « Occupation » a 2 sémantiques inter-pages (instantané vs moyenne exercice).

---

## 4. Vérifié SAIN (à ne pas « corriger »)

- **Cohérence interne du tableau** avec les chiffres réels de l'écran : net + solde = réel ✓ (−1 363,78
  − 1 957,03 = −3 320,81) ; annual = Σ mois ; N-1 « même période » partout en B4.
- **Hero cash-flow = ligne du tableau** (même objet `_finMonthly`) ; « Comparer 2 mois » même moteur.
- **Source cash-flow unique Accueil / Tableau de bord / Finances** (`_dashCfReel` → `cashflowReel`) —
  l'exigence « je veux le cash flow partout » est tenue au niveau cartes ; seuls les drills divergent (35).
- **`_finHcRatio` historisé** (bail actif à la date du mouvement) pour la répartition HC/provisions.
- **Catégories récup alignées** tableau ↔ régul (flag recup + 229/230) ; gestionHF compté une seule fois.
- Vacance : base HC bornée à aujourd'hui, filtre immeuble ; widget IRL et régul : filtres entité/immeuble corrects.
- Pas de double compte de résultat rendu (`_finRenderPL` early-return vers v2).

---

## 5. Plan de correction proposé (à arbitrer)

**Lot 1 — dire la vérité à l'écran (XS-S, sans toucher aux calculs)** :
tuile Régularisation renommée + infobulle « régul contractuelle année pleine ≠ solde de trésorerie » ;
total « Argent à récupérer » : signes cohérents, IRL sortie du total (ou affichée à part en €/an),
vacance sortie du total « récupérable » ; libellé « déjà déduit du résultat net » corrigé ;
ligne « Autres charges propriétaire » ajoutée au tableau v2 (constat 25).

**Lot 2 — bugs de calcul purs (S-M)** :
intérêts 31/12 comptés dans l'exercice (26) ; garde capital ≥ 0 (27) ; drill N-1 aligné N (28) ;
tombstones filtrés dans l'impayé (9) ; avoirs déduits du régul (C5) ; `Math.max(0)` par locataire (7).

**Lot 3 — refonte des définitions (M-L, session dédiée)** :
UNE formule par concept (impayé : compte ET montant depuis la même base — le futur « Suivi des loyers »
est le bon candidat) ; IRL : distinguer « 0 = à jour » de « 0 = incalculable » ; navigation porteuse du
périmètre (22-24) ; historisation `ch`/`hc` (C4/4) ; mapping utilisateur passé à la 2044 (31).

**Références sessions** : cash-flow partout = v15.388-407 ; ce doc = état v15.423.
