# BANK-IMPORT-V2 — Import bancaire avec pointeur de progression par compte

**Status** : ✅ Livré v15.160→163 (Phases A-F complètes) — à valider en prod · **Prio** : P1 · **Taille** : M (~3-5h)
**Détecté** : 2026-05-23 par user
**Lié à** : BANK-IMPORT-XLSX (v1, session parallèle), DRIVE-CONFIANCE-UX

## Problème (cas réels user, 2026-05-23)

Le dédup actuel (`_bankDedup`, heuristique ±3 jours / ±1 €) **casse dès que l'utilisateur retouche les lignes après import** :

1. **Virement CAF scindé en 3 locataires** : au prochain import, la ligne CAF (montant total) du fichier ne matche plus mes 3 sous-lignes → ré-importée → **doublon**.
2. **Loyer reçu le 28, déplacé manuellement au 1er du mois suivant** pour les stats : écart > 3 jours → considérée nouvelle → **doublon**.
3. **Commercialisation** : nouvel utilisateur avec historique bancaire pré-ImmoTrack ne veut pas tout charger d'un coup ; pas de UX 1er import dédiée.

L'heuristique « date + montant ± tolérance » n'est robuste **que si les lignes ne sont jamais touchées** — ce qui n'est pas le workflow réel.

## Solution : pointeur de progression par compte bancaire

### A. Modèle de données — `DB.params.bankAccounts`
```
[{
  id: nid(),
  label: 'CIC Compte courant',          // user-facing
  type: 'OFX' | 'CSV',
  identifier: 'acct:30002...' | 'csv:hash:abc123',  // OFX ACCTID préfixé, ou hash des en-têtes CSV
  createdAt: ISO,
  lastImport: {
    date: 'YYYY-MM-DD',                  // date de la dernière ligne importée
    fingerprint: 'fitid:XXX' | 'csv:hash',  // fingerprint stable pour retrouver la position
    count: 42,                           // nb total de lignes importées sur ce compte
    at: ISO                              // horodatage du dernier import
  } | null  // null = jamais importé (cas 1er import)
}]
```

### B. Détection du compte au chargement du fichier
- **OFX/QFX** : parser extrait `<ACCTID>` (+ optionnel `<BANKID>`). Identifiant naturel, unique par compte.
- **CSV/XLSX** : pas de standard → hash des en-têtes (colonnes + ordre + nom de fichier facultatif) → identifiant de schéma. Au 1er import d'un fichier inconnu, modal **« À quel compte ce fichier correspond ? »** :
  - Liste des comptes existants (avec leur type et un aperçu de la dernière transaction)
  - Option **« + Nouveau compte »** : créer avec un label
  - L'identifiant CSV (hash) est mémorisé sur le compte choisi → reconnu auto les fois suivantes.

### C. UX du 1er import (cas commercialisation)
Si le compte n'a pas de `lastImport` (jamais importé), modal avec 3 choix :
1. **À partir d'une date** (recommandé par défaut) — picker date.
2. **Tout l'historique du fichier** — pour migration complète.
3. **Sélection manuelle dans l'aperçu** — affiche tout, l'user coche/décoche.

Les lignes filtrées passent ensuite dans l'aperçu normal (catégorisation auto + ajustements).

### D. UX des imports suivants (pointeur présent)
1. Cherche `lastImport.fingerprint` dans les lignes du fichier.
2. Si trouvé → slice **après** cette position → aperçu des seules nouvelles (catégorisation auto). Pas de dédup heuristique nécessaire.
3. Si non trouvé (fichier d'une autre période / ligne supprimée localement) → fallback : aperçu COMPLET + dédup heuristique amélioré, avec bandeau d'avertissement « ⚠️ Pointeur perdu, dédup par contenu (peut rater les doublons modifiés) ».
4. À l'acceptation → update `lastImport` (dernière ligne acceptée).

### E. Ce qu'on garde de la v1
- Aperçu avec catégorisation auto + bouton « + Règle ».
- `fitid` OFX comme override fiable même si pointeur perdu.
- `_bankDedup` heuristique : conservée pour le mode fallback uniquement.

### F. UI Paramètres → onglet « 🏦 Comptes bancaires »
Liste des comptes + actions :
- Renommer
- Voir l'historique d'imports (dernière date, count cumulé)
- Réinitialiser le pointeur (force le « 1er import » au prochain coup)
- Supprimer le compte (ne supprime PAS les mouvements liés)

## Phases d'implémentation

- **Phase A** : Parser extension (OFX expose `account`) + CSV header hash helper + `DB.params.bankAccounts` init. Pas d'UI. Fondation.
- **Phase B** : Modal « À quel compte ? » + détection auto + création.
- **Phase C** : Modal 1er import (3 choix) + filtrage des lignes.
- **Phase D** : Pointer-based incremental (find fingerprint + slice-after + update pointer).
- **Phase E** : UI Paramètres comptes bancaires.
- **Phase F** : Tests Vitest (header hash, fingerprint match, slice-after, account detection).

## Décisions captées
- ✅ 1er import : 3 options (date / tout / sélection manuelle aperçu). « N dernières lignes » écarté.
- ✅ Implémentation par moi (pas la session parallèle).
- ✅ Phasé + committé par étape (sandbox-first).

## Journal
- 2026-05-23 : créé · feedback user critique des cas réels qui cassent le dédup v1 · plan validé · démarrage Phase A.
- 2026-05-23 : **livré Phases A-F (v15.160→163)** en 4 commits :
  - **v15.160** Phase A : helpers `_bankExtractOFXAccount` + `_bankCsvHeaderHash` + 9 tests.
  - **v15.161** Phase B : détection auto compte + modal sélection/création + tag `_bankAccountId`.
  - **v15.162** Phases C+D : modal 1er import 3 choix + dispatcher pointeur incrémental (slice-after-fingerprint + fallback).
  - **v15.163** Phases E+F + review : modale gestion comptes (renommer/reset/supprimer), 2 helpers purs extraits + testés (`_bankSliceAfterFingerprint` + `_bankComputeLastImport`), refactor prod pour utiliser ces helpers (single source of truth), 12 tests supplémentaires (936 total). Code review pre-release : fix bug grammaire « y estsont » → « y sont », refacto fragile `details.open` → 4e radio « + Nouveau compte », safety check `_currentBankAccount` null.
  - **À valider en prod** : flux réel avec un vrai fichier bancaire (OFX/CSV) sur les 3 cas (1er import, import incrémental, re-import = « tout déjà importé »).
