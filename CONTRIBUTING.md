# Contributing to Termi

Thank you for your interest in contributing! Termi is a community-driven project and all kinds of contributions are welcome — bug reports, feature requests, documentation improvements, and code changes.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Commit Conventions](#commit-conventions)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Security Issues](#security-issues)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold these standards. Please report unacceptable behaviour to the maintainers.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/termi.git
   cd termi
   ```
3. **Add the upstream remote** so you can pull in future updates:
   ```bash
   git remote add upstream https://github.com/shuvoooo/termi.git
   ```

---

## Development Setup

### Prerequisites

- **Node.js** 22+ (`node --version`)
- **npm** 10+ (comes with Node.js)
- **PostgreSQL** 15+ — or start one with `docker compose -f docker-compose.local.yml up -d postgres`
- **Docker** — optional, but recommended for RDP/VNC testing with guacd

### Steps

```bash
# 1. Install all workspace dependencies
npm install

# 2. Copy environment config
cp .env.example .env

# 3. Edit .env — at minimum set:
#    DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
#    SESSION_SECRET, ENCRYPTION_KEY, GATEWAY_JWT_SECRET
#    NEXT_PUBLIC_GATEWAY_URL=ws://localhost:22080/gateway
#    NEXT_PUBLIC_APP_URL=http://localhost:22080

# 4. Push the database schema (dev only — no migration)
npm run db:push

# 5. Start both services
npm run dev:all
# → Web:     http://localhost:22080
# → Gateway: ws://localhost:22081
```

### Useful Dev Commands

```bash
npm run db:studio        # Prisma Studio — browse the database
npm run db:generate      # Re-generate Prisma client after schema changes
npm run db:migrate       # Create and apply a new migration
npm run lint             # ESLint across all workspaces
npm test                 # Unit tests (Vitest)
npm run test:e2e         # End-to-end tests (Playwright)
```

### RDP / VNC Testing

```bash
# Start guacd (on Apple Silicon, add --platform linux/arm64)
docker run -d -p 4822:4822 --name termi-guacd guacamole/guacd:1.5.5
```

Then add an RDP or VNC server in the dashboard.

---

## Project Structure

```
termi/
├── apps/web/src/
│   ├── app/api/         # REST API routes (Next.js App Router)
│   ├── app/panel/       # Dashboard UI pages
│   ├── components/      # React components
│   └── lib/             # Auth, crypto, security, services
│       ├── crypto/      # AES-256-GCM, key derivation
│       ├── auth/        # Session, TOTP, passkey, OAuth
│       └── security/    # SSRF validation, rate limiting
├── apps/gateway/src/
│   ├── handlers/        # SSH, SCP, Guacamole, Local PTY
│   └── auth/            # JWE token validation
└── apps/electron/       # Electron main process & preload
```

Key conventions:

- **API routes** use helpers from `@/lib/api` (`validateBody`, `successResponse`, `errorResponse`)
- **Credentials** are always encrypted via `encryptCredentials` / `decryptCredentials` — never stored in plaintext
- **User-supplied hosts** must be validated with `validateHost()` from `@/lib/security/ssrf`
- **Gateway imports** must use `.js` extensions (pure ESM)
- **Prisma client** is at `@/app/generated/prisma/client` — always import from there

---

## Making Changes

1. **Create a branch** from `main` using a descriptive name:

   | Prefix | Use for |
   |--------|---------|
   | `feature/` | New features |
   | `fix/` | Bug fixes |
   | `docs/` | Documentation only |
   | `refactor/` | Code refactoring |
   | `chore/` | Dependencies, build, CI |
   | `security/` | Security fixes |

   ```bash
   git checkout -b feature/my-awesome-feature
   ```

2. **Make your changes**, keeping commits focused and atomic.

3. **Run the checks** before pushing:
   ```bash
   npm run lint            # Must pass
   npm test                # Must pass
   npx tsc --noEmit        # Run in apps/web and apps/gateway
   ```

4. **Push** your branch and open a Pull Request.

---

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(optional scope): <short summary>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `security`, `perf`

**Examples:**
```
feat(ssh): add keep-alive interval configuration
fix(guacamole): handle empty password correctly
docs: update RDP setup instructions
chore: upgrade Next.js to 15.3.0
security: validate host before SSRF in /api/servers/test
```

---

## Submitting a Pull Request

1. Ensure your branch is up to date with `upstream/main`:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```
2. Open a PR against the `main` branch of `shuvoooo/termi`.
3. Fill out the **PR template** — describe what changed and why.
4. Link the related issue if one exists (`Closes #123`).
5. Wait for CI to pass and address any review feedback.

Pull requests are reviewed by maintainers. We aim to provide feedback within a few days.

---

## Reporting Bugs

Use the [Bug Report issue template](https://github.com/shuvoooo/termi/issues/new?template=bug_report.yml). Please include:

- Termi version and deployment type
- Steps to reproduce
- Expected vs. actual behaviour
- Relevant logs (redact all secrets!)

---

## Requesting Features

Use the [Feature Request issue template](https://github.com/shuvoooo/termi/issues/new?template=feature_request.yml). Describe the problem you're solving and your proposed solution.

For large changes or architectural decisions, open a [Discussion](https://github.com/shuvoooo/termi/discussions) first to get early feedback before writing code.

---

## Security Issues

**Do not open a public issue for security vulnerabilities.**

Please report them privately via [GitHub Security Advisories](https://github.com/shuvoooo/termi/security/advisories/new) or follow the process in [SECURITY.md](SECURITY.md).
