/**
 * Délai de restitution du DG (art. 22) — câblage de LA règle (js/core/dg-delai.js) dans l'app, corrections de l'audit.
 *
 * 🔴1 — le `_dgStatut` du MODULE (celui qui tourne en prod) ne rendait pas `joursSiConforme` : « À restituer
 *       J-undefined ». Test de parité module ⇄ copie inline (chemin file://) + libellé EXACT avec le module.
 * 🟠2 — un bail en cours sans remise des clés déclarée prenait sa fin CONTRACTUELLE comme point de départ
 *       (« en retard de 402 j » sur un bail reconduit) : l'échéance se lit sur la fin d'OCCUPATION.
 * 🟠5 — badge court dans la frise, phrase complète dans la description.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as DgDelai from '../../js/core/dg-delai.js';
import * as G from '../../js/core/gestion-dg-impayes.js';
import { finOccupationBail } from '../../js/core/fin-occupation.js';
import { extraireFonction } from './_extraction-source.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = ['app-part1.js', 'app-part2.js'].map((f) => readFileSync(resolve(root, 'js/app', f), 'utf8').replace(/\r/g, ''));
const corps = (nom) => { for (const s of SRC) { try { return extraireFonction(s, nom); } catch (e) { /* autre fichier */ } } throw new Error('introuvable : ' + nom); };
const DG_STATUS = (() => { const s = SRC[1], i = s.indexOf('const DG_STATUS = {'); return new Function(s.slice(i, s.indexOf('};', i) + 2) + '\nreturn DG_STATUS;')(); })();
const fd = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const isoLocal = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/** Monte des fonctions de l'app avec des doubles (portée `with`). */
function monter(noms, env = {}) {
  const scope = {
    window: { DgDelai, finOccupationBail }, DG_STATUS, fd, escHtml: (x) => String(x == null ? '' : x), fmt: (n) => String(n) + ' €', _uiIcon: () => '',
    _isoLocal: isoLocal, _todayIsoLocal: () => '2026-10-06', _edlSortieDuBail: () => null, ...env,
  };
  return new Function('scope', 'with (scope) {\n' + noms.map(corps).join('\n') + '\nreturn {' + noms.join(',') + '};\n}')(scope);
}

const PARTI = { ref: 'A1', dg: 900, dgPaid: 900, hc: 500, cloture: true, debut: '2023-07-01', finEffective: '2026-09-30', depart: { dateSortie: '2026-09-30' } };

describe('🔴1 — _dgStatut : le module (prod) et la copie inline (file://) rendent la même chose', () => {
  const inline = monter(['_dgStatut'])._dgStatut;
  it.each([['2026-10-06'], ['2026-11-05'], ['2026-12-05']])('mêmes clés et mêmes valeurs au %s (conformité inconnue)', (jour) => {
    expect(inline(PARTI, jour)).toEqual(G._dgStatut(PARTI, jour, []));
  });
  it('libellé lu sur le statut du MODULE : « À restituer J-24 », jamais « J-undefined »', () => {
    const { _dgStatutLibelle } = monter(['_dgStatutLibelle']);
    const d = G._dgStatut(PARTI, '2026-10-06', []);
    expect(d.joursSiConforme).toBe(24);
    expect(_dgStatutLibelle(d)[0]).toBe(" À restituer J-24 — le 30/10/2026 si l'EDL de sortie est conforme, sinon le 30/11/2026");
    expect(_dgStatutLibelle(d, false, true)[0]).toBe(' À restituer J-24');
  });
  it('dépassement possible : libellé long et court ; il compte comme urgent (chapitre de la frise déplié)', () => {
    const { _dgStatutLibelle, _dgStatutUrgent } = monter(['_dgStatutLibelle', '_dgStatutUrgent']);
    const d = G._dgStatut(PARTI, '2026-11-05', []);
    expect(d.statut).toBe('depassement_possible');
    expect(_dgStatutLibelle(d)[0]).toBe(" Dépassement possible (si l'EDL de sortie est conforme) · au plus tard le 30/11/2026");
    expect(_dgStatutLibelle(d, false, true)[0]).toBe(' Dépassement possible');
    expect(['a_restituer', 'depassement_possible', 'en_retard'].map(_dgStatutUrgent)).toEqual([true, true, true]);
    expect(['complet', 'restitue', 'manquant', 'partiel'].map(_dgStatutUrgent)).toEqual([false, false, false, false]);
  });
});

describe('🟠2 — un bail EN COURS sans remise des clés déclarée n’a pas d’échéance', () => {
  const echeance = (bail) => monter(['_departDeadlineDG', '_bailFinOccupation'])._departDeadlineDG(bail);
  it('reconduit, fin contractuelle passée, `depart` sans date (créé par la régul) : aucune échéance, jamais « en retard de 402 j »', () => {
    expect(echeance({ ref: 'A1', type: 'nu', debut: '2022-07-01', fin: '2025-06-30', depart: { reparations: 120 } })).toBeNull();
    expect(echeance({ ref: 'A1', type: 'nu', debut: '2025-07-01', fin: '2028-06-30', depart: {} })).toBeNull();
  });
  it('remise des clés déclarée : l’échéance part d’elle', () => {
    expect(echeance({ ref: 'A1', type: 'nu', debut: '2022-07-01', fin: '2025-06-30', depart: { dateSortie: '2026-09-30' } }))
      .toMatchObject({ isoSiConforme: '2026-10-30', iso: '2026-11-30', etat: 'dans_le_delai', joursSiConforme: 24, source: 'remise' });
  });
});

describe('Assistant de départ : l’alerte de l’étape EDL lit la conformité à la source', () => {
  const EDL = (etatS) => ({ type: 'Sortie', logement: 'A1', date: '2026-09-30', pieces: [{ elements: [{ etatE: 'Bon état', etatS }] }] });
  const alerte = (edl) => {
    const m = monter(['_departState', '_departDeadlineDG', '_bailFinOccupation'], {
      DB: { logements: [{ ref: 'A1', imm: 'X' }], edl: [] }, _edlSortieDuBail: () => edl, _rgImmRegime: () => ({ applies20: false, label: 'maison' }),
      _lyQ: (x) => x, td: () => '2026-10-06',
    });
    return m._departState({ ...PARTI, cloture: false }).steps.find((s) => s.key === 'edl').alert;
  };
  it('conforme / dégradations / EDL incomplet (jamais « dégradations » par défaut)', () => {
    expect(alerte(EDL('Bon état'))).toContain('✅ EDL de sortie conforme');
    expect(alerte(EDL('Mauvais état'))).toContain('⚠ Dégradations relevées');
    expect(alerte(EDL(''))).toBe("EDL de sortie incomplet : conformité non établie → 1 mois si l'EDL de sortie est conforme, 2 mois sinon.");
  });
});
