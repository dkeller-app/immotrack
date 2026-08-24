/**
 * __tests__/helpers/saveDB-miroir-horodate.test.js — chantier EDL TERRAIN, lot 4.
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══════════════════════════════════════════
 * Le lot 4 fait horodater par `saveDB` la dernière écriture du miroir
 * localStorage. C'est cet horodatage que F1 compare au dernier flush réussi
 * pour décider s'il faut REJOUER LE MIROIR sur les données du cloud
 * (`doitPousserAvantHydratation`, js/core/offline-boot.js).
 *
 * La première écriture du lot posait la clé EN DUR (`'immotrack_v4_ecrit_at'`)
 * alors que `KEY` est namespacée : elle vaut `_test_immotrack_v4` sous
 * `?sandbox=1`. Conséquence mesurée en revue : **chaque smoke en sandbox
 * horodatait le namespace de PROD**, et au démarrage prod suivant F1 croyait à
 * du travail non synchronisé et rejouait un miroir périmé sur les vraies
 * données. L'agent qui teste devenait celui qui casse.
 *
 * Ce test n'inspecte AUCUN extrait de source : il extrait la fonction `saveDB`
 * d'index.html, l'EXÉCUTE avec un faux localStorage, et regarde ce qui a été
 * écrit. Muter la ligne (remettre la clé en dur) fait rougir le 2e cas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Extrait le corps complet d'une déclaration `function <nom>(` par appariement d'accolades. */
function extraireFonction(src, nom) {
  const debut = src.indexOf('function ' + nom + '(');
  if (debut < 0) throw new Error('fonction introuvable dans index.html : ' + nom);
  const ouvre = src.indexOf('{', debut);
  let prof = 0, i = ouvre;
  for (; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) { i++; break; } }
  }
  return src.slice(debut, i);
}

/** localStorage de laboratoire : on veut savoir ce qui a été écrit, et où. */
function fauxStockage({ plein = false } = {}) {
  const m = new Map();
  return {
    setItem: (k, v) => {
      if (plein) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(String(k), String(v));
    },
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    removeItem: (k) => { m.delete(String(k)); },
    cles: () => [...m.keys()],
  };
}

let faireSaveDB;

beforeAll(() => {
  const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  const src = extraireFonction(html, 'saveDB');
  // Les dépendances optionnelles de saveDB sont toutes gardées par
  // `typeof x === 'function'` : sur un identifiant non déclaré, `typeof` rend
  // 'undefined' sans lever. On n'a donc à fournir que les dépendances DURES.
  const usine = new Function(
    'window', 'localStorage', 'KEY', 'DB', '_CLOUD_BOOT', '_saveDBQuotaWarn',
    src + '\nreturn saveDB;'
  );
  faireSaveDB = ({ KEY, stockage, modeCloud = true, db = { baux: {}, logements: [] } }) => {
    const win = { __immoSupabaseMode: modeCloud };
    const alertes = [];
    const fn = usine(win, stockage, KEY, db, false, (e) => alertes.push(e));
    return { saveDB: fn, win, alertes };
  };
});

describe('saveDB — l’horodatage du miroir est DÉRIVÉ de KEY (lot 4, F1)', () => {
  it('en PROD, l’horodatage accompagne le miroir de prod', () => {
    const st = fauxStockage();
    const { saveDB } = faireSaveDB({ KEY: 'immotrack_v4', stockage: st });
    expect(saveDB()).toBe(true);
    expect(st.getItem('immotrack_v4')).toBeTruthy();
    expect(Number(st.getItem('immotrack_v4_ecrit_at'))).toBeGreaterThan(0);
  });

  it('LE POINT DUR — en SANDBOX, le namespace de PROD n’est JAMAIS touché', () => {
    // Le scénario réel : l'agent smoke en `?sandbox=1`. Si cette assertion
    // tombe, chaque smoke arme F1 sur les vraies données de Didier.
    const st = fauxStockage();
    const { saveDB } = faireSaveDB({ KEY: '_test_immotrack_v4', stockage: st });
    saveDB();
    expect(st.getItem('_test_immotrack_v4')).toBeTruthy();
    expect(Number(st.getItem('_test_immotrack_v4_ecrit_at'))).toBeGreaterThan(0);
    // Aucune clé écrite ne doit appartenir au namespace de prod.
    expect(st.getItem('immotrack_v4_ecrit_at')).toBeNull();
    expect(st.getItem('immotrack_v4')).toBeNull();
    expect(st.cles().every(k => k.startsWith('_test_'))).toBe(true);
  });

  it('l’horodatage n’est écrit QU’AVEC le miroir : deux clés, pas plus', () => {
    const st = fauxStockage();
    const { saveDB } = faireSaveDB({ KEY: 'immotrack_v4', stockage: st });
    saveDB();
    expect(st.cles().sort()).toEqual(['immotrack_v4', 'immotrack_v4_ecrit_at']);
  });

  it('mémoire pleine : rien n’est horodaté, et saveDB renvoie FAUX (F8, invariant 19l)', () => {
    // Un horodatage posé alors que le miroir n'a PAS été écrit ferait croire à
    // F1 qu'il existe du travail local à rejouer — sur un miroir périmé.
    const st = fauxStockage({ plein: true });
    const { saveDB, alertes } = faireSaveDB({ KEY: 'immotrack_v4', stockage: st });
    expect(saveDB()).toBe(false);
    expect(st.cles()).toEqual([]);
    expect(alertes).toHaveLength(1);
  });

  it('hors mode cloud, saveDB n’horodate rien (le hors ligne ne concerne que le miroir cloud)', () => {
    const st = fauxStockage();
    const { saveDB } = faireSaveDB({ KEY: 'immotrack_v4', stockage: st, modeCloud: false });
    expect(saveDB()).toBe(true);
    expect(st.getItem('immotrack_v4')).toBeTruthy();
    expect(st.getItem('immotrack_v4_ecrit_at')).toBeNull();
  });
});

describe('la clé lue par le lot 4 est bien celle qu’écrit la PROD', () => {
  it('MIROIR_ECRIT_KEY == KEY de prod + le suffixe', async () => {
    // supabase-entry.js ne tourne JAMAIS en mode test (commentaire verrouillé
    // ligne 65) : il lit le namespace de prod. Les deux moitiés doivent se
    // rejoindre, sinon F1 ne se déclenche jamais — un silence, pas une erreur.
    const { MIROIR_ECRIT_KEY } = await import('../../js/core/offline-boot.js');
    const st = fauxStockage();
    const { saveDB } = faireSaveDB({ KEY: 'immotrack_v4', stockage: st });
    saveDB();
    expect(st.getItem(MIROIR_ECRIT_KEY)).toBeTruthy();
  });
});

/* ═══ Invariant 19a — LE GARDE D'ÉCRITURE HORS LIGNE ════════════════════════
   « Hors ligne, AUCUNE écriture n'aboutit en dehors de l'EDL et des signatures
   présentielles » (CDC §9). La règle vivait dans le module et n'était appliquée
   NULLE PART — un audit l'a relevée : test vert, règle absente. Elle est
   désormais appliquée dans `saveDB`, le point de passage unique de toute
   persistance. Ces tests l'EXÉCUTENT. */
describe('saveDB — invariant 19a : hors ligne, seul l’EDL s’écrit', () => {
  /** Monte saveDB avec le garde réel branché sur le vrai module. */
  function avecGarde({ horsLigne }) {
    const st = fauxStockage();
    const refus = [];
    const { saveDB, win } = faireSaveDB({ KEY: 'immotrack_v4', stockage: st });
    win.__immoHorsLigne = horsLigne;
    return { st, refus, saveDB, win };
  }

  it('en LIGNE, le garde est inerte : rien ne change', async () => {
    const { st, saveDB, win } = avecGarde({ horsLigne: false });
    win.__immoEcritureHorsLigneOK = () => { throw new Error('ne doit pas être consulté en ligne'); };
    expect(saveDB()).toBe(true);
    expect(st.getItem('immotrack_v4')).toBeTruthy();
  });

  it('LE POINT DUR — hors ligne, une écriture NON étiquetée est REFUSÉE et rien n’est écrit', async () => {
    // Le scénario réel : hors ligne, « Logements » reste ouvert pour consulter
    // sur place. Rien n'empêchait d'y corriger un téléphone. Ça s'écrivait dans
    // le miroir, puis la remontée ne reverse que les EDL : la correction était
    // effacée par l'hydratation, SANS UN MESSAGE.
    const { ecritureAutoriseeHorsLigne } = await import('../../js/core/offline-boot.js');
    const { st, saveDB, win } = avecGarde({ horsLigne: true });
    const vus = [];
    win.__immoEcritureHorsLigneOK = (quoi) => { vus.push(quoi); return ecritureAutoriseeHorsLigne(quoi); };
    expect(saveDB()).toBe(false);
    expect(st.cles()).toEqual([]);                 // RIEN n'a été écrit
    expect(vus).toEqual([undefined]);              // le garde a bien été consulté
  });

  it('hors ligne, une écriture d’EDL passe — sinon on bloquerait la visite elle-même', async () => {
    const { ecritureAutoriseeHorsLigne } = await import('../../js/core/offline-boot.js');
    const { st, saveDB, win } = avecGarde({ horsLigne: true });
    win.__immoEcritureHorsLigneOK = (quoi) => ecritureAutoriseeHorsLigne(quoi);
    for (const quoi of ['edl', 'edl-photo', 'edl-pieces', 'edl-signature-presentielle']) {
      st.cles().forEach(k => st.removeItem(k));
      expect(saveDB({ quoi })).toBe(true);
      expect(st.getItem('immotrack_v4')).toBeTruthy();
    }
  });

  it('hors ligne, une écriture de BAIL ou de loyer est refusée (invariants 19a, 19d)', async () => {
    const { ecritureAutoriseeHorsLigne } = await import('../../js/core/offline-boot.js');
    const { st, saveDB, win } = avecGarde({ horsLigne: true });
    win.__immoEcritureHorsLigneOK = (quoi) => ecritureAutoriseeHorsLigne(quoi);
    for (const quoi of ['bail', 'bail-signature', 'quittance', 'loyer', 'logement']) {
      expect(saveDB({ quoi })).toBe(false);
    }
    expect(st.cles()).toEqual([]);
  });

  it('sans garde installé, on n’invente aucune règle : tout passe', () => {
    // Un blocage inventé sans verdict rendrait l'app inutilisable sans que rien
    // ne l'explique — pire que la fuite qu'on cherche à fermer.
    const { st, saveDB } = avecGarde({ horsLigne: true });   // pas de __immoEcritureHorsLigneOK
    expect(saveDB()).toBe(true);
    expect(st.getItem('immotrack_v4')).toBeTruthy();
  });
});

/* ═══ Invariant 19k — F6 / F7 : l'autosave ne capture rien, n'audite rien ═══ */
describe('saveDB — invariant 19k : l’autosave ne prend AUCUNE capture d’annulation', () => {
  /** Monte saveDB en observant les crochets d'annulation et d'audit. */
  function avecCrochets(opts) {
    const st = fauxStockage();
    const vus = [];
    const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
    const src = extraireFonction(html, 'saveDB');
    const usine = new Function(
      'window', 'localStorage', 'KEY', 'DB', '_CLOUD_BOOT', '_saveDBQuotaWarn',
      '_undoOnSaveDB', '_undoOnSaveDBSuccess', '_auditFlushPending',
      src + '\nreturn saveDB;'
    );
    const fn = usine(
      { __immoSupabaseMode: true }, st, 'immotrack_v4', { baux: {}, logements: [] }, false, () => {},
      () => vus.push('capture-avant'), () => vus.push('capture-apres'), () => vus.push('audit')
    );
    return { fn, vus, st };
  }

  it('une écriture NORMALE capture bien l’annulation et vide la file d’audit', () => {
    const { fn, vus } = avecCrochets();
    fn();
    expect(vus).toContain('capture-avant');
    expect(vus).toContain('capture-apres');
    expect(vus).toContain('audit');
  });

  it('LE POINT DUR — en AUTOSAVE, aucune capture d’annulation n’est prise', () => {
    // F6 : `structuredClone(DB)` complet (1 à 2 Mo) toutes les 2 s, 20 états
    // retenus — jusqu'à ~40 Mo sur un téléphone, et les 20 emplacements
    // d'annulation remplis de « Modification » d'une seule visite.
    const { fn, vus } = avecCrochets();
    fn({ autosave: true });
    expect(vus).not.toContain('capture-avant');
    expect(vus).not.toContain('capture-apres');
  });

  it('l’écriture a bien lieu malgré l’absence de capture', () => {
    const { fn, st } = avecCrochets();
    expect(fn({ autosave: true })).toBe(true);
    expect(st.getItem('immotrack_v4')).toBeTruthy();
  });
});
