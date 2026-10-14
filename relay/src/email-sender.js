// relay/src/email-sender.js — Abstraction d'envoi du code OTP, pilotée par env.EMAIL_MODE :
//   'dev'    → n'envoie rien, renvoie {sent:false, devCode} → test e2e sans email/domaine
//   'resend' → envoi réel via l'API Resend (nécessite RESEND_API_KEY secret + EMAIL_FROM vérifié)
// fetchImpl injectable pour les tests (pas d'appel réseau réel en test).
export function makeSender(env, fetchImpl = fetch) {
  const mode = (env && env.EMAIL_MODE) || 'dev';
  return {
    async send({ to, code, bailRef }) {
      if (mode !== 'resend') {
        console.log(`[otp][dev] code pour ${to} (bail ${bailRef}) = ${code}`);
        return { sent: false, devCode: code };
      }
      const from = env.EMAIL_FROM || 'onboarding@resend.dev';
      const subject = `Votre code de signature : ${code}`;
      const text = `Bonjour,\n\nVoici votre code pour signer le bail ${bailRef} : ${code}\n\n`
        + `Ce code est valable 10 minutes. Ne le communiquez à personne.\n\n— Propryo, signature électronique`;
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `Propryo <${from}>`, to: [to], subject, text }),
      });
      if (!res.ok) { console.warn('[otp][resend] échec', res.status); return { sent: false, error: res.status }; }
      return { sent: true };
    },
    // ESPACE LOCATAIRE (0059) : e-mail générique à partir d'un modèle NEUTRE (js/core/espace-locataire.js, modeleEmail).
    // Mode dev : RIEN n'est envoyé et RIEN de personnel n'est journalisé (ni adresse, ni lien, ni texte : le type seul).
    async sendModele({ to, objet, texte, type }) {
      if (mode !== 'resend') {
        console.log(`[email][dev] modele=${String(type || '').replace(/[^a-z_]/g, '')} (non envoye)`);
        return { sent: false, dev: true };
      }
      const from = env.EMAIL_FROM || 'onboarding@resend.dev';
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `Propryo <${from}>`, to: [to], subject: objet, text: texte }),
      });
      if (!res.ok) { console.warn('[email][resend] echec', res.status); return { sent: false, error: res.status }; }
      return { sent: true };
    },
  };
}
