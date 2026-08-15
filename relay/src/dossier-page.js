const ASSET_VERSION = '1';

function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function renderDossierPage({ candidature, candidatToken }) {
  // Données strictement nécessaires au formulaire — AUCUN score Confiance (D7).
  const data = {
    bienLabel: candidature.bienLabel || '',
    loyer: candidature.loyer || 0,
    message: candidature.message || '',
    status: candidature.status,
    complementNote: candidature.complementNote || null,
    // Reprise (D13) : on renvoie le dossier déjà saisi + la liste des pièces (méta only).
    dossier: candidature.dossier || null,
    pieces: (candidature.pieces || []).map((p) => ({ pieceId: p.pieceId, categorie: p.categorie, filename: p.filename }))
  };
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Déposer mon dossier de location</title>
<link rel="stylesheet" href="/dossier.css?v=${ASSET_VERSION}">
</head>
<body>
<main id="app" aria-live="polite"><p id="boot">Chargement…</p></main>
<script>
window.__CAND_TOKEN__ = ${jsonForScript(candidatToken)};
window.__LINK_ID__ = ${jsonForScript(candidature.linkId)};
window.__CAND__ = ${jsonForScript(data)};
</script>
<script type="module" src="/dossier.js?v=${ASSET_VERSION}"></script>
</body>
</html>`;
}

export function renderDossierError(message, title = 'Dossier de location') {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title><link rel="stylesheet" href="/dossier.css?v=${ASSET_VERSION}"></head>
<body><main id="app"><div class="state-card"><h1>${escHtml(message)}</h1></div></main></body>
</html>`;
}
