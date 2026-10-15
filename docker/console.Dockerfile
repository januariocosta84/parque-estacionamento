# Console image (docs/DEPLOY.md). Build from the repository root:
#   docker build -f docker/console.Dockerfile -t estacionamento-console .

FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @estacionamento/console build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# next.config.ts output: 'standalone' — server.js plus only the files it needs.
COPY --from=build /repo/apps/console/.next/standalone ./
COPY --from=build /repo/apps/console/.next/static ./apps/console/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/console/server.js"]
