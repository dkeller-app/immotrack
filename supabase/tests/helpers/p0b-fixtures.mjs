// Liste ordonnée des tables métier P0-B (ordre = dépendances FK ascendantes).
// Étendue tâche par tâche ; les tests itèrent dessus.
export const BUSINESS_TABLES = [
  'entites',
  'immeubles',
  'logements',
  'documents',
  'mouvements',
  'quittances',
  'baux',
  'baux_historique',
  'edl',
]

// Sème une chaîne métier complète DANS un espace donné, via un client authentifié
// (owner/gestionnaire de l'espace → autorisé par la RLS). Renvoie les ids créés.
// Étendue tâche par tâche au fil de l'ajout des tables.
export async function seedChain(client, espaceId) {
  const tag = espaceId.slice(0, 8)
  const ids = {}
  const ins = async (table, row) => {
    const { data, error } = await client.from(table)
      .insert({ espace_id: espaceId, ...row }).select('id').single()
    if (error) throw new Error(`seed ${table}: ${error.message}`)
    return data.id
  }
  ids.entite   = await ins('entites',   { nom: `Entité ${tag}` })
  ids.immeuble = await ins('immeubles', { entite_id: ids.entite, nom: `Imm ${tag}` })
  ids.logement = await ins('logements', {
    entite_id: ids.entite, immeuble_id: ids.immeuble, ref: `F-${tag}`,
    type: 'appartement', surface: 42, loyer_hc_ref: 700, charges_ref: 100,
  })
  ids.document = await ins('documents', {
    name: 'bail.pdf', mime: 'application/pdf', size: 12345,
    parent_type: 'immeuble', parent_id: ids.immeuble,
  })
  ids.mouvement = await ins('mouvements', {
    date_mouvement: '2026-01-15', libelle: 'Loyer janvier',
    logement_id: ids.logement, categorie: 'loyer', credit: 800,
    pj_document_id: ids.document,
  })
  ids.quittance = await ins('quittances', {
    logement_id: ids.logement, entite_id: ids.entite, mois: '2026-01',
    hc: 700, ch: 100, date_paiement: '2026-01-05',
    payment_matched_mvt_id: ids.mouvement,
  })
  ids.bail = await ins('baux', {
    logement_id: ids.logement, entite_id: ids.entite, type_bail: 'nu',
    hc: 700, ch: 100, dg: 700, jour_paiement: 1, date_debut: '2026-01-01',
    locataires: [{ nom: 'Dupont', prenom: 'Jean' }],
  })
  ids.bailHist = await ins('baux_historique', {
    logement_id: ids.logement, entite_id: ids.entite, archived_auto: true,
    bail_snapshot: { ref: `F-${tag}`, type: 'nu', hc: 650 },
  })
  ids.edl = await ins('edl', {
    type_edl: 'Entrée', date_edl: '2026-01-01', logement_id: ids.logement,
    identite: { locataire: 'Jean Dupont', bailleur: 'SCI Test' },
    pieces: [{ nom: 'Séjour', elements: [{ libelle: 'Murs', etatE: 'bon', obsE: '', photosE: [] }] }],
  })
  return ids
}
