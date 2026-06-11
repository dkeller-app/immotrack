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
const { showToast } = await import('../../js/components/toast.js');
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
