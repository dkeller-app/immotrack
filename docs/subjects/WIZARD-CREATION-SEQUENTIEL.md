# WIZARD-CREATION-SEQUENTIEL — Suite logique guidée Immeuble → Bien → Bail

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (~4-6h)
**Détecté** : 2026-05-25 (user : « quand on créé un immeuble ou bien, il faudrait avoir une suite logique (immeuble → biens → baux) pour que l'utilisateur puisse avoir une vraie expérience et utilisation »)
**Lié à** : ARCHI-IMM-LOG-DEDUP · ARCHI-DB-DOUBLONS · NAV-LOGEMENT-BAIL-CLARIF · BAILLEUR-FORM-RICHE · ONBOARDING-PREMIERE-CONNEXION · BUG-CRITIQUES-2026-05-25 (3.C)

## Justification (4 critères pré-vol)

1. **Cible** : nouveaux utilisateurs (onboarding) + bailleurs qui ajoutent un nouveau patrimoine — réduire l'effet « page blanche »
2. **Règles** : non bloquant (skippable à chaque étape), respecte la hiérarchie métier (entité → immeuble → bien → bail)
3. **Justifications** :
   - 🧑 Cas user 2026-05-25 : « il faudrait avoir une suite logique »
   - 💻 Code existant : chaque création est isolée (modale immeuble, modale bien, modale bail séparées) — aucun enchaînement
   - 📋 Backlog : croise ONBOARDING (1ʳᵉ connexion) + ARCHI-IMM-LOG-DEDUP (hiérarchie de saisie)
4. **5 vues 360°** : UX (parcours guidé) + commercial (onboarding fluide) + données (hiérarchie respectée à la création)

## Constat

Aujourd'hui pour créer un nouveau patrimoine, l'utilisateur doit :
1. Aller dans Entités → créer entité
2. Aller dans Immeubles → créer immeuble (lié à l'entité, manuellement)
3. Aller dans Logements → créer logement (lié à l'immeuble, manuellement)
4. Aller dans Baux → créer bail (lié au logement, manuellement)

→ 4 onglets, 4 modales, aucune progression naturelle, friction maximale.

## Solution cible

Wizard de création **séquentiel** avec progression visible : après chaque étape réussie, l'app propose explicitement (mais sans forcer) l'étape suivante.

```
Créer un immeuble ✓
   ↓ « Voulez-vous ajouter un bien dans cet immeuble ? » [+ Bien] [Plus tard]
Créer un bien ✓
   ↓ « Voulez-vous créer un bail sur ce bien ? » [+ Bail] [Plus tard]
Créer un bail ✓
   ↓ « 🎉 Patrimoine enregistré. » [Voir la fiche] [+ Bien suivant]
```

À chaque étape :
- Pré-remplissage automatique des liens (l'immeuble créé est sélectionné pour le bien suivant ; le bien créé est sélectionné pour le bail)
- Bouton « Plus tard » qui sauvegarde et clôt sans forcer
- Indicateur de progression léger en haut de la modale (« Étape 2/3 — Bien »)

## Scope (proposé)

### Phase 1 — Suite Immeuble → Bien (~1.5h)
- Après save immeuble : popup proposition « + Ajouter un bien »
- Si accepté : ouvre modale création bien avec immeuble pré-sélectionné

### Phase 2 — Suite Bien → Bail (~1.5h)
- Après save bien : popup proposition « + Créer un bail » (si bien marqué « à louer »)
- Si accepté : ouvre wizard bail avec logement pré-sélectionné
- **Fix BUG 3.A en passant** : aujourd'hui le bouton « Créer bail » sur la fiche logement « dirige vers le bien » au lieu d'ouvrir le wizard. Ce sujet règle ce câblage.

### Phase 3 — Suite Bail → suivant (~30min)
- Après save bail : « 🎉 Bien loué enregistré » + choix [Voir la fiche] / [+ Bien suivant dans le même immeuble] / [Terminé]

### Phase 4 — Onboarding 1ʳᵉ connexion : déclencheur du wizard (~30min)
- Si DB vide (vrai nouvel utilisateur, pas de démo) → bouton « Démarrer : ajouter mon premier bien » qui lance le wizard complet entité → immeuble → bien → bail
- Couple avec ONBOARDING-PREMIERE-CONNEXION

### Phase 5 — Tests + responsive (~30min)
- Tests : enchaînement complet, abandon à chaque étape, pré-remplissage des liens
- 3 formats (PC/tablette/téléphone) — sur mobile : bottom-sheet plutôt que modale centrée

## Décisions à arbitrer

- [ ] **D1** : forcer l'enchaînement (modale séquentielle) ou proposer (popup après save) ?
  - → Reco : **proposer** (non bloquant, respect du flux). Mode forcé activé seulement pour le wizard initial (DB vide).
- [ ] **D2** : entité dans le wizard initial ? (généralement déjà créée — on commence à immeuble la plupart du temps)
- [ ] **D3** : sur mobile : wizard plein écran ou popup contextuel ?

## Coordination

⚠️ À traiter conjointement avec :
- **ARCHI-IMM-LOG-DEDUP** : la création doit refléter la hiérarchie déduplique (saisir l'adresse 1 fois côté immeuble)
- **ARCHI-DB-DOUBLONS** : séparation log/bail (créer un bail ≠ saisir locataire dans le bien)
- **NAV-LOGEMENT-BAIL-CLARIF** : flow « le mur » → « la personne »
- **ONBOARDING-PREMIERE-CONNEXION** : déclencheur du wizard initial

## Notes utilisateur

> 💬 2026-05-25 : « quand on créé un immeuble ou bien, il faudrait avoir une suite logique (immeuble → biens → baux) pour que l'utilisateur puisse avoir une vraie expérience et utilisation »

## Journal

- 2026-05-25 : créé · wizard séquentiel Immeuble → Bien → Bail · propose (pas force) chaque étape suivante · pré-remplissage des liens · règle au passage le BUG 3.A (bouton créer bail mal câblé) · couple avec ARCHI-IMM-LOG-DEDUP + ARCHI-DB-DOUBLONS + ONBOARDING
