/**
 * BAUX-ECHUS — câblage de LA règle d'échéance dans l'app (pastille, agenda/frise, préavis, alertes,
 * geste « arrivé à terme »). Les fonctions RÉELLES sont extraites de l'index.html assemblé et
 * exécutées avec le module réel en `window.BailEcheance` — comme dans le navigateur, où le mirror
 * js/helpers/bail-echeance.global.js est chargé avant les app-part.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as BailEcheance from '../../js/core/bail-echeance.js';
import * as BailDuree from '../../js/core/bail-duree.js';
import { bauxEcheance } from './alert-rules.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

const corpsDe = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  if (i === -1) throw new Error(nom + ' introuvable — le test ne teste plus rien');
  const j = html.indexOf('\n}', i);
  return html.slice(i, j + 2);
};

const AUJ = '2026-10-06';
const FONCTIONS = ['_bailTypeEff', '_bailEcheanceOpts', '_bailEcheance', '_bailEcheanceEffective', '_bailPreavisInfo',
  '_bailEcheanceAlerteDe', '_bailAlerteTerme', '_locEcheanceInfo', '_bailTypeHasTacite', '_bailDureeMois', '_isoLocal'];

/** Monte les fonctions réelles sur une DB, avec le module réel (ou sans, pour le repli). */
function monter(db, avecModule = true) {
  const deps = {
    DB: db,
    window: avecModule ? { BailEcheance, BailDuree, _loyerTodayLocal: () => AUJ } : { _loyerTodayLocal: () => AUJ },
    fd: (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; },
    console: { warn() {} }
  };
  const noms = Object.keys(deps);
  const src = FONCTIONS.map(corpsDe).join('\n');
  const f = new Function(...noms, src + '\nreturn {' + FONCTIONS.join(',') + '};');
  return f(...noms.map((n) => deps[n]));
}

const ENT = [{ nom: 'Perso', type: 'Personne physique' }, { nom: 'SCI', type: 'Personne morale' }];
const LOGS = (refs) => refs.map((ref) => ({ ref, locataire: 'X' }));

describe('pastille d\'échéance (_locEcheanceInfo) — même règle que la frise et l\'agenda', () => {
  const db = { entites: ENT, logements: LOGS(['N', 'E', 'G', 'GR', 'M', 'A']), baux: {
    N: { ref: 'N', type: 'nu', entity: 'Perso', debut: '2015-01-01', fin: '2023-12-31' },
    E: { ref: 'E', type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31' },
    G: { ref: 'G', type: 'garage', debut: '2024-01-01', fin: '2024-12-31', signatures: { signedAt: '2026-09-10T10:00:00Z' } },
    GR: { ref: 'GR', type: 'garage', typeContrat: 'repris', debut: '2024-01-01', fin: '2024-12-31' },
    M: { ref: 'M', type: 'mobilite', debut: '2026-01-01' },
    A: { ref: 'A', type: 'autre', debut: '2024-01-01', fin: '2025-12-31' }
  } };
  it('nu reconduit, garage de l\'app reconduit par son contrat, étudiant et garage repris arrivés à terme', () => {
    const F = monter(db);
    expect(F._locEcheanceInfo(db.baux.N).text).toBe('Tacite reconduction');
    expect(F._locEcheanceInfo(db.baux.G).text).toBe('Tacite reconduction');
    expect(F._locEcheanceInfo(db.baux.E)).toEqual({ cls: 'err', text: 'Arrivé à terme (31/05/2026)', urgent: true });
    expect(F._locEcheanceInfo(db.baux.GR).text).toBe('Arrivé à terme (31/12/2024)');
    expect(F._locEcheanceInfo(db.baux.A).text).toBe('Arrivé à terme (31/12/2025)');
  });
  it('mobilité sans date de fin : « Échéance non renseignée », plus « Tacite reconduction »', () => {
    expect(monter(db)._locEcheanceInfo(db.baux.M).text).toBe('Échéance non renseignée');
  });
  it('aucun texte « Échu » ; lot vacant → pastille vide', () => {
    const F = monter(db);
    for (const k of Object.keys(db.baux)) expect(F._locEcheanceInfo(db.baux[k]).text).not.toMatch(/Échu/);
    expect(F._locEcheanceInfo(null)).toEqual({ cls: 'muted', text: '', urgent: false });
  });
  it('repli sans module : jamais « Tacite reconduction » pour un type qui n\'en a pas', () => {
    const F = monter(db, false);
    expect(F._locEcheanceInfo(db.baux.M).text).toBe('Échéance non renseignée');
    expect(F._locEcheanceInfo(db.baux.E).text).toBe('Arrivé à terme (31/05/2026)');
  });
});

describe('échéance de l\'agenda et de la frise (_bailEcheanceEffective)', () => {
  it('bail nu de 9 ans d\'un particulier → reconduit pour 3 ans, pas 9 (art. 10 al. 3)', () => {
    const db = { entites: ENT, logements: [], baux: {} };
    const F = monter(db);
    expect(F._bailEcheanceEffective({ type: 'nu', entity: 'Perso', debut: '2015-01-01', fin: '2023-12-31' }, null)).toBe('2026-12-31');
  });
  it('« Personne morale » → 6 ans (le fragment « perso » ne l\'envoie plus à 3 ans)', () => {
    const F = monter({ entites: ENT, logements: [], baux: {} });
    expect(F._bailEcheanceEffective({ type: 'nu', entity: 'SCI', debut: '2014-01-01', fin: '2019-12-31' }, null)).toBe('2031-12-31');
    expect(F._bailDureeMois({ type: 'nu' }, null, { type: 'Personne morale' })).toBe(72);
    expect(F._bailDureeMois({ type: 'nu' }, null, { type: 'SCI familiale' })).toBe(36);
  });
  it('étudiant : jamais reconduit tous les 9 mois — l\'échéance reste la fin du contrat', () => {
    const F = monter({ entites: ENT, logements: [], baux: {} });
    expect(F._bailEcheanceEffective({ type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31' }, null)).toBe('2026-05-31');
  });
  it('mobilité : l\'échéance connue est montrée (avant : aucune)', () => {
    const F = monter({ entites: ENT, logements: [], baux: {} });
    expect(F._bailEcheanceEffective({ type: 'mobilite', debut: '2026-01-01', fin: '2026-06-30' }, null)).toBe('2026-06-30');
  });
  it('clôturé → aucune échéance', () => {
    const F = monter({ entites: ENT, logements: [], baux: {} });
    expect(F._bailEcheanceEffective({ type: 'nu', debut: '2015-01-01', fin: '2023-12-31', cloture: true }, null)).toBe(null);
  });
});

describe('rappel « préavis bailleur » (_bailPreavisInfo) — nu et meublé seulement', () => {
  const F = () => monter({ entites: ENT, logements: [], baux: {} });
  it('nu : 6 mois avant l\'échéance À VENIR', () => {
    expect(F()._bailPreavisInfo({ type: 'nu', entity: 'Perso', debut: '2015-01-01', fin: '2023-12-31' }, null))
      .toMatchObject({ fin: '2026-12-31', preavisStart: '2026-06-30', preavisMonths: 6, isMeuble: false, inPreavisZone: true });
  });
  it('meublé : 3 mois', () => {
    expect(F()._bailPreavisInfo({ type: 'meuble', debut: '2026-09-01', fin: '2027-08-31' }, null))
      .toMatchObject({ preavisMonths: 3, isMeuble: true, preavisStart: '2027-05-31' });
  });
  it('étudiant, mobilité, garage, autre : aucun rappel (avant : 3 ou 6 mois et « tacitement reconduit »)', () => {
    for (const type of ['etudiant', 'mobilite', 'garage', 'autre']) {
      expect(F()._bailPreavisInfo({ type, debut: '2026-09-01', fin: '2027-05-31' }, null)).toBe(null);
    }
  });
});

describe('alertes « baux arrivant à terme » (AlertRules.bauxEcheance + règle injectée)', () => {
  it('un nu reconduit n\'est plus « expiré » ; un étudiant arrivé à terme l\'est ; un clôturé disparaît', () => {
    const db = { entites: ENT, logements: [], baux: {
      N: { ref: 'N', type: 'nu', entity: 'Perso', debut: '2015-01-01', fin: '2023-12-31' },
      E: { ref: 'E', type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31' },
      C: { ref: 'C', type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31', cloture: true }
    } };
    const F = monter(db);
    const logs = [{ ref: 'N', locataire: 'X', fin: '2023-12-31' }, { ref: 'E', locataire: 'Y', fin: '2026-05-31' }, { ref: 'C', locataire: 'Z', fin: '2026-05-31' }];
    const out = bauxEcheance(logs, new Date(2026, 9, 6), 90, F._bailEcheanceAlerteDe);
    // N : reconduit jusqu'au 31/12/2026 — dans les 90 jours, donc « J-86 », jamais « expiré ».
    expect(out.map((o) => o.ref)).toEqual(['E', 'N']);
    expect(out[0]).toMatchObject({ expire: true, fin: '2026-05-31' });
    expect(out[1]).toMatchObject({ expire: false, fin: '2026-12-31', jours: 86 });
  });
});

describe('alerte « bail arrivé à terme » (_bailAlerteTerme) — texte neutre, deux gestes', () => {
  it('mobilité : nouveau bail MEUBLÉ ou départ ; disparaît au départ déclaré', () => {
    const F = monter({ entites: ENT, logements: [], baux: {} });
    const b = { type: 'mobilite', debut: '2026-01-01', fin: '2026-06-30' };
    expect(F._bailAlerteTerme(b, null).texte).toBe('Bail arrivé à terme le 30/06/2026, non reconductible : signer un nouveau bail meublé ou déclarer le départ.');
    expect(F._bailAlerteTerme(Object.assign({ depart: { dateSortie: '2026-10-31' } }, b), null)).toBe(null);
  });
  it('garage de l\'app (reconduit par son contrat) : aucune alerte', () => {
    const F = monter({ entites: ENT, logements: [], baux: {} });
    expect(F._bailAlerteTerme({ type: 'garage', debut: '2024-01-01', fin: '2024-12-31', signatures: { signedAt: '2026-09-10T10:00:00Z' } }, null)).toBe(null);
    expect(F._bailAlerteTerme({ type: 'garage', debut: '2024-01-01', fin: '2024-12-31' }, null).texte)
      .toBe('Bail arrivé à terme le 31/12/2024, contrat à vérifier : signer un nouveau bail ou déclarer le départ.');
  });
});

describe('frise d\'un immeuble (_renderImmFichePlanGantt) — même règle que la pastille', () => {
  // La frise lit l'horloge réelle : les dates sont posées relativement à aujourd'hui.
  const d = new Date();
  const iso = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  const ilYa = (mois) => { const x = new Date(d.getFullYear(), d.getMonth() - mois, 1); return iso(x); };
  const AUJR = iso(d);
  const frise = async (db, lots) => {
    const { finOccupationBail } = await import('../../js/core/loyer-du-mois.js');
    const { loyerDuLotA } = await import('../../js/core/legal-bilan.js');
    const noms = ['_renderImmFichePlanGantt', '_ctxLoyerLot', '_getAllBailsForLog', '_bailTypeHasTacite', '_bailFinOccupation',
      '_bailTypeEff', '_bailEcheanceOpts', '_bailEcheance', '_bailEcheanceEffective', '_bailPreavisInfo', '_isoLocal'];
    const src = noms.map(corpsDe).join('\n');
    const esc = (x) => String(x == null ? '' : x);
    const deps = {
      DB: db,
      window: { finOccupationBail, BailEcheance, BailDuree, _loyerTodayLocal: () => AUJR },
      loyerDuLotA,
      _findBailByRefTolerant: (ref) => (db.baux || {})[ref] || null,
      _monthsBetweenIso: (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 2629800000)),
      _daysBetweenIso: (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)),
      _ganttHighlight: () => '', _immFicheNewLog: () => {}, _lyQ: esc,
      fd: (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; },
      min: Math.min, _tenantColor: () => '#000', _tenantColorLight: () => '#fff', _uiIcon: () => '',
      escHtml: esc, fmt: (n) => String(Math.round(n || 0)) + ' €', fmtN: (n) => String(Math.round(n || 0)),
      openLogFiche: () => {}, _isAlive: (x) => !!x && !x._deleted,
      _DMC: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'], go: () => {}, _immVueFrise: true
    };
    const k = Object.keys(deps);
    const f = new Function(...k, src + '\nreturn _renderImmFichePlanGantt;');
    return f(...k.map((n) => deps[n]))({ nom: 'SCI Test' }, { nom: 'Résidence' }, lots);
  };

  it('étudiant arrivé à terme, toujours en place : ni « tacite reconduction », ni vacance, ni préavis', async () => {
    const lots = [{ ref: 'E-1', imm: 'Résidence', hc: 500, ch: 50 }];
    const db = { entites: ENT, logements: lots, baux_historique: [], loyerBareme: [],
      baux: { 'E-1': { ref: 'E-1', type: 'etudiant', nom: 'Léa', debut: ilYa(11), fin: ilYa(2), hc: 500, ch: 50 } } };
    const html = await frise(db, lots);
    expect(html).toMatch(/arrivé à terme le/);
    expect(html).not.toMatch(/tacite reconduction/);
    expect(html).not.toMatch(/immf-gantt-preavis/);   // aucune zone de préavis bailleur
    expect(html).not.toMatch(/Vacant \d/);
  });

  it('nu reconduit : la projection court jusqu\'à la prochaine échéance (tacite reconduction)', async () => {
    const lots = [{ ref: 'N-1', imm: 'Résidence', hc: 700, ch: 80 }];
    const db = { entites: ENT, logements: lots, baux_historique: [], loyerBareme: [],
      baux: { 'N-1': { ref: 'N-1', type: 'nu', entity: 'Perso', nom: 'Max', debut: ilYa(40), fin: ilYa(4), hc: 700, ch: 80 } } };
    const html = await frise(db, lots);
    expect(html).toMatch(/tacite reconduction → prochaine échéance/);
  });
});

describe('saisie du bail — date de fin automatique (autoFinBail)', () => {
  const lancer = (type, entType, debut = '2026-01-01', avecModule = true) => {
    const champs = { 'b-debut': debut, 'b-type': type, 'b-entity': 'E', 'b-fin': '' };
    const deps = {
      v: (id) => champs[id] || '',
      el: (id) => ({ get value() { return champs[id]; }, set value(x) { champs[id] = x; } }),
      DB: { entites: [{ nom: 'E', type: entType }] },
      window: avecModule ? { BailDuree } : {},
    };
    const noms = Object.keys(deps);
    const src = [corpsDe('autoFinBail'), corpsDe('_isoLocal')].join('\n');
    new Function(...noms, src + '\nreturn autoFinBail;')(...noms.map((n) => deps[n]))();
    return champs['b-fin'];
  };
  it('« Personne morale » → 6 ans (avant : 3 ans, le fragment « perso » trompait le test)', () => {
    expect(lancer('nu', 'Personne morale')).toBe('2031-12-31');
  });
  it('personne physique, SCI familiale, indivision → 3 ans (art. 10 et 13)', () => {
    expect(lancer('nu', 'Personne physique')).toBe('2028-12-31');
    expect(lancer('nu', 'SCI familiale')).toBe('2028-12-31');
    expect(lancer('nu', 'Indivision')).toBe('2028-12-31');
  });
  it('meublé 1 an, étudiant 9 mois ; mobilité / garage : rien n\'est pré-rempli', () => {
    expect(lancer('meuble', '')).toBe('2026-12-31');
    expect(lancer('etudiant', '')).toBe('2026-09-30');
    expect(lancer('mobilite', '')).toBe('');
    expect(lancer('garage', '')).toBe('');
  });
});
