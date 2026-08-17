# Termi Gateway compose.Dockerfile

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# node-pty requires native build tools
RUN apk add --no-cache python3 make g++ linux-headers

# Copy package files
COPY package.json ./

# Install dependencies (includes node-pty native compilation)
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 gateway
RUN adduser --system --uid 1001 gateway

# Copy built files and compiled native modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Set permissions
RUN chown -R gateway:gateway /app

USER gateway

EXPOSE 22081

CMD ["node", "dist/index.js"]
