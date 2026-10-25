// Halloween 2026 event service. Mounted at /hw/ by the shop gateways (site, Mini App, admin).
//   /hw/api/*        customer API (pumpkins, codes, progress)
//   /hw/api/admin/*  draw screen and code words (admin JWT, re-checked with the shop backend)
//   /hw/spawner.js, /hw/sprites/*  the widget the site and the Mini App load
//   /hw/draw/*       the stream draw screen (the admin gateway only)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { customer, admin } from "./auth.js";
import * as game from "./game.js";
import * as draw from "./draw.js";
import { db } from "./db.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(here, "../..");
const STATIC = {
  "/hw/draw/": join(ROOT, "draw"),
  "/hw/sprites/": join(ROOT, "public/sprites"),
  "/hw/": join(ROOT, "public"),
};
const TYPES = {
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".md": "text/plain; charset=utf-8",
};

// ---------- tiny helpers ----------
function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(json);
}

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 8 * 1024) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw Object.assign(new Error("bad json"), { status: 400 });
  }
}

function ipOf(req) {
  return String(req.headers["x-real-ip"] || req.socket.remoteAddress || "").slice(0, 64);
}

// Per-IP budget for the customer API: a person tapping pumpkins needs a few requests a minute.
const buckets = new Map();
function limited(ip, cost = 1) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.at > 60_000) b = { at: now, n: 0 };
  b.n += cost;
  buckets.set(ip, b);
  if (buckets.size > 20000) buckets.clear();
  return b.n > 120;
}

async function serveStatic(req, res, prefix, dir) {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(prefix.length)) || "index.html";
  const file = normalize(join(dir, rel));
  if (!file.startsWith(dir + sep) && file !== dir) return send(res, 404, { error: "not found" });
  try {
    let f = file;
    if ((await stat(f)).isDirectory()) f = join(f, "index.html");
    const data = await readFile(f);
    const isCode = /\.(js|html|css)$/.test(f);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(f)] || "application/octet-stream",
      // Code may change during the week; images are fixed per name.
      "Cache-Control": isCode ? "no-cache" : "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  } catch {
    send(res, 404, { error: "not found" });
  }
}

// ---------- routes ----------
async function customerApi(req, res, path) {
  const ip = ipOf(req);
  if (limited(ip)) return send(res, 429, { error: "slow down" });
  const me = customer(req);

  if (path === "state" && req.method === "GET") {
    return send(res, 200, { ...game.publicState(), me: me ? await game.progress(me.tgId) : null });
  }
  if (!me) return send(res, 401, { error: "sign in" });
  const b = req.method === "POST" ? await body(req) : {};

  if (path === "spawn" && req.method === "POST") {
    return send(res, 200, game.spawn(me.tgId, ip, String(b.app || "").slice(0, 16)));
  }
  if (path === "collect" && req.method === "POST") {
    const r = game.collect(me.tgId, b.id);
    return send(res, 200, { ...r, me: await game.progress(me.tgId) });
  }
  if (path === "code" && req.method === "POST") {
    if (limited(ip, 10)) return send(res, 429, { error: "slow down" }); // guessing codes is expensive
    const r = game.redeem(me.tgId, b.code);
    return send(res, 200, { ...r, me: await game.progress(me.tgId) });
  }
  return send(res, 404, { error: "not found" });
}

async function adminApi(req, res, path) {
  const who = await admin(req);
  if (!who) return send(res, 401, { error: "admin only" });
  const b = req.method === "POST" ? await body(req) : {};
  try {
    if (path === "participants" && req.method === "GET") return send(res, 200, await draw.screen());
    if (path === "lock" && req.method === "POST") {
      const l = await draw.lock(who.tgId);
      return send(res, 200, { seedHash: l.commitment, lockedAt: l.locked_at });
    }
    if ((path === "draw" || path === "reroll") && req.method === "POST") {
      const r = await draw.drawRound(who.tgId, path === "reroll");
      return send(res, 200, { round: r.round, attempt: r.attempt, winner: draw.publicId(r.winnerTgId), totalTickets: r.totalTickets });
    }
    if (path === "winners" && req.method === "GET") return send(res, 200, await draw.winnersFull());
    if (path === "proof" && req.method === "GET") return send(res, 200, draw.proof() || {});
    if (path === "stats" && req.method === "GET") {
      const live = await draw.liveEntries();
      return send(res, 200, {
        ...game.stats(),
        participants: live.length,
        tickets: live.reduce((s, e) => s + e.tickets, 0),
        byPumpkins: live.filter((e) => e.pumpkins >= config.goal).length,
        byOrders: live.filter((e) => e.orders > 0).length,
      });
    }
    if (path === "codes" && req.method === "GET") return send(res, 200, game.listCodes());
    if (path === "codes" && req.method === "POST") return send(res, 200, game.saveCode(b, who.tgId));
    if (path === "exclude" && req.method === "POST") {
      const live = await draw.liveEntries();
      const hit = live.find((e) => draw.publicId(e.tgId) === b.id || e.tgId === String(b.tgId || ""));
      if (!hit) return send(res, 404, { error: "not found" });
      if (draw.getLock()) return send(res, 409, { error: "Список уже зафіксовано" });
      db
        .prepare("INSERT OR REPLACE INTO excluded (tg_id, note, at) VALUES (?, ?, ?)")
        .run(hit.tgId, String(b.note || "").slice(0, 200), Date.now());
      return send(res, 200, { ok: true });
    }
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
  return send(res, 404, { error: "not found" });
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  try {
    if (path === "/hw/healthz") return send(res, 200, { ok: true, phase: game.phase() });
    if (path.startsWith("/hw/api/admin/")) return await adminApi(req, res, path.slice("/hw/api/admin/".length));
    if (path.startsWith("/hw/api/")) return await customerApi(req, res, path.slice("/hw/api/".length));
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method" });
    if (path === "/hw/draw") return send(res, 301, "", { Location: "/hw/draw/" });
    for (const [prefix, dir] of Object.entries(STATIC)) {
      if (path.startsWith(prefix)) return await serveStatic(req, res, prefix, dir);
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "server error" });
    if (!e.status) console.error(e);
  }
});

if (!config.jwtSecret && !config.devAuth) console.warn("[hw] JWT_SECRET is empty — nobody can sign in");
server.listen(config.port, () => console.log(`[hw] listening on :${config.port}, phase=${game.phase()}`));
