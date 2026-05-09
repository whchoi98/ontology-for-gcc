// Plan 5 Task 5.5.1 — Lambda@Edge viewer-request: RS256 Cognito JWT verification
// with JWKS TTL caching. No external dependencies — uses Node 20 crypto module.
//
// Behavior:
//   - /auth/* and /healthz: pass-through (public)
//   - everything else: requires gcc_id_token cookie containing a valid JWT
//   - on miss/expired/invalid: 302 → /auth/login (handled by API)
//
// Note: Lambda@Edge doesn't support process.env at runtime, so USER_POOL_ID
// and COGNITO_REGION are filled in by CDK at synth time via simple replace.
'use strict';

const https = require('https');
const crypto = require('crypto');

const COGNITO_REGION = process.env.COGNITO_REGION || 'ap-northeast-2';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const COOKIE_NAME = 'gcc_id_token';

let _jwks = null;
let _jwks_at = 0;

async function jwks() {
  // 10 min TTL cache for JWKS (Cognito rotates rarely, this is conservative).
  if (_jwks && Date.now() - _jwks_at < 600000) return _jwks;
  if (!USER_POOL_ID) throw new Error('USER_POOL_ID not configured');
  const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;
  const body = await new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve(d));
    }).on('error', reject);
  });
  _jwks = JSON.parse(body);
  _jwks_at = Date.now();
  return _jwks;
}

function unauthorized() {
  return {
    status: '302',
    statusDescription: 'Found',
    headers: { location: [{ key: 'Location', value: '/auth/login' }] },
  };
}

// Convert RSA JWK → PEM using only built-in crypto (no jwk-to-pem dep).
function jwkToPem(jwk) {
  const key = crypto.createPublicKey({
    key: { kty: 'RSA', n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
  return key.export({ type: 'spki', format: 'pem' });
}

exports.handler = async (event) => {
  const req = event.Records[0].cf.request;

  // Public paths bypass auth.
  if (req.uri.startsWith('/auth/') || req.uri === '/healthz') return req;

  const cookieStr = (req.headers.cookie || []).map((h) => h.value).join('; ');
  const m = cookieStr.match(new RegExp(COOKIE_NAME + '=([^;]+)'));
  if (!m) return unauthorized();
  const token = m[1];

  // RS256 verify (header.payload.signature).
  const parts = token.split('.');
  if (parts.length !== 3) return unauthorized();
  const [headerB64, payloadB64, sigB64] = parts;

  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    if (payload.exp && Date.now() / 1000 > payload.exp) return unauthorized();

    const keys = (await jwks()).keys || [];
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return unauthorized();

    const pem = jwkToPem(jwk);
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(`${headerB64}.${payloadB64}`);
    const ok = verify.verify(pem, Buffer.from(sigB64, 'base64url'));
    if (!ok) return unauthorized();
  } catch (_e) {
    return unauthorized();
  }

  return req;
};
