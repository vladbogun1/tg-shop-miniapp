#!/usr/bin/env node
/**
 * One-command admin e2e run (`npm run e2e` from the repo root):
 *
 *   1. MySQL 8.4 in its own docker compose project `tgshop_e2e` (port 33307, data on tmpfs);
 *      skipped with --external-db / E2E_EXTERNAL_DB=1 (CI: a job service container);
 *   2. backend jar — `mvn clean package` (clean: stale migrations left in target/ by other branches break Flyway) when the jar is missing or older than the sources
 *      (--skip-backend-build to use whatever jar is there, E2E_BACKEND_JAR to point elsewhere);
 *   3. admin — frontend-admin is copied to .e2e-admin/ and built there with the e2e API URL baked
 *      in (a build in frontend-admin/ itself would clobber the .next of a running `next dev`);
 *      rebuilt only when frontend-admin/ or packages/ changed;
 *   4. `playwright test` (starts backend + admin, seeds, runs; extra args are passed through);
 *   5. tears MySQL down again unless --keep (then re-runs can use `npx playwright test` directly).
 *
 * Suites: admin (default) or customer (`--suite=customer` / E2E_SUITE=customer): the Mini App and the website
 * (copies built into .e2e-miniapp / .e2e-site), the fake monobank and a gateway in front of the site, run by
 * playwright.customer.config.ts against the same MySQL and jar (docs/ARCHITECTURE-FRONT.md, step 5.0).
 *
 * Exit code = Playwright's.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_BUILD_DIR, API_URL, BACKEND_JAR, DB, E2E_DIR, MINIAPP_BUILD_DIR, REPO_ROOT, SITE_BUILD_DIR, SITE_URL } from "../env.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
// Every flag also has an env twin: PowerShell's npm wrapper swallows a bare `--`, so
// `npm run e2e -- --keep` may never reach this script there (use `$env:E2E_KEEP=1` instead).
const externalDb = flag("--external-db") || process.env.E2E_EXTERNAL_DB === "1";
const skipBackendBuild = flag("--skip-backend-build") || process.env.E2E_SKIP_BACKEND_BUILD === "1";
const forceAdminBuild = flag("--rebuild-admin") || process.env.E2E_REBUILD_ADMIN === "1";
const keep = flag("--keep") || process.env.E2E_KEEP === "1";

const suiteArg = args.find((a) => a.startsWith("--suite="));
if (suiteArg) args.splice(args.indexOf(suiteArg), 1);
const suite = suiteArg ? suiteArg.slice("--suite=".length) : process.env.E2E_SUITE || "admin";
if (suite !== "admin" && suite !== "customer") {
  console.error(`unknown suite: ${suite} (admin | customer)`);
  process.exit(2);
}

const isWin = process.platform === "win32";
const COMPOSE = ["compose", "-f", path.join(E2E_DIR, "docker-compose.e2e.yml")];

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n▶ ${cmd} ${cmdArgs.join(" ")}`);
  const res = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: isWin, ...opts });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

function must(cmd, cmdArgs, opts) {
  const code = run(cmd, cmdArgs, opts);
  if (code !== 0) {
    console.error(`✖ ${cmd} exited with ${code}`);
    process.exit(code);
  }
}

/** Newest mtime under `dir` (skipping build output and dependencies). */
function newestMtime(dir) {
  let newest = 0;
  const skip = new Set(["node_modules", ".next", "target", ".turbo"]);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return newest;
}

// ---- 1. database ------------------------------------------------------------------------------
if (!externalDb) {
  must("docker", [...COMPOSE, "up", "-d", "--wait", "mysql"], {
    env: { ...process.env, E2E_MYSQL_PORT: String(DB.port) },
  });
}

let exitCode = 1;
try {
  // ---- 2. backend jar -------------------------------------------------------------------------
  const backendDir = path.join(REPO_ROOT, "backend");
  const jarFresh =
    fs.existsSync(BACKEND_JAR) &&
    fs.statSync(BACKEND_JAR).mtimeMs >=
      Math.max(newestMtime(path.join(backendDir, "src", "main")), fs.statSync(path.join(backendDir, "pom.xml")).mtimeMs);
  if (skipBackendBuild || process.env.E2E_BACKEND_JAR) {
    if (!fs.existsSync(BACKEND_JAR)) {
      console.error(`✖ backend jar not found: ${BACKEND_JAR}`);
      process.exit(1);
    }
  } else if (!jarFresh) {
    must("mvn", ["-B", "-q", "-ntp", "-DskipTests", "clean", "package"], { cwd: backendDir });
  } else {
    console.log(`✔ backend jar is up to date: ${path.relative(REPO_ROOT, BACKEND_JAR)}`);
  }

  // ---- 3. app builds ---------------------------------------------------------------------------
  /** Copy `srcName` to `destDir` and `next build` it there, only when its sources or the API url changed. */
  const buildCopy = (srcName, destDir, buildEnv) => {
    const src = path.join(REPO_ROOT, srcName);
    const stampFile = path.join(destDir, ".e2e-stamp.json");
    const stamp = {
      env: buildEnv,
      src: Math.max(newestMtime(src), newestMtime(path.join(REPO_ROOT, "packages"))),
    };
    const prev = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, "utf8")) : null;
    const built = fs.existsSync(path.join(destDir, ".next", "BUILD_ID"));
    if (forceAdminBuild || !built || !prev || JSON.stringify(prev.env) !== JSON.stringify(stamp.env) || prev.src !== stamp.src) {
      fs.rmSync(destDir, { recursive: true, force: true });
      fs.cpSync(src, destDir, {
        recursive: true,
        filter: (p) => {
          const rel = path.relative(src, p).split(path.sep)[0];
          return rel !== "node_modules" && rel !== ".next";
        },
      });
      must("node", [path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next"), "build"], {
        cwd: destDir,
        shell: false,
        env: { ...process.env, ...buildEnv, NEXT_TELEMETRY_DISABLED: "1" },
      });
      fs.writeFileSync(stampFile, JSON.stringify(stamp));
    } else {
      console.log(`✔ ${srcName} build is up to date: ${path.relative(REPO_ROOT, destDir)}`);
    }
  };
  if (suite === "admin") {
    buildCopy("frontend-admin", ADMIN_BUILD_DIR, { NEXT_PUBLIC_API_BASE_URL: API_URL });
  } else {
    // The Mini App talks to the backend cross-origin (url baked in); the site is same-origin (gateway).
    buildCopy("frontend", MINIAPP_BUILD_DIR, { NEXT_PUBLIC_API_BASE_URL: API_URL });
    buildCopy("site", SITE_BUILD_DIR, { NEXT_PUBLIC_SITE_URL: SITE_URL });
  }

  // ---- 4. tests ---------------------------------------------------------------------------------
  const config = suite === "customer" ? ["-c", "playwright.customer.config.ts"] : [];
  exitCode = run("npx", ["playwright", "test", ...config, ...args], { cwd: E2E_DIR });
} finally {
  // ---- 5. cleanup -------------------------------------------------------------------------------
  if (!externalDb && !keep) run("docker", [...COMPOSE, "down", "-v"]);
  else if (!externalDb) console.log("\nMySQL left running (--keep). Stop it: docker compose -f e2e/docker-compose.e2e.yml down -v");
}
process.exit(exitCode);
