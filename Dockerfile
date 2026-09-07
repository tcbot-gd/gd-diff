# --- build ----------------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
RUN bun install --frozen-lockfile --production

# --- shared runtime -------------------------------------------------------
FROM oven/bun:1-slim AS base
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
# adapter-node caps request bodies at 512K by default; binary uploads are far larger.
ENV BODY_SIZE_LIMIT=Infinity
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/src ./src
COPY --from=build /app/worker ./worker

# --- app (web server) -----------------------------------------------------
FROM base AS app
VOLUME /data
EXPOSE 3000
CMD ["bun", "./build/index.js"]

# --- worker (decompilation loop) ------------------------------------------
# Needs python + git so it can self-install BromaIDA (pip deps) and clone the
# geode-sdk bindings at startup.
FROM base AS worker
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-dev python3-pip git rsync ca-certificates \
    && rm -rf /var/lib/apt/lists/*
CMD ["bun", "worker/index.ts"]

