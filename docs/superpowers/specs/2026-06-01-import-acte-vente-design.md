# Design — IMPORT-ACTE-VENTE : créer bailleur / immeuble / logements depuis l'acte de vente

**Date** : 2026-06-01
**Sujet backlog** : `docs/subjects/IMPORT-ACTE-VENTE.md` (étude empirique 4 actes réels — verdict voie A)
**Mockup validé** : `mockups/import-acte-vente/index.html` (variante B + annexes triple-mode, validé user 2026-06-01)
**Prio** : P2 · **Taille** : L · **Statut** : design validé, prêt pour plan d'implémentation

---

## 1. Objectif

Permettre à un bailleur de **déposer un acte de vente PDF** et d'en pré-remplir, en un seul parcours guidé :
- son **entité bailleur** (acquéreur de l'acte) — rattachée si déjà existante, créée sinon ;
- l'**immeuble** acheté (adresse) ;
- les **logements** qui le composent (interprétés depuis l'EDD / la désignation) ;
- les **annexes** (cave, parking…) soit rattachées à un logement, soit transformées en bien à louer indépendant.

Rien n'est écrit en base sans validation explicite : chaque champ est `✨ suggéré · à vérifier`.

**Cible** : onboarding d'un parc (réduire le frein n°1 à l'adoption = temps de saisie initial) + différenciant SaaS commercial.

---

## 2. Décisions verrouillées

| # | Décision | Justification |
|---|---|---|
| **D1** | **Voie A — heuristique locale** (regex + ancres de mots-clés). Pas de LLM, pas de backend. | Étude empirique 4 actes / 2 études : actes notariaux normalisés → entité+immeuble hautement fiables en regex. RGPD-clean (l'acte ne quitte jamais le navigateur). Gratuit. Cohérent avec l'app statique. |
| **D2** | **Périmètre = 3 niveaux d'un coup** (entité + immeuble + logements), pas étape par étape isolée. | Réponse user Q1. C'est l'intérêt même de l'import : tout en un dépôt. |
| **D3** | **Anti-doublon = toujours proposer, jamais auto-fusionner.** | Réponse user Q2. Match SIREN d'abord, nom fuzzy en secours → on **suggère** le rattachement, l'user confirme. |
| **D4** | **Logements = représentation interprétée (variante B)** : l'app regroupe les lots en logements et affiche une mention de vérification (« 🤖 L'app a regroupé les lots 5+6… vérifie »). | Choix user sur mockup : « l'utilisateur sait ce qu'il a acheté ». Brouillon interprété + correction facile > liste brute de lots illisible. |
| **D5** | **Annexes = triple mode par annexe** : 🔗 rattacher à un logement · 🏷 bien à louer indépendant · ✕ ignorer. | Demande user explicite. Une cave se rattache ; un garage/parking peut devenir un bien locatif autonome (avec son propre bail). |
| **D6** | **Année de construction NON extraite de l'acte** (absente des 4 actes). | Empirique : aucun acte ne la mentionne. Elle viendra du DPE (cf B2 v2-b ADEME). Le champ reste vide, à compléter. |

---

## 3. Parcours UX (wizard — validé en mockup)

Stepper 3 étapes : **1 Dépôt → 2 Vérification → 3 Création**.

```
[1] DÉPÔT
    Zone drag&drop PDF (réutilise le pattern attachments B2 v2-c1).
    → pdf.js lit le texte localement.
    PDF scanné / sans texte → échec gracieux (toast « acte non lisible, saisie manuelle »).

[2] EXTRACTION (loading) → VÉRIFICATION
    Écran de validation en 4 blocs, tous en « ✨ suggéré · à vérifier » (ambre) :

    ┌─ BAILLEUR (entité) ───────────────────────────────
    │  SCI DK PATRIMOINE · SIREN 994 086 379
    │  [⚠ anti-doublon] « Une entité avec ce SIREN existe déjà »
    │  → [🔗 Rattacher à l'existante] (défaut) / [➕ Créer quand même]
    │  phrase source de l'acte affichée
    ├─ IMMEUBLE ────────────────────────────────────────
    │  12 rue des Tonneliers · 67000 Strasbourg  (✚ nouveau)
    │  Année de construction : (vide — à compléter via DPE)
    ├─ LOGEMENTS (interprété) ──────────────────────────
    │  ▸ Appartement F2 — lots 5+6 réunis · 34,79 m² · étage 2
    │    🤖 « L'app a regroupé les lots 5+6 en un seul logement.
    │       Vérifie ce regroupement. »  [✏️ modifier le regroupement]
    │    phrase source affichée
    ├─ ANNEXES (triple mode, 1 sélecteur par annexe) ───
    │  ▸ Cave (lot 12)      [🔗 Rattacher▼] [🏷 Bien à louer] [✕ Ignorer]
    │       défaut = rattacher → choix du logement parent
    │  ▸ Parking (lot 24)   [🔗 Rattacher] [🏷 Bien à louer▼] [✕ Ignorer]
    │       défaut = bien à louer → « deviendra un bien louable indépendant »
    └────────────────────────────────────────────────────
    [Tout valider]  [Effacer tout]   (boutons par champ : ✓ / ✗)

[3] RÉCAP → CRÉATION → SUCCÈS
    Récapitulatif avant écriture :
      SCI DK PATRIMOINE        🔗 rattaché (existant)
      12 rue des Tonneliers    ✚ nouvel immeuble
      Appartement F2           ✚ nouveau logement
        ↳ 🔗 1 cave (lot 12) rattachée
      Emplacement stationnement 🏷 bien à louer (nouveau bien)
    [Confirmer la création]  → écriture séquentielle → 🎉 succès
```

**3 formats** : PC (modale centrée), tablette, téléphone (bottom-sheet). Validé sur mockup.
**Post-clics validés** : overlay anti-doublon, overlay « modifier le regroupement », sélecteur d'annexe (3 états), ajout libre d'un logement.

---

## 4. Architecture technique (voie A)

100 % statique, dans `index-test.html` puis `index.html`. Aucun backend, aucun appel réseau (sauf chargement pdf.js déjà en place).

```
Dépôt PDF (dataUrl)
   │
   ▼  _ensurePdfjsLoaded()                    [existant, ligne 34686]
   ▼  _logDiagExtractPdfText(dataUrl)         [existant, ligne 34721 — cap 30 pages/200Ko]
   │     → texte brut de l'acte
   ▼  _acteExtract(text)                       [NOUVEAU — moteur d'extraction]
   │     → { entite:{...}, immeuble:{...}, logements:[...], annexes:[...], _src:{...} }
   ▼  écran de validation (toutes valeurs « suggéré »)
   │     → user corrige / valide / choisit le mode des annexes
   ▼  _acteApply(validated)                    [NOUVEAU — orchestration création]
         ├─ matchEntite (SIREN puis nom)  → rattache ou saveEnt()      [36702]
         ├─ saveImm()  (immeuble lié à l'entité)                       [36582]
         │     → _drvHookEnsureImmeuble(ent, imm) (dossier Drive)      [25721]
         ├─ pour chaque logement validé : créer log dans DB.logements  [36173 pattern]
         └─ pour chaque annexe :
               🔗 rattacher → champ sur le logement parent (annexes[])
               🏷 bien à louer → créer un logement type cave/parking
               ✕ ignorer → rien
```

---

## 5. Moteur d'extraction `_acteExtract(text)` — ancres par champ

Toutes les ancres viennent de l'analyse empirique (4 actes, 2 études). **Défensif** : ancre introuvable → champ vide, jamais de crash.

| Champ | Ancre / regex | Fiabilité |
|---|---|---|
| **Acquéreur — société** | bloc `IDENTIFICATION DES PARTIES` → `2) Acquéreur` … `La société dénommée "([^"]+)"`, forme + `siège social à [VILLE] ([CP]), [adresse]`, clos par `Ci-après dénommé(e) "L'ACQUEREUR"` | forte |
| **Acquéreur — personne** | même bloc → `Monsieur/Madame [Prénoms] [NOM] … demeurant à [VILLE] ([CP]), [adresse]` | forte |
| **Détection personne ↔ société** | présence de `La société dénommée` vs `Monsieur`/`Madame` | forte |
| **SIREN** | `numéro unique d'identification (\d{3} \d{3} \d{3})` → **clé anti-doublon primaire** | forte |
| **Adresse immeuble** | `DESIGNATION DES BIENS` → `situ[ée] à ([A-ZÉÈ…\- ]+) \((\d{5})\), ([^.]+)` | forte |
| **Année construction** | — | **absente — non extraite (D6)** |
| **Logements (copropriété)** | `Lot numéro (\w+) \((\d+)\) - (désignation)` + tantièmes ; surface Carrez `Lot … : ([\d,]+) m²` ; **réunion** `Réunion de(s)? lots` + désignation prose `un appartement de type (F\d)` | moyenne → interprété + vérif user (D4) |
| **Logements (immeuble entier)** | prose `comprenant … (CINQ|5) logements` + énumération `Au [Nᵉ] étage … : un appartement` ; surface **totale** seulement | moyenne |

**Interprétation des logements (D4)** : après extraction brute des lots, `_acteRegroup()` applique des heuristiques de regroupement (réunion de lots explicite, lots de même nature contiguës décrites comme un appartement en prose) et produit une liste de **logements** + une note de vérification par regroupement. L'user peut défaire/refaire via l'overlay « modifier le regroupement ».

**Classement annexe vs logement** : un lot de nature `cave`, `parking`, `garage`, `emplacement de stationnement`, `grenier`, `local` non-habitation → bucket **annexes** (triple mode). Tout le reste → **logements**.

---

## 6. Mapping vers le modèle de données

| Donnée extraite | Cible | Champ |
|---|---|---|
| Acquéreur société | `DB.entites[]` | `nom`, `siren`, `formeJuridique`, adresse siège |
| Acquéreur personne | `DB.entites[]` | `nom`, type personne physique |
| Adresse immeuble | `ent.immeubles[]` (imbriqué) | `adr`, `codePostal`, `ville` ; `annee` = 0 (vide) |
| Logement interprété | `DB.logements[]` | `ref` (générée), `type`, `etage`, `surf`, `numApt`, `entity` (string), `imm` (string), `typeUsage`='habitation-nu' |
| Annexe 🔗 rattachée | sur le logement parent | `log.annexes[]` = `[{ lot, nature }]` (nouveau champ tableau sur le logement) |
| Annexe 🏷 bien à louer | `DB.logements[]` | `ref`, `type`='cave'/'parking'/'garage', `typeUsage` adapté, lié immeuble/entité |
| Annexe ✕ ignorée | — | rien (l'info reste dans l'acte joint) |

**Dette connue** (ARCHI-DB-DOUBLONS) : liens entité/immeuble/logement par **chaîne** (`entity`, `imm` = noms). On suit le modèle existant pour ne pas diverger ; ne pas tenter de corriger la dette ici.

---

## 7. Anti-doublon entité (D3)

```
extraire SIREN
  │ SIREN présent ?
  ├─ oui → DB.entites.find(siren === extrait) ?
  │         ├─ trouvé → SUGGÉRER « Rattacher à <nom existant> » (défaut)
  │         └─ absent → match nom fuzzy (normalisé, sans casse/accents) ?
  │                     ├─ proche → SUGGÉRER rattachement
  │                     └─ aucun → SUGGÉRER « Créer l'entité »
  └─ non (personne) → match nom fuzzy uniquement
```

**Jamais** de fusion/rattachement automatique : on présente la suggestion, l'user tranche (`🔗 Rattacher` / `➕ Créer quand même`).

---

## 8. Réutilisation de l'existant (sandbox `index-test.html`)

| Fonction | Ligne | Usage |
|---|---|---|
| `_ensurePdfjsLoaded()` | 34686 | charger pdf.js à la demande |
| `_logDiagExtractPdfText(dataUrl)` | 34721 | extraire le texte (cap 30 pages / 200 Ko) |
| `_logDiagFindSentence` / `_logDiagCompact` | ~34800 | retrouver la phrase source à afficher sous chaque suggestion |
| `saveEnt()` | 36702 | créer l'entité |
| `saveImm()` | 36582 | créer l'immeuble (lié à `ent.id`) |
| `_drvHookEnsureImmeuble(ent, imm)` | 25721 | créer le dossier Drive de l'immeuble |
| pattern création logement | 36173 | `{id:nid()}` + push `DB.logements` |
| `_stamp` / `saveDB` / `showToast` / `nid` | divers | persistance, horodatage Drive, feedback |

Le **pattern UI « suggéré · à vérifier »** (badges ambre, phrase source, ✓/✗ par champ, valider/effacer tout) est repris tel quel de B2 v2-c1/c2.

---

## 9. Garde-fous & gestion d'erreurs

1. **Extraction défensive** : chaque ancre dans un try/catch logique — introuvable → champ vide, jamais d'exception, jamais de blocage. L'user complète à la main.
2. **PDF scanné / image** : pas de texte → échec gracieux (toast « acte non lisible, passez en saisie manuelle »), comme B2 v2-c1.
3. **Aucune écriture aveugle** : tout `suggéré` jusqu'à validation explicite. Le récap (étape 3) liste précisément ce qui sera créé/rattaché avant confirmation.
4. **Anti-doublon non destructif** : suggérer, jamais fusionner auto.
5. **Échantillon limité** (4 actes / 2 études, même famille de logiciel notarial) → d'autres notaires peuvent différer ; assumer une fiabilité « brouillon » et soigner la facilité de correction.
6. **XSS** : la `ref` logement générée doit passer le regex de validation existant (`/^[A-Za-z0-9À-ſ.\-_/ ]{1,60}$/`, ligne 36164) — assainir les valeurs extraites avant injection.
7. **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant tout test user (création multi-entités + anti-doublon + lecture PDF = sensible).

---

## 10. Tests

- **Unitaire (Vitest)** sur `_acteExtract` : jeux de texte représentatifs des 2 familles (copropriété lots / immeuble entier), + cas dégradés (ancre absente, texte vide, réunion de lots, caves mêlées).
- **Anti-doublon** : SIREN existant → suggère rattachement ; SIREN absent + nom proche → suggère ; rien → créer.
- **Annexes** : les 3 modes produisent le bon résultat (rattachée / bien à louer / ignorée).
- **Visuel (vrai navigateur)** : parcours complet sur les 4 actes réels (`actes/`, non commités), 3 formats, abandon à chaque étape.
- **Non-régression** : import puis vérifier qu'aucune entité/immeuble/logement existant n'est altéré ; localStorage sandbox (`_test_immotrack_v4`) isolé des données réelles.

---

## 11. Découpage en phases (proposé — à détailler dans le plan)

- **Phase A — moteur d'extraction** `_acteExtract` + `_acteRegroup` + tests Vitest (entité/SIREN/adresse fiables ; logements interprétés). *Cœur de risque, à valider en premier sur les 4 actes.*
- **Phase B — wizard UI** (dépôt → validation → récap → succès) câblé sur le moteur, pattern « suggéré » B2 v2-c1, 3 formats.
- **Phase C — annexes triple-mode** (sélecteur + overlays + création conditionnelle bien à louer / rattachement).
- **Phase D — orchestration création** `_acteApply` (anti-doublon entité, saveEnt/saveImm/logements, hook Drive) + récap.
- **Phase E — audit code-reviewer + tests visuels 4 actes + responsive**, puis déploiement prod après OK user.

Chaque phase : sandbox-first, diff + commit, bump de version, attendre test visuel.

---

## 12. Hors-scope (YAGNI)

- **Voie B (LLM)** : upgrade premium futur SI le brouillon logements s'avère trop grossier au retour onboarding. Pas nécessaire pour la V1.
- **Année de construction** depuis l'acte (absente — vient du DPE).
- **Import multi-actes en lot** (1 acte à la fois pour la V1).
- **Correction de la dette ARCHI-DB-DOUBLONS** (liens par chaîne) : on suit le modèle existant, on ne refactore pas ici.
- **OCR d'actes scannés** (rejoint OCR-FACTURE V3 — échec gracieux suffit pour la V1).
