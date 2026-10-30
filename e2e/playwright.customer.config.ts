/**
 * Customer smoke (docs/ARCHITECTURE-FRONT.md, step 5.0): the Mini App (frontend/) and the website
 * (site/) as a buyer uses them — characterization tests that pin what the code does TODAY, so the
 * step 5 move into @shop/customer can be checked against them.
 *
 * Stack, all started here (reuseExistingServer locally): the backend jar (customer env: unsigned
 * Telegram data accepted, monobank → lib/fake-mono.mjs), production builds of the Mini App and the
 * site (copies built by scripts/run.mjs), and a gateway in front of the site (lib/gateway.mjs: /api,
 * /ws → backend). Seeds: fixtures/seed.sql + fixtures/customer-seed.sql (global-setup.customer.ts).
 *
 *   npm run e2e -- --suite=customer          — everything (MySQL, jar, builds, tests)
 *   npx playwright test -c playwright.customer.config.ts miniapp-cart   — against a running stack
 *
 * Projects: «iphone» = WebKit with the iPhone profile (what Safari in Telegram is), «desktop» = Chromium.
 */
import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import {
  API_URL,
  BACKEND_JAR,
  BACKEND_PORT,
  E2E_DIR,
  FAKE_MONO_PORT,
  FAKE_MONO_URL,
  MINIAPP_BUILD_DIR,
  MINIAPP_PORT,
  MINIAPP_URL,
  REPO_ROOT,
  SITE_APP_PORT,
  SITE_BUILD_DIR,
  SITE_PORT,
  SITE_URL,
  backendEnv,
} from "./env.js";

const CI = !!process.env.CI;
const NEXT_BIN = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
const LOG_DIR = path.join(E2E_DIR, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const log = (name: string) => `> "${path.join(LOG_DIR, `${name}.log`)}" 2>&1`;

export default defineConfig({
  testDir: "./customer",
  outputDir: "./test-results-customer",
  globalSetup: "./global-setup.customer.ts",
  // One worker: every test makes its own customer (a fresh Telegram id), but the shop-wide numbers
  // (stock, promo uses) are shared, and WebKit + two Next servers on a CI runner are not generous.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: CI
    ? [["list"], ["github"], ["html", { open: "never", outputFolder: "playwright-report-customer" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report-customer" }]],
  use: {
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      name: "backend",
      command: `java -jar "${BACKEND_JAR}" --server.port=${BACKEND_PORT} ${log("backend-customer")}`,
      url: `${API_URL}/actuator/health`,
      env: backendEnv({ customer: true }),
      timeout: 180_000,
      reuseExistingServer: !CI,
    },
    {
      name: "fake-monobank",
      command: `node lib/fake-mono.mjs`,
      cwd: E2E_DIR,
      url: `${FAKE_MONO_URL}/pay/ping`,
      env: { E2E_FAKE_MONO_PORT: String(FAKE_MONO_PORT) },
      reuseExistingServer: !CI,
    },
    {
      name: "miniapp",
      command: `node "${NEXT_BIN}" start -p ${MINIAPP_PORT}`,
      cwd: MINIAPP_BUILD_DIR,
      url: MINIAPP_URL,
      timeout: 60_000,
      reuseExistingServer: !CI,
    },
    {
      name: "site",
      command: `node "${NEXT_BIN}" start -p ${SITE_APP_PORT}`,
      cwd: SITE_BUILD_DIR,
      url: `http://localhost:${SITE_APP_PORT}/uk`,
      env: { INTERNAL_API_BASE: API_URL, SITE_INDEXABLE: "false", NEXT_TELEMETRY_DISABLED: "1" },
      timeout: 90_000,
      reuseExistingServer: !CI,
    },
    {
      name: "site-gateway",
      command: `node lib/gateway.mjs`,
      cwd: E2E_DIR,
      url: `${SITE_URL}/uk`,
      env: {
        E2E_SITE_PORT: String(SITE_PORT),
        E2E_SITE_APP_PORT: String(SITE_APP_PORT),
        E2E_BACKEND_PORT: String(BACKEND_PORT),
      },
      timeout: 60_000,
      reuseExistingServer: !CI,
    },
  ],
});
