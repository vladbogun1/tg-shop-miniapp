/**
 * Customer suite, once, after the backend is up (Flyway has migrated): the admin e2e seed plus the
 * customer rows (fixtures/customer-seed.sql), then the shop settings the storefront specs need.
 * Settings go through the admin API (the same call the admin makes): the backend memoizes them for a
 * minute, so rows written straight into shop_settings would not be seen right away.
 */
import { request } from "@playwright/test";
import { API_URL } from "./env.js";
import fs from "node:fs";
import { AUTH_DIR } from "./lib/api.js";
import { login, seed } from "./global-setup.js";

/** Gift for the order sum: gift cases on (tiers and prizes are in customer-seed.sql). */
const SETTINGS = { "gift.enabled": true, "gift.caseEnabled": true };

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await seed(["customer-seed.sql"]);
  const token = await login();
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const res = await ctx.put("/api/admin/settings", { data: { values: SETTINGS } });
    if (!res.ok()) throw new Error(`settings: ${res.status()} ${await res.text()}`);
  } finally {
    await ctx.dispose();
  }
}
