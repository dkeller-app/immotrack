// Liste des annexes affichée AVANT la page des signatures (30/09, validé Didier). PUR : aucune I/O.
//
// Entrée : le plan de lecture (readingPlanFor) — `annexStart` (1re page sans case, 0 = aucune),
// `pageCount`, et `annexes` = ce que l'app a DÉCLARÉ dans le manifeste :
//   { from, items: [{ label, ref?, statut: 'joint'|'hors_app'|'non_joint', docName?, from?, to? }] }
// Sortie : une entrée par annexe, dans l'ordre des pages, avec les pages du document qui la portent.
// Toute page d'annexe qu'aucune entrée ne revendique (ancien envoi, page de garde du DDT) forme une
// entrée de plus : aucune page du document signé n'échappe à la liste.

export const ANN_STATUTS = ['joint', 'hors_app', 'non_joint'];

const range = (a, b) => { const out = []; for (let p = a; p <= b; p++) out.push(p); return out; };

export function annexGroups(plan) {
  const N = (plan && plan.pageCount) || 0;
  const A = (plan && plan.annexStart) || 0;
  const m = plan && plan.annexes && typeof plan.annexes === 'object' ? plan.annexes : null;
  const inAnnex = (p) => A > 0 && Number.isInteger(p) && p >= A && p <= N;
  const covered = new Set();
  const out = [];

  for (const it of (m && Array.isArray(m.items) ? m.items : [])) {
    if (!it || typeof it !== 'object') continue;
    const statut = ANN_STATUTS.includes(it.statut) ? it.statut : 'non_joint';
    const pages = [];
    const from = Number(it.from), to = Number(it.to || it.from);
    if (statut === 'joint' && inAnnex(from)) {
      const end = Number.isInteger(to) && to >= from ? Math.min(to, N) : from;
      for (const p of range(from, end)) if (!covered.has(p)) { pages.push(p); covered.add(p); }
    }
    out.push({
      label: String(it.label || 'Annexe').slice(0, 160),
      ref: it.ref ? String(it.ref).slice(0, 160) : '',
      docName: it.docName ? String(it.docName).slice(0, 160) : '',
      statut, pages
    });
  }

  // Pages d'annexe non revendiquées → entrées génériques (plages contiguës).
  if (A > 0) {
    const ddtCover = m && Number.isInteger(Number(m.from)) ? Number(m.from) : 0;
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const isCover = run.length === 1 && run[0] === ddtCover;
      out.push({
        label: isCover ? 'Page de garde du dossier de diagnostic technique' : 'Pages annexées au bail',
        ref: '', docName: '', statut: 'joint', pages: run
      });
      run = [];
    };
    for (let p = A; p <= N; p++) {
      if (covered.has(p)) flush(); else run.push(p);
    }
    flush();
  }

  // Ordre des pages ; les annexes sans page (remises hors application, non jointes) en dernier,
  // dans l'ordre déclaré. sort() est stable.
  return out.sort((a, b) => (a.pages.length ? a.pages[0] : Infinity) - (b.pages.length ? b.pages[0] : Infinity));
}

// Case « Je reconnais avoir reçu les annexes… » : due par un LOCATAIRE dès qu'il y a au moins une annexe
// jointe ou remise. Même règle que le serveur (sign-stamp.js annexesAckRequired), étendue aux pages
// d'annexe non déclarées (ancien envoi) : le locataire les a sous les yeux, il en accuse réception.
export function annexAckDue(side, groups) {
  return side === 'locataire' && Array.isArray(groups)
    && groups.some((g) => g.statut === 'joint' || g.statut === 'hors_app');
}
