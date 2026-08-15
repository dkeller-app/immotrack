// Convention d'identifiant de signataire. PUR : aucune dépendance, aucun window.
// Contrat partagé avec genPDFNative (composant 3) qui embarque les mêmes sigId dans le manifeste.

export function sideOf(role) {
  return /locat|preneur/i.test(role || '') ? 'locataire' : 'bailleur';
}

export function computeSigId(signers, index) {
  if (!Array.isArray(signers) || index < 0 || index >= signers.length) {
    throw new Error('computeSigId: index hors borne');
  }
  const side = sideOf(signers[index].role);
  let rank = 0;
  for (let i = 0; i < index; i++) {
    if (sideOf(signers[i].role) === side) rank++;
  }
  const prefix = side === 'locataire' ? 'loc' : 'bailleur';
  return `${prefix}-${rank}`;
}
