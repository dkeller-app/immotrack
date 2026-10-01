/**
 * CHARGES (régul) — une charge datée HORS de toute occupation revient au BAILLEUR (vacance),
 * jamais à un locataire.
 *
 * Défaut en prod (audits du 30/09) : dans `computeRegul`, une charge directe (chemin 2 : `mv.qui`
 * rempli) datée hors de toute occupation retombait sur `candidates[0]`, la PREMIÈRE occupation
 * du logement sur la fenêtre. Logement sans bail en cours : le locataire parti (bail clos au 31/03)
 * se voyait imputer les charges importées après son départ — 1 200 € pour l'année au lieu de 300 €.
 * Avec un bail en cours, c'était le locataire ACTUEL qui recevait les charges de la vacance qui a
 * précédé son arrivée. Cela faussait sa régularisation, son décompte, sa clôture (solde de tout
 * compte, retenue sur le dépôt) — et la part bailleur (ligne 225 de la 2044) était sous-évaluée.
 *
 * Les fonctions testées sont les VRAIES fonctions d'index.html (extraites, évaluées avec des stubs
 * minimaux), y compris le moteur des compteurs collectifs (`_calcCcRepartition`,
 * `_ccLogOccupations`, `_getAllBailsForLog`). Tests comportementaux uniquement.
 */

// Fuseau forcé AVANT toute construction de date : les bornes d'occupation sont en heure de Paris.
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => {
  html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, '');
});

/** Corps d'une fonction de premier niveau (même découpe que les autres tests de câblage). */
function corpsDe(src, nom) {
  const re = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(src);
  if (!m) return null;
  const fin = src.indexOf('\n}', m.index);
  return fin === -1 ? null : src.slice(m.index, fin + 2);
}

const _isAlive = (x) => !!x && !x._deleted;
const RECUP = 'Charges récupérables (eau, énergie…)';
const COPRO = 'Charges de copropriété';
// Lignes 2044 des catégories utilisées (le résolveur de l'app : window._catLigne2044).
const LIGNE_2044 = { [RECUP]: null, [COPRO]: '229', 'Loyers encaissés': '211' };

/**
 * computeRegul réelle + moteur réel des compteurs collectifs, branchés sur un DB de test.
 * `conso` : consommation relevée par logement (clé sous-compteurs), sinon 0.
 */
function chargerRegul(DB, { conso = {} } = {}) {
  const fns = ['_isoLocal', '_findBailByRefTolerant', '_getAllBailsForLog', '_ccLogOccupations',
    '_ccLogsInScope', '_ccApplyCleSimple', '_ccApplySousCompteurs', '_calcCcRepartition', 'computeRegul'];
  const src = fns.map((n) => {
    const c = corpsDe(html, n);
    if (!c) throw new Error('fonction introuvable : ' + n);
    return c;
  }).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(
    'DB', '_isAlive', '_isLoyerCategory', '_isChargeRecupCategory', '_catLigne2044',
    'CC_REPARTITION_LABELS', 'fd', 'fmtN', '_ccType', '_ccConsoLogPeriod',
    src + '\nreturn computeRegul;'
  )(
    DB, _isAlive,
    (c) => c === 'Loyers encaissés',
    (c) => c === RECUP || c === COPRO,
    (c) => (c in LIGNE_2044 ? LIGNE_2044[c] : null),
    {}, (s) => s, (n) => String(n), () => ({ unit: 'm³' }),
    (l) => conso[l.ref] || 0
  );
}

const IMM = 'Tilleuls';
const A1 = { ref: 'TIL-A1', imm: IMM, tantiemes: 500, surf: 50 };
const A2 = { ref: 'TIL-A2', imm: IMM, tantiemes: 500, surf: 50 };
const hist = (ref, debut, fin, nom, ch = 100, extra = {}) =>
  ({ ref, debut, fin, ch, locataires: [{ nom }], ...extra });
const bail = (debut, nom, ch = 100, fin = '') => ({ debut, fin, ch, locataires: [{ nom }] });
let _id = 1;
/** Une charge directe (chemin 2) par mois, le 15, de `montant` €. */
const chargesMensuelles = (ref, montant = 100, cat = RECUP, jour = '15') =>
  Array.from({ length: 12 }, (_, i) => ({
    id: _id++, date: `2026-${String(i + 1).padStart(2, '0')}-${jour}`, cat, db: montant, qui: ref, imm: IMM,
    lib: `Eau ${i + 1}`,
  }));
const dbDe = ({ logements = [A1], baux = {}, historique = [], mouvements = [], compteurs = [] } = {}) => ({
  logements, baux, baux_historique: historique, mouvements,
  entites: [{ nom: 'SCI', immeubles: [{ nom: IMM, compteursCollectifs: compteurs }] }],
});
const r2 = (x) => Math.round(x * 100) / 100;
const ANNEE = ['2026-01-01', '2026-12-31'];
/** Toute charge récupérable de la fenêtre est quelque part : locataires + bailleur + non réparti. */
function totalReparti(res) {
  const loc = Object.values(res.entries).reduce((s, e) => s + e.charges, 0);
  const bai = Object.values(res.bailleur).reduce((s, b) => s + b.total, 0);
  const trou = Object.values(res.nonReparti).reduce((s, n) => s + n.total, 0);
  return r2(loc + bai + trou);
}

describe('0 · garde-fous du test', () => {
  it('le fuseau est bien UTC+ (sinon les bornes au jour près seraient vraies par le vide)', () => {
    expect(new Date('2026-01-01T00:00:00').getTimezoneOffset()).toBeLessThan(0);
  });
});

describe('1 · le défaut mesuré — bail clos au 31/03, logement sans bail en cours', () => {
  const scenario = () => dbDe({
    historique: [hist('TIL-A1', '2024-01-01', '2026-03-31', 'Alice')],
    mouvements: chargesMensuelles('TIL-A1'),
  });

  it('le locataire parti ne porte que les charges de SON occupation : 300 €, pas 1 200 €', () => {
    const res = chargerRegul(scenario())(...ANNEE);
    const alice = res.entries['TIL-A1|h0'];
    expect(alice.finOcc).toBe('2026-03-31');
    expect(alice.charges).toBe(300);
    expect(alice.details.map((d) => d.date)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('les 900 € d\'avril à décembre reviennent au bailleur (vacance), ligne par ligne, avec le logement', () => {
    const res = chargerRegul(scenario())(...ANNEE);
    const b = res.bailleur[IMM];
    expect(r2(b.total)).toBe(900);
    expect(b.segments).toHaveLength(9);
    expect(b.segments.every((s) => s.ref === 'TIL-A1' && /Vacance TIL-A1/.test(s.motif))).toBe(true);
    expect(b.segments.map((s) => s.date)[0]).toBe('2026-04-15');
  });

  it('charge sans part de 2044 propre (eau, énergie) → toute la vacance va en ligne 225', () => {
    const res = chargerRegul(scenario())(...ANNEE);
    expect(r2(res.bailleur[IMM].total225)).toBe(900);
  });

  it('aucun euro perdu : locataire + bailleur = 1 200 €', () => {
    expect(totalReparti(chargerRegul(scenario())(...ANNEE))).toBe(1200);
  });

  it('le solde de régul du parti ne compte que sa période (provisions 3 × 100 € − 300 € = 0)', () => {
    const db = scenario();
    db.mouvements.push(...['01', '02', '03'].map((m) => ({ id: _id++, date: `2026-${m}-05`, cat: 'Loyers encaissés', cr: 600, qui: 'TIL-A1' })));
    const e = chargerRegul(db)(...ANNEE).entries['TIL-A1|h0'];
    expect(e.provisions).toBe(300);
    expect(r2(e.provisions - e.charges)).toBe(0);
  });
});

describe('2 · bornes au jour près (heure de Paris)', () => {
  const autourDuDepart = (fin, dates) => dbDe({
    historique: [hist('TIL-A1', '2024-01-01', fin, 'Alice')],
    mouvements: dates.map((d) => ({ id: _id++, date: d, cat: RECUP, db: 50, qui: 'TIL-A1', lib: 'Eau ' + d })),
  });

  it('charge datée le JOUR de la sortie → au locataire ; le lendemain → au bailleur', () => {
    const res = chargerRegul(autourDuDepart('2026-03-31', ['2026-03-31', '2026-04-01']))(...ANNEE);
    expect(res.entries['TIL-A1|h0'].details.map((d) => d.date)).toEqual(['2026-03-31']);
    expect(res.bailleur[IMM].segments.map((s) => s.date)).toEqual(['2026-04-01']);
  });

  it('sortie le jour du passage à l\'heure d\'été (29/03) : 29/03 au locataire, 30/03 au bailleur', () => {
    const res = chargerRegul(autourDuDepart('2026-03-29', ['2026-03-29', '2026-03-30']))(...ANNEE);
    expect(res.entries['TIL-A1|h0'].details.map((d) => d.date)).toEqual(['2026-03-29']);
    expect(res.bailleur[IMM].segments.map((s) => s.date)).toEqual(['2026-03-30']);
  });

  it('sortie le jour du passage à l\'heure d\'hiver (25/10) : 25/10 au locataire, 26/10 au bailleur', () => {
    const res = chargerRegul(autourDuDepart('2026-10-25', ['2026-10-25', '2026-10-26']))(...ANNEE);
    expect(res.entries['TIL-A1|h0'].details.map((d) => d.date)).toEqual(['2026-10-25']);
    expect(res.bailleur[IMM].segments.map((s) => s.date)).toEqual(['2026-10-26']);
  });

  it('date de mouvement horodatée (« 2026-03-31T10:00 ») : le jour de sortie reste au locataire', () => {
    const db = autourDuDepart('2026-03-31', []);
    db.mouvements.push({ id: _id++, date: '2026-03-31T10:00:00', cat: RECUP, db: 50, qui: 'TIL-A1', lib: 'Eau' });
    const res = chargerRegul(db)('2026-01-01', '2026-12-31T23:59:59');
    expect(res.entries['TIL-A1|h0'].charges).toBe(50);
    expect(res.bailleur[IMM]).toBeUndefined();
  });
});

describe('3 · vacance entre deux baux, relocation, arrivée en cours d\'année', () => {
  it('A jusqu\'au 31/03, vacance avril-mai, B depuis le 01/06 : avril et mai au bailleur, pas à B', () => {
    const res = chargerRegul(dbDe({
      baux: { 'TIL-A1': bail('2026-06-01', 'Bruno') },
      historique: [hist('TIL-A1', '2024-01-01', '2026-03-31', 'Alice')],
      mouvements: chargesMensuelles('TIL-A1'),
    }))(...ANNEE);
    expect(res.entries['TIL-A1|h0'].charges).toBe(300);
    expect(res.entries['TIL-A1'].charges).toBe(700);
    expect(res.bailleur[IMM].segments.map((s) => s.date)).toEqual(['2026-04-15', '2026-05-15']);
    expect(r2(res.bailleur[IMM].total)).toBe(200);
  });

  it('relocation sans trou (A → 30/06, B ← 01/07) : 600 € / 600 €, rien au bailleur', () => {
    const res = chargerRegul(dbDe({
      baux: { 'TIL-A1': bail('2026-07-01', 'Bruno') },
      historique: [hist('TIL-A1', '2024-01-01', '2026-06-30', 'Alice')],
      mouvements: chargesMensuelles('TIL-A1'),
    }))(...ANNEE);
    expect(res.entries['TIL-A1|h0'].charges).toBe(600);
    expect(res.entries['TIL-A1'].charges).toBe(600);
    expect(res.bailleur[IMM]).toBeUndefined();
  });

  it('premier bail au 01/04 : les charges de janvier à mars (logement vide) ne vont pas au nouvel arrivant', () => {
    const res = chargerRegul(dbDe({
      baux: { 'TIL-A1': bail('2026-04-01', 'Bruno') },
      mouvements: chargesMensuelles('TIL-A1'),
    }))(...ANNEE);
    expect(res.entries['TIL-A1'].charges).toBe(900);
    expect(r2(res.bailleur[IMM].total)).toBe(300);
  });

  it('logement sans aucun bail sur la fenêtre : inchangé, la charge reste signalée « non répartie »', () => {
    const res = chargerRegul(dbDe({
      historique: [hist('TIL-A1', '2020-01-01', '2025-12-31', 'Alice')],
      mouvements: chargesMensuelles('TIL-A1').slice(0, 2),
    }))(...ANNEE);
    expect(res.entries['TIL-A1|h0']).toBeUndefined();
    expect(res.nonReparti[IMM].total).toBe(200);
    expect(res.bailleur[IMM]).toBeUndefined();
  });
});

describe('4 · 2044 — jamais deux fois la même charge', () => {
  it('charge de copropriété (déjà déduite ligne 229) hors occupation : au bailleur, mais PAS réinjectée en 225', () => {
    const res = chargerRegul(dbDe({
      historique: [hist('TIL-A1', '2024-01-01', '2026-03-31', 'Alice')],
      mouvements: chargesMensuelles('TIL-A1', 100, COPRO),
    }))(...ANNEE);
    const b = res.bailleur[IMM];
    expect(res.entries['TIL-A1|h0'].charges).toBe(300);
    expect(r2(b.total)).toBe(900);
    expect(b.total225).toBe(0);
    expect(b.segments.every((s) => s.deja2044 === '229' && /ligne 229/.test(s.motif))).toBe(true);
  });

  it('compteur collectif : la part de vacance reste en ligne 225 (le moteur 2044 ignore la facture brute)', () => {
    const res = chargerRegul(dbDe({
      logements: [A1, A2],
      baux: { 'TIL-A2': bail('2025-01-01', 'Chloé') },
      historique: [hist('TIL-A1', '2024-01-01', '2026-03-31', 'Alice')],
      compteurs: [{ id: 'cc1', nom: 'Eau', cleRepartition: 'tantiemes' }],
      mouvements: [{ id: _id++, date: '2026-12-15', cat: COPRO, db: 730, compteurCcId: 'cc1', imm: IMM, lib: 'Eau annuelle' }],
    }))(...ANNEE);
    expect(r2(res.bailleur[IMM].total225)).toBe(r2(res.bailleur[IMM].total));
  });
});

describe('5 · compteur collectif — déjà au prorata de l\'occupation, inchangé', () => {
  it('facture annuelle datée APRÈS le départ : le parti garde sa part de janvier-mars, la vacance va au bailleur', () => {
    const res = chargerRegul(dbDe({
      logements: [A1, A2],
      baux: { 'TIL-A2': bail('2025-01-01', 'Chloé') },
      historique: [hist('TIL-A1', '2024-01-01', '2026-03-31', 'Alice')],
      compteurs: [{ id: 'cc1', nom: 'Eau', cleRepartition: 'tantiemes' }],
      mouvements: [{ id: _id++, date: '2026-12-15', cat: RECUP, db: 730, compteurCcId: 'cc1', imm: IMM, lib: 'Eau annuelle' }],
    }))(...ANNEE);
    // 730 € × 50 % = 365 € pour TIL-A1, dont 90 j / 365 occupés par Alice.
    expect(r2(res.entries['TIL-A1|h0'].charges)).toBe(90);
    expect(r2(res.entries['TIL-A2'].charges)).toBe(365);
    expect(r2(res.bailleur[IMM].total)).toBe(275);
    expect(totalReparti(res)).toBe(730);
  });

  it('sous-compteurs (consommation relevée) : la conso du logement reste au locataire, même facturée après son départ', () => {
    const res = chargerRegul(dbDe({
      logements: [A1, A2],
      baux: { 'TIL-A2': bail('2025-01-01', 'Chloé') },
      historique: [hist('TIL-A1', '2024-01-01', '2026-03-31', 'Alice')],
      compteurs: [{ id: 'cc1', nom: 'Eau', cleRepartition: 'sous-compteurs', type: 'eau' }],
      mouvements: [{ id: _id++, date: '2026-12-15', cat: RECUP, db: 400, compteurCcId: 'cc1', imm: IMM, lib: 'Eau annuelle' }],
    }), { conso: { 'TIL-A1': 10, 'TIL-A2': 30 } })(...ANNEE);
    expect(r2(res.entries['TIL-A1|h0'].charges)).toBe(100);
    expect(r2(res.entries['TIL-A2'].charges)).toBe(300);
    expect(res.bailleur[IMM]).toBeUndefined();
  });
});

describe('6 · sans vacance, rien ne bouge — chaque charge reste à l\'occupant du jour', () => {
  // Jeux sans vacance : bail couvrant l'année, rotation sans trou, rotation à trois, deux logements.
  const jeux = {
    'bail sur toute l\'année': dbDe({ baux: { 'TIL-A1': bail('2025-01-01', 'Alice') }, mouvements: chargesMensuelles('TIL-A1', 87.35) }),
    'rotation au 30/06': dbDe({
      baux: { 'TIL-A1': bail('2026-07-01', 'Bruno') },
      historique: [hist('TIL-A1', '2024-01-01', '2026-06-30', 'Alice')],
      mouvements: chargesMensuelles('TIL-A1', 41.17, RECUP, '30').filter((m) => !m.date.startsWith('2026-02')),
    }),
    'trois occupants sans trou': dbDe({
      baux: { 'TIL-A1': bail('2026-09-01', 'Chloé') },
      historique: [hist('TIL-A1', '2024-01-01', '2026-04-30', 'Alice'), hist('TIL-A1', '2026-05-01', '2026-08-31', 'Bruno')],
      mouvements: chargesMensuelles('TIL-A1', 33.33, RECUP, '01'),
    }),
    'deux logements occupés': dbDe({
      logements: [A1, A2],
      baux: { 'TIL-A1': bail('2025-01-01', 'Alice'), 'TIL-A2': bail('2025-06-01', 'Chloé') },
      mouvements: [...chargesMensuelles('TIL-A1', 12.5), ...chargesMensuelles('TIL-A2', 19.99)],
    }),
  };

  Object.entries(jeux).forEach(([nom, db]) => {
    it(`${nom} : chaque charge chez l'occupant dont l'occupation contient sa date, rien au bailleur`, () => {
      const res = chargerRegul(db)(...ANNEE);
      expect(res.bailleur).toEqual({});
      expect(res.nonReparti).toEqual({});
      for (const m of db.mouvements) {
        const porteurs = Object.values(res.entries).filter((e) => e.details.some((d) => d.mvId === m.id));
        expect(porteurs).toHaveLength(1);
        expect(m.date >= porteurs[0].debutOcc && m.date <= porteurs[0].finOcc).toBe(true);
        expect(porteurs[0].details.find((d) => d.mvId === m.id).montant).toBe(m.db);
      }
      const total = db.mouvements.reduce((s, m) => s + m.db, 0);
      expect(totalReparti(res)).toBe(r2(total));
    });
  });
});

describe('7 · 2044 de bout en bout (vraie prévisualisation Finances + vrai moteur 2044)', () => {
  const STD = [
    { nom: COPRO, ligne2044: '229', type: 'charge' },
    { nom: RECUP, ligne2044: '', type: 'special', recup: true },
  ];
  let compute2044;
  beforeAll(async () => {
    ({ _compute2044: compute2044 } = await import('../../js/core/legal-2044.js'));
  });
  /** Options 2044 calculées par la VRAIE `_legal2044BuildOpts`, branchée sur la vraie computeRegul. */
  function opts2044(DB) {
    const regul = chargerRegul(DB);
    // eslint-disable-next-line no-new-func
    return new Function('DB', '_isAlive', 'v', 'window', 'computeRegul',
      corpsDe(html, '_legal2044BuildOpts') + '\nreturn _legal2044BuildOpts;'
    )(DB, _isAlive, () => '', {}, regul)('2026', 'SCI');
  }
  const scenario = (cat) => {
    const db = dbDe({ historique: [hist('TIL-A1', '2024-01-01', '2026-03-31', 'Alice')], mouvements: chargesMensuelles('TIL-A1', 100, cat) });
    db.logements = [{ ...A1, entity: 'SCI' }];
    return db;
  };

  it('eau / énergie (hors 2044 par nature) : la vacance d\'avril à décembre est déduite en 225 (900 €)', () => {
    const db = scenario(RECUP);
    const r = compute2044(db.mouvements, STD, opts2044(db));
    expect(r.lignes['225']).toBe(900);
    expect(r.lignes['229']).toBeUndefined();
  });

  it('charge de copropriété directe : 1 200 € en 229, rien de plus en 225 (pas de double déduction)', () => {
    const db = scenario(COPRO);
    const r = compute2044(db.mouvements, STD, opts2044(db));
    expect(r.lignes['229']).toBe(1200);
    expect(r.lignes['225'] || 0).toBe(0);
  });
});
