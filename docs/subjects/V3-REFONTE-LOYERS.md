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

## Problème central : le modèle d'affectation

Aujourd'hui un mouvement s'affecte via un champ `qui` quasi-plat (liste de tous les logements). Réalité comptable d'un bailleur : une écriture se rattache à **3 niveaux** possibles, et doit pouvoir **s'arrêter au bon niveau** :

| Niveau | Exemples d'écritures |
|---|---|
| 🏛️ **SCI / entité** | frais de tenue de compte, honoraires comptable, frais bancaires, CFE, intérêts d'emprunt globaux |
| 🏢 **Immeuble** | assurance PNO, taxe foncière, syndic, ravalement, charges communes |
| 🚪 **Logement** | loyer encaissé, dépôt de garantie, régularisation de charges, travaux d'un T2 |

Le modèle de données **supporte déjà** SCI et logement : `qui` = ref logement OU `"SCI:nom"` OU `"Global"` OU `""` ; `imm` = nom immeuble. Le niveau immeuble est moins propre (sans doute `imm` rempli + `qui` vide). → à clarifier/normaliser pendant l'implé.

**UX cible de l'affectation** : pas « choisis un bien » mais « à quel niveau ça se rattache ». Drill-down 🏛️ SCI → 🏢 immeuble → 🚪 logement, **validable à chaque niveau**, jamais de liste à plat. Réutiliser les pastilles entité existantes pour le niveau SCI.

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
- Approche globale : **Refonte analyste** (Option A), import-first.
- Drop du mapping CSV manuel.
- Modèle d'affectation **3 niveaux** (SCI / immeuble / logement), drill-down validable à chaque niveau.

## Journal
- **2026-06-04** : session design. 2 mockups produits (`mockups/loyer-refonte/loyer-refonte.html` rejeté = réinventait l'existant ; `import-wizard.html` partiellement rejeté = mapping CSV + affectation à plat). Garde-fous + modèle 3 niveaux captés ici. Statut ⬜→🔄.
