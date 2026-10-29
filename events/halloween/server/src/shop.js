// Read-only look into the shop database: who bought this week, names for the stream, who is staff.
// The MySQL user has SELECT on orders/users/admin_users only — nothing here can change the shop.
import mysql from "mysql2/promise";
import { config } from "./config.js";

const enabled = Boolean(config.mysql.user && config.mysql.database);
const pool = enabled
  ? mysql.createPool({ ...config.mysql, connectionLimit: 3, timezone: "Z", dateStrings: false, supportBigNumbers: true, bigNumberStrings: true })
  : null;

let cache = { at: 0, data: null };

/**
 * Orders that count: placed inside the window, not rejected (a merged order is rejected too), and
 * either paid or accepted by the shop (cash on delivery is accepted but paid only later). Money is
 * what stays with the shop: total minus refunds and parcels nobody picked up.
 */
async function fetchAll() {
  if (!pool) return { orders: new Map(), staff: new Set() };
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
  return {
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
    if (!cache.data) cache = { at: Date.now(), data: { orders: new Map(), staff: new Set() } };
  }
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
      `SELECT CAST(telegram_user_id AS CHAR) AS tg_id, username, first_name, last_name, photo_url,
                COALESCE(NULLIF(locale, ''), language_code) AS lang
         FROM users WHERE telegram_user_id IN (?)`,
      [chunk],
    );
    for (const r of rows) out.set(String(r.tg_id), r);
  }
  return out;
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
