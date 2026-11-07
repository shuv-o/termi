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

**What this protects against, and what it does not.** A database dump on its own reveals no credentials. A database dump *together with* `ENCRYPTION_KEY` reveals all of them, so keep the key out of database backups and away from anyone with database access. (Earlier versions advertised an optional per-user "master key" layer; it never encrypted anything and was removed in 1.2.0.)

### Password Hashing (scrypt)

User passwords are hashed with **scrypt** (N = 2^15, r = 8, p = 3 — the equal-cost, lower-memory variant of OWASP's N = 2^17 recommendation — 64-byte output, random salt), off the event loop. Hashes made with the previous, lower cost are upgraded automatically the next time the user signs in.

### Connection Token (JWE)

When a terminal session is opened, the web app issues a short-lived **JWE token** (A256GCM, 5-minute TTL) containing the decrypted credentials. This token is sent to the browser and used to authenticate the WebSocket connection to the gateway. The gateway validates the token and discards it immediately — credentials live in memory only for the duration of the connection.

---

## Threat Model

### In Scope

| Threat                      | Mitigation                                            |
| --------------------------- | ----------------------------------------------------- |
| Database exfiltration       | AES-256-GCM encryption at rest (key kept outside DB)  |
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

- [ ] All secrets (`SESSION_SECRET`, `ENCRYPTION_KEY`, `GATEWAY_JWT_SECRET`) are ≥32 random bytes
- [ ] HTTPS is enforced via a reverse proxy (Traefik, Nginx, Caddy)
- [ ] `ALLOW_PRIVATE_NETWORKS=false` unless you explicitly need it
- [ ] `ALLOW_LOCAL_TERMINAL` is not set unless you need it and understand the implications
- [ ] The database port is not exposed to the internet
- [ ] Docker socket (if used) is not accessible from the containers
- [ ] You have enabled 2FA on your Termi account
- [ ] You are running a recent version

---

## Responsible Disclosure

We are committed to working with security researchers to verify, reproduce, and address any potential vulnerabilities. We will not take legal action against researchers who follow responsible disclosure practices.
