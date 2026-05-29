# BAIL-SIGNATURE-DISTANCE — Envoi de bail à signer par lien (wizard à distance)

**Status** : 🔄 Session 1 brainstorming livré 2026-05-29 · Mockup-first en cours · **Prio** : P1 · **Taille** : XL (~6-8h sur 2 sessions)
**Détecté** : 2026-05-29 (user : « je voudrais faire l'envoie de signture du bail au locataire et bailleur (dans le cas de la gestion) »)
**Lié à** : EMAIL-MODAL-UX-REFONTE (réutilise `_openEmailModal` + Gmail API) · DOC-PJ (import PDF signé reçu) · TEMPLATES-EMAILS-PARAMS (template email envoi)

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
| **Scénarios** | Les 3 scénarios (bailleur solo / mandataire / 2 sens) supportés dès V1 | Architecture générique = UI s'adapte selon contexte connecté + destinataires choisis |
| **Niveau légal** | Signature simple visuelle (art. 1366 Code civil) | Vaut accord contractuel. PAS eIDAS (nécessiterait prestataire payant DocuSign/Yousign). |
| **Mode retour** | Re-téléchargement PDF signé + email manuel | Le destinataire signe via wizard, télécharge le PDF avec signature insérée, envoie par email simple. Le préparateur importe via DOC-PJ existant. **Fiabilité maximale, pas de magie URL fragile.** |
| **Token sécurité** | Token SHA256 + vérification email à l'ouverture | Couche identification : le destinataire saisit son email à l'ouverture sign.html → vérification `token === SHA256(bail_data + email).slice(0, 16)`. Protège contre transmission accidentelle du lien. |
| **Wizard** | Complet : paraphe par page + signature finale | Légalement plus solide (preuve que le bail a été lu intégralement). Réutilise wizard ImmoTrack existant. |

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

## Plan d'exécution proposé

### Session 1 — Brainstorming + Mockups (~2h)
- [x] Brainstorm architecture, décisions Session 1 verrouillées
- [x] Sujet doc créé (ce fichier)
- [ ] Mockups HTML standalone variantes A/B/C × 3 formats × tous artefacts post-clic :
  - Vue préparateur ImmoTrack (bouton envoi + modale destinataires)
  - Vue email reçu par destinataire
  - Vue sign.html étape 1-2-3-4
  - Vue import retour préparateur
- [ ] STOP user pour validation mockups

### Session 2 — Implémentation V1 (~4-6h)
- [ ] Page `sign.html` standalone (~50-80 KB)
- [ ] Helper compression bail (`__tests__/helpers/bail-link-codec.js` + tests Vitest)
- [ ] Helper token SHA256 + vérification email
- [ ] Bouton « ✉ Envoyer pour signature » dans modale Bail + intégration `_openEmailModal`
- [ ] Template email `bail-signature-distance` dans TEMPLATES-EMAILS
- [ ] Flow import retour : modale « Importer signature reçue » + parse PDF reçu + MAJ `bail.signatures`
- [ ] Tests Vitest (codec round-trip, token vérification, expiration)
- [ ] Audit code-reviewer agent obligatoire (sensible légal)
- [ ] Sync sandbox + bump versions

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

- **2026-05-29** : Sujet créé. Session 1 brainstorming livrée : 4 décisions verrouillées (scénarios / légal / retour / token / wizard) + architecture technique cadrée. Mockups en cours.
