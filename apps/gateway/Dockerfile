# Termi Gateway — published image.
#
# Built from the REPOSITORY ROOT (docker build -f apps/gateway/Dockerfile .) so
# the root package-lock.json pins every dependency, transitive ones included:
# `npm ci` installs exactly what the lockfile says or fails.

# Stage 1: Build
FROM node:25-bookworm-slim AS builder
WORKDIR /app

# node-pty requires native build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
 && rm -rf /var/lib/apt/lists/*

# The lockfile covers every workspace, so npm ci needs all their manifests.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/mobile/package.json ./apps/mobile/

# Install the gateway's dependencies (includes node-pty native compilation)
RUN npm ci --workspace=apps/gateway --no-audit --no-fund

# Copy source code and build TypeScript
COPY apps/gateway ./apps/gateway
RUN npm run build --workspace=apps/gateway

# Stage 2: Production
FROM node:25-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 gateway
RUN adduser --system --uid 1001 gateway

# Built gateway plus its dependencies (hoisted to /app/node_modules, with any
# workspace-local ones under apps/gateway/node_modules).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/gateway ./apps/gateway

# Set permissions
RUN chown -R gateway:gateway /app

USER gateway

WORKDIR /app/apps/gateway

EXPOSE 22081

CMD ["node", "dist/index.js"]
