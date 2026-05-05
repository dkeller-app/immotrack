# DASH-PROFILES — Spec v2 (refonte après feedback)

> **Phase 1 — Aperçu (sans codage prod) — V2 du 2026-05-05**
> Document de spécification du dashboard à 4 onglets pour validation utilisateur avant implémentation.
> Référence visuelle : mockups HTML statiques dans `dashboard-mockups/`.
> Status : ⏳ Phase 1 v2 livrée — attente validation finale · Lié à `docs/subjects/DASH-PROFILES.md`

---

## 0. Historique de la spec

- **v1** (2026-05-01) — proposition initiale "8 lentilles" (Propriétaire / Financier / Gestionnaire / Fiscale / Investisseur / Échéances / Prévisionnel / Patrimoine + Custom). Mockups produits dans `dashboard-mockups/`.
- **v2** (2026-05-05) — **refonte après feedback utilisateur** :
  - 4 lentilles jugées "paillettes" (Investisseur / Prévisionnel / Patrimoine + Échéances redondante)
  - 1 lentille différée (Fiscale 2044 → outil dédié dans `LEGAL-2044`)
  - 1 lentille fusionnée (Financier → dans Propriétaire)
  - **Lentille 1 Propriétaire** repensée : c'était l'existant rebrandé, refondue en **vue 1 écran** densifiée
  - Sélecteur lentille remplacé par **onglets en haut du dashboard**
  - 4 onglets retenus : Propriétaire (par défaut) · Gestionnaire · Complet · Custom

---

## 1. Architecture v2 — 4 onglets

```
Dashboard
├─ [🏠 Propriétaire]   ← onglet par défaut, refonte 1 écran (~900 px)
├─ [🛠️ Gestionnaire]   ← amélioration ex-lentille 3 + absorption ex-lentille 6 Échéances
├─ [📐 Complet]        ← prod actuelle telle quelle (= "tout afficher", scroll OK)
└─ [✎ Custom]          ← mode édition existant (drag-drop, panneau Widgets)
```

**Position des onglets** : barre toolbar en haut du dashboard, à gauche des sélecteurs année/mois/entité. UI : segmented buttons (radio visuel) avec celui actif en bleu plein.

**Persistance** : `DB.params.dashTab` (par utilisateur, sync Drive — cohérent avec `dashLayout` existant).

**Activation par défaut** : `dashTab='proprietaire'` au premier login.

---

## 2. Onglet Propriétaire (refonte profonde)

### Cible
Tenir sur **1 écran (~900 px hauteur utile, viewport desktop 1280-1320 px de large)**.

### Cas d'usage
"J'ouvre ImmoTrack le matin, je veux voir d'un coup d'œil mon état financier + état du parc + alertes critiques. Sans scroll."

### Layout (12 col, grid-auto-rows 54 px, gap 8 px)

| Row | c | r | Widget | Contenu | Drill-down |
|---|---|---|---|---|---|
| 1 | 8 | 3 | Hero Cash-flow | +208,80 € + sparkline 12m + creux Janvier + alerte impayé inline | `_buildHeroDrill` (existant) |
| 1 | 4 | 3 | À traiter (4 quads) | Assurances/IRL/Équipements/Régul cliquables | `_buildTodoDrill` (existant) |
| 2 | 3 | 2 | KPI Occupation | 88 % · 14/16 · MAG | `_buildOccDrill` (existant) |
| 2 | 3 | 2 | KPI Rendement brut | 4.6 % (théo. 8.6 %) + sparkline mini | `_buildRdtDrill` (existant) |
| 2 | 3 | 2 | KPI Charges/cat (donut) | Prêt 81 % / Trv 7 % / Copro 5 % / Autres 7 % | drill existant + Solde provisions absorbé ici |
| 2 | 3 | 2 | KPI DG | 5 980 € · 13 DG | drill existant |
| 3 | 6 | 4 | Revenus vs Charges 6m | chart multi-ligne | `_buildFluxDrill` (existant) |
| 3 | 6 | 4 | Progression annuelle | 260 % collecté + table par entité/immeuble | `_buildProgDrill` (existant) |
| 4 | 12 | 1 | Bandeau Alertes (4) | 1 ligne dense : IRL F-101 / Impayé D-105 / MRH F-Local / 2 vacants | onglet Agenda existant |
| 5 | 12 | 2 | Mon parc — synthèse | 1 ligne par entité (Recettes/Dép./Résultat/Occ/Détail →) | **modale plein-écran** avec vue prod actuelle |

### Effondrements vs prod actuelle

1. **§3 Gestion locative** (entité→immeuble→cards logement, ~400-800 px en prod) → **1 ligne synthétique par entité** (~70 px) + bouton "Détail →" ouvre modale plein-écran avec vue identique à la prod (zéro régression). À long terme cette vue déménagera vers l'onglet "Mes biens" (sujet `LOG-LISTE-CARDS`).
2. **Solde provisions de charges** (widget standalone en prod) → **drill-down depuis le KPI Charges/cat** (sous le donut).
3. **Agenda 15 j** (widget 4×4r en prod) → **bandeau Alertes (4) 1 ligne** + drill-down "Voir toutes" qui pointe vers l'onglet Agenda existant.
4. **5 KPIs Finance** en prod (flux 6×4 + 4 KPIs 3×2 + prog 6×4 + solde 6×4) → **4 KPIs 3×2** sur 1 rangée + flux/prog côte-à-côte.

### Effort estimé V1 : ~1 j-h (densification + bandeau + ligne entité)

---

## 3. Onglet Gestionnaire (amélioration + absorption)

### Cible
1 écran (~900 px). Focus opérationnel "qu'est-ce que je dois faire cette semaine".

### Cas d'usage
"Je suis admin biens / hands-on. Je veux ma liste d'actions concrètes du jour, sans avoir à fouiller."

### Layout

| Row | c | r | Widget | Contenu |
|---|---|---|---|---|
| 1 | 3 | 2 | KPI Vacances | 2 (D-002 30j, dsqqds 60j) |
| 1 | 3 | 2 | KPI Impayés actifs | 1 (D-105 BOULALA 597 €) |
| 1 | 3 | 2 | KPI Cette semaine | 3 actions |
| 1 | 3 | 2 | KPI Trimestre 90j | 45 actions |
| 2 | 8 | 5 | Hero "À faire cette semaine" | checklist 7 items + actions inline (LRAR / Programmer / Email / Annonce) |
| 2 | 4 | 5 | Calendrier 60 j | heatmap mensuel mai + juin avec densité par jour |
| 3 | 12 | 3 | **Timeline 90 j (absorbée d'ex-lentille 6)** | axe horizontal + pastilles colorées par catégorie + bandeau résumé "Cette sem./Ce mois/Trimestre/Retards" |
| 4 | 6 | 3 | Vacances locatives | cards par bien + actions Annonce/Visites |
| 4 | 6 | 3 | Impayés à relancer | cards + actions LRAR/Tél/Email |
| 5 | 12 | 1 | À clore | strip 3 chips : EDL sortie 2 · Bail 1 · Régul 3 |

### Différence vs ex-lentille 3 (v1)
- **+ Timeline 90 j** (absorbée d'ex-lentille 6 Échéances que tu jugeais redondante)
- **+ Densifié** (passer de ~1 200 px à ~900 px en compactant les rangées)
- **+ Onglets en haut** cohérents avec Propriétaire

### Effort estimé V1 : ~2 j-h (checklist déjà semi-existante via dashboard alerts, timeline nouvelle, calendrier nouveau)

---

## 4. Onglet Complet

= **Le dashboard prod actuel TEL QUEL**, sans modification.

- Pour utilisateur expert qui veut tout voir d'un coup (bilan trimestriel, audit, etc.)
- Scroll OK, pas de cible 900 px
- Tous les widgets visibles par défaut (= layout prod actuel)
- 0 j-h (juste rendre l'onglet sélectionnable)

---

## 5. Onglet Custom

= **Le mode édition existant en prod**.

- Bouton "Éditer" existant active drag-drop
- Panneau "Widgets" existant permet d'ajouter/retirer widgets (~14 widgets désactivables réactivables)
- Sauvegarde dans `DB.params.dashLayout` (déjà en place)
- 0 j-h (juste rendre l'onglet sélectionnable)

**Note** : le layout Custom est SÉPARÉ du layout Complet (l'utilisateur a 2 layouts indépendants si décision D2 = B).

---

## 6. Outils différés / standby

Ces 5 idées de la v1 sont **abandonnées en tant que dashboards** mais peuvent revenir comme **outils dédiés** plus tard :

| Idée v1 | Devenir | Sujet associé |
|---|---|---|
| 💶 Financier (lentille 2) | Fusionnée dans Propriétaire | — |
| 📋 Fiscale 2044 (lentille 4) | **Outil dédié** (P1, garde la prio) | `LEGAL-2044` (déjà au backlog) |
| 📈 Investisseur (lentille 5) | Standby | À créer si besoin (pré-requis : data model étendu `LOG-FINANCE-FIELDS`) |
| ⏰ Échéances (lentille 6) | Absorbée dans Gestionnaire (timeline 90 j) | — |
| 🔮 Prévisionnel (lentille 7) | Standby (outil "Simulateur" séparé) | À créer si besoin |
| 🛡️ Patrimoine (lentille 8) | Standby (outil "Bilan & conformité" séparé) | À créer si besoin (pré-requis : data model étendu) |

Mockups archivés dans `dashboard-mockups/_attic/` (consultables avec bandeau "📦 Archivé").

---

## 7. Plan d'implémentation Phase 2

| Étape | Livrable | Effort |
|---|---|---|
| 2a | Onglets en haut du dashboard + persist `DB.params.dashTab` | ~0.5 j-h |
| 2b | Onglet Propriétaire : densification widgets (4 KPIs au lieu de 5, alertes-strip au lieu d'agenda 4×4r, parc effondré ligne synthétique) | ~1 j-h |
| 2c | Onglet Gestionnaire : nouveau layout (KPIs ops, hero À-faire, timeline 90j, vacances+impayés, à-clore) | ~2 j-h |
| 2d | Onglet Complet = mappe sur layout existant (juste exposition tab) | 0 j-h |
| 2e | Onglet Custom = mappe sur mode édition existant (juste exposition tab) | 0 j-h |
| 2f | Drill-down "Mon parc" en modale plein-écran (vue prod préservée) | ~1 j-h |
| **Total V1** | **~4.5 j-h (~1 semaine calendaire)** | |

---

## 8. Décisions à arbitrer

### D1. Persistance onglet — par-utilisateur ou par-device ?
- A. `localStorage.dashTab` (par device, simple)
- B. `DB.params.dashTab` (par utilisateur, sync Drive)
- **Hypothèse par défaut : B** (cohérence avec `dashLayout` existant)

### D2. Onglet Custom = renommage de l'existant ou layout séparé ?
- A. Custom = même layout que Complet en mode édition (= bouton ✎ Éditer existant)
- B. Custom = layout SÉPARÉ de Complet (l'utilisateur a 2 layouts indépendants)
- **Hypothèse par défaut : B** (Custom = layout dédié, Complet reste figé)

### D3. Vue détaillée par logement — modale ou nouvel onglet ?
- A. Modale plein-écran depuis "Détail →" (immédiat, pas de migration)
- B. Migration directe vers nouvel onglet "Mes biens" (sujet `LOG-LISTE-CARDS`)
- **Hypothèse par défaut : A** en V1, B après livraison de `LOG-LISTE-CARDS`

---

## 9. Conventions design (inchangées)

- **Variables CSS, composants, typo** : strictement identiques à `index.html` prod (`feedback_design_consistency.md`)
- **Mode sombre** : tous les widgets en `var(--*)`, bascule via `[data-theme="dark"]`
- **Responsive** : mobile 320 px / tablette 768 px / desktop 1280 px (`feedback_responsive.md`)
- **Drill-downs** : tous préservés via `_dashCardClick` existant

---

## 10. Données fictives (mises à jour avec ta SCI réelle)

Sur la base des screenshots utilisateur (5 mai 2026) :

- **SCI DD2AMELEVIERES (SCI IS)** · 16 logements (Freyming 7 + Damelevières 9) · 14 occupés + 2 vacants
- **Avril 2026** · Recettes 6 146,41 € · Dépenses 5 937,61 € · Cash-flow +208,80 €
- **YTD** -2 168,15 € · **12m glissants** -2 168,15 €
- **1 impayé** D-105 BOULALA -597,64 €
- **2 vacants** D-002 Damelevières (30 j) + dsqqds Freyming (60 j)
- **1 IRL en cours** F-101 ZITO 440 → 443,42 € (+0,78 %, application 1<sup>er</sup> juin)
- **1 MRH manquante** F-Local MANGIN
- **Progression annuelle** 260 % collecté · attendu 9 520 € · réalisé 24 752 €
- **Occupation** 88 % · **Rendement brut** 4.6 % (théo. 8.6 %)
- **DG détenus** 5 980 € (13 DG)
- **Charges/cat** Prêt 81 % · Travaux 7 % · Copro 5 % · Autres 7 %

---

**Document v2 écrit le 2026-05-05 après feedback utilisateur.**
