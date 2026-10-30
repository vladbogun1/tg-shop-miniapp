#!/usr/bin/env node
/**
 * `npm run arch:front` — все быстрые архитектурные проверки фронтов одним прогоном (без сборки):
 * инварианты, dependency-cruiser, ESLint-храповик. Каждая печатает свою сводку «приложение × правило»;
 * падение любой не прячет остальные. Бандл-бюджет — отдельно, после сборки: `npm run check:bundle`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const steps = ["check-invariants.mjs", "check-arch-front.mjs", "check-front-ratchet.mjs"];
const failed = [];
for (const step of steps) {
  console.log(`\n=== ${step} ===`);
  const r = spawnSync(process.execPath, [path.join(dir, step), ...process.argv.slice(2)], { stdio: "inherit" });
  if (r.status !== 0) failed.push(step);
}
if (failed.length > 0) {
  console.error(`\narch:front УПАЛ: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\narch:front OK");
