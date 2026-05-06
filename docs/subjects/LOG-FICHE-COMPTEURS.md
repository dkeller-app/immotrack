# LOG-FICHE-COMPTEURS — Sous-onglet ⚡ Compteurs (FICHES-PARITE-360 Session 4)

**Status** : ✅ **Livré v14.56** · **Prio** : P1 · **Taille** : S (~2h)
**Détecté** : 2026-05-06
**Lié à** : LOG-FICHE-360 Phase 2 · FICHES-PARITE-360 Session 4 · EDL

## Demande utilisateur

> 💬 « go » (continuation ordre logique : finir fiche logement avant immeuble)

## Vision

Sous-onglet ⚡ Compteurs sur la fiche logement, avec :
- **Source automatique** : agrégation des relevés EDL (entrée + sortie) de tous les EDL du logement
- **Saisie manuelle** : possibilité d'ajouter des relevés entre 2 EDL (pas besoin d'attendre un EDL pour tracker la conso)
- **5 types de compteurs** : électricité HP, électricité HC, gaz, eau chaude, eau froide
- **Pour chaque type** : 3 KPIs + mini graph d'évolution + liste des relevés

## Architecture

### Configuration

```js
const COMPTEUR_TYPES = [
  { key: 'elec-hp', label: 'Électricité — Heures pleines', short: 'Élec HP', unit: 'kWh', icon: '⚡', color: '#f59e0b' },
  { key: 'elec-hc', label: 'Électricité — Heures creuses', short: 'Élec HC', unit: 'kWh', icon: '⚡', color: '#fbbf24' },
  { key: 'gaz',     label: 'Gaz',                            short: 'Gaz',     unit: 'm³',  icon: '🔥', color: '#dc2626' },
  { key: 'eau-c',   label: 'Eau chaude',                     short: 'Eau C',   unit: 'm³',  icon: '🚿', color: '#0ea5e9' },
  { key: 'eau-f',   label: 'Eau froide',                     short: 'Eau F',   unit: 'm³',  icon: '💧', color: '#3b82f6' }
];
```

Clés alignées sur celles existantes dans `edl.compteurs` (ne rien casser dans la modale EDL).

### Helper `_collectCompteurReleves(ref)`

Agrège tous les relevés disponibles pour un logement :

1. **Tous les EDL vivants** (filtrés par `_isAlive` + `e.logement === ref`)
   - `edl.compteurs[type]` à `edl.dateEntree` → relevé entrée
   - `edl.compteursSortie[type]` à `edl.dateSortie` → relevé sortie
2. **Saisies manuelles** dans `DB.compteursReleves[ref]` (nouvelle collection introduite v14.56)

Tri par date ASC pour faciliter le calcul d'évolution. Déduplication par `date+source+edlId`.

### Render `_renderLogFichePanelCompteurs(log, ref)`

Grid responsive `repeat(auto-fill, minmax(360px, 1fr))` de 5 cards (1 par type).

#### Header global
- Titre + compteur total (« 12 relevés »)
- Bouton **+ Saisir un relevé** (modale rapide)
- Bouton **↗ Onglet EDL** (drill-out)

#### Empty state
Si aucun relevé : message d'invitation à créer un EDL ou saisir manuellement, 2 boutons CTA.

### Card par compteur

**Header** : icône colorée + titre + bouton « + Relevé » contextuel (pré-sélectionné sur ce type).

**3 KPIs** :
- **Dernier index** : valeur + date du dernier relevé
- **Conso moyenne** : `(dernier - premier) / nbJours × 30.44` jours/mois
- **Tendance 12m vs 12m** : compare conso 12 derniers mois vs 12 mois précédents
  - `↗ +XX%` si > +5% (k-warn rouge)
  - `↘ -XX%` si < -5% (k-ok vert)
  - `→ ±X%` sinon (gris)
  - `—` si pas assez de données

**Mini graph SVG** (360 × 100 px) :
- Ligne brisée 2 px de la couleur du type
- Points 3 px à chaque relevé avec `<title>` tooltip natif (`date · index unit · notes`)
- Échelle Y : min/mid/max avec graduations + grille pointillée
- Axe X : 24 derniers mois (limite glissante)
- Labels date début/fin

**Liste des 10 derniers relevés** (tri DESC) :
- Date + index + conso depuis relevé précédent + badge source
- Source badges : 📋⬆ (EDL entrée) / 📋⬇ (EDL sortie) / 📝 (manuel)

### Saisie manuelle `openCompteurReleve(ref, typeKey)`

Version v14.56 minimale : 4 prompts en cascade (date, type, valeur, notes). Stockage dans `DB.compteursReleves[ref]` :

```js
{
  id: 'cpt_TIMESTAMP_RAND',
  date: 'YYYY-MM-DD',
  type: 'elec-hp' | 'elec-hc' | 'gaz' | 'eau-c' | 'eau-f',
  value: 12345,
  notes: '',
  _modifiedAt: 'ISO'
}
```

> TODO refonte en vraie modale `ov-cpt-releve` si volume justifie (formulaire avec champs typés, validation, multi-relevés, etc.).

## Architecture finale fiche logement (8 sous-onglets)

```
📋 Général · 📜 Bail · 💰 Comptabilité · 🛡 Conformité · 📅 Agenda · 📁 Documents · ⚡ Compteurs · (EDL à venir)
```

Reste 1 sous-onglet à activer : **📋 États des lieux** (Session 3 EDL-TEMPLATE-PER-LOG, ~7h).

## CSS responsive

- **Desktop ≥ 1280** : grid `auto-fill minmax(360px, 1fr)` → 1, 2 ou 3 cards par ligne selon largeur
- **Tablette 1024-1280** : 1-2 cards par ligne
- **Mobile ≤ 768** : 1 card par ligne, KPIs en 3 cols, conso masquée pour densité
- **Mobile ≤ 600** : KPIs en 1 col, format compact

## Critères d'acceptance

- [x] Sous-onglet ⚡ Compteurs activé (sortie du « À venir »)
- [x] 5 cards une par type, ordonnées élec HP/HC/gaz/eau C/F
- [x] Helper `_collectCompteurReleves` agrège EDL entrée + sortie + saisies manuelles
- [x] Déduplication par date+source+edlId
- [x] 3 KPIs par card : dernier index, conso moyenne, tendance 12m
- [x] Tendance avec arrow + couleur (vert si baisse, rouge si hausse > 5%)
- [x] Mini graph SVG ligne brisée + points + tooltip natif
- [x] Liste des 10 derniers relevés avec source badge
- [x] CTA + Saisir un relevé (modale rapide via prompts)
- [x] Stockage saisies manuelles dans `DB.compteursReleves[ref]`
- [x] Empty state si aucun relevé (2 CTA : créer relevé manuel + lien onglet EDL)
- [x] Responsive 3 breakpoints (PC / tablette / mobile)
- [x] Dark mode OK (utilise `var(--sur)`, `var(--bor)`, etc.)

## Limites connues

- **Saisie manuelle via 4 prompts** : OK pour livraison rapide, mais expérience UX médiocre. À refaire en vraie modale si l'utilisateur fait un usage intensif.
- **Pas de suppression de relevé manuel** : seul l'ajout est implémenté. À ajouter (bouton ✕ par ligne dans la liste).
- **Pas d'édition de relevé existant** : ajouter un nouveau ou refaire l'EDL. À ajouter aussi.
- **Pas de différenciation HP/HC contextuelle** : si le bail / logement n'a pas de tarif HP/HC, on affiche quand même les 2 cards (l'une vide). À masquer si jamais utilisée.
- **Pas d'export CSV des relevés** : utile pour partager avec le fournisseur d'énergie. À envisager.

## Journal

- 2026-05-06 : créé · helper `_collectCompteurReleves(ref)` agrège EDL + manuel · 5 cards par type avec 3 KPIs (dernier index, conso moyenne, tendance 12m vs 12m) · mini graph SVG ligne brisée + points + tooltip · liste 10 derniers relevés avec source badge · CTA saisie manuelle (4 prompts, stockage `DB.compteursReleves`) · responsive 3 breakpoints · empty state avec 2 CTA · livré v14.56
