// BAIL-TOMBSTONE (v15.697) — un bail CLÔTURÉ n'est pas un bail actif.
//
// CAS VÉCU 29/09 : créer un bail sur un lot → « Clôturer ce bail » → créer un nouveau bail sur
// le même lot ⇒ confirm « ⚠️ Le logement X a déjà un bail actif. Locataire actuel : ? », puis
// archiverBail poussait le TOMBSTONE dans baux_historique (fausse ligne d'historique) et
// refermait le barème du lot à la veille du nouveau bail.
//
// Cause : saveBailClore / terminerBail remplacent DB.baux[ref] par un tombstone
// { ref, _deleted, _deletedAt, _modifiedAt, _archivedAt } SANS `cloture`. Les gardes qui ne
// testaient que `!b.cloture` le prenaient pour un bail en cours. Même angle mort dans
// _logementsVacants (lot clôturé absent des vacants), la liste Locataires (« Tacite
// reconduction » + menu Clôturer sur un lot vide) et les chemins de clôture (re-clôturer un
// tombstone le poussait à son tour dans l'historique).
//
// On exécute les VRAIES fonctions extraites d'index.html sur un DB minimal.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`fonction introuvable : ${name}`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
}

/** Construit un bac à sable : les fonctions réelles + des stubs pour l'UI. */
function sandbox(DB, names) {
  const calls = { toast: [], bareme: [], el: [] };
  const src = names.map((n) => extractFn(html, n)).join('\n');
  const factory = new Function('DB', 'calls', `
    const showToast = (m) => calls.toast.push(m);
    const _baremeCloturerLot = (ref, fin) => calls.bareme.push([ref, fin]);
    const td = () => '2026-09-29';
    const el = (id) => { calls.el.push(id); return { value: '', textContent: '' }; };
    const openM = () => {};
    ${src}
    return { ${names.join(', ')} };
  `);
  return { fns: factory(DB, calls), calls };
}

const tombstone = (ref) => ({
  ref, _deleted: true, _deletedAt: '2026-09-29T10:00:00.000Z',
  _modifiedAt: '2026-09-29T10:00:00.000Z', _archivedAt: '2026-09-29',
});
const bailActif = (ref) => ({ ref, debut: '2024-01-01', hc: 700, ch: 90, locataires: [{ nom: 'Martin Paul' }] });

describe('_bailEnCours — la définition unique du bail en cours', () => {
  it('tombstone, clôturé, absent → faux ; vivant non clôturé → vrai', () => {
    const { fns } = sandbox({}, ['_bailEnCours']);
    expect(fns._bailEnCours(tombstone('A-1'))).toBe(false);
    expect(fns._bailEnCours({ ...bailActif('A-1'), cloture: true })).toBe(false);
    expect(fns._bailEnCours(undefined)).toBe(false);
    expect(fns._bailEnCours(null)).toBe(false);
    expect(fns._bailEnCours(bailActif('A-1'))).toBe(true);
  });
});

describe('archiverBail — un tombstone ne va jamais dans l\'historique', () => {
  it('tombstone : aucune ligne d\'historique, aucun barème refermé', () => {
    const DB = { baux: { 'A-1': tombstone('A-1') }, baux_historique: [] };
    const { fns, calls } = sandbox(DB, ['archiverBail', '_archiverDansHistorique', '_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation']);
    fns.archiverBail('A-1', '2026-10-01');
    expect(DB.baux_historique).toEqual([]);
    expect(calls.bareme).toEqual([]);
  });

  it('bail vivant : archivé à la veille du nouveau bail (comportement C4 intact)', () => {
    const DB = { baux: { 'A-1': bailActif('A-1') }, baux_historique: [] };
    const { fns, calls } = sandbox(DB, ['archiverBail', '_archiverDansHistorique', '_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation']);
    fns.archiverBail('A-1', '2026-10-01');
    expect(DB.baux_historique).toHaveLength(1);
    expect(DB.baux_historique[0]).toMatchObject({ ref: 'A-1', finEffective: '2026-09-30', _archivedAuto: true });
    expect(calls.bareme).toEqual([['A-1', '2026-09-30']]);
  });
});

describe('_logementsVacants — un lot dont le bail est clôturé est VACANT', () => {
  it('tombstone → vacant ; bail actif → occupé ; aucun bail → vacant', () => {
    const DB = {
      logements: [{ ref: 'A-1' }, { ref: 'A-2' }, { ref: 'A-3' }],
      baux: { 'A-1': tombstone('A-1'), 'A-2': bailActif('A-2') },
    };
    // Statut 06/10 : _logementsVacants lit LE statut (_bienIsBailActif → _bienActiveBail) ; sans module (ici) = bail ouvert.
    const { fns } = sandbox(DB, ['_isAlive', '_bienActiveBail', '_bienIsBailActif', '_logementsVacants']);
    expect(fns._logementsVacants().map((l) => l.ref)).toEqual(['A-1', 'A-3']);
  });
});

describe('Clôture — un tombstone ne se re-clôture pas', () => {
  it('openBailClore refuse un tombstone avant de remplir la modale', () => {
    const DB = { baux: { 'A-1': tombstone('A-1') } };
    const { fns, calls } = sandbox(DB, ['_isAlive', 'openBailClore']);
    fns.openBailClore('A-1');
    expect(calls.toast).toEqual(['Bail introuvable']);
    expect(calls.el).toEqual([]);
  });
});

describe('Câblage — les gardes lisent la définition unique', () => {
  it('saveBail (nouveau bail) : la garde « bail actif » exclut les tombstones', () => {
    const src = extractFn(html, 'saveBail');
    const garde = src.slice(src.indexOf('const bailExistant = DB.baux[ref];'));
    expect(garde).toMatch(/^const bailExistant = DB\.baux\[ref\];\s*\n\s*if\(_bailEnCours\(bailExistant\)\)/);
  });

  it('saveBailClore et terminerBail refusent un bail non vivant', () => {
    expect(extractFn(html, 'saveBailClore')).toMatch(/if\(!_isAlive\(bail\)\) \{ showToast\('Bail introuvable'/);
    expect(extractFn(html, 'terminerBail')).toMatch(/if\(!_isAlive\(DB\.baux\[ref\]\)\) \{ showToast\(/);
  });

  it('openBailMenu ne traite pas un tombstone comme un bail', () => {
    expect(extractFn(html, 'openBailMenu')).toMatch(/const bail = \(DB\.baux && _isAlive\(DB\.baux\[ref\]\)\) \? DB\.baux\[ref\] : null;/);
  });
});
