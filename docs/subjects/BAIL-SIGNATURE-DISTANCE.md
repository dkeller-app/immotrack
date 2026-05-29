# BAIL-SIGNATURE-DISTANCE — Envoi de bail à signer par lien (wizard à distance)

**Status** : 🔄 Session 1 brainstorming + cadrage V1 livré 2026-05-29 · Mockup à raffiner · **Prio** : P1 · **Taille V1** : L (~4-6h) · **Taille V1.x** : XL si bailleur à distance ajouté
**Détecté** : 2026-05-29 (user : « je voudrais faire l'envoie de signture du bail au locataire et bailleur (dans le cas de la gestion) »)
**Lié à** : EMAIL-MODAL-UX-REFONTE (réutilise `_openEmailModal` + Gmail API) · DOC-PJ (import PDF signé reçu) · TEMPLATES-EMAILS-PARAMS (template email envoi)

## ⚡ Périmètre V1 (réduit après cadrage technique 2026-05-29)

> **DÉCISION USER** : « on fait que locataire pour le moment mais il va falloir trouver une idée pour pouvoir faire signer les 2 correctement »

**V1 = locataire uniquement via lien**. Le bailleur :
- Soit a déjà signé en direct dans ImmoTrack (wizard existant `_wizV2PersistSignatures`)
- Soit n'a pas encore signé (cas locataire signe d'abord, bailleur signera en direct après)

**V1.x différée** : envoi bailleur à distance — 3 options techniques étudiées (A Drive temporaire / B 2 PDF distincts / C signatures texte structurées) sans choix verrouillé. Cas d'usage gestion B2B à approfondir avant V1.x.

### Pourquoi V1 réduit ?

| Argument | Détail |
|---|---|
| **Cas user principal** | Bailleur solo veut faire signer un locataire à distance. Le bailleur lui-même signe en direct (chez lui devant son PC). 80% des cas. |
| **Complexité workflow gestion** | Le mandataire qui orchestre les 2 signatures à distance demande un workflow séquentiel (bailleur d'abord → préparateur reçoit → envoi au locataire avec PDF bailleur). 3 options techniques aucune parfaite. |
| **Risque taille URL** | Inclure les signatures bailleur dans le lien locataire (option C) frôle la limite navigateur sur mobile. |
| **Réutilisation existant** | Le wizard bailleur en direct fonctionne déjà parfaitement (`_wizV2PersistSignatures`). Pas besoin de le dupliquer dans sign.html pour V1. |
| **Validation incrémentale** | Livrer locataire-only en V1, observer usage réel, voir si bailleur à distance est vraiment demandé avant d'investir. |

## Justification (4 critères pré-vol)

1. **Cible** : 3 scénarios à supporter dès V1 (décision validée 2026-05-29) :
   - Bailleur solo → locataire à distance (déménagement, autre ville)
   - Mandataire/gestionnaire → bailleur + locataire (cas gestion B2B)
   - Workflow complet 2 sens à distance (personne ensemble physiquement)
2. **Règles** : refonte propre, pas de patch. Réutilise briques existantes (Gmail API, wizard signature, jsPDF natif, DOC-PJ).
3. **Justifications** :
   - 🧑 Cas user 2026-05-29 explicite : « envoi de signature du bail au locataire et bailleur (dans le cas de la gestion) »
   - 💻 Code existant : `_openEmailModal` (Gmail API OAuth), `_wizV2PersistSignatures` (wizard ImmoTrack), `genBailHTML` + `pdf.text/pdf.rect` natif jsPDF, DOC-PJ pour import PDFs
   - 📋 Backlog : SIGNATURE-MODES déjà mentionné dans V3 roadmap mais sans implémentation
   - 💰 Business : feature critique pour SaaS gestion (concurrents Rentila/BailFacile l'ont, Qalimo aussi) — élément différenciant manquant
4. **5 vues 360°** : UX (page autonome mobile-friendly) · technique (compression URL fragment, pas de backend) · juridique (signature simple visuelle art. 1366 Code civil — pas eIDAS) · sécurité (token + vérification email) · cycle de vie (envoi → signature → retour → import → archivage)

## Décisions verrouillées Session 1 (2026-05-29)

| Décision | Choix | Justification |
|---|---|---|
| **Scénarios V1** | **Locataire uniquement via lien** (révision 2026-05-29) | Bailleur signe en direct dans ImmoTrack (wizard existant). Cas user principal (bailleur solo). V1.x ajoutera bailleur à distance. |
| **Niveau légal** | Signature simple visuelle (art. 1366 Code civil) | Vaut accord contractuel. PAS eIDAS (nécessiterait prestataire payant DocuSign/Yousign). |
| **Mode retour** | Re-téléchargement PDF signé + email manuel | Le locataire signe via wizard, télécharge le PDF avec signatures insérées, envoie par email simple. Le bailleur importe via DOC-PJ existant. **Fiabilité maximale, pas de magie URL fragile.** |
| **Token sécurité** | Token SHA256 + vérification email à l'ouverture | Couche identification : le locataire saisit son email à l'ouverture sign.html → vérification `token === SHA256(bail_data + email + timestamp).slice(0, 16)`. Protège contre transmission accidentelle du lien. |
| **Wizard** | Complet : paraphe par page + signature finale | Légalement plus solide (preuve que le bail a été lu intégralement). Réutilise structure wizard ImmoTrack existant. |
| **Envoi multi-locataires V1** | 1 email par locataire | Chaque locataire reçoit son propre lien + signe son propre PDF. Le bailleur reçoit N PDFs (un par locataire). Cas typique : clause solidarité + chacun signe individuellement. |

## Architecture technique

### Flux complet

```
PRÉPARATEUR (ImmoTrack)         EMAIL                DESTINATAIRE (browser)              RETOUR
┌─────────────────────────┐                          ┌─────────────────────────────┐    ┌─────────────────────────┐
│ Modale Bail              │                          │ /sign.html?fragment         │    │ Préparateur (ImmoTrack) │
│ ──────────────────────── │                          │ ────────────────────────    │    │ ──────────────────────  │
│ Bouton ✉ Envoyer pour    │                          │ ÉTAPE 1 : Vérif email       │    │ Reçoit email +          │
│   signature à distance   │                          │ (saisie + token SHA256 OK)  │    │ PDF signé en PJ         │
│                          │                          │ ↓                            │    │ ↓                       │
│ Modale destinataires :   │                          │ ÉTAPE 2 : Wizard paraphes   │    │ Clic « Importer         │
│ - locataire(s) — 1/N     │                          │ (canvas par page)            │    │  signature reçue »     │
│ - bailleur (si mandat)   │                          │ ↓                            │    │ ↓                       │
│ - mandataire             │                          │ ÉTAPE 3 : Signature finale  │    │ Sélection bail cible    │
│                          │                          │ (canvas + case lu/approuvé) │    │ ↓                       │
│ Bouton ENVOYER →         │  Gmail API OAuth         │ ↓                            │    │ Import PDF dans         │
│  - Compresse bail        ├──────────────────────────│ ÉTAPE 4 : Génère PDF        │    │ DB.documents +          │
│    (LZ-string)           │  Email à destinataire    │ avec signature insérée      │    │ MAJ bail.signatures     │
│  - Calcule token         │  avec lien sign.html#X   │ via jsPDF natif             │    │ ↓                       │
│    SHA256(data+email)    │                          │ ↓                            │    │ Bail status :           │
│  - Lien sign.html#       │                          │ TÉLÉCHARGE PDF              │    │ « Signé par X à         │
│    bail=X&t=Y&            │                          │ ↓                            │    │  distance le {date} »   │
│    signer=Z&exp=W         │                          │ Instructions :              │    │                         │
│  - Email via Gmail API   │                          │ « Envoyer par email à       │    │                         │
│    avec lien clickable   │                          │  préparateur@x.fr »         │    │                         │
└─────────────────────────┘                          │ + bouton mailto:            │    └─────────────────────────┘
                                                      │  pré-rempli avec PJ         │
                                                      └─────────────────────────────┘
                                                                       │
                                                                       │ Email manuel
                                                                       │ destinataire → préparateur
                                                                       │ avec PDF signé en PJ
                                                                       ↓
                                                                  [PRÉPARATEUR REÇOIT]
```

### Composants techniques

| Composant | Détail | Réutilise existant |
|---|---|---|
| **Page `sign.html`** standalone | ~50-80 KB tout inclus (HTML+CSS+JS+jsPDF inliné). Hébergée sur même domaine GitHub Pages. Aucune dépendance ImmoTrack. | jsPDF déjà inliné (cf v12.68 _BAIL_PDF_LIBS) |
| **Compression bail** | LZ-string ou base64 custom. Bail JSON 10-50 KB → ~5-25 KB compressé → ~7-35 KB en base64 URL-safe. | À ajouter (~10 KB lib LZ-string) |
| **Token SHA256** | `SHA256(bail_data + email_destinataire + timestamp).slice(0, 16)`. Vérifié à l'ouverture (canvas SubtleCrypto.digest). | Web Crypto API natif |
| **Wizard signature** | Réutilise structure wizard ImmoTrack (paraphes canvas + sig finale). Extrait en HTML autonome. | Code wizard `_wizV2*` à porter dans sign.html |
| **Génération PDF signé** | jsPDF natif. Insère paraphes + signature aux emplacements prévus dans le bail. | Code `genPDFNative` à porter |
| **Envoi email** | `_openEmailModal('bail-signature-distance', ctx)` réutilise Gmail API + alias send-as. | Module email v15.85+ existant |
| **Import PDF signé reçu** | Module DOC-PJ existant. Bail.signatures enrichi avec ref documentImporte. | DOC-PJ v15.155+ |

### URL fragment structure

```
https://immotrack.app/sign.html#
  &v=1                           ← version protocole
  &bail=LZ_COMPRESSED_BASE64URL  ← bail JSON compressé
  &t=TOKEN_16CHAR                ← SHA256 tronqué
  &signer=locataire|bailleur     ← qui doit signer
  &email_hash=SHA256_8CHAR       ← hash de l'email destinataire (vérif à l'ouverture)
  &exp=ISO_DATE                  ← date expiration (7j par défaut)
  &back=preparateur@x.fr         ← email retour (pour mailto: à la fin)
```

**Sécurité** : le fragment `#...` n'est JAMAIS envoyé au serveur (côté navigateur uniquement). Pas de fuite.

## V1.x — Bailleur à distance (différé, 3 options à arbitrer)

> Le mandataire/gestionnaire qui orchestre la signature des 2 parties à distance.
> Aucune option n'est parfaite. À approfondir quand le besoin user réel est confirmé.

### Option A — 1 seul PDF bilatéral via Drive temporaire

1. Bailleur signe via sign.html → renvoie PDF signé bailleur
2. Préparateur importe → ImmoTrack upload PDF sur Drive (dossier temporaire avec lien public + expiration 7j)
3. Préparateur clique « Envoyer au locataire »
4. ImmoTrack envoie lien `sign.html?pdf_url=DRIVE_TEMP&signer=locataire`
5. Locataire ouvre → sign.html télécharge PDF signé bailleur depuis Drive + affiche dans le wizard
6. Locataire signe par-dessus → génère **PDF final avec LES 2 SIGNATURES**
7. Locataire renvoie → préparateur archive PDF bilatéral

✅ Document final unique bilatéral (légalement le mieux)
❌ Nécessite Drive du préparateur (OAuth déjà OK), lien public temporaire (faille sécurité à mitiger : token signé Drive + expiration courte + révocation après usage)

### Option B — 2 PDF distincts (un par exemplaire)

1. Bailleur signe via sign.html → renvoie PDF signé bailleur
2. Préparateur importe
3. Préparateur clique « Envoyer au locataire » → email avec :
   - PDF signé bailleur **en pièce jointe** (consultation)
   - Lien sign.html avec **bail vierge**
4. Locataire signe son exemplaire vierge → renvoie PDF locataire signé
5. Préparateur a 2 PDF distincts : exemplaire bailleur + exemplaire locataire

✅ Pas de Drive nécessaire, implémentation simple (réutilise V1 locataire-only)
❌ 2 PDF circulent (légalement acceptable « autant d'exemplaires que de parties » mais pas idéal « 1 document signé par tous »)

### Option C — Signatures bailleur transmises en texte structuré

1. Bailleur signe via sign.html → télécharge PDF + COPIE clipboard `{paraphes_base64[], signature_base64, date, lu_approuvé:true}`
2. Bailleur renvoie : PDF en PJ + bloc texte dans corps email
3. Préparateur clique « Importer signature bailleur » → colle le bloc → ImmoTrack stocke `bail.signatures.bailleurCanvas`
4. Préparateur clique « Envoyer au locataire » → ImmoTrack génère lien `sign.html#bail=X&bailleurSigs=Y&signer=locataire`
5. Locataire ouvre → sign.html dessine les signatures bailleur sur les pages + zones vides locataire
6. Locataire signe → génère PDF final bilatéral

✅ Document final unique bilatéral, pas de Drive
❌ 2 imports manuels du préparateur (PDF + bloc texte), risque taille URL (~80 KB en base64 sur mobile)

### À arbitrer V1.x quand besoin user confirmé

Décision reportée. Mes recommandations en l'état :
- **Si le mandataire B2B est un cas user fort** → Option A (Drive temporaire, document unique)
- **Si juste « parfois bailleur veut aussi à distance »** → Option B (2 PDF distincts, simple)

## Plan d'exécution proposé

### Session 1 — Brainstorming + Mockups + Cadrage (~2h) ✅ LIVRÉ 2026-05-29
- [x] Brainstorm architecture
- [x] Sujet doc créé
- [x] 6 décisions Session 1 verrouillées
- [x] Mockup standalone 8 vues × 3 formats créé
- [x] Cadrage V1 = locataire only (décision user technique 2026-05-29)
- [x] V1.x différée avec 3 options techniques cataloguées

### Session 2 — Implémentation V1 LOCATAIRE ONLY (~4-6h)
- [ ] Page `sign.html` standalone (~50-80 KB)
- [ ] Helper compression bail (`__tests__/helpers/bail-link-codec.js` + tests Vitest)
- [ ] Helper token SHA256 + vérification email (Web Crypto API)
- [ ] Bouton « ✉ Envoyer au locataire pour signature » dans modale Bail (visible si bail non clôturé)
- [ ] Intégration `_openEmailModal` avec template `bail-signature-locataire`
- [ ] Template email dédié (TEMPLATES-EMAILS)
- [ ] Flow import retour : modale « Importer signature locataire reçue » + parse PDF + MAJ `bail.signatures.signedLocataireAt` + ref documentImporté DOC-PJ
- [ ] Mise à jour mockup pour clarifier V1 = locataire only
- [ ] Tests Vitest (codec round-trip, token vérification, expiration, multi-locataires)
- [ ] Audit code-reviewer agent obligatoire (sensible légal)
- [ ] Sync sandbox + bump versions

### Session 3 (V1.x) — Bailleur à distance (différé)
- [ ] Arbitrage 3 options techniques (A/B/C) avec user
- [ ] Mockup-first pour l'option choisie
- [ ] Implémentation
- [ ] Audit + tests

## Risques et mitigations

| Risque | Niveau | Mitigation |
|---|---|---|
| **Limite URL navigateur** (~32 KB Chrome, 8 KB mobile parfois) | **Élevé** | Bail compressé LZ-string + supprimer champs inutiles (mobilier verbeux, etc.). Si dépassement → erreur explicite + fallback PDF par email. Tests sur 3 bails de référence. |
| **Sécurité token sans backend** | Moyen | Token SHA256 + vérification email = double check. Acceptable pour signature simple visuelle (pas eIDAS). Documenter explicitement la limite. |
| **Compatibilité PDF signé** (jsPDF dans sign.html standalone) | Moyen | jsPDF déjà inliné dans ImmoTrack (`_BAIL_PDF_LIBS`). Porter le décodage base64 dans sign.html aussi. |
| **Mobile UX** (canvas signature au doigt) | Moyen | Tests sur 3 formats. Canvas avec `touch-events`. Boutons min 44px (règle ARCHI-FICHES Session 4 K1). |
| **Email destinataire incorrect** | Faible | Token verifie email à l'ouverture → si email saisi ne match pas le hash → refus accès. Le destinataire doit savoir son email. |
| **Lien transmis à un tiers** | Faible | La vérification email à l'ouverture protège partiellement. Pour signature simple visuelle = risque acceptable V1. eIDAS si besoin V2. |

## Notes utilisateur

> 💬 2026-05-29 (création) : « je voudrais faire l'envoie de signture du bail au locataire et bailleur (dans le cas de la gestion) »
>
> 💬 2026-05-29 (cadrage) : « on peut pas envoyer un lien pour signer les wizard ? »

## Journal

- **2026-05-29 (matin)** : Sujet créé. Session 1 brainstorming livrée : 5 décisions verrouillées (scénarios / légal / retour / token / wizard) + architecture technique cadrée. Mockup 8 vues × 3 formats livré.
- **2026-05-29 (cadrage)** : Cadrage technique avec user. Question soulevée : « comment ça fonctionne si on envoie d'abord au bailleur puis locataire ? tu récupères un pdf et après tu donnes quoi au locataire ? » → 3 options techniques étudiées (A Drive temporaire / B 2 PDF distincts / C signatures texte structurées). Aucune parfaite.
- **2026-05-29 (décision V1)** : **Périmètre V1 réduit à locataire uniquement**. Décision user : « on fait que locataire pour le moment mais il va falloir trouver une idée pour pouvoir faire signer les 2 correctement ». V1.x bailleur à distance différée avec 3 options cataloguées pour arbitrage ultérieur. Le bailleur signe en direct dans ImmoTrack (wizard existant `_wizV2PersistSignatures` opérationnel).
