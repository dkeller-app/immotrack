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
import { consommer, regleGlobale, parJour, LIMITES } from './email-limites.js';

export const RESEND_URL = 'https://api.resend.com/emails';
// Partie locale en ASCII seulement (pas de caractère Unicode « équivalent » après mise en minuscules, ex. le signe
// Kelvin) ; ni espace, ni chevron, ni virgule, ni retour à la ligne (aucune injection d'en-tête ou de liste).
const ADRESSE_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
export const adresseValide = (a) => typeof a === 'string' && a.length <= 254 && ADRESSE_RE.test(a);
const typeSur = (t) => (TYPES_MODELES.includes(t) ? t : 'inconnu');
const journal = (statut, type, extra = '') => console.log(`[email] ${statut} type=${typeSur(type)}${extra ? ' ' + extra : ''}`);

export const modeEmail = (env) => (env && env.EMAIL_MODE === 'resend' ? 'resend' : 'dev');
/** Les e-mails partent-ils VRAIMENT ? (mode resend + clé + expéditeur valide) — une configuration incomplète vaut « non ». */
export const emailsOperationnels = (env) => modeEmail(env) === 'resend' && !!(env && env.RESEND_API_KEY) && adresseValide(String(env.EMAIL_FROM || ''));

// Empreinte d'un destinataire pour les compteurs (jamais l'adresse en clair dans une clé) : HMAC-SHA256 avec le secret
// du relais, 32 caractères hexadécimaux.
async function empreinteDestinataire(env, adresse) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.SIGNING_SECRET || 'propryo-email')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('dest:' + String(adresse).toLowerCase()));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
    // Plafond global du relais (toutes routes) : protège le quota du fournisseur et borne tout abus. Deux réserves : les
    // codes (signature, accord) ne peuvent pas être affamés par une rafale d'avis. KV en échec : on laisse passer (borné
    // par le verrou EMAIL_RATE des routes et par le quota du fournisseur).
    const kv = env.SESSIONS_KV;
    if (!(await consommer(kv, [regleGlobale(env, type)], undefined, { siErreur: true }))) {
      journal('quota_jour', type); return { sent: false, error: 'quota' };
    }
    // Par DESTINATAIRE, toutes routes et tous liens confondus (renouveler un lien crée un nouvel accès : la limite par
    // lien ne suffit pas à empêcher une rafale vers une même adresse).
    if (!(await consommer(kv, [parJour('email:dest:' + await empreinteDestinataire(env, to), LIMITES.DESTINATAIRE_JOUR)], undefined, { siErreur: true }))) {
      journal('limite_destinataire', type); return { sent: false, error: 'quota' };
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
    // bailleur : nom du bailleur enregistré sur la session (facultatif ; « votre bailleur » sinon).
    async send({ to, code, bailleur }) {
      const type = 'otp_signature';
      if (mode !== 'resend') { journal('dev_non_envoye', type); return { sent: false, devCode: code }; }
      return envoyer({ to, type, m: modeleEmail(type, { code, bailleur }, { repondre: !!replyTo }) });
    },
    // Tout autre e-mail : type + données ; le modèle est rendu ICI (une seule source : email-modeles.js).
    async sendModele({ to, type, donnees }) {
      return envoyer({ to, type, m: modeleEmail(type, donnees || {}, { repondre: !!replyTo }) });
    },
  };
}
