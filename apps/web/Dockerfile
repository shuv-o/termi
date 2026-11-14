FROM node:26.13.0-slim AS deps
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
FROM node:26.13.0-slim AS builder
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
FROM node:26.13.0-alpine AS runner
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

# The standalone output only traces @prisma/client, not the `prisma` CLI that
# `migrate deploy` needs. Bake it in, pinned to the bundled client's version,
# in its own directory (an install inside /app would act on the standalone
# package.json), linked where prisma.config.ts's `import 'prisma/config'`
# resolves.
RUN PRISMA_VERSION=$(node -p "require('@prisma/client/package.json').version") && \
    mkdir -p /opt/prisma-cli && cd /opt/prisma-cli && echo '{"private":true}' > package.json && \
    npm install --no-audit --no-fund "prisma@$PRISMA_VERSION" && \
    ln -s /opt/prisma-cli/node_modules/prisma /app/node_modules/prisma && \
    ln -s /opt/prisma-cli/node_modules/.bin/prisma /usr/local/bin/prisma

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 22080

ENV PORT=22080
ENV HOSTNAME="0.0.0.0"

# --chmod because USER nextjs is already active: COPY writes as root, and a
# later `RUN chmod` as nextjs is not permitted.
COPY --chmod=755 <<'EOF' /usr/local/bin/docker-entrypoint.sh
#!/bin/sh
set -e
# Idempotent and fast, so it runs on every start: no "already migrated" flag
# file, which lets the container run read-only and makes an upgraded image
# always apply its new migrations.
echo "Applying database migrations..."
prisma migrate deploy
exec node server.js
EOF

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
