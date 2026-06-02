import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('GET /health', () => {
  it('répond 200 avec ok:true', async () => {
    const res = await SELF.fetch('https://relay.test/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
