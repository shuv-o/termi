FROM node:24.22.1-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl openssh-client python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy ALL workspace package.json files so npm can resolve the full workspace graph
COPY package.json ./

RUN npm install && \
    LCSS_VER=$(node -p "require('./node_modules/lightningcss/package.json').version") && \
    OXIDE_VER=$(node -p "require('./node_modules/@tailwindcss/oxide/package.json').version") && \
    ARCH=$(node -p "process.arch === 'arm64' ? 'arm64' : 'x64'") && \
    npm install --no-save \
      "lightningcss-linux-${ARCH}-gnu@${LCSS_VER}" \
      "@tailwindcss/oxide-linux-${ARCH}-gnu@${OXIDE_VER}"

# Stage 2: Builder
FROM node:24.22.1-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=prisma/schema.prisma

# Only NEXT_PUBLIC_* values are needed to build: Next.js writes them into
# the browser bundle. Secrets and every other setting (database, session and
# encryption keys, Google, SMTP, VAPID, proxy) are read when the container
# starts (docker run -e / compose environment), so they never go into build
# arguments, the build cache or the image history.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GATEWAY_URL

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 3: Runner
FROM node:24.22.1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv

# Bake the Prisma CLI into the image at build time. The standalone output
# above only traces @prisma/client (what app code actually imports), not the
# `prisma` CLI binary that `migrate deploy` needs — this used to be installed
# from the registry inside the entrypoint on every fresh container's first
# start, adding ~3 minutes to startup. Pinned to the exact @prisma/client
# version already baked in above to avoid drift.
RUN PRISMA_VERSION=$(node -p "require('@prisma/client/package.json').version") && \
    npm install --no-save --no-audit --no-fund "prisma@$PRISMA_VERSION"

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 22080

ENV PORT=22080
ENV HOSTNAME="0.0.0.0"

# entrypoint script
# --chmod is required here (rather than a separate RUN chmod) because USER nextjs
# is already active above: COPY always writes as root regardless of USER, so a
# later `RUN chmod` as the unprivileged nextjs user fails with "Operation not
# permitted" on the root-owned file.
COPY --chmod=755 <<'EOF' /usr/local/bin/docker-entrypoint.sh
#!/bin/sh
set -e

FLAG_FILE="/app/.migrations_done"

if [ ! -f "$FLAG_FILE" ]; then
    echo "First run detected - Running migrations..."
    npx prisma migrate deploy
    echo "Migrations completed!"
    touch "$FLAG_FILE"
else
    echo "Migrations already run, skipping..."
fi
node server.js
EOF

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
