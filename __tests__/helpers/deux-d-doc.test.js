// __tests__/helpers/deux-d-doc.test.js — VERIF-DOCUMENTS lot 1 : lecture et vérification des codes 2D-Doc.
// Deux jeux, aucun document réel d'un tiers :
//   1. les SPÉCIMENS OFFICIELS de la spécification France Titres v3.3.9 §16 (certificat de test FR00/0001 publié) ;
//   2. une infrastructure de TEST locale (AC « ZZ01 » RSA, certificats ECDSA TST1 valide / TST2 révoqué, CRL).
// Règle centrale : AUCUN faux « valide » (chaque falsification sort « invalide », « non vérifiable » ou « illisible »).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  lireEntete, decouperChamps, base32Decode, base32Encode, lireCertificat, lireCrl, signePar, construireConfiance,
  verifier2DDoc, champsConserves, normaliserNom, identiteConcorde, comparerAvecTexte, chiffresPresents, referencesSvair,
  ETAT, sha256Hex, b64VersOctets
} from '../../js/core/deux-d-doc.js';
import { ANCRES_2DDOC, TSL_REFERENCE } from '../../js/core/deux-d-doc-ancres.js';
import { CHAMPS_2DDOC } from '../../js/core/deux-d-doc-champs.js';

const FIX = path.join(__dirname, '..', 'fixtures', '2ddoc');
const SPEC = JSON.parse(fs.readFileSync(path.join(FIX, 'specimens-spec-v339.json'), 'utf8'));
const PKI = JSON.parse(fs.readFileSync(path.join(FIX, 'pki-test.json'), 'utf8'));
const brut = (s) => s.replace(/<GS>/g, '\x1d').replace(/<RS>/g, '\x1e').replace(/<US>/g, '\x1f');
const SPECIMENS = SPEC.specimens.map(brut);
const pemDer = (pem) => b64VersOctets(pem.replace(/-----[^-]+-----/g, ''));
const GS = '\x1d', US = '\x1f';
const MAINTENANT = new Date('2026-10-14T20:00:00Z');   // CRL de test : 14/10/2026 → 2036 ; courte : → 15/10/2026 19:34
const jours = (iso) => Math.round((Date.parse(iso) - Date.UTC(2000, 0, 1)) / 86400000).toString(16).toUpperCase().padStart(4, '0');

async function signer(texte, cle = 'TST1') {
  const k = await crypto.subtle.importKey('pkcs8', b64VersOctets(PKI.cles[cle]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return base32Encode(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, new TextEncoder().encode(texte))));
}
const ANCRES_TEST = { ZZ01: { der: PKI.ca, sha256: PKI.ca_sha256 } };
const DONNEES = (o = {}) => ({ source: 'test', genereLe: '2026-10-14', autorites: { ZZ01: Object.assign({ certificats: [PKI.TST1, PKI.TST2], crl: PKI.crl }, o) } });
const ENTETE = (cert = 'TST1', date = '2026-07-24', type = '28') => 'DC04' + 'ZZ01' + cert + jours(date) + jours(date) + type + '01' + 'FR';
const MESSAGE = '46DUPONT CAMILLE' + GS + '470000000000001' + '4131540' + GS + '431' + GS + '442600000000001' + '452025' + '4A31072026';
async function code(o = {}) { const e = o.entete || ENTETE(o.cert, o.date, o.type); const m = o.message || MESSAGE; return e + m + US + await signer(e + m, o.cle || o.cert || 'TST1'); }

describe('ancres : liste de confiance France Titres recopiée à la main', () => {
  it('7 autorités, empreintes SHA-256 conformes au DER embarqué (toute altération est détectée)', async () => {
    expect(Object.keys(ANCRES_2DDOC).sort()).toEqual(['FR01', 'FR03', 'FR04', 'FR05', 'FR06', 'FR07', 'FR09']);
    for (const a of Object.values(ANCRES_2DDOC)) {
      expect(await sha256Hex(b64VersOctets(a.der))).toBe(a.sha256);
      const c = lireCertificat(b64VersOctets(a.der));
      expect(c.typeCle).toBe('RSA');
      expect(a.annuaire).toMatch(/^https?:\/\//); expect(a.crl).toMatch(/\.crl$/);
    }
    expect(TSL_REFERENCE.sequence).toBe(23);
  });
  it('une ancre dont l\'empreinte ne correspond pas est ignorée', async () => {
    const m = await construireConfiance(DONNEES(), { ZZ01: { der: PKI.ca, sha256: '00'.repeat(32) } });
    expect(m.autorites.ZZ01).toBeUndefined();
  });
});

describe('en-tête et champs (spec §3)', () => {
  it('lit les en-têtes v02, v03, v04 ; refuse le reste', () => {
    const h = lireEntete('DC04FR000001FFFF25472801FR432,75');
    expect(h).toMatchObject({ version: '04', ac: 'FR00', certificat: '0001', type: '28', perimetre: '01', pays: 'FR', longueur: 26, dateEmission: null });
    expect(h.dateSignature.toISOString().slice(0, 10)).toBe('2026-02-16');
    expect(lireEntete('DC02FR000001125E125B0300')).toMatchObject({ version: '02', longueur: 22, type: '03' });
    expect(lireEntete('DC01FR000001125E125B0300')).toBeNull();
    expect(lireEntete('HELLO')).toBeNull();
    expect(lireEntete('DC04fr000001FFFF25472801FR')).toBeNull();
    expect(lireEntete(null)).toBeNull();
  });
  it('les spécimens officiels des types utiles au dossier se découpent entièrement avec le dictionnaire', () => {
    const utiles = ['00', '01', '02', '04', '06', '10', '18', '24', '27', '28'];
    let n = 0;
    for (const s of SPECIMENS) {
      const h = lireEntete(s); expect(h).not.toBeNull();
      if (!utiles.includes(h.type)) continue; n++;
      const d = decouperChamps(s.slice(h.longueur, s.indexOf(US)));
      expect(d.complet, s.slice(0, 40)).toBe(true);
      expect(d.champs.length).toBeGreaterThan(0);
    }
    expect(n).toBeGreaterThanOrEqual(8);
  });
  it('champ fixe, variable terminé par GS, tronqué par RS, identifiant inconnu', () => {
    expect(decouperChamps('452025' + '46A B' + GS + '4131540').champs.map((c) => [c.id, c.valeur])).toEqual([['45', '2025'], ['46', 'A B'], ['41', '31540']]);
    const t = decouperChamps('46ABC\x1e452025'); expect(t.champs[0]).toMatchObject({ valeur: 'ABC', tronque: true });
    expect(decouperChamps('ZZ1234')).toMatchObject({ complet: false, inconnu: 'ZZ' });
    expect(decouperChamps('4520')).toMatchObject({ complet: false });
    expect(CHAMPS_2DDOC.length).toBeGreaterThan(250);
  });
  it('Base32 aller-retour, caractère interdit refusé', () => {
    const u = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 7]);
    expect(Array.from(base32Decode(base32Encode(u)))).toEqual(Array.from(u));
    expect(() => base32Decode('ABC1')).toThrow();
  });
});

describe('spécimens officiels (certificat de test publié dans la spécification)', () => {
  const tc = lireCertificat(pemDer(SPEC.certificatTestPem));
  async function sigSeule(s) {
    const i = s.indexOf(US);
    const k = await crypto.subtle.importKey('spki', tc.spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, base32Decode(s.slice(i + 1)), new TextEncoder().encode(s.slice(0, i)));
  }
  it('les 39 signatures se vérifient avec WebCrypto (méthode conforme)', async () => {
    let ok = 0; for (const s of SPECIMENS) if (await sigSeule(s)) ok++;
    expect(ok).toBe(39);
    expect(tc.cn).toBe('0001'); expect(tc.courbe).toBe('P-256');
  });
  it('modifier une valeur signée du spécimen d\'avis (RFR) casse la signature', async () => {
    const avis = SPECIMENS.find((s) => lireEntete(s).type === '28');
    expect(await sigSeule(avis)).toBe(true);
    expect(await sigSeule(avis.replace('4163198', '4173198'))).toBe(false);
  });
  it('face à la liste de confiance RÉELLE, un spécimen (AC FR00) n\'est jamais « valide »', async () => {
    const m = await construireConfiance({ autorites: {} });
    expect(Object.keys(m.autorites).length).toBe(7);
    for (const s of SPECIMENS) {
      const r = await verifier2DDoc(s, m, { maintenant: MAINTENANT });
      expect(r.etat).not.toBe(ETAT.VALIDE);
    }
    const r = await verifier2DDoc(SPECIMENS.find((s) => lireEntete(s).type === '28'), m, { maintenant: MAINTENANT });
    expect(r).toMatchObject({ etat: ETAT.NON_VERIFIABLE, code: 'ac_inconnue' });
  });
  it('même avec le certificat de test injecté, la chaîne vers une ancre réelle échoue', async () => {
    const der = pemDer(SPEC.certificatTestPem); let b = ''; for (const x of der) b += String.fromCharCode(x);
    const m = await construireConfiance({ autorites: { FR06: { certificats: [btoa(b)], crl: null } } });
    const s = SPECIMENS.find((x) => lireEntete(x).type === '28').replace('DC04FR000001', 'DC04FR060001');
    const r = await verifier2DDoc(s, m, { maintenant: MAINTENANT });
    expect(r.etat).toBe(ETAT.NON_VERIFIABLE);
  });
});

describe('infrastructure de test locale : chemin nominal', () => {
  it('certificats, CRL, chaîne RSA → ECDSA', async () => {
    const ca = lireCertificat(b64VersOctets(PKI.ca)), t1 = lireCertificat(b64VersOctets(PKI.TST1));
    expect(await signePar(t1, ca)).toBe(true);
    expect(await signePar(lireCertificat(b64VersOctets(PKI.rogue)), ca)).toBe(false);
    const crl = lireCrl(b64VersOctets(PKI.crl));
    expect(await signePar(crl, ca)).toBe(true);
    expect(crl.revoques.has(lireCertificat(b64VersOctets(PKI.TST2)).serie)).toBe(true);
    expect(crl.revoques.has(t1.serie)).toBe(false);
  });
  it('code signé par TST1 : valide, avec certificat et révocation datés', async () => {
    const m = await construireConfiance(DONNEES(), ANCRES_TEST);
    const r = await verifier2DDoc(await code(), m, { maintenant: MAINTENANT });
    expect(r).toMatchObject({ etat: ETAT.VALIDE, code: 'valide', certificat: { ac: 'ZZ01', id: 'TST1' } });
    expect(r.champs.find((c) => c.id === '41').valeur).toBe('31540');
    expect(r.revocation.au).toBe('2036-10-11');
  });
});

describe('falsifications et cas limites : aucun faux « valide »', () => {
  const cas = [
    ['RFR modifié', async () => (await code()).replace('4131540', '4141540'), 'invalide'],
    ['nom modifié', async () => (await code()).replace('DUPONT CAMILLE', 'DUPONT CAMILLA'), 'invalide'],
    ['type de document modifié', async () => (await code()).replace('2801FR', '0401FR'), 'invalide'],
    ['un caractère de signature changé', async () => { const c = await code(); return c.slice(0, -3) + (c.at(-3) === 'A' ? 'B' : 'A') + c.slice(-2); }, 'invalide'],
    ['signature tronquée', async () => (await code()).slice(0, -8), 'invalide'],
    ['signature absente', async () => ENTETE() + MESSAGE, 'illisible'],
    ['signature hors alphabet Base32', async () => ENTETE() + MESSAGE + US + '1111', 'invalide'],
    ['re-signé avec une clé inconnue au même nom', async () => code({ cle: 'rogue' }), 'invalide'],
    ['certificat révoqué (TST2)', async () => code({ cert: 'TST2' }), 'invalide'],
    ['autorité inconnue', async () => (await code()).replace('DC04ZZ01', 'DC04ZZ09'), 'non_verifiable'],
    ['certificat inconnu', async () => (await code()).replace('ZZ01TST1', 'ZZ01TST9'), 'non_verifiable'],
    ['date de signature avant la validité du certificat', async () => code({ date: '2024-06-01' }), 'non_verifiable'],
    ['date de signature après la validité du certificat', async () => code({ date: '2030-06-01' }), 'non_verifiable'],
    ['version 01', async () => 'DC01' + (await code()).slice(4), 'non_verifiable'],
    ['pas un 2D-Doc', async () => 'HELLO WORLD', 'illisible'],
    ['chaîne vide', async () => '', 'illisible'],
    ['caractère non ASCII dans les données', async () => { const e = ENTETE(); const m = '46DUPONT CAMILLÉ' + GS; return e + m + US + await signer(e + m); }, 'non_verifiable']
  ];
  for (const [nom, fab, attendu] of cas) {
    it(nom + ' → ' + attendu, async () => {
      const m = await construireConfiance(DONNEES(), ANCRES_TEST);
      const r = await verifier2DDoc(await fab(), m, { maintenant: MAINTENANT });
      expect(r.etat).toBe(attendu);
      expect(r.motif).toBeTruthy();
    });
  }
  it('faux certificat auto-signé substitué par le transport (relais compromis) → non vérifiable', async () => {
    const m = await construireConfiance(DONNEES({ certificats: [PKI.rogue] }), ANCRES_TEST);
    const r = await verifier2DDoc(await code({ cle: 'rogue' }), m, { maintenant: MAINTENANT });
    expect(r).toMatchObject({ etat: ETAT.NON_VERIFIABLE, code: 'chaine' });
  });
  it('ancre remplacée par une AC au même nom mais autre clé → aucune chaîne', async () => {
    const m = await construireConfiance(DONNEES(), { ZZ01: { der: PKI.ca2 } });
    expect((await verifier2DDoc(await code(), m, { maintenant: MAINTENANT })).etat).toBe(ETAT.NON_VERIFIABLE);
  });
  it('liste de révocation absente → non vérifiable, à réessayer', async () => {
    const m = await construireConfiance(DONNEES({ crl: null }), ANCRES_TEST);
    expect(await verifier2DDoc(await code(), m, { maintenant: MAINTENANT })).toMatchObject({ etat: ETAT.NON_VERIFIABLE, code: 'revocation_inconnue', reessayer: true });
  });
  it('liste de révocation expirée → non vérifiable (jamais « valide » sur une révocation périmée)', async () => {
    const m = await construireConfiance(DONNEES({ crl: PKI.crl_courte }), ANCRES_TEST);
    expect((await verifier2DDoc(await code(), m, { maintenant: new Date('2026-10-14T20:00:00Z') })).etat).toBe(ETAT.VALIDE);
    expect(await verifier2DDoc(await code(), m, { maintenant: new Date('2026-10-16T00:00:00Z') })).toMatchObject({ etat: ETAT.NON_VERIFIABLE, code: 'revocation_inconnue' });
  });
  it('liste de révocation d\'une autre autorité (signature fausse) → non vérifiable', async () => {
    const ca2crl = DONNEES(); // la CRL de ZZ01 présentée sous une ancre ca2 au même nom
    const m = await construireConfiance(ca2crl, { ZZ01: { der: PKI.ca2 } });
    expect((await verifier2DDoc(await code(), m, { maintenant: MAINTENANT })).etat).not.toBe(ETAT.VALIDE);
  });
  it('CRL corrompue ou certificat corrompu dans le transport : ignorés, jamais « valide »', async () => {
    const m = await construireConfiance(DONNEES({ crl: 'AAAA', certificats: ['AAAA', PKI.TST1] }), ANCRES_TEST);
    expect((await verifier2DDoc(await code(), m, { maintenant: MAINTENANT })).code).toBe('revocation_inconnue');
  });
  it('date de signature dans le futur → non vérifiable', async () => {
    const m = await construireConfiance(DONNEES(), ANCRES_TEST);
    expect((await verifier2DDoc(await code({ date: '2027-01-10' }), m, { maintenant: MAINTENANT })).etat).toBe(ETAT.NON_VERIFIABLE);
  });
  it('magasin vide ou absent → non vérifiable', async () => {
    expect((await verifier2DDoc(await code(), null, { maintenant: MAINTENANT })).etat).toBe(ETAT.NON_VERIFIABLE);
    expect((await verifier2DDoc(await code(), { autorites: {} }, { maintenant: MAINTENANT })).etat).toBe(ETAT.NON_VERIFIABLE);
  });
  it('annexe après la signature (non signée) : ignorée, la signature reste vérifiée', async () => {
    const m = await construireConfiance(DONNEES(), ANCRES_TEST);
    expect((await verifier2DDoc((await code()) + GS + 'ANNEXE LIBRE', m, { maintenant: MAINTENANT })).etat).toBe(ETAT.VALIDE);
  });
});

describe('exploitation des données signées', () => {
  const champs = [{ id: '46', libelle: 'Déclarant 1', valeur: 'MARCHAL OBERLIN INES' }, { id: '41', libelle: 'RFR', valeur: '33870' },
    { id: '44', libelle: 'Réf', valeur: '2600000000001' }, { id: '47', libelle: 'NF', valeur: '0000000000001' }, { id: '4Y', libelle: 'Adresse', valeur: '1 RUE X' }];
  it('minimisation : l\'adresse n\'est pas conservée', () => {
    expect(champsConserves('28', champs).map((c) => c.id)).toEqual(['46', '41', '44', '47']);
    expect(champsConserves('99', champs)).toEqual([]);
  });
  it('identité : accents, tirets, ordre et civilité ignorés', () => {
    expect(normaliserNom('Mme Inès Marchal-Oberlin')).toBe('INES MARCHAL OBERLIN');
    expect(identiteConcorde('MARCHAL OBERLIN INES', 'Marchal-Oberlin', 'Inès')).toBe(true);
    expect(identiteConcorde('MARCHAL OBERLIN INES', 'Marchal', 'Paul')).toBe(false);
    expect(identiteConcorde('', 'X', 'Y')).toBeNull();
  });
  it('comparaison avec le texte imprimé : valeurs retrouvées ou absentes, jamais d\'invention', () => {
    const t = 'Revenu fiscal de référence | 33 870 € | Déclarant 1 | MARCHAL OBERLIN INES | Référence | 26 00 000 000 001 | 0000000000001';
    expect(comparerAvecTexte('28', champs, t).map((c) => [c.id, c.statut])).toEqual([['46', 'identique'], ['41', 'identique'], ['44', 'identique'], ['47', 'identique']]);
    const t2 = t.replace('33 870', '43 870');
    expect(comparerAvecTexte('28', champs, t2).find((c) => c.id === '41').statut).toBe('absent');
    expect(comparerAvecTexte('28', champs, '')).toEqual([]);
    expect(comparerAvecTexte('06', champs, t)).toEqual([]);
    expect(chiffresPresents('133 870', '33870')).toBe(false);
  });
  it('références pour le service de vérification d\'impots.gouv', () => {
    expect(referencesSvair('28', champs)).toEqual({ numeroFiscal: '0000000000001', referenceAvis: '2600000000001' });
    expect(referencesSvair('06', champs)).toBeNull();
  });
});

describe('chaîne de production réelle (AC FR06, données publiques du 14/10/2026)', () => {
  const R = JSON.parse(fs.readFileSync(path.join(FIX, 'fr06-reel.json'), 'utf8'));
  const LE_15 = new Date('2026-10-15T12:00:00Z');   // CRL FR06 valide du 14/10/2026 16:00 au 17/10/2026 16:00
  it('les 31 certificats de l\'annuaire FR06 sont émis par l\'ancre FR06 ; la CRL est signée par elle', async () => {
    const m = await construireConfiance({ autorites: { FR06: { certificats: R.certificats, crl: R.crl } } });
    const a = m.autorites.FR06;
    expect(a.certificats.length).toBe(31);
    for (const c of a.certificats) expect(await signePar(c, a.ac)).toBe(true);
    expect(await signePar(a.crl, a.ac)).toBe(true);
    expect(a.crl.prochaine.toISOString().slice(0, 10)).toBe('2026-10-17');
    expect(a.certificats.filter((c) => /^FPE\d$/.test(c.cn)).length).toBe(7);   // certificats de la DGFiP (avis d'impôt)
  });
  it('un faux code se réclamant du certificat DGFiP FPE3 (FR06), signé par une autre clé → invalide', async () => {
    const m = await construireConfiance({ autorites: { FR06: { certificats: R.certificats, crl: R.crl } } });
    const e = 'DC04FR06FPE3' + jours('2026-07-24') + jours('2026-07-24') + '2801FR';
    const r = await verifier2DDoc(e + MESSAGE + US + await signer(e + MESSAGE), m, { maintenant: LE_15 });
    expect(r).toMatchObject({ etat: ETAT.INVALIDE, code: 'signature' });
  });
  it('le même faux code avec la CRL périmée → non vérifiable (jamais valide)', async () => {
    const m = await construireConfiance({ autorites: { FR06: { certificats: R.certificats, crl: R.crl } } });
    const e = 'DC04FR06FPE3' + jours('2026-07-24') + jours('2026-07-24') + '2801FR';
    const r = await verifier2DDoc(e + MESSAGE + US + await signer(e + MESSAGE), m, { maintenant: new Date('2026-11-30T00:00:00Z') });
    expect(r.etat).toBe(ETAT.NON_VERIFIABLE);
  });
  it('annuaire multipart et DER seul', async () => {
    const { extraireCertificatsAnnuaire } = await import('../../js/core/deux-d-doc.js');
    const der = b64VersOctets(PKI.TST1);
    expect(extraireCertificatsAnnuaire(der).length).toBe(1);
    const enc = new TextEncoder();
    const parts = [enc.encode('\r\n--End\r\nContent-type: application/pkix-cert\r\n\r\n'), der, enc.encode('\r\n--End\r\nContent-Type: application/pkix-cert\r\n\r\n'), b64VersOctets(PKI.TST2), enc.encode('\r\n--End--\r\n')];
    const tot = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { tot.set(p, o); o += p.length; }
    expect(extraireCertificatsAnnuaire(tot).map((c) => lireCertificat(c).cn)).toEqual(['TST1', 'TST2']);
    expect(extraireCertificatsAnnuaire(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe('relecture ciblée du 14/10 (Fable)', () => {
  it('ancre sans empreinte : ignorée (empreinte SHA-256 obligatoire)', async () => {
    const m = await construireConfiance(DONNEES(), { ZZ01: { der: PKI.ca } });
    expect(m.autorites.ZZ01).toBeUndefined();
  });
  it('Base32 non canonique (bits de queue non nuls) refusé ; forme canonique acceptée', () => {
    expect(() => base32Decode('AB')).toThrow();          // 10 bits : 2 bits de queue non nuls
    expect(Array.from(base32Decode('AA'))).toEqual([0]);
    expect(() => base32Decode('A')).toThrow();           // 5 bits : aucun octet complet
  });
  it('périmètre autre que 01 ou pays autre que FR : signature vérifiée, champs non interprétés', async () => {
    const m = await construireConfiance(DONNEES(), ANCRES_TEST);
    const e = 'DC04' + 'ZZ01' + 'TST1' + jours('2026-07-24') + jours('2026-07-24') + '28' + '02' + 'FR';
    const r = await verifier2DDoc(e + MESSAGE + US + await signer(e + MESSAGE), m, { maintenant: MAINTENANT });
    expect(r.etat).toBe(ETAT.VALIDE);
    expect(r.champs).toEqual([]);
  });
});
