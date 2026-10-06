// BAIL-EN-COURS-MODIFIER-PERIODES — étape 1 : le module pur js/core/bareme-edition.js.
//
// Les barèmes de test sont construits avec les VRAIS écrivains (periodeInitialeBail,
// appliquerNouvellePeriode, garantirCouvertureBail, cloturerBareme), jamais à la main : on veut
// prouver que l'édition compose avec ce que l'app écrit réellement (comme finances-invariant-i1).
// Le cas de la maquette : 680 € (01/09/2023→31/08/2026, bail) puis 720 € (01/09/2026→, manuel).
import { describe, it, expect } from 'vitest';
import {
  cleDePeriode, trouverPeriode, modifierPeriode, supprimerPeriode, ajouterPeriode
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
