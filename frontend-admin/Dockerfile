# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js 15 admin panel.
#
# NOTE: the build context is the REPOSITORY ROOT, not ./frontend-admin — the app is an npm
# workspace that depends on ../shared, so the root manifest, the lockfile and the shared package
# all have to be inside the context. Build it with:
#   docker build -f frontend-admin/Dockerfile .

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
COPY frontend-admin/package.json ./frontend-admin/
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
# Copy the whole installed tree rather than just /app/node_modules: npm hoists workspace
# dependencies to the root, but anything it cannot hoist (a version conflict) ends up in
# <workspace>/node_modules, and a COPY of a path that may not exist fails the build.
COPY --from=deps /app ./
COPY shared ./shared
COPY frontend-admin ./frontend-admin
# Public env vars are inlined at build time; the single-origin public build overrides them
# with "" + "/img".
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_IMAGE_BASE_URL=http://localhost:8082/img
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_IMAGE_BASE_URL=${NEXT_PUBLIC_IMAGE_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w frontend-admin

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# outputFileTracingRoot is the monorepo root, so standalone mirrors the workspace layout.
COPY --from=build /app/frontend-admin/public ./frontend-admin/public
COPY --from=build --chown=nextjs:nodejs /app/frontend-admin/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/frontend-admin/.next/static ./frontend-admin/.next/static

USER nextjs
EXPOSE 3001
CMD ["node", "frontend-admin/server.js"]
