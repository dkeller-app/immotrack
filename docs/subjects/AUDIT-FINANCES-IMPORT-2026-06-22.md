# Audit utilisateur — Finances / Import / Loyers (2026-06-22)

Liste capturée en session. **🐞 = bug** · **✨ = feature/UX** · **⚖️ = fiscal (prioritaire)**.
Légende statut : ⬜ à faire · 🔄 en cours · ✅ livré.

## A. Import bancaire (onglet Loyers → Importer banque)

| # | Item | Type | Statut |
|---|------|------|--------|
| A1 | Reconnaître qu'une ligne a été **scindée** (split) → ne pas la re-proposer à l'import. Dédup sur la ligne source d'un split. | 🐞 | ✅ déjà OK (empreinte stockée sur part 0 du split → dédup au ré-import ; vérifié) |
| A2 | Pouvoir **supprimer une ligne** dans l'aperçu d'import. | ✨ | ✅ v15.339 (🗑 + `_userExclude` + footer rétablir) |
| A3 | Pouvoir **renommer le libellé** d'une ligne d'import. | ✨ | ✅ v15.339 (champ Libellé éditable → `_bankRenameLine`) |
| A4 | **Bouton « Valider »** explicite — pas d'import à l'aveugle. | ✨ UX | ✅ v15.340 (« Valider et importer » gaté par revue) |
| A5 | **Ne pas classer en « Reconnus » sans affectation** (ex prêt sans immeuble). | 🐞 | ✅ v15.340 (special-avec-niv exige une cible) |
| A6 | **Expliquer** : à compléter → reconnus. | ✨ UX | ✅ v15.340 (note dans l'onglet + revue forcée A7) |
| A7 | **Bloquer l'import** tant que les Reconnus n'ont pas été vérifiés (scroll bas). | ✨ | ✅ v15.340 (`_bankReviewedOk` + scroll-to-bottom) |
| A8 | **Aperçu 2044 de fin d'import** : additionne au lieu de soustraire. | ⚖️🐞 | ✅ déjà correct (formule `recettes − charges − intérêts` depuis v15.323 ; test live 58,48 €) |
| A9 | **Règles d'import** : couple **compte + intitulé**. | 🐞 | ✅ v15.341 (colonne Compte + condition matcher) |
| A10 | **Connexion bancaire en DIRECT via API** (sync auto des comptes au lieu du CSV manuel). Demandé 2026-06-24. | ✨ XL | ⬜ = **BANK-INTEGRATION V2** — déjà étudié (Saltedge MVP → Bridge/Powens). **Nécessite un BACKEND** (OAuth DSP2 + chiffrement tokens, impossible en offline-first), agrément AISP via prestataire, ~50h dev + **coût récurrent 30–280 €/mois**, lié à la commercialisation. Voir `docs/subjects/BANK-INTEGRATION.md`. |

**→ Import CSV/OFX (A1–A9) traité + UX « compléter pas à pas » livrée v15.351. A10 = chantier V2 backend, séparé.**

## B. Finances (reporting / 2044 / dashboard)

| # | Item | Type | Statut |
|---|------|------|--------|
| B1 | **Calcul d'enrichissement FAUX** : ajoute le capital amorti alors qu'il n'a pas été retiré du P&L → grosse différence Finances (22 916 €) vs Dashboard (37 154 €). | ⚖️🐞 | ✅ en prod & vérifié (carte « Enrichissement réel » : cash-flow réel = résultat net − capital ; enrichissement = résultat net, SANS double-compte ; `resultatNet = loyersHC − charges − régul`). À confirmer visuellement sur données réelles. |
| B2 | **360 k€ de loyers impayés** affichés dans « Argent à récupérer » → manifestement faux (cumul sur toute la durée des baux ?). | ⚖️🐞 | ✅ v15.354 (KPI Finances impayé = exercice, **mois ÉCOULÉS seulement**, agrégé → neutralise gérance non ventilée ; le cumul vie-entière reste réservé au DG + page « Impayés actifs ») |
| B3 | **Vacance locative** : passé ou projeté ? En Finances on ne doit prendre que la période **passée** de l'exercice. | 🐞 | ⬜ (même principe que B2 — à appliquer à la vacance) |
| B4 | **Visu 12 mois glissants** (cash-flow) — nouvelle visualisation à concevoir. | ✨ | ⬜ |
| B5 | **Année en cours par défaut** partout (sélecteur d'exercice). | 🐞/✨ | ✅ v15.354 (Finances : défaut = année en cours + bandeau « chiffres partiels ») |
| B6 | **SCI à plusieurs immeubles** : pouvoir filtrer sur **un seul immeuble**. | ✨ | ✅ v15.355 (sélecteur immeuble dans Finances ; loyers / charges / impayé / occupation / régul / IRL scopés par immeuble ; **frais SCI répartis ÷ nb immeubles** du bailleur, 1 immeuble → ÷1 ; vérifié : résultats par immeuble = total entité, charges SCI 1000 → 500/500 sur 2 immeubles) |
| B7 | Drill « Répartition par bien » : non ventilé (gérance) isolé + actionnable. | ✨ | ✅ v15.338 |

## C. Mouvements / Prêt

| # | Item | Type | Statut |
|---|------|------|--------|
| C1 | **Mouvements récurrents** (saisie manuelle) + warning « ce mouvement sera récurrent, ne pas réimporter le même ». | ✨ | ⬜ |
| C2 | **Import des tableaux d'amortissement** de prêt. | ✨ | ⬜ |

## D. Compteurs / Charges récupérables

| # | Item | Type | Statut |
|---|------|------|--------|
| D1 | Compteur **Ferrette - 101** impossible à supprimer ni modifier. | 🐞 | ✅ v15.357 (cause : id entité/immeuble **manquant, non-numérique ou DUPLIQUÉ** → `_findImm` (lookup `+id`) échoue silencieusement → TOUS les boutons compteur de cet immeuble morts. Fix : migration `_ensureEntImmIds` au chargement = backfill d'ids numériques uniques par entité, idempotent) |
| D2 | Compteurs : permettre un **calcul** (compteur général − sous-compteur = conso d'un logement). | ✨ | ⬜ |

## E. HORS finance/loyers → AUTRE SESSION

| # | Item | Domaine |
|---|------|---------|
| E1 | **Dépôt de garantie augmente lors d'une révision IRL** → supprimer la règle de remplissage auto de la case DG (le DG ne doit jamais bouger seul). | Logement / Bail (borderline IRL) |
| E2 | **Bail échu alors que renouvelé tacitement** → apparaît vacant. La tacite reconduction ne se fait-elle qu'une fois ? Revoir la logique de statut (échu / tacite / vacant). | Bail |

## Journal
- **2026-06-24** : ✅ **Import « compléter pas à pas » livré PROD v15.351** (au-delà de A1–A9). Fenêtre « Renseigner ce mouvement » au design v2 natif (segmenté Affecter/Découper, cartes niveau + badge destination 2044, libellé sans-serif) + parcours pas-à-pas (compteur N/total, barre de progression, Valider→suivant gaté par complétude cat+bien, Précédent/Passer, écran de fin actionnable : reprendre à compléter / vérifier reconnus NON-confirmés / importer). Liste + récap restylés v2, bloc d'affectation PARTAGÉ `_affZone` élevé (cartes + `_affDestBadge` display-only, bénéficie aussi au formulaire mouvement/règles/split), « Mémoriser la règle » dans le pied. **Audit agent code-reviewer = PROD OK** (chemin d'écriture fiscal `_bankImportConfirm` byte-identique → 2044 inchangée). Mockups validés : `mockup-import-window-v2.html`, `mockup-import-stepbystep.html`.
- **Restent en attente** (non démarrés) : B1 (enrichissement ⚖️), B2 (impayés 360k ⚖️), B3 (vacance passé/projeté), B4 (visu 12 mois), B5 (année en cours défaut), B6 (filtre 1 immeuble), C1 (mvts récurrents), C2 (import amortissement), D1 (compteur Ferrette-101), D2 (calcul compteur), E1/E2 (bail — autre session).
