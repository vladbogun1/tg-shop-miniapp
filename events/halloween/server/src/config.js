// All knobs of the event come from the environment, so dates and limits change without a rebuild.
const env = process.env;

const num = (name, def) => (env[name] === undefined || env[name] === "" ? def : Number(env[name]));

export const config = {
  port: num("HW_PORT", 8090),
  dataDir: env.HW_DATA_DIR || "./data",
  /** Same base64 secret the shop backend signs its JWTs with (JWT_SECRET). */
  jwtSecret: env.JWT_SECRET || "",
  /** Shop backend inside the compose network — used only to confirm an admin token is still valid. */
  backendUrl: env.HW_BACKEND_URL || "http://backend:8080",
  /** Read-only MySQL user on the shop database (orders, users, admin_users). Empty = no purchases. */
  mysql: {
    host: env.HW_DB_HOST || "mysql",
    port: num("HW_DB_PORT", 3306),
    user: env.HW_DB_USER || "",
    password: env.HW_DB_PASSWORD || "",
    database: env.HW_DB_NAME || "",
  },
  // Kyiv is UTC+2 from 25.10.2026 (DST ended that night).
  startsAt: new Date(env.HW_STARTS_AT || "2026-10-29T22:00:00Z"), // Fri 30.10 00:00 Kyiv
  endsAt: new Date(env.HW_ENDS_AT || "2026-11-01T16:00:00Z"), // Sun 01.11 18:00 Kyiv, an hour before the stream
  /** Purchases window; defaults to the pumpkin window. */
  ordersFrom: new Date(env.HW_ORDERS_FROM || env.HW_STARTS_AT || "2026-10-29T22:00:00Z"),
  ordersTo: new Date(env.HW_ORDERS_TO || env.HW_ENDS_AT || "2026-11-01T16:00:00Z"),
  /** When the stream starts (ISO); the widget shows it in the reader's time. */
  streamAt: env.HW_STREAM_AT || "2026-11-01T17:00:00Z",
  /** Where the draw is streamed: "Name|url" pairs, comma separated. HW_STREAM_URL = the first one. */
  streams: (env.HW_STREAMS || "TikTok|https://www.tiktok.com/@lessons_maxsolch,Kick|https://kick.com/maxsolkh")
    .split(",").map((s) => s.trim().split("|")).filter((p) => p.length === 2 && /^https:\/\//.test(p[1])).map(([name, url]) => ({ name, url })),
  tzOffsetMinutes: num("HW_TZ_OFFSET_MIN", 120), // "today" for the daily cap is a Kyiv day
  // Pumpkin draw: everyone with at least one pumpkin is in, but a full set weighs far more.
  goal: num("HW_GOAL", 15),
  dailyCap: num("HW_DAILY_CAP", 8),
  /** Draw weight of a full set; a partial set weighs 1 per pumpkin (1..goal-1). */
  fullWeight: num("HW_FULL_WEIGHT", 100),
  /** All partial sets together get at most this share of the pumpkin draw (full sets weigh more if needed). */
  partialShare: num("HW_PARTIAL_SHARE", 0.1),
  // Purchase draw: orders inside the window adding up to minSpend; one ticket per minSpend, capped.
  minSpendMinor: Math.round(num("HW_MIN_SPEND_UAH", 500) * 100),
  maxOrderTickets: num("HW_MAX_ORDER_TICKETS", 5),
  /** Rounds of each draw (= prizes). */
  rounds: { pumpkins: num("HW_ROUNDS_PUMPKINS", 3), orders: num("HW_ROUNDS_ORDERS", 3) },
  /** Minimal pause between two pumpkins for one person (server side; the client waits longer). */
  spawnGapSec: num("HW_SPAWN_GAP_SEC", 35),
  spawnTtlSec: num("HW_SPAWN_TTL_SEC", 9),
  /** A tap earlier than this after the pumpkin was issued is a script, not a finger. */
  minReactMs: num("HW_MIN_REACT_MS", 350),
  /** Pumpkins one IP may collect per day across all accounts (shared Wi-Fi is fine at this level). */
  ipDailyCap: num("HW_IP_DAILY_CAP", 400), // mobile CGNAT: hundreds of people per address
  /** Telegram ids never in the draw besides admin_users (comma list): test/tech accounts. */
  excludeIds: (env.HW_EXCLUDE_IDS || "9000000000000001").split(",").map((s) => s.trim()).filter(Boolean),
  /** Bot DMs "you got a ticket": the shop bot token (send only, no polling — no 409 with the backend). */
  botToken: env.HW_BOT_TOKEN || "",
  notify: env.HW_NOTIFY === "1",
  /** Comma list: notify only these Telegram ids (demo/stand testing). Empty = everyone. */
  notifyOnly: (env.HW_NOTIFY_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean),
  /** Local run without the shop: any token is accepted as `?dev=<tgId>` / admin. NEVER in prod. */
  devAuth: env.HW_DEV_AUTH === "1",
};
