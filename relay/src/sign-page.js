import { computeSigId, sideOf } from '../public/sign/sigid.js';

// Version des assets statiques : suffixe `?v=` sur sign.css / sign.js pour forcer
// le rafraîchissement navigateur. Sans ça, Safari (et autres) réutilisent le CSS/JS
// en cache mémoire malgré `must-revalidate` lors d'un rechargement « doux ». À incrémenter
// à chaque modif de sign.css ou sign.js tant qu'on n'a pas de hash de contenu (déploiement).
const ASSET_VERSION = '3';

// Sérialise pour insertion dans <script> : échappe < pour neutraliser </script>.
function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

// Échappe une chaîne avant insertion dans du HTML (défense en profondeur pour les sinks innerHTML).
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function renderSignPage({ session, signToken }) {
  const idx = session.currentIndex;
  const signer = session.signers[idx];
  const data = {
    sigId: computeSigId(session.signers, idx),
    role: signer.role,
    side: sideOf(signer.role),
    bailRef: session.bailRef || '',
    rank: idx + 1,
    total: session.signers.length
  };
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Signature du bail</title>
<link rel="stylesheet" href="/sign.css?v=${ASSET_VERSION}">
</head>
<body>
<main id="app" aria-live="polite"><p id="boot">Chargement…</p></main>
<script>
window.__SIGN_TOKEN__ = ${jsonForScript(signToken)};
window.__SESSION_ID__ = ${jsonForScript(session.sessionId)};
window.__SIGN__ = ${jsonForScript(data)};
</script>
<script src="/vendor/pdf-lib.min.js"></script>
<script type="module" src="/sign.js?v=${ASSET_VERSION}"></script>
</body>
</html>`;
}

export function renderErrorPage(message, title = 'Signature du bail') {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title><link rel="stylesheet" href="/sign.css?v=${ASSET_VERSION}"></head>
<body><main id="app"><div class="state-card"><h1>${escHtml(message)}</h1></div></main></body>
</html>`;
}
