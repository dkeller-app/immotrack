/**
 * XSS — une donnée placée dans une CHAÎNE JS d'un attribut on…= doit passer par _lyQ, jamais par escHtml seul.
 * escHtml encode « ' » en « &#39; », que le parseur HTML décode AVANT que le JS ne lise l'attribut : la
 * chaîne se ferme et la suite du nom s'exécute (XSS stocké entre membres d'une SCI partagée).
 * _lyQ échappe d'abord pour le JS (\\ et \') puis pour le HTML.
 *
 * 1. Geste réel : le bouton « + Mouvement » de la fiche logement (Compta), logement nommé  a'b);alert(1);//
 *    → l'attribut décodé puis exécuté n'appelle jamais alert et le toast reçoit le nom intact.
 * 2. Garde-fou : plus aucun escHtml/esc collé à une chaîne JS ouverte dans un attribut on…= de js/.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

const corpsDe = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  if (i === -1) throw new Error(nom + ' introuvable — le test ne teste plus rien');
  const j = html.indexOf('\n}', i);
  return html.slice(i, j + 2);
};

/** Décodage d'attribut HTML (ce que fait le navigateur avant de compiler le gestionnaire). */
const decodeAttr = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function rendreCompta(ref) {
  const deps = {
    _logFicheComptaYear: 2026,
    _renderComptaKPIsForLog: () => '', _renderComptaCashFlowChart: () => '', _renderMvForLog: () => '',
    _renderEtat12Mois: () => '', _uiIcon: () => '', _renderLoyerHistoInline: () => '', _renderLoyerHisto: () => ''
  };
  const noms = Object.keys(deps);
  const src = ['escHtml', '_lyQ', '_renderLogFichePanelCompta'].map(corpsDe).join('\n');
  const f = new Function(...noms, src + '\nreturn _renderLogFichePanelCompta;');
  const render = f(...noms.map((n) => deps[n]));
  return render({ ref }, ref);
}

describe('bouton « + Mouvement » de la fiche logement — nom de logement piégé', () => {
  for (const nom of ["a'b);alert(1);//", "x\\');alert(1);//", 'q"><img src=x onerror=alert(1)>', "l'Atelier « 2 »"]) {
    it('aucune exécution, chaîne intacte : ' + nom, () => {
      const out = rendreCompta(nom);
      const m = /onclick="(openNewMv\(\);showToast\([^"]*)"/.exec(out);
      expect(m, 'bouton + Mouvement introuvable').toBeTruthy();
      const code = decodeAttr(m[1]);
      const appels = { alert: 0, toast: [], open: 0 };
      // eslint-disable-next-line no-new-func
      new Function('openNewMv', 'showToast', 'alert', code)(
        () => { appels.open++; },
        (...a) => { appels.toast.push(a); },
        () => { appels.alert++; }
      );
      expect(appels.alert).toBe(0);
      expect(appels.open).toBe(1);
      expect(appels.toast).toHaveLength(1);
      expect(appels.toast[0][0]).toBe('Penser à sélectionner « ' + nom + ' » dans le champ Logement');
    });
  }
});

describe('garde-fou : pas d\'escHtml seul dans une chaîne JS d\'attribut on…=', () => {
  it('js/ ne contient plus aucun « \'${escHtml(…) » ni « \\\'\' + escHtml(…) » dans un gestionnaire', () => {
    const files = [];
    (function walk(d) {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) { if (!/vendor|node_modules/.test(f)) walk(p); } else if (/\.(js|mjs)$/.test(f)) files.push(p);
      }
    })(resolve(repoRoot, 'js'));
    expect(files.length).toBeGreaterThan(20);
    const fautes = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        const re = /\bon[a-z]+=\\?"/g; let m;
        while ((m = re.exec(l))) {
          // segment de l'attribut : jusqu'au guillemet fermant (hors ${…})
          let k = m.index + m[0].length, prof = 0;
          for (; k < l.length; k++) {
            if (l[k] === '$' && l[k + 1] === '{') { prof++; k++; continue; }
            if (l[k] === '}' && prof > 0) { prof--; continue; }
            if (l[k] === '"' && prof === 0) break;
          }
          const seg = l.slice(m.index, k).replace(/escHtml\(_frAttr\(/g, '_frAttr(');  // escHtml(_frAttr(x)) ≡ _lyQ(x)
          if (/(\\'|'|« )\s*(\+\s*|\$\{)\s*(escHtml|esc)\(/.test(seg)) fautes.push(relative(repoRoot, f) + ':' + (i + 1));
        }
      });
    }
    expect(fautes).toEqual([]);
  });
});
