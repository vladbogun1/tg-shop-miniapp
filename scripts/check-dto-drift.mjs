#!/usr/bin/env node
/**
 * Дрифт-чек «Java DTO заказа ↔ TypeScript-типы фронтов» (docs/ARCHITECTURE-CHECKS.md).
 *
 * Эталон — golden-JSON бэкенда (backend/src/test/resources/golden/order/*.json): это настоящий JSON,
 * который отдаёт API, а OrderQueryServiceGoldenTest валит бэкенд при любом его изменении. Скрипт берёт
 * TS-тип через compiler API (с tsconfig соответствующего пакета) и рекурсивно сверяет с JSON:
 *   1. ключ есть в JSON, но нет в типе                      -> тип устарел (поле добавили в DTO);
 *   2. обязательное поле типа не встречается в JSON         -> поле убрали/переименовали в DTO;
 *   3. необязательное поле типа не встречается ни в одном
 *      образце                                              -> тоже ошибка (мёртвое поле или образец не покрывает);
 *   4. вид значения не совпал (null/число/строка/массив...) -> тип врёт про значение.
 * Режим `subset` (минимальные типы e2e): лишние ключи JSON — норма, проверяются только поля типа.
 *
 * Новое/исправленное исключение — в EXCEPTIONS ниже, с причиной. Список может только уменьшаться.
 * Запуск: node scripts/check-dto-drift.mjs  (из корня tg-shop-v2; нужен `npm ci`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN = path.join(ROOT, "backend/src/test/resources/golden/order");

/** Образцы JSON: имя секции (ключ в golden-файле) -> значения из всех файлов. */
function samples(section) {
  const out = [];
  for (const f of fs.readdirSync(GOLDEN).filter((n) => n.endsWith(".json"))) {
    const json = JSON.parse(fs.readFileSync(path.join(GOLDEN, f), "utf8"));
    if (section === "merge-candidates") {
      if (f === "merge-candidates.json") out.push(...json);
    } else if (!Array.isArray(json)) {
      for (const [k, v] of Object.entries(json)) if (k === section || k.startsWith(section + "_")) out.push(v);
    }
  }
  return out;
}

/**
 * Что с чем сверяем. `file` — модуль, откуда экспортируется тип, `pkg` — пакет (его tsconfig).
 * `sections` — секции golden. `mode`: "exact" (по умолчанию) или "subset".
 */
const CHECKS = [
  { pkg: "packages/core", file: "src/types.ts", type: "OrderSummary", sections: ["summary"] },
  // shared-типы — база без админских полей (их добавляют типы фронта админки), поэтому subset:
  // лишние ключи JSON ок, а все поля типа обязаны быть в JSON. Строгая проверка «ключ есть в JSON, но нет
  // в типе» — на админских типах ниже.
  { pkg: "packages/core", file: "src/types.ts", type: "OrderDetail", sections: ["customerDetail", "adminDetail"], mode: "subset" },
  { pkg: "packages/core", file: "src/types.ts", type: "OrderCard", sections: ["card"], mode: "subset" },
  { pkg: "frontend-admin", file: "lib/orders-api.ts", type: "AdminOrderDetail", sections: ["adminDetail"] },
  { pkg: "frontend-admin", file: "lib/orders-api.ts", type: "AdminOrderCard", sections: ["card"] },
  { pkg: "frontend-admin", file: "lib/orders-api.ts", type: "AdminDispatchOrder", sections: ["dispatch"] },
  { pkg: "frontend-admin", file: "lib/orders-api.ts", type: "MergeCandidate", sections: ["merge-candidates"] },
  { pkg: "e2e", file: "lib/api.ts", type: "OrderDetail", sections: ["adminDetail"], mode: "subset" },
];

/**
 * Исключения: "<Тип>:<путь.к.полю>" -> причина. Путь через точку, массивы как `[]`.
 * Пусто = всё сходится. Добавлять только с причиной, список может лишь уменьшаться.
 */
const EXCEPTIONS = {
  // Ключ "*:<путь>" действует для всех типов. Спорные расхождения — не чиним молча, а перечисляем.
  "*:deliveryMethod":
    "golden-заказы без способа доставки отдают null (фикстура; в Order колонка по умолчанию NOVA_POSHTA). " +
    "TS-тип не допускает null — выяснить, бывает ли null на проде, и тогда сделать тип nullable вместе с кодом, который его читает.",
  "*:items[].id":
    "в golden позиции не сохранялись в БД, поэтому id = null (артефакт фикстуры); в API id всегда число.",
  "OrderDetail:items[].currency":
    "OrderItemDto не отдаёт currency, поле в OrderItem мёртвое; frontend/app/account/orders/[id]/page.tsx читает " +
    "it.currency ?? order.currency. Убрать поле и фоллбек одним отдельным коммитом (затрагивает код фронта).",
  "AdminOrderDetail:items[].currency": "то же, что OrderDetail:items[].currency (тип наследует OrderItem).",
};

// ---------------------------------------------------------------------------------------------

const programs = new Map();
function programFor(pkg) {
  if (programs.has(pkg)) return programs.get(pkg);
  const dir = path.join(ROOT, pkg);
  const cfgPath = path.join(dir, "tsconfig.json");
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, dir);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true, incremental: false } });
  const entry = { program, checker: program.getTypeChecker() };
  programs.set(pkg, entry);
  return entry;
}

function findExportedType({ program, checker }, pkg, file, name) {
  const sf = program.getSourceFile(path.join(ROOT, pkg, file));
  if (!sf) throw new Error(`нет файла ${pkg}/${file} в программе`);
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  let sym = checker.getExportsOfModule(moduleSymbol).find((s) => s.name === name);
  if (!sym) throw new Error(`${pkg}/${file} не экспортирует ${name}`);
  if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  return checker.getDeclaredTypeOfSymbol(sym);
}

const kindOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const join = (p, k) => (p ? `${p}.${k}` : k);

class Comparer {
  constructor(checker, typeName, mode) {
    this.checker = checker;
    this.typeName = typeName;
    this.subset = mode === "subset";
    this.errors = [];
    this.usedExceptions = new Set();
  }

  err(p, msg) {
    const key = `${this.typeName}:${p}`;
    const hit = [key, `*:${p}`].find((k) => k in EXCEPTIONS);
    if (hit) {
      this.usedExceptions.add(hit);
      return;
    }
    this.errors.push(`${key} — ${msg}`);
  }

  parts(type) {
    return type.isUnion() ? type.types : [type];
  }

  /** Подходит ли вид значения какому-то из членов union типа. */
  acceptsKind(type, kind) {
    for (const t of this.parts(type)) {
      const f = t.flags;
      if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) return true;
      if (kind === "null" && f & ts.TypeFlags.Null) return true;
      if (kind === "number" && f & ts.TypeFlags.NumberLike) return true;
      if (kind === "string" && f & ts.TypeFlags.StringLike) return true;
      if (kind === "boolean" && f & ts.TypeFlags.BooleanLike) return true;
      if ((kind === "array" || kind === "object") && f & (ts.TypeFlags.Object | ts.TypeFlags.Intersection | ts.TypeFlags.NonPrimitive)) return true;
    }
    return false;
  }

  compare(type, values, p) {
    const c = this.checker;
    const present = values.filter((v) => v !== undefined);
    if (!present.length) return;
    for (const k of new Set(present.map(kindOf))) {
      if (!this.acceptsKind(type, k)) {
        this.err(p || "(root)", `JSON отдаёт ${k}, а тип ${c.typeToString(type)} его не допускает`);
      }
    }
    const nonNull = c.getNonNullableType(type);
    const objs = present.filter((v) => kindOf(v) === "object");
    const arrs = present.filter((v) => kindOf(v) === "array");
    if (arrs.length) {
      const arrayTypes = this.parts(nonNull).filter((t) => c.isArrayType(t));
      if (arrayTypes.length) this.compare(c.getTypeArguments(arrayTypes[0])[0], arrs.flat(), `${p}[]`);
    }
    if (objs.length) this.compareObjects(nonNull, objs, p);
  }

  compareObjects(type, objs, p) {
    const c = this.checker;
    const members = this.parts(type).filter((t) => t.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection));
    if (!members.length) return;
    const props = new Map();
    let indexType = null; // Record<string, X>: значения сверяем с X, ключи не перечисляем
    for (const m of members) {
      for (const s of c.getPropertiesOfType(m)) if (!props.has(s.name)) props.set(s.name, s);
      const idx = c.getIndexTypeOfType(m, ts.IndexKind.String);
      if (idx) indexType = idx;
    }
    const jsonKeys = new Set(objs.flatMap((o) => Object.keys(o)));
    for (const key of jsonKeys) {
      const vals = objs.map((o) => o[key]);
      const sym = props.get(key);
      if (!sym) {
        if (indexType) this.compare(indexType, vals, join(p, key));
        else if (!this.subset) this.err(join(p, key), "поле есть в JSON, но нет в TS-типе (тип устарел)");
        continue;
      }
      const propType = c.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration ?? sym.declarations[0]);
      this.compare(propType, vals, join(p, key));
    }
    for (const [name, sym] of props) {
      if (jsonKeys.has(name)) continue;
      const optional = !!(sym.flags & ts.SymbolFlags.Optional);
      this.err(
        join(p, name),
        optional
          ? "необязательное поле типа не встречается ни в одном образце JSON (убрано из DTO или образец не покрывает)"
          : "обязательное поле типа отсутствует в JSON (убрано/переименовано в DTO)",
      );
    }
  }
}

let failed = 0;
const usedAll = new Set();
for (const chk of CHECKS) {
  const label = `${chk.pkg}/${chk.file} ${chk.type} <- ${chk.sections.join("+")}`;
  const values = chk.sections.flatMap(samples);
  if (!values.length) {
    console.error(`FAIL ${label}: в golden нет образцов секции`);
    failed++;
    continue;
  }
  const prog = programFor(chk.pkg);
  const type = findExportedType(prog, chk.pkg, chk.file, chk.type);
  const cmp = new Comparer(prog.checker, chk.type, chk.mode);
  cmp.compare(type, values, "");
  cmp.usedExceptions.forEach((k) => usedAll.add(k));
  if (cmp.errors.length) {
    failed += cmp.errors.length;
    console.error(`FAIL ${label} (${values.length} образцов)`);
    cmp.errors.forEach((e) => console.error(`  - ${e}`));
  } else console.log(`ok   ${label} (${values.length} образцов)`);
}
for (const k of Object.keys(EXCEPTIONS)) {
  if (!usedAll.has(k)) {
    console.error(`FAIL исключение «${k}» больше не нужно — удалите его из EXCEPTIONS`);
    failed++;
  }
}
if (failed) {
  console.error(`\nДрифт DTO↔TS: ${failed} проблем(ы). См. docs/ARCHITECTURE-CHECKS.md.`);
  process.exit(1);
}
