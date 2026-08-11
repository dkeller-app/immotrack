// Helper d'authentification pour les tests du relais.
//
// POURQUOI : depuis le durcissement JWT (21/06, `relay-jwt-auth`), les routes bailleur
// (`POST /sessions`, `POST /candidatures`, `GET /api/ping`, `POST .../reclaim`) exigent un
// jeton de session Supabase ES256 vérifié via JWKS — l'ancienne `APP_KEY` partagée a disparu.
// Les 6 fichiers de test qui envoyaient `Bearer env.APP_KEY` recevaient donc 401 (40 tests rouges).
//
// COMMENT : on intercepte le seul appel réseau sortant du worker (le JWKS Supabase) avec
// `fetchMock`, et on sert la clé PUBLIQUE d'une paire ES256 FIXE. Les jetons de test sont
// signés avec la clé privée correspondante. Clé fixe (et non générée à la volée) parce que
// `createRemoteJWKSet` met le jeu de clés en cache au niveau module, partagé par tous les
// fichiers de test (singleWorker) : une clé qui changerait d'un fichier à l'autre rendrait
// la suite instable.
//
// Cette paire n'a AUCUNE valeur en dehors des tests : elle ne signe rien en production, où
// la clé est celle du projet Supabase.
import { env, fetchMock } from 'cloudflare:test';
import { SignJWT, importJWK } from 'jose';

const PUBLIC_JWK_NOT_A_SECRET = {
  kty: 'EC', crv: 'P-256',
  x: 'M5YFnILXQ-sEPiWB8u7uB50HSb9eiaydeXJZvkQig4s',
  y: 'VnCEbY20kYNh-NvJamF-DNtDzGxgR9reSTteIphyyDc',
  kid: 'relay-test-key', alg: 'ES256', use: 'sig'
};
// Nom explicite : cette clé privée ne protège RIEN. Elle n'a d'effet que si le worker charge un
// JWKS qui contient sa clé publique — or l'URL du JWKS vient d'une variable de déploiement, pas
// d'une entrée utilisateur, et le projet Supabase réel publie une autre clé. Nommée ainsi pour
// que les scanners de secrets (et les relecteurs) n'aient pas à enquêter.
const PRIVATE_JWK_NOT_A_SECRET = {
  ...PUBLIC_JWK_NOT_A_SECRET,
  d: 'NMznCrWOfcM39sry5VBlQsc_zL5k4eR4tX07tlmxwWE'
};
export const PUBLIC_JWK = PUBLIC_JWK_NOT_A_SECRET;

const BASE = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

let ready = null;

// Idempotent : appelable depuis chaque fichier de test, ne monte le mock qu'une fois.
function setup() {
  if (!ready) {
    ready = (async () => {
      fetchMock.activate();
      // Étanchéité : sans ça, toute requête non interceptée SORT sur le vrai réseau — la suite
      // tapait l'infra Supabase de PRODUCTION et dépendait de la connectivité. Un intercept cassé
      // devient désormais une erreur explicite au lieu d'un appel réel silencieux.
      fetchMock.disableNetConnect();
      const origin = new URL(BASE).origin;
      fetchMock
        .get(origin)
        .intercept({ path: '/auth/v1/.well-known/jwks.json', method: 'GET' })
        .reply(200, { keys: [PUBLIC_JWK_NOT_A_SECRET] }, { headers: { 'content-type': 'application/json' } })
        .persist();
      return importJWK(PRIVATE_JWK_NOT_A_SECRET, 'ES256');
    })();
  }
  return ready;
}

// Jeton de session Supabase valide (claims exigés par requireSupabaseUser).
export async function appToken({ sub = TEST_USER_ID, expiresIn = '1h', role = 'authenticated' } = {}) {
  const key = await setup();
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'ES256', kid: PUBLIC_JWK.kid })
    .setIssuer(`${BASE}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

// Sucre : en-têtes prêts à l'emploi pour un appel authentifié « bailleur ».
export async function appAuth(opts) {
  return { Authorization: `Bearer ${await appToken(opts)}` };
}
