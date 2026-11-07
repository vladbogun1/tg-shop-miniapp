/**
 * Снимки второй доводки ИИ для проверки вёрстки глазами (`FIX2_SHOTS=1`, иначе пропускается — в CI не идёт):
 * ручной пакет по частям (часть, выход, проверка, «Править», полоса «Продолжить»), загрузка накладной (прогресс и
 * лимит 10 картинок) и блок «ИИ» в настройках — на 320, 375 и 1440 px, в `_shots/fix2-*.png` корня репозитория.
 */
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { REPO_ROOT } from "../env.js";
import { productTitle } from "../lib/ai-admin";
import type { Api } from "../lib/api";
import { blankDescriptions, clearBatches } from "../lib/ai-batch";
import { query, withDb } from "../lib/db";
import { screenshotPng } from "../lib/png";
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = [1440, 375, 320] as const;
const IDS = [PRODUCT.tee, PRODUCT.cap, PRODUCT.bag, PRODUCT.socks, PRODUCT.scarf];

test.skip(!process.env.FIX2_SHOTS, "только по FIX2_SHOTS=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const size = (page: Page, w: number) => page.setViewportSize({ width: w, height: w === 1440 ? 900 : 812 });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `fix2-${name}.png`) });

/** Тот же экран на трёх ширинах: `prepare` — то, что надо сделать после смены ширины (раскрыть, прокрутить). */
async function widths(page: Page, name: string, prepare?: () => Promise<void>) {
  for (const w of WIDTHS) {
    await size(page, w);
    await prepare?.();
    await page.waitForTimeout(250);
    await shot(page, `${name}-${w}`);
  }
}

async function setting(api: Api, values: Record<string, unknown>) {
  expect((await api.raw("put", "/api/admin/settings", { values })).status).toBe(200);
}

const card = (pid: string) => ({
  overall: 90,
  description: { ru: `Ручное описание для ${pid}: лёгкая мышь для киберспорта, сенсор PAW3395, 54 г.`, uk: "Опис", en: "Description" },
  sources: ["https://example.com/manual"],
});
const answer = (pids: string[]) => "```json\n" + JSON.stringify(Object.fromEntries(pids.map((p) => [p, card(p)])), null, 2) + "\n```";
const pidsOf = (prompt: string) => [...prompt.slice(prompt.indexOf("## Товары")).matchAll(/"(p[0-9a-f]{8,32})"\s*:\s*\{/g)].map((m) => m[1]);

const before = new Map<string, { description: string | null; card_status: string | null }>();
let lastJobId = 0;

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const rows = await query<{ id: string; description: string | null; card_status: string | null }>(
    `SELECT BIN_TO_UUID(id) id, description, card_status FROM products WHERE id IN (${IDS.map(() => "UUID_TO_BIN(?)").join(", ")})`,
    IDS,
  );
  for (const r of rows) before.set(r.id, { description: r.description, card_status: r.card_status });
  lastJobId = (await query<{ n: number | null }>("SELECT MAX(id) n FROM ai_jobs"))[0].n ?? 0;
  await clearBatches();
  await blankDescriptions(IDS);
});

test.afterAll(async ({ api }) => {
  await setting(api, { "ai.enabled": null, "ai.feature.supply": null });
  await withDb(async (conn) => {
    for (const [id, v] of before) await conn.query("UPDATE products SET description = ?, card_status = ? WHERE id = UUID_TO_BIN(?)", [v.description, v.card_status, id]);
    await conn.query("DELETE FROM ai_jobs WHERE id > ? AND path = 'MANUAL'", [lastJobId]);
    await conn.query("DELETE FROM ai_files");
  });
});

async function pids(layer: Locator): Promise<string[]> {
  await layer.getByRole("button", { name: "Показать текст" }).click();
  const out = pidsOf(await layer.locator("pre").innerText());
  await layer.getByRole("button", { name: "Скрыть текст" }).click();
  return out;
}

test("ручной пакет: часть, выход, проверка, «Править», «Продолжить»", async ({ page, api }) => {
  await setting(api, { "ai.enabled": false });
  await size(page, 1440);
  await page.goto("/products");
  for (const id of IDS) await page.getByLabel(`Выбрать ${await productTitle(id)}`).locator("visible=true").first().check();
  await widths(page, "manual-entry");
  await size(page, 1440);
  await page.getByRole("button", { name: "Оформить вручную (5)" }).click();
  const layer = page.getByTestId("manual-batch");
  const part1 = await pids(layer);
  await layer.getByLabel("Ответ ChatGPT на часть 1").fill(answer(part1.slice(0, 2)));
  await widths(page, "manual-part");
  await widths(page, "manual-part-prompt", async () => {
    if (await layer.getByRole("button", { name: "Показать текст" }).isVisible()) await layer.getByRole("button", { name: "Показать текст" }).click();
  });
  await layer.getByRole("button", { name: "Скрыть текст" }).click();

  await layer.getByRole("button", { name: "Закрыть — вставленное сохранится" }).click();
  await expect(dialog(page, "Выйти, сохранив вставленное?")).toBeVisible();
  await widths(page, "manual-exit");
  await dialog(page, "Выйти, сохранив вставленное?").getByRole("button", { name: "Сохранить и выйти" }).click();
  await page.reload();
  await expect(page.getByTestId("manual-resume")).toBeVisible();
  await widths(page, "manual-resume");

  await page.getByTestId("manual-resume").getByRole("button", { name: "Продолжить" }).click();
  await layer.getByRole("button", { name: "Дальше: часть 2" }).click();
  const part2 = await pids(layer);
  await layer.getByLabel("Ответ ChatGPT на часть 2").fill(answer([...part2, part1[3]]));
  await widths(page, "manual-part2-error");
  await layer.getByRole("button", { name: /^К проверке/ }).click();
  await widths(page, "manual-review");
  await layer.getByTestId("feed-edit").click();
  await widths(page, "manual-edit");
  await layer.getByRole("button", { name: /^Применить \(\d+\)/ }).click();
  await layer.getByTestId("feed-accept").click();
  await layer.getByTestId("feed-accept").click();
  await expect(layer.getByTestId("manual-finished")).toBeVisible();
  await widths(page, "manual-finished");
  await layer.getByTestId("manual-finish").click();
});

test("накладная: прогресс загрузки и лимит 10 картинок", async ({ page, api }) => {
  await setting(api, { "ai.enabled": null, "ai.feature.supply": true });
  await page.route("**/api/admin/ai/files", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  const png = screenshotPng();
  for (const w of WIDTHS) {
    await withDb((conn) => conn.query("DELETE FROM ai_files"));
    await size(page, w);
    await page.goto("/preorders");
    await page.getByRole("button", { name: "Из накладной (ИИ)" }).click();
    const modal = dialog(page, "Поставка с ИИ");
    await modal.getByTestId("supply-ai-file-input").setInputFiles(Array.from({ length: 11 }, (_, i) => ({ name: `накладная-${i + 1}.png`, mimeType: "image/png", buffer: png })));
    await expect(modal.getByRole("progressbar").first()).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, `supply-progress-${w}`);
    await expect(modal.getByTestId("supply-ai-files-count")).toHaveText("10 из 10 картинок", { timeout: 60_000 });
    await expect(modal.getByRole("progressbar")).toHaveCount(0, { timeout: 60_000 });
    await modal.getByTestId("supply-ai-files-count").scrollIntoViewIfNeeded();
    await shot(page, `supply-limit-${w}`);
  }
});

test("настройки «ИИ»: блоки, лимиты в долларах, «Дополнительно» и история", async ({ page, api }) => {
  await setting(api, { "ai.monthLimitCents": 1250 });
  await setting(api, { "ai.monthLimitCents": null });
  const group = page.locator("#group-ai");
  for (const w of WIDTHS) {
    await size(page, w);
    await page.goto("/settings#group-ai");
    await expect(group.getByRole("heading", { name: "Лимиты" })).toBeVisible();
    await group.getByRole("heading", { name: "Состояние" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot(page, `settings-top-${w}`);
    await group.getByRole("heading", { name: "Функции" }).scrollIntoViewIfNeeded();
    await shot(page, `settings-functions-${w}`);
    // Тот же адрес с #group-ai — не перезагрузка: раскрытое на прошлой ширине остаётся раскрытым.
    for (const name of [/Дополнительно/, /История изменений/]) {
      const b = group.getByRole("button", { name });
      if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
    }
    await expect(group.getByLabel("История изменений настроек ИИ")).toBeVisible();
    await group.getByRole("button", { name: /История изменений/ }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot(page, `settings-more-${w}`);
  }
});
