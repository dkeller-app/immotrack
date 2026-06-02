function bytesToBase64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createToken(payload, secret) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await importKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  return `${bytesToBase64url(payloadBytes)}.${bytesToBase64url(sig)}`;
}

export async function verifyToken(token, secret) {
  try {
    const dot = token.indexOf('.');
    if (dot < 1) return { valid: false, reason: 'malformed' };
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);
    const payloadBytes = base64urlToBytes(payloadB64);
    const sigBytes = base64urlToBytes(sigB64);
    const key = await importKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
    if (!ok) return { valid: false, reason: 'bad-signature' };
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'malformed' };
  }
}
