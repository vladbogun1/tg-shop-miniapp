# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js 15 customer Mini App.
#
# NOTE: the build context is the REPOSITORY ROOT, not ./frontend — the app is an npm workspace
# that depends on ../shared, so the root manifest, the lockfile and the shared package all have
# to be inside the context. Build it with:
#   docker build -f frontend/Dockerfile .
# (docker-compose and the publish workflow already do this.)

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
COPY frontend-admin/package.json ./frontend-admin/
# Installs the whole workspace: npm needs every member's manifest to resolve the lockfile.
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY package.json package-lock.json ./
COPY shared ./shared
COPY frontend ./frontend
# Public env vars are inlined into the bundle at build time. Defaults target the standalone
# localhost dev stack; the single-origin public build overrides these with "" (relative
# same-origin) + "/img" so one Caddy/tunnel origin serves everything.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_IMAGE_BASE_URL=http://localhost:8082/img
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_IMAGE_BASE_URL=${NEXT_PUBLIC_IMAGE_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w frontend

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# With outputFileTracingRoot at the monorepo root, standalone mirrors the workspace layout:
# server.js lives under frontend/ and node_modules sits next to it.
COPY --from=build /app/frontend/public ./frontend/public
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "frontend/server.js"]
