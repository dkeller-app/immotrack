// relay/src/email-modeles.js — MODÈLES DES E-MAILS envoyés par le relais (texte + HTML), une seule source.
//
// Courriers adressés à des TIERS (locataire, signataire, artisan) : VOUVOIEMENT — exception assumée au ton neutre de
// l'interface (CDC PROPRYO § 5, chantier EMAILS du 15/10/2026). Sobres : pas d'image, pas de pièce jointe, pas de suivi ;
// le lien suffit. Chaque e-mail dit de la part de qui il vient (« De la part de <bailleur> via Propryo »), pourquoi la
// personne le reçoit et qui contacter pour ses données (RGPD, art. 13 et 14 : le bailleur est responsable du traitement,
// Propryo agit pour son compte).
//
// Objets FIXES : jamais de nom, de montant ni de code dans l'objet (visible sur l'écran verrouillé d'un téléphone et
// dans les aperçus). Toute donnée variable est bornée, nettoyée (pas de retour à la ligne) et échappée dans le HTML.

export const TYPES_MODELES = Object.freeze(['otp_signature', 'code_accord', 'invitation', 'document', 'message', 'signalement', 'invitation_artisan']);

const ligne = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
// https seulement (http accepté pour le relais local `wrangler dev`, qui n'envoie rien : mode dev).
const LIEN_RE = /^(?:https:\/\/[^\s"'<>\\]{1,2000}|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?\/[^\s"'<>\\]{0,2000})$/;
const CODE_RE = /^[0-9]{6}$/;

const MOTIFS = {
  bail: 'parce qu\'elle figure comme adresse du locataire dans le bail de location',
  signature: 'parce qu\'elle a été indiquée pour la signature électronique d\'un bail de location',
  artisan: 'parce qu\'elle a été indiquée pour une demande d\'intervention dans un logement',
};

function piedDePage(bailleur, motif, repondre, artisan) {
  const qui = bailleur || (artisan ? 'le propriétaire' : 'le bailleur');
  const lignes = [
    `Vous recevez cet e-mail à cette adresse ${motif}. Il est envoyé par Propryo, l'outil de gestion locative utilisé par ${qui}, pour son compte.`,
    `${qui.charAt(0).toUpperCase() + qui.slice(1)} est responsable de vos données : pour toute question à leur sujet (accès, rectification, opposition), adressez-vous directement à ${qui}.`,
    repondre
      ? `Les réponses à cet e-mail parviennent à l'équipe Propryo, pas à ${qui}.`
      : 'Message automatique : merci de ne pas répondre, la réponse ne serait pas lue.',
  ];
  return lignes;
}

// Assemble { objet, texte, html } à partir de blocs : { p } paragraphe, { code }, { lien, libelle }.
function assembler({ objet, bailleur, blocs, motif, repondre }) {
  const artisan = motif === MOTIFS.artisan;
  const deLaPart = bailleur ? `De la part de ${bailleur} via Propryo` : artisan ? 'De la part du propriétaire via Propryo' : 'De la part de votre bailleur via Propryo';
  const pied = piedDePage(bailleur, motif, repondre, artisan);
  const t = [deLaPart, '', 'Bonjour,', ''];
  const h = [`<p style="margin:0 0 16px;color:#5b6472;font-size:13px">${esc(deLaPart)}</p>`, '<p style="margin:0 0 12px">Bonjour,</p>'];
  for (const b of blocs) {
    if (b.p) { t.push(b.p, ''); h.push(`<p style="margin:0 0 12px">${esc(b.p)}</p>`); }
    if (b.code) {
      t.push(b.code, '');
      h.push(`<p style="margin:8px 0 16px;font-size:28px;font-weight:700;letter-spacing:6px;font-family:Consolas,Menlo,monospace">${esc(b.code)}</p>`);
    }
    if (b.lien) {
      t.push(b.libelle + ' :', b.lien, '');
      h.push(`<p style="margin:8px 0 6px"><a href="${esc(b.lien)}" style="display:inline-block;padding:12px 20px;background:#1f3a5f;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">${esc(b.libelle)}</a></p>`
        + `<p style="margin:0 0 16px;font-size:12px;color:#5b6472;word-break:break-all">${esc(b.lien)}</p>`);
    }
  }
  t.push('—', ...pied);
  h.push('<hr style="border:none;border-top:1px solid #d9dde3;margin:24px 0 12px">',
    ...pied.map((l) => `<p style="margin:0 0 8px;font-size:12px;color:#5b6472">${esc(l)}</p>`));
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<title>${esc(objet)}</title></head><body style="margin:0;padding:24px 16px;background:#ffffff;color:#1b1f24;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5">`
    + `<div style="max-width:560px;margin:0 auto">${h.join('')}</div></body></html>`;
  return { objet, texte: t.join('\n'), html };
}

const AVIS_LIEN_PERSO = 'Ouvrez votre espace locataire avec le lien personnel reçu de votre bailleur (conservez-le en favori). Lien perdu : demandez-en un nouveau à votre bailleur.';
const LIEN_PERSONNEL = 'Ce lien est personnel : ne le transférez pas.';

/**
 * Modèle d'un e-mail. `d` : données (bailleur, lien, titre, statut, code). `opts.repondre` : une adresse de réponse
 * (EMAIL_REPLY_TO) est configurée. Retourne { objet, texte, html } ou null (type inconnu, lien ou code invalide).
 */
export function modeleEmail(type, d = {}, opts = {}) {
  const bailleur = ligne(d.bailleur, 120);
  const repondre = !!opts.repondre;
  const lien = d.lien == null ? '' : String(d.lien);
  const lienOk = LIEN_RE.test(lien);
  const code = String(d.code == null ? '' : d.code);
  switch (type) {
    case 'otp_signature':
      if (!CODE_RE.test(code)) return null;
      return assembler({ objet: 'Votre code pour signer le bail', bailleur, motif: MOTIFS.signature, repondre, blocs: [
        { p: 'Voici votre code de vérification pour signer électroniquement le bail de location :' }, { code },
        { p: 'Ce code est valable 10 minutes. Ne le communiquez à personne : Propryo ne vous le demandera jamais par téléphone.' },
        { p: 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail : aucune signature n\'est possible sans ce code.' },
      ] });
    case 'code_accord':
      if (!CODE_RE.test(code)) return null;
      return assembler({ objet: 'Votre code de confirmation', bailleur, motif: MOTIFS.bail, repondre, blocs: [
        { p: 'Voici votre code pour confirmer votre choix sur la réception des quittances par voie électronique :' }, { code },
        { p: 'Ce code est valable 10 minutes. Ne le communiquez à personne.' },
        { p: 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail : rien ne change sans ce code.' },
      ] });
    case 'invitation':
      if (!lienOk) return null;
      return assembler({ objet: 'Votre espace locataire', bailleur, motif: MOTIFS.bail, repondre, blocs: [
        { p: `${bailleur || 'Votre bailleur'} vous ouvre un espace locataire personnel, sans mot de passe : documents du bail, quittances, signalement d'un problème dans le logement, messages.` },
        { lien, libelle: 'Ouvrir mon espace locataire' },
        { p: 'Conservez ce lien (par exemple en favori) : c\'est votre accès personnel. ' + LIEN_PERSONNEL },
      ] });
    case 'document':
      return assembler({ objet: 'Un document est disponible dans votre espace locataire', bailleur, motif: MOTIFS.bail, repondre, blocs: [
        { p: `Un nouveau document est disponible : ${ligne(d.titre, 200) || 'document'}.` }, { p: AVIS_LIEN_PERSO },
      ] });
    case 'message':
      return assembler({ objet: 'Nouveau message dans votre espace locataire', bailleur, motif: MOTIFS.bail, repondre, blocs: [
        { p: `${bailleur || 'Votre bailleur'} vous a répondu dans votre espace locataire.` }, { p: AVIS_LIEN_PERSO },
      ] });
    case 'signalement': {
      const statut = ligne(d.statut, 40);
      return assembler({ objet: 'Votre signalement a avancé', bailleur, motif: MOTIFS.bail, repondre, blocs: [
        { p: 'Un problème que vous avez signalé a avancé' + (statut ? ` : ${statut}` : '') + '.' }, { p: AVIS_LIEN_PERSO },
      ] });
    }
    case 'invitation_artisan':
      if (!lienOk) return null;
      return assembler({ objet: 'Demande d\'intervention', bailleur, motif: MOTIFS.artisan, repondre, blocs: [
        { p: `${bailleur || 'Le propriétaire'} vous demande une intervention. Le détail (adresse, problème, photos, montant autorisé sans accord préalable) est sur cette page, sans compte ni mot de passe.` },
        { lien, libelle: 'Voir la demande' },
        { p: 'La même page vous permet de proposer un créneau, puis de déposer le devis et la facture. ' + LIEN_PERSONNEL },
      ] });
    default:
      return null;
  }
}
