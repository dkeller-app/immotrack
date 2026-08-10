# Refonte de la fenêtre « Nouveau mouvement » — design

**Date** : 2026-06-20
**Chantiers** : V3-REFONTE-LOYERS **B** (affectation pilotée par la catégorie) + **C** (split multi-sens) + lifting visuel V3.
**Cible** : pop-up `ov-mv` (`index.html`), fonctions `openNewMv`/`saveMv`/`fillMvQui`/`_spMvRows`/`confirmSplitMvList`.
**Maquette de référence** : `mockups/loyer-refonte/affectation.html` (validée 2026-06-20).
**Statut** : conception — à valider par l'utilisateur, puis plan d'implémentation (writing-plans).

## Pourquoi

Le formulaire actuel demande toujours **« quel logement ? »** via une **liste à plat** de tous les logements (`fillMvQui`). Inadapté : beaucoup d'écritures ne visent pas un logement (charge immeuble déductible, frais SCI, charge récupérable). Et le split actuel (`confirmSplitMvList`) est **mono-sens** : toutes les lignes héritent du sens du mouvement, impossible de modéliser un **relevé de gérance** (loyers en crédit + frais en débit dans un même virement).

## Principe directeur

**On choisit *ce que c'est* (la catégorie) avant *où ça va* (l'affectation).** La catégorie — déjà typée et 2044-mappée — connaît sa destination. L'app pose **une seule** question contextuelle, jamais de liste à plat. On **réutilise sans réécrire** : `_compute2044` (moteur unifié, Chantier A livré), module compteurs collectifs, pastilles entité, `STD_CATEGORIES`.

## Chantier B — Affectation pilotée par la catégorie

### Le sélecteur de catégorie
- Branché sur le **vrai `STD_CATEGORIES` (~30)**, PAS le `CATMETA(12)` de démo de la maquette (garde-fou « on ne réinvente pas la poudre » : DG, capital prêt, indemnités, éviction, arriérés, CFE/TLV… existent déjà).
- Chaque catégorie STD porte déjà : `type` (recette/charge/interet/special/charge_gestion-via-`gestionCharge`), `ligne2044`. On en dérive la **destination par défaut** (le niveau d'affectation).

### Les 4 destinations (= contrat de données du 2044)
La catégorie détermine quelle zone d'affectation s'affiche :

| Destination | Question posée | Stockage mouvement | 2044 |
|---|---|---|---|
| **Logement** | « quel logement ? » (filtré par immeuble + cherchable réf/locataire) | `qui = <ref>` | compté par lot |
| **Immeuble** (charge déductible globale) | « quel immeuble ? » | `qui = ""` + `imm = <nom>` | compté via `opts.imms` (1 ligne, pas de ventilation) |
| **SCI / entité** (frais de compte, comptable) | « quelle entité ? » (pastilles) | `qui = "SCI:<nom>"` | compté niveau entité |
| **Récupérable** (se récupère sur locataires) | case « → compteur collectif » + choix compteur | `compteurCcId = <id>` (exclusif avec `qui`) | exclu (réparti via CC, part bailleur → ligne 225 par `computeRegul`) |

- **Défaut surchargeable** : « Frais de gestion / honoraires » → suggère **immeuble** (mandat global), pas logement.
- **Normalisation niveau immeuble (ex-Q3 figée ici)** : une charge immeuble = `qui` vide + `imm` renseigné. C'est ce que `_compute2044` lit déjà (`m.imm` + `opts.imms`). Pas de nouveau champ.

### Ce qui ne change pas
`saveMv` (validation, PJ, audit-trail, matching quittance, sync) reste le flux d'écriture. Chantier B remplace **seulement** la brique de saisie de l'affectation (`fillMvQui` → sélecteur contextuel) ; les champs résultants (`qui`/`imm`/`compteurCcId`) et leur exclusivité mutuelle sont inchangés.

## Chantier C — Split multi-sens (relevé de gérance)

### Le besoin
Un seul virement peut mêler **plusieurs biens, plusieurs locataires et les deux sens** (relevé de gérance : loyers encaissés en crédit, frais de gestion/GLI/PNO en débit). L'équilibre se fait sur le **net** = Σ crédits − Σ débits = montant bancaire du mouvement d'origine.

### Refonte (pas un portage)
Le réel `confirmSplitMvList` (`index.html:13571`) / `_spMvRows` force **toutes** les lignes au même sens (`_spMvSens`), équilibre sur somme à plat ; l'objet mouvement n'a **pas** de champ `sens`. Le modèle cible (maquette) : **N lignes signées**, chacune une affectation complète = `{ sens (cr|db), montant, cat, affectation (qui|imm|compteurCcId) }`. Contrainte : `Σcr − Σdb === net du mouvement bancaire`. Validation groupée des lignes « prêtes ».

### Réutilisation du sélecteur B
Chaque ligne du split réutilise **exactement** le sélecteur d'affectation par catégorie du Chantier B (cohérence + une seule UX à maintenir).

### Split intégrés (depuis le bail)
- « Séparer loyer / charges » via `bail.hc` / `bail.ch` (1 clic).
- CAF multi-locataires (1 virement → N quote-parts logement).

## Lifting visuel V3
Appliquer le design system V3 (couleurs, typo, espacements, focus, dark mode, responsive 3 formats) à la fenêtre, en suivant la maquette. Pas de page « à part » (constance visuelle non négociable).

## Découpage proposé (3 phases, l'affectation d'abord)
1. **Phase B1 — Sélecteur d'affectation par catégorie** dans `ov-mv` (remplace `fillMvQui`). Les 4 destinations + défauts. Visuel V3 du formulaire. *Fiscalement sensible (contrat 2044) → audit.*
2. **Phase B2 — Split multi-sens** : refonte `_spMvRows`/`confirmSplitMvList` (lignes signées, équilibre net), réutilise le sélecteur B1. *Fiscalement sensible → audit.*
3. **Phase B3 — Split intégrés** (loyer/charges depuis bail, CAF multi-locataires) + validation groupée.

## Contraintes
- **Audit `superpowers:code-reviewer` obligatoire** sur B1 et B2 (l'affectation + le split sont le contrat de données du 2044). Cf [[feedback_audits_par_agents]].
- Mockup-first respecté (`affectation.html` validée). Tests Vitest sur les helpers purs (dérivation destination ↔ catégorie, équilibre net du split).
- Build direct sur `index.html` via worktree depuis origin/main (clone local stale), bump version 5 spots + sw.js, intégration sur main avec autorisation user.
- **Ne PAS recréer** : `_compute2044`, module CC, pastilles, `STD_CATEGORIES`, `saveMv`.

## Hors scope (pour plus tard)
- Refonte de l'import bancaire (Chantier C-import / la maquette `import-bancaire.html`) — séparé.
- Refonte de l'affichage onglet Mouvements (`rMv`) — séparé.
- Relevé de gérance / mode gestionnaire (consomme le split multi-sens, mais c'est un sujet à part : GESTION-CRG).

## Questions ouvertes restantes
- Q2 (split couvre plusieurs biens) : couvert par le modèle multi-sens ci-dessus. ✓
- Bank formats (Q1) : hors scope (touche l'import, pas le formulaire).
