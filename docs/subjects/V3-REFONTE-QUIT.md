# V3-REFONTE-QUIT — Refonte onglet Reçus & Quittances (lisibilité : dernière quittance fait foi)

**Status** : ⬜ À faire · **Prio** : P2 → **P1 (retour user 2026-07-02, mockup demandé)** · **Taille** : M (mockup-first)
**Lié à** : UX-GROUP-BY-IMMEUBLE (intercalaires), QUIT-EMAIL, EMAIL-AUTO ✅ v14.97

## Contexte

> 💬 2026-07-02 : *« revoir reçus et quittances. On n'a pas besoin de garder tout l'historique tout le temps. La dernière quittance fait foi. on a plein de bulles partout ce n'est pas lisible : faire proposition mockup »*

L'onglet affiche tout l'historique de quittances à plat avec des bulles/badges partout → illisible. Le besoin courant est : **où en est le mois courant, par bail** ; l'historique est un besoin d'archive ponctuel.

## Direction (à explorer en mockups)

- Vue par défaut = **état actuel** : 1 ligne/carte par bail actif avec le statut de la dernière quittance (envoyée / à envoyer / non demandée — cohérent avec la logique point/– de BUG-DASH-GESTIONNAIRE-PARC).
- **Historique replié** : accessible par drill-down par bail (« voir l'historique »), pas affiché en permanence.
- ⚠️ On ne SUPPRIME rien : les quittances historiques restent stockées (valeur légale / preuves — cf. règle sauvegarde sans auto-suppression). C'est un changement d'AFFICHAGE uniquement.
- Nettoyage des bulles : 1 statut = 1 signal, pas d'empilement de badges.
- Intercalaires immeubles (UX-GROUP-BY-IMMEUBLE) intégrés d'office dans le nouveau layout.

## Règles gravées applicables

- **Mockup-first** (demande explicite user) : A/B/C × 3 formats × drill-down historique
- Sandbox-first
- Pas de suppression de données légales

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte. Mockup explicitement demandé.

## Journal

- 2026-07-02 : fichier sujet créé en session pilotage (le code existait dans BACKLOG sans doc). Prio montée P2→P1 sur retour user + demande de mockups.
