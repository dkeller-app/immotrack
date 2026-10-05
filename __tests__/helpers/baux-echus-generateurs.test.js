/**
 * BAUX-ECHUS — le TEXTE réellement généré par les deux générateurs de bail de l'app :
 * `buildBailStructure` (PDF natif + aperçu) et `genBailHTML` (modèle Word), extraits de l'index.html
 * assemblé et exécutés avec les modules réels (ContratType, BailClausesFin, bail-duree, conge…).
 *
 * Ce que ces tests tiennent (audit code-reviewer, mutations M13/M14/M17/M18/M21/M23) :
 *  · un bail SIGNÉ en version de clauses 4 garde son texte d'origine, mot pour mot — y compris ses
 *    erreurs (« 25-7 II », « égale à celle du bail initial », « 1226 et suivants ») : on ne réécrit
 *    jamais un document signé ;
 *  · un brouillon (version 5) imprime « 25-8, I », « article 10 », « 1231-5 » ;
 *  · la lettre de congé d'un étudiant reçoit bien son type (`_congeExtra` → mention sans préavis) ;
 *  · « Nouveau bail » après une mobilité propose un bail meublé.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as ContratType from '../../js/core/contrat-type.js';
import * as BailClausesFin from '../../js/core/bail-clauses-fin.js';
import * as BailEcheance from '../../js/core/bail-echeance.js';
import * as BailDuree from '../../js/core/bail-duree.js';
import * as Conge from '../../js/core/conge.js';
import * as MontantDoc from './montant-doc.js';
import * as BailSignataires from './bail-signataires.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

const corpsDe = (nom) => {
  const i = html.indexOf('\nfunction ' + nom + '(');
  if (i === -1) throw new Error(nom + ' introuvable — le test ne teste plus rien');
  const j = html.indexOf('\n}', i + 1);
  return html.slice(i + 1, j + 2);
};
/** Une déclaration `const NOM = …;` de premier niveau (gabarit Word, passages d'origine). */
const constDe = (nom, fin) => {
  const i = html.indexOf('\nconst ' + nom + ' =');
  if (i === -1) throw new Error(nom + ' introuvable');
  const j = html.indexOf(fin, i + 1);
  return html.slice(i + 1, j + fin.length);
};

// Identifiants natifs laissés au moteur ; tout le reste vient de `deps` ou d'un talon neutre.
const NATIFS = new Set(['Math', 'JSON', 'String', 'Number', 'Date', 'Object', 'Array', 'RegExp', 'isNaN', 'isFinite', 'parseInt',
  'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'Set', 'Map', 'Boolean', 'Symbol', 'Infinity', 'NaN', 'undefined',
  'Intl', 'Error', 'TypeError', 'Promise', 'console', 'globalThis', 'Reflect', 'Proxy', 'WeakMap', 'arguments']);

/** Exécute des fonctions RÉELLES de l'app dans une portée où chaque dépendance absente est un talon neutre. */
function monter(noms, consts, deps) {
  const talon = () => '';
  const env = new Proxy(deps, {
    has: (t, k) => typeof k === 'string' && !NATIFS.has(k),
    get: (t, k) => (k in t ? t[k] : (k === Symbol.unscopables ? undefined : talon))
  });
  const src = consts.join('\n') + '\n' + noms.map(corpsDe).join('\n') + '\nreturn {' + noms.join(',') + '};';
  return new Function('__env', 'with (__env) {' + src + '}')(env);
}

const AUJ = '2026-10-06';
const fdFr = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
const ENT_PERSO = { nom: 'BE Particulier', type: 'Personne physique', gerant: 'Didier Test', siege: 'Strasbourg' };

function depsBase(db, opts) {
  opts = opts || {};
  const win = Object.assign({
    ContratType: opts.sansContratType ? undefined : ContratType,
    BailClausesFin: opts.sansClausesFin ? undefined : BailClausesFin,
    BailEcheance, BailDuree, MontantDoc, BailSignataires,
    dureeBailNuLabel: BailDuree.dureeBailNuLabel, dureeBailNuPhrase: BailDuree.dureeBailNuPhrase,
    sousTitreBailNu: BailDuree.sousTitreBailNu, regimeBailleur: BailDuree.regimeBailleur,
    preavisReduitClause: Conge.preavisReduitClause,
    _loyerTodayLocal: () => AUJ
  }, opts.window || {});
  return Object.assign({
    window: win, DB: db, fd: fdFr, escHtml: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    getGerants: () => [], getBailSignataires: () => [], formatGerantsList: () => '', formatRepresentationBail: () => '',
    _readLogForBail: () => ({}), _buildSigBlocks: () => [], _bailLocauxFused: () => '', numToWords: (n) => String(n) + ' euros',
    fmtN: (n) => String(n || 0), sortedIRLKeys: () => [], IRL_DEFAULT: {}, td: () => AUJ,
    document: { getElementById: () => null }
  }, opts.deps || {});
}

const blocsTexte = (st) => st.map((x) => x.text || (x.segments ? x.segments.map((s) => s.text).join('') : '') || (x.rows ? JSON.stringify(x.rows) : '')).join('\n');

const BUILD = ['buildBailStructure', '_bailClauseVersion', '_bailClauseVersionNorm', '_bailContratType2026', '_bailSigned', '_bailClauseRevisionIRL'];
const genBail = (bail, opts) => {
  const db = { entites: [ENT_PERSO], logements: [{ ref: bail.ref, adr: '1 rue Test' }], baux: { [bail.ref]: bail }, params: {} };
  const F = monter(BUILD, [], depsBase(db, opts));
  return blocsTexte(F.buildBailStructure(bail, db.logements[0], bail.ref, ENT_PERSO, bail.locataires));
};

const signeV4 = { clauseIrlV: 4, signatures: { signedAt: '2026-01-15T10:00:00Z', bailleur: 'x', locataire: 'y' } };
const base = (type, extra) => Object.assign({ ref: 'T-1', type, entity: 'BE Particulier', debut: '2026-01-01', fin: '2028-12-31',
  hc: 600, ch: 50, dg: 600, locataires: [{ nom: 'Loc Test', civilite: 'M.' }], nom: 'Loc Test', typeContrat: 'initial', modalitePaiement: 'echeoir', jpay: 5 }, extra || {});

describe('PDF natif (buildBailStructure) — brouillon v5 : les bonnes citations', () => {
  it('bail nu : reconduction de trois ans (article 10), formes du congé art. 15, I, clause pénale 1231-5', () => {
    const t = genBail(base('nu'));
    expect(t).toContain('tacitement reconduit pour une durée de trois (3) ans (article 10 de la loi n° 89-462 du 6 juillet 1989)');
    expect(t).toContain('remis en main propre contre récépissé ou émargement (article 15, I de la loi n° 89-462');
    expect(t).toContain('clause pénale (article 1231-5 du Code civil)');
    expect(t).not.toMatch(/égale à celle du bail initial|1226 et suivants/);
  });
  it('bail meublé : préavis « 25-8, I », reconduction art. 25-7', () => {
    const t = genBail(base('meuble', { fin: '2026-12-31' }));
    expect(t).toContain('(article 25-8, I de la loi n° 89-462 du 6 juillet 1989)');
    expect(t).toContain('reconduit pour une durée d’un (1) an (article 25-7 de la loi');
    expect(t).not.toMatch(/25-7 II/);
  });
  it('bail étudiant : préavis « 25-8, I », reconduction inapplicable', () => {
    const t = genBail(base('etudiant', { fin: '2026-09-30' }));
    expect(t).toContain('(article 25-8, I de la loi');
    expect(t).toContain('la reconduction tacite est inapplicable (article 25-7');
  });
  it('bail mobilité : art. 25-14 / 25-15, durée réelle tirée des dates', () => {
    const t = genBail(base('mobilite', { fin: '2026-06-30', dg: 0 }));
    expect(t).toContain('6 (six) mois');
    expect(t).not.toContain('[de 1 à 10 mois — à préciser]');
    expect(t).toContain('non renouvelable et non reconductible (article 25-14');
    expect(t).toContain('délai de préavis d’un (1) mois (article 25-15');
    expect(t).not.toMatch(/requalification/);
  });
  it('bail mobilité sans date de fin : le marqueur « à préciser » reste', () => {
    expect(genBail(base('mobilite', { fin: '', dg: 0 }))).toContain('[de 1 à 10 mois — à préciser]');
  });
});

describe('PDF natif — bail SIGNÉ en version 4 : son texte d\'origine, mot pour mot', () => {
  it('bail nu signé v4 : « égale à celle du bail initial », « 1226 et suivants », anciennes formes du congé', () => {
    const t = genBail(base('nu', signeV4));
    expect(t).toContain('tacitement reconduit pour une durée égale à celle du bail initial (');
    expect(t).toContain('clause pénale (articles 1226 et suivants du Code civil)');
    expect(t).toContain('moyennant un préavis de trois (3) mois, par lettre recommandée avec avis de réception ou par acte de commissaire de justice.');
    expect(t).not.toMatch(/1231-5|article 15, I de la loi/);
  });
  it('bail meublé signé v4 : « 25-7 II » et « (art. 25-8 loi 89-462, bail meublé) »', () => {
    const t = genBail(base('meuble', Object.assign({ fin: '2026-12-31' }, signeV4)));
    expect(t).toContain('(art. 25-7 II loi 89-462, bail meublé)');
    expect(t).toContain("reconduit pour une durée d'un (1) an (art. 25-8 loi 89-462, bail meublé)");
  });
  it('bail mobilité signé v4 : l\'ancienne phrase (« requalification … art. 25-15 ») et le marqueur de durée', () => {
    const t = genBail(base('mobilite', Object.assign({ fin: '2026-06-30', dg: 0 }, signeV4)));
    expect(t).toContain('requalification en bail meublé d\'un an (art. 25-15 loi 89-462)');
    expect(t).toContain('[de 1 à 10 mois — à préciser]');
  });
});

describe('PDF natif — module des clauses absent : rendu v4 cohérent (jamais un mélange)', () => {
  it('sans BailClausesFin, un brouillon garde les textes d\'origine', () => {
    const t = genBail(base('nu'), { sansClausesFin: true });
    expect(t).toContain('égale à celle du bail initial');
    expect(t).toContain('articles 1226 et suivants');
  });
});

// ── Modèle Word ─────────────────────────────────────────────────────────────────────────────────
const GEN_WORD = ['genBailHTML', '_bailClauseVersion', '_bailClauseVersionNorm', '_bailContratType2026', '_bailSigned', '_bailClauseRevisionIRL'];
const genWord = (bail) => {
  const db = { entites: [ENT_PERSO], logements: [{ ref: bail.ref, adr: '1 rue Test' }], baux: { [bail.ref]: bail }, params: {}, templates: {} };
  const consts = [constDe('BAIL_TEMPLATE_DEFAULT', '`;'), constDe('_BAIL_TMPL_2025', '\n};')];
  const F = monter(GEN_WORD, consts, depsBase(db));
  const h = F.genBailHTML(bail, db.logements[0], bail.ref, ENT_PERSO, bail.locataires, 650, '–', '–', 'Strasbourg', 'word');
  return h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
};

describe('modèle Word (genBailHTML) — v5 corrigé, v4 inchangé', () => {
  it('brouillon : trois ans (article 10) et article 1231-5', () => {
    const t = genWord(base('nu'));
    expect(t).toContain('tacitement reconduit pour une durée de trois (3) ans (article 10 de la loi n° 89-462 du 6 juillet 1989)');
    expect(t).toContain('clause pénale (article 1231-5 du Code civil)');
    expect(t).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
  it('signé v4 : « égale à celle du bail initial (6 ans) » et « 1226 et suivants »', () => {
    const t = genWord(base('nu', signeV4));
    expect(t).toContain('tacitement reconduit pour une durée égale à celle du bail initial (6 ans).');
    expect(t).toContain('clause pénale (articles 1226 et suivants du Code civil)');
  });
});

// ── Lettre de congé : le type est bien transmis (M21) ───────────────────────────────────────────
describe('lettre « congé du bailleur » (_congeExtra) — le type EFFECTIF est transmis', () => {
  const lancerConge = (bail, log) => {
    const db = { entites: [ENT_PERSO], logements: [log], baux: { [bail.ref]: bail } };
    const deps = depsBase(db, { window: {
      congeMotifDetail: Conge.congeMotifDetail, congeBailleurPreavisMois: Conge.congeBailleurPreavisMois,
      congeMentionPreavis: Conge.congeMentionPreavis, congeDateEffet: Conge.congeDateEffet,
      congeBailleurModele: Conge.congeBailleurModele, congePhraseTerme: Conge.congePhraseTerme,
      congeLocatairePreavis: Conge.congeLocatairePreavis, congeAddMois: Conge.addMoisClamped
    }, deps: { v: () => '', _congeState: { ref: bail.ref, kind: 'conge_bailleur' } } });
    const F = monter(['_congeExtra', '_congeTypeBail', '_congeModele', '_bailTypeEff', '_bailEcheanceOpts', '_bailEcheance',
      '_bailEcheanceEffective', '_bailPreavisInfo', '_congeDateEffetLocale', '_bailDureeMois', '_isoLocal'], [], deps);
    return F._congeExtra(bail.ref);
  };
  it('étudiant arrivé à terme : mention « sans qu\'un congé soit nécessaire » (art. 25-7), terme au passé', () => {
    const e = lancerConge({ ref: 'E-1', type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31' }, { ref: 'E-1' });
    expect(e.mentionPreavis).toBe("Le bail ayant été conclu pour une durée de neuf mois avec un étudiant, la reconduction tacite est inapplicable (article 25-7 de la loi n° 89-462 du 6 juillet 1989) : il prend fin à son terme, sans qu'un congé soit nécessaire.");
    expect(e.phraseTerme).toBe('est arrivé à son terme le 31/05/2026');
    expect(e.motifDetail).toBe('');
  });
  it('bail d\'avant v15.191 sans bail.type : le type vient de log.typeUsage (mobilité)', () => {
    const e = lancerConge({ ref: 'M-1', debut: '2026-01-01', fin: '2026-06-30' }, { ref: 'M-1', typeUsage: 'mobilite' });
    expect(e.mentionPreavis).toMatch(/non renouvelable et non reconductible \(article 25-14/);
  });
  it('meublé : préavis de trois mois, motif sans préemption 15-II pour une vente', () => {
    const e = lancerConge({ ref: 'MU-1', type: 'meuble', debut: '2026-01-01', fin: '2026-12-31' }, { ref: 'MU-1' });
    expect(e.mentionPreavis).toMatch(/^Le délai de préavis légal applicable à ce congé est de 3 mois/);
  });
});

// ── « Nouveau bail » après une mobilité : bail meublé (M23) ───────────────────────────────────────
describe('geste « Nouveau bail » (_bailNouveauApresTerme) après un bail arrivé à terme', () => {
  const lancerNouveau = (prev) => {
    const champs = {};
    const elStub = (id) => ({ get value() { return champs[id] || ''; }, set value(x) { champs[id] = x; }, disabled: false });
    const db = { entites: [ENT_PERSO], logements: [{ ref: prev.ref }], baux: { [prev.ref]: prev } };
    const appels = [];
    const deps = depsBase(db, { deps: {
      el: elStub, openBail: () => appels.push('openBail'), onBailRefChange: () => {}, renderBailSignataires: () => {},
      renderBailLocs: (l) => { champs.__locs = l; }, renderBailGarants: () => {}, _bailLegacyToGarants: () => [],
      onBailTypeChange: () => appels.push('onBailTypeChange:' + champs['b-type']), showToast: () => {}
    } });
    const F = monter(['_bailNouveauApresTerme', '_bailEcheanceOpts', '_isoLocal'], [], deps);
    F._bailNouveauApresTerme(prev.ref);
    return { champs, appels };
  };
  it('après une mobilité : type « meublé » (art. 25-14 dernier al.), début le lendemain du terme, mêmes parties', () => {
    const r = lancerNouveau({ ref: 'MOB-1', type: 'mobilite', entity: 'BE Particulier', debut: '2026-01-01', fin: '2026-06-30', hc: 600, locataires: [{ nom: 'Léa' }] });
    expect(r.champs['b-type']).toBe('meuble');
    expect(r.champs['b-debut']).toBe('2026-07-01');
    expect(r.champs.__locs).toEqual([{ nom: 'Léa' }]);
    expect(r.appels).toEqual(['openBail', 'onBailTypeChange:meuble']);
  });
  it('après un étudiant : le type est conservé', () => {
    expect(lancerNouveau({ ref: 'ET-1', type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31', locataires: [{ nom: 'Max' }] }).champs['b-type']).toBe('etudiant');
  });
});
