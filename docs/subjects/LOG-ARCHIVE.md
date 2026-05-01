# LOG-ARCHIVE — Archivage de biens (cycle de vie)

**Status** : ✅ Livré v14.2 (2026-05-01) · **Prio** : P2 · **Taille** : S (livré ~2h)
**Détecté** : 2026-05-01
**Lié à** : LOG-LISTE-CARDS · LOG-FICHE-360

## Contexte
Demande implicite via capture Qalimo (2026-05-01) : tab `Tous mes biens` / `Biens archivés` dans la vue liste.

Cas d'usage :
- Logement **vendu** → l'utilisateur ne veut plus le voir au quotidien mais conserver l'historique fiscal/comptable
- Logement **changé d'usage** (ex passé en résidence principale, plus de location)
- Logement **non géré temporairement** (vacant longue durée, travaux lourds en cours)

Aujourd'hui ImmoTrack a probablement seulement `delete` (perte définitive de l'historique). Besoin d'un état intermédiaire `archivé`.

## Scope (livré v14.2 commit `7070fb3`)
- [x] Champ `logement.archived` (boolean) + `logement.archivedAt` (ISO date)
- [x] Action `Archiver` dans le menu `⋮` de la carte logement (vrai dropdown)
- [x] Modale confirmation : "Archiver ce bien ? Vous pourrez le restaurer à tout moment depuis l'onglet 'Biens archivés'. L'historique (baux, mouvements, EDL, quittances) sera intégralement conservé."
- [x] Tab `Biens archivés` dans la liste avec badge compteur dynamique
- [x] Action `Restaurer` dans le menu `⋮` (depuis tab Archivés ou fiche bien archivé)
- [x] Action également exposée dans le hero de la fiche 360 (bouton secondaire)
- [x] Filtrage : par défaut, biens archivés sont **exclus** de :
  - [x] Liste Biens active (filtré par tab Actifs)
  - [x] Selects de création (mvt, bail, agenda, quittance) via helpers `_activeLogements()`
  - [x] Filtres dropdowns (helper `immeubles()` exclut les immeubles 100% archivés)
  - [x] IRL/régularisations : déjà filtré par `bail.cloture` → bien archivé sans bail actif sort naturellement
- [x] **Inclus** dans :
  - [x] Tab dédié `Archivés`
  - [x] Sélects d'édition de règles existantes (préserve le selected dynamique)
  - [ ] Historique fiscal annuel (LEGAL-2044, LEGAL-BILAN-ANNUEL) — à brancher quand ces sujets seront traités
  - [ ] Recherche globale avec badge "Archivé" — n/a, pas de recherche globale dans l'app actuellement

## Différence vs `delete`
- `archive` : soft-delete réversible, historique conservé
- `delete` : hard-delete (`delLog` existant), à utiliser uniquement pour erreur de saisie

→ Les 2 actions cohabitent dans le menu `⋮` :
- `Archiver` (action principale, recommandée)
- `Supprimer définitivement` (rouge, en bas du dropdown)

## Décisions prises (v14.2)
- [x] Cascading : non, archiver bloque tant qu'un bail actif existe (msg "Terminez d'abord le bail en cours")
- [x] Bloquer l'archivage si bail actif : oui via helper `_bienIsBailActif(ref)`
- [x] Affichage : opacity .72 + grayscale .25 (clear au hover) + badge "Archivé" inline dans le header (CSS `.is-archived` + `.bien-card-archived-badge`). Période sur cartes logement archivées affiche "Archivé le DD/MM/YYYY".

## Notes utilisateur
> 💬 2026-05-01 : implicite via capture Qalimo (tabs `Tous mes biens` / `Biens archivés`)

## Journal
- 2026-05-01 : créé · sujet jumeau de LOG-LISTE-CARDS Phase 3
- 2026-05-01 : ✅ **Livré v14.2** · commit `7070fb3` · soft-delete réversible + tabs + menu dropdown + style cartes archivées + migration ciblée des call sites de création (5 selects)
