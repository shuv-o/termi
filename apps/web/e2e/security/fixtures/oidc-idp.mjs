// A small OpenID Connect provider for the security suite: discovery,
// authorization code + PKCE, token and JWKS endpoints. POST /_test/next sets
// who the next sign-in is and how the provider should misbehave:
//   mode: ok | wrong-key | wrong-aud | wrong-nonce | wrong-issuer
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import http from 'node:http';
import { SignJWT, exportJWK } from 'jose';

const PORT = Number(process.env.OIDC_IDP_PORT || 23099);
const ISSUER = `http://localhost:${PORT}`;
const CLIENT_ID = process.env.OIDC_CLIENT_ID || 'termi-e2e';
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || 'termi-e2e-secret';

const good = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rogue = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

let next = { email: 'someone@example.test', email_verified: true, sub: 'sub-1', mode: 'ok' };
const codes = new Map();

const body = (req) =>
    new Promise((resolve) => {
        let d = '';
        req.on('data', (c) => (d += c));
        req.on('end', () => resolve(d));
    });
const json = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
};

http.createServer(async (req, res) => {
    const url = new URL(req.url, ISSUER);
    if (url.pathname === '/.well-known/openid-configuration') {
        return json(res, 200, {
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/authorize`,
            token_endpoint: `${ISSUER}/token`,
            jwks_uri: `${ISSUER}/jwks`,
            response_types_supported: ['code'],
            id_token_signing_alg_values_supported: ['RS256'],
        });
    }
    if (url.pathname === '/jwks') return json(res, 200, { keys: [jwk] });
    if (url.pathname === '/_test/next' && req.method === 'POST') {
        next = { ...next, mode: 'ok', ...JSON.parse(await body(req)) };
        return json(res, 200, next);
    }
    if (url.pathname === '/authorize') {
        const p = url.searchParams;
        if (p.get('client_id') !== CLIENT_ID || p.get('code_challenge_method') !== 'S256') {
            return json(res, 400, { error: 'invalid_request' });
        }
        const code = randomBytes(16).toString('hex');
        codes.set(code, {
            nonce: p.get('nonce'),
            challenge: p.get('code_challenge'),
            redirect: p.get('redirect_uri'),
            user: { ...next },
        });
        const to = new URL(p.get('redirect_uri'));
        to.searchParams.set('code', code);
        to.searchParams.set('state', p.get('state'));
        res.writeHead(302, { location: to.toString() });
        return res.end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
        const form = new URLSearchParams(await body(req));
        const auth = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64')
            .toString()
            .split(':')
            .map(decodeURIComponent);
        if (auth[0] !== CLIENT_ID || auth[1] !== CLIENT_SECRET) {
            return json(res, 401, { error: 'invalid_client' });
        }
        const grant = codes.get(form.get('code'));
        codes.delete(form.get('code'));
        const verifier = form.get('code_verifier') || '';
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (!grant || grant.challenge !== challenge || grant.redirect !== form.get('redirect_uri')) {
            return json(res, 400, { error: 'invalid_grant' });
        }
        const { user } = grant;
        const token = await new SignJWT({
            email: user.email,
            email_verified: user.email_verified,
            name: 'SSO User',
            nonce: user.mode === 'wrong-nonce' ? 'not-the-nonce' : grant.nonce,
        })
            .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
            .setSubject(user.sub)
            .setIssuer(user.mode === 'wrong-issuer' ? 'https://evil.example' : ISSUER)
            .setAudience(user.mode === 'wrong-aud' ? 'someone-else' : CLIENT_ID)
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(user.mode === 'wrong-key' ? rogue.privateKey : good.privateKey);
        return json(res, 200, { access_token: 'x', token_type: 'Bearer', id_token: token });
    }
    json(res, 404, { error: 'not_found' });
}).listen(PORT, () => console.log(`[oidc-idp] ${ISSUER}`));
