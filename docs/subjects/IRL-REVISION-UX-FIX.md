# IRL-REVISION-UX-FIX — Refonte UX onglet IRL + logique temporelle + bouton unique

**Status** : ⬜ À faire · **Prio** : P1 V1.1 · **Taille** : M (3-4h)
**Détecté** : 2026-05-14 (feedback user post-livraison IRL-VALIDATION v13.33)
**Lié à** : IRL-VALIDATION (livré v13.33, à remplacer) · BUG-DASH-001 (helper `_loyerHCAtDate` livré v14.83) · V3-REFONTE-IRL (P2 pending, peut être marqué obsolète) · `feedback_design_consistency.md`

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs (universel — IRL annuelle).
2. **Règles respectées** : `feedback_design_consistency.md` (cohérence design system, vision « simple »). Corrige bug logique temporel (legal).
3. **Justifications multiples** :
   - 🧑 Cas user 2026-05-14 : « UX problème pas user friendly tout en ligne un en dessous de l'autre. ça ne ressemble pas au reste de l'app »
   - 🧑 Cas user 2026-05-14 : « si on envoie le courrier c'est qu'on a validé l'augmentation »
   - 🧑 Cas user 2026-05-14 : « envoi en mai pour augmentation en juin → le bail doit changer qu'en juin »
   - ⚖️ Obligation légale : loi 89-462 art. 17-1 (revalorisation effet date anniversaire stricte)
   - 💻 Code existant : helper `_loyerHCAtDate(bail, date)` livré BUG-DASH-001 Sprint 1D v14.83 + `bail.revisions[]` schéma
4. **5 vues 360°** : cycle vie bail (révision annuelle) + axe technique (helper temporel) + axe légal + axe UX (design consistency)

## Contexte

`IRL-VALIDATION` livré v13.33 introduit :
- Enveloppe 3 états (gris/orange/rouge/vert)
- 2 boutons : « Valider envoi » + « 💶 Valider IRL »
- Disposition « tout en ligne, un en dessous de l'autre »

**3 problèmes identifiés par user 2026-05-14** :

### 1. UX pas cohérente avec le reste de l'app
Le reste de l'app utilise des **cartes** (LOG-LISTE-CARDS v14.2), des **fiches 360°** (LOG/IMM/ENT-FICHE-360), des **modales structurées** (modal.js v14.88). L'onglet IRL casse cette cohérence avec un layout texte/boutons en ligne.

### 2. Décision UX bancale : 2 boutons distincts
Aujourd'hui : `Valider envoi` puis `Valider IRL`. Mais **c'est UN seul acte de volonté du bailleur** : si je clique « envoyer le courrier », c'est que j'ai validé l'augmentation. Pas besoin de re-cliquer ensuite.

### 3. Bug logique temporelle (CRITIQUE légal)
Quand l'utilisateur clique « Valider IRL », `bail.hc` est modifié immédiatement. Mais l'augmentation IRL **prend effet à la date anniversaire du bail**, pas à la date du clic.

**Cas concret** :
- Date anniversaire bail = juin 2026
- Envoi courrier (préavis légal) = mai 2026
- Loyer mai 2026 = ancien tarif (800€) — paiement encore à recevoir
- Loyer juin 2026 = nouveau tarif (820€)

Avec le bug actuel : `bail.hc = 820€` dès le clic mai, donc la quittance mai 2026 est générée à 820€ → **erreur légale et fiscale**.

## Scope

### Phase 1 — Refonte UX onglet IRL en cartes (~1.5h)

**Cohérence design system app** (pattern LOG-LISTE-CARDS / PILOTAGE-MATRICIEL).

**Layout** :
- **Header** : titre + filtres (Statut: À valider / En attente application / Appliqué / Non concerné DPE F-G — multi-select)
- **Grid de cartes** (4 cols desktop / 2 tablette / 1 mobile, responsive cf `feedback_responsive.md`)
- Chaque carte = 1 bail concerné par révision IRL cette année

**Anatomie d'une carte IRL** :
```
┌─────────────────────────────────────────────┐
│ 📜 Locataire NOM Prénom        [statut badge]│
│ 🏢 Immeuble / Logement REF                   │
│ ─────────────────────────────────────────────│
│ Date anniversaire : 1er juin 2026            │
│ Loyer actuel : 800,00 € HC                   │
│ Nouveau loyer : 820,00 € HC (+2,50%)         │
│ Indice : T2 2025 (145,79) → T2 2026 (148,40) │
│ ─────────────────────────────────────────────│
│ [✦ Valider et envoyer la lettre IRL]         │
│ [Aperçu lettre] [Détails calcul]             │
└─────────────────────────────────────────────┘
```

**3 statuts de carte avec couleurs** :
- 🟢 **À valider** (orange) : révision calculable, prêt à envoyer
- 🟡 **Envoyée en attente application** (jaune) : envoyée, prend effet dans X jours
- ✅ **Appliquée** (vert clair) : prise en compte dans les loyers actuels
- 🔴 **Gel DPE F/G** (rouge) : interdiction loi Climat (cf IRL-DPE-FG livré v13.31)
- ⚪ **Non concerné** (gris) : pas de révision cette année

**Filtres** :
- Statut (chip selector)
- Entité bailleur
- Recherche locataire / logement

### Phase 2 — Fusion 2 boutons → 1 unique (~30min)

- Supprimer enveloppe 3 états + 2 boutons distincts
- 1 bouton unique : **« ✦ Valider et envoyer la lettre IRL »**
- Clic → modale d'aperçu **structurée** (réutilise composant `modal.js` v14.88) :
  - Section « Calcul » : ancien / nouveau / variation / indice base / indice nouv
  - Section « Lettre PDF » : aperçu inline (iframe ou preview)
  - Section « Application » : date d'application = date anniversaire (auto)
  - Boutons : `Annuler` / `✦ Confirmer l'envoi`
- Au confirmer :
  1. Ajout entrée `bail.revisions[]` (cf Phase 3)
  2. Stamp `_modifiedAt` + commit Drive sync
  3. Audit-trail (livré v14.89) entry « IRL validée envoyée — bail X, ancien 800 → nouveau 820, effet juin 2026 »
  4. Toast confirmation
  5. Refresh carte → passe en statut « 🟡 Envoyée en attente application »

### Phase 3 — Logique temporelle correcte (~1h, CRITIQUE)

**Ne plus jamais modifier `bail.hc` directement**. Tout passe par `bail.revisions[]` :

```js
bail.revisions[] = [
  {
    dateEnvoi: '2026-05-15',          // date du clic "Valider et envoyer"
    dateApplication: '2026-06-01',     // date anniversaire bail (calcul auto helper _dateAnniversaireBail)
    ancienHC: 800,
    nouveauHC: 820,
    irlBase: 'T2 2025',
    irlNouv: 'T2 2026',
    indiceBase: 145.79,
    indiceNouv: 148.40,
    variationPct: 2.50,
    methodeCalcul: 'standard',         // ou 'gel-DPE-F-G' (bloqué amont)
    pdfDriveFileId: '1AbCdEfGhI...'    // lien PDF Drive si uploadé
  }
]
```

Le helper `_loyerHCAtDate(bail, date)` (livré Sprint 1D BUG-DASH-001 v14.83) renvoie automatiquement :
- `_loyerHCAtDate(bail, '2026-05-15')` → **800€** (avant `dateApplication`)
- `_loyerHCAtDate(bail, '2026-06-01')` → **820€** (pile à la date)
- `_loyerHCAtDate(bail, '2026-06-15')` → **820€** (après)

→ Quittances mai utilisent 800€, quittances juin+ utilisent 820€. **Cohérent légalement.**

### Phase 4 — Historique des révisions sur fiche bail (~30min)

Section « 📈 Historique IRL » dans LOG-FICHE-360 sous-onglet Bail (livré v14.13) :
- Tableau chronologique de `bail.revisions[]`
- Colonnes : Date envoi / Date application / Ancien HC / Nouveau HC / Variation / Indice utilisé / Statut
- Statut visuel :
  - ⏳ « En attente » si `today < dateApplication`
  - ✅ « Appliquée » si `today >= dateApplication`
- Permet de voir ce qui est validé mais pas encore actif (cas envoi mai pour juin)

### Phase 5 — Tests Vitest (~30min)

Étendre `__tests__/helpers/dates.test.js` :
- Test scenario « envoi 15 mai 2026 / application 1er juin 2026 / loyer 15 mai = 800, loyer 15 juin = 820 »
- Test « `bail.hc` reste inchangé après validation » (jamais modifié direct)
- Test « `bail.revisions[]` correctement trié chronologiquement »
- Test « gel DPE F/G empêche la création de révision » (IRL-DPE-FG livré couvert)

### Phase 6 — Migration des baux existants (~30min, opt-in)

Si certains baux ont déjà eu `bail.hc` modifié par l'ancien comportement (avant fix) :
- **Pas de migration auto destructive**
- Audit au boot : grep mouvements de loyer avec montant ≠ `_loyerHCAtDate(bail, mvt.date)`
- Toast d'avertissement : « X mouvements potentiellement incohérents IRL — voir Pilotage matriciel pour audit »
- L'utilisateur peut investiguer manuellement via la lentille Échéances + Pilotage matriciel

## Lettre PDF — Note

Le **contenu** de la lettre PDF est OK (validé user 2026-05-14 : « on peut toujours améliorer »). Pas de refonte massive — juste :
- Date d'application affichée explicitement : « **L'augmentation prend effet à compter du 1er juin 2026** »
- Mention loi 89-462 art. 17-1 (déjà présente)
- Logo entité si configuré

→ Polish léger, pas dans le scope principal de ce sujet.

## Décisions arbitrées 2026-05-14

- [x] **Bouton unique** « Valider et envoyer » (user OK)
- [x] **`bail.hc` jamais modifié direct, tout via `bail.revisions[]`** (user OK)
- [x] **Sprint 11 V1.1 « Quittances actives »** pour intégration (user OK)
- [x] **UX cartes** cohérence avec LOG-LISTE-CARDS / PILOTAGE-MATRICIEL (cohérence design system)
- [x] **Lettre PDF** : pas de refonte massive, juste mention date application explicite

## Différenciant marché

| Solution | UX IRL | Logique temporelle correcte |
|---|---|---|
| Rentila | basique liste | ⚠️ à vérifier |
| BailFacile | tableau simple | ⚠️ à vérifier |
| Qalimo V2 | cartes avec automatisation | ✅ probable |
| **ImmoTrack après IRL-REVISION-UX-FIX** | ⭐ cartes cohérentes app + logique temporelle stricte loi 89-462 art. 17-1 |

## Notes utilisateur

> 💬 2026-05-14 : « IRL a revoir. le template est pas user friendly et on a pris une décision pas fou. si on envoi le courrier c'est qu'on a valdié l'augmentation de loyer. Il faut la prendre en compte en date de l'augmentation IRL »
> 💬 2026-05-14 : « attention si j'envoie le courrier en mai (pour augmentation en juin) avant d'avoir reçu le paiement du loyer de mai, il faut que le bail change qu'en juin »
> 💬 2026-05-14 (clarification) : « lettre IRL ok (on peut toujours améliorer !), c'est UX le problème pas user friendly tout en ligne un en dessous de l'autre. ça ne ressemble pas au reste de l'app »

## Journal

- 2026-05-14 : créé · refonte UX cartes + bouton unique + logique temporelle stricte (`bail.revisions[]` source de vérité, `_loyerHCAtDate` consommateur). Inclus Sprint 11 V1.1 « Quittances actives ».
