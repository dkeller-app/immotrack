# Plan refonte Dashboard ImmoTrack — v2 « wahoo » (révision 2026-05-15)

**Date :** 2026-05-15
**Auteur :** designer UX/UI (session pilotage)
**Livrable associé :** `v2-refonte-2026-05-15.html` (mockup statique self-contained, 9 vues)
**Itération :** v2 du mockup (la v1 du 2026-05-14 a été notée **6/10**)

---

## 1. Retour utilisateur sur le mockup v1 (synthèse)

Le mockup `v2-refonte-2026-05-14.html` a été noté **6/10** sur les axes suivants :

| Critère                         | v1 (note user)  | Cause racine                                                        |
|---------------------------------|-----------------|---------------------------------------------------------------------|
| Direction couleurs              | Faible          | Pas la palette Boursorama demandée (gradients gris/bleu génériques) |
| CTA action-oriented (Deliveroo) | Faible          | Boutons discrets « Relancer › » au survol, pas de CTA gros et plein |
| Tient sur 1 écran               | Partiellement   | Le « niveau 1 » sous le pli oblige à scroller pour la moitié des KPI|
| Profils utilisateurs            | Insuffisant     | 2 cibles seulement (Solo/Pro), pas de **Gestionnaire** isolé         |
| Différenciation des thèmes      | Insuffisante    | 3 thèmes existent mais structurellement identiques (juste palette)   |
| Profils Solo vs Pro             | Insuffisante    | 1 widget de différence seulement (agenda Pro-only)                   |
| Jargon                          | Présent         | Libellés UI contiennent encore IRL, MRH, DG, EDL, F-101…             |
| Inspirations claires            | Non identifiable| « Stripe + Linear + Revolut » trop génériques, lecteur ne voit rien  |

> Verbatim user : « boursorama pour les couleurs, deliveroo pour le coté utilisateur · ça ne tient pas sur une page · j'avais demandé une version gestionnaire · solo et pro quasi identique · version colorée quasi identique à la version sobre ».

---

## 2. Ce qui change dans la v2 — et pourquoi

### 2.1 Architecture des onglets

| v1 (2026-05-14)                                    | v2 (2026-05-15)                                                              |
|----------------------------------------------------|------------------------------------------------------------------------------|
| Toggle binaire Solo / Pro                          | **3 profils** Solo / Gestionnaire / Pro — vraiment différents                |
| 3 thèmes Sobre / Finance / Coloré                  | **3 thèmes** Sobre / Coloré / Dark Boursorama — vraiment différents          |
| 1 layout commun + 1 widget Pro-only                | **9 layouts distincts** (3×3) avec des compositions de widgets différentes   |

**Pourquoi** : le brief était littéral — « solo et pro quasi identique → différences profondes par persona ». On ajoute Gestionnaire (10-50 lots) comme cas d'usage central avec **table dense + bulk actions** que les particuliers n'ont pas.

### 2.2 Palette — Boursorama assumée

| Token        | v1 (2026-05-14)        | v2 (2026-05-15)                          |
|--------------|------------------------|------------------------------------------|
| Dark BG      | `#0b1220` (gris-noir)  | **`#0A0E27`** (bleu nuit Boursorama)     |
| Dark surface | `#111a2c`              | **`#141936` + `#1A1F36`** (cohérent)     |
| Accent       | `#5c8aff` (lavande)    | **`#0E73F6`** (bleu Boursorama)          |
| CTA          | aucun                  | **`#00CCBC` teal Deliveroo**             |
| Coloré accent| `#7c3aed` (violet)     | **`#FF4D7C` rose Deliveroo + #FFB200**   |
| Pos          | `#16a34a` (vert std)   | `#16a34a` + gradient `#34D399` en dark   |

**Pourquoi** : la couleur Boursorama est **identitaire** (bleu nuit profond, accent bleu Boursorama franc). La palette coloré utilise les rose/orange Deliveroo plutôt que violet pour vraiment marquer « action ».

### 2.3 CTA Deliveroo-style

| v1                                                   | v2                                                  |
|------------------------------------------------------|-----------------------------------------------------|
| « Relancer › » apparaît au hover, 11.5 px            | Bouton **plein teal #00CCBC**, 13.5-15 px, 11-14 px de padding, ombre douce |
| 1 CTA par carte au max                              | **CTA principal par carte** + secondaire ghost      |
| Pas de hiérarchie CTA                                | 3 tailles `.sm` / défaut / `.lg`                    |
| Survol = opacity                                     | Survol = `translateY(-1px)` + ombre teal            |

**Pourquoi** : Deliveroo = action immédiate qui doit être visible et donner envie de cliquer. Plus de « call-to-action invisible ».

### 2.4 Tenir sur 1 écran

| v1                                              | v2                                              |
|-------------------------------------------------|-------------------------------------------------|
| Niveau 0 (hero+actions+kpi+parc) + niveau 1 sous le pli (flux+charges) | **Tout en niveau 0** dans chaque mockup. Le détail finance est accessible via clic sur la carte cash-flow, pas sous le pli. |
| Hauteur cible « ≈ 920 px utiles »               | Hauteur dur **900 px** (1440×900) avec `overflow:hidden` sur le stage. La règle test : *si la barre de défilement apparaît dans la stage, c'est cassé*. |

**Pourquoi** : « ça ne tient pas sur une page » est sans appel. Le niveau 1 forçait le scroll → on l'enlève complètement.

### 2.5 Zéro jargon dans les libellés UI

| Jargon v1                          | Libellé v2                                          |
|------------------------------------|-----------------------------------------------------|
| `IRL T1 2026 +0.78%`               | « Révision annuelle prévue · +9 €/mois possible »   |
| `MRH manquante`                    | « Assurance habitation à demander »                 |
| `DG détenus 4 520 €`               | (déplacé : devient « Dépôts conservés » dans drill) |
| `EDL sortie 2`                     | (Gestionnaire) « 2 états des lieux à programmer »   |
| `F-101 · F-103 · D-G`              | « Paris 17e · Lyon Part-Dieu · Garage Paris »       |
| `Loyers / prix d'achat parc`       | (Pro) « Cash-on-cash » abandonné, gardé KPI métier  |

**Règle** : si un libellé contient un sigle obscur, le sigle est en code interne (id technique), pas en UI.

---

## 3. Justification design par profil

### Solo — « ai-je été payé ? »

**Question test** : « Je suis Didier, j'ai 3 logements. En ouvrant ImmoTrack en 2 secondes je veux savoir si j'ai été payé en avril et quoi faire cette semaine. »

| Décision               | Détail                                                                                                |
|------------------------|-------------------------------------------------------------------------------------------------------|
| Hero = 1 question      | « Avez-vous bien été payé en avril 2026 ? » → réponse immédiate « **1 900 €** ✓ Oui — 2/3 reçus »      |
| 3 logements visibles   | Carrousel horizontal 3 cards, chaque carte = 1 logement avec son statut Avril (vert/rouge)            |
| Barre de progression   | « 1 900 € reçus sur 2 700 € attendus » + barre gradient vert→teal → langage non-comptable             |
| À faire = 3 max        | 1 colonne verticale 3 items prioritaires + CTA gros « Relancer Paris 17e maintenant » sticky en bas   |
| Agenda 7j en bandeau   | 5 jours visibles, chaque jour = mini carte (alerte rouge si action, vert si encaissement)            |
| Quittances séparées    | Carte dédiée car c'est le geste mensuel #1 pour un bailleur particulier (différenciant cible Solo)    |

### Gestionnaire — « scan portfolio + actions en masse »

**Question test** : « Je suis Marion, j'ai 32 lots en gestion. En ouvrant ImmoTrack je veux scanner mon portefeuille en 5 secondes et déclencher mes actions du jour. »

| Décision                | Détail                                                                                                |
|-------------------------|-------------------------------------------------------------------------------------------------------|
| 5 KPI horizontaux       | Occupation · Recouvrement · Impayés · À faire semaine · Charges récupérables YTD                       |
| Table portefeuille      | 7 colonnes : Lot · Locataire · Loyer · Statut · Avril · Quittance · Actions — 8 lignes visibles       |
| Bulk action en haut     | Bandeau bleu « 7 quittances prêtes à envoyer » + CTA « Envoyer les 7 » → différenciant marché         |
| Pas de hero émotionnel  | Le gestionnaire pro veut une vue **table**, pas un grand chiffre rassurant                            |
| Cash-flow réduit        | Carte 4 col à droite avec sparkline + breakdown, sans gradient text excessif                          |
| File d'attente actions  | 3 lignes verticales (relances, quittances, visites) + CTA « Traiter en masse »                        |

### Pro — « vue exécutive multi-bailleurs »

**Question test** : « Je suis directeur d'agence, 12 bailleurs clients, 148 lots. Je veux voir mes revenus consolidés et mes 5 alertes critiques. »

| Décision                | Détail                                                                                                |
|-------------------------|-------------------------------------------------------------------------------------------------------|
| Hero cash-flow consolidé| Grosse carte gauche `+ 142 380 €` avec gradient text en thème dark/coloré                            |
| 4 KPI exec compactes    | Occupation globale · Impayés · Alertes · Nouveaux mandats — pas de barre rendement perso             |
| Table bailleurs         | 6 colonnes : Bailleur (avatar+nom) · Lots · Cash-flow · Occupation (barre inline) · Alertes · Action  |
| Tri par cash-flow ▾     | Le pro pilote par revenu généré, pas par ordre alphabétique                                          |
| Alertes critiques droite| 5 alertes avec CTA Deliveroo dédié sur chaque (« Traiter », « Relancer », « Appliquer », « Mailer »)  |
| Couleur de bailleur     | Chaque avatar a un dégradé unique → repère visuel rapide                                              |
| Filtre par zone géo     | Select dans la topbar « Île-de-France / Grand-Est / Tous »                                            |

---

## 4. Justification 3 thèmes distincts

### Sobre — vendable B2C Solo (par défaut)

- **Fond gris très clair** (`#f4f6fa`), surfaces blanches, accents noir/anthracite.
- **Pas de couleur identitaire** — c'est un dashboard qui pourrait être chez Google / Notion.
- Le brand-logo passe en `#0d1420` plein (vs gradient).
- Pas de gradient text sur les grands chiffres (color: var(--pos) plein).
- Cible : bailleurs particuliers qui veulent du sérieux, du calme, du sobre.

### Coloré — différenciant marketing (Deliveroo)

- **Fond chaud `#fff8f2`**, palette `#FF4D7C` (rose Deliveroo) + `#FFB200` (jaune) + `#00CCBC` (teal CTA) + `#7B5BFF` (violet info).
- **Cards** avec light gradient en fond (rose → orange → vert).
- Avatars bailleurs : dégradés colorés saturés.
- Big numbers en **gradient text rose → orange**.
- Cible : screenshots marketing, démos commerciales, conférences. Différenciation totale.

### Dark Boursorama — premium chiffre roi

- **Fond bleu nuit `#0A0E27`**, surfaces `#141936/#1A1F36`, accent `#0E73F6` Boursorama.
- Big numbers en **gradient text vert mint (`#34D399 → #5EEAD4`)** pour les chiffres positifs.
- Ombres profondes (0 16px 40px rgba(0,0,0,.55)).
- Cards avec bordure 1 px `rgba(255,255,255,.08)` — finition élégante.
- Cible : investisseurs, gestionnaires de patrimoine, pros qui veulent « ça respire l'expertise financière ».

---

## 5. Tests « 1 écran sans scroll » — résolutions cibles

| Résolution      | Comportement attendu                                          |
|-----------------|---------------------------------------------------------------|
| 1920×1080       | Stage centrée 1440×900 + marges latérales blanches            |
| 1440×900        | Stage prend tout l'écran moins le header sticky               |
| 1280×800        | Stage en zoom out 88% (à valider en V2 implémentation)        |
| Mobile          | **Hors scope** mockup statique — la prod fera le responsive   |

**Mode de test** : ouvrir `v2-refonte-2026-05-15.html`, redimensionner la fenêtre. La stage doit rester **1440×900 fixe** sans scrollbar à l'intérieur. Le doc parent peut scroller (header sticky), mais chaque mockup individuel jamais.

---

## 6. Roadmap d'implémentation dans `index-test.html`

Estimation après validation utilisateur du mockup v2.

### Bloc 1 — Préparation (S, ~0.5 j-h)

- Étendre `DASH_TAB_PRESETS` avec 3 profils `solo` / `gestion` / `pro` (au lieu de 4 actuels).
- Ajouter token `--theme="dark-boursorama"` au CSS prod (3e thème en plus de light/dark actuel).
- Refactor `setDashTab()` pour piloter à la fois profil + thème.

### Bloc 2 — Refonte Solo (M, ~1.5 j-h)

- Nouveau widget `dash-solo-hero` : question + réponse + 3 cards logement (réutilise data `logementsList` existant).
- Refonte `todo-unified` → 3 items max + CTA gros plein.
- Bandeau `agenda-week` 5 jours (réutilise `_buildAgendaData` existant).
- Carte `quittances-mois` dédiée (réutilise data `_getQuittancesForMonth` existante).
- Suppression KPIs financiers complexes (rendement brut, vacance manque-à-gagner) sur ce profil.

### Bloc 3 — Refonte Gestionnaire (L, ~2 j-h)

- Nouveau widget `dash-portfolio-table` (7 colonnes, 8 lignes visibles, tri/filtre client-side).
- Bulk action bar « X quittances prêtes » → bouton qui appelle `_genererQuittancesBatch()` (nouvelle fonction).
- KPI row 5 cartes horizontales (extension des 4 KPI actuels + nouveau « Charges récupérables YTD »).
- Carte `file-attente` 3 items + CTA « Traiter en masse » → ouvre modale liste actions.

### Bloc 4 — Pro (XL, ~3 j-h — nouveau mode entièrement)

- **Pré-requis** : data model `bailleurs` (table multi-bailleurs). Aujourd'hui ImmoTrack = mono-bailleur.
- Nouveau widget `dash-pro-hero` : revenus consolidés + 4 KPI exec.
- Nouveau widget `dash-pro-clients-table` : 6 colonnes bailleurs.
- Nouveau widget `dash-pro-alerts-list` : 5 alertes critiques avec CTA distincts.
- Filtre topbar zone géographique → impacte tous les widgets.

> **Note** : le profil Pro nécessite une refonte data model — peut être différé en V2 commerciale. En V1, le profil Pro = même UI que Gestionnaire mais avec un sélecteur « Voir comme : Bailleur X » qui filtre le data Gestionnaire.

### Bloc 5 — Thème Dark Boursorama (M, ~1 j-h)

- Ajouter palette dans `tokens.css` (`--bg:#0A0E27`, etc.) sur attribut `[data-theme="dark-boursorama"]`.
- Migration de l'actuel mode `[data-theme="dark"]` (qui est plutôt gris-noir) vers Boursorama bleu nuit.
- Gradient text vert mint sur les big numbers cash-flow.

### Bloc 6 — Thème Coloré (S, ~0.5 j-h)

- Ajouter palette coloré (`--bg:#fff8f2`, accents rose/orange/teal) sur `[data-theme="couleur"]`.
- Gradients legers sur les KPI cards.

### Bloc 7 — A11y + responsive (M, ~1 j-h)

- Focus ring visible sur les CTA Deliveroo (`outline:2px solid var(--cta)`).
- Test contraste AA sur les 3 thèmes (chiffres positifs en gradient doivent rester lisibles).
- Breakpoints 1280 / 1024 / 768.

### Total V1 implémentation : ~8 j-h sans le mode Pro multi-bailleurs, ~11 j-h avec.

---

## 7. Différences vs cahier des charges v2 — ce qu'on assume

| Cahier des charges (verbatim)                                | Implémentation v2 mockup                                                  |
|--------------------------------------------------------------|---------------------------------------------------------------------------|
| « Pro = agence/réseau, 50+ lots, multi-portfolios »          | ✓ table 12 bailleurs / 148 lots / filtre zone géo                         |
| « Gestionnaire = pro Hoguet, 10-50 lots »                    | ✓ table 32 lots / bulk actions / file d'attente                            |
| « Solo = bailleur particulier, 1-3 lots, préfère rassurant » | ✓ hero question/réponse, 3 cards logement, langage non-comptable           |
| « Couleurs Boursorama »                                      | ✓ `#0A0E27` + `#0E73F6` dans thème Dark, gradient vert mint sur chiffres   |
| « Action-oriented Deliveroo »                                | ✓ CTA `#00CCBC` plein, gros bouton sticky, 3 tailles                       |
| « 1 écran sans scroll 1920×1080 ET 1440×900 »                | ✓ stage 1440×900 + overflow:hidden, marges latérales en 1920×1080           |
| « 3 thèmes radicalement distincts »                          | ✓ Sobre (gris/blanc/noir) · Coloré (rose Deliveroo) · Dark (bleu nuit)     |
| « Pas de jargon DDT, IRL, MRH, EDL »                         | ✓ libellés clairs « Révision annuelle / Assurance habitation / État des lieux » |
| « Pas de copier Qalimo »                                     | ✓ Qalimo = surchargé multi-onglets — ImmoTrack = 1 page 1 décision         |
| « Données réelles : Didier Keller, F-001 Paris 17e 800€ »    | ✓ injectées dans Solo, et reprises dans Gestionnaire/Pro pour cohérence    |

---

## 8. Questions ouvertes pour l'utilisateur

> Ne bloquent pas l'implémentation, mais à arbitrer avant la mise en prod V1.

### Q1 — Le profil Pro multi-bailleurs : V1 ou V2 commerciale ?
- Coût technique élevé (refonte data model bailleurs). En V1 on peut shipper Solo + Gestionnaire et différer Pro à V2.

### Q2 — Quittance « bloquée » sur impayé : auto ou choix utilisateur ?
- Le mockup montre la quittance F-001 (Paris 17e) en statut « Bloquée » car loyer impayé. Convention métier : on ne génère pas une quittance pour un loyer non encaissé.
- Question : est-ce automatique (règle métier) ou paramétrable ?

### Q3 — Bulk action Gestionnaire « Envoyer les 7 » : workflow détaillé ?
- Le mockup propose un bouton qui envoie les 7 quittances en 1 clic. En prod il faut : pré-visualiser ? confirmer ? envoyer par mail OU télécharger PDF zip ?
- Décision UX à prendre en Phase 2.

### Q4 — Persistance profil + thème : par-utilisateur sync Drive ?
- Hypothèse : oui, dans `DB.params.dashProfile` et `DB.params.theme`, comme `dashTab` actuel.

### Q5 — Multi-entités Solo (SCI A + SCI B)
- Le mockup Solo montre 3 logements **toutes entités confondues**. Si user a 2 SCI, sélecteur en topbar « Toutes / SCI A / SCI B » ?

### Q6 — Mode édition (drag-drop) : on garde ?
- Le mockup ne montre pas le mode édition. Décision V1 commerciale : on coupe l'édition ? On la garde derrière un menu ?

---

## 9. Critères de réussite — auto-check

| Critère du brief                                              | Statut         |
|---------------------------------------------------------------|----------------|
| Note user ≥ 9/10 (vs 6/10 v1)                                 | à valider      |
| 9 mockups visuellement différents                             | ✓ implémenté   |
| 1 écran sans scroll 1440×900 ET 1920×1080                     | ✓ stage fixe   |
| Info clé visible direct, drill-down clair                     | ✓ chaque mockup montre la question + réponse + CTA |
| Couleurs Boursorama identifiables (sobre)                     | ✓ Dark `#0A0E27` + accent `#0E73F6`                |
| Actions Deliveroo identifiables (gros CTA)                    | ✓ teal `#00CCBC`, 3 tailles, hover lift            |
| Profil Gestionnaire présent et différencié                    | ✓ table + bulk actions, vraiment distinct           |
| Aucun jargon DDT / IRL / MRH / EDL / CREP                     | ✓ vérifié dans l'UI mockup                          |

---

## 10. Notes finales

- Le mockup est **statique** : ouvre `v2-refonte-2026-05-15.html` dans Chrome/Edge à **1440×900 minimum**, clique sur les 3 profils × 3 thèmes pour voir les 9 vues.
- Raccourcis clavier : **P** = changer de profil · **T** = changer de thème.
- Police : **Inter** chargée via Google Fonts (poids 400-900).
- Inspirations citées sans WebSearch — basées sur ma connaissance des patterns Boursorama (dashboard compte / portefeuille bourse) et Deliveroo (page commande / restaurant). À valider par captures écran avant implémentation prod si doute.
- Le mockup **ne montre pas la responsive mobile** car le brief mentionne « mobile compatible secondaire » pour Solo et le brief responsive du projet ImmoTrack est traité ailleurs.
- Aucun fichier prod (`index.html` ou `index-test.html`) n'est touché — c'est un livrable de validation uniquement.
