// relay/src/email-limites.js — LIMITES D'ENVOI des e-mails (le relais ne doit jamais devenir un relais de spam).
//
// Compteurs à fenêtre fixe dans KV (SESSIONS_KV), clés préfixées « lim: ». Aucune adresse, aucun contenu dans les
// clés : seulement un identifiant technique (empreinte de jeton, identifiant de session, d'accès ou de compte).
// KV n'est pas transactionnel : deux requêtes simultanées peuvent dépasser d'une unité. Garde-fou de débit, pas de
// comptabilité ; le plafond global du jour (email-sender.js) et la limite de débit par IP / compte (EL_RATE) s'ajoutent.
//
// Une règle : { cle, max, fenetre } — fenetre en secondes (60 au moins : durée de vie minimale d'une clé KV).

export const LIMITES = Object.freeze({
  // Signature à distance : code envoyé au signataire (déclenchable par quiconque a le lien de signature).
  OTP_SIGNATAIRE_HEURE: 5, OTP_SIGNATAIRE_JOUR: 10,
  // Signature à distance : adresses refusées (anti-oracle : deviner l'adresse du signataire).
  VERIF_EMAIL_ECHECS_HEURE: 10,
  // Espace locataire : code de l'accord électronique (déclenchable par quiconque a le lien du locataire).
  CODE_ACCORD_HEURE: 3, CODE_ACCORD_JOUR: 6,
  // Avis et invitations envoyés à la demande du propriétaire connecté (espace locataire et lien de l'artisan).
  LIEN_HEURE: 3, LIEN_JOUR: 10, COMPTE_JOUR: 30,
  // Plafond GLOBAL du relais, tous e-mails confondus (offre gratuite Resend : 100 par jour). Surcharge : EMAIL_QUOTA_JOUR.
  GLOBAL_JOUR: 90,
});

const HEURE = 3600, JOUR = 86400;
export const parHeure = (cle, max) => ({ cle, max, fenetre: HEURE });
export const parJour = (cle, max) => ({ cle, max, fenetre: JOUR });

async function lire(kv, r, now) {
  const v = await kv.get('lim:' + r.cle, 'json');
  return v && typeof v.debut === 'number' && v.debut + r.fenetre * 1000 > now ? { n: Number(v.n) || 0, debut: v.debut } : { n: 0, debut: now };
}

/** Toutes les règles ont-elles encore de la marge ? (lecture seule) */
export async function marge(kv, regles, now = Date.now()) {
  if (!kv) return true;
  for (const r of regles) { if ((await lire(kv, r, now)).n >= r.max) return false; }
  return true;
}

/** Compte un événement sur chaque règle (sans vérifier). */
export async function compter(kv, regles, now = Date.now()) {
  if (!kv) return;
  for (const r of regles) {
    const v = await lire(kv, r, now);
    const reste = Math.max(60, Math.ceil((v.debut + r.fenetre * 1000 - now) / 1000));
    await kv.put('lim:' + r.cle, JSON.stringify({ n: v.n + 1, debut: v.debut }), { expirationTtl: reste });
  }
}

/** Vérifie TOUTES les règles puis, s'il reste de la marge partout, compte l'événement. true = permis. */
export async function consommer(kv, regles, now = Date.now()) {
  if (!(await marge(kv, regles, now))) return false;
  await compter(kv, regles, now);
  return true;
}

export const jourUTC = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/**
 * E-mail envoyé à la demande du PROPRIÉTAIRE connecté (espace locataire « el », lien de l'artisan « ar ») :
 * par lien 3 / heure et 10 / jour, par compte 30 / jour et par famille. Le destinataire est lu en base, mais un membre
 * peut le poser : pas de rafale vers une adresse tierce.
 */
export function reglesProprietaire(famille, accesId, userId, now = Date.now()) {
  return [
    parHeure(`${famille}:lien:h:${accesId}`, LIMITES.LIEN_HEURE),
    parJour(`${famille}:lien:j:${accesId}`, LIMITES.LIEN_JOUR),
    parJour(`${famille}:compte:${userId}:${jourUTC(now)}`, LIMITES.COMPTE_JOUR),
  ];
}

/** Plafond global du jour (configurable : EMAIL_QUOTA_JOUR, entier de 1 à 100 000 ; sinon 90). */
export function quotaGlobal(env) {
  const n = Number(env && env.EMAIL_QUOTA_JOUR);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : LIMITES.GLOBAL_JOUR;
}
