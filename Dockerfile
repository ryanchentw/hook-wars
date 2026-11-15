# syntax=docker/dockerfile:1

# Builds the whole workspace: the client to static files, the server to one bundled file.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
# Manifests first, so the install layer is reused until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sim/package.json packages/sim/
COPY packages/room/package.json packages/room/
COPY packages/protocol/package.json packages/protocol/
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm build

# Runs it. The server bundle carries its dependencies, so this stage installs nothing.
FROM node:24-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    HOOKWARS_STATIC_DIR=/app/public
WORKDIR /app
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/client/dist ./public
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server.js"]
