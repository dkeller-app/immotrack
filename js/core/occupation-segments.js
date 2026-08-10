// ─────────────────────────────────────────────────────────────────────────────
// occupation-segments.js — UNE seule vérité d'occupation d'un logement.
//
// Découpe la période [from,to] d'un logement en segments qui se suivent SANS
// trou ni chevauchement : chaque jour appartient à exactement un segment,
// soit « locataire », soit « vacant » (→ à la charge du bailleur).
//
// Règle de fin unique par bail :
//   finEff = dateSortie (déclarée & antérieure au terme) → sinon finEffective → sinon fin.
// C'est ce qui corrige la sur-facturation d'un partant : un départ déclaré mais
// non encore archivé (fin = terme du bail) est clippé à sa date de sortie réelle.
//
// Invariant garanti : Σ segment.occDays == totalDays.
//
// Fonction PURE (testée dans __tests__/helpers/occupation-segments.test.js).
// Généralise _ccLogOccupations d'index.html ; destinée à être consommée à
// l'identique par les 3 chemins de répartition (compteur / directe / immeuble).
// Réf : docs/superpowers/specs/2026-07-05-regul-vacance-depart-design.md §7
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000;

// UTC de bout en bout : évite le décalage off-by-one (parsing local vs toISOString UTC)
// et les surprises DST — les jours sont comptés proprement.
function _ms(d) { const [y, m, dd] = String(d).split('-').map(Number); return Date.UTC(y, m - 1, dd); }
function _iso(ms) {
  const dt = new Date(ms);
  return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
}

// Règle de fin unique. dateSortie peut être portée par b.dateSortie ou b.depart.dateSortie.
// Retourne une date ISO (YYYY-MM-DD) ou null (bail encore ouvert).
export function finEffOccupation(b) {
  const ds = (b && (b.dateSortie || (b.depart && b.depart.dateSortie))) || '';
  const fin = (b && (b.finEffective || b.fin)) || null;
  if (ds && (!fin || ds < fin)) return ds;
  return fin;
}

/**
 * @param {Array} bails  liste des baux du logement (courant + historique),
 *   chacun { debut, fin, finEffective?, dateSortie?/depart.dateSortie?, nom?, hc?, ch? }
 * @param {string} from  début de période ISO (YYYY-MM-DD)
 * @param {string} to    fin de période ISO (incluse)
 * @returns {{segments:Array, totalDays:number}}
 *   segment = { kind:'locataire'|'vacant', bailId, locataire, debut, fin, occDays, isBailleur, loc?, hc?, ch? }
 */
export function logOccupationSegments(bails, from, to) {
  const fromMs = _ms(from), toMs = _ms(to);
  const totalDays = Math.max(1, Math.round((toMs - fromMs) / DAY) + 1);
  const segments = [];

  const sorted = (bails || [])
    .filter(b => b && b.debut)
    .slice()
    .sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));

  let cursorMs = fromMs;
  for (const b of sorted) {
    const finE = finEffOccupation(b);
    const rawDebMs = _ms(b.debut);
    const rawFinMs = finE ? _ms(finE) : toMs;
    // Intersection avec [from,to] ET avec ce qui reste à couvrir (cursor) → pas de chevauchement.
    const segStart = Math.max(rawDebMs, cursorMs, fromMs);
    const segEnd = Math.min(rawFinMs, toMs);
    if (segEnd < segStart) continue; // hors fenêtre, incohérent, ou déjà couvert par un bail antérieur

    // Vacance (bailleur) avant ce bail
    if (segStart > cursorMs) {
      const vacDays = Math.round((segStart - cursorMs) / DAY);
      if (vacDays > 0) segments.push({
        kind: 'vacant', bailId: null, locataire: '—',
        debut: _iso(cursorMs), fin: _iso(segStart - DAY), occDays: vacDays, isBailleur: true,
      });
    }

    // Segment locataire
    const occDays = Math.round((segEnd - segStart) / DAY) + 1;
    segments.push({
      kind: 'locataire',
      bailId: b.bailId || (b._type === 'current' ? 'current' : 'hist'),
      locataire: b.nom || '—',
      debut: _iso(segStart), fin: _iso(segEnd), occDays, isBailleur: false,
      loc: b.nom || '', hc: b.hc, ch: b.ch,
    });
    cursorMs = segEnd + DAY;
  }

  // Vacance résiduelle après le dernier bail
  if (cursorMs <= toMs) {
    const vacDays = Math.round((toMs - cursorMs) / DAY) + 1;
    if (vacDays > 0) segments.push({
      kind: 'vacant', bailId: null, locataire: '—',
      debut: _iso(cursorMs), fin: to, occDays: vacDays, isBailleur: true,
    });
  }

  // Aucun bail du tout : toute la période est vacante (bailleur)
  if (segments.length === 0) segments.push({
    kind: 'vacant', bailId: null, locataire: '—',
    debut: from, fin: to, occDays: totalDays, isBailleur: true,
  });

  return { segments, totalDays };
}
