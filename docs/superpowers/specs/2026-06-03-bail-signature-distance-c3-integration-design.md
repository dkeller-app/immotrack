# BAIL-SIGNATURE-DISTANCE — Composant 3 : intégration in-app (design)

> **Sujet parent** : `docs/subjects/BAIL-SIGNATURE-DISTANCE.md`
> **Composant 1** (relais Cloudflare) : LIVRÉ + DÉPLOYÉ — `docs/superpowers/plans/2026-06-02-bail-signature-relais.md`
> **Composant 2** (`sign.html` wizard autonome) : LIVRÉ + audité + validé téléphone — `docs/superpowers/plans/2026-06-02-bail-sign-html-wizard.md`
> **Composant 3** (ce document) : intégration dans l'app ImmoTrack — design validé 2026-06-03, à planifier.
> **Stratégie persistance** : `docs/superpowers/specs/2026-06-04-strategie-persistance-multitenant-design.md` — D2/D6 actent le passage de Google Drive à **Supabase Storage** ; **D12** cadre le relais Cloudflare comme **ingress éphémère** dont l'artefact (PDF signé) est **ingéré dans le magasin de référence de l'app** puis **supprimé du relais**. C3 est construit avec une **couture d'archivage** (§3.4) pour que le swap Drive→Supabase soit confiné à une seule fonction (philosophie strangler D5/P1).
> **Gate de revue ratifié 2026-06-04** : (1) emails de chaînage = limite assumée + relance manuelle ; (2) certificat de preuve = **fichier PDF séparé** ; (3) bailleur in-app + locataires/garants à distance avec toggle présentiel par signataire. **Choix C confirmé** : livrer C3 maintenant sur le store actuel (Drive) derrière la couture, + DELETE relais post-ingestion (D12) + `signatureSource:'immotrack'` + hash de contenu dès maintenant.

**Date** : 2026-06-03 (mis à jour 2026-06-04 : couture d'archivage + D12)
**Base** : branche `bail-sign-c3` depuis `main` (v15.250) — worktree `C:\Users\Did_K\Desktop\Immo-bail-sign-c3`
**Mockup validé** : `mockups/bail-signature-distance-c3/c3-envoi-signature.html` (responsive PC/tablette/téléphone, variante B retenue)

---

## 1. Objectif

Permettre à un bailleur ImmoTrack d'**envoyer un bail en signature électronique à distance** avec un aller-retour **entièrement automatique** : l'app crée une session sur le relais, envoie les emails aux signataires, détecte le retour par polling, récupère le PDF signé + génère un certificat de preuve, archive le tout sur Drive et verrouille le bail.

Le flux **présentiel existant** (« ✍️ Le locataire signe » in-app) reste **inchangé et coexiste** — on ajoute un second chemin, on ne touche pas au premier.

**Principe non négociable rappelé** : « je veux une vraie solution, pas juste on envoie un PDF et débrouille-toi ». L'automatisme du retour (download + certificat + Drive + verrouillage + chaînage) est le cœur de la valeur.

---

## 2. Modèle de signature (décisions verrouillées)

- **Bailleur (si gestion) + locataire(s) à distance**, chaînés par l'app via le relais.
- **Cas propriétaire-occupant / bailleur en gestion** : le bailleur signe **in-app** (flux Phase 2 existant, paraphes + signature finale) → le PDF part déjà tamponné côté bailleur. Le **manifeste ne porte des ancres que pour les signataires à distance** (locataires, garants).
- **Ordre** : position dans le tableau des signataires = ordre de chaînage. Le relais sert un signataire à la fois ; l'app déclenche l'email du suivant quand le polling détecte que le précédent a signé.
- **On ne confond jamais signature et paraphe** (règle gravée) : le manifeste distingue `kind:'paraphe'` (bas de page, toutes pages sauf signature) et `kind:'signature'` (bloc final avec mention « Lu et approuvé »).

---

## 3. Architecture & flux (Part A — approuvée)

### 3.1 Émission (depuis l'app)

```
[Bailleur] clique 📨 « Envoyer en signature » sur le bail (carte logement)
   │
   ▼
[Modale variante B — récap + confirmation]
   • liste des signataires à distance (locataires + garants), emails éditables
   • toggles ordre / présentiel par signataire
   • étape 2 : aperçu des emails qui partent → bouton « Confirmer l'envoi »
   │
   ▼
[App] genPDFNative INSTRUMENTÉ → capture les rectangles des signataires à distance
   │
   ▼
[App] post-traitement pdf-lib → embarque le manifeste (ancres en points, Y-flip)
   │
   ▼
[App] POST /sessions (Bearer APP_KEY, multipart : pdf signé-bailleur + meta)
   ← { sessionId, signUrl, ownerToken }
   │
   ▼
[App] stocke bail.signatures.remoteSession ; envoie email signataire 1 (Gmail)
   │
   ▼
[bail.signatures.remoteSession.status = 'sent'] ; badge « 📨 En attente »
```

### 3.2 Retour (boucle automatique)

```
[Déclencheurs polling] : au boot de l'app + à l'ouverture d'une fiche logement (throttle 30 s)
   │
   ▼
[App] GET /api/sessions/:id (X-Owner-Token) → état de la session
   │
   ├── signataire intermédiaire signé → envoie email signataire N+1 ; badge « 📨 1/2 signé »
   │
   └── dernier signataire signé (session 'completed') :
         • GET /api/sessions/:id/result (X-Owner-Token) → PDF signé final
         • génère le CERTIFICAT DE PREUVE PDF (lisible) depuis les données de preuve
         • calcule le hash de contenu (SHA-256) du PDF signé final
         • _ingestSignedBailArtifacts(pdfBlob, certBlob, bail, proof) — COUTURE (§3.4) :
              archive PDF signé + certificat dans le store de référence (aujourd'hui Drive ×2)
              + écrit bail.signatures (mode 'distance', signedAt, signatureSource:'immotrack',
                contentHash, refs d'archivage, preuve par-signataire) + verrouille le bail
         • DELETE /api/sessions/:id (X-Owner-Token) — purge relais post-ingestion (D12),
              une fois l'archivage confirmé (ne pas dépendre du seul TTL 14 j) ; échec non bloquant
         • toast + badge 🔒
```

### 3.3 Machine à états (`bail.signatures.remoteSession.status`)

```
draft → sent → chaining → completed
                       ↘ error / expired
```

- `sent` : session créée, signataire 1 notifié, aucun retour.
- `chaining` : ≥1 signataire a signé, il en reste.
- `completed` : tous signés, PDF final + certificat archivés, bail verrouillé.
- `error` / `expired` : session relais en erreur ou TTL 14 j dépassé → badge d'alerte + action « Relancer / Recréer ».

### 3.4 Couture d'archivage (store de référence) — alignement D12

**Problème** : la stratégie persistance (`2026-06-04-strategie-persistance-multitenant-design.md`) acte le passage de Google Drive à **Supabase Storage** (D6) et cadre le relais comme **ingress éphémère** dont l'artefact est ingéré dans le magasin de référence puis purgé (D12). C3 est livré **aujourd'hui sur Drive**, mais la migration ne doit pas le réécrire.

**Solution (Choix C)** : tout l'archivage des artefacts signés passe par **une seule fonction de couture** `_ingestSignedBailArtifacts`. C'est le **seul point de couplage au store** dans tout C3. Le jour de la migration (P1/strangler), on réimplémente cette fonction pour viser Supabase Storage au lieu de Drive — **aucun autre site de C3 ne change**.

```js
/**
 * Couture d'archivage des artefacts d'un bail signé à distance.
 * SEUL point de couplage au store de référence dans C3.
 * Aujourd'hui : Google Drive (uploadBailPDFToDrive ×2).
 * Demain (D6/P1) : Supabase Storage — réimplémenter CE corps uniquement.
 *
 * @param {Blob}   pdfBlob   PDF signé final (toutes signatures tamponnées)
 * @param {Blob}   certBlob  Certificat de preuve PDF (fichier séparé)
 * @param {object} bail      Objet bail (pour nommage / dossier cible)
 * @param {object} proof     Données de preuve par signataire (pour le manifeste d'archivage)
 * @returns {Promise<{ pdfRef, certRef }>}  Références opaques au store
 *          (aujourd'hui { driveFileId, driveWebViewLink } ; demain { storagePath, signedUrl }).
 *          Le code appelant ne doit JAMAIS supposer la forme interne — il stocke ce qui revient.
 */
async function _ingestSignedBailArtifacts(pdfBlob, certBlob, bail, proof) {
  // — Implémentation actuelle (Drive) —
  const pdfRef  = await uploadBailPDFToDrive(pdfBlob,  `bail-${bail.ref}-signe.pdf`);
  const certRef = await uploadBailPDFToDrive(certBlob, `bail-${bail.ref}-certificat.pdf`);
  return { pdfRef, certRef };
  // — Implémentation future (Supabase Storage) : upload bucket privé + RLS, renvoyer storagePath —
}
```

**Invariants de la couture** :
- **Idempotence cible** : ré-ingestion d'un bail déjà archivé ne duplique pas (clé = `bail.ref` + `contentHash`). En Drive aujourd'hui, on tolère un doublon en cas de double-poll concurrent (rare, throttle 30 s) ; en Supabase, `upsert` sur le chemin.
- **Références opaques** : l'appelant stocke `pdfRef`/`certRef` tels quels dans `bail.signatures` (cf §9.2) sans inspecter leur forme → le swap de store ne casse pas le modèle de données.
- **Pas d'effet de bord UI** : la couture archive et renvoie, point. Toast/badge/verrouillage restent dans la boucle de retour (§3.2).

---

## 4. Génération PDF + manifeste (Part B — approuvée, risque technique #1)

### 4.1 Contrainte

`genPDFNative` n'est **pas** une fonction normale : c'est du JS sérialisé en string injecté dans une popup par `previewBailData()`. Il utilise **jsPDF** (millimètres, A4, **pas** pdf-lib) + rasterisation pdf.js. Les coordonnées des blocs signature sont calculées à la volée et **jamais exportées**. Aucun manifeste nulle part dans `index.html`.

Fonctions de placement (réutilisables, noms stables ; lignes à re-vérifier contre v15.250) :
- `PDF_NATIVE.drawSignatureBlock(pdf,img,role,x,y,90,30,luApprouve)`
- `PDF_NATIVE.drawLocataireSignaturePlaceholder(...)`
- `PDF_NATIVE.drawParaphesFooter(...)`
- `buildBailStructure(bail,log,ref,ent,locs)` — réutilisable pour reconstruire la structure.

### 4.2 Approche retenue : ① instrumenter jsPDF + post-traiter pdf-lib

1. **Instrumenter** les fonctions de placement (`drawLocataireSignaturePlaceholder`, paraphes des signataires à distance) pour qu'elles **poussent** chaque rectangle dans un accumulateur `__SIGN_ANCHORS__` (en mm jsPDF) au moment du dessin, avec `sigId`, `kind`, `page`, `x`, `y`, `w`, `h`, `luApprouve?`. Aucune coordonnée n'est devinée a posteriori — on capture ce que jsPDF dessine réellement.
2. **Convertir** mm → points pdf-lib via un **module pur testé unitairement** (`coords`).
3. **Post-traiter** le blob jsPDF avec **pdf-lib** pour embarquer le manifeste (réutilise `manifest.js` du composant relais/sign.html).

### 4.3 Module de conversion (pur, testé)

```
k = 72 / 25.4 ≈ 2.8346456693
x_pt   = x · k
w_pt   = w · k
h_pt   = h · k
y_bas  = 841.89 − (y_haut + h) · k        // A4 = 595.28 × 841.89 pt, origine pdf-lib bas-gauche
```

Cas de référence (issus de l'e2e composant 2) à reproduire en test :
- paraphe : `{ x:15, y:279.5, w:70, h:14 }`
- signature : `{ x:15, y:210, w:90, h:30 }`

### 4.4 Format manifeste (figé, partagé avec sign.html)

```json
{
  "v": 1,
  "totalPages": <int>,
  "anchors": [
    { "sigId": "<id>", "kind": "paraphe|signature", "page": <int>,
      "x": <pt>, "y": <pt>, "w": <pt>, "h": <pt>, "luApprouve": <bool?> }
  ]
}
```

Ancres en **points pdf-lib** (origine bas-gauche). `sign.html` lit ce manifeste pour tamponner. **Seuls les signataires à distance** ont des ancres ; le bailleur est déjà signé en dur dans le PDF.

---

## 5. UI (Part C — mockup validé, variante B)

Référence : `mockups/bail-signature-distance-c3/c3-envoi-signature.html`. Fidèle au design system v15.250 (tokens `:root`, classes `.ov`/`.modal`/`.m-head`/`.btn .bp/.bs/.br/.bg/.bb`/`.inp`/`.fg`, toast `showToast`, badges, `.loc-card-row-b`, `.bail-signed-badge`).

### 5.1 Carte logement — point d'entrée (v15.250)

Le bouton 📨 « Envoyer en signature » s'ajoute **à côté** du bouton présentiel existant « ✍️ Le locataire signe » (`previewBailLocataireRef(ref)`, rendu lignes ~14947 et ~35131 en v15.250, conditionné à l'état du bail). **4 états de badge** :

| État | Badge | Condition |
|---|---|---|
| Pas envoyé | bouton 📨 « Envoyer en signature » | pas de `remoteSession` |
| En attente | « 📨 En attente » | `status='sent'` |
| Chaînage | « 📨 1/2 signé » | `status='chaining'` |
| Signé | 🔒 plein largeur + liens Drive + certificat (`.bail-signed-badge`) | `status='completed'` |

### 5.2 Modale d'envoi — variante B (récap + confirmation)

- **Étape 1** : liste des signataires à distance, emails éditables inline (`.inp`), toggles ordre + présentiel par signataire, états d'erreur si email manquant.
- **Étape 2** : aperçu des emails qui vont partir (à qui, dans quel ordre) → bouton « Confirmer l'envoi ». Rassure avant l'action irréversible.
- **Modale config manquante** : si relais ou APP_KEY non réglés → invite à aller dans Réglages.

### 5.3 Réglages

Champs `DB.params.bailSignRelayUrl` (URL relais) + `DB.params.bailSignAppKey` (champ password). Aucun stockage de secret applicatif n'existe aujourd'hui → à créer (minimal).

---

## 6. Boucle de retour — détails (Part D.1 — approuvée)

- **Polling au boot** : pour chaque bail avec `remoteSession.status ∈ {sent, chaining}`, `GET /api/sessions/:id` (X-Owner-Token).
- **Polling à l'ouverture fiche logement** : ciblé sur les baux du logement, throttle 30 s (pattern `_drvLazyScanLogement`).
- **Dernier signataire** → download `/result`, certificat, Drive ×2, écriture preuve, verrouillage, toast 🔒.
- **Signataire intermédiaire** → email N+1 (`_emailSendViaGmail` + template `bail-pret-a-signer`, scope `gmail.send` à la demande).
- **Limite assumée + filet** : le relais n'a **pas** de SMTP → l'email du maillon suivant ne part **que quand l'app est ouverte et poll**. Filet : bouton 🔔 « Relancer » manuel sur le badge (mocké).

---

## 7. Configuration & sécurité (Part D.2 — approuvée)

- **Repo PUBLIC** → APP_KEY jamais en dur. Saisie via UI Réglages → `DB.params.bailSignAppKey`. L'APP_KEY ne sert **qu'à créer** la session.
- **`ownerToken` par session** (retourné par `POST /sessions`) stocké dans `bail.signatures.remoteSession.ownerToken` → autorise polling/result. C'est lui, pas l'APP_KEY, qui sécurise le suivi.
- **Jamais de secret dans une URL ou un log** (règle gravée).
- L'APP_KEY de prod est dans `relay/.prod.vars` (gitignoré, jamais commité) côté relais ; côté app elle est saisie par l'utilisateur.

---

## 8. CORS sur le relais (Part D.3 — changement requis, hors branche bail-sign-c3)

Le relais est conçu same-origin. L'app appelle cross-origin avec headers custom (`Authorization`, `X-Owner-Token`) → **déclenche un preflight CORS**. Sans correctif, **tous les appels app→relais échouent**.

→ Ajout côté relais : `Access-Control-Allow-Origin` pour `https://didierkeller.github.io`, `http://localhost:*`, `null` (file://), gestion `OPTIONS` preflight + headers autorisés (`Authorization`, `X-Owner-Token`, `Content-Type`).

**Logistique** : ce changement vit sur la branche **`relay-bail-sign`** (où le relais est déployé), **pas** sur `bail-sign-c3`. Il implique un **redéploiement du Worker** (`npx wrangler deploy`). À séquencer dans le plan comme une tâche relais distincte.

### 8.1 Nouvel endpoint `DELETE /api/sessions/:id` (D12 — à AJOUTER côté relais)

D12 cadre le relais comme **ingress éphémère** : une fois l'artefact ingéré dans le store de référence (§3.4), l'app doit pouvoir **purger la session du relais** sans attendre le seul TTL 14 j. Le contrat actuel n'a **aucun endpoint de suppression** → à ajouter :

- `DELETE /api/sessions/:id` — `X-Owner-Token` → supprime la clé KV (`SESSIONS_KV.delete`) → `204`. 404-tolérant (déjà purgée / TTL expiré = succès idempotent).
- Même branche `relay-bail-sign`, même redéploiement que le CORS (une seule passe Worker).
- **Appel côté app = best-effort non bloquant** : si le DELETE échoue (réseau, 404, 5xx), on **n'annule pas** l'archivage déjà fait ; le TTL 14 j reste le filet. On log discrètement, on ne bloque pas le verrouillage du bail.

---

## 9. Modèle de données

### 9.1 `bail.signatures.remoteSession` (nouveau)

```js
remoteSession: {
  sessionId,            // id relais
  signUrl,              // URL /s/:id (pour relance manuelle / copier-coller)
  ownerToken,           // suivi/result (secret par session)
  relayUrl,             // snapshot de l'URL relais utilisée
  status,               // 'draft'|'sent'|'chaining'|'completed'|'error'|'expired'
  createdAt,
  signers: [            // ordre = ordre de chaînage
    { sigId, role, nom, email, distant:true|false, signedAt:null|ISO, notifiedAt:null|ISO }
  ],
  lastPolledAt
}
```

### 9.2 `bail.signatures` à la complétion (existant, enrichi)

```js
bail.signatures = {
  // … champs existants du flux présentiel (paraphes/finales/luApprouveBy) …
  mode: 'distance',              // distingue du présentiel ('inapp')
  signedAt,                      // ISO de complétion (dernier signataire)
  signatureSource: 'immotrack',  // NOUVEAU (D12/§9 stratégie) : provenance de la preuve.
                                 //   'immotrack' = signé via notre relais ; 'externe' = importé/autre.
                                 //   Anticipe le champ Postgres signature_source de la migration.
  contentHash,                   // NOUVEAU : SHA-256 du PDF signé final (hex).
                                 //   Sceau d'intégrité ; servira le trigger d'immuabilité Postgres (§9 stratégie).
  pdfRef,                        // ref OPAQUE du store (couture §3.4). Aujourd'hui { driveFileId, driveWebViewLink }.
  certRef,                       // idem pour le certificat de preuve (fichier séparé).
  proof: [                       // preuve par signataire
    { sigId, role, nom, email, emailVerifiedAt, signedAt, ip, sigHash }
  ],
  locked: true                   // verrou légal (bail signé immuable)
}
```

- **`signatureSource` + `contentHash` sont posés dès maintenant** (pas attendre la migration) : ils n'ont aucun coût côté Drive et garantissent que les baux signés en C3 sont **prêts pour le trigger d'immuabilité Postgres** sans reprise de données.
- **`pdfRef`/`certRef` remplacent les ex-`driveFileId`/`driveFileIdCertificat` en clair** : ce sont des références **opaques** renvoyées par la couture (§3.4), pour que le swap Drive→Supabase ne touche pas le modèle. Réutilise le pattern existant (`driveWebViewLink` est porté à l'intérieur de `pdfRef` en mode Drive).

### 9.3 `DB.params` (nouveau)

`bailSignRelayUrl`, `bailSignAppKey`.

---

## 10. Contrat relais (figé — ne pas modifier côté c3)

- `POST /sessions` — `Authorization: Bearer <APP_KEY>`, multipart (`pdf` + `meta`) → `{ sessionId, signUrl, ownerToken }`
- `GET /s/:id` — page de signature (injecte `window.__SIGN_TOKEN__`)
- `GET /api/sessions/:id/pdf` — `X-Sign-Token`
- `POST /api/sessions/:id/signed` — `X-Sign-Token` + `X-Sign-Proof`
- `POST /api/sessions/:id/verify-email`
- `GET /api/sessions/:id` — `X-Owner-Token` (état)
- `GET /api/sessions/:id/result` — `X-Owner-Token` (PDF signé final)
- `DELETE /api/sessions/:id` — `X-Owner-Token` → purge KV post-ingestion (D12). **À AJOUTER** (branche `relay-bail-sign`, cf §8.1). N'existe pas dans le contrat figé actuel.
- `GET /health`

Stockage relais : KV (`SESSIONS_KV`), TTL 14 j, métadonnées + PDF. Pas de SMTP côté relais (emails envoyés par l'app via Gmail). Avec D12, le relais ne **conserve plus** l'artefact comme source de vérité : il est éphémère (purge explicite via DELETE, TTL comme filet).

---

## 11. Tests & audit (Part D.4 — approuvée)

- **Module `coords`** (mm → points + Y-flip) : module pur, **tests unitaires** (Vitest), cas de référence §4.3. C'est le risque technique #1.
- **Module `manifest`** (embarquage pdf-lib) : réutilise/aligne sur celui du relais ; tests d'invariants (round-trip ancres).
- **Génération certificat de preuve** : test de présence des champs obligatoires (signataires, horodatages, email vérifié, hash).
- **Tests relais CORS** (sur branche relay-bail-sign) : preflight `OPTIONS`, headers autorisés, origines.
- **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant tout commit final touchant le PDF/bail légal (règle gravée `feedback_audits_par_agents.md`). Mes audits propres ne suffisent jamais sur ce sujet sensible.

---

## 12. Logistique de branche (Part D.5 — tranchée)

- **Composant 3 (edits `index.html` + modules app + mockup + spec/plan)** : branche **`bail-sign-c3`** depuis `main` (v15.250). Worktree `C:\Users\Did_K\Desktop\Immo-bail-sign-c3`.
- **Changement CORS relais** : branche **`relay-bail-sign`** + redéploiement Worker (tâche distincte).
- Les numéros de ligne du map v15.249 sont **périmés** (MODALE-LOGEMENT-CONSOLIDATION a ajouté ~660 lignes) → **re-ancrer contre v15.250** au writing-plans. Noms de fonctions stables ; ancres confirmées : `previewBailLocataireRef`, boutons signature ~14947 / ~35131.

---

## 13. Discipline (règles gravées applicables)

1. **Mockup-first** : mockup validé (variante B) AVANT code — fait.
2. **Sandbox-first** : modif dans `index-test.html` d'abord, sync `index.html` après « OK » user. **Exception captée** : la version test n'a pas Drive → test réel du retour en prod `index.html` (sandbox pour l'UI émission, prod pour l'aller-retour Drive).
3. **Audit code-reviewer obligatoire** avant commit final (PDF bail légal opposable).
4. **Bump versions 5 endroits** (title, em footer, label ImmoTrack v, `IMMOTRACK_VERSION`, `sw.js CACHE_VER` + cache buster si CSS).
5. **BACKLOG en temps réel** après chaque livraison.
6. **Stage par fichier nommé** (jamais `git add -A`/`.`).
7. **Ne pas entrer en collision** avec la session parallèle active sur `main` (acte-extract / bail-repris / candidature) — d'où la branche dédiée.

---

## 14. Hors scope

- Webhook/push serveur→app (le relais n'a pas de SMTP ni de push ; polling app-side assumé + relance manuelle).
- Signature qualifiée eIDAS niveau avancé/qualifié (on reste en signature simple horodatée + preuve, conforme à l'usage bail courant).
- Refonte du flux présentiel existant (intouché).
- Tout redesign hors carte logement / modale d'envoi / réglages.
- **Migration Drive → Supabase Storage** (D6) : hors scope C3. C3 ne fait que **préparer le terrain** via la couture §3.4 + `signatureSource`/`contentHash`. Le swap réel est un livrable de la roadmap persistance (P1/strangler).
- **Durcissement auth relais** (APP_KEY → token ID Supabase, D12) : hors scope C3. On garde l'APP_KEY aujourd'hui ; le passage au token ID viendra avec le backend Supabase.

---

## 15. Risques

| Risque | Mitigation |
|---|---|
| Conversion mm→pt fausse (ancres décalées) | Module pur testé unitairement + cas de référence e2e (#1) |
| `genPDFNative` en string popup → instrumentation fragile | Capturer au dessin (push dans accumulateur), pas de re-calcul ; test de non-régression du PDF présentiel |
| CORS oublié → tous les appels échouent | Tâche relais dédiée + redéploiement, testée avant câblage app |
| Email N+1 jamais envoyé (app fermée) | Limite assumée + bouton 🔔 « Relancer » manuel |
| APP_KEY exposée (repo public) | Saisie utilisateur dans `DB.params`, jamais en dur, jamais loggée |
| `main` bouge sous la branche (session parallèle) | Branche dédiée off un HEAD stable v15.250 ; rebase au merge |
| Retrait de Drive (migration Supabase) réécrirait C3 | Couture §3.4 : tout l'archivage passe par `_ingestSignedBailArtifacts` (1 seul point) ; `signatureSource`/`contentHash` posés dès maintenant → migration confinée, pas de reprise de données |
| `DELETE /api/sessions/:id` pas encore déployé au câblage app | Appel best-effort 404-tolérant non bloquant ; TTL 14 j comme filet ; endpoint relais séquencé AVANT le câblage du DELETE app (plan) |
