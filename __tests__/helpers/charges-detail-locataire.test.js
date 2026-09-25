/**
 * CHARGES — le détail par locataire (factures) doit rester ATTEIGNABLE depuis chaque vue.
 *
 * Régression constatée le 25/09 : le rendu téléphone de la liste (v15.637, `_regRenderPhone`) et la
 * vue globale (PC `_rgShowGlobal`, téléphone `_rgShowGlobalPhone` v15.640) ne menaient plus au détail
 * « Ce qu'il y a derrière » — la liste des factures d'un locataire. Rien n'avait été supprimé : un
 * rendu additif court-circuitait le seul chemin qui y menait. Règle : prouver qu'on atteint encore
 * tout ce qu'on déplace.
 *
 * 1. COMPORTEMENT — `_rgDetailLocHtml(r)` (extraite d'index.html, évaluée avec des stubs) rend les
 *    factures et les totaux TELS QUE `computeRegul` les donne : aucun recalcul d'argent (R-0).
 * 2. ACCÈS — chaque point d'entrée (liste PC, liste téléphone, vue globale PC, vue globale
 *    téléphone) mène au détail, par un contrôle libellé (jamais une icône ou un texte seul).
 * 3. CHARTE — l'écran Charges n'utilise plus de couleur codée en dur.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html, css;
beforeAll(() => {
  html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, '');
  css = readFileSync(resolve(repoRoot, 'css/main.css'), 'utf8').replace(/\r/g, '');
});

/** Corps d'une fonction de premier niveau (même découpe que les autres tests de câblage). */
function corpsDe(src, nom) {
  const re = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(src);
  if (!m) return null;
  const fin = src.indexOf('\n}', m.index);
  return fin === -1 ? null : src.slice(m.index, fin + 2);
}
const codeSeul = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Évalue `_rgDetailLocHtml` avec des stubs minimaux (échappement réel, format lisible). */
function chargerDetail() {
  const src = corpsDe(html, '_rgDetailLocHtml');
  if (!src) return null;
  const escHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmt = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2) + ' €';
  const fd = (s) => s;
  // eslint-disable-next-line no-new-func
  return new Function('escHtml', 'fmt', 'fd', src + '\nreturn _rgDetailLocHtml;')(escHtml, fmt, fd);
}

const OCC = {
  ref: 'TIL-A1', loc: 'Alice Martin', entryKey: 'TIL-A1',
  charges: 563.43, provisions: 540,
  details: [
    { date: '2026-05-10', lib: 'Entretien parties communes', repartition: 'Prorata 36% (365j)', montant: 163.43, mvId: 9002 },
    { date: '2026-03-15', lib: 'Facture Veolia eau T1 · Eau froide', repartition: 'Eau froide · Proportionnel', montant: 300, mvId: 9001 },
  ],
};

describe('1 · comportement du détail (factures d’un locataire)', () => {
  it('_rgDetailLocHtml existe (sinon tout ce fichier serait vrai par le vide)', () => {
    expect(chargerDetail()).toBeTypeOf('function');
  });

  it('liste chaque facture : date, libellé, répartition, quote-part — triées par date', () => {
    const out = chargerDetail()(OCC);
    expect(out).toContain('TIL-A1');
    expect(out).toContain('Alice Martin');
    const iVeolia = out.indexOf('Facture Veolia eau T1');
    const iEntretien = out.indexOf('Entretien parties communes');
    expect(iVeolia).toBeGreaterThan(-1);
    expect(iEntretien).toBeGreaterThan(-1);
    expect(iVeolia, 'les factures doivent être triées par date').toBeLessThan(iEntretien);
    expect(out).toContain('Eau froide · Proportionnel');
    expect(out).toContain('300.00 €');
    expect(out).toContain('163.43 €');
  });

  it('affiche les totaux de computeRegul SANS les recalculer (R-0 : Finances fait foi)', () => {
    // Totaux volontairement ≠ somme des lignes : le rendu doit afficher r.charges / r.provisions tels quels.
    const r = { ...OCC, charges: 999.99, provisions: 111.11 };
    const out = chargerDetail()(r);
    expect(out).toContain('999.99 €');
    expect(out).toContain('111.11 €');
    expect(out).toContain('-888.88 €');        // solde = provisions − charges, déjà fourni par la ligne
    expect(out).toMatch(/à demander/);
    expect(out).not.toContain('463.43 €');     // la somme des lignes n'est jamais recalculée
  });

  it('solde positif → « à restituer » avec signe +', () => {
    const out = chargerDetail()({ ...OCC, charges: 500, provisions: 630 });
    expect(out).toContain('+130.00 €');
    expect(out).toMatch(/à restituer/);
  });

  it('aucune facture → message explicite, pas de tableau vide muet', () => {
    const out = chargerDetail()({ ...OCC, details: [] });
    expect(out).toMatch(/Aucune charge répartie/);
  });

  it('les libellés sont échappés (XSS)', () => {
    const out = chargerDetail()({ ...OCC, details: [{ date: '2026-01-01', lib: '<img src=x onerror=alert(1)>', repartition: 'x', montant: 1 }] });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});

describe('2 · le détail est atteignable depuis chaque vue, par un contrôle libellé', () => {
  it('liste PC (rRegul) : le détail est rendu par _rgDetailLocHtml et ouvert par un bouton « Détail »', () => {
    const code = codeSeul(corpsDe(html, 'rRegul'));
    expect(code).toContain('_rgDetailLocHtml(');
    expect(code, 'bouton libellé « Détail » absent de la ligne logement').toMatch(/_rgToggleDet\([^)]*\)[^<]*>[\s\S]{0,80}Détail/);
  });

  it('liste TÉLÉPHONE (_regRenderPhone) : chaque carte porte le détail et un bouton libellé pour l’ouvrir', () => {
    const code = codeSeul(corpsDe(html, '_regRenderPhone'));
    expect(code, 'le rendu téléphone ne rend plus le détail des factures').toContain('_rgDetailLocHtml(');
    expect(code).toMatch(/Détail des charges/);
  });

  it('vue globale PC (_rgShowGlobal) : chaque colonne-locataire ouvre son détail', () => {
    const code = codeSeul(corpsDe(html, '_rgShowGlobal'));
    expect(code).toContain('_rgOuvrirDetailLoc(');
  });

  it('vue globale TÉLÉPHONE (_rgShowGlobalPhone) : chaque ligne du récap par lot ouvre son détail', () => {
    const code = codeSeul(corpsDe(html, '_rgShowGlobalPhone'));
    expect(code).toContain('_rgOuvrirDetailLoc(');
    expect(code).toMatch(/Détail/);
  });

  it('_rgOuvrirDetailLoc revient à la liste puis ouvre le détail du bon locataire', () => {
    const code = codeSeul(corpsDe(html, '_rgOuvrirDetailLoc') || '');
    expect(code, '_rgOuvrirDetailLoc absent').not.toBe('');
    expect(code).toMatch(/_rgBackToList\(|rRegul\(/);
    expect(code).toMatch(/entryKey|data-ek/);
    expect(code).toMatch(/scrollIntoView/);
  });
});

describe('3 · charte : plus de couleur codée en dur dans l’écran Charges', () => {
  const HEX = /#[0-9a-fA-F]{3,8}\b/;

  it('main.css — aucune règle .rg-* ne code une couleur en dur (hex / rgba)', () => {
    const fautes = css.split('\n')
      .filter((l) => /^\s*\.rg-/.test(l))
      .filter((l) => HEX.test(l) || /rgba\(/.test(l));
    expect(fautes, fautes.join('\n')).toEqual([]);
  });

  it('les vues globales et le détail n’écrivent aucune couleur en dur dans leur HTML', () => {
    for (const nom of ['_rgShowGlobal', '_rgShowGlobalPhone', '_rgDetailLocHtml']) {
      const code = codeSeul(corpsDe(html, nom) || '');
      expect(code, nom + ' introuvable').not.toBe('');
      expect(HEX.test(code), nom + ' contient une couleur hex').toBe(false);
    }
  });

  it('le CSS téléphone de l’écran Charges n’a plus de repli hex (#e08a2b, #5b9bd5, #fff…)', () => {
    const code = corpsDe(html, '_ensureRegulPhCss') || '';
    expect(code).not.toBe('');
    const fautes = code.split('\n').filter((l) => HEX.test(l));
    expect(fautes, fautes.join('\n')).toEqual([]);
  });
});
