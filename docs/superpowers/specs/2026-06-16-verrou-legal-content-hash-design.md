# Verrou légal des baux/EDL signés — `content_hash` canonique (design)

> **Statut** : design figé 2026-06-16 (décision user). Étape 3 du cutover Supabase. À implémenter en session dédiée (legal-critical → module testé + audit `code-reviewer`).
> **Pré-requis** : bascule app sur cloud OK (étapes 1/2). Moteur d'immutabilité DB déjà en place (P0-C1).

## Objectif
Rendre un bail/EDL **signé** juridiquement **immuable** dans le cloud : `locked=true` (le trigger `prevent_locked_mutation` refuse alors tout UPDATE/DELETE) + un **`content_hash`** qui prouve à jamais que les **termes signés** n'ont pas été altérés.

## Décision (user, 2026-06-16) : QUOI hasher
`content_hash` = **SHA-256 des TERMES JURIDIQUES FIGÉS** (pas du PDF). Pourquoi :
- **Reproductible** à jamais (un vérificateur recalcule le même hash depuis les termes) — un hash de PDF ne l'est pas (PDF jsPDF non déterministe : timestamps/metadata variables).
- **Uniforme** : marche pour les baux signés via TOUS les modes (présentiel/`bailleur-seul`/`avec-locataire`/distance) et les futurs.
- **Marche pour les 2 baux existants** (F3, Ferrette-101) : signés via d'anciens modes → **pas d'empreinte PDF ni PDF archivé**, MAIS ils ont le `bailSnapshot` (termes figés). L'empreinte-PDF leur serait impossible.
- L'**empreinte du PDF** (`bail.signatures.contentHash` = SHA-256 du PDF final, déjà calculé en signature distance, index.html:6591) reste comme **preuve secondaire** de l'artefact signé (champ distinct, non utilisé pour le verrou DB).

## Définition canonique du `content_hash` (LE cœur — doit être figé et déterministe)
Module pur `js/core/bail-content-hash.js` → `async bailContentHash(bail) → '<sha256 hex 64>'`.

**Contenu hashé** = objet `{ terms, snapshot, signedAt }` où :
- `terms` (les conditions du contrat, depuis `bail.*`) — **whitelist EXPLICITE** (jamais `{...bail}`, pour exclure les champs volatils/internes) :
  `{ hc, ch, dg, jpay, debut, fin, finEffective, typeContrat, type, locataires, garants:(bail.signataires), mobilier, irl, irlHistorique }`
  (montants normalisés en nombre ; dates en `YYYY-MM-DD` ; absents → `null`, jamais omis.)
- `snapshot` = `bail.signatures.bailSnapshot` **tel quel** (déjà figé à la signature : `{log, imm, capturedAt}`). C'est la photo légale du bien+immeuble.
- `signedAt` = `bail.signatures.signedAt` (ISO-8601).

**Canonicalisation déterministe** (sinon le hash n'est pas reproductible) :
1. Sérialisation JSON **à clés triées récursivement** + **sans espace** (canonical JSON). Helper `_canonicalStringify(obj)` (tri récursif des clés, arrays préservés dans l'ordre).
2. `SHA-256(UTF-8(canonicalJSON))` → hex minuscule 64 car.
3. **Byte-identique** navigateur (`crypto.subtle.digest`) ↔ Node (`crypto.createHash`) — testé sur les vraies données (comme `det-uuid.js` l'a fait pour SHA-1).
**Versionné** : préfixer le canonical par un sentinel `"itbailhashv1|"` → permet une v2 future sans casser la vérification des v1.

## Composants à livrer
1. **`js/core/bail-content-hash.js`** (module pur) + tests Vitest : déterminisme, byte-identité navigateur↔Node, stabilité (réordonner les clés d'entrée → même hash), whitelist (un champ volatil ajouté au bail → hash inchangé).
2. **Câblage app (signature)** : au moment où un bail passe signé (présentiel ET distance), calculer `bailContentHash(bail)` → stocker `bail.signatures.contentHashTerms` (+ `signatureSource:'immotrack'` + `locked:true` déjà posés). Ne PAS écraser un hash existant (immutabilité).
3. **Mapping sync** `js/core/store-mapping.js` (baux) : mapper `content_hash` ← `signatures.contentHashTerms`, `signature_source` ← `signatures.signatureSource`, `locked` ← `signatures.locked`. (Aujourd'hui ces colonnes ne sont PAS mappées → un signé synchronisé reste `locked=false` en base : **gap à combler**.)
4. **Exclusion sync des verrouillés** `js/core/store-sync.js` : un bail `locked` (signé) ne doit JAMAIS partir en upsert (sinon le trigger DB `prevent_locked_mutation` refuse → conflit à chaque flush). Le diff doit **exclure les baux `signatures.locked===true` des upserts** (ils sont immuables ; rien à pousser). Garder la détection de suppression (un signé ne se supprime pas non plus, mais ne pas tenter d'UPDATE).
5. **Script de verrouillage rétroactif** `_import/_lock-signed.mjs` (gitignored, service_role) : pour les 2 baux signés existants → calculer `bailContentHash` depuis `legacy_raw` → `UPDATE baux SET content_hash=…, signature_source='immotrack', locked=true WHERE …` (via GUC `app.bypass_immutable` si besoin pour repasser ; le passage `false→true` est autorisé sans bypass). Vérifier ensuite : `locked=true`, trigger actif (un UPDATE de test refusé).

## Séquence + sûreté
1. Module + tests (offline) → audit.
2. Mapping sync + exclusion verrouillés + tests (offline + intégration Postgres : un bail locked n'est pas ré-upserté, pas de conflit).
3. Câblage app (signature) → calcul + stockage du hash.
4. Script rétroactif sur les 2 baux → verrouillés.
5. **Vérif finale** : les 2 baux `locked=true` en base, un UPDATE refusé (trigger), la sync ne génère pas de conflit sur eux, une NOUVELLE signature (test) verrouille bien en cloud.
- Risque immédiat FAIBLE (les 2 signés ne sont pas modifiés) → pas d'urgence à bâcler. Audit `superpowers:code-reviewer` à chaque étape (legal-critical).

## Hors scope / différé
- **EDL signés** : 0 aujourd'hui. Même patron (`edlContentHash` sur le snapshot EDL figé) quand un EDL sera signé. Colonnes `edl.locked/content_hash/signature_source` déjà en base (P0-C1).
- **Avenant** (`amends_id`) / **résiliation** (`baux_evenements`) : déjà modélisés (P0-C1), hors de ce design (qui ne fait que VERROUILLER l'existant signé).
- Migration de l'empreinte PDF (`signatures.contentHash`) vers un champ dédié : optionnel, non bloquant.

## Décisions captées
- **D1** : `content_hash` = SHA-256 des **termes figés** (pas le PDF). ✅ (user 2026-06-16)
- **D2** : empreinte PDF gardée comme **preuve secondaire** (champ distinct). ✅
- **D3** : canonical JSON **versionné** (`itbailhashv1|`) + byte-identique navigateur↔Node. ✅
- **D4** : la sync **exclut** les baux verrouillés des upserts (anti-conflit trigger). ✅
