/**
 * CIRCUIT D'UN INCIDENT — module pur js/core/incident-circuit.js (CDC docs/CDC-INCIDENT-CIRCUIT.md).
 *   C  constat neutre → entrée du moteur (D9, D10, D11), règles de qui-paie.js inchangées
 *   L  étapes vues du locataire
 *   P  plafond et décision sur un devis (D1, D3)
 *   K  carnet d'artisans (D5, D6)
 *   S  entreprises suggérées (D7, D8)
 *   A  accord exprès (art. 7 e, D12)
 *   D  demande minimisée et expiration du lien (D13, D14)
 *   R  résultat publié au locataire
 */
import { describe, it, expect } from 'vitest'
import * as IC from '../../js/core/incident-circuit.js'
import { quiPaie, TEXTES } from '../../js/core/qui-paie.js'

const inc = (x = {}) => ({ id: 1, element: 'canalisation', nature: 'fuite', urgences: [], contexte: { meuble: false, copro: true, partieCommune: false }, ...x })

describe('C · constat → moteur', () => {
  it('C-1 les 6 constats et 3 ampleurs du CDC, libellés neutres', () => {
    expect(IC.CONSTATS.map((c) => c.k)).toEqual(['usure', 'entretien_non_fait', 'casse', 'defaut', 'exterieure', 'sinistre'])
    expect(IC.AMPLEURS.map((c) => c.k)).toEqual(['petite', 'complet', 'entretien'])
    const tout = IC.CONSTATS.map((c) => c.lbl).join(' ') + Object.values(IC.CONSTATS).map((c) => IC.causeAffichee(IC.entreeMoteur({ constat: c.k, ampleur: 'petite' }).cause)).join(' ')
    expect(tout).not.toMatch(/faute/i)
  })
  it('C-2 usure : petite réparation = usage normal, remplacement complet = vétusté (D9)', () => {
    expect(IC.entreeMoteur({ constat: 'usure', ampleur: 'petite' })).toEqual({ cause: 'usage_normal', intervention: 'petite_piece' })
    expect(IC.entreeMoteur({ constat: 'usure', ampleur: 'complet' })).toEqual({ cause: 'vetuste', intervention: 'remplacement_complet' })
    expect(IC.entreeMoteur({ constat: 'usure', ampleur: 'entretien' })).toEqual({ cause: 'usage_normal', intervention: 'entretien' })
  })
  it('C-3 casse → art. 7 c (D10) ; défaut → malfaçon ; extérieure → tiers ou force majeure ; sinistre', () => {
    expect(IC.entreeMoteur({ constat: 'casse', ampleur: 'petite' }).cause).toBe('faute_locataire')
    expect(IC.entreeMoteur({ constat: 'entretien_non_fait' })).toEqual({ cause: 'defaut_entretien', intervention: 'inconnue' })
    expect(IC.entreeMoteur({ constat: 'defaut', ampleur: 'complet' }).cause).toBe('malfacon_vice')
    expect(IC.entreeMoteur({ constat: 'exterieure' }).cause).toBe('tiers')
    expect(IC.entreeMoteur({ constat: 'exterieure', sousType: 'evenement' }).cause).toBe('force_majeure')
    expect(IC.entreeMoteur({ constat: 'sinistre' }).cause).toBe('sinistre')
    expect(IC.entreeMoteur({ constat: 'bizarre' })).toBeNull()
  })
  it('C-4 verdict = moteur inchangé : joint usé (petite réparation) → locataire, texte explicite', () => {
    const v = IC.verdictDuConstat(inc(), { constat: 'usure', ampleur: 'petite' })
    const ref = quiPaie({ element: 'canalisation', nature: 'fuite', urgences: [], contexte: inc().contexte, cause: 'usage_normal', intervention: 'petite_piece' })
    expect(v).toEqual(ref)
    expect(v.payeur).toBe('locataire')
    expect(v.textes.map((t) => t.id)).toEqual(['ann-IVa', 'a7d'])
  })
  it('C-5 élément usé remplacé entièrement → bailleur (vétusté) ; pièce cassée → locataire (art. 7 c) ; sinistre → assurance', () => {
    expect(IC.verdictDuConstat(inc(), { constat: 'usure', ampleur: 'complet' }).payeur).toBe('bailleur')
    const c = IC.verdictDuConstat(inc(), { constat: 'casse', ampleur: 'petite' })
    expect(c.payeur).toBe('locataire'); expect(c.textes.map((t) => t.id)).toEqual(['a7c'])
    expect(IC.verdictDuConstat(inc({ element: 'ballon' }), { constat: 'usure', ampleur: 'complet' }).payeur).toBe('bailleur')
    expect(IC.verdictDuConstat(inc(), { constat: 'sinistre' }).payeur).toBe('assurance')
    expect(IC.verdictDuConstat(inc(), { constat: '??' })).toBeNull()
  })
  it('C-6 constat normalisé : source, sous-type seulement pour « cause extérieure », résumé borné', () => {
    const c = IC.normaliserConstat({ constat: 'exterieure', sousType: 'xx', ampleur: 'zz', resume: 'a'.repeat(2000), source: 'pirate' }, '2026-10-16T08:00:00Z')
    expect(c).toMatchObject({ constat: 'exterieure', sousType: 'tiers', ampleur: null, source: 'proprietaire', le: '2026-10-16T08:00:00Z' })
    expect(c.resume.length).toBe(1000)
    expect(IC.normaliserConstat({ constat: 'usure', sousType: 'evenement' }).sousType).toBeNull()
    expect(IC.normaliserConstat({ constat: 'x' })).toBeNull()
  })
})

describe('L · étapes du locataire', () => {
  it('Signalé → Intervention prévue → Terminé', () => {
    expect(IC.etapeLocataire({ statut: 'signale' })).toBe('signale')
    expect(IC.etapeLocataire({ statut: 'signale', creneau: { date: '2026-10-16' } })).toBe('intervention')
    expect(IC.etapeLocataire({ statut: 'en_cours' })).toBe('intervention')
    expect(IC.etapeLocataire({ statut: 'en_cours', resultatPublie: true })).toBe('termine')
    expect(IC.etapeLocataire({ statut: 'resolu' })).toBe('termine')
  })
})

describe('P · plafond et devis', () => {
  it('P-1 montant : formats français, refus du négatif et du texte', () => {
    expect(IC.montant('1 180,50 €')).toBe(1180.5)
    expect(IC.montant('300')).toBe(300)
    expect(IC.montant(118.004)).toBe(118)
    expect(IC.montant('-5')).toBeNull(); expect(IC.montant('abc')).toBeNull(); expect(IC.montant('')).toBeNull()
  })
  it('P-2 réglages : défaut 300 € TTC, par métier filtré, rien n\'est actif avant validation (D1)', () => {
    const r = IC.normaliserReglages({ parMetier: { chauffage: '450', inconnu: 9, plomberie: 'x' } })
    expect(r).toMatchObject({ plafondTtc: 300, parMetier: { chauffage: 450 }, conserverPieces: false, valideLe: null })
    expect(IC.plafondPour(r, 'chauffage')).toBe(0)
    const v = { ...r, valideLe: '2026-10-14T10:00:00Z' }
    expect(IC.plafondPour(v, 'chauffage')).toBe(450)
    expect(IC.plafondPour(v, 'plomberie')).toBe(300)
    expect(IC.normaliserReglages({ plafondTtc: 10_000_000 }).plafondTtc).toBe(300)
  })
  it('P-3 devis : accepté automatiquement sous le plafond, sinon au propriétaire ; plafond nul = toujours au propriétaire (D3)', () => {
    expect(IC.decisionDevis(118, 300)).toBe('auto_accepte')
    expect(IC.decisionDevis('300,00', 300)).toBe('auto_accepte')
    expect(IC.decisionDevis(300.01, 300)).toBe('en_attente')
    expect(IC.decisionDevis(50, 0)).toBe('en_attente')
    expect(IC.decisionDevis(0, 300)).toBe('en_attente')
    expect(IC.decisionDevis('', 300)).toBe('en_attente')
    // Plafond par intervention : les devis déjà acceptés sur le même lien comptent.
    expect(IC.decisionDevis(150, 300, 150)).toBe('auto_accepte')
    expect(IC.decisionDevis(290, 300, 290)).toBe('en_attente')
  })
  it('P-4 phrase affichée à l\'artisan', () => {
    expect(IC.phrasePlafond(300)).toMatch(/jusqu'à 300 € TTC, déplacement compris/)
    expect(IC.phrasePlafond(0)).toMatch(/Aucune intervention sans accord/)
  })
})

describe('K · carnet', () => {
  const A = (x) => IC.nouvelArtisan({ entity: 'SCI Dupont', nom: 'Plomberie Weber', metiers: ['plomberie'], tel: '06 39 98 45 67', ...x }, '2026-10-01T00:00:00Z')
  it('K-1 forme stockée : SIRET 14 chiffres, e-mail valide, métiers connus, note privée bornée', () => {
    const a = IC.nouvelArtisan({ nom: '  X ', siret: '123 456 789 00012', email: 'Contact@Ex.FR', metiers: ['plomberie', 'licorne', 'plomberie'], notePrivee: 'n'.repeat(3000), source: 'pirate' })
    expect(a).toMatchObject({ nom: 'X', siret: '12345678900012', email: 'contact@ex.fr', metiers: ['plomberie'], source: 'libre', prevenirAuto: false })
    expect(a.notePrivee.length).toBe(IC.NOTE_MAX)
    expect(IC.nouvelArtisan({ siret: '123', email: 'pas-un-mail', tel: 'abc' })).toMatchObject({ siret: '', email: '', tel: '' })
  })
  it('K-2 artisan à prévenir : couvre le métier, même structure, réglé « prévenir », joignable ; le plus récent d\'abord', () => {
    const a1 = { ...A({ id: 1, prevenirAuto: true }) }
    const a2 = { ...A({ id: 2, nom: 'Hydro', prevenirAuto: true }) }
    const a3 = { ...A({ id: 3, nom: 'Sans tel', tel: '', prevenirAuto: true }) }
    const a4 = { ...A({ id: 4, nom: 'Autre SCI', entity: 'SCI B', prevenirAuto: true }) }
    const incs = [{ id: 9, circuit: { artisanId: 2 }, creeLe: '2026-09-01T00:00:00Z' }, { id: 8, circuit: { artisanId: 1 }, creeLe: '2026-03-20T00:00:00Z' }]
    expect(IC.artisanAPrevenir([a1, a2, a3, a4], { metier: 'plomberie', entity: 'SCI Dupont', incidents: incs }).id).toBe(2)
    expect(IC.artisanAPrevenir([a1], { metier: 'serrurerie', entity: 'SCI Dupont', incidents: [] })).toBeNull()
    expect(IC.artisanAPrevenir([{ ...a1, prevenirAuto: false }], { metier: 'plomberie', entity: 'SCI Dupont' })).toBeNull()
    expect(IC.artisanAPrevenir([{ ...a1, _deleted: true }], { metier: 'plomberie', entity: 'SCI Dupont' })).toBeNull()
  })
  it('K-3 dernière intervention : par lien de circuit, par SIRET, sinon par nom', () => {
    const a = { ...A({ id: 5, siret: '12345678900012' }) }
    const incs = [{ artisan: { nom: 'x', siret: '12345678900012' }, statutDates: { resolu: '2026-05-02T10:00:00Z' } }, { artisan: { nom: 'Plomberie Weber' }, creeLe: '2026-08-01' }, { _deleted: true, circuit: { artisanId: 5 }, creeLe: '2027-01-01' }]
    expect(IC.derniereIntervention(a, incs)).toBe('2026-05-02')
    expect(IC.derniereIntervention({ ...a, siret: '' }, incs)).toBe('2026-08-01')
  })
  it('K-4 migration du carnet calculé : une fiche par entreprise et par structure, jamais en double', () => {
    const derive = [{ nom: 'Plomberie Weber', siret: '', tel: '0611', metier: 'plomberie', logRef: 'T3' }, { nom: 'plomberie  weber', logRef: 'T3' }, { nom: 'Ramonage Est', siret: '12345678900012', logRef: 'F2' }, { nom: '' }]
    const ent = (d) => (d.logRef === 'T3' ? 'SCI Dupont' : 'Nom propre')
    const out = IC.migrationCarnet(derive, [], ent, '2026-10-14T00:00:00Z')
    expect(out.map((a) => [a.entity, a.nom, a.source])).toEqual([['SCI Dupont', 'Plomberie Weber', 'migration'], ['Nom propre', 'Ramonage Est', 'migration']])
    expect(out[0].metiers).toEqual(['plomberie'])
    expect(IC.migrationCarnet(derive, out, ent)).toEqual([])
  })
})

describe('S · suggestions', () => {
  const JSON_NP = { results: [
    { siren: '111111111', nom_complet: 'LOIN', activite_principale: '43.22A', etat_administratif: 'A', date_creation: '1990-01-01', complements: { est_rge: true },
      matching_etablissements: [{ siret: '11111111100011', etat_administratif: 'A', latitude: '48.60', longitude: '7.75', adresse: 'A', libelle_commune: 'STRASBOURG' }] },
    { siren: '222222222', nom_complet: 'PRES', activite_principale: '43.22A', etat_administratif: 'A', date_creation: '2015-06-01',
      matching_etablissements: [{ siret: '22222222200011', etat_administratif: 'F', latitude: '48.5801', longitude: '7.7501' }, { siret: '22222222200029', etat_administratif: 'A', latitude: '48.583', longitude: '7.752', adresse: 'B' }, { siret: '22222222200037', etat_administratif: 'A', latitude: '48.62', longitude: '7.80' }] },
    { siren: '333333333', nom_complet: 'CESSEE', activite_principale: '43.22A', etat_administratif: 'C', matching_etablissements: [{ siret: '33333333300011', etat_administratif: 'A', latitude: '48.58', longitude: '7.75' }] },
    { siren: '444444444', nom_complet: 'AUTRE NAF', activite_principale: '82.30Z', etat_administratif: 'A', matching_etablissements: [{ siret: '44444444400011', etat_administratif: 'A', latitude: '48.58', longitude: '7.75' }] },
  ] }
  it('S-1 URL /near_point : code d\'activité du métier, point du logement, rayon borné à 50 km', () => {
    const u = new URL(IC.urlNearPoint({ lat: 48.58, lon: 7.75, rayonKm: 90, metier: 'plomberie' }))
    expect(u.origin + u.pathname).toBe('https://recherche-entreprises.api.gouv.fr/near_point')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ lat: '48.58000', long: '7.75000', radius: '50', activite_principale: '43.22A', per_page: '25' })
    expect(IC.urlNearPoint({ lat: null, lon: 7, metier: 'plomberie' })).toBeNull()
    expect(IC.urlNearPoint({ lat: 1, lon: 7, metier: 'licorne' })).toBeNull()
  })
  it('S-2 lecture : entreprises actives du bon code, établissement ACTIF le plus proche, distance, ancienneté, RGE', () => {
    const l = IC.lireNearPoint(JSON_NP, { lat: 48.58, lon: 7.75, naf: '43.22A' })
    expect(l.map((x) => x.nom).sort()).toEqual(['LOIN', 'PRES'])
    const p = l.find((x) => x.nom === 'PRES')
    expect(p.siret).toBe('22222222200029')
    expect(p.distanceKm).toBeLessThan(0.5)
    expect(p.anneeCreation).toBe(2015)
    expect(l.find((x) => x.nom === 'LOIN').rge).toBe(true)
  })
  it('S-3 tri : déjà utilisées en tête, puis distance (D7)', () => {
    const l = IC.lireNearPoint(JSON_NP, { lat: 48.58, lon: 7.75, naf: '43.22A' })
    const t = IC.trierSuggestions(l, [{ siret: '11111111100099', nom: 'Loin', metiers: ['plomberie'] }], [])
    expect(t.map((x) => [x.nom, x.dejaUtilise])).toEqual([['LOIN', true], ['PRES', false]])
    expect(IC.trierSuggestions(l, [], []).map((x) => x.nom)).toEqual(['PRES', 'LOIN'])
  })
  it('S-4 RGE par distance : domaines du métier, validité, téléphone public ; fusion par SIREN (D8)', () => {
    const u = new URL(IC.urlRgeGeo({ lat: 48.58, lon: 7.75, metier: 'chauffage' }))
    expect(u.searchParams.get('geo_distance')).toBe('7.75000,48.58000,10km')
    expect(u.searchParams.get('qs')).toMatch(/^domaine:"Chaudière condensation ou micro-cogénération gaz ou fioul" OR domaine:"Pompe à chaleur : chauffage"/)
    expect(IC.urlRgeGeo({ lat: 48.58, lon: 7.75, metier: 'serrurerie' })).toBeNull()
    expect(IC.metierEnergie('serrurerie')).toBe(false)
    const r = IC.lireRgeGeo({ results: [
      { siret: '22222222200045', nom_entreprise: 'PRES', telephone: '03 88 00 00 00', email: 'a@b.fr', domaine: 'Pompe à chaleur : chauffage', lien_date_fin: '2027-01-01', _geo_distance: 450 },
      { siret: '22222222200045', nom_entreprise: 'PRES', domaine: 'Chaudière bois', lien_date_fin: '2027-01-01' },
      { siret: '55555555500011', nom_entreprise: 'EXPIRE', lien_date_fin: '2026-01-01' },
    ] }, '2026-10-14')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ siren: '222222222', tel: '03 88 00 00 00', email: 'a@b.fr', distanceKm: 0.5, domaines: ['Pompe à chaleur : chauffage', 'Chaudière bois'] })
    const f = IC.fusionnerRge(IC.lireNearPoint(JSON_NP, { lat: 48.58, lon: 7.75, naf: '43.22A' }), r)
    expect(f.find((x) => x.nom === 'PRES')).toMatchObject({ rge: true, tel: '03 88 00 00 00' })
    expect(f.find((x) => x.nom === 'LOIN').tel).toBe('')
  })
  it('S-5 avis en ligne : simple lien de recherche (aucune API) ; fiche officielle', () => {
    expect(IC.lienAvisEnLigne('Plomberie Weber', 'Strasbourg')).toBe('https://www.google.com/maps/search/?api=1&query=Plomberie%20Weber%20Strasbourg')
    expect(IC.lienFicheOfficielle('22222222200029')).toBe('https://annuaire-entreprises.data.gouv.fr/etablissement/22222222200029')
    expect(IC.lienFicheOfficielle('x')).toBeNull()
    expect(IC.CRITERES).toHaveLength(6)
    expect(IC.MENTION_SUGGESTIONS).toMatch(/ne recommande personne/)
  })
  it('S-6 distance (haversine) : Strasbourg → Mulhouse ≈ 95 km', () => {
    expect(IC.distanceKm(48.5734, 7.7521, 47.7508, 7.3359)).toBeGreaterThan(94)
    expect(IC.distanceKm(48.5734, 7.7521, 47.7508, 7.3359)).toBeLessThan(97)
    expect(IC.distanceKm(null, 1, 2, 3)).toBeNull()
  })
})

describe('A · accord exprès (art. 7 e)', () => {
  it('A-1 samedi, dimanche, jours fériés nationaux', () => {
    expect(IC.exigeAccordExpres('2026-10-17')).toEqual({ exige: true, motif: 'samedi' })
    expect(IC.exigeAccordExpres('2026-10-18')).toEqual({ exige: true, motif: 'dimanche' })
    expect(IC.exigeAccordExpres('2026-10-16')).toEqual({ exige: false, motif: null })
    expect(IC.exigeAccordExpres('2026-11-11').exige).toBe(true)        // mercredi 11 novembre
    expect(IC.exigeAccordExpres('2027-03-29').motif).toBe('ferie')     // lundi de Pâques 2027
    expect(IC.exigeAccordExpres('2027-05-06').motif).toBe('ferie')     // Ascension 2027
    expect(IC.exigeAccordExpres('2027-05-17').motif).toBe('ferie')     // lundi de Pentecôte 2027
  })
  it('A-2 Alsace-Moselle : Vendredi saint et 26 décembre en plus', () => {
    expect(IC.exigeAccordExpres('2027-03-26', '67000').motif).toBe('ferie')
    expect(IC.exigeAccordExpres('2027-03-26', '75011').exige).toBe(false)
    expect(IC.exigeAccordExpres('2028-12-26', '68480').motif).toBe('ferie')
    expect(IC.alsaceMoselle('57 000')).toBe(true)
  })
  it('A-3 créneau normalisé', () => {
    expect(IC.normaliserCreneau({ date: '2026-10-16', debut: '08:00', fin: '10:00' })).toEqual({ date: '2026-10-16', debut: '08:00', fin: '10:00' })
    expect(IC.normaliserCreneau({ date: '2026-10-16', debut: '10:00', fin: '08:00' })).toBeNull()
    expect(IC.normaliserCreneau({ date: '16/10/2026' })).toBeNull()
    expect(IC.ART_7E_WEEKEND).toMatch(/accord exprès du locataire/)
  })
})

describe('D · lien de l\'artisan', () => {
  it('D-1 expiration : 30 jours après la validation, 90 jours au plus après l\'émission (D14)', () => {
    expect(IC.expirationLien('2026-10-14T00:00:00Z', null)).toBe('2027-01-12T00:00:00.000Z')
    expect(IC.expirationLien('2026-10-14T00:00:00Z', '2026-10-20T00:00:00Z')).toBe('2026-11-19T00:00:00.000Z')
    expect(IC.expirationLien('2026-10-14T00:00:00Z', '2027-01-01T00:00:00Z')).toBe('2027-01-12T00:00:00.000Z')
    expect(IC.expirationLien('x')).toBeNull()
  })
  it('D-2 demande minimisée : téléphone du locataire SEULEMENT avec son accord (D13), rien sur le bail', () => {
    const sig = { description: 'brut', ia: { resume: 'Fuite goutte à goutte' }, tel_partage: false, telephone: '0639981234', acces_info: 'Code 4719B', presence: 'matin' }
    const d = IC.demandeArtisan({ inc: { creeLe: '2026-10-14T18:42:00Z', urgences: ['eau'] }, signalement: sig, adresse: '8 rue des Lilas', locataireNom: 'Camille Durand', elementLbl: 'Évacuation', photos: [{ path: 'a/b/files/x.jpg', nom: 'p' }, { nope: 1 }] })
    expect(d).toMatchObject({ titre: 'Évacuation', description: 'Fuite goutte à goutte', urgent: true, telephone: '', acces: 'Code 4719B', locataire: 'Camille Durand' })
    expect(d.photos).toEqual([{ path: 'a/b/files/x.jpg', nom: 'p' }])
    expect(Object.keys(d)).not.toContain('loyer')
    expect(IC.demandeArtisan({ signalement: { ...sig, tel_partage: true } }).telephone).toBe('0639981234')
  })
})

describe('R · résultat publié au locataire', () => {
  const v = (c) => IC.verdictDuConstat(inc(), c)
  it('R-1 locataire : montant, facture, textes RELUS dans le référentiel, rappel des exceptions', () => {
    const r = IC.resultatPourLocataire({ verdict: v({ constat: 'usure', ampleur: 'petite', resume: 'Joint changé' }), constat: { constat: 'usure', ampleur: 'petite', resume: 'Joint changé' }, montantTtc: '118,00', factureNumero: '2026-1042', now: 'T' })
    expect(r).toMatchObject({ payeur: 'locataire', montantTtc: 118, facture: '2026-1042', constat: 'Pièce usée par le temps', ampleur: 'Petite réparation', exceptions: IC.EXCEPTIONS_LOCATAIRE.reparation, publieLe: 'T' })
    expect(r.textes.map((t) => t.ref)).toEqual([TEXTES['ann-IVa'].ref, TEXTES.a7d.ref])
  })
  it('R-2 bailleur : aucun montant affiché ; textes du bailleur', () => {
    const r = IC.resultatPourLocataire({ verdict: v({ constat: 'usure', ampleur: 'complet' }), constat: { constat: 'usure', ampleur: 'complet' }, montantTtc: 640 })
    expect(r.payeur).toBe('bailleur'); expect(r.montantTtc).toBeNull(); expect(r.exceptions).toBeNull()
  })
  it('R-1 bis pièce cassée (art. 7 c) : les exceptions rappelées sont celles du 7 c, pas du 7 d', () => {
    const k = { constat: 'casse', ampleur: 'petite' }
    const r = IC.resultatPourLocataire({ verdict: v(k), constat: k, montantTtc: 90 })
    expect(r.payeur).toBe('locataire')
    expect(r.exceptions).toBe(IC.EXCEPTIONS_LOCATAIRE.degradation)
    expect(r.exceptions).toMatch(/tiers non introduit/)
  })
  it('R-3 zone grise non tranchée → refus ; tranchée → textes de la lecture retenue', () => {
    const z = IC.verdictDuConstat(inc(), { constat: 'exterieure' })   // fait d'un tiers : à arbitrer
    expect(z.payeur).toBe('a_arbitrer')
    expect(IC.resultatPourLocataire({ verdict: z }).erreur).toMatch(/Zone grise/)
    const r = IC.resultatPourLocataire({ verdict: z, payeurRetenu: 'bailleur', constat: { constat: 'exterieure' } })
    expect(r.payeur).toBe('bailleur'); expect(r.textes.map((t) => t.ref)).toEqual([TEXTES.a7c.ref])
  })
  it('R-4 payeur retenu contre la suggestion sans lecture correspondante → aucun texte cité', () => {
    const r = IC.resultatPourLocataire({ verdict: v({ constat: 'usure', ampleur: 'complet' }), payeurRetenu: 'locataire', montantTtc: 50 })
    expect(r).toMatchObject({ payeur: 'locataire', montantTtc: 50, textes: [] })
  })
  it('R-5 textes stockés falsifiés ignorés (relus par id)', () => {
    const vv = v({ constat: 'usure', ampleur: 'petite' })
    vv.textes = [{ id: 'a7d', ref: 'FAUX', extrait: 'FAUX' }, { id: 'inconnu', ref: 'X' }]
    const r = IC.resultatPourLocataire({ verdict: vv })
    expect(r.textes).toEqual([{ ref: TEXTES.a7d.ref, extrait: TEXTES.a7d.extrait, url: TEXTES.a7d.url }])
  })
})
