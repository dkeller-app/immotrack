# IMPORT-ACTE-VENTE — Création bailleur / immeuble / logements depuis l'acte de vente

**Statut** : 🔎 **Analysé empiriquement (4 actes réels, 2026-06-01)** — **VERDICT : voie A (heuristique locale) viable** pour entité+immeuble (haute fiabilité) + logements en liste « suggérée » éditable (fiabilité moyenne, validation user). Prêt à brainstormer le wizard. ⬜ Pas encore codé.
**Prio** : P2 (onboarding / accélérateur d'acquisition SaaS)
**Taille** : L (révisée depuis XL après analyse — voie A sans backend ; session dédiée, découpage par phases)
**Créé** : 2026-06-01 (demande user, fil MODALE-LOGEMENT-CONSOLIDATION après livraison B2 v2-c1)

---

## Contexte / demande user (verbatim)

> « dans le même style est-il possible de créer (bailleur - immeuble - logements) à partir de
> l'acte de vente (l'acheteur est défini : à grouper si déjà existant) et on a les infos sur
> l'immeuble (adresse, année de construction) et normalement on a la constitution de l'immeuble.
> je peux te donner 2 ou 3 exemples d'acte de vente »

« Dans le même style » = reprend le pattern livré en **B2 v2-c1** (dépôt PDF → pdf.js lit le
texte → extraction → pré-remplissage « suggéré · à vérifier », jamais d'écriture aveugle).

## Cible

- **Onboarding d'un parc** : un bailleur qui arrive sur ImmoTrack avec ses actes de vente peut
  créer/peupler entité + immeuble + logements en un dépôt, au lieu de tout saisir à la main.
- **Acquisition** : différenciant fort pour la version SaaS commerciale (réduction drastique du
  temps de mise en route — frein n°1 à l'adoption d'un outil de gestion).

## Mapping cible (acte de vente → modèle de données ImmoTrack)

| Donnée acte | Cible ImmoTrack | Règle |
|---|---|---|
| **Acquéreur / acheteur** (personne ou société) | **Entité bailleur** | Matching par **nom / SIREN** → *rattacher* si déjà existant, sinon **créer**. « À grouper si déjà existant » = ne pas dupliquer une entité existante. |
| **Désignation du bien : adresse** | Immeuble.adr / codePostal / ville | |
| **Année de construction** (si mentionnée) | Immeuble.anneeConstruction | sert aussi à l'auto-détection diagnostics (cf B3) |
| **État descriptif de division (EDD) / désignation des lots** | **Logements** (1 par lot) | n° de lot, étage, type/nature (appartement/cave/parking/local), tantièmes, surface si dispo |

UX cible : **wizard d'import** → dépôt acte → écran de **validation** champ par champ
(« ✨ suggéré · à vérifier », rien d'écrit sans confirmation) → création/rattachement entité +
immeuble + N logements en un lot. Respecte « choix prédéfini + ajout libre » (l'utilisateur peut
corriger/compléter tout champ avant validation).

## ⚠️ Le verrou : pas de format standard

Le n° DPE (B2 v2-c1) marchait car **format national strict** (`\d{4}[A-Z]\d{7}[A-Z]`) → regex 100 % fiable.

Un **acte notarié est du texte libre** : pas de balise normalisée pour l'identité acquéreur, la
désignation, ni l'EDD. La structure **varie selon le notaire**. La fiabilité de l'extraction n'est
PAS garantie a priori → **doit être vérifiée empiriquement sur de vrais actes** (comme l'API ADEME
a été vérifiée au curl avant de coder B2 v2-b). D'où la demande d'exemples.

## Arbitrage d'architecture (à trancher APRÈS lecture des exemples)

| | **A. Heuristique locale** (regex + ancres de mots-clés) | **B. Extraction LLM** |
|---|---|---|
| Archi | 100 % statique, **pas de backend** (cohérent app) | **appel API** requis (clé client OU mini-backend) |
| Fiabilité texte libre | **fragile** — varie selon le notaire | **forte** — robuste au texte libre |
| Coût | gratuit | coût/appel → s'inscrit comme **feature SaaS payante** |
| RGPD | données restent locales | acte → tiers : à cadrer (registre RGPD existant) |
| Effort | M-L (mappers + wizard) | L-XL (intégration LLM + prompt + garde-fous + fallback) |

Décision A vs B = **dépend de la régularité observée sur les exemples**. Si les formulations sont
assez régulières → A peut suffire (gratuit, dans l'esprit de l'app). Sinon c'est fondamentalement
du terrain LLM (B) → cohérent avec roadmap IA (cf IA-COPILOTE, OCR-FACTURE V3).

## Discipline (rappels gravés à appliquer quand on codera)

- **Sandbox-first** : tout d'abord `index-test.html`, prod après « OK » explicite.
- **Mockup-first** : wizard d'import + écran de validation maquettés (PC/tablette/tél + tous post-clics) AVANT code.
- **Pas d'écriture aveugle** : tout champ extrait = « suggéré · à vérifier », validation user obligatoire avant création.
- **Audit agent `superpowers:code-reviewer`** : sensible (création multi-entités + matching anti-doublon + lecture PDF) → audit obligatoire avant test.
- **« Pas de solution passable »** : si l'extraction n'est pas fiable, on ne livre pas un truc bricolé — soit on fait robuste (LLM), soit on assume A en présentant clairement le caractère « suggéré » + correction facile.
- **Réutiliser l'existant** : `_ensurePdfjsLoaded` / `_logDiagExtractPdfText` (B2 v2-c1), infra entité/immeuble/logement, matching entité (nom/SIREN), wizard de création séquentiel (cf WIZARD-CREATION-SEQUENTIEL).

## Sujets liés

- **B2 v2-c1** (livré v15.237) — pattern dépôt PDF → pdf.js → extraction → pré-remplissage.
- **IMPORT-EXCEL-LOG** (P2) — import logements/locataires depuis Excel (onboarding voisin).
- **IMPORT-CONCURRENTS** (P2) — migration depuis Rentila/BailFacile/Qalimo.
- **OCR-FACTURE** (V3 #1) — extraction auto montant/date depuis PDF/photo (même famille extraction).
- **IA-COPILOTE** (P2) — module IA souverain browser (si voie B locale via WebLLM).
- **WIZARD-CREATION-SEQUENTIEL** — wizard création entité→immeuble→logement (réutilisable pour l'écran de validation).

## Prochaine étape

1. **User fournit 2-3 exemples d'actes** (structure réelle ; noms anonymisables — c'est la mise en page/formulation qui compte).
2. Claude analyse la régularité → **verdict A vs B** honnête + estimation d'effort.
3. Si on attaque → brainstorming dédié (design wizard + mockups) puis plan phasé.

## Analyse empirique des 4 actes (2026-06-01)

**Corpus** : 4 actes de vente réels (`C:\Users\Did_K\Desktop\Immo\actes\`, non commités, dans `.gitignore`), 2 études notariales différentes (Me PICHELIN/Delle + concours Me OCHS/Strasbourg ; Me BRAUN-LEYENBERGER/Saverne). **Tous des PDF texte** (pas scannés), 98 k–175 k caractères, extraits via pdf.js (vérif au `pdftotext -enc UTF-8`).

**Constat clé : forte régularité car les notaires utilisent un MODÈLE D'ACTE NORMALISÉ** (logiciels type GenApi/iNot/Fiducial). Les ancres structurelles sont quasi identiques d'une étude à l'autre.

| Donnée | Ancre observée | Régularité | Extraction A (heuristique) |
|---|---|---|---|
| **Acquéreur (identité)** | `IDENTIFICATION DES PARTIES` → `2) Acquéreur`/`2) ACQUEREUR` … bloc clos par `Ci-après dénommé(e) "L'ACQUEREUR"` | **forte** | ✅ Fiable. Personne : `Monsieur/Madame [Prénoms] [NOM], … demeurant à [VILLE] ([CP]), [adresse]`. Société : `La société dénommée "[NOM]", [forme] au capital de … siège social à [VILLE] ([CP]), [adresse]`. Détection personne↔société via `Monsieur/Madame` vs `La société dénommée`. |
| **SIREN (si société)** | `numéro unique d'identification 994 086 379` | **forte** | ✅ Très fiable : `numéro unique d'identification (\d{3} \d{3} \d{3})` → **clé d'anti-doublon entité idéale** (« à grouper si déjà existant »). |
| **Adresse immeuble** | `DESIGNATION DES BIENS` → `situé/Situé à [VILLE] ([CP]), [adresse]` | **forte** | ✅ Fiable : `situ[ée] à ([A-ZÉÈ…\- ]+) \((\d{5})\), ([^.]+)`. |
| **Année de construction** | — | **ABSENTE** | ❌ **N'existe dans AUCUN des 4 actes.** Seulement des formules vagues (`achevé depuis plus de dix ans`, `permis de construire délivré avant le 1er juillet 1997` pour l'amiante). → ne PAS tenter de l'extraire de l'acte ; vient du DPE (cf B2 v2-b ADEME). |
| **Constitution / logements** | `DESIGNATION DES BIENS` (lots OU prose) | **moyenne — 2 familles** | ⚠️ Brouillon « suggéré » seulement (voir ci-dessous). |

**Le point dur = la constitution de l'immeuble (2 structures distinctes + lots ≠ logements) :**
- **Copropriété** (actes 1 & 2) : `Lot numéro cinq (5) - Une chambre Et les 10/1.000 èmes…` (n° lot + désignation + tantièmes). **Pièges** : (a) lots ≠ logements — ex. lots 5+6 (« Une chambre » chacun) **réunis** en un seul appartement F2 (`Réunion de lots`) ; (b) lots non-habitation mêlés (caves, garages) ; (c) la VRAIE désignation du logement est en prose ailleurs (`un appartement de type F2, à droite, comprenant : hall, kitchenette, séjour…`) ; (d) surface Carrez par lot (`Lot numéro 5 et 6 : 34,79 m²`).
- **Immeuble entier** (actes 3 & 4) : énumération propre en prose : `comprenant un local à usage commercial et CINQ (5) logements` + `• Au rez-de-chaussée : un appartement • Au 1er étage à droite : un appartement • Au 2ème étage : un appartement…`. Surface **totale** seulement (`surface habitable totale 433,18 m²`), pas par logement.

## VERDICT A vs B (tranché)

**→ Voie A (heuristique locale) RETENUE**, contre la crainte initiale du doc. Justification empirique :
- La normalisation des actes notariaux rend **entité (nom + SIREN + adresse siège) et immeuble (adresse/CP/ville) hautement fiables** en regex/ancres — pas besoin de LLM.
- Les **logements** sont le maillon imparfait, mais la discipline de l'app l'absorbe : on présente une **liste de logements « ✨ suggéré · à vérifier » entièrement éditable** (count + étage + type + surface si dispo), l'utilisateur corrige/fusionne/supprime/ajoute (« choix prédéfini + ajout libre »). Aucune écriture aveugle. Un brouillon imparfait + validation > saisie 100 % manuelle.
- **Cohérent app** : 100 % statique, **pas de backend**, gratuit, **RGPD-clean** (l'acte ne quitte jamais le navigateur), réutilise l'infra B2 v2-c1 (`_ensurePdfjsLoaded`, `_logDiagExtractPdfText`, attachments) + matching entité existant.
- **B (LLM)** reste un upgrade « premium SaaS » futur SI le retour onboarding montre que le brouillon logements est trop grossier — pas nécessaire pour livrer une V1 utile.

**Garde-fous obligatoires pour A** (sinon « solution passable ») :
1. Échantillon = 4 actes / 2 études **utilisant le même type de logiciel** → petit. D'autres notaires / actes anciens peuvent différer. A doit être **défensif** : ancre introuvable → champ vide, jamais de crash, jamais de blocage, l'user complète à la main.
2. Acte scanné (PDF image) → pas de texte → échec gracieux (toast « saisie manuelle », comme c1). Les 4 ici sont des PDF texte (cas courant des copies notariales modernes).
3. Tout reste « suggéré · à vérifier » jusqu'à validation explicite ; matching entité par **SIREN d'abord**, puis nom (fuzzy) en secours.

**Estimation effort (voie A)** : **L** — mappers d'extraction (entité/SIREN/adresse + brouillon logements 2 structures) = M ; wizard import + écran de validation champ-par-champ + création/rattachement séquentiel = L. 1 session dédiée, phasée, mockup-first + audit code-reviewer (création multi-entités + anti-doublon = sensible).

## Journal

- **2026-06-01** — Sujet créé suite demande user dans le fil MODALE-LOGEMENT-CONSOLIDATION (après livraison B2 v2-c1). Feasibilité confirmée *sur le principe* (même famille que B2 v2-c1), mais bloqué sur arbitrage A/B faute d'exemples.
- **2026-06-01** — User a fourni **4 actes réels** (2 études). Analyse empirique faite (extraction texte + relevé d'ancres). **Verdict : voie A (heuristique locale) viable** — entité+immeuble fiables, logements en brouillon « suggéré » éditable ; année de construction absente des actes (→ DPE). Effort révisé XL→L. Prochaine étape : brainstorming dédié (design wizard + mockups) quand l'user veut attaquer.
