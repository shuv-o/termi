FROM node:20-slim AS deps
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
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=prisma/schema.prisma

ARG DB_HOST
ARG DB_PORT
ARG DB_USER
ARG DB_NAME
ARG DB_PASSWORD
ARG SESSION_SECRET
ARG ENCRYPTION_KEY
ARG GATEWAY_JWT_SECRET
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GATEWAY_URL
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG GOOGLE_REDIRECT_URI
ARG SMTP_HOST
ARG SMTP_PORT
ARG SMTP_SECURE
ARG SMTP_USER
ARG SMTP_PASS
ARG SMTP_FROM
ARG VAPID_PUBLIC_KEY
ARG VAPID_PRIVATE_KEY
ARG VAPID_SUBJECT
ARG ALLOW_PRIVATE_NETWORKS
ARG TRUSTED_PROXY

ENV DB_HOST=${DB_HOST}
ENV DB_PORT=${DB_PORT}
ENV DB_USER=${DB_USER}
ENV DB_NAME=${DB_NAME}
ENV DB_PASSWORD=${DB_PASSWORD}
ENV SESSION_SECRET=${SESSION_SECRET}
ENV ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENV GATEWAY_JWT_SECRET=${GATEWAY_JWT_SECRET}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
ENV GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
ENV GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
ENV GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI}
ENV SMTP_HOST=${SMTP_HOST}
ENV SMTP_PORT=${SMTP_PORT}
ENV SMTP_SECURE=${SMTP_SECURE}
ENV SMTP_USER=${SMTP_USER}
ENV SMTP_PASS=${SMTP_PASS}
ENV SMTP_FROM=${SMTP_FROM}
ENV VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
ENV VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
ENV VAPID_SUBJECT=${VAPID_SUBJECT}
ENV ALLOW_PRIVATE_NETWORKS=${ALLOW_PRIVATE_NETWORKS}
ENV TRUSTED_PROXY=${TRUSTED_PROXY}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
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

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 22080

ENV PORT=22080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
