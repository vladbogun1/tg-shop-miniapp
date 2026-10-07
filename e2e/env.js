// Single source of the e2e stack settings — read by scripts/run.mjs, playwright.config.ts and
// the global setup. Every value can be overridden with the environment variable of the same name.
//
// Ports and names are deliberately different from the dev stack (backend :8080, admin :3005,
// tgshop_v2_mysql on :3341), so a run never touches it.
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = (name, fallback) => process.env[name] || fallback;

export const E2E_DIR = here;
export const REPO_ROOT = path.resolve(here, "..");

export const DB = {
  host: env("E2E_DB_HOST", "127.0.0.1"),
  port: Number(env("E2E_DB_PORT", "33307")),
  database: env("E2E_DB_NAME", "tgshop_e2e"),
  user: env("E2E_DB_USER", "e2e"),
  password: env("E2E_DB_PASSWORD", "e2e-db-pass"),
};

export const BACKEND_PORT = Number(env("E2E_BACKEND_PORT", "18089"));
export const ADMIN_PORT = Number(env("E2E_ADMIN_PORT", "3105"));
/** Origins must be http://localhost:* — that is what the dev profile's CORS list allows. */
export const API_URL = `http://localhost:${BACKEND_PORT}`;
export const ADMIN_URL = `http://localhost:${ADMIN_PORT}`;

/**
 * The bootstrap admin (tg id 1, created by AdminBootstrap from ADMIN_LOGIN / ADMIN_PASSWORD) — the
 * one every spec acts as. Its 2FA secret is written by the global setup (lib/admins.ts), so tests
 * can compute the codes. Test-only values, base32 like an authenticator app shows them.
 */
export const ADMIN = {
  id: 1,
  login: env("E2E_ADMIN_LOGIN", "e2e-admin"),
  password: env("E2E_ADMIN_PASSWORD", "e2e-admin-pass-not-a-placeholder"),
  totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
};

/** Second admin (seeded): trusted device + password change specs. Role ADMIN, 2FA on. */
export const SECOND_ADMIN = {
  id: 2,
  login: "e2e-second",
  password: "e2e-second-pass-123",
  // BCrypt(10) of the password above.
  passwordHash: "$2a$10$dJKRHG4AE4vXijH1LeETGOF59F3wdo9D3RcgOSgthwbyBU7mon0Vu",
  newPassword: "e2e-second-new-pass-456",
  totpSecret: "KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU",
};

/** Third admin (seeded): has a password but no 2FA yet — the first-sign-in setup spec. */
export const FRESH_ADMIN = {
  id: 3,
  login: "e2e-fresh",
  password: "e2e-fresh-pass-1234",
  passwordHash: "$2a$10$LwdTaPGtMzeL.kvtV2bHXuLiJ2fM096j5aLSIuqY7PEDfzXDfqTAy",
};

/**
 * Fourth admin (seeded): an ordinary ADMIN with 2FA for the «Админы» specs — no access to the
 * section, then 2FA reset and block by the main admin.
 */
export const TEAM_ADMIN = {
  id: 4,
  login: "e2e-team",
  password: "e2e-team-pass-12345",
  passwordHash: "$2a$10$tDN0tlWPEdFxOZdOeirM8.ZVpE7zKZ.QEiVs8YHZS3txqb5UwDOFK",
  totpSecret: "MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U",
};

/** Telegram ids the «Админы» specs invite (removed again by the global setup). */
export const INVITED_TG_BASE = 990000;

/** AES-256 key for the 2FA secrets at rest (base64 of 32 bytes) — test only. */
export const ADMIN_2FA_KEY = "ZTJlLW9ubHktYWRtaW4tMmZhLWtleS0zMi1ieXRlcyE=";

export const BACKEND_JAR = env("E2E_BACKEND_JAR", path.join(REPO_ROOT, "backend", "target", "app.jar"));
/** Copy of frontend-admin that gets built for the run (keeps the real app dir's .next untouched). */
export const ADMIN_BUILD_DIR = env("E2E_ADMIN_DIR", path.join(REPO_ROOT, ".e2e-admin"));

/** Environment of the backend under test: dev profile, test secrets, no Telegram bot, no S3/NP. */
export function backendEnv() {
  return {
    SPRING_PROFILES_ACTIVE: "dev",
    DB_HOST: DB.host,
    DB_PORT: String(DB.port),
    DB_NAME: DB.database,
    DB_USER: DB.user,
    DB_PASSWORD: DB.password,
    // base64 of a throwaway 48-byte string — valid for tests only.
    JWT_SECRET: "ZTJlLW9ubHktand0LXNlY3JldC1ub3QtZm9yLXByb2R1Y3Rpb24tdXNlLTAwMDAwMDA=",
    ADMIN_LOGIN: ADMIN.login,
    ADMIN_PASSWORD: ADMIN.password,
    ADMIN_BOOTSTRAP_TG_ID: "1",
    ADMIN_2FA_KEY,
    // Every spec signs in through the 2-step flow; the production 20 / 5 min per IP would trip.
    ADMIN_AUTH_RATE_LIMIT: "1000",
    // Blank token = the bot is never registered (TelegramBotConfig); notifications become no-ops.
    BOT_TOKEN: "",
    ALLOW_UNSIGNED_INIT_DATA: "false",
    NOTIFY_CHAT_ID: "0",
    ADMIN_BASE_URL: ADMIN_URL,
    WEBAPP_BASE_URL: "",
    SITE_BASE_URL: "",
    SITE_REVALIDATE_URL: "",
    // Nothing listens there: MinIO and Nova Poshta calls fail fast instead of reaching the network.
    S3_ENDPOINT: "http://127.0.0.1:9",
    NOVAPOSHTA_API_KEY: "",
    NOVAPOSHTA_API_URL: "http://127.0.0.1:9/",
    APP_TIMEZONE: "Europe/Kyiv",
  };
}
