// BAIL-EN-COURS-MODIFIER-PERIODES — étape 3 : l'historique du bail rend les ÉDITIONS de période.
// Une carte par modification / suppression / absorption (tirée des tombstones du barème, enrichie par
// l'entrée de journal de même evtId), aucune carte pour une tombstone sans raison, `cle` utilisable par
// trouverPeriode, et pas de fausse « Modification du loyer » pour une continuation passée en « manuel ».
import { describe, it, expect } from 'vitest';
import { construireHistoriqueBail } from '../../js/core/bail-historique.js';
import { cleDePeriode, trouverPeriode, modifierPeriode, supprimerPeriode } from '../../js/core/bareme-edition.js';
import { periodeInitialeBail, appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';

const REF = 'D-101', BD = '2023-09-01', TODAY = '2026-10-06';
const bail = { ref: REF, debut: BD, hc: 640, ch: 80, locataires: [{ nom: 'Pierre Demo' }] };
const OPTS = { motif: 'Erreur de date', le: '2026-10-06T10:00:00.000Z', auteur: 'Didier', evtId: 'bper_1', bailHc: 640, bailCh: 80 };
const maquette = () => appliquerNouvellePeriode([periodeInitialeBail({ ...bail, hc: 600 })],
  { ref: REF, debut: '2026-09-01', hc: 640, ch: 80, source: 'manuel', bailDebut: BD, note: 'Accord' });
const hist = (bareme, extra) => construireHistoriqueBail({ ref: REF, today: TODAY, bailCourant: bail, bauxHistorique: [], bareme, irlHistorique: [], bailEvents: [], ...extra }).chapitres[0];
const evs = (c, type) => c.rail.filter((r) => r.kind === 'evenement' && r.ev.type === type).map((r) => r.ev);
const pers = (c) => c.rail.filter((r) => r.kind === 'periode').map((r) => r.periode);

describe('périodes : cle, premiere, droits', () => {
  it('chaque période porte sa clé, retrouvable par trouverPeriode ; la 1re est marquée', () => {
    const b = maquette();
    const ps = pers(hist(b));
    expect(ps).toHaveLength(2);
    for (const p of ps) expect(trouverPeriode(b, p.cle)).not.toBeNull();
    const [recente, premiere] = ps;                       // rail décroissant
    expect(premiere).toMatchObject({ premiere: true, debut: BD, droits: { date: false, hc: true, ch: true, supprimer: true } });
    expect(recente).toMatchObject({ premiere: false, droits: { date: true, hc: true, ch: true, supprimer: true } });
  });
  it('révision IRL : seules les charges sont modifiables ici', () => {
    const b = appliquerNouvellePeriode(maquette(), { ref: REF, debut: '2027-03-01', hc: 660, ch: 80, source: 'irl', bailDebut: BD, note: '' });
    const irl = pers(hist(b)).find((p) => p.source === 'irl');
    expect(irl.droits).toEqual({ date: false, hc: false, ch: true, supprimer: false });
  });
});

describe('cartes issues des tombstones', () => {
  it('MODIFIÉE : une carte « avant → après » à la nouvelle date, avec motif, auteur, et impact du journal', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleDePeriode(b.find((p) => p.debut === '2026-09-01')), { debut: '2026-10-01', hc: 650 }, OPTS);
    const impact = { mois: [{ ym: '2026-09', avant: 720, apres: 680 }], tropPercu: 0, quittances: [] };
    const c = hist(r.periods, { bailJournal: [{ id: 'bper_1', type: 'periode', action: 'modifiee', ref: REF, date: '2026-10-06', impact }] });
    const m = evs(c, 'periode-modifiee');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ date: '2026-10-01', le: '2026-10-06', motif: 'Erreur de date', auteur: 'Didier', evtId: 'bper_1', impact });
    expect(m[0].avant).toEqual({ debut: '2026-09-01', hc: 640, ch: 80, total: 720 });
    expect(m[0].apres).toEqual({ debut: '2026-10-01', hc: 650, ch: 80, total: 730 });
  });

  it('SUPPRIMÉE : une carte avec la reprise et le tarif repris', () => {
    const b = maquette();
    const r = supprimerPeriode(b, cleDePeriode(b.find((p) => p.debut === '2026-09-01')), OPTS);
    const s = evs(hist(r.periods), 'periode-supprimee');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ date: '2026-09-01', reprise: 'precedente', motif: 'Erreur de date', avant: { total: 720 }, repriseTarif: { total: 680 } });
  });

  it('ABSORBÉE : une ligne « remplacée par la période avancée au… »', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleDePeriode(b.find((p) => p.debut === '2026-09-01')), { debut: BD }, OPTS);
    const a = evs(hist(r.periods), 'periode-absorbee');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ date: BD, avant: 680, dateEffet: BD, evtId: 'bper_1' });
  });

  it('une tombstone SANS raison (stock legacy, purge) ne produit aucune carte', () => {
    const b = maquette().concat([{ ref: REF, debut: '2025-01-01', fin: '2025-06-30', hc: 1, ch: 1, source: 'manuel', bailDebut: BD, _deleted: true }]);
    const c = hist(b);
    for (const t of ['periode-modifiee', 'periode-supprimee', 'periode-absorbee', 'periode-remplacee', 'periode-annulee']) expect(evs(c, t)).toEqual([]);
  });

  it('une période « bail » passée en « manuel » par une édition n\'est pas une fausse « Modification du loyer »', () => {
    let b = appliquerNouvellePeriode([periodeInitialeBail({ ...bail, hc: 600 })], { ref: REF, debut: '2024-01-01', fin: '2024-03-31', hc: 500, ch: 80, source: 'manuel', bailDebut: BD, note: 'remise' });
    const cont = b.find((p) => !p._deleted && p.debut === '2024-04-01');
    const r = modifierPeriode(b, cleDePeriode(cont), { hc: 630 }, OPTS);
    const modifs = evs(hist(r.periods), 'modif');
    expect(modifs.map((e) => e.effet)).toEqual(['2024-01-01']);          // seule la remise née manuelle
    expect(evs(hist(r.periods), 'periode-modifiee')).toHaveLength(1);
    // témoin : une période née manuelle ET éditée garde sa carte « modif » (ajout manuel = _edition.de null)
    const manuelle = modifierPeriode(maquette(), cleDePeriode(maquette().find((p) => p.debut === '2026-09-01')), { hc: 650 }, OPTS);
    expect(evs(hist(manuelle.periods), 'modif').map((e) => e.hc)).toEqual([650]);
  });
});
