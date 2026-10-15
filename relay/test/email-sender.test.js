// E-MAILS (chantier EMAILS, 15/10/2026) — envoi (mode dev / mode resend simulé), modèles, limites, journaux.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeSender, modeEmail, adresseValide, RESEND_URL } from '../src/email-sender.js';
import { modeleEmail, TYPES_MODELES } from '../src/email-modeles.js';
import { consommer, marge, compter, parHeure, parJour, quotaGlobal, reglesProprietaire, LIMITES } from '../src/email-limites.js';

// KV en mémoire (get(cle, 'json') / put / expiration ignorée : les fenêtres sont testées par `now`).
function kvMemoire() {
  const m = new Map();
  return { m, async get(k, t) { const v = m.has(k) ? m.get(k) : null; return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); } };
}
const ok = () => vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
const ENV_RESEND = (kv, extra = {}) => ({ EMAIL_MODE: 'resend', RESEND_API_KEY: 'cle-de-test', EMAIL_FROM: 'ne-pas-repondre@notifications.propryo.fr', SESSIONS_KV: kv, ...extra });

// Journaux : tout ce qui passe par console.* est capturé ; aucune adresse, aucun code, aucun lien ne doit y figurer.
let journaux = [];
beforeEach(() => {
  journaux = [];
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) vi.spyOn(console, k).mockImplementation((...a) => { journaux.push(a.map(String).join(' ')); });
});
afterEach(() => vi.restoreAllMocks());
const rienDePersonnel = (...secrets) => { const t = journaux.join('\n'); for (const s of secrets) expect(t).not.toContain(s); };

describe('mode d\'envoi', () => {
  it('« dev » par défaut, et pour toute valeur autre que « resend »', () => {
    expect(modeEmail({})).toBe('dev');
    expect(modeEmail({ EMAIL_MODE: 'Resend' })).toBe('dev');
    expect(modeEmail({ EMAIL_MODE: 'prod' })).toBe('dev');
    expect(modeEmail({ EMAIL_MODE: 'resend' })).toBe('resend');
  });
});

describe('mode dev : rien ne part, rien de personnel dans les journaux', () => {
  it('code de signature : rendu à l\'appelant (affiché à l\'écran), jamais journalisé', async () => {
    const f = ok();
    const r = await makeSender({ EMAIL_MODE: 'dev' }, f).send({ to: 'a@b.fr', code: '472915' });
    expect(r).toEqual({ sent: false, devCode: '472915' });
    expect(f).not.toHaveBeenCalled();
    rienDePersonnel('a@b.fr', '472915');
    expect(journaux.join('\n')).toMatch(/dev_non_envoye type=otp_signature/);
  });
  it('env vide = dev', async () => {
    expect((await makeSender({}).send({ to: 'a@b.fr', code: '111111' })).devCode).toBe('111111');
    rienDePersonnel('a@b.fr', '111111');
  });
  it('autres e-mails : non envoyés, type seul journalisé', async () => {
    const f = ok();
    const r = await makeSender({}, f).sendModele({ to: 'loc@example.test', type: 'invitation', donnees: { bailleur: 'SCI Dupont', lien: 'https://r.test/l#' + 'J'.repeat(43) } });
    expect(r).toEqual({ sent: false, dev: true });
    expect(f).not.toHaveBeenCalled();
    rienDePersonnel('loc@example.test', 'SCI Dupont', 'J'.repeat(43));
  });
});

describe('mode resend (simulé, aucun appel réseau)', () => {
  it('code de signature : POST Resend, objet SANS le code, texte et HTML avec le code, expéditeur Propryo', async () => {
    const f = ok();
    const r = await makeSender(ENV_RESEND(kvMemoire()), f).send({ to: 'a@b.fr', code: '472915' });
    expect(r).toEqual({ sent: true });
    expect(f).toHaveBeenCalledOnce();
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe(RESEND_URL);
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer cle-de-test');
    const p = JSON.parse(opts.body);
    expect(p.from).toBe('Propryo <ne-pas-repondre@notifications.propryo.fr>');
    expect(p.to).toEqual(['a@b.fr']);
    expect(p.subject).not.toMatch(/\d/);
    expect(p.text).toContain('472915');
    expect(p.html).toContain('472915');
    expect(p.tags).toEqual([{ name: 'type', value: 'otp_signature' }]);
    expect(p.reply_to).toBeUndefined();
    expect(p.text).toMatch(/ne pas répondre/);
    expect(p.attachments).toBeUndefined();
    rienDePersonnel('a@b.fr', '472915', 'cle-de-test');
    expect(journaux.join('\n')).toMatch(/envoye type=otp_signature/);
  });
  it('adresse de réponse (EMAIL_REPLY_TO) : posée et annoncée dans l\'e-mail ; invalide → ignorée', async () => {
    const f = ok();
    await makeSender(ENV_RESEND(kvMemoire(), { EMAIL_REPLY_TO: 'contact@propryo.fr' }), f).sendModele({ to: 'x@y.fr', type: 'message', donnees: { bailleur: 'SCI Dupont' } });
    const p = JSON.parse(f.mock.calls[0][1].body);
    expect(p.reply_to).toBe('contact@propryo.fr');
    expect(p.text).toMatch(/parviennent à l'équipe Propryo, pas à SCI Dupont/);
    const g = ok();
    await makeSender(ENV_RESEND(kvMemoire(), { EMAIL_REPLY_TO: 'pas une adresse\r\nBcc: x@y' }), g).sendModele({ to: 'x@y.fr', type: 'message', donnees: {} });
    expect(JSON.parse(g.mock.calls[0][1].body).reply_to).toBeUndefined();
  });
  it('refus du fournisseur → sent:false + statut ; seul le statut est journalisé', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{"message":"a@b.fr invalide"}', { status: 422 }));
    const r = await makeSender(ENV_RESEND(kvMemoire()), f).send({ to: 'a@b.fr', code: '123456' });
    expect(r).toEqual({ sent: false, error: 422 });
    expect(journaux.join('\n')).toMatch(/refus_fournisseur type=otp_signature statut=422/);
    rienDePersonnel('a@b.fr', '123456');
  });
  it('panne réseau → sent:false « reseau », sans exception', async () => {
    const f = vi.fn().mockRejectedValue(new Error('connexion a@b.fr refusée'));
    const r = await makeSender(ENV_RESEND(kvMemoire()), f).send({ to: 'a@b.fr', code: '123456' });
    expect(r).toEqual({ sent: false, error: 'reseau' });
    rienDePersonnel('a@b.fr', '123456');
  });
  it('configuration incomplète (clé ou expéditeur) → « config », rien n\'est appelé', async () => {
    const f = ok();
    expect((await makeSender({ ...ENV_RESEND(kvMemoire()), RESEND_API_KEY: '' }, f).send({ to: 'a@b.fr', code: '123456' })).error).toBe('config');
    expect((await makeSender({ ...ENV_RESEND(kvMemoire()), EMAIL_FROM: '' }, f).send({ to: 'a@b.fr', code: '123456' })).error).toBe('config');
    expect(f).not.toHaveBeenCalled();
  });
  it('adresse invalide (injection d\'en-tête, liste) → « adresse », rien n\'est appelé', async () => {
    const f = ok();
    for (const to of ['a@b.fr\r\nBcc: c@d.fr', 'a@b.fr, c@d.fr', 'pas-une-adresse', '', null]) {
      expect((await makeSender(ENV_RESEND(kvMemoire()), f).send({ to, code: '123456' })).error).toBe('adresse');
    }
    expect(f).not.toHaveBeenCalled();
    expect(adresseValide('prenom.nom+tag@sous.domaine.fr')).toBe(true);
  });
  it('plafond GLOBAL du jour (EMAIL_QUOTA_JOUR) : au-delà, plus rien ne part', async () => {
    const kv = kvMemoire(), f = ok();
    const s = makeSender(ENV_RESEND(kv, { EMAIL_QUOTA_JOUR: '2' }), f);
    expect((await s.send({ to: 'a@b.fr', code: '111111' })).sent).toBe(true);
    expect((await s.sendModele({ to: 'c@d.fr', type: 'message', donnees: {} })).sent).toBe(true);
    expect(await s.send({ to: 'a@b.fr', code: '222222' })).toEqual({ sent: false, error: 'quota' });
    expect(f).toHaveBeenCalledTimes(2);
    expect([...kv.m.keys()].join(' ')).not.toMatch(/@/);   // aucune adresse dans les clés de compteur
    expect(journaux.join('\n')).toMatch(/quota_jour/);
  });
  it('quota global : valeur par défaut 90, bornée', () => {
    expect(quotaGlobal({})).toBe(LIMITES.GLOBAL_JOUR);
    expect(quotaGlobal({ EMAIL_QUOTA_JOUR: '1000' })).toBe(1000);
    expect(quotaGlobal({ EMAIL_QUOTA_JOUR: '-1' })).toBe(90);
    expect(quotaGlobal({ EMAIL_QUOTA_JOUR: 'beaucoup' })).toBe(90);
  });
  it('type inconnu ou lien invalide → « modele », rien n\'est appelé', async () => {
    const f = ok();
    expect((await makeSender(ENV_RESEND(kvMemoire()), f).sendModele({ to: 'a@b.fr', type: 'publicite', donnees: {} })).error).toBe('modele');
    expect((await makeSender(ENV_RESEND(kvMemoire()), f).sendModele({ to: 'a@b.fr', type: 'invitation', donnees: { lien: 'javascript:alert(1)' } })).error).toBe('modele');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('modèles : vouvoiement, expéditeur réel, RGPD, sobriété', () => {
  const D = { bailleur: 'SCI Dupont', lien: 'https://relais.test/l#' + 'A'.repeat(43), titre: 'Quittance de septembre 2026', statut: 'Artisan prévenu', code: '482913' };
  it('chaque type : « De la part de … via Propryo », vouvoiement, pourquoi, qui contacter, ne pas répondre', () => {
    for (const t of TYPES_MODELES) {
      const m = modeleEmail(t, D);
      expect(m, t).not.toBeNull();
      expect(m.texte).toMatch(/^De la part de SCI Dupont via Propryo/);
      expect(m.texte).toMatch(/\b(vous|votre)\b/i);
      expect(m.texte + m.objet).not.toMatch(/(?<!\p{L})(tu|ton|ta|tes|toi)(?!\p{L})/iu);   // \b ignore les accents (« êtes »)
      expect(m.texte).toMatch(/Vous recevez cet e-mail/);
      expect(m.texte).toMatch(/responsable de vos données/);
      expect(m.texte).toMatch(/adressez-vous directement à SCI Dupont/);
      expect(m.texte).toMatch(/ne pas répondre/);
      expect(m.html).toMatch(/^<!doctype html>/);
      expect(m.html).not.toMatch(/<img|<script|https?:\/\/(?!relais\.test)/i);   // ni image, ni script, ni suivi
    }
  });
  it('objets fixes : ni nom, ni montant, ni code', () => {
    for (const t of TYPES_MODELES) {
      const o = modeleEmail(t, D).objet;
      expect(o).not.toMatch(/SCI|Dupont|€|\d|Quittance de/);
    }
  });
  it('bailleur inconnu : formulation générique', () => {
    const m = modeleEmail('document', { titre: 'Bail' });
    expect(m.texte).toMatch(/^De la part de votre bailleur via Propryo/);
    expect(m.texte).toMatch(/Le bailleur est responsable de vos données/);
  });
  it('lien seulement dans les invitations ; les avis renvoient au lien personnel déjà reçu', () => {
    expect(modeleEmail('invitation', D).texte).toContain(D.lien);
    expect(modeleEmail('invitation_artisan', D).texte).toContain(D.lien);
    for (const t of ['document', 'message', 'signalement', 'otp_signature', 'code_accord']) expect(modeleEmail(t, D).texte).not.toMatch(/https?:/);
    expect(modeleEmail('document', D).texte).toMatch(/lien personnel reçu de votre bailleur/);
    expect(modeleEmail('invitation', { bailleur: 'X' })).toBeNull();
    expect(modeleEmail('invitation', { lien: 'http://evil.example/l#x' })).toBeNull();
    expect(modeleEmail('invitation', { lien: 'https://r.test/l#x" onmouseover="x' })).toBeNull();
  });
  it('codes : 6 chiffres exigés', () => {
    expect(modeleEmail('otp_signature', { code: '12345' })).toBeNull();
    expect(modeleEmail('code_accord', { code: 'abcdef' })).toBeNull();
    expect(modeleEmail('otp_signature', { code: '000123' }).texte).toContain('000123');
  });
  it('données variables : échappées dans le HTML, sans retour à la ligne, bornées', () => {
    const m = modeleEmail('document', { bailleur: '<b>SCI</b> "Dupont"\r\nBcc: x@y', titre: '<img src=x onerror=alert(1)>' + 'z'.repeat(400) });
    expect(m.html).not.toMatch(/<b>SCI|<img src=x/);
    expect(m.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(m.texte).not.toMatch(/\r|Bcc: x@y\n/);
    expect(m.texte.split('\n')[0].length).toBeLessThan(160);
    expect(m.texte).not.toContain('z'.repeat(201));
  });
  it('adresse de réponse configurée : le pied de page le dit', () => {
    expect(modeleEmail('message', D, { repondre: true }).texte).toMatch(/parviennent à l'équipe Propryo, pas à SCI Dupont/);
    expect(modeleEmail('message', D, { repondre: true }).texte).not.toMatch(/ne pas répondre/);
  });
  it('code de signature : consigne de sécurité et « ignorez cet e-mail »', () => {
    const m = modeleEmail('otp_signature', D);
    expect(m.texte).toMatch(/valable 10 minutes/);
    expect(m.texte).toMatch(/Ne le communiquez à personne/);
    expect(m.texte).toMatch(/ignorez cet e-mail/);
  });
});

describe('limites d\'envoi (compteurs à fenêtre fixe)', () => {
  it('consommer : permis jusqu\'au maximum, refusé ensuite, rouvert à la fin de la fenêtre', async () => {
    const kv = kvMemoire(), t0 = Date.UTC(2026, 9, 15, 10);
    const R = [parHeure('t:a', 2)];
    expect(await consommer(kv, R, t0)).toBe(true);
    expect(await consommer(kv, R, t0 + 1000)).toBe(true);
    expect(await consommer(kv, R, t0 + 2000)).toBe(false);
    expect(await consommer(kv, R, t0 + 3600_000 + 1)).toBe(true);
  });
  it('plusieurs règles : une seule épuisée suffit à refuser, et rien n\'est compté', async () => {
    const kv = kvMemoire(), t0 = Date.UTC(2026, 9, 15, 10);
    expect(await consommer(kv, [parJour('t:j', 1)], t0)).toBe(true);
    expect(await consommer(kv, [parHeure('t:h', 5), parJour('t:j', 1)], t0)).toBe(false);
    expect(await marge(kv, [parHeure('t:h', 1)], t0)).toBe(true);   // t:h n'a pas été compté
  });
  it('compter sans vérifier (adresses refusées), puis marge', async () => {
    const kv = kvMemoire(), R = [parHeure('t:e', 2)];
    await compter(kv, R); await compter(kv, R);
    expect(await marge(kv, R)).toBe(false);
  });
  it('règles du propriétaire : par lien (heure, jour) et par compte (jour)', () => {
    const r = reglesProprietaire('eln', 'acces-1', 'user-1', Date.UTC(2026, 9, 15));
    expect(r.map((x) => [x.cle, x.max, x.fenetre])).toEqual([
      ['eln:lien:h:acces-1', 3, 3600], ['eln:lien:j:acces-1', 10, 86400], ['eln:compte:user-1:2026-10-15', 30, 86400],
    ]);
  });
  it('sans KV (tests isolés) : jamais bloquant', async () => {
    expect(await consommer(undefined, [parHeure('x', 0)])).toBe(true);
  });
});
