#!/usr/bin/env node
/**
 * Stand-in for the monobank acquiring API (the customer and money suites point MONOBANK_API_URL here).
 * No real payment can start.
 *
 * What the backend sees (the real API's shape, only what the shop uses):
 *   POST /api/merchant/invoice/create   — hands out a page on this server; the invoice starts as "created"
 *   GET  /api/merchant/invoice/status   — the state of the invoice (an unknown one is "created", as before)
 *   POST /api/merchant/invoice/cancel   — refund; idempotent by extRef like the bank, settles at once
 *   GET  /api/merchant/pubkey           — base64 of the PEM public key that signs the webhooks
 *   everything else answers 200 {}.
 *
 * What a test drives (control API, /__e2e/*, JSON):
 *   POST /__e2e/webhook {invoiceId, status?="success", sign?=true, amount?} — moves the invoice to that state and
 *        posts the signed webhook to the backend (E2E_BACKEND_URL); answers {sent: <backend http status>}
 *   POST /__e2e/fail {mode: "500"|"timeout"|"off", path?, invoiceId?, hangMs?} — the bank misbehaves for the
 *        requests that match (path = tail of the request path, invoiceId = invoice of the request); "off" clears
 *   GET  /__e2e/requests?path=... — every request the backend made (path tail filter), in order, failed ones too
 *   GET  /__e2e/invoice/:id — the fake's state of one invoice
 *   POST /__e2e/reset — forgets the recorded requests and the failure rules
 *
 * The webhook is signed like the real one: base64 of an ECDSA / SHA-256 signature over the raw body. The key pair is a
 * throwaway one kept in e2e/.auth (gitignored), so a reused backend that cached the key keeps working after a restart.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.E2E_FAKE_MONO_PORT || 18190);
const backendUrl = process.env.E2E_BACKEND_URL || `http://localhost:${process.env.E2E_BACKEND_PORT || 18089}`;

const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".auth");
const keyFile = path.join(authDir, "fake-mono-key.pem");

function loadKey() {
  if (fs.existsSync(keyFile)) return crypto.createPrivateKey(fs.readFileSync(keyFile));
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }));
  return privateKey;
}
const privateKey = loadKey();
const pubkeyB64 = Buffer.from(
  crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" }),
).toString("base64");

/** invoiceId → state, as GET /invoice/status returns it. */
const invoices = new Map();
/** extRef → the answer of the cancel that was made with it. */
const cancels = new Map();
const requests = [];
let failRules = [];

let lastModified = 0;
/** Strictly increasing, so the backend never takes a later state for a stale one. */
function nextModified() {
  lastModified = Math.max(Date.now(), lastModified + 1);
  return new Date(lastModified).toISOString();
}

function statusBody(inv) {
  return {
    invoiceId: inv.invoiceId,
    status: inv.status,
    amount: inv.amount,
    ccy: 980,
    finalAmount: inv.finalAmount,
    createdDate: inv.createdDate,
    modifiedDate: inv.modifiedDate,
    reference: inv.reference,
    paymentInfo: inv.paid
      ? { maskedPan: "444403******1111", approvalCode: "123456", rrn: inv.rrn, paymentSystem: "visa", paymentMethod: "pan", fee: 0 }
      : undefined,
    cancelList: inv.cancelList,
  };
}

function sign(body) {
  return crypto.sign("sha256", Buffer.from(body), privateKey).toString("base64");
}

async function sendWebhook(inv, { signed = true } = {}) {
  const body = JSON.stringify(statusBody(inv));
  const res = await fetch(`${backendUrl}/api/payments/mono/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sign": signed ? sign(body) : "bm90LWEtc2lnbmF0dXJl" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  return res.status;
}

function failRuleFor(pathname, invoiceId) {
  return failRules.find(
    (r) => (!r.path || pathname.endsWith(r.path)) && (!r.invoiceId || r.invoiceId === invoiceId),
  );
}

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
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    let body = {};
    try {
      const text = Buffer.concat(chunks).toString("utf8");
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    try {
      if (url.pathname.startsWith("/__e2e/")) return await control(url, body, json);
      return await merchantApi(url, body, json);
    } catch (e) {
      return json(500, { errText: String(e) });
    }
  });
});

async function control(url, body, json) {
  const op = url.pathname.slice("/__e2e/".length);
  if (op === "reset") {
    requests.length = 0;
    failRules = [];
    return json(200, {});
  }
  if (op === "requests") {
    const tail = url.searchParams.get("path");
    return json(200, requests.filter((r) => !tail || r.path.endsWith(tail)));
  }
  if (op.startsWith("invoice/")) {
    const inv = invoices.get(decodeURIComponent(op.slice("invoice/".length)));
    return inv ? json(200, statusBody(inv)) : json(404, {});
  }
  if (op === "fail") {
    if (body.mode === "off") failRules = failRules.filter((r) => (body.invoiceId || body.path) && r.invoiceId !== body.invoiceId && r.path !== body.path);
    else failRules.push({ mode: body.mode, path: body.path, invoiceId: body.invoiceId, hangMs: body.hangMs ?? 30_000 });
    return json(200, {});
  }
  if (op === "webhook") {
    const inv = invoices.get(body.invoiceId);
    if (!inv) return json(404, { errText: "unknown invoice" });
    const status = body.status ?? "success";
    inv.status = status;
    inv.modifiedDate = nextModified();
    if (status === "success" || status === "reversed") {
      inv.paid = true;
      inv.finalAmount = inv.finalAmount ?? inv.amount;
    }
    if (body.amount !== undefined) inv.amount = body.amount;
    return json(200, { sent: await sendWebhook(inv, { signed: body.sign !== false }) });
  }
  return json(404, {});
}

async function merchantApi(url, body, json) {
  const invoiceId = body.invoiceId ?? url.searchParams.get("invoiceId") ?? undefined;
  requests.push({ method: url.pathname === "/api/merchant/invoice/status" ? "GET" : "POST", path: url.pathname, invoiceId, body });
  const rule = failRuleFor(url.pathname, invoiceId);
  if (rule?.mode === "500") return json(500, { errCode: "e2e", errText: "bank is down (e2e)" });
  if (rule?.mode === "timeout") {
    // Never answers within the backend's read timeout; the socket is dropped when the client gives up.
    await new Promise((r) => setTimeout(r, rule.hangMs));
    return json(504, { errText: "too late (e2e)" });
  }

  if (url.pathname === "/api/merchant/invoice/create") {
    const id = `e2e-${crypto.randomUUID()}`;
    const now = nextModified();
    invoices.set(id, {
      invoiceId: id,
      status: "created",
      amount: body.amount,
      reference: body.merchantPaymInfo?.reference,
      finalAmount: undefined,
      createdDate: now,
      modifiedDate: now,
      paid: false,
      rrn: crypto.randomBytes(6).toString("hex"),
      cancelList: [],
    });
    return json(200, { invoiceId: id, pageUrl: `http://localhost:${port}/pay/${id}` });
  }
  if (url.pathname === "/api/merchant/invoice/status") {
    const inv = invoices.get(invoiceId);
    return json(200, inv ? statusBody(inv) : { invoiceId, status: "created" });
  }
  if (url.pathname === "/api/merchant/invoice/cancel") {
    const inv = invoices.get(invoiceId);
    if (!inv || !inv.paid) return json(400, { errCode: "e2e", errText: "invoice is not paid" });
    if (!cancels.has(body.extRef)) {
      const left = inv.finalAmount;
      const amount = body.amount ?? left;
      if (amount > left) return json(400, { errCode: "e2e", errText: "amount is more than left" });
      inv.finalAmount = left - amount;
      inv.status = inv.finalAmount === 0 ? "reversed" : "success";
      inv.modifiedDate = nextModified();
      inv.cancelList.push({ status: "success", amount, ccy: 980, createdDate: inv.modifiedDate, modifiedDate: inv.modifiedDate, extRef: body.extRef });
      cancels.set(body.extRef, { status: "success", createdDate: inv.modifiedDate, modifiedDate: inv.modifiedDate });
    }
    return json(200, cancels.get(body.extRef));
  }
  if (url.pathname === "/api/merchant/pubkey") return json(200, { key: pubkeyB64 });
  return json(200, {});
}

server.listen(port, "127.0.0.1", () => console.log(`fake monobank on :${port}`));
