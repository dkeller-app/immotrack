# DASH-PROFILES — Dashboards par lentille (persona / cas d'usage)

**Status** : ⏳ Phase 1 (aperçu) livrée — attente validation utilisateur · depuis 2026-05-01
**Prio** : P1 · **Taille** : XL (refonte dashboard majeure, ~1-2 semaines en codage prod après validation aperçu)
**Détecté** : 2026-05-01
**Lié à** : DASH-V2 · DASH-KPI-HC · BIZPLAN · BUG-DASH-001

## Contexte
Demande utilisateur 2026-05-01 :
> 💬 « pour le dashboard est-ce intéressant de proposer plusieurs templates de dashboard en fonction de ce qu'on veut voir ou gérer ? Financier / Gestionnaire / Propriétaire »

Demande implicite : **différenciant marché majeur**. Aucun concurrent (Rentila, BailFacile, Qalimo, Smovin, ImmobilierLoyer) ne fait de dashboards par persona. ImmoTrack avec lentilles devient unique sur le marché B2C/SCI.

## Approche en 2 phases

### Phase 1 — Aperçu (CETTE SESSION, sans codage prod)
**Objectif** : produire un aperçu visuel + spec détaillée des 8 lentilles proposées, pour que l'utilisateur **valide avant tout codage prod**.

Livrables :
- `docs/strategie/DASH-PROFILES-SPEC.md` — spec détaillée 8 lentilles (KPIs, widgets, layout, persona, interactions)
- `docs/strategie/dashboard-mockups/` — 8 mockups HTML statiques cliquables avec nav entre lentilles
- `docs/strategie/dashboard-mockups/index.html` — page d'accueil + sélecteur de lentille
- Décision finale : quelles lentilles V1 vs V2

### Phase 2 — Implémentation (autre session, après validation)
À planifier après validation utilisateur.

## Les 8 lentilles proposées

### 1. 🏠 Propriétaire (par défaut, = l'existant)
**Persona** : propriétaire occasionnel, 1-3 logements, vue globale rassurante
**KPIs** : cash-flow mensuel, occupation %, prochaines échéances, alertes legal
**Widgets** : KPI tuiles + sparklines + alertes dashboard
**Layout** : ce qui existe aujourd'hui (DASH-V2 livré)

### 2. 💶 Financier (cash-flow expert)
**Persona** : propriétaire qui pense en €, comptable, financier perso
**KPIs** : cash-flow mensuel/trimestriel/annuel, MRI, impayés cumulés, charges/produits ratio, marge brute, marge nette, ratio charges récupérables vs non-récupérables
**Widgets** :
- Cash-flow chart mensuel 12 mois (revenu - charges)
- Tableau impayés actifs (locataire, montant, jours retard)
- Répartition charges par catégorie (camembert)
- Comparatif N vs N-1 (waterfall)
- KPI "encaissé / dû" du mois
**Layout** : focus chiffres et tableaux, peu de visuel

### 3. 🛠️ Gestionnaire (opérationnel)
**Persona** : admin biens, agent, gestionnaire SCI familiale
**KPIs** : vacances locatives (nb biens × jours), impayés en cours, échéances baux <90j, EDL sortie à faire, baux à renouveler, candidatures en attente
**Widgets** :
- Liste "À faire cette semaine" (avec actions inline)
- Liste vacances locatives (avec lien vers LOG-ANNONCE)
- Liste impayés actifs avec bouton "Relancer"
- Calendrier mini (3 mois) avec échéances coloriées
- Compteur EDL/baux/régul à clore
**Layout** : liste-action, peu de chiffres, beaucoup de boutons

### 4. 📋 Préparation fiscale 2044 (saisonnier auto)
**Persona** : tous, **s'active automatiquement de mars à juin**
**KPIs** : revenus fonciers bruts, charges déductibles par catégorie 2044, revenus fonciers nets, déficit foncier de l'année, déficit reportable cumulé, comparatif N-1
**Widgets** :
- Pré-rempli formulaire 2044 (case par case avec valeurs)
- Tableau charges déductibles par catégorie (intérêts emprunt, travaux, assurances, charges copro non récupérables, taxe foncière)
- Bouton "Exporter 2044 PDF"
- Bouton "Exporter données comptable" (CSV par catégorie)
- Comparatif graphique N vs N-1 (déficit reportable)
- Alertes : charges manquantes (ex "Vous avez 0€ de taxe foncière saisi en N — anormal")
**Layout** : très focalisé, format quasi-formulaire

### 5. 📈 Investisseur (rentabilité pure)
**Persona** : multi-bailleur SCI patrimoniale, rentier qui pense en %
**KPIs** : TRI par bien et global, cash-on-cash, DSCR (Debt Service Coverage Ratio), valorisation parc, ROI vs marché local, capacité d'emprunt résiduelle, ratio LTV par bien, vacance moyenne, écart loyer marché
**Widgets** :
- Tableau classement biens par TRI (best/worst performeur)
- Graphique valorisation parc dans le temps
- Carte heatmap rendement par ville/quartier (si géoloc)
- Simulation "Quel impact de revendre X ?"
- Comparatif ROI vs SCPI / livret A / immobilier moyen
**Layout** : tableaux denses + chiffres + comparatifs

### 6. ⏰ Échéances & alertes (centre de notif)
**Persona** : tous, vue **actionnable** plutôt que **constative**
**KPIs** : nb actions à 7j / 30j / 90j, prochaine deadline critique, retard non traité
**Widgets** :
- Timeline horizontale des 90 prochains jours avec échéances coloriées
- Liste regroupée : "Cette semaine" (3) · "Ce mois" (12) · "Trimestre" (45)
- Catégories : 📜 baux (fins, renouvellements), 📈 IRL (révisions), 📋 EDL (à programmer), 💰 fiscal (taxe foncière), 🛠️ entretien (chaudière, ramonage), 🛡️ MRH (renouvellement), 🏛️ DPE (validité 10 ans), 💼 cautionnement
- Toggle "Tout traiter" → marque comme traité
- Filtre par bien
**Layout** : timeline + checklist, gamification possible (compteur "X actions cette semaine")

### 7. 🔮 Prévisionnel / simulations
**Persona** : investisseur, conseiller, propriétaire stratège
**KPIs** : cash-flow projeté 12/24 mois, IRL anticipé, point mort, scénarios
**Widgets** :
- Chart cash-flow projeté 24 mois (avec curseurs ajustables)
- Simulations "Si je..." :
  - "Si je vends le bien X cette année" → impact CF + impôt PV
  - "Si je n'augmente pas les loyers" → manque à gagner
  - "Si je passe LCD en SAS" → impact fiscal
  - "Si je rénove pour passer DPE F → C" → CAPEX + nouveaux loyers possibles
- Curseurs paramètres (taux IRL anticipé, vacance moyenne, charges anticipées)
- Bouton "Sauvegarder ce scénario" (jusqu'à 3 scénarios comparables)
**Layout** : interactif, sliders, comparatifs A/B/C

### 8. 🛡️ Patrimoine & conformité
**Persona** : multi-bailleur SCI, préparation revente/héritage/divorce
**KPIs** : valorisation totale parc, dettes restantes, ratio actif/passif, conformité légale (DPE F/G interdiction calendrier 2025-2034, EDL manquants, mentions obligatoires)
**Widgets** :
- Bilan patrimoine (actif × passif × net)
- Calendrier interdictions DPE (G interdit 2025, F interdit 2028, E interdit 2034)
- Liste biens à risque DPE F/G (avec coût rénovation estimé)
- Conformité bail/EDL : checklist par bien (signature complète, EDL entrée, EDL sortie après départ, etc.)
- Bouton "Exporter dossier patrimoine PDF" (utile pour notaire/banque)
**Layout** : bilan + alertes + dates butoirs

## 2 axes transverses (orthogonaux aux lentilles)

### A. Sélecteur "Lentille" en haut du dashboard
- Selectbox `[Voir comme : 🏠 Propriétaire ▾]`
- 1 clic → KPIs/widgets se reorganisent
- Mémorisation dernière lentille (localStorage)
- Activation auto saisonnière pour Lentille Fiscale (mars-juin)

### B. Layout "Custom" (drag-drop)
- 9e lentille "Mon dashboard"
- Drag-drop des widgets disponibles
- Sauvegarde jusqu'à 3-5 layouts persos
- V2 SaaS : partage entre comptes

## Recommandation V1 vs V2

**V1 commerciale (Q4 2026)** — 4 lentilles :
1. Propriétaire (par défaut, l'existant)
2. Financier
3. Échéances & alertes (haut impact perçu)
4. Préparation fiscale 2044 (auto saisonnier)

**V2 (2027)** :
5. Gestionnaire
6. Investisseur
7. Prévisionnel
8. Patrimoine & conformité
9. Custom drag-drop

## Décisions à prendre (à arbitrer en Phase 1 aperçu)
- [ ] V1 = ces 4 lentilles ou autre combinaison ?
- [ ] Sélecteur lentille : selectbox / tabs / sidebar ?
- [ ] Custom layout en V1 ou V2 ?
- [ ] Activation auto saisonnière (mars-juin pour Fiscale) : oui/non ?
- [ ] Données prévisionnel (Lentille 7) : on fait des simulations naïves ou on intègre IA/LLM ?

## Différenciant marché
- **Aucun concurrent** ne propose de lentilles (Rentila, BailFacile, Qalimo, Smovin, ImmobilierLoyer)
- Argument marketing fort : "Le seul outil qui s'adapte à ce que vous voulez voir aujourd'hui"
- Justifie premium pricing (19€ vs 9€) car répond à plusieurs personas

## Notes utilisateur
> 💬 2026-05-01 : "pour le dashboard est-ce intéressant de proposer plusieurs template de dashboard..."
> 💬 2026-05-01 : "je veux un aperçu de toutes tes propositions avant codage"

## Journal
- 2026-05-01 : créé · 8 lentilles proposées (3 utilisateur + 5 Claude) · attente Phase 1 aperçu
- 2026-05-01 : **Phase 1 aperçu livrée** · session dédiée ~3h
  - `docs/strategie/DASH-PROFILES-SPEC.md` (576 lignes) : spec détaillée 8 lentilles + matrice priorisation + 6 questions ouvertes + données fictives cohérentes
  - `docs/strategie/dashboard-mockups/` : 9 fichiers HTML (index sélecteur + 8 lentilles cliquables) + CSS partagé (671 lignes, design tokens identiques à index.html prod) + nav.js (sélecteur + dark/light toggle)
  - Données fictives : SCI Familiale Keller, 5 logements, 1 impayé, 1 vacance, 1 DPE F · cohérentes entre les 8 mockups → l'utilisateur peut comparer "même réalité, vues différentes"
  - Reco initiale V1 (4 lentilles, ~12 j-h) : Propriétaire + Financier + Fiscale 2044 + Échéances · V2 (4 lentilles + Custom, ~26 j-h) : Gestionnaire + Investisseur + Prévisionnel + Patrimoine
  - 6 questions à arbitrer documentées (V1 scope, sélecteur UI, custom V1/V2, auto-saison Fiscale, IA Prévisionnel, data model financier)
  - Pas de modif `index.html` prod (consigne respectée)
