# LOG-FICHE-360 — Vue 360° consolidée par bien (à la Qalimo)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : L (1-3 jours)
**Détecté** : 2026-05-01
**Lié à** : V3-VISUEL · V3-REFONTE-EQUIP · LOG-PHOTOS · LOG-ANNONCE · DOC-PJ · TRAV-SUIVI · BIZPLAN

## Contexte
Demande utilisateur 2026-05-01 (avec capture Qalimo) :
> 💬 « qalimo a un onglet bien qui regroupe toutes les informations du bien. Utile ? »

Pattern observé chez **toutes les solutions pro** (ICS, Crypto, Sequentiel, BailFacile, Qalimo, Smovin) : sur un clic d'un bien, l'utilisateur arrive sur une **fiche 360° consolidée** avec sous-onglets internes (Général / Documents / Candidats / EDL / Compta / Compteurs / Entretien…).

**Manque critique d'ImmoTrack** : l'app est organisée **par fonction** (onglets Logements / Baux / Mouvements / EDL séparés). Pour avoir la vue d'un bien précis, l'utilisateur doit naviguer dans 5 onglets et appliquer 5 filtres. Frustrant pour un investisseur 5-10 biens.

**Bonne nouvelle** : toute la donnée existe déjà dans ImmoTrack. C'est juste une **refonte UX d'agrégation**, pas un nouveau modèle de données.

## Référence : capture Qalimo (2026-05-01)
Vue fiche bien Qalimo :
- **Header** : galerie photos (1 grande + 4 thumbnails + "+15"), nom du bien, adresse, badge bailleur
- **Sous-onglets** : Général · Documents · Candidats · État des lieux · Comptabilité · Compteurs · Entretien
- **Sous-onglet Général** : panneau "Locataire actuel" (avatar, nom, loyer, date bail, statut impayé) + panneau "Condition du bail" (loyer perçu, répartition loyer/charges/TVA, dépôt de garantie, type de bail)

## Scope

### Phase 1 — Vue agrégée minimale (P1 / S, ~3-5h)
**Objectif** : sur clic d'un bien dans Logements, ouvrir une fiche dédiée full-page avec ce qu'on a déjà.

- [ ] Route / vue `#log-fiche-{id}` ou modale full-screen (à arbitrer)
- [ ] Header : nom bien + adresse + badge entité bailleur + photos (cf `LOG-PHOTOS` quand livré)
- [ ] Onglet "Général" : 2 panneaux
  - Locataire actuel (depuis bail en cours) : nom, loyer, date début/fin, statut paiement
  - Conditions du bail : loyer HC + charges + TVA, DG, type bail, IRL prochaine révision
- [ ] Bouton "Modifier" → ouvre form édition logement existant
- [ ] Bouton "Retour" → retour à la liste logements

### Phase 2 — Sous-onglets internes (P1 / M, ~5-8h)
- [ ] **Documents** : tous les PDFs liés (bail signé, EDL entrée, EDL sortie, lettres IRL, quittances) → réutilise `DOC-PJ`
- [ ] **Candidats** : 🆕 nouveau concept — pipeline de prospects locataires (à classer en sujet `LOG-CANDIDATS` séparé)
- [ ] **État des lieux** : liste des EDL passés (entrée/sortie) avec accès direct
- [ ] **Comptabilité** : tableau des mouvements filtrés sur ce bien (loyers, charges, travaux, sortants)
- [ ] **Compteurs** : relevés conso (élec, gaz, eau froide, eau chaude) chronologiques + graphique évolution
- [ ] **Entretien** : tâches d'entretien programmées + historique (réutilise `TRAV-SUIVI`)

### Phase 3 — Polish UX (P2 / S)
- [ ] Sticky header (header bien reste visible en scrollant les sous-onglets)
- [ ] Breadcrumb (Logements > Bien X > Sous-onglet)
- [ ] Mobile : sous-onglets en chips scrollables horizontalement
- [ ] Dark mode validé (cf `feedback_design_consistency`)
- [ ] Keyboard nav (← → entre sous-onglets, Esc retour liste)

## Sous-sujet à classer séparément
**LOG-CANDIDATS** (P2 / M) — Pipeline candidats locataires :
- Liste de prospects intéressés par le bien
- Statuts : "Candidature reçue" / "Dossier en cours" / "Dossier validé" / "Bail en attente signature"
- Lien vers création d'un bail à partir d'un candidat
- Couple naturel avec `LOG-ANNONCE` (annonce générée → candidatures arrivent → entrent dans le pipeline)

→ À créer comme sujet séparé après avoir attaqué LOG-FICHE-360 Phase 1.

## Décisions à prendre
- [ ] **Modale full-screen ou route dédiée** ? Route dédiée = bookmarkable, partageable. Modale = plus rapide, retour facile. → Recommandation : route dédiée `#log-fiche-{id}` pour l'effet pro
- [ ] **Phase 1 d'abord (vue minimale fonctionnelle)** ou tout d'un coup ? → Phase 1 d'abord, validate avec utilisateur, puis Phase 2 incrémentalement
- [ ] **Position dans la roadmap** : avant ou après MOBILE-AUDIT-ONGLETS ? → MOBILE-AUDIT après, car cette nouvelle vue doit déjà être mobile-clean dès la livraison

## Différenciant vs concurrents
| Concurrent | Vue 360° bien | Sous-onglets riches |
|---|---|---|
| Qalimo | ✅ | ✅ (7) |
| BailFacile | ✅ | ✅ (5-6) |
| Rentila | partiel | partiel |
| Smovin | ✅ | ✅ |
| ICS / Crypto (pro) | ✅ | ✅ (10+) |
| **ImmoTrack actuel** | ❌ | ❌ |
| **ImmoTrack après LOG-FICHE-360** | ✅ | ✅ (~7) |

→ Combler ce manque = condition nécessaire pour V1 commerciale crédible. Sans cette vue, ImmoTrack paraît "amateur" comparé à Qalimo/BailFacile.

## Lien avec autres sujets
- `LOG-PHOTOS` : alimente le header galerie photos
- `LOG-ANNONCE` : bouton "Générer annonce" visible sur cette fiche si bien vacant
- `DOC-PJ` : alimente le sous-onglet Documents
- `TRAV-SUIVI` : alimente le sous-onglet Entretien
- `V3-REFONTE-EQUIP` : sous-onglet Équipements à inclure (bonus vs Qalimo)
- `MOBILE-AUDIT-ONGLETS` : cette nouvelle vue à intégrer dans l'audit mobile

## Notes utilisateur
> 💬 2026-05-01 : "qalimo a un onglet bien qui regroupe toutes les informations du bien. Utile ?" (capture Qalimo fournie)

## Journal
- 2026-05-01 : créé · P1 car comble un manque UX critique pour V1 commerciale (parité avec solutions pro)
