# LOG-ANNONCE — Bouton "Générer annonce" pour logements vacants

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M
**Détecté** : 2026-05-01
**Lié à** : LOG-PHOTOS · BIZPLAN (différenciant pour propriétaires solo)

## Contexte
Sur un logement **en vacance locative** (pas de bail actif), proposer un bouton **"Générer une annonce de location"** qui produit automatiquement une annonce prête à poster sur les sites de petites annonces (LeBonCoin, SeLoger, PAP, Facebook Marketplace, ImmoJeune, Studapart, etc.).

L'annonce est générée à partir des infos déjà saisies dans ImmoTrack :
- **Adresse / quartier** (ville, CP — adresse précise masquée par défaut, optionnelle)
- **Caractéristiques** : surface (m²), nombre de pièces, étage, ascenseur, balcon, parking, cave, jardin
- **Équipements** (cf onglet Équipements : cuisine équipée, lave-linge, frigo, etc.)
- **DPE** (lettre + valeur kWh/m²/an)
- **Loyer HC + charges + dépôt de garantie** (depuis le dernier bail signé ou saisis manuellement)
- **Photos** (cf `LOG-PHOTOS`)
- **Disponibilité** (date de libération calculée depuis la sortie du locataire actuel)

## Scope

### Phase 1 — Génération de texte
- [ ] Bouton "📝 Générer une annonce" dans la carte logement (visible si vacant uniquement)
- [ ] Modale avec :
  - [ ] Préview de l'annonce générée (texte + photos sélectionnées)
  - [ ] Boutons "Copier le texte" + "Télécharger PDF"
  - [ ] Sliders pour ajuster ton (formel / amical / direct)
  - [ ] Sélection des photos à inclure (cf `LOG-PHOTOS`)
- [ ] Templates par cible :
  - [ ] **Court** (~280 caractères, réseaux sociaux)
  - [ ] **Standard** (~1500 caractères, sites annonces classiques)
  - [ ] **Détaillé** (~3000 caractères, sites pros / colocation)
- [ ] Mentions légales obligatoires :
  - [ ] DPE (lettre + valeur) si DPE F/G : interdiction de location à partir de 2025/2028 (cf IRL-DPE-FG, mentionner la date butoir)
  - [ ] Honoraires plafonds zone tendue / non tendue
  - [ ] Garanties demandées (caution, garant, RIB, etc.) selon infos bailleur
- [ ] Variables interpolées : `{{surface}}`, `{{ville}}`, `{{loyer}}`, etc.

### Phase 2 — Templates personnalisables (P3)
- [ ] L'utilisateur peut éditer ses propres templates (comme l'éditeur de bail)
- [ ] Variables disponibles documentées
- [ ] Importer / exporter templates

### Phase 3 — Publication directe (P3 / V2)
- [ ] **APIs / formulaires pré-remplis** vers les portails majeurs si APIs publiques disponibles
- [ ] LeBonCoin n'a pas d'API publique (à confirmer) → copier-coller manuel
- [ ] SeLoger / PAP / Logic-Immo : à étudier
- [ ] Réalistement : Phase 1 + Phase 2 suffisent pour V1, l'utilisateur copie-colle dans le portail de son choix

## Différenciant vs concurrents
- **Rentila / BailFacile / Qalimo** : pas de génération d'annonce automatique côté connaissance
- **ImmobilierLoyer** : à vérifier
- **Solutions agences (ICS, etc.)** : oui mais pour pros, pas pour particuliers
- → Différenciant net pour ImmoTrack : "votre logement vacant ? annonce prête en 1 clic"

## Décisions à prendre
- [ ] Templates par défaut : combien (1, 3, 5) et lesquels ?
- [ ] Préciser la liste des portails cibles (annonce optimisée pour SeLoger ≠ Facebook Marketplace)
- [ ] LLM-generated description (via API) ou pure templating Mustache-like ? → Templating en V1 (pas de coût API), LLM en option V2

## Notes utilisateur
> 💬 2026-05-01 : "pour logement vacant avoir un bouton avec proposition d'annonce à poster"

## Journal
- 2026-05-01 : créé · différenciant marketing fort · couple naturel avec LOG-PHOTOS
