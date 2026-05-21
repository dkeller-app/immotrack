# BANK-IMPORT-XLSX — Supporter les fichiers Excel (.xlsx) dans l'import bancaire

**Status** : ⬜ À faire · **Prio** : P3 · **Taille** : XS (~1h)
**Détecté** : 2026-05-17 (user : « dans loyers on peut faire import banque. il est écrit import CSV ou OFX. fichier excel fonctionne aussi ? »)
**Lié à** : BANK-INTEGRATION V1 ✅ v15.07 · BUG-BANK-IMPORT-DEDUP (à faire) · IMPORT-EXCEL-LOG ✅ (lib SheetJS déjà chargée)

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

## Solution (réutilisation SheetJS)

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
> (Réponse : non en l'état, mais faisable ~1h car SheetJS déjà chargé. Workaround : Excel → Enregistrer sous CSV.)

## Journal

- 2026-05-17 : créé · support .xlsx import bancaire · réutilise SheetJS déjà présent · XS ~1h · coordonner fingerprint avec BUG-BANK-IMPORT-DEDUP
