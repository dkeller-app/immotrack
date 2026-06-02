# SIGN-BAIL-LIEN — Signature électronique du bail aller-retour locataire (Yousign / lien magique)

> ⚠️ **FUSIONNÉ — sujet remplacé le 2026-06-02 par [BAIL-SIGNATURE-DISTANCE](BAIL-SIGNATURE-DISTANCE.md).**
> Les deux sujets visaient la même feature. Le design consolidé retient une **architecture relais maison (Cloudflare Worker + R2/KV) + crochet eIDAS qualifié en premium**, et non Yousign comme socle. Raison clé : le free tier prestataire est **par compte** → non-scalable en multi-tenant. L'approche Yousign survit uniquement comme **option premium eIDAS qualifié** dans le sujet consolidé. Ce fichier est conservé pour l'historique de l'analyse (comparatif prestataires, flow Yousign).

**Status** : 🚫 Fusionné dans BAIL-SIGNATURE-DISTANCE (2026-06-02) · **Prio** : P1 (V1.1)
**Détecté** : 2026-05-18 (user : « il faut pouvoir envoyer un lien pour signature du bail au locataire »)
**Lié à** : EMAIL-SMTP-CONNECT 🔄 v15.80, SIGN-EIDAS P3 V3 (existant), BAIL-PDF-NATIF ✅ v13.24

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs V1 commercial (différenciant marché majeur — Rentila/BailFacile/Qalimo font signature électronique payante, ImmoTrack la ferait gratuite pour < 3 sig/mois via Yousign)
2. **Règles** : modify+verify + bump + tests Vitest + RGPD compliant + eIDAS valide
3. **Justifications multiples** :
   - 🧑 Demande user explicite 2026-05-18 + « tu me proposes une solution aller-retour »
   - 💻 BAIL-PDF-NATIF v13.24 fournit déjà le PDF natif + canvas signature bailleur → infrastructure ½ prête
   - 📋 Différenciant majeur V1 commercial — eIDAS "simple" suffisant pour bail habitation (loi 89-462 art. 1316-4 Code Civil)
   - ⚖️ Cadre légal eIDAS Règlement 910/2014 + loi française adaptation 2017 — signature simple = écrit numérique présumé authentique
4. **5 vues 360°** : UX (1 clic bailleur, 1 clic locataire) + technique (sans backend, leverage Yousign Free) + commercial (différenciant + gratuit user < 3 sig/mois) + légal (eIDAS simple) + cycle vie (réutilisable EDL signé V2)

## Comparatif 3 architectures possibles

| Option | Coût user | Complexité dev | Légalité eIDAS | Recommandation |
|---|---|---|---|---|
| **A. Mailto pré-rempli aller-retour** | 0€ | 4h | Faible (manuel non tracé) | Si V1 ultra-light |
| **B. Page `sign.html` self-hosted + Drive resumable upload** | 0€ | 12h | Moyenne | Si pas envie de tier |
| **C. Yousign API (Free tier 3 sig/mois)** | 0€ < 3/mois | 8h | **Forte eIDAS Simple** ⭐ | **V1 commercial** |
| **D. DocuSign / Skribble** | ~5-12€/mois | 6h | Forte eIDAS Avancée | V2 si user veut + |

→ **Reco V1.1** : Option C (Yousign Free) — différenciant marché gratuit + légalité forte + pas de backend.

## Architecture détaillée — Option C (Yousign)

### Flow utilisateur

```
1. Bailleur ouvre fiche bail dans ImmoTrack
2. Clique bouton "📝 Envoyer pour signature électronique"
3. ImmoTrack appelle Yousign API :
   - Upload du PDF du bail (généré par genPDFNative)
   - Création d'une procédure signature avec 1 destinataire (locataire)
   - Récupère le lien de signature unique
4. ImmoTrack envoie un email au locataire via Gmail API (EMAIL-SMTP-CONNECT) :
   - Sujet : "Signature électronique de votre bail — 14 av. Emile Huchet"
   - Corps : pré-rempli avec lien Yousign + explication
5. Locataire reçoit l'email, clique le lien
6. Yousign affiche le PDF + champ signature dans son interface web
7. Locataire signe (canvas + saisie code OTP envoyé par SMS)
8. Yousign webhook → ImmoTrack reçoit notification + récupère le PDF signé
9. ImmoTrack uploade le PDF signé dans Drive bailleur + met à jour bail.signatures
10. Notification ImmoTrack au bailleur (badge + email)
```

### Difficulté technique : pas de backend pour recevoir webhook Yousign

ImmoTrack est offline-first sans serveur. Yousign envoie le webhook sur une URL HTTP qu'il faut héberger. Options :

#### Option C.1 — Polling périodique (simple)
- Au lieu de webhook, ImmoTrack appelle régulièrement l'API Yousign `GET /procedures/{id}` pour check statut
- Polling au boot de l'app + chaque ouverture de la fiche bail concernée
- Avantage : aucun backend
- Inconvénient : pas de notif temps réel, latence ~1 min

#### Option C.2 — Cloudflare Worker minimaliste (recommandé)
- 1 Worker gratuit (100k req/jour) reçoit le webhook Yousign
- Worker push une entry dans un dossier Drive partagé (= notification ImmoTrack au prochain scan Drive)
- Avantage : temps réel + gratuit
- Inconvénient : 1 backend minimaliste à maintenir (mais Cloudflare Workers = ~zéro maintenance)

#### Option C.3 — Email comme canal de notification (KISS)
- Yousign envoie un email au bailleur quand le locataire signe (config native)
- Bailleur clique le lien dans l'email → ImmoTrack récupère le PDF signé via API Yousign + l'enregistre
- Avantage : aucun backend, leverage l'email du bailleur
- Inconvénient : nécessite que le bailleur ouvre l'email puis clique (pas auto-magique)

→ **Reco V1** : Option C.3 (email comme canal) → on commence simple, on upgrade vers C.2 (CF Worker) si user demande temps réel.

## Scope V1.1 — 4 phases (~12-15h)

### Phase 1 — Inscription Yousign + module pur (~3h)
- Créer compte Yousign Free (`yousign.com`) avec mail ImmoTrack
- Récupérer API key (mode sandbox d'abord)
- Module pur `js/core/yousign.js` :
  - `_yousignUploadDocument(apiKey, pdfBlob, filename)` → fileId
  - `_yousignCreateProcedure(apiKey, fileId, signers[])` → procedureId + signLink
  - `_yousignGetProcedure(apiKey, procedureId)` → status + signed PDF URL si done
- Tests Vitest avec fetch mocké

### Phase 2 — UI bouton fiche bail (~2h)
- Bouton "📝 Envoyer pour signature électronique" dans la fiche bail (section signature)
- Modale "Confirmer signature électronique" qui :
  - Liste les destinataires (locataire principal + co-locataires si bail multi)
  - Affiche un récap : nb pages bail PDF + délai expiration (14j default)
  - Champs OPTIONNELS : SMS du locataire pour OTP de signature (renforce eIDAS)
  - Bouton "Envoyer" qui orchestre upload + procedure + email

### Phase 3 — Email locataire via Gmail API (~2h)
- Réutilise `_emailSendViaGmail` v15.80
- Template email "bail-signature-yousign" ajouté à `EMAIL_HUB_CATALOG`
- Variables : `{lienSignature}`, `{dateExpir}`, `{adresseBien}`, `{loyerHC}`
- Légalement requis : mention "ce mail vaut convocation à signature électronique au sens du règlement eIDAS"

### Phase 4 — Récupération signature + Drive (~5-8h)
- Polling au boot ImmoTrack des procedures actives (ou Option C.3 webhook email)
- Quand status === 'completed' :
  - GET `/procedures/{id}/files/signed` → blob PDF signé
  - Upload via `_drvUploadDoc(bail.ref, 'baux', signedBlob, 'Bail-signe-locataire.pdf')`
  - Update `bail.signatures.locataire = { date, source: 'yousign', signedPdfDriveId }`
  - Toast "✓ Bail signé électroniquement par {locataire}"
  - Notification (badge sidebar fiche bail)

## Architecture data

Champs ajoutés à `bail` :

```js
{
  // existant
  ref, debut, fin, locataires[], ...
  // nouveau v15.X
  signatureElectronique: {
    provider: 'yousign',
    procedureId: 'proc_abc123',
    dateEnvoi: '2026-05-18T10:00:00Z',
    dateExpir: '2026-06-01',
    signers: [
      { type: 'locataire', nom: 'AUDRIN', email: 'audrin@gmail.com', tel: '+33...', status: 'signed', dateSign: '2026-05-19T14:30:00Z' }
    ],
    signedPdfDriveId: '1abc...',
    signedPdfDriveLink: 'drive.google.com/file/d/1abc.../view'
  }
}
```

## Coût utilisateur

- Yousign Free : **0€** jusqu'à 3 signatures/mois
- ImmoTrack ne facture rien (différenciant gratuit V1)
- Au-delà de 3 sig/mois : suggérer Yousign Essentials (~9€/mois) ou DocuSign Personal (~12€/mois) — sujet V2

## Décisions à prendre

- **D1** : Option C (Yousign) validée OU explorer DocuSign/Skribble en plus ?
- **D2** : Notification retour : Option C.1 polling, C.2 Cloudflare Worker, OU C.3 email canal ?
- **D3** : OTP SMS pour signature locataire : obligatoire (renforce eIDAS) OU optionnel ?
- **D4** : Sandbox Yousign d'abord (gratuit, tests illimités) ou direct prod Free ?
- **D5** : Spec un sujet séparé pour signature EDL locataire (même flow Yousign) ?

## Différenciant marché

| Solution | Signature électronique | Coût user | eIDAS |
|---|---|---|---|
| Rentila | ✅ payant (~€/sig) | 50€/mois base + €/sig | Forte |
| BailFacile | ✅ payant | 25€/mois | Moyenne |
| Qalimo V2 | ✅ DocuSign embedded | Inclus 49€/mois | Forte |
| **ImmoTrack V1.1 (ce sujet)** | ✅ **gratuit < 3 sig/mois** | **0€** | **Forte (Yousign Simple)** ⭐ |

## Notes utilisateur

> 💬 2026-05-18 : « il faut pouvoir envoyer un lien pour signature du bail au locataire (tu me proposes une solution aller-retour pour cela) »

## Journal

- 2026-05-18 : créé · P1 V1.1 · 4 phases identifiées (~12-15h Yousign Option C.3) · 5 décisions D1-D5 à arbitrer · session dédiée future après stabilisation EMAIL-SMTP-CONNECT
