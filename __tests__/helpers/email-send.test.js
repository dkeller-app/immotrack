/**
 * Tests pour EMAIL-SMTP-CONNECT v15.80 Phase 1.
 * Module js/core/email-send.js — helpers purs MIME + Gmail API.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  _base64UrlEncode,
  _emailEncodeMimeHeader,
  _emailMakeBoundary,
  _emailToMimeBase64Url,
  _emailSendViaGmail,
} from '../../js/core/email-send.js';

// Helper pour décoder base64url → string (pour vérifier le MIME généré)
function decodeBase64Url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/') + pad;
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf-8');
  return decodeURIComponent(escape(atob(b64)));
}

// ═══════════════════════════════════════════════════════════════════
//  _base64UrlEncode
// ═══════════════════════════════════════════════════════════════════

describe('_base64UrlEncode', () => {
  it('encode UTF-8 + URL-safe chars (- _)', () => {
    const out = _base64UrlEncode('hello world');
    expect(out).toBe('aGVsbG8gd29ybGQ');
    expect(out).not.toContain('+');
    expect(out).not.toContain('/');
    expect(out).not.toContain('=');
  });

  it('roundtrip UTF-8 avec accents', () => {
    const out = _base64UrlEncode('Bonjour Müller');
    expect(decodeBase64Url(out)).toBe('Bonjour Müller');
  });

  it('roundtrip emoji', () => {
    expect(decodeBase64Url(_base64UrlEncode('Loyer ✓'))).toBe('Loyer ✓');
  });

  it('vide → vide', () => {
    expect(_base64UrlEncode('')).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _emailEncodeMimeHeader
// ═══════════════════════════════════════════════════════════════════

describe('_emailEncodeMimeHeader', () => {
  it('ASCII pur → identique', () => {
    expect(_emailEncodeMimeHeader('Loyer mensuel')).toBe('Loyer mensuel');
    expect(_emailEncodeMimeHeader('test@example.com')).toBe('test@example.com');
  });

  it('non-ASCII → encodage RFC 2047 =?UTF-8?B?...?=', () => {
    const out = _emailEncodeMimeHeader('Müller');
    expect(out.startsWith('=?UTF-8?B?')).toBe(true);
    expect(out.endsWith('?=')).toBe(true);
  });

  it('emoji → encodé', () => {
    expect(_emailEncodeMimeHeader('Loyer ✓')).toMatch(/^=\?UTF-8\?B\?/);
  });

  it('vide / null → vide', () => {
    expect(_emailEncodeMimeHeader('')).toBe('');
    expect(_emailEncodeMimeHeader(null)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _emailMakeBoundary
// ═══════════════════════════════════════════════════════════════════

describe('_emailMakeBoundary', () => {
  it('génère un boundary unique', () => {
    const b1 = _emailMakeBoundary();
    const b2 = _emailMakeBoundary();
    expect(b1).not.toBe(b2);
    expect(b1).toMatch(/^----=_Part_/);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _emailToMimeBase64Url — MIME RFC 5322
// ═══════════════════════════════════════════════════════════════════

describe('_emailToMimeBase64Url — texte simple', () => {
  it('email basique To+Subject+body', () => {
    const out = _emailToMimeBase64Url({
      to: 'locataire@example.com',
      subject: 'Quittance mai 2026',
      body: 'Bonjour, votre quittance est jointe.',
    });
    const mime = decodeBase64Url(out);
    expect(mime).toMatch(/^To: locataire@example\.com/m);
    expect(mime).toMatch(/^Subject: Quittance mai 2026/m);
    expect(mime).toMatch(/MIME-Version: 1\.0/);
    expect(mime).toMatch(/Content-Type: text\/plain; charset=UTF-8/);
    expect(mime).toMatch(/Bonjour, votre quittance est jointe\./);
  });

  it('CC et BCC ajoutés en header', () => {
    const out = _emailToMimeBase64Url({
      to: 'a@x.com', cc: 'b@x.com', bcc: 'c@x.com',
      subject: 'Test', body: 'Hi',
    });
    const mime = decodeBase64Url(out);
    expect(mime).toMatch(/^Cc: b@x\.com/m);
    expect(mime).toMatch(/^Bcc: c@x\.com/m);
  });

  it('subject non-ASCII encodé RFC 2047', () => {
    const out = _emailToMimeBase64Url({
      to: 'x@y.com', subject: 'Révision IRL — Müller', body: 'ok',
    });
    const mime = decodeBase64Url(out);
    expect(mime).toMatch(/^Subject: =\?UTF-8\?B\?/m);
  });

  it('body UTF-8 préservé dans la base64url', () => {
    const out = _emailToMimeBase64Url({
      to: 'x@y.com', subject: 'Test',
      body: 'Bonjour Müller, voici votre quittance pour 650,05 €.',
    });
    expect(decodeBase64Url(out)).toMatch(/Müller.*650,05 €/);
  });

  it('From header optionnel', () => {
    const out = _emailToMimeBase64Url({
      from: 'bailleur@gmail.com',
      to: 'x@y.com', subject: 'T', body: 'b',
    });
    expect(decodeBase64Url(out)).toMatch(/^From: bailleur@gmail\.com/m);
  });

  it('throw si pas de "to"', () => {
    expect(() => _emailToMimeBase64Url({ subject: 'x', body: 'y' })).toThrow(/to required/);
    expect(() => _emailToMimeBase64Url(null)).toThrow(/to required/);
  });
});

describe('_emailToMimeBase64Url — HTML (multipart/alternative)', () => {
  it('html + text → multipart/alternative', () => {
    const out = _emailToMimeBase64Url({
      to: 'x@y.com', subject: 'Test',
      body: 'Bonjour',
      html: '<p>Bonjour <b>cher</b></p>',
    });
    const mime = decodeBase64Url(out);
    expect(mime).toMatch(/Content-Type: multipart\/alternative; boundary=/);
    expect(mime).toMatch(/Content-Type: text\/plain; charset=UTF-8/);
    expect(mime).toMatch(/Content-Type: text\/html; charset=UTF-8/);
    expect(mime).toMatch(/<p>Bonjour <b>cher<\/b><\/p>/);
  });
});

describe('_emailToMimeBase64Url — pièces jointes (multipart/mixed)', () => {
  it('1 PJ → multipart/mixed', () => {
    const out = _emailToMimeBase64Url({
      to: 'x@y.com', subject: 'IRL', body: 'Lettre jointe',
      attachments: [{
        filename: 'lettre-irl.pdf',
        mimeType: 'application/pdf',
        base64: 'SGVsbG8gUERG' // "Hello PDF" en base64
      }],
    });
    const mime = decodeBase64Url(out);
    expect(mime).toMatch(/Content-Type: multipart\/mixed; boundary=/);
    expect(mime).toMatch(/Content-Type: application\/pdf; name="lettre-irl\.pdf"/);
    expect(mime).toMatch(/Content-Transfer-Encoding: base64/);
    expect(mime).toMatch(/Content-Disposition: attachment; filename="lettre-irl\.pdf"/);
    expect(mime).toMatch(/SGVsbG8gUERG/);
  });

  it('2 PJ → 2 sections attachment', () => {
    const out = _emailToMimeBase64Url({
      to: 'x@y.com', subject: 'T', body: 'b',
      attachments: [
        { filename: 'a.pdf', mimeType: 'application/pdf', base64: 'QUFB' },
        { filename: 'b.png', mimeType: 'image/png', base64: 'QkJC' },
      ],
    });
    const mime = decodeBase64Url(out);
    expect((mime.match(/Content-Disposition: attachment/g) || []).length).toBe(2);
    expect(mime).toMatch(/filename="a\.pdf"/);
    expect(mime).toMatch(/filename="b\.png"/);
  });

  it('PJ avec nom non-ASCII → header encodé', () => {
    const out = _emailToMimeBase64Url({
      to: 'x@y.com', subject: 'T', body: 'b',
      attachments: [{ filename: 'Décompte-régul.pdf', mimeType: 'application/pdf', base64: 'AAA' }],
    });
    const mime = decodeBase64Url(out);
    expect(mime).toMatch(/filename="=\?UTF-8\?B\?/);
  });

  it('PJ sans filename ou base64 → skip silencieux', () => {
    const out = _emailToMimeBase64Url({
      to: 'x@y.com', subject: 'T', body: 'b',
      attachments: [
        { filename: '', base64: 'XXX' },
        null,
        { filename: 'ok.pdf', mimeType: 'application/pdf', base64: 'YYY' },
      ],
    });
    const mime = decodeBase64Url(out);
    expect(mime).toMatch(/filename="ok\.pdf"/);
    expect((mime.match(/Content-Disposition: attachment/g) || []).length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _emailSendViaGmail — call API
// ═══════════════════════════════════════════════════════════════════

describe('_emailSendViaGmail', () => {
  it('POST sur le bon endpoint avec headers + body', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'msg-123', threadId: 'thr-456' }),
    }));
    const result = await _emailSendViaGmail('token-abc', 'BASE64URL_MIME', { fetch: fakeFetch });
    expect(result).toEqual({ id: 'msg-123', threadId: 'thr-456' });
    const call = fakeFetch.mock.calls[0];
    expect(call[0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers['Authorization']).toBe('Bearer token-abc');
    expect(call[1].headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(call[1].body)).toEqual({ raw: 'BASE64URL_MIME' });
  });

  it('throw si HTTP 4xx avec message', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Insufficient permission' } }),
    }));
    await expect(_emailSendViaGmail('tk', 'mime', { fetch: fakeFetch }))
      .rejects.toThrow(/Gmail API: HTTP 403.*Insufficient permission/);
  });

  it('throw si HTTP 503 (quota momentané)', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    await expect(_emailSendViaGmail('tk', 'mime', { fetch: fakeFetch }))
      .rejects.toThrow(/Gmail API: HTTP 503/);
  });

  it('throw si pas de token', async () => {
    await expect(_emailSendViaGmail('', 'mime')).rejects.toThrow(/accessToken required/);
  });

  it('throw si pas de mime', async () => {
    await expect(_emailSendViaGmail('tk', '')).rejects.toThrow(/mimeBase64Url required/);
  });
});
