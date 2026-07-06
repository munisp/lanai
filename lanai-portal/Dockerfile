# ==============================================================================
# Lanai Portal — Dockerfile
# ==============================================================================
# Multi-stage build:
#   Stage 1 (build): Install deps, build frontend + bundle server
#   Stage 2 (runtime): Node 22 Alpine with only production artifacts
# ==============================================================================

# ── Stage 1: Build ──────────────────────────────────────────────────────────

FROM node:22-alpine AS build

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files for dependency caching
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend + bundle server in one step
RUN pnpm build

# ── Stage 2: Runtime ────────────────────────────────────────────────────────

FROM node:22-alpine AS runtime

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S lanai -u 1001

WORKDIR /app

# Copy built artifacts from build stage
COPY --from=build --chown=lanai:nodejs /app/dist ./dist
COPY --from=build --chown=lanai:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=lanai:nodejs /app/package.json ./

# Expose port (default 3001, matches lanai.newfire.app tunnel target)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

# Switch to non-root user
USER lanai

# Start the production server
CMD ["node", "dist/index.js"]
