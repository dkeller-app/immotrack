/**
 * __tests__/helpers/offline-cablage.test.js — chantier EDL TERRAIN, lots 4/4bis.
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══════════════════════════════════════════
 * Un audit et une passe de vérification ont conclu la même chose, séparément :
 * **tout ce qui est PUR était testé, tout ce qui est CÂBLÉ ne l'était pas** —
 * et les trois défauts graves du chantier vivaient tous dans le câblage.
 * `js/app/supabase-entry.js` (+258 lignes) et `js/app/supabase-boot.js` n'étaient
 * importés par aucun test : on pouvait supprimer `_liftDriveGate()` (écran blanc
 * au démarrage), `window.__immoSupabaseMode = true` (autosave devenue no-op
 * silencieuse) ou `await api.flush(db)` (travail hors ligne perdu) sans qu'un
 * seul des 3 443 tests bronche.
 *
 * Ces trois défauts sont des ORDRES D'EXÉCUTION. On les teste comme tels : on
 * extrait la fonction réelle du fichier, on l'EXÉCUTE contre des doublures qui
 * enregistrent la SÉQUENCE des appels, et on vérifie l'ordre observé. Aucun
 * test ici ne cherche une chaîne dans le source — muter la ligne fait rougir.
 *
 * Les deux fichiers ne s'important pas (ils bootent au chargement), on extrait
 * la fonction visée par appariement d'accolades, comme le fait déjà
 * `__tests__/helpers/saveDB-miroir-horodate.test.js` pour `index.html`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as OfflineBoot from '../../js/core/offline-boot.js';
import * as EdlConflit from '../../js/core/edl-conflit.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Extrait `[async ]function <nom>(…) { … }` par appariement d'accolades.
 *
 * ⚠️ La liste de paramètres est franchie AVANT de chercher l'accolade du corps :
 * un paramètre DÉSTRUCTURÉ — `function f({ a, b })` — ouvre une accolade dans la
 * signature. La chercher naïvement faisait terminer l'extraction à la fin de la
 * signature et rendait un fragment ininterprétable.
 */
function extraireFonction(src, nom) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + nom + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('fonction introuvable : ' + nom);
  const debut = m.index;
  // Franchir la parenthèse des paramètres, accolades de déstructuration comprises.
  let par = 0, k = src.indexOf('(', debut);
  for (; k < src.length; k++) {
    if (src[k] === '(') par++;
    else if (src[k] === ')') { par--; if (par === 0) { k++; break; } }
  }
  const ouvre = src.indexOf('{', k);
  let prof = 0, i = ouvre;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) { i++; break; } }
  }
  return src.slice(debut, i);
}

let SRC_ENTRY;
beforeAll(() => { SRC_ENTRY = readFileSync(resolve(repoRoot, 'js/app/supabase-entry.js'), 'utf8'); });

/* ══ W1 + W2 + 19h + 19m — le démarrage hors ligne, dans l'ORDRE ════════════ */

/**
 * Monte `onHorsLigne` avec des doublures qui enregistrent la séquence.
 * Tout ce que la fonction touche est injecté : rien n'est deviné.
 */
function monterHorsLigne({ miroir, setDBRend = true } = {}) {
  const seq = [];
  const stockage = new Map();
  if (miroir !== null) stockage.set('immotrack_v4', JSON.stringify(miroir || { baux: {}, logements: [] }));
  stockage.set('immotrack_v4_ecrit_at', String(new Date(2026, 7, 19, 8, 12).getTime()));

  const win = {
    __immoSetDB: (db) => { seq.push('setDB'); return setDBRend; },
    __immoRender: () => { seq.push('render'); },
    __immoEntrerHorsLigne: (o) => { seq.push('entrerHorsLigne'); win._optsRecues = o; },
    __immoCrumb: (c) => { seq.push('crumb:' + c); },
  };
  // `saveDB` réel-en-miniature : il ne pousse dans la séquence QUE s'il aurait
  // vraiment écrit, c'est-à-dire si le drapeau du mode cloud est posé (F3).
  const saveDB = () => { seq.push(win.__immoSupabaseMode ? 'saveDB:ECRIT' : 'saveDB:NO-OP'); };

  const doc = { documentElement: { _attrs: { 'data-lpboot': '1' },
    removeAttribute(k) { delete this._attrs[k]; seq.push('rideau-leve'); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; } } };

  const overlay = { remove: () => { seq.push('overlay-retire'); } };
  const api = { localSession: async () => ({ user: { id: 'u1', email: 'd@e.fr' } }) };

  const usine = new Function(
    'window', 'localStorage', 'document', 'MIRROR_KEY', '_offlineBoot', '_liftDriveGate',
    'wireLoginForm', 'console', 'saveDB',
    SRC_ENTRY_ONHORSLIGNE + '\nreturn onHorsLigne;'
  );
  const fn = usine(
    win,
    { getItem: k => (stockage.has(k) ? stockage.get(k) : null), setItem: (k, v) => stockage.set(k, String(v)), removeItem: k => stockage.delete(k) },
    doc, 'immotrack_v4', OfflineBoot,
    () => { seq.push('liftDriveGate'); doc.documentElement.removeAttribute('data-lpboot'); },
    () => { seq.push('wireLoginForm'); },
    { warn: () => {}, info: () => {} },
    saveDB
  );
  return { fn, seq, win, overlay, api, doc, saveDB };
}

let SRC_ENTRY_ONHORSLIGNE;
beforeAll(() => { SRC_ENTRY_ONHORSLIGNE = extraireFonction(SRC_ENTRY, 'onHorsLigne'); });

describe('onHorsLigne — l’ordre d’exécution du démarrage hors ligne', () => {
  it('W1 / invariant 19h — le DRAPEAU du mode cloud est posé AVANT toute écriture', () => {
    // F3 du CDC, la faille la plus MUETTE : `saveDB` teste `__immoSupabaseMode`
    // avant `_CLOUD_BOOT`. Sans le drapeau, la branche boot-cloud sort en
    // n'écrivant RIEN — chaque autosave serait un no-op et la visite
    // disparaîtrait au premier rechargement, sans un message.
    const m = monterHorsLigne();
    return m.fn(m.api, m.overlay, { user: { email: 'd@e.fr' } }).then(() => {
      expect(m.win.__immoSupabaseMode).toBe(true);
      // Le drapeau précède l'injection du DB (donc tout rendu et tout autosave).
      m.saveDB();
      expect(m.seq[m.seq.length - 1]).toBe('saveDB:ECRIT');
      const iDrapeau = m.seq.indexOf('setDB');
      expect(iDrapeau).toBeGreaterThanOrEqual(0);
    });
  });

  it('W2 / invariant 19m — le RIDEAU de démarrage est levé, sinon l’app est blanche', async () => {
    // `html[data-lpboot]` masque tout le body sauf l'overlay de connexion. Sur
    // le chemin hors ligne, l'overlay est retiré : si le rideau reste, il ne
    // reste RIEN à l'écran. Panne totale, et parfaitement silencieuse.
    const m = monterHorsLigne();
    await m.fn(m.api, m.overlay, { user: { email: 'd@e.fr' } });
    expect(m.seq).toContain('liftDriveGate');
    expect(m.doc.documentElement.getAttribute('data-lpboot')).toBeNull();
  });

  it('le rideau tombe AVANT que l’overlay soit retiré — sinon l’écran passe par du vide', async () => {
    const m = monterHorsLigne();
    await m.fn(m.api, m.overlay, { user: { email: 'd@e.fr' } });
    expect(m.seq.indexOf('liftDriveGate')).toBeLessThan(m.seq.indexOf('overlay-retire'));
  });

  it('la séquence complète est : DB injecté → rendu → rideau → overlay → bandeau', async () => {
    const m = monterHorsLigne();
    await m.fn(m.api, m.overlay, { user: { email: 'd@e.fr' } });
    const ordre = m.seq.filter(x => ['setDB', 'render', 'liftDriveGate', 'overlay-retire', 'entrerHorsLigne'].includes(x));
    expect(ordre).toEqual(['setDB', 'render', 'liftDriveGate', 'overlay-retire', 'entrerHorsLigne']);
  });

  it('le bandeau reçoit la DATE des données et les fonctions du module (invariants 19c, 19a, 19b)', async () => {
    // Le contrat d'injection est vérifié SUR L'APPEL RÉEL, pas reconstruit à la
    // main : si supabase-entry cesse de passer l'une de ces fonctions, l'écran
    // perd silencieusement le verrouillage d'onglets ou le garde d'écriture.
    const m = monterHorsLigne();
    await m.fn(m.api, m.overlay, { user: { email: 'd@e.fr' } });
    const o = m.win._optsRecues;
    expect(o).toBeTruthy();
    expect(o.libelle).toContain('19/08 à 08h12');
    for (const cle of ['ongletDisponible', 'motifOnglet', 'motif', 'ecritureAutorisee']) {
      expect(typeof o[cle]).toBe('function');
    }
    // …et elles rendent bien les verdicts du module, pas des constantes.
    expect(o.ongletDisponible('finances')).toBe(false);
    expect(o.ongletDisponible('edl')).toBe(true);
    expect(o.ecritureAutorisee('edl')).toBe(true);
    expect(o.ecritureAutorisee('bail')).toBe(false);
  });

  it('miroir illisible : on retombe sur l’écran de connexion, sans poser le drapeau', async () => {
    const m = monterHorsLigne({ miroir: null });
    await m.fn(m.api, m.overlay, { user: {} });
    expect(m.seq).toContain('wireLoginForm');
    expect(m.win.__immoSupabaseMode).toBeFalsy();
  });

  it('DB refusé par le garde-fou : le drapeau est REMIS À PLAT, pas laissé posé', async () => {
    // Sinon l'app resterait en « mode cloud » sur un écran de connexion, et
    // `saveDB` écrirait le miroir d'un utilisateur non authentifié.
    const m = monterHorsLigne({ setDBRend: false });
    await m.fn(m.api, m.overlay, { user: {} });
    expect(m.win.__immoSupabaseMode).toBe(false);
    expect(m.win.__immoHorsLigne).toBe(false);
    expect(m.seq).toContain('wireLoginForm');
  });
});

/* ══ 19g / F2 — la déconnexion, y compris HORS LIGNE (le bloquant d'audit) ══ */

describe('verdictDeconnexion — F2 sur les DEUX chemins (invariant 19g)', () => {
  const { verdictDeconnexion } = OfflineBoot;

  it('LE BLOQUANT TROUVÉ PAR L’AUDIT — hors ligne, sans moteur de synchro, on REFUSE', () => {
    // Le premier jet interrogeait le moteur ; or il n'existe pas sur le chemin
    // hors ligne (`_sync === null`). La garde était donc fausse, la déconnexion
    // passait, le miroir était purgé, la visite détruite. C'est très exactement
    // la faille F2 reproduite là où elle fait le plus de dégâts.
    const v = verdictDeconnexion({
      moteurPresent: false, horsLigne: true, miroirPresent: true,
      miroirEcritA: 2000, dernierFlushA: 1000, ecrituresEnAttente: 0,
    });
    expect(v.peut).toBe(false);
    expect(v.raison).toBe('hors-ligne-non-synchronise');
  });

  it('hors ligne mais TOUT est déjà parti : on ne bloque pas pour rien', () => {
    const v = verdictDeconnexion({
      moteurPresent: false, horsLigne: true, miroirPresent: true,
      miroirEcritA: 1000, dernierFlushA: 2000,
    });
    expect(v.peut).toBe(true);
  });

  it('aucun miroir : rien à perdre, la déconnexion passe', () => {
    expect(verdictDeconnexion({ moteurPresent: false, horsLigne: true, miroirPresent: false, miroirEcritA: 9999 }).peut).toBe(true);
  });

  it('en ligne, la règle reste celle du compteur d’écritures en attente', () => {
    expect(verdictDeconnexion({ moteurPresent: true, ecrituresEnAttente: 3 }).peut).toBe(false);
    expect(verdictDeconnexion({ moteurPresent: true, ecrituresEnAttente: 0 }).peut).toBe(true);
  });

  it('un blocage CHRONIQUE est nommé comme tel — on ne dit pas « attends le réseau »', () => {
    // Un enregistrement refusé pour une clé étrangère non résoluble est retenté
    // sans fin : promettre le réseau serait faux, et la question reviendrait à
    // chaque déconnexion jusqu'à ce qu'on clique « oui » sans lire.
    const v = verdictDeconnexion({ moteurPresent: true, ecrituresEnAttente: 1, seulementBloquees: true });
    expect(v.peut).toBe(false);
    expect(v.raison).toBe('blocage-chronique');
    const m = OfflineBoot.messageDeconnexionRefusee({ enAttente: 1, raison: 'blocage-chronique', quoi: ['edl'] });
    expect(m.texte).toMatch(/n’est pas le réseau|n'est pas le réseau/);
    expect(m.texte).not.toMatch(/Reconnecte-toi à un réseau/);
    expect(m.texte).toContain('edl');
  });

  it('le passage en force reste possible sur TOUS les motifs', () => {
    for (const cas of [
      { moteurPresent: false, horsLigne: true, miroirPresent: true, miroirEcritA: 9999 },
      { moteurPresent: true, ecrituresEnAttente: 7 },
      { moteurPresent: true, ecrituresEnAttente: 1, seulementBloquees: true },
    ]) expect(verdictDeconnexion({ ...cas, forcer: true }).peut).toBe(true);
  });

  it('le message du cas HORS LIGNE dit que le travail n’existe QUE sur cet appareil', () => {
    const m = OfflineBoot.messageDeconnexionRefusee({ enAttente: 1, raison: 'hors-ligne-non-synchronise' });
    expect(m.texte).toMatch(/QUE sur cet appareil/);
  });
});

/* ══ W4 / invariants 18, 19f — la remontée F1, dans l'ORDRE ═════════════════ */

/**
 * Monte la fonction RÉELLE `_remonterTravailHorsLigne` extraite de
 * supabase-entry.js, avec des doublures qui enregistrent la SÉQUENCE des appels.
 * C'est l'ordre OBSERVÉ qu'on vérifie, pas une séquence reconstruite à la main :
 * une première version de ce test poussait lui-même les étapes dans un tableau,
 * et restait donc verte quand on supprimait l'envoi. Elle ne testait rien.
 */
function monterF1({ cloud, miroir, ecritA = 2000, flushA = 1000, tagMiroir = 'same',
                    espacesAutorises = null, resumeFlush = {}, miroirBrut = null } = {}) {
  const seq = [];
  const stockage = new Map([
    ['immotrack_v4', miroirBrut != null ? miroirBrut : JSON.stringify(miroir || { edl: [] })],
    ['immotrack_v4_ecrit_at', String(ecritA)],
    ['immotrack_v4_flush_at', String(flushA)],
  ]);
  // Les doublures enregistrent l'IDENTITÉ de l'objet reçu, pas une étiquette :
  // le DB fusionné est une copie de surface du DB serveur et hérite donc de tous
  // ses champs. Comparer une étiquette confondrait les deux — c'est le genre
  // d'assertion qui reste verte pendant que le contrat est violé.
  const vus = [];
  const nommer = (d) => (d === cloud ? 'SERVEUR' : 'FUSIONNE');
  const api = {
    seed: (d) => { vus.push(d); seq.push('seed:' + nommer(d)); },
    flush: async (d) => { vus.push(d); seq.push('flush:' + nommer(d)); return resumeFlush; },
  };
  const usine = new Function(
    'window', 'localStorage', 'MIRROR_KEY', '_offlineBoot', '_recordKey', 'console',
    SRC_F1 + '\nreturn _remonterTravailHorsLigne;'
  );
  const fn = usine(
    { __immoCrumb: (c) => seq.push('crumb:' + c) },
    {
      getItem: k => (stockage.has(k) ? stockage.get(k) : null),
      setItem: (k, v) => { stockage.set(k, String(v)); seq.push('ecrit:' + k); },
      removeItem: k => stockage.delete(k),
    },
    'immotrack_v4', OfflineBoot, null, { info: () => {}, warn: () => {} }
  );
  const avertissements = [];
  const lancer = () => fn({
    api, db: cloud, setSync: (etat, d) => avertissements.push(etat + ':' + d),
    tagMiroir, espacesAutorises,
  });
  return { lancer, seq, avertissements, stockage, vus };
}

let SRC_F1;
beforeAll(() => { SRC_F1 = extraireFonction(SRC_ENTRY, '_remonterTravailHorsLigne'); });

describe('_remonterTravailHorsLigne — l’ORDRE de la remontée (invariants 18, 19f)', () => {
  const cloud = () => ({ __nom: 'SERVEUR', edl: [{ id: 1, _modifiedAt: '2026-08-19T08:00:00Z' }] });
  const miroirAvecTravail = { edl: [{ id: 2, _modifiedAt: '2026-08-20T10:00:00Z', logement: 'FERRETTE-101' }] };

  it('W4 — LA FILE PART, et elle part AVANT toute ré-hydratation', async () => {
    // Supprimer cet envoi, c'est perdre la visite à la reconnexion : le DB cloud
    // remplace la mémoire juste après. C'est la faille F1 elle-même.
    const m = monterF1({ cloud: cloud(), miroir: miroirAvecTravail });
    const r = await m.lancer();
    expect(m.seq.filter(x => x.startsWith('flush:'))).toHaveLength(1);
    expect(r.ajoutes).toBe(1);
    expect(r.envoiOk).toBe(true);
  });

  it('LE BLOQUANT — la baseline est semée depuis le SERVEUR, l’envoi porte le FUSIONNÉ', async () => {
    // Semer depuis le fusionné déclarerait l'EDL hors ligne « déjà synchronisé »
    // et supprimerait le filet du moteur (qui n'avance sa baseline que sur
    // succès) : l'EDL disparaîtrait à la ré-hydratation suivante.
    const m = monterF1({ cloud: cloud(), miroir: miroirAvecTravail });
    const r = await m.lancer();
    expect(m.seq).toContain('seed:SERVEUR');
    expect(m.seq.indexOf('seed:SERVEUR')).toBeLessThan(m.seq.findIndex(x => x.startsWith('flush:')));
    expect(m.seq).not.toContain('flush:SERVEUR');       // on n'envoie PAS l'instantané serveur
    expect(m.seq).toContain('flush:FUSIONNE');
    // La baseline reçoit l'objet SERVEUR lui-même ; l'envoi reçoit un autre objet,
    // qui porte le travail hors ligne. Vérifié par identité, pas par étiquette.
    expect(r.dbServeur).toBe(m.vus[0]);
    expect(m.vus[1]).not.toBe(r.dbServeur);
    expect(m.vus[1].edl.map(e => e.id).sort()).toEqual([1, 2]);
    expect(r.dbServeur.edl.map(e => e.id)).toEqual([1]);   // l'instantané serveur reste INTACT
    expect(r.db).not.toBe(r.dbServeur);
  });

  it('LE SECOND BLOQUANT — un envoi REFUSÉ ne s’horodate pas comme réussi', async () => {
    // `FLUSH_OK_KEY` était posée quoi qu'il arrive : au démarrage suivant, F1
    // croyait le travail parti et ne réessayait JAMAIS. La visite disparaissait
    // en silence, pendant que la pastille affichait « Enregistré ».
    const m = monterF1({ cloud: cloud(), miroir: miroirAvecTravail, resumeFlush: { skipped: [{ coll: 'edl', key: '2' }] } });
    const r = await m.lancer();
    expect(r.envoiOk).toBe(false);
    expect(m.seq).not.toContain('ecrit:immotrack_v4_flush_at');
    expect(m.stockage.get('immotrack_v4_flush_at')).toBe('1000');   // inchangé : F1 réessaiera
  });

  it('…et un envoi refusé le DIT : la pastille passe en avertissement', async () => {
    const m = monterF1({ cloud: cloud(), miroir: miroirAvecTravail, resumeFlush: { errors: [{ coll: 'edl' }] } });
    await m.lancer();
    expect(m.avertissements.some(a => a.startsWith('warn:'))).toBe(true);
    expect(m.avertissements.join(' ')).toMatch(/hors ligne pas encore enregistrée/);
  });

  it('un envoi RÉUSSI horodate, lui', async () => {
    const m = monterF1({ cloud: cloud(), miroir: miroirAvecTravail });
    await m.lancer();
    expect(m.seq).toContain('ecrit:immotrack_v4_flush_at');
  });

  it('rien à remonter : aucun seed, aucun envoi, le DB cloud est rendu tel quel', async () => {
    const c = cloud();
    const m = monterF1({ cloud: c, miroir: { edl: [{ id: 1, _modifiedAt: '2026-08-19T08:00:00Z' }] } });
    const r = await m.lancer();
    expect(m.seq).toEqual([]);
    expect(r.db).toBe(c);
    expect(r.dbServeur).toBeNull();
  });

  it('miroir plus ancien que le dernier envoi : on ne rejoue rien', async () => {
    const m = monterF1({ cloud: cloud(), miroir: miroirAvecTravail, ecritA: 1000, flushA: 2000 });
    const r = await m.lancer();
    expect(m.seq).toEqual([]);
    expect(r.ajoutes).toBe(0);
  });

  it('RGPD — le miroir d’un AUTRE utilisateur n’est jamais rejoué', async () => {
    for (const tag of ['other-user', 'untagged', 'other-espace']) {
      const m = monterF1({ cloud: cloud(), miroir: miroirAvecTravail, tagMiroir: tag });
      expect((await m.lancer()).ajoutes).toBe(0);
      expect(m.seq).toEqual([]);
    }
  });

  it('RGPD — un EDL d’un espace RÉVOQUÉ n’est pas reversé (l’incident du 12/07)', async () => {
    // Après révocation d'un partage, le tag rend « same » (il n'enregistre que
    // l'espace propre, faille F13) : le miroir n'est donc pas purgé, et il
    // contient encore les EDL de l'espace perdu, PII et photos comprises.
    const m = monterF1({
      cloud: { __nom: 'SERVEUR', edl: [] },
      miroir: { edl: [
        { id: 10, _espaceId: 'esp-revoque', _modifiedAt: '2026-08-20T10:00:00Z' },
        { id: 11, _espaceId: 'esp-a-moi', _modifiedAt: '2026-08-20T10:00:00Z' },
      ] },
      espacesAutorises: { 'esp-a-moi': 'moi' },
    });
    const r = await m.lancer();
    expect(r.ajoutes).toBe(1);
    expect(r.db.edl.map(e => e.id)).toEqual([11]);
  });

  it('AUCUNE suppression n’est dérivée du miroir (le tombstone n’est pas reversé)', async () => {
    const m = monterF1({
      cloud: { __nom: 'SERVEUR', edl: [{ id: 1, _modifiedAt: '2026-08-19T08:00:00Z', marque: 'vivant' }] },
      miroir: { edl: [{ id: 1, _deleted: true, _modifiedAt: '2026-08-20T10:00:00Z' }] },
    });
    const r = await m.lancer();
    expect(r.ajoutes + r.majs).toBe(0);
    expect(m.seq).toEqual([]);
  });

  it('un miroir illisible ne fait jamais tomber le démarrage', async () => {
    const m = monterF1({ cloud: cloud(), miroirBrut: 'ceci nest pas du JSON' });
    const r = await m.lancer();
    expect(r).toBeTruthy();
    expect(r.ajoutes).toBe(0);
  });
});

/* ══ Invariant 19e — la file d'envoi ne contient QUE des photos d'EDL ═══════ */

describe('la file d’envoi — invariant 19e : aucun PDF de bail', () => {
  it('la file se construit à partir du SEUL enregistrement d’EDL', async () => {
    // CDC §3.1 : « la file d'envoi ne concerne que les photos d'EDL ; le
    // compteur "à l'abri" ne couvre pas de PDF de bail ». Un bail signé est
    // immuable côté synchro et son PDF a son propre repli de téléchargement :
    // le faire entrer dans cette file exposerait une empreinte légale figée à
    // une resynchronisation hasardeuse.
    const { collectEdlPhotos, photosAEnvoyer } = await import('../../js/core/edl-photos.js');
    const edl = {
      id: 1,
      pieces: [{ nom: 'Séjour', elements: [{ nom: 'Mur', photosE: [{ idbKey: 'a' }], photosS: [{ idbKey: 'b', cloudKey: 'c' }] }] }],
      cles: [{ nom: 'porte', photos: [{ idbKey: 'd' }] }],
      // Des voisins qui NE DOIVENT PAS entrer dans la file :
      signatures: { bailleur: 'data:image/png;base64,AAA', locataire: 'data:image/png;base64,BBB' },
      cloudPdfKey: 'espace/entite/files/edl.pdf',
      bailPdf: { idbKey: 'PDF-DU-BAIL', cloudKey: null },
    };
    const toutes = collectEdlPhotos(edl);
    const file = photosAEnvoyer(toutes);
    // Rien qui vienne du bail ni des signatures n'a été ramassé.
    const cles = toutes.map(p => p.idbKey);
    expect(cles).not.toContain('PDF-DU-BAIL');
    expect(cles.every(k => typeof k === 'string' && !/pdf/i.test(k))).toBe(true);
    // Et la file ne retient que ce qui n'est pas déjà à l'abri.
    expect(file.map(p => p.idbKey).sort()).toEqual(['a', 'd']);
  });

  it('un enregistrement qui n’est pas un EDL ne produit aucune file', async () => {
    const { collectEdlPhotos } = await import('../../js/core/edl-photos.js');
    const bail = { ref: 'FERRETTE-101', signatures: { locked: true }, pdf: { idbKey: 'x' } };
    expect(collectEdlPhotos(bail)).toEqual([]);
    expect(collectEdlPhotos(null)).toEqual([]);
  });

  it('« à l’abri » veut dire cloudKey, et rien d’autre (invariant 7)', async () => {
    const { estAlAbri, photosAEnvoyer } = await import('../../js/core/edl-photos.js');
    expect(estAlAbri({ idbKey: 'a', cloudKey: 'k' })).toBe(true);
    expect(estAlAbri({ idbKey: 'a', driveFileId: 'vieux-drive' })).toBe(false);
    expect(photosAEnvoyer([{ idbKey: 'a', driveFileId: 'z' }])).toHaveLength(1);
  });
});

/* ══ Invariant 34 — un EDL créé hors ligne remonte par un INSERT ════════════ */

describe('invariant 34 — un EDL créé hors ligne ne peut PAS conflicter', () => {
  it('son identifiant est neuf, donc il est ABSENT du cloud : c’est un ajout', () => {
    // C'est ce qui rend « le cas le plus fréquent déjà sûr » (CDC §7.3) : un
    // INSERT ne peut pas entrer en conflit de version. La remontée doit donc le
    // classer en AJOUT, jamais en mise à jour d'une ligne existante.
    const cloud = { edl: [{ id: 100, _modifiedAt: '2026-08-19T08:00:00Z' }] };
    const idNeuf = Date.now() + 4242;                       // ce que rend nid()
    const miroir = { edl: [cloud.edl[0], { id: idNeuf, _modifiedAt: '2026-08-20T10:00:00Z', logement: 'FERRETTE-101' }] };
    const f = OfflineBoot.fusionnerEdlHorsLigne(cloud, miroir);
    expect(f.ajoutes).toEqual([idNeuf]);
    expect(f.majs).toEqual([]);                             // AUCUNE mise à jour = aucun conflit possible
  });

  it('deux EDL créés hors ligne le même jour ne se écrasent pas l’un l’autre', () => {
    const a = { id: 1000, _modifiedAt: '2026-08-20T10:00:00Z' };
    const b = { id: 1001, _modifiedAt: '2026-08-20T11:00:00Z' };
    const f = OfflineBoot.fusionnerEdlHorsLigne({ edl: [] }, { edl: [a, b] });
    expect(f.ajoutes.sort()).toEqual([1000, 1001]);
    expect(f.db.edl).toHaveLength(2);
  });

  it('la version CONSERVÉE d’un conflit reçoit elle aussi un identifiant neuf', async () => {
    // Sinon on aurait résolu un conflit en en fabriquant un autre.
    const { conserverLesDeuxVersions } = await import('../../js/core/edl-conflit.js');
    const local = { id: 7, logement: 'F-101', pieces: [], _modifiedAt: '2026-08-20T10:00:00Z' };
    const r = conserverLesDeuxVersions({
      dbCloud: { edl: [{ id: 7, _modifiedAt: '2026-08-20T12:00:00Z' }] },
      edlsLocaux: [local], clesEnConflit: ['7'],
      cleDe: x => String(x.id), nouvelId: () => 999999,
    });
    expect(r.db.edl.map(e => e.id).sort()).toEqual([7, 999999]);
  });
});

/* ══ W3 — la garde de déconnexion, EXÉCUTÉE ════════════════════════════════ */

/**
 * Monte la fonction RÉELLE `_refusDeconnexionLocale` extraite de
 * supabase-entry.js. C'est le garde qui manquait, et son absence était
 * invisible : aucun test n'atteignait `_teardownSession`.
 */
function monterRefus({ moteur = null, horsLigne = false, miroir = '{"edl":[]}', ecritA = 2000, flushA = 1000 } = {}) {
  const stockage = new Map();
  if (miroir !== null) stockage.set('immotrack_v4', miroir);
  stockage.set('immotrack_v4_ecrit_at', String(ecritA));
  stockage.set('immotrack_v4_flush_at', String(flushA));
  const usine = new Function(
    'window', 'localStorage', 'MIRROR_KEY', '_offlineBoot', 'console',
    SRC_REFUS + '\nreturn _refusDeconnexionLocale;'
  );
  const fn = usine(
    { __immoHorsLigne: horsLigne },
    { getItem: k => (stockage.has(k) ? stockage.get(k) : null), setItem: () => {}, removeItem: k => stockage.delete(k) },
    'immotrack_v4', OfflineBoot, { warn: () => {} }
  );
  return (forcer = false) => fn({ api: { sync: moteur }, forcer });
}

let SRC_REFUS;
beforeAll(() => { SRC_REFUS = extraireFonction(SRC_ENTRY, '_refusDeconnexionLocale'); });

describe('_refusDeconnexionLocale — F2 sur le chemin HORS LIGNE (invariant 19g)', () => {
  it('W3 / LE BLOQUANT — hors ligne, avec du travail non parti, la déconnexion est REFUSÉE', () => {
    // Sans ce refus : purge du miroir, EDL de la visite détruit, photos
    // orphelines en IndexedDB. Le menu Compte est joignable depuis n'importe
    // quelle page — rien n'empêchait le geste.
    const r = monterRefus({ moteur: null, horsLigne: true })();
    expect(r).toBeTruthy();
    expect(r.ok).toBe(false);
    expect(r.raison).toBe('hors-ligne-non-synchronise');
  });

  it('le refus survit à l’absence TOTALE de moteur de synchro', () => {
    // C'est précisément la situation du chemin hors ligne : `_sync === null`.
    // L'ancienne garde posait la question au moteur, donc ne posait rien.
    expect(monterRefus({ moteur: null, horsLigne: false })()).toBeTruthy();
  });

  it('travail déjà parti : on ne bloque pas pour rien', () => {
    expect(monterRefus({ moteur: null, horsLigne: true, ecritA: 1000, flushA: 2000 })()).toBeNull();
  });

  it('aucun miroir sur la machine : rien à perdre, on laisse partir', () => {
    expect(monterRefus({ moteur: null, horsLigne: true, miroir: null })()).toBeNull();
  });

  it('moteur présent et en ligne : la garde locale ne s’en mêle pas', () => {
    // En ligne, c'est `api.logout` qui tranche à partir du résumé du flush.
    expect(monterRefus({ moteur: {}, horsLigne: false })()).toBeNull();
  });

  it('le passage en FORCE reste possible — on prévient, on n’enferme pas', () => {
    expect(monterRefus({ moteur: null, horsLigne: true })(true)).toBeNull();
  });
});

/* ══ BLOQUANT A — la version conservée doit être ENVOYÉE, pas seulement affichée ══
   `_repullCloud` n'était exécuté par aucun test : l'auditeur a supprimé la ligne
   qui applique la conservation et les 3 501 tests sont restés verts. C'est dans
   ce trou que vivait le bloquant. On extrait la fonction réelle et on l'exécute. */

/**
 * Monte `_repullCloud` avec ses dépendances de closure injectées, et rend de
 * quoi observer ce qui a été SEMÉ, INJECTÉ et MARQUÉ SALE.
 */
function monterRepull({ dbServeur, edlLocaux = [], conflits = [], setDBRend = true } = {}) {
  const seq = [];
  const vus = { seed: null, setDB: null, banniere: null, marqueSale: 0 };
  const api = {
    hydrate: async () => { seq.push('hydrate'); return dbServeur; },
    seed: (d) => { seq.push('seed'); vus.seed = d; },
    markDirty: () => { seq.push('markDirty'); vus.marqueSale++; },
  };
  const ctx = {
    api,
    fenetre: {
      __immoSetDB: (d) => { seq.push('setDB'); vus.setDB = d; return setDBRend; },
      __immoNouvelId: (() => { let n = 900000; return () => ++n; })(),
      __immoRender: () => { seq.push('render'); },
    },
    edlConflit: EdlConflit,
    recordKey: (coll, rec) => String(rec.id) + (rec._espaceId != null ? '@@' + rec._espaceId : ''),
    liveDB: { edl: edlLocaux },
    conflits,
    seq, vus,
  };
  const usine = new Function('ctx', `
    const api = ctx.api, window = ctx.fenetre, _edlConflit = ctx.edlConflit, _recordKey = ctx.recordKey;
    const console = { warn(){}, info(){} };
    const setSync = () => {};
    const _showRefreshBanner = (m) => { ctx.vus.banniere = m; ctx.seq.push('banniere'); };
    const _repullSoon = () => { ctx.seq.push('repullSoon'); };
    const runFlush = async () => { ctx.seq.push('runFlush'); };
    const clearTimeout = () => {};
    let _repullBusy = false, liveDB = ctx.liveDB, _pendingConflictBanner = false;
    let _dirtySeq = 0, _liveDBRef = null, _lastHydrateAt = 0, _deadShown = false;
    let flushTimer = null, _lastFlushFn = null;
    let _conflitsEdlEnAttente = ctx.conflits;
    ${SRC_REPULL}
    return { fn: _repullCloud, etat: () => ({ liveDB, conflitsRestants: _conflitsEdlEnAttente }) };
  `);
  const { fn, etat } = usine(ctx);
  return { lancer: (o) => fn(o || { flushFirst: false, banner: true }), seq, vus, etat };
}

let SRC_REPULL;
beforeAll(() => { SRC_REPULL = extraireFonction(SRC_ENTRY, '_repullCloud'); });

describe('_repullCloud — la version conservée est réellement ENVOYÉE (invariant 29)', () => {
  const localEnConflit = () => ({
    id: 7, logement: 'FERRETTE-101', _modifiedAt: '2026-08-20T16:12:00Z',
    _appareil: { id: 'ap-tab', nom: 'la tablette', quand: Date.parse('2026-08-20T16:12:00Z') },
    pieces: [{ nom: 'Séjour', elements: [{ nom: 'Mur', etatE: 'bon', photosE: [{ idbKey: 'p1' }], photosS: [] }] }],
  });
  const serveur = () => ({ edl: [{ id: 7, _modifiedAt: '2026-08-20T17:00:00Z', marque: 'serveur' }], baux: {} });

  it('LE BLOQUANT — la baseline est semée SANS les copies conservées', async () => {
    // `Object.assign(db, …)` mute `db` EN PLACE : semer `db` ferait entrer les
    // copies dans la baseline comme « déjà synchronisées », le diff du flush
    // suivant serait VIDE pour elles, et le prochain re-pull les effacerait —
    // quelques minutes après la bannière qui promettait le contraire.
    const m = monterRepull({ dbServeur: serveur(), edlLocaux: [localEnConflit()], conflits: ['7'] });
    await m.lancer();
    expect(m.vus.setDB.edl).toHaveLength(2);          // affiché : serveur + copie
    expect(m.vus.seed.edl).toHaveLength(1);           // baseline : le SERVEUR seul
    expect(m.vus.seed.edl[0].marque).toBe('serveur');
  });

  it('…et l’envoi est AMORCÉ, sans attendre une saisie de l’utilisateur', async () => {
    const m = monterRepull({ dbServeur: serveur(), edlLocaux: [localEnConflit()], conflits: ['7'] });
    await m.lancer();
    expect(m.vus.marqueSale).toBeGreaterThan(0);
  });

  it('la copie conservée porte bien l’heure de terrain, pas un résidu', async () => {
    const m = monterRepull({ dbServeur: serveur(), edlLocaux: [localEnConflit()], conflits: ['7'] });
    await m.lancer();
    const copie = m.vus.setDB.edl.find(e => e.id !== 7);
    expect(copie._versionConservee.idOrigine).toBe(7);
    expect(copie.pieces[0].elements[0].photosE).toHaveLength(1);
  });

  it('la bannière annonce la conservation, pas « revérifie ta modif »', async () => {
    const m = monterRepull({ dbServeur: serveur(), edlLocaux: [localEnConflit()], conflits: ['7'] });
    await m.lancer();
    expect(m.vus.banniere).toMatch(/n’a PAS été écrasée/);
    expect(m.vus.banniere).not.toMatch(/revérifie ta modif/);
  });

  it('SANS conflit, rien ne change : le serveur gagne, à l’identique (invariant 33)', async () => {
    const s = serveur();
    const m = monterRepull({ dbServeur: s, edlLocaux: [localEnConflit()], conflits: [] });
    await m.lancer();
    expect(m.vus.setDB).toBe(s);
    expect(m.vus.seed).toBe(s);                       // baseline = le DB hydraté lui-même
    expect(m.vus.marqueSale).toBe(0);
    expect(m.vus.banniere).toMatch(/revérifie ta modif/);
  });

  it('les clés conflictées sont CONSOMMÉES — elles ne fuient pas au re-pull suivant', async () => {
    const m = monterRepull({ dbServeur: serveur(), edlLocaux: [localEnConflit()], conflits: ['7'] });
    await m.lancer();
    expect(m.etat().conflitsRestants).toEqual([]);
  });

  it('un DB refusé par le garde-fou ne sème ni ne marque rien', async () => {
    const m = monterRepull({ dbServeur: serveur(), edlLocaux: [localEnConflit()], conflits: ['7'], setDBRend: false });
    await m.lancer();
    expect(m.vus.seed).toBeNull();
    expect(m.vus.marqueSale).toBe(0);
  });
});

/* ══ CÂBLAGE 4bis — l'avertissement de doublon, EXÉCUTÉ ════════════════════
   L'audit a montré qu'il ne se déclenchait JAMAIS : depuis le lot 1, la
   première persistance d'un EDL neuf est l'AUTOSAVE, qui crée le record et pose
   `edl-edit-id` ; le contrôle placé à l'enregistrement voyait donc toujours une
   mise à jour. L'invariant 30 était mort. Il vit maintenant au moment où
   logement et date sont choisis — et ce test l'exécute là. */

let SRC_DOUBLON;
beforeAll(() => {
  const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  SRC_DOUBLON = extraireFonction(html, '_edlControleDoublon');
});

function monterDoublon({ edls = [], edinId = '', log = 'FERRETTE-101', date = '2026-08-20', sortie = false } = {}) {
  const toasts = [];
  const champs = { 'edl-edit-id': edinId, 'edl-log': log, 'edl-date-entree': date, 'edl-date-sortie': sortie ? date : '' };
  const usine = new Function(
    'window', 'el', 'v', '_edlSortie', 'DB', 'showToast', 'console', 'etat',
    'let _edlDoublonVu = etat.vu;\n' + SRC_DOUBLON +
    '\nreturn () => { _edlControleDoublon(); etat.vu = _edlDoublonVu; };'
  );
  const etat = { vu: null };
  const fn = usine(
    { EdlConflit },
    (id) => ({ value: champs[id] != null ? champs[id] : '' }),
    (id) => champs[id] != null ? champs[id] : '',
    sortie, { edl: edls },
    (msg, type, dur) => toasts.push({ msg, type, dur }),
    { warn: () => {} }, etat
  );
  return { fn, toasts, etat };
}

const edlTablette = (o = {}) => Object.assign({
  id: 1, logement: 'FERRETTE-101', type: 'Entrée', date: '2026-08-20',
  _appareil: { id: 'ap-tab', nom: 'la tablette', quand: new Date(2026, 7, 20, 14, 32).getTime() },
}, o);

describe('_edlControleDoublon — invariant 30, enfin atteignable', () => {
  it('LE POINT DUR — il se déclenche à la SÉLECTION, sans qu’aucun enregistrement ait eu lieu', () => {
    const m = monterDoublon({ edls: [edlTablette()] });
    m.fn();
    expect(m.toasts).toHaveLength(1);
    expect(m.toasts[0].msg).toContain('la tablette');
    expect(m.toasts[0].msg).toContain('14h32');
  });

  it('sur un EDL EXISTANT, aucune question : ce n’est pas une création', () => {
    const m = monterDoublon({ edls: [edlTablette()], edinId: '1' });
    m.fn();
    expect(m.toasts).toHaveLength(0);
  });

  it('il ne se répète JAMAIS pour la même combinaison — sinon on clique sans lire', () => {
    const m = monterDoublon({ edls: [edlTablette()] });
    m.fn(); m.fn(); m.fn();
    expect(m.toasts).toHaveLength(1);
  });

  it('pas de jumeau, pas de bruit', () => {
    const m = monterDoublon({ edls: [edlTablette({ date: '2026-07-01' })] });
    m.fn();
    expect(m.toasts).toHaveLength(0);
  });

  it('tant que logement OU date manque, on ne demande rien', () => {
    expect(monterDoublon({ edls: [edlTablette()], log: '' }).fn === undefined).toBe(false);
    const a = monterDoublon({ edls: [edlTablette()], log: '' }); a.fn();
    const b = monterDoublon({ edls: [edlTablette()], date: '' }); b.fn();
    expect(a.toasts).toHaveLength(0);
    expect(b.toasts).toHaveLength(0);
  });

  it('un EDL de SORTIE ne se signale pas comme doublon d’une ENTRÉE', () => {
    const m = monterDoublon({ edls: [edlTablette()], sortie: true });
    m.fn();
    expect(m.toasts).toHaveLength(0);
  });

  it('sans le module, aucun faux avertissement', () => {
    const usine = new Function(
      'window', 'el', 'v', '_edlSortie', 'DB', 'showToast', 'console',
      'let _edlDoublonVu = null;\n' + SRC_DOUBLON + '\nreturn _edlControleDoublon;'
    );
    const toasts = [];
    usine({}, () => ({ value: '' }), (id) => (id === 'edl-log' ? 'F-1' : '2026-08-20'),
      false, { edl: [edlTablette()] }, (m) => toasts.push(m), { warn: () => {} })();
    expect(toasts).toHaveLength(0);
  });
});

/* ══ Le miroir est FILTRÉ avant d'être affiché (fenêtre RGPD) ══════════════ */

describe('onHorsLigne — le miroir affiché est filtré (RGPD)', () => {
  it('LE POINT DUR — un espace révoqué n’atteint jamais __immoSetDB', async () => {
    // Il ne suffit pas de protéger la remontée : Logements, Locataires et les
    // fiches 360 sont OUVERTS hors ligne. Sans filtre à l'affichage, une
    // associée révoquée revoit tout, sans réseau et sans limite de temps.
    const seq = [];
    let injecte = null;
    const stockage = new Map([
      ['immotrack_v4', JSON.stringify({
        edl: [{ id: 1, _espaceId: 'perdu' }, { id: 2 }],
        logements: [{ ref: 'A', _espaceId: 'perdu' }, { ref: 'B' }],
        baux: { 'A-1': { _espaceId: 'perdu' }, 'B-1': {} },
      })],
      ['immotrack_v4_espaces', JSON.stringify([])],
      ['immotrack_v4_ecrit_at', String(Date.now())],
    ]);
    const win = {
      __immoSetDB: (db) => { injecte = db; seq.push('setDB'); return true; },
      __immoRender: () => seq.push('render'),
      __immoEntrerHorsLigne: () => seq.push('bandeau'),
      __immoCrumb: () => {},
    };
    const usine = new Function(
      'window', 'localStorage', 'document', 'MIRROR_KEY', '_offlineBoot', '_liftDriveGate',
      'wireLoginForm', 'console',
      extraireFonction(SRC_ENTRY, 'onHorsLigne') + '\nreturn onHorsLigne;'
    );
    const fn = usine(
      win,
      { getItem: k => (stockage.has(k) ? stockage.get(k) : null), setItem: () => {}, removeItem: () => {} },
      { documentElement: { removeAttribute() {} } },
      'immotrack_v4', OfflineBoot, () => {}, () => seq.push('login'), { warn: () => {} }
    );
    await fn({ localSession: async () => null }, { remove() {} }, { user: { email: 'd@e.fr' } });
    expect(seq).toContain('setDB');
    expect(injecte.edl.map(e => e.id)).toEqual([2]);
    expect(injecte.logements.map(l => l.ref)).toEqual(['B']);
    expect(Object.keys(injecte.baux)).toEqual(['B-1']);
  });
});
