# Captures session 2026-05-29 — MODALE-LOGEMENT-CONSOLIDATION

> **Pour la nouvelle session Claude Code** : ces 20 captures viennent de la session précédente (2026-05-29) où l'utilisateur a constaté plusieurs bugs sur la modale Logement + le wizard Bail. Elles sont la **preuve visuelle** des points captés dans le sujet doc parent `../MODALE-LOGEMENT-CONSOLIDATION.md` (sections ML-1 à WB-5b + Bugs B-A B-B).
>
> Tu peux ouvrir chaque PNG via Read si tu veux le détail visuel. L'index ci-dessous explique ce que chacune montre (5 confirmées par lecture, 15 inférées par timestamp + verbatim user du chat).
>
> **Bumps de version pendant la session** : la sidebar montre `v15.228` à 14:36-15:08 (fix C4 en cours), `v15.230` après 15:08 (fix CSS racine). À cross-checker pour situer chaque capture dans le cycle.

## 🎯 Les 5 captures clés (identifiées visuellement)

### 1. `Capture d'écran 2026-05-29 154816.png` (71 KB) — **WB-5b CRITIQUE**
**Contexte** : Wizard Bail F3, onglet « Le bien »
**Ce qu'on voit** :
- Bandeau bleu en haut : « Les caractéristiques du bien sont mieux gérées depuis la fiche logement. […] Les champs ci-dessous restent éditables pour rétro-compatibilité jusqu'à la migration finale (Phase 4) »
- Bouton « → Modifier le bien dans sa fiche »
- **Champs pré-remplis** : Adresse « 15 rue des pèlerins » · Surface « 63 » · Étage « 2ème »
- **Champs grisés saumon ET VIDES** : Type de location · Nb pièces principales · Description des pièces · Locaux accessoires à usage privatif · Parties communes (placeholder « Cave, grenier, parking… »)
- Destination des locaux = « Usage exclusif d'habitation principale » (dropdown qui marche)

**Conclusion** : double régression de la décision B2 ARCHI-FICHES-UNIFIED. Le grisage est appliqué AVANT que les champs concernés existent sur log → impossible à remplir où que ce soit → PDF bail incomplet.

**Verbatim user** :
> « bail : bien tout est grisé parce que logiquement dans bien, dans le bail rien n'est repris »

---

### 2. `Capture d'écran 2026-05-29 154751.png` (101 KB) — **Preuve PDF bail incomplet**
**Contexte** : Aperçu/PDF bail signé F3 — Krebs / 15 rue des pèlerins (le bail en question)
**Ce qu'on voit** :
- En-tête : « Bailleur Didier Keller — domicile Strasbourg / Locataire(s) M. Ludovic Krebs / Adresse 15 rue des pèlerins / Prise d'effet 04/06/2026 / Durée 1 an / Loyer HC 770€ + Charges 30€ = 800€/mois / DG 770€ »
- **Tableau « 1 — DÉSIGNATION DU LOGEMENT »** :
  - Surface habitable = 63 m² ✓
  - **Nombre de pièces principales = «–»** ← VIDE
  - **Désignation des pièces = «–»** ← VIDE
  - Locaux et équipements accessoires = « Néant »
  - Parties communes = « Néant »
  - Annexes privatives = « Néant »
  - **Chauffage = «–»** ← VIDE
  - **Numéro fiscal = « À compléter par avenant »**
  - Numéro de lot copropriété = N/A
  - **Type d'habitat = Immeuble collectif**
  - Régime juridique = Monopropriété
  - **Période de construction = « Avant 1949 »**
  - **Équipements cuisine = «–»** ← VIDE
  - **Équipements sanitaires = «–»** ← VIDE
  - Eau chaude sanitaire = «–»
  - Technologies de l'information = «–»

**Conclusion** : ce que produit le PDF aujourd'hui = bail légalement vide sur des champs OBLIGATOIRES (loi 89-462 + décret 2015-587). **Inopposable**.

---

### 3. `Capture d'écran 2026-05-29 141447.png` (198 KB) — **Bug B-A wrong immeuble**
**Contexte** : Modale « Nouveau logement », onglet Identité
**Ce qu'on voit** :
- Référence vide (placeholder F-001)
- Type d'usage = « 🏠 Habitation — bail nu »
- Entité = « Didier Keller »
- **Immeuble sélectionné = « Morschwiller-le-bas »**
- **Encart « 🏛 Hérité de l'immeuble parent »** affiche :
  - **Adresse = « 16 rue saint Nicolas, 90100 DELLE »** ← C'est l'adresse de Delle, PAS de Morschwiller
  - Année = « 1955 » · Période = « De 1949 à 1974 »
  - Régime = « Copropriété »
  - Équipements communs = « Aucun renseigné »
- Plus bas : Type / Surface / Étage / N° appartement vides
- Adresse — override : « Vide = hérite de l'immeuble »
- **Section visible « ⚠ BAIL COURANT (LEGACY) — À MIGRER PHASE 4 »** (preuve : sandbox v15.227 ou avant — la section a été supprimée en v15.228)
- Bandeau dans la section legacy : « Ces champs sont synchronisés avec le bail courant. Pour modifier durablement (loyer, IRL, locataire, dates), passez par l'onglet [Bail] »

**Conclusion** : confirme Bug B-A. Hypothèse code-reviewer agent v15.230 : donnée DB corrompue (l'immeuble nommé « Morschwiller-le-bas » contient l'adresse de Delle dans son schéma). Instrumentation `_logRefreshInherited` ajoutée v15.227 doit être déclenchée pour confirmer (F12 console.debug).

---

### 4. `Capture d'écran 2026-05-29 143626.png` (139 KB) — **Bug A cards verticales (avant fix v15.230)**
**Contexte** : Page « Locataires », sidebar v15.228, onglet « Baux actifs »
**Ce qu'on voit** :
- Header : segments toggle « Toutes / SD SCI DD / SS SCI SM / DK Didier »
- Filtres : « Tous immeubles » dropdown + Rechercher input
- Tabs : « Baux actifs » actif, « Historique » à côté
- Bouton « + Nouveau bail » en haut-droite
- **2 colonnes : « Damelevières (9 locataires) » et « Delle (1 locataire) »**
- Cards format **vertical empilé** (au lieu d'horizontal compact) :
  ```
  DD
  DIAS RODRIGUES Dylan 🔑
  D-001 · T3
  626,24 € CC
  📅 31/12/2031
  Bail début 01/01/2026
  [📝][👁][⋮]
  ```
- Sidebar = `v15.228` (bug A pas encore corrigé, fix CSS racine arrivera v15.230)

**Conclusion** : c'est la régression « cards verticales » que l'agent code-reviewer a fini par diagnostiquer (CSS variant A/L-B ~232 lignes placées DANS le template literal `BAIL_TEMPLATE_DEFAULT` JS string au lieu de css/main.css). Fix v15.230 = déplacement vers css/main.css + cache buster `?v=15.230`.

---

### 5. `Capture d'écran 2026-05-29 145814.png` (133 KB) — **ML-4 : doublon Diagnostics**
**Contexte** : Fiche 360° « Morschwiller-le-bas — RDC gauche », onglet « Diagnostics »
**Ce qu'on voit** :
- Header : « Morschwiller-le-bas — RDC gauche / 15 rue des pèlerins - 68790 MORSCHWILLER LE BAS, RDC »
- Pills : « Didier Keller » · F2 · 40,00 m² · « 🟡 Vacant »
- Pulse 24 mois — disponible dès le 1er bail créé
- KPIs : Aucun bail / Jamais loué / 0% Occupation 24m / Manque à gagner
- Boutons : « → Modifier le bien » + « → Indications pour l'annonce » + « 📢 Générer l'annonce » + « 📦 Archiver »
- Sub-tabs : Général / Bail / Comptabilité / **Conformité** / **Diagnostics** (actif) / Agenda / Documents / Compteurs / États des lieux / Photos
- Section « Diagnostics obligatoires (à charge bailleur) » + alerte « ⚠ Diagnostics incomplets (6 à régulariser) »
- DPE : **« Classe [object Object] »** ← bug d'affichage à fixer
- CREP Plomb / Amiante : « À renseigner »

**Conclusion** : montre ML-4 (« pourquoi 2 endroits pour diagnostic ? supprimer l'onglet »). Ici dans fiche 360° = bien. ML-4 demande de supprimer l'onglet « DPE » + « Risques » de la **modale Logement** (qui duplique cette info). Bonus : bug `[object Object]` sur classe DPE à corriger.

## 📋 Les 15 autres captures (à identifier)

Toutes du 2026-05-29, listées par timestamp. La nouvelle session peut les Read si besoin. Contexte chronologique :
- **avant ~14:36** : session reprenait BAIL-SIGNATURE-DISTANCE v15.226 (helper bail-link-codec)
- **~14:36 à ~15:08** : sandbox v15.228 (fix C4 « BAIL COURANT (LEGACY) » + cassage saveParamLog)
- **après ~15:08** : v15.229 (bouton Indications annonce) puis v15.230 (CSS rapatrié)

| Timestamp | Taille | Hypothèse contenu |
|---|---|---|
| `Capture d'écran 2026-05-29 121557.png` | 13 KB | Petit détail UI (icône ou pill ?) — avant session pilotage |
| `Capture d'écran 2026-05-29 141422.png` | 83 KB | Probablement modale Logement avant ouverture onglet Identité |
| `Capture d'écran 2026-05-29 141437.png` | 129 octets | Très petit, probablement vide ou icône |
| `Capture d'écran 2026-05-29 141545.png` | 99 KB | Suite Bug B-A — peut-être autre onglet modale ou dropdown immeuble |
| `Capture d'écran 2026-05-29 143509.png` | 118 KB | Variante page Locataires ou Biens cards verticales |
| `Capture d'écran 2026-05-29 144021.png` | 88 KB | Suite Bug A cards verticales (avant fix) |
| `Capture d'écran 2026-05-29 145823.png` | 87 KB | Suite ML-4 Diagnostics ou autre sous-onglet fiche 360° |
| `Capture d'écran 2026-05-29 150036.png` | 91 KB | Suite ML-2 Équipements éparpillés (« pourquoi plus tous les équipements ? ») |
| `Capture d'écran 2026-05-29 150834.png` | 113 KB | Suite ML-3 Annexes en doublon ou ML-5 checkboxes annexes |
| `Capture d'écran 2026-05-29 151250.png` | 88 KB | Suite onglets modale Logement (DPE / Risques / Présentation ?) |
| `Capture d'écran 2026-05-29 151710.png` | 79 KB | Suite onglet Présentation LOG-ANNONCE ? |
| `Capture d'écran 2026-05-29 151751.png` | 5 KB | Très petit — détail bouton ou pill |
| `Capture d'écran 2026-05-29 151832.png` | 54 KB | Suite wizard Bail (peut-être onglet Personnes / Conditions / Finaliser) |
| `Capture d'écran 2026-05-29 151857.png` | 25 KB | Petit détail wizard Bail (placeholder ?) |
| `Capture d'écran 2026-05-29 151932.png` | 70 KB | Suite wizard Bail (onglet Finaliser ? DPE/GES re-demandés ?) |
| `Capture d'écran 2026-05-29 154343.png` | 22 KB | Petit détail — probablement encart hérité ou message d'erreur |

## 🔗 Liens vers le contexte

- Sujet doc parent : `../MODALE-LOGEMENT-CONSOLIDATION.md`
- BACKLOG : `../../../BACKLOG.md`
- Règles non-négociables : `~/.claude/projects/C--Users-Did-K-Desktop-Immo/memory/MEMORY.md` (suivre les liens `feedback_*.md`)
- Dernier audit code-reviewer agent : v15.230 (CSS racine fix Bug A)

## 🚨 Ce que ces captures démontrent ensemble

1. **Capture 154816 + 154751** = preuve que le bail PDF est aujourd'hui **inopposable** (champs obligatoires loi 89-462 art. 3 vides). C'est ce que l'user veut dire par « j'arrive même plus à avoir un bail complet ».
2. **Capture 141447** = preuve Bug B-A. Hypothèse donnée DB corrompue à confirmer F12 console.
3. **Capture 143626** = preuve Bug A (cards verticales) qui a été fixé v15.230 mais a coûté 8 commits avant que l'agent code-reviewer trouve la cause racine.
4. **Capture 145814** = preuve ML-4 (Diagnostics en double) + bonus bug `[object Object]` DPE.
5. **Les autres captures** = enrichissent ces 4 points (peut-être avec d'autres onglets ou variantes).
