# DASH-PROFILES — Spec détaillée des 8 lentilles dashboard

> **Phase 1 — Aperçu (sans codage prod)**
> Document de spécification des 8 lentilles dashboard pour validation utilisateur avant implémentation.
> Référence visuelle : mockups HTML statiques dans `dashboard-mockups/`.
> Status : 🔄 En cours · Détecté : 2026-05-01 · Lié à `docs/subjects/DASH-PROFILES.md`

---

## 1. Principe

Le dashboard ImmoTrack actuel (DASH-V2 livré) propose **une seule vue** : KPIs financiers + alertes + sparkline. Cette vue est neutre, mais ne correspond à aucune douleur précise — elle dilue l'information.

Une **lentille** = une grille de widgets pré-configurée pour répondre à une douleur métier précise. Le data model reste le même (entités, logements, baux, mouvements, charges, IRL, EDL), mais la sélection / agrégation / visualisation des KPIs change selon la lentille active.

### Sélecteur de lentille
- **Position** : bandeau supérieur du dashboard (à droite du sélecteur de période)
- **Type** : selectbox compact `[Voir comme : 🏠 Propriétaire ▾]` — 1 clic, 1 ligne
- **Mémorisation** : `localStorage.dashLens` → garde la dernière lentille active à la session suivante
- **Activation auto saisonnière** : la lentille **Fiscale 2044** propose un toast "Période fiscale en cours — voir le dashboard fiscal ?" entre le 1er mars et le 30 juin (suggestion non-imposée)
- **Mobile** : selectbox plein-largeur sous la context bar (déjà responsive du dashboard actuel)

### Contraintes communes (non-négociables)
1. **Constance design system** : variables CSS, typo IBM Plex Sans + Manrope, composants `.dw`, `.kpi`, `.tbl`, `.btn`, palette couleurs (`--blu/grn/red/ora/pur`) → identique à l'app actuelle (cf `feedback_design_consistency.md`)
2. **One-screen ~900px desktop** : pas de scroll vertical pour la zone "header + KPIs + premier rang" (cf `project_dashboard_onescreen.md`)
3. **Mobile irréprochable 320px** : table-to-cards, KPIs stack 2×2, sparklines responsive (cf `MOBILE-AUDIT-ONGLETS`)
4. **Mode sombre testé** : tous les widgets en var(--bg/sur/t1/bor) → bascule auto via `<html data-theme="dark">`
5. **Drill-down conservé** : chaque KPI/widget reste cliquable → modale détaillée (déjà en place via `_dashCardClick`)

---

## 2. Les 8 lentilles

Chaque section ci-dessous donne :
- **Persona** : qui l'utilise (B2C bailleur / SCI / investisseur)
- **Cas d'usage** : la question à laquelle elle répond
- **KPIs** : formule + source données
- **Widgets** : type + interaction
- **Layout** : wireframe ASCII
- **Activation** : par défaut / au clic / saisonnier auto

### Layout commun (12 colonnes, hauteur unitaire = 60px)
Mêmes contraintes que `#dash-kpi-grid` actuel : `display:grid; grid-template-columns:repeat(12,1fr); grid-auto-rows:60px; gap:10px`. Chaque widget consomme `dw-cN dw-rM`.

---

### Lentille 1 — 🏠 Propriétaire (par défaut)

**Persona** : tous bailleurs (1-10 logements). Vue rassurante "tout va bien".
**Cas d'usage** : "Je veux ouvrir l'app et voir d'un coup d'œil l'état général de mon parc."
**Activation** : par défaut au premier login. Chargée via `localStorage.dashLens || 'proprietaire'`.

**KPIs (4 tuiles)**
| KPI | Formule | Source |
|---|---|---|
| Revenus du mois | Σ mouvements `cat='Loyers' AND cr>0` du mois | `mouvements[]` |
| Charges du mois | Σ mouvements `db>0` du mois | `mouvements[]` |
| Cash-flow net | Revenus − Charges | calcul direct |
| Taux d'occupation | Logements occupés (locataire ≠ null) / Logements total | `logements[]` |

Chaque KPI a son delta vs N-1 (`_kpiDelta`) et sparkline 12 mois (`_mkSparkline`).

**Widgets supplémentaires**
- **Hero pulse** : carte large affichant le cash-flow net mensuel + indicateur "Bon mois / Mois moyen / Mois tendu" (seuil ±20% médiane 12 mois)
- **Alertes dashboard** : 5 alertes max (impayés, IRL à réviser, EDL à programmer, baux à clore, MRH à renouveler)
- **Mini-sparkline cash-flow 12m** : tendance globale + marqueurs verticaux changement de bail

**Layout (wireframe)**
```
┌──────────────── Context bar (date + entité + période) ─────────────────┐
├─────────────┬─────────────┬─────────────┬──────────────────────────────┤
│ KPI Revenus │ KPI Charges │ KPI CF net  │ KPI Occupation               │
├─────────────┴─────────────┴─────────────┴──────────────────────────────┤
│                       Hero pulse — Cash-flow net mois                  │
├────────────────────────────────────────┬───────────────────────────────┤
│ Sparkline cash-flow 12 mois           │  Liste alertes dashboard      │
│ (avec markers changement bail)         │  (5 max, cliquables)          │
└────────────────────────────────────────┴───────────────────────────────┘
```

**Effort estimé implém prod** : 0j (= existant DASH-V2, juste renommer en lentille "Propriétaire").

---

### Lentille 2 — 💶 Financier (cash-flow expert)

**Persona** : propriétaire qui pense en € (Excel-friendly), comptable, rentier.
**Cas d'usage** : "Combien j'ai gagné / dépensé / encaissé / dû ce trimestre, et comment ça se compare à N-1 ?"
**Activation** : au clic dans le sélecteur.

**KPIs (4 tuiles + 1 ratio)**
| KPI | Formule | Source |
|---|---|---|
| MRI (Marge Réelle Immobilière) | (Revenus annuels − Charges annuelles) / Revenus annuels | calcul agrégé |
| Encaissé / Dû ce mois | Σ loyers reçus / Σ loyers attendus selon baux actifs | `mouvements[]` + `baux[]` |
| Impayés cumulés | Σ loyers attendus non reçus, par locataire | `mouvements[]` + `baux[]` |
| Charges / Produits | Charges N / Revenus N | calcul agrégé |

**Widgets supplémentaires**
- **Cash-flow chart 12m** (`_mkMultiLineChart` 2 séries Revenus/Charges) avec Y-axis graduée + zone d'aire
- **Tableau impayés actifs** : locataire / logement / montant / jours retard / bouton "Relancer" (lien vers RAPPEL-IMPAYE V2)
- **Camembert charges par catégorie** (intérêts emprunt / travaux / taxe foncière / assurances / charges copro / divers) — légende détachée pour mobile
- **Waterfall N vs N-1** : revenus N / charges N / Δ vs N-1 → cash-flow net N en cumulé bar
- **KPI ratio charges récupérables / non récupérables** : indicateur en % (donut visuel)

**Layout (wireframe)**
```
┌──────────────── Context bar ──────────────────────────────────────────┐
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│ KPI MRI %    │ Encaissé/Dû  │ Impayés cum. │ Charges/Produits ratio   │
├──────────────┴──────────────┴──────────────┴──────────────────────────┤
│  Chart 12m Revenus vs Charges (multi-line + zones d'aire)             │
├─────────────────────────────────────────┬─────────────────────────────┤
│ Tableau impayés actifs (top 5)          │ Camembert charges/cat (top 6)│
├─────────────────────────────────────────┴─────────────────────────────┤
│  Waterfall N vs N-1 (cash-flow décomposé)                             │
└────────────────────────────────────────────────────────────────────────┘
```

**Effort estimé** : ~3j (camembert + waterfall sont nouveaux, le reste réutilise les helpers existants).

---

### Lentille 3 — 🛠️ Gestionnaire (opérationnel)

**Persona** : admin biens hands-on, gestionnaire SCI familiale (souvent un fils/cousin), futur agent (V2).
**Cas d'usage** : "Qu'est-ce que je dois traiter cette semaine ? Quelles actions concrètes ?"
**Activation** : au clic.

**KPIs (4 tuiles)**
| KPI | Formule | Source |
|---|---|---|
| Vacances locatives | Nb logements vacants × jours moyens | `logements[]` |
| Impayés en cours | Nb baux avec retard ≥ 1 loyer | `mouvements[]` |
| Échéances < 90j | Σ baux finissant + IRL à réviser + EDL à programmer | calcul agrégé |
| Actions à faire | Σ items de la todo (calculée) | calcul agrégé |

**Widgets supplémentaires**
- **"À faire cette semaine"** : checklist avec actions inline (relancer / programmer EDL / envoyer quittance / appeler locataire) — tri par urgence
- **Liste vacances** : nom logement / depuis / loyer manqué + bouton "Générer annonce" (lien vers LOG-ANNONCE)
- **Liste impayés** : locataire / montant / jours retard + bouton "Relancer LRAR"
- **Calendrier mini 3 mois** : pastilles colorées par catégorie (📜 baux, 📋 EDL, 📈 IRL, 🛠️ entretien, 💰 fiscal)
- **Compteur "À clore"** : EDL sortie en attente / baux à archiver / régul à valider

**Layout (wireframe)**
```
┌────────────── Context bar ────────────────────────────────────────────┐
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│ Vacances     │ Impayés      │ Éch. <90j    │ Actions à faire          │
├──────────────┴──────────────┴──────────────┴──────────────────────────┤
│  À faire cette semaine — checklist (avec actions inline)              │
├─────────────────────────────────────────┬─────────────────────────────┤
│ Calendrier 3 mois (heatmap)             │ Liste vacances + bouton     │
│                                         │ "Générer annonce"            │
├─────────────────────────────────────────┼─────────────────────────────┤
│ Liste impayés actifs + "Relancer"       │ À clore (EDL/Baux/Régul)    │
└─────────────────────────────────────────┴─────────────────────────────┘
```

**Effort estimé** : ~5j (heatmap calendrier nouveau, reste réutilise listes existantes).

---

### Lentille 4 — 📋 Préparation fiscale 2044 (saisonnier auto)

**Persona** : tous (mais surtout SCI patrimoniale).
**Cas d'usage** : "On est en avril, je dois remplir ma 2044 — où sont mes chiffres ?"
**Activation** : automatique entre 1er mars et 30 juin (toast "Période fiscale — voir le dashboard fiscal ?"), sinon au clic. Réglage utilisateur on/off dans Paramètres.

**KPIs (4 tuiles + alertes)**
| KPI | Formule | Source |
|---|---|---|
| Revenus fonciers bruts N | Σ loyers HC + provisions charges − charges récup | `mouvements[]` année N |
| Charges déductibles N | Σ charges (hors travaux d'amélioration > 10000€) par catégorie 2044 | `mouvements[]` année N |
| Revenus fonciers nets N | Bruts − Déductibles | calcul direct |
| Déficit foncier N (si négatif) | min(0, Net N) | calcul direct |

**Widgets supplémentaires**
- **Pré-rempli 2044 (cases 211, 213, 222, 224, 230, etc.)** : tableau ligne par ligne avec valeurs auto-calculées + bouton "Copier" par case
- **Charges déductibles par catégorie** : intérêts emprunt / travaux entretien / charges copropriété non récup / taxe foncière / primes assurance / honoraires gestion / autres (mapping `cat → ligne 2044`)
- **Bouton "Exporter 2044 PDF"** : génération document pré-rempli (utilisable comme brouillon pour DGFiP)
- **Bouton "Exporter données comptable"** : CSV par catégorie (pour expert-comptable)
- **Comparatif graphique N vs N-1** : barres par catégorie (détecte anomalies "vous avez 0€ de taxe foncière saisi en N — anormal")
- **Alertes** : "Catégorie X a 0€ alors qu'elle avait Y€ en N-1 — saisir ?", "Travaux > 10000€ détecté → vérifier classification améliorations vs entretien"
- **KPI déficit reportable cumulé** : compteur 10 ans (déficit non utilisé)

**Layout (wireframe)**
```
┌────────────── Context bar (avec sélecteur année fiscale) ─────────────┐
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│ Revenus brut │ Charges déd. │ Revenus net  │ Déficit foncier N        │
├──────────────┴──────────────┴──────────────┴──────────────────────────┤
│ Pré-rempli 2044 (tableau cases avec valeurs + Copier)                │
│ ┌───────┬──────────────────────────────────┬──────────┬──────────┐    │
│ │ Case  │ Libellé                          │ N        │ N-1      │    │
│ │ 211   │ Loyers bruts encaissés          │ 23 480 € │ 22 800 € │    │
│ │ 222   │ Frais administration / gestion  │ 1 200 €  │ 1 100 €  │    │
│ │ ...   │ ...                              │ ...      │ ...      │    │
│ └───────┴──────────────────────────────────┴──────────┴──────────┘    │
├─────────────────────────────────────────┬─────────────────────────────┤
│ Charges déductibles par catégorie       │ Comparatif N vs N-1 (bars)  │
├─────────────────────────────────────────┴─────────────────────────────┤
│ [Exporter 2044 PDF] [Exporter CSV comptable] [Voir alertes (3)]       │
└────────────────────────────────────────────────────────────────────────┘
```

**Effort estimé** : ~5j (mapping `cat → ligne 2044` est l'essentiel ; PDF natif déjà disponible via `pdf.text/pdf.rect`). Lié à sujet `LEGAL-2044`.

---

### Lentille 5 — 📈 Investisseur (rentabilité pure)

**Persona** : multi-bailleur SCI patrimoniale, investisseur "pense en %", potentiel acheteur SaaS premium 19€.
**Cas d'usage** : "Quel bien est rentable, lequel je dois revendre, où j'investis le prochain euro ?"
**Activation** : au clic.

**KPIs (4 tuiles + 1 ratio)**
| KPI | Formule | Source |
|---|---|---|
| TRI moyen parc | (Revenus annuels − Charges annuelles) / Σ prix d'achat × 100 | `logements[].prixAchat` + agrégat |
| Cash-on-cash | (Cash-flow annuel net) / (Apport personnel) × 100 | `logements[].apport` + calcul |
| DSCR moyen | NOI / Service de la dette annuel | `logements[].mensualitePret` |
| Vacance moyenne | Jours vacance / Jours total possible | `logements[]` historique |

**Widgets supplémentaires**
- **Tableau classement biens par TRI** : top 5 / bottom 5 (best vs worst performer)
- **Graphique valorisation parc dans le temps** : courbe valeur estimée − dette → patrimoine net (12-60 mois)
- **Heatmap rendement par ville/quartier** (si géolocalisation présente) — sinon barres par ville
- **Simulation "Quel impact si je revends X ?"** : carte interactive avec sélecteur de bien + plus-value brute / fiscale / cash-flow disparu
- **Comparatif ROI vs marché** : vs SCPI (4-5%) / vs Livret A (3%) / vs immobilier français (3-4%) → courbe N=10 ans
- **KPI capacité d'emprunt résiduelle** : (35% revenus consolidés) − mensualités existantes

**Layout (wireframe)**
```
┌────────────── Context bar ────────────────────────────────────────────┐
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│ TRI moyen %  │ Cash-on-cash │ DSCR moyen   │ Vacance moyenne %        │
├──────────────┴──────────────┴──────────────┴──────────────────────────┤
│ Classement biens par TRI (top 5 / bottom 5 colored)                  │
├─────────────────────────────────────────┬─────────────────────────────┤
│ Valorisation parc dans le temps        │ Comparatif ROI vs marché    │
│ (courbe valeur − dette = net)          │ (vs SCPI/Livret A/IMMO FR)  │
├─────────────────────────────────────────┴─────────────────────────────┤
│ Simulation "Si je revends [Logement ▾]" → impact CF + PV + cash dispo│
└────────────────────────────────────────────────────────────────────────┘
```

**Effort estimé** : ~7j (DSCR / TRI nécessitent nouveaux champs `prixAchat`, `apport`, `mensualitePret` — donc évolution data model). À discuter : ces champs seront-ils saisis manuellement ou inférés ?

**Pré-requis** : data model étendu (sujet à créer `LOG-FINANCE-FIELDS`).

---

### Lentille 6 — ⏰ Échéances & alertes (centre de notifs)

**Persona** : tous, vue **actionnable** plutôt que **constative**.
**Cas d'usage** : "Qu'est-ce qui m'attend dans les 90 prochains jours ? Je veux gamifier ma to-do."
**Activation** : au clic. Peut-être promu en "vue par défaut" si N+1 alertes critiques détectées.

**KPIs (4 tuiles)**
| KPI | Formule | Source |
|---|---|---|
| Actions cette semaine | Nb échéances dans les 7 jours | tous calendriers agrégés |
| Actions ce mois | Nb échéances dans les 30 jours | idem |
| Actions trimestre | Nb échéances dans les 90 jours | idem |
| Retards non traités | Nb actions DUE sans validation | idem |

**Widgets supplémentaires**
- **Timeline horizontale 90j** : axe temporel avec pastilles colorées par catégorie + tooltip jour
- **Liste regroupée par horizon** : "Cette semaine (3) · Ce mois (12) · Trimestre (45)" → sections expansibles
- **Catégories** :
  - 📜 Baux (fins, renouvellements, anniversaires)
  - 📈 IRL (révisions, lettres à envoyer)
  - 📋 EDL (à programmer entrée/sortie)
  - 💰 Fiscal (taxe foncière, déclaration 2044)
  - 🛠️ Entretien (chaudière, ramonage, VMC)
  - 🛡️ MRH (renouvellement annuel, attestation)
  - 🏛️ DPE (validité 10 ans → re-diagnostic)
  - 💼 Cautionnement (renouvellement annuel)
- **Toggle "Tout traiter"** : marquage groupé d'une catégorie comme traité
- **Filtre par bien** : sélecteur logement → ne montre que ses échéances
- **Gamification** : compteur "X actions cette semaine" + barre de progression "Y/X traitées" + badge "Bravo, semaine clean !" quand tout est validé

**Layout (wireframe)**
```
┌────────────── Context bar ────────────────────────────────────────────┐
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│ Cette sem. 3 │ Ce mois 12   │ Trimestre 45 │ Retards non traités 2    │
├──────────────┴──────────────┴──────────────┴──────────────────────────┤
│ Timeline horizontale 90 jours (axe temporel + pastilles colorées)     │
│ ●●  ● ●●●        ●●  ●     ●  ●●●        ● ●                          │
│ J7  J14 J21      J45 J52   J67  J74      J81 J88                      │
├────────────────────────────────────────────────────────────────────────┤
│ ▼ Cette semaine (3)                                                    │
│   📋 EDL sortie F-005 Colmar — vendredi 8 mai     [Programmer]        │
│   📈 Lettre IRL F-002 Ferrette — vendredi 8 mai   [Envoyer]           │
│   💰 Taxe foncière SCI — dimanche 10 mai          [Paiement]          │
│ ▶ Ce mois (12)                                                         │
│ ▶ Trimestre (45)                                                       │
└────────────────────────────────────────────────────────────────────────┘
```

**Effort estimé** : ~4j (timeline SVG + agrégateur multi-source). Forte attractivité UX (gamification = engagement).

---

### Lentille 7 — 🔮 Prévisionnel / simulations

**Persona** : investisseur stratège, conseiller, propriétaire en réflexion (vendre / rénover / acheter).
**Cas d'usage** : "Et si je vendais ce bien ? Si j'augmentais le loyer ? Si je rénovais le DPE ? Combien de cash-flow dans 24 mois ?"
**Activation** : au clic.

**KPIs (4 tuiles)**
| KPI | Formule | Source |
|---|---|---|
| Cash-flow projeté 12 mois | Extrapolation tendance N + IRL anticipé | calcul + sliders |
| Cash-flow projeté 24 mois | Idem 24 mois | idem |
| Point mort (mois) | Mois où CF cumulé = 0 (depuis aujourd'hui) | calcul |
| Scénario favori | Nom du scénario sauvegardé "favori" | localStorage |

**Widgets supplémentaires**
- **Chart cash-flow projeté 24m** : courbe avec 3 séries (réel passé / médian futur / scénario actif)
- **Simulations "Si je..."** :
  1. **"Si je vends le bien X cette année"** → impact CF (perte loyers) + impôt PV (16% IR + 17.2% PS sur PV imposable) + cash récupéré net
  2. **"Si je n'augmente pas les loyers"** (skip IRL) → manque à gagner cumulé sur 12/24/60 mois
  3. **"Si je rénove pour passer DPE F → C"** → CAPEX moyen 15-30 k€/lot + nouveau loyer possible + retour sur invest. (mois)
  4. **"Si je passe SCI IS au lieu de IR"** → impact fiscal (à surveiller, calcul à valider avec expert)
- **Curseurs paramètres** :
  - Taux IRL anticipé (slider 0-5%)
  - Vacance moyenne anticipée (slider 0-20%)
  - Charges d'entretien anticipées (slider ±20% médiane historique)
- **Bouton "Sauvegarder ce scénario"** : jusqu'à 3 scénarios A/B/C comparables côte-à-côte
- **Comparaison A/B/C** : tableau récap des 3 scénarios + KPI gagnant/perdant

**Layout (wireframe)**
```
┌────────────── Context bar ────────────────────────────────────────────┐
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│ CF 12 mois   │ CF 24 mois   │ Point mort   │ Scénario favori           │
├──────────────┴──────────────┴──────────────┴──────────────────────────┤
│ Chart cash-flow projeté 24m (réel + médian + scénario actif)         │
│                                                                        │
│ ─── Réel ─── Médian ━━━ Scénario A ━━━ Scénario B                     │
├─────────────────────────────────────────┬─────────────────────────────┤
│ Curseurs paramètres                     │ Simulations "Si je..."      │
│ • Taux IRL [══●═════] 2.5%             │ ☐ Vendre F-003 Mulhouse     │
│ • Vacance  [═●═══════] 5%              │ ☐ Skip IRL F-002             │
│ • Charges  [═══●═════] +0%             │ ☐ Rénover DPE F → C          │
├─────────────────────────────────────────┼─────────────────────────────┤
│ [Sauvegarder ce scénario : "____"]      │ Comparaison A vs B vs C     │
└─────────────────────────────────────────┴─────────────────────────────┘
```

**Effort estimé** : ~8j (les calculs PV / SCI IS sont sensibles → CDC fiscal requis). V1 = simulations naïves (slope linéaire) ; V2 = IA optionnelle.

**Décision à arbitrer** : naïf en V1 ou IA dès le départ ?

---

### Lentille 8 — 🛡️ Patrimoine & conformité

**Persona** : multi-bailleur SCI ≥ 5 lots, prépare revente / héritage / divorce, sensible légal.
**Cas d'usage** : "Mon parc vaut combien net ? Quels biens vont devenir interdits à la location à cause du DPE ?"
**Activation** : au clic.

**KPIs (4 tuiles)**
| KPI | Formule | Source |
|---|---|---|
| Valorisation totale parc | Σ logements.valeurEstimée | `logements[]` |
| Dettes restantes | Σ logements.capitalRestantDu | `logements[]` |
| Patrimoine net | Valorisation − Dettes | calcul direct |
| Biens à risque DPE | Σ logements (DPE = F ou G) | `logements[]` |

**Widgets supplémentaires**
- **Bilan patrimoine** : barres horizontales "Actif × Passif × Net" (visualisation rassurante)
- **Calendrier interdictions DPE** : timeline 2025-2034 avec dates butoirs réglementaires
  - 1er janvier 2025 : interdiction logements G (déjà passé, doit être affiché en rouge)
  - 1er janvier 2028 : interdiction F
  - 1er janvier 2034 : interdiction E
- **Liste biens à risque DPE F/G** : tri par urgence (date butoir) + coût rénovation estimé (CAPEX moyen 15-30 k€/lot) + bouton "Simuler rénovation" (lien Lentille 7)
- **Conformité bail/EDL** : checklist par bien
  - ✅ Bail signé (bilatéral)
  - ✅ EDL entrée
  - ⚠️ EDL sortie (manquant si départ locataire non documenté)
  - ✅ MRH valide
  - ✅ Mentions légales obligatoires (loi 89-462, décret 2015-587)
- **Bouton "Exporter dossier patrimoine PDF"** : utile pour notaire / banque / divorce / succession

**Layout (wireframe)**
```
┌────────────── Context bar ────────────────────────────────────────────┐
├──────────────┬──────────────┬──────────────┬──────────────────────────┤
│ Valorisation │ Dettes rest. │ Patrim. net  │ Biens à risque DPE       │
├──────────────┴──────────────┴──────────────┴──────────────────────────┤
│ Bilan patrimoine (barres horizontales Actif × Passif × Net)          │
│ ████████████████████████████  Actif 1 240 000 €                       │
│ ██████████████                Passif   620 000 €                       │
│ ██████████████                Net      620 000 €                       │
├────────────────────────────────────────────────────────────────────────┤
│ Calendrier interdictions DPE (timeline 2025-2034)                    │
│ [G] 2025 ●——●——●—— 2028 [F] ●—— 2034 [E] ●——————                    │
├─────────────────────────────────────────┬─────────────────────────────┤
│ Biens à risque DPE F/G                  │ Conformité bail / EDL       │
│ • F-003 Mulhouse DPE F — interdit 2028  │ ✅✅✅⚠️✅  par bien          │
│   CAPEX 22 k€  [Simuler rénovation]     │                              │
├─────────────────────────────────────────┴─────────────────────────────┤
│ [Exporter dossier patrimoine PDF]                                      │
└────────────────────────────────────────────────────────────────────────┘
```

**Effort estimé** : ~6j (timeline DPE + bilan patrimoine + dossier PDF natif). Pré-requis : champ `valeurEstimée` + `capitalRestantDu` dans `logements[]`.

**Pré-requis** : data model étendu (lié à Lentille 5).

---

## 3. Synthèse comparative & reco V1/V2

### Matrice de priorisation

| # | Lentille | Persona | Effort | Différenciant marché | Reco |
|---|---|---|---|---|---|
| 1 | 🏠 Propriétaire | Tous (1-3 logements) | 0j | Standard | **V1 (existant)** |
| 2 | 💶 Financier | Comptable, rentier | 3j | Moyen (BailFacile a similar) | **V1** |
| 3 | 🛠️ Gestionnaire | Admin, agent SCI | 5j | Faible (Qalimo similar) | V2 |
| 4 | 📋 Fiscale 2044 | SCI patrimoniale | 5j | **FORT** (aucun concurrent B2C) | **V1** (auto-saison) |
| 5 | 📈 Investisseur | SCI premium 19€ | 7j | **FORT** (rare hors agence) | V2 |
| 6 | ⏰ Échéances | Tous | 4j | Moyen (Smovin similar) | **V1** (gamification) |
| 7 | 🔮 Prévisionnel | Stratège | 8j | **FORT** (rare en B2C) | V2 |
| 8 | 🛡️ Patrimoine | SCI ≥ 5 lots | 6j | **FORT** (DPE F/G unique) | V2 |

**Effort total V1** = 0 + 3 + 5 + 4 = **~12j-h** (~3 semaines en calendaire)
**Effort total V2** = 5 + 7 + 8 + 6 = **~26j-h** (~6-7 semaines en calendaire)

### Reco V1 commerciale (Q4 2026) — 4 lentilles
1. 🏠 **Propriétaire** (par défaut, l'existant)
2. 💶 **Financier** (cash-flow + impayés)
3. 📋 **Fiscale 2044** (auto saisonnier mars-juin)
4. ⏰ **Échéances & alertes** (gamification engagement)

**Raison** : couverture des 3 personas commerciales (Investisseur 9.90€ / SCI 19.90€) + différenciants USP exploitables (Fiscale et Échéances sont les deux où ImmoTrack a un vrai avantage).

### Reco V2 (2027) — 4 lentilles + Custom
5. 🛠️ **Gestionnaire** (V1 agence)
6. 📈 **Investisseur** (premium SCI 19€)
7. 🔮 **Prévisionnel** (stratège)
8. 🛡️ **Patrimoine** (premium SCI 19€)
9. **Custom drag-drop** (V2 SaaS)

---

## 4. Décisions à arbitrer

### Q1. V1 = ces 4 lentilles ou autre combinaison ?
- Option A : 4 lentilles ci-dessus (Propriétaire + Financier + Fiscale + Échéances)
- Option B : 5 lentilles (ajout Patrimoine V1 pour différencier le pricing 19€)
- Option C : 3 lentilles seulement (Propriétaire + Financier + Échéances) — plus simple, lance V1 plus vite
- **Hypothèse par défaut** : A

### Q2. Sélecteur lentille — quelle UI ?
- Option A : selectbox compact `[Voir comme : 🏠 Propriétaire ▾]` (1 ligne)
- Option B : tabs horizontaux `[🏠] [💶] [📋] [⏰]` (visuel mais consomme + de place)
- Option C : sidebar verticale (à la Notion) — pas adapté au dashboard one-screen
- **Hypothèse par défaut** : A (selectbox)

### Q3. Custom layout (drag-drop) — V1 ou V2 ?
- Option A : V2 uniquement (V1 = lentilles fixes)
- Option B : V1 (mais plus d'effort, ~5j-h supplémentaires)
- **Hypothèse par défaut** : A (V2)

### Q4. Activation auto saisonnière Fiscale (mars-juin) — comportement ?
- Option A : toast "Période fiscale — voir le dashboard fiscal ?" (suggestion non-imposée, on/off Paramètres)
- Option B : bascule auto (force la lentille) — plus intrusif
- Option C : pas d'auto, juste un badge "🆕 Période fiscale" sur le sélecteur
- **Hypothèse par défaut** : A

### Q5. Lentille Prévisionnel — IA ou simulations naïves ?
- Option A : naïves V1 (slope linéaire, calculs déterministes)
- Option B : IA dès V1 (LLM via API Anthropic — coût/mois, dépendance externe)
- **Hypothèse par défaut** : A (naïves V1, IA en V2 si feedback positif)

### Q6. Data model — champs financiers étendus (prixAchat, apport, mensualitePret, valeurEstimée, capitalRestantDu)
- Sont-ils saisis manuellement, ou inférés (mensualité = simulation à partir du prix d'achat + taux + durée) ?
- Si manuels : ajout de 5 champs dans le formulaire Logement → effort +1j-h
- Si inférés : besoin d'un sous-formulaire "Acquisition / Financement" avec UX dédiée → effort +2j-h
- **Hypothèse par défaut** : Manuels en V1 (lentilles 5/7/8 en V2 → on a le temps de modéliser proprement)

---

## 5. Conventions & cohérence design system

### Variables CSS réutilisées (tous mockups)
```css
--bg, --sur, --sur2, --sur3, --bor, --bor2
--t1, --t2, --t3                              /* texte */
--blu, --grn, --red, --ora, --pur             /* couleurs sémantiques */
--bg-success, --bg-danger, --bg-warning, --bg-info
--fg-success, --fg-danger, --fg-warning, --fg-info
--shadow, --shadow-card, --shadow-hover
--r, --rl                                     /* border-radius */
--font-base, --lh                             /* typo */
```

### Composants réutilisés
- `.card`, `.kpi`, `.tbl`, `.btn` (legacy)
- `.dw`, `.dw-body`, `.dw-foot`, `.dw-label`, `.dw-value`, `.dw-sub`, `.dw-pill`, `.dw-see-all`
- `.dw-cN dw-rM` pour la grille
- `.dw-s-red/ora/grn/blu` pour les accents statut
- `.alert` (info/warn/err/ok)
- `.badge` (grn/red/ora/blu/pur/gry)

### Police
- `IBM Plex Sans` (UI)
- `Manrope` (chiffres KPI, valeurs)

### Iconographie
- Emojis natifs (cohérent avec app actuelle qui utilise déjà les emojis 🏠💶📋⏰)
- Pas de SVG icon set (gain de poids, cohérence cross-platform)

### Mode sombre
- Bascule via `<html data-theme="dark">` (déjà géré dans index.html actuel)
- Tous tokens couleur passent par les variables CSS — aucun hex localisé

---

## 6. Données fictives (cohérentes pour les 8 mockups)

Bailleur **SCI Familiale Keller** (Didier Keller) — 5 logements actifs :

| Réf | Localisation | Type | Surface | HC | Charges | DPE | Locataire | Statut |
|---|---|---|---|---|---|---|---|---|
| F-001 | Strasbourg Krutenau | T3 | 65m² | 850€ | 80€ | D | Mme ARSLAN Leyla | Actif (impayé -1850€ sur 2 mois) |
| F-002 | Ferrette | Maison T4 | 90m² | 1100€ | 90€ | C | M. HARNIST + Mme ROUX | Actif (IRL à réviser 15 juin) |
| F-003 | Mulhouse Dornach | Studio | 28m² | 480€ | 40€ | **F** | M. ZAHLAOUI Amine | Actif (DPE F → interdit 2028) |
| F-004 | Strasbourg Wacken | Garage | — | 95€ | 0€ | — | Vacant | Vacant 1 mois |
| F-005 | Colmar Centre | T2 | 50m² | 720€ | 60€ | E | Vacant | Vacant 2 mois (départ Mme PFISTER) |

**Données financières (12 mois glissant)**
- Revenus annuels bruts : 38 460 € (loyers HC) + 3 240 € (charges) = 41 700 €
- Charges déductibles : 11 850 € (TF: 3 200, intérêts: 4 800, MRH: 880, copro: 1 470, entretien: 1 500)
- Cash-flow net annuel : 29 850 €
- MRI : 71.6%
- Patrimoine estimé : 1 240 000 €
- Dettes restantes : 620 000 €
- Patrimoine net : 620 000 €

**Échéances 90 jours** (à partir du 1er mai 2026)
- 8 mai : EDL sortie F-005 + Lettre IRL F-002 + Taxe foncière SCI
- 15 mai : Anniversaire bail F-001 ARSLAN
- 22 mai : Renouvellement MRH F-002
- 1er juin : Quittance mensuelle (générer)
- 15 juin : **Application IRL F-002** (révision +2.31%)
- 30 juin : Date butoir 2044
- 15 juillet : EDL entrée nouveau locataire F-005 (si trouvé)
- + 38 autres échéances mineures (entretiens chaudière, ramonage, contrôles VMC, etc.)

**Impayés**
- F-001 ARSLAN — 1850€ (2 loyers manqués mars + avril 2026) — relance LRAR à envoyer

---

## 7. Plan d'action (suite session)

1. **Phase 1 (cette session)** : aperçu visuel HTML statique → validation utilisateur
2. **Phase 2 (autre session, post-validation)** : implémentation prod en `index.html`
   - 2a — Sélecteur lentille + persistance localStorage (1j)
   - 2b — Lentille 1 (existant, juste rename) (0j)
   - 2c — Lentille 2 Financier (3j)
   - 2d — Lentille 4 Fiscale (5j) — couplé sujet `LEGAL-2044`
   - 2e — Lentille 6 Échéances (4j)
   - 2f — V1 livrée (~3 semaines calendaire)
   - 2g — V2 (4 lentilles + Custom) → 6-7 semaines

---

**Document écrit en Phase 1 aperçu — 2026-05-01.**
