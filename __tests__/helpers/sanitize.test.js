import { describe, it, expect } from 'vitest';
import { _esc, escHtml, _h, _raw } from './sanitize.js';

describe('_esc (alias escHtml)', () => {
  it('null/undefined → string vide', () => {
    expect(_esc(null)).toBe('');
    expect(_esc(undefined)).toBe('');
  });

  it('escape les 5 entités HTML critiques', () => {
    expect(_esc('&')).toBe('&amp;');
    expect(_esc('<')).toBe('&lt;');
    expect(_esc('>')).toBe('&gt;');
    expect(_esc('"')).toBe('&quot;');
    expect(_esc("'")).toBe('&#39;');
  });

  it('neutralise une charge XSS classique', () => {
    const payload = `<img src=x onerror="alert('XSS')">`;
    const escaped = _esc(payload);
    expect(escaped).not.toContain('<img');
    expect(escaped).not.toContain('">');
    expect(escaped).toContain('&lt;img');
    expect(escaped).toContain('&quot;');
  });

  it('neutralise une charge XSS via attribut', () => {
    const payload = `"><script>alert(1)</script>`;
    const escaped = _esc(payload);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('coerce les non-strings (nombres, objets) sans crash', () => {
    expect(_esc(42)).toBe('42');
    expect(_esc(0)).toBe('0');
    expect(_esc(true)).toBe('true');
    expect(_esc({ toString: () => 'x' })).toBe('x');
  });

  it('escHtml est strictement aliasé sur _esc', () => {
    expect(escHtml).toBe(_esc);
    expect(escHtml('<x>')).toBe(_esc('<x>'));
  });
});

describe('_h (tag function template literal)', () => {
  it('escape automatiquement les valeurs interpolées', () => {
    const nom = `<script>alert(1)</script>`;
    const html = _h`<b>${nom}</b>`;
    expect(html).toBe('<b>&lt;script&gt;alert(1)&lt;/script&gt;</b>');
  });

  it('laisse passer les parties statiques du template', () => {
    const html = _h`<div class="x"><span>${'ok'}</span></div>`;
    expect(html).toBe('<div class="x"><span>ok</span></div>');
  });

  it('escape les valeurs numériques et coerce null/undefined', () => {
    expect(_h`<i>${42}</i>`).toBe('<i>42</i>');
    expect(_h`<i>${null}</i>`).toBe('<i></i>');
    expect(_h`<i>${undefined}</i>`).toBe('<i></i>');
  });

  it('escape plusieurs interpolations consécutives', () => {
    const a = `<a>`;
    const b = `<b>`;
    const c = `<c>`;
    expect(_h`${a}${b}${c}`).toBe('&lt;a&gt;&lt;b&gt;&lt;c&gt;');
  });

  it('ne casse pas un template sans interpolation', () => {
    expect(_h`<p>static</p>`).toBe('<p>static</p>');
  });

  it('preuve : pattern réel d option select sécurisée', () => {
    const nom = `"><script>`;
    const html = _h`<option value="${nom}">${nom}</option>`;
    // L'attaque échoue : les < et " sont échappés à l'intérieur de value=
    expect(html).toBe('<option value="&quot;&gt;&lt;script&gt;">&quot;&gt;&lt;script&gt;</option>');
    expect(html).not.toContain('<script>');
  });
});

describe('_raw (trusted HTML marker)', () => {
  it('laisse passer le HTML tel quel via _raw dans _h', () => {
    const cardsHtml = '<div class="c">A</div><div class="c">B</div>';
    const html = _h`<section>${_raw(cardsHtml)}</section>`;
    expect(html).toBe('<section><div class="c">A</div><div class="c">B</div></section>');
  });

  it('escape autour du raw : seul le contenu marqué passe brut', () => {
    const user = `<x>`;
    const trusted = '<b>OK</b>';
    const html = _h`<div>${user}</div><span>${_raw(trusted)}</span>`;
    expect(html).toBe('<div>&lt;x&gt;</div><span><b>OK</b></span>');
  });

  it('_raw coerce null/undefined sans crash', () => {
    expect(_h`<x>${_raw(null)}</x>`).toBe('<x></x>');
    expect(_h`<x>${_raw(undefined)}</x>`).toBe('<x></x>');
  });

  it('un objet user qui imite { __raw: true, value: ... } sans passer par _raw EST tout de même accepté', () => {
    // Limite documentée : _h fait confiance au flag __raw === true.
    // Si un attaquant contrôle un objet stringifié et arrive à le brancher dans une interpolation,
    // il peut bypasser l'échappement. Mais ça nécessite un contrôle préalable de l'objet JS,
    // pas juste une saisie de string user.
    const malicious = { __raw: true, value: '<script>alert(1)</script>' };
    const html = _h`<x>${malicious}</x>`;
    expect(html).toBe('<x><script>alert(1)</script></x>');
    // → règle : ne jamais accepter d'objet JSON externe directement dans _h
  });
});
