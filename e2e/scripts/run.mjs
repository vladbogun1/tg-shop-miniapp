#!/usr/bin/env node
/**
 * One-command admin e2e run (`npm run e2e` from the repo root):
 *
 *   1. MySQL 8.4 in its own docker compose project `tgshop_e2e` (port 33307, data on tmpfs);
 *      skipped with --external-db / E2E_EXTERNAL_DB=1 (CI: a job service container);
 *   2. backend jar — `mvn package` when the jar is missing or older than the sources
 *      (--skip-backend-build to use whatever jar is there, E2E_BACKEND_JAR to point elsewhere);
 *   3. admin — frontend-admin is copied to .e2e-admin/ and built there with the e2e API URL baked
 *      in (a build in frontend-admin/ itself would clobber the .next of a running `next dev`);
 *      rebuilt only when frontend-admin/ or shared/ changed;
 *   4. `playwright test` (starts backend + admin, seeds, runs; extra args are passed through);
 *   5. tears MySQL down again unless --keep (then re-runs can use `npx playwright test` directly).
 *
 * Exit code = Playwright's.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_BUILD_DIR, API_URL, BACKEND_JAR, DB, E2E_DIR, REPO_ROOT } from "../env.js";

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
    must("mvn", ["-B", "-q", "-ntp", "-DskipTests", "package"], { cwd: backendDir });
  } else {
    console.log(`✔ backend jar is up to date: ${path.relative(REPO_ROOT, BACKEND_JAR)}`);
  }

  // ---- 3. admin build ---------------------------------------------------------------------------
  const adminSrc = path.join(REPO_ROOT, "frontend-admin");
  const stampFile = path.join(ADMIN_BUILD_DIR, ".e2e-stamp.json");
  const stamp = {
    api: API_URL,
    src: Math.max(newestMtime(adminSrc), newestMtime(path.join(REPO_ROOT, "shared", "src"))),
  };
  const prev = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, "utf8")) : null;
  const built = fs.existsSync(path.join(ADMIN_BUILD_DIR, ".next", "BUILD_ID"));
  if (forceAdminBuild || !built || !prev || prev.api !== stamp.api || prev.src !== stamp.src) {
    fs.rmSync(ADMIN_BUILD_DIR, { recursive: true, force: true });
    fs.cpSync(adminSrc, ADMIN_BUILD_DIR, {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(adminSrc, src).split(path.sep)[0];
        return rel !== "node_modules" && rel !== ".next";
      },
    });
    must("node", [path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next"), "build"], {
      cwd: ADMIN_BUILD_DIR,
      shell: false,
      env: { ...process.env, NEXT_PUBLIC_API_BASE_URL: API_URL, NEXT_TELEMETRY_DISABLED: "1" },
    });
    fs.writeFileSync(stampFile, JSON.stringify(stamp));
  } else {
    console.log(`✔ admin build is up to date: ${path.relative(REPO_ROOT, ADMIN_BUILD_DIR)}`);
  }

  // ---- 4. tests ---------------------------------------------------------------------------------
  exitCode = run("npx", ["playwright", "test", ...args], { cwd: E2E_DIR });
} finally {
  // ---- 5. cleanup -------------------------------------------------------------------------------
  if (!externalDb && !keep) run("docker", [...COMPOSE, "down", "-v"]);
  else if (!externalDb) console.log("\nMySQL left running (--keep). Stop it: docker compose -f e2e/docker-compose.e2e.yml down -v");
}
process.exit(exitCode);
