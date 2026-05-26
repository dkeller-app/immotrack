# EMAIL-OAUTH-INCREMENTAL — Réintégrer `gmail.send` en incremental authorization

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S (~1-2h)
**Détecté** : 2026-05-26 (session cleanup massif Drive)
**Lié à** : EMAIL-AUTO (v14.97), EMAIL-ONGLET-PERMANENT (v15.79), v15.189

## Contexte

Le bug « il faut toujours 2 connexions Google » qui persistait depuis v15.80 a été
diagnostiqué : le scope `gmail.send` dans `DRIVE_SCOPE` forçait Google à afficher
un écran granular consent à cases à cocher. Si l'user ne cochait pas TOUT au 1er
passage, GIS re-promptait → 2 popups OAuth consécutifs.

**Fix v15.189** : `gmail.send` retiré du scope par défaut.
**Conséquence** : envoi email direct via SMTP Gmail désactivé, l'app retombe sur
`mailto:` (comportement pré-v15.80).

## Objectif

Réimplémenter `gmail.send` en **incremental authorization** (pattern recommandé
Google) — demander le scope ON-DEMAND quand l'user clique « Envoyer maintenant »
la première fois, pas au login.

## Solution technique

### A. Helper `_requestGmailScope()`

```js
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'; // déjà extrait v15.189

let _gisGmailClient = null;
function _initGmailGisClient() {
  if (_gisGmailClient) return _gisGmailClient;
  _gisGmailClient = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: GMAIL_SEND_SCOPE,
    callback: (resp) => {
      if (resp.access_token) {
        _gmailToken = resp.access_token;
        _gmailTokenExp = Date.now() + ((+resp.expires_in||3600)-60)*1000;
        if (_gmailTokenCb) { _gmailTokenCb(); _gmailTokenCb = null; }
      }
    }
  });
  return _gisGmailClient;
}

let _gmailToken = null;
let _gmailTokenExp = 0;
let _gmailTokenCb = null;

function _gmailTokenValid() {
  return _gmailToken && Date.now() < _gmailTokenExp;
}

async function _requestGmailScope() {
  if (_gmailTokenValid()) return _gmailToken;
  return new Promise((resolve, reject) => {
    _gmailTokenCb = () => resolve(_gmailToken);
    try {
      _initGmailGisClient().requestAccessToken({
        prompt: '',
        include_granted_scopes: 'true'  // fusion avec scopes déjà accordés (drive.file etc.)
      });
    } catch (e) { reject(e); }
    setTimeout(() => { if (!_gmailTokenValid()) reject(new Error('timeout gmail.send')); }, 30000);
  });
}
```

### B. Bouton « Envoyer maintenant »

```js
async function _emailSendNow(payload) {
  try {
    const token = await _requestGmailScope();
    // ... appel API gmail.send avec token
  } catch (e) {
    // Fallback mailto si user refuse / annule
    _fallbackMailto(payload);
  }
}
```

### C. UI

Le bouton « Envoyer maintenant » reste **toujours visible** (pas de check scope au boot).
Au 1er clic, popup OAuth incremental → user accorde gmail.send → envoi direct.
Aux clics suivants, le token gmail.send est valide → envoi silencieux.

## Tests

- 1er login Drive → 1 seul popup OAuth (3 scopes simples, plus de granular consent)
- 1er clic « Envoyer maintenant » → popup OAuth incremental (gmail.send seul)
- 2e clic « Envoyer maintenant » dans la session → envoi direct sans popup
- Refresh page → token gmail.send perdu → re-demande au prochain clic (acceptable)

## Risques

- L'utilisateur doit cocher gmail.send au 2e popup → 2e clic = friction
- Si user refuse → fallback mailto OK
- Pas de bug data, juste UX 2-clics au 1er envoi
- Token gmail.send séparé du `_driveToken` → 2 cycles de refresh à gérer

## Journal
- 2026-05-26 : créé suite à fix v15.189 (retrait gmail.send du scope par défaut pour
  résoudre bug « 2 popups Google »). Implémentation reportée pour ne pas bloquer le fix.
