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

1. **GitHub Security Advisories (preferred):** [Open a private advisory](https://github.com/shuv-o/termix/security/advisories/new)
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

All server credentials (`host`, `username`, `password`, `privateKey`, `passphrase`, `notes`) are encrypted with AES-256-GCM before being written to the database:

```
plaintext credential
        │
        ▼
AES-256-GCM encrypt (random 96-bit IV)
  key = SHA-256(ENCRYPTION_KEY env var)
        │
        ▼
  ciphertext:IV stored in PostgreSQL
```

Decryption happens only in memory, during an active request, and the plaintext is never logged or persisted.

### Optional Master Key

Users can optionally enable a **master key** for an additional layer of protection:

```
ENCRYPTION_KEY (server-side AES layer)
        +
user's master password
        │
        ▼
PBKDF2 key derivation (600,000 iterations, SHA-256)
        │
        ▼
AES-256-GCM re-encryption of each credential
```

With a master key enabled, credentials cannot be decrypted even if the database and `ENCRYPTION_KEY` are both compromised — the user's master password is required.

### Password Hashing (Argon2id)

User passwords are hashed with **Argon2id** using parameters tuned for server-side security (memory cost, time cost, and parallelism are configurable).

### Connection Token (JWE)

When a terminal session is opened, the web app issues a short-lived **JWE token** (A256GCM, 5-minute TTL) containing the decrypted credentials. This token is sent to the browser and used to authenticate the WebSocket connection to the gateway. The gateway validates the token and discards it immediately — credentials live in memory only for the duration of the connection.

---

## Threat Model

### In Scope

| Threat                      | Mitigation                                            |
| --------------------------- | ----------------------------------------------------- |
| Database exfiltration       | AES-256-GCM encryption at rest; optional master key   |
| Credential theft in transit | TLS (configured via reverse proxy)                    |
| SSRF attacks                | `validateHost()` blocks private/loopback ranges       |
| Brute-force login           | Rate limiting on auth endpoints                       |
| Session hijacking           | HttpOnly, SameSite=Strict cookies; session revocation |
| XSS                         | CSP with nonces; React's built-in escaping            |
| Clickjacking                | `X-Frame-Options: DENY`                               |
| CSRF                        | SameSite cookies; CORS origin validation              |

### Out of Scope / Assumptions

- **Physical access** to the host running Termix
- **Compromise of the host OS** or container runtime
- **Weak secrets** — you are responsible for generating strong `SESSION_SECRET`, `ENCRYPTION_KEY`, and `GATEWAY_JWT_SECRET` values
- **Upstream dependencies** — we rely on well-maintained libraries (ssh2, jose, argon2, etc.) but cannot guarantee their security

---

## Self-Hosting Security Checklist

Before exposing Termix to the internet, ensure:

- [ ] All secrets (`SESSION_SECRET`, `ENCRYPTION_KEY`, `GATEWAY_JWT_SECRET`) are ≥32 random bytes
- [ ] HTTPS is enforced via a reverse proxy (Traefik, Nginx, Caddy)
- [ ] `ALLOW_PRIVATE_NETWORKS=false` unless you explicitly need it
- [ ] `ALLOW_LOCAL_TERMINAL` is not set unless you need it and understand the implications
- [ ] The database port is not exposed to the internet
- [ ] Docker socket (if used) is not accessible from the containers
- [ ] You have enabled 2FA on your Termix account
- [ ] You are running a recent version

---

## Responsible Disclosure

We are committed to working with security researchers to verify, reproduce, and address any potential vulnerabilities. We will not take legal action against researchers who follow responsible disclosure practices.
