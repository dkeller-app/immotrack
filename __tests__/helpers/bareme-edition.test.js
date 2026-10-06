// BAIL-EN-COURS-MODIFIER-PERIODES — étape 1 : le module pur js/core/bareme-edition.js.
//
// Les barèmes de test sont construits avec les VRAIS écrivains (periodeInitialeBail,
// appliquerNouvellePeriode, garantirCouvertureBail, cloturerBareme), jamais à la main : on veut
// prouver que l'édition compose avec ce que l'app écrit réellement (comme finances-invariant-i1).
// Le cas de la maquette : 680 € (01/09/2023→31/08/2026, bail) puis 720 € (01/09/2026→, manuel).
import { describe, it, expect } from 'vitest';
import {
  cleDePeriode, trouverPeriode, modifierPeriode, supprimerPeriode, ajouterPeriode,
  periodesNonAppliquees, planRejeu, chaineDeRejeu, simulerRejeu, irlProgrammeeDuLot
} from '../../js/core/bareme-edition.js';
import {
  periodeInitialeBail, appliquerNouvellePeriode, cloturerBareme,
  synchroniserPeriodeBail
} from '../../js/core/loyer-bareme.js';
import { duMois } from '../../js/core/loyer-du-mois.js';

const REF = 'D-101';
const BD = '2023-09-01';
const bail = { ref: REF, debut: BD, hc: 600, ch: 80 };
const bailsCourant = (hc = 640, ch = 80) => [{ debut: BD, finEffective: null, archive: false, hc, ch }];
const du = (bareme, ym, bails = bailsCourant()) => duMois({ ref: REF, bails, bareme }, ym).total;
const vivantes = (b) => b.filter((p) => p && !p._deleted && p.ref === REF).sort((a, c) => a.debut.localeCompare(c.debut));
const OPTS = { motif: 'Erreur de date', le: '2026-10-06T10:00:00.000Z', auteur: 'Didier', evtId: 'bper_1', bailHc: 640, bailCh: 80 };

/** 680 (bail) puis 720 (manuel, « Accord ») — construit par les vrais écrivains. */
function maquette() {
  let b = [periodeInitialeBail(bail)];
  b = appliquerNouvellePeriode(b, { ref: REF, debut: '2026-09-01', hc: 640, ch: 80, source: 'manuel', bailDebut: BD, note: 'Accord' });
  return b;
}
const cleT = (b, debut) => cleDePeriode(vivantes(b).find((p) => p.debut === debut));

describe('trouverPeriode / cleDePeriode', () => {
  it('retrouve par la clé {ref, bailDebut, debut}, ref tolérante (casse et espaces)', () => {
    const b = maquette();
    const f = trouverPeriode(b, { ref: '  d-101 ', bailDebut: BD, debut: '2026-09-01' });
    expect(f && f.periode.hc).toBe(640);
  });
  it('un barème legacy sans bailDebut reste adressable', () => {
    const b = maquette().map((p) => { const q = { ...p }; delete q.bailDebut; return q; });
    expect(trouverPeriode(b, { ref: REF, bailDebut: BD, debut: '2026-09-01' })).not.toBeNull();
  });
  it('un autre chapitre n\'est pas la même période (même début, autre bailDebut)', () => {
    const b = maquette();
    expect(trouverPeriode(b, { ref: REF, bailDebut: '2020-01-01', debut: '2026-09-01' })).toBeNull();
  });
  it('doublons (stock corrompu) → la DERNIÈRE du tableau ; une tombstone n\'est jamais retrouvée', () => {
    const a = { ref: REF, debut: '2026-09-01', fin: null, hc: 1, ch: 0, source: 'manuel', bailDebut: BD };
    const z = { ...a, hc: 2 };
    expect(trouverPeriode([a, z], cleDePeriode(a)).idx).toBe(1);
    expect(trouverPeriode([{ ...a, _deleted: true }], cleDePeriode(a))).toBeNull();
  });
});

describe('modifierPeriode — la date', () => {
  it('MAQUETTE : reculer 720 € au 01/10/2026 → septembre repasse à 680 €, la précédente est prolongée', () => {
    const b = maquette();
    expect(du(b, '2026-09')).toBe(720);
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-10-01' }, OPTS);
    expect(r.ok && r.change).toBe(true);
    expect(du(r.periods, '2026-08')).toBe(680);
    expect(du(r.periods, '2026-09')).toBe(680);
    expect(du(r.periods, '2026-10')).toBe(720);
    const v = vivantes(r.periods);
    expect(v[0].fin).toBe('2026-09-30');
    expect(v[1]).toMatchObject({ debut: '2026-10-01', fin: null, hc: 640, ch: 80, source: 'manuel', note: 'Accord' });
    expect(v[1]._edition).toMatchObject({ evtId: 'bper_1', de: 'manuel' });
    const tomb = r.periods.find((p) => p._deleted);
    expect(tomb._modifieePar).toMatchObject({ debut: '2026-10-01', motif: 'Erreur de date', auteur: 'Didier', evtId: 'bper_1' });
    expect(r.touchees).toEqual([{ cle: expect.objectContaining({ debut: BD }), champ: 'fin', avant: '2026-08-31', apres: '2026-09-30' }]);
    expect(r.avant).toMatchObject({ debut: '2026-09-01' });
    expect(r.apres).toMatchObject({ debut: '2026-10-01' });
  });

  it('avancer au 01/06/2026 : la précédente est ROGNÉE, juin et juillet passent à 720 €', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-06-01' }, OPTS);
    expect(vivantes(r.periods)[0].fin).toBe('2026-05-31');
    expect(du(r.periods, '2026-05')).toBe(680);
    expect(du(r.periods, '2026-06')).toBe(720);
    expect(du(r.periods, '2026-08')).toBe(720);
  });

  it('avancer jusqu\'à la date du bail : la précédente est ABSORBÉE (tombstone avec sa raison), T devient la 1re', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: BD }, OPTS);
    expect(vivantes(r.periods)).toHaveLength(1);
    expect(vivantes(r.periods)[0]).toMatchObject({ debut: BD, fin: null, hc: 640 });
    const absorbee = r.periods.find((p) => p._deleted && p._absorbeePar);
    expect(absorbee).toMatchObject({ debut: BD, hc: 600 });
    expect(absorbee._absorbeePar).toMatchObject({ debut: BD, evtId: 'bper_1' });
    expect(du(r.periods, '2023-10')).toBe(720);
    expect(r.touchees[0]).toMatchObject({ champ: 'absorbee' });
  });

  it('une période absorbée issue d\'une révision IRL est signalée', () => {
    let b = [periodeInitialeBail(bail)];
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2026-09-01', hc: 620, ch: 80, source: 'irl', bailDebut: BD, note: 'IRL' });
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2027-03-01', hc: 700, ch: 80, source: 'manuel', bailDebut: BD, note: '' });
    const r = modifierPeriode(b, cleT(b, '2027-03-01'), { debut: '2026-09-01' }, OPTS);
    expect(r.avertissements).toContain('absorbe-irl');
    expect(r.periods.find((p) => p._absorbeePar).source).toBe('irl');
  });

  it('la 1re période du chapitre : la date est celle du bail → ignorée + avertissement ; les montants passent, source « bail » gardée', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, BD), { debut: '2023-10-01', hc: 610 }, OPTS);
    expect(r.avertissements).toContain('premiere-periode-date');
    const p = vivantes(r.periods)[0];
    expect(p).toMatchObject({ debut: BD, hc: 610, source: 'bail', fin: '2026-08-31' });
  });

  it('bornes de saisie : après la fin / avant le bail → ok:false avec raison (jamais un silence)', () => {
    let b = maquette();
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2027-01-01', hc: 700, ch: 80, source: 'manuel', bailDebut: BD, note: '' });
    const T = cleT(b, '2026-09-01');            // fin 2026-12-31
    expect(modifierPeriode(b, T, { debut: '2027-02-01' }, OPTS)).toMatchObject({ ok: false, change: false, raison: 'date-apres-fin' });
    expect(modifierPeriode(b, T, { debut: '2023-01-01' }, OPTS)).toMatchObject({ ok: false, raison: 'avant-bail' });
    expect(modifierPeriode(b, T, { debut: 'pas-une-date' }, OPTS)).toMatchObject({ ok: false, raison: 'date-invalide' });
    expect(modifierPeriode(b, { ...T, debut: '1999-01-01' }, { hc: 1 }, OPTS)).toMatchObject({ ok: false, raison: 'introuvable' });
    // le tableau rendu est une copie intacte
    expect(modifierPeriode(b, T, { debut: '2027-02-01' }, OPTS).periods).toEqual(b);
  });

  it('reculer jusqu\'à sa propre fin est permis (une période d\'un jour)', () => {
    let b = maquette();
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2027-01-01', hc: 700, ch: 80, source: 'manuel', bailDebut: BD, note: '' });
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-12-31' }, OPTS);
    expect(r.ok).toBe(true);
    expect(du(r.periods, '2026-11')).toBe(680);
  });

  it('trou préexistant avant la période : pas de prolongation inventée, la couverture comble au tarif du bail', () => {
    // 680 jusqu'au 31/08 puis TROU puis 720 à partir du 01/10 : on recule la 720 au 01/11.
    const b = [
      { ref: REF, debut: BD, fin: '2026-08-31', hc: 600, ch: 80, source: 'bail', bailDebut: BD, note: '' },
      { ref: REF, debut: '2026-10-01', fin: null, hc: 640, ch: 80, source: 'manuel', bailDebut: BD, note: '' }
    ];
    const r = modifierPeriode(b, cleDePeriode(b[1]), { debut: '2026-11-01' }, OPTS);
    expect(r.avertissements).toContain('trou-preexistant');
    const v = vivantes(r.periods);
    expect(v.map((p) => [p.debut, p.fin])).toEqual([[BD, '2026-08-31'], ['2026-09-01', '2026-10-31'], ['2026-11-01', null]]);
    expect(v[1].note).toMatch(/Complété/);
    expect(v[1].hc).toBe(640);                 // le tarif du bail (opts.bailHc), comme le repli de duMois
  });
});

describe('modifierPeriode — montants, source, IRL', () => {
  it('montants seuls : nouvelle ligne, même début et même fin, note d\'origine conservée', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { hc: 650, ch: 90 }, OPTS);
    expect(vivantes(r.periods)[1]).toMatchObject({ debut: '2026-09-01', fin: null, hc: 650, ch: 90, note: 'Accord' });
    expect(vivantes(r.periods)[0].fin).toBe('2026-08-31');        // la voisine ne bouge pas
    expect(r.touchees).toEqual([]);
  });

  it('un champ vide n\'est pas un zéro ; rien ne change → no-op sans trace', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { hc: '', ch: '', debut: '2026-09-01' }, OPTS);
    expect(r).toMatchObject({ ok: true, change: false });
    expect(r.periods).toEqual(b);
    expect(modifierPeriode(b, cleT(b, '2026-09-01'), { hc: 0 }, OPTS).periods.find((p) => !p._deleted && p.debut === '2026-09-01').hc).toBe(0);  // un 0 SAISI vaut 0
    expect(modifierPeriode(b, cleT(b, '2026-09-01'), { hc: -5 }, OPTS)).toMatchObject({ ok: false, raison: 'montant-invalide' });
  });

  it('une continuation « bail » éditée devient « manuel » : la révision suivante ne la supersède plus en silence', () => {
    // continuation réelle : une correction 2024-01-01→2024-03-31 coupe la période du bail, qui reprend au 2024-04-01
    let b = [periodeInitialeBail(bail)];
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2024-01-01', fin: '2024-03-31', hc: 500, ch: 80, source: 'manuel', bailDebut: BD, note: 'remise' });
    const cont = vivantes(b).find((p) => p.debut === '2024-04-01');
    expect(cont).toMatchObject({ source: 'bail', fin: null });
    const r = modifierPeriode(b, cleDePeriode(cont), { hc: 630 }, OPTS);
    const edited = vivantes(r.periods).find((p) => p.debut === '2024-04-01');
    expect(edited.source).toBe('manuel');
    expect(edited._edition.de).toBe('bail');
    // une décision datée avant elle ne la supersède pas, elle la BORNE
    const apres = appliquerNouvellePeriode(r.periods, { ref: REF, debut: '2024-02-01', hc: 520, ch: 80, source: 'manuel', bailDebut: BD, note: '' });
    expect(vivantes(apres).find((p) => p.debut === '2024-04-01')).toMatchObject({ hc: 630 });
    expect(vivantes(apres).find((p) => p.debut === '2024-02-01').fin).toBe('2024-03-31');
    // témoin : SANS l'édition, la continuation « bail » est bien supersédée
    const temoin = appliquerNouvellePeriode(b, { ref: REF, debut: '2024-02-01', hc: 520, ch: 80, source: 'manuel', bailDebut: BD, note: '' });
    expect(vivantes(temoin).find((p) => p.debut === '2024-04-01')).toBeUndefined();
  });

  it('période issue d\'une révision IRL : seules les charges ; avec autoriserIRL le module accepte tout et garde « irl »', () => {
    let b = maquette();
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2027-03-01', hc: 660, ch: 80, source: 'irl', bailDebut: BD, note: 'IRL T4' });
    const k = cleT(b, '2027-03-01');
    const r = modifierPeriode(b, k, { hc: 999, ch: 95, debut: '2027-04-01' }, OPTS);
    expect(r.avertissements).toContain('irl-geste-dedie');
    expect(vivantes(r.periods).find((p) => p.source === 'irl')).toMatchObject({ debut: '2027-03-01', hc: 660, ch: 95 });
    const r2 = modifierPeriode(b, k, { hc: 999, debut: '2027-04-01' }, { ...OPTS, autoriserIRL: true });
    expect(r2.avertissements).not.toContain('irl-geste-dedie');
    expect(vivantes(r2.periods).find((p) => p.source === 'irl')).toMatchObject({ debut: '2027-04-01', hc: 999 });
    expect(supprimerPeriode(b, k, OPTS)).toMatchObject({ ok: false, raison: 'irl-geste-dedie' });
    expect(supprimerPeriode(b, k, { ...OPTS, autoriserIRL: true }).ok).toBe(true);
  });

  it('composition saveBail : après recalage de bail.hc, synchroniserPeriodeBail est un no-op ; sans recalage il repeint', () => {
    const b0 = [periodeInitialeBail(bail)];                                  // une seule période ouverte « bail » à 600
    const r = modifierPeriode(b0, cleT(b0, BD), { hc: 650 }, OPTS);
    expect(vivantes(r.periods)[0]).toMatchObject({ hc: 650, source: 'bail', fin: null });
    const apresRecalage = synchroniserPeriodeBail(r.periods, { ref: REF, debut: BD, hc: 650, ch: 80 }, BD);
    expect(apresRecalage).toEqual(r.periods);
    const sansRecalage = synchroniserPeriodeBail(r.periods, { ref: REF, debut: BD, hc: 600, ch: 80 }, BD);
    expect(vivantes(sansRecalage)[0].hc).toBe(600);                           // le piège que l'orchestrateur évite
  });
});

describe('supprimerPeriode', () => {
  it('avec une précédente contiguë : elle est prolongée (et redevient ouverte si T l\'était)', () => {
    const b = maquette();
    const r = supprimerPeriode(b, cleT(b, '2026-09-01'), OPTS);
    const v = vivantes(r.periods);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ debut: BD, fin: null, hc: 600 });
    expect(du(r.periods, '2026-10')).toBe(680);
    const tomb = r.periods.find((p) => p._deleted);
    expect(tomb._supprimeePar).toMatchObject({ reprise: 'precedente', motif: 'Erreur de date', evtId: 'bper_1' });
    expect(r.avant).toMatchObject({ debut: '2026-09-01', hc: 640 });
  });

  it('1re période : ses mois prennent le tarif de la SUIVANTE (ligne « bail »), avertissement', () => {
    const b = maquette();
    const r = supprimerPeriode(b, cleT(b, BD), OPTS);
    expect(r.avertissements).toContain('premiere-periode-supprimee');
    const v = vivantes(r.periods);
    expect(v.map((p) => [p.debut, p.fin, p.hc, p.source])).toEqual([[BD, '2026-08-31', 640, 'bail'], ['2026-09-01', null, 640, 'manuel']]);
    expect(v[0].note).toMatch(/suivante/);
    expect(du(r.periods, '2024-01')).toBe(720);
    expect(r.periods.find((p) => p._deleted)._supprimeePar.reprise).toBe('suivante');
  });

  it('seule période : rien n\'est poussé, la couverture repose la période du bail à SON tarif', () => {
    const b0 = [periodeInitialeBail(bail)];
    const r = supprimerPeriode(b0, cleT(b0, BD), OPTS);
    expect(r.avertissements).toContain('seule-periode');
    const v = vivantes(r.periods);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ debut: BD, fin: null, hc: 640, ch: 80, source: 'bail' });
    expect(du(r.periods, '2025-01')).toBe(720);
  });

  it('dernière période d\'un bail CLOS : la précédente prend la fin de T, jamais au-delà de la clôture', () => {
    const b = cloturerBareme(maquette(), REF, '2027-03-31');
    const r = supprimerPeriode(b, cleT(b, '2026-09-01'), OPTS);
    expect(vivantes(r.periods)).toHaveLength(1);
    expect(vivantes(r.periods)[0].fin).toBe('2027-03-31');
  });

  it('seule période d\'un bail clos : le trou est comblé BORNÉ à la clôture (on ne rouvre pas un bail clos)', () => {
    const b0 = cloturerBareme([periodeInitialeBail(bail)], REF, '2025-06-30');
    const r = supprimerPeriode(b0, cleT(b0, BD), OPTS);
    expect(vivantes(r.periods).map((p) => [p.debut, p.fin])).toEqual([[BD, '2025-06-30']]);
  });

  it('au milieu : la précédente est prolongée jusqu\'à la fin de T, la suivante est intacte', () => {
    let b = maquette();
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2027-03-01', hc: 660, ch: 80, source: 'irl', bailDebut: BD, note: '' });
    const r = supprimerPeriode(b, cleT(b, '2026-09-01'), OPTS);
    expect(vivantes(r.periods).map((p) => [p.debut, p.fin, p.hc])).toEqual([[BD, '2027-02-28', 600], ['2027-03-01', null, 660]]);
  });
});

describe('chapitres, idempotence, immutabilité', () => {
  const deuxBaux = () => {
    // bail 1 : 2020-01-01 → 2022-12-31 (clos) ; bail 2 : 2023-09-01 → (la maquette)
    let b1 = [{ ref: REF, debut: '2020-01-01', fin: null, hc: 500, ch: 60, source: 'bail', bailDebut: '2020-01-01', note: '' }];
    b1 = appliquerNouvellePeriode(b1, { ref: REF, debut: '2021-06-01', hc: 520, ch: 60, source: 'manuel', bailDebut: '2020-01-01', note: 'x' });
    b1 = cloturerBareme(b1, REF, '2022-12-31');
    return b1.concat(maquette());
  };
  it('modifier le 1er bail ne touche pas le second (lignes du chapitre voisin identiques)', () => {
    const b = deuxBaux();
    const avant2 = JSON.stringify(b.filter((p) => p.bailDebut === BD));
    const r = modifierPeriode(b, { ref: REF, bailDebut: '2020-01-01', debut: '2021-06-01' }, { debut: '2021-03-01', hc: 530 }, OPTS);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.periods.filter((p) => p.bailDebut === BD))).toBe(avant2);
  });
  it('supprimer la dernière période d\'un chapitre ne prolonge pas la précédente dans l\'autre chapitre', () => {
    const b = deuxBaux();
    const r = supprimerPeriode(b, { ref: REF, bailDebut: '2020-01-01', debut: '2021-06-01' }, OPTS);
    const ch1 = r.periods.filter((p) => !p._deleted && p.bailDebut === '2020-01-01');
    expect(ch1.map((p) => [p.debut, p.fin])).toEqual([['2020-01-01', '2022-12-31']]);
    expect(JSON.stringify(r.periods.filter((p) => p.bailDebut === BD))).toBe(JSON.stringify(b.filter((p) => p.bailDebut === BD)));
  });

  it('rejouer la même opération (même evtId) est un no-op : modifier, supprimer, ajouter', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-10-01' }, OPTS);
    const again = modifierPeriode(r.periods, cleT(b, '2026-09-01'), { debut: '2026-10-01' }, OPTS);
    expect(again).toMatchObject({ ok: true, change: false });
    expect(again.periods).toEqual(r.periods);
    const s = supprimerPeriode(b, cleT(b, '2026-09-01'), OPTS);
    expect(supprimerPeriode(s.periods, cleT(b, '2026-09-01'), OPTS)).toMatchObject({ ok: true, change: false });
    const a = ajouterPeriode(b, { ref: REF, debut: '2027-01-01', hc: 700, ch: 80 }, { ...OPTS, evtId: 'bper_a' });
    expect(ajouterPeriode(a.periods, { ref: REF, debut: '2027-01-01', hc: 700, ch: 80 }, { ...OPTS, evtId: 'bper_a' })).toMatchObject({ ok: true, change: false });
  });

  it('l\'entrée n\'est jamais mutée, la sortie est une copie, et le résultat est déterministe', () => {
    const b = maquette();
    const snap = structuredClone(b);
    const a1 = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-10-01', hc: 700 }, OPTS);
    const a2 = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-10-01', hc: 700 }, OPTS);
    supprimerPeriode(b, cleT(b, '2026-09-01'), OPTS);
    ajouterPeriode(b, { ref: REF, debut: '2027-01-01', hc: 700, ch: 80 }, OPTS);
    expect(b).toEqual(snap);
    expect(a1).toEqual(a2);
    a1.periods[0].hc = 12345;
    expect(b).toEqual(snap);
  });
});

describe('ajouterPeriode', () => {
  it('ajoute une période datée : coupe la période en vigueur (même séquence que l\'ancien « Corriger une période »)', () => {
    const b = maquette();
    const r = ajouterPeriode(b, { ref: REF, debut: '2027-03-01', hc: 700, ch: 85 }, { ...OPTS, motif: 'Travaux' });
    expect(r).toMatchObject({ ok: true, change: true });
    expect(vivantes(r.periods).map((p) => [p.debut, p.fin, p.hc, p.source])).toEqual([
      [BD, '2026-08-31', 600, 'bail'], ['2026-09-01', '2027-02-28', 640, 'manuel'], ['2027-03-01', null, 700, 'manuel']]);
    expect(vivantes(r.periods)[2]).toMatchObject({ note: 'Travaux', _edition: { evtId: 'bper_1', de: null } });
    expect(r.apres).toMatchObject({ debut: '2027-03-01', hc: 700 });
    expect(r.touchees.some((t) => t.champ === 'fin')).toBe(true);
  });

  it('avec une fin explicite : période limitée (remise de 3 mois), le tarif d\'avant reprend', () => {
    const b = maquette();
    const r = ajouterPeriode(b, { ref: REF, debut: '2027-01-01', fin: '2027-03-31', hc: 500, ch: 80 }, OPTS);
    expect(du(r.periods, '2027-02')).toBe(580);
    expect(du(r.periods, '2027-04')).toBe(720);
    expect(du(r.periods, '2026-12')).toBe(720);
  });

  it('une date avant le bail ou hors de tout bail : ok:false avec raison', () => {
    const b = maquette();
    expect(ajouterPeriode(b, { ref: REF, debut: '2022-01-01', hc: 1, ch: 0 }, OPTS)).toMatchObject({ ok: false, raison: 'aucun-bail' });
    expect(ajouterPeriode(b, { ref: REF, debut: '2022-01-01', bailDebut: BD, hc: 1, ch: 0 }, OPTS)).toMatchObject({ ok: false, raison: 'avant-bail' });
    expect(ajouterPeriode(b, { ref: REF, debut: '2027-01-01', hc: '', ch: 0 }, OPTS)).toMatchObject({ ok: false, raison: 'montant-invalide' });
    expect(ajouterPeriode(b, { ref: REF, debut: '2027-01-01', fin: '2026-01-01', hc: 5, ch: 0 }, OPTS)).toMatchObject({ ok: false, raison: 'fin-invalide' });
  });

  it('même début qu\'une période vivante : elle est remplacée (avertissement), pas dupliquée', () => {
    const b = maquette();
    const r = ajouterPeriode(b, { ref: REF, debut: '2026-09-01', hc: 700, ch: 80 }, OPTS);
    expect(r.avertissements).toContain('remplace-periode');
    expect(vivantes(r.periods).filter((p) => p.debut === '2026-09-01')).toHaveLength(1);
  });

  it('rattache la date au bon chapitre via les baux (bail clos compris)', () => {
    const b = cloturerBareme(maquette(), REF, '2027-03-31');
    const r = ajouterPeriode(b, { ref: REF, debut: '2026-12-01', fin: '2026-12-31', hc: 1, ch: 0 }, { ...OPTS, baux: [{ debut: BD, fin: '2027-03-31', archive: true }] });
    expect(r.ok).toBe(true);
    expect(vivantes(r.periods).every((p) => p.bailDebut === BD)).toBe(true);
  });
});


// ════════════════════════════════════════════════════════════════════════════
// CONTRE-AUDIT 06/10 — chapitres CONTIGUS (re-bail le lendemain de la clôture), barème legacy sans bailDebut, bail clos,
// charges vides, montants non numériques, rejeu sans écrasement, journal piégé, révision IRL programmée.
// ════════════════════════════════════════════════════════════════════════════
describe('deux baux CONTIGUS (aucun trou entre eux) : éditer l\'un ne touche jamais l\'autre', () => {
  // bail 1 : 2022-01-01 → 2023-08-31 (600 puis 640 dès 2022-09-01), bail 2 : 2023-09-01 (900) — le re-bail est le LENDEMAIN de la clôture.
  const contigus = () => {
    let b1 = [{ ref: REF, debut: '2022-01-01', fin: null, hc: 600, ch: 80, source: 'bail', bailDebut: '2022-01-01', note: '' }];
    b1 = appliquerNouvellePeriode(b1, { ref: REF, debut: '2022-09-01', hc: 640, ch: 80, source: 'manuel', bailDebut: '2022-01-01', note: 'x' });
    b1 = cloturerBareme(b1, REF, '2023-08-31');
    return b1.concat([periodeInitialeBail({ ref: REF, debut: BD, hc: 900, ch: 100 })]);
  };
  const baux = [{ debut: '2022-01-01', finEffective: '2023-08-31', archive: true, hc: 640, ch: 80 }, { debut: BD, finEffective: null, archive: false, hc: 900, ch: 100 }];
  const duC = (b, ym) => duMois({ ref: REF, bails: baux, bareme: b }, ym).total;

  it('supprimer la 1re période du 2e bail ne prolonge JAMAIS le locataire d\'avant (mutation « filtre de chapitre retiré » : nov. 2024 passait de 910 à 720 €)', () => {
    const b = contigus();
    const r = supprimerPeriode(b, { ref: REF, bailDebut: BD, debut: BD }, { ...OPTS, bailHc: 900, bailCh: 100, baux });
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r.periods.filter((p) => !p._deleted && p.bailDebut === '2022-01-01'))).toBe(JSON.stringify(b.filter((p) => !p._deleted && p.bailDebut === '2022-01-01')));
    for (const ym of ['2022-03', '2023-01', '2023-08']) expect(duC(r.periods, ym)).toBe(duC(b, ym));
    expect(duC(r.periods, '2024-11')).toBe(1000);                  // le 2e locataire reste à SON tarif (900 + 100)
  });
  it('modifier la date de la 1re période du 2e bail vers l\'arrière : refusée (avant le bail), le tableau est rendu inchangé', () => {
    const b = contigus();
    const r = modifierPeriode(b, { ref: REF, bailDebut: BD, debut: '2023-09-01' }, { debut: '2023-06-01' }, OPTS);
    expect(JSON.stringify(r.periods)).toBe(JSON.stringify(b));
  });
  it('modifier une période du 1er bail : la clôture tient et le 2e bail est intact', () => {
    const b = contigus();
    const r = modifierPeriode(b, { ref: REF, bailDebut: '2022-01-01', debut: '2022-09-01' }, { hc: 660 }, { ...OPTS, bailHc: 640, baux });
    expect(r.ok && r.change).toBe(true);
    expect(JSON.stringify(r.periods.filter((p) => !p._deleted && p.bailDebut === BD))).toBe(JSON.stringify(b.filter((p) => !p._deleted && p.bailDebut === BD)));
    expect(vivantes(r.periods).filter((p) => p.bailDebut === '2022-01-01').every((p) => p.fin && p.fin <= '2023-08-31')).toBe(true);
  });
});

describe('barème ANTÉRIEUR au champ bailDebut : la suppression ne traverse pas les chapitres (audit 🟡9)', () => {
  const legacy = () => {
    const b = [
      { ref: REF, debut: '2022-01-01', fin: '2022-12-31', hc: 600, ch: 80, source: 'bail', note: '' },
      { ref: REF, debut: '2023-01-01', fin: '2023-08-31', hc: 620, ch: 80, source: 'manuel', note: '' },
      { ref: REF, debut: BD, fin: '2024-08-31', hc: 900, ch: 100, source: 'bail', note: '' },
      { ref: REF, debut: '2024-09-01', fin: null, hc: 950, ch: 100, source: 'manuel', note: '' }
    ];
    return b;
  };
  const baux = [{ debut: '2022-01-01', finEffective: '2023-08-31', archive: true, hc: 620, ch: 80 }, { debut: BD, finEffective: null, archive: false, hc: 950, ch: 100 }];
  it('avec les baux du lot : la 1re période du 2e bail est reconnue comme telle (1re du chapitre), l\'ancien locataire n\'est pas prolongé', () => {
    const b = legacy();
    const r = supprimerPeriode(b, { ref: REF, bailDebut: '', debut: BD }, { ...OPTS, bailHc: 950, bailCh: 100, baux });
    expect(r.ok).toBe(true);
    const vieux = vivantes(r.periods).filter((p) => p.debut < BD);
    expect(vieux.map((p) => [p.debut, p.fin, p.hc])).toEqual([['2022-01-01', '2022-12-31', 600], ['2023-01-01', '2023-08-31', 620]]);
    expect(r.avertissements).toContain('premiere-periode-supprimee');
    const dus = (ym) => duMois({ ref: REF, bails: baux, bareme: r.periods }, ym).total;
    expect(dus('2023-06')).toBe(700);                              // l'ancien locataire : inchangé (620 + 80)
    expect(dus('2023-11')).toBe(1050);                             // le nouveau : la période suivante (950 + 100), jamais 700
  });
});

describe('ajouter dans un bail clos, charges vides, montants non numériques', () => {
  const clos = () => {
    let b = [{ ref: REF, debut: '2019-01-01', fin: null, hc: 500, ch: 60, source: 'bail', bailDebut: '2019-01-01', note: '' }];
    b = cloturerBareme(b, REF, '2022-12-31');
    return b.concat(maquette());
  };
  const baux = [{ debut: '2019-01-01', finEffective: '2022-12-31', archive: true, hc: 500, ch: 60 }, { debut: BD, archive: false, hc: 640, ch: 80 }];
  it('la période ajoutée ne déborde pas la clôture du bail (finChapitre déduit des baux) ; après la fin : « apres-cloture »', () => {
    const r = ajouterPeriode(clos(), { ref: REF, debut: '2021-03-01', hc: 520, ch: 60, bailDebut: '2019-01-01' }, { ...OPTS, evtId: 'a1', baux });
    expect(r.ok && r.change).toBe(true);
    expect(vivantes(r.periods).find((p) => p.debut === '2021-03-01').fin).toBe('2022-12-31');
    const r2 = ajouterPeriode(clos(), { ref: REF, debut: '2021-03-01', fin: '2030-01-01', hc: 520, ch: 60, bailDebut: '2019-01-01' }, { ...OPTS, evtId: 'a2', baux });
    expect(vivantes(r2.periods).find((p) => p.debut === '2021-03-01').fin).toBe('2022-12-31');       // une fin explicite plus tardive est ramenée à la clôture
    expect(ajouterPeriode(clos(), { ref: REF, debut: '2023-03-01', hc: 520, ch: 60, bailDebut: '2019-01-01' }, { ...OPTS, evtId: 'a3', baux })).toMatchObject({ ok: false, raison: 'apres-cloture' });
    // le paramètre explicite fait foi
    expect(ajouterPeriode(clos(), { ref: REF, debut: '2021-03-01', hc: 520, ch: 60, bailDebut: '2019-01-01' }, { ...OPTS, evtId: 'a4', finChapitre: '2021-12-31' }).periods
      .find((p) => !p._deleted && p.debut === '2021-03-01').fin).toBe('2021-12-31');
  });
  it('charges vides : reprise de la provision de la période en vigueur, DITE (« charges-reprises ») ; jamais 0 € en silence', () => {
    const b = maquette();
    const r = ajouterPeriode(b, { ref: REF, debut: '2027-03-01', hc: 700, ch: '' }, { ...OPTS, evtId: 'c1' });
    expect(r.avertissements).toContain('charges-reprises');
    expect(r.apres.ch).toBe(80);
    expect(ajouterPeriode(b, { ref: REF, debut: '2027-03-01', hc: 700, ch: 0 }, { ...OPTS, evtId: 'c2' }).apres.ch).toBe(0);   // un 0 saisi reste un 0
    expect(ajouterPeriode(b, { ref: REF, debut: '2027-03-01', hc: 700, ch: 0 }, { ...OPTS, evtId: 'c3' }).avertissements).not.toContain('charges-reprises');
  });
  it('un montant non numérique est « montant-invalide », jamais « inchangé » : modifier hc/ch, ajouter ch', () => {
    const b = maquette();
    const k = cleT(b, '2026-09-01');
    for (const patch of [{ hc: 'abc' }, { ch: 'x' }, { hc: NaN }, { ch: Infinity }]) {
      const r = modifierPeriode(b, k, patch, OPTS);
      expect(r, JSON.stringify(patch)).toMatchObject({ ok: false, raison: 'montant-invalide' });
      expect(r.periods).toEqual(b);
    }
    expect(modifierPeriode(b, k, { hc: '' , ch: undefined }, OPTS)).toMatchObject({ ok: true, change: false });    // vide = inchangé (LOT 3)
    expect(ajouterPeriode(b, { ref: REF, debut: '2027-03-01', hc: 700, ch: 'zz' }, OPTS)).toMatchObject({ ok: false, raison: 'montant-invalide' });
  });
});

describe('planRejeu / simulerRejeu : jamais de montants absolus par-dessus une décision plus récente (audit 🟠1)', () => {
  const entree = (o) => ({ id: 'e1', action: 'modifiee', ref: REF, bailDebut: BD, date: '2026-10-06T09:00:00Z', auteur: 'A', motif: '',
    avant: { debut: '2026-09-01', fin: null, hc: 730, ch: 80, source: 'irl' }, apres: { debut: '2026-09-01', fin: null, hc: 730, ch: 100, source: 'irl' }, ...o });
  const bareme = (hc, source = 'irl') => [
    { ref: REF, debut: BD, fin: '2026-08-31', hc: 600, ch: 80, source: 'bail', bailDebut: BD },
    { ref: REF, debut: '2026-09-01', fin: null, hc, ch: 80, source, bailDebut: BD }
  ];
  it('période identique à ce que le journal avait vu : « ok », patch = SEULEMENT les champs changés (ici les charges)', () => {
    const p = planRejeu(entree(), bareme(730));
    expect(p).toMatchObject({ etat: 'ok', ecarts: [], patch: { ch: 100 } });
    expect(Object.keys(p.patch)).toEqual(['ch']);
  });
  it('une révision IRL est passée entre-temps (730 → 742) : « diverge », écart nommé, le loyer n\'est PAS dans le patch', () => {
    const p = planRejeu(entree(), bareme(742));
    expect(p.etat).toBe('diverge');
    expect(p.ecarts).toEqual([{ champ: 'hc', journal: 730, vivant: 742 }]);
    expect(p.patch).toEqual({ ch: 100 });
  });
  it('date / loyer d\'une période IRL : jamais rejoués (restreint) ; suppression d\'une période IRL : « irl-geste »', () => {
    const p = planRejeu(entree({ apres: { debut: '2026-10-01', fin: null, hc: 735, ch: 80, source: 'irl' } }), bareme(730));
    expect(p).toMatchObject({ etat: 'irl-geste' });
    expect(p.restreint.sort()).toEqual(['debut', 'hc']);
    expect(planRejeu(entree({ action: 'supprimee', apres: null }), bareme(730)).etat).toBe('irl-geste');
  });
  it('période disparue : « introuvable » ; période manuelle sans divergence : « ok » avec la date et le loyer', () => {
    expect(planRejeu(entree(), []).etat).toBe('introuvable');
    const x = entree({ avant: { debut: '2026-09-01', fin: null, hc: 730, ch: 80, source: 'manuel' }, apres: { debut: '2026-10-01', fin: null, hc: 740, ch: 80, source: 'manuel' } });
    expect(planRejeu(x, bareme(730, 'manuel'))).toMatchObject({ etat: 'ok', patch: { debut: '2026-10-01', hc: 740 } });
  });
  it('simulerRejeu : s\'arrête à la 1re divergence SANS rien écrire ; « forcer » pose les seuls champs changés ; la chaîne s\'enchaîne dans l\'ordre', () => {
    const b742 = bareme(742);
    const stop = simulerRejeu([entree()], b742);
    expect(stop).toMatchObject({ ok: false, stop: { raison: 'diverge' } });
    expect(stop.periods).toEqual(b742);
    const force = simulerRejeu([entree()], b742, { forcer: true });
    expect(force.ok).toBe(true);
    expect(vivantes(force.periods).find((p) => p.debut === '2026-09-01')).toMatchObject({ hc: 742, ch: 100 });
    // la date, puis le montant (deux éditions perdues ensemble)
    const e1 = entree({ id: 'a', avant: { debut: '2026-09-01', fin: null, hc: 640, ch: 80, source: 'manuel' }, apres: { debut: '2026-10-01', fin: null, hc: 640, ch: 80, source: 'manuel' } });
    const e2 = entree({ id: 'b', date: '2026-10-07T09:00:00Z', avant: { debut: '2026-10-01', fin: null, hc: 640, ch: 80, source: 'manuel' }, apres: { debut: '2026-10-01', fin: null, hc: 620, ch: 80, source: 'manuel' } });
    const sim = simulerRejeu([e1, e2], bareme(640, 'manuel'));
    expect(sim.ok).toBe(true);
    expect(vivantes(sim.periods).map((p) => [p.debut, p.hc])).toEqual([[BD, 600], ['2026-10-01', 620]]);
    expect(simulerRejeu([e2], bareme(640, 'manuel')).stop.raison).toBe('introuvable');     // seule, la 2e est introuvable : d'où la chaîne
  });
  it('chaineDeRejeu : les perdues du MÊME bail, de la plus ancienne jusqu\'à l\'entrée visée', () => {
    const L = [entree({ id: 'a' }), entree({ id: 'b', bailDebut: '2019-01-01' }), entree({ id: 'c', date: '2026-10-08T00:00:00Z' })];
    expect(chaineDeRejeu(L, L[2]).map((x) => x.id)).toEqual(['a', 'c']);
    expect(chaineDeRejeu(L, { id: 'zz' })).toEqual([]);
  });
});

describe('journal piégé (cloud, écrit par d\'autres membres) : entrées aux dates illisibles ignorées (audit 🟠4)', () => {
  const e = (o) => ({ id: 'x', type: 'periode', action: 'modifiee', ref: REF, bailDebut: BD, date: '2026-10-06T10:00:00Z', avant: { debut: '2026-09-01' }, apres: { debut: '2026-10-01' }, ...o });
  it('une date qui n\'est pas AAAA-MM-JJ n\'atteint jamais l\'écran ; une entrée sans avant/apres exploitable non plus', () => {
    const piege = '<img src=x onerror=alert(1)>';
    expect(periodesNonAppliquees([e({ avant: { debut: piege } })], [], { ref: REF })).toEqual([]);
    expect(periodesNonAppliquees([e({ apres: { debut: piege } })], [], { ref: REF })).toEqual([]);
    expect(periodesNonAppliquees([e({ avant: null })], [], { ref: REF })).toEqual([]);
    expect(periodesNonAppliquees([e({ action: 'ajoutee', avant: null, apres: { debut: '2026/10/01' } })], [], { ref: REF })).toEqual([]);
    expect(periodesNonAppliquees([e({})], [], { ref: REF })).toHaveLength(1);
    expect(periodesNonAppliquees([e({ action: 'ajoutee', avant: null })], [], { ref: REF })).toHaveLength(1);
  });
});

describe('irlProgrammeeDuLot', () => {
  const h = (o) => ({ ref: REF, dateRevision: '2026-09-01', dateEffet: '2026-11-01', ancienHC: 640, nouveauHC: 660, pendingApply: true, ...o });
  it('la plus récente révision en attente du lot ; ni annulée, ni appliquée, ni d\'un autre lot, ni d\'un bail antérieur', () => {
    expect(irlProgrammeeDuLot([h()], REF)).toMatchObject({ dateEffet: '2026-11-01', ancienHC: 640, nouveauHC: 660 });
    expect(irlProgrammeeDuLot([h(), h({ dateEffet: '2027-03-01' })], REF).dateEffet).toBe('2027-03-01');
    for (const o of [{ _deleted: true }, { pendingApply: false }, { ref: 'AUTRE' }, { action: 'renonciation' }, { dateRevision: '2020-01-01' }]) expect(irlProgrammeeDuLot([h(o)], REF, { debutBail: BD })).toBeNull();
    expect(irlProgrammeeDuLot([], REF)).toBeNull();
  });
});
