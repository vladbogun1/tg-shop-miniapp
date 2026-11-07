/**
 * Снимки пятой доводки ИИ для проверки вёрстки глазами (`FIX5_SHOTS=1`, иначе пропускается — в CI не идёт): плашка
 * «Отменить применение» на экране проверки задачи — что вернётся (поля, переводы, статус) и что не вернётся (новый
 * бренд, ручные правки), — и итог отмены с тем, что не отменено, потому что после применения это правили вручную.
 * На 1440, 375 и 320 px, в `_shots/fix5-*.png`.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { REPO_ROOT } from "../env.js";
import { productTitle } from "../lib/ai-admin";
import type { Api } from "../lib/api";
import { blankDescriptions, clearBatches } from "../lib/ai-batch";
import { query, withDb } from "../lib/db";
import { PRODUCT } from "../lib/seed";
import { expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = [1440, 375, 320] as const;
const IDS = [PRODUCT.tee, PRODUCT.cap, PRODUCT.bag, PRODUCT.socks, PRODUCT.scarf];

test.skip(!process.env.FIX5_SHOTS, "только по FIX5_SHOTS=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const size = (page: Page, w: number) => page.setViewportSize({ width: w, height: w === 1440 ? 900 : 812 });

async function widths(page: Page, name: string, prepare?: () => Promise<void>) {
  for (const w of WIDTHS) {
    await size(page, w);
    await prepare?.();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, `fix5-${name}-${w}.png`) });
  }
  await size(page, 1440);
}

async function setting(api: Api, values: Record<string, unknown>) {
  expect((await api.raw("put", "/api/admin/settings", { values })).status).toBe(200);
}

const NEW_BRAND = "E2E Бренд для снимка";
const fenced = (o: object) => "```json\n" + JSON.stringify(o, null, 2) + "\n```";
const pidsOf = (prompt: string) => [...prompt.slice(prompt.indexOf("## Товары")).matchAll(/"(p[0-9a-f]{8,32})"\s*:\s*\{/g)].map((m) => m[1]);
const uuidOf = (pid: string) => IDS.find((id) => id.replace(/-/g, "").toLowerCase().startsWith(pid.slice(1)))!;

type Saved = {
  id: string;
  description: string | null;
  card_status: string;
  card_confidence: number | null;
  meta: string | null;
  brand_id: string | null;
  active: number;
  unfinished: number;
};
type Tr = { id: string; field: string; locale: string; text: string; source_hash: string; origin: string; updated_by: number | null };
const titles: string[] = [];
let saved: Saved[] = [];
let savedTr: Tr[] = [];
let lastJobId = 0;
const IN = IDS.map(() => "UUID_TO_BIN(?)").join(", ");

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const id of IDS) titles.push(await productTitle(id));
  saved = await query<Saved>(
    `SELECT BIN_TO_UUID(id) id, description, card_status, card_confidence, CAST(card_meta AS CHAR) meta, BIN_TO_UUID(brand_id) brand_id, active, unfinished FROM products WHERE id IN (${IN})`,
    IDS,
  );
  savedTr = await query<Tr>(
    `SELECT BIN_TO_UUID(entity_id) id, field, locale, text, source_hash, origin, updated_by FROM content_translations WHERE entity_type = 'PRODUCT' AND entity_id IN (${IN})`,
    IDS,
  );
  lastJobId = (await query<{ n: number | null }>("SELECT MAX(id) n FROM ai_jobs"))[0].n ?? 0;
  await clearBatches();
  await blankDescriptions(IDS);
});

test.afterAll(async ({ api }) => {
  await setting(api, { "ai.enabled": null });
  await clearBatches();
  await withDb(async (conn) => {
    for (const v of saved) {
      await conn.query(
        "UPDATE products SET description = ?, card_status = ?, card_confidence = ?, card_meta = CAST(? AS JSON), brand_id = UUID_TO_BIN(?), active = ?, unfinished = ? WHERE id = UUID_TO_BIN(?)",
        [v.description, v.card_status, v.card_confidence, v.meta, v.brand_id, v.active, v.unfinished, v.id],
      );
    }
    await conn.query(`DELETE FROM content_translations WHERE entity_type = 'PRODUCT' AND entity_id IN (${IN})`, IDS);
    for (const r of savedTr) {
      await conn.query(
        "INSERT INTO content_translations (entity_type, entity_id, field, locale, text, source_hash, origin, updated_by) VALUES ('PRODUCT', UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?)",
        [r.id, r.field, r.locale, r.text, r.source_hash, r.origin, r.updated_by],
      );
    }
    await conn.query("DELETE FROM brands WHERE name = ?", [NEW_BRAND]);
    await conn.query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE id > ? AND path = 'MANUAL')", [lastJobId]);
    await conn.query("DELETE FROM ai_jobs WHERE id > ? AND path = 'MANUAL'", [lastJobId]);
  });
});

test("плашка «Отменить применение»: что вернётся и что нет; итог отмены с ручной правкой", async ({ page, api }) => {
  await setting(api, { "ai.enabled": false });
  await size(page, 1440);
  await page.goto("/products");
  const enter = page.getByRole("button", { name: "Выбрать", exact: true });
  if (await enter.isVisible()) await enter.click();
  for (const t of titles) await page.getByLabel(`Выбрать ${t}`).locator("visible=true").first().check();
  await page.getByRole("button", { name: "Через ChatGPT вручную (5)" }).click();
  const layer = page.getByTestId("manual-batch");
  await layer.getByRole("button", { name: "Показать текст" }).click();
  const pid = pidsOf(await layer.locator("pre").innerText())[0];
  await layer.getByRole("button", { name: "Скрыть текст" }).click();
  const id = uuidOf(pid);
  const title = await productTitle(id);
  const text = "Лёгкая беспроводная мышь для киберспорта: сенсор PAW3395, 54 г, до 70 часов работы.";
  // uk — настоящий украинский (проверка не пропускает русские буквы), числа те же, что в ru (иначе перевод не уйдёт).
  const uk = "Легка бездротова миша для кіберспорту: сенсор PAW3395, 54 г, до 70 годин роботи.";
  const en = "Lightweight wireless esports mouse: PAW3395 sensor, 54 g, up to 70 hours of battery life.";
  const entry = { overall: 90, brand: NEW_BRAND, description: { ru: text, uk, en }, sources: ["https://example.com/manual"] };
  await layer.getByLabel("Ответ ChatGPT на часть 1").fill(fenced({ [pid]: entry }));
  await layer.getByRole("button", { name: "Дальше: часть 2" }).click();
  await layer.getByRole("button", { name: "К проверке (1)" }).click();

  // Переводов у товара нет (ручной uk-перевод из других тестов импорт бы не тронул): uk/en запишет применение.
  await query("DELETE FROM content_translations WHERE entity_type = 'PRODUCT' AND entity_id = UUID_TO_BIN(?)", [id]);
  // «Править» → экран проверки задачи, бренд заводится, «Применить».
  await layer.getByTestId("feed-edit").click();
  await expect(page).toHaveURL(/\/cards\/ai-review\/\d+$/);
  const brandBox = page.getByLabel("Применить: Бренд");
  if (await brandBox.isVisible()) await brandBox.check();
  await page.getByRole("button", { name: /^Применить \(\d+\)/ }).click();
  await expect(page.getByText("Результат применён")).toBeVisible();

  const bar = page.getByTestId("apply-undo");
  await expect(bar.getByTestId("apply-undo-back")).toContainText("перевод uk");
  await widths(page, "review-undo", () => bar.scrollIntoViewIfNeeded());

  // Человек после применения поправил uk-описание — отмена его оставит и скажет об этом.
  await query(
    "UPDATE content_translations SET text = ?, origin = 'MANUAL' WHERE entity_type = 'PRODUCT' AND entity_id = UUID_TO_BIN(?) AND field = 'description' AND locale = 'uk'",
    [`Ручний опис ${title}`, id],
  );
  await bar.getByTestId("apply-undo-btn").click();
  const report = page.getByTestId("apply-undo-report");
  await expect(report.getByTestId("apply-undo-kept")).toBeVisible();
  await widths(page, "undo-report", () => report.scrollIntoViewIfNeeded());
});
