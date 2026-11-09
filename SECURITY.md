# Security Policy

## Supported Versions

| Version                | Supported      |
| ---------------------- | -------------- |
| `main` branch (latest) | ✅ Active      |
| Older tagged releases  | ⚠️ Best-effort |

We recommend always running the latest version.

---

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, use one of:

1. **GitHub Security Advisories (preferred):** [Open a private advisory](https://github.com/shuv-o/termi/security/advisories/new)
2. **Email:** Contact the maintainer via their [GitHub profile](https://github.com/shuv-o)

### What to Include

- A clear description of the vulnerability
- Steps to reproduce (proof of concept if possible)
- The potential impact / attack scenario
- Suggested fix (optional)

### What to Expect

- Acknowledgement within **72 hours**
- We will work with you to understand and reproduce the issue
- A fix will be prioritised based on severity
- You will be credited in the security advisory (unless you prefer to remain anonymous)

---

## Encryption Architecture

### Credential Encryption (AES-256-GCM)

All server credentials (`host`, `username`, `password`, `privateKey`, `passphrase`, `notes`), keychain entries, TOTP secrets, webhook URLs and session recordings are encrypted with AES-256-GCM before being written to the database:

```
plaintext value
        │
        ▼
AES-256-GCM encrypt (random 96-bit IV)
  key = SHA-256(ENCRYPTION_KEY env var)
  AAD = which field of which record the value belongs to
        │
        ▼
  ciphertext stored in PostgreSQL
```

The AAD binds each ciphertext to its own field and record, so a value copied into a different column or row fails to decrypt instead of being revealed through a less-protected field. Values written before this binding existed are still readable and are upgraded the next time they are saved.

Decryption happens only in memory, during an active request, and the plaintext is never logged or persisted.

**What this protects against, and what it does not.** A database dump on its own reveals no credentials. A database dump *together with* `ENCRYPTION_KEY` reveals all of them, so keep the key out of database backups and away from anyone with database access.

### Password Hashing (scrypt)

User passwords are hashed with **scrypt** (N = 2^15, r = 8, p = 3 — the equal-cost, lower-memory variant of OWASP's N = 2^17 recommendation — 64-byte output, random salt), off the event loop. Hashes made with the previous, lower cost are upgraded automatically the next time the user signs in.

### Connection Token (JWE)

When a connection is opened, the web app issues a short-lived **JWE token** (A256GCM, 5-minute TTL) containing the decrypted credentials and the id of the sign-in that asked for it. The browser forwards it to the gateway in the WebSocket's first message but cannot decrypt it. The gateway validates the token and discards it — credentials live in memory only for the duration of the connection.

Because a token is only checked when a connection opens, the gateway asks the web app every `GATEWAY_ACCESS_CHECK_SEC` (default 30 s) whether each open connection may stay, over an internal endpoint authenticated with a gateway-only service token. Connections whose sign-in was revoked or expired, or whose user lost access to the server, are closed.

### AI Assistant

The assistant is optional: nothing is sent anywhere until the deployment (`AI_*` variables) or the user (Settings → AI assistant) configures a provider.

- **Secrets are removed on the server before anything is sent or stored.** Every password, private key and passphrase Termi holds for the user (servers and saved logins), their AI key and this server's own secrets are removed wherever they appear; pattern rules also remove private-key blocks, credentials in URLs, `password=…`-style values, password flags on common commands, bearer tokens, shadow hashes and well-known token formats. The redacted text is what the provider receives and what history keeps.
- **Server context is names only:** name, protocol, group and tags. Never addresses, usernames, notes or credentials.
- **Terminal output is marked as data**, and the instructions tell the model to treat it as such, so text on screen can't instruct the assistant.
- **Read-only:** suggested commands are pasted into the terminal as a single line with control characters removed, never with Enter; multi-line scripts can only be copied.
- **Keys:** a user's API key is stored encrypted (bound to its owner) and never returned to the browser; the deployment key never leaves the server.
- **Custom endpoints** go through the same host check as servers (private networks only with `ALLOW_PRIVATE_NETWORKS`, cloud metadata never), are re-checked before each request, and redirects are not followed.
- **History and memory** are encrypted per user, readable only by their owner, and can be deleted from Settings. A remembered "fact" that contained a secret is dropped.

---

## Threat Model

### In Scope

| Threat                      | Mitigation                                            |
| --------------------------- | ----------------------------------------------------- |
| Database exfiltration       | AES-256-GCM encryption at rest (key kept outside DB)  |
| Database tampering          | Each ciphertext bound (AAD) to its field and owner    |
| Man-in-the-middle to servers | SSH host keys pinned on first use, checked every time |
| Revoked or stolen sign-in   | Open connections closed when access ends (≤30 s)      |
| Secrets in images           | No secret build arguments; settings read at runtime   |
| Credential theft in transit | TLS (configured via reverse proxy)                    |
| SSRF attacks                | `validateHost()` blocks private/loopback ranges       |
| Brute-force login           | Rate limiting on auth endpoints                       |
| Session hijacking           | HttpOnly, SameSite=Strict cookies; session revocation |
| XSS                         | CSP with nonces; React's built-in escaping            |
| Clickjacking                | `X-Frame-Options: DENY`                               |
| CSRF                        | SameSite cookies; CORS origin validation              |

### Out of Scope / Assumptions

- **Physical access** to the host running Termi
- **Compromise of the host OS** or container runtime
- **Weak secrets** — you are responsible for generating strong `SESSION_SECRET`, `ENCRYPTION_KEY`, and `GATEWAY_JWT_SECRET` values
- **Upstream dependencies** — we rely on well-maintained libraries (ssh2, jose, argon2, etc.) but cannot guarantee their security

---

## Self-Hosting Security Checklist

Before exposing Termi to the internet, ensure:

- [ ] All secrets (`SESSION_SECRET`, `ENCRYPTION_KEY`, `GATEWAY_JWT_SECRET`) are ≥32 random bytes and none is an example placeholder
- [ ] `ENCRYPTION_KEY` is kept out of database backups (prefer `ENCRYPTION_KEY_FILE` pointing at a Docker/Kubernetes secret)
- [ ] HTTPS is enforced via a reverse proxy (Traefik, Nginx, Caddy), and `TRUSTED_PROXY` names that proxy (`cloudflare`, `x-real-ip` or `x-forwarded-for`)
- [ ] Behind Cloudflare, the origin only accepts Cloudflare's IP ranges (or use Cloudflare Tunnel) — otherwise `CF-Connecting-IP` can be forged
- [ ] `ALLOW_PRIVATE_NETWORKS=false` unless you explicitly need it (cloud metadata addresses stay blocked either way)
- [ ] `ALLOW_LOCAL_TERMINAL` is not set unless you need it and understand the implications
- [ ] The database port is not exposed; the bundled compose files keep Postgres on an internal network only the web app joins
- [ ] The database is reached over TLS (`DB_SSLMODE=verify-full`) unless it is on the same host or a private network
- [ ] The app connects as a least-privilege database role (see below)
- [ ] Docker socket (if used) is not accessible from the containers
- [ ] You have enabled 2FA or a passkey on your Termi account (consider "Passkey only" in Settings → Passkeys)
- [ ] Secrets are given to containers at runtime (environment or secret files), never as Docker build arguments
- [ ] The gateway can reach the web app (`WEB_INTERNAL_URL`), so removed access closes open connections
- [ ] You are running a recent version, and you verify image signatures (below)

### Least-privilege database role

Run migrations as the database owner, and the app as a role that can only read and write rows:

```sql
CREATE ROLE termi_app LOGIN PASSWORD '<random>';
GRANT CONNECT ON DATABASE termi TO termi_app;
GRANT USAGE ON SCHEMA public TO termi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO termi_app;
ALTER DEFAULT PRIVILEGES FOR ROLE <owner> IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO termi_app;
```

The published web image runs `prisma migrate deploy` on start, which needs the owner role; to split them, run migrations once with the owner's credentials and start the app with `termi_app`.

### Rotating the encryption key

1. Generate a new key: `openssl rand -base64 32`.
2. Set it as `ENCRYPTION_KEY`, and move the old one to `ENCRYPTION_KEY_PREVIOUS`.
3. Run `npm run db:reseal` (add `-- --dry-run` first to see what would change).
4. When it reports nothing left to re-seal, remove `ENCRYPTION_KEY_PREVIOUS`.

### Verifying published images

Release images are signed with Sigstore (keyless, GitHub OIDC) and carry an SBOM and SLSA provenance:

```sh
cosign verify ghcr.io/shuv-o/termi-web:<version> \
  --certificate-identity-regexp '^https://github.com/shuv-o/termi/\.github/workflows/docker-release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

---

## Responsible Disclosure

We are committed to working with security researchers to verify, reproduce, and address any potential vulnerabilities. We will not take legal action against researchers who follow responsible disclosure practices.
