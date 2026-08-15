import { describe, it, expect, vi } from 'vitest';
import { makeSender } from '../src/email-sender.js';

describe('makeSender', () => {
  it('mode dev : n_envoie rien, renvoie devCode (test e2e sans email)', async () => {
    const sender = makeSender({ EMAIL_MODE: 'dev' });
    const r = await sender.send({ to: 'a@b.fr', code: '472915', bailRef: 'LOG-014' });
    expect(r.sent).toBe(false);
    expect(r.devCode).toBe('472915');
  });

  it('mode par défaut (env vide) = dev', async () => {
    const r = await makeSender({}).send({ to: 'a@b.fr', code: '111111', bailRef: 'X' });
    expect(r.sent).toBe(false);
    expect(r.devCode).toBe('111111');
  });

  it('mode resend : POST Resend avec le bon payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
    const sender = makeSender({ EMAIL_MODE: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'code@propryo.fr' }, fetchMock);
    const r = await sender.send({ to: 'a@b.fr', code: '472915', bailRef: 'LOG-014' });
    expect(r.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer k');
    const payload = JSON.parse(opts.body);
    expect(payload.from).toContain('code@propryo.fr');
    expect(payload.to).toEqual(['a@b.fr']);
    expect(payload.subject).toContain('472915');
    expect(payload.text).toContain('472915');
    expect(payload.text).toContain('LOG-014');
  });

  it('mode resend : échec API → sent:false + error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('err', { status: 422 }));
    const r = await makeSender({ EMAIL_MODE: 'resend', RESEND_API_KEY: 'k' }, fetchMock).send({ to: 'a@b.fr', code: '1', bailRef: 'X' });
    expect(r.sent).toBe(false);
    expect(r.error).toBe(422);
  });
});
