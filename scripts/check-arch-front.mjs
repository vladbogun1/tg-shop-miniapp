#!/usr/bin/env node
/**
 * Храповик зависимостей фронтов на dependency-cruiser (docs/ARCHITECTURE-FRONT.md, 2.7.1).
 *
 * Правила — `.dependency-cruiser.cjs`. Нарушения, существовавшие на момент введения, записаны в
 * `known-violations.json` (формат baseline dependency-cruiser: `depcruise --ignore-known` его понимает).
 *   - НОВОЕ нарушение (нет в known-violations) или число по правилу выросло  -> exit 1;
 *   - нарушений стало меньше                                                    -> подсказка `--update`.
 *
 *   node scripts/check-arch-front.mjs            проверка + сводка «приложение × правило»
 *   node scripts/check-arch-front.mjs --update   переписать known-violations.json (только вниз; первый раз создаёт)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cruise } from "dependency-cruiser";
import extractConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import extractTsConfig from "dependency-cruiser/config-utl/extract-ts-config";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KNOWN = path.join(ROOT, "known-violations.json");
const APPS = ["frontend", "frontend-admin", "site", "packages/core", "packages/ui", "packages/customer"];

/** Один запуск на приложение (у каждого свой tsconfig с алиасом `@/*`); пакеты packages/* — отдельными запусками. */
async function collect() {
  const ruleSet = await extractConfig(path.join(ROOT, ".dependency-cruiser.cjs"));
  const found = new Map();
  const unresolved = new Set();
  for (const app of APPS) {
    const fileName = path.join(ROOT, app, "tsconfig.json");
    // Алиас `@/*` -> корень приложения (как в tsconfig). Плагин tsconfig-paths у dependency-cruiser
    // не подхватывает tsconfig без baseUrl, поэтому алиас передаётся в resolve-опции напрямую.
    const rules = ruleSet;
    const result = await cruise([app], { ...rules.options, ruleSet: rules, validate: true, baseDir: ROOT }, { alias: { "@": path.join(ROOT, app) } }, { tsConfig: extractTsConfig(fileName) });
    for (const mod of result.output.modules) {
      for (const dep of mod.dependencies ?? []) {
        // защита от «слепоты»: внутренний импорт, который не разрешился, = правила его не видят
        if (dep.couldNotResolve && /^(@[/]|@shop[/]|[.]{1,2}[/])/.test(dep.module)) unresolved.add(`${mod.source} -> ${dep.module}`);
        for (const rule of dep.rules ?? []) {
          const key = `${rule.name}|${mod.source}|${dep.resolved}`;
          found.set(key, { type: "dependency", from: mod.source, to: dep.resolved, rule: { severity: rule.severity, name: rule.name } });
        }
      }
      for (const rule of mod.rules ?? []) {
        const key = `${rule.name}|${mod.source}|`;
        found.set(key, { type: "module", from: mod.source, to: mod.source, rule: { severity: rule.severity, name: rule.name } });
      }
    }
  }
  if (unresolved.size > 0) {
    const sample = [...unresolved].slice(0, 10).join(", ");
    console.error(`dependency-cruiser не разрешил внутренние импорты (${unresolved.size}): ${sample}`);
    process.exit(1);
  }
  return found;
}

const appOf = (file) => (file.startsWith("packages/") ? file.split("/")[1] : file.split("/")[0]);
const keyOf = (v) => `${v.rule.name}|${v.from}|${v.type === "module" ? "" : v.to}`;

function summary(found, known) {
  const rules = [...new Set([...found.values(), ...known.values()].map((v) => v.rule.name))].sort();
  const cell = (app, rule, map) => [...map.values()].filter((v) => v.rule.name === rule && appOf(v.from) === app.replace("packages/", "")).length;
  console.log("\nСводка dependency-cruiser «правило × приложение» (нарушения; baseline в скобках, если отличается):");
  const w = Math.max(14, ...rules.map((r) => r.length));
  console.log(`${"".padEnd(w)}  ${APPS.map((a) => a.padStart(18)).join("")}`);
  for (const rule of rules) {
    const cells = APPS.map((app) => {
      const n = cell(app, rule, found);
      const b = cell(app, rule, known);
      const c = n === 0 ? "." : String(n);
      return (n === b ? c : `${c} (${b})`).padStart(18);
    });
    console.log(`${rule.padEnd(w)}  ${cells.join("")}`);
  }
  console.log(`${"ИТОГО".padEnd(w)}  ${APPS.map((a) => String([...found.values()].filter((v) => appOf(v.from) === a.replace("packages/", "")).length).padStart(18)).join("")}`);
}

async function main() {
  const update = process.argv.includes("--update");
  const found = await collect();
  const known = new Map();
  if (fs.existsSync(KNOWN)) for (const v of JSON.parse(fs.readFileSync(KNOWN, "utf8"))) known.set(keyOf(v), v);

  const added = [...found.keys()].filter((k) => !known.has(k));
  const removed = [...known.keys()].filter((k) => !found.has(k));

  if (update) {
    if (known.size > 0 && added.length > 0) {
      console.error(`--update отказался: новые нарушения (чинить код, а не baseline):\n  ${added.slice(0, 20).join("\n  ")}`);
      process.exit(1);
    }
    const sorted = [...found.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    fs.writeFileSync(KNOWN, JSON.stringify(sorted, null, 2) + "\n");
    summary(found, found);
    console.log(`\nknown-violations.json записан: ${sorted.length} нарушений`);
    return;
  }

  summary(found, known);
  if (removed.length > 0) {
    console.log(`\nНарушений стало меньше на ${removed.length} — понизьте baseline: node scripts/check-arch-front.mjs --update`);
  }
  if (added.length > 0) {
    console.error(`\nДЕПКРУЗЕР: новые нарушения зависимостей (${added.length}):\n  ${added.slice(0, 30).join("\n  ")}`);
    process.exit(1);
  }
  console.log("\ndependency-cruiser OK: новых нарушений нет.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
