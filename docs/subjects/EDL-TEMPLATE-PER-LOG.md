# EDL-TEMPLATE-PER-LOG — Template EDL personnalisable par logement

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (~6h)
**Détecté** : 2026-05-02 (proposé par session parallèle)
**Lié à** : LOG-FICHE-360 Phase 2 (Bloc C) · EDL · LOG-PHOTOS

## Contexte
Demande session parallèle 2026-05-02 :
> Permettre au bailleur de personnaliser le template EDL **par logement**, depuis la fiche Bien 360°. Centralise la description détaillée du bien (matériau, couleur, modèle) à un seul endroit ; les EDLs créés ensuite héritent automatiquement.

Aujourd'hui le template EDL est **global** (`EDL_TPL` + `EDL_EXTRA`, lignes ~14658-14790 de `index.html`). Le bailleur doit retaper les détails (parquet, marque chauffage, modèle de four…) à chaque création d'EDL pour le même logement. **Friction d'usage forte** pour les bailleurs avec plusieurs biens hétérogènes.

## Scope (3 niveaux d'enrichissement)

1. **Labels enrichis** : `Sol` → `Sol — Parquet flottant chêne (2018)`
2. **Activer/désactiver pièces** : décocher Cave si pas de cave
3. **Ajouter/supprimer éléments** : retirer Lave-vaisselle, ajouter `Adoucisseur Bayard` en custom

## Modèle de données

Sur l'objet `log` de chaque logement :

```js
log.edlTemplate = {
  pieces: [
    {
      id: "entree-couloir",       // slug stable (résiste aux renommages EDL_TPL)
      nom: "Entrée / Couloir",     // matche EDL_TPL.nom OU custom
      enabled: true,
      isCustom: false,
      elements: [
        { id: "sol",          nom: "Sol",          label: "Parquet flottant chêne (2018)", enabled: true,  isCustom: false },
        { id: "plinthes",     nom: "Plinthes",     label: "",                               enabled: true,  isCustom: false },
        { id: "lave-vaisselle", nom: "Lave-vaisselle", label: "",                          enabled: false, isCustom: false },
        { id: "elt-custom-1", nom: "Adoucisseur Bayard", label: "Modèle X 2024",          enabled: true,  isCustom: true  }
      ]
    },
    { id: "atelier-custom-1", nom: "Atelier", enabled: true, isCustom: true, elements: [...] }
  ]
}
```

**Règles** :
- `label` vide → affiche le `nom` brut
- `log.edlTemplate` non défini → fallback complet sur `EDL_TPL` (comportement actuel inchangé)
- Matching prioritaire par `id` (résiste aux renommages d'EDL_TPL), fallback par `nom`

## Logique merge au "Nouvel EDL"

```js
function _getEDLTemplateForLog(log) {
  if (log.edlTemplate && log.edlTemplate.pieces) {
    return _mergeWithDefaultTemplate(log.edlTemplate, EDL_TPL);
  }
  return EDL_TPL;
}

function _mergeWithDefaultTemplate(custom, defaultTpl) {
  // Pour chaque pièce du défaut :
  //  - Si dans custom + enabled=true : utiliser custom (avec labels/élts)
  //  - Si dans custom + enabled=false : skip
  //  - Si pas dans custom : utiliser défaut (nouvelle pièce ajoutée à EDL_TPL après personnalisation user)
  // Pour chaque pièce custom (isCustom=true) : ajouter
  // Idem pour les éléments dans chaque pièce
}
```

À appeler dans `openNewEDL()` au lieu d'utiliser `EDL_TPL` direct.

## UI — Onglet "Template EDL" dans fiche Bien 360°

**Position** : 6e ou 7e sous-onglet de LOG-FICHE-360, après "📋 États des lieux" (regroupement logique).

**Composants** :
- Toggle pièce ☑/☐ (active/désactive)
- Toggle élément ☑/☐
- Input texte `[label]` (placeholder = nom par défaut, indication grisée du nom brut hérité)
- Bouton `➕ Ajouter élément custom` → prompt → nouvel élément `isCustom:true`
- Bouton `➕ Ajouter pièce custom` → nouvelle pièce vide
- Bouton `✕` sur pièce/élément custom uniquement (pas sur les standards)
- Bouton `↺ Reset` → `delete log.edlTemplate` (avec `confirm2`)
- Bouton `🔍 Aperçu` → modal qui simule l'EDL avec template courant

**Maquette texte** :

```
┌─────────────────────────────────────────────────────┐
│ 📋 Template EDL — F-001                              │
│  Personnalise les pièces et éléments pour ce bien.  │
│  Vide = template standard utilisé.                  │
│ [↺ Reset]  [🔍 Aperçu]                              │
├─────────────────────────────────────────────────────┤
│ ☑ ▾  Entrée / Couloir                                │
│      ┌───────────────────────────────────────────┐  │
│      │ ☑ Sol         [Parquet flottant chêne 2018]│  │
│      │ ☑ Plinthes    [                          ] │  │
│      │ ☐ Sangle volet  (désactivé)                │  │
│      │ ➕ Ajouter un élément custom                │  │
│      └───────────────────────────────────────────┘  │
│ ☑ ▾  Séjour / Salon                          [...]  │
│ ☐ ▾  Cave / Garage  (désactivé pour ce bien)        │
│ 🆕 ▾  Atelier (custom)                       [✕]    │
│ ➕ Ajouter une pièce custom                          │
└─────────────────────────────────────────────────────┘
```

## Sauvegarde / Drive

- `log.edlTemplate` est un champ standard du logement → push automatique via `saveDB()` (v14.0)
- Sync **uni-directionnel** : Bien → EDL uniquement (l'EDL ne push jamais vers `log.edlTemplate`)
- `_modifiedAt` stamping standard

## Edge cases

| Cas | Comportement |
|---|---|
| Nouvelle pièce ajoutée dans EDL_TPL après custom | Auto-incluse dans EDL (par merge) |
| Élément renommé dans EDL_TPL après custom | Custom orphelin conservé (matching par id) |
| Reset après custom complexe | `confirm2` obligatoire |
| 2 pièces custom même nom | Autorisé (2 ateliers possibles, distingués par id) |
| log archivé | UI accessible mais bandeau `Bien archivé — modifs non poussées aux nouveaux EDL` |

## Estimation

| Module | Heures |
|---|---|
| Schéma data + helpers (id stable + merge) | 1h |
| UI onglet "Template EDL" | 2h |
| Add/remove pièces & éléments custom | 1h |
| Aperçu + Reset | 30min |
| Hook `openNewEDL` | 30min |
| Tests + edge cases | 1h |
| **TOTAL** | **~6h** |

## Tests post-implémentation

1. Logement vierge → `Nouvel EDL` → template par défaut (inchangé)
2. Logement avec template custom → labels custom appliqués
3. Désactiver pièce → pièce absente du nouvel EDL
4. Ajouter pièce custom → pièce présente
5. Modifier label → label mis à jour à la prochaine génération
6. Reset → template par défaut restauré
7. Aperçu → simule sans modifier l'EDL existant
8. `log.edlTemplate` présent dans le payload Drive (vérifier dans le JSON entité)
9. Renommer une pièce dans `EDL_TPL` → custom toujours mappé via id
10. Drive sync : modif `log.edlTemplate` device 1 → device 2 reçoit le push, prochain EDL device 2 hérite

## Coordination

- **Sujet proposé par session parallèle 2026-05-02**
- Intégré dans le planning **LOG-FICHE-360 Phase 2 / Bloc C** (sous-onglets riches logement)
- **Quand** : session dédiée future (estimée plusieurs jours/semaines, dépend priorisation utilisateur)
- **Si la session parallèle code avant** Bloc C : intégration absorbée naturellement, je m'aligne sur leur archi
- **Conflit potentiel** : déclaration sous-onglets dans `rLogFiche()` (lignes ~16290) — merge trivial
- **Zone propre pour eux** : `EDL_TPL` / `EDL_EXTRA` (lignes ~14658-14790), `openNewEDL()` — je n'y touche pas en Bloc A

## Journal
- 2026-05-02 : créé · spec proposée par session parallèle · intégrée Bloc C / LOG-FICHE-360 Phase 2 · 2 réserves mineures notées (id stable + UX placeholder labels)
