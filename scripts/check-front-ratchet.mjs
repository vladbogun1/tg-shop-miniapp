#!/usr/bin/env node
/**
 * Храповик ESLint для фронтов (docs/ARCHITECTURE-FRONT.md, 2.7.2).
 *
 * Запускает `eslint -f json --no-inline-config` в frontend, frontend-admin, site, packages/core, packages/ui, считает нарушения
 * отслеживаемых правил (счётные правила из packages/core/eslint/front-rules.mjs + лимиты размера + exhaustive-deps)
 * и сравнивает с scripts/frontend-baseline.txt (`<правило> <приложение> <число>`, нули не пишутся).
 *   - число ВЫРОСЛО  -> exit 1 (чинить код, а не поднимать baseline);
 *   - число УПАЛО    -> подсказка понизить baseline (`--update`);
 *   - `--no-inline-config`: `// eslint-disable` не прячет нарушения (26 отключений exhaustive-deps — тоже долг).
 *
 * Использование:
 *   node scripts/check-front-ratchet.mjs                  проверка + сводка «приложение × правило»
 *   node scripts/check-front-ratchet.mjs --update         записать baseline (только вниз; первый раз — создаёт)
 *   node scripts/check-front-ratchet.mjs --update --allow-growth=<правило>,<правило>
 *                                                         осознанный рост (причина — в сообщении коммита); в CI отключён
 *   node scripts/check-front-ratchet.mjs --base-ref=origin/master
 *                                                         сравнивать с baseline из базовой ветки PR, а не из этого же коммита:
 *                                                         рост baseline в PR — отдельная ошибка. Разрешается только явным
 *                                                         RATCHET_GROWTH_APPROVED=1 (в CI — метка PR `ratchet-growth`).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "scripts/frontend-baseline.txt");
export const APPS = ["frontend", "frontend-admin", "site", "core", "ui", "customer"];
/** Папка пакета по имени в сводке. */
const DIRS = { core: "packages/core", ui: "packages/ui", customer: "packages/customer" };

/** Порядок колонок сводки. Остальные ruleId ESLint не отслеживаются. */
export const RULES = [
  "no-fetch",
  "no-web-storage",
  "no-confirm-alert",
  "query-key-literal",
  "stale-time-literal",
  "refetch-interval-literal",
  "money-div-mul-100",
  "to-fixed",
  "time-new-date",
  "time-date-now",
  "time-to-locale",
  "time-intl-datetimeformat",
  "cyrillic-literal",
  "exhaustive-deps",
  "max-lines",
  "max-lines-per-function",
  "complexity",
  "max-depth",
];

const DIRECT = {
  "react-hooks/exhaustive-deps": "exhaustive-deps",
  "max-lines": "max-lines",
  "max-lines-per-function": "max-lines-per-function",
  complexity: "complexity",
  "max-depth": "max-depth",
};

function ruleOf(message) {
  const tagged = /\[([\w-]+)\]/.exec(message.message ?? "");
  if (tagged && RULES.includes(tagged[1])) return tagged[1];
  return DIRECT[message.ruleId] ?? null;
}

function runEslint(app) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `front-ratchet-${app}-${process.pid}.json`);
    const bin = path.join(ROOT, "node_modules/eslint/bin/eslint.js");
    const child = spawn(process.execPath, [bin, ".", "-f", "json", "--no-inline-config", "-o", out], {
      cwd: path.join(ROOT, DIRS[app] ?? app),
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("close", () => {
      if (!fs.existsSync(out)) return reject(new Error(`eslint в ${app} не выдал отчёт:\n${err}`));
      const report = JSON.parse(fs.readFileSync(out, "utf8"));
      fs.rmSync(out, { force: true });
      resolve(report);
    });
  });
}

function count(report) {
  const counts = {};
  for (const file of report) {
    for (const m of file.messages) {
      if (m.fatal) throw new Error(`Ошибка разбора ${file.filePath}: ${m.message}`);
      const rule = ruleOf(m);
      if (rule) counts[rule] = (counts[rule] ?? 0) + 1;
    }
  }
  return counts;
}

function readBaseline() {
  return fs.existsSync(BASELINE) ? parseBaseline(fs.readFileSync(BASELINE, "utf8")) : new Map();
}

/** Baseline из базовой ветки PR. Нет файла в базе = пусто; нет самой ветки = ошибка (молча не сравниваем). */
function readBaseBaseline(ref) {
  const rel = path.relative(ROOT, BASELINE).split(path.sep).join("/");
  const r = spawnSync("git", ["show", `${ref}:${rel}`], { cwd: ROOT, encoding: "utf8" });
  if (r.status === 0) return parseBaseline(r.stdout);
  if (spawnSync("git", ["rev-parse", "--verify", "-q", ref], { cwd: ROOT }).status !== 0) {
    console.error(`--base-ref: не найдена ссылка ${ref} (нужен fetch базовой ветки).`);
    process.exit(1);
  }
  return new Map();
}

function parseBaseline(text) {
  const map = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [rule, app, n] = line.split(/\s+/);
    map.set(`${rule} ${app}`, Number(n));
  }
  return map;
}

function writeBaseline(current) {
  const header = [
    "# Храповик фронтов: <правило> <приложение> <число>. Нули не пишутся. Числа только падают.",
    "# Обновление: node scripts/check-front-ratchet.mjs --update (docs/ARCHITECTURE-FRONT.md, 2.7.2).",
  ];
  const lines = [];
  for (const rule of RULES)
    for (const app of APPS) {
      const n = current.get(`${rule} ${app}`) ?? 0;
      if (n > 0) lines.push(`${rule} ${app} ${n}`);
    }
  fs.writeFileSync(BASELINE, [...header, ...lines].join("\n") + "\n");
}

export function printSummary(current, baseline) {
  const w = Math.max(...RULES.map((r) => r.length));
  const cols = APPS.map((a) => a.length + 1);
  console.log("\nСводка ESLint-храповика «правило × приложение» (в скобках — baseline, если отличается):");
  console.log(`${"".padEnd(w)}  ${APPS.map((a, i) => a.padStart(cols[i] + 5)).join("")}`);
  for (const rule of RULES) {
    const cells = APPS.map((app, i) => {
      const n = current.get(`${rule} ${app}`) ?? 0;
      const b = baseline.get(`${rule} ${app}`) ?? 0;
      const cell = n === 0 ? "." : String(n);
      return (b !== n ? `${cell} (${b})` : cell).padStart(cols[i] + 5);
    });
    console.log(`${rule.padEnd(w)}  ${cells.join("")}`);
  }
  const total = (app) => RULES.reduce((s, r) => s + (current.get(`${r} ${app}`) ?? 0), 0);
  console.log(`${"ИТОГО".padEnd(w)}  ${APPS.map((a, i) => String(total(a)).padStart(cols[i] + 5)).join("")}`);
}

async function main() {
  const args = process.argv.slice(2);
  const update = args.includes("--update");
  const allow = new Set(
    (args.find((a) => a.startsWith("--allow-growth="))?.split("=")[1] ?? "").split(",").filter(Boolean),
  );

  const baseRef = args.find((a) => a.startsWith("--base-ref="))?.split("=")[1] || process.env.RATCHET_BASE_REF || "";
  const approved = process.env.RATCHET_GROWTH_APPROVED === "1";
  if (process.env.CI && allow.size > 0) {
    console.error("--allow-growth в CI не принимается: рост baseline разрешается меткой PR ratchet-growth.");
    process.exit(1);
  }

  const reports = await Promise.all(APPS.map(runEslint));
  const current = new Map();
  APPS.forEach((app, i) => {
    for (const [rule, n] of Object.entries(count(reports[i]))) current.set(`${rule} ${app}`, n);
  });
  let baseline = readBaseline();

  const baselineGrown = [];
  if (baseRef && !update) {
    const base = readBaseBaseline(baseRef);
    for (const [key, n] of baseline) if (n > (base.get(key) ?? 0)) baselineGrown.push(`${key}: ${base.get(key) ?? 0} -> ${n}`);
    // Без одобрения сверяемся с базой: поднятый в PR baseline не «зеленит» код.
    if (!approved) baseline = base;
  }

  const grown = [];
  const shrunk = [];
  for (const key of new Set([...current.keys(), ...baseline.keys()])) {
    const n = current.get(key) ?? 0;
    const b = baseline.get(key) ?? 0;
    if (n > b) grown.push(`${key}: ${b} -> ${n}`);
    else if (n < b) shrunk.push(`${key}: ${b} -> ${n}`);
  }

  if (update) {
    const bad = grown.filter((g) => !allow.has(g.split(" ")[0]));
    if (baseline.size > 0 && bad.length > 0) {
      console.error(`--update отказался: рост без --allow-growth:\n  ${bad.join("\n  ")}`);
      process.exit(1);
    }
    writeBaseline(current);
    printSummary(current, readBaseline());
    console.log(`\nbaseline записан: ${path.relative(ROOT, BASELINE)}`);
    return;
  }

  printSummary(current, baseline);
  if (shrunk.length > 0) {
    console.log(`\nНарушений стало меньше — понизьте baseline (node scripts/check-front-ratchet.mjs --update):\n  ${shrunk.join("\n  ")}`);
  }
  if (baselineGrown.length > 0) {
    console.error(`\nХРАПОВИК: scripts/frontend-baseline.txt ВЫРОС относительно ${baseRef} (правило/приложение: было -> стало):\n  ${baselineGrown.join("\n  ")}`);
    if (approved) console.error("Рост одобрен (RATCHET_GROWTH_APPROVED=1, метка ratchet-growth) — предупреждение, не ошибка.");
    else {
      console.error("Исправьте код, а не baseline. Осознанный рост — только с меткой PR ratchet-growth и причиной в описании.");
      process.exit(1);
    }
  }
  if (grown.length > 0) {
    console.error(`\nХРАПОВИК: нарушений стало БОЛЬШЕ (правило/приложение: было -> стало):\n  ${grown.join("\n  ")}`);
    console.error("Исправьте новый код. Подробности: npm run lint -- --no-inline-config, docs/ARCHITECTURE-FRONT.md 2.5.");
    process.exit(1);
  }
  console.log("\nХраповик OK: рост нарушений отсутствует.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
