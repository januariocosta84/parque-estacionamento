# API image (docs/DEPLOY.md). Build from the repository root:
#   docker build -f docker/api.Dockerfile --target runtime -t estacionamento-api .
#   docker build -f docker/api.Dockerfile --target migrate -t estacionamento-migrate .

FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @estacionamento/api build
# Production dependencies only; the shared package is already bundled into dist/.
RUN pnpm --filter @estacionamento/api deploy --prod --legacy --ignore-scripts /out

# One-off job: migrations, the restricted app role, reference data. Runs as the table owner.
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx scripts/apply-app-role.ts && pnpm exec prisma db seed"]

# The API itself. Connects as the restricted app role (prisma/app-role.sql).
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
