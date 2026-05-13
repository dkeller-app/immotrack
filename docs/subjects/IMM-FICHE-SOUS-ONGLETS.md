# IMM-FICHE-SOUS-ONGLETS — Sous-onglets riches dans fiche immeuble (parité Qalimo V2)

**Status** : ⬜ À faire — RE-PRIORISÉ P3 2026-05-13 · **Prio** : P3 (re-scope minimal) · **Taille** : S (1-2h re-scope)

## ⚠️ Verdict honnête 2026-05-13 (filtre `feedback_pas_copier_concurrent.md`)

Sur les 7 sous-onglets Qalimo, **5 sont des doublons** avec d'autres sujets ImmoTrack :
- Biens actifs/archivés → LOG-LISTE-CARDS sait filtrer par immeuble ✅ couvert
- Documents → DRIVE-ARBORESCENCE ✅ couvert
- Comptabilité → filtre par immeuble dans Mouvements ✅ couvert
- Entretien → TRAV-SUIVI ✅ couvert

**Vraie valeur unique** : seulement **compteurs collectifs + paramètres copropriété** (tantièmes, syndic) — utile pour copropriété, rare chez bailleur particulier ImmoTrack cible.

→ Re-scope **P3 / 1-2h** : ajouter section "Copropriété" dans IMM-FICHE-360 existant avec compteurs collectifs + champ syndic + champ tantièmes. Pas de refonte 7 sous-onglets.
**Détecté** : 2026-05-13 (capture Qalimo V2 fiche immeuble Damelevières)
**Lié à** : IMM-FICHE-360 (Phase 1 livrée v14.x) · LOG-FICHE-360 · LOG-PHOTOS · DRIVE-ARBORESCENCE · TRAV-SUIVI · BAILLEUR-DIAGNOSTICS-DDT

## Contexte
Demande utilisateur 2026-05-13 (capture Qalimo V2 fiche immeuble Damelevières — 7 sous-onglets riches).

## Référence Qalimo V2 — Fiche Immeuble

**Header** :
- Photo immeuble pleine largeur (16:9) + bouton "+ Ajouter une photo"
- Bouton retour + Modifier + Ajouter un bien
- Nom : "Damelevières"
- Bailleur cliquable : "SCI DD2AMELEVIERES" (avatar + lien)

**7 sous-onglets internes** :
1. **Biens actifs** (par défaut) : grid de cartes logements avec photos + badges Vide/Habitation + loyer
2. **Biens archivés** : idem mais filtré
3. **Documents** : PDFs liés à l'immeuble (acte propriété, règlement copro, AG, charges syndic)
4. **Comptabilité** : mouvements consolidés immeuble (loyers + charges + travaux + sortants)
5. **Compteurs** : compteurs collectifs (eau froide, eau chaude, gaz, électricité communes)
6. **Entretien** : tâches récurrentes immeuble (ramonage collectif, ascenseur, VMC collective)
7. **Paramètres** : règlement copro, syndic, charges récupérables, tantièmes, etc.

## Scope

### Phase 1 — Header enrichi (~1h)
- Photo immeuble (réutilise pattern LOG-PHOTOS, sous-dossier Drive `Documents/Photos-immeuble/`)
- Si pas de photo : placeholder dégradé + bouton "+ Ajouter une photo"
- Photo cliquable → lightbox plein écran
- Bouton "Modifier" (existe) + "Ajouter un bien" dans cet immeuble (existe)
- Bailleur cliquable → navigation vers ENT-FICHE-360

### Phase 2 — Sous-onglets 1 & 2 — Biens actifs/archivés (~1h)
- Réutiliser pattern LOG-LISTE-CARDS (livré v14.2) en filtré par `logement.imm === immeuble.nom`
- Tabs Actifs (par défaut) / Archivés avec compteurs
- Click carte → LOG-FICHE-360 du bien

### Phase 3 — Sous-onglet Documents (~1.5h)
- Liste documents Drive du sous-dossier `Documents/Immeuble/` (cf DRIVE-ARBORESCENCE, structure à finaliser)
- Catégories : Acte propriété, Règlement copro, PV AG copro, Travaux gros œuvre, Diagnostic immeuble (DPE immeuble si collectif), Assurance immeuble
- Drag-drop upload + génération liste auto avec date + taille + bouton "Ouvrir dans Drive"
- Cf pattern DOC-PJ pour réutilisation infra

### Phase 4 — Sous-onglet Comptabilité (~1h)
- Tableau des mouvements catégorisés "Immeuble" (charges communes, travaux gros œuvre, taxe foncière immeuble) OU consolidation auto des mouvements de tous les logements
- Filtre temporel (mois/trimestre/année)
- Export CSV / FEC (réutilise EXPORT-COMPTABLE livré v14.93)

### Phase 5 — Sous-onglet Compteurs (~1.5h)
- Compteurs **collectifs** (différent des compteurs individuels par logement) :
  - Eau froide commune (arrosage, lavage parties communes)
  - Eau chaude collective
  - Gaz collectif
  - Électricité parties communes
- Saisie relevés mensuels/trimestriels
- Graphique conso évolution
- Lien régularisation charges collectives (cf BAIL-CHARGES-DETAIL + CHARGE-REGLES)

### Phase 6 — Sous-onglet Entretien (~1h)
- Liste tâches récurrentes immeuble :
  - Ascenseur (mensuel + contrôle technique 5 ans, cf BAILLEUR-DIAGNOSTICS-DDT)
  - VMC collective (3 ans)
  - Chaufferie collective (annuel)
  - Ramonage conduits collectifs (annuel)
  - Toiture (visuelle annuelle + détaillée 5 ans)
  - Façade (10 ans)
  - Citerne fioul collective (5 ans)
- Calendrier visuel + alertes (réutilise TRAV-SUIVI)

### Phase 7 — Sous-onglet Paramètres (~1h)
- Règlement copropriété : oui/non + date + PDF (lien Drive)
- Syndic : nom + contact + n° contrat
- Tantièmes : tableau des quote-parts par logement (somme = 10000)
- Charges récupérables collectives : liste des postes éligibles (cf BAIL-CHARGES-DETAIL)
- Année construction + permis (cf BAILLEUR-DIAGNOSTICS-DDT pour auto-N/A des diagnostics)

### Phase 8 — Tests + mobile (~30min)
- Tests Vitest sur helpers de filtrage (logements par immeuble, mouvements par immeuble)
- UI responsive : sous-onglets en chips scrollables horizontalement sur mobile (cf MOBILE-AUDIT-ONGLETS)

## Décisions à prendre
- [ ] **Tantièmes** : saisie manuelle ou calcul auto depuis surface logements (m² rapporté au total) ?
  - Recommandation : **manuel** (les tantièmes officiels copro ne sont pas forcément basés sur la surface)
- [ ] **Compteurs collectifs** : créer entité dédiée OU réutiliser `DB.compteurs` filtré par scope immeuble ?
  - Recommandation : réutiliser avec champ `scope: 'logement'|'immeuble'`
- [ ] **Entretien immeuble** : lien direct avec TRAV-SUIVI ou onglet autonome ?
  - Recommandation : lien direct (1 module, 2 vues : Logement vs Immeuble)

## Différenciant marché
| Solution | Sous-onglets fiche immeuble |
|---|---|
| Rentila | minimaliste |
| BailFacile | 3-4 sections |
| Qalimo V2 | ⭐ 7 sous-onglets riches |
| **ImmoTrack après IMM-FICHE-SOUS-ONGLETS** | 7 sous-onglets parité Qalimo + intégration TRAV-SUIVI |

## Notes utilisateur
> 💬 2026-05-13 : capture Qalimo V2 fiche immeuble Damelevières avec 7 sous-onglets

## Journal
- 2026-05-13 : créé · enrichissement IMM-FICHE-360 Phase 2 avec 7 sous-onglets parité Qalimo
