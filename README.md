<div align="center">

# 🖥️ Termi

**Self-hosted server management — SSH, SCP, RDP, VNC & local terminal from your browser or desktop**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/shuvoooo/termi/actions/workflows/ci.yml/badge.svg)](https://github.com/shuvoooo/termi/actions/workflows/ci.yml)
[![Release](https://github.com/shuvoooo/termi/actions/workflows/release.yml/badge.svg)](https://github.com/shuvoooo/termi/actions/workflows/release.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg?logo=next.js)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)

[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-FF5E5B.svg?logo=ko-fi&logoColor=white)](https://ko-fi.com/shuvoo)

</div>

---

## ✨ Features

### 🔐 Security & Authentication

- **AES-256-GCM** encryption for all stored server credentials
- **Argon2id** password hashing with secure parameters
- **TOTP-based 2FA** — works with Google Authenticator, Authy, and any TOTP app
- **Passkey / WebAuthn** — passwordless login with hardware keys and biometrics
- **Google OAuth** — "Sign in with Google" support
- **Optional master key** — adds a second encryption layer derived via PBKDF2
- Zero-trust architecture — credentials are decrypted only in memory, never stored in plaintext

### 🖥️ Multi-Protocol Remote Access

- **SSH** — full terminal emulation with [xterm.js](https://xtermjs.org/), key forwarding, and resizable viewport
- **SCP / SFTP** — web-based file manager: upload, download, create folders, rename, delete
- **RDP** — Windows Remote Desktop via [Apache Guacamole](https://guacamole.apache.org/)
- **VNC** — Virtual Network Computing via Apache Guacamole

### 💻 Local Terminal

- Access your **local machine's shell** directly from the app
- **Electron**: spawns PowerShell (Windows) or your default shell (macOS/Linux)
- **Browser/cloud**: spawns a shell on the gateway host (gated by `ALLOW_LOCAL_TERMINAL=true`)

### 📊 Server Monitoring

- Real-time **CPU, memory, and disk** metrics fetched over SSH
- **Health history** charts
- Configurable **email & push notification** alerts
- Built-in **benchmark tool**

### 🤝 Server Sharing

- Share server access with other users via invitation links
- Per-server share management and revocation

### 📱 PWA & Mobile

- **Install as a PWA** on any device (iOS, Android, desktop)
- Virtual keyboard with Ctrl, Alt, Shift, Fn, and arrow keys
- Touch-optimised design
- **Web push notifications** for monitoring alerts

### 🖥️ Desktop App (Electron)

- Native app for **macOS, Windows, and Linux**
- Local terminal access via node-pty
- Connects to your self-hosted Termi instance
- Bundled gateway for fully offline / local-stack operation (`electron:dev:full`)

### 📦 Self-Hosted & Privacy-First

- **Docker Compose** one-command deployment
- **PostgreSQL** database — your data stays on your server
- **No telemetry**, no cloud dependencies
- [Traefik](https://traefik.io/) reverse-proxy support included

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Deploy with Docker

```bash
# 1. Clone the repository
git clone https://github.com/shuvoooo/termi.git
cd termi

# 2. Copy and configure environment
cp .env.example .env
```

Open `.env` and set the required secrets (generate each with `openssl rand -base64 32`):

```dotenv
DB_HOST=postgres          # set to your DB host (Docker service name or external host)
DB_USER=termi
DB_PASSWORD=<strong-password>
DB_NAME=termi

SESSION_SECRET=<openssl rand -base64 32>
ENCRYPTION_KEY=<openssl rand -base64 32>
GATEWAY_JWT_SECRET=<openssl rand -base64 32>

NEXT_PUBLIC_GATEWAY_URL=ws://localhost:22080/gateway
NEXT_PUBLIC_APP_URL=http://localhost:22080
```

```bash
# 3. Start the stack
docker compose up -d

# 4. Run database migrations
docker compose exec web npx prisma migrate deploy

# 5. Open Termi
open http://localhost:22080
```

> **RDP / VNC**: also start guacd — on Apple Silicon, add `--platform linux/arm64`:
>
> ```bash
> docker run -d -p 4822:4822 --name termi-guacd guacamole/guacd: 1.6.0
> ```

---

## 💻 Desktop App Installation

Download the desktop app for your platform and architecture from the landing page.
Builds are provided for **macOS, Windows, and Linux** in both **x64** and **arm64**.

### macOS — first launch

The macOS build is **ad-hoc signed but not notarized** (the project has no paid
Apple Developer ID). On first launch, macOS Gatekeeper shows:

> _"Apple could not verify 'Termi.app' is free of malware…"_

This is expected. To open the app anyway, use either method:

**Option A — Right-click to open**

1. In Finder, locate **Termi.app** (drag it to `/Applications` first).
2. **Right-click** (or Control-click) the app → **Open**.
3. Click **Open** in the dialog. macOS remembers this choice for future launches.

**Option B — Remove the quarantine flag**

```bash
xattr -dr com.apple.quarantine /Applications/Termi.app
```

Then open the app normally.

### Windows

SmartScreen may warn that the publisher is unknown. Click **More info → Run anyway**.

### Linux

The Linux build is distributed as an **AppImage** — no installation required.

```bash
chmod +x termi.AppImage
./termi.AppImage
```

---

## 🛠️ Development Setup

### Prerequisites

- Node.js 22+
- PostgreSQL 15+ (or use Docker Compose)

```bash
# Install dependencies
npm install

# Copy and configure env
cp .env.example .env
# Edit .env — set DATABASE_URL (or DB_HOST/USER/PASS/NAME) + secrets

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Start both services (web :22080, gateway :22081)
npm run dev:all
```

### Useful Commands

```bash
npm run dev:all          # Web + Gateway (recommended)
npm run dev              # Web only
npm run dev:gateway      # Gateway only

npm run db:migrate       # Create + apply a migration
npm run db:studio        # Prisma Studio database browser
npm run db:seed          # Seed with sample data

npm run test             # Unit tests (Vitest)
npm run test:e2e         # End-to-end tests (Playwright)
npm run lint             # ESLint across all workspaces
npm run build            # Production build

# Desktop app
npm run electron:dev              # Open Electron pointing at a running web instance
npm run electron:dev:full         # Run full local stack + Electron together
npm run build:electron            # Package Electron app
```

---

## 🗂️ Project Structure

```
termi/
├  apps/
│   ├  web/                    # Next.js 16 App Router
│   │   ├  src/
│   │   │   ├  app/            # Pages + API routes (App Router)
│   │   │   │   ├  api/        # 53 REST endpoints
│   │   │   │   └  panel/      # Dashboard UI
│   │   │   ├  components/     # React components
│   │   │   │   ├  terminal/   # SSH/RDP/VNC/local terminal
│   │   │   │   ├  scp/        # File manager
│   │   │   │   └  monitoring/ # Metrics & charts
│   │   │   └  lib/
│   │   │       ├  auth/       # Session, TOTP, passkey, OAuth
│   │   │       ├  crypto/     # AES-256-GCM, key derivation
│   │   │       ├  security/   # SSRF protection, rate limiting
│   │   │       └  services/   # SSH pool, SFTP, monitoring, alerts
│   │   └  prisma/             # Database schema & migrations
│   │
│   ├  gateway/                # WebSocket gateway (pure ESM)
│   │   └  src/
│   │       ├  handlers/       # SSH, SCP, Guacamole (RDP/VNC), Local PTY
│   │       └  auth/           # JWE token validation
│   │
│   ├  electron/               # Desktop app wrapper
│   │   ├  main.js             # Electron main process + node-pty IPC
│   │   ├  preload.js          # Secure context bridge
│   │   └  updater.js          # Auto-update via GitHub Releases
│   │
│   └  mobile/                 # Capacitor iOS/Android shell
│
├  .github/workflows/          # CI, release notes, desktop builds
├  traefik/                    # Reverse-proxy configuration
├  docker-compose.yml
├  docker-compose.local.yml    # Local development with Docker
├  electron-builder.yml        # Desktop build config (authoritative)
└  .env.example
```

> The desktop and mobile apps are thin shells around the hosted web app, so UI
> changes reach them without a new release. The desktop app checks GitHub
> Releases for shell updates on launch and every 6 hours.

---

## ⚙️ Configuration

### Required Variables

| Variable                  | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `DB_HOST`                 | PostgreSQL host                                     |
| `DB_USER`                 | PostgreSQL username                                 |
| `DB_PASSWORD`             | PostgreSQL password                                 |
| `DB_NAME`                 | Database name                                       |
| `SESSION_SECRET`          | iron-session cookie key (≥32 chars)                 |
| `ENCRYPTION_KEY`          | AES-256-GCM key for credentials at rest (≥32 chars) |
| `GATEWAY_JWT_SECRET`      | Shared secret for JWE connection tokens (≥32 chars) |
| `NEXT_PUBLIC_GATEWAY_URL` | Browser-visible WebSocket URL of the gateway        |
| `NEXT_PUBLIC_APP_URL`     | Public URL of the web app                           |

### Optional Variables

| Variable                 | Default               | Description                                           |
| ------------------------ | --------------------- | ----------------------------------------------------- |
| `GUACD_HOST`             | `localhost`           | guacd host for RDP/VNC                                |
| `GUACD_PORT`             | `4822`                | guacd port                                            |
| `ALLOW_PRIVATE_NETWORKS` | `false`               | Allow connections to private/internal IPs             |
| `TRUSTED_PROXY`          | `false`               | Trust `X-Forwarded-For` (enable behind Nginx/Traefik) |
| `ALLOWED_ORIGINS`        | `NEXT_PUBLIC_APP_URL` | CORS origins for the gateway                          |
| `ALLOW_LOCAL_TERMINAL`   | `false`               | Enable local PTY terminal on the gateway host         |
| `GATEWAY_DETACHED_TTL_MIN` | `30`                | Minutes a detached SSH session is kept alive for reconnect |
| `GATEWAY_MAX_CONNECTIONS_PER_USER` | `0`         | Concurrent sessions per user; `0` = unlimited         |
| `GOOGLE_CLIENT_ID`       | —                     | Google OAuth client ID                                |
| `GOOGLE_CLIENT_SECRET`   | —                     | Google OAuth client secret                            |
| `SMTP_HOST`              | —                     | SMTP host for email (verification, alerts, invites)   |
| `SMTP_USER`              | —                     | SMTP username                                         |
| `SMTP_PASS`              | —                     | SMTP password                                         |
| `VAPID_PUBLIC_KEY`       | —                     | Web push VAPID public key                             |
| `VAPID_PRIVATE_KEY`      | —                     | Web push VAPID private key                            |

> See [`.env.example`](.env.example) for the full list with descriptions.

---

## 📡 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser / PWA / Electron                 │
│      Login · Dashboard · Terminal · File Manager · Monitor  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP / REST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Next.js Web App  (:22080)                  │
│       API Routes │ Auth │ AES-256-GCM Crypto │ Prisma ORM   │
└──────────┬────────────────────────────────┬─────────────────┘
           │                                │
           │ SQL (pg)                       │ POST /api/connection/token
           ▼                                ▼
┌──────────────────┐      ┌─────────────────────────────────┐
│   PostgreSQL DB  │      │   WebSocket Gateway  (:22081)   │
└──────────────────┘      │       JWE token validation      │
                          └──────────┬──────────┬───────────┘
                                     │          │
                                 SSH / SCP   RDP / VNC
                                     │          │
                              ┌──────┴──┐  ┌────┴──────────┐
                              │ SSH Host│  │  guacd :4822  │
                              └─────────┘  └───────┬───────┘
                                                   │
                                          RDP / VNC Servers
```

**Connection flow:**

1. Browser calls `POST /api/connection/token` → server decrypts stored credentials and issues a short-lived **JWE token
   ** (A256GCM, 5-minute TTL).
2. Browser opens a WebSocket to the gateway with the JWE token as a query parameter.
3. Gateway validates the token and routes to the appropriate handler: `SSHHandler`, `SCPHandler`, `GuacamoleHandler`, or
   `LocalHandler`.
4. For RDP/VNC, `GuacamoleHandler` connects to guacd and forwards the Guacamole protocol frames to the browser.

---

## 🔒 Security

See [SECURITY.md](SECURITY.md) for the full security policy, vulnerability reporting process, and threat model.

**Highlights:**

- Credentials encrypted with AES-256-GCM before database storage
- SSRF protection on all user-supplied host inputs
- Rate limiting on authentication endpoints
- CSP and security headers on every response
- Session tokens revocable per-device

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Setting up the development environment
- Branching and commit conventions
- Submitting pull requests
- Reporting bugs and requesting features

---

## 🌍 Open Source & Community

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Help & support channels: [SUPPORT.md](SUPPORT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Release notes: [CHANGELOG.md](CHANGELOG.md)

---

## 📜 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [xterm.js](https://xtermjs.org/) — terminal emulator
- [Apache Guacamole](https://guacamole.apache.org/) — RDP/VNC gateway
- [ssh2](https://github.com/mscdex/ssh2) — SSH client for Node.js
- [node-pty](https://github.com/microsoft/node-pty) — local PTY for Electron
- [Next.js](https://nextjs.org/) — React framework
- [Prisma](https://www.prisma.io/) — database ORM
- [Tailwind CSS](https://tailwindcss.com/) — utility-first CSS
- [iron-session](https://github.com/vvo/iron-session) — session management

---

<div align="center">

**If Termi saves you time, consider supporting its development:**

# [Buy me a Coffee](https://www.buymeacoffee.com/shuvoo)

Made with ❤️ for the self-hosting community

</div>
