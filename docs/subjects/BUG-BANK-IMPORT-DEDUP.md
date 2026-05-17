# BUG-BANK-IMPORT-DEDUP — Déduplication imports bancaires par empreinte stable

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : S (~2h)
**Détecté** : 2026-05-17 (user : « si je ne trie pas les lignes (supprimer les lignes déjà importées), j'ai des doublons »)
**Lié à** : BANK-INTEGRATION V1 ✅ livré v15.07 · `js/core/bank-import.js` · `__tests__/helpers/bank-import.test.js`

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs qui utilisent l'import CSV/OFX bancaire (différenciant ImmoTrack V1)
2. **Règles** : modify+verify + bump version + tests Vitest
3. **Justifications multiples** :
   - 🧑 Cas user 2026-05-17 : « j'ai des doublons » + « on ne peut pas faire un compartif avec date et un autre critère car l'utilisateur peut modifier cela après import »
   - 💻 Code existant : `_bankDedup` (bank-import.js l. 293-322) utilise date±3j + montant±1€ → cassé si user édite après import
   - 📋 BANK-INTEGRATION V1 livré v15.07 = différenciant marché. Le casser à l'usage = perte de confiance utilisateur
   - ⚖️ Pratique standard (YNAB, Banktivity, Linxo) = fingerprinting stable au moment de l'import
4. **5 vues 360°** : UX (fiabilité quotidienne) + technique (dédup robuste) + commercial (différenciant V1 maintenu) + cycle vie (réutilisable V2 SaaS Saltedge)

## Constat

`_bankDedup` actuel utilise 2 critères :
1. `FITID` OFX si présent → OK (match certain peu importe la date)
2. Fallback : date ±3j + montant ±1€ → **CASSÉ** dès que l'user modifie un champ après import

**Conséquence** : si l'user importe un CSV qui contient des lignes déjà importées (cas typique : export incrémental de la banque), il a des doublons. La seule solution actuelle = trier manuellement le CSV avant import = friction inacceptable.

## Solution — Fingerprinting stable au moment de l'import

### Principe (algo standard YNAB/Banktivity/Linxo)

Pour chaque ligne du fichier CSV/OFX, calculer une **empreinte (hash SHA-1) sur les colonnes brutes du fichier source**, AVANT tout parsing/normalisation côté ImmoTrack. Stocker cette empreinte dans le mouvement.

À l'import suivant : skip toute ligne dont l'empreinte est déjà présente dans `DB.mouvements`.

### Architecture data

Nouveau champ par mouvement issu d'un import bancaire :
```js
{
  // champs métier existants (date, libelle, debit, credit, cat, qui...)
  _fingerprint: "a7b3c9d1...",    // SHA-1 du raw CSV/OFX (16 chars suffisent)
  _importSource: "csv" | "ofx" | "qif" | "camt053",
  _importedAt: "2026-05-17T18:35:00.000Z",
  _importBankRef: "CIC-Compte-Pro"  // optionnel : tag banque/compte source
}
```

Tous ces champs sont **techniques** = invisibles dans l'UI standard, **non éditables par l'user**.

### Algo fingerprint

**CSV** :
```js
function _bankFingerprintCSV(rawCsvLine) {
  // Normalise espaces, accents, casse → empreinte stable même si banque change
  // les variations cosmétiques (ex 2 espaces vs 1)
  const normalized = String(rawCsvLine)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/\s+/g, ' ').trim()
    .toLowerCase();
  return _sha1(normalized).slice(0, 16);
}
```

**OFX** :
```js
function _bankFingerprintOFX(stmttrnBody) {
  // 1. Priorité : FITID si présent (identifiant unique fourni par la banque)
  const fitid = (stmttrnBody.match(/<FITID>([^<\r\n]*)/i) || [])[1];
  if (fitid) return 'fitid:' + fitid.trim();
  // 2. Fallback : hash sur DTPOSTED + TRNAMT + NAME + MEMO
  const fields = ['DTPOSTED', 'TRNAMT', 'NAME', 'MEMO']
    .map(t => (stmttrnBody.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i')) || [])[1] || '')
    .join('|').trim();
  return _sha1(fields).slice(0, 16);
}
```

### Refactor `_bankDedup`

```js
export function _bankDedup(newLines, mouvementsExistants, options = {}) {
  // Pré-calcule l'ensemble des empreintes déjà présentes en DB
  const existingFingerprints = new Set();
  for (const m of (mouvementsExistants || [])) {
    if (m && !m._deleted && m._fingerprint) existingFingerprints.add(m._fingerprint);
  }

  const out = [];
  for (const line of (newLines || [])) {
    let isDuplicate = false;
    let duplicateOf = '';
    let duplicateReason = '';

    // 1. Match par fingerprint (nouveau, robuste post-modification)
    if (line._fingerprint && existingFingerprints.has(line._fingerprint)) {
      isDuplicate = true;
      duplicateReason = 'Empreinte CSV/OFX identique déjà importée';
      // Trouver l'ID du mouvement correspondant pour traçabilité
      const m = (mouvementsExistants || []).find(x => x && x._fingerprint === line._fingerprint);
      duplicateOf = m ? String(m.id || '?') : '';
    }

    // 2. Fallback legacy date±3j + montant±1€ (uniquement pour les mouvements
    //    importés AVANT v15.X qui n'ont pas de _fingerprint)
    if (!isDuplicate && options.legacyFallback !== false) {
      // ... (algorithme existant inchangé sur mouvements sans _fingerprint)
    }

    out.push({ ...line, isDuplicate, duplicateOf, duplicateReason });
  }
  return out;
}
```

### UI modale d'import — feedback clair

```
┌─────────────────────────────────────────────┐
│ 📥 Import bancaire — extrait_avril.csv      │
├─────────────────────────────────────────────┤
│ 📊 250 lignes analysées :                   │
│    ✅ 47 nouvelles → seront importées        │
│    ⏭️ 203 déjà importées (skip auto)         │
│                                             │
│ ☐ Forcer re-import des doublons (rare)      │
│                                             │
│ [ Voir détail ] [ Annuler ] [ Importer ]   │
└─────────────────────────────────────────────┘
```

## Migration mouvements existants (v15.07 → v15.X)

Les mouvements importés AVANT ce fix n'ont pas de `_fingerprint`. 2 stratégies :

**A. Migration au boot (recommandée)** :
- Au 1er boot v15.X : scanner `DB.mouvements`, pour chaque mouvement issu d'un import (détectable via `m._importedAt` ou présence de `fitid`) → si on peut reconstruire l'empreinte depuis les champs existants (libellé + montant + date), on la calcule
- Sinon : `_fingerprint = null` → fallback legacy au prochain import (1 fois acceptable)

**B. Migration manuelle via bouton "Recalculer empreintes"** :
- Dans Paramètres → Données → bouton "Recalculer empreintes d'import" qui scanne et recalcule sur la base des champs disponibles

→ **Reco V1** : migration auto au boot (transparente) + bouton manuel en backup.

## Scope — 5 phases

### Phase 1 — Helpers fingerprint (~30min)
- `_bankFingerprintCSV(rawLine)` dans `js/core/bank-import.js`
- `_bankFingerprintOFX(stmttrnBody)` (priorité FITID, fallback hash)
- `_sha1(str)` helper utilitaire (utiliser `crypto.subtle` natif navigateur)
- Tests Vitest unitaires : 5-6 cas (normalisation espaces/accents/casse + collisions évitées)

### Phase 2 — Refactor _bankParseCSV/_bankParseOFX (~15min)
- Ajouter `_fingerprint` à chaque ligne retournée
- Conserver la `rawLine` (string brute du fichier) en interne pour le hash
- Pas de breaking change sur les autres champs

### Phase 3 — Refactor _bankDedup (~20min)
- Logique `_fingerprint` en priorité 1
- Fallback legacy en priorité 2 (uniquement si mouvements sans `_fingerprint`)
- Tests Vitest : 8-10 cas (renommage / modif date / modif montant / OFX FITID / etc.)

### Phase 4 — Migration mouvements existants (~15min)
- Helper `_bankMigrateFingerprints(DB.mouvements)` qui scanne + calcule
- Appelé au boot après chargement DB
- Idempotent (pas de recalcul si déjà présent)

### Phase 5 — UI modale d'import améliorée (~30min)
- Compteur "X nouvelles / Y déjà importées" en haut de la modale
- Toggle "Forcer re-import" (caché par défaut sous un disclosure "Options avancées")
- Couleur visuelle : nouvelles = vert, doublons = gris barré
- Bump version + commit `v15.X fix : import bancaire — dédup par empreinte stable (BUG-BANK-IMPORT-DEDUP)`

## Tests Vitest à ajouter (~10 nouveaux)

`__tests__/helpers/bank-import.test.js` (étendu) :
- `_bankFingerprintCSV` : même empreinte pour casse/espaces/accents différents
- `_bankFingerprintCSV` : empreintes différentes pour 2 lignes distinctes
- `_bankFingerprintOFX` : utilise FITID si présent
- `_bankFingerprintOFX` : fallback hash si pas de FITID
- `_bankDedup` : skip si fingerprint déjà présent
- `_bankDedup` : import alors que mouvement modifié post-import (date/libellé/montant changés) → SKIP correct ✓
- `_bankDedup` : mouvement legacy sans fingerprint → fallback date+montant
- `_bankDedup` : mix legacy + modern dans même DB → match les 2 stratégies
- `_bankMigrateFingerprints` : idempotent (2 appels → pas de doublon)
- `_bankMigrateFingerprints` : ne touche pas les mouvements non importés (saisis manuellement)

## Différenciant marché renforcé

| Solution | Dédup CSV/OFX | Robuste post-modification user |
|---|---|---|
| Rentila | ❌ pas d'import bancaire | n/a |
| BailFacile | ❌ pas d'import bancaire | n/a |
| Qalimo V2 | ⚠️ DSP2 only (pas de CSV) | n/a |
| **ImmoTrack v15.07** | ✅ date+montant | ❌ casse si user édite |
| **ImmoTrack v15.X (ce fix)** | ✅ **empreinte stable** | ✅ **robuste** |

## Notes utilisateur

> 💬 2026-05-17 : « le problème est qu'aujourd'hui si je ne trie pas les lignes (supprimer les lignes déjà importées), j'ai des doublons. comment peut-on permettre à l'utilisateur d'extraire son compte et importer en bloc et que l'app ne prenne en compte que les dernières lignes non encore importées ? »
>
> 💬 2026-05-17 (contrainte critique) : « on ne peut pas faire un compartif avec date et un autre critère car l'utilisateur peut modifier cela après import »

## Journal

- 2026-05-17 : créé · solution fingerprinting stable (algo standard YNAB/Banktivity) · 5 phases ~2h dev · 10 tests Vitest · migration auto mouvements existants
