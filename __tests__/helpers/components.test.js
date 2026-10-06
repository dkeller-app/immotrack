/**
 * Tests pour js/components/{toast,modal}.js
 *
 * Mock DOM minimal via globalThis : on simule document.getElementById qui
 * retourne un objet avec classList.add/remove et style.* . Pas de jsdom.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Mock document avant import (les modules ES qui appellent document à l'import
// ne le font pas — c'est seulement à l'invocation, donc on peut mocker ici).
function mockEl(id) {
  return {
    id,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    style: {},
    innerHTML: ''
  };
}

beforeEach(() => {
  globalThis.window = globalThis.window || {};
  globalThis.document = {
    _els: {},
    getElementById(id) {
      if (!this._els[id]) this._els[id] = mockEl(id);
      return this._els[id];
    }
  };
});

// Import APRÈS le beforeEach pour que les modules voient le mock.
const { showToast, syncHauteurBarreBas } = await import('../../js/components/toast.js');
const { openM, closeM, closeBg, confirm2 } = await import('../../js/components/modal.js');

describe('components/modal.js', () => {
  it('openM retire la classe hidden', () => {
    const el = document.getElementById('ov-test');
    el.classList.add('hidden');
    expect(el.classList.contains('hidden')).toBe(true);
    openM('ov-test');
    expect(el.classList.contains('hidden')).toBe(false);
  });

  it('closeM ajoute la classe hidden', () => {
    closeM('ov-test2');
    const el = document.getElementById('ov-test2');
    expect(el.classList.contains('hidden')).toBe(true);
  });

  it('openM / closeM ne crashent pas si id inexistant', () => {
    const oldGetById = document.getElementById;
    document.getElementById = () => null;
    expect(() => openM('inexistant')).not.toThrow();
    expect(() => closeM('inexistant')).not.toThrow();
    document.getElementById = oldGetById;
  });

  it('closeBg ne ferme PLUS rien, même si target = wrapper (clic dehors désactivé — décision user v15.270)', () => {
    const el = document.getElementById('ov-bg');
    el.classList.remove('hidden');
    closeBg({ target: el }, 'ov-bg');
    expect(el.classList.contains('hidden')).toBe(false); // no-op : un clic en dehors ne ferme plus aucune modale
  });

  it('closeBg ne ferme PAS si target ≠ wrapper', () => {
    const el = document.getElementById('ov-bg2');
    el.classList.remove('hidden');
    closeBg({ target: { id: 'autre' } }, 'ov-bg2');
    expect(el.classList.contains('hidden')).toBe(false);
  });

  it('confirm2 délègue à window.confirm', () => {
    let captured = null;
    window.confirm = msg => { captured = msg; return true; };
    expect(confirm2('Sûr ?')).toBe(true);
    expect(captured).toBe('Sûr ?');
  });
});

describe('components/toast.js', () => {
  beforeEach(() => {
    // Reset toast element
    const t = document.getElementById('toast');
    t.innerHTML = '';
    t.style = {};
  });

  it('affiche le message échappé', () => {
    showToast('Hello <script>');
    const t = document.getElementById('toast');
    expect(t.innerHTML).toBe('Hello &lt;script&gt;');
  });

  it('applique la couleur err', () => {
    showToast('Erreur', 'err');
    const t = document.getElementById('toast');
    expect(t.style.color).toBe('var(--red)');
  });

  it('applique la couleur ok', () => {
    showToast('OK', 'ok');
    const t = document.getElementById('toast');
    expect(t.style.color).toBe('var(--grn)');
  });

  it('applique la couleur warn', () => {
    showToast('Attention', 'warn');
    const t = document.getElementById('toast');
    expect(t.style.color).toBe('var(--ora)');
  });

  it('affiche le toast (display flex)', () => {
    showToast('Test');
    const t = document.getElementById('toast');
    expect(t.style.display).toBe('flex');
  });

  it('extraHTML ajouté brut (pas échappé)', () => {
    showToast('Action', '', 2800, '<button id="x">↶</button>');
    const t = document.getElementById('toast');
    expect(t.innerHTML).toBe('Action<button id="x">↶</button>');
  });

  it('no-op si #toast absent', () => {
    const old = document.getElementById;
    document.getElementById = () => null;
    expect(() => showToast('Test')).not.toThrow();
    document.getElementById = old;
  });
});

// Audit stockage lots 2-3 (🟠3) : sur téléphone, le toast passait SOUS la barre du bas. css/main.css
// le pose à --bnav-h + 12 px ; --bnav-h est la hauteur RÉELLE de la barre, mesurée à chaque toast.
describe('components/toast.js — hauteur réelle de la barre du bas (--bnav-h)', () => {
  function monde({ barre = null } = {}) {
    const vars = {};
    const doc = {
      querySelector: (s) => (s === '.v4-bnav' ? barre : null),
      documentElement: { style: { setProperty: (k, v) => { vars[k] = v; } } },
    };
    const win = { getComputedStyle: (n) => ({ display: n.display }) };
    return { doc, win, vars };
  }
  const barre = (h, display = 'flex') => ({ display, getBoundingClientRect: () => ({ height: h }) });

  it('barre affichée : sa hauteur réelle, arrondie AU-DESSUS (jamais 1 px de chevauchement)', () => {
    const m = monde({ barre: barre(56.4) });
    expect(syncHauteurBarreBas(m.doc, m.win)).toBe(57);
    expect(m.vars).toEqual({ '--bnav-h': '57px' });
  });
  it('barre plus haute (pastille d’action, encoche) : la mesure suit', () => {
    const m = monde({ barre: barre(91) });
    syncHauteurBarreBas(m.doc, m.win);
    expect(m.vars['--bnav-h']).toBe('91px');
  });
  it('barre masquée (tablette, PC) ou absente : 0', () => {
    const cachee = monde({ barre: barre(57, 'none') });
    expect(syncHauteurBarreBas(cachee.doc, cachee.win)).toBe(0);
    expect(cachee.vars['--bnav-h']).toBe('0px');
    const absente = monde();
    expect(syncHauteurBarreBas(absente.doc, absente.win)).toBe(0);
    expect(absente.vars['--bnav-h']).toBe('0px');
  });
  it('mesure impossible : ne lève jamais', () => {
    expect(syncHauteurBarreBas({ querySelector() { throw new Error('x'); } }, {})).toBeNull();
  });
  it('showToast mesure la barre à CHAQUE affichage (la barre change avec les favoris)', () => {
    const m = monde({ barre: barre(57) });
    const docAvant = globalThis.document, winAvant = globalThis.window;
    const d = globalThis.document = Object.assign({ getElementById: (id) => (id === 'toast' ? toast : null) }, m.doc);
    globalThis.window = Object.assign({}, winAvant, m.win);
    const toast = { style: {}, innerHTML: '' };
    try {
      showToast('Un');
      expect(m.vars['--bnav-h']).toBe('57px');
      d.querySelector = () => barre(80);
      showToast('Deux');
      expect(m.vars['--bnav-h']).toBe('80px');
      expect(toast.style.display).toBe('flex');
    } finally { globalThis.document = docAvant; globalThis.window = winAvant; }
  });
});
