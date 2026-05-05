# LOG-FICHE-ENTRETIEN-DOCS — Sous-onglets Entretien + Documents fiche logement

**Status** : ✅ **Livré v14.50** · **Prio** : P1 · **Taille** : M (~3h cumulé)
**Sessions** : FICHES-PARITE-360 Sessions 5 (Entretien) + 6 (Documents)
**Détecté** : 2026-05-04
**Lié à** : LOG-FICHE-360 · DRIVE-ARBORESCENCE Phases A/B livrées · GANTT-OCCUPATION

## Contexte

> 💬 « option B. je voudrais qu'on traite les sujets dans un ordre logique. on fini la fiche logement et après on fera immeuble »

La fiche logement 360° avait déjà 3 sous-onglets actifs (Général, Bail, Compta) et 4 stub « À venir ». Cette session active 2 des 4 stubs : **Entretien** et **Documents**.

Les sous-onglets restants (📋 États des lieux, ⚡ Compteurs) restent en stub car ils dépendent de chantiers plus lourds (EDL-TEMPLATE-PER-LOG ~7h, extraction relevés compteurs depuis EDL).

## Session 5 — Sous-onglet Entretien

3 sections empilées dans une seule vue :

### A. Équipements & entretiens obligatoires (`_renderEquipForLog(ref)`)

Réutilise `EQUIP_RULES` (12 règles) qui déclare les équipements à entretenir avec leurs bases légales :
- Chaudières gaz / fioul / bois / poêles → entretien annuel obligatoire
- Ramonages (fioul, bois, granulés, insert, cheminée ouverte) → 1×/an minimum
- Climatisation / PAC → règlement F-Gas si charge ≥ 3 kg
- DAAF, électricité, gaz (déjà en équipements EDL)

Pour chaque règle applicable au bail (`rule.condFn(bail)`) :
- Card avec icône, libellé, base légale en sub-text
- Status badge : `✓ À jour (Xj restants)` / `⏰ Échéance dans Xj` / `⚠ En retard de Xj` / `— Jamais renseigné`
- Bordure de la card colorée selon status (rouge si en retard, orange si soon, neutre si OK)
- Body : dernier entretien, intervalle, prochain entretien, notes optionnelles
- Action « 📝 Saisir entretien » → `openEquipIntervention(ref, rule.key)` (ouvre la modale d'enregistrement existante de l'onglet Équipements)

### B. Assurances (`_renderAssForLog(ref)`)

Liste les assurances liées au logement :
- **MRH locataire** (DB.mrh, type 'MRH locataire' obligatoire)
- **PNO propriétaire** (DB.assurances)

Même format que les équipements : card avec compagnie + n° contrat + statut échéance + prime annuelle.
Filtre `_isAlive` pour exclure les tombstones.

### C. Agenda lié (`_renderAgendaForLog(ref)`)

Liste compacte des événements `DB.agenda` filtrés sur `e.logement === ref` et non terminés :
- Tri chronologique
- Catégorie + couleur (réutilise AGENDA_CATS)
- Badge urgence (En retard / J-X)
- Click → `go('agenda')` (drill-in)
- Limité à 8, lien « voir tout » si plus

## Session 6 — Sous-onglet Documents

6 sections présentant tous les documents liés au logement :

### A. Bail signé
Si `bail.signatures.signedAt` existe :
- Card avec icône 📜, nom locataire, date signature
- Bouton « 👁 Aperçu » → `previewSignedBailRef(ref)` (snapshot signé figé)
- Bouton « 📂 Drive » → ouvre `bail.signatures.driveWebViewLink` (nouvelle tab)

### B. États des lieux (entrée + sortie)
Pour chaque EDL `DB.edl.filter(_edlActive)` lié au logement :
- Card avec icône 🏠 / 🚪 selon type, date, locataire
- Badge signé / non signé
- Bouton « 👁 Ouvrir » → `openEditEDL(id)`
- Bouton « 📂 Drive » si `driveWebViewLink` présent

### C. Lettres IRL envoyées
Lit `log.irlLettreEnvoyee` et `log.irlLettreEnvoyeeDate` (déjà persistés par IRL-VALIDATION v13.33) :
- Card si lettre envoyée avec date envoi + anniversaire concerné
- Bouton « 👁 Voir lettre » → `previewIRLLetter(ref)`

### D. Quittances générées
Liste les 6 dernières quittances `DB.quittances` filtrées sur le ref :
- Card avec mois, montant total HC+CH, locataire, date génération
- Bouton « 👁 Aperçu » → `previewQuit(id)`
- Lien « voir toutes » si plus de 6

### E. Photos logement
Si `log.photos[]` non vide → galerie grid auto-fill `minmax(120px,1fr)` aspect 4/3.
Sinon empty state mentionnant LOG-PHOTOS à venir + sous-dossier `Photos/` Drive.

### F. Lien Drive du logement
Si `log.driveFolders.root` existe (DRIVE-ARBORESCENCE Phase A) :
- Card avec icône 📁, listing des 9 sous-dossiers (EDL/Bail/Documents/Photos/Quittances/IRL/MRH/Travaux/Charges)
- Bouton « 📂 Ouvrir Drive » → `https://drive.google.com/drive/folders/{folderId}`

## Architecture

### Helpers ajoutés (factorisables Phase 2)

| Helper | Description | Ligne |
|---|---|---|
| `_renderEquipForLog(ref)` | Équipements + règles entretien filtrés sur le bail | nouveau |
| `_renderAssForLog(ref)` | Assurances MRH + PNO du logement | nouveau |
| `_renderAgendaForLog(ref)` | Agenda événements liés au logement | nouveau |
| `_renderLogFichePanelEntretien(log, ref)` | Compose les 3 sections | nouveau |
| `_renderLogFichePanelDocuments(log, ref)` | Compose les 6 sections | nouveau |

Tous filtrent les tombstones via `_isAlive` / `_edlActive` (cf BUG-IMM-FICHE-TOMBSTONE).

### Wiring sous-onglets

```js
function setLogFicheTab(t) {
  if(['general','bail','compta','entretien','documents'].indexOf(t) < 0) return;
  _currentLogFicheTab = t;
  rLogFiche();
}
```

Dispatch dans `rLogFiche` :
```js
${
  _currentLogFicheTab === 'bail'      ? _renderLogFichePanelBail(log, bail, ref)
: _currentLogFicheTab === 'compta'    ? _renderLogFichePanelCompta(log, ref)
: _currentLogFicheTab === 'entretien' ? _renderLogFichePanelEntretien(log, ref)
: _currentLogFicheTab === 'documents' ? _renderLogFichePanelDocuments(log, ref)
: _renderLogFichePanelGeneral(log, bail)
}
```

## CSS — Design system cohérent

### Classes réutilisables

| Classe | Usage |
|---|---|
| `.logf-section-head` | Header de section (titre + bouton lien onglet) |
| `.logf-section-title` | Titre de section h3 |
| `.logf-equip-grid` | Grille 2 cols (équipements + assurances), 1 col en tablette |
| `.logf-equip-card` | Card équipement / assurance avec border-color status |
| `.logf-equip-card.logf-equip-late` | Border rouge + gradient subtil |
| `.logf-equip-card.logf-equip-soon` | Border orange + gradient subtil |
| `.logf-equip-card.logf-equip-ok` | Border verte légère |
| `.logf-equip-badge` | Badge statut compact (réutilise `.logf-equip-late/soon/ok/mute`) |
| `.logf-equip-badge.logf-equip-late` | Animation `igp-blink` (récup de GANTT-PREAVIS) |
| `.logf-agenda-row` | Ligne agenda compacte grid 4 cols |
| `.logf-doc-card` | Card document grid `40px 1fr auto` |
| `.logf-doc-empty` | Empty state stylé |
| `.logf-doc-photos` | Galerie photos auto-fill |

### Responsive (3 breakpoints)

- **PC ≥ 1280** : grille équipements 2 cols, agenda 4 cols, doc cards full
- **Tablette ≤ 1024** : équipements 1 col
- **Mobile ≤ 768** : section-head colonne, agenda 1 col, doc cards 2 cols (icône+info au-dessus, actions en dessous), équip card padding réduit
- **Mobile ≤ 600** : équip-head en colonne (icône+title puis badge), photos 2 cols

## Critères d'acceptance

- [x] Sous-onglet Entretien actif (plus "À venir")
- [x] Sous-onglet Documents actif
- [x] Click sur sous-onglet change la vue sans reload
- [x] Entretien : équipements applicables au bail listés avec status échéance
- [x] Entretien : assurances MRH + PNO du logement listées avec échéance
- [x] Entretien : agenda lié filtré + tri chronologique + lien drill-in
- [x] Documents : bail signé avec lien Drive si présent
- [x] Documents : EDLs entrée/sortie avec lien Drive si présent
- [x] Documents : lettres IRL si envoyées
- [x] Documents : 6 dernières quittances avec aperçu
- [x] Documents : galerie photos si présentes
- [x] Documents : lien dossier Drive racine si DRIVE-ARBORESCENCE Phase A activée
- [x] Empty states explicites avec CTA vers l'onglet correspondant
- [x] Toutes les listes filtrent `_isAlive` (pas de tombstones)
- [x] Responsive 3 breakpoints OK
- [x] Dark mode OK (couleurs adaptées via `var(--*)` + overrides `[data-theme="dark"]`)

## Limites connues

- **EDL-TEMPLATE-PER-LOG** non livré : pas de template d'EDL pré-rempli par logement. Reste sur le sujet jumeau dédié (~6h).
- **LOG-PHOTOS** non livré : la section photo affiche `log.photos` mais pas de système d'upload. Reste sur le sujet dédié (intégration Drive Phase D).
- **Compteurs** non livré : pas de relevés de compteurs. Reste sur Session 4 dédiée.
- **EDL upload PDF Drive** : déjà partiellement livré (EDL-PDF-DRIVE v14.10.3) mais lien Drive pas systématiquement persisté sur tous les EDL.

## Journal

- 2026-05-04 : créé · Sessions 5+6 livrées en bundle (~3h)
- 2026-05-04 : helpers `_renderEquipForLog` / `_renderAssForLog` / `_renderAgendaForLog` / `_renderLogFichePanelEntretien` / `_renderLogFichePanelDocuments` · CSS `~150 lignes` design system cohérent · responsive 3 breakpoints · livré v14.50
