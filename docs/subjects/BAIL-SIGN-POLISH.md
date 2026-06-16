# BAIL-SIGN-POLISH — polish & correctifs signature de bail à distance (post-mise-en-prod)

> Créé 2026-06-09. Contexte : BAIL-SIGNATURE-DISTANCE C3 livré en prod (v15.263) puis correctifs
> v15.269 (auto-déclencheur émission), v15.271 (collision `_bsRelay*`), v15.272/273 (refresh Drive
> à la finalisation) + relais CORS (`dkeller-app.github.io`). Le flux marche **de bout en bout**
> (émission → partage → signature → finalisation → badge 🔒 + PDF signé/Certificat sur Drive).
> Restent des items de polish/bugs remontés par l'utilisateur en test réel.

## A. Page de signature (relais — `relay/public/sign.js`, auto-contenu, redeploy wrangler)
- **A1 (CRITIQUE — ✅ RÉSOLU v15.279 ; vraie cause = BUG-DOUBLE-CONVERSION des coordonnées)** :
  la signature + les paraphes du locataire n'apparaissaient JAMAIS car ils étaient tamponnés **HORS de
  la page**. Cause : l'émission (`buildSignManifest`) convertissait déjà les ancres mm→pt (`rectFromJsPdf`)
  AVANT de les stocker dans le manifeste ; le relais (`stamp.js`) ré-appliquait `rectFromJsPdf` →
  **mmToPt appliqué DEUX fois** → ex. paraphe x=125mm stocké 354pt puis mmToPt(354)≈1003pt, **hors de la
  page de 595pt** → tampons hors-feuille → invisibles, depuis la mise en service. Preuves runtime :
  manifeste réel = `{x:354.33, y:9.92}` (sortie `rectFromJsPdf`) au lieu de `{x:125, y:279.5}` (mm brut) ;
  `images XObject = 52` (tampons bien EMBARQUÉS) ; `MATCH` hash = true (upload + archivage corrects).
  **Fix** : le manifeste stocke les ancres **mm BRUTES** ; la conversion est faite UNIQUEMENT côté relais
  (contrat aligné avec `fallbackAnchors` qui sont en mm + les 161 tests relais). Helper
  `__tests__/helpers/build-sign-manifest.js` (retrait `rectFromJsPdf`) + test (assert mm) + miroir global
  régénéré + appelants `_emitRemoteSignSession` (prod + sandbox, retrait `probe`/`pageHeightPt`) + bump 5
  spots. **Audit code-reviewer : APPROVE.** Commit `6a49a45` poussé `origin/main`.
  ⚠️ **DEUX bugs DISTINCTS se cumulaient** : (1) **BUG-DRIVE-STALE-PDF** (section B, ✅ v15.277) faisait
  pointer `pdfRef` sur un ancien fichier Drive (masquait tout) ; (2) **BUG-DOUBLE-CONVERSION** (ici,
  ✅ v15.279) plaçait les tampons hors-page. Les DEUX corrigés → signature locataire enfin visible.
  Reste : confirmation user (re-signe F2 milieu en v15.279) + nettoyage debug `[SIGN-DEBUG]` + case
  « Lu et approuvé » + commentaire-garde « ancres = mm » côté relais (nit audit).

  [HISTORIQUE] « PDF signé » paraissait sans paraphes/signature locataire.
  CHAÎNE RELUE LIGNE À LIGNE (2026-06-12) = **provablement correcte** :
  capture ancres mm/jsPDF OK (log `13 ancres, 26 pages`, sigId `loc-0`) ; manifeste embarqué
  (`embedInDoc`/`setKeywords`) ; `resolveAnchors` filtre par sigId (le fait que l'utilisateur ait PU
  parapher prouve que `paraphePagesFor` a matché → `stampSignature` matche les mêmes ancres) ;
  coords mm→pt (`rectFromJsPdf`) tombent DANS la page ; `recordSignature` persiste les octets tamponnés,
  `/result`→`getSignedPdf` les renvoie ; `_completeRemoteSign` archive CE blob ; bouton « PDF signé »
  ouvre `pdfRef.driveWebViewLink` = ce blob. **161 tests relais PASSENT** dont `sign-e2e` (round-trip
  réel bailleur+locataire, manifeste préservé). Contradiction code-correct / observé-vide → hypothèse
  runtime. **Instrumentation déployée (relais `fde36be5`)** : écran final « ✓ Document signé » affiche
  **« Éléments apposés : N »** + `[SIGN-DEBUG]` console (sigId/paraphePages/signaturePages/manifestKw +
  stamp result). PROCHAIN PAS : un essai NEUF (ancien bail = session 401 expirée, inutilisable). Si N=13
  → bug d'affichage/cache/ancienne-finalisation côté app ; si N=0 → mismatch sigId/manifeste révélé par
  le log. (NB : retirer le `console.log [SIGN-DEBUG]` + simplifier le compteur après résolution.)
- **A2 (UX #1)** ✅ LIVRÉ (relais `fde36be5`) : `renderReadStep` remet `#step-read .scroll` + window en
  haut à chaque page.
- **A3 (UX #3)** ✅ LIVRÉ (relais `fde36be5`) : bandeau jaune sur la/les page(s) portant une zone de
  signature (`signaturePagesFor` ajouté à `stamp.js`) — « vous signerez à la dernière étape ». PDF non
  réordonné (intégrité légale).
- **A4 (FEATURE #2 — code email type Yousign / OTP)** : aujourd'hui = simple vérif d'email
  (`/api/sessions/:id/verify-email` compare le hash, anti-transfert), PAS de code OTP. Un vrai OTP
  exige que **le relais ENVOIE des emails** (il ne sait pas aujourd'hui) → brancher un service
  (MailChannels/Resend sur le Worker) + générer/stocker/valider le code. Chantier infra dédié,
  pertinent pour la commercialisation.

## B. App / fiche bail (`index.html` — repasse par le protocole d'intégration index-commit)
- **BUG-DRIVE-STALE-PDF (CRITIQUE — ✅ INTÉGRÉ PROD v15.277, commit `2c8268b` poussé `origin/main`)** :
  `_ingestSignedBailArtifacts` archivait le PDF signé sous un **nom fixe** `bail-<ref>-signe.pdf` avec
  `_driveFindFileInFolder(...) || _driveUploadBlob(...)`. Après « Réinitialiser » + re-signature, le PDF
  a un **contenu différent** mais `bail.ref` identique → le find trouve l'**ancien** fichier → le `||`
  **court-circuite l'upload** → le nouveau PDF signé n'est JAMAIS uploadé, `pdfRef.driveWebViewLink`
  pointe sur l'ancien (PDF périmé). **Fix** : discriminant de contenu dans le nom
  (`bail-<ref>-signe-<contentHash[0:12]>.pdf` + idem certificat), `contentHash` passé par `_completeRemoteSign`,
  **fail-fast si `contentHash` absent** (anti-collision strict). Re-signature → empreinte ≠ → nouveau
  fichier ✓ ; retry → empreinte = → réutilisé (idempotence I2 préservée) ✓ ; on n'écrase jamais un PDF
  signé (immutabilité légale) ✓. **Sandbox** `index-test-lease-signature.html` ✅ (commit `2b0b182`,
  branche `bail-sign-c3`). **Audit code-reviewer = APPROVE-WITH-NITS**. RESTE : porter verbatim à
  `index.html` (fct ~6404, noms ~6418-6421, appelant ~6470) après re-grep prod + bump version + file
  index-commit. Pour le bail F2 milieu déjà coincé : un Réinitialiser + re-signe après le port produira
  le bon fichier (ancien `1x548…` orphelin, inoffensif).
  - **Suivi (reviewer, non bloquant)** : l'ancien fichier reste orphelin sur Drive, partagé co-gest +
    visible dans `baux/` → 2 `bail-<ref>-signe-*.pdf` sans canonique évident. Nettoyage ultérieur :
    déplacer les PDF signés supersédés dans `baux/_archives/`. (Cosmétique, pas un défaut légal.)
- **B1 (#4)** : boutons incohérents tant qu'une session distante est active — masquer « Le locataire
  signe » (présentiel) quand `remoteSession` ∈ {sent,chaining}. (Partiellement résolu par la cascade
  `mode='distance'` à la finalisation, mais à durcir pour les états intermédiaires.)
- **B2 (#5 — ⭐ PRIORITÉ : vraie cause de A1)** : « Voir bail signé » (bleu) affiche le snapshot LOCAL
  (bailleur-seul, figé). Pour un bail **signé à distance** (`mode==='distance'` + `pdfRef`), ce bouton
  induit en erreur (semble « non signé par le locataire »). Fix : quand le bail est signé à distance,
  soit **rediriger « Voir bail signé » vers le PDF finalisé** (`pdfRef.driveWebViewLink`), soit le
  **renommer** (« Voir snapshot bailleur ») et mettre en avant « PDF signé », soit le **masquer**.
  Décision UX à prendre (cohérence boutons B4). C'est LE correctif qui clôt A1.
- **B3 (#6)** ✅ VÉRIFIÉ (2026-06-12) : le bouton « 📄 PDF signé » du badge `completed` ouvre bien
  `sig.pdfRef.driveWebViewLink` (index.html worktree ligne ~6239) = l'artefact finalisé du relais.
  Donc le câblage est bon ; si le PDF est vide, la cause est en amont (cf A1).
- **B4** : design des boutons de la fiche bail (encombrement) — à revoir.
- **B5** : finalisation sans console ni rechargement — relance le sondage quand Drive se (re)connecte,
  ou bouton « Finaliser / Vérifier la signature » explicite. (Atténué par `_ensureDriveToken()` v15.273.)

## C. Suivi connexe (hors signature, repéré en passant)
- `rParamsTheme` : `JSON.parse` échoue sur la valeur de thème « light » (`Unexpected token 'l'`,
  immotrack rParamsTheme) — bug séparé, à traiter à part.
- Lanceur 📨 « Envoyer en signature » + badge câblés dans la fonction MORTE
  `_rBauxLegacyCards_DEPRECATED_v15_224` (liste Locataires) → recâbler dans `rBaux()` vivant (seul
  point d'entrée actuel = fiche bien).

## D. Demandes fonctionnelles (retours utilisateur 2026-06-12 — app, protocole index-commit)
- **D1** : bouton **« Signer maintenant »** explicite sur la fiche bail = signature bailleur en présentiel,
  directe, sans ouvrir la modale d'envoi à distance. (Le flux existe via le wizard ; manque une entrée
  claire « je signe moi-même tout de suite ».)
- **D2** : (a) possibilité d'**envoyer le bail au bailleur** pour signature à distance (gérant ailleurs) —
  le relais accepte déjà n'importe quel signataire, c'est une extension du choix présentiel/distance par
  signataire ; (b) **ne pas générer le circuit relais si seul le bailleur signe** — la signature est cuite
  dans le PDF par l'app (genPDFNative), aucune session/manifeste nécessaire. Clarifier le branchement.
- **D3** (= durcissement B5) : après signature du locataire, **les boutons ne se rafraîchissent pas tout
  de suite** (latence du sondage ~30 s). Pas de push relais dispo → sonder plus vite tant qu'une session
  est ouverte + bouton **« Vérifier maintenant »**.

## Statut final (2026-06-15 — tout livré en prod, audits code-reviewer APPROVE)
- ✅ **BUG-DRIVE-STALE-PDF** (v15.277, `2c8268b`) — PDF Drive à jour : nom = empreinte du contenu.
- ✅ **A1 / BUG-DOUBLE-CONVERSION** (v15.279, `6a49a45`) — manifeste en mm brut, relais convertit seul
  → signature/paraphes locataire enfin **visibles** (étaient tamponnés hors-page).
- ✅ **A2 + A3 + (4) défilement obligatoire + (7) retrait debug + (8) « Lu et approuvé »** — relais
  (`fde36be5` puis `16efc997`) ; + garde « ancres = mm » dans `coords.js` (`52bc23c`).
- ✅ **D1 / bouton « ✍️ Signer le bail »** — v15.281 (fiche `_renderLogFichePanelBail`) + v15.282
  (cartes liste Locataires `rBaux`) → `previewBailSignRef` → `_AUTO_SIGN` → `startSignatureWizardV2()`.
- ✅ **D2(b) / Drive-only** (v15.282) — bailleur signé → upload Drive seul, pas de téléchargement
  (`pdf.save` gardé pour brouillon non signé). [D2(a) envoi au bailleur distant = extension future]
- ✅ **(5) case paraphe locataire vide** (v15.282) — plus de « à compléter » sous le tampon (mode distance).
- ✅ **(6) typo §1.3.1.3** (v15.282) — « ≤ » (glyphe absent de la police jsPDF) → « inférieure ou égale à ».
- ✅ **D3 / bouton « 🔄 Vérifier »** (v15.282) sur le badge distant en attente (poll forcé) ; présentiel
  déjà auto via `_refreshAfterMutation`→`rLogFiche`.

### Reste (non bloquant — backlog)
- **B2** : « Voir bail signé » (snapshot bailleur-seul) — rediriger/renommer pour un bail signé à distance
  (UX, évite la confusion qui a lancé la saga ; le « PDF signé » finalisé est correct).
- **B1 / B4** : cohérence + design des boutons de la fiche bail (encombrement).
- **A4** : OTP email type Yousign (chantier infra — le relais doit envoyer des emails).
- **C** : `rParamsTheme` JSON.parse ; fonction morte `_rBauxLegacyCards_DEPRECATED_v15_224`.
- **Robustesse** : si l'upload Drive d'un bail signé échoue (mode Drive-only), proposer un re-téléchargement
  de secours (aujourd'hui : toast d'erreur + retry token via `uploadBailPDFToDrive`).
- **Nit** : ranger les PDF signés supersédés orphelins dans `baux/_archives/` ; D2(a) envoi bailleur distant.
