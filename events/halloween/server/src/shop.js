// A look into the shop database: who bought this week, names for the stream, who is staff.
// The MySQL user has SELECT on orders/users/admin_users and one write: UPDATE(bot_blocked, bot_blocked_at)
// on users (markBot below), so «заблокував бота» from the broadcast reaches the shop's own user list.
import mysql from "mysql2/promise";
import { config } from "./config.js";

const enabled = Boolean(config.mysql.user && config.mysql.database);
const pool = enabled
  ? mysql.createPool({ ...config.mysql, connectionLimit: 3, connectTimeout: 3000, timezone: "Z", dateStrings: false, supportBigNumbers: true, bigNumberStrings: true })
  : null;

let cache = { at: 0, data: null };

/**
 * Orders that count: placed inside the window, not rejected (a merged order is rejected too), and
 * either paid or accepted by the shop (cash on delivery is accepted but paid only later). Money is
 * what stays with the shop: total minus refunds and parcels nobody picked up.
 */
async function fetchAll() {
  if (!pool) return { orders: new Map(), staff: new Set(), old: new Map() };
  const [orders] = await pool.query(
    `SELECT CAST(user_id AS CHAR) AS tg_id, COUNT(*) AS n,
            SUM(GREATEST(total_minor - refunded_minor - uncollected_minor, 0)) AS spend
       FROM orders
      WHERE user_id IS NOT NULL
        AND created_at >= ? AND created_at < ?
        AND status <> 'REJECTED'
        AND (paid = 1 OR status IN ('APPROVED','SHIPPED','DELIVERED'))
      GROUP BY user_id`,
    [config.ordersFrom, config.ordersTo],
  );
  const [staff] = await pool.query(`SELECT CAST(telegram_user_id AS CHAR) AS tg_id FROM admin_users`);
  // Earlier customers: the same "counts" rule, everything before the event.
  const [old] = await pool.query(
    `SELECT CAST(user_id AS CHAR) AS tg_id, SUM(GREATEST(total_minor - refunded_minor - uncollected_minor, 0)) AS spend
       FROM orders
      WHERE user_id IS NOT NULL AND created_at < ?
        AND status <> 'REJECTED'
        AND (paid = 1 OR status IN ('APPROVED','SHIPPED','DELIVERED'))
      GROUP BY user_id
     HAVING spend >= ?`,
    [config.oldBefore, config.oldMinSpendMinor],
  );
  return {
    old: new Map(old.map((r) => [String(r.tg_id), Number(r.spend)])),
    orders: new Map(orders.map((r) => [String(r.tg_id), { n: Number(r.n), spendMinor: Number(r.spend) }])),
    staff: new Set(staff.map((r) => String(r.tg_id))),
  };
}

/** Cached for a minute: the page asks often, the shop DB should not notice. */
export async function shopFacts() {
  if (cache.data && Date.now() - cache.at < 60_000) return cache.data;
  try {
    cache = { at: Date.now(), data: await fetchAll() };
  } catch (e) {
    console.error("[shop] facts failed:", e.message);
    // Keep what we had, ask again in ~15 s instead of on every request.
    cache = { at: Date.now() - 45_000, data: cache.data || { orders: new Map(), staff: new Set(), old: new Map() } };
  }
  return cache.data;
}

/** For the lock: straight from the database, an error is an error (no cached or empty fallback). */
export async function freshFacts() {
  if (!pool) throw new Error("Немає доступу до бази магазину (HW_DB_*)");
  cache = { at: Date.now(), data: await fetchAll() };
  return cache.data;
}

const NO_ORDERS = { n: 0, spendMinor: 0 };

/** Orders of one person inside the window (for their own progress panel). */
export async function ordersOf(tgId) {
  const f = await shopFacts();
  return f.orders.get(String(tgId)) || NO_ORDERS;
}

/** Names/handles/photos for a list of Telegram ids (only for the admin draw screen and export). */
export async function profiles(ids) {
  const out = new Map();
  if (!pool || !ids.length) return out;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const [rows] = await pool.query(
      `SELECT CAST(telegram_user_id AS CHAR) AS tg_id, username, first_name, last_name, photo_url, bot_blocked,
                COALESCE(NULLIF(locale, ''), language_code) AS lang
         FROM users WHERE telegram_user_id IN (?)`,
      [chunk],
    );
    for (const r of rows) out.set(String(r.tg_id), r);
  }
  return out;
}

/** All-time orders and money per person (the same "counts" rule as the draw), for the admin participants page. */
export async function spendAll(ids) {
  const out = new Map();
  if (!pool || !ids.length) return out;
  for (let i = 0; i < ids.length; i += 500) {
    const [rows] = await pool.query(
      `SELECT CAST(user_id AS CHAR) AS tg_id, COUNT(*) AS n, SUM(GREATEST(total_minor - refunded_minor - uncollected_minor, 0)) AS spend
         FROM orders
        WHERE user_id IN (?) AND status <> 'REJECTED'
          AND (paid = 1 OR status IN ('APPROVED','SHIPPED','DELIVERED'))
        GROUP BY user_id`,
      [ids.slice(i, i + 500)],
    );
    for (const r of rows) out.set(String(r.tg_id), { n: Number(r.n), spendMinor: Number(r.spend) });
  }
  return out;
}

/**
 * What a bot message told us about a person, written to the shop's users table (the shop's own
 * broadcasts skip blocked people, its user list shows them). blocked=false only clears a mark made
 * before `at`: a later block (from the shop itself) wins. The shop clears the mark on the next sign-in.
 */
export async function markBot(tgId, blocked, at) {
  if (!pool) return 0;
  const when = new Date(at);
  const [r] = blocked
    ? await pool.query(
        `UPDATE users SET bot_blocked = 1, bot_blocked_at = ?
          WHERE telegram_user_id = ? AND (bot_blocked = 0 OR bot_blocked_at IS NULL OR bot_blocked_at < ?)`,
        [when, tgId, when],
      )
    : await pool.query(
        `UPDATE users SET bot_blocked = 0
          WHERE telegram_user_id = ? AND bot_blocked = 1 AND (bot_blocked_at IS NULL OR bot_blocked_at < ?)`,
        [tgId, when],
      );
  return r.affectedRows;
}

/** Everyone the bot may write to (has a Telegram id): the "everyone else" broadcast. */
export async function allCustomerIds() {
  if (!pool) return [];
  const [rows] = await pool.query(`SELECT CAST(telegram_user_id AS CHAR) AS tg_id FROM users WHERE telegram_user_id IS NOT NULL`);
  return rows.map((r) => String(r.tg_id));
}

/** Rehearsal draw only (test-draw.js): random customers, preferring those with a Telegram photo. */
export async function randomCustomers(n) {
  if (!pool) return [];
  const [rows] = await pool.query(
    `SELECT CAST(telegram_user_id AS CHAR) AS tg_id, username, first_name, last_name, photo_url
       FROM users
      WHERE telegram_user_id IS NOT NULL
      ORDER BY (photo_url IS NOT NULL AND photo_url <> '') DESC, RAND()
      LIMIT ?`,
    [n],
  );
  return rows.filter((r) => !config.excludeIds.includes(String(r.tg_id)));
}
