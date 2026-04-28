# BAIL-CLAUSES-PERSO — Clauses particulières personnalisables (par entité ou bail)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S (1-2h)
**Détecté** : 2026-04-29
**Lié à** : BAIL-PRINT-POLISH (livré v13.05-13.29) · V3-REFONTE-BAIL

## Contexte

Suite à la livraison de BAIL-PRINT-POLISH v13.29 (refonte UX éditeur template avec mode lecture par défaut + mode avancé caché), l'utilisateur a posé la question :

> 💬 2026-04-29 : "est-ce que tu sais n'afficher que le template que l'utilisateur pourrait modifier ? ou ajouter des § ?"

Deux options analysées :

### Option A — Filtrage du template HTML brut (déconseillée)

Faisable mais peu pertinent : le template HTML legacy (`DB.templates.bail`) sert UNIQUEMENT à l'export Word depuis v13.05 (l'aperçu HTML et le PDF natif utilisent désormais `buildBailStructure` data-driven). Modifier le template Word ne synchronise pas avec les autres surfaces. De plus, la majorité des paragraphes sont juridiquement intouchables (loi 89-462).

### Option B — Clauses personnalisées (ajouts) ⭐ RECOMMANDÉE

Permettre d'AJOUTER ses propres clauses sans toucher au template structurel. Cas d'usage typiques :
- Interdiction d'animaux
- Charges supplémentaires (entretien jardin, etc.)
- Règlement de copropriété spécifique
- Modalités particulières (envoi quittances email, etc.)

## Scope

### 2 niveaux possibles

| Niveau | Stockage | Cas d'usage |
|---|---|---|
| **Par entité** | `entite.customClauses` | Clauses partagées par tous les baux de l'entité (règlement immeuble, animaux, etc.) |
| **Par bail** | `bail.customClauses` | Clauses spécifiques à un bail individuel (modalités particulières) |

**Recommandation** : commencer par **par entité** (couvre 95% des cas). Ajouter "par bail" plus tard si besoin.

### UI cible (Modifier entité, Paramètres > Entités)

Nouvelle section après "Logo entité" :

```
📝 Clauses particulières                              [+ Ajouter clause]
─────────────────────────────────────────────────────────────────
Ces clauses s'ajoutent automatiquement à TOUS les baux de cette entité,
dans une section "16 bis — Clauses particulières".

┌─ Clause 1 ────────────────────────────────────────────────[✕]
│ Titre : [Interdiction d'animaux                         ]
│ Contenu : [La présence d'animaux est strictement       ]
│           [interdite, à l'exception des animaux        ]
│           [d'assistance reconnus.                       ]
└──────────────────────────────────────────────────────────────

┌─ Clause 2 ────────────────────────────────────────────────[✕]
│ Titre : [Entretien jardin                               ]
│ Contenu : [...]
└──────────────────────────────────────────────────────────────
```

### Modèle de données

```js
entite.customClauses = [
  { titre: 'Interdiction d\'animaux', contenu: 'La présence d\'animaux...' },
  { titre: 'Entretien jardin', contenu: 'Le locataire prend à sa charge...' }
];
```

### Injection dans le bail

Position : **après §16 Dispositions diverses, avant §17 Annexes obligatoires**.

Format dans `buildBailStructure` :
```js
if (ent.customClauses && ent.customClauses.length) {
  out.push({ type:'h2', text:'16 BIS — CLAUSES PARTICULIÈRES (propres au bailleur)' });
  ent.customClauses.forEach(c => {
    if (c.titre) out.push({ type:'h3', text: c.titre });
    if (c.contenu) out.push({ type:'p', text: c.contenu });
  });
}
```

### 3 surfaces à couvrir

1. **HTML aperçu** (👁 Aperçu) — automatique via blockToHTML (h2/h3/p déjà supportés)
2. **PDF natif** (📄 PDF) — automatique via genPDFNative + prerenderPDFPages
3. **Word export** — ajouter substitution `{{CLAUSES_PARTICULIERES}}` dans template legacy + générer le HTML correspondant dans genBailHTML

### Highlight diff (v13.10/13.21)

Si les customClauses font partie de bail.signatures.bailSnapshot, le highlight devra détecter les changements. Solution : intégrer le check dans `_bailCompositionChanged` ou dans le diff structurel via modifiedBlocks (déjà couvert si la structure est régénérée).

### Détection composition (v13.11)

Modifier les clauses ne devrait PAS forcer un reset des signatures (contrairement à l'ajout d'un locataire). Ce sont des modifications mineures. Comportement : highlights jaunes uniquement, pas de reset forcé.

## Implémentation (~1-2h, 1 commit)

### Phase 1 — UI (~30 min)
- Nouvelle section dans la modale Modifier entité (HTML + boutons add/remove)
- Helper `_renderEntCustomClauses(clauses)` similaire à `renderBailLocs`
- Helper `_addEntClause()` / `_removeEntClause(i)`

### Phase 2 — State management (~15 min)
- `openNewEnt` charge `ent.customClauses` dans la liste rendue
- `saveEnt` collecte les clauses depuis le DOM dans `ent.customClauses`

### Phase 3 — Injection bail (~30 min)
- Modifier `buildBailStructure` : push h2 "16 BIS" + h3+p par clause si ent.customClauses non vide
- Position : après §16 Dispositions diverses (rechercher l'index dans le code)

### Phase 4 — Word export (~15 min)
- Ajouter dans `genBailHTML` : substituer `{{CLAUSES_PARTICULIERES}}` par le HTML correspondant
- Mettre à jour le template `BAIL_TEMPLATE_DEFAULT` pour inclure le placeholder à la position §16 bis

### Phase 5 — Tests (~10 min)
- Créer 2 clauses pour la SCI BOULEY
- Vérifier 👁 Aperçu, 📄 PDF natif, 📄 Word
- Vérifier non-régression : entité sans clauses → aucune section ajoutée

## Décisions à prendre

- [ ] **Niveau de granularité** : par entité (reco) ou par bail aussi ?
- [ ] **Section "16 BIS"** : nom exact accepté ? Ou autre numérotation ?
- [ ] **Modifier les clauses** sur un bail signé : forcer reset des signatures (comme composition) ou juste highlight ? Reco : juste highlight (modification mineure légalement).
- [ ] **Placeholder Word** : `{{CLAUSES_PARTICULIERES}}` ou autre nom ?

## Notes utilisateur

> 💬 2026-04-29 : "est-ce que tu sais n'afficher que le template que l'utilisateur pourrait modifier ? ou ajouter des § ?"

> 💬 2026-04-29 : "on met dans le backlog des choses à faire"

## Journal

- 2026-04-29 : créé suite discussion fin BAIL-PRINT-POLISH v13.29. Option B "Clauses personnalisées par entité" recommandée plutôt que filtrage du template HTML brut.
