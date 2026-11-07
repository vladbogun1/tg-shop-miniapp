/**
 * Снимки четвёртой доводки ИИ для проверки вёрстки глазами (`FIX4_SHOTS=1`, иначе пропускается — в CI не идёт):
 * «Принять безопасное» с карточкой, оставленной человеку (новый бренд), лента с новым брендом, фото и «Заменить
 * характеристики целиком», итог пакета после записи (со ссылками и полосой «Отменить»), экран проверки задачи с
 * плашкой «Отменить применение» и с переключателем замены — на 1440, 375 и 320 px, в `_shots/fix4-*.png`.
 */
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { REPO_ROOT } from "../env.js";
import { checkLayout, heightFor, shotWidths } from "../lib/layout-qa";
import { productTitle } from "../lib/ai-admin";
import type { Api } from "../lib/api";
import { blankDescriptions, clearBatches } from "../lib/ai-batch";
import { query, withDb } from "../lib/db";
import { PRODUCT } from "../lib/seed";
import { expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = shotWidths([1440, 375, 320]);
const IDS = [PRODUCT.tee, PRODUCT.cap, PRODUCT.bag, PRODUCT.socks, PRODUCT.scarf];

test.skip(!process.env.FIX4_SHOTS, "только по FIX4_SHOTS=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const size = (page: Page, w: number) => page.setViewportSize({ width: w, height: heightFor(w) });
const shot = async (page: Page, name: string) => {
  await checkLayout(page, `fix4-${name}`);
  await page.screenshot({ path: path.join(SHOTS, `fix4-${name}.png`) });
};

/** Тот же экран на трёх ширинах: `prepare` — то, что надо сделать после смены ширины (раскрыть, прокрутить). */
async function widths(page: Page, name: string, prepare?: () => Promise<void>) {
  for (const w of WIDTHS) {
    await size(page, w);
    await prepare?.();
    await page.waitForTimeout(300);
    await shot(page, `${name}-${w}`);
  }
  await size(page, 1440);
}

async function setting(api: Api, values: Record<string, unknown>) {
  expect((await api.raw("put", "/api/admin/settings", { values })).status).toBe(200);
}

const NEW_BRAND = "Pulsar Gaming Gears";
const PHOTOS = ["https://example.com/e2e-shot-1.jpg", "https://example.com/e2e-shot-2.jpg"];
const card = (pid: string) => ({
  overall: 90,
  description: { ru: `Ручное описание для ${pid}: лёгкая мышь для киберспорта, сенсор PAW3395, 54 г.`, uk: "Опис", en: "Description" },
  sources: ["https://example.com/manual"],
});
const fenced = (o: object) => "```json\n" + JSON.stringify(o, null, 2) + "\n```";
const pidsOf = (prompt: string) => [...prompt.slice(prompt.indexOf("## Товары")).matchAll(/"(p[0-9a-f]{8,32})"\s*:\s*\{/g)].map((m) => m[1]);
const uuidOf = (pid: string) => IDS.find((id) => id.replace(/-/g, "").toLowerCase().startsWith(pid.slice(1)))!;

type Saved = { description: string | null; card_status: string | null; category_id: string | null; brand_id: string | null; specs: string | null };
const before = new Map<string, Saved>();
const titles: string[] = [];
let lastJobId = 0;
const attrs: string[] = [];

test.beforeAll(async ({ api }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const id of IDS) titles.push(await productTitle(id));
  const rows = await query<Saved & { id: string }>(
    `SELECT BIN_TO_UUID(id) id, description, card_status, BIN_TO_UUID(category_id) category_id, BIN_TO_UUID(brand_id) brand_id, CAST(specs AS CHAR) specs FROM products WHERE id IN (${IDS.map(() => "UUID_TO_BIN(?)").join(", ")})`,
    IDS,
  );
  for (const r of rows) before.set(r.id, r);
  lastJobId = (await query<{ n: number | null }>("SELECT MAX(id) n FROM ai_jobs"))[0].n ?? 0;
  await clearBatches();
  await blankDescriptions(IDS);
  // Характеристики из схемы, которых нет в ответах: их удалит только «Заменить характеристики целиком».
  for (const [key, ru] of [["e2e_weight", "Вес без кабеля"], ["e2e_sensor", "Модель сенсора"]]) {
    const res = await api.raw("post", "/api/admin/spec-attributes", { categoryId: null, key, labelRu: ru, labelUk: ru, labelEn: key, type: "TEXT", group: "main" });
    expect(res.status).toBe(200);
    attrs.push((res.body as { id: string }).id);
  }
  await withDb(async (conn) => {
    for (const id of IDS) {
      await conn.query("UPDATE products SET specs = JSON_OBJECT('e2e_weight', '54 г', 'e2e_sensor', 'PixArt PAW3395') WHERE id = UUID_TO_BIN(?)", [id]);
    }
  });
});

test.afterAll(async ({ api }) => {
  await setting(api, { "ai.enabled": null });
  await clearBatches();
  await withDb(async (conn) => {
    for (const [id, v] of before) {
      await conn.query(
        "UPDATE products SET description = ?, card_status = ?, category_id = UUID_TO_BIN(?), brand_id = UUID_TO_BIN(?), specs = CAST(? AS JSON) WHERE id = UUID_TO_BIN(?)",
        [v.description, v.card_status, v.category_id, v.brand_id, v.specs, id],
      );
    }
    await conn.query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE id > ? AND path = 'MANUAL')", [lastJobId]);
    await conn.query("DELETE FROM ai_jobs WHERE id > ? AND path = 'MANUAL'", [lastJobId]);
  });
  for (const id of attrs) await api.raw("delete", `/api/admin/spec-attributes/${id}?force=1`);
});

async function pids(layer: Locator): Promise<string[]> {
  await layer.getByRole("button", { name: "Показать текст" }).click();
  const out = pidsOf(await layer.locator("pre").innerText());
  await layer.getByRole("button", { name: "Скрыть текст" }).click();
  return out;
}

async function selectAll(page: Page) {
  await page.goto("/products");
  const enter = page.getByRole("button", { name: "Выбрать", exact: true });
  if (await enter.isVisible()) await enter.click();
  for (const t of titles) await page.getByLabel(`Выбрать ${t}`).locator("visible=true").first().check();
}

async function fakePhotoImport(page: Page) {
  await page.route("**/api/admin/products/*/photos/import", async (route) => {
    const url = (route.request().postDataJSON() as { url: string }).url;
    await route.fulfill({ json: { key: "e2e/photo-by-link.webp", source: url, cutOut: true, imageKeys: ["e2e/photo-by-link.webp"] } });
  });
}

test("безопасное с новым брендом, лента, итог пакета, отмена и замена на экране проверки", async ({ page, api }) => {
  await setting(api, { "ai.enabled": false });
  await size(page, 1440);
  await selectAll(page);
  await page.getByRole("button", { name: "Через ChatGPT вручную (5)" }).click();
  const layer = page.getByTestId("manual-batch");
  const part1 = await pids(layer);
  const branded = part1[1];
  const brandedTitle = await productTitle(uuidOf(branded));
  await layer.getByLabel("Ответ ChatGPT на часть 1").fill(
    fenced({ [part1[0]]: card(part1[0]), [branded]: { ...card(branded), brand: NEW_BRAND, photos: PHOTOS }, [part1[2]]: card(part1[2]) }),
  );
  await layer.getByRole("button", { name: "Дальше: часть 2" }).click();
  await layer.getByRole("button", { name: "К проверке (3)" }).click();

  await layer.getByTestId("batch-accept-safe").click();
  const safe = page.getByRole("dialog", { name: "Принять безопасное" });
  await expect(safe.getByTestId("safe-held")).toBeVisible();
  await widths(page, "safe-ask");
  await safe.getByTestId("safe-go").click();
  await expect(safe.getByTestId("safe-result")).toBeVisible();
  await widths(page, "safe-done");
  await safe.getByRole("button", { name: "Закрыть", exact: true }).last().click();

  const feed = layer.getByTestId("feed-card");
  await expect(feed.getByTestId("feed-new-brand")).toBeVisible();
  await widths(page, "feed");
  await feed.getByTestId("feed-replace-toggle").check();
  await expect(feed.getByTestId("feed-removed")).toBeVisible();
  await widths(page, "feed-replace", () => feed.getByTestId("feed-accept").scrollIntoViewIfNeeded());

  await fakePhotoImport(page);
  await feed.getByTestId("feed-accept").click();
  await expect(layer.getByTestId("manual-finished")).toBeVisible();
  await expect(layer.getByText("добавлено 2")).toBeVisible();
  await widths(page, "finished");
  await widths(page, "finished-report", () => layer.getByTestId("manual-finish").scrollIntoViewIfNeeded());

  await layer.getByTestId("report-written").getByRole("link", { name: brandedTitle }).click();
  await expect(page).toHaveURL(/\/cards\/ai-review\/\d+$/);
  const bar = page.getByTestId("apply-undo");
  await expect(bar).toBeVisible();
  await widths(page, "review-undo");
  await bar.getByTestId("apply-undo-btn").click();
  await expect(bar).toHaveCount(0);
  const toggle = page.getByTestId("replace-specs-toggle");
  await expect(toggle).toBeVisible();
  await widths(page, "review-replace-off", () => page.getByTestId("replace-specs").scrollIntoViewIfNeeded());
  await toggle.check();
  await widths(page, "review-replace-on", () => page.getByTestId("replace-specs").scrollIntoViewIfNeeded());
});
