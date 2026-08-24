/**
 * core/offline-boot.js — « on ne peut pas SE CONNECTER hors ligne, on peut
 * RESTER connecté hors ligne » (chantier EDL TERRAIN, lot 4).
 *
 * CDC docs/CDC-EDL.md §3 (les quatre verrous), §3ter (failles F1 à F4, F10) et
 * §9 (invariants 15 à 19m).
 *
 * Le lot le plus sensible du chantier : il touche au RGPD (le miroir local
 * contient les données d'un espace partagé) et au risque d'écrasement. Toutes
 * les DÉCISIONS vivent ici, en fonctions pures et testables ; l'exécution
 * (localStorage, Supabase, DOM) reste dans js/app/supabase-entry.js.
 *
 * La règle de fond, non négociable : `'other-user'` et `'untagged'` gardent le
 * comportement actuel (app vide). La fuite RGPD du 12/07 reste fermée.
 */

/** Horodatage de la dernière écriture dans le miroir localStorage. */
export const MIROIR_ECRIT_KEY = 'immotrack_v4_ecrit_at';
/** Horodatage du dernier flush cloud RÉUSSI. */
export const FLUSH_OK_KEY = 'immotrack_v4_flush_at';

/**
 * Un échec d'authentification : panne de transport, ou refus du serveur ?
 *
 * F4, PROUVÉE par __tests__/helpers/supabase-offline-auth.test.js contre la
 * bibliothèque vendorée : sans réseau, supabase-js rend une
 * `AuthRetryableFetchError` (status 0) et n'émet AUCUN `SIGNED_OUT` ; un jeton
 * refusé rend un status 401. C'est cette distinction qui autorise le lot.
 *
 * @returns {'reseau'|'refus'|'inconnu'}
 */
export function classerEchecAuth(err) {
  if (!err) return 'inconnu';
  const nom = String(err.name || '');
  const msg = String(err.message || '');
  const status = err.status;
  if (nom === 'AuthRetryableFetchError') return 'reseau';
  if (nom === 'TypeError' && /fetch|network|réseau|reseau/i.test(msg)) return 'reseau';
  if (status === 0) return 'reseau';
  if (status === 401 || status === 403) return 'refus';
  if (/jwt|invalid.*token|token.*(expired|invalid)|not authenticated/i.test(msg)) return 'refus';
  return 'inconnu';
}

/**
 * Le verdict du miroir HORS LIGNE.
 *
 * `classifyMirrorTag` (cache-purge.js) compare userId ET espaceId. Hors ligne,
 * l'espaceId n'est pas connu : il vient du serveur, et c'est précisément ce
 * qu'on n'a pas. On s'en tient donc à ce que le CDC énonce — « une session
 * existe ET classifyMirrorTag rend 'same' POUR SON userId » — en refusant tout
 * ce qui n'est pas une correspondance d'utilisateur prouvée.
 *
 * Fail-safe identique à l'original : tag absent, illisible ou incomplet →
 * 'untagged' → app vide. La fuite RGPD du 12/07 reste fermée.
 *
 * @returns {'same'|'other-user'|'untagged'}
 */
export function classerMiroirHorsLigne(rawTag, userId) {
  if (!rawTag || typeof rawTag !== 'string' || !userId) return 'untagged';
  let tag;
  try { tag = JSON.parse(rawTag); } catch (_e) { return 'untagged'; }
  if (!tag || typeof tag !== 'object' || !tag.userId || !tag.espaceId) return 'untagged';
  return tag.userId === userId ? 'same' : 'other-user';
}

/**
 * Comment démarrer l'app ?
 *
 * 1. `getUser()` a répondu → comportement actuel, STRICTEMENT inchangé.
 * 2. Il a échoué FAUTE DE RÉSEAU (et seulement pour ça) → on lit la session
 *    locale ; si elle existe ET que le miroir est tagué `'same'`, on ouvre
 *    l'app en mode hors ligne, sur les données du miroir (invariant 15).
 * 3. Miroir `'other-user'` / `'other-espace'` / `'untagged'` → écran vide,
 *    comme aujourd'hui (invariant 16, RGPD).
 * 4. Jeton REFUSÉ → on expulse toujours (invariant 17).
 *
 * @returns {{mode:'normal'|'hors-ligne'|'connexion', motif:string}}
 */
export function decideDemarrage({ user = null, erreur = null, sessionLocale = null, tagMiroir = 'untagged' } = {}) {
  if (user) return { mode: 'normal', motif: 'serveur-ok' };
  const cause = classerEchecAuth(erreur);
  if (cause === 'refus') return { mode: 'connexion', motif: 'jeton-refuse' };
  if (cause !== 'reseau') return { mode: 'connexion', motif: 'pas-de-session' };
  if (!sessionLocale) return { mode: 'connexion', motif: 'aucune-session-locale' };
  if (tagMiroir !== 'same') return { mode: 'connexion', motif: 'miroir-' + tagMiroir };
  return { mode: 'hors-ligne', motif: 'session-locale-miroir-same' };
}

/**
 * F1 — le travail hors ligne était DÉTRUIT à la reconnexion.
 *
 * Le miroir est en écriture seule en mode cloud : personne ne le relit jamais.
 * App fermée hors ligne puis rouverte AVEC réseau → hydratation → le DB cloud
 * remplace tout : l'EDL hors ligne n'a jamais existé.
 *
 * Règle : au démarrage EN LIGNE, si le miroir est `'same'` ET porte des
 * écritures POSTÉRIEURES au dernier flush réussi → charger le miroir, le
 * flusher, PUIS hydrater (invariant 19f).
 */
export function doitPousserAvantHydratation({ tagMiroir = 'untagged', miroirEcritA = 0, dernierFlushA = 0 } = {}) {
  if (tagMiroir !== 'same') return false;      // jamais le miroir d'autrui
  if (!miroirEcritA) return false;             // rien d'écrit : rien à pousser
  return Number(miroirEcritA) > Number(dernierFlushA || 0);
}

/**
 * F2 — la déconnexion détruisait le travail hors ligne : `logout()` tente un
 * flush qui échoue toujours sans réseau, se contente d'un `console.warn`, puis
 * la purge du miroir emporte tout. Les photos survivent en IndexedDB mais
 * deviennent ORPHELINES : plus aucun enregistrement ne les référence.
 *
 * Règle : refuser la déconnexion tant qu'il reste des écritures non
 * synchronisées, EN LE DISANT (invariant 19g).
 */
export function peutSeDeconnecter({ ecrituresEnAttente = 0, forcer = false } = {}) {
  const n = Number(ecrituresEnAttente) || 0;
  if (forcer) return { peut: true, motif: 'force-par-utilisateur', enAttente: n };
  if (n > 0) return { peut: false, motif: 'ecritures-non-synchronisees', enAttente: n };
  return { peut: true, motif: 'tout-est-synchronise', enAttente: 0 };
}

/**
 * F4 — que faire d'un événement d'authentification ? (invariant 19i)
 *
 * ═══ CHEMIN SENSIBLE : il a déjà mordu deux fois en PROD ═══════════════════
 * BUG-AUTH-BOUNCE (v15.457) et BUG-LOGIN-DOUBLE (v15.470) vivaient tous deux
 * ici. La connexion est le préalable absolu de la V1 (docs/CDC-V1-LIGHT.md §1) :
 * on ne touche à cette condition qu'en la nommant.
 *
 * L'original : `if (evt === 'SIGNED_OUT' || !session) _sessionDead()`.
 *
 * Deux corrections, et DEUX SEULEMENT :
 *
 * 1. **Hors ligne, on ne déclare jamais la session morte.** La bannière est
 *    fausse (les modifications SONT enregistrées, en local) et son bouton
 *    « Se reconnecter » fait un `location.reload()` : une impasse sans réseau.
 *    Prouvé contre la bibliothèque vendorée (supabase-offline-auth.test.js) :
 *    sans réseau supabase-js n'émet PAS `SIGNED_OUT`, il rend une
 *    `AuthRetryableFetchError`. Un `SIGNED_OUT` reçu alors que le navigateur se
 *    sait hors ligne ne peut donc pas être un verdict du serveur.
 *
 * 2. **`INITIAL_SESSION` arrive légitimement avec `session === null`** — c'est
 *    l'événement d'amorçage de l'abonnement, pas une expiration. Lui seul est
 *    exempté du filet `!session`.
 *
 * Le filet `!session` est CONSERVÉ pour tous les autres événements : le retirer
 * en bloc ferait qu'une session réellement morte, annoncée autrement que par
 * `SIGNED_OUT`, ne serait plus détectée. On ne paie pas ce risque pour F4.
 *
 * @returns {'morte'|'hors-ligne'|'rien'}
 */
export function verdictAuthChange({ evt = '', session = null, enLigne = true } = {}) {
  if (enLigne === false) return 'hors-ligne';
  if (evt === 'SIGNED_OUT') return 'morte';
  if (!session && evt !== 'INITIAL_SESSION') return 'morte';
  return 'rien';
}

/**
 * F2, ce qu'on DIT — le message unique du refus de déconnexion.
 *
 * Il vit ici, et pas dans les trois endroits qui déconnectent (le menu Compte,
 * « utiliser un autre compte » d'une invitation, la page de test), parce qu'un
 * message recopié trois fois dérive : deux d'entre eux avalaient purement et
 * simplement le refus avant ce lot. « On prévient, on ne bloque pas » n'autorise
 * pas « on ne dit rien » : la personne doit savoir CE QU'ELLE PERD.
 *
 * @returns {{titre:string, texte:string, question:string}}
 */
export function messageDeconnexionRefusee({ enAttente = 0, raison = '' } = {}) {
  const n = Math.max(1, Number(enAttente) || 0);
  const pl = n > 1;
  const quoi = n + ' modification' + (pl ? 's' : '')
    + (pl ? ' ne sont pas encore enregistrées' : " n'est pas encore enregistrée") + ' dans le cloud';
  const titre = 'Déconnexion impossible : ' + quoi + '.';
  const cause = raison === 'flush-impossible'
    ? "L'envoi au cloud n'a pas pu aboutir — le plus souvent, c'est le réseau."
    : 'Ces modifications attendent encore leur envoi.';
  const texte = titre + '\n\n' + cause + '\n\n'
    + 'Reconnecte-toi à un réseau et attends que la pastille affiche « Enregistré ».\n\n'
    + 'Se déconnecter QUAND MÊME perdrait ce travail : la déconnexion efface la copie locale, '
    + "et les photos déjà prises resteraient sur l'appareil sans état des lieux pour les relier.";
  return { titre, texte, question: texte + '\n\nSe déconnecter quand même ?' };
}

/**
 * F1, la mécanique — comment le travail hors ligne remonte SANS rien détruire.
 *
 * Tentation à écarter : « charger le miroir en mémoire puis flusher ». Le
 * moteur de synchro diffe la baseline (le cloud) contre le DB vivant : tout ce
 * qui est dans le cloud et absent du miroir partirait en SUPPRESSION. Or le
 * miroir peut être en retard sur le cloud (un autre appareil, un associé). On
 * détruirait le travail des autres pour sauver le sien.
 *
 * Ce qu'on fait donc : on part du CLOUD, et on n'y reverse que les états des
 * lieux du miroir qui sont soit ABSENTS du cloud, soit PLUS RÉCENTS. Aucune
 * suppression n'est jamais dérivée du miroir. Périmètre volontairement réduit
 * à `edl` : c'est la seule collection qu'on autorise à s'écrire hors ligne
 * (invariant 19a).
 *
 * @param {object} cloud   le DB hydraté depuis le serveur
 * @param {object} miroir  le DB lu dans le miroir localStorage
 * @returns {{db:object, ajoutes:Array<string|number>, majs:Array<string|number>}}
 */
export function fusionnerEdlHorsLigne(cloud, miroir) {
  const base = cloud && typeof cloud === 'object' ? cloud : {};
  const mir = miroir && typeof miroir === 'object' ? miroir : {};
  const edlCloud = Array.isArray(base.edl) ? base.edl : [];
  const edlMiroir = Array.isArray(mir.edl) ? mir.edl : [];
  if (!edlMiroir.length) return { db: base, ajoutes: [], majs: [] };

  const parId = new Map();
  edlCloud.forEach((e, i) => { if (e && e.id != null) parId.set(String(e.id), i); });

  const fusion = edlCloud.slice();
  const ajoutes = [], majs = [];
  for (const local of edlMiroir) {
    if (!local || local.id == null) continue;
    const k = String(local.id);
    if (!parId.has(k)) { fusion.push(local); ajoutes.push(local.id); continue; }
    const i = parId.get(k);
    const dCloud = Date.parse((fusion[i] && fusion[i]._modifiedAt) || '') || 0;
    const dLocal = Date.parse(local._modifiedAt || '') || 0;
    // Égalité → on garde le cloud : on ne réécrit jamais pour rien.
    if (dLocal > dCloud) { fusion[i] = local; majs.push(local.id); }
  }
  if (!ajoutes.length && !majs.length) return { db: base, ajoutes: [], majs: [] };
  return { db: Object.assign({}, base, { edl: fusion }), ajoutes, majs };
}

/* ── Le périmètre du hors ligne (décision du 20/08) ────────────────────────── */

/**
 * Ouverts hors ligne : ce qui se constate debout dans un appartement.
 *
 * ⚠️ Les identifiants sont ceux des VRAIES pages d'index.html (`#p-<id>`), pas
 * des noms inventés — c'est la leçon du §A.0 du CDC (« l'existant n'avait pas
 * été lu »). Les trois fiches 360 en font partie : le CDC nomme explicitement ce
 * qui doit rester accessible sur place — « nom du locataire, téléphone, adresse,
 * date de début, composition du logement » — et ça ne vit nulle part ailleurs
 * que dans `log-fiche` / `imm-fiche` / `ent-fiche`. Ouvrir « Logements » en
 * fermant la fiche du logement rendrait l'onglet inutile.
 */
export const ONGLETS_OUVERTS_HORS_LIGNE = [
  'edl', 'biens', 'baux',
  'log-fiche', 'imm-fiche', 'ent-fiche',
];

/**
 * Fermés hors ligne : ce sont des chiffres qui bougent avec les imports
 * bancaires. « Un montant périmé lu hors ligne, c'est une décision prise sur
 * une donnée fausse » — et ça ne sert à rien dans un appartement vide.
 */
export const ONGLETS_FERMES_HORS_LIGNE = [
  'accueil', 'dashboard', 'pilotage', 'finances', 'loyers', 'regul', 'mouvements',
  // Ceux-là ne sont pas des chiffres périmés : ils ne PEUVENT pas fonctionner
  // sans réseau (import bancaire, envoi de courriel). Les nommer ici les fait
  // afficher leur raison au lieu de tomber dans le « fermé par défaut ».
  'import', 'export', 'emails',
];

/** @returns {boolean} l'onglet est-il consultable sans réseau ? (invariant 19b) */
export function ongletDisponibleHorsLigne(id) {
  const p = String(id || '');
  if (ONGLETS_FERMES_HORS_LIGNE.indexOf(p) >= 0) return false;
  if (ONGLETS_OUVERTS_HORS_LIGNE.indexOf(p) >= 0) return true;
  // Tout le reste (agenda, réglages, partage…) : fermé par défaut. On n'ouvre
  // que ce qu'on a instruit — « aucun bouton ne reste actif pour ne rien faire ».
  return false;
}

/**
 * Ce qu'on peut ÉCRIRE hors ligne : l'EDL, ses photos, la composition des
 * pièces, l'entrée/sortie, et la signature PRÉSENTIELLE de l'EDL. Rien d'autre
 * (invariant 19a). La signature d'un BAIL est refusée (19d), la signature à
 * distance aussi : le relais EST le réseau.
 */
export const ECRITURES_HORS_LIGNE = ['edl', 'edl-photo', 'edl-pieces', 'edl-signature-presentielle'];

export function ecritureAutoriseeHorsLigne(quoi) {
  return ECRITURES_HORS_LIGNE.indexOf(String(quoi || '')) >= 0;
}

/** Le motif à AFFICHER quand une action est grisée (invariant 19). */
export function motifIndisponible(quoi) {
  const q = String(quoi || '');
  if (q === 'bail-signature') {
    return 'Signer un bail demande du réseau. Tu peux l’envoyer pour signature à distance, ou le signer à ton retour.';
  }
  if (q === 'signature-distance') {
    return 'La signature à distance passe par le relais : elle a besoin du réseau.';
  }
  return 'Disponible dès que tu as du réseau.';
}

/**
 * Le motif d'un ONGLET fermé (invariant 19, 19b). Il ne suffit pas de griser :
 * l'utilisateur doit comprendre que ce n'est pas une panne mais une décision.
 * Deux familles, deux raisons différentes — les confondre serait mentir sur
 * l'une des deux.
 */
export function motifOnglet(id) {
  const p = String(id || '');
  if (p === 'import' || p === 'export') {
    return 'Importer ou exporter demande du réseau. Disponible dès que tu es reconnecté.';
  }
  if (p === 'emails') {
    return "L'envoi de messages passe par le réseau. Disponible dès que tu es reconnecté.";
  }
  if (ONGLETS_FERMES_HORS_LIGNE.indexOf(p) >= 0) {
    // La phrase du CDC, telle quelle : ce sont des chiffres qui bougent avec les
    // imports bancaires, et « un montant périmé lu hors ligne, c'est une
    // décision prise sur une donnée fausse ».
    return 'Fermé hors ligne : ces montants bougent avec les imports bancaires. '
      + 'Les afficher périmés te ferait décider sur une donnée fausse.';
  }
  return 'Disponible dès que tu as du réseau.';
}

/**
 * Invariant 19c : tout écran ouvert hors ligne porte la date et l'heure des
 * données affichées. « Hors ligne — tes données du 19/08 à 08h12 ».
 */
export function libelleDonneesDu(ts) {
  const d = ts instanceof Date ? ts : new Date(Number(ts) || 0);
  if (!ts || isNaN(d.getTime()) || d.getTime() === 0) return 'Hors ligne — données locales';
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return 'Hors ligne — tes données du ' + jj + '/' + mm + ' à ' + hh + 'h' + mi;
}
