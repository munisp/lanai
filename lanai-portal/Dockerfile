# ==============================================================================
# Lanai Portal — Production image
# The Docker build context is the workspace root. This is required so the image
# consumes the canonical root pnpm-lock.yaml under frozen-install policy.
# A Debian/glibc base is mandatory for Temporal and Fluvio native Node clients.
# ==============================================================================
FROM node:22-bookworm-slim AS build

ARG PNPM_VERSION=11.20.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global "pnpm@${PNPM_VERSION}"

WORKDIR /app

# Install from the canonical workspace manifest and lockfile before copying
# application source, so dependency layers remain reproducible and cacheable.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lanai-portal/package.json ./lanai-portal/package.json
RUN pnpm install --frozen-lockfile --child-concurrency=1 --network-concurrency=4

COPY lanai-portal ./lanai-portal
WORKDIR /app/lanai-portal

# Limit the heap so image builds fit constrained (including emulated) builders.
ENV NODE_OPTIONS=--max-old-space-size=1536
ARG VITE_APP_ID=lanai-portal
RUN VITE_APP_ID=$VITE_APP_ID pnpm build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --create-home lanai

WORKDIR /app
COPY --from=build --chown=lanai:nodejs /app/lanai-portal/dist ./dist
COPY --from=build --chown=lanai:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=lanai:nodejs /app/lanai-portal/package.json ./
COPY --from=build --chown=lanai:nodejs /app/lanai-portal/drizzle ./drizzle

ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl --fail http://localhost:3001/api/health || exit 1

USER lanai
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
