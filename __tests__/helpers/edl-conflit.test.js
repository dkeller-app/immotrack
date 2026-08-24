/**
 * __tests__/helpers/edl-conflit.test.js — chantier EDL TERRAIN, lot 4bis.
 *
 * CDC docs/CDC-EDL.md §7 et §9, invariants 29 à 34.
 *
 * Ce que ce lot protège : « le serveur gagne » est défendable pour une
 * modification de 30 secondes sur un loyer, jamais pour une heure de terrain.
 */
import { describe, it, expect } from 'vitest';
import {
  nommerAppareil, heureCourte, jourEtHeure, marqueAppareil, empreinteAppareil,
  detecterDoublon, verrouOuverture, nomVersionConservee, resumerSaisie,
  conserverLesDeuxVersions, messageVersionsConservees,
} from '../../js/core/edl-conflit.js';

const T = (j, m, h, mi) => new Date(2026, m - 1, j, h, mi).getTime();

/** Un EDL réaliste : le volume de Ferrette-101, pas trois lignes (§5bis). */
function edlReel({ id = 1, logement = 'FERRETTE-101', type = 'Entrée', date = '2026-08-20',
                   pieces = 8, parPiece = 14, photos = 1, appareil = null, signe = false } = {}) {
  const p = [];
  for (let i = 0; i < pieces; i++) {
    const els = [];
    for (let j = 0; j < parPiece; j++) {
      els.push({
        nom: 'élément ' + j, etatE: 'bon', obsE: '',
        photosE: Array.from({ length: photos }, (_, k) => ({ idbKey: 'p' + i + j + k, cloudKey: 'c' + i + j + k })),
        etatS: '', obsS: '', photosS: [],
      });
    }
    p.push({ nom: 'pièce ' + i, elements: els });
  }
  const e = { id, logement, type, date, pieces: p, _modifiedAt: '2026-08-20T14:32:00Z' };
  if (appareil) e._appareil = appareil;
  if (signe) e.signatures = { signedAt: '2026-08-20T18:00:00Z', locked: true };
  return e;
}

const TABLETTE = { id: 'app-tab', nom: 'la tablette', quand: T(20, 8, 14, 32) };
const PC = { id: 'app-pc', nom: "l'ordinateur", quand: T(20, 8, 16, 12) };

/* ── L'appareil ───────────────────────────────────────────────────────────── */

describe('nommerAppareil — se souvenir d’où on a travaillé', () => {
  it('reconnaît une tablette', () => {
    expect(nommerAppareil('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('la tablette');
    // Android SANS « Mobile » = tablette : c'est la convention de l'user-agent.
    expect(nommerAppareil('Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/120')).toBe('la tablette');
  });
  it('reconnaît un téléphone', () => {
    expect(nommerAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('le téléphone');
    expect(nommerAppareil('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Chrome/120')).toBe('le téléphone');
  });
  it('tout le reste est un ordinateur', () => {
    expect(nommerAppareil('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe("l'ordinateur");
  });
  it('sans user-agent, on ne prétend rien savoir', () => {
    expect(nommerAppareil('', '')).toBe('un autre appareil');
  });
});

describe('marqueAppareil / empreinteAppareil', () => {
  it('une empreinte se relit telle qu’elle a été posée', () => {
    const e = { _appareil: empreinteAppareil({ id: 'x1', nom: 'la tablette', maintenant: T(20, 8, 14, 32) }) };
    expect(marqueAppareil(e)).toEqual({ id: 'x1', nom: 'la tablette', quand: T(20, 8, 14, 32) });
  });
  it('un enregistrement sans marque n’en invente pas', () => {
    expect(marqueAppareil({})).toBeNull();
    expect(marqueAppareil(null)).toBeNull();
    expect(marqueAppareil({ _appareil: { nom: 'la tablette' } })).toBeNull();   // sans id : inutilisable
  });
  it('pas d’empreinte sans identifiant d’appareil', () => {
    expect(empreinteAppareil({ nom: 'la tablette' })).toBeNull();
  });
});

describe('heureCourte / jourEtHeure', () => {
  it('disent l’heure comme on la dit', () => {
    expect(heureCourte(T(20, 8, 14, 32))).toBe('14h32');
    expect(jourEtHeure(T(20, 8, 16, 12))).toBe('20/08 à 16h12');
  });
  it('sans date connue, ne mentent pas', () => {
    expect(heureCourte(0)).toBe('');
    expect(jourEtHeure(null)).toBe('');
  });
});

/* ── ① Le doublon (invariant 30) ──────────────────────────────────────────── */

describe('detecterDoublon — invariant 30', () => {
  const existant = edlReel({ id: 1, appareil: TABLETTE });

  it('NOMME l’appareil et l’heure — « commencé sur la tablette à 14h32 »', () => {
    const d = detecterDoublon({ edls: [existant], logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-20' });
    expect(d).toBeTruthy();
    expect(d.appareil).toBe('la tablette');
    expect(d.message).toContain('la tablette');
    expect(d.message).toContain('14h32');
  });

  it('propose LES DEUX issues : attendre, ou créer en connaissance de cause', () => {
    const d = detecterDoublon({ edls: [existant], logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-20' });
    expect(d.message).toMatch(/Attends la synchronisation/);
    expect(d.message).toMatch(/connaissance de cause/);
  });

  it('un type ou une date différents ne sont PAS un doublon', () => {
    expect(detecterDoublon({ edls: [existant], logement: 'FERRETTE-101', type: 'Sortie', date: '2026-08-20' })).toBeNull();
    expect(detecterDoublon({ edls: [existant], logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-21' })).toBeNull();
    expect(detecterDoublon({ edls: [existant], logement: 'AUTRE-1', type: 'Entrée', date: '2026-08-20' })).toBeNull();
  });

  it('compare le JOUR, pas l’horodatage complet', () => {
    const d = detecterDoublon({ edls: [existant], logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-20T09:00:00Z' });
    expect(d).toBeTruthy();
  });

  it('un EDL supprimé n’est pas un doublon', () => {
    const mort = Object.assign(edlReel({ id: 2, appareil: TABLETTE }), { _deleted: true });
    expect(detecterDoublon({ edls: [mort], logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-20' })).toBeNull();
  });

  it('LE PIÈGE — on ne se signale JAMAIS soi-même comme son propre doublon', () => {
    // Sans cette garde, ré-enregistrer un EDL déclencherait l'avertissement à
    // chaque écriture — et l'autosave du lot 1 écrit toutes les 2 secondes.
    const d = detecterDoublon({ edls: [existant], logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-20', idCourant: 1 });
    expect(d).toBeNull();
  });

  it('LE SECOND PIÈGE — on n’avertit qu’à la CRÉATION, jamais à chaque ré-écriture', () => {
    // Repéré au smoke dans l'app réelle. Une fois que l'utilisateur a répondu
    // « créer quand même », le jumeau existe LÉGITIMEMENT : reposer la question
    // à chaque enregistrement (donc à chaque fermeture de modale, pour toute la
    // vie du document) apprend à cliquer sans lire — et le prochain
    // avertissement, celui qui compte, passera à la trappe.
    const jumeau = edlReel({ id: 2, appareil: TABLETTE });
    const args = { edls: [existant, jumeau], logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-20' };
    expect(detecterDoublon({ ...args, idCourant: 1, creation: false })).toBeNull();
    // …mais créer un TROISIÈME avertit toujours.
    expect(detecterDoublon({ ...args, creation: true })).toBeTruthy();
  });

  it('sans marque d’appareil, on le dit au lieu d’inventer', () => {
    const anonyme = edlReel({ id: 3 });
    delete anonyme._modifiedAt;
    const d = detecterDoublon({ edls: [anonyme], logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-20' });
    expect(d.appareil).toBe('un autre appareil');
    expect(d.message).toContain('pas encore remonté');
  });
});

/* ── ② Le verrou consultatif (invariant 31) ───────────────────────────────── */

describe('verrouOuverture — informe, ne bloque JAMAIS (invariant 31)', () => {
  it('un EDL travaillé ailleurs est SIGNALÉ, en nommant l’appareil et l’heure', () => {
    const v = verrouOuverture(edlReel({ appareil: TABLETTE }), 'app-pc');
    expect(v.avertir).toBe(true);
    expect(v.lectureSeule).toBe(true);
    expect(v.message).toContain('la tablette');
    expect(v.message).toContain('20/08 à 14h32');
  });

  it('LE MESSAGE NE PROMET PAS un mode lecture seule qui n’existe pas encore', () => {
    // `lectureSeule` est le VERDICT ; son application à l'écran (bandeau, champs
    // désactivés) appartient aux lots 5 à 8, gelés. Annoncer « il s'ouvre en
    // lecture seule » alors que la modale s'ouvre en écriture serait un
    // mensonge à l'utilisateur — pire que se taire.
    const v = verrouOuverture(edlReel({ appareil: TABLETTE }), 'app-pc');
    expect(v.message).not.toMatch(/lecture seule/i);
    expect(v.message).toMatch(/dédoubler/);
  });

  it('LE POINT NON NÉGOCIABLE — on peut TOUJOURS reprendre', () => {
    // Tablette perdue, batterie morte, envie de finir au calme : un verrou
    // bloquant enfermerait quelqu'un debout dans un appartement.
    for (const cas of [
      verrouOuverture(edlReel({ appareil: TABLETTE }), 'app-pc'),
      verrouOuverture(edlReel({ appareil: PC }), 'app-tab'),
      verrouOuverture(edlReel(), 'app-pc'),
      verrouOuverture(null, 'app-pc'),
    ]) expect(cas.peutReprendre).toBe(true);
  });

  it('le message annonce le bouton de reprise', () => {
    expect(verrouOuverture(edlReel({ appareil: TABLETTE }), 'app-pc').message).toMatch(/Reprendre ici quand même/);
  });

  it('sur SON PROPRE appareil, aucun avertissement ni lecture seule', () => {
    const v = verrouOuverture(edlReel({ appareil: TABLETTE }), 'app-tab');
    expect(v.avertir).toBe(false);
    expect(v.lectureSeule).toBe(false);
  });

  it('un EDL jamais écrit ailleurs s’ouvre normalement', () => {
    expect(verrouOuverture(edlReel(), 'app-pc').avertir).toBe(false);
  });
});

/* ── ③ Les deux versions vivent (invariants 29, 32, 33, 34) ───────────────── */

describe('resumerSaisie — comparer sans ouvrir', () => {
  it('compte au VOLUME RÉEL : 8 pièces × 14 éléments = 112', () => {
    const r = resumerSaisie(edlReel({ pieces: 8, parPiece: 14, photos: 1 }));
    expect(r.elements).toBe(112);
    expect(r.photos).toBe(112);
    expect(r.renseignes).toBe(112);
  });
  it('un EDL vide se résume à zéro, sans casser', () => {
    expect(resumerSaisie({})).toEqual({ elements: 0, renseignes: 0, photos: 0 });
    expect(resumerSaisie(null)).toEqual({ elements: 0, renseignes: 0, photos: 0 });
  });
});

describe('nomVersionConservee', () => {
  it('donne le nom du CDC : « Ferrette-101 — version tablette du 20/08 16h12 »', () => {
    const n = nomVersionConservee(edlReel({ logement: 'Ferrette-101' }), 'la tablette', T(20, 8, 16, 12));
    expect(n).toBe('Ferrette-101 — version tablette du 20/08 16h12');
  });
});

describe('conserverLesDeuxVersions — invariants 29, 32, 33, 34', () => {
  const cleDe = r => String(r.id);                    // ce que fait store-sync pour un edl sans espace
  let compteur = 1000;
  const nouvelId = () => ++compteur;

  const monter = ({ locaux, cloud, conflits }) => conserverLesDeuxVersions({
    dbCloud: cloud, edlsLocaux: locaux, clesEnConflit: conflits, cleDe, nouvelId, maintenant: T(20, 8, 17, 0),
  });

  it('LE POINT DUR — la version locale SURVIT comme un enregistrement distinct', () => {
    // Invariant 29. Aujourd'hui elle est purement et simplement écrasée.
    const local = edlReel({ id: 7, appareil: TABLETTE, parPiece: 14 });
    const serveur = edlReel({ id: 7, appareil: PC, parPiece: 10 });
    const r = monter({ locaux: [local], cloud: { edl: [serveur] }, conflits: ['7'] });
    expect(r.db.edl).toHaveLength(2);
    expect(r.conserves).toHaveLength(1);
    // La version serveur est acceptée normalement, à l'identique.
    expect(r.db.edl[0]).toBe(serveur);
    // La locale vit à côté, avec un identifiant NEUF.
    const copie = r.db.edl[1];
    expect(copie.id).not.toBe(7);
    expect(copie._versionConservee.idOrigine).toBe(7);
    expect(resumerSaisie(copie).elements).toBe(112);
  });

  it('elle est NOMMÉE ET DATÉE — sinon on ne saurait pas laquelle est laquelle', () => {
    const local = edlReel({ id: 7, logement: 'Ferrette-101', appareil: TABLETTE });
    const r = monter({ locaux: [local], cloud: { edl: [edlReel({ id: 7 })] }, conflits: ['7'] });
    expect(r.conserves[0].nom).toBe('Ferrette-101 — version tablette du 20/08 14h32');
  });

  it('AUCUNE FUSION n’est tentée (invariant 32)', () => {
    // Les deux enregistrements gardent leur contenu propre, intact.
    const local = edlReel({ id: 7, parPiece: 14, appareil: TABLETTE });
    const serveur = edlReel({ id: 7, parPiece: 10, appareil: PC });
    const r = monter({ locaux: [local], cloud: { edl: [serveur] }, conflits: ['7'] });
    expect(resumerSaisie(r.db.edl[0]).elements).toBe(80);    // 8 × 10, le serveur
    expect(resumerSaisie(r.db.edl[1]).elements).toBe(112);   // 8 × 14, le local
  });

  it('la copie repart par un INSERT, donc SANS conflit possible (invariant 34)', () => {
    // Un identifiant neuf ⇒ aucune ligne serveur correspondante ⇒ INSERT. Et
    // la version trackée de l'original ne doit surtout pas être héritée.
    const local = edlReel({ id: 7, appareil: TABLETTE });
    local._espaceId = 'esp-1';
    const r = monter({ locaux: [local], cloud: { edl: [] }, conflits: ['7'] });
    const copie = r.db.edl[0];
    expect(copie.id).toBeGreaterThan(1000);
    expect('_espaceId' in copie).toBe(false);
    expect(copie._modifiedAt).toBe(new Date(T(20, 8, 17, 0)).toISOString());
  });

  it('AUCUNE collection autre que « edl » n’est touchée (invariant 33)', () => {
    const cloud = { edl: [edlReel({ id: 7 })], baux: { A: { loyer: 700 } }, logements: [{ ref: 'X' }], mouvements: [1, 2] };
    const r = monter({ locaux: [edlReel({ id: 7, appareil: TABLETTE })], cloud, conflits: ['7'] });
    expect(r.db.baux).toEqual({ A: { loyer: 700 } });
    expect(r.db.logements).toEqual([{ ref: 'X' }]);
    expect(r.db.mouvements).toEqual([1, 2]);
  });

  it('un EDL NON en conflit n’est jamais dupliqué', () => {
    const r = monter({
      locaux: [edlReel({ id: 7, appareil: TABLETTE }), edlReel({ id: 8, appareil: TABLETTE })],
      cloud: { edl: [edlReel({ id: 7 }), edlReel({ id: 8 })] },
      conflits: ['7'],
    });
    expect(r.db.edl).toHaveLength(3);
    expect(r.conserves.map(c => c.idOrigine)).toEqual([7]);
  });

  it('un EDL SIGNÉ n’est jamais dupliqué — deux EDL signés seraient absurdes', () => {
    const r = monter({
      locaux: [edlReel({ id: 7, appareil: TABLETTE, signe: true })],
      cloud: { edl: [edlReel({ id: 7 })] },
      conflits: ['7'],
    });
    expect(r.conserves).toHaveLength(0);
    expect(r.db.edl).toHaveLength(1);
  });

  it('sans conflit, le DB cloud est rendu TEL QUEL', () => {
    const cloud = { edl: [edlReel({ id: 7 })] };
    const r = monter({ locaux: [edlReel({ id: 7 })], cloud, conflits: [] });
    expect(r.db).toBe(cloud);
    expect(r.conserves).toEqual([]);
  });

  it('sans les fonctions du moteur, on ne fabrique RIEN au hasard', () => {
    const cloud = { edl: [] };
    expect(conserverLesDeuxVersions({ dbCloud: cloud, edlsLocaux: [edlReel({ id: 7 })], clesEnConflit: ['7'] }).db).toBe(cloud);
  });

  it('un EDL local SUPPRIMÉ n’est pas ressuscité par la conservation', () => {
    const mort = Object.assign(edlReel({ id: 7, appareil: TABLETTE }), { _deleted: true });
    const r = monter({ locaux: [mort], cloud: { edl: [] }, conflits: ['7'] });
    expect(r.conserves).toHaveLength(0);
  });

  it('la clé du moteur est RESPECTÉE : un espace différent n’est pas le même EDL', () => {
    // store-sync distingue `7` et `7@@esp-2`. Se contenter de l'id confondrait
    // deux EDL homonymes de deux espaces partagés.
    const cle = r => String(r.id) + (r._espaceId != null ? '@@' + r._espaceId : '');
    const a = Object.assign(edlReel({ id: 7, appareil: TABLETTE }), { _espaceId: 'esp-1' });
    const b = Object.assign(edlReel({ id: 7, appareil: TABLETTE }), { _espaceId: 'esp-2' });
    const r = conserverLesDeuxVersions({
      dbCloud: { edl: [] }, edlsLocaux: [a, b], clesEnConflit: ['7@@esp-2'],
      cleDe: cle, nouvelId, maintenant: T(20, 8, 17, 0),
    });
    expect(r.conserves).toHaveLength(1);
    expect(r.db.edl[0]._versionConservee.appareil).toBe('la tablette');
  });
});

describe('messageVersionsConservees — le contraire du silence', () => {
  it('dit que la saisie n’a PAS été écrasée, et ce qu’il faut faire', () => {
    const local = edlReel({ id: 7, logement: 'Ferrette-101', appareil: TABLETTE });
    const r = conserverLesDeuxVersions({
      dbCloud: { edl: [] }, edlsLocaux: [local], clesEnConflit: ['7'],
      cleDe: x => String(x.id), nouvelId: () => 999, maintenant: T(20, 8, 17, 0),
    });
    const m = messageVersionsConservees(r.conserves);
    expect(m).toMatch(/n’a PAS été écrasée/);
    expect(m).toContain('112 éléments');
    expect(m).toContain('112 photos');
    expect(m).toMatch(/rien n’a été fusionné/);
  });
  it('rien à annoncer : pas de message vide bavard', () => {
    expect(messageVersionsConservees([])).toBe('');
    expect(messageVersionsConservees(null)).toBe('');
  });
});
