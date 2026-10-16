// js/core/pilotage-lot.js — « Qu'y a-t-il à piloter sur ce lot aujourd'hui ? » (Accueil, tableau « Pilotage du parc »).
// Module PUR, testé (__tests__/helpers/pilotage-lot.test.js) ; miroir IIFE window.PilotageLot
// (js/helpers/pilotage-lot.global.js, régénéré par tools/sync-helpers-global-mirrors.mjs).
//
// Décisions de Didier (15-16/10/2026, mockups/MATRICE-ACCUEIL/MAQUETTE-PILOTAGE.html) :
//   - colonnes : Loyer · Assurance · Entretiens · Révision · Mise en location ; rien d'autre ;
//   - une icône SEULEMENT si une action est due, case vide sinon ; le clic sur l'icône dit quoi et mène au geste ;
//   - Bail / EDL / Diagnostics / Caution ne sont plus des colonnes : ils vivent dans « Mise en location », pour un lot
//     vide, dont le locataire a donné congé (dès le congé reçu), ou dont le bail est en préparation ;
//   - Assurance : expirée ou manquante (plus d'alerte « expire dans 30 jours ») ; Entretiens : en retard ;
//     Révision : due (plus de « préavis 45 jours »).
// Le module ne lit AUCUNE base : l'app lui passe des faits déjà résolus par ses moteurs (bail, EDL, impayés,
// tâches unifiées, candidatures, caution, diagnostics).
//
// ⚠️ Pas d'import : le module est recopié tel quel dans son miroir IIFE.

/** Colonnes du tableau, dans l'ordre (la colonne « Loyer · paiement » les précède toujours). */
export const COLONNES = [
  { k: 'ass', l: 'Assurance' },
  { k: 'entr', l: 'Entretiens' },
  { k: 'irl', l: 'Révision' },
  { k: 'loc', l: 'Mise en location' },
]

/** Titre de la bulle d'une case. */
export const TITRES = { loyer: 'Loyer', ass: 'Assurance', entr: 'Entretiens', irl: 'Révision', loc: 'Mise en location' }

/** Un bail reste « en préparation » jusqu'à 60 jours après l'entrée s'il manque la signature ou l'EDL d'entrée. */
export const FENETRE_ENTREE_JOURS = 60

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DIAG = { dpe: 'DPE', crep: 'plomb', amiante: 'amiante', gaz: 'gaz', elec: 'électricité', erp: 'ERP', termites: 'termites', merule: 'mérule', bruit: 'bruit' }
const ISO = /^(\d{4})-(\d{2})-(\d{2})/

function jour(s) { const m = ISO.exec(String(s == null ? '' : s)); return m ? m[0] : '' }

/** Écart en jours entre deux dates 'AAAA-MM-JJ' (b − a) ; null si l'une manque. */
export function ecartJours(a, b) {
  const x = jour(a), y = jour(b)
  if (!x || !y) return null
  return Math.round((Date.parse(y + 'T12:00:00Z') - Date.parse(x + 'T12:00:00Z')) / 864e5)
}

/** 'AAAA-MM-JJ' → 'JJ/MM/AAAA'. */
export function dateFr(iso) { const m = ISO.exec(String(iso == null ? '' : iso)); return m ? m[3] + '/' + m[2] + '/' + m[1] : '' }

/**
 * Phase du lot.
 * @param {{today:string, loue:boolean, bail:null|{debut?:string, sig?:string, dateSortie?:string}, edlEntree?:boolean}} f
 *   sig = état de signature (BailSignatureEtat : 'non' | 'partiel' | 'electronique' | 'externe') ;
 *   dateSortie = date de sortie du congé enregistré (bail.depart.dateSortie).
 *   Un bail loué SANS date d'entrée (la date n'est pas obligatoire à l'enregistrement) est une fiche incomplète : il est
 *   « en cours » (rien ne permet de dater une saisie en cours ; _modifiedAt bouge à chaque révision ou migration), sauf
 *   signature commencée dans Propryo.
 * @returns {'relocation'|'preparation'|'en-cours'}
 */
export function phaseDuLot(f) {
  const o = f || {}
  const b = o.bail
  if (!o.loue || !b) return 'relocation'
  if (jour(b.dateSortie)) return 'relocation'                       // congé reçu (D2, 16/10)
  const debut = jour(b.debut)
  if (!debut) return b.sig === 'partiel' ? 'preparation' : 'en-cours'
  if (debut > jour(o.today) || b.sig === 'partiel') return 'preparation'
  const e = ecartJours(debut, o.today)
  if (e != null && e <= FENETRE_ENTREE_JOURS && (b.sig === 'non' || !b.sig || !o.edlEntree)) return 'preparation'
  return 'en-cours'
}

/** La plus récente des échéances d'attestation ('' si aucune). */
export function derniereEcheance(echeances) {
  return (Array.isArray(echeances) ? echeances : []).map(jour).filter(Boolean).sort().pop() || ''
}

const ligne = (texte, gestes) => ({ texte, gestes })
const g = (geste, libelle) => ({ geste, libelle })

/**
 * Les cases du lot : null = rien à faire ; sinon une liste de lignes { texte, gestes:[{geste, libelle}] }.
 * @param {object} f faits résolus par l'app :
 *   today, phase (phaseDuLot), fmt (montant → texte, facultatif)
 *   impaye        : null | { reste:number, depuisYm?:'AAAA-MM' }           (bail ouvert seulement)
 *   enPlace       : le locataire est entré dans les lieux (bail loué, début ≤ aujourd'hui)
 *   assurance     : null | { etat:'manquante'|'expiree', echeance? }       (moteur des alertes)
 *   entretiens    : [{ libelle, retardJours }]                              (en retard seulement)
 *   revision      : null | { dateAnniv, hc, nouveauHC }                     (due seulement)
 *   vacant        : le lot n'est pas loué
 *   dateSortie    : date de sortie du congé reçu ('' sinon)
 *   candidats     : { retenus:number, aEtudier:number }
 *   bail          : null | { debut, sig, repris }   (repris = bail repris à l'achat, art. 1743)
 *   edlEntree     : l'EDL d'entrée du bail est classé
 *   cautions      : noms des garants dont l'acte de cautionnement n'est pas détenu
 *   attestations  : échéances des attestations du lot
 *   diagnostics   : clés des diagnostics manquants ou expirés à la date de conclusion
 */
export function casesDuLot(f) {
  const o = f || {}
  const fmt = typeof o.fmt === 'function' ? o.fmt : (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €'
  const today = jour(o.today)
  const out = { loyer: null, ass: null, entr: null, irl: null, loc: null }
  if (o.impaye && Number(o.impaye.reste) > 0.5) {
    const ym = String(o.impaye.depuisYm || '')
    const mois = /^\d{4}-\d{2}$/.test(ym) ? ' depuis ' + MOIS[Number(ym.slice(5, 7)) - 1] + (ym.slice(0, 4) !== today.slice(0, 4) ? ' ' + ym.slice(0, 4) : '') : ''
    out.loyer = [ligne('Impayé : ' + fmt(o.impaye.reste) + mois + '.', [g('loyer', 'Voir le suivi du loyer')])]
  }
  if (o.enPlace) {
    if (o.assurance && o.assurance.etat === 'manquante') out.ass = [ligne('Aucune attestation d’assurance habitation.', [g('ass', 'Ajouter l’attestation')])]
    else if (o.assurance && o.assurance.etat === 'expiree') out.ass = [ligne('Attestation expirée' + (jour(o.assurance.echeance) ? ' le ' + dateFr(o.assurance.echeance) : '') + '.', [g('ass', 'Ajouter l’attestation')])]
    const e = (Array.isArray(o.entretiens) ? o.entretiens : []).filter(x => x && x.libelle)
    if (e.length) out.entr = e.map(x => ligne(String(x.libelle) + ' : en retard' + (Number(x.retardJours) > 0 ? ' de ' + Math.round(x.retardJours) + ' jours' : '') + '.', [g('entr', 'Planifier l’entretien')]))
    if (o.revision) {
      const r = o.revision
      const montants = (r.nouveauHC != null && r.hc != null) ? ' : ' + fmt(r.hc) + ' → ' + fmt(r.nouveauHC) + ' hors charges' : ''
      out.irl = [ligne('Révision due' + (jour(r.dateAnniv) ? ' depuis le ' + dateFr(r.dateAnniv) : '') + montants + '.', [g('irl', 'Réviser le loyer')])]
    }
  }
  if (o.phase === 'relocation' || o.phase === 'preparation') {
    const L = []
    const c = o.candidats || {}
    const cand = () => (c.retenus > 0 ? ligne('Candidat retenu : bail à établir.', [g('vacant', 'Établir le bail')])
      : c.aEtudier > 0 ? ligne(c.aEtudier + ' candidature' + (c.aEtudier > 1 ? 's' : '') + ' à étudier.', [g('vacant', 'Voir les candidatures')]) : null)
    if (o.phase === 'relocation') {
      if (!o.vacant && jour(o.dateSortie)) L.push(ligne('Départ du locataire le ' + dateFr(o.dateSortie) + '.', [g('vacant', 'Relouer')]))
      const lc = cand()
      if (lc) L.push(lc)
      else if (o.vacant) L.push(ligne('Aucun candidat.', [g('vacant', 'Relouer')]))
    } else {
      const b = o.bail || {}
      // Bail entré depuis plus de 60 jours (signature commencée et jamais finie) : seule la signature reste à suivre ; l'EDL
      // d'entrée et la caution ne se réclament plus.
      const e = ecartJours(b.debut, today)
      const ancien = e != null && e > FENETRE_ENTREE_JOURS
      if (b.sig === 'partiel') L.push(ligne('Bail : signature du locataire en attente.', [g('bail', 'Ouvrir le bail')]))
      else if (b.sig !== 'electronique' && b.sig !== 'externe') {
        // Bail repris à l'achat (art. 1743) : rien à signer, ce sont les pièces du vendeur à classer.
        if (b.repris) L.push(ligne('Bail du vendeur à classer.', [g('bail-papier', 'Classer le bail du vendeur'), g('bail', 'Ouvrir le bail')]))
        else L.push(ligne('Bail à signer' + (jour(b.debut) ? ' (entrée le ' + dateFr(b.debut) + ')' : '') + '.', [g('bail', 'Ouvrir le bail'), g('bail-papier', 'Signé sur papier')]))
      }
      if (!ancien) {
        if (!o.edlEntree) {
          if (b.repris) L.push(ligne('État des lieux du vendeur à classer.', [g('edl-papier', 'Classer l’EDL du vendeur')]))
          else L.push(ligne('État des lieux d’entrée à faire.', [g('edl', 'Faire l’EDL'), g('edl-papier', 'Fait sur papier')]))
        }
        ;(Array.isArray(o.cautions) ? o.cautions : []).filter(Boolean).forEach(nom => L.push(ligne('Acte de cautionnement de ' + nom + ' à classer.', [g('caut', 'Classer l’acte')])))
        if (jour(b.debut) > today && derniereEcheance(o.attestations) < jour(b.debut)) L.push(ligne('Attestation d’assurance à recevoir avant l’entrée.', [g('ass', 'Ajouter l’attestation')]))
      }
    }
    const d = (Array.isArray(o.diagnostics) ? o.diagnostics : []).filter(Boolean)
    if (d.length) L.push(ligne('Diagnostic' + (d.length > 1 ? 's' : '') + ' à fournir : ' + d.map(k => DIAG[k] || k).join(', ') + '.', [g('diag', 'Compléter les diagnostics')]))
    if (L.length) out.loc = L
  }
  return out
}

/** Le lot a-t-il au moins une chose à faire ? */
export function aFaire(cases) {
  return !!cases && Object.keys(cases).some(k => Array.isArray(cases[k]) && cases[k].length > 0)
}
