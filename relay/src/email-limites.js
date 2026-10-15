// relay/src/email-limites.js — LIMITES D'ENVOI des e-mails (le relais ne doit jamais devenir un relais de spam).
//
// Deux étages :
//  1. verrou de DÉBIT atomique (binding Workers « ratelimit » EMAIL_RATE, wrangler.toml) par cible (session, lien,
//     compte) : une rafale parallèle ne peut pas se glisser entre deux lectures KV ;
//  2. compteurs à fenêtre fixe dans KV (SESSIONS_KV, clés préfixées « lim: ») pour les fenêtres heure / jour.
// Aucune adresse, aucun contenu dans les clés : seulement un identifiant technique (empreinte de jeton, identifiant de
// session, d'accès ou de compte, condensat d'IP du jour, empreinte HMAC du destinataire). KV n'est ni transactionnel ni
// immédiatement cohérent entre points de présence (jusqu'à 60 s) et refuse plus d'une écriture par seconde sur une clé :
// les compteurs KV sont un ordre de grandeur, pas une borne exacte. La borne dure contre les rafales est l'étage 1
// (10 par minute et par cible) ; le quota du fournisseur (Resend) reste le dernier verrou.
//
// Une règle : { cle, max, fenetre } — fenetre en secondes (60 au moins : durée de vie minimale d'une clé KV).

export const LIMITES = Object.freeze({
  // Signature à distance : code envoyé au signataire (déclenchable par quiconque a le lien de signature).
  OTP_SIGNATAIRE_HEURE: 5, OTP_SIGNATAIRE_JOUR: 10,
  // … et par COMPTE créateur des sessions (toutes sessions confondues).
  OTP_COMPTE_JOUR: 20,
  // Signature à distance : adresses refusées (anti-oracle) — par IP, et pour toute la session.
  VERIF_EMAIL_ECHECS_HEURE: 10, VERIF_EMAIL_ECHECS_SESSION_HEURE: 50,
  // Espace locataire : code de l'accord électronique (déclenchable par quiconque a le lien du locataire).
  CODE_ACCORD_HEURE: 3, CODE_ACCORD_JOUR: 6,
  // Avis et invitations envoyés à la demande du propriétaire connecté : par lien, et par compte TOUTES familles
  // confondues (espace locataire + artisan).
  LIEN_HEURE: 3, LIEN_JOUR: 10, COMPTE_JOUR: 40,
  // Par DESTINATAIRE (empreinte HMAC de l'adresse), tous e-mails confondus : 15 par jour.
  DESTINATAIRE_JOUR: 15,
  // Plafond GLOBAL du relais (offre gratuite Resend : 100 par jour). Surcharge : EMAIL_QUOTA_JOUR. Partagé en deux
  // réserves pour qu'une rafale d'avis ne bloque jamais un code de signature : codes 45 %, avis et invitations 55 %.
  GLOBAL_JOUR: 90,
});

const HEURE = 3600, JOUR = 86400;
export const parHeure = (cle, max) => ({ cle, max, fenetre: HEURE });
export const parJour = (cle, max) => ({ cle, max, fenetre: JOUR });

async function lire(kv, r, now) {
  const v = await kv.get('lim:' + r.cle, 'json');
  return v && typeof v.debut === 'number' && v.debut + r.fenetre * 1000 > now ? { n: Number(v.n) || 0, debut: v.debut } : { n: 0, debut: now };
}

/** Toutes les règles ont-elles encore de la marge ? (lecture seule ; lecture KV en échec → `siErreur`, défaut false) */
export async function marge(kv, regles, now = Date.now(), { siErreur = false } = {}) {
  if (!kv) return true;
  try {
    for (const r of regles) { if ((await lire(kv, r, now)).n >= r.max) return false; }
    return true;
  } catch { return siErreur; }
}

async function ecrire(kv, regles, now) {
  for (const r of regles) {
    const v = await lire(kv, r, now);
    const reste = Math.max(60, Math.ceil((v.debut + r.fenetre * 1000 - now) / 1000));
    await kv.put('lim:' + r.cle, JSON.stringify({ n: v.n + 1, debut: v.debut }), { expirationTtl: reste });
  }
}

/** Compte un événement sur chaque règle (sans vérifier). Une écriture KV refusée est ignorée (jamais d'exception). */
export async function compter(kv, regles, now = Date.now()) {
  if (!kv) return;
  try { await ecrire(kv, regles, now); } catch { /* compteur approximatif : voir l'en-tête */ }
}

/**
 * Vérifie TOUTES les règles puis, s'il reste de la marge partout, compte l'événement. true = permis.
 * KV peut refuser une écriture (au plus une écriture par seconde sur une même clé, panne) : jamais d'exception qui
 * remonte. `siErreur` fixe la politique : false (défaut) = refuser — routes déclenchables par un tiers ; true = laisser
 * passer — plafonds dont le dépassement est borné ailleurs (verrou EMAIL_RATE, quota du fournisseur).
 */
export async function consommer(kv, regles, now = Date.now(), { siErreur = false } = {}) {
  if (!kv) return true;
  try {
    for (const r of regles) { if ((await lire(kv, r, now)).n >= r.max) return false; }
    await ecrire(kv, regles, now);
    return true;
  } catch { return siErreur; }
}

/**
 * Verrou de débit atomique (binding EMAIL_RATE, 10 / minute par clé). Absent (tests, offre qui le refuse) : permis —
 * les compteurs KV restent en place. Une panne du binding ne bloque pas.
 */
export async function debitEmail(env, cle) {
  const rl = env && env.EMAIL_RATE;
  if (!rl || typeof rl.limit !== 'function') return true;
  try { const { success } = await rl.limit({ key: cle }); return success !== false; } catch { return true; }
}

export const jourUTC = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/**
 * E-mail envoyé à la demande du PROPRIÉTAIRE connecté (espace locataire « eln », lien de l'artisan « arn ») :
 * par lien 3 / heure et 10 / jour, par compte 40 / jour toutes familles confondues. Le destinataire est lu en base, mais
 * un membre peut le poser : pas de rafale vers une adresse tierce.
 */
export function reglesProprietaire(famille, accesId, userId, now = Date.now()) {
  return [
    parHeure(`${famille}:lien:h:${accesId}`, LIMITES.LIEN_HEURE),
    parJour(`${famille}:lien:j:${accesId}`, LIMITES.LIEN_JOUR),
    parJour(`email:compte:${userId}:${jourUTC(now)}`, LIMITES.COMPTE_JOUR),
  ];
}

/** Plafond global du jour (configurable : EMAIL_QUOTA_JOUR, entier de 2 à 100 000 ; sinon 90). */
export function quotaGlobal(env) {
  const n = Number(env && env.EMAIL_QUOTA_JOUR);
  return Number.isInteger(n) && n >= 2 && n <= 100000 ? n : LIMITES.GLOBAL_JOUR;
}

export const TYPES_CODES = Object.freeze(['otp_signature', 'code_accord']);
/** Règle du plafond global pour un type d'e-mail : réserve « codes » (45 %) ou « avis » (le reste). */
export function regleGlobale(env, type, now = Date.now()) {
  const total = quotaGlobal(env), codes = Math.max(1, Math.ceil(total * 0.45));
  return TYPES_CODES.includes(type)
    ? parJour(`email:global:codes:${jourUTC(now)}`, codes)
    : parJour(`email:global:avis:${jourUTC(now)}`, Math.max(1, total - codes));
}
