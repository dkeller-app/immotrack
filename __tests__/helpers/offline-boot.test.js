/**
 * __tests__/helpers/offline-boot.test.js — chantier EDL TERRAIN, lot 4.
 *
 * CDC docs/CDC-EDL.md §9, invariants 15 à 19m. Le lot le plus sensible :
 * RGPD d'un côté (la fuite du 12/07 : Marion voyait Zito/Fric après révocation),
 * écrasement de l'autre (F1 : le travail hors ligne détruit à la reconnexion).
 */
import { describe, it, expect } from 'vitest';
import {
  classerEchecAuth, decideDemarrage, doitPousserAvantHydratation, peutSeDeconnecter,
  ongletDisponibleHorsLigne, ecritureAutoriseeHorsLigne, motifIndisponible, libelleDonneesDu,
  ONGLETS_FERMES_HORS_LIGNE, ONGLETS_OUVERTS_HORS_LIGNE,
} from '../../js/core/offline-boot.js';

/** L'erreur que rend réellement supabase-js sans réseau (cf. supabase-offline-auth.test.js). */
const ERR_RESEAU = Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 });
/** Celle d'un jeton refusé par le serveur. */
const ERR_REFUS = Object.assign(new Error('invalid JWT'), { name: 'AuthApiError', status: 401 });

describe('classerEchecAuth — F4 : panne réseau ≠ jeton refusé', () => {
  it('reconnaît l’erreur réessayable de supabase-js', () => {
    expect(classerEchecAuth(ERR_RESEAU)).toBe('reseau');
  });
  it('reconnaît un refus du serveur', () => {
    expect(classerEchecAuth(ERR_REFUS)).toBe('refus');
  });
  it('un TypeError de fetch est une panne réseau', () => {
    expect(classerEchecAuth(new TypeError('Failed to fetch'))).toBe('reseau');
  });
  it('un 403 est un refus', () => {
    expect(classerEchecAuth({ status: 403, message: 'forbidden' })).toBe('refus');
  });
  it('dans le doute, on n’invente pas : ni réseau, ni refus', () => {
    expect(classerEchecAuth(new Error('boum'))).toBe('inconnu');
    expect(classerEchecAuth(null)).toBe('inconnu');
  });
});

describe('decideDemarrage — invariants 15, 16, 17', () => {
  it('le serveur répond : comportement actuel, strictement inchangé', () => {
    expect(decideDemarrage({ user: { id: 'u1' } })).toEqual({ mode: 'normal', motif: 'serveur-ok' });
  });

  it('invariant 15 — sans réseau, session persistée + miroir « same » : l’app S’OUVRE', () => {
    const d = decideDemarrage({ erreur: ERR_RESEAU, sessionLocale: { user: { id: 'u1' } }, tagMiroir: 'same' });
    expect(d.mode).toBe('hors-ligne');
  });

  it('invariant 16 — miroir « other-user » ou « untagged » : l’app reste VIDE (RGPD)', () => {
    for (const tag of ['other-user', 'untagged', 'other-espace']) {
      const d = decideDemarrage({ erreur: ERR_RESEAU, sessionLocale: { user: { id: 'u1' } }, tagMiroir: tag });
      expect(d.mode).toBe('connexion');
      expect(d.motif).toBe('miroir-' + tag);
    }
  });

  it('invariant 17 — un jeton REFUSÉ expulse toujours, même avec un miroir « same »', () => {
    const d = decideDemarrage({ erreur: ERR_REFUS, sessionLocale: { user: { id: 'u1' } }, tagMiroir: 'same' });
    expect(d.mode).toBe('connexion');
    expect(d.motif).toBe('jeton-refuse');
  });

  it('premier lancement sur un appareil neuf sans réseau : rien à lire, écran de connexion', () => {
    const d = decideDemarrage({ erreur: ERR_RESEAU, sessionLocale: null, tagMiroir: 'untagged' });
    expect(d.mode).toBe('connexion');
    expect(d.motif).toBe('aucune-session-locale');
  });

  it('une erreur inconnue ne fait JAMAIS ouvrir l’app hors ligne', () => {
    const d = decideDemarrage({ erreur: new Error('bizarre'), sessionLocale: { user: {} }, tagMiroir: 'same' });
    expect(d.mode).toBe('connexion');
  });
});

describe('doitPousserAvantHydratation — F1, invariant 19f', () => {
  it('le travail hors ligne part AVANT que le cloud écrase la mémoire', () => {
    expect(doitPousserAvantHydratation({ tagMiroir: 'same', miroirEcritA: 2000, dernierFlushA: 1000 })).toBe(true);
  });
  it('rien à pousser si le dernier flush est postérieur à la dernière écriture', () => {
    expect(doitPousserAvantHydratation({ tagMiroir: 'same', miroirEcritA: 1000, dernierFlushA: 2000 })).toBe(false);
  });
  it('miroir jamais écrit : rien à pousser', () => {
    expect(doitPousserAvantHydratation({ tagMiroir: 'same', miroirEcritA: 0, dernierFlushA: 0 })).toBe(false);
  });
  it('on ne pousse JAMAIS le miroir de quelqu’un d’autre', () => {
    for (const tag of ['other-user', 'other-espace', 'untagged']) {
      expect(doitPousserAvantHydratation({ tagMiroir: tag, miroirEcritA: 9999, dernierFlushA: 0 })).toBe(false);
    }
  });
  it('jamais flushé mais écrit : il faut pousser (le cas d’une 1re visite hors ligne)', () => {
    expect(doitPousserAvantHydratation({ tagMiroir: 'same', miroirEcritA: 1, dernierFlushA: 0 })).toBe(true);
  });
});

describe('peutSeDeconnecter — F2, invariant 19g', () => {
  it('refuse tant qu’il reste des écritures non synchronisées, et le dit', () => {
    const r = peutSeDeconnecter({ ecrituresEnAttente: 3 });
    expect(r.peut).toBe(false);
    expect(r.enAttente).toBe(3);
    expect(r.motif).toBe('ecritures-non-synchronisees');
  });
  it('autorise quand tout est parti', () => {
    expect(peutSeDeconnecter({ ecrituresEnAttente: 0 }).peut).toBe(true);
  });
  it('l’utilisateur peut passer outre, mais c’est un acte explicite', () => {
    expect(peutSeDeconnecter({ ecrituresEnAttente: 12, forcer: true }).peut).toBe(true);
  });
});

import { verdictAuthChange, messageDeconnexionRefusee } from '../../js/core/offline-boot.js';

describe('verdictAuthChange — F4, invariant 19i (chemin qui a mordu 2× en prod)', () => {
  it('une VRAIE expiration reste détectée', () => {
    expect(verdictAuthChange({ evt: 'SIGNED_OUT', session: null, enLigne: true })).toBe('morte');
  });

  it('LE FAUX POSITIF CORRIGÉ — INITIAL_SESSION avec null n’est PAS une expiration', () => {
    // C'est l'événement d'amorçage de l'abonnement : il arrive légitimement
    // sans session. Le confondre avec une expiration affichait la bannière
    // « ta session a expiré » à un utilisateur parfaitement connecté.
    expect(verdictAuthChange({ evt: 'INITIAL_SESSION', session: null, enLigne: true })).toBe('rien');
  });

  it('LE FILET GARDÉ — une session nulle sur tout AUTRE événement reste une expiration', () => {
    // La tentation était de retirer `|| !session` en bloc. On ne le fait pas :
    // une session réellement morte annoncée autrement que par SIGNED_OUT ne
    // serait plus détectée du tout, et l'app écrirait dans le vide.
    expect(verdictAuthChange({ evt: 'TOKEN_REFRESHED', session: null, enLigne: true })).toBe('morte');
    expect(verdictAuthChange({ evt: 'USER_UPDATED', session: null, enLigne: true })).toBe('morte');
    expect(verdictAuthChange({ evt: '', session: null, enLigne: true })).toBe('morte');
  });

  it('un événement porteur de session ne déclenche rien', () => {
    expect(verdictAuthChange({ evt: 'TOKEN_REFRESHED', session: { user: {} }, enLigne: true })).toBe('rien');
    expect(verdictAuthChange({ evt: 'INITIAL_SESSION', session: { user: {} }, enLigne: true })).toBe('rien');
  });

  it('HORS LIGNE, aucune bannière « session expirée » — quel que soit l’événement', () => {
    // La bannière est FAUSSE hors ligne (les modifications sont enregistrées en
    // local) et son bouton « Se reconnecter » recharge la page : une impasse.
    for (const evt of ['SIGNED_OUT', 'TOKEN_REFRESHED', 'INITIAL_SESSION', '']) {
      expect(verdictAuthChange({ evt, session: null, enLigne: false })).toBe('hors-ligne');
    }
  });
});

describe('messageDeconnexionRefusee — F2 : on ne bloque pas en silence', () => {
  it('nomme le nombre de modifications en attente, au singulier comme au pluriel', () => {
    expect(messageDeconnexionRefusee({ enAttente: 1 }).titre).toMatch(/1 modification n’?est pas encore enregistrée|1 modification n'est pas encore enregistrée/);
    expect(messageDeconnexionRefusee({ enAttente: 4 }).titre).toContain('4 modifications ne sont pas encore enregistrées');
  });

  it('dit ce qui serait PERDU, pas seulement que c’est refusé', () => {
    const m = messageDeconnexionRefusee({ enAttente: 2 });
    expect(m.texte).toMatch(/photos/);
    expect(m.texte).toMatch(/état des lieux/);
  });

  it('distingue « pas encore envoyé » de « l’envoi a échoué »', () => {
    expect(messageDeconnexionRefusee({ enAttente: 1, raison: 'flush-impossible' }).texte).toMatch(/réseau/);
    expect(messageDeconnexionRefusee({ enAttente: 1, raison: 'non-synchronise' }).texte).not.toMatch(/pas pu aboutir/);
  });

  it('la question posée à l’utilisateur contient l’explication, jamais seule', () => {
    const m = messageDeconnexionRefusee({ enAttente: 3 });
    expect(m.question).toContain(m.texte);
    expect(m.question).toMatch(/Se déconnecter quand même \?$/);
  });

  it('un compteur absent ou nul ne produit jamais « 0 modification »', () => {
    expect(messageDeconnexionRefusee({}).titre).toContain('1 modification');
    expect(messageDeconnexionRefusee({ enAttente: 0 }).titre).not.toContain('0 modification');
  });
});

describe('le périmètre du hors ligne — invariants 19a, 19b, 19d', () => {
  it('ce qui se constate debout reste ouvert', () => {
    for (const p of ONGLETS_OUVERTS_HORS_LIGNE) expect(ongletDisponibleHorsLigne(p)).toBe(true);
  });
  it('les chiffres qui bougent avec la banque sont FERMÉS, pas affichés périmés', () => {
    for (const p of ONGLETS_FERMES_HORS_LIGNE) expect(ongletDisponibleHorsLigne(p)).toBe(false);
    expect(ongletDisponibleHorsLigne('finances')).toBe(false);
    expect(ongletDisponibleHorsLigne('loyers')).toBe(false);
    expect(ongletDisponibleHorsLigne('accueil')).toBe(false);
  });
  it('un onglet non instruit est fermé par défaut — jamais de bouton actif pour rien', () => {
    expect(ongletDisponibleHorsLigne('agenda')).toBe(false);
    expect(ongletDisponibleHorsLigne('inconnu')).toBe(false);
    expect(ongletDisponibleHorsLigne(undefined)).toBe(false);
  });
  it('l’EDL et ses photos s’écrivent hors ligne, la signature du bail NON', () => {
    expect(ecritureAutoriseeHorsLigne('edl')).toBe(true);
    expect(ecritureAutoriseeHorsLigne('edl-photo')).toBe(true);
    expect(ecritureAutoriseeHorsLigne('edl-signature-presentielle')).toBe(true);
    expect(ecritureAutoriseeHorsLigne('bail-signature')).toBe(false);
    expect(ecritureAutoriseeHorsLigne('quittance')).toBe(false);
  });
  it('le refus de signer un bail RENVOIE vers ce qui existe (invariant 19d)', () => {
    expect(motifIndisponible('bail-signature')).toMatch(/signature à distance/);
    expect(motifIndisponible('bail-signature')).toMatch(/retour/);
  });
  it('toute autre action grisée dit au moins pourquoi', () => {
    expect(motifIndisponible('quoi-que-ce-soit')).toMatch(/réseau/);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { motifOnglet } from '../../js/core/offline-boot.js';

describe('les onglets nommés existent VRAIMENT dans l’app (§A.0)', () => {
  // « L'existant n'avait pas été lu » : l'amendement A.0 du CDC est né d'écrans
  // décrits sans regarder la prod. Une liste d'onglets peuplée de noms inventés
  // ferait pire que rien — elle n'ouvrirait ni ne fermerait ce qu'elle croit.
  const pagesReelles = (() => {
    const racine = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const html = readFileSync(resolve(racine, 'index.html'), 'utf8');
    return new Set([...html.matchAll(/id="p-([a-z0-9-]+)"/g)].map(m => m[1]));
  })();

  it('l’app a bien été lue : on retrouve ses pages', () => {
    expect(pagesReelles.size).toBeGreaterThan(15);
    expect(pagesReelles.has('edl')).toBe(true);
  });

  it('chaque onglet OUVERT hors ligne est une page qui existe', () => {
    for (const id of ONGLETS_OUVERTS_HORS_LIGNE) expect(pagesReelles.has(id)).toBe(true);
  });

  it('chaque onglet FERMÉ hors ligne est une page qui existe', () => {
    for (const id of ONGLETS_FERMES_HORS_LIGNE) expect(pagesReelles.has(id)).toBe(true);
  });

  it('aucun onglet n’est à la fois ouvert et fermé', () => {
    const fermes = new Set(ONGLETS_FERMES_HORS_LIGNE);
    for (const id of ONGLETS_OUVERTS_HORS_LIGNE) expect(fermes.has(id)).toBe(false);
  });

  it('les fiches 360 sont ouvertes — le locataire et l’adresse n’y vivent que là', () => {
    for (const id of ['log-fiche', 'imm-fiche', 'ent-fiche']) {
      expect(ongletDisponibleHorsLigne(id)).toBe(true);
    }
  });
});

describe('motifOnglet — griser ne suffit pas, il faut dire pourquoi (invariant 19)', () => {
  it('les chiffres bancaires disent qu’ils seraient FAUX, pas qu’ils sont en panne', () => {
    const m = motifOnglet('finances');
    expect(m).toMatch(/imports bancaires/);
    expect(m).toMatch(/donnée fausse/);
  });
  it('ce qui exige vraiment le réseau le dit, sans parler de montants', () => {
    expect(motifOnglet('import')).toMatch(/réseau/);
    expect(motifOnglet('import')).not.toMatch(/bancaires/);
    expect(motifOnglet('emails')).toMatch(/réseau/);
  });
  it('un onglet non instruit reste expliqué, jamais muet', () => {
    expect(motifOnglet('agenda')).toBeTruthy();
    expect(motifOnglet('agenda')).toMatch(/réseau/);
    expect(motifOnglet(undefined)).toMatch(/réseau/);
  });
});

describe('libelleDonneesDu — invariant 19c', () => {
  it('nomme le jour et l’heure des données affichées', () => {
    const d = new Date(2026, 7, 19, 8, 12);      // 19/08 à 08h12
    expect(libelleDonneesDu(d)).toBe('Hors ligne — tes données du 19/08 à 08h12');
  });
  it('accepte un horodatage', () => {
    expect(libelleDonneesDu(new Date(2026, 4, 3, 14, 5).getTime())).toBe('Hors ligne — tes données du 03/05 à 14h05');
  });
  it('sans date connue, ne ment pas', () => {
    expect(libelleDonneesDu(0)).toBe('Hors ligne — données locales');
    expect(libelleDonneesDu(null)).toBe('Hors ligne — données locales');
  });
});

import { fusionnerEdlHorsLigne } from '../../js/core/offline-boot.js';

describe('fusionnerEdlHorsLigne — F1 : remonter sans rien détruire', () => {
  const edl = (id, quand, marque) => ({ id, _modifiedAt: quand, logement: 'FERRETTE-101', marque });

  it('un EDL fait hors ligne, absent du cloud, remonte', () => {
    const r = fusionnerEdlHorsLigne(
      { edl: [edl(1, '2026-08-19T08:00:00Z', 'cloud')] },
      { edl: [edl(1, '2026-08-19T08:00:00Z', 'cloud'), edl(2, '2026-08-20T10:00:00Z', 'hors-ligne')] }
    );
    expect(r.ajoutes).toEqual([2]);
    expect(r.db.edl.map(e => e.id)).toEqual([1, 2]);
  });

  it('un EDL modifié hors ligne, plus récent, écrase la version cloud', () => {
    const r = fusionnerEdlHorsLigne(
      { edl: [edl(1, '2026-08-19T08:00:00Z', 'cloud')] },
      { edl: [edl(1, '2026-08-20T10:00:00Z', 'hors-ligne')] }
    );
    expect(r.majs).toEqual([1]);
    expect(r.db.edl[0].marque).toBe('hors-ligne');
  });

  it('un miroir EN RETARD ne fait pas revenir une vieille version', () => {
    const r = fusionnerEdlHorsLigne(
      { edl: [edl(1, '2026-08-20T12:00:00Z', 'cloud-recent')] },
      { edl: [edl(1, '2026-08-19T08:00:00Z', 'miroir-vieux')] }
    );
    expect(r.majs).toEqual([]);
    expect(r.db.edl[0].marque).toBe('cloud-recent');
  });

  it('LE POINT DUR — un EDL présent au cloud et ABSENT du miroir n’est JAMAIS supprimé', () => {
    // C'est le travail d'un autre appareil, ou d'un associé, arrivé pendant
    // qu'on était hors ligne. Un « charge le miroir puis flushe » l'aurait effacé.
    const r = fusionnerEdlHorsLigne(
      { edl: [edl(1, '2026-08-19T08:00:00Z', 'a-nous'), edl(9, '2026-08-20T09:00:00Z', 'de-marion')] },
      { edl: [edl(1, '2026-08-20T10:00:00Z', 'hors-ligne')] }
    );
    expect(r.db.edl.map(e => e.id).sort()).toEqual([1, 9]);
    expect(r.db.edl.find(e => e.id === 9).marque).toBe('de-marion');
  });

  it('aucune autre collection n’est touchée par la fusion', () => {
    const cloud = { edl: [], baux: { A: { loyer: 700 } }, logements: [{ ref: 'X' }], params: { v: 1 } };
    const r = fusionnerEdlHorsLigne(cloud, { edl: [edl(2, '2026-08-20T10:00:00Z')], baux: { A: { loyer: 999 } }, logements: [] });
    expect(r.db.baux).toEqual({ A: { loyer: 700 } });
    expect(r.db.logements).toEqual([{ ref: 'X' }]);
    expect(r.db.params).toEqual({ v: 1 });
  });

  it('rien à remonter : le DB cloud est rendu TEL QUEL (aucune écriture inutile)', () => {
    const cloud = { edl: [edl(1, '2026-08-19T08:00:00Z')] };
    const r = fusionnerEdlHorsLigne(cloud, { edl: [edl(1, '2026-08-19T08:00:00Z')] });
    expect(r.db).toBe(cloud);
    expect(r.ajoutes).toEqual([]);
    expect(r.majs).toEqual([]);
  });

  it('un miroir vide ou mal formé ne casse rien', () => {
    const cloud = { edl: [edl(1, '2026-08-19T08:00:00Z')] };
    expect(fusionnerEdlHorsLigne(cloud, null).db).toBe(cloud);
    expect(fusionnerEdlHorsLigne(cloud, { edl: [null, { pasDId: true }] }).db.edl).toHaveLength(1);
  });

  it('à la seconde près, l’égalité garde le cloud', () => {
    const r = fusionnerEdlHorsLigne(
      { edl: [edl(1, '2026-08-20T10:00:00Z', 'cloud')] },
      { edl: [edl(1, '2026-08-20T10:00:00Z', 'miroir')] }
    );
    expect(r.db.edl[0].marque).toBe('cloud');
  });
});

import { classerMiroirHorsLigne } from '../../js/core/offline-boot.js';

describe('classerMiroirHorsLigne — RGPD hors ligne (invariant 16)', () => {
  const tag = (u, e) => JSON.stringify({ userId: u, espaceId: e });

  it('le miroir de CET utilisateur est lisible', () => {
    expect(classerMiroirHorsLigne(tag('u1', 'esp1'), 'u1')).toBe('same');
  });
  it('le miroir d’un AUTRE utilisateur ne l’est jamais (le cas Marion)', () => {
    expect(classerMiroirHorsLigne(tag('u2', 'esp2'), 'u1')).toBe('other-user');
  });
  it('tag absent, illisible ou incomplet : untagged, donc app vide', () => {
    expect(classerMiroirHorsLigne(null, 'u1')).toBe('untagged');
    expect(classerMiroirHorsLigne('pas du json', 'u1')).toBe('untagged');
    expect(classerMiroirHorsLigne(JSON.stringify({ userId: 'u1' }), 'u1')).toBe('untagged');
    expect(classerMiroirHorsLigne(JSON.stringify({ espaceId: 'e' }), 'u1')).toBe('untagged');
  });
  it('sans utilisateur connu, on ne lit rien', () => {
    expect(classerMiroirHorsLigne(tag('u1', 'esp1'), null)).toBe('untagged');
    expect(classerMiroirHorsLigne(tag('u1', 'esp1'), '')).toBe('untagged');
  });
});

import {
  filtrerMiroirParEspacesAutorises, classerResumeFlush, MIROIR_KEY, MIROIR_ECRIT_KEY,
  COLLECTIONS_TAGUEES,
} from '../../js/core/offline-boot.js';

describe('filtrerMiroirParEspacesAutorises — la fenêtre RGPD du hors ligne', () => {
  // Le filtre d'espace protégeait la REMONTÉE, pas l'AFFICHAGE : `onHorsLigne`
  // injectait le miroir ENTIER, et Logements/Locataires/fiches 360 sont ouverts
  // hors ligne. Une associée révoquée, sans réseau, revoyait tout — l'incident
  // du 12/07 à l'identique, sur un chemin neuf.
  const miroir = () => ({
    edl:        [{ id: 1, _espaceId: 'perdu' }, { id: 2, _espaceId: 'ok' }, { id: 3 }],
    logements:  [{ ref: 'A', _espaceId: 'perdu' }, { ref: 'B' }],
    entites:    [{ nom: 'SCI PERDUE', _espaceId: 'perdu' }, { nom: 'MOI' }],
    mouvements: [{ id: 9, _espaceId: 'perdu' }],
    baux:       { 'A-1': { loyer: 700, _espaceId: 'perdu' }, 'B-1': { loyer: 500 } },
    params:     { dashRenderV: 'v2' },
  });

  it('LE POINT DUR — un espace révoqué disparaît de TOUTES les collections', () => {
    const r = filtrerMiroirParEspacesAutorises(miroir(), ['ok']);
    expect(r.edl.map(e => e.id).sort()).toEqual([2, 3]);
    expect(r.logements.map(l => l.ref)).toEqual(['B']);
    expect(r.entites.map(e => e.nom)).toEqual(['MOI']);
    expect(r.mouvements).toEqual([]);
    expect(Object.keys(r.baux)).toEqual(['B-1']);
  });

  it('`baux` est une MAP, pas un tableau : la traiter comme les autres la viderait', () => {
    const r = filtrerMiroirParEspacesAutorises(miroir(), ['ok']);
    expect(Array.isArray(r.baux)).toBe(false);
    expect(r.baux['B-1'].loyer).toBe(500);
  });

  it('l’espace PROPRE (sans tag) passe toujours — sinon l’app serait vide chez soi', () => {
    const r = filtrerMiroirParEspacesAutorises(miroir(), []);
    expect(r.edl.map(e => e.id)).toEqual([3]);
    expect(r.logements.map(l => l.ref)).toEqual(['B']);
  });

  it('un espace PARTAGÉ légitime reste visible — on ne casse pas la SCI', () => {
    const r = filtrerMiroirParEspacesAutorises(miroir(), ['ok', 'perdu']);
    expect(r.edl).toHaveLength(3);
    expect(Object.keys(r.baux).sort()).toEqual(['A-1', 'B-1']);
  });

  it('fail-safe : liste inconnue → on ne garde que ce qu’on sait justifier', () => {
    for (const permis of [null, undefined]) {
      const r = filtrerMiroirParEspacesAutorises(miroir(), permis);
      expect(r.edl.map(e => e.id)).toEqual([3]);
    }
  });

  it('les collections NON taguées ne sont jamais touchées', () => {
    const r = filtrerMiroirParEspacesAutorises(miroir(), ['ok']);
    expect(r.params).toEqual({ dashRenderV: 'v2' });
  });

  it('un DB absent ou mal formé ne casse rien', () => {
    expect(filtrerMiroirParEspacesAutorises(null, ['ok'])).toBeNull();
    expect(filtrerMiroirParEspacesAutorises({}, ['ok'])).toEqual({});
  });

  it('la liste des collections taguées ne prétend pas couvrir `baux`', () => {
    // `baux` est traité à part (c'est une map) : l'inclure ici la viderait.
    expect(COLLECTIONS_TAGUEES).not.toContain('baux');
    expect(COLLECTIONS_TAGUEES).toContain('logements');
    expect(COLLECTIONS_TAGUEES).toContain('edl');
  });
});

describe('classerResumeFlush — une règle, un endroit', () => {
  it('compte erreurs, conflits, refus et configuration en échec', () => {
    const c = classerResumeFlush({ errors: [{ coll: 'edl' }], conflicts: [{ coll: 'baux' }], skipped: [{ coll: 'edl' }], config: 'error' });
    expect(c.enAttente).toBe(4);
  });
  it('« seulement bloquées » exige des refus ET RIEN D’AUTRE', () => {
    expect(classerResumeFlush({ skipped: [{ coll: 'edl' }] }).seulementBloquees).toBe(true);
    expect(classerResumeFlush({ skipped: [{ coll: 'edl' }], errors: [{ coll: 'edl' }] }).seulementBloquees).toBe(false);
    expect(classerResumeFlush({ skipped: [{ coll: 'edl' }], config: 'error' }).seulementBloquees).toBe(false);
    expect(classerResumeFlush({ errors: [{ coll: 'edl' }] }).seulementBloquees).toBe(false);
  });
  it('nomme les collections, sans doublon', () => {
    const c = classerResumeFlush({ errors: [{ coll: 'edl' }, { coll: 'edl' }], conflicts: [{ coll: 'baux' }], skipped: [] });
    expect(c.quoi.sort()).toEqual(['baux', 'edl']);
  });
  it('un résumé propre ou absent ne bloque rien', () => {
    expect(classerResumeFlush({ upserts: [{ coll: 'edl' }] }).enAttente).toBe(0);
    expect(classerResumeFlush(null).enAttente).toBe(0);
    expect(classerResumeFlush(null).seulementBloquees).toBe(false);
  });
});

describe('F1 — un EDL SUPPRIMÉ ailleurs ne ressuscite pas', () => {
  it('LE PIÈGE — absent du cloud ne veut pas dire jamais monté', () => {
    // L'hydratation exclut les soft-deleted : un EDL supprimé sur le PC est
    // ABSENT du DB serveur. Le reverser le ressuscite, et le moteur le repousse
    // en `revived`. On n'ajoute que ce qui a été écrit APRÈS le dernier envoi.
    const cloud = { edl: [] };
    const supprimeAilleurs = { id: 5, _modifiedAt: '2026-08-10T08:00:00Z' };   // antérieur au flush
    const faitHorsLigne  = { id: 6, _modifiedAt: '2026-08-20T10:00:00Z' };     // postérieur
    const r = fusionnerEdlHorsLigne(cloud, { edl: [supprimeAilleurs, faitHorsLigne] },
      { dernierFlushA: Date.parse('2026-08-15T00:00:00Z') });
    expect(r.ajoutes).toEqual([6]);
    expect(r.ignoresSupprimes).toEqual([5]);
  });

  it('sans dernier envoi connu, on remonte quand même — ne rien remonter serait la perte', () => {
    const r = fusionnerEdlHorsLigne({ edl: [] }, { edl: [{ id: 5, _modifiedAt: '2026-08-10T08:00:00Z' }] });
    expect(r.ajoutes).toEqual([5]);
  });

  it('un EDL sans date d’écriture remonte (on ne le condamne pas sur une absence)', () => {
    const r = fusionnerEdlHorsLigne({ edl: [] }, { edl: [{ id: 5 }] }, { dernierFlushA: Date.now() });
    expect(r.ajoutes).toEqual([5]);
  });
});

describe('MIROIR_KEY — une seule définition de la clé du miroir', () => {
  it('vaut la clé de PROD', () => {
    expect(MIROIR_KEY).toBe('immotrack_v4');
  });
  it('les clés dérivées en découlent, elles ne sont pas réécrites', () => {
    expect(MIROIR_ECRIT_KEY).toBe(MIROIR_KEY + '_ecrit_at');
  });
});
