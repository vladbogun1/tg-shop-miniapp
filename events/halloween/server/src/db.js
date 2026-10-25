// The event's own storage: one SQLite file in a volume. Deleting the volume deletes the event.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(join(config.dataDir, "halloween.sqlite"));

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

-- Stream code words: limited number of uses, each person once.
CREATE TABLE IF NOT EXISTS codes (
  code       TEXT PRIMARY KEY,
  bonus      INTEGER NOT NULL,
  max_uses   INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS code_uses (
  code  TEXT NOT NULL,
  tg_id TEXT NOT NULL,
  bonus INTEGER NOT NULL,
  at    INTEGER NOT NULL,
  PRIMARY KEY (code, tg_id)
);

CREATE TABLE IF NOT EXISTS excluded (
  tg_id TEXT PRIMARY KEY,
  note  TEXT,
  at    INTEGER NOT NULL
);

-- The frozen list the draw runs on (see draw.js) and the commitment shown before the stream.
CREATE TABLE IF NOT EXISTS lock (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  seed          TEXT NOT NULL,
  snapshot      TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  commitment    TEXT NOT NULL,
  locked_at     INTEGER NOT NULL,
  locked_by     TEXT
);
CREATE TABLE IF NOT EXISTS draws (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
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
