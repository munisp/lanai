# ==============================================================================
# Lanai Portal — Production image
# A Debian/glibc base is mandatory for the Temporal and Fluvio native Node clients.
# ==============================================================================
FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@10.4.1

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_APP_ID=lanai-portal
RUN VITE_APP_ID=$VITE_APP_ID pnpm build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --create-home lanai

WORKDIR /app
COPY --from=build --chown=lanai:nodejs /app/dist ./dist
COPY --from=build --chown=lanai:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=lanai:nodejs /app/package.json ./
COPY --from=build --chown=lanai:nodejs /app/drizzle ./drizzle

ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl --fail http://localhost:3001/api/health || exit 1

USER lanai
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
