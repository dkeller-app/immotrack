// SIGNATURE — annexes AVANT la page des signatures + certificat exact (v15.703, smoke D-207 du 30/09).
//
// CAS VÉCU 30/09 (PDF bp_D_207_6fac90a7bc52) :
//  • les annexes du bail (A, B, notice : pages 14-26) venaient APRÈS la page des signatures et n'étaient
//    pas listées dans l'écran des annexes → l'app les déclare désormais au relais (_bailAnnexManifestItems) ;
//  • le certificat était écrit sans accents, avec des dates ISO brutes, et affirmait « identité vérifiée
//    par code (email) » alors que le code s'affichait à l'écran (mode test) ;
//  • le tampon disait « Signé électroniquement par Didier Keller (locataire) » : nom tapé librement.
//
// On exécute les VRAIES fonctions extraites d'index.html.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
const require = createRequire(import.meta.url);
let html, MontantDoc;
beforeAll(() => {
  html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, '');
  const g = globalThis, prev = g.window, w = {};
  g.window = w;
  require(resolve(repoRoot, 'js/helpers/montant-doc.global.js'));   // le miroir s'accroche à window (une fois : cache require)
  g.window = prev;
  MontantDoc = w.MontantDoc;
});

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`fonction introuvable : ${name}`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
}
function extractConst(src, name) {
  const start = src.indexOf(`const ${name} = [`);
  if (start === -1) throw new Error(`constante introuvable : ${name}`);
  const end = src.indexOf('\n];', start);
  return src.slice(start, end + 3);
}

describe('_bailAnnexManifestItems — annexes du bail déclarées au relais', () => {
  const load = () => new Function(`${extractConst(html, '_BAIL_ANNEX_SECTIONS')}\n${extractFn(html, '_bailAnnexManifestItems')}\nreturn _bailAnnexManifestItems;`)();

  it('D-207 : A 14-15, B 16-17, notice 18-26 (signatures p. 13 ignorée)', () => {
    const f = load();
    expect(f({ signatures: 13, 'annexe-a': 14, 'annexe-b': 16, notice: 18 }, 26)).toEqual([
      { label: 'Annexe A — Réparations locatives', ref: 'Décret n° 87-712', statut: 'joint', from: 14, to: 15 },
      { label: 'Annexe B — Charges récupérables', ref: 'Décret n° 87-713', statut: 'joint', from: 16, to: 17 },
      { label: "Notice d'information", ref: 'Arrêté du 29 mai 2015', statut: 'joint', from: 18, to: 26 }
    ]);
  });
  it('section absente (bail garage) ou hors document → ignorée ; pas de sections → []', () => {
    const f = load();
    expect(f({ signatures: 5, notice: 6 }, 9)).toEqual([{ label: "Notice d'information", ref: 'Arrêté du 29 mai 2015', statut: 'joint', from: 6, to: 9 }]);
    expect(f({ 'annexe-a': 40 }, 26)).toEqual([]);
    expect(f(null, 26)).toEqual([]);
  });
});

describe('_collectSide — le nom RÉEL du bail part au relais, jamais le libellé de repli', () => {
  it('nomBail vide quand le bail n\'a pas de nom (« Locataire 1 » reste un libellé d\'écran)', () => {
    const _collectSide = new Function(`${extractFn(html, '_collectSide')}\nreturn _collectSide;`)();
    const out = [];
    _collectSide(out, [{ nom: ' BERLENGA Baptiste ', email: 'a@b.fr' }, { nom: '', email: 'c@d.fr' }], 'loc', 'locataire', () => true, (i) => 'Locataire ' + (i + 1));
    expect(out.map((s) => [s.nom, s.nomBail])).toEqual([[' BERLENGA Baptiste ', 'BERLENGA Baptiste'], ['Locataire 2', '']]);
  });
  it('la session relais reçoit nomBail (jamais le libellé)', () => {
    expect(html).toContain("signers: signers.map(s => ({ sigId: s.sigId, role: s.role, nom: s.nomBail || '', email: s.email, ordre: s.ordre }))");
  });
});

describe('_buildBailCertificatePdf — texte du certificat', () => {
  // pdf-lib simulé : on capture chaque ligne écrite (le rendu PDF lui-même est couvert ailleurs).
  async function certText(proof, opts = {}) {
    const lines = [];
    const fakePage = { drawText: (t) => lines.push(t), drawSvgPath() {}, drawCircle() {}, drawLine() {} };
    const PDFLib = {
      PDFDocument: { create: async () => ({ addPage: () => fakePage, embedFont: async () => ({ widthOfTextAtSize: (t, s) => String(t).length * s * 0.5 }), save: async () => new Uint8Array([1]) }) },
      StandardFonts: { Helvetica: 'H', HelveticaBold: 'HB' },
      rgb: () => ({})
    };
    const win = { MontantDoc };
    const fn = new Function('window', 'DB', '_loadPdfLib', 'Blob', `return async ${extractFn(html, '_buildBailCertificatePdf')}`)(
      win, { entites: [{ nom: 'SCI DD2 IMMO' }] }, async () => PDFLib, class { constructor(p) { this.p = p; } }
    );
    await fn({ ref: 'D-207', entity: 'SCI DD2 IMMO', annexesDdt: opts.annexesDdt }, proof, 'ab'.repeat(32), '2026-09-30T10:26:29.000Z');
    return lines.join('\n');
  }

  const base = {
    nom: 'BERLENGA Baptiste', role: 'locataire', mode: 'distance', email: 'b@x.fr',
    emailVerifiedAt: '2026-09-30T10:24:41.517Z', otpVerifiedAt: '2026-09-30T10:24:49.021Z',
    signedAt: '2026-09-30T10:26:04.610Z', ip: '2a02::1', luApprouve: true, consentElectronic: true,
    openedAt: '2026-09-30T10:24:27.947Z', readCompletedAt: '2026-09-30T10:25:57.126Z',
    parapheTimes: { 1: '2026-09-30T10:25:17.649Z', 12: '2026-09-30T10:25:33.273Z' }, pdfSha256: 'cd'.repeat(32)
  };

  it('accents et dates lisibles en heure de Paris', async () => {
    const t = await certText([{ ...base, otpDelivery: 'email', annexesRecuesAt: '2026-09-30T10:25:50.000Z', nameSource: 'bail' }]);
    expect(t).toContain('Certificat de preuve de signature électronique');
    expect(t).toContain('Date de complétion : 30/09/2026 à 12:26:29 (heure de Paris)');
    expect(t).toContain('signé le : 30/09/2026 à 12:26:04 (heure de Paris) — IP 2a02::1');
    expect(t).toContain('mention « Lu et approuvé » : oui');
    expect(t).toContain('pages paraphées : 2 (le 30/09/2026, de 12:25:17 à 12:25:33, heure de Paris');
    expect(t).toContain('annexes au bail : réception et prise de connaissance reconnues le 30/09/2026 à 12:25:50');
    expect(t).toContain('nom repris du bail (non modifiable par le signataire)');
    expect(t).toContain('code reçu par e-mail et saisi le 30/09/2026 à 12:24:49 (heure de Paris) : adresse e-mail vérifiée');
    expect(t).not.toMatch(/\d{4}-\d{2}-\d{2}T/);        // plus aucune date ISO brute
    expect(t).not.toMatch(/electronique|signe le|approuve"/);
  });

  it('mode test : le certificat dit que le code a été AFFICHÉ et que l\'e-mail n\'est PAS vérifié', async () => {
    const t = (await certText([{ ...base, otpDelivery: 'ecran-test' }])).replace(/\s+/g, ' ');   // la ligne est coupée à la largeur de page
    expect(t).toContain("code affiché à l'écran (mode test)");
    expect(t).toContain('adresse e-mail NON vérifiée');
    expect(t).not.toContain('code reçu par e-mail');
    expect(t).not.toContain('identite verifiee');
  });

  it('relais antérieur (remise du code inconnue) : ni « vérifiée par e-mail » ni accusation, juste le fait', async () => {
    const t = await certText([{ ...base }]);
    expect(t).toContain('(mode de remise du code non enregistré)');
    expect(t).not.toContain('reçu par e-mail');
  });

  it('nom tapé différent du bail (ancienne page) : consigné tel quel', async () => {
    const t = await certText([{ ...base, signerName: 'Didier Keller', nameSource: 'saisi' }]);
    expect(t).toContain('nom saisi par le signataire : Didier Keller');
  });

  it('une ligne trop longue est coupée, pas écrite hors de la page', async () => {
    const t = await certText([{ ...base, email: 'une.adresse.tres.longue.pour.tester.le.retour.a.la.ligne@exemple-de-domaine-long.fr' }]);
    const longest = Math.max(...t.split('\n').map((l) => l.length * 9 * 0.5));
    expect(longest).toBeLessThanOrEqual(515 + 9 * 0.5 * 64);   // seule une empreinte (sans espace) peut rester d'un bloc
  });
});
