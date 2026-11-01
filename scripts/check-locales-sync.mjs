#!/usr/bin/env node
/**
 * Список языков должен быть один. Источник на фронтах — `LOCALES` в `packages/core/src/i18n.ts`; на бэкенде —
 * enum `AppLocale`. Часть мест не может импортировать список (matcher в `middleware`, `next.config.ts`,
 * nginx-конфиг шлюза) — их эта проверка сверяет с источником. Входит в `npm run arch:front` (CI). Без сборки.
 *
 *   node scripts/check-locales-sync.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const key = (codes) => [...new Set(codes)].sort().join(",");
const problems = [];

const source = [...read("packages/core/src/i18n.ts").match(/LOCALES = \[([^\]]+)\] as const/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
const fallback = read("packages/core/src/i18n.ts").match(/FALLBACK_LOCALE: Locale = "(\w+)"/)[1];
if (source.length === 0) throw new Error("check-locales-sync: не разобрал LOCALES");
const want = key(source);

// 1. Бэкенд: enum AppLocale.
const java = read("backend/src/main/java/com/maxsolch/shop/platform/i18n/AppLocale.java");
const javaCodes = [...java.matchAll(/^\s+[A-Z]{2}\("(\w+)"\)/gm)].map((m) => m[1]);
if (key(javaCodes) !== want) problems.push(`AppLocale.java: ${key(javaCodes)} ≠ LOCALES: ${want}`);
const javaDefault = java.match(/DEFAULT = (\w+);/)[1].toLowerCase();
if (javaDefault !== fallback) problems.push(`AppLocale.DEFAULT=${javaDefault} ≠ FALLBACK_LOCALE=${fallback}`);

// 2. Файлы с регэкспами вида (?:uk|ru|en): каждая альтернация из кодов языков = список.
for (const f of ["site/next.config.ts", "infra/gateway-site.conf"]) {
  const groups = [...read(f).matchAll(/\((?:\?:)?([a-z]{2}(?:\|[a-z]{2})+)\)/g)].map((m) => m[1].split("|"));
  if (groups.length === 0) problems.push(`${f}: не нашёл ни одного списка языков (проверка устарела?)`);
  for (const g of groups) if (key(g) !== want) problems.push(`${f}: список «${g.join("|")}» ≠ LOCALES: ${want}`);
}

// 3. matcher в middleware: путь на каждый язык (кроме тех, что без префикса — fallback обслуживает uk-редирект).
const mw = read("site/middleware.ts");
const matcher = mw.slice(mw.indexOf("matcher:"));
const prefixes = [...matcher.matchAll(/"\/([a-z]{2})(?=[/:"])/g)].map((m) => m[1]);
if (key(prefixes) !== want) problems.push(`site/middleware.ts matcher: ${key(prefixes)} ≠ LOCALES: ${want}`);
// Регэксп про регистр slug-а перечисляет только языки С префиксом (у fallback его нет).
const prefixedKey = key(source.filter((l) => l !== fallback));
for (const m of mw.matchAll(/\(\?:([a-z]{2}(?:\|[a-z]{2})+)\)/g)) {
  if (key(m[1].split("|")) !== prefixedKey) problems.push(`site/middleware.ts: регэксп «${m[1]}» ≠ языки с префиксом: ${prefixedKey}`);
}

if (problems.length > 0) {
  console.error("check-locales-sync: списки языков разошлись:\n" + problems.map((p) => "  - " + p).join("\n"));
  console.error(`Источник: packages/core/src/i18n.ts → LOCALES = [${source.join(", ")}] (и AppLocale.java).`);
  process.exit(1);
}
console.log(`check-locales-sync OK (${source.join(", ")})`);
