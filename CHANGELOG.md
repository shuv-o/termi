# Changelog

All notable changes to Termi are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

Planned as 1.2.0. Security hardening follow-ups to 1.1.2, and the removal of the unused "master key".

### Security

- **SSH host keys are verified (known_hosts).** Termi now records each server's SSH host key on the first connection and refuses to connect — terminal, file browser, tunnels, monitoring, hardening, everything — if the server later presents a different key, so a man-in-the-middle can no longer capture your server logins. Jump hosts are verified the same way. A changed key is reported in the terminal, logged in Account activity and emailed to you; the server's details page shows the pinned key, checks the current one and lets you trust a new key after re-authenticating (and only if the server really presents it). Changing a server's host or port records its key afresh.
- **Encrypted values are bound to their field and owner.** Every stored secret (server credentials, keychain entries, TOTP secrets, webhook URLs, recordings) is now authenticated (AES-GCM AAD) against the field it belongs to and the user who owns it. Someone with write access to the database can no longer move a private key into a notes field — or into their own account — to read it. Existing values stay readable and are upgraded the next time they are saved.
- **Keychain secrets no longer reach the browser without re-authentication.** Picking a keychain entry in the server form sends only its id; the server fills in the secret itself. Copying a secret on the Keychain page asks for your password or passkey (once per 5 minutes) and is audit-logged. Editing an entry no longer loads its secret — blank fields keep the stored value.
- **Client IP headers are only trusted when configured.** `TRUSTED_PROXY` now names the proxy that sets the client IP: `cloudflare`, `x-real-ip` or `x-forwarded-for` (`true` keeps its old meaning). Previously `CF-Connecting-IP` and `X-Real-IP` were trusted from anyone, so rate limits could be dodged by sending a fake header.
- **Docker images install exactly the locked dependency versions.** The published images now build from the repository root with `npm ci` against `package-lock.json`, instead of resolving the newest matching versions at build time.
- **Stronger password hashing, off the event loop.** scrypt now runs asynchronously at N=2^15, r=8, p=3 (OWASP's equal-cost alternative to N=2^17 that needs ~32 MiB instead of ~128 MiB per hash). Existing passwords are upgraded automatically at the next sign-in.
- **No more account enumeration.** Registering an email that already has an account answers exactly like a new sign-up (the real owner gets an email about it); signup verification and code resends answer the same for unknown accounts; passkey sign-in options look the same whether or not an email has passkeys.
- HSTS no longer forces `includeSubDomains; preload` on every self-hosted domain; set `HSTS_PRELOAD=true` to opt in.

- **Encryption keys can be rotated.** Stored values record which key encrypted them; `ENCRYPTION_KEY_PREVIOUS` keeps retired keys readable, and `npm run db:reseal` re-encrypts everything under the current key (it also upgrades all pre-1.2 values at once). Keys can be read from files (`ENCRYPTION_KEY_FILE`) for Docker/Kubernetes secrets.
- **Tunnels can live on their own domain.** With `TUNNEL_ORIGIN_TEMPLATE` set, every port-forward tunnel is served from its own origin (e.g. `https://<id>.termi-tunnels.net`), isolated from Termi and from other tunnels; tunneled apps then run unsandboxed and keep their own logins. A tunnel origin serves nothing but its tunnel. Without it, tunnels stay sandboxed on Termi's origin.
- **Security emails.** You're emailed when your account signs in from a new device, when your password is changed or reset, when 2FA is turned on or off, when a passkey is added or removed, and when your servers are exported.
- **"Passkey only".** An optional setting (Settings → Passkeys) turns off password sign-in, so a leaked or phished password is useless. It needs a passkey, and turns itself off if the last passkey is removed or the password is reset by email.
- **Account activity.** Settings → Account activity lists your sign-ins and security events. Successful sign-ins are now recorded (only failures were before).
- **Cloud metadata is always blocked.** 169.254.169.254 and other cloud metadata endpoints are refused even with `ALLOW_PRIVATE_NETWORKS=true`, in the web app and the gateway.
- **Rate limits survive restarts and scale out** with `REDIS_URL` (optional; in-memory otherwise). Email-code guess counting uses the same store.
- **Hardened containers.** The compose files now split networks (Postgres is internal and only the web app reaches it; the gateway can't), run containers read-only with all capabilities dropped, `no-new-privileges`, and PID/memory limits. The web image applies migrations on every start (no flag file), so it runs read-only.
- **Desktop app fuses.** The packaged app can no longer be run as plain Node (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `--inspect`), only loads its integrity-checked `app.asar`, and encrypts its cookies at rest.
- **Content Security Policy:** adds `frame-ancestors 'none'` and Trusted Types in report-only mode.
- **Database:** `DB_SSLMODE` enables TLS to Postgres; database credentials with special characters now work. `SECURITY.md` documents a least-privilege database role.
- **Supply chain:** GitHub Actions are pinned to commit SHAs; Dependabot covers npm, actions and Docker; CodeQL runs on every push; CI fails on unreviewed high/critical advisories in production dependencies; release images carry an SBOM and SLSA provenance and are signed with Sigstore (see `SECURITY.md` to verify).
- **Security regression suite.** `npm run test:security` (and the "Security E2E" CI job) proves the tunnel isolation, guacd handshake filtering, keychain step-up, field binding, enumeration resistance and related protections against a real web app, gateway, database, SSH host, guacd and VNC server.

### Added

- **Split panes.** Show up to four sessions at once — side by side, stacked or in a grid — with draggable dividers (arrow keys work too). "Split right/down" in a session's header opens another shell to the same server beside it; picking a tab while split puts it in the focused pane. The split is remembered across reloads. Phones keep showing one session at a time.
- **Type in all panes.** Optional broadcast typing sends what you type to every visible pane (like tmux's synchronize-panes), with a clear banner while it's on.
- **Saved workspaces.** Save the open sessions and their layout under a name and reopen them together in one click (Layout menu). Servers you can no longer open are skipped and reported.
- **SOCKS proxy and remote port forwarding.** Port forwarding now has three modes: Local (`ssh -L`), SOCKS proxy (`ssh -D`: a SOCKS5 proxy on your computer that sends each connection out from the server, resolving names there) and Remote (`ssh -R`: the server listens on a port and reaches a service on your computer — a dev server, a webhook receiver). They run inside the desktop app, or anywhere via a small Node.js bridge script; several can run side by side.
- **Tunnels no longer stop accepting connections after 5 minutes, and are much faster.** A tunnel is now one WebSocket and one SSH connection carrying every TCP connection (with per-connection flow control and proper half-close), instead of a new SSH handshake per connection with a 5-minute token that ran out. The sign-in token only has to be valid when the tunnel starts. Older desktop apps and bridge scripts keep working for local forwarding.
- **Import from other SSH clients.** The import dialog now reads an OpenSSH `~/.ssh/config` (with `Host` patterns, first-match defaults and `ProxyJump` turned into jump hosts), PuTTY / KiTTY sessions exported with `reg export`, and MobaXterm session files (SSH, SFTP, RDP and VNC, with folders as groups and SSH gateways as jump hosts). CSV import also recognises other tools' column names (Label, Hostname, Address, User, Groups, …), so a Termius or spreadsheet export works too. The dialog previews exactly what will be imported, explains what can't be (key files on your computer, ProxyCommand, multi-hop jumps, unsupported session types), and can apply a keychain login to every server the file has no credentials for.

### Removed

- **The optional "master key".** It was presented as a second encryption layer but never encrypted anything, while Google sign-in users had to create and unlock a passphrase on every login. The setup and unlock steps, the Settings → Encryption section and Danger zone (whose only action deleted all servers) are gone; old links redirect to the panel. Sign-in no longer derives a key from the password (600,000 PBKDF2 iterations per login).

### Changed

- **Resetting a forgotten password keeps your servers.** It used to delete every stored server, on the grounds that the credentials became unreadable — which they never did. All existing sessions are still signed out.

### Upgrade notes

- Behind Cloudflare, set `TRUSTED_PROXY=cloudflare` (and make sure the origin only accepts Cloudflare traffic); behind nginx/Traefik/Caddy, set `x-real-ip` or `x-forwarded-for`. Without it, per-IP rate limits are shared by all clients (per-account limits still apply), and the app logs a warning.
- One new migration (`add_keychain_revealed_audit`) applies automatically on start.
- If you build the Docker images yourself with `apps/web/Dockerfile` or `apps/gateway/Dockerfile`, the build context is now the repository root: `docker build -f apps/web/Dockerfile .`
- Two more migrations apply automatically on start (`add_keychain_revealed_audit`, `add_password_login_disabled`). The published web image now runs `prisma migrate deploy` on every start.
- To bind all existing secrets right away instead of on their next save, run `npm run db:reseal` once (`-- --dry-run` first to preview).
- Optional new settings: `TUNNEL_ORIGIN_TEMPLATE`, `REDIS_URL`, `DB_SSLMODE`, `ENCRYPTION_KEY_FILE`, `ENCRYPTION_KEY_PREVIOUS` (see `.env.example`).
- If you deploy with the bundled compose files, their networks changed (`edge`, `data`, `remote`): recreate the stack with `docker compose up -d`.

---

## [1.1.2] — 2026-11-07

A security release. Upgrading is recommended for every installation.

### Security

- **Critical: a tunneled web app could act as you.** The port-forward proxy (`/tunnel/…`) served the target's pages from Termi's own origin, so a script in any tunneled app — including one on a server someone shared with you — could call Termi's API with your session: mint connection tokens for all your servers and run commands on them, read your keychain, or register a service worker that persisted on the Termi origin. In the desktop app it could also open a local shell. Tunneled pages are now sandboxed to an opaque origin (no session cookie, API, storage, service workers or desktop bridge) and authenticated by a short-lived token in the URL that only grants that one host and port. Headers that would affect the whole origin (`Service-Worker-Allowed`, `Clear-Site-Data`, CSP, HSTS, CORS, …) are no longer passed through, and the target's cookies are confined to the tunnel path.
- **High: the RDP/VNC handshake could be hijacked.** The gateway forwarded browser frames to guacd before sending its own handshake, so a user could send their own `connect` — reaching any host (bypassing the gateway's SSRF guard) with any guacd parameters, such as a drive mapped to the guacd container's filesystem. Browser frames are now dropped until the gateway's handshake is done, and handshake instructions are never accepted from the browser.
- **High: code injection in the generated tunnel bridge script.** A server name or remote host containing a newline or `${…}` became code in the Node.js script you run locally — exploitable by whoever shared a server with you. Those values now only appear as string literals.
- **High: account pre-hijacking through Google sign-in.** "Sign in with Google" linked to an existing account with the same email even if it was never verified, so someone who registered your email first kept a working password into the account you then used. Google is now only linked to verified accounts.
- **High: email verification codes could be brute-forced.** `verify-signup` had no attempt limit and signed the account in, bypassing password and 2FA. Email codes are now burned after 5 wrong guesses, verification is rate-limited per account, and it no longer signs in an account that has 2FA.
- **Desktop app: IPC accepted calls from any page, and server-side redirects were not filtered.** Local-terminal, tunnel and passkey IPC now only answer Termi's own top-level pages, and redirects to other sites open in the browser instead.
- Google sign-in now asks for the second factor on accounts with 2FA (it used to skip it).
- 2FA codes are rate-limited per account as well as per IP, so rotating addresses no longer buys more guesses.
- The gateway connects to the exact address it checked, closing a DNS-rebinding bypass of its private-network guard.
- Session reattach checks the server too, so a revoked share can't keep using a live session.
- One user can no longer exceed the tunnel and local-terminal caps (a slot was released twice on errors), exhaust gateway memory with chunked SCP uploads, or request an unbounded RDP framebuffer.
- Webhook alerts no longer follow redirects (blind SSRF to internal addresses).
- Decrypted keychain reads are rate-limited.
- Fixed an open redirect in the login page's `?next=` parameter (`//host`).
- The example placeholder values for `SESSION_SECRET` and `GATEWAY_JWT_SECRET` are refused in production; a placeholder `ENCRYPTION_KEY` logs a warning.
- Dependencies (all open Dependabot alerts with a fix): Next.js 16.4.5 (image-optimizer and `next/og` RCEs, SSRF, cache poisoning), Electron 42.11.18, nodemailer 10.3.1, sharp 0.35.5, zod 4.6.7, vitest 4.1.12, vite 8.3.6, plus fixed `shell-quote`, `undici`, `fast-uri` and `source-map-js`. The unused `electron` dependency was removed from the web app.

### Fixed

- **Changing your password failed for anyone with servers.** It tried to re-encrypt server credentials with a key they were never encrypted with, so the change rolled back (and other sessions stayed signed in).
- - **Fresh installs were missing the database objects for several features.** Telnet servers, server sharing and invitations, session recordings, benchmark history, tunnel sessions, webhook alerts and nine audit actions were added to the Prisma schema without migrations, so any database built by `prisma migrate deploy` — every Docker install — lacked them, and those features failed. A new migration (`20261107000000_sync_schema_drift`) adds them. Every statement is idempotent, so databases that already have these objects (synced with `prisma db push`) apply it as a no-op.

### Upgrade notes

- **If your `SESSION_SECRET` or `GATEWAY_JWT_SECRET` is still the `change-me…` example value, the new version will not start in production.** Replace it with `openssl rand -base64 32` (this signs everyone out). If `ENCRYPTION_KEY` is the example value, it still works but logs a warning — your stored credentials are readable by anyone with a database dump; set a new key and re-enter them.
- Tunneled web apps now run sandboxed: they work, but can no longer use their own cookies or `localStorage`, so apps that need a login of their own may not keep you signed in through the `/tunnel` proxy. Use the desktop app's local port or the bridge script for those.
- The desktop app moves to Electron 42.
- One new database migration (`sync_schema_drift`) applies automatically on start; on databases that already have those objects it changes nothing.

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
