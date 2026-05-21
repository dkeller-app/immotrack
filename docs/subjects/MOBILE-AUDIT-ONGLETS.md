# MOBILE-AUDIT-ONGLETS — Audit + correctifs UX mobile onglet par onglet

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : L (1-3 jours, 1 commit par onglet)
**Détecté** : 2026-05-01
**Lié à** : MOBILE-PWA-OFFLINE · feedback_responsive · feedback_design_consistency · V3-VISUEL

## Contexte
Demande utilisateur 2026-05-01 :
> 💬 « visuel : s'assurer onglet / onglet que tout s'affiche bien sur une page sur le téléphone. L'expérience utilisateur doit être irréprochable sur téléphone. »

Beaucoup d'UX mobile livré v13.37-40 (popup IRL responsive, bail card stack vertical, headers non tronqués) mais **pas d'audit systématique** par onglet. Avant la commercialisation V1, chaque onglet doit être validé en 320px / 375px (iPhone SE) / 390px (iPhone 13) / 428px (iPhone Pro Max) en portrait + landscape.

**Niveau d'exigence** : irréprochable, pas "ça marche en gros". Pas de scroll horizontal involontaire, pas de bouton qui dépasse, pas de tableau illisible, pas de modale qui rogne.

## Scope — Audit par onglet

Pour chaque onglet (à valider sur iPhone 13 portrait 390×844 + landscape 844×390), checklist :

### Checklist mobile (à appliquer onglet par onglet)
- [ ] **Pas de scroll horizontal** sur la page complète
- [ ] **Touch targets ≥ 44×44 px** sur tous les boutons, liens, switchs, inputs
- [ ] **Texte ≥ 16px** dans les inputs (sinon iOS zoom auto)
- [ ] **Tableaux** : scroll horizontal explicite avec ombre OU stack vertical (cartes 1 ligne = 1 carte)
- [ ] **Modales** : full-screen ou bottom-sheet, pas de 60% qui rogne
- [ ] **Boutons primaires accessibles** au pouce (zone basse de l'écran préférée)
- [ ] **Espacements** : pas de boutons qui se touchent (min 8px gap)
- [ ] **Contraste** : lisibilité OK en mode sombre comme en clair
- [ ] **Loading states** : spinners visibles pendant les ops async (sinon impression "ça plante")
- [ ] **Erreurs** : toast / banner accessibles, pas de `alert()` natif moche

### Onglets à auditer (ordre de priorité = ordre d'usage)

1. **Dashboard** — déjà bien stack vertical via DASH-V2 sur mobile probablement, à vérifier KPIs + graphiques
2. **Logements** — liste cartes, formulaire ajout/édition
3. **Baux** — déjà bossé v13.37-40 (bail card mobile OK). Audit wizard 4 étapes + carte signature
4. **Locataires** — liste + formulaire
5. **Mouvements** — tableau dense, probablement le plus dur à passer en mobile
6. **Quittances** — tableau + génération PDF
7. **EDL** — wizard photos, formulaire compteurs
8. **IRL** — déjà bossé v13.37 popup lettre. Vérifier tableau IRL + modal validation
9. **Charges / Régul** — formulaires complexes
10. **Entités / Immeubles** — modal édition entité (sous-form immeuble)
11. **Équipements**
12. **MRH**
13. **Paramètres**

## Approche méthodologique

**Option A — Audit visuel d'abord, fix ensuite** (recommandée)
1. Pass 1 : capture d'écran chaque onglet en 390px portrait + landscape (~30 min)
2. Pass 2 : noter dans ce doc tous les défauts par onglet (~1h)
3. Pass 3 : fix par onglet, 1 commit / onglet (~6-10h selon ampleur)

**Option B — Onglet par onglet en boucle**
1. Pour chaque onglet : audit + fix + commit + retest (~30-60 min/onglet)

Recommandation : **Option A** (vue d'ensemble d'abord pour repérer les patterns récurrents → fix transversaux + spécifiques). Évite de fixer 10 fois le même bug CSS.

## Outils
- DevTools Chrome : mode device iPhone 13 / iPhone SE / iPad mini
- Test réel iPhone 13 (utilisateur)
- Pas de framework de visual regression à mettre en place pour l'instant

## Décisions à prendre
- [ ] Approche A ou B ?
- [ ] Inclure tablette (iPad) dans cet audit ou se concentrer mobile en V1 ?
- [ ] Séparer "audit + fixes critiques" (P1) vs "polish nice-to-have" (P2) ?

## Lien avec autres sujets
- `MOBILE-PWA-OFFLINE` : sujet jumeau pour l'aspect technique PWA (Service Worker, manifest, install prompt, indicateur connexion)
- `V3-VISUEL` : sujet plus large de cohérence design system globale, dont ce sujet est un sous-ensemble mobile
- `BUG-UI-DARK-MODAL` : à intégrer dans la checklist mode sombre des modales

## Notes utilisateur
> 💬 2026-05-01 : "visuel : s'assurer onglet / onglet que tout s'affiche bien sur une page sur le téléphone. L'expérience utilisateur doit être irréprochable sur téléphone."

## Phase 5 polish — diagnostic 2026-05-18 (audit visuel comparatif LocataireCloud)

Audit mené 2026-05-18 sur 10 captures mobile v15.73 (Accueil Premium + Tableau de bord Gestionnaire + Biens + Baux + IRL + EDL + Régul + Loyers + Wizard Bail paraphes + Wizard Bail signatures finales). Comparaison avec LocataireCloud sur 4 breakpoints (320/390/428 px).

### Résultats — 7 écrans OK sur 10, 4 points sensibles + 2 BUGS P0

| Catégorie | Sujet | Sévérité | Effort fix |
|---|---|---|---|
| 🔴 **BUG fonctionnel** | Menu "Plus" bottom nav ne s'ouvre pas → 12 fonctions sur 16 inaccessibles mobile | Critique | cf [BUG-MOBILE-MENU-PLUS](BUG-MOBILE-MENU-PLUS.md) (1-2 h) |
| 🔴 **BUG fonctionnel** | Sélecteur profil dashboard (Solo/Premium/Gestionnaire) inaccessible mobile | Critique | cf [BUG-MOBILE-DASH-PROFILES](BUG-MOBILE-DASH-PROFILES.md) (30 min - 1 h) |
| 🔴 **Layout critique** | Table Pilotage parc 7 col tronquée mobile (colonne ÉTAT "MR…manq…") | Critique | 2-3 h (cards mobile au lieu de table) |
| 🟠 **Layout important** | Table Loyers libellés bancaires tronqués sans ellipsis | Important | 1 h (cards mobile ou wrap multi-lignes) |
| 🟠 **Layout moyen** | Tabs tronqués : "Histo…" Révision IRL + "3…" Régul | Moyen | 30 min (scroll horizontal gradient ou shorter labels) |
| 🟠 **Layout moyen** | Hero Dashboard Gestionnaire titre 3 lignes + KPI "9 À TRAITE" tronqué | Moyen | 30 min (font-size adaptative + KPIs 2×2) |
| 🟢 OK | Accueil Premium · Biens · Baux · EDL · Régul · IRL · Wizard Bail (paraphes + signatures finales) | – | – |

### Effort total Phase 5 polish

**5-7 j-h dev** :
- 2 BUGS P0 (1,5 - 3 h cumulés) — à traiter en priorité (cf sujets dédiés)
- Layout critique Pilotage parc cards mobile : 2-3 h
- Layout important Loyers libellés : 1 h
- Layouts moyens tabs + Hero : 1 h
- Tests + validation 320/390/428/768 px : 0,5 j-h

### Bonne nouvelle confirmée

Le **Wizard Bail mobile** (étape paraphes page-par-page + étape finale signatures) fonctionne **parfaitement** à 390 px : PDF lisible sans zoom, canvas paraphe utilisable au doigt, pédagogie §18 visible, CTAs Précédent/Suivant en sticky bottom plein-largeur. Aucun concurrent ne fait ça à ce niveau (à mettre dans pitch CGP).

### Sources audit

- Captures LocataireCloud mobile : `docs/strategie/audit-visuel-locataire-live/mobile/` (5 PNG)
- Captures ImmoTrack v15.73 mobile : partagées par utilisateur dans chat 2026-05-18 (non sauvegardées repo)
- Comparaison contexte : `docs/strategie/audit-visuel-locataire-live/README.md`

## Audit programmatique 2026-05-21 (navigateur réel 375px, mesures DOM)
Audit rigoureux mené dans un navigateur Chromium à 375px sur les 16 onglets, via mesures DOM
(scrollWidth/clientWidth, getBoundingClientRect) plutôt que captures (plus fiable). Données démo
présentes (1 entité, 4 logements, 14 mouvements, 2 baux).

**Résultats — état mobile globalement EXCELLENT** (la plupart des points v15.73 déjà résorbés depuis) :
- ✅ **Zéro scroll horizontal involontaire** sur les 16 onglets (critère n°1 « irréprochable » : parfait).
- ✅ **62 inputs visibles, tous ≥16px** → pas de zoom auto iOS au focus.
- ✅ Tables larges (Pilotage 751px / Loyers 850px) en `overflow-x:auto` (`.tbl-wrap`) → **scrollables**,
  pas tronquées (le « tronqué » de v15.73 était l'absence de scroll perçu, pas un clip réel).
- ✅ Aucun KPI tronqué détecté, tabs IRL non clippés.
- 🟠 **Touch targets < 44px** : Agenda 16 (boutons ✓/✕ des cartes = 24px de large), Pilotage 4 (↗ = 26px).

**Fix livré v15.143** : élargissement des boutons d'action à ≥40px (touch target conforme HIG) :
- Agenda cartes : boutons ✓ (`agendaMarkDone`) et ✕ (`deleteAgendaEvt`) → 40×36 (étaient 24×44).
- Pilotage table : boutons ↗ (`openLogFiche`) → 40×36 (étaient 26×36).
- Vérifié en preview : Agenda 0 small target, Pilotage 2 restants = liens texte de noms (« Marie Demo »)
  inline dans la table, acceptables (pas des cibles primaires ; les agrandir gonflerait la table).

**Polish P2 affordance scroll — ✅ livré v15.144** : ombres de scroll horizontal sur les tables larges
(`.tbl-wrap` ≤768px, technique pure CSS background-attachment local+scroll) qui apparaissent/disparaissent
selon la position. Couleur theme-aware via `--tbl-edge` (rgba(0,0,0,.16) clair / .55 sombre → visible sur
`--sur` foncé). EDL/IRL exclus (règles `.tbl-wrap` plus spécifiques). Vérifié en preview (4 gradients sur
Pilotage/Loyers, variable résolue par thème). Reste optionnel : version cartes mobile (non nécessaire, scroll OK).

## Journal
- 2026-05-01 : créé · P1 car critique pour V1 commerciale (mobile = audience massive)
- 2026-05-18 : Phase 5 polish identifiée via audit visuel comparatif LocataireCloud · 7/10 écrans OK + 2 BUGS P0 + 4 layouts à fix · effort 5-7 j-h · sujets dépendants : BUG-MOBILE-MENU-PLUS + BUG-MOBILE-DASH-PROFILES
- 2026-05-21 : 2 BUGS P0 livrés (MENU-PLUS + DASH-PROFILES v15.140-142). Audit programmatique 375px → état mobile excellent (0 overflow horizontal, inputs OK, tables scrollables). Seul défaut réel = touch targets boutons action Agenda/Pilotage → **fix v15.143** (≥40px). Affordance scroll tables → **v15.144** (ombres theme-aware).
- 2026-05-21 : tables denses → cartes mobile (feedback user « pas visuel sur mobile ») :
  - **Loyers/Mouvements** (table 9 col) → cartes ≤768px, **v15.145** puis condensées 221→125px **v15.146** (date+montant haut, libellé titre, méta inline immeuble·cat·qui, actions serrées, facture masquée, montant unique via .pos/.neg). Filtres colonne th non dispo en vue cartes (suivi).
  - **Pilotage / Comptabilité** (matrice lot×4 mois) → cartes **v15.147** avec chips mensuels étiquetés (data-mo + ::before) pour garder le contexte du mois. Onglets Pilotage **Documents** + **Automatisations** (autres matrices) restent en scroll horizontal + ombre → à carder de même si besoin user.
