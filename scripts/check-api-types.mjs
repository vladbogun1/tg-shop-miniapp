#!/usr/bin/env node
/**
 * «Ответы API — только из OpenAPI» для пилотных модулей order и catalog
 * (docs/ARCHITECTURE-FRONT.md 2.6, шаг 3).
 *
 * Типы ответов сгенерированы в packages/core/src/api/generated.d.ts; во фронтах они подключаются алиасом
 * `export type X = Schemas["XDto"]`. Ручной `interface X {...}` / `type X = {...}` с именем из списка ниже
 * вернул бы тип, который снова может разойтись с бэкендом, поэтому он запрещён. Разрешено: алиасы на Schemas,
 * view-модели (в model/ или с другим именем), тела запросов (*Body, *Request, *Write, *Patch).
 * Дополнительно в frontend-admin/lib/orders-api.ts любой `export interface` должен быть телом запроса или
 * явно разрешённым не-ответом.
 * Запуск: node scripts/check-api-types.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Имена ответов API пилотных модулей: объявлять их руками нельзя. */
const GENERATED_ONLY = new Set([
  // order
  "OrderItem", "OnlinePayment", "CreateOrderResult", "OrderSummary", "OrderLimits", "OrderDetail", "OrderCard",
  "Message", "Conversation", "AdminOrderDetail", "OrderMovement", "OrderWriteoff", "OrderAdminExtras",
  "MergeCandidate", "ReturnRecord", "ReturnRecordLine", "AdminOrderCard", "CardLine", "OrderExchange",
  "CancelApproveResult", "AdminDispatchOrder", "OrderGift", "OrderCardDto", "OrderDetailDto", "MessageDto",
  "DispatchItem", "DispatchOrder",
  // catalog (витрина)
  "SpecOption", "FacetBucket", "SpecAttribute", "SpecGroup", "CatalogCategory", "CatalogBrand", "CatalogSchema",
  "ProductBrandRef", "StorefrontProduct", "StorefrontTag",
  // catalog-admin
  "AdminCategory", "AdminBrand", "AdminSpecOption", "AdminSpecBucket", "AdminSpecAttribute", "AdminSpecGroup",
  // translation
  "TrRejected", "TrImportResult", "TrCounts", "TrTextCounts", "TrStats", "TrAcceptResult", "TrSourceFixResult",
  // product (AdminProduct — вид экрана над AdminProductDto, см. features/product/model/from-dto.ts)
  "AdminProductDto", "SpecIssue",
  // cards
  "CardStats", "CardImportResult", "CardImportItemResult", "CardExportStatus",
]);

/** В orders-api.ts ручные интерфейсы — только тела запросов и этот список (не ответы заказа). */
const ORDERS_API = "frontend-admin/lib/orders-api.ts";
const ORDERS_API_ALLOWED = /(Body|Request|Write|Patch)$|^(ReplyTemplate|RenderedTemplate)$/;

const SKIP = new Set(["node_modules", ".next", "dist", "build", ".git", "_worktrees", "_logs", "_shots"]);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const problems = [];
const files = ["packages", "frontend", "frontend-admin", "site"].flatMap((d) => walk(path.join(ROOT, d)));
for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:export\s+)?(?:interface\s+(\w+)\b|type\s+(\w+)\s*=\s*\{)/);
    if (!m) return;
    const name = m[1] ?? m[2];
    if (GENERATED_ONLY.has(name)) {
      problems.push(`${rel}:${i + 1}: ручной тип ответа API «${name}» — возьми из OpenAPI: Schemas["…"] (packages/core/src/api/schemas.ts)`);
    }
    if (rel === ORDERS_API && /^\s*export\s+interface/.test(line) && !ORDERS_API_ALLOWED.test(name)) {
      problems.push(`${rel}:${i + 1}: «${name}» — в orders-api.ts ручные интерфейсы только для тел запросов`);
    }
  });
}

if (problems.length) {
  console.error(`check-api-types: ${problems.length} ручных типов ответов API у пилотных модулей:`);
  problems.forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log(`check-api-types: ручных типов ответов order/catalog нет (проверено ${files.length} файлов)`);
