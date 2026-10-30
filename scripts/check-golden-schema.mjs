#!/usr/bin/env node
/**
 * «Настоящий JSON заказа ↔ схемы OpenAPI» (замена check-dto-drift.mjs, docs/ARCHITECTURE-FRONT.md 2.6.5).
 *
 * Типы фронтов теперь генерируются из openapi.json (npm run gen:api), поэтому сверять надо не TS, а саму схему:
 * golden-JSON бэкенда (backend/src/test/resources/golden/order/*.json — настоящие ответы, их охраняет
 * OrderQueryServiceGoldenTest) обходится по схеме из openapi.json. Ошибка, если
 *   1. в JSON ключ, которого нет в схеме                         -> схема устарела;
 *   2. обязательного поля схемы нет в JSON                       -> поле убрали, а схема говорит «есть»;
 *   3. null в поле, не помеченном nullable                       -> тип врёт фронту (нужен @Nullable в DTO);
 *   4. вид значения не совпал (строка/число/массив/объект).
 * Запуск: node scripts/check-golden-schema.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN = path.join(ROOT, "backend/src/test/resources/golden/order");
const API = JSON.parse(fs.readFileSync(path.join(ROOT, "backend/src/test/resources/openapi/openapi.json"), "utf8"));
const SCHEMAS = API.components.schemas;

/** Секция golden -> схема. */
const SECTIONS = {
  customerDetail: "OrderDetailDto",
  adminDetail: "OrderDetailDto",
  card: "OrderCardDto",
  summary: "OrderSummaryDto",
  dispatch: "DispatchOrderDto",
  "merge-candidates": "MergeCandidateDto",
};

const problems = [];
const seen = new Set();

function resolve(schema) {
  if (schema?.$ref) return resolve(SCHEMAS[schema.$ref.split("/").pop()]);
  if (schema?.allOf?.length === 1) return resolve(schema.allOf[0]);
  return schema;
}

function kindOk(schema, v) {
  switch (schema.type) {
    case "string":
      return typeof v === "string";
    case "integer":
    case "number":
      return typeof v === "number";
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v);
    case "object":
      return v !== null && typeof v === "object" && !Array.isArray(v);
    default:
      return true;
  }
}

function check(schemaIn, v, where) {
  const nullable = !!(schemaIn?.nullable || resolve(schemaIn)?.nullable);
  const schema = resolve(schemaIn);
  if (v === null) {
    if (!nullable) problems.push(`${where}: null, но схема не nullable`);
    return;
  }
  if (!schema || Object.keys(schema).length === 0) return;
  if (schema.enum && !schema.enum.includes(v)) problems.push(`${where}: значение ${JSON.stringify(v)} не из enum`);
  if (!kindOk(schema, v)) {
    problems.push(`${where}: вид значения ${Array.isArray(v) ? "array" : typeof v} не совпал со схемой (${schema.type})`);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => check(schema.items, x, `${where}[]`));
    return;
  }
  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const k of Object.keys(v)) {
      if (!(k in schema.properties)) problems.push(`${where}.${k}: ключа нет в схеме`);
      else seen.add(`${where.split(".")[0]}.${where.split(".").slice(1).join(".")}.${k}`);
    }
    for (const [k, p] of Object.entries(schema.properties)) {
      if (!(k in v)) {
        if (required.has(k)) problems.push(`${where}.${k}: обязательное поле схемы отсутствует в JSON`);
      } else check(p, v[k], `${where}.${k}`);
    }
  } else if (schema.type === "object" && schema.additionalProperties && typeof schema.additionalProperties === "object") {
    for (const [k, x] of Object.entries(v)) check(schema.additionalProperties, x, `${where}.${k}`);
  }
}

let samples = 0;
for (const f of fs.readdirSync(GOLDEN).filter((n) => n.endsWith(".json"))) {
  const json = JSON.parse(fs.readFileSync(path.join(GOLDEN, f), "utf8"));
  if (Array.isArray(json)) {
    json.forEach((x) => (samples++, check({ $ref: `#/components/schemas/${SECTIONS["merge-candidates"]}` }, x, `${f}:MergeCandidateDto`)));
    continue;
  }
  for (const [k, v] of Object.entries(json)) {
    const section = Object.keys(SECTIONS).find((s) => k === s || k.startsWith(s + "_"));
    if (!section) {
      problems.push(`${f}: неизвестная секция ${k}`);
      continue;
    }
    samples++;
    check({ $ref: `#/components/schemas/${SECTIONS[section]}` }, v, `${f}:${k}`);
  }
}

if (problems.length) {
  console.error(`check-golden-schema: ${problems.length} расхождений golden-JSON и openapi.json:`);
  for (const p of [...new Set(problems)].sort().slice(0, 80)) console.error("  " + p);
  process.exit(1);
}
console.log(`check-golden-schema: ${samples} образцов заказа сходятся со схемами OpenAPI`);
