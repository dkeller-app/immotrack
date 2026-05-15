# LOG-ANNONCE — Bouton "Générer annonce" pour logements vacants (mode "qui fait rêver")

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (4-6h) + L (8-10h) si LLM
**Détecté** : 2026-05-01 · **Enrichi** : 2026-05-15 (mode Leboncoin évocateur)
**Lié à** : LOG-PHOTOS · BIZPLAN (différenciant pour propriétaires solo) · LEGAL-DPE-INTERDICTION-LOCATION (mention DPE F/G calendrier)

## Justification (4 critères pré-vol)

1. **Cible** : bailleurs solo + SCI — l'annonce attractive = re-loue plus vite = moins de vacance locative (ROI direct).
2. **Règles respectées** : simple d'utilisation + UX améliorée + différenciant net (concurrents = templates plats sans storytelling).
3. **Justifications multiples** :
   - 🧑 Cas user 2026-05-01 : « pour logement vacant avoir un bouton avec proposition d'annonce à poster »
   - 🧑 Cas user 2026-05-15 : « je voudrais ajouter une option pour générer une annonce (type leboncoin) qui fait rêver »
   - 💻 Code existant : champs déjà tous saisis (surface, pièces, équipements, DPE, loyer, photos) → ré-utilisation, pas de nouvelle DB
   - 📋 Backlog : LOG-ANNONCE existe en P2/M — enrichissement, pas duplication
   - 💰 Business : annonce évocatrice = délai re-loc réduit (étude marché : un titre + 3-4 mots-clés accrocheurs = +30% de clics Leboncoin)
4. **5 vues 360°** : axe UX (rédaction évocatrice) + axe commercial (différenciant fort vs concurrents) + axe cycle de vie (vacance → re-loc rapide)

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

### Phase 1 — Génération de texte (templating de base) ~3h
- [ ] Bouton "📝 Générer une annonce" dans la carte logement (visible si vacant uniquement)
- [ ] Modale avec :
  - [ ] Préview de l'annonce générée (texte + photos sélectionnées)
  - [ ] Boutons "Copier le texte" + "Télécharger PDF" + "Exporter Word"
  - [ ] Sliders pour ajuster **ton** (formel / amical / direct)
  - [ ] Sliders pour ajuster **style** (📋 Factuel / ✨ Évocateur "fait rêver") ← **NOUVEAU 2026-05-15**
  - [ ] Sélection des photos à inclure (cf `LOG-PHOTOS`)
- [ ] Templates par cible :
  - [ ] **Court** (~280 caractères, réseaux sociaux, mode factuel ou évocateur)
  - [ ] **Standard** (~1500 caractères, sites annonces classiques)
  - [ ] **Détaillé** (~3000 caractères, sites pros / colocation)
- [ ] Mentions légales obligatoires (auto-injectées) :
  - [ ] DPE (lettre + valeur) si DPE F/G : interdiction de location à partir de 2025/2028 (cf LEGAL-DPE-INTERDICTION-LOCATION, mentionner la date butoir)
  - [ ] Honoraires plafonds zone tendue / non tendue
  - [ ] Garanties demandées (caution, garant, RIB, etc.) selon infos bailleur
- [ ] Variables interpolées : `{{surface}}`, `{{ville}}`, `{{loyer}}`, etc.

### Phase 2 — Mode "Annonce qui fait rêver" (type Leboncoin évocateur) ~2-3h ← **NOUVEAU 2026-05-15**

#### 2.1 Rédaction évocatrice (storytelling)

**Principe** : passer de « 65m², 3 pièces, Paris 11 » → « ✨ Coup de cœur · 65m² baigné de lumière à deux pas de la Bastille »

**Banque de phrases accrocheuses** (sélection auto selon caractéristiques du bien) :
- **Titres** :
  - « ✨ Coup de cœur — {{type}} {{surface}}m² {{quartier}} »
  - « 🌿 Havre de paix — {{type}} {{surface}}m² {{quartier}} »
  - « 🏡 Charme de l'ancien — {{type}} {{surface}}m² {{quartier}} » (si bâtiment ancien)
  - « ☀️ Lumineux & traversant — {{type}} {{surface}}m² {{quartier}} » (si exposition sud/est-ouest)
  - « 🌆 Vue dégagée — {{type}} {{surface}}m² {{quartier}} » (si étage élevé)
  - « 🚇 Idéal pied-à-terre — {{type}} {{surface}}m² {{quartier}} » (si proche transports)
- **Accroches d'ouverture** :
  - « À deux pas de {{point_intérêt}}, ce {{type}} de {{surface}}m² vous séduira par {{atout1}} et {{atout2}}. »
  - « Coup de cœur garanti pour ce {{type}} {{adjectif}} au {{étage}}ème étage, idéalement situé {{quartier}}. »
  - « Niché au cœur de {{quartier}}, ce {{type}} de caractère offre {{atout1}}, {{atout2}} et {{atout3}}. »
- **Sections récurrentes** :
  - **Le bien** : description structurée pièce par pièce avec adjectifs ("séjour spacieux et lumineux", "cuisine ouverte équipée", "chambre cosy")
  - **Les atouts** : 3-5 bullet points (✓ exposition / ✓ étage / ✓ calme / ✓ équipement / ✓ proximité transports)
  - **Le quartier** : 2-3 phrases sur l'environnement (commerces à pied, écoles, parcs, métros)
  - **Pratique** : loyer, charges, DG, disponibilité, garanties demandées

**Banque d'adjectifs auto-injectés** (selon données du bien) :
| Donnée | Adjectif évocateur |
|---|---|
| Surface > 80m² | "spacieux", "généreux", "vaste" |
| Surface 50-80m² | "agréable", "fonctionnel" |
| Surface < 50m² | "cosy", "compact", "optimisé" |
| Étage ≥ 4 | "perché", "avec vue dégagée" |
| Étage 0-1 | "facile d'accès", "idéal seniors" |
| Exposition S/SO/SE | "baigné de lumière", "ensoleillé toute la journée" |
| Balcon | "avec extérieur privatif" |
| Jardin | "avec jardin privatif au calme" |
| DPE A/B/C | "performant énergétiquement" |
| DPE D | "consommation maîtrisée" |
| Cuisine équipée | "cuisine entièrement équipée" |
| Ancienneté > 100 ans | "bâtisse de caractère", "ancien rénové" |

**Règles de rédaction évocatrice** :
- ❌ JAMAIS de mensonge ou d'exagération (RGPD-friendly + risque litige loi Hoguet)
- ✅ Adjectifs choisis UNIQUEMENT si la donnée existe ET correspond
- ✅ Si DPE F/G → mention obligatoire honnête (pas masquée par le ton évocateur)
- ✅ Style "fait rêver" = mise en valeur de l'existant, pas embellissement faux

#### 2.2 Mise en page visuelle type Leboncoin

**Layout HTML de l'annonce générée** :
```
┌─────────────────────────────────────────────┐
│  [PHOTO COUVERTURE — la plus belle]         │
│  ✨ Coup de cœur · Appartement 65m²         │
│  Paris 11e · 1 850 € CC                     │
│                                             │
│  🚇 Métro Bastille (3min) · 🛏️ 2 chambres   │
│  ☀️ Plein sud · 🌿 Balcon · 📐 5ème étage   │
│                                             │
│  ───────── LE BIEN ─────────                │
│  Niché au cœur du 11e arrondissement…       │
│                                             │
│  ───────── LES ATOUTS ─────────             │
│  ✓ Exposition plein sud (lumière toute la   │
│    journée)                                 │
│  ✓ 5ème étage avec ascenseur                │
│  ✓ Balcon privatif côté cour                │
│  ✓ Cuisine entièrement équipée              │
│  ✓ Cave + parking en option                 │
│                                             │
│  ───────── LE QUARTIER ─────────            │
│  Quartier vivant et commerçant…             │
│                                             │
│  ───────── PRATIQUE ─────────               │
│  Loyer : 1 700 € HC + 150 € charges         │
│  Dépôt de garantie : 1 700 €                │
│  Disponibilité : 1er juin 2026              │
│  Garanties : caution solidaire ou Visale    │
│  DPE : C (175 kWh/m²/an)                    │
│                                             │
│  [PHOTOS — vignettes 4 par ligne]           │
└─────────────────────────────────────────────┘
```

**Composants UI** :
- En-tête : titre évocateur + ville + prix CC en gros
- Bandeau mots-clés : 4-6 chips emoji + texte court
- 4 sections balisées (Le bien / Les atouts / Le quartier / Pratique)
- Galerie photos avec ordre intelligent (cf 2.3)

#### 2.3 Stratégie de sélection et d'ordonnancement des photos

**Ordre recommandé** (auto-trié si photos taguées dans LOG-PHOTOS) :
1. **Photo couverture** : la plus large + claire + lumière du jour (pas de pluie/nuit)
2. **Vue extérieure** (façade, immeuble) — situe le contexte
3. **Séjour** (la pièce de vie principale)
4. **Cuisine** (souvent le critère décisif)
5. **Chambres** (par ordre de surface décroissante)
6. **Salle de bain** / WC
7. **Annexes** : balcon, terrasse, jardin, cave, parking
8. **Plan / mesures** (si dispo)

**Recommandations UX** :
- Bannière info au-dessus de la galerie : « 💡 Astuce : la première photo génère 80% des clics — choisissez la plus lumineuse »
- Bouton « 🔄 Trier auto » + drag&drop pour réordonner manuel
- Filtre « photos en lumière naturelle » (V2 si reconnaissance EXIF)

#### 2.4 Variables enrichies (auto-injectées)

Ajout aux variables existantes (Phase 1) :
- `{{quartier}}` : déduit de l'adresse (V1 : ville + arrondissement si Paris/Lyon/Marseille; V2 : API géocodage pour quartiers)
- `{{points_intérêt}}` : ✋ NON saisi en DB actuellement → V2 (carte/POI)
- `{{exposition}}` : depuis champ orientation (N/S/E/O/NE/NO/SE/SO) → "plein sud", "double exposition est-ouest"
- `{{étage_label}}` : "rez-de-chaussée" / "1er étage" / "5ème étage avec ascenseur"
- `{{disponibilité_label}}` : "Libre immédiatement" / "Disponible au 1er juin 2026"
- `{{garanties_label}}` : "Caution solidaire ou Visale" / "Garant ou GLI" selon profil bailleur (cf USER-PROFILE-FILTERS)

### Phase 3 — Templates personnalisables (P3) ~2h
- [ ] L'utilisateur peut éditer ses propres templates (comme l'éditeur de bail)
- [ ] Variables disponibles documentées
- [ ] Importer / exporter templates
- [ ] Toggle "verrouiller le ton évocateur ImmoTrack" vs "template libre"

### Phase 4 — Génération LLM (optionnel V2) ~3-4h — cf [IA-V2](IA-V2.md) UC4
- [ ] Si l'utilisateur active **ImmoTrack Pro Connect** (LLM Claude API ou OpenAI) :
  - [ ] Envoyer les caractéristiques structurées du bien à l'API
  - [ ] Récupérer une description évocatrice sur mesure (250-400 mots)
  - [ ] Coût estimé : ~0.01€ par annonce (Claude Haiku ou GPT-4o-mini)
  - [ ] Toggle "Régénérer (variation)" pour avoir 3-4 propositions
- [ ] **Sans LLM** : le templating Phase 2 produit déjà une annonce de qualité (banque de phrases + adjectifs auto)
- [ ] **Avec LLM** : annonce ultra-personnalisée, ton ajustable au-delà des sliders, intégration POI/quartier riche

### Phase 5 — Publication directe (P3 / V2) ~?h
- [ ] **APIs / formulaires pré-remplis** vers les portails majeurs si APIs publiques disponibles
- [ ] LeBonCoin n'a pas d'API publique → copier-coller manuel (bouton "Copier" optimisé)
- [ ] SeLoger / PAP / Logic-Immo : à étudier (probablement payant B2B)
- [ ] Facebook Marketplace : pas d'API → copier-coller
- [ ] Réalistement : Phase 1 + Phase 2 suffisent pour V1, l'utilisateur copie-colle dans le portail de son choix

## Décisions à prendre

- [x] **Mode évocateur en Phase 2 (V1.1)** : décidé 2026-05-15 — banque de phrases + adjectifs auto, **pas de LLM en V1** (zéro coût récurrent, contrôle qualité maîtrisé)
- [x] **LLM en Phase 4 (V2 Pro Connect)** : optionnel, payant, après commercialisation V1
- [ ] Banque de phrases : combien de variantes par accroche/titre/section (3, 5, 10) ?
  - → Recommandation : 5 variantes par slot = ~3000 combinaisons possibles → annonce unique à chaque génération
- [ ] Garde-fou anti-mensonge : checkbox utilisateur « j'ai vérifié l'exactitude » avant export ?
  - → Recommandation : oui, case obligatoire avant "Télécharger PDF" / "Copier le texte" (protection litige)
- [ ] DPE F/G : peut-on quand même utiliser le mode évocateur ?
  - → Recommandation : OUI mais bandeau rouge en haut « ⚠️ DPE F (375 kWh) — interdiction de location au 1er janvier 2028 » + adjectifs énergie interdits (pas de "consommation maîtrisée")

## Différenciant vs concurrents

| Solution | Génération annonce | Mode évocateur | Mise en page visuelle | LLM intégré |
|---|---|---|---|---|
| Rentila | ❌ | ❌ | ❌ | ❌ |
| BailFacile | ❌ | ❌ | ❌ | ❌ |
| Qalimo V2 | ❌ | ❌ | ❌ | ❌ |
| ImmoTrack Phase 1 | ✅ Templates | ❌ Factuel | ❌ Texte plat | ❌ |
| **ImmoTrack Phase 2** | ✅ Templates | ✅ **Évocateur Leboncoin** | ✅ **Sections balisées** | ❌ (V1) |
| ImmoTrack Phase 4 | ✅ | ✅ | ✅ | ✅ Pro Connect (V2) |

→ Différenciant **net** pour ImmoTrack : « Votre logement vacant ? Une annonce qui fait rêver, prête en 1 clic. »

## Architecture proposée

**Fichiers à créer/modifier** :
- `index-test.html` (sandbox) : ajout boutton + modale + helpers de génération
- `__tests__/helpers/annonce-generator.test.js` (Vitest) : test des helpers de templating
- Nouveau helper interne `_genererAnnonceEvocatrice(logement, options)` qui retourne `{ titre, accroche, sections, photosOrdered, mentionsLegales }`
- Bannière info DPE F/G via `_dpeInterditLocationAuDate` existant (LEGAL-DPE-INTERDICTION-LOCATION)

**Pas de migration DB** : tous les champs sont déjà saisis.

## Notes utilisateur
> 💬 2026-05-01 : « pour logement vacant avoir un bouton avec proposition d'annonce à poster »
> 💬 2026-05-15 : « je voudrais ajouter une option pour générer une annonce (type leboncoin) qui fait rêver »

## Journal
- 2026-05-01 : créé · différenciant marketing fort · couple naturel avec LOG-PHOTOS
- 2026-05-15 : **enrichi** mode "Annonce qui fait rêver" type Leboncoin (Phase 2) : banque de phrases évocatrices + adjectifs auto-injectés selon données du bien + mise en page visuelle balisée + stratégie ordonnancement photos + Phase 4 LLM optionnelle V2. Décisions : pas de LLM en V1 (zéro coût), garde-fou anti-mensonge, DPE F/G honnête.
