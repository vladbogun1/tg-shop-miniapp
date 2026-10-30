#!/usr/bin/env node
/**
 * Бюджет бандла (docs/ARCHITECTURE-FRONT.md, 2.7.7): First Load JS каждого маршрута Mini App и сайта.
 *
 * После `next build` читает `.next/app-build-manifest.json`: для маршрута `/x/page` берёт все JS-чанки страницы и
 * её layout-ов (`/layout`, `/x/layout`), считает сумму gzip-размеров уникальных файлов — то же, что печатает Next
 * в колонке «First Load JS». Сравнивает с `scripts/bundle-baseline.txt` (`<приложение> <маршрут> <байт>`).
 *   - маршрут вырос больше чем на 3 %  -> exit 1 (защита производительности на iOS);
 *   - маршрут уменьшился более чем на 3 % -> подсказка понизить baseline;
 *   - маршрут без baseline (новый)       -> сообщение, не падение: добавьте его `--update`.
 *
 *   node scripts/check-bundle.mjs             проверка (после `npm run build`)
 *   node scripts/check-bundle.mjs --update    записать baseline по текущей сборке (только для осознанного изменения)
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "scripts/bundle-baseline.txt");
const APPS = ["frontend", "site"];
const TOLERANCE = 0.03;

function routeSizes(app) {
  const next = path.join(ROOT, app, ".next");
  const manifestFile = path.join(next, "app-build-manifest.json");
  if (!fs.existsSync(manifestFile)) throw new Error(`${app}: нет ${path.relative(ROOT, manifestFile)} — сначала npm run build -w ${app}`);
  const pages = JSON.parse(fs.readFileSync(manifestFile, "utf8")).pages;
  const gzip = new Map();
  const size = (file) => {
    if (!gzip.has(file)) gzip.set(file, zlib.gzipSync(fs.readFileSync(path.join(next, file)), { level: 9 }).length);
    return gzip.get(file);
  };
  const result = new Map();
  for (const key of Object.keys(pages)) {
    if (!key.endsWith("/page")) continue;
    const route = key.slice(0, -"/page".length) || "/";
    const segments = route.split("/").filter(Boolean);
    const layouts = ["/layout", ...segments.map((_, i) => `/${segments.slice(0, i + 1).join("/")}/layout`)];
    const files = new Set([...pages[key], ...layouts.flatMap((l) => pages[l] ?? [])].filter((f) => f.endsWith(".js")));
    result.set(route, [...files].reduce((sum, f) => sum + size(f), 0));
  }
  return result;
}

function readBaseline() {
  const map = new Map();
  if (!fs.existsSync(BASELINE)) return map;
  for (const raw of fs.readFileSync(BASELINE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [app, route, bytes] = line.split(/\s+/);
    map.set(`${app} ${route}`, Number(bytes));
  }
  return map;
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

function main() {
  const update = process.argv.includes("--update");
  const current = new Map();
  for (const app of APPS) for (const [route, bytes] of routeSizes(app)) current.set(`${app} ${route}`, bytes);

  if (update) {
    const lines = [...current].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${v}`);
    fs.writeFileSync(
      BASELINE,
      ["# First Load JS (gzip, байт) по маршрутам: <приложение> <маршрут> <байт>. Рост > 3 % валит CI (scripts/check-bundle.mjs).", ...lines].join("\n") + "\n",
    );
    console.log(`bundle baseline записан: ${lines.length} маршрутов`);
    return;
  }

  const baseline = readBaseline();
  const grown = [];
  const shrunk = [];
  const fresh = [];
  console.log("Бюджет бандла: First Load JS (gzip) по маршрутам, допуск +3 %");
  for (const [key, bytes] of [...current].sort(([a], [b]) => a.localeCompare(b))) {
    const base = baseline.get(key);
    if (base === undefined) {
      fresh.push(key);
      console.log(`  ${key.padEnd(52)} ${kb(bytes).padStart(10)}  (нет в baseline)`);
      continue;
    }
    const delta = ((bytes - base) / base) * 100;
    console.log(`  ${key.padEnd(52)} ${kb(bytes).padStart(10)}  baseline ${kb(base).padStart(9)}  ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} %`);
    if (bytes > base * (1 + TOLERANCE)) grown.push(`${key}: ${kb(base)} -> ${kb(bytes)} (+${delta.toFixed(1)} %)`);
    else if (bytes < base * (1 - TOLERANCE)) shrunk.push(`${key}: ${kb(base)} -> ${kb(bytes)}`);
  }
  for (const key of baseline.keys()) if (!current.has(key)) console.log(`  ${key}: маршрута больше нет — уберите из baseline (--update)`);
  if (fresh.length > 0) console.log(`\nНовые маршруты без бюджета (добавьте: node scripts/check-bundle.mjs --update): ${fresh.join(", ")}`);
  if (shrunk.length > 0) console.log(`\nБандл уменьшился — понизьте baseline (--update):\n  ${shrunk.join("\n  ")}`);
  if (grown.length > 0) {
    console.error(`\nБАНДЛ вырос больше чем на 3 %:\n  ${grown.join("\n  ")}`);
    process.exit(1);
  }
  console.log("\nБюджет бандла OK.");
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
