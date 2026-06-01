# IMPORT-ACTE-VENTE — Création bailleur / immeuble / logements depuis l'acte de vente

**Statut** : ⬜ Idée à scoper — **EN ATTENTE d'exemples d'actes réels** (2-3) pour trancher l'architecture.
**Prio** : P2 (onboarding / accélérateur d'acquisition SaaS)
**Taille** : XL (session dédiée, découpage par phases obligatoire)
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

## Journal

- **2026-06-01** — Sujet créé suite demande user dans le fil MODALE-LOGEMENT-CONSOLIDATION (après livraison B2 v2-c1). Feasibilité confirmée *sur le principe* (même famille que B2 v2-c1), mais bloqué sur arbitrage A/B faute d'exemples. En attente des actes pour vérification empirique.
