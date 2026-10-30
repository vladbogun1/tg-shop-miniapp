#!/usr/bin/env node
/**
 * Инварианты «не убирать» (docs/ARCHITECTURE-FRONT.md, 2.7.4). Быстрая проверка без сборки:
 *  1. CHUNK_RECOVERY_SCRIPT — первым элементом в <head> обоих корневых layout (Mini App и сайт);
 *  2. покупательские nginx-конфиги (infra/gateway.conf, gateway-site.conf) отдают HTML с `no-cache`;
 *  3. в коде фронтов (frontend, site, shared) нет lookbehind `(?<=` / `(?<!` (iOS Safari < 16.4);
 *     серверные файлы-исключения перечислены ниже и должны оставаться серверными.
 *
 *   node scripts/check-invariants.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 1. CHUNK_RECOVERY_SCRIPT первым в <head>
for (const layout of ["frontend/app/layout.tsx", "site/app/[locale]/layout.tsx"]) {
  const src = read(layout);
  const head = src.search(/^[ \t]*<head>[ \t]*\r?$/m); // тег на своей строке (в комментариях <head> тоже встречается)
  if (head < 0) {
    problems.push(`${layout}: нет <head>`);
    continue;
  }
  const afterHead = src
    .slice(head)
    .replace(/^[ \t]*<head>/, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX-комментарии
    .trimStart();
  if (!/^<script[^>]*CHUNK_RECOVERY_SCRIPT/.test(afterHead)) {
    problems.push(`${layout}: первым элементом <head> должен быть <script … CHUNK_RECOVERY_SCRIPT … />`);
  }
}

// 2. no-cache для HTML в конфигах шлюза покупательских приложений
for (const conf of ["infra/gateway.conf", "infra/gateway-site.conf"]) {
  if (!/text\/html\s+"no-cache"/.test(read(conf))) {
    problems.push(`${conf}: нет правила «~*text/html "no-cache"» (HTML должен ревалидироваться)`);
  }
}

// 3. lookbehind в исходниках фронтов (комментарии и строки-пояснения пропускаем)
const SERVER_ONLY = new Set(["site/lib/feeds.ts"]); // XML-фиды рендерит сервер, в браузер файл не попадает
const LOOKBEHIND = /\(\?<[=!]/;
function* walk(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!["node_modules", ".next"].includes(entry.name)) yield* walk(rel);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) yield rel;
  }
}
for (const dir of ["frontend", "site", "shared"]) {
  for (const file of walk(dir)) {
    if (SERVER_ONLY.has(file)) continue;
    read(file)
      .split(/\r?\n/)
      .forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
        if (LOOKBEHIND.test(line)) problems.push(`${file}:${i + 1}: lookbehind в регулярке (docs/BROWSER-SUPPORT.md)`);
      });
  }
}

if (problems.length > 0) {
  console.error("ИНВАРИАНТЫ нарушены:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("Инварианты OK: CHUNK_RECOVERY_SCRIPT первым в <head> (Mini App, сайт), no-cache для HTML, нет lookbehind.");
