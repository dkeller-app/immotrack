/**
 * __tests__/helpers/stockage-message-vrai.test.js — CDC-STOCKAGE lot 3, gate G4 (S-6, D1 B) + §3.7.
 *
 * « Le message dit la vérité. » Quand la copie de l'appareil (miroir) ne peut pas être écrite :
 *   - EN LIGNE (cloud) : la modification part au cloud → saveDB rend VRAI, un avis UNIQUE par session,
 *     jamais « PAS enregistrée » ; les appelants (journal de bail, avenant, EDL) n'annulent plus rien ;
 *   - HORS LIGNE / réseau coupé, sandbox, ancien mode local : le miroir était la seule destination →
 *     FAUX et « PAS enregistrée » (invariant 19l, inchangé ici).
 * Partie pure (verdictEchecMiroir, modeMiroir, etatCopieAppareil) + le VRAI saveDB extrait d'index.html
 * et EXÉCUTÉ avec le vrai module, un faux localStorage à quota, et le vrai `_miroirEchec`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as Stockage from '../../js/core/stockage-local.js';
import { fauxStockageQuota, chaine } from './_faux-stockage-quota.js';
import { extraireFonction } from './_extraction-source.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const T = Stockage.TEXTES_ECHEC_MIROIR;

describe('G4 — verdictEchecMiroir : table §3.3 (3 modes × EDL / non-EDL)', () => {
  for (const quoi of ['edl', 'logement', undefined]) {
    it(`cloud en ligne (${quoi || 'non étiquetée'}) : VRAI, avis unique, jamais « PAS enregistrée »`, () => {
      const v = Stockage.verdictEchecMiroir({ mode: 'cloud-en-ligne', quoi });
      expect(v).toEqual({ retour: true, type: 'warn', unique: true, message: T.enLigne });
      expect(v.message).not.toMatch(/PAS enregistrée/);
      expect(v.message).toMatch(/bien enregistrée dans le cloud/);
    });
    it(`cloud hors ligne (${quoi || 'non étiquetée'}) : FAUX, « PAS enregistrée »`, () => {
      expect(Stockage.verdictEchecMiroir({ mode: 'cloud-hors-ligne', quoi })).toEqual({ retour: false, type: 'err', unique: false, message: T.horsLigne });
    });
    it(`sandbox / local (${quoi || 'non étiquetée'}) : FAUX, « PAS enregistrée »`, () => {
      expect(Stockage.verdictEchecMiroir({ mode: 'local', sandbox: true, quoi })).toMatchObject({ retour: false, message: T.sandbox });
      expect(Stockage.verdictEchecMiroir({ mode: 'local', sandbox: false, quoi })).toMatchObject({ retour: false, message: T.local });
    });
  }
  it('mode inconnu : traité comme une PERTE (jamais un enregistrement qu’on ne peut prouver)', () => {
    expect(Stockage.verdictEchecMiroir({ mode: null }).retour).toBe(false);
    expect(Stockage.verdictEchecMiroir({}).retour).toBe(false);
  });
  it('les textes perdus disent « PAS enregistrée » ; aucun ne tutoie (charte M-13)', () => {
    for (const k of ['horsLigne', 'sandbox', 'local']) expect(T[k]).toMatch(/n’est PAS enregistrée/);
    for (const t of Object.values(T)) expect(t).not.toMatch(/\b(tu|ton|ta|tes|toi)\b/i);
  });
  it('modeMiroir : cloud + hors ligne ou réseau coupé → hors ligne ; cloud en ligne ; sans cloud → local', () => {
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: false, enLigne: true })).toBe('cloud-en-ligne');
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: false, enLigne: undefined })).toBe('cloud-en-ligne');
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: true, enLigne: true })).toBe('cloud-hors-ligne');
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: false, enLigne: false })).toBe('cloud-hors-ligne');
    expect(Stockage.modeMiroir({ cloud: false, horsLigne: false, enLigne: true })).toBe('local');
  });
});

describe('§3.7 — etatCopieAppareil : les 5 états de la maquette', () => {
  const MAINT = new Date(2026, 9, 6, 16, 0).getTime();
  const H1432 = new Date(2026, 9, 6, 14, 32).getTime();
  const VEILLE = new Date(2026, 9, 5, 14, 32).getTime();
  const e = o => Stockage.etatCopieAppareil(Object.assign({ cloud: true, sandbox: false, maintenant: MAINT }, o));
  it('A — à jour (IndexedDB), avec l’heure de la dernière mise à jour', () => {
    expect(e({ backend: 'indexeddb', dernierOk: H1432 })).toEqual({ etat: 'a-jour', libelle: 'À jour', ton: 'grn', explication: 'Dernière mise à jour aujourd’hui à 14:32.' });
  });
  it('B — mode réduit (repli localStorage)', () => {
    expect(e({ backend: 'localStorage' })).toMatchObject({ etat: 'reduit', ton: 'blu', libelle: 'Mode réduit' });
  });
  it('C — pas à jour : depuis la dernière écriture RÉUSSIE ; date complète si un autre jour', () => {
    const c = e({ backend: 'indexeddb', dernierOk: VEILLE, echecDepuis: H1432 });
    expect(c).toMatchObject({ etat: 'pas-a-jour', ton: 'blu', libelle: 'Pas à jour depuis le 05/10 à 14:32' });
    expect(c.explication).toBe('Le stockage de cet appareil est plein. Les modifications sont bien enregistrées dans le cloud ; sans réseau, cet appareil afficherait les données du 05/10 à 14:32.');
    expect(e({ echecDepuis: H1432 }).libelle).toBe('Pas à jour depuis 14:32');
  });
  it('priorité : pas à jour > incomplète > mode réduit > à jour', () => {
    expect(e({ backend: 'localStorage', copieIncomplete: true, echecDepuis: H1432 }).etat).toBe('pas-a-jour');
    expect(e({ backend: 'localStorage', copieIncomplete: true }).etat).toBe('incomplete');
    expect(e({ backend: 'localStorage' }).etat).toBe('reduit');
  });
  it('D — incomplète ; E — base de test ; sans cloud hors sandbox : base locale', () => {
    expect(e({ copieIncomplete: true })).toMatchObject({ etat: 'incomplete', ton: 'blu', libelle: 'Incomplète' });
    expect(e({ cloud: false, sandbox: true })).toMatchObject({ etat: 'test', ton: 'gry', libelle: 'Base de test' });
    expect(e({ cloud: false, sandbox: false })).toMatchObject({ etat: 'local', ton: 'gry' });
  });
  it('aucun texte d’état ne tutoie (M-13)', () => {
    for (const o of [{}, { backend: 'localStorage' }, { copieIncomplete: true }, { echecDepuis: H1432 }, { cloud: false, sandbox: true }]) {
      const x = e(o);
      expect(x.libelle + ' ' + x.explication).not.toMatch(/\b(tu|ton|ta|tes|toi)\b/i);
    }
  });
  it('enMo : virgule décimale, jamais « 0,0 Mo » pour un contenu non vide', () => {
    expect(Stockage.enMo(2_469_835)).toBe('2,4 Mo');
    expect(Stockage.enMo(50_000)).toBe('< 0,1 Mo');
    expect(Stockage.enMo(0)).toBe('0,0 Mo');
  });
});

// ── Le VRAI saveDB, avec le VRAI _miroirEchec ───────────────────────────────────────────────

let HTML;
beforeAll(() => { HTML = readFileSync(resolve(repoRoot, 'index.html'), 'utf8'); });

/** Monte saveDB + _miroirEchec + _miroirModeCourant + _miroirNoterOk tels qu'écrits dans l'app. */
function monter({ cloud = true, horsLigne = false, enLigne = true, sandbox = false, module = true, plein = true }) {
  const toasts = [];
  const envois = [];
  const st = fauxStockageQuota({ quota: plein ? 100 : Infinity });   // plein : rien ne tient
  const win = { __immoSupabaseMode: cloud, __immoHorsLigne: horsLigne, __immoMarkDirty: () => envois.push(1),
    __immoEcritureHorsLigneOK: () => true };
  if (module) win._stockage = Stockage;
  const src = 'let _saveDBQuotaAt = 0, _miroirAvisDonne = false, _miroirEchecDepuis = 0, _miroirDernierOk = 0;\n'
    + ['saveDB', '_miroirEcrire', '_miroirEcrireCloud', '_miroirNoterOk', '_miroirModeCourant', '_miroirEchec']
      .map(n => extraireFonction(HTML, n)).join('\n')
    + '\nreturn { saveDB, etat: () => ({ _miroirEchecDepuis, _miroirDernierOk, _miroirAvisDonne }) };';
  const r = new Function('window', 'localStorage', 'KEY', 'DB', '_CLOUD_BOOT', 'navigator', 'showToast', '_isTestMode', 'console', src)(
    win, st, sandbox ? '_test_immotrack_v4' : 'immotrack_v4', { baux: {}, logements: [], x: chaine(500) }, false,
    { onLine: enLigne }, (m, t) => toasts.push([t, m]), sandbox, { error() {}, info() {}, warn() {} });
  return Object.assign(r, { toasts, envois, st });
}

describe('G4 — câblage dans saveDB (miroir plein)', () => {
  it('EN LIGNE : VRAI, envoi au cloud marqué, UN SEUL avis pour plusieurs échecs, jamais « PAS enregistrée »', () => {
    const m = monter({});
    expect(m.saveDB({ quoi: 'bail-modification' })).toBe(true);
    expect(m.saveDB({ quoi: 'edl', autosave: true })).toBe(true);
    expect(m.saveDB()).toBe(true);
    expect(m.envois.length).toBe(3);
    expect(m.toasts).toEqual([['warn', T.enLigne]]);
    expect(m.etat()._miroirEchecDepuis).toBeGreaterThan(0);                // la carte Réglages le dira
  });
  it('HORS LIGNE (mode hors ligne) : FAUX et « PAS enregistrée » (19l)', () => {
    const m = monter({ horsLigne: true });
    expect(m.saveDB({ quoi: 'edl' })).toBe(false);
    expect(m.toasts).toEqual([['err', T.horsLigne]]);
  });
  it('RÉSEAU COUPÉ en cours de session (navigator.onLine = false) : FAUX — le cloud ne la reçoit pas', () => {
    const m = monter({ enLigne: false });
    expect(m.saveDB({ quoi: 'bail-modification' })).toBe(false);
    expect(m.toasts[0]).toEqual(['err', T.horsLigne]);
  });
  it('SANDBOX : FAUX, texte de la base de test', () => {
    const m = monter({ cloud: false, sandbox: true });
    expect(m.saveDB()).toBe(false);
    expect(m.toasts).toEqual([['err', T.sandbox]]);
  });
  it('module absent : comportement d’avant (FAUX, « PAS enregistrée »), même en ligne', () => {
    const m = monter({ module: false });
    expect(m.saveDB()).toBe(false);
    expect(m.toasts[0][1]).toMatch(/PAS enregistrée/);
  });
  it('écriture réussie : VRAI, aucun message, état « à jour » (l’échec précédent est effacé)', () => {
    const m = monter({ plein: false });
    expect(m.saveDB()).toBe(true);
    expect(m.toasts).toEqual([]);
    expect(m.etat()).toMatchObject({ _miroirEchecDepuis: 0 });
    expect(m.etat()._miroirDernierOk).toBeGreaterThan(0);
  });
});

describe('Appelants : plus d’annulation en ligne pour un miroir plein', () => {
  it('journal de bail et avenant annulent SEULEMENT sur un retour faux (que saveDB ne rend plus en ligne)', () => {
    const SRC1 = readFileSync(resolve(repoRoot, 'js/app/app-part1.js'), 'utf8');
    expect(SRC1).toMatch(/_okJ = saveDB\(\{ quoi: 'bail-modification' \}\)[\s\S]{0,200}if \(_okJ === false\)/);
    expect(SRC1).toMatch(/ok=\(typeof saveDB==='function'\)\?saveDB\(\{quoi:quoi\}\):true/);
  });
});

describe('Carte Réglages : la jauge « ~10 MB » a disparu, la carte est câblée', () => {
  it('plus de db-size-badge ni d’updateDBSizeBadge ; carte stockage-card présente et rendue à l’ouverture de Réglages', () => {
    const SRC2 = readFileSync(resolve(repoRoot, 'js/app/app-part2.js'), 'utf8');
    expect(HTML).not.toMatch(/db-size-badge|updateDBSizeBadge|getDBSizeKB|KB \/ ~10 MB<\/span>/);
    expect(HTML).toMatch(/id="stockage-card"/);
    expect((SRC2.match(/^\s*(?:rParamsRules\(\); rParamsBail\(\); )?_renderStockageCard\(\);/gm) || []).length).toBe(2);
  });
});
