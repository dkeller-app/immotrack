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

/** Retire les commentaires (// et bloc) pour ne scanner que du code exécutable. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const SOURCES = ['index.html', ...jsFiles()];

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
        const code = stripComments(read(f));
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
    const code = stripComments(read('index.html'));
    expect((code.match(/function _loyerEtatLot\(/g) || []).length).toBe(1);
    expect((code.match(/function _loyerPayeDuMois\(/g) || []).length).toBe(1);
    // et il délègue bien au module (pas de re-implémentation locale)
    expect(code).toMatch(/window\.etatMoisLot\(months/);
  });

  it('le document quittance ne re-somme plus les mouvements d\'un mois calendaire', () => {
    const code = stripComments(read('index.html'));
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
  const code = stripComments(read('index.html'));

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
    const body = code.slice(code.indexOf('function _creerQuittance('),
      code.indexOf('function genAllQuit('));
    expect(body).toMatch(/window\.peutQuittancer\(_loyerEtatLot\(ref\), ym\)/);
  });
});
