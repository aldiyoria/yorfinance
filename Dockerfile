# ===== Stage 1: Build =====
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Generate Prisma Client
COPY prisma ./prisma
RUN npx prisma generate

# ===== Stage 2: Production =====
FROM node:20-alpine

RUN apk add --no-cache bash curl postgresql16-client openssl libstdc++

WORKDIR /app

# Copy dependencies + prisma generated from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Copy application source
COPY package.json ./
COPY src ./src
COPY web ./web
COPY public ./public
COPY scripts ./scripts

# Copy entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p /app/credentials && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
