// The event's own storage: one SQLite file in a volume. Deleting the volume deletes the event.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(join(config.dataDir, "halloween.sqlite"));

// 29.10: one draw became two (pumpkins / purchases). Lists frozen and rounds drawn before that were
// rehearsals of the old single draw (the event had not started), so they go rather than get a guessed pool.
const cols = (t) => db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map((r) => r.name);
if (cols("lock").length && !cols("lock").includes("pool")) db.exec("DROP TABLE lock; DROP TABLE IF EXISTS draws;");
if (cols("round_prizes").length && !cols("round_prizes").includes("pool")) db.exec("DROP TABLE round_prizes;");

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 3000;

-- One row per pumpkin shown to a signed-in person. collected_at set = it counts.
CREATE TABLE IF NOT EXISTS spawns (
  id           TEXT PRIMARY KEY,
  tg_id        TEXT NOT NULL,
  kind         INTEGER NOT NULL,
  issued_at    INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  collected_at INTEGER,
  day          TEXT NOT NULL,
  ip           TEXT,
  app          TEXT
);
CREATE INDEX IF NOT EXISTS idx_spawns_user ON spawns (tg_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_spawns_day ON spawns (day, collected_at);

CREATE TABLE IF NOT EXISTS excluded (
  tg_id TEXT PRIMARY KEY,
  note  TEXT,
  at    INTEGER NOT NULL
);

-- The frozen list each draw runs on (see draw.js) and the commitment shown before the stream.
CREATE TABLE IF NOT EXISTS lock (
  pool          TEXT PRIMARY KEY,
  seed          TEXT NOT NULL,
  snapshot      TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  commitment    TEXT NOT NULL,
  locked_at     INTEGER NOT NULL,
  locked_by     TEXT
);
CREATE TABLE IF NOT EXISTS draws (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pool       TEXT NOT NULL,
  round      INTEGER NOT NULL,
  attempt    INTEGER NOT NULL,
  tg_id      TEXT NOT NULL,
  voided     INTEGER NOT NULL DEFAULT 0,
  drawn_at   INTEGER NOT NULL,
  drawn_by   TEXT
);
`);

export const tx = (fn) => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
};
