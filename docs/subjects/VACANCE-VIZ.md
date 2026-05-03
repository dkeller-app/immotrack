# VACANCE-VIZ — Visualisation manque à gagner sur fiche logement 360°

**Status** : ✅ **Livré v14.29** · **Prio** : P1 · **Taille** : S (~1h30, option C choisie)
**Détecté** : 2026-05-03
**Lié à** : FICHES-PARITE-360 (Session 1 livrée v14.18) · ARCHI-DB-DOUBLONS (historique baux)

## Question utilisateur

> 💬 « il faut que le bien garde en mémoire le dernier loyer et charges pour les périodes vacantes pour calculer le manque à gagner. Tu as bien prévu ça ? parce que dans l'onglet c'est écrit suppression. ça serait bien d'avoir un visu non ? »

## Réponse — état des lieux 2026-05-03

### ✅ Mémoire du dernier loyer : déjà préservée
- `DB.baux_historique` : archivage automatique à chaque clôture (`terminerBail`) ou remplacement de bail (`saveBail` quand bail actif existant écrasé)
- `_getActiveBailHcCh(ref, yr, mi)` (l. 7569) fait un fallback sur **le bail le plus récent antérieur** quand aucun bail n'est actif sur le mois cible. Commentaire d'origine :
  > « fallback manque à gagner, cas travaux/vacance entre 2 baux »
- `delBail`/`terminerBail` ne touchent que `log.locataire / log.debut / log.fin` — **les valeurs `log.hc / log.ch` sont préservées** sur la fiche logement (visible dans la section legacy "BAIL COURANT" de la modale logement)

### ❌ Visualisation : manquante dans la fiche 360° → livrée v14.29

## Livraison v14.29 (option C choisie)

### A. Bandeau status occupation (sous le hero, avant les sous-onglets)

3 états visuels :

| État | Visuel | Contenu |
|---|---|---|
| **Loué** | bandeau vert (gradient subtil) + 🟢 | « Loué à [nom] depuis X mois (début date) — XXX €/mois » |
| **Vacant avec historique** | bandeau rouge + 🔴 | « Vacant depuis X jours · dernier locataire [nom] · loyer ref XXX €/mois — **-Y € manque à gagner** » |
| **Jamais loué** | bandeau gris + ○ | « Vacant — bien jamais loué (aucun bail enregistré) » |
| **Archivé** | (pas de bandeau, badge déjà visible dans le hero) | — |

Calcul manque à gagner cumulé :
```
manqueCumul = (jours depuis fin du dernier bail) / 30.44 × (HC + CH du dernier bail)
```

### B. Timeline 24 mois (entre bandeau et sous-onglets)

24 cellules SVG horizontales (mois courant à droite, 23 mois passés à gauche) :
- 🟩 vert : mois loué (tooltip = nom locataire + loyer)
- 🟥 rouge : mois vacant (tooltip = "Vacant (dernier : nom)" + loyer ref)
- ⬜ gris pâle : mois avant la mise en gestion du logement

3 pills de stats au-dessus :
- `X mois loué`
- `Y mois vacant (-Z €)` — somme des loyers refs sur les mois vacants
- `T% occupation` — taux sur la période en gestion seulement

Légende sous le graphique. Chaque cellule a un `<title>` SVG natif pour le tooltip au survol.

### C. KPI Compta — refonte du 4ᵉ KPI

Avant :
- `Vacance estimée 100%` (juste le pourcentage, pas le montant)

Après :
- `-XXX €` (montant en rouge si > 0) avec sub-label `Manque à gagner (X% vacance)`
- Calcul utilise `_computeExpectedRent()` qui appelle `_getActiveBailHcCh()` → fallback sur dernier bail = **mémoire du loyer en vacance** correctement appliquée

### D. Dashboard KPI `mag` — non touché (justification)

Le KPI `Manque à gagner vacance` (id `mag`, l. 6783) reste `visible:false`. Commentaire d'origine :
> « tous fusionnés dans todo-unified, visible:false »

L'activer en standalone aurait fait doublon avec le widget `todo-unified` qui agrège déjà cette info. La visu se concentre donc sur la fiche logement comme demandé.

## Helpers ajoutés (factorisables Phase 2)

- `_daysBetweenIso(iso1, iso2)` : nombre de jours entre 2 dates ISO (toujours ≥ 0)
- `_monthsBetweenIso(iso1, iso2)` : approximation 30.44 jours/mois
- `_getLastBailForLog(ref)` : dernier bail (current ou historique) chronologiquement
- `_getLastClosedBailEndIso(ref)` : ISO de fin du dernier bail clôturé
- `_renderLogFicheOccupationBanner(log, ref)` : HTML du bandeau status
- `_renderLogFicheTimeline24(ref)` : HTML SVG de la timeline 24 mois

## CSS ajouté

```
.logf-occup-banner / .logf-occup-banner.b-ok / b-warn / b-mute
.logf-occup-icon / .logf-occup-msg / .logf-occup-amt / .logf-occup-amt.amt-warn
.logf-timeline24 / .logf-timeline24-head / .logf-timeline24-title / .logf-timeline24-stats
.lt-pill / .lt-pill.lt-ok / lt-warn / lt-mute
.logf-timeline24-svg / .logf-timeline24-legend / .lt-dot / .lt-dot.lt-loue / lt-vac / lt-pre
```

Responsive 600px : bandeau passe en colonne (icône+message en haut, montant en bas), timeline header en colonne.

## Critères d'acceptance

- [x] Logement loué : bandeau vert avec nom locataire + durée + loyer mensuel
- [x] Logement vacant avec historique : bandeau rouge + manque à gagner cumulé en €
- [x] Logement jamais loué : bandeau gris neutre
- [x] Timeline 24 mois affiche corrrectement les périodes loué/vacant/avant gestion
- [x] Tooltip natif sur chaque case timeline (locataire + loyer ou "Vacant")
- [x] Stats pills (mois loué / mois vacant / taux occupation) cohérentes
- [x] KPI Compta « Manque à gagner -Y € » avec sub « X% vacance » remplace l'ancien « Vacance X% »
- [x] Calcul utilise `_computeExpectedRent` (mémoire du dernier loyer en fallback)
- [x] Responsive 600px : bandeau et header timeline passent en colonne
- [x] Dark mode : couleurs OK (utilise `var(--sur)`, `var(--bor)`, etc.)

## Limites connues

- **Approximation 30.44 jours/mois** pour le calcul jours→mois. Pour un usage compta/fiscal exact, prévoir un mode "mois calendaires complets" en option future.
- **Timeline 24 mois fixe** : pas de zoom/pan, pas de plage modifiable. À étendre si besoin (plage 12/36/60 mois en switch). Cohérent avec FICHES-PARITE-360 Session 2 (Plan d'occupation Gantt immeuble) qui ira plus loin.
- **Dashboard KPI mag toujours invisible** : si l'utilisateur veut une vision multi-biens du manque à gagner, passer par le drill-down du widget `todo-unified` (existant) ou prévoir un futur `BAILLEUR-FICHE-360 / Performance par immeuble` (FICHES-PARITE-360 Session 7).

## Refonte v14.33 — retour utilisateur 2026-05-03

### Pushback utilisateur sur v14.29

> 💬 « le visuel ne me convient pas. ça prend toute la fenêtre avec pas d'informations très utile... il faut revoir absolument cela ! [...] les infos de location et l'occupation des 24 derniers mois ça peut se trouver dans la bulle du bien (qui est déjà trop haute à mon goût). en plus cette timeline est redondante avec la timeline dans bail. »

Critique acceptée :
- Bandeau pleine largeur 70 px + timeline 130 px = 200 px de hauteur pour 2 infos
- Timeline 24 mois redondante avec `_renderBailTimeline` de l'onglet Bail
- Le hero était déjà jugé trop haut

### Refonte v14.33 — option « Scoreboard + pulse fine »

**Choix** option 1 (scoreboard 4 KPIs) **+ pulse 8px en séparateur entre badges et stats**.

**Suppressions** :
- ❌ `_renderLogFicheOccupationBanner` (bandeau pleine largeur)
- ❌ `_renderLogFicheTimeline24` (timeline 130 px avec labels mois/année)
- ❌ CSS `.logf-occup-banner`, `.logf-timeline24`, `.lt-pill`, `.lt-dot`

**Ajouts** :
- ✅ `_renderLogFicheHeroPulse(ref)` : SVG 240 px × 11 px (8 px barre + 1 px gap + 2 px marker), 24 cellules de 10 px, tooltip natif `<title>`, marqueur triangulaire pour le mois courant
- ✅ `_renderLogFicheHeroStats(log, ref)` : 4 micro-KPIs en grid `repeat(4, 1fr)`
  - KPI 1 : Loyer mensuel courant (ou dernier loyer ref si vacant, en gris)
  - KPI 2 : Durée loué (X mois / X ans Y mois) ou jours vacance
  - KPI 3 : Taux d'occupation 24m (%)
  - KPI 4 : Solde YTD (loué) ou Manque à gagner cumulé en € (vacant)
- ✅ `.logf-hero-compact` (grid `120px 1fr`, padding réduit) + `.logf-photos-mini` (96 × 96 au lieu de 200 × 200)
- ✅ `.logf-hero-pulse` + `.logf-hero-stats` + `.logf-stat` CSS
- ✅ Responsive : 768 px → KPIs en 2 × 2 ; 600 px → image 64 × 64

### Bilan hauteur (gain)

| Version | Hero | Bandeau | Timeline | Total avant sous-onglets |
|---|---|---|---|---|
| Avant v14.29 | 220 px | 0 | 0 | **220 px** |
| v14.29 | 220 px | 70 px | 130 px | **420 px** |
| **v14.33** | **190 px** (compact + pulse + stats inline) | 0 | 0 | **~190 px** |

→ Gain net **~230 px** vs v14.29 et même **gain ~30 px** vs avant la feature, en intégrant 4 KPIs + une pulse 24 mois.

### Conservé

- Helpers `_daysBetweenIso`, `_monthsBetweenIso`, `_getLastBailForLog`, `_getLastClosedBailEndIso`
- KPI Compta « Manque à gagner -Y € » (refonte du 4ᵉ KPI), inchangé depuis v14.29
- La mémoire du dernier loyer reste assurée par `_getActiveBailHcCh` + `DB.baux_historique`

---

## Volet 4 — v14.34 : extension du pattern aux fiches bailleur + immeuble

### Pushback utilisateur 2026-05-03

> 💬 « il faut revoir les pages bailleurs et immeubles. On doit voir directement en dessous. est-ce possible d'intégrer la bande avec les infos immeuble logement loué loyer dans la bulle ? De plus, les infos ne sont pas juste ... rien ne s'affiche. »

3 problèmes :
1. Hero ent-fiche / imm-fiche : 220 px hero + 80 px bande KPI = 300 px avant les sous-onglets, alors que la fiche logement v14.33 fait 190 px en intégrant tout
2. Cards immeubles dans `_renderEntFicheImmeubles` : avec `aspect-ratio:16/10` et grille 4 colonnes pour 1 seule carte → image 175 px de haut, body sous le pli
3. Bouton « ✏ Modifier l'immeuble » sur imm-fiche appelait `openNewEnt` (modale bailleur) au lieu de la modale immeuble

### Fix v14.34

**A. Refonte hero ent-fiche + imm-fiche en option C choisie par l'utilisateur**
- Grille 3 colonnes : image (96 × 96) | info+stats+actions | donut compact (96 × 96)
- Suppression de la bande `.immf-kpis` séparée → KPIs intégrés en grid 4 dans la colonne info
- Réutilise les classes `.logf-hero-stats` et `.logf-stat` du logement (cohérence visuelle)
- Nouvelles classes : `.entf-hero-compact`, `.entf-photos-mini`, `.entf-donut-compact`, `.logf-hero-stats-4`

| Page | Hero v14.33 | Hero v14.34 |
|---|---|---|
| ent-fiche | ~220 px hero + 80 px KPIs = **~300 px** | **~210 px** intégré |
| imm-fiche | ~220 px hero + 80 px KPIs = **~300 px** | **~210 px** intégré |

**B. Cards `_renderBuildingCard` plus compactes**
- `.bien-card-img` `aspect-ratio` : 16/10 → **21/9** (image plus large/courte)
- Pour une carte de 280 px de large : image passe de 175 px → 120 px
- Le body (titre + adresse + meta + période + loyer) remonte au-dessus du pli même avec 1 seule carte dans la grille

**C. Fix bouton « Modifier l'immeuble »**
- Avant : `openNewEnt(${ent.id})` (ouvrait la modale bailleur, bug UX)
- Après : `editImm(${immIdx},${ent.id})` (ouvre la modale immeuble dédiée v14.27)

**D. Responsive**
- 768 px : donut passe sous l'info (grid-column:1/-1, flex-row pour rester centré)
- 600 px : image 64 × 64, padding réduit

## Journal

- 2026-05-03 (matin) : créé · option C livrée v14.29 · jugé trop imposant + redondant par utilisateur
- 2026-05-03 (après-midi) : refonte v14.33 (option 1 + pulse fine) · bandeau et timeline 24m supprimés · hero compact avec 4 KPIs scoreboard + pulse 8px en séparateur · gain ~230 px vs v14.29
- 2026-05-03 (soir) : extension v14.34 (volet 4) · pattern compact appliqué aux fiches bailleur + immeuble · option C (donut conservé en colonne droite + scoreboard 4 KPIs intégré dans l'info) · cards immeubles plus compactes (aspect-ratio 21/9) · fix bouton « Modifier l'immeuble »
