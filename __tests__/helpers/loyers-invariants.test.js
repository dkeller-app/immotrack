import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CDC-QUITTANCES-IRL — invariants STRUCTURELS, vérifiés sur le code source.
 *
 * Ces tests ne mesurent pas un calcul : ils empêchent une régression d'ARCHITECTURE.
 * Un moteur d'imputation qui repousse (I6) ou une émission automatique qui revient (I13)
 * ne se voient pas dans un test de valeur — seulement dans le source.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Tous les .js du répertoire js/ (récursif), hors vendor. */
function jsFiles(dir = 'js', out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) { if (e.name !== 'vendor') jsFiles(rel, out); }
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

/**
 * Retire les commentaires (// et bloc) pour ne scanner que du code exécutable.
 * ⚠️ Le `/*` doit être suivi d'une espace, d'une étoile ou d'un `!` : sinon
 * `accept="image/*"` ouvrirait un faux commentaire qui avalerait 45 000 caractères
 * d'index.html (piège rencontré pendant l'écriture de ces tests).
 */
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s*!][\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const SOURCES = ['index.html', ...jsFiles()];

/** Source sans commentaires, MÉMOÏSÉE : index.html fait 3,7 Mo, le stripper est cher. */
const _stripCache = new Map();
const codeOf = (rel) => {
  if (!_stripCache.has(rel)) _stripCache.set(rel, stripComments(read(rel)));
  return _stripCache.get(rel);
};

// ═══════════════════════════════════════════════════════════════════════════
//  I6 — Une seule source d'imputation paiement → mois
// ═══════════════════════════════════════════════════════════════════════════

describe('I6 — aucun rattachement paiement→mois hors des 3 moteurs sanctionnés', () => {
  // Les seuls moteurs autorisés : _loyerArrearsPass / _computeLoyerNetting /
  // _computeLoyerStatut (décisions 09/07 et 14/07, CDC-FINANCES § H-1).
  const INTERDITS = ['_matcheMois', '_qaMatcheMois', '_matchPaiementQuittance'];

  for (const nom of INTERDITS) {
    it(`${nom} n'existe plus nulle part dans le code`, () => {
      const coupables = [];
      for (const f of SOURCES) {
        const code = codeOf(f);
        if (new RegExp('\\b' + nom + '\\b').test(code)) coupables.push(f);
      }
      expect(coupables).toEqual([]);
    });
  }

  it('_statutQuittance ne reçoit plus la liste des mouvements (module ET shadow inline)', () => {
    // S'il reprenait `mouvements` en paramètre, il re-ferait fatalement un rattachement.
    const defs = [];
    for (const f of ['index.html', 'js/core/quittances-actives.js']) {
      const m = read(f).match(/function _statutQuittance\(([^)]*)\)/g) || [];
      defs.push(...m);
    }
    expect(defs.length).toBe(2);
    defs.forEach(d => {
      expect(d).not.toMatch(/mouvements/);
      expect(d).toMatch(/ctx/);
    });
  });

  it('loyers-mois.js ne calcule aucun arriéré lui-même : il consomme _loyerArrearsPass', () => {
    const src = read('js/core/loyers-mois.js');
    expect(src).toMatch(/import \{ _loyerArrearsPass \} from '\.\/loyer-du-mois\.js'/);
    // Marqueurs de l'algorithme d'imputation (files de manques) : ils ne doivent vivre
    // QUE dans loyer-du-mois.js.
    const code = stripComments(src);
    expect(code).not.toMatch(/loyerQ|chargeQ|function recover/);
  });

  it('index.html n\'assemble le contexte du verdict qu\'en un seul endroit', () => {
    const code = codeOf('index.html');
    expect((code.match(/function _loyerEtatLot\(/g) || []).length).toBe(1);
    expect((code.match(/function _loyerPayeDuMois\(/g) || []).length).toBe(1);
    // et il délègue bien au module (pas de re-implémentation locale)
    expect(code).toMatch(/window\.etatMoisLot\(months/);
  });

  it('le document quittance ne re-somme plus les mouvements d\'un mois calendaire', () => {
    const code = codeOf('index.html');
    // L'ancien scan `(m.date||'').startsWith(prefixMois)` de _buildQuittanceHtml était un
    // rattachement paiement→mois déguisé : il déclarait « non payé » un loyer d'août réglé
    // le 2 septembre. Le montant reçu vient désormais de _loyerPayeDuMois.
    expect(code).not.toMatch(/startsWith\(prefixMois\)/);
    expect(code).toMatch(/_loyerPayeDuMois\(q\.logement, prefixMois\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Étape 2 — C4 : le montant d'une quittance vient du BARÈME, pas du bail courant
// ═══════════════════════════════════════════════════════════════════════════

describe('C4/I5 — une seule fabrique de quittance, adossée au barème', () => {
  const code = codeOf('index.html');

  it('_creerQuittance est l\'unique fabrique et lit _duMoisLot', () => {
    expect((code.match(/function _creerQuittance\(/g) || []).length).toBe(1);
    const body = code.slice(code.indexOf('function _creerQuittance('),
      code.indexOf('function genAllQuit('));
    expect(body).toMatch(/_duMoisLot\(ref, ym\)/);
    // C4 : plus jamais le loyer d'aujourd'hui comme montant d'une quittance
    expect(body).not.toMatch(/hc:\s*bail\.hc/);
    expect(body).not.toMatch(/bail\?\.hc/);
  });

  it('aucun push direct dans DB.quittances hors de la fabrique', () => {
    // Une seule porte d'écriture : impossible de créer une quittance sans passer par
    // le garde-fou du solde et le barème du mois.
    const pushes = code.match(/DB\.quittances\.push\(/g) || [];
    expect(pushes.length).toBe(1);
  });

  it('la fabrique passe par le garde-fou peutQuittancer (I4)', () => {
    const body = fnBody(code, '_creerQuittance');
    expect(body).toMatch(/window\.peutQuittancer\(_loyerEtatLot\(ref\), ym\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I13 — aucune quittance sans clic explicite
// ═══════════════════════════════════════════════════════════════════════════

/** Corps approximatif d'une fonction top-level d'index.html (jusqu'à la suivante). */
function fnBody(code, nom) {
  const i = code.indexOf('function ' + nom + '(');
  if (i < 0) return '';
  const j = code.indexOf('\nfunction ', i + 1);
  return code.slice(i, j < 0 ? code.length : j);
}

/** Noms des fonctions top-level qui contiennent chaque occurrence de `needle`. */
function appelantsDe(code, needle) {
  const out = new Set();
  const fns = [...code.matchAll(/\nfunction ([A-Za-z_$][\w$]*)\s*\(/g)]
    .map(m => ({ nom: m[1], i: m.index }));
  let pos = 0;
  for (;;) {
    const k = code.indexOf(needle, pos);
    if (k < 0) break;
    pos = k + needle.length;
    if (code.slice(Math.max(0, k - 9), k) === 'function ') continue;   // la déclaration, pas un appel
    let cur = '(hors fonction)';
    for (const f of fns) { if (f.i < k) cur = f.nom; else break; }
    out.add(cur);
  }
  return out;
}

describe('I13 — aucun chemin de code ne crée une quittance sans clic explicite', () => {
  const code = codeOf('index.html');

  // Les 3 chemins d'émission automatique du constat C1, plus leurs 3 réglages (C2).
  const DISPARUS = [
    'genAllQuit',                 // « ⚡ Générer ce mois » : émettait pour tout lot occupé
    '_quittancesAutoGenAtBoot',   // émission au démarrage
    '_planQuittancesAGenerer',    // son planificateur
    'openQuitManuelle', 'saveQuit', // « + Manuelle » : montants tapés à la main (D4)
    'quittancesAutoGen',          // réglage global (C2)
    'paymentMatchedMvtId'         // association auto paiement→quittance au save d'un mouvement
  ];
  for (const nom of DISPARUS) {
    it(`${nom} n'existe plus dans le code`, () => {
      expect(new RegExp('\\b' + nom + '\\b').test(code)).toBe(false);
      for (const f of jsFiles()) {
        expect(new RegExp('\\b' + nom + '\\b').test(codeOf(f))).toBe(false);
      }
    });
  }

  it('`bail.quittAutoGen` ne pilote plus rien — la donnée est seulement reportée', () => {
    // D21 : on retire l'écran, jamais la donnée. La seule mention restante doit être le report
    // défensif dans saveBail (sinon un enregistrement de bail effacerait le champ).
    const occ = code.match(/quittAutoGen/g) || [];
    expect(occ.length).toBe(2);   // `DB.baux[ref].quittAutoGen` + la clé recopiée
    expect(fnBody(code, 'saveBail')).toMatch(/quittAutoGen: !!\(DB\.baux\[ref\]/);
  });

  it('enregistrer un mouvement ne crée aucune quittance', () => {
    const body = fnBody(code, 'saveMv');
    expect(body).not.toMatch(/_creerQuittance/);
    expect(body).not.toMatch(/DB\.quittances\.push/);
  });

  it('le démarrage de l\'app ne crée aucune quittance', () => {
    // Tout ce qui tourne au boot est hors des handlers de clic : aucune fabrique ne doit
    // y être appelée, ni directement ni via un ancien planificateur.
    expect(code).not.toMatch(/_quittancesAutoGenAtBoot/);
    const horsFonction = appelantsDe(code, '_creerQuittance(');
    expect(horsFonction.has('(hors fonction)')).toBe(false);
  });

  it('la fabrique n\'est appelée que depuis le geste explicite « Faire une quittance »', () => {
    const appelants = [...appelantsDe(code, '_creerQuittance(')]
      .filter(n => n !== '_creerQuittance');
    // Chaque appelant doit être joignable par un onclick (geste utilisateur).
    for (const nom of appelants) {
      expect(code).toMatch(new RegExp('onclick="[^"]*\\b' + nom + '\\('));
    }
    expect(appelants.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Étape 4 — l'onglet « Loyers » (D1/D3/D5/D11)
// ═══════════════════════════════════════════════════════════════════════════

describe('D1/D3/D11 — l\'onglet Loyers remplace l\'onglet Quittances', () => {
  const code = codeOf('index.html');

  it('rQuit() a disparu, rLoyers() le remplace', () => {
    // C5 : l'onglet Quittances était un HISTORIQUE (les quittances déjà émises), pas une
    // file de travail — il ne montrait jamais un loyer encaissé restant à quittancer.
    expect(code).not.toMatch(/\brQuit\b/);
    expect((code.match(/function rLoyers\(/g) || []).length).toBe(1);
    expect(code).toMatch(/loyers:\(\)=>\{initFilters\(\);rLoyers\(\);\}/);
  });

  it('D3 — le bloc « Quittances demandées » est trié par la case du bail', () => {
    const body = fnBody(code, 'rLoyers');
    expect(body).toMatch(/e\.demande && e\.aQuittancer\.length/);
    expect(fnBody(code, '_lyEtatLot')).toMatch(/bail\.quittanceDemandee/);
  });

  it('D11 — UN seul courrier de relance, aucun « rappel de charges » séparé', () => {
    expect((code.match(/function _lyRelance\(/g) || []).length).toBe(1);
    expect((code.match(/function _buildRelanceHtml\(/g) || []).length).toBe(1);
    expect(code).not.toMatch(/[Rr]appel de charges/);
    // Le tableau vient de la cascade, pas d'un calcul local.
    expect(fnBody(code, '_lyRelance')).toMatch(/window\.lignesRelance\(etat/);
  });

  it('l\'écran ne recalcule rien : il lit le verdict et la case du bail', () => {
    const body = fnBody(code, 'rLoyers');
    expect(body).not.toMatch(/DB\.mouvements/);
    expect(body).not.toMatch(/_duMoisLot/);
  });

  it('le reçu de paiement partiel n\'écrit RIEN en base (art. 21 : un reçu, pas un titre)', () => {
    const body = fnBody(code, '_lyRecuPartiel');
    expect(body).toMatch(/_buildQuittanceHtml/);
    expect(body).not.toMatch(/_creerQuittance|DB\.quittances\.push|saveDB/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Étape 7 — D20 : la table INSEE est un RÉGLAGE, et elle ne casse rien hors ligne
// ═══════════════════════════════════════════════════════════════════════════

describe('D20/I11/I12 — synchronisation INSEE', () => {
  const code = codeOf('index.html');

  it('la table IRL vit dans Paramètres — la page « Loyer (IRL) » a disparu', () => {
    const brut = read('index.html');
    expect(brut).not.toMatch(/<div class="page" id="p-irl">/);
    expect(brut).toMatch(/id="param-irl"/);
    expect(code).toMatch(/if\(page === 'irl'\) return go\('loyers', elNav\);/);
  });

  it('I12 — le filet IRL_DEFAULT existe toujours, jamais supprimé', () => {
    expect(code).toMatch(/const IRL_DEFAULT = \{/);
    // Il est bien REJOUÉ pour compléter les trimestres manquants.
    expect(code).toMatch(/Object\.entries\(IRL_DEFAULT\)\.forEach/);
  });

  it('I12 — la lecture au boot ne peut jamais bloquer le démarrage', () => {
    // Un `await` nu, ou un appel non gardé, ferait échouer le boot hors ligne.
    expect(code).toMatch(/try \{ _irlSyncInsee\(\); \} catch/);
    expect(code).not.toMatch(/await _irlSyncInsee/);
  });

  it('I11 — toute saisie manuelle est marquée : c’est ce qui la protège', () => {
    expect((code.match(/function _irlMarquerManuel\(/g) || []).length).toBe(1);
    expect(fnBody(code, 'updateIRL')).toMatch(/_irlMarquerManuel\(key\)/);
    expect(fnBody(code, 'addIRLRow')).toMatch(/_irlMarquerManuel\(key\)/);
  });

  it('la fusion vient du module, elle n’est pas réimplémentée dans index.html', () => {
    const body = fnBody(code, '_irlSyncInsee');
    expect(body).toMatch(/M\.fusionnerIrlTable\(DB\.irlTable, obs/);
    expect(body).toMatch(/M\.parseIrlSdmx\(xml/);
    expect(body).toMatch(/M\.doitSynchroniser\(DB\.params\.irlSyncAt/);
  });

  it('aucune colonne cloud nouvelle : la méta IRL vit dans DB.params', () => {
    // Un champ persistant hors params/blob exigerait une migration SQL — interdit ici.
    expect(code).toMatch(/DB\.params\.irlMeta/);
    expect(code).not.toMatch(/DB\.irlMeta/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Étape 8 — navigation (D1/D2)
// ═══════════════════════════════════════════════════════════════════════════

describe('D1/D2 — la zone Argent, et des identifiants qui disent ce qu’ils montrent', () => {
  const code = codeOf('index.html');
  const brut = read('index.html');

  it('les pages portent les nouveaux identifiants', () => {
    expect(brut).toMatch(/<div class="page" id="p-mouvements">/);
    expect(brut).toMatch(/<div class="page" id="p-loyers">/);
    expect(brut).not.toMatch(/<div class="page" id="p-quittances">/);
    expect(brut).not.toMatch(/<div class="page" id="p-irl">/);
  });

  it('D2 — une SEULE entrée de menu contient le mot « Loyers »', () => {
    const m = code.match(/const _MENU_LABELS = \{[^}]*\}/);
    expect(m).toBeTruthy();
    const avecLoyers = m[0].split(',').filter(x => /Loyers/.test(x));
    expect(avecLoyers).toHaveLength(1);
    expect(m[0]).toMatch(/mouvements:'Mouvements'/);
  });

  it('11 entrées de menu (KPI Lot 3 : « dashboard » et « pilotage » retirés), et la zone Argent en compte 4', () => {
    const all = code.match(/const _MENU_ALL = \[([^\]]*)\]/)[1].split(',').filter(Boolean);
    expect(all).toHaveLength(11);
    expect(all.join(',')).not.toMatch(/'irl'/);
    expect(all.join(',')).not.toMatch(/'dashboard'/);   // KPI Lot 3 — Tableau de bord supprimé
    expect(all.join(',')).not.toMatch(/'pilotage'/);    // KPI Lot 3 — Suivi supprimé
    const argent = code.match(/\{ z:'Argent', ids:\[([^\]]*)\] \}/)[1];
    expect(argent.split(',')).toHaveLength(4);
    expect(argent).toBe("'mouvements','loyers','regul','finances'");
  });

  it('les anciens identifiants restent joignables (favoris, historique du navigateur)', () => {
    expect(code).toMatch(/if\(page === 'quittances'\) return go\('loyers', elNav\);/);
    expect(code).toMatch(/if\(page === 'irl'\) return go\('loyers', elNav\);/);
  });

  it('le routeur rend bien chaque page renommée', () => {
    expect(code).toMatch(/mouvements:\(\)=>\{initFilters\(\);rMv\(\);\}/);
    expect(code).toMatch(/loyers:\(\)=>\{initFilters\(\);rLoyers\(\);\}/);
  });

  it('les préférences de menu enregistrées sont MIGRÉES, pas silencieusement filtrées', () => {
    const body = fnBody(code, '_menuGetOn');
    expect(body).toMatch(/window\.migrerIdsMenuLoyers\(a\)/);
    // La migration est appliquée AVANT le filtre par _MENU_ALL, sinon elle ne servirait à rien.
    expect(body.indexOf('migrerIdsMenuLoyers')).toBeLessThan(body.indexOf('_MENU_ALL.includes'));
  });

  it('aucun identifiant de page mort ne traîne dans les modèles de navigation', () => {
    // MOBILE-REFONTE : _V4_BOTTOM (barre figée à 3 pages) est remplacé par le modèle
    // FAVORIS validé (maquette NAV-FAVORIS-PROTO) — la barre du bas est désormais
    // configurable via _FAV_TABS / _FAV_ACTIONS / _FAV_DEFAULT. Le garde-fou « aucun id
    // mort (quittances/irl) » s'applique à ces nouvelles constantes.
    for (const bloc of ['_MENU_ALL', '_MENU_ZONES', '_MENU_PRESETS', '_V4_NAV_MODEL', '_FAV_TABS', '_FAV_ACTIONS', '_FAV_DEFAULT']) {
      const i = code.indexOf('const ' + bloc);
      expect(i).toBeGreaterThan(-1);
      const extrait = code.slice(i, code.indexOf(';', i));
      expect(extrait).not.toMatch(/'quittances'/);
      expect(extrait).not.toMatch(/'irl'/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Garde-fou d'outillage : index.html doit rester en CRLF
// ═══════════════════════════════════════════════════════════════════════════

describe('index.html reste en CRLF', () => {
  it('aucune ligne en LF nu', () => {
    // Piège récurrent du projet : un `sed -i` ou un formateur reflippe le fichier en LF,
    // ce qui casse la parité data-defaults et les extracteurs de gabarits, qui cherchent
    // un backtick suivi d'un point-virgule et d'un CRLF.
    const buf = fs.readFileSync(path.join(ROOT, 'index.html'));
    let lf = 0, crlf = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0x0a) { if (i > 0 && buf[i - 1] === 0x0d) crlf++; else lf++; }
    }
    expect(crlf).toBeGreaterThan(0);
    expect(lf).toBe(0);
  });
});
