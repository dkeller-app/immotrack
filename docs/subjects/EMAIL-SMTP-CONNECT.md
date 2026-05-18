# EMAIL-SMTP-CONNECT — Envoi direct d'emails depuis l'app (Gmail API OAuth + fallback)

**Status** : ⬜ À faire · **Prio** : P1 (V1.1) · **Taille** : M (~6-8h)
**Détecté** : 2026-05-18 (user)
**Lié à** : EMAIL-AUTO ✅ v15.09, EMAIL-ONGLET-PERMANENT ✅ v15.79, BUG-EMAIL-PROPOSAL-IRL ⏳, OAuth Drive existant (DRIVE-* livré v13.41)

## Contexte

Aujourd'hui ImmoTrack V1 v15.79 propose les emails via le pattern "Proposition" :
- Pré-remplissage sujet + corps avec les variables bail (locataire, montant, dates)
- 4 boutons : Copier · Ouvrir client mail (`mailto:`) · Partager · Annuler
- Pas d'envoi automatisé : le user fait le dernier clic dans son Gmail/Outlook natif

User 2026-05-18 : *« comment on connecte une adresse mail à ImmoTrack pour un envoi directement depuis l'app ? »*

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs (ImmoTrack V1 commerciale), majoritairement Google (Gmail) + Microsoft (Outlook/365)
2. **Règles** : modify+verify + tests Vitest + RGPD compliant (pas de stockage credentials côté ImmoTrack)
3. **Justifications** :
   - 🧑 Question explicite user 2026-05-18
   - 💻 OAuth Google Drive déjà implémenté + token refresh proactif (livré v13.41 DRIVE-DISCONNECT) → réutilisable
   - 📋 Différenciant marché : Rentila/BailFacile envoient via SMTP relay (`noreply@app.com` = peu crédible). Si on envoie DEPUIS l'adresse Gmail du bailleur, l'expérience est natif + Sent visible dans Gmail
   - ⚖️ RGPD : email envoyé depuis le compte du user = pas de stockage credential ni de relais opaque
4. **5 vues 360°** : UX (envoi en 1 clic vs 3-4) + technique (leverage OAuth existant) + commercial (crédibilité vs concurrents) + RGPD (pas de copie body côté ImmoTrack) + cycle vie (V1.1 → V1.2 Microsoft)

## Solution recommandée — Gmail API OAuth (V1.1)

### Architecture

```
ImmoTrack (client-only)
   ↓ OAuth 2.0 (existing flow Drive)
   ↓ Token avec scope ajouté : gmail.send
   ↓
Gmail API REST endpoint POST /gmail/v1/users/me/messages/send
   ↓ Body : { raw: base64url(MIME-message) }
   ↓
Email envoyé DEPUIS l'adresse Gmail du user
   → Apparaît dans son Gmail "Envoyés" natif
   → Reply du locataire arrive dans son Inbox normal
```

### Avantages

- **Aucun backend** à maintenir
- **Aucun stockage credential** côté ImmoTrack (OAuth token éphémère)
- **Crédibilité maximale** : email envoyé depuis l'adresse pro du bailleur, pas un `noreply@`
- **Traçabilité native** : envoyés visibles dans Gmail, Reply arrive normalement
- **Quota 250 envois/jour** gratuit (largement suffisant)
- **Réutilise OAuth Drive** existant (juste ajout du scope `gmail.send`)

### Limites & mitigation

| Limite | Mitigation |
|---|---|
| Users non-Google (Outlook, autres) | Fallback mailto comme aujourd'hui (workflow existant inchangé) |
| Vérification Google requise pour scope `gmail.send` | Soumission Google Cloud Console, gratuit, ~2-6 semaines de review |
| MIME encoding manuel (base64url + boundary) | Helper pur testable `_emailToMimeBase64Url(emailData)` |
| Pas de pièces jointes Drive native | Phase 2 : upload PJ Drive avant envoi (déjà infrastructure DRIVE-ARBORESCENCE) |
| Token expire 1h (OAuth GIS) | Refresh proactif déjà géré (DRIVE-DISCONNECT v13.41) |

## Scope V1.1 — Phase Gmail API

### Phase 1 — OAuth scope + helper d'envoi (~2h)
- Étendre l'OAuth flow Drive : ajouter scope `https://www.googleapis.com/auth/gmail.send`
- Module pur `js/core/email-send.js` :
  - `_emailToMimeBase64Url(emailData)` : encode { to, cc, subject, body, html?, attachments[] } en RFC 5322 MIME base64url
  - `_emailSendViaGmail(token, mime)` : POST `gmail.googleapis.com/.../send` (async)
- Tests Vitest (~10) : encoding MIME, headers RFC, multipart, attachments base64

### Phase 2 — UI modale "Envoyer" (~1.5h)
- Modale `#ov-email-send` à côté de "Proposition de mail" existante
- Bouton "📤 Envoyer maintenant" actif uniquement si :
  - User a OAuth Drive avec scope `gmail.send` ✓
  - `to` rempli
  - Subject + body remplis
- Sinon fallback : "Connectez votre compte Google pour envoyer directement"
- État : `envoi en cours` → `envoyé ✓` (avec entry `DB.emailsSent` status='sent' au lieu de 'proposed')
- Erreurs Gmail API (quota, refus) : toast + suggestion mailto fallback

### Phase 3 — Pièces jointes (~2h)
- Sélecteur PJ depuis Drive ImmoTrack arborescence (LOG-FICHE-360, IRL lettre, quittance PDF)
- Encodage base64 dans MIME body
- Limite Gmail : 25 MB total → check size avant envoi

### Phase 4 — Phase post-V1.1 : Microsoft Graph (~3h)
- Sujet à part : EMAIL-SMTP-MICROSOFT (V1.2 ou V2)
- OAuth Microsoft + scope `Mail.Send`
- POST `graph.microsoft.com/v1.0/me/sendMail`

## Architecture data

Nouveau champ dans entry `DB.emailsSent` :
```js
{
  // existant v15.09
  id, type, to, cc, subject, sentAt, status, entityType, entityId,
  // nouveau v15.X
  sendChannel: 'gmail-api' | 'mailto' | 'copied' | 'shared',
  // status enum étendu : 'proposed' | 'mailto' | 'copied' | 'shared' | 'sent' | 'failed'
  // si sent : trace ID Gmail (pour debugging) — pas le body (RGPD)
  externalId: '17abcdef...'  // gmail.googleapis.com message.id
}
```

## Tests Vitest (~15)

`js/core/email-send.js` :
- `_emailToMimeBase64Url` : encoding RFC 5322 (headers + body texte simple)
- `_emailToMimeBase64Url` : multipart/mixed avec 1 PJ
- `_emailToMimeBase64Url` : CC + BCC corrects
- `_emailToMimeBase64Url` : accents UTF-8 encodés correctement (=?UTF-8?B?...?=)
- `_emailToMimeBase64Url` : injection HTML protégée
- `_emailToMimeBase64Url` : robustesse null/undefined
- `_emailSendViaGmail` mock fetch : POST avec bon endpoint + headers + body
- `_emailSendViaGmail` : retourne externalId si OK
- `_emailSendViaGmail` : throw si 4xx/5xx avec error détaillé
- `_emailSendViaGmail` : retry 1× si 503 (quota momentané)

## Décisions à prendre

- **D1** : on lance la vérif Google Console (gmail.send scope) avant le code, OU on code en dev mode (user dev = whitelist) puis on soumet en parallèle ?
- **D2** : on garde "Proposition de mail" existante OU on la supprime au profit de "Envoyer maintenant" pour les users Gmail ?
- **D3** : Phase 3 PJ — on inclut la lettre IRL PDF auto-générée OU on laisse l'user attacher manuellement ?
- **D4** : RGPD — on log le body envoyé dans audit-trail (pour traçabilité) OU on log juste les métadonnées (status quo v15.09) ?
- **D5** : on attaque ce sujet maintenant (pause marathon 19C-I) OU on attend la fin du marathon Sprint 19+20 ?

## Différenciant marché renforcé

| Solution | Envoi auto | Depuis adresse user | Pièces jointes | RGPD |
|---|---|---|---|---|
| Rentila | ✅ SMTP relay | ❌ `noreply@rentila.com` | ✅ | ⚠ stockage relais |
| BailFacile | ✅ SMTP relay | ❌ `noreply@bailfacile.fr` | ✅ | ⚠ stockage relais |
| Qalimo V2 | ✅ SMTP relay | ❌ relais | ✅ | ⚠ stockage relais |
| **ImmoTrack v15.X (ce sujet)** | ✅ Gmail API | ✅ **Gmail du user** | ✅ | ✅ **zéro stockage relais** |

## Notes utilisateur

> 💬 2026-05-18 : « comment on connecte une adresse mail à ImmoTrack pour un envoi directement depuis l'app ? »

## Journal

- 2026-05-18 : créé en P1 V1.1 · 4 phases identifiées (~6-8h Phase 1+2+3, +3h Phase 4 Microsoft V1.2) · décision D1-D5 à arbitrer en session dédiée · solution recommandée Gmail API OAuth en leverage de l'OAuth Drive existant