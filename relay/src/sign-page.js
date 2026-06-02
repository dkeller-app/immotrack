import { computeSigId, sideOf } from '../public/sign/sigid.js';

// Sérialise pour insertion dans <script> : échappe < pour neutraliser </script>.
function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
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
<link rel="stylesheet" href="/sign.css">
</head>
<body>
<main id="app" aria-live="polite"><p id="boot">Chargement…</p></main>
<script>
window.__SIGN_TOKEN__ = ${jsonForScript(signToken)};
window.__SESSION_ID__ = ${jsonForScript(session.sessionId)};
window.__SIGN__ = ${jsonForScript(data)};
</script>
<script src="/vendor/pdf-lib.min.js"></script>
<script type="module" src="/sign.js"></script>
</body>
</html>`;
}

export function renderErrorPage(message, title = 'Signature du bail') {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="/sign.css"></head>
<body><main id="app"><div class="state-card"><h1>${message}</h1></div></main></body>
</html>`;
}
