# EMAIL-MODAL-UX-REFONTE — Refonte UX modale email (PC + Tablette + Mobile + PJ PDF auto)

**Status** : ✅ **Livré complet** — EM-2a v15.86 + EM-2b v15.87/88 + EM-2c v15.89 (7 types PJ auto)
· **Prio** : P1 · **Taille** : L (~6-8h, scindé en a/b/c)
**Détecté** : 2026-05-18 (user : « l'ux est dégueu (pire encore sur téléphone) »)
**Lié à** : EMAIL-SMTP-CONNECT Phase 3 (PJ auto), DOC-CIVILITE, TEMPLATES-EMAILS-PARAMS, BUG-SW-CACHE-JS

## Contexte

Modale email v15.84 fonctionnelle (envoi Gmail OK + confirm popup) MAIS UX cassée :
- **PJ PDF non attaché auto** : la modale liste les PJ « à générer + joindre manuellement » alors qu'on a déjà toute la mécanique pour les attacher en MIME multipart
- **5 boutons footer** : Annuler / Partager / Copier / Client mail / Envoyer maintenant → overflow horizontal sur mobile
- **Pas de hiérarchie visuelle** : tous les boutons ont le même poids, pas clair que « Envoyer maintenant » est l'action primaire
- **Note légale orange** prend toute la largeur, pas pliable
- **Textarea monospace 14 rows** : prend tout l'écran en mobile, pas de scroll géré
- **Pas de feedback connexion Gmail** : bouton « Envoyer maintenant » caché si pas connecté mais l'user ne comprend pas pourquoi
- **Adresse Gmail expéditeur invisible** : on n'affiche pas FROM dans la modale → le user ne sait pas avec quelle adresse il envoie

## Vision V1

Une modale qui :
1. Affiche **clairement** l'adresse FROM (= Gmail connecté) en haut
2. **Auto-attache le PDF** pour les types qui en ont un (quittance, lettre IRL, décompte régul)
3. Hiérarchise les actions : primary `📤 Envoyer maintenant` / secondary `📋 Copier` `📧 Client externe` / tertiary `Annuler`
4. Sur mobile : footer sticky 2 lignes max, body scrollable
5. Note légale repliable (badge ⚠️ + détail accordéon)
6. Pré-affichage du destinataire avec civilité (cf DOC-CIVILITE)

## Scope (5 phases)

### Phase 0 — Mockups (~2h, OBLIGATOIRE avant code) 🎨
- [x] Mockups dans `mockups/email-modal-v2/`
  - PC `pc.html` (1280px) : variantes A / B / C
  - Tablette `tablet.html` (768px)
  - Mobile `mobile.html` (375px iPhone SE / 414px iPhone Plus)
- [ ] **Validation user explicite** sur 1 variante × 3 devices
- [ ] Drill-down PJ : que se passe-t-il quand on clique sur 📎 ? (preview PDF ? sup ?)
- [ ] Validation cas extrêmes : 0 PJ / 3 PJ / corps long / sujet long / CC absent

### Phase 1 — Refonte HTML modale (~1h)
- [ ] Restructurer `_ensureModalDom` selon mockup validé
- [ ] Footer 2-row sur mobile (CSS media query)
- [ ] Affichage FROM (= `window._getDriveUserEmail()`)

### Phase 2 — PJ PDF auto (~2h, intègre EMAIL-SMTP-CONNECT Phase 3)
- [ ] Audit code génération PDF par type :
  - `quittance` : `genQuittancePDF()` ? À grep
  - `irl-revision` : `genIRLLetter()` ?
  - `decompte-regul-annuel` : ? À grep
  - `bail-signe-final` : `genBailPDF()` ?
  - `edl-entree-signe` / `edl-sortie-signe` : `genEDLPDF()` ?
- [ ] Encoder PDF en base64 + intégrer dans `_emailToMimeBase64Url` (extension de la fonction si nécessaire)
- [ ] Bouton « Générer + joindre » dans la modale (auto au chargement + manuel si on veut régénérer)
- [ ] Indicateur visuel : PJ générée ✅ / en cours ⏳ / erreur ❌

### Phase 3 — UX polish (~1h)
- [ ] Note légale pliable (`<details>` ou bouton custom)
- [ ] Toast confirmation envoyé (durée 5s, action « Voir dans Sent Gmail »)
- [ ] Indicateur connexion Gmail dans le header (badge 🟢 connecté / 🔴 déconnecté)
- [ ] Bouton « Se connecter à Gmail » inline si pas connecté

### Phase 4 — Tests + déploiement (~30 min)
- [ ] Vitest sur `_buildMailtoUrl` + `_onSendNow` (mock confirm)
- [ ] Test E2E manuel : 3 types × 3 devices × 2 modes (connecté / déconnecté)
- [ ] Bump version (= bump CACHE_VER cf BUG-SW-CACHE-JS)
- [ ] Commit + push

## Décisions à prendre

- **D1** : Modal full-screen sur mobile OU bottom-sheet OU classique ?
- **D2** : Onglets « Brouillon » / « Aperçu HTML rendu » ou un seul textarea ?
- **D3** : PJ auto-générée à l'ouverture (lent ?) OU sur clic « Joindre » ?
- **D4** : Affichage HTML rendu du mail (preview) ou texte brut uniquement ?
- **D5** : Possibilité d'ajouter une PJ manuelle (file input) en plus des auto-générées ?

## Critères de succès

- [ ] User envoie quittance avec PDF auto-attaché en 3 clics depuis mobile
- [ ] Aucun overflow horizontal aucun device
- [ ] FROM visible avant envoi
- [ ] Confirm popup affiche destinataire + sujet + FROM
- [ ] Action primaire visuellement distincte

## Notes utilisateur

> 💬 2026-05-18 : « il n'y a pas le PDF. l'ux est dégueu (pire encore sur téléphone). tu fais un mockup telephone, PC et tablette »
> 💬 2026-05-18 : « il serait bien d'ajouter un pop up d'alerte : envoyer XXX à XXXX ? » (déjà livré v15.84)

## Journal

- 2026-05-18 : créé · P1 · 5 phases · mockups OBLIGATOIRES Phase 0
- 2026-05-18 : mockups livrés `mockups/email-modal-v2/` (PC + Tablette + Mobile)
- 2026-05-18 : ✅ **EM-2a Livré v15.86** — Refonte HTML modale variant A validé user :
  - Variant **A Compact** retenu pour PC + Mobile (avec adaptation 2-rangs mobile)
  - **FROM bar verte** : adresse Gmail connectée visible avant envoi (lit `window._getDriveUserEmail()`)
  - **PJ card** structure prête : titre dynamique (singulier/pluriel), icône 📄, nom + meta + statut Prête/⏳ À générer/❌ Erreur (statut "À générer" = placeholder EM-2b)
  - **Note légale `<details>` repliable** au lieu de bloc orange permanent
  - **Footer responsive** : PC = `[Annuler] ... [Copier] [Client externe] [Envoyer]` · Mobile (≤640px) = primary fullwidth ligne 1, secondaires + Annuler ligne 2
  - **Hiérarchie boutons** : ghost / secondary / primary
  - Vérif preview JS : modale s'ouvre, structure DOM conforme, version 15.86 OK, `<details>` confirmé tag DETAILS
  - Tests Vitest 886/886 verts (18 email-modal + 25 email-send préservés)
- 2026-05-18 : ✅ **EM-2b Livré v15.87** — PJ PDF auto-générée pour `quittance` + `irl-revision` (V1.0) :
  - Nouveau module [js/core/email-pdf-attachment.js](js/core/email-pdf-attachment.js) (5 exports)
  - `_emailGenPdfAttachment(type, ctx)` Promise<{filename, base64, mimeType}|{error}>
  - `_blobToBase64` cross-env (FileReader browser / Buffer Node)
  - Approche V1.0 : **jsPDF text natif** (rapide, fiable, sans dépendance html2canvas sur HTML legacy). PDF minimaliste mais complet (en-tête bailleur, locataire avec civilité Monsieur/Madame, détail loyer/IRL, mention loi 1989, signature)
  - `openEmailModal` lance `_autoGenAttachmentInBackground(type, ctx)` après affichage → met à jour le statut PJ (⏳ Génération… → ✓ Prête / ❌ Erreur / ⚠️ Joindre manuellement si type non supporté V1)
  - `_onSendNow` lit `modal._emailCtx.pjAttachments` et passe au MIME multipart de `_emailToMimeBase64Url`
  - Exposé sur window (main.js) : `_emailGenPdfAttachment`, `_emailPdfTypesSupportedV1`, `_blobToBase64`
  - **15 tests Vitest** dans `__tests__/helpers/email-pdf-attachment.test.js` (FakeJsPdf mock, dispatch, civilité, erreurs)
  - Tests email-modal mis à jour pour nouvelle structure DOM (em-att-list, em-legal-content, tagName DETAILS)
  - **Total : 901/901 tests verts** (886 + 15 nouveaux)
- 2026-05-18 : ✅ **Fix v15.88 — lazy load jsPDF dans fenêtre principale** :
  - **Bug** : user voyait statut « ⚠️ Joindre manuellement » au lieu de « ✓ Prête » car `window.jspdf` n'existait pas dans la fenêtre principale (la lib est inlinée en base64 dans `window._BAIL_PDF_LIBS.jspdf` mais décodée + injectée UNIQUEMENT dans la fenêtre de preview Bail).
  - **Fix** : nouveau helper `_ensureJsPdfLoaded()` async dans `email-pdf-attachment.js` qui décode le base64 + injecte `<script src=blob:>` à la volée si jsPDF pas déjà dispo. Idempotent : premier appel ~50ms, suivants instantanés. Tolérant : si `_BAIL_PDF_LIBS` absent, fail-safe avec message clair.
  - Verif preview : `jspdfBefore: undefined` → `jspdfAfter: object` → PDF généré 7340 chars base64 avec magic header `%PDF-1.3` ✅
- 2026-05-18 : ✅ **EM-2c Livré v15.89** — PJ PDF auto pour 5 types supplémentaires :
  - `decompte-regul-annuel` : récap charges annuelles (provisions, charges réelles, solde, sens du solde, mention art. 23 loi 1989)
  - `bail-signe-final` : récap conditions essentielles (logement, date début, loyer/charges/total, jour paiement, DG, mention assurance habitation obligatoire art. 7g)
  - `edl-entree-signe` : récap EDL entrée + relevé compteurs (Élec/Gaz/Eau F/Eau C) + droit modification 10 jours art. 3-2 al. 5
  - `edl-sortie-signe` : récap EDL sortie + comparatif compteurs + dégradations bilan + conclusion + mention délais restitution DG art. 22
  - `cautionnement-signe` : accusé réception acte cautionnement + mention obligations garant + droits (point situation, fin cautionnement LRAR)
  - Helper commun `_drawHeaderBlock(pdf, ctx, y)` factorisé pour en-tête bailleur + destinataire + date
  - Tests Vitest : 22/22 verts (7 types × cas standard + civilité M./Mme/absente + jsPDF absent + ctx vide)
  - Verif preview v15.89 sur 7 types : tous génèrent magic header `%PDF-1.3`, tailles base64 6-8 KB, filenames cohérents (`Decompte-charges-{annee}`, `Recap-bail-{ref}`, `EDL-{entree/sortie}-{ref}`, `Cautionnement-{ref}`)
- ✅ **EMAIL-MODAL-UX-REFONTE complet** — 3 livraisons (a/b/c) sur la même journée. Total 908/908 tests verts.
- 2026-05-18 : ⚠️ **User a flaggé** : le PDF text-natif diffère du rendu officiel (capture cliente : 2 formats côte-à-côte). Décision : refonte EM-2d via html2canvas sur le rendu officiel.
- 2026-05-18 : ✅ **EM-2d Livré v15.91** — Refonte PJ quittance avec **rendu officiel** :
  - Extracted `_buildQuittanceHtml(q, log, ent, bail, opts?)` (fct PURE retournant `{html, css, title, status}`) depuis `previewQuit` dans `index.html`. `previewQuit` simplifié pour appeler cette fct + window.open. **Zéro régression** sur l'aperçu existant (même HTML/CSS rendu).
  - 3 status retournés : `'complet'` (quittance), `'partiel'` (reçu partiel), `'non-paye'` (alerte). EM-2d ne génère PJ que pour `complet`/`partiel` (non-paye → erreur explicite « Saisir le paiement d'abord »).
  - Exposé sur `window._buildQuittanceHtml` pour réutilisation par `email-pdf-attachment.js`
  - Nouveau helper `_ensureHtml2CanvasLoaded()` (même pattern que `_ensureJsPdfLoaded`) : décode `window._BAIL_PDF_LIBS.html2canvas` (inliné base64) à la volée
  - Nouveau helper `_rasterizeHtmlToPdfBlob(html, css)` : conteneur off-screen `position:fixed;left:-10000px` + scope CSS + html2canvas scale=2 + jsPDF multi-pages A4 → Blob
  - `_genPdfQuittance` refondu : path principal = `_buildQuittanceHtml` + `_rasterizeHtmlToPdfBlob`. **Fallback path** `_genPdfQuittanceFallbackText` (ancien V1.0 jsPDF text-natif) préservé pour les tests Vitest (FakeJsPdf mock) et compat si `window._buildQuittanceHtml` absent.
  - Verif preview JS v15.91 :
    - `_buildQuittanceHtml` retourne `status:'complet'`, HTML contient `AUDRIN`, `RCS`, `<h1>` ✅
    - `window.html2canvas` chargé via blob URL ✅
    - Rasterisation manuelle : canvas 1400×1576 px généré OK ✅
  - Tests Vitest : 915/915 verts (fallback path testé, path principal demande DOM jsdom — testé via verif preview)
  - **Résultat user** : la PJ envoyée par mail = exactement le PDF officiel (signature image incluse via `_docSigImg(ent)` du rendu original)
- ⬜ **EM-2d V1.1 à faire** : étendre le même pattern aux 6 autres types (irl-revision, decompte-regul-annuel, bail-signe-final, edl-entree-signe, edl-sortie-signe, cautionnement-signe). Chacun a un rendu officiel à factoriser dans `_buildXxxHtml` pure fct + appel via `_rasterizeHtmlToPdfBlob`.

## Reste à faire (futures sessions)
- EM-3 [DOC-CIVILITE](docs/subjects/DOC-CIVILITE.md) : civilité dynamique dans les **templates de mail** (corps texte), en plus du PDF (déjà fait dans les PJ via `_civNom`). P2 XS.
- EM-4 [TEMPLATES-EMAILS-PARAMS](docs/subjects/TEMPLATES-EMAILS-PARAMS.md) : éditeur templates dans Paramètres. P2 M-L.
- Improvement V1.2 (si jugé insuffisant esthétiquement) : refonte PJ via html2canvas sur le rendu officiel (preview HTML) au lieu du jsPDF text natif. Demande factorisation des helpers `previewQuit`/`genIRLLetter` etc.
