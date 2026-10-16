// BAIL-EN-COURS-SIGNE-HORS-PROPRYO étape 2 — « Modifier le bail » : case « Bail signé en dehors de Propryo », déclaration,
// re-déclaration, décoche, ordre dans saveBail, badges, carte Documents, matrice. On exécute le VRAI code de js/app/app-part{1,2}.js
// (fonctions extraites par nom, évaluées dans un vm), jamais une réplique.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as BSE from '../../js/core/bail-signature-etat.js'
import * as PilotageLot from '../../js/core/pilotage-lot.js'
import { CHAMPS_BAIL, CHAMPS_VIE, cheminAutorise, diffModificationsBail } from '../../js/core/bail-modifications.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')

function extraire(src, marqueur) {
  const i = src.indexOf(marqueur)
  if (i < 0) throw new Error('introuvable : ' + marqueur)
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error('accolades non équilibrées : ' + marqueur)
}
const fn = (src, nom) => extraire(src, 'function ' + nom + '(')

// Monde de test : un formulaire minimal (el/v), un DB, le vrai module d'état, les vraies fonctions du chantier.
function monde({ form = {}, baux = {}, logements = [{ ref: 'D-101' }], extra = {} } = {}) {
  const champs = {}
  for (const [id, val] of Object.entries(form)) champs[id] = typeof val === 'boolean' ? { checked: val } : { value: val }
  const toasts = [], confirms = [], reponses = []
  const sandbox = {
    DB: { baux, logements, entites: [] }, window: { BailSignatureEtat: BSE, __immoCloudInfo: { displayName: 'Didier' } },
    el: (id) => champs[id] || null, v: (id) => String((champs[id] && champs[id].value) || '').trim(),
    fd: (s) => String(s).slice(0, 10).split('-').reverse().join('/'), td: () => '2026-10-06', _todayIsoLocal: () => '2026-10-06',
    confirm2: (m) => { confirms.push(m); return reponses.length ? reponses.shift() : true },
    showToast: (m, t) => toasts.push([m, t]), _appUserName: () => 'Didier', _captureBailSnapshot: () => {},
    Date, JSON, Array, Object, String, Number, console, ...extra,
  }
  vm.createContext(sandbox)
  vm.runInContext('let _bailExtApprox = false;\n' + ['_bailEtatSig', '_bailAuteurCourant', '_bailExterneIntention', '_bailExterneConfirmer', '_bailExterneAppliquer'].map(n => fn(P1, n)).join('\n'), sandbox)
  sandbox.setApprox = (b) => vm.runInContext('_bailExtApprox = ' + !!b, sandbox)
  return Object.assign(sandbox, { toasts, confirms, reponses, champs })
}
const ELEC = () => ({ ref: 'D-101', debut: '2024-03-01', signatures: { signedAt: '2024-02-20T10:00:00Z', mode: 'avec-locataire', finales: { a: 'data:x' } } })
const EXT = () => ({ ref: 'D-101', debut: '2024-03-01', signatures: BSE.declarerSignatureExterne({}, { date: '2024-02-20', now: '2026-10-06T08:00:00Z' }) })

describe('_bailExterneIntention — la case est une INTENTION lue sur le formulaire', () => {
  it('bail non signé + case cochée + date → déclarer', () => {
    const w = monde({ form: { 'b-externe': true, 'b-dateSignature': '2024-02-20' }, baux: { 'D-101': { ref: 'D-101' } } })
    expect(w._bailExterneIntention('D-101')).toMatchObject({ action: 'declarer', date: '2024-02-20', prevEtat: 'non', erreur: '' })
  })
  it('création (pas de edit-ref) : déclarer', () => {
    expect(monde({ form: { 'b-externe': true, 'b-dateSignature': '2024-02-20' } })._bailExterneIntention('').action).toBe('declarer')
  })
  it('date vide → erreur, jamais de date inventée', () => {
    const w = monde({ form: { 'b-externe': true, 'b-dateSignature': '' }, baux: { 'D-101': { ref: 'D-101' } } })
    const r = w._bailExterneIntention('D-101')
    expect(r.erreur).toMatch(/date de signature est requise/)
    expect(r.action).toBe('declarer')
  })
  it('case décochée sur un bail non signé : rien', () => {
    expect(monde({ form: { 'b-externe': false, 'b-dateSignature': '2024-02-20' }, baux: { 'D-101': { ref: 'D-101' } } })._bailExterneIntention('D-101').action).toBeNull()
  })
  it('bail déjà externe : même date → rien ; autre date → redater ; case décochée → retirer', () => {
    const baux = { 'D-101': EXT() }
    expect(monde({ form: { 'b-externe': true, 'b-dateSignature': '2024-02-20' }, baux })._bailExterneIntention('D-101').action).toBeNull()
    expect(monde({ form: { 'b-externe': true, 'b-dateSignature': '2024-02-18' }, baux })._bailExterneIntention('D-101')).toMatchObject({ action: 'redater', prevDate: '2024-02-20' })
    expect(monde({ form: { 'b-externe': false, 'b-dateSignature': '2024-02-20' }, baux })._bailExterneIntention('D-101').action).toBe('retirer')
  })
  it('bail signé ÉLECTRONIQUEMENT : la case ne fait rien (même cochée par une manipulation)', () => {
    const w = monde({ form: { 'b-externe': true, 'b-dateSignature': '2024-02-20' }, baux: { 'D-101': ELEC() } })
    expect(w._bailExterneIntention('D-101')).toMatchObject({ action: null, prevEtat: 'electronique' })
    const w2 = monde({ form: { 'b-externe': false }, baux: { 'D-101': ELEC() } })
    expect(w2._bailExterneIntention('D-101').action).toBeNull()   // et décocher ne retire jamais une vraie signature
  })
  it('signature partielle (bailleur seul) : on peut déclarer (la signature partielle est archivée à l\'application)', () => {
    const b = { ref: 'D-101', signatures: { signedAt: '2026-09-20T10:00:00Z', mode: 'bailleur-seul' } }
    expect(monde({ form: { 'b-externe': true, 'b-dateSignature': '2026-09-01' }, baux: { 'D-101': b } })._bailExterneIntention('D-101')).toMatchObject({ action: 'declarer', prevEtat: 'partiel' })
  })
  it('tombstone : traité comme un bail absent', () => {
    expect(monde({ form: { 'b-externe': true, 'b-dateSignature': '2024-02-20' }, baux: { 'D-101': { _deleted: true } } })._bailExterneIntention('D-101').prevEtat).toBe('non')
  })
  it('« Prendre la date de début » → date approximative reportée dans l\'intention', () => {
    const w = monde({ form: { 'b-externe': true, 'b-dateSignature': '2024-03-01' }, baux: { 'D-101': { ref: 'D-101' } } })
    w.setApprox(true)
    expect(w._bailExterneIntention('D-101').approx).toBe(true)
    w.setApprox(false)
    expect(w._bailExterneIntention('D-101').approx).toBe(false)
  })
})

describe('_bailExterneAppliquer — mutation du bail en construction (rien n\'est détruit)', () => {
  const ext = (o) => ({ action: 'declarer', date: '2024-02-20', prevEtat: 'non', prevDate: null, approx: false, ...o })
  it('déclarer : signatures externe, snapshot des termes enregistrés, dateSignaturePrevue, aucune preuve', () => {
    const w = monde()
    const bail = { ref: 'D-101', hc: 650, locataires: [{ nom: 'A' }], typeContrat: 'repris' }
    w._bailExterneAppliquer(bail, null, ext(), 'D-101')
    expect(bail.signatures.mode).toBe('externe')
    expect(bail.signatures.externe).toMatchObject({ date: '2024-02-20', origine: 'repris', declarePar: 'Didier' })
    expect(bail.signatures.bailSnapshot.hc).toBe(650)
    expect(bail.signatures.bailSnapshot).not.toHaveProperty('signatures')
    expect(bail.dateSignaturePrevue).toBe('2024-02-20')
    for (const k of ['finales', 'paraphes', 'proof', 'contentHash', 'cloudPdfKey', 'certRef', 'locked', 'contentHashTerms']) expect(bail.signatures).not.toHaveProperty(k)
    expect(bail).not.toHaveProperty('signaturesAnnulees')
  })
  it('déclarer capture le snapshot du logement (_captureBailSnapshot) quand le logement existe', () => {
    const appels = []
    const w = monde({ extra: { _captureBailSnapshot: (ref, b, l) => appels.push([ref, l.ref]) } })
    w._bailExterneAppliquer({ ref: 'D-101' }, null, ext(), 'D-101')
    expect(appels).toEqual([['D-101', 'D-101']])
  })
  it('déclarer sur une signature partielle + session à distance : archivées (remplace-par-externe), pas écrasées en silence', () => {
    const w = monde()
    const ancien = { ref: 'D-101', signatures: { signedAt: '2026-09-20T10:00:00Z', mode: 'bailleur-seul', finales: { b: 'data:x' }, remoteSession: { createdAt: '2026-09-20T10:01:00Z', signers: [{ role: 'locataire', nom: 'M. X' }] } } }
    const bail = { ref: 'D-101', signatures: ancien.signatures }
    w._bailExterneAppliquer(bail, ancien, ext({ prevEtat: 'partiel' }), 'D-101')
    expect(bail.signatures.mode).toBe('externe')
    expect(bail.signatures).not.toHaveProperty('remoteSession')
    expect(bail.signaturesAnnulees).toHaveLength(1)
    expect(bail.signaturesAnnulees[0]).toMatchObject({ motif: 'remplace-par-externe' })
    expect(bail.signaturesAnnulees[0].signatures.finales.b).toBe('data:x')
    expect(bail.signaturesAnnulees[0].resume.signataires[0].nom).toBe('M. X')
  })
  it('redater : l\'ancienne déclaration est archivée (externe-redate), la nouvelle est NEUVE (ni empreinte ni verrou hérités)', () => {
    const w = monde()
    const ancien = EXT(); Object.assign(ancien.signatures, { contentHashTerms: 'a'.repeat(64), locked: true })
    const bail = { ref: 'D-101', signatures: ancien.signatures }
    w._bailExterneAppliquer(bail, ancien, ext({ action: 'redater', date: '2024-02-18', prevEtat: 'externe', prevDate: '2024-02-20' }), 'D-101')
    expect(bail.signatures.signedAt).toBe('2024-02-18T12:00:00.000Z')
    expect(bail.signatures).not.toHaveProperty('contentHashTerms')   // sinon sealSignedBaux garderait l'ancienne empreinte (§2.3)
    expect(bail.signatures).not.toHaveProperty('locked')
    expect(bail.signaturesAnnulees.map(a => a.motif)).toEqual(['externe-redate'])
    expect(bail.signaturesAnnulees[0].signatures.contentHashTerms).toBe('a'.repeat(64))   // l'ancienne est intacte dans l'archive
  })
  it('retirer : signatures supprimées, déclaration archivée (externe-retire) ; les archives précédentes sont conservées', () => {
    const w = monde()
    const ancien = EXT(); ancien.signaturesAnnulees = [{ motif: 'externe-redate', signatures: {} }]
    const bail = { ref: 'D-101', signatures: ancien.signatures, signaturesAnnulees: ancien.signaturesAnnulees }
    w._bailExterneAppliquer(bail, ancien, ext({ action: 'retirer', prevEtat: 'externe' }), 'D-101')
    expect(bail).not.toHaveProperty('signatures')
    expect(bail.signaturesAnnulees.map(a => a.motif)).toEqual(['externe-redate', 'externe-retire'])
    expect(bail.signaturesAnnulees[1].signatures.mode).toBe('externe')
    expect(ancien.signaturesAnnulees).toHaveLength(1)   // l'objet existant n'est pas muté
  })
  it('sans action : rien', () => {
    const bail = { ref: 'D-101' }
    monde()._bailExterneAppliquer(bail, null, { action: null }, 'D-101')
    expect(bail).toEqual({ ref: 'D-101' })
  })
})

describe('_bailExterneConfirmer — jamais d\'écriture sans confirmation', () => {
  const e = (o) => ({ action: 'declarer', date: '2024-02-20', approx: false, prevDate: '2024-02-20', ...o })
  it('déclarer : le texte dit qu\'aucune signature électronique n\'est créée ; refus → false', () => {
    const w = monde(); w.reponses.push(false)
    expect(w._bailExterneConfirmer(e(), { ref: 'D-101' })).toBe(false)
    expect(w.confirms[0]).toMatch(/aucune signature électronique/)
    expect(w.confirms[0]).toMatch(/20\/02\/2024/)
  })
  it('date approximative mentionnée', () => {
    const w = monde(); w._bailExterneConfirmer(e({ approx: true }), null)
    expect(w.confirms[0]).toMatch(/date approximative/)
  })
  it('signature en cours (partielle / à distance) : annoncée comme archivée', () => {
    const w = monde(); w._bailExterneConfirmer(e(), { signatures: { signedAt: 'x', mode: 'bailleur-seul' } })
    expect(w.confirms[0]).toMatch(/archivée/)
  })
  it('date dans le futur : confirmation supplémentaire, refus → false avant la confirmation principale', () => {
    const w = monde(); w.reponses.push(false)
    expect(w._bailExterneConfirmer(e({ date: '2027-01-01' }), null)).toBe(false)
    expect(w.confirms).toHaveLength(1)
    expect(w.confirms[0]).toMatch(/dans le futur/)
  })
  it('retirer : le PDF déposé reste, la déclaration est conservée', () => {
    const w = monde(); w._bailExterneConfirmer(e({ action: 'retirer' }), null)
    expect(w.confirms[0]).toMatch(/conservée dans l'historique/)
    expect(w.confirms[0]).toMatch(/PDF déposé reste/)
  })
  it('redater : l\'ancienne déclaration est archivée', () => {
    const w = monde(); w._bailExterneConfirmer(e({ action: 'redater' }), null)
    expect(w.confirms[0]).toMatch(/archivée/)
  })
})

describe('saveBail — ordre et garde-fous (source du vrai code)', () => {
  const S = extraire(P1, 'function saveBail(')
  it('la déclaration est appliquée AVANT la branche journal (§2.4) et la branche journal est sautée quand une action est en cours', () => {
    const iApp = S.indexOf('_bailExterneAppliquer(bail, _existantHeritable, _ext, ref')
    const iJournal = S.indexOf('const _BM = window.BailModifs')
    const iPreserve = S.indexOf('_preserverBailExistant(bail, DB.baux[ref], isNewBail)')
    expect(iPreserve).toBeGreaterThan(0)
    expect(iApp).toBeGreaterThan(iPreserve)       // APRÈS l'application des autres champs du formulaire
    expect(iApp).toBeLessThan(iJournal)           // AVANT le journal
    expect(S).toMatch(/!_resetSignaturesAfterSave && !_ext\.action && _BM/)
  })
  it('l\'intention est lue en tête, avant tout effet de bord (archiverBail) ; la confirmation précède archiverBail', () => {
    expect(S.indexOf('_bailExterneIntention(')).toBeLessThan(S.indexOf('archiverBail(ref, _debut)'))
    expect(S.indexOf('_bailExterneConfirmer(')).toBeLessThan(S.indexOf('archiverBail(ref, _debut)'))
  })
  it('un bail externe n\'est jamais « réinitialisé » par le contrôle de composition (§ v13.11)', () => {
    expect(S).toMatch(/!dbBail\.signatures\.locked && dbBail\.signatures\.mode !== 'externe'/)
  })
  it('déclarer ne déclenche ni le contrôle DDT (dû à la signature) ni l\'alerte visa expiré', () => {
    expect(S).toMatch(/_ext\.action !== 'declarer'\s*\/\/[^\n]*\n\s*&& _ddtControleSaveBail/)
    expect(S).toMatch(/_vc\.expire && _ext\.action !== 'declarer'/)
  })
  it('la confirmation du journal dit « Bail signé hors Propryo » pour un bail externe', () => {
    expect(S).toMatch(/_sgPrev\.mode === 'externe' \? 'Bail signé hors Propryo' : 'Bail signé'/)
  })
})

describe('la case n\'est PAS un champ du bail : jamais dans le journal', () => {
  it('ni externe, ni signatures, ni signaturesAnnulees dans CHAMPS_BAIL / CHAMPS_VIE', () => {
    for (const k of ['externe', 'signatures', 'signaturesAnnulees', 'dateSignaturePrevue', 'b-externe']) {
      expect(Object.keys(CHAMPS_BAIL), k).not.toContain(k)
      expect(Object.keys(CHAMPS_VIE), k).not.toContain(k)
    }
  })
  it('cheminAutorise refuse toujours signatures.externe (la déclaration est figée)', () => {
    for (const c of ['signatures.externe', 'signatures.externe.date', 'signatures.mode', 'signatures.signedAt', 'signaturesAnnulees']) {
      expect(cheminAutorise(c), c).toBe(false)
    }
  })
  it('diffModificationsBail ignore déclaration et archives', () => {
    const avant = { hc: 600, signatures: { mode: 'externe' } }
    const apres = { hc: 600, signatures: { mode: 'externe', externe: { date: '2025-01-01' } }, signaturesAnnulees: [{}] }
    expect(diffModificationsBail(avant, apres)).toEqual([])
  })
})

describe('affichage : badges, carte Documents, matrice', () => {
  it('fiche du logement : « Signé hors Propryo » pour un bail externe, « Signé bilatéralement » sinon', () => {
    expect(P2).toMatch(/sigMode === 'externe'\s*\n?\s*\? '<span class="logf-badge b-ok"[^]*Signé hors Propryo/)
    expect(P2).toContain("' Signé bilatéralement</span>'")
  })
  it('rBaux : badge « Signé hors Propryo »', () => {
    expect(P1).toMatch(/mode === 'externe'\s*\n?\s*\? ` <span class="badge grn loc-nom-badge"[^`]*Signé hors Propryo/)
  })
  it('carte Documents › Bail : titre « Bail signé hors Propryo — locataire »', () => {
    expect(P2).toMatch(/_sigExt \? 'Bail signé hors Propryo' : 'Bail signé'\} — /)
  })
  it('aperçus : un bail externe n\'ouvre jamais « tel que signé » (snapshot) ni un PDF signé archivé', () => {
    // (étape 3 : le PDF déposé s'ouvre d'abord, s'il existe ; sinon le document établi par Propryo, avec son bandeau)
    expect(extraire(P1, 'function previewSignedBailRef(')).toMatch(/mode === 'externe'\) \{ if \(_bailScanExterne\(ref, bail\)\) \{[^}]*\} previewBailData\(bail, log, ref\); return; \}/)
    expect(extraire(P1, 'function previewBailRef(')).toMatch(/mode === 'externe'\) \{ if \(_bailScanExterne\(ref, bail\)\) \{[^}]*\} previewBailData\(bail, log, ref\); return; \}/)
    expect(P1).toMatch(/document établi par Propryo|document \\u00e9tabli par Propryo/)
  })
  it('l\'aperçu d\'un bail externe n\'offre ni « Démarrer signature » ni « PDF »', () => {
    expect(P1).toMatch(/\(_bailExterne\?'':'<button class="btn-wiz"/)
    expect(P1).toMatch(/\(_bailExterne\?'':'<button class="btn-natif"/)
  })
  it('resetBailSignatures : un bail externe est « retiré » (archivé), jamais effacé', () => {
    const R = extraire(P1, 'function resetBailSignatures(')
    expect(R).toMatch(/mode === 'externe'/)
    expect(R).toMatch(/_bailExterneAppliquer\(bail, bail, ext, ref\)/)
  })

  // Pilotage du parc (Accueil, MATRICE-ACCUEIL 16/10) : le vrai _pilLotLigne + le module PilotageLot. Un bail EN COURS (repris
  // ou signé sur papier avant Propryo) ne réclame plus rien à vie ; un bail en préparation dit ce qui manque.
  function ligne(bail, edl = []) {
    const sb = {
      DB: { baux: { 'R-1': bail }, edl, logements: [], documents: [] }, window: { BailSignatureEtat: BSE, PilotageLot },
      Date, String, Object, Array, Number, RegExp,
      _lotEstLoue: () => true, _lotBailOuvert: () => true, _ddtComplet: () => ({ complet: true, manquants: [], expires: [] }),
    }
    vm.createContext(sb)
    vm.runInContext(['_pilLotLigne'].map(n => fn(P1, n)).join('\n') + '\n' + fn(P1, '_bailSuivantDebut') + '\n'
      + ['_edlSens', '_edlEntreeDuBail'].map(n => fn(P2, n)).join('\n'), sb)
    return sb._pilLotLigne({ ref: 'R-1', id: 1 }, null, '2026-10-06', null, null)
  }
  const eEntree = [{ logement: 'R-1', type: 'Entrée', date: '2019-05-01' }]
  const repris = (sg) => ({ ref: 'R-1', debut: '2019-05-01', typeContrat: 'repris', ...(sg ? { signatures: sg } : {}) })
  it('bail REPRIS en cours, jamais déclaré : plus aucune réclamation à vie (ni bail, ni EDL, ni caution)', () => {
    const r = ligne(repris(), [])
    expect(r.phase).toBe('en-cours')
    expect(r.cases.loc).toBeNull()
    expect(r.aFaire).toBe(false)
  })
  it('bail REPRIS déclaré signé hors Propryo : toujours rien à faire', () => {
    const r = ligne(repris(BSE.declarerSignatureExterne({ typeContrat: 'repris' }, { date: '2019-04-20', now: '2026-10-06T08:00:00Z' })), eEntree)
    expect(r.aFaire).toBe(false)
  })
  it('signature commencée dans Propryo (bailleur seul) : « Mise en location » dit que le locataire n’a pas signé', () => {
    const r = ligne(repris({ signedAt: '2026-09-20T10:00:00Z', mode: 'bailleur-seul' }), eEntree)
    expect(r.phase).toBe('preparation')
    expect(r.cases.loc.map(l => l.texte)).toContain('Bail : signature du locataire en attente.')
  })
  it('bail ordinaire à venir : externe = signé (rien sur le bail), non signé = « Bail à signer » + « Signé sur papier »', () => {
    const nu = (sg) => ({ ref: 'R-1', debut: '2026-11-01', ...(sg ? { signatures: sg } : {}) })
    const ext = ligne(nu(BSE.declarerSignatureExterne({}, { date: '2026-10-01', now: '2026-10-06T08:00:00Z' })), [])
    expect(ext.cases.loc.map(l => l.texte)).not.toContain('Bail à signer (entrée le 01/11/2026).')
    const non = ligne(nu(null), [])
    expect(non.cases.loc[0].texte).toBe('Bail à signer (entrée le 01/11/2026).')
    expect(non.cases.loc[0].gestes.map(g => g.geste)).toEqual(['bail', 'bail-papier'])
  })
})
