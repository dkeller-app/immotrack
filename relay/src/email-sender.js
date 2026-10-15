// relay/src/email-sender.js — ENVOI DES E-MAILS du relais, piloté par env.EMAIL_MODE :
//   'dev'    (défaut, et toute autre valeur) → RIEN ne part. Le code de signature est rendu à l'appelant (affiché à
//            l'écran, « mode test ») ; les autres e-mails ne sont pas envoyés. Tout le parcours reste testable.
//   'resend' → envoi réel par l'API Resend (secret RESEND_API_KEY + EMAIL_FROM sur un domaine vérifié chez Resend).
// Variables : EMAIL_FROM (adresse d'envoi), EMAIL_REPLY_TO (facultative : adresse de réponse choisie par Didier ; absente
// → « ne pas répondre » écrit dans l'e-mail), EMAIL_QUOTA_JOUR (plafond global du jour, défaut 90).
//
// JOURNAUX : jamais d'adresse, de code, de lien ni de contenu — le type d'e-mail et un statut, rien d'autre.
// fetchImpl injectable pour les tests (aucun appel réseau réel en test).
import { modeleEmail, TYPES_MODELES } from './email-modeles.js';
import { consommer, parJour, jourUTC, quotaGlobal } from './email-limites.js';

export const RESEND_URL = 'https://api.resend.com/emails';
const ADRESSE_RE = /^[^@\s<>()",;:\\[\]]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
export const adresseValide = (a) => typeof a === 'string' && a.length <= 254 && ADRESSE_RE.test(a);
const typeSur = (t) => (TYPES_MODELES.includes(t) ? t : 'inconnu');
const journal = (statut, type, extra = '') => console.log(`[email] ${statut} type=${typeSur(type)}${extra ? ' ' + extra : ''}`);

export const modeEmail = (env) => (env && env.EMAIL_MODE === 'resend' ? 'resend' : 'dev');

export function makeSender(env, fetchImpl = fetch) {
  const mode = modeEmail(env);
  const replyTo = env && adresseValide(String(env.EMAIL_REPLY_TO || '')) ? env.EMAIL_REPLY_TO : null;

  // Envoi d'un modèle déjà rendu. → { sent:true } | { sent:false, dev:true } | { sent:false, error }
  async function envoyer({ to, type, m }) {
    if (!m) { journal('modele_invalide', type); return { sent: false, error: 'modele' }; }
    if (mode !== 'resend') { journal('dev_non_envoye', type); return { sent: false, dev: true }; }
    if (!adresseValide(String(to || ''))) { journal('adresse_invalide', type); return { sent: false, error: 'adresse' }; }
    if (!env.RESEND_API_KEY) { journal('cle_absente', type); return { sent: false, error: 'config' }; }
    const from = adresseValide(String(env.EMAIL_FROM || '')) ? env.EMAIL_FROM : null;
    if (!from) { journal('expediteur_absent', type); return { sent: false, error: 'config' }; }
    // Plafond global du relais (tous e-mails, toutes routes) : protège le quota du fournisseur et borne tout abus.
    if (!(await consommer(env.SESSIONS_KV, [parJour('email:global:' + jourUTC(), quotaGlobal(env))]))) {
      journal('quota_jour', type); return { sent: false, error: 'quota' };
    }
    const payload = {
      from: `Propryo <${from}>`, to: [to], subject: m.objet, text: m.texte, html: m.html,
      tags: [{ name: 'type', value: typeSur(type) }],
      ...(replyTo ? { reply_to: replyTo } : {}),
    };
    let res;
    try {
      res = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch { journal('reseau', type); return { sent: false, error: 'reseau' }; }
    if (!res.ok) { journal('refus_fournisseur', type, 'statut=' + res.status); return { sent: false, error: res.status }; }
    journal('envoye', type);
    return { sent: true };
  }

  return {
    mode,
    // Code de signature à distance. Mode dev : rendu à l'appelant (affiché à l'écran, jamais journalisé).
    async send({ to, code }) {
      const type = 'otp_signature';
      if (mode !== 'resend') { journal('dev_non_envoye', type); return { sent: false, devCode: code }; }
      return envoyer({ to, type, m: modeleEmail(type, { code }, { repondre: !!replyTo }) });
    },
    // Tout autre e-mail : type + données ; le modèle est rendu ICI (une seule source : email-modeles.js).
    async sendModele({ to, type, donnees }) {
      return envoyer({ to, type, m: modeleEmail(type, donnees || {}, { repondre: !!replyTo }) });
    },
  };
}
