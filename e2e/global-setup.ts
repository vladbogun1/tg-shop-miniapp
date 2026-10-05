/**
 * Runs once, after Playwright's webServer has the backend up (so Flyway has migrated):
 *  1. resets the database to fixtures/seed.sql, and the admins' 2FA state (lib/admins.ts);
 *  2. signs in as the e2e admin — password, then the TOTP code — and stores the token as the
 *     browser storage state.
 *
 * It signs in fresh every run (the admins' 2FA state and sign-in history were just reset, and the
 * e2e backend has a high ADMIN_AUTH_RATE_LIMIT), so «Мой аккаунт» always has a history entry.
 */
import fs from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import mysql from "mysql2/promise";
import { ADMIN, ADMIN_URL, API_URL, DB, E2E_DIR } from "./env.js";
import { AUTH_DIR, STORAGE_FILE, TOKEN_FILE } from "./lib/api.js";
import { resetAdmins } from "./lib/admins.js";
import { freshCode } from "./lib/totp.js";

async function seed(): Promise<void> {
  const sql = fs.readFileSync(path.join(E2E_DIR, "fixtures", "seed.sql"), "utf8");
  const conn = await mysql.createConnection({ ...DB, multipleStatements: true, charset: "utf8mb4", timezone: "Z" });
  try {
    await conn.query(sql);
    await resetAdmins(conn);
  } finally {
    await conn.end();
  }
}

async function login(): Promise<string> {
  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const res = await ctx.post("/api/auth/admin/login", {
      data: { username: ADMIN.login, password: ADMIN.password },
    });
    if (!res.ok()) throw new Error(`admin login failed: ${res.status()} ${await res.text()}`);
    const first = (await res.json()) as { status: string; preAuthToken?: string };
    if (first.status !== "TOTP_REQUIRED" || !first.preAuthToken) {
      throw new Error(`admin login: expected TOTP_REQUIRED, got ${JSON.stringify(first)}`);
    }
    const verify = await ctx.post("/api/auth/admin/2fa/verify", {
      data: { preAuthToken: first.preAuthToken, code: await freshCode(ADMIN.totpSecret), trustDevice: false },
    });
    if (!verify.ok()) throw new Error(`admin 2FA failed: ${verify.status()} ${await verify.text()}`);
    const body = (await verify.json()) as { accessToken: string };
    return body.accessToken;
  } finally {
    await ctx.dispose();
  }
}

export default async function globalSetup(): Promise<void> {
  await seed();

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const token = await login();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token }));

  // What the admin keeps in localStorage after a login (lib/api.ts TOKEN_KEY).
  const state = {
    cookies: [],
    origins: [{ origin: ADMIN_URL, localStorage: [{ name: "tgshop_admin_jwt", value: token }] }],
  };
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2));
}
