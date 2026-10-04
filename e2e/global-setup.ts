/**
 * Runs once, after Playwright's webServer has the backend up (so Flyway has migrated):
 *  1. resets the database to fixtures/seed.sql;
 *  2. logs in as the e2e admin and stores the token as the browser storage state.
 *
 * The admin login is rate limited (10 attempts / 5 min per IP), so a still-valid token from the
 * previous run is reused instead of logging in again on every local iteration.
 */
import fs from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import mysql from "mysql2/promise";
import { ADMIN, ADMIN_URL, API_URL, DB, E2E_DIR } from "./env.js";
import { AUTH_DIR, STORAGE_FILE, TOKEN_FILE } from "./lib/api.js";

async function seed(): Promise<void> {
  const sql = fs.readFileSync(path.join(E2E_DIR, "fixtures", "seed.sql"), "utf8");
  const conn = await mysql.createConnection({ ...DB, multipleStatements: true, charset: "utf8mb4", timezone: "Z" });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

async function validToken(token: string): Promise<boolean> {
  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const res = await ctx.get("/api/admin/ping", { headers: { Authorization: `Bearer ${token}` } });
    return res.ok();
  } finally {
    await ctx.dispose();
  }
}

async function login(): Promise<string> {
  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const res = await ctx.post("/api/auth/admin/login", {
      data: { username: ADMIN.login, password: ADMIN.password },
    });
    if (!res.ok()) throw new Error(`admin login failed: ${res.status()} ${await res.text()}`);
    const body = (await res.json()) as { accessToken: string };
    return body.accessToken;
  } finally {
    await ctx.dispose();
  }
}

export default async function globalSetup(): Promise<void> {
  await seed();

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  let token: string | null = null;
  if (fs.existsSync(TOKEN_FILE)) {
    const cached = (JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as { token?: string }).token ?? null;
    if (cached && (await validToken(cached))) token = cached;
  }
  if (!token) token = await login();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token }));

  // What the admin keeps in localStorage after a login (lib/api.ts TOKEN_KEY).
  const state = {
    cookies: [],
    origins: [{ origin: ADMIN_URL, localStorage: [{ name: "tgshop_admin_jwt", value: token }] }],
  };
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2));
}
