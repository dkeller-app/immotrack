// __tests__/helpers/anchor-accumulator.js
// Logique pure de capture d'ancres (mirroir de la logique inlinée dans la string popup de previewBailData).
export function makeAnchorAcc(remoteSign) {
  return { remoteSign: !!remoteSign, anchors: [] };
}
export function pushAnchor(acc, a) {
  if (!acc || !acc.remoteSign) return;
  if (!a || !a.sigId) return; // seuls les signataires à distance portent un sigId
  acc.anchors.push({ sigId: a.sigId, kind: a.kind, page: a.page, x: a.x, y: a.y, w: a.w, h: a.h, ...(a.luApprouve != null ? { luApprouve: a.luApprouve } : {}) });
}
