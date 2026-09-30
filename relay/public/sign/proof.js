// Mention légale tamponnée + objet preuve. PUR : aucune I/O.

export function formatDateFr(dateISO) {
  const d = new Date(dateISO);
  // Format stable indépendant de la locale du runtime : JJ/MM/AAAA HH:MM (UTC).
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function buildMentionLines({ signerName, role, dateISO }) {
  return [
    'Signé électroniquement',
    `par ${signerName} (${role})`,
    `« Lu et approuvé » — ${formatDateFr(dateISO)}`,
    'Consentement au procédé électronique donné.'
  ];
}

export function buildProofObject({
  signerName, role, sigId, dateISO, consentElectronic, luApprouve, openedAt, readCompletedAt, annexesRecuesAt
}) {
  return {
    sigId,
    signerName,
    role,
    signedAt: dateISO,
    consentElectronic: !!consentElectronic,
    luApprouve: !!luApprouve,
    // Horodatage par étape (§5 #3 du dossier de preuve) : ouverture du lien + fin de lecture.
    openedAt: openedAt || null,
    readCompletedAt: readCompletedAt || null,
    // Accusé de réception des annexes (DDT, loi 89-462 art. 3-3) — case obligatoire avant la signature.
    annexesRecuesAt: annexesRecuesAt || null
  };
}
