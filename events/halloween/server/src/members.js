// GET /hw/api/admin/members — the participants page of the shop admin (frontend-admin /halloween):
// everyone with a pumpkin, an order in the window or an earlier-customer invite, with names, all-time
// spend and the bot status from the shop. The stream screen never sees this.
import { db } from "./db.js";
import { config } from "./config.js";
import { liveEntries } from "./pools.js";
import { getLock } from "./draw.js";
import { shopFacts, profiles, spendAll } from "./shop.js";
import { overview, sendsOf } from "./invites.js";
import { buildRows, summarize } from "./member-rows.js";

const pumpkinStats = db.prepare(
  `SELECT tg_id, COUNT(*) AS n, COUNT(DISTINCT day) AS days, MIN(collected_at) AS first, MAX(collected_at) AS last
     FROM spawns WHERE collected_at IS NOT NULL GROUP BY tg_id`,
);

const fullName = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(" ") || null;

export async function list() {
  const [facts, pumpkinPool, orderPool, inv] = await Promise.all([shopFacts(), liveEntries("pumpkins"), liveEntries("orders"), overview()]);
  const pumpkins = new Map(
    pumpkinStats.all().map((r) => [String(r.tg_id), { n: Number(r.n), days: Number(r.days), first: Number(r.first), last: Number(r.last) }]),
  );
  const rows = buildRows({
    pumpkins,
    orders: facts.orders,
    old: facts.old,
    pumpkinPool,
    orderPool,
    invites: new Map(inv.rows.map((r) => [r.tgId, r])),
    restSends: sendsOf("rest"),
    excluded: new Map(db.prepare("SELECT tg_id, note FROM excluded").all().map((x) => [String(x.tg_id), x.note || ""])),
    staff: new Set([...facts.staff, ...config.excludeIds]),
  });
  const ids = rows.map((r) => r.tgId);
  const [prof, life] = await Promise.all([profiles(ids), spendAll(ids)]);
  for (const r of rows) {
    const p = prof.get(r.tgId);
    Object.assign(r, {
      name: fullName(p),
      username: p?.username || null,
      lang: p?.lang ? String(p.lang).slice(0, 2).toLowerCase() : null,
      botBlocked: Boolean(Number(p?.bot_blocked || 0)),
      lifetimeOrders: life.get(r.tgId)?.n || 0,
      lifetimeSpendMinor: life.get(r.tgId)?.spendMinor || 0,
    });
  }
  return {
    rows,
    summary: summarize(rows, config.goal),
    rest: inv.rest,
    locked: { pumpkins: Boolean(getLock("pumpkins")), orders: Boolean(getLock("orders")) },
    rules: { goal: config.goal, minSpendMinor: config.minSpendMinor, oldMinSpendMinor: config.oldMinSpendMinor, endsAt: config.endsAt, streamAt: config.streamAt },
  };
}
