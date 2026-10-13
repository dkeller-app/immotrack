/**
 * js/core/edl-voix-vues.js — VUES de la dictée d'EDL (chantier EDL-VOIX-IA, lots B1 à B3).
 *
 * Fonctions PURES qui rendent du HTML (chaînes) d'après un état : le monolithe ne fait que les afficher
 * dans la couche #edl-voix et brancher les gestes (fonctions globales _edlVoix…). Maquette validée le
 * 13/10 (mockups/EDL-VOIX-IA/maquette.html) : téléphone = page plein écran (M-16), tablette = feuille,
 * PC = dialogue ; le CSS choisit, le HTML est le même.
 *
 * Règles de charte tenues ici et vérifiées par test : ton neutre (M-13), jamais d'icône seule (M-10),
 * line-icons (M-9), une seule action primaire par vue (M-4), aucun texte coupé (M-14).
 * `ic(nom, taille)` = _uiIcon de l'app (injecté) ; tout texte variable passe par esc().
 * Les gestes n'utilisent JAMAIS un nom en « edl[A-Z]… » : ce préfixe déclenche l'autosave au clic.
 */
import { MENTION_PROPOSITION, BANDEAU_PROPOSITIONS } from './ia-transparence.js';

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function duree(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const btn = (cls, onclick, contenu, extra = '') => `<button type="button" class="btn ${cls}" onclick="${onclick}"${extra}>${contenu}</button>`;
const pri = (onclick, contenu, extra) => btn('evx-pri', onclick, contenu, extra);
const sec = (onclick, contenu, extra) => btn('evx-sec', onclick, contenu, extra);

/** Barre « Dicter la pièce » en tête d'une pièce (téléphone / tablette). */
export function barrePiece(pi, { ic }) {
  return `<div class="evx-bar"><div class="evx-bar-tx"><b>Décrire la pièce à voix haute</b>L’IA propose un état et une observation par élément ; chaque ligne se valide.</div>`
    + `<button type="button" class="btn evx-out" onclick="_edlVoixDicter(${Number(pi)})">${ic('mic')} Dicter la pièce</button></div>`;
}
/** Bouton de l'en-tête de pièce (PC, tableau dense). */
export function boutonPiecePC(pi, { ic }) {
  return `<button type="button" class="btn bs bb evx-pc" onclick="_edlVoixDicter(${Number(pi)})">${ic('mic')} Dicter la pièce</button>`;
}
/** Barre des relevés (étape Compteurs). */
export function barreCompteurs({ ic }) {
  return `<div class="evx-bar"><div class="evx-bar-tx"><b>Dicter les relevés</b>Dire le compteur puis l’index. Chaque valeur se valide une par une.</div>`
    + `<button type="button" class="btn evx-out" onclick="_edlVoixDicterCompteurs()">${ic('mic')} Dicter les relevés</button></div>`;
}

export function vueNotice(n, { ic }) {
  const corps = `<div class="evx-nt"><p class="evx-lead">${esc(n.intro)}</p>`
    + n.sections.map((s) => `<h3>${ic(s.icone)} ${esc(s.titre)}</h3><p>${esc(s.texte)}</p>`).join('')
    + '</div>';
  return { titre: n.titre, sousTitre: n.sousTitre, corps, pied: sec('_edlVoixFermer()', 'Pas maintenant') + pri('_edlVoixNoticeOk()', 'Commencer'), ferme: 'close' };
}

/** Enregistrement en cours ou en pause. */
export function vueEnregistrement({ piece, mode, sec: s = 0, max = 300, pause = false, elements = [], cible = 'piece' }, { ic }) {
  const conseil = cible === 'compteurs'
    ? '<div class="evx-tip"><b>Pour chaque compteur : le nommer, puis dire l’index.</b> Par exemple : <q>Compteur électrique heures pleines 12 345, heures creuses 6 789, eau froide 456 virgule 3.</q></div>'
    : '<div class="evx-tip"><b>Pour chaque élément : le nommer, dire l’état, décrire.</b> Par exemple : <q>Sol, carrelage, bon état, un carreau fêlé près de la porte.</q> Les états reconnus : neuf, bon état, état d’usage, mauvais état, absent.</div>';
  const liste = elements.length
    ? `<div class="evx-tip"><b>Éléments de la pièce</b> (${elements.length})<div class="evx-elist">${elements.map((e) => `<span>${esc(e)}</span>`).join('')}</div></div>`
    : '';
  const corps = `<div class="evx-rec"><span class="evx-dot${pause ? ' p' : ''}"><i></i>${pause ? 'En pause' : 'Enregistrement en cours'}</span>`
    + `<div class="evx-timer" id="evx-timer">${duree(s)}</div><div class="evx-max">${duree(max)} au plus par dictée</div>`
    + `<div class="evx-niv" aria-hidden="true"><i id="evx-niv"></i></div></div>${conseil}${liste}`;
  const pied = sec('_edlVoixPause()', pause ? `${ic('play')} Reprendre` : `${ic('pause')} Pause`)
    + pri('_edlVoixTerminer()', `${ic('check')} Terminer et analyser`);
  return { titre: `Dicter · ${piece}`, sousTitre: mode === 'sortie' ? 'État des lieux de sortie' : 'État des lieux d’entrée', corps, pied, ferme: 'close', fermeLibelle: 'Abandonner la dictée' };
}

/** Attente honnête (M-11) : 3 étapes visibles. etape ∈ envoi | transcription | propositions | attente */
export function vueAnalyse({ piece, duree: d = 0, ko = 0, etape = 'transcription' }, { ic }) {
  const ordre = ['envoi', 'transcription', 'propositions'];
  const i = Math.max(0, ordre.indexOf(etape));
  const li = (k, txt, sous) => {
    const j = ordre.indexOf(k);
    const cl = j < i ? 'ok' : j === i ? 'run' : 'todo';
    const pic = cl === 'ok' ? ic('check') : cl === 'run' ? '<span class="evx-spin"></span>' : '';
    return `<li class="${cl}"><span class="evx-ic">${pic}</span><div><b>${txt}</b>${sous ? `<small>${sous}</small>` : ''}</div></li>`;
  };
  const corps = `<ul class="evx-steps">${li('envoi', 'Dictée enregistrée', `${duree(d)}${ko ? ` · ${ko} Ko` : ''}`)}${li('transcription', i > 1 ? 'Transcription faite' : 'Transcription en cours', i === 1 ? 'Quelques secondes' : '')}${li('propositions', 'Préparation des propositions', '')}</ul>`
    + '<p class="evx-note">L’état des lieux reste utilisable pendant l’analyse. Un bandeau dans la pièce prévient quand les propositions sont prêtes.</p>';
  return { titre: `Analyse · ${piece}`, corps, pied: sec('_edlVoixFermer()', 'Revenir à l’état des lieux'), ferme: 'close' };
}

/** Échec (M-12 : visuel + texte + une action au plus) ; la saisie manuelle reste rappelée. */
export function vueErreur({ titre, texte, icone = 'warn', action = null, lien = null, piece = 'Pièce' }, { ic }) {
  const corps = `<div class="evx-emp"><div class="evx-pic">${ic(icone)}</div><h3>${esc(titre)}</h3><p>${esc(texte)}</p>`
    + '<p class="evx-man">La saisie à la main reste disponible.</p>'
    + (lien ? `<button type="button" class="evx-lnk" onclick="${lien.onclick}">${esc(lien.libelle)}</button>` : '')
    + '</div>';
  const pied = sec('_edlVoixFermer()', 'Revenir à l’état des lieux') + (action ? pri(action.onclick, `${action.icone ? ic(action.icone) + ' ' : ''}${esc(action.libelle)}`) : '');
  return { titre: `Dicter · ${piece}`, corps, pied, ferme: 'close' };
}

/** Bandeau d'une dictée dans la pièce (attente réseau, analyse, prête, erreur). */
export function banniere(item, { ic, message }) {
  const d = duree(item.duree || item.audioSec || 0);
  const id = esc(item.id);
  if (item.etape === 'pret') {
    const r = item.resultat || {};
    const n = (r.propositions || []).length + (r.compteurs || []).length;
    const dec = item.decisions || {};
    const faites = Object.keys(dec).length;
    const reste = Math.max(0, n + (r.aAjouter || []).length - faites);
    return `<div class="evx-ban ready">${ic('sparkle')}<div><b>Propositions prêtes : ${n} élément${n > 1 ? 's' : ''}</b>Dictée de ${d}${faites ? ` · ${reste} à valider` : ''}.`
      + `<div class="evx-bx"><button type="button" class="btn evx-pri" onclick="_edlVoixRelire('${id}')">Relire les propositions</button></div></div></div>`;
  }
  if (item.erreur) {
    const m = message(item.erreur.code, item.erreur);
    const actions = m.reessayable
      ? `<button type="button" class="btn evx-sec" onclick="_edlVoixReessayer('${id}')">${ic('refresh')} Réessayer</button>`
      : '';
    return `<div class="evx-ban ${item.erreur.code === 'offline' ? 'wait' : 'err'}">${ic(item.erreur.code === 'offline' ? 'cloud' : 'warn')}<div><b>${esc(m.titre)}</b>${esc(m.texte)}`
      + `<div class="evx-bx">${actions}<button type="button" class="btn evx-sec" onclick="_edlVoixSupprimer('${id}')">${ic('trash')} Supprimer la dictée</button></div></div></div>`;
  }
  return `<div class="evx-ban wait">${ic('hourglass')}<div><b>Analyse de la dictée (${d})</b>${item.etape === 'texte' ? 'Préparation des propositions.' : 'Transcription en cours.'} L’état des lieux reste modifiable à la main.</div></div>`;
}

export { MENTION_PROPOSITION, BANDEAU_PROPOSITIONS };
