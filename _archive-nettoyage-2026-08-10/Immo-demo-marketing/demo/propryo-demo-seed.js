/**
 * demo/propryo-demo-seed.js — SEED de données démo marketing Propryo (100% fictif).
 *
 * But : remplir la clé localStorage ISOLÉE `_test_immotrack_v4` avec un patrimoine
 * démo dont la déclaration 2044 est CORRECTE et démontrable (drill case → mouvements
 * → facture).
 *
 * RÈGLE ABSOLUE : ce fichier n'est PAS chargé par l'app. Il ne modifie NI le boot,
 * NI initDB, NI _loadDemoDataset de l'app prod. Le seed s'écrit uniquement quand on
 * appelle explicitement window.PropryoDemoSeed.load() (depuis demo/index.html).
 * Aucune auto-injection.
 *
 * Clé d'écriture : `_test_immotrack_v4` UNIQUEMENT (sandbox, jamais la prod).
 *
 * Schéma copié à l'identique sur la forme réelle de l'app :
 *   - entité : index.html _loadDemoDataset (~3821) + formulaire ent-* (~3070) → `type` libre.
 *   - logement : index.html _loadDemoDataset (~3833) ; `typeUsage:'habitation-nu'`
 *     pour rester foncier dans regime-lot.js (splitFonciereLots).
 *   - bail : map ref → bail, `type:'nu'` + `typeContrat:'nu'` (regime-lot.js _classifyBail).
 *   - mouvement : forme saveMv() (~14824) → { id,date,lib,imm,cat,qui,db,cr,fac,compteurCcId }.
 *   - catégories : NOMS EXACTS de STD_CATEGORIES (index.html ~3932). Apostrophes ASCII U+0027.
 *
 * Mécanisme 2044 (vérifié dans js/core/legal-2044.js _compute2044 + index.html
 * _legal2044BuildOpts ~47381) :
 *   - recette  211 = cr − db   (Loyers encaissés, niv:log → qui = ref logement)
 *   - charge   221/223/224/227/229 = db − cr
 *   - charge   222 (forfait 20€/local) : AUTO, nbLocaux × 20 — pas de mouvement
 *   - interet  250 = db − cr   (Prêt — Intérêts d'emprunt, niv:imm → qui:'' + imm)
 *   - special  (Prêt = capital/échéance) : ligne2044 vide → EXCLU du résultat foncier
 *   - 225 / 230 : produites par la régul (computeRegul) ; Camille n'a pas de compteur
 *     collectif → 225 = 0 et 230 absent. On les OMET volontairement (cf rapport).
 */
(function (root) {
  'use strict';

  var DEMO_KEY = '_test_immotrack_v4';

  // ── Base64 UTF-8 portable (navigateur + sandbox Node de verify-2044.mjs) ────
  // Le sandbox vm de la vérif n'expose ni btoa ni Buffer ni TextEncoder : encodeur
  // pur-JS. Encode d'abord en UTF-8 (les SVG contiennent des accents) puis base64.
  function _b64(str) {
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    // 1) chaîne → octets UTF-8
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) { bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else { bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    }
    // 2) octets → base64
    var out = '';
    for (var j = 0; j < bytes.length; j += 3) {
      var b0 = bytes[j], b1 = bytes[j + 1], b2 = bytes[j + 2];
      var has1 = b1 !== undefined, has2 = b2 !== undefined;
      out += B64[b0 >> 2];
      out += B64[((b0 & 3) << 4) | (has1 ? (b1 >> 4) : 0)];
      out += has1 ? B64[((b1 & 15) << 2) | (has2 ? (b2 >> 6) : 0)] : '=';
      out += has2 ? B64[b2 & 63] : '=';
    }
    return out;
  }

  // ── Catégories STD utilisées (noms EXACTS, apostrophes ASCII) ──────────────
  var CAT = {
    LOYER:     'Loyers encaissés',
    GESTION:   'Frais de gestion / honoraires / comptabilité', // 221
    ASSURANCE: 'Primes d\'assurance (PNO, GLI)',               // 223
    TRAVAUX:   'Travaux (entretien, réparation, amélioration)', // 224
    TAXE_FONC: 'Taxe foncière (et taxes annexes)',             // 227
    COPRO:     'Charges de copropriété',                       // 229
    INTERETS:  'Prêt — Intérêts d\'emprunt',                   // 250
    PRET:      'Prêt'                                          // special (capital, hors 2044)
  };

  // Catégories visibles dans DB.categories (kit de démarrage ; les STD sont
  // de toute façon reconnues par nom même absentes de cette liste).
  var DEMO_CATEGORIES = [
    CAT.LOYER, CAT.GESTION, CAT.ASSURANCE, CAT.TRAVAUX,
    CAT.TAXE_FONC, CAT.COPRO, CAT.INTERETS, CAT.PRET
  ];

  // ── Persona Camille Mercier — détention en direct (personne physique) ──────
  // 3 immeubles, 1 logement chacun, TOUS en location nue, régime réel, 2025.
  function buildCamille() {
    var ENT_NOM = 'Camille Mercier';
    var YEAR = 2025;

    // --- Entité (détention en direct) ---
    var ent = {
      id: 7001,
      nom: ENT_NOM,
      type: 'Personne physique', // champ libre dans le formulaire (ent-type ~3072)
      siren: '',
      siege: '14 rue des Tonneliers, 67000 Strasbourg',
      gerant: 'Camille Mercier',
      gerants: 'Camille Mercier',
      iban: 'FR7630001007941234567890185',
      bic: '',
      emailEnvoi: '',
      immeubles: [
        { id: 7101, nom: 'Résidence Neustadt', adr: '8 avenue de la Forêt-Noire, 67000 Strasbourg',
          annee: 1995, regimeJuridique: 'Copropriété', driveFolderId: null, compteursCollectifs: [] },
        { id: 7102, nom: 'Le Clemenceau', adr: '22 rue de Clemenceau, 67300 Schiltigheim',
          annee: 2003, regimeJuridique: 'Copropriété', driveFolderId: null, compteursCollectifs: [] },
        { id: 7103, nom: 'Campus Esplanade', adr: '5 boulevard de la Victoire, 67000 Strasbourg',
          annee: 1988, regimeJuridique: 'Copropriété', driveFolderId: null, compteursCollectifs: [] }
      ],
      entityId: 'eid_camille_001', members: [], driveFileId: null, driveFolderId: null
    };

    // --- Logements (1 par immeuble, tous NUS) ---
    var logs = [
      { id: 7201, ref: 'T3-NEU', imm: 'Résidence Neustadt', entity: ENT_NOM, type: 'T3', surf: 68,
        etage: '2e', adr: '8 avenue de la Forêt-Noire · porte 12', hc: 780, ch: 80, dg: 780,
        tantiemes: 240, compteCharges: true, typeUsage: 'habitation-nu',
        locataire: 'Julien Weiss', tel: '06.12.34.56.01', mail: 'julien.weiss@example.fr',
        debut: '2022-07-01', fin: '', irl: 'T2',
        dpe: { classe: 'C', date: '2021-09-15', ges: 'B', valEner: '145' },
        // Chauffage gaz individuel → déclenche EQUIP_RULES CHAUDIERE_GAZ (entretien annuel).
        chauffage: { gaz: true },
        equipements: { ecsType: 'gaz', vmcType: 'individuelle' },
        notes: 'Démo Propryo — fictif' },
      { id: 7202, ref: 'T2-CLE', imm: 'Le Clemenceau', entity: ENT_NOM, type: 'T2', surf: 52,
        etage: '1er', adr: '22 rue de Clemenceau · porte 4', hc: 640, ch: 60, dg: 640,
        tantiemes: 180, compteCharges: true, typeUsage: 'habitation-nu',
        locataire: 'Sophie Klein', tel: '06.12.34.56.02', mail: 'sophie.klein@example.fr',
        debut: '2023-09-01', fin: '', irl: 'T3',
        dpe: { classe: 'D', date: '2022-03-10', ges: 'C', valEner: '210' },
        // VMC individuelle → déclenche EQUIP_RULES VMC_NETT (nettoyage bouches).
        equipements: { vmcType: 'individuelle' },
        notes: 'Démo Propryo — fictif (lot avec emprunt)' },
      { id: 7203, ref: 'STU-CAM', imm: 'Campus Esplanade', entity: ENT_NOM, type: 'Studio', surf: 24,
        etage: '4e', adr: '5 boulevard de la Victoire · porte 41', hc: 430, ch: 40, dg: 430,
        tantiemes: 90, compteCharges: true, typeUsage: 'habitation-nu',
        locataire: 'Lucas Marchal', tel: '06.12.34.56.03', mail: 'lucas.marchal@example.fr',
        debut: '2024-01-15', fin: '', irl: 'T4',
        dpe: { classe: 'C', date: '2023-01-05', ges: 'B', valEner: '160' },
        // Chauffe-eau gaz → déclenche EQUIP_RULES ECS_GAZ (entretien annuel).
        equipements: { ecsType: 'gaz' },
        notes: 'Démo Propryo — fictif' }
    ];

    // --- Baux (map ref → bail), tous NUS ---
    var baux = {
      'T3-NEU': {
        ref: 'T3-NEU', debut: '2022-07-01', fin: '', hc: 780, ch: 80, dg: 780,
        type: 'nu', typeContrat: 'nu', entity: ENT_NOM, irl: 'T2 2022',
        locataires: [{ civilite: 'M.', nom: 'Julien Weiss', tel: '06.12.34.56.01', email: 'julien.weiss@example.fr' }],
        jpay: 5
      },
      'T2-CLE': {
        ref: 'T2-CLE', debut: '2023-09-01', fin: '', hc: 640, ch: 60, dg: 640,
        type: 'nu', typeContrat: 'nu', entity: ENT_NOM, irl: 'T3 2023',
        locataires: [{ civilite: 'Mme', nom: 'Sophie Klein', tel: '06.12.34.56.02', email: 'sophie.klein@example.fr' }],
        jpay: 5
      },
      'STU-CAM': {
        ref: 'STU-CAM', debut: '2024-01-15', fin: '', hc: 430, ch: 40, dg: 430,
        type: 'nu', typeContrat: 'nu', entity: ENT_NOM, irl: 'T4 2023',
        locataires: [{ civilite: 'M.', nom: 'Lucas Marchal', tel: '06.12.34.56.03', email: 'lucas.marchal@example.fr' }],
        jpay: 5
      }
    };

    // --- Mouvements 2025 ---
    var mvts = [];
    var mid = 70001;
    var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

    // Loyers encaissés (211) : 12 mois × 3 lots, cr = HC + charges.
    // Le 5 de chaque mois (jpay = 5). qui = ref logement (niv:log).
    var loyers = [
      { ref: 'T3-NEU',  imm: 'Résidence Neustadt', montant: 860 }, // 780 + 80
      { ref: 'T2-CLE',  imm: 'Le Clemenceau',      montant: 700 }, // 640 + 60
      { ref: 'STU-CAM', imm: 'Campus Esplanade',   montant: 470 }  // 430 + 40
    ];
    loyers.forEach(function (L) {
      for (var mo = 1; mo <= 12; mo++) {
        mvts.push({
          id: mid++, date: YEAR + '-' + pad2(mo) + '-05',
          lib: 'Loyer + charges ' + pad2(mo) + '/' + YEAR, imm: L.imm,
          cat: CAT.LOYER, qui: L.ref, db: 0, cr: L.montant, fac: '', compteurCcId: ''
        });
      }
      // 2026 : loyers janv→juil (démo « vivante » l'année en cours ; le 2044 2025
      // filtre sur la période → totalement neutre). Tarifs inchangés : la révision
      // IRL 2026 reste « à valider » à l'écran (cohérent).
      for (var mo2 = 1; mo2 <= 7; mo2++) {
        mvts.push({
          id: mid++, date: '2026-' + pad2(mo2) + '-05',
          lib: 'Loyer + charges ' + pad2(mo2) + '/2026', imm: L.imm,
          cat: CAT.LOYER, qui: L.ref, db: 0, cr: L.montant, fac: '', compteurCcId: ''
        });
      }
    });

    // Charges 2026 déjà tombées à date (juillet) : PNO janvier + appels copro avril.
    [['Résidence Neustadt', 'PNO-NEU-2026'], ['Le Clemenceau', 'PNO-CLE-2026'], ['Campus Esplanade', 'PNO-CAM-2026']]
      .forEach(function (a) {
        mvts.push({ id: mid++, date: '2026-01-20',
          lib: 'Prime assurance PNO 2026', imm: a[0],
          cat: CAT.ASSURANCE, qui: '', db: 145, cr: 0, fac: a[1], compteurCcId: '' });
      });
    mvts.push({ id: mid++, date: '2026-04-01',
      lib: 'Appels de fonds copropriété 2026', imm: 'Résidence Neustadt',
      cat: CAT.COPRO, qui: '', db: 620, cr: 0, fac: 'SYNDIC-NEU-2026', compteurCcId: '' });
    mvts.push({ id: mid++, date: '2026-04-01',
      lib: 'Appels de fonds copropriété 2026', imm: 'Campus Esplanade',
      cat: CAT.COPRO, qui: '', db: 310, cr: 0, fac: 'SYNDIC-CAM-2026', compteurCcId: '' });

    // Frais de gestion / honoraires / comptabilité (221) — cotisation bailleur (niv:imm).
    mvts.push({ id: mid++, date: YEAR + '-02-10',
      lib: 'Cotisation adhérent bailleur (UNPI)', imm: 'Résidence Neustadt',
      cat: CAT.GESTION, qui: '', db: 90, cr: 0, fac: 'UNPI-2025-0042', compteurCcId: '' });

    // Primes d'assurance PNO/GLI (223) — ~140 €/immeuble (niv:imm).
    [['Résidence Neustadt', 'PNO-NEU-2025'], ['Le Clemenceau', 'PNO-CLE-2025'], ['Campus Esplanade', 'PNO-CAM-2025']]
      .forEach(function (a) {
        mvts.push({ id: mid++, date: YEAR + '-01-20',
          lib: 'Prime assurance PNO ' + YEAR, imm: a[0],
          cat: CAT.ASSURANCE, qui: '', db: 140, cr: 0, fac: a[1], compteurCcId: '' });
      });

    // Travaux entretien/réparation (224) — niv:log, factures parlantes (drill case→facture).
    mvts.push({ id: mid++, date: YEAR + '-03-12',
      lib: 'Réparation fuite plomberie salle de bain', imm: 'Résidence Neustadt',
      cat: CAT.TRAVAUX, qui: 'T3-NEU', db: 1450, cr: 0, fac: 'PLOMB-2025-0312', compteurCcId: '' });
    mvts.push({ id: mid++, date: YEAR + '-09-05',
      lib: 'Remise en peinture séjour (remise en location)', imm: 'Campus Esplanade',
      cat: CAT.TRAVAUX, qui: 'STU-CAM', db: 680, cr: 0, fac: 'PEINT-2025-0905', compteurCcId: '' });

    // Taxe foncière (227) — niv:imm.
    [['Résidence Neustadt', 980, 'TF-NEU-2025'], ['Le Clemenceau', 760, 'TF-CLE-2025'], ['Campus Esplanade', 540, 'TF-CAM-2025']]
      .forEach(function (a) {
        mvts.push({ id: mid++, date: YEAR + '-10-15',
          lib: 'Taxe foncière ' + YEAR, imm: a[0],
          cat: CAT.TAXE_FONC, qui: '', db: a[1], cr: 0, fac: a[2], compteurCcId: '' });
      });

    // Charges de copropriété (229) — niv:imm. Seulement Neustadt + Campus (pas Clemenceau).
    mvts.push({ id: mid++, date: YEAR + '-04-01',
      lib: 'Appels de fonds copropriété ' + YEAR, imm: 'Résidence Neustadt',
      cat: CAT.COPRO, qui: '', db: 1200, cr: 0, fac: 'SYNDIC-NEU-2025', compteurCcId: '' });
    mvts.push({ id: mid++, date: YEAR + '-04-01',
      lib: 'Appels de fonds copropriété ' + YEAR, imm: 'Campus Esplanade',
      cat: CAT.COPRO, qui: '', db: 600, cr: 0, fac: 'SYNDIC-CAM-2025', compteurCcId: '' });

    // Intérêts d'emprunt (250) — VRAI mécanisme : mouvement normal cat « Prêt — Intérêts
    // d'emprunt » (niv:imm → qui:'' + imm), créé par _finCreditCreate (~46535).
    mvts.push({ id: mid++, date: YEAR + '-12-31',
      lib: 'Intérêts d\'emprunt ' + YEAR + ' — Le Clemenceau', imm: 'Le Clemenceau',
      cat: CAT.INTERETS, qui: '', db: 2640, cr: 0, fac: 'PRET-CLE-ATTEST-2025', compteurCcId: '' });

    // Capital remboursé — cat « Prêt » (special, EXCLU du 2044). Sert à prouver que l'app
    // trie capital / intérêts. niv:imm.
    mvts.push({ id: mid++, date: YEAR + '-12-31',
      lib: 'Capital remboursé ' + YEAR + ' — Le Clemenceau', imm: 'Le Clemenceau',
      cat: CAT.PRET, qui: '', db: 4200, cr: 0, fac: 'PRET-CLE-CAPITAL-2025', compteurCcId: '' });

    // ── Photos démo (data-URI SVG 4:3, léger) ────────────────────────────────
    // Petites images de remplissage pour que l'écran EDL affiche un compteur photos
    // (rEDLList lit .length de photosE/photosS ; le rendu liste montre « 📷N »).
    // Chaque photo porte un idbKey + une légende (name). Le binaire n'est pas requis
    // pour la vue liste ; il peut être injecté dans IndexedDB par le script de capture.
    function _photo(key, legende, hexFill) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">'
        + '<rect width="320" height="240" fill="' + hexFill + '"/>'
        + '<rect x="12" y="12" width="296" height="216" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3"/>'
        + '<text x="160" y="128" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" '
        + 'font-size="18" fill="#ffffff">' + legende + '</text></svg>';
      var dataUri = 'data:image/svg+xml;base64,' + _b64(svg);
      return {
        name: legende,
        data: dataUri,  // legacy .data → openEditEDL/_migratePhoto migre vers IndexedDB → photo AFFICHÉE dans l'éditeur
        ts: '2024-01-15T10:0' + (key.length % 6) + ':00.000Z',
        synced: false, driveFileId: '', driveFileName: '',
        _demoDataUri: dataUri
      };
    }

    // --- État des lieux d'ENTRÉE — STU-CAM / Lucas Marchal (2024-01-15) ---
    // Forme copiée sur saveEDL (index.html ~29465) : type 'Entrée' (accent + majuscule,
    // cf badge rEDLList e.type==='Entrée'), pieces[] = { nom, elements[] },
    // element = { nom, etatE, obsE, photosE[], etatS:'', obsS:'', photosS:[] }.
    var edl = [{
      id: 78001, type: 'Entrée', date: '2024-01-15', logement: 'STU-CAM',
      locataire: 'Lucas Marchal', locAdr: '5 boulevard de la Victoire · porte 41, 67000 Strasbourg',
      locNouvAdr: '', gerant: 'Camille Mercier',
      bailleurNom: 'Camille Mercier', bailleurAdr: '14 rue des Tonneliers, 67000 Strasbourg',
      adr: '5 boulevard de la Victoire · porte 41', surf: '24', npp: '1', ltype: 'Studio',
      ancienOcc: '', notes: 'État des lieux d\'entrée — logement remis à neuf. Démo Propryo, fictif.',
      drivePath: '',
      pieces: [
        { nom: 'Séjour / cuisine', elements: [
          { nom: 'Murs / peinture', etatE: 'Neuf', obsE: 'Peinture blanche refaite, aucune trace.',
            photosE: [_photo('sej-mur', 'Séjour — mur peinture', '#8FA9C9')], etatS: '', obsS: '', photosS: [] },
          { nom: 'Sol / revêtement', etatE: 'Bon état', obsE: 'Parquet stratifié, léger jeu porte d\'entrée.',
            photosE: [_photo('sej-sol', 'Séjour — sol stratifié', '#B08A6A')], etatS: '', obsS: '', photosS: [] },
          { nom: 'Plan de travail / évier', etatE: 'Neuf', obsE: 'Kitchenette neuve, plaques 2 feux OK.',
            photosE: [_photo('cui-plan', 'Cuisine — plan de travail', '#7FB3A3')], etatS: '', obsS: '', photosS: [] }
        ]},
        { nom: 'Salle d\'eau', elements: [
          { nom: 'Douche / robinetterie', etatE: 'Bon état', obsE: 'Mitigeur neuf, joint silicone propre.',
            photosE: [_photo('sdb-douche', 'Salle d\'eau — douche', '#6FA8C7')], etatS: '', obsS: '', photosS: [] },
          { nom: 'WC', etatE: 'Bon état', obsE: 'Chasse d\'eau fonctionnelle.',
            photosE: [], etatS: '', obsS: '', photosS: [] }
        ]},
        { nom: 'Coin nuit', elements: [
          { nom: 'Fenêtre / volet', etatE: 'Bon état', obsE: 'Double vitrage, volet roulant électrique OK.',
            photosE: [_photo('nuit-fen', 'Coin nuit — fenêtre', '#9BB08A')], etatS: '', obsS: '', photosS: [] }
        ]}
      ],
      compteurs: { elec: '18452', gaz: '', eauC: '0341', eauF: '1128' },
      compteursSortie: {}, compteursPhotos: {}, chauffage: {}, technologies: {},
      cles: [
        { type: 'Porte d\'entrée', nb: 2, photos: [], photosS: [] },
        { type: 'Boîte aux lettres', nb: 1, photos: [], photosS: [] }
      ],
      daaf: { statut: 'present', notes: 'DAAF posé au plafond du couloir, testé OK.', photos: [] },
      mobilierEnabled: false, mobilier: null,
      signatures: { bailleur: '', locataire: '' }
    }];

    // --- Équipements / interventions périodiques (DB.equipements[ref][key]) ---
    // Forme copiée sur _saveEquip (index.html ~43370) :
    //   DB.equipements[ref][key] = { lastDate, interv, notes, updatedAt }.
    // Les `key` correspondent aux EQUIP_RULES déclenchées par le chauffage/équipement
    // du logement (CHAUDIERE_GAZ, VMC_NETT, ECS_GAZ) — enrichis ci-dessus.
    var equipements = {
      'T3-NEU': {
        CHAUDIERE_GAZ: { lastDate: '2025-02-18', interv: 'Gaz Confort 67',
          notes: 'Entretien annuel chaudière gaz, attestation remise. Facture ENTR-GAZ-2025-0218.',
          updatedAt: '2025-02-18T09:30:00.000Z' },
        VMC_NETT: { lastDate: '2025-02-18', interv: 'Gaz Confort 67',
          notes: 'Nettoyage bouches VMC individuelle lors du passage chaudière.',
          updatedAt: '2025-02-18T09:35:00.000Z' }
      },
      'STU-CAM': {
        ECS_GAZ: { lastDate: '2024-11-05', interv: 'Plombier Schmidt',
          notes: 'Entretien chauffe-eau gaz, contrôle sécurité OK. Facture ECS-CAM-2024-1105.',
          updatedAt: '2024-11-05T14:00:00.000Z' }
      }
    };

    return {
      entites: [ent],
      logements: logs,
      baux: baux,
      mouvements: mvts,
      baux_historique: [],
      quittances: [
        { id: 'q_demo_1', logement: 'T3-NEU', locataire: 'Julien Weiss', entity: ENT_NOM, mois: 'Janvier 2025', hc: 780, ch: 80, datePaiement: '2025-01-05', date: '2025-01-05' },
        { id: 'q_demo_2', logement: 'T2-CLE', locataire: 'Sophie Klein', entity: ENT_NOM, mois: 'Janvier 2025', hc: 640, ch: 60, datePaiement: '2025-01-05', date: '2025-01-05' },
        { id: 'q_demo_3', logement: 'STU-CAM', locataire: 'Lucas Marchal', entity: ENT_NOM, mois: 'Janvier 2025', hc: 430, ch: 40, datePaiement: '2025-01-05', date: '2025-01-05' },
        { id: 'q_demo_4', logement: 'T3-NEU', locataire: 'Julien Weiss', entity: ENT_NOM, mois: 'Février 2025', hc: 780, ch: 80, datePaiement: '2025-02-05', date: '2025-02-05' },
        { id: 'q_demo_5', logement: 'T3-NEU', locataire: 'Julien Weiss', entity: ENT_NOM, mois: 'Juin 2026', hc: 780, ch: 80, datePaiement: '2026-06-05', date: '2026-06-05' },
        { id: 'q_demo_6', logement: 'T2-CLE', locataire: 'Sophie Klein', entity: ENT_NOM, mois: 'Juin 2026', hc: 640, ch: 60, datePaiement: '2026-06-05', date: '2026-06-05' },
        { id: 'q_demo_7', logement: 'STU-CAM', locataire: 'Lucas Marchal', entity: ENT_NOM, mois: 'Juin 2026', hc: 430, ch: 40, datePaiement: '2026-06-05', date: '2026-06-05' },
        { id: 'q_demo_8', logement: 'T3-NEU', locataire: 'Julien Weiss', entity: ENT_NOM, mois: 'Juillet 2026', hc: 780, ch: 80, datePaiement: '2026-07-05', date: '2026-07-05' }
      ],
      assurances: [],
      mrh: [],
      edl: edl,
      equipements: equipements,
      documents: [],
      candidats: [
        { id: 'cand_demo_1', logRef: 'STU-CAM', entity: ENT_NOM, source: 'manuel',
          civilite: 'M.', nom: 'Bernard', prenom: 'Thomas', ddn: '1998-04-12', lieuNaiss: 'Mulhouse',
          tel: '06.20.00.00.01', email: 'thomas.bernard@example.fr',
          adressePrecedente: '12 rue du Test, 67000 Strasbourg', dateDebutSouhaitee: '2026-02-01',
          revenus: 1850, employeur: 'CHU Strasbourg', contrat: 'CDI',
          garant: { nom: 'Bernard (père)', adresse: '4 rue des Vignes, 68000 Colmar', ddn: '1968-01-01', lieu: 'Colmar' },
          piecesCompletes: true, statut: 'enCours', confianceScore: 84, piecesVerifiees: true,
          notes: '', bailRef: '', dateCreation: '2026-01-10T09:00:00.000Z',
          _modifiedAt: '2026-01-10T09:00:00.000Z', _archived: false, vu: false },
        { id: 'cand_demo_2', logRef: 'STU-CAM', entity: ENT_NOM, source: 'manuel',
          civilite: 'M.', nom: 'Durand', prenom: 'Hugo', ddn: '1995-11-02', lieuNaiss: 'Metz',
          tel: '06.20.00.00.03', email: 'hugo.durand@example.fr',
          adressePrecedente: '9 avenue de la Paix, 67000 Strasbourg', dateDebutSouhaitee: '2026-02-15',
          revenus: 2600, employeur: 'Capgemini', contrat: 'CDI',
          garant: null, piecesCompletes: false, statut: 'recu', confianceScore: 58, piecesVerifiees: false,
          notes: '', bailRef: '', dateCreation: '2026-01-12T09:00:00.000Z',
          _modifiedAt: '2026-01-12T09:00:00.000Z', _archived: false, vu: true },
        { id: 'cand_demo_3', logRef: 'STU-CAM', entity: ENT_NOM, source: 'manuel',
          civilite: 'Mme', nom: 'Petit', prenom: 'Léa', ddn: '2001-09-03', lieuNaiss: 'Nancy',
          tel: '06.20.00.00.02', email: 'lea.petit@example.fr',
          adressePrecedente: '1 rue des Écoles, 67000 Strasbourg', dateDebutSouhaitee: '2026-03-01',
          revenus: 1200, employeur: 'Étudiante (alternance)', contrat: 'Alternance',
          garant: null, piecesCompletes: false, statut: 'recu', confianceScore: 39, piecesVerifiees: false,
          notes: '', bailRef: '', dateCreation: '2026-01-08T09:00:00.000Z',
          _modifiedAt: '2026-01-08T09:00:00.000Z', _archived: false, vu: true }
      ],
      categories: DEMO_CATEGORIES.slice(),
      catConfig: { 'Loyers encaissés': { inclYTD: true } },
      agenda: [],
      params: {},
      // Indices IRL 2026 (les 2022→T1-2026 sont fusionnés depuis IRL_DEFAULT au boot, index.html:4922).
      // Sans eux, l'écran Révision IRL affiche « indice manquant » pour les baux dont l'anniversaire tombe en 2026.
      irlTable: { 'T2 2026': 150.98, 'T3 2026': 150.05, 'T4 2026': 150.12 }
    };
  }

  // ── Stubs pour les autres personas (à compléter plus tard) ─────────────────
  // function buildMarcLea() { /* Marc & Léa — détention en direct, à venir */ }
  // function buildSciBerger() { /* SCI Berger — multi-associés, dont un lot MEUBLÉ
  //   (typeUsage:'habitation-meuble' / bail.type:'meuble') pour démontrer l'exclusion
  //   du 2044 via regime-lot.js. À venir. */ }

  var PERSONAS = {
    camille: buildCamille
    // marclea: buildMarcLea,
    // berger: buildSciBerger
  };

  /**
   * Écrit le dataset d'une persona dans la clé localStorage ISOLÉE _test_immotrack_v4.
   * @param {string} persona - clé dans PERSONAS (défaut 'camille').
   * @returns {Object} le DB écrit (pour vérification).
   */
  function load(persona) {
    var key = persona || 'camille';
    var build = PERSONAS[key];
    if (!build) throw new Error('Persona démo inconnue : ' + key);
    var db = build();
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage indisponible (contexte non-navigateur)');
    }
    localStorage.setItem(DEMO_KEY, JSON.stringify(db));
    return db;
  }

  /** Construit le DB sans écrire (utilisé par la vérification Node). */
  function build(persona) {
    var key = persona || 'camille';
    var fn = PERSONAS[key];
    if (!fn) throw new Error('Persona démo inconnue : ' + key);
    return fn();
  }

  var api = { DEMO_KEY: DEMO_KEY, CAT: CAT, load: load, build: build, personas: Object.keys(PERSONAS) };

  // Export navigateur (window) + Node (module.exports) sans toucher au boot de l'app.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PropryoDemoSeed = api;
})(typeof self !== 'undefined' ? self
   : (typeof globalThis !== 'undefined' ? globalThis
   : (typeof window !== 'undefined' ? window : null)));
