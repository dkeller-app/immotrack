# Refonte onglet « Charges & régularisation » — design validé

Date : 2026-06-22 · Branche : `feat/charges-regul-recup` (base origin/main v15.339)
Statut : design validé par l'utilisateur (mockup `mockups/regul-pl-recap.html`).

## Problème (audit)

1. **Bug calcul (CORRIGÉ).** `_isChargeRecupCategory` ne reconnaissait que le littéral legacy `'Charges'` + lignes 2044 `229/230`. La catégorie réelle **« Charges récupérables (eau, énergie…) »** (`recup:true`, `ligne2044:''`) saisie à l'import était **ignorée** → charges eau/énergie jamais refacturées. Fix livré : la régul lit le flag `recup` (utils.js + index.html + index-test.html + tests 21/21 + audit code-reviewer PASSANT).
2. **Visu illisible.** Liste de cartes `.regul-card` (une par logement) → ~25 logements = mur de blocs. Aucune **vision globale par immeuble** pour valider, aucun moyen de voir **« ce qu'il y a derrière »** une charge si un locataire conteste, aucun garde-fou contre les **charges oubliées / non réparties** (« trous »).

## Données réelles (ancrage)

~25 logements / 5 immeubles (Delle copro, Ferrette, Freyming, Damelevières, Morschwiller-le-bas). **Quasi aucun compteur collectif** (1 seul, Freyming eau, 2 logements) → la répartition dominante est **prorata sur l'immeuble** (`m.imm`) ou **directe** (`m.qui`). Conséquence : pas de « postes » (eau/chauffage/élec…) en dur — les lignes de détail sont les **mouvements réels** (libellé saisi par l'utilisateur) avec leur clé de répartition.

## Design validé — un seul écran, 3 profondeurs + 1 bascule

Tout réutilise `computeRegul()` (calcul existant) et le décompte existant (`_buildDecompteHtml` / modale). On ne refait PAS le calcul ; on le **présente** mieux + on ajoute un garde-fou.

### 1. Liste par immeuble (remplace les cartes)
- Tableau replié par immeuble : nom · provisions · charges · solde · **état** (`✓ validé` / `⚠️ à valider`) · bouton **🔎 Vue globale**.
- Déplier un immeuble → ses logements (provisions / charges / solde `à demander` vert / `à restituer` orange / 📄 décompte).
- Ligne TOTAL en bas. Encart **Part bailleur** (→ 2044) conservé.

### 2. Détail par logement — « ce qu'il y a derrière » (expliquer)
- Clic sur un logement → ses **mouvements de charges réels** : date · libellé · charge totale · clé de répartition (prorata X% / direct / compteur) · **quote-part**. + provisions versées + solde.
- C'est l'écran à montrer à un locataire qui conteste. = réutilise les `details[]` déjà produits par `computeRegul`.

### 3. Vue globale par immeuble — matrice (vérifier + valider)
- Bouton **🔎 Vue globale** par immeuble → matrice **charges (mouvements) × logements** de l'immeuble : chaque mouvement et sa quote-part par logement + colonne **Charge totale** ; lignes basses **Total réparti / Provisions / Solde** par logement.
- **Détection des trous** : tout mouvement récupérable de l'immeuble avec `db>0` mais **non réparti** (ni `qui`, ni `imm` exploitable, ni compteur, OU reliquat non affecté) → **ligne rouge + bandeau d'alerte** « X € non répartis ».
- **Validation** : bouton « ✓ Valider la régul de l'immeuble », **grisé tant qu'il reste un trou**. Une fois validé → état `✓ validé`, envoi des décomptes débloqué.

### 4. Bascule « Vérification P&L » (piloter)
- Compte de résultat par immeuble : provisions · charges · solde · **charges N-1 · variance %** → voir si les provisions sont calibrées. (Bascule possible « par catégorie » si plusieurs catégories récup utilisées.)

## Logique nouvelle à ajouter (au-delà de l'affichage)

- **Détection des charges non réparties par immeuble** (les « trous »). Aujourd'hui `computeRegul` peut perdre silencieusement une charge récup sans `qui`/`imm`/compteur (angle mort confirmé par l'audit). À transformer en signal explicite (montant non réparti par immeuble), réutilisé par la vue globale ET idéalement routé vers la part bailleur si l'utilisateur le choisit.
- **État de validation par (immeuble, période)** : persistance (`DB.regulValidations[]` ou équivalent), synchronisé via le mécanisme existant. Gate : un décompte ne s'envoie pas si l'immeuble n'est pas validé.

## Phasage (1 phase = 1 diff + bump version + test)

- **Phase A — Refonte visu (présentation pure).** Liste par immeuble repliable (cartes → tableau) + détail par logement (mouvements réels) + encart bailleur + bascule P&L N/N-1. Zéro logique persistée nouvelle ; lit `computeRegul`. → la majeure partie du mockup.
- **Phase B — Détection des trous.** `computeRegul` (ou wrapper) expose le montant non réparti par immeuble ; la vue globale (matrice) l'affiche (bandeau + ligne rouge). Read-only, pas de persistance.
- **Phase C — Vue globale matrice + validation/gate.** Matrice charges × logements ; état `validé/à-valider` persisté par (immeuble, période) ; bouton Valider gaté sur « zéro trou » ; envoi des décomptes gaté sur validation.

## Contraintes (règles gravées)

- Responsive PC / tablette / téléphone ; design system (tokens, table `.pl`/`.tbl` existantes).
- Pensé commercialisation (multi-bailleur) : état de validation par espace/immeuble, pas en dur.
- Sandbox d'abord (`index-test.html`) puis `index.html` après OK — **réserve connue** : `index-test.html` est pré-V3-REFONTE (STD obsolète) ; à réconcilier ou tester directement en prod après déploiement.
- Audit code-reviewer obligatoire avant « prêt » (calcul fiscal + envoi locataire = sensible).
- Déploiement : calcul (déjà fait) + visu livrés **ensemble**.

## Hors scope (pour l'instant)

- Réconciliation complète du STD de `index-test.html` (chantier séparé).
- Bascule P&L « par catégorie » (si l'utilisateur multiplie les catégories récup) — extension future.
