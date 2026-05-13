/**
 * Tests pour js/components/email-modal.js (EMAIL-AUTO V1 Phase 2)
 *
 * Le module manipule le DOM (création modale, lecture inputs, click handlers).
 * On mock document/navigator/window minimum pour les tests Vitest (cf pattern
 * components.test.js — pas de jsdom).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM minimaliste (cf __tests__/helpers/components.test.js)
function mockEl(id) {
  const el = {
    id,
    tagName: 'DIV',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    style: {},
    innerHTML: '',
    value: '',
    hidden: false,
    dataset: {},
    _attrs: {},
    _children: [],
    _listeners: {},
    _emailCtx: null,
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener() {},
    appendChild(child) { this._children.push(child); },
    setAttribute(k, v) { this._attrs[k] = v; },
    hasAttribute(k) { return k in this._attrs; },
    getAttribute(k) { return this._attrs[k]; },
    matches() { return false; }
  };
  return el;
}

beforeEach(() => {
  globalThis.window = globalThis.window || {};
  globalThis.window.location = { href: '' };
  // navigator est read-only en Node — on définit nos props sur l'objet existant
  // si présent, sinon on le crée via defineProperty.
  if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', { value: {}, writable: true, configurable: true });
  }
  // Reset des propriétés qu'on manipule
  try { delete globalThis.navigator.share; } catch (_) {}
  try { delete globalThis.navigator.clipboard; } catch (_) {}
  globalThis.document = {
    _els: {},
    _createdEls: [],
    getElementById(id) {
      return this._els[id] || null;
    },
    createElement(tag) {
      const el = mockEl();
      el.tagName = tag.toUpperCase();
      // Quand on innerHTML un fragment, on simule la création des éléments enfants
      // référencés dans le code source : 'em-to', 'em-cc', 'em-subject', 'em-body',
      // 'em-attachments-section', 'em-legal-note', 'em-mailto-warn', 'em-share-btn'.
      // On les pré-crée dès qu'on crée la modale racine.
      this._createdEls.push(el);
      return el;
    },
    body: {
      appendChild(child) {
        // Quand on append la modale, on enregistre ses sous-éléments
        if (child.id === 'ov-email-compose') {
          document._els['ov-email-compose'] = child;
          ['em-to', 'em-cc', 'em-subject', 'em-body',
           'em-attachments-section', 'em-legal-note', 'em-mailto-warn',
           'em-share-btn', 'em-title'].forEach(id => {
            document._els[id] = mockEl(id);
          });
        }
      }
    }
  };
  // showToast nécessite #toast pour ne pas crash
  document._els['toast'] = mockEl('toast');
});

const { openEmailModal, _buildMailtoUrl, MODAL_ID } = await import('../../js/components/email-modal.js');

// ────────────────────────────────────────────────────────────────────────────
describe('_buildMailtoUrl', () => {
  it('génère mailto:to?subject=...&body=...', () => {
    const url = _buildMailtoUrl('jean@x.fr', '', 'Hello', 'World');
    expect(url).toBe('mailto:jean%40x.fr?subject=Hello&body=World');
  });

  it('encode espaces, accents, sauts de ligne', () => {
    const url = _buildMailtoUrl('a@b.fr', '', 'Sujet é', 'Bonjour Jean\nMerci');
    expect(url).toContain('Sujet%20%C3%A9');
    expect(url).toContain('Bonjour%20Jean%0AMerci');
  });

  it('inclut CC si fourni', () => {
    const url = _buildMailtoUrl('to@x.fr', 'cc@x.fr', 'S', 'B');
    expect(url).toContain('cc=cc%40x.fr');
  });

  it('pas de cc= si vide', () => {
    const url = _buildMailtoUrl('to@x.fr', '', 'S', 'B');
    expect(url).not.toContain('cc=');
  });

  it('pas de subject/body si vides', () => {
    const url = _buildMailtoUrl('to@x.fr', '', '', '');
    expect(url).toBe('mailto:to%40x.fr');
  });

  it('to vide → mailto: vide', () => {
    const url = _buildMailtoUrl('', '', 'S', 'B');
    expect(url).toBe('mailto:?subject=S&body=B');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('openEmailModal — pré-remplissage', () => {
  const baseCtx = {
    locataire: { nom: 'Jean LOC', email: 'jean@x.fr' },
    bail: { adrBien: '10 rue X', hc: 500, ch: 50 },
    logement: { ref: 'L-001' },
    entite: { nom: 'SCI X', gerant: 'M. Y', iban: 'FR76...', bic: 'BIC' },
    quittance: { mois: 'janvier 2026', hc: 500, ch: 50, total: 550 }
  };

  it('crée la modale au premier appel + ouvre (retire .hidden)', () => {
    expect(document.getElementById(MODAL_ID)).toBeNull();
    openEmailModal('quittance', baseCtx);
    const modal = document.getElementById(MODAL_ID);
    expect(modal).not.toBeNull();
    expect(modal.classList.contains('hidden')).toBe(false);
  });

  it('remplit to/subject/body depuis _emailCompose(quittance)', () => {
    openEmailModal('quittance', baseCtx);
    expect(document.getElementById('em-to').value).toBe('jean@x.fr');
    expect(document.getElementById('em-subject').value).toContain('Quittance');
    expect(document.getElementById('em-subject').value).toContain('janvier 2026');
    expect(document.getElementById('em-body').value).toContain('Jean LOC');
  });

  it('affiche les pièces jointes en HTML escapé', () => {
    openEmailModal('quittance', baseCtx);
    const att = document.getElementById('em-attachments-section').innerHTML;
    expect(att).toContain('Quittance-janvier 2026-L-001.pdf');
    expect(att).toContain('📎');
  });

  it('affiche la note légale pour rappel-impaye-3', () => {
    openEmailModal('rappel-impaye-3', {
      ...baseCtx,
      periode: 'janvier 2026',
      montant: 550,
      rappel1Date: '6 fév 2026',
      rappel2Date: '20 fév 2026',
      dateLettre: '5 mars 2026'
    });
    const ln = document.getElementById('em-legal-note').innerHTML;
    expect(ln).toContain('LRAR');
    expect(ln).toContain('Note légale');
  });

  it('pas de section legalNote pour quittance (vide)', () => {
    openEmailModal('quittance', baseCtx);
    expect(document.getElementById('em-legal-note').innerHTML).toBe('');
  });

  it('type inconnu → warning erreur affiché', () => {
    openEmailModal('blabla-inexistant', {});
    const warn = document.getElementById('em-mailto-warn');
    expect(warn.innerHTML).toContain('Type d\'email inconnu');
    expect(warn.innerHTML).toContain('blabla-inexistant');
  });

  it('context vide → pas de crash, fallback "(inconnu)"', () => {
    expect(() => openEmailModal('quittance', {})).not.toThrow();
    const body = document.getElementById('em-body').value;
    expect(body).toContain('(inconnu)');
  });

  it('opts.entityType/entityId stockés sur la modale pour le log Phase 3', () => {
    openEmailModal('quittance', baseCtx, { entityType: 'logement', entityId: 'L-001' });
    const modal = document.getElementById(MODAL_ID);
    expect(modal._emailCtx.entityType).toBe('logement');
    expect(modal._emailCtx.entityId).toBe('L-001');
    expect(modal._emailCtx.type).toBe('quittance');
  });

  it('bouton share caché si navigator.share absent', () => {
    // navigator.share volontairement supprimé par beforeEach
    openEmailModal('quittance', baseCtx);
    const sb = document.getElementById('em-share-btn');
    expect(sb.style.display).toBe('none');
  });

  it('bouton share visible si navigator.share dispo', () => {
    Object.defineProperty(globalThis.navigator, 'share', {
      value: () => Promise.resolve(),
      configurable: true,
      writable: true
    });
    openEmailModal('quittance', baseCtx);
    const sb = document.getElementById('em-share-btn');
    expect(sb.style.display).toBe('');
  });

  it('appel multiple → réutilise la modale (idempotent)', () => {
    openEmailModal('quittance', baseCtx);
    const m1 = document.getElementById(MODAL_ID);
    openEmailModal('avis-echeance', { ...baseCtx, periode: 'fev 2026', montant: 550, dateEcheance: '2026-02-05' });
    const m2 = document.getElementById(MODAL_ID);
    expect(m1).toBe(m2);
    expect(document.getElementById('em-subject').value).toContain('Avis');
  });

  it('escape HTML dans pièce jointe (sécurité)', () => {
    const ctx = { ...baseCtx, logement: { ref: '<script>alert(1)</script>' } };
    openEmailModal('quittance', ctx);
    const att = document.getElementById('em-attachments-section').innerHTML;
    expect(att).not.toContain('<script>alert');
    expect(att).toContain('&lt;script&gt;');
  });
});
