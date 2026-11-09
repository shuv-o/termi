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
- [Release Process (Maintainers)](#release-process-maintainers)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Getting Help](#getting-help)
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
    git remote add upstream https://github.com/shuv-o/termi.git
    ```

---

## Development Setup

### Prerequisites

- **Node.js** 22+ (`node --version`)
- **npm** 10+ (comes with Node.js)
- **PostgreSQL** 15+ — or start one with `docker compose up -d postgres`
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
npm run check            # lint + type-check + unit tests: run this before a PR
npm run lint             # ESLint across all workspaces
npm run typecheck        # tsc --noEmit for web and gateway
npm test                 # Unit tests (Vitest, single run)
npm run test:watch --workspace=apps/web   # Unit tests in watch mode
npm run test:security    # Security end-to-end suite (needs Docker)
npm run format:check     # Prettier, without writing
npm run db:studio        # Prisma Studio — browse the database
npm run db:generate      # Re-generate Prisma client after schema changes
npm run db:migrate       # Create and apply a new migration
```

### RDP / VNC Testing

```bash
# Start guacd (on Apple Silicon, add --platform linux/arm64)
docker run -d -p 4822:4822 --name termi-guacd guacamole/guacd: 1.6.0
```

Then add an RDP or VNC server in the dashboard.

---

## Project Structure

```
termi/
├── apps/web/src/
│   ├── app/                    # Next.js App Router: routes only
│   │   ├── api/<resource>/     # REST endpoints (route.ts), thin: validate, call a service, respond
│   │   └── panel/<page>/       # Signed-in pages
│   │       ├── page.tsx
│   │       └── _components/    # Pieces used by this page only (underscore = not a route)
│   │   (panel/_shell = the menu and chrome, panel/_sessions = terminals and splits,
│   │    panel/_dashboard = the Servers page)
│   ├── components/
│   │   ├── ui/                 # Design-system primitives (button, dialog, list-motion…)
│   │   ├── common/             # Small shared widgets (CopyButton, Logo)
│   │   ├── landing/            # The public landing page; features.ts lists every feature
│   │   └── <feature>/          # UI used by more than one page: terminal, tunnels,
│   │                           # snippets, servers, appearance, scp, monitoring…
│   └── lib/                    # No React pages; mostly framework-free
│       ├── services/           # Business logic and Prisma access (*.service.ts)
│       ├── api/                # Route helpers (validateBody, responses, teamRoute)
│       ├── auth/ crypto/ security/   # Sessions, encryption, SSRF, rate limits
│       ├── <domain>/           # Domain helpers and types: servers, snippets, tunnel,
│       │                       # appearance, terminal, transfer, ssh, serial…
│       ├── hooks/              # Shared React hooks (useCachedFetch, useActiveRect)
│       ├── style/              # Shared style maps (protocol icons and colours, status tones)
│       └── navigation.ts       # The menu: every page, its name and icon
├── apps/gateway/src/
│   ├── handlers/               # SSH, SCP, Guacamole, Telnet, local PTY, tunnels
│   ├── sessions/               # Persistent sessions, guests, recording, limits, access checks
│   └── auth/                   # JWE token validation, host keys
├── apps/electron/              # Desktop app: main process, preload, tunnels, auto-update
└── apps/mobile/                # Capacitor shell around the hosted web app
```

Where new code goes:

- **Used by one page?** Next to it, in that route's `_components/`.
- **Used by two or more pages?** `components/<feature>/` for UI, `lib/<domain>/` for logic and types. A page never imports from another page's folder, and `components/` and `lib/` never import from `app/`.
- **Types** live with the code that owns the data (`lib/servers/types.ts`, `lib/snippets/types.ts`), not in a component.
- **Imports:** relative (`./x`) inside one folder, `@/…` across folders.
- **A new user-facing feature** also gets an entry in `components/landing/features.ts`, so the landing page lists it.
- **Tests** sit next to the file they test (`split.ts` → `split.test.ts`); end-to-end tests are in `apps/web/e2e/`.
- **Heavy UI** (xterm, Guacamole, rarely shown dialogs) is loaded with `next/dynamic`, so it isn't in every page's bundle.

Key conventions:

- **API routes** use helpers from `@/lib/api` (`validateBody`, `successResponse`, `errorResponse`)
- **Credentials** are always encrypted via `encryptCredentials` / `decryptCredentials` — never stored in plaintext
- **User-supplied hosts** must be validated with `validateHost()` from `@/lib/security/ssrf`
- **Gateway imports** must use `.js` extensions (pure ESM)
- **Prisma client** is at `@/app/generated/prisma/client` — always import from there

---

## Making Changes

1. **Create a branch** from `main` using a descriptive name:

    | Prefix      | Use for                 |
    | ----------- | ----------------------- |
    | `feature/`  | New features            |
    | `fix/`      | Bug fixes               |
    | `docs/`     | Documentation only      |
    | `refactor/` | Code refactoring        |
    | `chore/`    | Dependencies, build, CI |
    | `security/` | Security fixes          |

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
2. Open a PR against the `main` branch of `shuv-o/termi`.
3. Fill out the **PR template** — describe what changed and why.
4. Link the related issue if one exists (`Closes #123`).
5. Wait for CI to pass and address any review feedback.

Pull requests are reviewed by maintainers. We aim to provide feedback within a few days.

---

## Release Process (Maintainers)

Termi uses SemVer tags and GitHub Releases.

1. Ensure `CHANGELOG.md` has a section for the version (for example, `## [1.0.5]`).
2. Ensure the repo is in a releasable state (CI passing on `main`).
3. Bump the version in the root `package.json`. **It must match the tag exactly**, or electron-updater ignores the release and desktop apps never see it.
    ```bash
    npm version 1.0.5 --no-git-tag-version
    git commit -am "release: v1.0.5"
    ```
4. Create and push the tag. Push it by name — `--tags` pushes every local tag, which can resurrect ones deleted from the remote:
    ```bash
    git tag v1.0.5
    git push origin main v1.0.5
    ```
5. Two workflows fire on the tag:
    - `release.yml` publishes the release, using the matching changelog section as release notes.
    - `electron-build.yml` builds the desktop app on macOS, Windows and Linux, and uploads the installers plus the `latest*.yml` auto-update metadata.
6. Check the release has the six installers — macOS x64 and arm64 (`.dmg`), Linux x64 and arm64 (`.AppImage`), and one Windows installer (`.exe`) covering x64 and arm64 — plus `latest.yml`, `latest-linux.yml` and `latest-linux-arm64.yml`. To see what a release would get without publishing, run **Build Desktop Apps** by hand (Actions → Run workflow).

### Release notes

- Do not delete the `latest*.yml` assets. Windows and Linux read them to detect and download updates — removing them silently disables auto-update.
- GitHub always attaches "Source code (zip/tar.gz)". These are generated from the tag and cannot be removed.
- macOS builds are ad-hoc signed but not notarized, so they cannot self-update: the app checks GitHub's API for a newer release and opens the download page. An Apple Developer ID would allow notarization and real macOS auto-update.

### Usage statistics

`.github/workflows/usage-stats.yml` runs daily and records public download counts (Docker Hub pulls, installer downloads, desktop update checks, stars, GitHub traffic) on the `stats` branch: see its `README.md` there. Termi itself sends nothing. GitHub views and clones need a `STATS_TOKEN` secret: a fine-grained token with "Administration: read-only" on this repository. Run it by hand from Actions → Usage Stats → Run workflow.

---

## Reporting Bugs

Use the [Bug Report issue template](https://github.com/shuv-o/termi/issues/new?template=bug_report.yml). Please include:

- Termi version and deployment type
- Steps to reproduce
- Expected vs. actual behaviour
- Relevant logs (redact all secrets!)

---

## Requesting Features

Use the [Feature Request issue template](https://github.com/shuv-o/termi/issues/new?template=feature_request.yml). Describe the problem you're solving and your proposed solution.

For large changes or architectural decisions, open a [Discussion](https://github.com/shuv-o/termi/discussions) first to get early feedback before writing code.

---

## Getting Help

For setup questions, usage help, or troubleshooting guidance, use [SUPPORT.md](SUPPORT.md), then open a [GitHub Discussion](https://github.com/shuv-o/termi/discussions).

---

## Security Issues

**Do not open a public issue for security vulnerabilities.**

Please report them privately via [GitHub Security Advisories](https://github.com/shuv-o/termi/security/advisories/new) or follow the process in [SECURITY.md](SECURITY.md).
