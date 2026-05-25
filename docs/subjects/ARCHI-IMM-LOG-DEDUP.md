# ARCHI-IMM-LOG-DEDUP — Déduplication des infos communes entre Immeuble et Bien (Logement)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M-L (refonte schéma + UI, ~6-10h) · **CDC requis** (audit champs)
**Détecté** : 2026-05-25 (user : « il y a bcp d'infos redondantes entre immeuble et bien (adresse, année de construction, régime juridique…) »)
**Lié à** : ARCHI-DB-DOUBLONS (log/bail) · NAV-LOGEMENT-BAIL-CLARIF · BUG-CRITIQUES-2026-05-25 (BUG 4) · BAILLEUR-FORM-RICHE

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs — moins de saisie, plus de cohérence
2. **Règles** : pas de patch, refonte propre (cf `feedback_no_compromise`)
3. **Justifications** :
   - 🧑 Cas user 2026-05-25 : « bcp d'infos redondantes entre immeuble et bien »
   - 💻 Code suspect : l'adresse du bien duplique celle de l'immeuble (visible sur fiche « Modifier RDC gauche »)
   - 📋 Backlog : trou architectural connu (cousin d'ARCHI-DB-DOUBLONS sur log/bail)
4. **5 vues 360°** : technique (schéma propre) + UX (saisie unique) + données (intégrité) + cycle de vie (modif propage)

## Constat

Sur la fiche « Modifier : RDC gauche » (screenshot user 2026-05-25), la modale **Identité** demande à l'utilisateur de saisir l'**adresse complète** du bien (« 15 rue des pèlerins - 68790 MORSCHWILLER LE BAS ») — alors que cette adresse est déjà portée par l'immeuble parent « Morschwiller-le-bas ».

User a confirmé que **d'autres champs** sont redondants : **année de construction**, **régime juridique**, probablement d'autres.

## Audit cible (Phase 1)

Lister exhaustivement les champs de `DB.logements[i]` et `DB.entites[i].immeubles[j]` pour classer chacun :

| Niveau | Exemples typiques |
|---|---|
| **Immeuble** (commun) | Adresse, code postal, ville, année de construction, régime juridique (copro / mono), syndic, type d'immeuble, nombre de lots, équipements communs |
| **Bien** (propre) | Référence, type (T1/T2/maison/garage), surface, étage, exposition, nombre de pièces, DPE (propre à chaque lot), photos, équipements internes |
| **À trancher (D1-Dn)** | Adresse compl. (étage/n° appartement = bien, le reste = immeuble) ; année de rénovation (souvent par lot mais parfois immeuble entier) |

## Solution cible

- Les **champs communs vivent côté immeuble** ; le bien y accède par **référence** (`log.imm` → `immeuble`)
- La fiche bien **affiche** ces champs en lecture (héritage visuel) avec lien « modifier depuis l'immeuble »
- Toute modif côté immeuble se propage automatiquement à tous ses biens
- **Override** possible côté bien si exception (rare — ex : un lot rénové dans un immeuble ancien)

## Scope (proposé)

### Phase 1 — Audit champs (~1h, CDC)
- Inventaire exhaustif des champs immeuble + bien
- Classification (commun / propre / à trancher)
- Décisions D1-Dn par champ ambigu → cahier des charges précis
- ⏸️ **STOP USER** pour valider le CDC avant Phase 2

### Phase 2 — Migration schéma (~2h)
- Helper `_logResolveAddress(log)` qui retourne l'adresse résolue (override bien sinon immeuble)
- Idem `_logResolveYear`, `_logResolveRegimeJuridique`, etc.
- Migration silencieuse : si les champs communs sont remplis côté bien ET côté immeuble, l'immeuble gagne, le bien voit son champ effacé (sauf si différent → override conservé)

### Phase 3 — UI modale "Modifier bien" allégée (~2h)
- Retirer les champs communs (adresse, année, régime) de l'onglet Identité bien
- Les afficher en **lecture** dans un encart « 🏛 Hérité de l'immeuble Morschwiller-le-bas » avec lien « Modifier »
- Ne garder en saisie que les champs propres au bien

### Phase 4 — UI modale "Modifier immeuble" enrichie (~1h)
- Recevoir les champs déplacés
- Indicateur « propagé à N biens »

### Phase 5 — Tests Vitest (~1h)
- `_logResolveAddress(log)` : override > immeuble > vide
- Migration : ne perd pas de donnée

### Phase 6 — Bascule prod (~30min)
- Migration auto au boot (silencieuse)
- Pas de breaking change pour les exports/imports (les résolveurs s'appliquent)

## Décisions à arbitrer (CDC Phase 1)

- [ ] **D1** : adresse — bien hérite à 100% ou peut surcharger (rare cas : sous-adresse spéciale) ?
- [ ] **D2** : année construction — toujours immeuble ?
- [ ] **D3** : régime juridique — immeuble (copro/mono)
- [ ] **D4** : DPE — toujours bien (chaque lot a le sien)
- [ ] **D5** : surface du lot vs surface totale immeuble — bien (lot)
- [ ] **D6** : équipements (gardien, ascenseur) — immeuble ; équipements internes (chaudière indiv.) — bien
- [ ] **D7** : champs « legacy » côté bien (Loyer/Charges/Locataire dans modale Identité) — relève d'ARCHI-DB-DOUBLONS et NAV-LOGEMENT-BAIL-CLARIF (à coordonner)

## Coordination

⚠️ À traiter conjointement avec :
- **ARCHI-DB-DOUBLONS** (séparation log/bail) — la modale « Modifier bien » est polluée par les infos legacy bail aussi
- **NAV-LOGEMENT-BAIL-CLARIF** (Bien = « le mur », Locataires = « la personne ») — le cadre conceptuel
- **WIZARD-CREATION-SEQUENTIEL** (flow immeuble → bien → bail) — la création doit refléter la hiérarchie

→ Idéalement **1 chantier "ARCHI fiches"** englobant les 3 refontes (immeuble↔bien↔bail) avec un seul mockup-first cohérent.

## Notes utilisateur

> 💬 2026-05-25 : « il y a bcp d'infos redondantes entre immeuble et bien (adresse, année de construction, régime juridique…) »

## Journal

- 2026-05-25 : créé · déduplication infos communes Immeuble↔Bien · CDC Phase 1 requis pour trancher D1-D7 · à coordonner avec ARCHI-DB-DOUBLONS + NAV-LOGEMENT-BAIL-CLARIF + WIZARD-CREATION-SEQUENTIEL
