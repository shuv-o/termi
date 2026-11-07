# Changelog

All notable changes to Termi are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.1.1] — 2026-11-07

### Added

- **Server hardening (Security card on each server).** A read-only scan checks SSH settings, users, firewall, open ports, fail2ban and pending updates, and gives a 0–100 security score with a list of findings. "Fix automatically" can then:
  - switch to key-only login with a freshly generated ed25519 key, optionally under a new dedicated sudo user;
  - choose how root may log in over SSH: off, key only, or with a password too;
  - turn off password logins, rotate the password, install fail2ban and enable unattended security updates;
  - enable a firewall (ufw or firewalld) with a checklist of the ports to keep open;
  - move SSH to a new port, including servers that use socket activation (Ubuntu 22.10+) and servers with their own hand-written nftables/iptables firewall (Termi opens only the new port with a tagged rule and keeps it across reboots and firewall reloads, without editing the admin's rule files).

  Every run is protected: new credentials are stored encrypted *before* use, an on-server rollback is armed *before* any change, sshd config is validated before reload, the new login is proven on a fresh connection, and only then are the server's credentials in Termi switched over. If anything fails, the server restores itself within five minutes even if Termi loses the connection. Each run is recorded and audit-logged.
- **Jump hosts (bastions).** Any saved server can be the jump host for another, like `ssh -J`. Works for SSH, SFTP, port-forward tunnels, metrics and the connection test. RDP/VNC behind a jump host are relayed by the gateway when the new `GUACD_TUNNEL_HOST` setting is set. Jump hosts are included in import/export, shown as "via <bastion>" in the server list, and a bastion that other servers still use cannot be deleted.
- **Terminal search.** Find text in the scrollback of SSH, Telnet and local terminals with ⌘F on macOS or Ctrl+Shift+F elsewhere (plain Ctrl+F stays readline's forward-char).
- **Connect from the command palette.** Enter on a server in ⌘K connects to it straight away; Shift+Enter opens its details.
- **Live metrics panel** beside the SSH terminal and on the server details page, with sparklines for CPU, memory, disk and network.
- The panel remembers the last page you visited.

### Changed

- **Redesigned interface.** One consistent design system across the landing page, dashboard, server pages, sessions, settings and dialogs: new colour tokens, IBM Plex Sans and JetBrains Mono, a new sidebar and mobile navigation, a fleet status strip on the dashboard, shared empty states and toasts, and dialogs that become bottom sheets on phones. Title casing and status colours are now consistent everywhere. The desktop app's window background matches the new theme, so there is no colour flash on launch.
- Docker images are pinned to Node.js 24.22.1.

### Fixed

- **Container start-up took about 3 minutes on every redeploy**, because the entrypoint installed the Prisma CLI from the registry each time a container was recreated. The CLI is now baked into the image; a fresh container is ready in about 2 seconds.
- **One failing alert channel silenced the others.** An SMTP timeout stopped webhook (Slack/Discord) and push alerts for the same event from being sent. Each channel now fails independently.
- The landing page and README said passwords are hashed with Argon2id; Termi uses scrypt.

### Security

- Resolved 23 Dependabot alerts: Next.js 16.3.5 (GHSA-2xp9-vwfh-vxw4, GHSA-p293-qw3h-jr36), sharp 0.35.4, nodemailer 9.1.1, vitest 4.1.11, Prisma 7.10.0, and overrides for vulnerable transitive `mysql2`, `fast-uri`, `js-yaml` and `@xmldom/xmldom`.
- Jump-host connections apply the SSRF checks to the bastion (which this server dials), and removing a server's jump host re-checks its own address, so a private target can't start being dialed directly.

### Upgrade notes

- Two database migrations (`add_server_jump_host`, `add_server_hardening`) run automatically on container start.
- Optional: set `GUACD_TUNNEL_HOST` on the gateway to allow RDP/VNC behind a jump host (`gateway` on the bundled Docker network). Without it, those connections are refused with a clear message; SSH-based jump connections need no setting.

---

## [1.1.0] — 2026-08-18

### Added

- **`GET /api/health`** on the web app, matching the gateway's existing health endpoint — checks database connectivity (2s timeout) for container orchestration liveness/readiness probes.
- CI now fails if root `package.json`, `package-lock.json`, and `apps/gateway/package.json` versions drift out of sync (this happened once silently before, through the 1.0.9 release).
- Unit tests for the SSRF blocklist (`validateHost()`) and the JWE connection-token mint/validate boundary between web and gateway — previously untested despite being the actual security boundary between the two services.
- `apps/web/.dockerignore` and `apps/gateway/.dockerignore`, so a local `node_modules` sitting in either app directory can no longer get copied over the correctly-installed one during a Docker build from that app's own context.

### Fixed

- **The published `termi-web` image failed on its very first container start** with `Error: The datasource.url property is required in your Prisma config file when using prisma migrate deploy`. `apps/web/prisma.config.ts` supplies that URL at runtime but was never copied into the runner image; once copied, its own `dotenv`/`prisma/config` imports still didn't resolve in the trimmed `.next/standalone` output. The entrypoint now runs a real `npm install prisma@<version>` on first boot — pinned to the exact `@prisma/client` version already baked into the image — instead of relying on `npx`'s temp cache or hand-copying individual packages. Verified end-to-end against a real Postgres container: all 13 migrations apply on first run, and a restart correctly skips re-running them.
- **`POST /api/push/subscribe` accepted any URL unvalidated**, unlike every other user-supplied host in the app — now runs the endpoint through the same `validateHost()` SSRF check as webhooks and server connections.
- Removed two stale references to `docker-compose.local.yml` in README.md and CONTRIBUTING.md — that file (along with `docker-compose.dokploy.yml`) was deleted in this release; the Postgres quick-start command now uses the main `docker-compose.yml`.

### Changed

- Docker images now build on Node.js 24 (up from 20).
- Removed `docker-compose.local.yml` and `docker-compose.dokploy.yml` — superseded by `docker-compose.yml` and `docker-compose.prebuilt.yml`.

---

## [1.0.13] — 2026-08-18

### Fixed

- **The published `termi-web` Docker image failed at container start with `exec /usr/local/bin/docker-entrypoint.sh: no such file or directory`.** The runner stage is `node:20-alpine`, which has no `bash`, but the entrypoint script's shebang was `#!/bin/bash` — the kernel can't find that interpreter and Docker reports the missing interpreter as if the script itself were missing. The script uses no bash-specific syntax, so the shebang is now `#!/bin/sh`.

---

## [1.0.12] — 2026-08-18

### Fixed

- **The published `termi-web` Docker image failed to build.** `apps/web/Dockerfile` switches to the unprivileged `nextjs` user before writing the entrypoint script; `COPY` always writes as root regardless of the active `USER`, so the following `RUN chmod +x` on that root-owned file failed with `Operation not permitted`. Fixed by setting the executable bit directly via `COPY --chmod=755` instead of a separate `RUN chmod` step.

---

## [1.0.11] — 2026-08-18

### Added

- **Prebuilt Docker images** — every tagged release now publishes multi-arch (amd64 + arm64) `termi-web` and `termi-gateway` images to both Docker Hub and GitHub Container Registry. A new `docker-compose.prebuilt.yml` deploys from these images instead of building from source.

### Security

- **API responses had no `Cache-Control` header, allowing a shared cache to serve one user's authenticated data to another.** `/api/auth/me` and nearly all other JSON endpoints returned per-session data (email, name, 2FA/passkey status, etc.) with no directive telling intermediary caches (CDN, reverse proxy) not to store the response — a cached authenticated response could be replayed to a later, unauthenticated visitor. All response helpers in `lib/api/utils.ts` now send `Cache-Control: private, no-store`, with the same rule applied globally to `/api/*` in `next.config.mjs` as a backstop for routes that build a response without those helpers.
- **The tunnel HTTP proxy (`/tunnel/[serverId]/[port]/...`) forwarded the tunneled target's own `Cache-Control` (or lack of one) straight through to the browser.** This route is same-origin and gated by session + per-server ownership, so a shared cache storing that response would let a cache HIT bypass the authorization check entirely, serving one user's private tunneled server content to anyone who requested the same URL. The proxy now always overrides the response with `Cache-Control: private, no-store`, and `next.config.mjs` applies the same rule as a backstop to `/tunnel/*`, `/panel/*` (the authenticated dashboard), `/invitations/*`, `/setup-encryption`, `/unlock-encryption`, and `/reset-password`.

---

## [1.0.10] — 2026-08-17

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

- **Canonical domain moved to `termi.run`.** Requests arriving on the project's previous domains (`termi.shuvoo.com`, `termix.run`) now get a permanent (301) redirect to the same path on `termi.run` instead of serving the app directly.
- Mobile layout and navigation overhauled across the panel (keychain, groups, sessions), with a redesigned keychain entry card and clearer active-tab styling.
- Status/success colors unified to emerald and high-load warnings to amber across every view that previously used ad-hoc green/yellow, via one shared protocol/status color source.

### Fixed

- **RDP/VNC on mobile didn't accept touch input** — touch events weren't translated to mouse events, so remote desktop sessions were effectively unusable on a phone or tablet. Added an on-screen keyboard trigger and a special-key row (Ctrl, Alt, Tab, arrows) for protocols that need them.
- Sitemap and `robots.txt` pointed self-hosted deployments at this project's own GitHub URL instead of the deployment's real domain — both now resolve through the same `getSiteUrl()` used everywhere else.

### Security

- **Session recordings were stored in plaintext.** Now encrypted the same way as server credentials (AES-256-GCM) before storage, decrypted only when a recording is opened for playback.
- **The tunnel HTTP proxy no longer forwards the browser's live Termi session cookie or `Authorization` header to the tunneled target.** This route is same-origin with the rest of the app, so the browser was attaching both automatically to every proxied request — a tunneled target (by definition something other than Termi itself) could previously have captured a real session credential.
- Tunnel HTTP responses now stream instead of buffering the full body in memory — a bounded buffer applies only to HTML responses, to inject a `<base>` tag for relative-link rewriting. Large file transfers through a tunnel no longer risk exhausting server memory.
- Added a per-user concurrent-tunnel cap on the gateway (10) to bound resource use from a runaway or malicious bridge script — each tunnel opens its own unpooled SSH connection.

### Note

- Passkeys are bound to the domain they were registered on. Anyone who registered a passkey while this instance ran on `termi.shuvoo.com` or `termix.run` will need to re-register it under `termi.run` — WebAuthn credentials do not carry over across a domain change.

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

[Unreleased]: https://github.com/shuv-o/termi/compare/v1.0.10...HEAD
[1.0.10]: https://github.com/shuv-o/termi/compare/v1.0.8...v1.0.10
[1.0.0]: https://github.com/shuv-o/termi/releases/tag/v1.0.0
