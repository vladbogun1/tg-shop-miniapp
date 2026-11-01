/**
 * Money e2e (audit P2-23): the admin panel against a backend that talks to the fake monobank
 * (lib/fake-mono.mjs) — signed webhook, refund to the card, top-up, return wizard, a bank that answers 500.
 * The buyer side is the Mini App API (CustomerApi), the admin side is the real admin UI.
 *
 *   npm run e2e -- --suite=money            — everything (MySQL, jar, admin build, tests)
 *   npx playwright test -c playwright.money.config.ts   — against a running stack
 *
 * Separate from the admin suite on purpose: a backend with a monobank token changes what the order card
 * offers, and the 38 admin specs pin the card without it.
 */
import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import {
  ADMIN_BUILD_DIR,
  ADMIN_PORT,
  ADMIN_URL,
  API_URL,
  BACKEND_JAR,
  BACKEND_PORT,
  E2E_DIR,
  FAKE_MONO_PORT,
  FAKE_MONO_URL,
  REPO_ROOT,
  backendEnv,
} from "./env.js";

const CI = !!process.env.CI;
const NEXT_BIN = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
const LOG_DIR = path.join(E2E_DIR, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

export default defineConfig({
  testDir: "./money",
  outputDir: "./test-results-money",
  globalSetup: "./global-setup.ts",
  // One worker: the specs share the fake bank's request log and the shop-wide stock.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [["list"], ["github"], ["html", { open: "never", outputFolder: "playwright-report-money" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report-money" }]],
  use: {
    baseURL: ADMIN_URL,
    storageState: "./.auth/admin.json",
    locale: "ru-RU",
    timezoneId: "Europe/Kyiv",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    {
      name: "backend",
      command: `java -jar "${BACKEND_JAR}" --server.port=${BACKEND_PORT} > "${path.join(LOG_DIR, "backend-money.log")}" 2>&1`,
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
      env: { E2E_FAKE_MONO_PORT: String(FAKE_MONO_PORT), E2E_BACKEND_URL: API_URL },
      reuseExistingServer: !CI,
    },
    {
      name: "admin",
      command: `node "${NEXT_BIN}" start -p ${ADMIN_PORT}`,
      cwd: ADMIN_BUILD_DIR,
      url: ADMIN_URL,
      timeout: 60_000,
      reuseExistingServer: !CI,
    },
  ],
});
