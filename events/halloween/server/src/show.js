// The live link between the remote (the panel in ?remote=1 mode, laptop or phone) and the OBS scene
// (draw/stage.html). The remote sends commands with the admin token; the scene has no buttons and no
// token: it signs in with the scene key `k`, reads only what the stream shows anyway (masked names,
// prizes) and follows one shared "show state" pushed over SSE.
//
// A roll is an event: the server draws the winner (draw.js / test-draw.js, unchanged), puts
// { id, round, winnerId } into the state, and every scene plays it. The scene reports when the winner
// is on screen, so the remote knows when to say the name and when to write to the winner.
// In memory on purpose: after a restart the remote sends its settings again; draws live in SQLite.
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const state = {
  pool: "pumpkins",
  test: false,
  visual: "",
  avatars: true,
  sound: true,
  blackout: false,
  /** Bumped when the list, the winners or the prizes changed: scenes reload their data. */
  rev: 0,
  /** The last roll: { id, pool, test, round, attempt, winnerId, totalTickets, at, revealedAt } */
  roll: null,
};
const clients = new Set(); // { res, role }
let rollSeq = 0;

export function key() {
  return createHmac("sha256", config.jwtSecret || "dev").update("hw-stage-v1").digest("hex").slice(0, 24);
}

export function keyOk(k) {
  const a = Buffer.from(String(k || ""));
  const b = Buffer.from(key());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function snapshot() {
  const stages = [...clients].filter((c) => c.role === "stage").length;
  return { ...state, stages, now: Date.now() };
}

function push() {
  const data = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const c of clients) c.res.write(data);
}

const SETTINGS = { pool: ["pumpkins", "orders"], visual: /^[a-z0-9-]{0,40}$/ };

export function set(b) {
  if (SETTINGS.pool.includes(b.pool)) state.pool = b.pool;
  if (typeof b.visual === "string" && SETTINGS.visual.test(b.visual)) state.visual = b.visual;
  for (const f of ["test", "avatars", "sound", "blackout"]) if (typeof b[f] === "boolean") state[f] = b[f];
  state.rev++;
  push();
  return snapshot();
}

/** Something the scene shows changed (lock, exclude, prizes, a new rehearsal list). */
export function changed() {
  state.rev++;
  push();
}

/** visual: the remote picks it per round (the super prize plays the knights); empty = keep the current one. */
export function rolled(pool, test, r, visual) {
  state.pool = pool;
  if (typeof visual === "string" && visual && SETTINGS.visual.test(visual)) state.visual = visual;
  state.test = Boolean(test);
  state.roll = { id: ++rollSeq, pool, test: state.test, round: r.round, attempt: r.attempt ?? 1, winnerId: r.winner, totalTickets: r.totalTickets, at: Date.now(), revealedAt: 0 };
  state.blackout = false;
  state.rev++;
  push();
}

export function revealed(id) {
  if (!state.roll || state.roll.id !== Number(id) || state.roll.revealedAt) return;
  state.roll.revealedAt = Date.now();
  push();
}

/** GET …/events: Server-Sent Events, the full state on connect and on every change. */
export function subscribe(req, res, role) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // nginx gateway: do not hold the stream back
  });
  const c = { res, role: role === "stage" ? "stage" : "remote" };
  clients.add(c);
  push();
  // Comments keep the connection alive through the gateways (nginx closes idle proxies after 60 s).
  const beat = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(beat);
    clients.delete(c);
    push();
  });
}
