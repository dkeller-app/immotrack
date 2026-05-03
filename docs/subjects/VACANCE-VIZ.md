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

## Journal

- 2026-05-03 : créé · option C choisie par utilisateur · livré v14.29 (commit à venir)
