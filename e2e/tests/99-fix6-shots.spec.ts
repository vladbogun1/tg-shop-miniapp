/**
 * Снимки сопоставления поставки встроенным ИИ для проверки вёрстки глазами (`FIX6_SHOTS=1`, иначе пропускается — в CI
 * не идёт): блок «Помощь ИИ» после чтения скрина — итог «✓ ИИ решил строк», сбой модели с «Повторить тщательнее» и
 * ручной путь «Через ChatGPT вручную». На 7 ширинах (320…1440), в `_shots/fix6-*.png`, находки — в `qa-layout.jsonl`.
 */
import path from "node:path";
import type { Page } from "@playwright/test";
import { FAKE_AI_URL, REPO_ROOT } from "../env.js";
import { checkLayout, heightFor, shotWidths } from "../lib/layout-qa";
import type { Api } from "../lib/api";
import { query } from "../lib/db";
import { screenshotPng } from "../lib/png";
import { dialog, expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = shotWidths([320, 360, 390, 768, 1024, 1280, 1440]);

test.skip(!process.env.FIX6_SHOTS, "только по FIX6_SHOTS=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

async function fake(pathname: string, body?: unknown) {
  await fetch(`${FAKE_AI_URL}/__e2e/${pathname}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

async function cleanup() {
  await query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE feature IN ('SUPPLY_EXTRACT', 'SUPPLY_MATCH'))");
  await query("DELETE FROM ai_jobs WHERE feature IN ('SUPPLY_EXTRACT', 'SUPPLY_MATCH')");
  await query("DELETE FROM ai_files");
}

test.beforeEach(async ({ api }: { api: Api }) => {
  await cleanup();
  await fake("reset");
  expect((await api.raw("put", "/api/admin/settings", { values: { "ai.feature.supply": true, "ai.dayLimitCents": null } })).status).toBe(200);
});

test.afterAll(cleanup);

async function readShot(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/preorders");
  await page.getByRole("button", { name: "Из накладной (ИИ)" }).click();
  const modal = dialog(page, "Поставка с ИИ");
  await modal.getByTestId("supply-ai-file-input").setInputFiles({ name: "order.png", mimeType: "image/png", buffer: screenshotPng() });
  const read = modal.getByRole("button", { name: "Прочитать с ИИ" });
  await expect(read).toBeEnabled();
  await read.click();
  await expect(modal.getByText("Прочитано 6 из 6, сумма сошлась")).toBeVisible({ timeout: 60_000 });
  return modal;
}

async function widths(page: Page, name: string) {
  const help = page.getByTestId("supply-ai-help");
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: heightFor(w) });
    await help.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await checkLayout(page, `fix6-${name}-${w}`);
    await page.screenshot({ path: path.join(SHOTS, `fix6-${name}-${w}.png`) });
  }
}

test("итог: ИИ решил строки", async ({ page }) => {
  const modal = await readShot(page);
  await expect(modal.getByText(/✓ ИИ решил строк/)).toBeVisible({ timeout: 60_000 });
  await widths(page, "done");
});

test("сбой модели: повтор и ручной путь", async ({ page }) => {
  await fake("mode", { matchMode: "error" });
  const modal = await readShot(page);
  await expect(modal.getByRole("button", { name: /Повторить/ })).toBeVisible({ timeout: 60_000 });
  await widths(page, "failed");
});

test("ручной путь открыт", async ({ page }) => {
  await fake("mode", { matchMode: "bad" });
  const modal = await readShot(page);
  await expect(modal.getByText("Ответ ИИ не удалось прочитать.")).toBeVisible({ timeout: 60_000 });
  const manual = modal.getByTestId("supply-ai-help").getByRole("button", { name: "Через ChatGPT вручную" });
  await manual.click();
  await expect(modal.getByTestId("supply-ai-help").getByRole("button", { name: /Скопировать промпт \(\d+\)/ })).toBeVisible();
  await widths(page, "manual");
});
