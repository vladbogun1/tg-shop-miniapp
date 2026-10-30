#!/usr/bin/env node
/**
 * Stand-in for the monobank acquiring API (the customer suite points MONOBANK_API_URL here).
 * No real payment can start: «create invoice» hands out a page on this server, the status of every
 * invoice stays "created" (an unpaid order), everything else answers 200 {}.
 */
import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.E2E_FAKE_MONO_PORT || 18190);

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname.startsWith("/pay/")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>fake monobank</title><h1 id="fake-mono">Тестова сторінка оплати</h1><p>${url.pathname.slice(5)}</p>`);
    return;
  }
  req.resume();
  req.on("end", () => {
    if (url.pathname === "/api/merchant/invoice/create") {
      const invoiceId = `e2e-${crypto.randomUUID()}`;
      return json(200, { invoiceId, pageUrl: `http://localhost:${port}/pay/${invoiceId}` });
    }
    if (url.pathname === "/api/merchant/invoice/status") {
      return json(200, { invoiceId: url.searchParams.get("invoiceId"), status: "created" });
    }
    if (url.pathname === "/api/merchant/pubkey") return json(200, { key: "" });
    return json(200, {});
  });
});
server.listen(port, "127.0.0.1", () => console.log(`fake monobank on :${port}`));
