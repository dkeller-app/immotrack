# V3-REFONTE-LOYERS — Refonte fonctionnelle onglet Mouvements + import bancaire

**Status** : 🔄 En cours (design) · **Prio** : P2 · **Taille** : M-L
**Détecté** : backlog historique (2e priorité après Bail) · **Session design** : 2026-06-04
**Lié à** : BANK-IMPORT-V2 (pointeur par compte, livré v15.163), MVT-SCIND-CAT, MVT-RECURRENT

---

## ⚠️ Garde-fous (rejets de la session 2026-06-04 — à NE PAS refaire)

1. **On ne réinvente pas la poudre.** Le « sélecteur de périmètre » bailleur→immeuble→logement que j'avais inventé **existe déjà** : pastilles entité globale (`_setActiveEntity` l.5948), dropdown immeuble par page (`initFilters` l.5905), champ `qui` (`fillMvQui`). Le « Suivi des loyers » existe déjà (Pilotage → 💰 Suivi comptable, `_rPilCompta` l.41524). → Partir de l'écran réel, corriger ce qui est cassé, pas d'une page blanche.
2. **Ordre logique = sens du flux** : on commence par l'**import** (le début), puis l'**affichage**.
3. **CSV : si mal géré, on ne le propose pas.** Pas de mapping manuel de colonnes (béquille rejetée). « On prend le format le mieux géré » = OFX/QFX (structuré, auto-décrit). Voir question ouverte Q1.
4. **L'affectation à plat (`fillMvQui`) « est de la merde »** : liste de logements longue comme le bras, et on ne peut affecter qu'à UN bien. Or les charges ne sont pas toujours sur un bien. → modèle 3 niveaux (ci-dessous).

---

## Étoile polaire : sortir le 2044 sans retouche

La sortie cible validée par le user (2026-06-04) = **la déclaration de revenus fonciers (2044)** doit sortir remplie en un clic. **Le générateur existe déjà** : `js/core/legal-2044.js` (`_compute2044` / `_format2044Recap` / `_2044ToCsv`, testé `__tests__/helpers/legal-2044.test.js`). `STD_CATEGORIES` (index.html l.3920-3963) mappe chaque catégorie sur sa ligne CERFA (211/213/221/223/224/224bis/225/226/227/229/230/250) + un `type` (recette/charge/interet/special). **On ne réécrit pas le 2044** — la refonte ne fait que lui fournir des données propres (garbage in → 2044 faux).

## Problème central : l'affectation est le contrat de données du 2044

Aujourd'hui l'affectation (`fillMvQui` l.12983) demande toujours **« quel logement ? »** (liste à plat de tous les logements). Inadapté : beaucoup d'écritures ne visent pas un logement.

**Modèle de données réel** (3 voies, déjà en place) :
- `qui = "SCI:<nom>"` → niveau entité/SCI (frais de compte, comptable). **Compté par le 2044.**
- `qui = <ref logement>` → niveau logement (loyer, DG, travaux). **Compté.**
- `qui = ""` + `imm` rempli → niveau immeuble. **❌ IGNORÉ par `_compute2044`** (le filtre de scope ne lit que `m.qui`, jamais `m.imm`, cf legal-2044.js l.39-50).
- `compteurCcId` (exclusif avec `qui`) → charge récupérable rattachée à un **compteur collectif**, réparti sur les logements par clé (tantièmes/surface/sous-compteurs/proportionnel/forfait). Module existant `index.html:31085+`.

**Insight clé (2026-06-04, sur indication user « pour les charges on a aussi un module »)** : au niveau immeuble il y a **deux espèces de charges, destins opposés** :
| Type | Destination | État |
|---|---|---|
| **Récupérable** (eau, ascenseur, chauffage, entretien PC) | → compteur collectif → réparti sur **locataires** → régularisation. **Hors 2044** (se neutralisent) | ✅ géré (module CC) |
| **Déductible de propriété** (taxe foncière, PNO, syndic part proprio, ravalement) | → **2044** (lignes 227/223/224/229) | ❌ tombe dans le trou immeuble |

→ Le « vrai bug » = uniquement les charges de propriété **déductibles** posées au niveau immeuble disparaissent du 2044. Les récupérables ont déjà leur maison.

## UX cible : la catégorie pilote l'affectation

On inverse la question. Pas « choisis un bien » d'abord, mais **« qu'est-ce que c'est »** (la catégorie, déjà 2044-mappée et typée). La catégorie connaît sa destination → l'app pose **une seule** question ciblée :
- recette / charge logement → « quel logement ? »
- charge déductible immeuble → « quel immeuble ? » → remonte au 2044
- charge récupérable → « quel compteur collectif ? » → module CC, réparti sur locataires
- frais SCI → « quelle entité ? » (pastilles entité existantes)

Plus aucune liste à plat. Réutilise tout l'existant (catégories, compteurs collectifs, pastilles entité).

---

## Périmètre de la refonte

### 1. Import bancaire (le début du flux)
- Garder le wizard 5 étapes existant (`_bankImportFileLoaded` l.42368, `_bankImportConfirm` l.42877) et le pointeur par compte (BANK-IMPORT-V2, déjà livré).
- **Format** : privilégier OFX/QFX (fiable). Pas de mapping CSV manuel. → Q1.
- **Étape Aperçu/affectation** : remplacer la sélection logement-à-plat par le drill-down 3 niveaux ci-dessus.

### 2. Affichage (onglet Mouvements, `rMv` l.13589, `#p-loyers`)
- Partir de l'écran réel actuel (filtres, dropdowns Excel, 3 onglets de vue) — corriger, pas remplacer.
- Ne PAS recréer le « Suivi des loyers » (existe en Pilotage).
- Détail à cadrer une fois l'import + affectation validés.

---

## Questions ouvertes

- **Q1 — Formats d'export des banques de Did_K** : quelles banques, quels formats dispo (OFX/QFX/CSV) ? Décide si OFX-only suffit ou s'il faut des templates CSV par banque (pas de mapping manuel dans tous les cas). *(question posée puis écartée en session — à reprendre)*
- **Q2 — Découpe d'un mouvement sur plusieurs biens** : un virement CAF / un loyer groupé peut concerner plusieurs logements. La feature Split ✂️ existe déjà — vérifier qu'elle couvre le cas et s'articule avec le drill-down.
- **Q3 — Normalisation du niveau immeuble** dans le modèle (`imm` + `qui=""` ?) à figer avant implé.

---

## Décisions prises (2026-06-04)
- Approche globale : **Refonte analyste** (Option A), import-first. Étoile polaire = **2044 en un clic**.
- Drop du mapping CSV manuel ; import OFX, + modèle CSV par banque si une banque ne fait que du CSV.
- **L'affectation est pilotée par la catégorie** : on choisit *ce que c'est* avant *où ça va*. Une seule question contextuelle, jamais de liste à plat.
- **Charges immeuble déductibles = un seul mouvement au niveau immeuble** (pas de ventilation par logement) : le 2044 veut un total par ligne. La ventilation par logement reste possible via le module CC si besoin futur (compte de résultat par logement), hors scope 2044.
- Réutiliser sans réécrire : `_compute2044`, module compteurs collectifs, pastilles entité.

## Les 3 corrections à livrer
1. **Affectation** : remplacer `fillMvQui` (liste à plat) par le sélecteur piloté-catégorie (1 question ciblée selon recette logement / charge immeuble déductible / charge récupérable→CC / frais SCI).
2. **Trou 2044** : `_compute2044` doit compter les charges rattachées au niveau immeuble (aujourd'hui ignorées car le filtre ne lit que `m.qui`). **Bug le plus grave** (taxe foncière absente du 2044). → audit agent obligatoire (modif sensible fiscale).
3. **Import** : garder le wizard ; brancher le nouveau sélecteur d'affectation sur l'étape Aperçu.

## Questions ouvertes (résolues / restantes)
- ~~Q1 formats banque~~ → tranché : OFX + modèle CSV par banque si besoin.
- **Q2 — Découpe multi-biens** : Split ✂️ existe — vérifier articulation avec le sélecteur piloté-catégorie.
- **Q3 — Normalisation niveau immeuble** dans le modèle (`imm` + `qui=""` vs un `qui="IMM:<nom>"` explicite ?) à figer avant implé, en lien avec le fix #2.

## Journal
- **2026-06-04** : session design. 2 mockups produits (`loyer-refonte.html` rejeté = réinventait l'existant ; `import-wizard.html` partiellement rejeté). Découverte : **le 2044 existe déjà** (`legal-2044.js`), et le bug central = charges immeuble déductibles ignorées par `_compute2044`. User a recadré (« vraie analyse et proposition, je veux que ça fonctionne », allergique aux questions-quiz). Modèle « catégorie pilote l'affectation » + 2 espèces de charges immeuble (récupérable→CC / déductible→2044) captés. Prochain pas : maquette de l'écran d'affectation (3 formats). Statut ⬜→🔄.
