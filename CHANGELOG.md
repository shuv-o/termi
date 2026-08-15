# Changelog

All notable changes to Termix are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Port forwarding (tunnels)** — forward any port reachable from a server, the same way `ssh -L` does, without opening a terminal. Auto-detects HTTP targets and hands back a one-click in-browser link served at `/tunnel/<serverId>/<port>`; anything else gets a copyable, dependency-free Node.js bridge script to run locally. The desktop app instead binds a real local TCP port directly via a new Electron IPC bridge. Stateless by design — nothing is tracked server-side beyond a per-user concurrent-tunnel cap (10) on the gateway.
- **Multi-server broadcast** — run a shell command across every server in a group at once from the Groups view, with a per-server pass/fail results breakdown.
- **Session recording & playback** — record any SSH session as an asciicast v2 transcript, browsable and replayable in-browser from Settings → Recordings, with duration/size shown per entry.
- **Webhook alerts** — route monitoring alerts to Slack, Discord, or any generic webhook URL, alongside the existing email and web push notifications.
- **Benchmark history & trends** — benchmark runs now persist per server, with a trend chart instead of only ever showing the most recent run.
- **QR quick-connect** — scan a QR code from a mobile device to open a one-tap connection to a server.
- **Global command palette (⌘K / Ctrl+K)** — jump to any server, group, keychain entry, or settings section, or run/create a reusable command snippet, without leaving the keyboard.
- **Command snippets** — save frequently-used shell commands and send them into the active terminal with one click.

### Changed

- Mobile layout and navigation overhauled across the panel (keychain, groups, sessions), with a redesigned keychain entry card and clearer active-tab styling.
- Status/success colors unified to emerald and high-load warnings to amber across every view that previously used ad-hoc green/yellow, via one shared protocol/status color source.

### Fixed

- **RDP/VNC on mobile didn't accept touch input** — touch events weren't translated to mouse events, so remote desktop sessions were effectively unusable on a phone or tablet. Added an on-screen keyboard trigger and a special-key row (Ctrl, Alt, Tab, arrows) for protocols that need them.
- Sitemap and `robots.txt` pointed self-hosted deployments at this project's own GitHub URL instead of the deployment's real domain — both now resolve through the same `getSiteUrl()` used everywhere else.

### Security

- **Session recordings were stored in plaintext.** Now encrypted the same way as server credentials (AES-256-GCM) before storage, decrypted only when a recording is opened for playback.
- **The tunnel HTTP proxy no longer forwards the browser's live Termix session cookie or `Authorization` header to the tunneled target.** This route is same-origin with the rest of the app, so the browser was attaching both automatically to every proxied request — a tunneled target (by definition something other than Termix itself) could previously have captured a real session credential.
- Tunnel HTTP responses now stream instead of buffering the full body in memory — a bounded buffer applies only to HTML responses, to inject a `<base>` tag for relative-link rewriting. Large file transfers through a tunnel no longer risk exhausting server memory.
- Added a per-user concurrent-tunnel cap on the gateway (10) to bound resource use from a runaway or malicious bridge script — each tunnel opens its own unpooled SSH connection.

---

## [1.0.5] — 2026-07-18

### Changed

- **Removed the per-user concurrent connection limit.** Users were capped at 5 concurrent SSH sessions; beyond that the gateway evicted their oldest detached session, and rejected the connection outright when none was detached. The cap is now unlimited by default and configurable via `GATEWAY_MAX_CONNECTIONS_PER_USER`.

### Fixed

- Landing page download buttons pointed at a hardcoded bucket URL pinned to v1.0.0, so every download served a stale build. Downloads now resolve to the newest GitHub release via `/api/download`, and the page no longer advertises Windows ARM64, which is not built.

---

## [1.0.4] — 2026-07-18

### Fixed

- macOS Apple Silicon builds failed in CI: `hardenedRuntime: true` makes electron-builder pass `--timestamp` to `codesign --sign -`, but ad-hoc signatures cannot be timestamped. The arm64 target signs every nested binary, so it reliably timed out against Apple's timestamp server. Hardened runtime now stays off until real code signing is configured — it already required a Developer ID the project does not have, so notarization and the native passkey bridge are unaffected.

---

## [1.0.3] — 2026-07-18

First release to actually ship desktop installers. v1.0.2 built them but uploaded nothing.

### Fixed

- Release builds uploaded no installers: `release.yml` publishes a non-draft release for the tag, while electron-builder defaults to `releaseType: draft` and silently skipped every asset (while still exiting 0). Now set to `releaseType: release`.
- macOS builds failed with `<repo dir> not a file` — an undefined GitHub secret renders as an empty string, so `CSC_LINK=""` was treated as a certificate path. The signing env vars are no longer set unconditionally.

---

## [1.0.2] — 2026-07-18

### Added

- **Desktop auto-update** — the Electron app now checks GitHub Releases on launch and every 6 hours, downloads updates in the background, and prompts to restart. A "Check for Updates…" item was added to the app menu (macOS) and a new Help menu (Windows/Linux).
- Desktop releases now publish installers for every platform: `.dmg` and `.zip` (macOS), `.exe` (Windows, NSIS), and `.AppImage` (Linux).

### Fixed

- Packaged desktop builds crashed on launch because `updater.js` was missing from the app bundle.
- Release builds produced no installers: `electron-builder.yml` takes precedence over the `build` field in `package.json`, so the publish and target configuration was being ignored.
- Upload progress rows used `Math.random()` for ids, so collisions could desync progress bars. Now uses `crypto.randomUUID()`.
- CI workflow now scopes `GITHUB_TOKEN` to `contents: read` (least privilege).

### Security

- `nodemailer` 8.0.4 → 9.0.3 — the `raw` message option could bypass `disableFileAccess`/`disableUrlAccess` ([GHSA](https://github.com/advisories)). This codebase does not use `raw`, so it was not exploitable here.
- Patched transitive dependencies via npm `overrides`: `shell-quote` ≥1.8.4, `form-data` ≥4.0.6, `undici` ≥6.27.0.

---

## [1.0.0] — 2026-06-06

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
- Connects to any self-hosted Termix instance
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
- CSP-compliant offline page: "Retry Connection" runs a real connectivity probe and the page auto-reloads the moment the network returns
- Suspense boundaries around `useSearchParams()` on the login and register pages
- Privacy and Security policy pages
- Multi-architecture desktop downloads (Apple Silicon + Intel, Windows x64/ARM64, Linux x64/ARM64) with automatic platform/arch detection

**Open Source & Community**

- Community health files: `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `.github/FUNDING.yml`, and `.github/CODEOWNERS`
- Automated GitHub release workflow (`.github/workflows/release.yml`) publishing version-tagged releases with notes sourced from `CHANGELOG.md`

**Security Hardening**

- `next` updated to 16.2.7, resolving advisories for CSP-nonce XSS, Middleware/Proxy redirect bypass and cache-poisoning, and Server Components DoS
- Patched transitive dependencies (`ws`, `defu`, `fast-uri`, `tmp`, `vite`) — clears all high-severity advisories in the runtime path
- Password-reset URLs (single-use tokens) are no longer written to server logs in production

[Unreleased]: https://github.com/shuv-o/termix/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/shuv-o/termix/releases/tag/v1.0.0
