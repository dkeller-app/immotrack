# BUG-IRL-RENONCE-AFFICHAGE — IRL : une révision RENONCÉE s'affiche comme « Appliquée » en vert avec le nouveau loyer

**Status** : ✅ Livré v15.407 (2026-07-03) · **Prio** : P1 · **Taille** : S
**Détecté** : 2026-07-02 (user, test app réelle, 2e vague — capture carte « Ferrette - Bar », vert « ✅ Appliquée le 16/03/2026 », 650 → 655,05 € (+0.78%), bouton Reset)

## Contexte

> 💬 2026-07-02 : *« IRL : si je renonce à une augmentation, je ne dois pas la voir en vert avec le nouveau loyer. ça ne va pas ! il faut un orange ou qq chose comme ça avec IRL renoncée »*

Quand le bailleur choisit de NE PAS appliquer la hausse IRL (renoncement — geste commercial ou loyer arrondi), la carte IRL affiche le même état vert « Appliquée » avec le nouveau montant que pour une vraie application. Faux sémantiquement et dangereux (on croit que le loyer a augmenté).

## Attendu (user)

- État visuel distinct **orange** (ou équivalent) libellé « IRL renoncée » (pas de vert, pas de nouveau loyer mis en avant).
- À investiguer : comment le renoncement est-il stocké aujourd'hui ? (applique-t-on la révision avec le MÊME montant ? y a-t-il un flag ?) — si aucun flag n'existe, en ajouter un au moment du renoncement.
- Cohérence : la lettre IRL / l'historique des révisions / le dashboard doivent reproduire le même état.

## Journal

- 2026-07-02 : sujet créé (2e vague retours test). Traité en session quick wins.

- 2026-07-03 : ✅ **Livré v15.407** sur origin/main (branche fix/quickwins-ux-20260702, merge FF 4349b1e). Audit agent code-reviewer PASS (0 bloquant, 2 importants corrigés avant push : clé pdfRef transmise à _openCloudBailPdf + nettoyage état fiches au retour navigateur). Gates : check-inline-js 5/0, Vitest 1753 verts, vérif navigateur complète, 0 erreur console. Renum v15.398-400→v15.407 (collisions sessions parallèles).
