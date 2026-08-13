import { describe, it, expect } from 'vitest';
import { canCreateLogement } from './parcours-bien-model.js';

describe('canCreateLogement — Identité obligatoire (décision user 2026-07-11)', () => {
  const full = { ref: 'F-102', typeUsage: 'habitation-nu', entity: 'SCI du Château', imm: '12 rue du Château' };
  it('accepte quand les 4 champs requis sont présents', () => {
    expect(canCreateLogement(full)).toEqual({ ok: true, missing: [] });
  });
  it('refuse si la référence manque', () => {
    const r = canCreateLogement({ ...full, ref: '  ' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('ref');
  });
  it('refuse si le type d’usage manque', () => {
    expect(canCreateLogement({ ...full, typeUsage: '' }).missing).toContain('typeUsage');
  });
  it('refuse si l’entité ou l’immeuble manque', () => {
    const r = canCreateLogement({ ...full, entity: '', imm: '' });
    expect(r.missing).toEqual(expect.arrayContaining(['entity', 'imm']));
  });
  it('tolère null/undefined en entrée', () => {
    expect(canCreateLogement(null).ok).toBe(false);
  });
});

import { logementCompleteness, immeubleCompleteness } from './parcours-bien-model.js';

describe('logementCompleteness', () => {
  const base = { ref: 'F-102', typeUsage: 'habitation-nu', entity: 'SCI', imm: '12 rue' };
  it('a-completer quand seule l’identité est remplie (onglets optionnels vides)', () => {
    const r = logementCompleteness(base);
    expect(r.level).toBe('a-completer');
    expect(r.missing).toEqual(expect.arrayContaining(['surface', 'loyer', 'dpe']));
  });
  it('complet quand identité + surface + loyer + dpe sont remplis', () => {
    const r = logementCompleteness({ ...base, surface: 44, loyer: 508, dpe: 'D' });
    expect(r.level).toBe('complet');
    expect(r.missing).toEqual([]);
  });
  it('a-completer (jamais complet) si l’identité manque', () => {
    expect(logementCompleteness({ surface: 44, loyer: 508, dpe: 'D' }).level).toBe('a-completer');
  });
});

describe('immeubleCompleteness', () => {
  it('complet dès qu’une adresse est présente', () => {
    expect(immeubleCompleteness({ nom: '12 rue', adr: '12 rue du Château' }).level).toBe('complet');
  });
  it('a-completer sans adresse', () => {
    expect(immeubleCompleteness({ nom: '12 rue', adr: '' }).level).toBe('a-completer');
  });
});

import { buildParcoursTree, parcoursSummary } from './parcours-bien-model.js';

describe('buildParcoursTree', () => {
  const entite = { id: 1, nom: 'SCI du Château', immeubles: [
    { id: 11, nom: '12 rue du Château', adr: '12 rue du Château' },
    { id: 12, nom: '5 av. Gare', adr: '' },
  ]};
  const logements = [
    { ref: 'F-102', entity: 'SCI du Château', imm: '12 rue du Château', surface: 44, loyer: 508, dpe: 'D' },
    { ref: 'F-103', entity: 'SCI du Château', imm: '12 rue du Château' },
    { ref: 'X-1',  entity: 'Autre SCI',      imm: 'ailleurs' },
    { ref: 'Z-9',  entity: 'SCI du Château', imm: 'immeuble fantôme' },
  ];
  it('groupe les logements du bailleur sous ses immeubles', () => {
    const tree = buildParcoursTree(entite, logements);
    expect(tree.bailleur.nom).toBe('SCI du Château');
    const imm1 = tree.immeubles.find((i) => i.nom === '12 rue du Château');
    expect(imm1.logements.map((l) => l.ref)).toEqual(['F-102', 'F-103']);
    expect(imm1.completeness.level).toBe('complet');
    expect(imm1.logements[0].completeness.level).toBe('complet');
    expect(imm1.logements[1].completeness.level).toBe('a-completer');
  });
  it('inclut les immeubles sans logement', () => {
    const tree = buildParcoursTree(entite, logements);
    const imm2 = tree.immeubles.find((i) => i.nom === '5 av. Gare');
    expect(imm2.logements).toEqual([]);
    expect(imm2.completeness.level).toBe('a-completer');
  });
  it('range les logements à immeuble inconnu dans « — Sans immeuble — »', () => {
    const tree = buildParcoursTree(entite, logements);
    const orphan = tree.immeubles.find((i) => i.nom === '— Sans immeuble —');
    expect(orphan.logements.map((l) => l.ref)).toEqual(['Z-9']);
    expect(orphan.synthetic).toBe(true);
  });
  it('exclut les logements d’un autre bailleur', () => {
    const tree = buildParcoursTree(entite, logements);
    const allRefs = tree.immeubles.flatMap((i) => i.logements.map((l) => l.ref));
    expect(allRefs).not.toContain('X-1');
  });
});

describe('parcoursSummary', () => {
  it('compte immeubles (réels) et logements, et liste les logements à louer', () => {
    const entite = { id: 1, nom: 'SCI', immeubles: [{ id: 11, nom: 'A', adr: 'a' }] };
    const logements = [
      { ref: 'A-1', entity: 'SCI', imm: 'A', locataire: '' },
      { ref: 'A-2', entity: 'SCI', imm: 'A', locataire: 'Dupont' },
    ];
    const s = parcoursSummary(buildParcoursTree(entite, logements));
    expect(s.nbImmeubles).toBe(1);
    expect(s.nbLogements).toBe(2);
    expect(s.logementsALouer.map((l) => l.ref)).toEqual(['A-1']);
  });
});

import { identiteParcours, isRentable } from './parcours-bien-model.js';

describe('identiteParcours — garde bloquante du fil rouge (mockup validé, décision user 2026-07-15)', () => {
  const full = { ref: 'F-102', type: 'T2', surface: 44, loyer: 508 };
  it('ok quand réf + type + surface + loyer sont présents', () => {
    expect(identiteParcours(full)).toEqual({ ok: true, missing: [] });
  });
  it('refuse si le type manque', () => {
    const r = identiteParcours({ ...full, type: ' ' });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['type']);
  });
  it('refuse surface vide ou 0 (0 m² = manquant)', () => {
    expect(identiteParcours({ ...full, surface: '' }).missing).toContain('surface');
    expect(identiteParcours({ ...full, surface: 0 }).missing).toContain('surface');
  });
  it('refuse loyer vide ou 0', () => {
    expect(identiteParcours({ ...full, loyer: 0 }).missing).toContain('loyer');
  });
  it('liste TOUS les manquants (message d’alerte complet)', () => {
    const r = identiteParcours({ ref: 'F-102' });
    expect(r.missing).toEqual(['type', 'surface', 'loyer']);
  });
  it('tolère null en entrée', () => {
    expect(identiteParcours(null).ok).toBe(false);
  });
});

import { completionModel } from './parcours-bien-model.js';

const ENT2 = { id: 'e1', nom: 'SCI DK', gerants: [], gerant: '', emailEnvoi: '', iban: '' };
const IMM2 = { id: 'i1', nom: '16 rue des Tilleuls', adr: '16 rue des Tilleuls', ville: 'Mulhouse', annee: 0, valeurEstimee: 0, equipementsCommuns: { customs: [] } };
const LOGS2 = [
  { ref: 'A', imm: '16 rue des Tilleuls', type: 'T2', surf: 34, hc: 650, numFiscal: '', dpe: null },          // occupé bail repris
  { ref: 'B', imm: '16 rue des Tilleuls', type: 'T1', surf: 28, hc: 500, numFiscal: '', dpe: null },          // vacant louable
  { ref: 'C', imm: '16 rue des Tilleuls', type: '',   surf: 0,  hc: 0,   numFiscal: '', dpe: null, vacantAssume: true }, // vacant assumé
];
const BAUX2 = { A: { ref: 'A', source: { import: 'acte' }, reprisVerifie: false } };

describe('completionModel', () => {
  const m = completionModel({ entite: ENT2, immeuble: IMM2, logements: LOGS2, bauxActifs: BAUX2 });
  it('nœuds = bailleur, immeuble, puis chaque logement (ordre du fil)', () => {
    expect(m.nodes.map(n => n.kind)).toEqual(['ent', 'imm', 'log', 'log', 'log']);
  });
  it('bailleur : identité done (nom posé), gérant/coordonnées/IBAN todo', () => {
    const t = m.nodes[0].tasks;
    expect(t.find(x => x.id === 'identite').status).toBe('done');
    expect(t.find(x => x.id === 'gerant').status).toBe('todo');
    expect(t.find(x => x.id === 'iban').status).toBe('todo');
  });
  it("immeuble : adresse done, année/valeur/équipements todo", () => {
    const t = m.nodes[1].tasks;
    expect(t.find(x => x.id === 'adresse').status).toBe('done');
    expect(t.find(x => x.id === 'annee').status).toBe('todo');
  });
  it('log A (bail repris non vérifié) : tâche bail = warn verifier-repris', () => {
    const t = m.nodes[2].tasks.find(x => x.id === 'bail');
    expect(t.status).toBe('warn');
    expect(t.action).toBe('verifier-repris');
  });
  it('log B (vacant louable) : tâche bail = todo creer-bail ; numFiscal = warn', () => {
    const t = m.nodes[3].tasks.find(x => x.id === 'bail');
    expect(t.status).toBe('todo');
    expect(t.action).toBe('creer-bail');
    expect(m.nodes[3].tasks.find(x => x.id === 'numFiscal').status).toBe('warn');
  });
  it('log C (vacantAssume) : tâche bail done, mais caractéristiques todo (type/surface vides)', () => {
    expect(m.nodes[4].tasks.find(x => x.id === 'bail').status).toBe('done');
    expect(m.nodes[4].tasks.find(x => x.id === 'caracteristiques').status).toBe('todo');
  });
  it('pct global cohérent (done/total, arrondi) et badges', () => {
    const done = m.nodes.flatMap(n => n.tasks).filter(t => t.status === 'done').length;
    const tot = m.nodes.flatMap(n => n.tasks).length;
    expect(m.pct).toBe(Math.round(done / tot * 100));
    expect(m.nodes[2].badge).toBe('loue');
    expect(m.nodes[3].badge).toBe('vac');
  });
  // MIGRATION 13/08 (2 paliers) : la tâche `dpe` lue depuis `l.dpe` (tolérance legacy
  // chaîne / objet {classe|lettre|note}) est remplacée par `dpeLouable`, alimentée par
  // l'INJECTION `dpeParLot` — c'est l'appelant qui résout la classe ET l'interdiction de
  // louer (calendrier loi Climat, inline index.html, inaccessible à un module pur).
  it('plus de tâche `dpe` lue du logement : la classe arrive par injection (dpeParLot)', () => {
    const r = completionModel({ entite: ENT2, immeuble: IMM2, logements: [{ ...LOGS2[0], dpe: 'D' }], bauxActifs: BAUX2 });
    expect(r.nodes[2].tasks.find(x => x.id === 'dpe')).toBe(undefined);
    expect(r.nodes[2].tasks.find(x => x.id === 'dpeLouable').status).toBe('todo'); // pas d'injection ⇒ todo
    const inj = completionModel({ entite: ENT2, immeuble: IMM2, logements: [LOGS2[0]], bauxActifs: BAUX2,
      dpeParLot: { A: { classe: 'D', interdit: false, raison: '' } } });
    expect(inj.nodes[2].tasks.find(x => x.id === 'dpeLouable').status).toBe('done');
  });
  // `full` = palier LÉGAL complet (décision user 13/08) : ici le confort reste vide
  // (IBAN, syndic, photos…), donc `pct` global < 100 alors que le légal est à 100 %.
  it('bail repris vérifié + tout le LÉGAL rempli ⇒ nœuds full et pctLegal 100', () => {
    const full = completionModel({
      entite: { ...ENT2, gerant: 'D. Keller', siege: '1 rue Y', emailEnvoi: 'x@y.z', iban: 'FR76...' },
      immeuble: { ...IMM2, annee: 1971, regimeJuridique: 'copro', valeurEstimee: 285000, equipementsCommuns: { customs: [], ascenseur: true } },
      logements: [{ ...LOGS2[0], numFiscal: '123' }],
      bauxActifs: { A: { ref: 'A', source: { import: 'acte' }, reprisVerifie: true } },
      diagsParLot: { A: { requis: [{ key: 'dpe', label: 'DPE' }], indetermines: [], fournis: ['dpe'] } },
      dpeParLot: { A: { classe: 'D', interdit: false, raison: '' } },
    });
    expect(full.pctLegal).toBe(100);
    expect(full.pct).toBeLessThan(100);
    expect(full.nodes.every(n => n.full)).toBe(true);
  });
});

// Décision user 13/08 : le fil rouge sépare les OBLIGATIONS LÉGALES (« il faut que le légal
// soit en place », chaque tâche porte sa source) du confort de gestion. Le module reste PUR :
// le catalogue de diagnostics et le calendrier d'interdiction DPE (inline index.html) lui sont
// INJECTÉS par l'appelant via `diagsParLot` / `dpeParLot`.
describe('completionModel — 2 paliers (légal / confort)', () => {
  const ENT = { id:'e1', nom:'SCI T', gerants:[], gerant:'', siege:'', emailEnvoi:'', iban:'' };
  const IMM = { id:'i1', nom:'12 rue X', adr:'12 rue X', ville:'Ferrette', annee:0, valeurEstimee:0, regimeJuridique:'', equipementsCommuns:{customs:[]} };
  const LOG = { ref:'F-102', imm:'12 rue X', type:'T2', surf:44, hc:508, numFiscal:'', dpe:null };
  const base = { entite:ENT, immeuble:IMM, logements:[LOG], bauxActifs:{},
    diagsParLot:{ 'F-102': { requis:[{key:'dpe',label:'DPE'},{key:'erp',label:'ERP'}], indetermines:[{key:'amiante',label:'Amiante',cause:'annee'}], fournis:[] } },
    dpeParLot:{ 'F-102': { classe:'', interdit:false, raison:'' } } };

  it('chaque tâche porte un palier legal|confort', () => {
    const m = completionModel(base);
    const all = m.nodes.flatMap(n => n.tasks);
    expect(all.every(t => t.palier === 'legal' || t.palier === 'confort')).toBe(true);
  });
  it('le palier légal contient exactement les tâches validées', () => {
    const m = completionModel(base);
    const legal = id => m.nodes.flatMap(n => n.tasks).find(t => t.id === id).palier;
    ['identite','gerant','siege','adresse','annee','regime','caracteristiques','diagnostics','dpeLouable','numFiscal','bail']
      .forEach(id => expect(legal(id)).toBe('legal'));
    ['iban','coordonnees','rcsCapital','signatureLogo','syndic','equipements','valeur','surfaceTotale',
     'chauffageEcs','tantiemes','etage','annexes','mobilier','photos'].forEach(id => expect(legal(id)).toBe('confort'));
  });
  it('les tâches légales portent une source, jamais les tâches confort', () => {
    const m = completionModel(base);
    const all = m.nodes.flatMap(n => n.tasks);
    expect(all.filter(t => t.palier==='legal' && t.id!=='bail').every(t => !!t.src)).toBe(true);
    expect(all.filter(t => t.palier==='confort').every(t => !t.src)).toBe(true);
  });
  it('pctLegal ne compte QUE le palier légal (le confort ne le fait pas baisser)', () => {
    const m = completionModel(base);
    const L = m.nodes.flatMap(n => n.tasks).filter(t => t.palier === 'legal');
    expect(m.pctLegal).toBe(Math.round(L.filter(t=>t.status==='done').length / L.length * 100));
    expect(m.pct).not.toBe(undefined);
  });
  it('nœud « full » = palier légal complet (le confort restant n\'empêche pas le vert)', () => {
    const m = completionModel({ ...base, entite:{ ...ENT, gerant:'D. K.', siege:'1 rue Y' } });
    const nEnt = m.nodes.find(n => n.kind === 'ent');
    expect(nEnt.tasks.filter(t=>t.palier==='confort').some(t=>t.status!=='done')).toBe(true);
    expect(nEnt.full).toBe(true);
  });
  it('diagnostics : done seulement si tous les requis sont fournis ; détail des indéterminés exposé', () => {
    const m = completionModel(base);
    const d = m.nodes.flatMap(n=>n.tasks).find(t => t.id === 'diagnostics');
    expect(d.status).toBe('todo');
    expect(d.diags.requis.map(x=>x.key)).toEqual(['dpe','erp']);
    expect(d.diags.indetermines[0].cause).toBe('annee');
    const ok = completionModel({ ...base, diagsParLot:{ 'F-102': { requis:[{key:'dpe',label:'DPE'}], indetermines:[], fournis:['dpe'] } } });
    expect(ok.nodes.flatMap(n=>n.tasks).find(t=>t.id==='diagnostics').status).toBe('done');
  });
  it('DPE louable : interdit ⇒ warn + raison ; classe saine ⇒ done ; classe absente ⇒ todo', () => {
    const ko = completionModel({ ...base, dpeParLot:{ 'F-102': { classe:'G', interdit:true, raison:'DPE G interdit…' } } });
    const t = ko.nodes.flatMap(n=>n.tasks).find(x=>x.id==='dpeLouable');
    expect(t.status).toBe('warn'); expect(t.detail).toContain('interdit');
    const ok = completionModel({ ...base, dpeParLot:{ 'F-102': { classe:'D', interdit:false, raison:'' } } });
    expect(ok.nodes.flatMap(n=>n.tasks).find(x=>x.id==='dpeLouable').status).toBe('done');
  });
  it('entrées d\'injection absentes ⇒ pas de crash (diagnostics/DPE en todo)', () => {
    const m = completionModel({ entite:ENT, immeuble:IMM, logements:[LOG], bauxActifs:{} });
    expect(m.nodes.flatMap(n=>n.tasks).find(t=>t.id==='diagnostics').status).toBe('todo');
    expect(m.pctLegal).toBeGreaterThanOrEqual(0);
  });
  // « Pas d'injection » ≠ « injection vide » : sans entrée pour le lot on ne peut RIEN
  // affirmer (todo), mais si l'injecteur répond « aucun diagnostic exigé pour ce bien »
  // la tâche doit pouvoir se clore — sinon elle resterait todo à vie.
  it('diagnostics : injection PRÉSENTE mais vide (rien à annexer) ⇒ done', () => {
    const m = completionModel({ ...base, diagsParLot:{ 'F-102': { requis:[], indetermines:[], fournis:[] } } });
    const d = m.nodes.flatMap(n=>n.tasks).find(t=>t.id==='diagnostics');
    expect(d.status).toBe('done');
    expect(d.diags).toEqual({ requis:[], indetermines:[], fournis:[] });
  });
  it('diagnostics : injection ABSENTE pour ce lot ⇒ todo (on ne peut rien affirmer)', () => {
    const m = completionModel({ ...base, diagsParLot:{ 'AUTRE-LOT': { requis:[], indetermines:[], fournis:[] } } });
    expect(m.nodes.flatMap(n=>n.tasks).find(t=>t.id==='diagnostics').status).toBe('todo');
  });
});

// Faux positifs du palier confort (vus en vérif navigateur 13/08) : la migration de l'app
// pré-remplit des SQUELETTES vides (`{elec:false,…}`, `{cave:{present:false},…}`). Une clé
// présente ou un sous-objet truthy ne valent pas saisie.
describe('completionModel — squelettes de migration vides ≠ saisie (palier confort)', () => {
  const ENT = { id:'e1', nom:'SCI T' };
  const IMM = { id:'i1', nom:'12 rue X', adr:'12 rue X', ville:'Ferrette', equipementsCommuns:{customs:[]} };
  const CHAUF_VIDE = { elec:false, gaz:false, coll:false, pac:false, fioul:false, bois:false,
    poeleBois:false, poeleGran:false, insert:false, cheminee:false, clim:false, autre:'', label:'' };
  const ECS_VIDE = { elec:false, gaz:false, coll:false, thermo:false, solaire:false, fioul:false, autre:'', label:'' };
  const ANX_VIDE = { cave:{present:false,num:''}, grenier:{present:false,num:''},
    parking:{present:false,num:'',type:'place'}, garage:{present:false,num:''},
    buanderie:{present:false,num:''}, cellier:{present:false,num:''},
    localVelos:{present:false,num:''}, atelier:{present:false,num:''}, customs:[] };
  const mk = (log) => {
    const m = completionModel({ entite:ENT, immeuble:IMM, bauxActifs:{},
      logements:[{ ref:'F-102', imm:'12 rue X', type:'T2', surf:44, hc:508, ...log }] });
    return (id) => m.nodes.flatMap(n=>n.tasks).find(t=>t.id===id).status;
  };
  it('chauffage/ECS : squelette tout à false ⇒ todo ; une seule valeur vraie ⇒ done', () => {
    expect(mk({ chauffage: CHAUF_VIDE, ecs: ECS_VIDE })('chauffageEcs')).toBe('todo');
    expect(mk({ chauffage: { ...CHAUF_VIDE, gaz:true }, ecs: ECS_VIDE })('chauffageEcs')).toBe('done');
    expect(mk({ chauffage: CHAUF_VIDE, ecs: { ...ECS_VIDE, label:'Ballon électrique' } })('chauffageEcs')).toBe('done');
  });
  it('annexes : squelette {present:false} ⇒ todo ; une annexe présente ou un custom ⇒ done', () => {
    expect(mk({ annexes: ANX_VIDE })('annexes')).toBe('todo');
    expect(mk({ annexes: { ...ANX_VIDE, cave:{present:true,num:'3'} } })('annexes')).toBe('done');
    expect(mk({ annexes: { ...ANX_VIDE, customs:['Box vélos'] } })('annexes')).toBe('done');
  });
});

describe('isRentable — un logement ne propose « Créer le bail » que si son identité louable est complète (mockup)', () => {
  it('louable : réf + type + surface + loyer présents', () => {
    expect(isRentable({ ref: 'F-102', type: 'T2', surface: 44, loyer: 508 })).toBe(true);
  });
  it('pas louable sans loyer (ou loyer 0)', () => {
    expect(isRentable({ ref: 'F-102', type: 'T2', surface: 44, loyer: 0 })).toBe(false);
    expect(isRentable({ ref: 'F-102', type: 'T2', surface: 44 })).toBe(false);
  });
  it('pas louable sans type ou sans surface', () => {
    expect(isRentable({ ref: 'F-102', surface: 44, loyer: 508 })).toBe(false);
    expect(isRentable({ ref: 'F-102', type: 'T2', loyer: 508 })).toBe(false);
  });
  it('le DPE n’entre PAS dans la louabilité (il joue sur le badge complet, pas sur le bail)', () => {
    expect(isRentable({ ref: 'F-102', type: 'T2', surface: 44, loyer: 508, dpe: '' })).toBe(true);
  });
  it('tolère null', () => {
    expect(isRentable(null)).toBe(false);
  });
});
