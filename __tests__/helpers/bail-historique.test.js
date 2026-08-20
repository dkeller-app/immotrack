import { describe, it, expect } from 'vitest';
import { construireHistoriqueBail, enVigueur } from '../../js/core/bail-historique.js';

// HISTORIQUE-BAIL-ONGLET (2026-07-17) — décisions user ①-⑤ :
//   · l'onglet Bail affiche l'historique de TOUTES les évolutions, tous baux confondus,
//     en ACCORDÉONS par bail (courant déplié, clos repliés) ;
//   · le dépôt de garantie est un ÉVÉNEMENT de la timeline (versé / restitué), pas un bloc ;
//   · les périodes viennent du barème (DB.loyerBareme), les révisions d'irlHistorique,
//     les traces hors-barème (modif DG, corrections) de DB.bailEvents (append-only).
// Module PUR : aucune lecture de DB, `today` injecté (pas de Date.now — testable).

const TODAY = '2026-07-17';

const bailFric = {
  ref: 'F-001', debut: '2024-03-01', hc: 505.15, ch: 65, dg: 500,
  locataires: [{ nom: 'M. Fric' }],
  signatures: { signedAt: '2024-03-01', mode: 'presentiel' }
};

const baremeFric = [
  { ref: 'F-001', debut: '2024-03-01', fin: '2025-12-31', hc: 500, ch: 50, source: 'bail', bailDebut: '2024-03-01', note: '' },
  { ref: 'F-001', debut: '2026-01-01', fin: '2026-06-30', hc: 500, ch: 65, source: 'manuel', bailDebut: '2024-03-01', note: 'Régularisation 2025' },
  { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 505.15, ch: 65, source: 'irl', bailDebut: '2024-03-01', note: 'T1-2026' }
];

const irlFric = [
  { ref: 'F-001', date: '2026-06-20', dateRevision: '2026-03-01', dateEffet: '2026-07-01', ancienHC: 500, nouveauHC: 505.15, diff: 5.15, irlRef: '145,47', irlVigueur: '146,97' },
  { ref: 'F-001', date: '2025-03-05', dateRevision: '2025-03-01', ancienHC: 500, action: 'renonciation' }
];

const weberHist = {
  ref: 'F-001', debut: '2019-06-15', fin: '2024-02-29', finEffective: '2024-01-31', finMotif: 'Préavis locataire',
  hc: 445, ch: 40, dg: 450, dgRestitueAt: '2024-03-12', dgRestitueMontant: 415, dgDetailRetenues: 'Ménage 35 €',
  locataires: [{ nom: 'Mme Weber' }], _archivedAt: '2024-02-01T10:00:00Z'
};

function build(over) {
  return construireHistoriqueBail({
    ref: 'F-001', today: TODAY,
    bailCourant: bailFric, bauxHistorique: [], bareme: baremeFric,
    irlHistorique: irlFric, bailEvents: [],
    ...over
  });
}

describe('construireHistoriqueBail — chapitres', () => {
  it('bail courant → un chapitre "courant" avec bail-debut + dg-verse + périodes du barème', () => {
    const h = build();
    expect(h.chapitres.length).toBe(1);
    const c = h.chapitres[0];
    expect(c.statut).toBe('courant');
    expect(c.bailDebut).toBe('2024-03-01');
    expect(c.locataires).toBe('M. Fric');
    const types = c.rail.filter(r => r.kind === 'evenement').map(r => r.ev.type);
    expect(types).toContain('bail-debut');
    expect(types).toContain('dg-verse');
    const dg = c.rail.find(r => r.kind === 'evenement' && r.ev.type === 'dg-verse').ev;
    expect(dg.montant).toBe(500);
    expect(c.rail.filter(r => r.kind === 'periode').length).toBe(3);
  });

  it('dg absent ou 0 → pas d\'événement dg-verse', () => {
    const h = build({ bailCourant: { ...bailFric, dg: 0 } });
    const types = h.chapitres[0].rail.filter(r => r.kind === 'evenement').map(r => r.ev.type);
    expect(types).not.toContain('dg-verse');
  });

  it('bail archivé → chapitre "clos" avec fin-bail (finEffective prioritaire) + histIdx GLOBAL', () => {
    const autre = { ref: 'AUTRE', debut: '2010-01-01', fin: '2012-01-01', locataires: [] };
    const h = build({ bauxHistorique: [autre, weberHist] });
    expect(h.chapitres.length).toBe(2);
    const clos = h.chapitres[1];
    expect(clos.statut).toBe('clos');
    expect(clos.fin).toBe('2024-01-31');           // finEffective, pas fin théorique
    expect(clos.histIdx).toBe(1);                  // index GLOBAL dans baux_historique (openBailHist)
    const fin = clos.rail.find(r => r.kind === 'evenement' && r.ev.type === 'fin-bail').ev;
    expect(fin.date).toBe('2024-01-31');
    expect(fin.motif).toBe('Préavis locataire');
  });

  it('DG restitué (montant + retenues) → événement dg-restitue daté de la restitution', () => {
    const h = build({ bauxHistorique: [weberHist] });
    const clos = h.chapitres[1];
    const ev = clos.rail.find(r => r.kind === 'evenement' && r.ev.type === 'dg-restitue').ev;
    expect(ev.date).toBe('2024-03-12');
    expect(ev.montant).toBe(415);
    expect(ev.dgVerse).toBe(450);
    expect(ev.retenues).toBe('Ménage 35 €');
  });

  it('chapitres ordonnés : courant d\'abord, puis clos par début décroissant', () => {
    const vieux = { ...weberHist, debut: '2012-09-01', fin: '2019-05-31', finEffective: '2019-05-31', locataires: [{ nom: 'M. Lambert' }] };
    const h = build({ bauxHistorique: [vieux, weberHist] });
    expect(h.chapitres.map(c => c.statut)).toEqual(['courant', 'clos', 'clos']);
    expect(h.chapitres[1].debut).toBe('2019-06-15');
    expect(h.chapitres[2].debut).toBe('2012-09-01');
  });

  it('pas de bail courant → seulement les chapitres clos', () => {
    const h = build({ bailCourant: null, bauxHistorique: [weberHist] });
    expect(h.chapitres.length).toBe(1);
    expect(h.chapitres[0].statut).toBe('clos');
  });
});

describe('construireHistoriqueBail — événements', () => {
  it('révision IRL appliquée : rattachée au chapitre par plage de dates, effet = dateEffet', () => {
    const h = build();
    const irl = h.chapitres[0].rail.find(r => r.kind === 'evenement' && r.ev.type === 'irl').ev;
    expect(irl.date).toBe('2026-06-20');
    expect(irl.effet).toBe('2026-07-01');
    expect(irl.ancienHC).toBe(500);
    expect(irl.nouveauHC).toBe(505.15);
  });

  it('renonciation IRL → type irl-renonce (ne crée pas de période)', () => {
    const h = build();
    const ren = h.chapitres[0].rail.find(r => r.kind === 'evenement' && r.ev.type === 'irl-renonce').ev;
    expect(ren.date).toBe('2025-03-05');
    expect(ren.ancienHC).toBe(500);
  });

  it('période source manuel → événement modif portant la note (motif)', () => {
    const h = build();
    const modif = h.chapitres[0].rail.find(r => r.kind === 'evenement' && r.ev.type === 'modif').ev;
    expect(modif.effet).toBe('2026-01-01');
    expect(modif.note).toBe('Régularisation 2025');
    expect(modif.hc).toBe(500);
    expect(modif.ch).toBe(65);
  });

  it('bailEvents (trace hors barème, ex. modif DG) rattaché par bailDebut', () => {
    const trace = { ref: 'F-001', bailDebut: '2024-03-01', date: '2026-05-10', type: 'modif-dg', avant: 500, apres: 600, motif: 'Avenant DG' };
    const h = build({ bailEvents: [trace] });
    const ev = h.chapitres[0].rail.find(r => r.kind === 'evenement' && r.ev.type === 'modif-dg').ev;
    expect(ev.avant).toBe(500);
    expect(ev.apres).toBe(600);
    expect(ev.motif).toBe('Avenant DG');
  });

  it('IRL hors de tout bail → rattachée au chapitre le plus récent, marquée horsBail', () => {
    const orpheline = { ref: 'F-001', date: '2010-05-01', dateRevision: '2010-05-01', ancienHC: 400, nouveauHC: 410 };
    const h = build({ irlHistorique: [...irlFric, orpheline] });
    const ev = h.chapitres[0].rail.filter(r => r.kind === 'evenement' && r.ev.type === 'irl').map(r => r.ev)
      .find(e => e.date === '2010-05-01');
    expect(ev).toBeTruthy();
    expect(ev.horsBail).toBe(true);
  });
});

describe('construireHistoriqueBail — rail (ordre) et hygiène', () => {
  it('rail trié par date décroissante ; à date égale la période passe AU-DESSUS, bail-debut en dernier', () => {
    const h = build();
    const rail = h.chapitres[0].rail;
    const dates = rail.map(r => r.dateTri);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
    // au 2024-03-01 : période (bail) > dg-verse > bail-debut (dernier élément du rail)
    const last = rail[rail.length - 1];
    expect(last.kind).toBe('evenement');
    expect(last.ev.type).toBe('bail-debut');
  });

  it('ref tolérante (casse/espaces) + tombstones filtrés (barème et baux_historique)', () => {
    const h = construireHistoriqueBail({
      ref: '  f-001 ', today: TODAY,
      bailCourant: bailFric,
      bauxHistorique: [{ ...weberHist, _deleted: true }],
      bareme: [...baremeFric, { ref: 'F-001', debut: '2020-01-01', fin: null, hc: 1, ch: 1, source: 'bail', bailDebut: '2024-03-01', _deleted: true }],
      irlHistorique: irlFric, bailEvents: []
    });
    expect(h.chapitres.length).toBe(1);                                  // tombstone weber exclu
    expect(h.chapitres[0].rail.filter(r => r.kind === 'periode').length).toBe(3);  // période tombstonée exclue
  });

  it('période future (debut > today) → flag future ; période couvrant today → flag courante', () => {
    const bar = [...baremeFric.slice(0, 2),
      { ref: 'F-001', debut: '2026-07-01', fin: '2026-07-31', hc: 505.15, ch: 65, source: 'irl', bailDebut: '2024-03-01' },
      { ref: 'F-001', debut: '2026-08-01', fin: null, hc: 540, ch: 65, source: 'manuel', bailDebut: '2024-03-01', note: 'Travaux' }];
    const h = build({ bareme: bar });
    const periodes = h.chapitres[0].rail.filter(r => r.kind === 'periode').map(r => r.periode);
    expect(periodes.find(p => p.debut === '2026-08-01').future).toBe(true);
    expect(periodes.find(p => p.debut === '2026-07-01').courante).toBe(true);
    expect(periodes.find(p => p.debut === '2026-01-01').courante).toBe(false);
  });
});

describe('enVigueur — bandeau « en vigueur » + prochaine évolution', () => {
  it('retourne la période couvrant today (hc/ch/total/depuis) et la prochaine future', () => {
    const bar = [...baremeFric.slice(0, 2),
      { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 505.15, ch: 65, source: 'irl', bailDebut: '2024-03-01' },
      { ref: 'F-001', debut: '2026-08-01', fin: null, hc: 540, ch: 65, source: 'manuel', bailDebut: '2024-03-01', note: 'Travaux' }];
    const v = enVigueur('F-001', bar, TODAY);
    expect(v.hc).toBe(505.15);
    expect(v.ch).toBe(65);
    expect(v.total).toBeCloseTo(570.15, 2);
    expect(v.depuis).toBe('2026-07-01');
    expect(v.prochaine).toEqual(expect.objectContaining({ debut: '2026-08-01', hc: 540, ch: 65 }));
  });

  it('aucune période couvrant today → null ; pas de future → prochaine null', () => {
    expect(enVigueur('F-001', [], TODAY)).toBe(null);
    const v = enVigueur('F-001', baremeFric, TODAY);
    expect(v.prochaine).toBe(null);
  });
});

describe('audit 17/07 — mineur 2 : « Loyer initial » = première période source bail du chapitre', () => {
  it('bail-debut affiche le hc/ch de la période initiale, pas le hc VIVANT (muté par IRL)', () => {
    // bailFric.hc = 505.15 (déjà révisé) mais la période source 'bail' du chapitre = 500 + 50
    const h = build();
    const ev = h.chapitres[0].rail.find(r => r.kind === 'evenement' && r.ev.type === 'bail-debut').ev;
    expect(ev.hc0).toBe(500);
    expect(ev.ch0).toBe(50);
  });

  it('sans période bail (barème vide) → repli sur les champs du bail', () => {
    const h = build({ bareme: [] });
    const ev = h.chapitres[0].rail.find(r => r.kind === 'evenement' && r.ev.type === 'bail-debut').ev;
    expect(ev.hc0).toBe(505.15);
  });
});

describe('I-DATE surface 7 — une restitution de DG n’est datée que par son VIREMENT', () => {
  // Dépendance du lot 3 : depuis que l’écran permet d’enregistrer une restitution SANS date
  // (on prévient, on ne bloque pas), le montant seul ne suffit plus à dater la carte. Avant,
  // elle se datait de `c.fin || c.debut` : la timeline affichait « Dépôt de garantie restitué »
  // au 1ᵉʳ janvier 2024 — le jour de la SIGNATURE — pour un virement qui n’a pas eu lieu.
  const bailDG = (extra) => ({ ...{ ref: 'DG-01', debut: '2024-01-01', hc: 800, ch: 100, dg: 800,
    locataires: [{ nom: 'M. Test' }] }, ...extra });
  const construire = (b) => construireHistoriqueBail({
    ref: 'DG-01', bailCourant: b, bauxHistorique: [], bareme: [], irlHistorique: [],
    bailEvents: [], today: TODAY });
  const evs = (b) => construire(b).chapitres.flatMap((c) => c.rail)
    .filter((r) => r.kind === 'evenement').map((r) => r.ev.type);
  const ev1 = (b, type) => construire(b).chapitres.flatMap((c) => c.rail)
    .filter((r) => r.kind === 'evenement').map((r) => r.ev).find((e) => e.type === type);

  it('sans date de virement : AUCUNE carte « restitué », et le manque est dit', () => {
    const t = evs(bailDG({ dgRestitueAt: '', dgRestitueMontant: 800 }));
    expect(t).not.toContain('dg-restitue');
    expect(t).toContain('dg-restitue-sans-date');
  });

  it('la carte sans date ne porte AUCUNE date fabriquée', () => {
    const ev = ev1(bailDG({ dgRestitueAt: '', dgRestitueMontant: 800 }), 'dg-restitue-sans-date');
    expect(ev.date).toBeUndefined();
    expect(ev.montant).toBe(800);
  });

  it('avec la date du virement : la carte « restitué » revient, à SA date', () => {
    const ev = ev1(bailDG({ dgRestitueAt: '2026-05-12', dgRestitueMontant: 800 }), 'dg-restitue');
    expect(ev.date).toBe('2026-05-12');
    expect(evs(bailDG({ dgRestitueAt: '2026-05-12', dgRestitueMontant: 800 })))
      .not.toContain('dg-restitue-sans-date');
  });

  it('aucune restitution du tout : ni l’une ni l’autre', () => {
    const t = evs(bailDG({}));
    expect(t).not.toContain('dg-restitue');
    expect(t).not.toContain('dg-restitue-sans-date');
  });

  it('le TRI garde une date, mais elle ne doit jamais devenir un affichage', () => {
    // AUDIT DE RETRAIT (IMPORTANT 1) — `dateTri` vaut toujours quelque chose (au besoin la date
    // de signature) : c'est ce qui ordonne le rail. L'écran l'affichait dans la gouttière pour
    // TOUS les événements, ce qui redonnait la date fabriquée que la carte venait de retirer.
    // La règle testable côté module : l'événement sans date le dit par `ev.date === undefined`,
    // et `dateTri` ne lui ressemble en rien. L'écran s'appuie là-dessus (`_hlGouttiere`).
    const r = construire(bailDG({ dgRestitueAt: '', dgRestitueMontant: 800 }));
    const item = r.chapitres.flatMap((c) => c.rail)
      .find((x) => x.kind === 'evenement' && x.ev.type === 'dg-restitue-sans-date');
    expect(item.ev.date).toBeUndefined();
    expect(item.dateTri).toBe('2024-01-01');      // = la SIGNATURE : à trier, pas à montrer
  });
});
