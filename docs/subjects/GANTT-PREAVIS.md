# GANTT-PREAVIS — Préavis bailleur 6/3 mois sur Gantt + agenda auto

**Status** : ✅ **Livré v14.48** · **Prio** : P1 (utilité métier critique) · **Taille** : M (~1h30)
**Détecté** : 2026-05-04
**Lié à** : GANTT-OCCUPATION (v14.45-46) · agendaAutoSync · loi du 6 juillet 1989

## Demande utilisateur

> 💬 « tu veux mettre une indication comme quoi elle arrive à échéance au bail ? et on met la barre après tacite reconduction ? pour le bailleur je crois qu'il faut prévenir 6 mois avant la fin du bail pour faire qq chose (à vérifier). Donc il faut que ce soit visible correctement sinon 0 utilité. idem il faut que ce soit dans l'agenda... »

## Base légale (loi du 6 juillet 1989)

| Type bail | Préavis bailleur | Tacite reconduction |
|---|---|---|
| **Nu** (3 ans particulier, 6 ans personne morale) | **6 mois** avant échéance | Oui, par périodes de 3 ans |
| **Meublé** (1 an) | **3 mois** avant échéance | Oui, par périodes de 1 an |
| **Étudiant** (9 mois) | Pas de tacite reconduction | Non |
| **Mobilité** (1-10 mois) | Pas de tacite reconduction | Non |

**Motifs de congé bailleur** (à notifier dans le délai préavis sinon tacite reconduction aux conditions actuelles) :
- Congé pour vente
- Congé pour reprise (occupation par soi/ascendant/descendant/conjoint)
- Congé pour motif légitime et sérieux
- Renouvellement avec révision de loyer (si encadrement / sous-évaluation)

## Helpers ajoutés (réutilisables)

```js
// Détermine si bail meublé (typeContrat ou typeUsage du log)
function _bailIsMeuble(bail, log) { /* ... */ }

// Détermine si bail mobilité (pas de préavis applicable)
function _bailIsMobilite(bail, log) { /* ... */ }

// Calcule la date de fin EFFECTIVE pour le préavis (tacite reconduction inclus).
// Retourne null si bail clôturé / mobilité / sans fin.
function _bailEcheanceEffective(bail, log) { /* ... */ }

// Calcule l'info préavis pour un bail :
// { fin, preavisStart, preavisMonths, isMeuble, inPreavisZone, daysToFin }
function _bailPreavisInfo(bail, log) { /* ... */ }
```

## Composants livrés

### A. Catégorie agenda `BAIL_PREVIS`

```js
BAIL_PREVIS:{ label:'Préavis bailleur', couleur:'#f97316', icon:'⚠️' },
```

Apparaît automatiquement dans le filtre catégorie agenda (généré dynamiquement par `Object.entries(AGENDA_CATS)`).

### B. Auto-events agenda enrichis

Modification de `agendaAutoSync` :
1. **Fin de bail** (event existant `BAIL`) : utilise désormais `_bailEcheanceEffective` qui prend en compte la **tacite reconduction** (ex : bail nu signé 06/2022, fin théorique 06/2025 dépassée → event créé pour 06/2026 prochaine échéance anniversaire). Rappels enrichis : 180/90/30/7 jours (avant : 90/30/7).

2. **Préavis bailleur** (event NEW `BAIL_PREVIS`) :
   - Date = `fin - 6/3 mois` selon type
   - Titre : « ⚠️ Préavis bailleur 6 mois — F-101 (Pierre Dupont) »
   - Notes complètes : échéance + motifs possibles (congé/renouvellement) + conséquence légale (tacite reconduction si pas de notification)
   - Rappels : 60/30/15/7 jours (rappels rapprochés car critique)

### C. Hooks lifecycle bail

| Hook | Action |
|---|---|
| `saveBail` (signature/édition bail) | `agendaAutoSync()` régénère l'event si fin a changé |
| `terminerBail` (clôture) | `_cleanupBailAgendaEvents(ref)` + `agendaAutoSync()` (supprime l'event de l'ancien bail, crée pour le nouveau si applicable) |
| `delBail` (suppression bail) | `_cleanupBailAgendaEvents(ref)` (dans la closure UNDO-OP) |

Helper `_cleanupBailAgendaEvents(ref)` :
```js
DB.agenda = DB.agenda.filter(e => {
  if(!e.auto || !e.autoKey) return true;
  if(e.autoKey.startsWith(`BAIL:${ref}:`)) return false;
  if(e.autoKey.startsWith(`BAIL_PREVIS:${ref}:`)) return false;
  return true;
});
```

### D. Gantt : overlay zone préavis (orange) + badge urgent

Dans `_renderImmFichePlanGantt`, pour chaque logement, calcul de `preavisOverlay` (segment de la projection correspondant à la zone préavis) et `preavisInfo` :

**Overlay sur la projection** :
```html
<div class="immf-gantt-preavis [immf-gantt-preavis-urgent]"
     style="left:{preavisStart%};width:{preavisDuration%}"
     title="⚠️ Préavis bailleur 6 mois (bail nu)
            À donner avant le DD/MM/YYYY
            Échéance : DD/MM/YYYY">
  <span class="immf-gantt-preavis-lbl">⚠️ Préavis 6m</span>
</div>
```

CSS :
- Background `repeating-linear-gradient(135deg)` rayures orange (vs bleues de la projection bail)
- Bordure dashed orange 1.5 px
- z-index 3 (au-dessus barres bail, sous marker today)
- Label `⚠️ Préavis 6m` si overlay > 8% largeur
- Si **today dans la zone préavis** → classe `.immf-gantt-preavis-urgent` :
  - Couleur rouge au lieu d'orange
  - Animation `@keyframes igp-pulse` 2s (box-shadow rouge oscillant)

**Badge urgent sur le label du logement** :
- Si `preavisInfo.inPreavisZone === true` → ⚠️ après la ref logement (ex : `F-101 ⚠️`)
- Animation `@keyframes igp-blink` 1.6s (opacity + scale)
- Ref logement passe en rouge bold via `.immf-gantt-row-preavis`
- Tooltip : « Préavis bailleur à donner avant le DD/MM (échéance DD/MM) »

### E. KPI footer 4ᵉ tile

Avant 3 KPIs (taux occup / durée bail moyenne / manque à gagner cumul). Désormais 4 :

```
┌─────────┬─────────┬─────────┬─────────────┐
│  100%   │ 24 mois │ -2 800€ │  ⚠️ 2       │
│ Taux    │ Durée   │ Manque  │ Préavis     │
│ occup.  │ bail    │ à gagner│ à donner    │
│ 24 mois │ moyen   │ cumul.  │ (éch.06/26) │
└─────────┴─────────┴─────────┴─────────────┘
```

- Compte les baux courants en zone préavis (today entre preavisStart et fin)
- Si > 0 : KPI rouge avec ⚠️ + sub-label « (éch. DD/MM) » sur le bail le plus urgent
- Si 0 : KPI vert « ✓ 0 »
- Tooltip : « Plus proche échéance : DD/MM/YYYY (préavis 6m) »
- Border + background rouge clair via `.logf-stat-warn`

Footer passe de `.logf-hero-stats-3` à `.logf-hero-stats-4` (responsive : 4 cols PC, 2 cols tablette, 1 col mobile).

## Critères d'acceptance

- [x] Bail nu actif avec fin future > 6 mois → projection bleue, pas d'overlay
- [x] Bail nu actif avec fin future ≤ 6 mois → overlay orange + badge ⚠️ sur label
- [x] Bail meublé actif avec fin future ≤ 3 mois → idem (3 mois au lieu de 6)
- [x] Bail mobilité → pas d'overlay (mobilité = pas de préavis)
- [x] Bail clôturé / `finEffective` set → pas d'overlay
- [x] Bail tacite reconduction (fin passée) → projection étendue à prochaine échéance + overlay calculé sur cette nouvelle fin
- [x] Bail dans zone préavis aujourd'hui → animation `igp-pulse` rouge urgent + badge ⚠️ animé `igp-blink`
- [x] KPI footer compteur correct + tooltip échéance la plus proche
- [x] Auto-event BAIL_PREVIS créé dans agenda à chaque saveBail
- [x] Auto-event BAIL_PREVIS supprimé à chaque delBail / terminerBail
- [x] Filtre catégorie agenda inclut "Préavis bailleur"
- [x] Couleur orange `#f97316` distincte du violet BAIL `#7c3aed`
- [x] Responsive : overlay et badge fonctionnels mobile/tablette
- [x] Dark mode : couleurs adaptées (`color: #fdba74` au lieu de `#9a3412`)

## Limites connues

- **Bail commercial / local pro** : préavis 6 mois par défaut (loi 1989 ne s'applique pas, mais c'est la valeur la plus prudente). À affiner si l'utilisateur veut différencier (ex : commercial 6 mois, mais le délai est lié au statut 3-6-9 baux commerciaux différents de 1989).
- **Pas de notification push** : seuls les rappels agenda sont actifs. Pas d'email automatique. À envisager si infra email ajoutée.
- **Préavis non distingué dans le total bail-à-prévoir** : si plusieurs baux en préavis, le KPI montre le compteur mais pas le détail. Cliquer sur la ligne du logement (pas implémenté en v14.48 sur le KPI lui-même) ouvre la fiche logement.

## Journal

- 2026-05-04 : créé · helpers `_bailPreavisInfo` + `_bailEcheanceEffective` · catégorie agenda BAIL_PREVIS · auto-events fin-de-bail (avec tacite reconduction) + préavis · hooks saveBail/delBail/terminerBail · Gantt overlay orange + badge ⚠️ + KPI footer 4 tiles · CSS animations `igp-pulse` (urgent) + `igp-blink` (badge) · livré v14.48
- 2026-05-04 (bug ZITO) : 2 bugs trouvés via console
  1. **`bail.fin` vide** (ZITO bail nu signé 2022-06, pas de fin renseignée) → `_bailEcheanceEffective` retournait null → ni projection ni préavis
  2. **Tacite reconduction `+1 an` au lieu du cycle correct** : pour bail nu = +3 ans, pour personne morale = +6 ans
- 2026-05-04 (fix v14.49) :
  - **NEW helper `_bailDureeMois(bail, log, ent)`** : durée standard selon type (mobilité 6m / étudiant 9m / meublé 12m / nu particulier 36m / nu personne morale 72m)
  - Détection personne morale via regex `/sci|sarl|sas|sasu|eurl|snc|société|gfa|sccv/` sur `ent.type`
  - **Fix `_bailEcheanceEffective`** :
    - Couvre 3 cas désormais : fin renseignée future / fin renseignée passée (tacite) / fin VIDE (calcul depuis debut + dureeMois)
    - Tacite reconduction utilise `setMonth(+dureeMois)` au lieu de `setFullYear(+1)` → cycles légaux corrects
    - Lookup entité (priorité `bail.entity`, fallback `log.entity`) pour distinguer particulier/personne morale
  - **Refactor Gantt** : la logique inline tacite reconduction (8 lignes) est remplacée par un appel à `_bailEcheanceEffective`. Couvre désormais le cas `bail.fin` vide (ZITO).
  - Cas ZITO résolu : bail nu particulier 2022-06 sans fin → calcul fin théorique = 2025-06 → tacite reconduction → 2028-06 (cycle 3 ans, today < 2028-06). Préavis 6 mois avant = 2027-12. Gantt affichera barre solide 2022-06 → today + projection rayée today → 2028-06 + overlay orange préavis 2027-12 → 2028-06.
