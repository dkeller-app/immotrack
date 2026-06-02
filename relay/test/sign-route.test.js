import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const APP_KEY = 'test-app-key';

async function createSession(signers, bailRef = 'BAIL-2026-001') {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2]); // %PDF-1.4
  const form = new FormData();
  form.set('pdf', new File([pdf], 'bail.pdf', { type: 'application/pdf' }));
  form.set('meta', JSON.stringify({ bailRef, signers }));
  const res = await SELF.fetch('https://relay.test/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${APP_KEY}` }, body: form
  });
  return (await res.json()).sessionId;
}

describe('GET /s/:id — injection riche', () => {
  it('injecte window.__SIGN__ avec sigId/role/rank du signataire courant', async () => {
    const sessionId = await createSession([
      { role: 'bailleur', email: 'b@x.fr', ordre: 0 },
      { role: 'locataire', email: 'l@x.fr', ordre: 1 }
    ]);
    const html = await (await SELF.fetch(`https://relay.test/s/${sessionId}`)).text();
    // contrat gelé conservé :
    expect(html).toMatch(/window\.__SIGN_TOKEN__\s*=\s*"[^"]+"/);
    expect(html).toMatch(/window\.__SESSION_ID__\s*=\s*"[^"]+"/);
    // injection riche :
    const m = html.match(/window\.__SIGN__\s*=\s*(\{.*?\});/s);
    expect(m).toBeTruthy();
    const data = JSON.parse(m[1]);
    expect(data.sigId).toBe('bailleur-0'); // currentIndex=0 → bailleur
    expect(data.role).toBe('bailleur');
    expect(data.side).toBe('bailleur');
    expect(data.rank).toBe(1);
    expect(data.total).toBe(2);
    expect(data.bailRef).toBe('BAIL-2026-001');
    // référence les assets statiques :
    expect(html).toContain('/sign.js');
    expect(html).toContain('/vendor/pdf-lib.min.js');
  });

  it('échappe </script> dans bailRef (anti-injection)', async () => {
    const sessionId = await createSession(
      [{ role: 'locataire', email: 'l@x.fr', ordre: 0 }],
      'A</script><script>alert(1)</script>'
    );
    const html = await (await SELF.fetch(`https://relay.test/s/${sessionId}`)).text();
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });

  it('404 sur session inconnue, 410 sur session complétée', async () => {
    const r404 = await SELF.fetch('https://relay.test/s/inconnu');
    expect(r404.status).toBe(404);
  });
});
