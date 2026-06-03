# BAIL-SIGNATURE-DISTANCE — Signature de bail à distance (relais maison + crochet eIDAS)

**Status** : 🔄 Design consolidé V2 livré 2026-06-02 · attend validation user du spec avant implémentation
**Prio** : P1 · **Taille V1** : L (~10-14h, dont relais Cloudflare neuf)
**Détecté** : 2026-05-29 · **Refonte du design** : 2026-06-02 (abandon de l'approche URL + retour manuel)
**Consolide** : ce sujet **fusionne et remplace** [SIGN-BAIL-LIEN](SIGN-BAIL-LIEN.md) (approche Yousign, 2026-05-18). Les deux sujets visaient la même feature et n'avaient jamais été réconciliés.
**Lié à** : EMAIL-MODAL-UX-REFONTE (Gmail API) · DOC-PJ (dépôt Drive) · RGPD-COMPLIANCE (`docs/legal/RGPD-REGISTRE.md`) · graine du backend V2 multi-utilisateurs

---

## 1. Décision d'architecture (2026-06-02)

### Ce qui a été rejeté

Le design Session 1 (2026-05-29) proposait : bail compressé dans l'URL (fragment `#`) + retour par **re-téléchargement du PDF signé + email manuel + import DOC-PJ**.

> **Refus user 2026-06-02** : « je veux une vraie solution, pas juste on envoie un PDF et débrouille toi. Ça je peux déjà faire aujourd'hui sans optimisation. »

Le retour manuel est exactement la « solution passable » qu'on s'interdit ([[feedback_no_compromise]]). La valeur réelle = wizard en ligne **+ aller-retour 100 % automatique**.

### La contrainte incontournable

Une boucle vraiment automatique (le bail part, revient signé tout seul, atterrit dans le Drive du bailleur) **impose un composant serveur** : le navigateur du locataire n'a aucun droit d'écriture sur le Drive du bailleur, il ne peut donc rien renvoyer seul. Il n'existe pas de magie « zéro-backend » pour le retour. On assume donc un **mini-relais serverless** — qui est aussi la graine du backend V2 multi-utilisateurs.

### Approche retenue (sur 3 étudiées)

| # | Approche | Verdict |
|---|---|---|
| 1 | Relais maison (DIY, on le possède) | socle V1 |
| 2 | Prestataire eIDAS (Yousign…) porte le backend | trop cher en multi-tenant (free tier par compte) → premium |
| **3** | **Hybride : relais maison + crochet prestataire eIDAS** | ✅ **retenu** |

On construit le **relais maison natif** (tier gratuit illimité = le différenciant), avec une abstraction `SignatureProvider` propre pour brancher un prestataire **eIDAS qualifié** en option premium plus tard, sans refonte.

---

## 2. Décisions verrouillées

| Décision | Choix | Justification |
|---|---|---|
| **Posture** | Hybride : DIY natif maintenant + crochet eIDAS premium | Cible commerciale + free tier prestataire non-scalable en multi-tenant |
| **Hébergement relais** | **Cloudflare Worker + R2 + KV** | Free tier large (~500 baux/j), egress R2 gratuit, chiffrement au repos natif, maintenance ~nulle |
| **Domaine** | `*.workers.dev` pour l'instant | Pas encore de domaine custom. À migrer sur `sign.<domaine>` **avant commercialisation** |
| **Ordre de build** | Relais natif d'abord (crochet eIDAS stubé) | Livrer le socle gratuit/illimité = le différenciant, eIDAS premium ensuite |
| **Niveau juridique V1** | Signature simple visuelle (art. 1366 C. civ.) + faisceau de preuves | eIDAS « simple » n'apporte **aucune présomption** légale de plus (décret 2017-1416 : présomption réservée au **qualifié**). Même régime probatoire que le tracé maison |
| **OTP SMS** | **En option (cadré, non branché en V1)** | Champ téléphone + étape prévus dans le flow ; activation rapide ensuite. Le juriste le pose comme levier probatoire n°1, mais ajoute dépendance SMS + coût |
| **Crochet premium** | eIDAS **qualifié** (Yousign/Universign QTSP), pas « simple » | Seul niveau qui apporte la présomption de fiabilité (la vraie valeur ajoutée juridique) |
| **`sign.html`** | **Servi par le Worker** (pas GitHub Pages) | Même origine → zéro CORS, token injecté côté serveur (jamais dans l'URL) |
| **Multi-locataires** | Signataires **ordonnés** dans la session | Gère nativement bailleur→locataire(s) séquentiel, 1 PDF final unique |

---

## 3. Architecture technique

### 3 composants

| Composant | Rôle | Statut |
|---|---|---|
| **ImmoTrack** (l'app) | Crée la session, suit l'état, récupère le PDF signé dans le Drive | existant, à étendre |
| **Relais** Cloudflare | Worker (+ Hono) sans état : stocke la session + relaie le PDF signé. R2 = blobs PDF, KV = métadonnées | **à créer** |
| **`sign.html`** | Wizard de signature autonome, servi par le Worker, ouvert par lien sans compte | **à créer** (= Phase 2 existante extraite) |

### La « session de signature »

Au clic **« Envoyer pour signature »**, ImmoTrack génère le PDF (`genPDFNative`) et POST une session au relais :

```js
session = {
  sessionId,            // 256 bits aléatoires (crypto.getRandomValues), inguessable
  bailRef,              // ré-appariement au retour
  // PDF original stocké en R2 : original/<sessionId>.pdf (chiffré au repos AES-256 par défaut)
  signers: [            // ORDONNÉS → cas bailleur+locataire séquentiel
    { role:'bailleur',  emailHash, tel?:'', ordre:1, statut:'done' },   // si déjà signé in-app
    { role:'locataire', emailHash, tel?:'', ordre:2, statut:'pending' }
  ],
  currentIndex,         // signataire courant
  provider: 'native',   // 'native' (art.1366) | 'yousign-qualifie' | …  ← LE CROCHET
  expiresAt             // TTL 14j (KV expirationTtl) ; R2 lifecycle 15j
}
// + ownerToken (HMAC) pour le bailleur, signToken (HMAC) par signataire — jamais dans l'URL
```

### Routes du relais (Worker unique, routé par pathname)

```
POST /sessions                  (bailleur, auth APP_KEY)  → {sessionId, signUrl}
GET  /s/:sessionId              (locataire)               → sert sign.html (signToken injecté server-side)
GET  /api/sessions/:id/pdf      (locataire, signToken)    → PDF original à signer
POST /api/sessions/:id/signed   (locataire, signToken)    → write-back du PDF signé
GET  /api/sessions/:id          (bailleur, ownerToken)    → poll statut
GET  /api/sessions/:id/result   (bailleur, ownerToken)    → PDF signé final
```

- **R2** = blobs (`original/<id>.pdf`, `signed/<id>.pdf`). **KV** = métadonnée `session:<id>` (JSON léger).
- **Chiffrement** : R2 SSE AES-256-GCM par défaut (rien à coder). Pas de crypto applicative (risque de perte de clé > bénéfice).
- **Tokens HMAC** : `base64url({sid, role, idx, jti, exp}) + "." + HMAC-SHA256(payload, SIGNING_SECRET)`. Vérif temps-constant, `idx == currentIndex`, `jti` anti-rejeu. Secret via `wrangler secret put`.
- **Validation write-back** : Content-Type PDF, taille max (ex. 20 Mo), magic bytes `%PDF`.

### Flow automatique — cas locataire

```
BAILLEUR (ImmoTrack)          RELAIS (CF)          LOCATAIRE (navigateur)         RETOUR (auto)
1. "Envoyer"                                       
   genPDFNative()      ──POST /sessions──▶  R2+KV
   email Gmail API     ◀──{signUrl}──
        └─email lien───────────────────────▶ 2. GET /s/:id (sign.html)
                                                  Étape 1 : confirme email (=emailHash)
                                                  [Étape OTP SMS — cadrée, off en V1]
                                                  Étape 2 : lit le bail + paraphe/page
                                                  Étape 3 : signature + "lu et approuvé"
                                                  compose le PDF signé (jsPDF inliné)
                                            ◀─POST /signed (+signToken)─┘
                                  marque OK, currentIndex++
                                  (si signataire suivant → email auto)
3. poll au boot / ouverture ─GET /api/sessions/:id─▶ "completed"
   GET /result          ◀──PDF signé──
   uploadBailPDFToDrive() → Drive "baux"
   bail.signatures MAJ + _stamp + audit + toast + badge
   (relais purge à TTL)
```

### Cas bailleur + locataire (gestion B2B) — résolu nativement

Signataires **ordonnés** : `[bailleur(1), locataire(2)]`. Le bailleur signe via son lien → le relais déclenche **automatiquement** l'email au locataire → le locataire signe **par-dessus le même PDF** → **1 seul PDF bilatéral final**. C'est ce que les 2 anciens docs ne savaient pas faire sans backend.

---

## 4. `sign.html` = la Phase 2 existante, extraite

Découverte clé de l'audit code (2026-06-02) : **le wizard 2-phases bailleur→locataire existe déjà in-app**. `sign.html` n'invente rien, il **porte la Phase 2** en page autonome alimentée par le relais.

| Brique in-app | Emplacement | Réutilisation dans `sign.html` |
|---|---|---|
| Wizard relance locataire | `_wizV2Phase2=true`, `previewBailLocataireRef()` [index.html:15248](../../index.html) | Le wizard qu'on extrait : paraphes bailleur en lecture seule + signature locataire |
| Capture canvas | `_wizV2RenderFinal` (17741), `_wizV2CaptureCurrent` (17799), `_wizV2PersistSignatures` (17901) | Logique de capture paraphes/signature à porter |
| Modèle signatures | `_wizV2Paraphes[page][role]`, `_wizV2FinalSignatures[role]`, `_wizV2LuApprouveBy[role]`, `_wizV2Pages[]` | Format identique → réinjecté dans `genPDFNative` |
| Génération PDF | `genPDFNative()` [index.html:18434](../../index.html), drive sur `_BAIL_STRUCTURE` | Portée dans sign.html (compose le PDF signé côté navigateur) |
| jsPDF inliné | `_BAIL_PDF_LIBS` base64 [index.html:8](../../index.html) | Ré-inliné dans sign.html (autonome) |
| Structure `bail.signatures` | construction [index.html:18005-18016](../../index.html) : `paraphes/finales/luApprouveBy/mode/signedBailleurAt/signedLocataireAt/totalPages/bailSnapshot` | Le retour relais remplit la branche `locataire` de cette structure |

Conséquence : on **porte** un wizard éprouvé, on n'en conçoit pas un nouveau → build dé-risqué.

---

## 5. Cadre juridique (analyse 2026-06-02)

- **Le bail d'habitation (loi 89-462, art. 3) doit être écrit, pas manuscrit** → signature électronique admise (loi ELAN 2018).
- **Art. 1366 + 1367 C. civ.** : l'écrit électronique a la même force probante que le papier *si* la personne est dûment identifiée et l'intégrité garantie. La fiabilité n'est **présumée** que pour l'eIDAS **qualifié** (décret 2017-1416).
- **Point central** : eIDAS « simple » (et même « avancé ») = **même régime probatoire** que le tracé canvas maison. La seule différence est la **qualité du dossier de preuve**. → le DIY est pleinement défendable ; le crochet premium doit viser le **qualifié** (la seule vraie valeur ajoutée).
- **Jurisprudence** : CA Chambéry 2018 (simple validée *grâce à* un bon fichier de preuve) ; CA Amiens 2025 (simple rejetée faute de preuves). Risque faible **si le dossier de preuve est solide**.
- **Concurrents** : Rentila (payant via Oodrive), BailFacile (illimité inclus), Qalimo (DocuSign/Yousign) — tous au niveau « simple ».

### Dossier de preuve à capturer (immuable, scellé)

À journaliser et figer dans un **certificat de preuve** (PDF horodaté, joint au bail signé) :
1. Identité affirmée (nom, email ; n° pièce d'identité optionnel).
2. Preuve du contrôle de l'email : lien unique + clic horodaté. *(OTP SMS = upgrade « avancé » de fait — cadré, off en V1.)*
3. Horodatage de chaque étape (ouverture, lecture, tracé, validation).
4. IP + user-agent à chaque action.
5. **Hash SHA-256 du PDF figé** au moment de la signature.
6. Acte de volonté explicite : case « je reconnais signer le bail [adresse] ».
7. Audit trail exporté, archivé (réutilise `js/core/audit-trail.js` via `_auditEntry`).
8. Consentement préalable au procédé électronique.

### À documenter produit
Mention honnête CGU/UI : signature simple, valeur probante reposant sur le faisceau de preuves, **sans présomption légale**. Option premium eIDAS qualifié pour les bailleurs averses au risque.

---

## 6. Sécurité & RGPD

- `sessionId` inguessable (256 bits) + **vérif email** à l'ouverture (anti-transfert).
- Tokens HMAC (jamais dans l'URL, injectés server-side), vérif temps-constant, anti-rejeu.
- PDF chiffré au repos (R2 SSE), **TTL court + purge auto**.
- Le relais devient **sous-traitant RGPD** → MAJ `docs/legal/RGPD-REGISTRE.md` + note DPA (le bail contient noms/adresses).
- CORS : sign.html same-origin (servi par Worker) → idéalement aucun CORS. Si cross-origin un jour : origine exacte en liste blanche, jamais `*`, pas de credentials.
- **Audit obligatoire par agent `superpowers:code-reviewer` avant livraison** (sujet sensible légal — [[feedback_audits_par_agents]]).

---

## 7. Crochet eIDAS qualifié (premium, différé)

Champ `provider` + adaptateur côté relais :
- `'native'` → relais sert sign.html, signature canvas, art. 1366 (gratuit illimité).
- `'yousign-qualifie'` (ou Universign/Docaposte QTSP) → relais appelle l'API prestataire, renvoie le lien du prestataire, normalise le retour dans la **même** forme de session.

ImmoTrack reste agnostique (mêmes appels créer/poll/récupérer). Les users premium passent en provider qualifié. Free tier prestataire = **par compte** → inadapté multi-tenant → modèle facturé à l'acte ou inclus au tier premium.

---

## 8. Plan d'exécution

### Phase 0 — Spec + validation user (~en cours)
- [x] Audit 3 agents (code / archi Cloudflare / juridique)
- [x] Design consolidé V2
- [ ] Validation user du spec

### Phase 1 — Relais Cloudflare natif (~4-5h) — ✅ LIVRÉ + DÉPLOYÉ 2026-06-03
- [x] Worker + Hono, routes, binding **KV uniquement** (`wrangler`) — R2 abandonné (carte bancaire), PDF dans KV
- [x] Modèle session + tokens HMAC (Web Crypto) + TTL + lifecycle KV (TTL 14 j symétrique)
- [x] Validation write-back (magic bytes, taille, Content-Type)
- [x] Tests : génération/vérif token, machine d'état signataires ordonnés, expiration
- [x] **Déployé** : `https://bail-sign-relay.didierkeller.workers.dev` + secrets prod + smoke test 5/5

### Phase 2 — `sign.html` autonome (~3-4h)
- [ ] Extraire le wizard Phase 2 (`_wizV2*`) en page autonome + jsPDF inliné
- [ ] Étape 1 vérif email ; étape OTP **cadrée mais désactivée** ; étapes paraphes + signature finale
- [ ] Compose le PDF signé (`genPDFNative` portée) + POST /signed
- [ ] Capture du dossier de preuve (horodatage, IP/UA, hash SHA-256, acte de volonté)
- [ ] Responsive 3 formats + canvas tactile (touch targets ≥ 44px)

### Phase 3 — Intégration ImmoTrack (~3-4h)
- [ ] Bouton « Envoyer pour signature » dans la fiche bail → POST /sessions + `genPDFNative`
- [ ] Modale destinataires (locataire(s) ordonnés ; bailleur si gestion)
- [ ] Email via `_openCommsHub` / `EMAIL_HUB_CATALOG` (nouveau template `bail-signature-distance`) + `_emailSendViaGmail`
- [ ] Poll au boot / ouverture fiche (greffé sur `_drvLazyScanLogement`) → GET statut → GET result → `uploadBailPDFToDrive` → `bail.signatures.locataire` + `_stamp` + `_auditEntry` + toast/badge
- [ ] Certificat de preuve joint, archivé Drive
- [ ] MAJ `RGPD-REGISTRE.md`
- [ ] **Audit agent code-reviewer** + bump versions + sync sandbox→prod après OK user

### Phase 4 (différé) — OTP SMS + crochet eIDAS qualifié premium
- [ ] Brancher fournisseur SMS sur l'étape OTP cadrée
- [ ] Adaptateur `SignatureProvider` qualifié (Yousign/Universign)

---

## 9. Risques & mitigations

| Risque | Niveau | Mitigation |
|---|---|---|
| Introduction d'un backend (app 100% sans serveur jusqu'ici) | Moyen | Worker stateless + R2/KV managés, maintenance ~nulle ; assumé comme graine backend V2 |
| Contestation juridique signature simple | Moyen | Dossier de preuve solide (§5) + mention honnête + premium qualifié dispo ; OTP activable |
| RGPD (données perso transitent le relais) | Moyen | Chiffrement repos + TTL court + purge auto + registre RGPD + DPA |
| Free tier dépassé (>500 baux/j) | Faible | Plan Workers Paid 5 $/mois ; non bloquant à l'échelle actuelle |
| Wizard tactile mobile | Moyen | Réutilise wizard éprouvé + tests 3 formats |
| Sécurité tokens/relais | Élevé si bâclé | HMAC temps-constant, sessionId 256 bits, token hors URL, validation upload, **audit agent obligatoire** |

---

## 10. Notes utilisateur

> 💬 2026-05-29 : « je voudrais faire l'envoie de signture du bail au locataire et bailleur (dans le cas de la gestion) »
> 💬 2026-06-02 : « on n'est pas capable de donner accès au wizard de signature à distance au locataire ? » → oui, c'est `sign.html`.
> 💬 2026-06-02 : « je veux une vraie solution pas juste on envoie un pdf et débrouille toi. Ça je peux déjà faire aujourd'hui sans optimisation. » → bascule vers la boucle automatique via relais.

---

## 11. Journal

- **2026-05-29** : Sujet créé. Session 1 : design URL-fragment + retour manuel + mockup 8 vues. V1 = locataire only.
- **2026-06-02** : **Refonte du design**. Rejet du retour manuel. Nouvelle architecture relais Cloudflare (Worker + R2 + KV) + `sign.html` servi par le Worker + boucle 100% automatique. 3 agents de recherche (carto code / archi Cloudflare / juridique). Découvertes : (1) le wizard Phase 2 existe déjà → build dé-risqué ; (2) eIDAS « simple » n'apporte aucune présomption → DIY validé, crochet premium = qualifié ; (3) OTP SMS = levier probatoire (cadré, off V1). Consolide et remplace SIGN-BAIL-LIEN. 4 décisions verrouillées (hébergement / domaine / ordre de build / OTP). Spec V2 en attente de validation user.
- **2026-06-03** : **Composant 1 DÉPLOYÉ en production + bascule R2→KV (zéro carte bancaire)**. À l'activation de Cloudflare, R2 exige une carte bancaire (erreur 10042) — refusée pour rester 100 % gratuit. **Pivot Plan B** : les PDF (original + signé) sont stockés dans la **même boîte KV** que les métadonnées (valeur ≤ 25 Mio, upload plafonné 20 Mo, TTL 14 j symétrique → purge RGPD cohérente, ce que R2 n'offrait pas). Getters → `ArrayBuffer|null`, consommateurs adaptés via `Response()`. **82/82 tests verts. Audit code-reviewer externe : APPROUVÉ** (0 Critical/Important, 3 Minor non-bloquants : valid. taille PDF dans `POST /sessions` préexistant, `expiresAt` vs TTL KV à documenter, formulation Mo/Mio). Commits `fff245e` (migration) + `bdf672c` (ignore `.prod.vars`). **Déploiement** : `wrangler deploy` → **`https://bail-sign-relay.didierkeller.workers.dev`**, binding `SESSIONS_KV` rattaché, 14 assets uploadés. Secrets prod posés via `wrangler secret put` (`SIGNING_SECRET` généré localement jamais affiché ; `APP_KEY` sauvegardé dans `relay/.prod.vars` non-versionné, à réutiliser par le composant 3). **Smoke test prod 5/5** : 401 sans/mauvaise auth, 201 + sessionId/ownerToken avec vraie clé (APP_KEY chargé + écriture KV OK), 200 sur `/s/:id` avec `__SIGN_TOKEN__` injecté (SIGNING_SECRET chargé), 200 sur `/api/sessions/:id/pdf` (PDF relu depuis KV → **migration R2→KV validée dans le vrai environnement Cloudflare, pas juste miniflare**). **Reste** : ⚠️ CORS (le composant 3 sur une autre origine sera bloqué tant que `Access-Control-Allow-Origin` n'est pas ajouté au relais — à traiter avec le composant 3) ; composant 3 (intégration ImmoTrack, en prod car le Drive n'existe pas en sandbox).
- **2026-06-02 (suite)** : **Composant 1 (relais) livré + audité APPROUVÉ**. **Composant 2 (`sign.html`)** : wizard porté (consentement → lecture page-par-page + paraphe distinct → signature finale → tamponnage pdf-lib Stratégie B → renvoi auto). Smoke e2e réel (mono + 2 signataires, immutabilité + manifeste préservés). **Option A (couverture §5 complète) livrée** : (a) confirmation email anti-transfert (§5 #2) — route `POST /verify-email`, compare le hash en constant-time, `emailVerifiedAt` posé côté serveur (autorité), pas de blocage dur ; (b) dossier de preuve structuré (§5 #1/#3/#6/#8) — en-tête `X-Sign-Proof` (base64url JSON, décodage défensif borné + whitelist), acte de volonté + horodatages d'étape (`openedAt`/`readCompletedAt`), exposé au propriétaire via `GET /api/sessions/:id`. Wizard câblé (champ email + bouton Confirmer + gating + statut en `textContent`). **82/82 tests verts. Audit code-reviewer externe round 2 : APPROUVÉ** (0 Critical/Important ; polish a11y label/bouton appliqué). Commits `9d18e3a` (relais) + `0dea7ca` (wizard) + mockup `c26a410`, branche `relay-bail-sign`. **Reste** : test visuel manuel du wizard en navigateur (DOM non couvert par tests) ; déploiement Cloudflare (action user) ; composant 3 (intégration ImmoTrack, sandbox-first, nécessite Drive).
- **2026-06-03** : **Test mobile réel + fix d'affichage**. Tunnel Cloudflare quick + `wrangler dev` pour tester le wizard sur téléphone (le DOM/orchestrateur n'est pas couvert par les tests auto — d'où le test live). Bug constaté : **toutes les étapes empilées d'un coup**. Cause racine (debugging systématique) : les règles auteur `.step { display: flex }` / `.email-status { display: flex }` l'emportent sur le `[hidden] { display: none }` de l'UA quelle que soit la spécificité → l'attribut `hidden` (sur lequel repose tout le masquage `show()`) était neutralisé. Correctif canonique : `[hidden] { display: none !important; }` (sign.css). 2e symptôme : le fix CSS ne « prenait » pas au rechargement → Safari réutilisait le CSS/JS en cache mémoire malgré `must-revalidate` ; ajout d'un cache-bust `?v=ASSET_VERSION` sur sign.css/sign.js (page `/s/:id` dynamique no-cache, donc sert toujours les hrefs versionnés). Fix prouvé en moteur réel (Preview MCP + http-server) avant re-test user → validé « ok ça fonctionne ». Question « lu et approuvé » tranchée : le wizard **tamponne déjà** « Lu et approuvé » sur le PDF et enregistre `luApprouve` + `readCompletedAt` (proof.js) → **laissé tel quel** (décision user). **82/82 tests verts. Audit code-reviewer externe : APPROUVÉ** (0 Critical/Important). Commit `999dfec`, branche `relay-bail-sign`. Minor résiduel flaggé en tâche séparée : `relay/public/sign.html` (harnais dev servi publiquement par le binding assets) → à supprimer du déploiement. **Flow manuel complet validé sur téléphone réel** (« test sur tel ok ») → DOM/orchestrateur du wizard (seule partie non couverte par les tests auto) confirmé bout-en-bout, **composant 2 entièrement validé**. **Reste** : déploiement Cloudflare ; composant 3 (intégration ImmoTrack, nécessite Drive).
