# CARNET-ADRESSE — Annuaire contacts (parité Qalimo V2)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (4-6h)
**Détecté** : 2026-05-13 (validé important user — capture Qalimo V2)
**Lié à** : EMAIL-AUTO (livré v14.97) · ENT-FICHE-360 · LOG-FICHE-360 · BAILLEUR-FORM-RICHE

## Contexte
Demande utilisateur 2026-05-13 :
> 💬 « carnet d'adresse peut etre intéressant »

Capture Qalimo V2 — onglet sidebar "Carnet d'adresse" avec tableau de contacts (Prénom/nom, E-mail, Téléphone, Société) + bouton "Ajouter un contact".

## Cas d'usage

Aujourd'hui les contacts ImmoTrack sont **éclatés** dans plusieurs entités :
- `locataire` (dans bail)
- `garant` (dans bail)
- `bailleur` (dans entity)
- `copropriétaire` (dans entity)
- Mais PAS : syndics, comptables, notaires, plombiers, électriciens, diagnostiqueurs, banquiers, assureurs, voisins, etc.

→ Un **carnet d'adresse central** permet de centraliser TOUS les contacts qui gravitent autour d'un bailleur, avec liens vers les entités concernées.

## Scope

### Phase 1 — Modèle de données + onglet sidebar (~1h)
- Nouveau `DB.contacts[]` : `{id, prenom, nom, civilite, email, tel, mobile, societe, fonction, adresse, ville, cp, type, tags[], notes, liens: {entityIds[], logRefs[], bailRefs[]}, dateAjout, _modifiedAt}`
- **Types** prédéfinis (dropdown) :
  - Locataire (auto-créé depuis baux)
  - Garant
  - Bailleur (auto-créé depuis entités)
  - Copropriétaire
  - Syndic copropriété
  - Comptable / Expert-comptable
  - Notaire
  - Avocat
  - Banquier
  - Assureur (PNO/MRH)
  - Diagnostiqueur (DPE, CREP, etc.)
  - Artisan/Prestataire (plombier, électricien, peintre, etc.)
  - Voisin / Concierge / Gardien
  - Locataire ancien (archivé)
  - Autre
- **Tags** (multi-select libre) : pour catégoriser ("À recontacter", "Urgent", "Confiance haute", etc.)
- Nouvel onglet sidebar "Carnet d'adresse" (position : après Locataires, avant Mouvements ?)

### Phase 2 — UI tableau contacts (~1.5h)
- Tableau avec colonnes : Avatar initiales + Prénom/Nom + Type + Email + Téléphone + Société + Actions
- Recherche temps réel sur tous les champs
- Filtres : Type (multi) + Tags (multi)
- Tri : Nom A-Z, Date ajout récente
- Bouton primaire "+ Ajouter un contact"
- Click ligne → modale détail/édit
- Bouton "Exporter CSV" pour synchronisation externe

### Phase 3 — Liens bidirectionnels avec entités (~1.5h)
- Modale détail contact affiche : "Lié à : SCI Dupont · Logement F-001 · Bail BAIL-2024-001"
- Inversement, fiche bail/logement/entité affiche les contacts liés (ex : fiche logement → "Locataire : Jean Dupont [contact] · Garant : Marie [contact]")
- Auto-création : à la création d'un locataire/garant/bailleur dans un bail, le contact est ajouté automatiquement (avec flag `_autoCree: true`)
- Modifier le contact → propage vers les baux/entités liés (avec confirmation)

### Phase 4 — Intégration EMAIL-AUTO (~30min)
- Champ destinataire des emails (cf EMAIL-AUTO livré v14.97) : auto-complete depuis `DB.contacts[]`
- Ajout d'un contact directement depuis un email envoyé (ex bouton "+ Sauvegarder ce contact")

### Phase 5 — Import / Export (~30min)
- Export CSV (RFC 4180)
- Import CSV (mapping colonnes assisté)
- Format compatible Google Contacts / Apple Contacts pour synchronisation manuelle

### Phase 6 — Tests Vitest + mobile (~30min)
- `__tests__/helpers/contacts.test.js` :
  - `_creeContactDepuisLocataire(bail)` auto-création
  - `_propageContactVersBaux(contactId)` propagation modifications
  - `_dedupContacts(contacts)` détection doublons (même email OU même nom+téléphone)
- Tests 10+
- UI responsive mobile : cards verticales (cf MOBILE-AUDIT-ONGLETS)

## Décisions à prendre
- [ ] **Position sidebar** : après Locataires (parité Qalimo) OU dans sous-onglet Paramètres ?
  - Recommandation : **onglet sidebar dédié** (utilisé fréquemment, mérite top-level)
- [ ] **Auto-création** des contacts depuis baux/entités : oui ?
  - Recommandation : **oui** (sinon doublons saisie + lien cassé)
- [ ] **Dédoublonnage** : auto (même email) ou manuel (modale "fusionner avec contact existant ?") ?
  - Recommandation : **détection auto + modale confirmation** avant fusion
- [ ] **Sync Google/Apple Contacts** : V1 export/import CSV manuel, V2 SaaS API directe ?
  - Recommandation : V1 CSV, V2 si demande utilisateur

## Différenciant marché
| Solution | Carnet d'adresse |
|---|---|
| Rentila | ❌ |
| BailFacile | partial (contacts locataires seulement) |
| Qalimo V2 | ⭐ onglet dédié toutes catégories |
| ICS / Crypto (pro) | ✅ CRM intégré |
| **ImmoTrack après CARNET-ADRESSE** | ⭐ parité Qalimo + liens bidirectionnels baux/entités |

## Notes utilisateur
> 💬 2026-05-13 : « carnet d'adresse peut etre intéressant »

## Journal
- 2026-05-13 : créé · 14 types de contacts prédéfinis + tags + auto-création depuis baux/entités + liens bidirectionnels
