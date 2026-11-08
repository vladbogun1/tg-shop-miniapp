/**
 * Снимки второй доводки ИИ для проверки вёрстки глазами (`FIX2_SHOTS=1`, иначе пропускается — в CI не идёт):
 * загрузка накладной (прогресс и лимит 10 картинок) и блок «ИИ» в настройках — на 320, 375 и 1440 px, в
 * `_shots/fix2-*.png` корня репозитория. Ручной пакет снимает `99-fix3-shots` (он теперь задача на сервере).
 */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { REPO_ROOT } from "../env.js";
import { checkLayout, heightFor, shotWidths } from "../lib/layout-qa";
import type { Api } from "../lib/api";
import { withDb } from "../lib/db";
import { screenshotPng } from "../lib/png";
import { dialog, expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = shotWidths([1440, 375, 320]);

test.skip(!process.env.FIX2_SHOTS, "только по FIX2_SHOTS=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const size = (page: Page, w: number) => page.setViewportSize({ width: w, height: heightFor(w) });
const shot = async (page: Page, name: string) => {
  await checkLayout(page, `fix2-${name}`);
  await page.screenshot({ path: path.join(SHOTS, `fix2-${name}.png`) });
};

async function setting(api: Api, values: Record<string, unknown>) {
  expect((await api.raw("put", "/api/admin/settings", { values })).status).toBe(200);
}

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

test.afterAll(async ({ api }) => {
  await setting(api, { "ai.enabled": null, "ai.feature.supply": null });
  await withDb((conn) => conn.query("DELETE FROM ai_files"));
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
    await dialog(page, "Поставка с ИИ").getByRole("button", { name: "Разобрать вручную" }).click();
    const modal = dialog(page, "Разбор накладной вручную");
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
