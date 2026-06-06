# Changelog

All notable changes to Termi are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Security
- Updated `next` to 16.2.7, resolving advisories for CSP-nonce XSS, Middleware/Proxy redirect bypass and cache-poisoning, and Server Components DoS
- Patched transitive dependencies via `npm audit fix` (`ws`, `defu`, `fast-uri`, `tmp`, `vite`) — clears all high-severity advisories in the runtime path
- Password-reset URLs (which contain a single-use token) are no longer written to server logs in production; the dev-only fallback now requires `NODE_ENV !== 'production'`

### Removed
- Dropped the dead `assertDatabaseSslInProduction` no-op helper and its stale unit tests (SSL enforcement had already been removed)

---

## [1.0.0] — 2025-06-05

### 🎉 Initial Public Release

**Authentication & Security**
- User registration and login with Argon2id password hashing
- TOTP-based two-factor authentication (TOTP 2FA) — works with Google Authenticator, Authy, and any RFC 6238-compliant app
- Email-based OTP as a 2FA backup
- Passkey / WebAuthn authentication (hardware keys, Touch ID, Face ID)
- Google OAuth ("Sign in with Google")
- Email verification with token-based flow
- Password reset via email
- Per-device session management with revocation
- Optional master key encryption — second AES-256-GCM layer derived via PBKDF2
- AES-256-GCM encryption for all stored server credentials
- SSRF protection on all user-supplied host inputs
- Rate limiting on authentication endpoints
- CSP headers with per-request nonces

**Remote Protocols**
- **SSH** — full terminal emulation powered by xterm.js; supports password and private-key authentication, passphrase-protected keys, resizable viewport, keep-alive
- **SCP / SFTP** — web-based file manager: browse directories, upload files, download files, create folders, rename, and delete
- **RDP** — Windows Remote Desktop Protocol via Apache Guacamole (guacd 1.5.x); supports NLA, any, and RDP security modes; self-signed certificate bypass
- **VNC** — Virtual Network Computing via Apache Guacamole

**Local Terminal**
- Local machine shell access from within the app
- Electron mode: spawns PowerShell (Windows) or `$SHELL` / `/bin/bash` (macOS/Linux) via node-pty
- Browser/cloud mode: spawns a shell on the gateway host (gated by `ALLOW_LOCAL_TERMINAL=true`)
- Automatic local terminal tab on Electron launch

**Server Management**
- Add, edit, and delete servers with full credential management
- Server grouping with drag-and-drop reorder
- Quick-connect from dashboard
- Test connection before saving
- Server credential reveal (decrypted view, rate-limited)
- Server transfer between groups

**Monitoring**
- Real-time CPU, memory, and disk metrics over SSH
- Health history charts and status indicators
- Configurable monitoring intervals
- Email and web push notification alerts
- Built-in benchmark tool

**Server Sharing**
- Share servers with other users via secure invitation links
- Per-server share listing and revocation
- Shared server access for invited users

**Push Notifications**
- Web Push (VAPID) notifications for monitoring alerts
- Per-device subscription management

**Desktop App (Electron)**
- Native macOS, Windows, and Linux desktop app
- Connects to any self-hosted Termi instance
- Full local stack mode (`electron:dev:full`)
- Bundled gateway (node-pty) for local terminal without a cloud instance
- Setup UI for first-run configuration

**Infrastructure**
- Docker Compose deployment with Traefik reverse-proxy support
- PostgreSQL database via Prisma ORM
- Path-based and domain-based Traefik routing modes
- `docker-compose.local.yml` for local development with Docker
- Electron build pipeline (`electron-builder`)

**PWA & Mobile**
- Installable Progressive Web App
- Virtual keyboard with Ctrl, Alt, Shift, Fn, Tab, and arrow keys
- Touch-optimised terminal and file manager
- Responsive design for all screen sizes

[Unreleased]: https://github.com/shuvoooo/termi/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/shuvoooo/termi/releases/tag/v1.0.0
