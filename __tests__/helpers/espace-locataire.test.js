import { describe, it, expect } from 'vitest'
import * as EL from '../../js/core/espace-locataire.js'
import { nouvelIncident, CANAUX } from '../../js/core/incidents.js'

describe('E-1 · jeton et lien (D2, D3)', () => {
  it('jeton : 43 caractères base64url, tiré du CSPRNG ; deux tirages diffèrent', () => {
    const a = EL.nouveauJeton(), b = EL.nouveauJeton()
    expect(a).toMatch(EL.JETON_RE); expect(b).toMatch(EL.JETON_RE); expect(a).not.toBe(b)
  })
  it('empreinte : SHA-256 hexadécimal du jeton ; refuse une forme invalide', async () => {
    const j = EL.nouveauJeton(() => {})                       // 32 octets à zéro
    expect(j).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    const h = await EL.empreinteJeton(j)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(await EL.empreinteJeton('court')).toBeNull()
    expect(await EL.empreinteJeton(j + '=')).toBeNull()
  })
  it('lien : jeton dans le fragment, jamais dans le chemin ; base invalide refusée', () => {
    const j = EL.nouveauJeton()
    expect(EL.lienEspace('https://bail-sign-relay.example.workers.dev/', j)).toBe('https://bail-sign-relay.example.workers.dev/l#' + j)
    expect(EL.lienEspace('javascript:alert(1)', j)).toBeNull()
    expect(EL.lienEspace('https://x.fr', 'abc')).toBeNull()
  })
  it('fragment : seul un jeton de forme exacte est retenu', () => {
    const j = EL.nouveauJeton()
    expect(EL.jetonDuFragment('#' + j)).toBe(j)
    expect(EL.jetonDuFragment('#' + j + '&x=1')).toBeNull()
    expect(EL.jetonDuFragment('')).toBeNull()
  })
})

describe('E-2 · phases (D4), miroir de public._el_phase', () => {
  it('bail en cours (fin vide ou future) → complet', () => {
    expect(EL.phaseAcces(null, null, '2026-10-14')).toBe('complet')
    expect(EL.phaseAcces('2026-10-14', null, '2026-10-14')).toBe('complet')
  })
  it('après la fin, sans clôture → départ ; plafond fin + 14 mois → fini', () => {
    expect(EL.phaseAcces('2026-08-31', null, '2026-09-01')).toBe('depart')
    expect(EL.phaseAcces('2026-08-31', null, '2027-10-30')).toBe('depart')
    expect(EL.phaseAcces('2026-08-31', null, '2027-10-31')).toBe('fini')   // 31/08 + 14 mois = 31/10/2027
  })
  it('après la clôture → documents pendant 6 mois, puis fini ; le plafond l\'emporte', () => {
    expect(EL.phaseAcces('2026-08-31', '2026-10-14', '2027-04-13')).toBe('documents')
    expect(EL.phaseAcces('2026-08-31', '2026-10-14', '2027-04-14')).toBe('fini')
    expect(EL.phaseAcces('2026-08-31', '2027-08-01', '2027-10-31')).toBe('fini')   // clôture tardive : plafond fin + 14 mois
  })
  it('mois bornés comme Postgres (31/01 + 1 mois = 28/02)', () => {
    expect(EL.plusMois('2026-01-31', 1)).toBe('2026-02-28')
    expect(EL.plusMois('2024-01-31', 1)).toBe('2024-02-29')
    expect(EL.plusMois('2026-08-31', 14)).toBe('2027-10-31')
  })
  it('fin d\'accès affichée = min(clôture + 6 mois, fin + 14 mois)', () => {
    expect(EL.finAcces(null, null)).toBeNull()
    expect(EL.finAcces('2026-08-31', null)).toBe('2027-10-31')
    expect(EL.finAcces('2026-08-31', '2026-10-14')).toBe('2027-04-14')
  })
  it('écritures permises par phase : signaler en cours seulement ; messages et accord jusqu\'à la clôture', () => {
    expect(EL.peut('complet', 'signaler')).toBe(true)
    expect(EL.peut('depart', 'signaler')).toBe(false)
    expect(EL.peut('depart', 'message')).toBe(true)
    expect(EL.peut('documents', 'message')).toBe(false)
    expect(EL.peut('documents', 'accord')).toBe(false)
  })
})

describe('E-3 · fin de bail et clôture, réconciliation des accès', () => {
  const finOcc = (b, clos) => String(b.finEffective || (clos ? b.fin : '') || '')
  it('fin = règle de l\'app ; clôture = restitution du dépôt ; sans dépôt, la fin vaut clôture', () => {
    expect(EL.finEtClotureDuBail({ finEffective: '2026-08-31', dg: 900, dgRestitueAt: '2026-09-20' }, { finOccupation: finOcc })).toEqual({ fin: '2026-08-31', clos: '2026-09-20' })
    expect(EL.finEtClotureDuBail({ finEffective: '2026-08-31', dg: 900 }, { finOccupation: finOcc })).toEqual({ fin: '2026-08-31', clos: null })
    expect(EL.finEtClotureDuBail({ finEffective: '2026-08-31', dg: 0 }, { finOccupation: finOcc })).toEqual({ fin: '2026-08-31', clos: '2026-08-31' })
    expect(EL.finEtClotureDuBail({ fin: '2028-08-31', dg: 900 }, { finOccupation: finOcc })).toEqual({ fin: null, clos: null })
  })
  it('patchs : seulement ce qui change ; accès révoqué ignoré ; bail introuvable → rien', () => {
    const acces = [
      { id: 'a', fin_bail: null, comptes_clos_le: null },
      { id: 'b', fin_bail: '2026-08-31', comptes_clos_le: '2026-09-20' },
      { id: 'c', revoque_le: '2026-10-01' },
      { id: 'd', fin_bail: null },
    ]
    const baux = { a: { bail: { finEffective: '2026-08-31', dg: 900 }, archive: true }, b: { bail: { finEffective: '2026-08-31', dg: 900, dgRestitueAt: '2026-09-20' }, archive: true }, c: { bail: { finEffective: '2026-08-31' } } }
    const out = EL.majFinsAcces(acces, (a) => baux[a.id] || null, finOcc)
    expect(out).toEqual([{ id: 'a', patch: { fin_bail: '2026-08-31' } }])
  })
})

describe('E-4 · accord (art. 21 cité mot pour mot)', () => {
  it('texte de loi intégral (4 alinéas) et source', () => {
    expect(EL.ART21.texte).toHaveLength(4)
    expect(EL.ART21.texte[2]).toBe('Avec l\'accord exprès du locataire, le bailleur peut procéder à la transmission dématérialisée de la quittance.')
    expect(EL.ART21.source).toMatch(/article 21.*27\/03\/2014/)
  })
  it('libellé au nom du colocataire, sans « je » ni « vous »', () => {
    const l = EL.libelleAccord('Camille Durand')
    expect(l).toBe('Camille Durand accepte de recevoir les quittances de ce bail par voie électronique.')
    expect(l).not.toMatch(/\b(je|j'|vous|tu)\b/i)
  })
  it('état côté propriétaire : donné, retiré, non donné', () => {
    expect(EL.etatAccord({ accord_quittance_le: 'X' }, (x) => x).texte).toBe('Accord donné le X')
    expect(EL.etatAccord({ accord_quittance_le: 'X', accord_retire_le: 'Y' }, (x) => x).donne).toBe(false)
    expect(EL.etatAccord(null).texte).toMatch(/non donné/)
  })
})

describe('E-5 · signalement → incident du registre (D11)', () => {
  const sig = { id: '3f2a9c10-4b5e-4d6f-8a7b-1c2d3e4f5a6b', cree_le: '2026-10-14T08:51:00Z', piece: 'cuisine', element: 'fuite_eau', urgence: 'urgente', description: 'Fuite sous évier' }
  it('identifiant numérique déterministe (pas de doublon si deux membres importent)', () => {
    const a = EL.idIncidentDuSignalement(sig.id), b = EL.idIncidentDuSignalement(sig.id)
    expect(a).toBe(b); expect(a).toMatch(/^[0-9]{1,20}$/)
    expect(Number.isSafeInteger(Number(a))).toBe(true)
    expect(EL.idIncidentDuSignalement('x')).toBeNull()
  })
  it('champs : source locataire, canal espace, élément à qualifier par le bailleur, urgence traduite', () => {
    const f = EL.champsIncident(sig, { logRef: 'Lilas-T3', entity: 'SCI Dupont', nom: 'Camille Durand' })
    expect(f).toMatchObject({ signalePar: 'locataire', canal: 'espace', element: 'autre', nature: 'fuite', urgences: ['eau'], logRef: 'Lilas-T3', signaleParNom: 'Camille Durand' })
    expect(f.elementLibre).toBe('Fuite d\'eau · Cuisine')
    const inc = nouvelIncident(f, '2026-10-14T09:00:00Z')
    expect(inc.verdict).toBeNull(); expect(inc.payeurRetenu).toBeNull()
    expect(inc.canal).toBe('espace'); expect(inc.creeLe).toBe(sig.cree_le); expect(inc.statut).toBe('signale')
  })
  it('le canal « espace » existe dans le registre', () => {
    expect(CANAUX.some((c) => c.k === 'espace')).toBe(true)
  })
  it('urgence non urgente → aucune consigne d\'urgence ; parties communes signalées', () => {
    const f = EL.champsIncident({ ...sig, urgence: 'faible', piece: 'parties_communes' }, {})
    expect(f.urgences).toEqual([]); expect(f.contexte.partieCommune).toBe(true)
  })
  it('contrôle de saisie (mêmes règles que la base)', () => {
    expect(EL.erreurSignalement(sig)).toBeNull()
    expect(EL.erreurSignalement({ ...sig, piece: 'garage' })).toMatch(/pièce/)
    expect(EL.erreurSignalement({ ...sig, description: 'ab' })).toMatch(/Décrire/)
    expect(EL.erreurSignalement({ ...sig, photos: [1, 2, 3, 4, 5, 6, 7] })).toMatch(/6 photos/)
    for (const p of EL.PIECES) expect(p.k).toMatch(/^[a-z_]{2,30}$/)
    for (const p of EL.PROBLEMES) expect(p.k).toMatch(/^[a-z_]{2,30}$/)
  })
})

describe('E-6 · publication des documents (D6, D8)', () => {
  it('mois des quittances de l\'app → clé AAAA-MM', () => {
    expect(EL.moisCle('avril 2026')).toBe('2026-04')
    expect(EL.moisCle('Décembre 2025')).toBe('2025-12')
    expect(EL.moisCle('2026-09')).toBe('2026-09')
    expect(EL.moisCle('foo')).toBeNull()
  })
  it('clés sûres', () => {
    expect(EL.cleDocument('quittance', '2026-04')).toBe('quittance:2026-04')
    expect(EL.cleDocument('edl', '17/09 entrée')).toBe('edl:17_09_entr_e')
  })
  it('appartenance d\'une date à la location', () => {
    expect(EL.dansLaLocation('2026-04-05', '2025-09-01', null)).toBe(true)
    expect(EL.dansLaLocation('2025-08-31', '2025-09-01', null)).toBe(false)
    expect(EL.dansLaLocation('2026-09-01', '2025-09-01', '2026-08-31')).toBe(false)
  })
  it('justificatifs : envoi + 6 mois (art. 23)', () => {
    expect(EL.visibleJusquauJustificatifs('2026-05-15')).toBe('2026-11-15T23:59:59Z')
    expect(EL.ART23_JUSTIFICATIFS.texte).toMatch(/^Durant six mois/)
  })
  it('plan : crée les nouveaux, met à jour les changés, ne republie jamais un document retiré', () => {
    const sou = [
      { cle: 'quittance:2026-09', type_doc: 'quittance', titre: 'Quittance de septembre 2026', storage_path: 'p1' },
      { cle: 'quittance:2026-08', type_doc: 'quittance', titre: 'Quittance d\'août 2026', storage_path: 'p2b' },
      { cle: 'bail:signe', type_doc: 'bail', titre: 'Bail signé', storage_path: 'p3' },
      { cle: 'mauvaise cle', storage_path: 'x' },
    ]
    const pub = [{ id: 'd2', cle: 'quittance:2026-08', titre: 'Quittance d\'août 2026', storage_path: 'p2' }, { id: 'd3', cle: 'bail:signe', storage_path: 'p0', retire_le: '2026-10-01' }]
    const plan = EL.planPublication(sou, pub)
    expect(plan.creer.map((x) => x.cle)).toEqual(['quittance:2026-09'])
    expect(plan.maj).toEqual([{ id: 'd2', patch: { storage_path: 'p2b' } }])
    // Titre jamais réécrit (une date de réédition reste celle de la première publication, D8).
    const p2 = EL.planPublication([{ cle: 'quittance:2026-08', titre: 'Quittance d\'août 2026 (réédition du 15/10/2026)', storage_path: 'p2' }], [{ id: 'd2', cle: 'quittance:2026-08', titre: 'Quittance d\'août 2026 (réédition du 14/10/2026)', storage_path: 'p2' }])
    expect(p2).toEqual({ creer: [], maj: [] })
  })
})

describe('E-7 · fichiers, messages, e-mails', () => {
  it('type réel par octets magiques', () => {
    expect(EL.typeReel([0x25, 0x50, 0x44, 0x46, 0x2d])).toBe('pdf')
    expect(EL.typeReel([0xff, 0xd8, 0xff, 0xe0])).toBe('jpg')
    expect(EL.typeReel([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).toBe('png')
    expect(EL.typeReel([0x3c, 0x73, 0x76, 0x67])).toBeNull()   // <svg
  })
  it('message : vide, trop long, trop de pièces', () => {
    expect(EL.erreurMessage('Bonjour', [])).toBeNull()
    expect(EL.erreurMessage('  ', [])).toMatch(/Écrire/)
    expect(EL.erreurMessage('x'.repeat(4001), [])).toMatch(/trop long/)
    expect(EL.erreurMessage('x', [1, 2, 3, 4, 5])).toMatch(/4 pièces/)
  })
  it('e-mails neutres : objet sans nom ni montant, lien dans le corps, ni « tu » ni « vous »', () => {
    for (const t of ['document', 'message', 'signalement']) {
      const m = EL.modeleEmail(t, { bailleur: 'SCI Dupont', lien: 'https://x/l#abc', titre: 'Quittance de septembre 2026' })
      expect(m.objet).not.toMatch(/SCI|Dupont|€|\d/)
      expect(m.texte).toMatch(/https:\/\/x\/l#abc/)
      expect(m.objet + m.texte).not.toMatch(/\b(vous|votre|vos|tu|ton|ta|tes)\b/i)
    }
    expect(EL.modeleEmail('autre', {})).toBeNull()
  })
  it('invitation : seul e-mail qui porte le lien ; les avis suivants renvoient au lien déjà reçu (D3)', () => {
    expect(EL.modeleEmail('invitation', {})).toBeNull()
    expect(EL.modeleEmail('invitation', { lien: 'https://r/l#x' }).texte).toMatch(/https:\/\/r\/l#x/)
    const sans = EL.modeleEmail('document', { titre: 'Quittance' })
    expect(sans.texte).not.toMatch(/https?:/)
    expect(sans.texte).toMatch(/lien personnel reçu du bailleur/)
  })
})

describe('E-8 · attribution à la location (relecture adverse : jamais les documents d\'un autre locataire)', () => {
  const B = { debut: '2026-03-15', fin: null, noms: ['Léo Martin'] }
  it('quittance du mois de passage : celle de l\'ancien locataire n\'est JAMAIS publiée au nouveau', () => {
    expect(EL.quittanceDeLaLocation({ mois: 'mars 2026', locataire: 'Camille Durand' }, B)).toBe(false)
    expect(EL.quittanceDeLaLocation({ mois: 'mars 2026', locataire: 'Léo Martin' }, B)).toBe(true)
    expect(EL.quittanceDeLaLocation({ mois: 'mars 2026', locataire: 'Zoé, léo  martin' }, B)).toBe(true)
  })
  it('quittance hors de la location ou sans nom : non publiée', () => {
    expect(EL.quittanceDeLaLocation({ mois: 'février 2026', locataire: 'Léo Martin' }, B)).toBe(false)
    expect(EL.quittanceDeLaLocation({ mois: 'avril 2026', locataire: '' }, B)).toBe(false)
    expect(EL.quittanceDeLaLocation({ mois: 'septembre 2026', locataire: 'Léo Martin' }, { ...B, fin: '2026-08-31' })).toBe(false)
  })
  it('EDL le jour du passage de relais : la sortie de l\'ancien n\'est pas publiée au nouveau ; l\'entrée de la veille l\'est', () => {
    expect(EL.edlDeLaLocation({ date: '2026-03-15', type: 'Sortie', locataire: 'Camille Durand' }, B)).toBe(false)
    expect(EL.edlDeLaLocation({ date: '2026-03-14', type: 'Entrée', locataire: 'M. Léo Martin' }, B)).toBe(true)
    expect(EL.edlDeLaLocation({ date: '2026-01-01', type: 'Entrée', locataire: 'Léo Martin' }, B)).toBe(false)
    expect(EL.edlDeLaLocation({ date: '2026-10-20', type: 'Sortie', locataire: 'Léo Martin' }, { ...B, fin: '2026-09-30' })).toBe(true)
    expect(EL.edlDeLaLocation({ date: '2026-03-20', type: 'Entrée', locataire: '' }, B)).toBe(false)
  })
  it('plan : date relue au format de la base (+00:00) → aucune mise à jour en boucle', () => {
    const p = EL.planPublication([{ cle: 'justif:x', type_doc: 'justificatif', titre: 'J', storage_path: 'p', visible_jusqu_au: '2026-11-15T23:59:59Z', date_doc: '2026-03-20' }],
      [{ id: 'd', cle: 'justif:x', storage_path: 'p', visible_jusqu_au: '2026-11-15T23:59:59+00:00', date_doc: '2026-03-20' }])
    expect(p.maj).toEqual([])
  })
  it('lien : https exigé (http seulement pour un relais local)', () => {
    const j = EL.nouveauJeton()
    expect(EL.lienEspace('http://relais.example', j)).toBeNull()
    expect(EL.lienEspace('http://localhost:8787', j)).toBe('http://localhost:8787/l#' + j)
  })
  it('partie commune : l\'immeuble est rattaché à l\'incident importé', () => {
    const f = EL.champsIncident({ id: '3f2a9c10-4b5e-4d6f-8a7b-1c2d3e4f5a6b', piece: 'parties_communes', element: 'autre', urgence: 'faible', description: 'Porte du hall' }, { logRef: 'L', imm: 'Immeuble Demo' })
    expect(f.imm).toBe('Immeuble Demo')
    expect(EL.champsIncident({ id: '3f2a9c10-4b5e-4d6f-8a7b-1c2d3e4f5a6b', piece: 'cuisine', element: 'autre', urgence: 'faible', description: 'x x x' }, { logRef: 'L', imm: 'Immeuble Demo' }).imm).toBe('')
  })
})
