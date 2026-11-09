FROM node:25-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl openssh-client python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy ALL workspace package.json files so npm can resolve the full workspace graph
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY apps/gateway/package.json ./apps/gateway/

RUN npm install && \
    LCSS_VER=$(node -p "require('./node_modules/lightningcss/package.json').version") && \
    OXIDE_VER=$(node -p "require('./node_modules/@tailwindcss/oxide/package.json').version") && \
    ARCH=$(node -p "process.arch === 'arm64' ? 'arm64' : 'x64'") && \
    npm install --no-save \
      "lightningcss-linux-${ARCH}-gnu@${LCSS_VER}" \
      "@tailwindcss/oxide-linux-${ARCH}-gnu@${OXIDE_VER}"

# Stage 2: Builder
FROM node:25-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=apps/web/prisma/schema.prisma

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

RUN npm run build --workspace=apps/web

# Stage 3: Runner
FROM node:25-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/prisma ./apps/web/prisma

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 22080

ENV PORT=22080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
