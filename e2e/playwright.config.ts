/**
 * Admin e2e: Playwright starts the backend jar and the built admin itself (webServer), the global
 * setup seeds the database and logs in once. MySQL comes from scripts/run.mjs (local docker
 * compose project `tgshop_e2e`) or from the CI service container.
 *
 *   npm run e2e                     — everything, from the repo root (see docs/LOCAL-TESTING.md)
 *   npx playwright test inbox      — against an already running stack (run.mjs --keep)
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
  REPO_ROOT,
  backendEnv,
} from "./env.js";

const CI = !!process.env.CI;
const NEXT_BIN = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
const LOG_DIR = path.join(E2E_DIR, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  globalSetup: "./global-setup.ts",
  // One worker: the specs touch disjoint seed rows, but «Внимание», the board totals and the
  // journal are shop-wide views — running them next to a writer would make the numbers race.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [["list"], ["github"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
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
  projects: [
    {
      name: "desktop",
      testIgnore: /\.mobile\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testMatch: /\.mobile\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      name: "backend",
      // The full log goes to e2e/logs/backend.log (uploaded by CI when a run fails).
      command: `java -jar "${BACKEND_JAR}" --server.port=${BACKEND_PORT} > "${path.join(LOG_DIR, "backend.log")}" 2>&1`,
      url: `${API_URL}/actuator/health`,
      env: backendEnv(),
      timeout: 180_000,
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
