#!/usr/bin/env node
/**
 * The website's single origin for the e2e run, as infra/gateway-site.conf does in prod: `/api` and
 * `/ws` go to the backend, `/img` is answered 404 (no imgproxy in the stack), everything else to the
 * Next app. A production `next start` has no dev rewrites, so without this the site's same-origin API
 * calls and its HttpOnly cookies could not work.
 */
import http from "node:http";
import net from "node:net";

const port = Number(process.env.E2E_SITE_PORT || 3107);
const appPort = Number(process.env.E2E_SITE_APP_PORT || 3108);
const apiPort = Number(process.env.E2E_BACKEND_PORT || 18089);

const toBackend = (url) => url.startsWith("/api/") || url === "/ws" || url.startsWith("/ws/") || url.startsWith("/ws?");

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";
  if (url.startsWith("/img/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const target = toBackend(url) ? apiPort : appPort;
  const up = http.request(
    { host: "127.0.0.1", port: target, method: req.method, path: url, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  up.on("error", () => {
    res.writeHead(502);
    res.end("bad gateway");
  });
  req.pipe(up);
});

// WebSocket (chat): pipe the upgrade request through untouched.
server.on("upgrade", (req, socket, head) => {
  const target = toBackend(req.url ?? "/") ? apiPort : appPort;
  const up = net.connect(target, "127.0.0.1", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(lines.join("\r\n") + "\r\n\r\n");
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});
server.listen(port, "127.0.0.1", () => console.log(`site gateway on :${port} (app :${appPort}, api :${apiPort})`));
