/**
 * Встроенный ИИ, переводы (этап Э5): «Переводы» → «Перевести с ИИ (N)» → подтверждение → итог «N новых · M не заменены
 * (ручные) · 0 ошибок» → «Открыть в «Проверить ИИ»». Модель — lib/fake-ai.mjs (отвечает uk/en на каждый id промпта).
 * Строки — шесть способов оплаты «Оплата ИИ-тест 1xx»; у шестого есть устаревший РУЧНОЙ английский перевод,
 * который встроенный ИИ заменять не должен. Выключенная функция «Переводы» оставляет только ручной путь.
 */
import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { FAKE_AI_URL } from "../env.js";
import type { Api } from "../lib/api";
import { clearBatches } from "../lib/ai-batch";
import { query } from "../lib/db";
import { dialog, expect, test } from "../lib/test";

test.describe.configure({ mode: "serial" });

const PREFIX = "Оплата ИИ-тест";
const MANUAL_EN = "Manual en text";
const SHOTS = "_shots";

async function fake(path: string, body?: unknown): Promise<void> {
  await fetch(`${FAKE_AI_URL}/__e2e/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function setting(api: Api, values: Record<string, unknown>) {
  expect((await api.raw("put", "/api/admin/settings", { values })).status).toBe(200);
}

async function cleanup() {
  await query(
    "DELETE FROM content_translations WHERE entity_type = 'PAYMENT_OPTION' AND entity_id IN (SELECT id FROM payment_options WHERE title LIKE ?)",
    [`${PREFIX}%`],
  );
  await query("DELETE FROM payment_options WHERE title LIKE ?", [`${PREFIX}%`]);
}

async function seed() {
  await cleanup();
  for (let i = 1; i <= 6; i++) {
    await query(
      "INSERT INTO payment_options (id, title, description, requires_prepayment, prepayment_minor, sort_order, active) VALUES (UNHEX(REPLACE(UUID(), '-', '')), ?, NULL, FALSE, 0, ?, TRUE)",
      [`${PREFIX} ${100 + i}`, 900 + i],
    );
  }
  // The sixth has an outdated MANUAL English translation (source hash does not match).
  await query(
    "INSERT INTO content_translations (entity_type, entity_id, field, locale, text, source_hash, origin, updated_by) " +
      "SELECT 'PAYMENT_OPTION', id, 'title', 'en', ?, REPEAT('0', 64), 'MANUAL', 1 FROM payment_options WHERE title = ?",
    [MANUAL_EN, `${PREFIX} 106`],
  );
}

async function openScreen(page: Page) {
  await page.goto("/translations");
  await page.getByLabel("Поиск", { exact: true }).fill("ИИ-тест");
  await expect(page.getByTestId("tr-ai-start")).toBeVisible();
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/e5-${name}.png`, fullPage: false });
}

test.beforeAll(async () => {
  await seed();
});

test.beforeEach(async ({ api }) => {
  await clearBatches();
  await fake("reset");
  await setting(api, { "ai.feature.translation": true, "ai.feature.batch": true, "ai.dayLimitCents": null });
});

test.afterAll(async () => {
  await clearBatches();
  await cleanup();
});

test("перевести 5 строк: итог, «Проверить ИИ», ручной перевод не тронут", async ({ page, api }) => {
  await openScreen(page);
  const start = page.getByTestId("tr-ai-start");
  await expect(start).toHaveText("Перевести с ИИ (6)");
  await expect(page.getByTestId("tr-ai-caption")).toContainText("6 строк");
  await shot(page, "button");

  await fake("mode", { delayMs: 2500 });
  await start.click();
  const confirm = dialog(page, "Перевести с ИИ");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Запустить" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /пакет/ })).toBeVisible();
  await shot(page, "progress");

  const summary = page.getByTestId("tr-ai-summary");
  await expect(summary).toContainText("11 новых · 1 не заменены (ручные) · 0 ошибок", { timeout: 60_000 });
  await shot(page, "summary");

  await page.getByTestId("tr-ai-open-review").click();
  await expect(page.getByTestId("tr-filter-builtin")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(`${PREFIX} 101`).first()).toBeVisible();

  const uk = await api.translationExport("uk", "all", "PAYMENT_OPTION");
  const mine = uk.filter((i) => i.source.startsWith(PREFIX));
  expect(mine).toHaveLength(6);
  expect(mine.every((i) => i.status !== "MISSING")).toBe(true);

  const rows = await query<{ locale: string; text: string; origin: string; updated_by: number }>(
    "SELECT locale, text, origin, updated_by FROM content_translations WHERE entity_type = 'PAYMENT_OPTION' AND field = 'title' " +
      "AND entity_id IN (SELECT id FROM payment_options WHERE title LIKE ?) ORDER BY locale",
    [`${PREFIX}%`],
  );
  const manual = await query<{ text: string; origin: string; updated_by: number }>(
    "SELECT text, origin, updated_by FROM content_translations WHERE entity_type = 'PAYMENT_OPTION' AND locale = 'en' AND text = ?",
    [MANUAL_EN],
  );
  expect(manual).toHaveLength(1);
  expect(manual[0].origin).toBe("MANUAL");
  expect(manual[0].updated_by).toBeGreaterThan(0);
  const ai = rows.filter((r) => r.text !== MANUAL_EN);
  expect(ai).toHaveLength(11);
  expect(ai.every((r) => r.origin === "AI" && r.updated_by < 0)).toBe(true);
});

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [w, h] of [
  [375, 812],
  [1440, 900],
] as const) {
  test(`кнопка, ход и итог не вылезают за экран, ${w} px`, async ({ page }) => {
    await seed();
    await page.setViewportSize({ width: w, height: h });
    await openScreen(page);
    await shot(page, `button-${w}`);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);

    await fake("mode", { delayMs: 2500 });
    await page.getByTestId("tr-ai-start").click();
    const confirm = dialog(page, "Перевести с ИИ");
    await shot(page, `confirm-${w}`);
    await confirm.getByRole("button", { name: "Запустить" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /пакет/ })).toBeVisible();
    await shot(page, `progress-${w}`);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);

    await expect(page.getByTestId("tr-ai-summary")).toContainText("11 новых · 1 не заменены (ручные) · 0 ошибок", { timeout: 60_000 });
    await shot(page, `summary-${w}`);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  });
}

test("функция «Переводы» выключена: остаётся только ручной путь", async ({ page, api }) => {
  await setting(api, { "ai.feature.translation": false });
  await page.goto("/translations");
  await page.getByLabel("Поиск", { exact: true }).fill("ИИ-тест");
  await expect(page.getByRole("button", { name: /Перевести через ИИ|ChatGPT/ }).first()).toBeVisible();
  await expect(page.getByTestId("tr-ai-start")).toHaveCount(0);
});
