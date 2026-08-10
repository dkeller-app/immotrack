# BUG-LOCATAIRE-UX-PACK — Onglet Locataires : 3 fixes UX (assistant départ, aperçu bail = PDF, popup « … » figé)

**Status** : ✅ Livré v15.407 (2026-07-03) · **Prio** : P1 · **Taille** : S
**Détecté** : 2026-07-02 (user, test app réelle)

## Contexte

> 💬 2026-07-02 : *« locataire : logo assistant de départ peu intuitif. aperçu bail doit ouvrir le bail PDF pas la visu (on veut du légal), quand on clique sur les ... pour ouvrir plus, le pop up est figé (attention sur logement il apparaît mal) »*

## Les 3 fixes

### A. Icône « assistant de départ » peu intuitive
Le logo/icône qui lance l'assistant de départ du locataire ne se comprend pas. → Remplacer par un libellé explicite ou une line-icon parlante + tooltip (cf. règle icônes line-icons propres, couleur conservée pour différencier).

### B. « Aperçu bail » doit ouvrir le PDF signé, pas la visu HTML
L'utilisateur veut le **document légal** (PDF signé/verrouillé), pas la prévisualisation HTML reconstituée. Attention immutabilité : si bail signé → toujours servir l'artefact PDF signé (snapshot), jamais un re-render.

### C. Popup « … » (menu plus) figé
Le menu contextuel ouvert via « … » est figé (position fixe ? scroll bloqué ? clic mort ?). Le même popup s'affiche mal sur l'onglet Logement → fix commun aux 2 sites (composant popover partagé, pas 2 patchs).

## Scope

1. Repro des 3 cas + lecture du code (menu « … » = probablement un popover global réutilisé).
2. Fix C en premier (composant partagé → corrige Locataires ET Logement d'un coup — DRY).
3. Fix B : brancher sur l'artefact PDF signé existant (`_ingestSignedBailArtifacts` / storage documents).
4. Fix A : icône + libellé.

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : sujet créé en session pilotage (triage retours test user).

- 2026-07-03 : ✅ **Livré v15.407** sur origin/main (branche fix/quickwins-ux-20260702, merge FF 4349b1e). Audit agent code-reviewer PASS (0 bloquant, 2 importants corrigés avant push : clé pdfRef transmise à _openCloudBailPdf + nettoyage état fiches au retour navigateur). Gates : check-inline-js 5/0, Vitest 1753 verts, vérif navigateur complète, 0 erreur console. Renum v15.398-400→v15.407 (collisions sessions parallèles).

- 2026-07-03 (suite) : toast « PDF partiellement signé — signature locataire en attente » ajouté v15.412 (mineur audit, aperçu bail signé bailleur-seul entre les 2 phases).
