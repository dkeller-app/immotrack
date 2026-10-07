/**
 * FINANCES-SUIVI-UNIQUE P5 — l'onglet Loyers, les relances, les quittances, la fiche logement et la
 * restitution du dépôt lisent LE MÊME moteur que Finances (js/core/suivi-loyers.js).
 *
 *  1. Adaptateur `versEtatLot` : la forme etatMoisLot d'un LOT, bail par bail, sans recalcul.
 *  2. I-g : relance = carte de la fenêtre avance / retard = bulle Impayés, au centime (cas Arslan
 *     + 320 lots aléatoires à graine fixe).
 *  3. Quittance « remise accordée » (décision Q1) : le texte du document, exécuté depuis l'app.
 *  4. Restitution du dépôt (acte opposable) : chiffres de non-régression, sans double compte de la
 *     retenue sur dépôt.
 *  5. Câblage : plus aucun appel à l'ancien moteur hors adaptateur.
 * Conception : docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md §B (adaptateurs), §E.2, §I (Q1, Q2).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as SL from '../../js/core/suivi-loyers.js';
import { retardLot, lignesRelance, peutQuittancer, datePaiementMois, mentionDateRecu, moisAQuittancer, ymToMoisFr } from '../../js/core/loyers-mois.js';
import { _calculerSoldeDG } from '../../js/core/gestion-dg-impayes.js';
import { moisRailLot } from '../../js/core/quittance-editeur.js';
import { lotArslan, TODAY_ARSLAN, CLE_ANCIEN, CLE_ARSLAN, prng, lotAleatoire, vir } from './suivi-loyers-fixtures.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace(/\r/g, '');
const extrait = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  const j = html.indexOf('\n}', i);
  if (i < 0 || j < 0) throw new Error(nom + ' introuvable');
  return html.slice(i, j + 2);
};
const r2 = (n) => Math.round(n * 100) / 100;
const GRACE = { today: TODAY_ARSLAN, graceLast: true, seuilArrondi: 1 };    // le 05/10 : tolérance du 10 (Finances)
const STRICT = { today: TODAY_ARSLAN, graceLast: false, seuilArrondi: 1 };  // quittances (D6, au centime)

// ── 1. Adaptateur ─────────────────────────────────────────────────────────────────────
describe('P5 — versEtatLot : la forme etatMoisLot d\'un lot, lue dans le suivi', () => {
  it('Ferrette - 101 : l\'onglet Loyers affiche 20 € (charges d\'août), plus 1 723,01', () => {
    const s = SL.suiviLot(lotArslan(), GRACE);
    const e = SL.versEtatLot(s, { baux: 'visibles' });
    const r = retardLot(e, { toleranceActive: false });
    expect(r.reste).toBe(20);
    expect(r.chargesSeules).toBe(true);
    expect(r.depuisYm).toBe('2026-08');
    expect(e.baux).toEqual([CLE_ARSLAN]);                  // l'ancien bail (sorti, soldé) n'est plus montré
    expect(r.reste).toBe(s.mois['2026-10'].retard);        // = la case de Finances
  });
  it('« tous » garde les mois de l\'ancien locataire (quittançables) ; chaque ligne dit son bail', () => {
    const e = SL.versEtatLot(SL.suiviLot(lotArslan(), STRICT));
    expect(e.byYm['2026-03'].bailCle).toBe(CLE_ANCIEN);
    expect(e.byYm['2026-03'].solde).toBe(true);
    // avril : 303,33 dus, 303 retenus sur le dépôt, 0,33 soldés par l'arrondi → quittançable
    expect(peutQuittancer(e, '2026-04').ok).toBe(true);
    expect(e.byYm['2026-04'].reglements).toEqual([{ date: '2026-04-13', kind: 'dg', montant: 303, poste: 'loyer' }]);
    expect(e.byYm['2026-05'].bailCle).toBe(CLE_ARSLAN);
    // pas de mois avant le début du suivi (1er loyer encaissé : mars), plus de janvier/février fantômes
    expect(e.byYm['2026-01']).toBeUndefined();
    expect(e.byYm['2026-02']).toBeUndefined();
  });
  it('sans tolérance, le mois courant non payé n\'est jamais soldé (D6)', () => {
    const lot = lotArslan();
    lot.paiements = lot.paiements.filter((p) => p.id !== 'v7');   // octobre pas encore payé
    expect(peutQuittancer(SL.versEtatLot(SL.suiviLot(lot, STRICT)), '2026-10').ok).toBe(false);
  });
  it('mois de transition (sortie et entrée le même mois) : Σ des deux baux, chaque date gardée', () => {
    const lot = {
      ref: 'T', bareme: [], manques: [],
      baux: [
        { cle: 'T|2026-01-01', debut: '2026-01-01', fin: null, finEffective: '2026-03-15', archive: true, hc: 620, ch: 0, noms: 'A' },
        { cle: 'T|2026-03-16', debut: '2026-03-16', fin: null, finEffective: null, archive: false, hc: 620, ch: 0, noms: 'B' }
      ],
      paiements: [vir('a1', '2026-01-03', 620), vir('a2', '2026-02-03', 620), vir('a3', '2026-03-03', 300), vir('b1', '2026-03-17', 320)]
    };
    const e = SL.versEtatLot(SL.suiviLot(lot, { today: '2026-03-20', seuilArrondi: 1 }));
    const m = e.byYm['2026-03'];
    expect(m.baux).toEqual(['T|2026-01-01', 'T|2026-03-16']);
    expect(m.du).toBe(620);
    expect(m.solde).toBe(true);
    expect(m.datesVersements).toEqual(['2026-03-03', '2026-03-17']);
    expect(m.datePaiement).toBe('2026-03-17');
  });
});

// ── 2. I-g : relance = carte = bulle Impayés ─────────────────────────────────────────────
describe('P5 — I-g : la relance annonce le montant de la carte, au centime', () => {
  it('Elise (Ferrette - 101) : relance 20,00 € = carte d\'août, de septembre, d\'octobre = bulle', () => {
    const s = SL.suiviLot(lotArslan(), GRACE);
    const sb = s.baux.find((b) => b.cle === CLE_ARSLAN);
    const lignes = SL.lignesRelanceBail(sb, { toleranceActive: false });
    expect(lignes).toEqual([{ ym: '2026-08', mois: 'août 2026', libelle: 'Provisions sur charges — août 2026', montant: 20 }]);
    const total = r2(lignes.reduce((t, l) => t + l.montant, 0));
    for (const ym of ['2026-08', '2026-09', '2026-10']) {
      const carte = SL.suiviPerimetre([s], ym).enRetard.find((c) => c.bailCle === CLE_ARSLAN);
      expect(-carte.solde).toBe(total);
    }
    expect(SL.versByLot(s, 2026).annual.retard).toBe(total);              // la bulle Impayés (byLot)
    expect(retardLot(SL.versEtatMoisLot(sb), { toleranceActive: false }).reste).toBe(total);   // le total de la lettre
  });
  it('geste « accepter le manque » : la carte passe à 0 et il n\'y a plus rien à réclamer', () => {
    const s = SL.suiviLot(lotArslan({ geste: true }), GRACE);
    const sb = s.baux.find((b) => b.cle === CLE_ARSLAN);
    expect(SL.lignesRelanceBail(sb, { toleranceActive: false })).toEqual([]);
    expect(SL.suiviPerimetre([s], '2026-10').enRetard).toEqual([]);
  });
  it('dette ancienne (§C.3) : la relance réclame les 122 € de février, comme la carte de juillet', () => {
    const lot = {
      ref: 'C3', bareme: [], manques: [],
      baux: [{ cle: 'C3|2026-01-01', debut: '2026-01-01', fin: null, finEffective: null, archive: false, hc: 650, ch: 10, noms: 'C' }],
      paiements: [vir('j', '2026-01-02', 660), vir('f', '2026-02-02', 538)].concat(['03', '04', '05', '06', '07'].map((m) => vir('m' + m, '2026-' + m + '-02', 660)))
    };
    const s = SL.suiviLot(lot, { today: '2026-07-20', seuilArrondi: 1 });
    const sb = s.baux[0];
    const lignes = SL.lignesRelanceBail(sb, { toleranceActive: false });
    expect(lignes.map((l) => [l.ym, l.montant])).toEqual([['2026-02', 112], ['2026-02', 10]]);
    expect(-SL.suiviPerimetre([s], '2026-07').enRetard[0].solde).toBe(122);
  });
  it('320 lots aléatoires : pour chaque bail montré en retard, relance = carte = position ; Σ = case = onglet Loyers', () => {
    const rnd = prng(0x5E1A);
    let baux = 0;
    for (let n = 0; n < 320; n++) {
      const { lot, today } = lotAleatoire(rnd, n);
      const s = SL.suiviLot(lot, { today, graceLast: rnd() < 0.5, seuilArrondi: 1 });
      const ym = s.dueYm;
      const lm = s.mois[ym];
      if (!lm) continue;
      const P = SL.suiviPerimetre([s], ym);
      let somme = 0;
      for (const cle of lm.bauxActifs.concat(lm.partis)) {
        const sb = s.baux.find((b) => b.cle === cle);
        const dette = r2(sb.position.retardLoyer + sb.position.retardCharge);
        const relance = r2(SL.lignesRelanceBail(sb, { toleranceActive: false }).reduce((t, l) => t + l.montant, 0));
        expect(relance).toBe(dette);
        if (dette > 0.005) {
          const carte = P.enRetard.find((c) => c.bailCle === cle);
          expect(carte && r2(-carte.solde)).toBe(dette);
          baux++;
        }
        somme += dette;
      }
      expect(r2(somme)).toBe(lm.retard);
      expect(retardLot(SL.versEtatLot(s, { baux: 'visibles' }), { toleranceActive: false }).reste).toBe(lm.retard);
    }
    expect(baux).toBeGreaterThan(150);
  });
});

// ── 3. Quittance « remise accordée » (Q1) ─────────────────────────────────────────────────
describe('P5 — quittance d\'un mois soldé par un manque accepté (Q1)', () => {
  const etatGeste = SL.versEtatLot(SL.suiviLot(lotArslan({ geste: true }), STRICT));
  const etatSans = SL.versEtatLot(SL.suiviLot(lotArslan(), STRICT));

  it('août devient quittançable, la remise est portée par le mois qu\'elle solde', () => {
    expect(peutQuittancer(etatSans, '2026-08').ok).toBe(false);
    expect(peutQuittancer(etatGeste, '2026-08').ok).toBe(true);
    expect(moisAQuittancer(etatGeste, [])).toContain('2026-08');
    expect(etatGeste.byYm['2026-08'].remise).toEqual({ montant: 20, loyer: 0, charge: 20, motif: 'panne électrique' });
    for (const ym of Object.keys(etatGeste.byYm)) if (ym !== '2026-08') expect(etatGeste.byYm[ym].remise).toBeUndefined();
    expect(Object.values(etatSans.byYm).some((m) => m.remise)).toBe(false);
    expect(datePaiementMois(etatGeste, '2026-08').date).toBe('2026-08-05');
  });

  // Exécute la VRAIE fabrique et le VRAI gabarit de l'app (extraits d'index.html), dépendances
  // d'affichage remplacées par des doubles minimaux.
  const fabrique = () => new Function('DB', 'window', '_findBailByRefTolerant', '_duMoisLot', 'nid', 'td', '_stamp', '_auditLog', '_loyerEtatLot',
    `${extrait('_quitRemiseDuMois')}\n${extrait('_creerQuittance')}\nreturn _creerQuittance;`);
  const fmt = (n) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  const _dt = (k, v) => Array.isArray(v) ? v.filter(Boolean).map((x) => (x.lab || x.label || '') + ' | ' + (x.val || x.qui || '') + (x.corps ? ' ' + x.corps : '')).join('\n') : String(v);
  const gabarit = (etat) => new Function('window', 'MOIS_FR', 'fmt', 'fd', 'escHtml', 'numToWords', '_dt', '_docSigOnly', '_docCss', '_docPage', 'td', '_qeMeta', '_duMoisLot', '_loyerEtatLot',
    `${extrait('_loyerPayeDuMois')}\n${extrait('_quitTotal')}\n${extrait('_buildQuittanceHtml')}\nreturn _buildQuittanceHtml;`)(
    { datePaiementMois, mentionDateRecu },
    ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    fmt, (iso) => String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4),
    (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    (n) => '[' + n + ' en lettres]', _dt, () => '', () => '', (ent, o) => o.titre + '\n' + o.ctx + '\n' + o.corps,
    () => '2026-10-05', () => null, () => ({ hc: 760, ch: 20 }), () => etat);

  const emettre = (etat) => {
    const DB = { quittances: [], logements: [{ ref: 'Ferrette - 101', locataire: 'Elise ARSLAN', entity: 'SCI' }] };
    const creer = fabrique()(DB, { peutQuittancer, ymToMoisFr }, () => ({ locataires: [{ nom: 'Elise ARSLAN' }], entity: 'SCI' }),
      () => ({ hc: 760, ch: 20 }), () => 'q1', () => '2026-10-05', () => {}, () => {}, () => etat);
    return { r: creer('Ferrette - 101', '2026-08'), DB };
  };

  it('la fabrique fige la remise sur la quittance (montant + motif), le dû reste celui du barème', () => {
    const { r } = emettre(etatGeste);
    expect(r.ok).toBe(true);
    expect(r.quittance).toMatchObject({ hc: 760, ch: 20, mois: 'août 2026', remise: { montant: 20, motif: 'panne électrique' } });
    expect(emettre(etatSans).r).toMatchObject({ ok: false });                // sans geste : non soldé, refusé
  });

  it('le document : 760 € reçus le 05/08/2026, « Remise accordée : 20,00 € (panne électrique) »', () => {
    const { r } = emettre(etatGeste);
    const b = gabarit(etatGeste)(r.quittance, { ref: 'Ferrette - 101', adr: '1 rue X' }, { nom: 'SCI' }, { locataires: [{ nom: 'Elise ARSLAN' }] });
    expect(b.status).toBe('complet');                                        // une QUITTANCE, pas un reçu partiel
    expect(b.html).toMatch(/^Quittance de loyer/);
    expect(b.html).toContain('déclare avoir reçu le 05/08/2026 du locataire, la somme de <b>760,00 €</b>');
    expect(b.html).toContain('Loyer | 760,00 €');
    expect(b.html).toContain('Charges | 20,00 €');
    expect(b.html).toContain('Remise accordée (panne électrique) | − 20,00 €');
    expect(b.html).toContain('Total des sommes payées | 760,00 €');
    expect(b.html).toContain('déduction faite de la remise accordée par le bailleur');
    expect(b.html).toContain('Remise accordée : 20,00 € (panne électrique).');
  });

  it('le rail de l\'éditeur et la fiche annoncent le montant du document (760, pas 780)', () => {
    const rail = moisRailLot(etatGeste, [], '2026', '2026-10');
    expect(rail.find((m) => m.ym === '2026-08')).toMatchObject({ etat: 'ok', du: 760, reste: 0 });
    expect(rail.find((m) => m.ym === '2026-09')).toMatchObject({ etat: 'ok', du: 780 });
    expect(moisRailLot(etatSans, [], '2026', '2026-10').find((m) => m.ym === '2026-08')).toMatchObject({ etat: 'no', du: 780, reste: 20 });
  });

  it('sans manque accepté : aucune mention de remise (septembre, 780 € reçus le 01/09)', () => {
    const q = { logement: 'Ferrette - 101', mois: 'septembre 2026', hc: 760, ch: 20, date: '2026-10-05' };
    const b = gabarit(etatGeste)(q, { ref: 'Ferrette - 101' }, { nom: 'SCI' }, {});
    expect(b.html).toContain('la somme de <b>780,00 €</b>');
    expect(b.html).not.toMatch(/[Rr]emise/);
  });

  it('le motif est échappé (texte libre saisi par l\'utilisateur)', () => {
    const q = { logement: 'Ferrette - 101', mois: 'août 2026', hc: 760, ch: 20, date: '2026-10-05', remise: { montant: 20, motif: '<img src=x>' } };
    const b = gabarit(etatGeste)(q, {}, {}, {});
    expect(b.html).not.toContain('<img');
    expect(b.html).toContain('&lt;img src=x&gt;');
  });
});

// ── 4. Restitution du dépôt de garantie ─────────────────────────────────────────────────
describe('P5 — restitution du dépôt : dette de loyer du bail, retenue jamais comptée deux fois', () => {
  const today = TODAY_ARSLAN;
  let W0;
  const installer = (lot) => {
    const s = SL.suiviLot(lot, GRACE);
    const rg = new Function('window', '_finSuiviLot', '_finSuiviLotIn', '_finSuiviToday', `${extrait('_rgClotureImpayes')}\nreturn _rgClotureImpayes;`)(
      { SuiviLoyers: SL, _loyerToleranceActive: () => true }, () => s, () => lot, () => today);
    globalThis.window = { SuiviLoyers: SL, _rgClotureImpayes: rg, td: () => today };
    return rg;
  };
  beforeAll(() => { W0 = globalThis.window; });
  afterAll(() => { if (W0 === undefined) delete globalThis.window; else globalThis.window = W0; });

  // Bail sorti du lot F-Local (export) reconstitué : 235 + 15, sorti le 31/08/2026, trois mois sans paiement.
  const lotSorti = (dg) => ({
    ref: 'F-Local', bareme: [], manques: [],
    baux: [Object.assign({ cle: 'F-Local|2026-01-01', debut: '2026-01-01', fin: '2028-12-31', finEffective: '2026-08-31', archive: true, hc: 235, ch: 15, noms: 'Sorti' }, dg ? { dg } : {})],
    paiements: ['01', '02', '03', '04', '05'].map((m) => vir('p' + m, '2026-' + m + '-03', 250))
  });

  it('ancien locataire d\'Elise : dépôt 700, autres retenues 150 → dette de loyer 303,33, à restituer 246,67', () => {
    installer(lotArslan());
    const bail = { ref: 'Ferrette - 101', debut: '2024-08-20', finEffective: '2026-04-13', dg: 700, dgRetenu: 150, dgRestitue: 247 };
    const r = _calculerSoldeDG(bail, []);
    // Le moteur compte avril 700 × 13/30 = 303,33 € (prorata au jour). La restitution réelle (247 €)
    // a retenu 303 € : 0,33 € d'écart, arrondi du bailleur (décision 2 : écart < 1 € soldé dans le suivi).
    expect(r).toEqual({ dgPaid: 700, retenuesDG: 150, loyerImpaye: 303.33, soldeRestitue: 246.67 });
    // Sans la restitution enregistrée (dépôt pas encore rendu) : MÊME chiffre — la retenue n'est pas comptée deux fois.
    const avant = lotArslan(); delete avant.baux[0].dg;
    installer(avant);
    expect(_calculerSoldeDG({ ...bail, dgRestitue: 0 }, []).loyerImpaye).toBe(303.33);
    // Et la dette de l'ancien locataire n'est jamais celle d'Elise (bail suivant, 20 € de charges).
    expect(SL.detteBailAvantDepot(lotArslan(), CLE_ARSLAN, GRACE)).toEqual({ loyer: 0, charge: 20, avance: 0 });
  });

  it('bail sorti avec impayé réel : 3 mois × 235 = 705 € de loyer (les 45 € de charges vont à la régul)', () => {
    installer(lotSorti());
    const bail = { ref: 'F-Local', debut: '2026-01-01', finEffective: '2026-08-31', dg: 1000, dgRetenu: 0 };
    expect(_calculerSoldeDG(bail, [])).toEqual({ dgPaid: 1000, retenuesDG: 0, loyerImpaye: 705, soldeRestitue: 295 });
    // Après la restitution (295 rendus, 705 retenus = règlement du bail pour le suivi) : la retenue
    // n'est PAS déduite une seconde fois — le solde reste 295, pas 1000 − 0 − 0.
    installer(lotSorti({ verse: 1000, retenuAutres: 0, restitue: 295, penalite: 0, date: '2026-08-31' }));
    // (Le suivi impute la retenue de 705 € dans l'ordre H-1 — loyer et charges d'août d'abord — : il
    // reste 45 € sur le bail, 15 de loyer de juillet + 30 de charges. Le solde du dépôt, lui, ne bouge pas.)
    const pos = SL.suiviLot(lotSorti({ verse: 1000, retenuAutres: 0, restitue: 295, penalite: 0, date: '2026-08-31' }), GRACE).baux[0].position;
    expect(r2(pos.retardLoyer + pos.retardCharge)).toBe(45);
    expect(_calculerSoldeDG({ ...bail, dgRestitue: 295 }, []).soldeRestitue).toBe(295);
  });

  it('bail sans impayé : dépôt − retenues, rien d\'autre', () => {
    const lot = lotSorti();
    lot.paiements = ['01', '02', '03', '04', '05', '06', '07', '08'].map((m) => vir('p' + m, '2026-' + m + '-03', 250));
    installer(lot);
    expect(_calculerSoldeDG({ ref: 'F-Local', debut: '2026-01-01', finEffective: '2026-08-31', dg: 500, dgRetenu: 80 }, []))
      .toEqual({ dgPaid: 500, retenuesDG: 80, loyerImpaye: 0, soldeRestitue: 420 });
  });
});

// ── 5. Câblage ────────────────────────────────────────────────────────────────────────
describe('P5 — câblage : un seul moteur, plus aucun appel à l\'ancien hors adaptateur', () => {
  it('l\'app n\'appelle plus etatMoisLot ; _loyerEtatLot lit le suivi de Finances via versEtatLot', () => {
    expect(html).not.toMatch(/window\.etatMoisLot\(/);
    const f = extrait('_loyerEtatLot');
    expect(f).toMatch(/_finSuiviLot\(ref, \{ graceLast: !!opts\.graceLast \}\)/);
    expect(f).toMatch(/SL\.versEtatLot\(s, \{ baux: vue \}\)/);
    expect(f).not.toMatch(/DB\.mouvements|_duMoisLot|_debutSuivi/);
  });
  it('les lecteurs du verdict passent tous par _loyerEtatLot (l\'adaptateur)', () => {
    for (const nom of ['_creerQuittance', '_buildQuittanceHtml', '_lyEtatLot', '_lyEditerQuittances', '_lyRecuPartiel', '_qeSetLot', '_qeRail', '_qeAPaiement', '_qeRender', '_qeRenderPickList', '_renderEtat12Mois', '_loyerPayeDuMois', '_quitRemiseDuMois']) {
      expect(extrait(nom), nom).toMatch(/_loyerEtatLot\(|_loyerPayeDuMois\(/);
    }
    expect(extrait('_lyEtatLot')).toMatch(/_loyerEtatLot\(l\.ref, \{ graceLast: !!tol, baux: 'visibles' \}\)/);
    expect(extrait('_lyEtatLot')).toMatch(/window\.retardLot\(etatRetard, \{ toleranceActive: false \}\)/);
  });
  it('relance par bail (lignesRelanceBail), courrier adressé au locataire du bail relancé', () => {
    const f = extrait('_lyRelance');
    expect(f).toMatch(/function _lyRelance\(ref, bailCle\)/);
    expect(f).toMatch(/SL\.lignesRelanceBail\(sb, \{ toleranceActive: false \}\)/);
    expect(f).not.toMatch(/_loyerEtatLot/);
    expect(f).toMatch(/_buildRelanceHtml\(ref, lignes, r, niveau, today, bailRel\)/);
    const fen = extrait('_finFenDetail');
    expect(fen).toMatch(/_lyRelance\(this\.dataset\.ref,this\.dataset\.cle\)/);
    // proposée tant que CE bail doit encore quelque chose aujourd'hui (la lettre réclame sa position)
    expect(fen).toMatch(/const _sb = _s && _s\.baux\.find\(b => b\.cle === x\.bailCle\);/);
    expect(fen).toMatch(/if \(_dette > 0\.005\) \{/);
  });
  it('quittance : fabrique, aperçu et réédition lisent la même remise (_quitRemiseDuMois)', () => {
    expect(extrait('_creerQuittance')).toMatch(/const remise = _quitRemiseDuMois\(ref, ym\);\n  if \(remise\) q\.remise = remise;/);
    expect(extrait('_qeInjecterDoc')).toMatch(/_quitRemiseDuMois\(_qe\.ref, m\.ym\)/);
    expect(extrait('_qeEditer')).toMatch(/if \(_rem\) r\.quittance\.remise = _rem; else delete r\.quittance\.remise;/);
    expect(extrait('_buildQuittanceHtml')).toMatch(/const total = _quitTotal\(q\);/);
  });
  it('restitution : _rgClotureImpayes → detteBailAvantDepot ; le module DG ne lit plus _loyerEtatLot', () => {
    const f = extrait('_rgClotureImpayes');
    expect(f).toMatch(/SL\.detteBailAvantDepot\(lotIn, sb\.cle,/);
    expect(f).not.toMatch(/_loyerEtatLot/);
    const dg = readFileSync(resolve(ROOT, 'js/core/gestion-dg-impayes.js'), 'utf8');
    expect(dg).not.toMatch(/W\._loyerEtatLot/);
    expect(dg).toMatch(/W\._rgClotureImpayes\(bail\.ref, bail\.debut \|\| null, finBail, bail\.debut \|\| null\)/);
    expect(extrait('_rgClotureCompute')).toMatch(/_rgClotureImpayes\(entry\.ref, entry\.debutOcc, entry\.finOcc, entry\.debut\)/);
  });
  it('etatMoisLot n\'existe plus (supprimé en P7) : ni appelé par l\'app, ni exposé par main.js, ni exporté par loyers-mois.js', () => {
    const app = ['js/app/app-part1.js', 'js/app/app-part2.js', 'js/app/app-part3.js'].map((f) => readFileSync(resolve(ROOT, f), 'utf8')).join('\n');
    expect(app).not.toMatch(/\betatMoisLot\(/);
    expect(readFileSync(resolve(ROOT, 'js/main.js'), 'utf8')).not.toMatch(/window\.etatMoisLot\b/);
    expect(readFileSync(resolve(ROOT, 'js/core/loyers-mois.js'), 'utf8')).not.toMatch(/export function etatMoisLot/);
  });
});
