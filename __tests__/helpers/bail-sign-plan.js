// __tests__/helpers/bail-sign-plan.js
// Pur : transforme la matrice de présence (fil rouge de signature unifié) en plan de signature.
// signers[] : { id, role:'bailleur'|'locataire', nom, mode:'pres'|'dist'|'no', email }
//   → { presentiels:[...ordonnés bailleur→locataire, stable], distants:[...], hasSigners:bool }
// Les 'no' (co-gérant exclu) sont écartés. L'ordre légal fait signer le(s) bailleur(s) avant le(s)
// locataire(s) ; à rôle égal, l'ordre d'entrée est préservé (tri stable).

const ROLE_ORDER = { bailleur: 0, locataire: 1 };

export function buildSignaturePlan(signers) {
  const active = (signers || []).filter(s => s && s.mode !== 'no');
  const presentiels = active
    .filter(s => s.mode === 'pres')
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ra = ROLE_ORDER[a.s.role] != null ? ROLE_ORDER[a.s.role] : 9;
      const rb = ROLE_ORDER[b.s.role] != null ? ROLE_ORDER[b.s.role] : 9;
      return ra - rb || a.i - b.i;   // ordre légal, puis ordre d'entrée (stable)
    })
    .map(x => x.s);
  const distants = active.filter(s => s.mode === 'dist');
  return { presentiels, distants, hasSigners: active.length > 0 };
}
