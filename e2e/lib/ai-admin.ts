/**
 * Помощники для спеков встроенного ИИ (центр задач, метрики): засев строк `ai_jobs` прямо в базу (модель и очередь
 * здесь не нужны, нужны готовые итоги) и обычный админ без права «Финансы», который заходит через API, как в
 * 19-admins. Все засеянные строки помечены `error_note = 'e2e-ai'` и удаляются целиком.
 */
import { request, type Browser, type Page } from "@playwright/test";
import { ADMIN_2FA_KEY, ADMIN_URL, API_URL, TEAM_ADMIN } from "../env.js";
import { query, withDb } from "./db";
import { encryptSecret, freshCode } from "./totp";

export const TAG = "e2e-ai";
/** Технический админ claude-tech: его тестовые запуски метрики по умолчанию не считают. */
export const TEST_ADMIN_ID = 9_000_000_000_000_001;

/** Обычный админ (роль ADMIN, без «Финансов») со своим ключом 2FA, чтобы не делить шаги кода с другими спеками. */
export const PLAIN_ADMIN = {
  id: 9_100_000_000_000_041,
  login: "e2e-ai-plain",
  name: "E2E ИИ-админ",
  totpSecret: "ONSWG4TFOQYTEMZUGU3DOOBZGA4TQNRQ",
};

export interface SeedJob {
  feature?: string;
  status: string;
  admin: number;
  subject: string;
  /** Момент завершения (UTC, ISO). */
  at: string;
  path?: "BUILTIN" | "MANUAL";
  outcome?: "APPLIED" | "PARTIAL" | "REJECTED" | null;
  applied?: number | null;
  rejected?: number | null;
  costMicro?: number;
  rateMilli?: number;
  errorCode?: string | null;
  prompt?: string;
}

/** Вставляет задачу; возвращает её id. */
export async function seedJob(j: SeedJob): Promise<number> {
  return withDb(async (conn) => {
    const at = new Date(j.at);
    const outcome = j.outcome ?? null;
    const [res] = await conn.query(
      `INSERT INTO ai_jobs (feature, status, admin_id, subject_type, subject_id, effort, path, cost_micro_usd, rate_milli,
         error_code, error_note, outcome, outcome_applied, outcome_rejected, outcome_edited, outcome_at, created_at, finished_at)
       VALUES (?, ?, ?, 'PRODUCT', ?, 'low', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        j.feature ?? "CARD", j.status, j.admin, j.subject, j.path ?? "BUILTIN", j.costMicro ?? 47_619, j.rateMilli ?? 42_000,
        j.errorCode ?? null, TAG, outcome, outcome ? (j.applied ?? 0) : null, outcome ? (j.rejected ?? 0) : null,
        outcome ? 0 : null, outcome ? at : null, at, ["QUEUED", "RUNNING"].includes(j.status) ? null : at,
      ],
    );
    const id = (res as { insertId: number }).insertId;
    if (j.prompt) await conn.query("INSERT INTO ai_job_bodies (job_id, prompt, answer, created_at) VALUES (?, ?, NULL, NOW())", [id, j.prompt]);
    return id;
  });
}

export async function clearSeeded(): Promise<void> {
  await withDb(async (conn) => {
    await conn.query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE error_note = ?)", [TAG]);
    await conn.query("DELETE FROM ai_jobs WHERE error_note = ?", [TAG]);
  });
}

export async function productTitle(id: string): Promise<string> {
  return (await query<{ title: string }>("SELECT title FROM products WHERE id = UUID_TO_BIN(?)", [id]))[0].title;
}

/** Создаёт обычного админа в базе (если его нет) и входит им по API: возвращает токен доступа. */
export async function signInPlainAdmin(): Promise<string> {
  await withDb(async (conn) => {
    await conn.query(
      `INSERT INTO admin_users (telegram_user_id, username, password_hash, name, role, active, token_version)
       VALUES (?, ?, ?, ?, 'ADMIN', TRUE, 0)
       ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash), active = TRUE`,
      [PLAIN_ADMIN.id, PLAIN_ADMIN.login, TEAM_ADMIN.passwordHash, PLAIN_ADMIN.name],
    );
    await conn.query(
      "UPDATE admin_users SET failed_attempts = 0, locked_until = NULL, totp_last_step = NULL, totp_secret_enc = ?, totp_enabled_at = NOW() WHERE telegram_user_id = ?",
      [encryptSecret(PLAIN_ADMIN.totpSecret, PLAIN_ADMIN.id, ADMIN_2FA_KEY), PLAIN_ADMIN.id],
    );
    await conn.query("DELETE FROM admin_trusted_devices WHERE admin_id = ?", [PLAIN_ADMIN.id]);
  });
  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const first = await ctx.post("/api/auth/admin/login", { data: { username: PLAIN_ADMIN.login, password: TEAM_ADMIN.password } });
    const body = (await first.json()) as { preAuthToken: string };
    const done = await ctx.post("/api/auth/admin/2fa/verify", {
      data: { preAuthToken: body.preAuthToken, code: await freshCode(PLAIN_ADMIN.totpSecret), trustDevice: false },
    });
    return ((await done.json()) as { accessToken: string }).accessToken;
  } finally {
    await ctx.dispose();
  }
}

export async function removePlainAdmin(): Promise<void> {
  await withDb(async (conn) => {
    await conn.query("DELETE FROM admin_login_log WHERE admin_id = ?", [PLAIN_ADMIN.id]);
    await conn.query("DELETE FROM admin_users WHERE telegram_user_id = ?", [PLAIN_ADMIN.id]);
  });
}

/** Отдельный браузер, в котором уже вошёл обычный админ (токен лежит там же, где у админки). */
export async function pageAs(browser: Browser, token: string, viewport?: { width: number; height: number }): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: ADMIN_URL,
    locale: "ru-RU",
    viewport,
    storageState: { cookies: [], origins: [{ origin: ADMIN_URL, localStorage: [{ name: "tgshop_admin_jwt", value: token }] }] },
  });
  return ctx.newPage();
}

/** Запрос к API от имени обычного админа. */
export async function getAs(token: string, path: string): Promise<{ status: number; body: unknown }> {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const res = await ctx.get(path);
    return { status: res.status(), body: await res.json().catch(() => null) };
  } finally {
    await ctx.dispose();
  }
}

export async function postAs(token: string, path: string): Promise<{ status: number }> {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    return { status: (await ctx.post(path)).status() };
  } finally {
    await ctx.dispose();
  }
}

export async function putAs(token: string, path: string, data: unknown): Promise<{ status: number }> {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    return { status: (await ctx.put(path, { data })).status() };
  } finally {
    await ctx.dispose();
  }
}
