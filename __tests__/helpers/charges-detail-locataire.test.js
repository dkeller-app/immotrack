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
  return new Function('escHtml', 'fmt', 'fd', '_logLabel', src + '\nreturn _rgDetailLocHtml;')(escHtml, fmt, fd, (x) => String((x && typeof x === 'object') ? x.ref : x));
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

// ── Faux DOM minimal : juste ce que touchent _rgOuvrirDetailLoc / _rgToggleDet / _rgPhToggleDet ──
function faux({ cls = [], id = '', enfants = {}, attrs = {}, display = 'none' } = {}) {
  const s = new Set(cls);
  const e = {
    id, attrs: { ...attrs }, style: { display }, scrolled: 0, focused: false,
    classList: { contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c) => (s.has(c) ? (s.delete(c), false) : (s.add(c), true)), [Symbol.iterator]: () => s[Symbol.iterator]() },
    querySelector: (sel) => enfants[sel] || null,
    closest: (sel) => enfants['closest:' + sel] || null,
    getAttribute: (n) => e.attrs[n], setAttribute: (n, v) => { e.attrs[n] = String(v); },
    scrollIntoView() { e.scrolled++; }, focus() { e.focused = true; },
  };
  return e;
}
// Vrai moteur de correspondance des sélecteurs d'attribut produits par la fonction (guillemets échappés).
const RE_SEL = /^(tr\.rg-det|\.rgph-lc|tr\.rg-imm)\[data-(ek|imm)="((?:\\.|[^"\\])*)"\]$/;
function hote(lignes) {
  return {
    querySelector(sel) {
      const m = RE_SEL.exec(sel);
      if (!m) throw new Error('sélecteur inattendu : ' + sel);
      const val = m[3].replace(/\\(.)/g, '$1');
      const l = lignes().find((x) => x.sel === m[1] && x.attr === m[2] && x.val === val);
      return l ? l.el : null;
    },
  };
}
function chargerOuvrir(env) {
  const src = corpsDe(html, '_rgOuvrirDetailLoc');
  if (!src) return null;
  // eslint-disable-next-line no-new-func
  return new Function('el', '_isPhone', '_rgBackToList', 'rRegul', '_rgToggleImm', '_rgDetAria', 'showToast', 'window', 'requestAnimationFrame', 'setTimeout',
    src + '\nreturn _rgOuvrirDetailLoc;')(env.el, env.isPhone, env.back, env.rRegul, env.toggleImm, env.aria, env.toast, {}, (cb) => cb(), () => 0);
}
// Clé d'occupation historique réelle (`ref|h0`) + guillemet et crochet pour éprouver l'échappement.
const CLE = 'TIL-A1|h0"]x';
const IMM = 'Rue "des" Tilleuls';

describe('2 · le détail est atteignable depuis chaque vue — comportement', () => {
  it('PC : ouvrir depuis la vue globale revient à la liste, déplie l’immeuble, montre la bonne ligne et pose le focus', () => {
    const titre = faux();
    const det = faux({ cls: ['rg-det', 'rgim0'], id: 'rgim0d0', enfants: { '.rg-det-h': titre } });
    const imm = faux({ cls: ['rg-imm'] });
    const appels = { back: 0, toggle: [], aria: [] };
    const host = hote(() => [{ sel: 'tr.rg-det', attr: 'ek', val: CLE, el: det }, { sel: 'tr.rg-imm', attr: 'imm', val: IMM, el: imm }]);
    const ouvrir = chargerOuvrir({
      el: (id) => (id === 'reg-cards' ? host : id === 'reg-imm' ? { value: '' } : null),
      isPhone: () => false, back: () => { appels.back++; }, rRegul: () => {},
      toggleImm: (c, row) => { appels.toggle.push([c, row]); row.classList.add('rg-open'); },
      aria: (id, o) => appels.aria.push([id, o]), toast: () => { throw new Error('ne doit pas signaler d’échec'); },
    });
    expect(ouvrir).toBeTypeOf('function');
    ouvrir(IMM, CLE);
    expect(appels.back).toBe(1);
    expect(appels.toggle).toEqual([['rgim0', imm]]);
    expect(det.style.display).toBe('');
    expect(appels.aria).toContainEqual(['rgim0d0', true]);
    expect(det.classList.contains('rg-flash')).toBe(true);
    expect(det.scrolled).toBeGreaterThanOrEqual(1);
    expect(titre.focused).toBe(true);
  });

  it('PC : immeuble déjà déplié → on ne le replie pas', () => {
    const det = faux({ cls: ['rg-det', 'rgim3'], id: 'rgim3d1' });
    const imm = faux({ cls: ['rg-imm', 'rg-open'] });
    let toggles = 0;
    const host = hote(() => [{ sel: 'tr.rg-det', attr: 'ek', val: CLE, el: det }, { sel: 'tr.rg-imm', attr: 'imm', val: IMM, el: imm }]);
    chargerOuvrir({ el: (id) => (id === 'reg-cards' ? host : null), isPhone: () => false, back: () => {}, rRegul: () => {}, toggleImm: () => { toggles++; }, aria: () => {}, toast: () => {} })(IMM, CLE);
    expect(toggles).toBe(0);
    expect(det.style.display).toBe('');
  });

  it('TÉLÉPHONE : la carte du locataire s’ouvre (hidden=false, aria-expanded=true) et défile à l’écran', () => {
    const btn = faux({ attrs: { 'aria-expanded': 'false' } });
    const bloc = { hidden: true };
    const carte = faux({ cls: ['rgph-lc'], enfants: { '.rgph-detbtn': btn, '.rgph-det': bloc } });
    const host = hote(() => [{ sel: '.rgph-lc', attr: 'ek', val: CLE, el: carte }]);
    chargerOuvrir({ el: (id) => (id === 'reg-cards' ? host : null), isPhone: () => true, back: () => {}, rRegul: () => {}, toggleImm: () => {}, aria: () => {}, toast: () => {} })(IMM, CLE);
    expect(bloc.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(carte.scrolled).toBeGreaterThanOrEqual(1);
  });

  it('filtre immeuble différent → recalé sur l’immeuble de la vue globale puis ligne retrouvée', () => {
    const det = faux({ cls: ['rg-det', 'rgim0'], id: 'rgim0d0' });
    const select = { value: 'Autre immeuble' };
    let rendus = 0;
    const host = hote(() => (rendus ? [{ sel: 'tr.rg-det', attr: 'ek', val: CLE, el: det }] : []));
    chargerOuvrir({ el: (id) => (id === 'reg-cards' ? host : id === 'reg-imm' ? select : null), isPhone: () => false, back: () => {}, rRegul: () => { rendus++; }, toggleImm: () => {}, aria: () => {}, toast: () => {} })(IMM, CLE);
    expect(select.value).toBe(IMM);
    expect(det.style.display).toBe('');
  });

  it('introuvable → message à l’utilisateur, pas d’échec silencieux ni d’exception', () => {
    let msg = '';
    const host = hote(() => []);
    chargerOuvrir({ el: (id) => (id === 'reg-cards' ? host : { value: '' }), isPhone: () => false, back: () => {}, rRegul: () => {}, toggleImm: () => {}, aria: () => {}, toast: (m) => { msg = m; } })(IMM, CLE);
    expect(msg).toMatch(/n'apparaît pas/);
  });

  it('bouton téléphone « Détail des charges » : _rgPhToggleDet ouvre puis referme, aria-expanded suit', () => {
    const bloc = { hidden: true };
    const carte = faux({ enfants: { '.rgph-det': bloc } });
    const btn = faux({ enfants: { 'closest:.rgph-lc': carte } });
    const src = corpsDe(html, '_rgPhToggleDet');
    // eslint-disable-next-line no-new-func
    const toggle = new Function(src + '\nreturn _rgPhToggleDet;')();
    toggle(btn);
    expect(bloc.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    toggle(btn);
    expect(bloc.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('bouton PC « Détail » : _rgToggleDet bascule la ligne ET met à jour aria-expanded du bouton qui la contrôle', () => {
    const ligne = { style: { display: 'none' } };
    const bouton = faux({ attrs: { 'aria-expanded': 'false' } });
    const document = { getElementById: (id) => (id === 'rgim0d0' ? ligne : null), querySelectorAll: (sel) => (sel === '[aria-controls="rgim0d0"]' ? [bouton] : []) };
    // eslint-disable-next-line no-new-func
    const f = new Function('document', corpsDe(html, '_rgToggleDet') + '\n' + corpsDe(html, '_rgDetAria') + '\nreturn _rgToggleDet;')(document);
    f('rgim0d0');
    expect(ligne.style.display).toBe('');
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
    f('rgim0d0');
    expect(ligne.style.display).toBe('none');
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('2b · contrat : ce que cherche _rgOuvrirDetailLoc est bien ce que produisent les listes', () => {
  // Les sélecteurs sont lus DANS la fonction : renommer un attribut d'un seul côté casse ce test.
  const PRODUCTEUR = { '.rgph-lc': '_regRenderPhone', 'tr.rg-det': 'rRegul', 'tr.rg-imm': 'rRegul' };
  const selecteurs = () => [...codeSeul(corpsDe(html, '_rgOuvrirDetailLoc') || '').matchAll(/'([\w.-]+)\[data-([\w-]+)="'/g)].map((m) => [m[1], m[2]]);

  it('la fonction cherche les trois cibles attendues (carte téléphone, ligne détail, ligne immeuble)', () => {
    expect(selecteurs().map((s) => s.join('|')).sort()).toEqual(['.rgph-lc|ek', 'tr.rg-det|ek', 'tr.rg-imm|imm']);
  });

  it('chaque cible est produite avec le MÊME attribut sur le MÊME élément', () => {
    for (const [sel, attr] of selecteurs()) {
      const [, tag, cls] = /^(\w*)\.([\w-]+)$/.exec(sel);
      const code = codeSeul(corpsDe(html, PRODUCTEUR[sel]));
      const re = new RegExp('<' + (tag || '\\w+') + '\\s[^>]*class="(?:[^"]*\\s)?' + cls + '(?:\\s[^"]*)?"[^>]*\\sdata-' + attr + '="\\$\\{');
      expect(code, `${PRODUCTEUR[sel]} ne produit pas ${sel}[data-${attr}]`).toMatch(re);
    }
  });

  it('les deux vues globales passent l’entryKey de l’occupation au clic (et plus rien d’autre)', () => {
    for (const [nom, cls] of [['_rgShowGlobal', 'rg-colbtn'], ['_rgShowGlobalPhone', 'rgvg-lot']]) {
      const code = codeSeul(corpsDe(html, nom));
      const re = new RegExp('class="' + cls + '"[^>]*data-imm="\\$\\{escHtml\\(immNom\\)\\}"[^>]*data-ek="\\$\\{escHtml\\(e\\.entryKey\\)\\}"[^>]*onclick="_rgOuvrirDetailLoc\\(this\\.dataset\\.imm,this\\.dataset\\.ek\\)"');
      expect(code, nom).toMatch(re);
    }
  });

  it('les listes rendent bien le détail partagé et un contrôle libellé pour l’ouvrir', () => {
    const pc = codeSeul(corpsDe(html, 'rRegul'));
    expect(pc).toMatch(/<tr class="rg-det [^"]*"[^>]*>\s*<td colspan="5">\$\{_rgDetailLocHtml\(r\)\}/);
    expect(pc).toMatch(/aria-expanded="false" aria-controls="\$\{did\}" onclick="event\.stopPropagation\(\);_rgToggleDet\('\$\{did\}'\)"[^>]*>[^<]*\$\{_uiIcon\('receipt'\)\} Détail</);
    const tel = codeSeul(corpsDe(html, '_regRenderPhone'));
    expect(tel).toMatch(/class="rgph-detbtn" aria-expanded="false" onclick="_rgPhToggleDet\(this\)"[^>]*>[\s\S]{0,60}Détail des charges/);
    expect(tel).toMatch(/<div class="rgph-det" hidden>\$\{_rgDetailLocHtml\(r\)\}<\/div>/);
  });

  it('récap par lot téléphone : pas d’aria-label qui masquerait les montants au lecteur d’écran', () => {
    const code = codeSeul(corpsDe(html, '_rgShowGlobalPhone'));
    expect(code).not.toMatch(/class="rgvg-lot"[^>]*aria-label=/);
  });
});

describe('3 · charte : plus de couleur codée en dur dans l’écran Charges', () => {
  const HEX = /#[0-9a-fA-F]{3,8}\b/;

  it('main.css — aucune règle .rg-* / .rgc-* (liste, vue globale, clôture) ne code une couleur en dur', () => {
    const fautes = css.split('\n')
      .filter((l) => /^\s*\.rgc?-/.test(l))
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
