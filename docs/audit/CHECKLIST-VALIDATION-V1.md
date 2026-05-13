# Checklist détaillée de validation V1 commerciale ImmoTrack

**Sandbox testée** : `index-test.html` v14.98
**Tag rollback** : `pre-modular-sprint2`
**Préparation** :
```bash
cd C:/Users/Did_K/Desktop/Immo
npx --yes http-server . -p 8766 -c-1 --silent &
# Ouvrir Chrome → http://localhost:8766/index-test.html
# F12 → DevTools onglet Console
```

Chaque bloc indique : **action** → **résultat attendu précis** → **où vérifier** → **comportement KO**.

---

## 🧪 PARTIE 1 — Vérifications automatiques (15 min)

### 1.1 Tests Vitest

| # | Action | Résultat attendu | Vérification |
|---|---|---|---|
| 1.1.1 | Terminal : `npm run test:run` | `Test Files 17 passed (17)` et `Tests 321 passed (321)` | Compter dans la sortie console |
| 1.1.2 | Aucun message rouge ✗ | Tous les fichiers en vert ✓ | Si ✗ → noter le test, ligne, message |
| 1.1.3 | Durée < 5s | `Duration` affiché en bas (typique ~1-2s) | OK si < 5000 ms |
| 1.1.4 | `npm test` (watch mode) | Lance Vitest et attend modifications | `Ctrl+C` pour quitter |

**KO si** : un test rouge, durée > 30s, erreur de chargement de module.

### 1.2 Vérification HTTP des modules ES

Dans un terminal séparé :
```bash
for f in css/main.css js/main.js js/core/utils.js js/core/idb.js \
         js/core/audit-trail.js js/core/legal-2044.js js/core/legal-bilan.js \
         js/core/rgpd.js js/core/export-comptable.js js/core/import-concurrents.js \
         js/core/monitoring.js js/core/email-compose.js \
         js/components/toast.js js/components/modal.js js/components/email-modal.js; do
  curl -s -o /dev/null -w "%{http_code} %{size_download} $f\n" "http://localhost:8766/$f"
done
```

| # | Fichier | Code HTTP attendu | Taille approx attendue |
|---|---|---|---|
| 1.2.1 | `css/main.css` | 200 | ~164 KB |
| 1.2.2 | `js/main.js` | 200 | ~7-8 KB |
| 1.2.3 | `js/core/utils.js` | 200 | ~10 KB |
| 1.2.4 | `js/core/idb.js` | 200 | ~2.3 KB |
| 1.2.5 | `js/core/audit-trail.js` | 200 | ~5.8 KB |
| 1.2.6 | `js/core/legal-2044.js` | 200 | ~10.8 KB |
| 1.2.7 | `js/core/legal-bilan.js` | 200 | ~9.2 KB |
| 1.2.8 | `js/core/rgpd.js` | 200 | ~9.1 KB |
| 1.2.9 | `js/core/export-comptable.js` | 200 | ~9.2 KB |
| 1.2.10 | `js/core/import-concurrents.js` | 200 | ~10.4 KB |
| 1.2.11 | `js/core/monitoring.js` | 200 | ~4.9 KB |
| 1.2.12 | `js/core/email-compose.js` | 200 | ~19.7 KB |
| 1.2.13 | `js/components/toast.js` | 200 | ~1.3 KB |
| 1.2.14 | `js/components/modal.js` | 200 | ~1.1 KB |
| 1.2.15 | `js/components/email-modal.js` | 200 | ~13 KB |

**KO si** : un 404 (fichier manquant), un 5xx (erreur serveur), taille = 0.

### 1.3 Console DevTools après chargement

Ouvrir Chrome → http://localhost:8766/index-test.html, attendre 2s, F12 :

| # | Action console | Résultat attendu | KO si |
|---|---|---|---|
| 1.3.1 | Tab Console : zéro erreur rouge | Aucun message rouge | Erreur JS bloquante → fix avant suite |
| 1.3.2 | Tap Console : message vert `[main.js] Sprint 3D chargé - 38 helpers...` | Présence du log | Si absent → module ES n'a pas chargé |
| 1.3.3 | Tap Network : `main.js` charge avec status 200 (type=module) | Affiché en vert | Si en rouge → vérifier CSP/CORS |
| 1.3.4 | Taper : `window.__IMMOTRACK_MODULE_BOOTSTRAP__` | Objet `{phase, version, loadedAt, helpersExposed: [...]}` | Si `undefined` → main.js n'a pas exécuté |
| 1.3.5 | Taper : `window.__IMMOTRACK_MODULE_BOOTSTRAP__.helpersExposed.length` | Nombre ≥ 38 | Si < 38 → vérifier imports |
| 1.3.6 | Taper : `typeof window.escHtml === 'function'` | `true` | Si false → bug import core/utils |
| 1.3.7 | Taper : `typeof window._compute2044 === 'function'` | `true` | Si false → bug import legal-2044 |
| 1.3.8 | Taper : `typeof window._auditEntry === 'function'` | `true` | Si false → bug import audit-trail |

---

## 🔒 PARTIE 2 — Sécurité XSS (20 min)

### 2.1 Vérifier helpers d'échappement

| # | Action console | Résultat attendu exact |
|---|---|---|
| 2.1.1 | `escHtml('<x>')` | `"&lt;x&gt;"` |
| 2.1.2 | `escHtml('"')` | `"&quot;"` |
| 2.1.3 | `escHtml("'")` | `"&#39;"` |
| 2.1.4 | `escHtml('&')` | `"&amp;"` |
| 2.1.5 | `escHtml(null)` | `""` (string vide) |
| 2.1.6 | `escHtml(undefined)` | `""` |
| 2.1.7 | `_h\`<b>${'<script>'}</b>\`` | `"<b>&lt;script&gt;</b>"` |
| 2.1.8 | `_h\`<b>${_raw('<strong>OK</strong>')}</b>\`` | `"<b><strong>OK</strong></b>"` |

**KO si** : une valeur différente → escHtml cassé, rapport immédiat.

### 2.2 Test XSS via création entité avec payload malicieux

| # | Étape | Résultat attendu |
|---|---|---|
| 2.2.1 | Aller dans Paramètres → Bailleurs → Ajouter une entité | Modale `#ov-ent` s'ouvre |
| 2.2.2 | Nom = `<img src=x onerror="window.__xss=1">` | Champ accepte le texte |
| 2.2.3 | Type = `Particulier`, remplir minimum, Enregistrer | Toast "Entité enregistrée" |
| 2.2.4 | Console : `window.__xss` | `undefined` (PAS `1`) |
| 2.2.5 | Aller au Dashboard | KPIs s'affichent normalement |
| 2.2.6 | Vérifier dans le DOM : `document.querySelector('.bch-bailleur').textContent` | Affiche le texte ÉCHAPPÉ (`&lt;img...`) ou rien |
| 2.2.7 | Console : `document.body.innerHTML.includes('<img src=x onerror')` | `false` (pas injecté brut) |

**KO si** : `window.__xss === 1` ou alert/popup déclenchée → XSS active, **bloquant V1**.

### 2.3 Test XSS via catégorie mouvement

| # | Étape | Attendu |
|---|---|---|
| 2.3.1 | Paramètres → Catégories → Ajouter catégorie | Modale ouverte |
| 2.3.2 | Nom = `<script>window.__xss2=1</script>` | Accepté ou refusé selon validation |
| 2.3.3 | Si accepté → créer un mouvement avec cette catégorie | OK |
| 2.3.4 | Ouvrir Dashboard, drill entité, voir les catégories | Liste rend texte échappé |
| 2.3.5 | Console : `window.__xss2` | `undefined` |

### 2.4 Test XSS via locataire (PII)

| # | Étape | Attendu |
|---|---|---|
| 2.4.1 | Créer logement F-XSS-TEST + bail avec locataire `<img src=x onerror=alert(1)>` | Création OK |
| 2.4.2 | Ouvrir Dashboard | Pas d'alert |
| 2.4.3 | Ouvrir onglet Quittances | Pas d'alert |
| 2.4.4 | Ouvrir onglet Mouvements + créer un mvt sur F-XSS-TEST | Pas d'alert |

### 2.5 Validation à la saisie (Sprint 1B)

| # | Étape | Attendu |
|---|---|---|
| 2.5.1 | Créer logement avec ref `<script>` | Toast erreur "Référence invalide", logement non créé |
| 2.5.2 | Ref `F-001!@#$` | Rejet (caractères dangereux) |
| 2.5.3 | Ref `F-001 bis` (espace + lettres + chiffres) | Accepté |
| 2.5.4 | Ref `Studio-RDC_apt2/lot5` | Accepté (alphanum + . - _ /) |
| 2.5.5 | Ref de 100 caractères | Rejet (max 60) |
| 2.5.6 | HC = 99999 | Confirm dialog "Loyer HC paraît excessif (> 50 000 €)" |
| 2.5.7 | HC = 800 + CH = 1000 | Confirm dialog "Charges supérieures au loyer principal" |
| 2.5.8 | HC = 800 + CH = 50 | Aucune alerte, save normal |

---

## 🏗️ PARTIE 3 — Architecture modulaire (10 min)

### 3.1 Fichiers présents sur disque

```bash
ls -la css/main.css js/main.js js/core/ js/components/ 2>&1
```

Attendu :
- `css/main.css` : ~164 KB
- `js/main.js` : ~7-8 KB
- `js/core/` : 10 fichiers (utils, idb, audit-trail, legal-2044, legal-bilan, rgpd, export-comptable, import-concurrents, monitoring, email-compose)
- `js/components/` : 3 fichiers (toast, modal, email-modal)

### 3.2 Tag git rollback

```bash
git tag | grep pre-modular-sprint2
# Doit afficher : pre-modular-sprint2
```

**KO si** : tag absent → rollback impossible en cas d'incident.

### 3.3 Pattern shadow (inline + module idempotent)

| # | Action console | Attendu |
|---|---|---|
| 3.3.1 | `window.escHtml === escHtml` | `true` (même référence) |
| 3.3.2 | `window.openM === openM` | `true` |
| 3.3.3 | Cliquer un onclick legacy (ex bouton "Ajouter mvt") | Modale s'ouvre normalement |
| 3.3.4 | Réseau (Network tab) : aucun 404 sur `js/*` | Tout en 200 |

### 3.4 Compatibilité backward

Naviguer dans l'app comme avant marathon :
| # | Action | Attendu |
|---|---|---|
| 3.4.1 | Sidebar : Dashboard | KPIs rendus, pas d'écran blanc |
| 3.4.2 | Sidebar : Biens | Cards bailleurs/logements rendues |
| 3.4.3 | Sidebar : Baux | Cards baux rendues |
| 3.4.4 | Sidebar : Mouvements | Tableau rendu |
| 3.4.5 | Sidebar : Quittances | Tableau rendu |
| 3.4.6 | Sidebar : IRL | Tableau IRL rendu |
| 3.4.7 | Sidebar : Régul | Cards régul rendues |
| 3.4.8 | Sidebar : EDL | Liste EDL rendue |
| 3.4.9 | Sidebar : Paramètres | Sections rendues |
| 3.4.10 | Sidebar : Export | **Nouvelles cartes visibles** : RGPD, Aide 2044, Bilan annuel, FEC |

---

## 📋 PARTIE 4 — Conformité légale (45 min)

### 4.1 AUDIT-TRAIL (Sprint 3A + audit complet v14.98)

| # | Action | Attendu |
|---|---|---|
| 4.1.1 | Paramètres → saisir nom utilisateur "Didier" → Enregistrer | Toast OK |
| 4.1.2 | Console : `DB.params.userName` | `"Didier"` |
| 4.1.3 | Console : `DB.params.userId` | String type `usr_XXXXXX` (généré auto) |
| 4.1.4 | Créer un mouvement | Toast "Mouvement enregistré" |
| 4.1.5 | Console : `DB.auditTrail.slice(-1)[0]` | Objet avec `ts`, `userId: 'usr_*'`, `userName: 'Didier'`, `action: 'create'`, `entityType: 'mouvement'`, `entityRef: '...'` |
| 4.1.6 | Modifier ce mouvement (changer le libellé) | Toast OK |
| 4.1.7 | Console : `DB.auditTrail.slice(-1)[0]` | `action: 'update'` + `diff: { lib: { from: 'X', to: 'Y' } }` |
| 4.1.8 | Supprimer un bail | Toast OK |
| 4.1.9 | Console : `DB.auditTrail.filter(e => e.action === 'delete').slice(-1)[0]` | `entityType: 'bail'` + ref |

**Audit complétude (v14.98)** : créer 1 entité, 1 immeuble, 1 logement, 1 bail, 1 quittance, 1 assurance, 1 MRH, 1 EDL → vérifier que chaque action crée une entrée dans `DB.auditTrail` :
```js
console.table(DB.auditTrail.filter(e => e.ts > '2026-05-12').map(e => ({
  ts: e.ts.slice(11, 19), action: e.action, type: e.entityType, ref: e.entityRef
})));
```
Attendu : 8 entrées minimum, types couverts = entite, immeuble, logement, bail, quittance, assurance, mrh, edl, mouvement.

### 4.2 LEGAL-2044 (Sprint 3B)

| # | Action | Attendu |
|---|---|---|
| 4.2.1 | Onglet Export → trouver carte "📋 Aide déclaration 2044" | Carte visible |
| 4.2.2 | Sélecteur "Année" affiche 4 options (cy-3..cy) | OK |
| 4.2.3 | Sélecteur "Entité" affiche les entités vivantes + "Toutes" | OK |
| 4.2.4 | Bouton "📊 Calculer + voir le récap" | Récap apparaît dans `<pre>` |
| 4.2.5 | Récap inclut "DÉCLARATION 2044", "Ligne 211 (Loyers encaissés)", "Total recettes", "RÉSULTAT FONCIER" | Présent |
| 4.2.6 | Si résultat foncier < 0 | Phrase "⚠ Résultat foncier négatif — déficit foncier possible" |
| 4.2.7 | Si catégorie custom existe non mappée | Phrase "⚠ N mouvement(s) avec catégorie non mappée" |
| 4.2.8 | Bouton "📥 Télécharger CSV pour comptable" | Fichier `.csv` téléchargé (vérifier dans `~/Downloads`) |
| 4.2.9 | Ouvrir le CSV dans Excel/LibreOffice | 8 colonnes : ligne_2044, description, nb_mouvements, montant_eur, etc. + lignes TOTAL_RECETTES, TOTAL_CHARGES, RESULTAT_FONCIER |

**Audit consultation** : `DB.auditTrail.filter(e => e.entityType === 'declaration_2044')` → entrée présente.

### 4.3 LEGAL-BILAN-ANNUEL (Sprint 3C)

| # | Action | Attendu |
|---|---|---|
| 4.3.1 | Onglet Export → carte "📊 Bilan annuel par entité" | Visible |
| 4.3.2 | Sélecteur Entité (obligatoire) + Année | OK |
| 4.3.3 | Bouton "📊 Générer le bilan" | Texte récap apparaît |
| 4.3.4 | Récap inclut : "BILAN ANNUEL", nom entité, "Revenus totaux", "Cash-flow opérationnel", "DÉTAIL PAR LOGEMENT" | Présent |
| 4.3.5 | Détail par logement : ligne par bien avec ref, type, locataire, occ%, revenus, charges, cash-flow | Aligné en colonnes |
| 4.3.6 | KPI "Manque à gagner cumulé" affiché | OK |

### 4.4 RGPD-COMPLIANCE (Sprint 3D)

| # | Action | Attendu |
|---|---|---|
| 4.4.1 | Onglet Export → carte "🔒 RGPD" | Visible avec liens vers docs/legal/* |
| 4.4.2 | Vérifier fichier `docs/legal/RGPD-REGISTRE.md` existe | Affiché dans dossier |
| 4.4.3 | Vérifier fichier `docs/legal/DPA-GOOGLE-DRIVE.md` existe | OK |
| 4.4.4 | Sélecteur logement, bouton "👁 Voir données collectées" | Rapport texte multilignes |
| 4.4.5 | Rapport inclut : "Art. 15", "Logement: OUI", nb mouvements, nb quittances, "TOTAL ENREGISTREMENTS" | Présent |
| 4.4.6 | Bouton "📦 Export portabilité (art. 20)" | Fichier `RGPD_export_<ref>_<date>.json` téléchargé |
| 4.4.7 | Ouvrir le JSON | `_meta.rgpdArticle === 'Art. 20 RGPD'` + `data.totalRecords > 0` |
| 4.4.8 | Bouton "🗑 Plan d'effacement (art. 17)" sur un bail récent (< 3 ans) | "❌ NON" + raison "prescription civile 3 ans non écoulée (~N mois)" |
| 4.4.9 | Plan affiche : "Total opérations prévues", "EXÉCUTION non implémentée en V1" | Présent (warning pour V1.1) |

### 4.5 EXPORT-COMPTABLE FEC (Sprint 3E)

| # | Action | Attendu |
|---|---|---|
| 4.5.1 | Onglet Export → carte "💼 Export comptable" | Visible |
| 4.5.2 | Bouton "📄 Export FEC" (avec année + entité sélectionnée) | Fichier `FEC_<année>.txt` téléchargé |
| 4.5.3 | Ouvrir le `.txt` dans un éditeur | 1ère ligne = header avec 18 colonnes séparées par TAB |
| 4.5.4 | Vérifier colonnes : JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum, CompteLib, CompAuxNum, CompAuxLib, PieceRef, PieceDate, EcritureLib, Debit, Credit, EcritureLet, DateLet, ValidDate, Montantdevise, Idevise | 18 colonnes exactement |
| 4.5.5 | Lignes data : dates format `YYYYMMDD` (ex `20250115`) | Pas de `2025-01-15` ni `15/01/2025` |
| 4.5.6 | Montants : virgule décimale FR (ex `800,00`) | PAS `800.00` |
| 4.5.7 | EcritureNum format `GL000001` | Préfixe GL + 6 chiffres pad |
| 4.5.8 | Bouton "📒 Journal général (.csv)" | Fichier `.csv` téléchargé |
| 4.5.9 | Vérifier équilibre débit=crédit dans le journal | Pour chaque numéro d'écriture, somme(débit) = somme(crédit) |
| 4.5.10 | Bouton "📚 Grand livre (.csv)" | Fichier `.csv` avec solde progressif + lignes "TOTAL" par compte |

**Test FEC réel** : envoyer le FEC à un expert-comptable et demander : "valide selon arrêté 29 juillet 2013 BOI-CF-IOR-60-40-20 ?"

### 4.6 IMPORT-CONCURRENTS (Sprint 3G)

| # | Action console | Attendu |
|---|---|---|
| 4.6.1 | `window._mapRentila({biens:[{id:1, reference:'TEST'}]})` | Objet `{out, errors: [], summary: {logements: 1, baux: 0, mouvements: 0}}` |
| 4.6.2 | `window._mapBailFacile({Logements:[{Ref:'X', Type:'T2', Surface:50}]})` | `summary.logements === 1` |
| 4.6.3 | `window._mergeImport(DB, {logements:[{ref:'F-IMPORT-001'}]})` | `{added: {logements: 1, baux: 0, mouvements: 0}, skipped: ...}` |
| 4.6.4 | Re-exécuter même mergeImport | `skipped.logements === 1` (déduplication) |

**UI à venir** : pas de bouton UI pour cette session. Test seulement via console.

### 4.7 MOBILE responsive (Sprint 3H)

Ouvrir DevTools → Ctrl+Shift+M (mode device) :

| # | Largeur device | Attendu |
|---|---|---|
| 4.7.1 | 320 px (iPhone SE) | Sidebar fermée par défaut + bouton burger menu, contenu lisible sans scroll horizontal |
| 4.7.2 | 390 px (iPhone 14 Pro) | Modales 100dvh (pas de scroll interne), boutons ≥ 44 px |
| 4.7.3 | 428 px (iPhone Pro Max) | Forms en 1 colonne, labels au-dessus inputs |
| 4.7.4 | 768 px (iPad) | Sidebar visible, layout 2 cols |
| 4.7.5 | 1280 px (desktop) | Layout 3-4 cols selon page |
| 4.7.6 | Cliquer un bouton "btn bs" (small) | Zone tactile confortable (padding +10px) |
| 4.7.7 | Ouvrir une modale | `m-foot` reste sticky en bas avec safe-area iPhone |
| 4.7.8 | Input texte (ex Nom logement) | font-size 16px (aucun zoom auto iOS) |
| 4.7.9 | Tableau large (ex mouvements) | Scroll horizontal `tbl-wrap` |
| 4.7.10 | Toast | Largeur quasi pleine (left/right 12px) au lieu de fixe |

---

## 🐛 PARTIE 5 — Bugs P1 fixés (15 min)

### 5.1 BUG-CHARGE-001 (Sprint 1C)

| # | Action | Attendu |
|---|---|---|
| 5.1.1 | Créer un mouvement avec catégorie standard `Loyers encaissés` cr=800 qui=F-001 | OK |
| 5.1.2 | Ouvrir onglet Régul (Charges) | Sans bug : provisions ≠ 0 |
| 5.1.3 | Avant fix (v14.81-) : provisions = 0. Après fix : provisions = 800 | Calcul correct |
| 5.1.4 | Créer mvt `Provisions pour charges de copropriété` db=500 imm=Beta | OK |
| 5.1.5 | Régul → charges réelles = 500 | OK |
| 5.1.6 | Mix legacy 'Loyers' + LEGAL-2044 'Loyers encaissés' | Les 2 comptés |

### 5.2 BUG-DASH-001 (Sprint 1D)

Pré-requis : un bail avec révision IRL historique (`DB.irlHistorique` contient au moins une entrée).

| # | Action | Attendu |
|---|---|---|
| 5.2.1 | Dashboard → sélectionner mai 2024 (avant révision jan 2025) | Loyer attendu = ancien HC |
| 5.2.2 | Dashboard → sélectionner juin 2025 (après révision) | Loyer attendu = nouveau HC |
| 5.2.3 | Console : `_loyerHCAtDate(DB.logements[0], '2024-05-15')` | Retourne l'ancien HC |
| 5.2.4 | Console : `_loyerHCAtDate(DB.logements[0], '2025-06-15')` | Retourne le nouveau HC |

### 5.3 DB-CORRUPT-FALLBACK (Sprint 1E)

| # | Action | Attendu |
|---|---|---|
| 5.3.1 | Console : `localStorage.setItem('immotrack_db_v1', '{invalide JSON')` | OK |
| 5.3.2 | F5 (rechargement) | Toast erreur 12s rouge "Base corrompue — restauration recommandée" |
| 5.3.3 | Console après F5 : `Object.keys(localStorage).filter(k => k.includes('corrupt_backup'))` | Au moins 1 clé `immotrack_db_v1_corrupt_backup_<timestamp>` |
| 5.3.4 | Console : `JSON.parse(localStorage.getItem('immotrack_db_v1_corrupt_backup_*'))` | ⚠️ throw (normal, c'est le JSON cassé sauvegardé) → utiliser `localStorage.getItem` brut pour voir le payload |
| 5.3.5 | Si user avait `_driveLastSync` set → modale "m-drive-restore-prompt" s'ouvre auto | OK |

### 5.4 BUG-EQUIP-FILTER (Sprint 1E)

| # | Action | Attendu |
|---|---|---|
| 5.4.1 | Créer un logement vacant (sans locataire) | OK |
| 5.4.2 | Onglet Équipements → sélecteur logement | Logement vacant inclus avec label "Vacant" |
| 5.4.3 | Sélecteur immeuble | Inclut les immeubles avec logements vacants |
| 5.4.4 | Vue liste | Logement vacant apparaît (avec card vide ou message) |

### 5.5 BUG-HC-GARDE-FOU (Sprint 1E)

Déjà testé en 2.5 (Validation à la saisie).

---

## 📊 PARTIE 6 — Monitoring + CI (10 min)

### 6.1 Monitoring (Sprint 4C)

| # | Action console | Attendu |
|---|---|---|
| 6.1.1 | `DB.params.monitoringEnabled = true; saveDB()` | Toast OK |
| 6.1.2 | `window._installGlobalCapture()` | Aucun erreur, installation des listeners |
| 6.1.3 | `setTimeout(() => { throw new Error('Test monitoring'); }, 100)` | Erreur dans console |
| 6.1.4 | Attendre 1s, puis `DB.errorLog.slice(-1)[0]` | Objet `{ts, message: 'Test monitoring', stack, pathHash, uaHash}` |
| 6.1.5 | `DB.errorLog[0].uaHash` | Hash hexadécimal (PAS `Mozilla/...` en clair) |
| 6.1.6 | `_logEvent('test_event', {key: 'val'})` | Objet retourné, ajouté à `DB.eventLog` |
| 6.1.7 | `_exportMonitoringLogs(DB)` | String JSON avec `_meta.app === 'ImmoTrack'`, `errorLog`, `eventLog` |
| 6.1.8 | `_clearMonitoringLogs(DB)` | Retourne `{cleared: N}`, `DB.errorLog` et `DB.eventLog` vidés |
| 6.1.9 | `DB.params.monitoringEnabled = false; _logError(new Error('x'))` | Retourne `null` (désactivé) |

### 6.2 CI GitHub Actions (Sprint 4D)

| # | Action | Attendu |
|---|---|---|
| 6.2.1 | `cat .github/workflows/test.yml` | Workflow YAML valide |
| 6.2.2 | `git push origin <branche>` | Workflow se déclenche sur GitHub |
| 6.2.3 | Vérifier sur GitHub → Actions tab | Workflow vert (Vitest passe + syntax check) |
| 6.2.4 | Ouvrir une PR | Workflow se relance automatiquement |

---

## 📧 PARTIE 7 — EMAIL-AUTO (post-mes-commits, 10 min)

3 commits livrés en parallèle (ac6a67a, 5154bfd, 76c5855). Tests inclus dans les 321 Vitest.

| # | Action console | Attendu |
|---|---|---|
| 7.1 | `window._emailTypesSupportes()` | Array des 10 types (relance impayé, fin de bail, IRL, etc.) |
| 7.2 | `window._emailCompose(...)` | Objet `{sujet, corps, destinataires}` |
| 7.3 | UI : trouver le(s) bouton(s) Email dans l'app | Bouton sur fiches/baux selon impl. |
| 7.4 | Console : `DB.emailsSent` | Array (vide ou peuplé selon usage) |

**Note** : je n'ai pas livré ces 3 commits → tester selon docs/subjects/EMAIL-AUTO.md si présent. Tests Vitest validés (41+18 tests passent).

---

## ☁️ PARTIE 8 — Drive sync (15 min, nécessite compte Google de test)

| # | Action | Attendu |
|---|---|---|
| 8.1 | Onglet Export → "☁️ Google Drive" → "⬆️ Sauvegarder sur Drive" | OAuth Google → consent OK |
| 8.2 | Vérifier compte Drive → dossier `ImmoTrack/` créé | OK |
| 8.3 | Vérifier structure : `ImmoTrack/<entité>/<immeuble>/<logement>/` avec 9 sous-dossiers (📋 EDL, 📜 Bail, 📄 Documents, 🖼️ Photos, 🧾 Quittances, 📈 IRL, 🛡️ MRH, 🔧 Travaux, ⚡ Charges) | 9 sous-dossiers présents |
| 8.4 | Vérifier fichier `entity-*.json` ou `user-*.json` à la racine | OK |
| 8.5 | Modifier un mouvement → push auto | Toast "✅ Synchronisé" |
| 8.6 | Sur un 2ème device (ou même device après reset DB) : pull | Données rechargées |
| 8.7 | Console après pull : `DB.auditTrail.slice(-1)[0]` | Inclut entrées sync |
| 8.8 | Supprimer 1 logement → tombstone propagé | Logement disparaît sur 2ème device |

---

## 🚨 PARTIE 9 — Tests d'intégration parcours utilisateur (30 min)

### 9.1 Parcours bailleur particulier complet

| # | Étape | Vérification |
|---|---|---|
| 9.1.1 | Créer 1 entité "Test Bailleur" type "Particulier" | Apparaît dans liste Bailleurs |
| 9.1.2 | Créer 1 immeuble "Immeuble Test" attaché à l'entité | Apparaît dans fiche bailleur |
| 9.1.3 | Créer 1 logement "TEST-001" type T2, surf 50, hc 800, ch 50 | Apparaît Biens |
| 9.1.4 | Créer 1 bail avec locataire "MARTIN Jean", début 2024-01-01, IRL T4 | Apparaît dans Baux |
| 9.1.5 | Saisir 12 mvts loyers mensuels 2025 (800€ cat 'Loyers encaissés', qui=TEST-001) | 12 mouvements |
| 9.1.6 | Saisir 2 mvts charges (cat 'Provisions copropriété' db=200) | 2 mvts |
| 9.1.7 | Saisir 1 mvt travaux (cat 'Travaux réparation' db=500) | OK |
| 9.1.8 | Saisir 1 mvt taxe foncière (cat 'Taxe foncière' db=600) | OK |
| 9.1.9 | Onglet Quittances → vérifier 12 quittances auto-générées | OK |
| 9.1.10 | Onglet Régul → vérifier régul 2025 calculée | provisions ≠ 0, charges réelles cohérentes |
| 9.1.11 | Onglet Export → "Aide 2044" → résultat foncier cohérent | `(800*12) - (200*2 + 500 + 600) = 8100€` |
| 9.1.12 | Onglet Export → "Bilan annuel" | Tx occupation 100%, cash-flow ~8100 |
| 9.1.13 | Onglet Export → "FEC" téléchargé | 12 lignes loyer + 4 lignes charges = 32 écritures (partie double) |
| 9.1.14 | Vérifier `DB.auditTrail.length` | ≥ 16 entrées (création + 12 mvts + autres) |

### 9.2 Parcours IRL complet

| # | Étape | Vérification |
|---|---|---|
| 9.2.1 | Saisir DPE classe D pour TEST-001 + date 2024-06-01 | OK |
| 9.2.2 | Vérifier que la révision IRL est calculée (bail début 2024-01-01, anniversaire 1er janv 2025) | Onglet IRL ligne 'À préparer' |
| 9.2.3 | Bouton "👁 Aperçu" → modal lettre IRL | Lettre rendue avec mois anniversaire |
| 9.2.4 | Bouton "Valider envoi" → enveloppe verte | Toast OK |
| 9.2.5 | Bouton "💶 Valider IRL" → confirm | DB.irlHistorique a 1 entrée + log.hc mis à jour |
| 9.2.6 | Dashboard → vérifier que loyer attendu **avant** révision = ancien HC | Cf BUG-DASH-001 fix |
| 9.2.7 | Test gel DPE F : changer DPE → F → ouvrir IRL → blocage "🔒 Loyer GELÉ" | Loi Climat appliquée |

### 9.3 Parcours EDL complet

| # | Étape | Vérification |
|---|---|---|
| 9.3.1 | Nouvel EDL → type entrée pour TEST-001 | Modale EDL |
| 9.3.2 | Ajouter 3 pièces (Salon, Cuisine, Chambre) | Pièces ajoutées |
| 9.3.3 | Ajouter 1 photo par pièce (upload image test) | Photos en thumb |
| 9.3.4 | Signatures bailleur + locataire | 2 canvas signés |
| 9.3.5 | Save EDL → `DB.auditTrail.slice(-1)[0]` | `entityType: 'edl'` (audit hook v14.98) |
| 9.3.6 | Bouton "Générer PDF" | PDF téléchargé avec 7 colonnes + photos + signatures |
| 9.3.7 | Si Drive connecté : photos uploadées dans `📋 EDL/` du logement | Visible Drive |

---

## ✅ PARTIE 10 — Récap erreurs/warnings à vérifier (5 min)

### 10.1 Pas d'erreurs JS au boot

| # | Action | Attendu |
|---|---|---|
| 10.1.1 | F5 (reload) page | Aucune erreur rouge dans Console |
| 10.1.2 | Onglet Console → niveau "Errors only" | Vide |
| 10.1.3 | Onglet Network → filtre "Failed" | Aucun fichier en échec |

### 10.2 Warnings acceptables

Ces warnings sont attendus, **PAS** des bugs :
- `[SANDBOX] Dataset démo chargé` (info, mode test)
- `[main.js] Sprint 3D chargé - 38 helpers...` (info)
- `[Bail-libs] inline executed` (info)

Warnings **PROBLÉMATIQUES** à rapporter :
- ❌ `Uncaught TypeError: ...`
- ❌ `Module not found`
- ❌ `Failed to fetch`
- ❌ Tout `Permission denied`

---

## 🔬 PARTIE 11 — Vérifications avancées (optionnel, 20 min)

### 11.1 Audit transversal _auditLog couverture (Sprint v14.98 ajout)

```js
// Console : vérifier que tous les save<X> ont bien un hook
const saveTypes = ['mouvement', 'bail', 'entite', 'immeuble', 'logement', 'quittance', 'assurance', 'mrh', 'edl'];
const auditTypes = new Set((DB.auditTrail||[]).map(e => e.entityType));
saveTypes.forEach(t => console.log(t, auditTypes.has(t) ? '✅' : '⚠️ AUCUN audit pour ce type'));
```

Attendu : tous ✅ après un parcours complet (Partie 9.1).

### 11.2 Audit performance

| # | Action | Attendu |
|---|---|---|
| 11.2.1 | DevTools → Performance tab → record 5s navigation | FPS > 30 sur navigation |
| 11.2.2 | DevTools → Memory → snapshot | Heap < 50 MB sur dataset démo |
| 11.2.3 | localStorage usage : `JSON.stringify(localStorage).length / 1024 / 1024` (MB) | < 5 MB |
| 11.2.4 | IndexedDB usage (photos EDL) | Affiché dans Application tab |

### 11.3 Audit accessibilité (Lighthouse)

| # | Action | Attendu |
|---|---|---|
| 11.3.1 | DevTools → Lighthouse → "Accessibility" → audit | Score > 80 |
| 11.3.2 | Erreurs critiques : focus visible, contraste texte, alt sur img | Aucune en rouge |

### 11.4 Audit cycle imports modules ES

```bash
node --input-type=module -e "
const modules = ['./js/main.js'];
for (const m of modules) {
  try { await import(m); console.log('✅ ' + m); }
  catch(e) { console.log('❌ ' + m + ' : ' + e.message); }
}"
```

Attendu : `❌ main.js : window is not defined` (normal en Node, le code fait `window.X = X`).

---

## 🚀 PARTIE 12 — Avant bascule sandbox → prod (15 min)

### 12.1 Backups obligatoires

| # | Action | Attendu |
|---|---|---|
| 12.1.1 | `cp index.html index.prod.backup-$(date +%Y%m%d).html` | Fichier de backup créé |
| 12.1.2 | Export JSON via Paramètres → sauvegarder localement | Fichier `ImmoTrack_YYYY-MM-DD.json` téléchargé |
| 12.1.3 | `git tag pre-bascule-prod-$(date +%Y%m%d)` | Tag créé |
| 12.1.4 | Vérifier tag `pre-modular-sprint2` existe | Rollback ultime dispo |

### 12.2 Liste des 18 commits à reproduire en prod

```bash
git log --oneline pre-modular-sprint2..HEAD --reverse
```

Attendu (ordre suggéré bascule) :
1. v14.80 SECU-INNERHTML (CRITIQUE → 1er commit prod)
2. v14.81 AUDIT Phase 6 + validation ref
3. v14.82 BUG-CHARGE-001
4. v14.83 BUG-DASH-001
5. v14.84 DB-CORRUPT + EQUIP + HC
6. v14.85 CSS extraction
7. v14.86 core/utils.js
8. v14.87 core/idb.js
9. v14.88 components toast/modal
10. v14.89 AUDIT-TRAIL
11. v14.90 LEGAL-2044
12. v14.91 RGPD-COMPLIANCE
13. v14.92 LEGAL-BILAN-ANNUEL
14. v14.93 EXPORT-COMPTABLE
15. v14.94 DRIVE-ARBORESCENCE audit + IMPORT-CONCURRENTS
16. v14.95 MOBILE Phase 3+4
17. v14.96 Monitoring + CI
18. v14.97 EMAIL-AUTO (3 commits)
19. v14.98 Audit complétude hooks

### 12.3 Méthode bascule recommandée

Pour chaque commit :
```bash
# 1. Identifier le diff
git diff pre-modular-sprint2..<commit> -- index-test.html > /tmp/diff.txt

# 2. Appliquer à index.html (manuellement OU script)
# (Si modifs limitées à index-test.html : cp index-test.html index.html à la fin)

# 3. Test visuel rapide sur index.html

# 4. Bump version dans index.html

# 5. Commit séparé
git add index.html
git commit -m "vX.Y : merge sandbox <sujet> → prod"
```

**Alternative simple si confiance** : `cp index-test.html index.html && git add index.html && git commit -m "Bascule complète sandbox v14.98 → prod"` (un seul commit, perd granularité).

---

## 🎯 Synthèse vérification

À cocher en fin de checklist :

- [ ] Partie 1 (auto) : 321 tests passent, 15 modules HTTP 200, console DevTools sans erreur
- [ ] Partie 2 (SECU) : 0 XSS exploitable, validation ref OK, helpers escHtml OK
- [ ] Partie 3 (Archi) : Modules ES chargés, pattern shadow OK, navigation backward OK
- [ ] Partie 4 (Conformité) : AUDIT-TRAIL/2044/RGPD/Bilan/FEC tous fonctionnels
- [ ] Partie 5 (Bugs P1) : 5 bugs vérifiés fixés
- [ ] Partie 6 (Monitoring + CI) : Logs anonymes, CI verte
- [ ] Partie 7 (EMAIL-AUTO) : Tests Vitest OK, UI à explorer
- [ ] Partie 8 (Drive) : Sync bidirectionnelle, arborescence créée
- [ ] Partie 9 (Parcours) : Bailleur complet + IRL + EDL OK
- [ ] Partie 10 (Errors/warnings) : Console clean
- [ ] Partie 11 (Audits avancés) : Performance + a11y OK
- [ ] Partie 12 (Bascule prod) : Backups faits, méthode validée

**Si tout est ✅ → V1 prête pour bêta privée.**
**Si ≥ 1 ❌ critique → rapport détaillé (ligne, étape, attendu vs constaté) → fix avant bascule.**

---

**Document généré** : 2026-05-12 (audit post-marathon v14.98)
**Auteur** : session pilotage marathon Claude
**Lié à** : `docs/audit/V1-COMMERCIALE-RAPPORT.md` (synthèse exécutive)
