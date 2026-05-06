# LOG-FICHE-CONFORMITE-AGENDA — Sous-onglet Agenda séparé + rename Entretien → Conformité

**Status** : ✅ **Livré v14.55** · **Prio** : P2 (UX) · **Taille** : XS (~30 min)
**Détecté** : 2026-05-06
**Lié à** : LOG-FICHE-360 Phase 2 · FICHES-PARITE-360 Session 5

## Demande utilisateur

> 💬 « je ne comprends pas dans entretien, on a les équipements, les MRH (quel est le lien ?), et agenda lié qui faire ressortir plein de dates qui ne sont pas que liées aux entretiens. Je propose d'ajouter un onglet agenda en plus. pour MRH on peut peut etre laisser la mais il faut changer le nom de "entretien" par qq chose d'autres »

## Diagnostic

Le sous-onglet « 🔧 Entretien » mélangeait 3 logiques :
1. **Équipements & entretiens obligatoires** (chaudière, ramonage, DAAF, F-Gas...) — cohérent
2. **Assurances** (MRH locataire, PNO bailleur) — pas vraiment "entretien", mais reste cohérent au sens "obligations légales / contractuelles"
3. **Agenda lié** — incohérent : l'agenda contient AUSSI fin de bail, IRL, préavis bailleur, etc. — pas que de l'entretien

## Refonte v14.55

### A. Rename « Entretien » → « 🛡 Conformité »

Le mot « Conformité » couvre exactement les 2 sections restantes :
- Équipements obligatoires à entretenir (loi RSD, F-Gas, etc.)
- Assurances obligatoires (MRH art. 7g loi Alur, PNO si copro)

Renommé dans le code :
- State `_currentLogFicheTab` : `'entretien'` → `'conformite'`
- Fonction `_renderLogFichePanelEntretien` → `_renderLogFichePanelConformite`
- `setLogFicheTab` valide list `['general','bail','compta','conformite','agenda','documents']`
- Bouton sous-onglet : « 🔧 Entretien » → « 🛡 Conformité »

### B. NEW sous-onglet « 📅 Agenda »

Sortie complète de l'agenda du panel Conformité vers son propre sous-onglet. Affichage organisé par urgence :

```
📅 Agenda du logement                  [+ Événement] [↗ Onglet Agenda]

⚠ En retard (2)
  ⚠ DAAF — F-101 (Retard 45j)         [✏ Modifier] [✓ Fait]
  ⚠ Ramonage — F-101 (Retard 12j)     ...

🔔 Cette semaine (1)
  🔔 Préavis bailleur F-101 (J-3)     ...

📅 Ce mois (3)
  ...

📋 À venir (8)
  ...

✓ Terminés (12)
  ...
```

#### Bucketing par jours
- **En retard** : `date < today`, tri date DESC (plus récent retard en haut)
- **Cette semaine** : `0 ≤ days ≤ 7`, tri date ASC
- **Ce mois** : `8 ≤ days ≤ 30`
- **À venir** : `days > 30`
- **Terminés** : `e.done === true`, tri DESC

#### Card événement riche
Chaque card affiche :
- Icône catégorie (📈 IRL, 📋 BAIL, ⚠️ BAIL_PREVIS, 🔥 CHAUDIERE, etc.)
- Couleur bord gauche selon catégorie (cohérent avec onglet Agenda principal)
- Titre + badge urgence (Retard / Aujourd'hui / J-X / mute)
- Méta : catégorie + date + récurrence + flag Auto si auto-généré
- Notes tronquées 200 chars
- Boutons : ✏ Modifier (ouvre modale agenda), ✓ Fait (cocher comme terminé)

#### CTA « + Événement »
Bouton dans le header du panel : `openNewAgendaEvtForLog(ref)` :
- Ouvre la modale agenda en mode création
- Pré-remplit le select logement avec `ref` après ouverture (timeout 50ms)

#### Empty state
Si aucun événement lié au logement :
```
Aucun événement lié à ce logement.
Les événements automatiques (révision IRL, fin de bail, préavis bailleur,
entretiens) apparaîtront ici dès qu'un bail est créé.
[+ Créer le premier événement]
```

### C. Panel Conformité allégé

Avant : 3 sections (Équipements + Assurances + Agenda).
Après : 2 sections (Équipements + Assurances obligatoires).

Le titre de la section assurances passe de « 🛡 Assurances » → « 🛡 Assurances obligatoires » pour insister sur le caractère légal/contractuel.

## Architecture

```
Fiche logement 360° v14.55 — 7 sous-onglets
├── 📋 Général
├── 📜 Bail
├── 💰 Comptabilité
├── 🛡 Conformité       ← rename de "Entretien", retire Agenda
│   ├── 🔧 Équipements & entretiens obligatoires
│   └── 🛡 Assurances obligatoires
├── 📅 Agenda           ← NEW (extrait de Conformité)
│   ├── ⚠ En retard
│   ├── 🔔 Cette semaine
│   ├── 📅 Ce mois
│   ├── 📋 À venir
│   └── ✓ Terminés
├── 📁 Documents
├── 📋 États des lieux  (À venir)
└── ⚡ Compteurs        (À venir)
```

## Critères d'acceptance

- [x] Sous-onglet « 🛡 Conformité » avec uniquement Équipements + Assurances
- [x] Sous-onglet « 📅 Agenda » dédié, bucketing par urgence
- [x] CTA « + Événement » sur le panel Agenda → ouvre modale agenda pré-remplie sur le logement
- [x] Cards agenda riches : icône cat, couleur, badge urgence, méta, notes, boutons modif/fait
- [x] Bouton « ✓ Fait » coche l'événement et rafraîchit la fiche
- [x] Empty state si aucun événement
- [x] State `_currentLogFicheTab` accepte `'conformite'` et `'agenda'` (nouveaux), plus `'entretien'` (legacy retiré)
- [x] Helper `openNewAgendaEvtForLog(ref)` pré-remplit le select logement

## Limites connues

- L'helper compact `_renderAgendaForLog(ref)` reste défini mais n'est plus appelé depuis le panel Conformité (peut être supprimé en cleanup futur si non utilisé ailleurs).
- Le bouton « ✓ Fait » appelle `agendaMarkDone` puis `setTimeout(rLogFiche, 50)` — une approche plus propre serait un événement custom mais c'est suffisant pour le besoin.

## Journal

- 2026-05-06 : créé · sous-onglet Agenda extrait du panel Conformité (ex-Entretien) · rename Entretien → Conformité (cohérence avec les 2 sections restantes : équipements + assurances obligatoires) · helper `_renderLogFichePanelAgenda` (bucketing par urgence) · helper `openNewAgendaEvtForLog(ref)` pour le CTA · livré v14.55
