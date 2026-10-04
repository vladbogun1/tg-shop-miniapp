# syntax=docker/dockerfile:1
# Multi-stage build for the public website (Next.js 15, standalone).
#
# The build context is the REPOSITORY ROOT (npm workspaces + ../shared):
#   docker build -f site/Dockerfile .
#
# Nothing backend-specific is baked in: the site talks to the browser same-origin (/api, /ws, /img
# behind infra/gateway-site.conf) and to the backend over INTERNAL_API_BASE at runtime. Pages are
# rendered on first request and cached (ISR), so the build needs no backend.

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
COPY frontend-admin/package.json ./frontend-admin/
COPY site/package.json ./site/
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app ./
COPY shared ./shared
COPY site ./site
# Canonical origin for metadata/sitemap/OG links (inlined at build time).
ARG NEXT_PUBLIC_SITE_URL=https://chisetup.com.ua
ARG NEXT_PUBLIC_BOT_URL=https://t.me/ChiSetupShop_bot
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_BOT_URL=${NEXT_PUBLIC_BOT_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w site

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Runtime config (override in compose):
#   INTERNAL_API_BASE        http://backend:8080
#   SITE_INDEXABLE           false until public launch (robots noindex)
#   SITE_REVALIDATE_SECRET   shared with the backend for POST /_site/revalidate
ENV INTERNAL_API_BASE=http://backend:8080
ENV SITE_INDEXABLE=false
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build /app/site/public ./site/public
COPY --from=build --chown=nextjs:nodejs /app/site/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/site/.next/static ./site/.next/static
# Legal markdown is read at render time (also traced, copied explicitly to be safe).
COPY --from=build /app/site/content ./site/content

USER nextjs
EXPOSE 3000
CMD ["node", "site/server.js"]
