# BANK-IMPORT-XLSX — Unifier les 2 imports bancaires (dont support Excel .xlsx)

**Status** : ⬜ À faire · **Prio** : **P1** (régression d'incohérence) · **Taille** : S (~2-3h)
**Détecté** : 2026-05-17 (user : « fichier excel fonctionne aussi ? » puis « j'ai toujours fait l'import en xls. pourquoi ça ne fonctionne plus ? »)
**Lié à** : BANK-INTEGRATION V1 ✅ v15.07 · BUG-BANK-IMPORT-DEDUP (à faire) · IMPORT-EXCEL-LOG ✅ · **V3-REFONTE-IMPORTS-UI (Sprint 19E)** · IMPORT-EXCEL-LOG ✅ (lib SheetJS déjà chargée)

## 🚨 Découverte 2026-05-17 : DEUX moteurs d'import bancaire concurrents

L'app a **2 systèmes d'import bancaire distincts** qui font doublon :

| | Onglet **Import** (`#p-import`) | Bouton "import banque" dans **Loyers** |
|---|---|---|
| Input | `#imp-file` accept=`.csv,.xlsx,.xls` (l. 274) | `#bank-import-file` accept=`.csv,.ofx,.qfx,.txt` (l. 35239) |
| Fonction | `handleImport` → `importXLSXBank` / `parseCSVBank` (`_stagingData`) | `_bankImportFileLoaded` → module `bank-import.js` |
| **Excel** | ✅ supporté | ❌ non supporté |
| OFX | ❌ | ✅ |
| Ancienneté | ancien | nouveau (v15.07) |

**Conséquence user** : il importait son xls via l'onglet **Import** (qui marche), puis a essayé via le **nouveau** bouton dans Loyers (CSV/OFX only) → « ça ne fonctionne plus ». Ce n'est pas une régression du xls (il marche encore dans Import), mais une **incohérence** : 2 moteurs, 2 formats supportés différents, 2 UI.

→ Ce sujet ne se limite plus à « ajouter xlsx » : il faut **unifier les 2 moteurs** en un seul qui supporte CSV + OFX + XLSX, avec une UI unique (coordination V3-REFONTE-IMPORTS-UI Sprint 19E).

## Justification (4 critères pré-vol)

1. **Cible** : bailleurs dont la banque exporte en Excel, ou qui retravaillent leur relevé dans Excel
2. **Règles** : réutilisation maximale (SheetJS déjà présent), pas de nouvelle dépendance
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « fichier excel fonctionne aussi ? » → aujourd'hui NON
   - 💻 Code existant : `XLSX` (SheetJS) déjà chargé (export xlsx + import référentiel l. 35979-35986) → coût quasi nul
   - 📋 Backlog : complète BANK-INTEGRATION V1 (CSV/OFX seulement)
4. **5 vues 360°** : UX (un format de moins à convertir manuellement) + commercial (différenciant import)

## Constat

Aujourd'hui l'import bancaire accepte `.csv, .ofx, .qfx, .txt` (input l. 35239) et parse OFX ou CSV via `FileReader.readAsText`. Un `.xlsx` est un format binaire (ZIP) → illisible en texte → **non supporté**.

Workaround actuel pour l'utilisateur : Excel → « Enregistrer sous → CSV » puis importer le CSV. Fonctionne mais friction.

## Solution cible : UN seul moteur d'import bancaire

Garder le moteur **moderne** (`bank-import.js` : meilleure dédup, OFX, fingerprint) et lui ajouter le support XLSX du moteur ancien :
- Moteur unique : `bank-import.js` (CSV + OFX + **XLSX**)
- Input unique : accept=`.csv,.ofx,.qfx,.txt,.xlsx,.xls`
- Retirer l'ancien `handleImport`/`importXLSXBank`/`parseCSVBank`/`_stagingData` (ou le rediriger vers le moteur moderne)
- UI unique (cf V3-REFONTE-IMPORTS-UI Sprint 19E qui restructure les imports en sous-tabs)

⚠️ **Ne pas perdre** ce que l'ancien faisait de bien : `applyImportRules` (règles de catégorisation auto par l'utilisateur), édition inline `_stagingData`, scission de lignes. À porter sur le moteur moderne si absent.

## Solution (réutilisation SheetJS pour la partie lecture xlsx)

SheetJS (`XLSX`) est **déjà chargé** dans le projet. Pattern existant (import référentiel l. 35983-35986) :
```js
const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:true });
```

### Scope (~1h)

#### Phase 1 — Détection + lecture xlsx (~30min)
- Étendre `accept` de `#bank-import-file` : `.csv,.ofx,.qfx,.txt,.xlsx,.xls`
- Dans `_bankImportFileLoaded` : si extension xlsx/xls → `FileReader.readAsArrayBuffer` (au lieu de `readAsText`)
- `XLSX.read` → `sheet_to_json` (header:1) → reconstruire un objet `{headers, rows}` au même format que `_bankParseCSV`
- Brancher sur le pipeline existant : `_bankAutoDetectColumns(headers)` + `_bankNormalizeCSV(parsed, cols)` (inchangés)

#### Phase 2 — Fingerprint cohérent (~15min)
- ⚠️ Coordination avec **BUG-BANK-IMPORT-DEDUP** : le `_fingerprint` doit être calculé sur la ligne xlsx normalisée (mêmes colonnes que CSV) pour que la dédup fonctionne identiquement quel que soit le format source

#### Phase 3 — Tests Vitest (~15min)
- `_bankXlsxToRows(workbook)` → `{headers, rows}` (mock workbook)
- Multi-feuilles : prend la 1ʳᵉ feuille (ou laisse choisir si plusieurs)
- Cellules dates Excel (sérial) → converties correctement

## Décisions à arbitrer

- [ ] **D1** : si le classeur a plusieurs feuilles, prendre la 1ʳᵉ ou proposer un sélecteur ?
- [ ] **D2** : gérer les dates au format série Excel (nombre) en plus des strings ?

## Notes utilisateur

> 💬 2026-05-17 : « dans loyers on peut faire import banque. il est écrit import CSV ou OFX. fichier excel fonctionne aussi ? »
> 💬 2026-05-17 : « j'ai toujours fait l'import en xls pour le moment. pourquoi ça ne fonctionne plus ? »
> (Réponse : l'import xls marche TOUJOURS dans l'onglet **Import** (`#imp-file`). Le **nouveau** bouton dans Loyers (v15.07) est un 2ᵉ moteur qui ne prend que CSV/OFX. Workaround immédiat : importer depuis l'onglet Import. Fix : unifier les 2 moteurs.)

## Workaround immédiat user

Pour importer un xls **maintenant** : onglet **Import** (pas le bouton "import banque" de Loyers). Le `#imp-file` accepte `.csv,.xlsx,.xls`.

## Journal

- 2026-05-17 : créé · support .xlsx import bancaire · réutilise SheetJS déjà présent
- 2026-05-17 : **re-cadré P1** — découverte de 2 moteurs d'import bancaire concurrents (onglet Import = xlsx OK / bouton Loyers v15.07 = CSV/OFX). Pas une régression du xls (marche encore dans Import) mais une **incohérence à unifier**. Coordonner avec V3-REFONTE-IMPORTS-UI (Sprint 19E). Préserver `applyImportRules` + édition inline `_stagingData` de l'ancien moteur.
