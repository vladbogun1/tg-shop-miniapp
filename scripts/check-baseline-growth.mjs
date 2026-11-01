#!/usr/bin/env node
/**
 * Рост остальных baseline-файлов относительно базовой ветки PR (аудит 2026-11, P2-19).
 * Храповики сравнивают код с baseline из ТОГО ЖЕ коммита, поэтому строку в baseline можно вписать «чтобы позеленело».
 * Здесь baseline берётся из базовой ветки: записей стало больше (или у правила вырос счётчик) -> exit 1.
 * Исключение — явный RATCHET_GROWTH_APPROVED=1 (в CI: метка PR `ratchet-growth`). ESLint-baseline проверяет сам
 * check-front-ratchet.mjs (--base-ref); бандл-бюджет допускает рост ≤ 3 % по своим правилам и сюда не входит.
 *
 * Использование: node scripts/check-baseline-growth.mjs <base-ref>   (например origin/master)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseRef = process.argv[2];
if (!baseRef) {
  console.error("Нужна базовая ссылка: node scripts/check-baseline-growth.mjs origin/<base>");
  process.exit(1);
}

/** `<правило> <модуль> <число>` -> Map; строки без числа считаем за 1 (на всякий случай). */
function parseCounts(text) {
  const map = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const n = Number(parts[parts.length - 1]);
    const key = Number.isFinite(n) ? parts.slice(0, -1).join(" ") : line;
    map.set(key, Number.isFinite(n) ? n : 1);
  }
  return map;
}

/** known-violations.json (depcruise): запись = нарушение; ключ — from|to|rule. */
function parseViolations(text) {
  const map = new Map();
  for (const v of text.trim() ? JSON.parse(text) : []) map.set(`${v.from} -> ${v.to} [${v.rule?.name}]`, 1);
  return map;
}

const FILES = [
  { rel: "known-violations.json", parse: parseViolations },
  { rel: "backend/src/test/resources/architecture/v2-baseline.txt", parse: parseCounts },
];

if (spawnSync("git", ["rev-parse", "--verify", "-q", baseRef], { cwd: ROOT }).status !== 0) {
  console.error(`Не найдена ссылка ${baseRef} (нужен fetch базовой ветки).`);
  process.exit(1);
}

const grown = [];
for (const { rel, parse } of FILES) {
  const cur = fs.existsSync(path.join(ROOT, rel)) ? parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) : new Map();
  const r = spawnSync("git", ["show", `${baseRef}:${rel}`], { cwd: ROOT, encoding: "utf8" });
  const base = r.status === 0 ? parse(r.stdout) : new Map();
  for (const [key, n] of cur) if (n > (base.get(key) ?? 0)) grown.push(`${rel}: ${key}: ${base.get(key) ?? 0} -> ${n}`);
}

if (grown.length === 0) {
  console.log(`Baseline-файлы не выросли относительно ${baseRef}.`);
} else if (process.env.RATCHET_GROWTH_APPROVED === "1") {
  console.log(`Рост baseline одобрен (метка ratchet-growth):\n  ${grown.join("\n  ")}`);
} else {
  console.error(`BASELINE ВЫРОС относительно ${baseRef}:\n  ${grown.join("\n  ")}`);
  console.error("Исправьте код, а не baseline. Осознанный рост — только с меткой PR ratchet-growth и причиной в описании.");
  process.exit(1);
}
