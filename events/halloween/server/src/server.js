// Halloween 2026 event service. Mounted at /hw/ by the shop gateways (site, Mini App, admin).
//   /hw/api/*        customer API (pumpkins, codes, progress)
//   /hw/api/admin/*  draw screen and code words (admin JWT, re-checked with the shop backend)
//   /hw/spawner.js, /hw/sprites/*  the widget the site and the Mini App load
//   /hw/draw/*       the stream draw screen (the admin gateway only)
import { createServer } from "node:http";
import { ipOf } from "./clientip.js";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { customer, admin } from "./auth.js";
import * as game from "./game.js";
import * as draw from "./draw.js";
import * as adminPeople from "./admin-people.js";
import * as rehearsal from "./test-draw.js";
import * as prizes from "./prizes.js";
import { db } from "./db.js";
import { poolOf, liveEntries } from "./pools.js";
import * as notify from "./notify.js";

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

// Per-IP budget for the customer API: a person tapping pumpkins needs a few requests a minute.
const buckets = new Map();
function limited(ip, cost = 1) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.at > 60_000) b = { at: now, n: 0 };
  b.n += cost;
  buckets.set(ip, b);
  if (buckets.size > 20000) buckets.clear();
  return b.n > 300; // a mobile carrier's NAT puts many people behind one address
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

async function adminApi(req, res, path, query) {
  const who = await admin(req);
  if (!who) return send(res, 401, { error: "admin only" });
  const b = req.method === "POST" ? await body(req) : {};
  try {
    // Two separate draws; every draw-specific call names its pool (?pool=pumpkins|orders).
    const pool = poolOf(query.get("pool"));
    // Rehearsal (?test=1 on the screen): random customers, nothing real is touched.
    if (path === "test/participants" && req.method === "GET") return send(res, 200, await rehearsal.screen(pool));
    if (path === "test/reset" && req.method === "POST") {
      await rehearsal.reset(pool, b.count);
      return send(res, 200, await rehearsal.screen(pool));
    }
    if (path === "test/lock" && req.method === "POST") return send(res, 200, { seedHash: (await rehearsal.lock(pool)).commitment });
    if ((path === "test/draw" || path === "test/reroll") && req.method === "POST") return send(res, 200, await rehearsal.drawRound(pool, path === "test/reroll"));
    if (path === "participants" && req.method === "GET") return send(res, 200, await draw.screen(pool));
    if (path === "lock" && req.method === "POST") {
      const l = await draw.lock(pool, who.tgId);
      return send(res, 200, { seedHash: l.commitment, lockedAt: l.locked_at });
    }
    if ((path === "draw" || path === "reroll") && req.method === "POST") {
      const r = await draw.drawRound(pool, who.tgId, path === "reroll", b.round);
      return send(res, 200, { round: r.round, attempt: r.attempt, winner: draw.publicId(r.winnerTgId), totalTickets: r.totalTickets });
    }
    if (path === "winners" && req.method === "GET") {
      const sent = prizes.contacted();
      const rows = (await draw.winnersFull(pool)).map((w) => ({ ...w, contacted: sent.get(w.drawId) || null, prize: prizes.prizeFor(pool, w.round) }));
      return send(res, 200, await adminPeople.withSpend(pool, rows));
    }
    // Prize packs and the round → pack choice (made before the stream, changeable any time).
    if (path === "prizes" && req.method === "GET") return send(res, 200, prizes.state(pool));
    if (path === "prizes" && req.method === "POST") return send(res, 200, prizes.save(pool, b));
    if (path === "prizes/delete" && req.method === "POST") return send(res, 200, prizes.remove(pool, b.id));
    if (path === "prizes/assign" && req.method === "POST") return send(res, 200, prizes.assign(pool, b.round, b.prizeId));
    if (path === "prizes/template" && req.method === "POST") return send(res, 200, prizes.setTemplate(pool, b.text));
    // «Написати переможцю»: preview the filled template, then send it as a support chat message.
    // In a rehearsal the message goes to the admin pressing the button, never to the random customer.
    if ((path === "contact/preview" || path === "contact/send") && req.method === "POST") {
      const round = Number(b.round);
      const w = b.test ? rehearsal.winnerOf(pool, round) : (await draw.winnersFull(pool)).find((x) => x.round === round && !x.voided);
      if (!w) return send(res, 404, { error: "У цьому раунді ще немає переможця" });
      const prize = prizes.prizeFor(pool, round);
      if (path === "contact/preview") {
        const drawSent = w.drawId ? prizes.contacted().get(w.drawId) : null;
        return send(res, 200, { round, to: { name: w.name, username: w.username }, prize, text: prizes.render(prizes.template(), { name: w.name, round, prize, pool }), sent: drawSent || null, test: Boolean(b.test) });
      }
      const text = String(b.text || "").trim().slice(0, 3500);
      if (!text) return send(res, 400, { error: "Порожнє повідомлення" });
      const token = (req.headers.authorization || "").slice(7).trim();
      const r = b.test
        ? await prizes.send({ token, by: who.tgId, tgId: who.tgId, drawId: null, pool, round, text: `[ТЕСТ: справжньому переможцю це не пішло]\n\n${text}` })
        : await prizes.send({ token, by: who.tgId, tgId: w.tgId, drawId: w.drawId, pool, round, text });
      return send(res, 200, { ok: true, threadId: r.threadId, to: b.test ? "you" : "winner" });
    }
    if (path === "proof" && req.method === "GET") return send(res, 200, draw.proof(pool) || {});
    if (path === "stats" && req.method === "GET") {
      const [pk, or] = await Promise.all([liveEntries("pumpkins"), liveEntries("orders")]);
      return send(res, 200, {
        ...game.stats(),
        pumpkins: { people: pk.length, full: pk.filter((e) => e.pumpkins >= config.goal).length, tickets: pk.reduce((s, e) => s + e.tickets, 0) },
        orders: { people: or.length, tickets: or.reduce((s, e) => s + e.tickets, 0) },
        notify: notify.stats(),
      });
    }
    if (path === "codes" && req.method === "GET") return send(res, 200, game.listCodes());
    if (path === "codes" && req.method === "POST") return send(res, 200, game.saveCode(b, who.tgId));
    if (path === "people" && req.method === "GET") return send(res, 200, await adminPeople.people(pool));
    if (path === "include" && req.method === "POST") {
      adminPeople.include(pool, b.tgId);
      return send(res, 200, { ok: true });
    }
    if (path === "exclude" && req.method === "POST") {
      const live = await liveEntries(pool);
      const hit = live.find((e) => draw.publicId(e.tgId) === b.id || e.tgId === String(b.tgId || ""));
      if (!hit) return send(res, 404, { error: "not found" });
      if (draw.getLock(pool)) return send(res, 409, { error: "Список уже зафіксовано" });
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
  const url = new URL(req.url, "http://x"), path = url.pathname;
  try {
    if (path === "/hw/healthz") return send(res, 200, { ok: true, phase: game.phase() });
    if (path.startsWith("/hw/api/admin/")) return await adminApi(req, res, path.slice("/hw/api/admin/".length), url.searchParams);
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
notify.start();
