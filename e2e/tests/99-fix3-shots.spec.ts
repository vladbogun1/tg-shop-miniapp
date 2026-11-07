/**
 * Снимки третьей доводки ИИ для проверки вёрстки глазами (`FIX3_SHOTS=1`, иначе пропускается — в CI не идёт):
 * ручной пакет «Через ChatGPT вручную» как задача на сервере (входы, часть с размером и моделью, выход, полоса
 * «Продолжить», чужой товар в части, лента с «Принять безопасное», конец), проверка ручной задачи с выбором
 * категории и бренда и история настроек ИИ с лимитами в долларах — на 1440, 375 и 320 px, в `_shots/fix3-*.png`.
 */
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { REPO_ROOT } from "../env.js";
import { productTitle } from "../lib/ai-admin";
import type { Api } from "../lib/api";
import { blankDescriptions, clearBatches } from "../lib/ai-batch";
import { query, withDb } from "../lib/db";
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = [1440, 375, 320] as const;
const IDS = [PRODUCT.tee, PRODUCT.cap, PRODUCT.bag, PRODUCT.socks, PRODUCT.scarf];

test.skip(!process.env.FIX3_SHOTS, "только по FIX3_SHOTS=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const size = (page: Page, w: number) => page.setViewportSize({ width: w, height: w === 1440 ? 900 : 812 });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `fix3-${name}.png`) });

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

const card = (pid: string) => ({
  overall: 90,
  description: { ru: `Ручное описание для ${pid}: лёгкая мышь для киберспорта, сенсор PAW3395, 54 г.`, uk: "Опис", en: "Description" },
  sources: ["https://example.com/manual"],
});
const fenced = (o: object) => "```json\n" + JSON.stringify(o, null, 2) + "\n```";
const answer = (pids: string[]) => fenced(Object.fromEntries(pids.map((p) => [p, card(p)])));
const pidsOf = (prompt: string) => [...prompt.slice(prompt.indexOf("## Товары")).matchAll(/"(p[0-9a-f]{8,32})"\s*:\s*\{/g)].map((m) => m[1]);

type Saved = { description: string | null; card_status: string | null; category_id: string | null; brand_id: string | null };
const before = new Map<string, Saved>();
const titles: string[] = [];
let lastJobId = 0;

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const id of IDS) titles.push(await productTitle(id));
  const rows = await query<Saved & { id: string }>(
    `SELECT BIN_TO_UUID(id) id, description, card_status, BIN_TO_UUID(category_id) category_id, BIN_TO_UUID(brand_id) brand_id FROM products WHERE id IN (${IDS.map(() => "UUID_TO_BIN(?)").join(", ")})`,
    IDS,
  );
  for (const r of rows) before.set(r.id, r);
  lastJobId = (await query<{ n: number | null }>("SELECT MAX(id) n FROM ai_jobs"))[0].n ?? 0;
  await clearBatches();
  await blankDescriptions(IDS);
});

test.afterAll(async ({ api }) => {
  await setting(api, { "ai.enabled": null });
  await clearBatches();
  await withDb(async (conn) => {
    for (const [id, v] of before) {
      await conn.query(
        "UPDATE products SET description = ?, card_status = ?, category_id = UUID_TO_BIN(?), brand_id = UUID_TO_BIN(?) WHERE id = UUID_TO_BIN(?)",
        [v.description, v.card_status, v.category_id, v.brand_id, id],
      );
    }
    await conn.query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE id > ? AND path = 'MANUAL')", [lastJobId]);
    await conn.query("DELETE FROM ai_jobs WHERE id > ? AND path = 'MANUAL'", [lastJobId]);
  });
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

test("ручной пакет: входы, часть, выход, «Продолжить», лента, «Принять безопасное», конец", async ({ page, api }) => {
  await setting(api, { "ai.enabled": false });
  await size(page, 1440);
  await page.goto("/cards");
  await expect(page.getByTestId("cards-manual")).toBeVisible();
  await widths(page, "cards-entry");

  await selectAll(page);
  await widths(page, "products-entry");
  await page.getByRole("button", { name: "Через ChatGPT вручную (5)" }).click();
  const layer = page.getByTestId("manual-batch");
  await expect(layer.getByTestId("manual-size-8")).toBeVisible();
  await widths(page, "part-empty");

  const part1 = await pids(layer);
  await layer.getByLabel("Ответ ChatGPT на часть 1").fill(answer(part1.slice(0, 2)));
  await layer.getByTestId("manual-model").fill("GPT-5 Thinking");
  await widths(page, "part", () => layer.getByTestId("manual-model").scrollIntoViewIfNeeded());
  await widths(page, "part-prompt", async () => {
    const show = layer.getByRole("button", { name: "Показать текст" });
    if (await show.isVisible()) await show.click();
  });
  await layer.getByRole("button", { name: "Скрыть текст" }).click();

  await layer.getByRole("button", { name: "Закрыть — вставленное сохранится" }).click();
  const exit = dialog(page, "Выйти, сохранив вставленное?");
  await expect(exit).toBeVisible();
  await widths(page, "exit");
  await exit.getByRole("button", { name: "Сохранить и выйти" }).click();
  await page.reload();
  await expect(page.getByTestId("manual-resume")).toBeVisible();
  await widths(page, "resume-products");
  await page.goto("/cards");
  await expect(page.getByTestId("manual-resume")).toBeVisible();
  await widths(page, "resume-cards");

  await page.getByTestId("manual-resume").getByRole("button", { name: "Продолжить" }).click();
  await layer.getByRole("button", { name: "Дальше: часть 2" }).click();
  const part2 = await pids(layer);
  await layer.getByLabel("Ответ ChatGPT на часть 2").fill(answer([...part2, part1[3]]));
  await expect(layer.getByTestId("manual-part-problems")).toBeVisible();
  await widths(page, "part2-error");
  await layer.getByRole("button", { name: /^К проверке/ }).click();
  await expect(layer.getByTestId("manual-review-sub")).toBeVisible();
  await widths(page, "review");

  await layer.getByTestId("batch-accept-safe").click();
  const safe = page.getByRole("dialog", { name: "Принять безопасное" });
  await widths(page, "safe-ask");
  await safe.getByTestId("safe-go").click();
  await expect(safe.getByTestId("safe-result")).toBeVisible();
  await widths(page, "safe-done");
  await safe.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  await expect(layer.getByTestId("manual-finished")).toBeVisible();
  await widths(page, "finished");
  await layer.getByTestId("manual-finish").click();
});

test("проверка ручной задачи: «Ответ ChatGPT», выбор категории и бренда", async ({ page, api }) => {
  await setting(api, { "ai.enabled": false });
  await blankDescriptions(IDS);
  await size(page, 1440);
  await selectAll(page);
  await page.getByRole("button", { name: "Через ChatGPT вручную (5)" }).click();
  const layer = page.getByTestId("manual-batch");
  const part1 = await pids(layer);
  await layer.getByLabel("Ответ ChatGPT на часть 1").fill(fenced({ [part1[0]]: { ...card(part1[0]), category: "net-takoy-kategorii", brand: "Неведомый бренд" } }));
  await layer.getByRole("button", { name: "Дальше: часть 2" }).click();
  await layer.getByRole("button", { name: "К проверке (1)" }).click();
  await layer.getByTestId("feed-edit").click();
  await expect(page).toHaveURL(/\/cards\/ai-review\/\d+$/);
  await expect(page.getByRole("button", { name: "Изменить: Категория" })).toBeVisible();
  await widths(page, "review-manual");

  const edit = page.getByTestId("ai-review-edit");
  await widths(page, "review-category", async () => {
    if (!(await edit.isVisible())) await page.getByRole("button", { name: "Изменить: Категория" }).click();
    await edit.scrollIntoViewIfNeeded();
  });
  const tee = PRODUCT.tee.replace(/-/g, "").startsWith(part1[0].slice(1));
  await edit.getByLabel("Новое значение: Категория").selectOption({ label: tee ? "E2E Аксессуары" : "E2E Футболки" });
  await edit.getByRole("button", { name: "Сохранить" }).click();
  await widths(page, "review-brand", async () => {
    if (!(await edit.isVisible())) await page.getByRole("button", { name: "Изменить: Бренд" }).click();
    await edit.scrollIntoViewIfNeeded();
  });
  await edit.getByLabel("Новое значение: Бренд").selectOption({ label: "E2E Logitech" });
  await edit.getByRole("button", { name: "Сохранить" }).click();
  await widths(page, "review-edited", () => page.getByLabel("Применить: Бренд").scrollIntoViewIfNeeded());
  await page.getByRole("button", { name: "Ещё действия" }).click();
  await widths(page, "review-menu");
  await page.getByRole("menuitem", { name: "Показать ответ" }).click();
  await widths(page, "review-answer");
});

test("настройки «ИИ»: история с лимитами в долларах", async ({ page, api }) => {
  await setting(api, { "ai.monthLimitCents": 1250 });
  await setting(api, { "ai.monthLimitCents": null });
  const group = page.locator("#group-ai");
  for (const w of WIDTHS) {
    await size(page, w);
    await page.goto("/settings#group-ai");
    await expect(group.getByRole("heading", { name: "Лимиты" })).toBeVisible();
    for (const name of [/Дополнительно/, /История изменений/]) {
      const b = group.getByRole("button", { name });
      if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
    }
    const history = group.getByLabel("История изменений настроек ИИ");
    await expect(history).toContainText("$");
    await history.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, `settings-history-${w}`);
  }
});
