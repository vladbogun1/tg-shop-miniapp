#!/usr/bin/env node
/**
 * Проверка словарей интерфейса покупателя (Mini App `frontend/i18n`, сайт `site/i18n`, общие тексты
 * `packages/customer/src/i18n`). Входит в `npm run arch:front` (CI). Без сборки.
 *
 *  1. Полнота: у каждого приложения ключи uk и en = ключи ru (ни пропусков, ни лишних), значения не пустые,
 *     фраза остаётся фразой, а плюрал — плюралом (формы `other` обязательна).
 *  2. Плейсхолдеры `{name}` одинаковы во всех трёх языках (для плюралов — по объединению форм).
 *  3. Алфавит: в en нет кириллицы, в uk нет ы/э/ъ/ё.
 *  4. Общий словарь: ключ общего словаря не переопределён приложением (спред молча перебил бы его);
 *     ключ, у которого в ОБОИХ приложениях одинаковый текст на всех языках, обязан жить в общем словаре.
 *  5. Сироты: ключ, на который нет ни литерала, ни шаблона `префикс.${…}` в коде (frontend, site, packages).
 *  6. Литералы ключей: `t("…")` в `packages/customer` (где тип ключа свободный, `LooseT`) обязан существовать
 *     в ОБОИХ приложениях; шаблон `t(\`префикс.${x}\`)` — иметь хотя бы один ключ с таким префиксом.
 *  7. Хардкод кириллицы в коде покупателя считает ESLint-правило `cyrillic-literal` (храповик
 *     `scripts/frontend-baseline.txt`); здесь печатается текущее число, чтобы оно было видно рядом.
 *
 *   node scripts/check-i18n.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const ts = require("typescript");

const LANGS = ["ru", "uk", "en"];
const APPS = { frontend: "Mini App", site: "сайт" };
const SHARED_DIR = "packages/customer/src/i18n";
const problems = [];
const fail = (msg) => problems.push(msg);

// ---- загрузка словарей (TS → CJS на лету, без зависимости от флагов Node) ---------------------------
const cache = new Map();
function loadTs(file) {
  const abs = path.resolve(ROOT, file);
  if (cache.has(abs)) return cache.get(abs);
  const out = ts.transpileModule(fs.readFileSync(abs, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod.exports);
  const req = (spec) => {
    const m = /^@shop\/customer\/i18n\/(shared-(?:ru|uk|en))$/.exec(spec);
    if (m) return loadTs(`${SHARED_DIR}/${m[1]}.ts`);
    throw new Error(`check-i18n: неожиданный импорт «${spec}» в ${file}`);
  };
  new Function("exports", "module", "require", out)(mod.exports, mod, req);
  return mod.exports;
}

/** Ключи, объявленные в самом файле словаря (без спреда общих). */
function ownKeys(file, varName) {
  const sf = ts.createSourceFile(file, fs.readFileSync(path.resolve(ROOT, file), "utf8"), ts.ScriptTarget.ES2022, true);
  const keys = [];
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.text === varName) {
      let e = n.initializer;
      while (e && !ts.isObjectLiteralExpression(e)) e = e.expression;
      for (const p of e?.properties ?? []) if (ts.isPropertyAssignment(p)) keys.push(p.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return keys;
}

const shared = {};
const own = {};
const dicts = {};
for (const l of LANGS) {
  const name = `shared${l[0].toUpperCase()}${l[1]}`;
  shared[l] = loadTs(`${SHARED_DIR}/shared-${l}.ts`)[name];
  for (const app of Object.keys(APPS)) {
    dicts[`${app}/${l}`] = loadTs(`${app}/i18n/${l}.ts`)[l];
    own[`${app}/${l}`] = ownKeys(`${app}/i18n/${l}.ts`, l);
  }
}

const forms = (v) => (typeof v === "string" ? [v] : Object.values(v));
const placeholders = (v) => [...new Set(forms(v).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort().join(",");

// ---- 1–3: полнота, плейсхолдеры, алфавит ---------------------------------------------------------------
function checkSet(label, byLang) {
  const ruKeys = Object.keys(byLang.ru);
  for (const l of ["uk", "en"]) {
    for (const k of ruKeys) if (!(k in byLang[l])) fail(`${label}: в ${l} нет ключа «${k}»`);
    for (const k of Object.keys(byLang[l])) if (!(k in byLang.ru)) fail(`${label}: в ${l} лишний ключ «${k}»`);
  }
  for (const k of ruKeys) {
    for (const l of LANGS) {
      const v = byLang[l][k];
      if (v === undefined) continue;
      if (typeof v !== typeof byLang.ru[k]) fail(`${label}/${l}: «${k}» — разный тип значения (фраза/плюрал)`);
      if (typeof v !== "string" && typeof v.other !== "string") fail(`${label}/${l}: у плюрала «${k}» нет формы other`);
      for (const s of forms(v)) {
        if (!String(s).trim()) fail(`${label}/${l}: пустое значение «${k}»`);
        if (l === "en" && /[А-Яа-яЁёІіЇїЄєҐґ]/.test(s)) fail(`${label}/en: кириллица в «${k}»`);
        if (l === "uk" && /[ыэъёЫЭЪЁ]/.test(s)) fail(`${label}/uk: русские буквы в «${k}»`);
      }
      if (byLang.ru[k] !== undefined && placeholders(v) !== placeholders(byLang.ru[k])) {
        fail(`${label}/${l}: плейсхолдеры «${k}» отличаются от ru ({${placeholders(byLang.ru[k])}} / {${placeholders(v)}})`);
      }
    }
  }
}
checkSet("общий словарь", shared);
for (const app of Object.keys(APPS)) {
  checkSet(app, { ru: dicts[`${app}/ru`], uk: dicts[`${app}/uk`], en: dicts[`${app}/en`] });
}

// ---- 4: общий словарь и дубли ----------------------------------------------------------------------------
for (const app of Object.keys(APPS)) {
  for (const l of LANGS) {
    for (const k of own[`${app}/${l}`]) if (k in shared[l]) fail(`${app}/${l}: «${k}» уже есть в общем словаре — приложение молча перебьёт его`);
  }
}
const sameBoth = Object.keys(dicts["frontend/ru"]).filter(
  (k) =>
    own["frontend/ru"].includes(k) &&
    own["site/ru"].includes(k) &&
    LANGS.every((l) => JSON.stringify(dicts[`frontend/${l}`][k]) === JSON.stringify(dicts[`site/${l}`][k])),
);
for (const k of sameBoth) fail(`«${k}»: одинаковый текст в Mini App и на сайте на всех языках — перенеси в ${SHARED_DIR}/shared-{ru,uk,en}.ts`);

// ---- 5–6: использование ключей ---------------------------------------------------------------------------
function* walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!["node_modules", ".next", ".e2e-site", ".e2e-miniapp", "i18n"].includes(e.name)) yield* walk(rel);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) yield rel;
  }
}
const KEY_LIT = /(["'`])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)\1/g;
const TEMPLATE_PREFIX = /`([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)*\.)\$\{/g;
const CONCAT_PREFIX = /(["'])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)*\.)\1\s*\+/g;
const T_CALL = /\bt\(\s*(["'])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)\1/g;
const T_TEMPLATE_CALL = /\bt\(\s*`([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)*\.)\$\{/g;

/** Комментарии → пробелы (номера строк сохраняются), чтобы примеры `t("…")` в доках не считались вызовами. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/.*$/gm, "$1");

const usage = { literals: new Set(), prefixes: new Set() };
const pkgCalls = []; // [file, line, key|prefix, kind]
for (const dir of ["frontend", "site", "packages/customer/src", "packages/ui/src", "packages/core/src"]) {
  for (const file of walk(dir)) {
    const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
    const src = stripComments(raw);
    for (const m of src.matchAll(KEY_LIT)) usage.literals.add(m[2]);
    for (const m of src.matchAll(TEMPLATE_PREFIX)) usage.prefixes.add(m[1]);
    for (const m of src.matchAll(CONCAT_PREFIX)) usage.prefixes.add(m[2]);
    if (file.startsWith("packages/")) {
      for (const [re, kind] of [[T_CALL, "key"], [T_TEMPLATE_CALL, "prefix"]]) {
        for (const m of src.matchAll(re)) {
          const line = src.slice(0, m.index).split("\n").length;
          pkgCalls.push([file, line, m[kind === "key" ? 2 : 1], kind]);
        }
      }
    }
  }
}
const used = (k) => usage.literals.has(k) || [...usage.prefixes].some((p) => k.startsWith(p));

const orphans = [];
const sharedKeys = Object.keys(shared.ru);
for (const k of sharedKeys) if (!used(k)) orphans.push(`общий:${k}`);
for (const app of Object.keys(APPS)) {
  for (const k of own[`${app}/ru`]) if (!used(k)) orphans.push(`${app}:${k}`);
}
// Известные сироты: отложены (текст не удаляем в шаге 5e — это решение владельца контента). Список только уменьшается.
const ORPHAN_BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/i18n-orphans-baseline.json"), "utf8"));
const knownOrphans = new Set(ORPHAN_BASELINE);
for (const o of orphans) if (!knownOrphans.has(o)) fail(`сирота: ключ «${o}» нигде не используется (удали или добавь в scripts/i18n-orphans-baseline.json с причиной в коммите)`);
const fixed = ORPHAN_BASELINE.filter((o) => !orphans.includes(o));
if (fixed.length > 0 && !process.argv.includes("--update-orphans")) {
  fail(`сироты из baseline больше не сироты (${fixed.length}): ${fixed.slice(0, 5).join(", ")}… — запусти --update-orphans`);
}
if (process.argv.includes("--update-orphans")) {
  fs.writeFileSync(path.join(ROOT, "scripts/i18n-orphans-baseline.json"), JSON.stringify(orphans.sort(), null, 1) + "\n");
  console.log(`i18n-orphans-baseline.json обновлён: ${orphans.length}`);
  process.exit(0);
}

const bothApps = (pred) => Object.keys(APPS).every((app) => pred(Object.keys(dicts[`${app}/ru`])));
for (const [file, line, key, kind] of pkgCalls) {
  const ok = kind === "key" ? bothApps((keys) => keys.includes(key)) : bothApps((keys) => keys.some((k) => k.startsWith(key)));
  if (!ok) fail(`${file}:${line}: t(${kind === "key" ? `"${key}"` : `\`${key}\${…}\``}) — ${kind === "key" ? "нет ключа" : "нет ключей с префиксом"} в одном из приложений`);
}
// Шаблонные ключи в приложениях: тип `MessageKey` через `as` не проверяется компилятором — проверяем префикс.
for (const app of Object.keys(APPS)) {
  const keys = Object.keys(dicts[`${app}/ru`]);
  for (const file of [...walk(app), ...walk("packages/customer/src")]) {
    if (file.startsWith("packages/") && app === "site") continue; // пакет проверен выше для обоих
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of src.matchAll(/`([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)*\.)\$\{[^`]*`\s*as MessageKey/g)) {
      if (!keys.some((k) => k.startsWith(m[1]))) fail(`${file}: шаблон \`${m[1]}\${…}\` — нет ключей с таким префиксом в ${app}`);
    }
  }
}

// ---- 7: хардкод (справочно) ------------------------------------------------------------------------------------
const baseline = fs.readFileSync(path.join(ROOT, "scripts/frontend-baseline.txt"), "utf8");
const cyr = Object.fromEntries(
  [...baseline.matchAll(/^cyrillic-literal (\S+) (\d+)$/gm)].map((m) => [m[1], Number(m[2])]),
);

// ---- итог ---------------------------------------------------------------------------------------------------------------
const count = (o) => Object.keys(o).length;
console.log("i18n: ключи");
console.log(`  общий словарь:  ${count(shared.ru)} (на каждом языке)`);
for (const app of Object.keys(APPS)) {
  console.log(`  ${APPS[app].padEnd(14)}: своих ${own[`${app}/ru`].length}, всего ${count(dicts[`${app}/ru`])}`);
}
console.log(`  сирот (известных, в baseline): ${orphans.length}; хардкод кириллицы (храповик cyrillic-literal): Mini App ${cyr.frontend ?? 0}, сайт ${cyr.site ?? 0}`);

if (problems.length > 0) {
  console.error(`\ni18n УПАЛ (${problems.length}):\n  ` + problems.slice(0, 80).join("\n  "));
  process.exit(1);
}
console.log("i18n OK");
