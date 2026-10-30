# Halloween 2026 event service — build context: events/halloween
FROM node:22-alpine
ENV NODE_ENV=production HW_DATA_DIR=/data HW_MEDIA_DIR=/app/broadcast
WORKDIR /app
COPY server/package.json server/package-lock.json* server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund || (cd server && npm install --omit=dev --no-audit --no-fund)
COPY server/src server/src
COPY public public
COPY draw draw
COPY broadcast broadcast
RUN rm -f draw/mock.js.map && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8090/hw/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/server.js"]
