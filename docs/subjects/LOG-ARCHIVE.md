# LOG-ARCHIVE — Archivage de biens (cycle de vie)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S
**Détecté** : 2026-05-01
**Lié à** : LOG-LISTE-CARDS · LOG-FICHE-360

## Contexte
Demande implicite via capture Qalimo (2026-05-01) : tab `Tous mes biens` / `Biens archivés` dans la vue liste.

Cas d'usage :
- Logement **vendu** → l'utilisateur ne veut plus le voir au quotidien mais conserver l'historique fiscal/comptable
- Logement **changé d'usage** (ex passé en résidence principale, plus de location)
- Logement **non géré temporairement** (vacant longue durée, travaux lourds en cours)

Aujourd'hui ImmoTrack a probablement seulement `delete` (perte définitive de l'historique). Besoin d'un état intermédiaire `archivé`.

## Scope
- [ ] Champ `logement.archived` (boolean) + `logement.archivedAt` (date)
- [ ] Action `Archiver` dans le menu `⋮` de la carte logement (cf `LOG-LISTE-CARDS`)
- [ ] Modale confirmation : "Archiver ce bien ? Vous pourrez le restaurer à tout moment depuis l'onglet Archivés. L'historique (baux, mouvements, EDL, quittances) sera conservé."
- [ ] Tab `Biens archivés` dans la liste avec badge compteur
- [ ] Action `Restaurer` (depuis tab Archivés ou fiche bien archivé)
- [ ] Filtrage : par défaut, biens archivés sont **exclus** de :
  - [ ] Dashboard (KPIs, graphiques)
  - [ ] Calculs IRL/régularisations
  - [ ] Liste logements active
- [ ] **Inclus** dans :
  - [ ] Historique fiscal annuel (LEGAL-2044, LEGAL-BILAN-ANNUEL) — important
  - [ ] Recherche globale (avec badge "Archivé")
  - [ ] Tab dédié `Archivés`

## Différence vs `delete`
- `archive` : soft-delete réversible, historique conservé
- `delete` : hard-delete (déjà existant ?), à utiliser uniquement pour erreur de saisie

→ Garder les 2 actions distinctes dans le menu `⋮` :
- `Archiver` (action principale, recommandée)
- `Supprimer définitivement` (rare, modale d'avertissement renforcée + texte rouge)

## Décisions à prendre
- [ ] Cascading : archiver un logement archive-t-il automatiquement ses baux non terminés ? → Recommandation : **non**, l'utilisateur doit terminer le bail manuellement avant (sinon incohérence "bail actif sur logement archivé")
- [ ] Bloquer l'archivage si bail actif existe ? → Oui, message "Terminez d'abord le bail en cours"
- [ ] Affichage spécifique des biens archivés : grisé ? badge "Archivé" ? card-bg différente ?

## Notes utilisateur
> 💬 2026-05-01 : implicite via capture Qalimo (tabs `Tous mes biens` / `Biens archivés`)

## Journal
- 2026-05-01 : créé · sujet jumeau de LOG-LISTE-CARDS Phase 3
