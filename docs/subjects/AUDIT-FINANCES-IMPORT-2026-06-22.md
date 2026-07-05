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
| B3 | **Vacance locative** : passé ou projeté ? En Finances on ne doit prendre que la période **passée** de l'exercice. | 🐞 | ✅ v15.358 (occupation / vacance / manque-à-gagner bornés aux mois ÉCOULÉS pour l'exercice en cours, dans `_computeBilanAnnuel` via `occTo` ; `opts.today` injectable pour tests ; le fiscal/mouvements garde l'année pleine `[from, déc31]` ; 10/10 tests `legal-bilan` verts) |
| B4 | **Visu 12 mois glissants** (cash-flow) — nouvelle visualisation à concevoir. | ✨ | 🔄 **Mockup validé v12** (`mockup-b4-pl-mensuel.html`) → pas un graphique mais un **sous-P&L mensuel** déployable (3 panneaux : Année figée gauche · mois défilants au milieu avec barre · 2025 même période + Var figés droite). **Prêt entier en charge** (1 ligne « Prêt » = capital+intérêts, résultat « réel après prêt ») + **base 2044 conditionnelle** (grisée + CTA si intérêts non renseignés). Spec : `docs/superpowers/specs/2026-06-25-b4-sous-pl-mensuel-design.md`. **Build sandbox-first à lancer** (couche données TDD → annuel → composant → câblage + audit code-reviewer fiscal). |
| B5 | **Année en cours par défaut** partout (sélecteur d'exercice). | 🐞/✨ | ✅ v15.354 (Finances : défaut = année en cours + bandeau « chiffres partiels ») |
| B6 | **SCI à plusieurs immeubles** : pouvoir filtrer sur **un seul immeuble**. | ✨ | ✅ v15.355 (sélecteur immeuble dans Finances ; loyers / charges / impayé / occupation / régul / IRL scopés par immeuble ; **frais SCI répartis ÷ nb immeubles** du bailleur, 1 immeuble → ÷1 ; vérifié : résultats par immeuble = total entité, charges SCI 1000 → 500/500 sur 2 immeubles) |
| B7 | Drill « Répartition par bien » : non ventilé (gérance) isolé + actionnable. | ✨ | ✅ v15.338 |

## C. Mouvements / Prêt

| # | Item | Type | Statut |
|---|------|------|--------|
| C1 | **Mouvements récurrents** (saisie manuelle) + warning « ce mouvement sera récurrent, ne pas réimporter le même ». | ✨ | ⬜ |
| C2 | **Import des tableaux d'amortissement** de prêt. | ✨ | ⬜ |
| C3 | **Drill-down d'une ligne du P&L moche** → blocs mensuels + séparateurs. | ✨ UX | ✅ **v15.398** (refonte drill : blocs par mois, sous-total, séparateurs, crédits en vert) |
| C4 | **Comparer 2 mois** (diagnostic hausse de charges). | ✨ | ✅ **v15.413 (mockup A validé)** — bouton « ⇄ Comparer 2 mois » → tableau poste × A × B × écart + cause n°1 + 2 sélecteurs + post-clic drill mois. DRY (`_finMonthly().months` + drill mois-scopé). Reste polish : post-clic côte-à-côte des 2 mois (écran B du mockup). |
| C5 | **Clic sur une case de mois → drill de CE mois** (pas l'année). | ✨ | ✅ **v15.398** (param `mo` sur `_finDrillLigne`) |
| C6 | **Drill sur les charges récupérables** (provisions encaissées / récup déboursées). | ✨ | ✅ **v15.398** (kinds `provisions`/`recup`) |
| C7 | **Note « mvt SCI réparti sur N immeubles »** en vue immeuble (quote-part). | ✨ | ✅ **v15.398** |
| C8 | **Ligne Prêt : remboursement (crédit) ignoré** dans le drill (« tu ne prends que le négatif »). | ⚖️🐞 | ✅ **v15.397** (drill inclut les crédits → total drill = total ligne) |

## F. AUDIT CORRECTNESS FINANCES (retour user 2026-07-02 — « j'ai peur pour tout le reste »)

| # | Item | Type | Statut |
|---|------|------|--------|
| F1a | ✅ **v15.402** — ratio du bail ACTIF du mois (bloc `_bailActifAt` rappelle `_getAllBailsForLog`, DRY). Reste F1b (versements groupés non rattachés) + F1c (bail sans `ch`). **Part charges (provisions) FAUSSE** — `_finHcRatio`=hc/(hc+ch) du bail COURANT. Bugs suspectés : bail courant sur mois passés (changement locataire), versement gérance groupé → ratio 1 → provisions=0, bail sans `ch` → part perdue. | ⚖️🐞 | 🔄 **audit agent en cours** |
| F2 | ✅ **v15.401** — recettes 213 (parking/GLI/indemnités) comptées en revenus + cash-flow + base 2044 (aligné `_compute2044`). **Revenus = loyers seulement** alors que 3 catégories recette (211 + 213 GLI + 213 recettes diverses). Le moteur fait `if(l==='213') return` → recettes diverses IGNORÉES (or 213 imposable en 2044). | ⚖️🐞 | 🔄 **audit** |
| F3 | **Audit EXHAUSTIF** : chaque catégorie STD × son traitement (comptée/droppée). « je veux que TOUS les mouvements possibles soient présents ». | ⚖️ | 🔄 **audit agent en cours** |
| F4 | **Prorata entrée/sortie en cours de mois** — déjà dans le code (`_getActiveBailHcChProrated`), ne pas tout recommencer ; vérifier que le split HC/charges en tient compte. | ⚖️ | 🔄 **audit** |

## G. IMPORT (retour user 2026-07-02)

| # | Item | Type | Statut |
|---|------|------|--------|
| G1 | ✅ **v15.407** — picker scopé au bailleur actif à défaut du scope compte (+ échappatoire « voir tout »). **Import : liste COMPLÈTE des logements** proposée même quand un **compte bailleur** est déjà sélectionné → scoper l'affectation au bailleur du compte. | 🐞 UX | ⬜ |
| G2 | ✅ **v15.404** — `_bankDedup` stratégie 3 : relevé découpé détecté = somme des parts du jour. **Doublons NON détectés** alors que les lignes sont **identiques** — dédup import trop stricte/cassée. | 🐞 | ⬜ **à diagnostiquer** |
| G3 | ⬜ **repro demandé** (dans le code : split appliqué + ligne reste ouverte + badge « Découpé » — symptôme à préciser). **Découpage** : la case « découpé » ne reste pas cochée après split (mais le découpage EST pris en compte) — état UI. | 🐞 UX | ⬜ |

## H. SUIVI LOYERS (retour user 2026-07-02)

| # | Item | Type | Statut |
|---|------|------|--------|
| H1 | Afficher si les locataires sont en **retard** ET en **AVANCE** de paiement. | ✨ | ✅ **v15.408/410 (mockup-first)** — « Suivi des loyers » : bande 12 mois par locataire (payé/partiel/retard/avance/à venir) + solde courant + détail échéancier + drill paiements/mois. `_suiviLoyerStrip` (allocation chronologique, brique prorata réutilisée). |

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
- **2026-06-30** : ✅ **B4 charges récupérables + cash-flow réel/net DÉPLOYÉ PROD v15.388** (audit agent code-reviewer **PASSANT** : base 2044 inchangée, pas de double-compte recup, héro↔tableau cohérents). Le P&L sépare charges propriétaire / charges récupérables (provisions locataires − récup avancées = solde signé) → **Cash-flow réel** (= résultat propre + solde) et **Cash-flow net** (= résultat propre). `recup` capte copro (229/230) + eau/énergie direct (flag `recup:true` via `isRecupCharge`). Héro aligné sur `cashflowReel` (ancien pont `reel − régul` retiré). 11 tests verts. **Nouveaux items capturés C3/C4** (drill-down : blocs mensuels + comparaison 2 mois — pour après, mockup-first).
- **Restent en attente** (non démarrés) : B1 (enrichissement ⚖️), B2 (impayés 360k ⚖️), C1 (mvts récurrents), C2 (import amortissement), **C3 (drill blocs mensuels), C4 (drill comparaison 2 mois)**, D2 (calcul compteur), E1/E2 (bail — autre session).
