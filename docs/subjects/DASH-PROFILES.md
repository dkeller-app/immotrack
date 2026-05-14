# DASH-PROFILES — Dashboards par lentille (persona / cas d'usage)

**Status** : ✅ Phase 2 livrée v15.13 (Sprint 13 V1.1, 2026-05-14) — 4 onglets opérationnels
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
- 2026-05-01 : **Phase 1 v1 livrée** · session dédiée ~3h
  - `docs/strategie/DASH-PROFILES-SPEC.md` (576 lignes) : spec détaillée 8 lentilles + matrice priorisation + 6 questions ouvertes + données fictives cohérentes
  - `docs/strategie/dashboard-mockups/` : 9 fichiers HTML (index sélecteur + 8 lentilles cliquables) + CSS partagé (671 lignes, design tokens identiques à index.html prod) + nav.js (sélecteur + dark/light toggle)
  - Données fictives : SCI Familiale Keller, 5 logements, 1 impayé, 1 vacance, 1 DPE F · cohérentes entre les 8 mockups → l'utilisateur peut comparer "même réalité, vues différentes"
  - Reco initiale V1 (4 lentilles, ~12 j-h) : Propriétaire + Financier + Fiscale 2044 + Échéances · V2 (4 lentilles + Custom, ~26 j-h) : Gestionnaire + Investisseur + Prévisionnel + Patrimoine
  - 6 questions à arbitrer documentées (V1 scope, sélecteur UI, custom V1/V2, auto-saison Fiscale, IA Prévisionnel, data model financier)
  - Pas de modif `index.html` prod (consigne respectée)

- 2026-05-05 : **Feedback utilisateur direct** · session de recadrage
  - 💬 "Pas convaincu par tous les dashboards. Je veux un dashboard 'complet' qui parle à un propriétaire d'immeuble — visu simple et rapide finance + état du bien (comme moi)"
  - 💬 Investisseur/Prévisionnel/Patrimoine = "des paillettes, pas viable en grattant"
  - 💬 Échéances = "redondant avec Gestionnaire"
  - 💬 Fiscale 2044 = "à garder quand on aura avancé sur le sujet"
  - 💬 "Normalement un dashboard c'est un écran pas une continuité. Là c'est pas excellent."
  - User partage 3 screenshots prod actuel comme baseline
  - Réponse Q2 : onglets en haut du dashboard (Propriétaire / Gestionnaire / Complet / Custom)

- 2026-05-05 : **Phase 1 v2 livrée** · refonte complète après feedback
  - **`DASH-PROFILES-SPEC.md` v2** réécrit (350 lignes) : 4 onglets au lieu de 8 lentilles, plan implémentation Phase 2 (~4.5 j-h vs ~38 j-h avant), 3 décisions D1-D3 à arbitrer
  - **Nouvelle Vue Propriétaire 1 écran** : refonte profonde de la lentille 1 (qui n'était que l'existant rebrandé) → fusion ex-Lentille 1 + ex-Lentille 2 Financier, densifié pour ~900 px : Hero + À-traiter + 4 KPIs Finance compactés + Revenus/Charges + Progression annuelle + Alertes 1-ligne + Mon parc effondré
  - **Nouvelle Vue Gestionnaire** améliorée : absorbe ex-Lentille 6 Échéances (timeline 90j) · KPIs ops + Hero "À faire" + Calendrier 60j + Vacances + Impayés + À clore
  - **Onglets Complet + Custom** : pas de mockup (= prod actuelle telle quelle pour Complet, mode édition existant pour Custom)
  - **6 lentilles archivées** dans `dashboard-mockups/_attic/` avec README.md + bandeau "📦 Archivé" : lentille-2-financier · lentille-4-fiscale · lentille-5-investisseur · lentille-6-echeances · lentille-7-previsionnel · lentille-8-patrimoine
  - **Données fictives mises à jour** : SCI DD2AMELEVIERES (SCI IS) 16 logements, 2 vacants, 1 impayé · données réelles tirées des screenshots utilisateur
  - **`nav.js` simplifié** : 3 entrées actives (home + Propriétaire + Gestionnaire) + 2 entrées info (Complet + Custom = pas de mockup)
  - **`index.html` refondu** en hub des 4 onglets + plan implémentation Phase 2 + 3 décisions D1-D3 + section "Outils différés"
  - Effort estimé Phase 2 : **~4.5 j-h (~1 semaine calendaire)** au lieu de ~38 j-h dans la v1

- 2026-05-14 : ✅ **Phase 2 livrée v15.13** (Sprint 13 V1.1, ~3h) :
  - **Phase 2a** : Onglets en haut du dashboard (`Propriétaire / Gestionnaire / Complet / Custom`) avec persist `DB.params.dashTab` (décision D1 = B : par-utilisateur sync Drive). Helper `setDashTab(tab, e)` + `_currentDashTab()`. Migration douce `initDB()` default `'proprio'`.
  - **Phase 2b** : Onglet Propriétaire densifié via preset `DASH_TAB_PRESETS.proprio` — masque `agenda-dash` + `sep-gestion`, garde `context-bar / hero / todo-unified / sep-finance / flux / occ / rdt / donut / dg / prog / solde`. Vue 1-écran finance + alertes.
  - **Phase 2c** : Onglet Gestionnaire via preset `DASH_TAB_PRESETS.gestion` — masque les KPIs finance lourds (`flux/occ/rdt/donut/dg/solde/prog`), garde `context-bar / hero / todo-unified / sep-gestion / agenda-dash + widgets ops` (vac, mag, mrh, irl, bail, regul, stat). Vue opérationnelle.
  - **Phase 2d (Complet)** : utilise `_mergeWithDefaults(saved)` — respecte les overrides utilisateur OU défaut `DASH_DEFAULT_LAYOUT` complet (tous widgets activables via panneau ⚙ Widgets).
  - **Phase 2e (Custom)** : idem Complet en lecture, mais le mode édition (drag-drop) sauvegarde dans `DB.params.dashLayout` — layout dédié indépendant (décision D2 = B). Note : l'éditeur actuel impacte aussi Complet ; cleanup ultérieur pour séparer 100% (Sprint V2).
  - **Phase 2f (drill-down)** : la section `dash-ent-cards` existante sert de "Mon parc" effondré. Drill par bien → clic carte ouvre fiche logement (décision D3 = A : modale type fiche 360°). Pas de nouvelle modale plein-écran nécessaire.
  - Tests Vitest : 713 toujours passants (rien cassé, fix UI uniquement).
- Différenciant marché atteint : aucun concurrent (Rentila/BailFacile/Qalimo/Smovin) n'a de onglets dashboard par persona. Argument marketing premium pricing validé.
