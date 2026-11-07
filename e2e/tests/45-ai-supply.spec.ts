/**
 * Встроенный ИИ, «Поставка со скринов и PDF» (этап Э6): «Поставки» → «Из накладной (ИИ)» → скрин заказа → «Прочитать с ИИ»
 * → плашка «Прочитано 6 из 6, сумма сошлась» и шесть строк → товар выбран → «Дальше — форма поставки» с подсветкой
 * «из ИИ, проверьте». Модель — lib/fake-ai.mjs (шесть строк накладной); файл уходит в настоящий MinIO стека
 * (docker-compose.e2e.yml; в CI — MinIO, поднятый шагом job-а, флаг E2E_MINIO=1). Без MinIO (внешняя БД без флага)
 * сценарии загрузки пропускаются. Выключенная функция «Поставки» оставляет только ручной путь.
 */
import { mkdirSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { FAKE_AI_URL } from "../env.js";
import { pageAs, removePlainAdmin, signInPlainAdmin } from "../lib/ai-admin";
import type { Api } from "../lib/api";
import { query } from "../lib/db";
import { screenshotPng } from "../lib/png";
import { PREORDER } from "../lib/seed";
import { dialog, expect, test, toast } from "../lib/test";

test.describe.configure({ mode: "serial" });

const SHOTS = "_shots";
const NO_S3 = process.env.E2E_EXTERNAL_DB === "1" && process.env.E2E_MINIO !== "1";

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

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/e6-${name}.png`, fullPage: false });
}

async function cleanup() {
  await query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE feature = 'SUPPLY_EXTRACT')");
  await query("DELETE FROM ai_jobs WHERE feature = 'SUPPLY_EXTRACT'");
  await query("DELETE FROM ai_files");
}

test.beforeEach(async ({ api }) => {
  await cleanup();
  await fake("reset");
  await setting(api, { "ai.feature.supply": true, "ai.dayLimitCents": null });
});

test.afterAll(async () => {
  await cleanup();
  await removePlainAdmin();
});

async function openReader(page: Page) {
  await page.goto("/preorders");
  await page.getByRole("button", { name: "Из накладной (ИИ)" }).click();
  const modal = dialog(page, "Поставка с ИИ");
  await expect(modal).toBeVisible();
  return modal;
}

/** Обычный админ (без «Финансов») в своём браузере. */
async function plainPage(browser: Browser) {
  return pageAs(browser, await signInPlainAdmin(), { width: 1440, height: 900 });
}

test("скрин → «Прочитать с ИИ» → шесть строк → форма поставки с пометкой «из ИИ»", async ({ page }) => {
  test.skip(NO_S3, "нужен MinIO стека (в CI его нет)");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/preorders");
  await page.getByRole("button", { name: "Из накладной (ИИ)" }).click();
  const modal = dialog(page, "Поставка с ИИ");
  await expect(modal).toBeVisible();

  await modal.getByTestId("supply-ai-file-input").setInputFiles({ name: "order.png", mimeType: "image/png", buffer: screenshotPng() });
  await expect(modal.getByText("Файлы хранятся 7 дней и удаляются сами")).toBeVisible();
  const read = modal.getByRole("button", { name: "Прочитать с ИИ" });
  await expect(read).toBeEnabled();
  await shot(page, "uploader");

  await read.click();
  await expect(modal.getByText("Прочитано 6 из 6, сумма сошлась")).toBeVisible({ timeout: 60_000 });
  await expect(modal.getByText("Строки документа: 6")).toBeVisible();
  await modal.getByText("Прочитано 6 из 6, сумма сошлась").scrollIntoViewIfNeeded();
  await shot(page, "result-1440");

  // Одну строку сопоставляем с товаром, остальные пропускаем: в форму поставки идут только сопоставленные.
  await modal.getByRole("button", { name: "Выбрать товар" }).first().click();
  const pick = dialog(page, "Какой это товар");
  await pick.getByLabel("Поиск товара").fill(PREORDER.productTitle);
  await pick.getByRole("button", { name: new RegExp(PREORDER.productTitle) }).click();
  // Строка 1 уже сопоставлена, у неё тоже есть «Пропустить» — поэтому берём нерешённые с конца.
  for (let i = 0; i < 5; i++) await modal.getByRole("button", { name: "Пропустить" }).last().click();

  await modal.getByRole("button", { name: "Дальше — форма поставки" }).click();
  const form = dialog(page, "Новая поставка");
  await expect(form.getByText(PREORDER.productTitle)).toBeVisible();
  await expect(form.getByText("из ИИ, проверьте")).toBeVisible();
  await shot(page, "form");
  await form.getByRole("button", { name: "Проверено" }).click();
  await expect(form.getByText("из ИИ, проверьте")).toHaveCount(0);
});

test("телефон 375 px: загрузчик и результат с метками помещаются в экран", async ({ page }) => {
  test.skip(NO_S3, "нужен MinIO стека (в CI его нет)");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/preorders");
  await page.getByRole("button", { name: "Из накладной (ИИ)" }).click();
  const modal = dialog(page, "Поставка с ИИ");
  await modal.getByTestId("supply-ai-file-input").setInputFiles({ name: "order.png", mimeType: "image/png", buffer: screenshotPng() });
  const read = modal.getByRole("button", { name: "Прочитать с ИИ" });
  await expect(read).toBeEnabled();
  await shot(page, "uploader-375");
  await read.click();
  const banner = modal.getByText("Прочитано 6 из 6, сумма сошлась");
  await expect(banner).toBeVisible({ timeout: 60_000 });
  await banner.scrollIntoViewIfNeeded();
  await shot(page, "result-375");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("функция «Поставки» выключена: чтения с ИИ нет, остаётся ручной путь", async ({ page, api }) => {
  await setting(api, { "ai.feature.supply": false });
  await page.goto("/preorders");
  await page.getByRole("button", { name: "Из накладной (ИИ)" }).click();
  const modal = dialog(page, "Поставка с ИИ");
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: "Прочитать с ИИ" })).toHaveCount(0);
  await shot(page, "off");
});

test("обычный админ (без «Финансов») читает скрин с ИИ: строки видит, цену задачи — нет", async ({ browser }) => {
  test.skip(NO_S3, "нужен MinIO");
  const page = await plainPage(browser);
  const modal = await openReader(page);
  await modal.getByTestId("supply-ai-file-input").setInputFiles({ name: "order.png", mimeType: "image/png", buffer: screenshotPng() });
  const read = modal.getByRole("button", { name: "Прочитать с ИИ" });
  await expect(read).toBeEnabled();
  // Под кнопкой только время: оценку в гривнах сервер обычному админу не отдаёт.
  await expect(modal.getByText(/≈|не больше/)).toHaveCount(0);
  await read.click();
  await expect(modal.getByText("Прочитано 6 из 6, сумма сошлась")).toBeVisible({ timeout: 60_000 });
  await expect(modal.getByText("Строки документа: 6")).toBeVisible();
  await page.context().close();
});

test("лимит 10 картинок: счётчик, отказ с именами лишних файлов, кнопки выбора выключены", async ({ page }) => {
  test.skip(NO_S3, "нужен MinIO");
  await page.setViewportSize({ width: 1440, height: 900 });
  const modal = await openReader(page);
  const png = screenshotPng();
  const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `p${i + 1}.png`, mimeType: "image/png", buffer: png }));
  await modal.getByTestId("supply-ai-file-input").setInputFiles(eleven);
  await expect(toast(page, /не больше 10 картинок.*Не добавлены: p11\.png/)).toBeVisible();
  await expect(modal.getByTestId("supply-ai-files-count")).toHaveText("10 из 10 картинок");
  await expect(modal.getByRole("button", { name: "Прочитать с ИИ" })).toBeEnabled({ timeout: 30_000 });
  await expect(modal.getByRole("button", { name: "Выбрать файлы" })).toBeDisabled();
  await shot(page, "limit-1440");
});

test("прогресс загрузки: полоса с процентами, пока файл уходит на сервер", async ({ page }) => {
  test.skip(NO_S3, "нужен MinIO");
  await page.setViewportSize({ width: 375, height: 812 });
  // Ответ сервера задерживаем: полоса успевает показаться и дойти до 100 %, пока ждём ответ.
  await page.route("**/api/admin/ai/files", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const modal = await openReader(page);
  await modal.getByTestId("supply-ai-file-input").setInputFiles({ name: "order.png", mimeType: "image/png", buffer: screenshotPng() });
  const bar = modal.getByRole("progressbar", { name: "Загрузка order.png" });
  await expect(bar).toBeVisible();
  await expect(modal.getByTestId("supply-ai-pending")).toContainText(/загружается \d+ %|в очереди/);
  await shot(page, "progress-375");
  await expect(bar).toHaveCount(0, { timeout: 30_000 });
  await expect(modal.getByTestId("supply-ai-files-count")).toHaveText("1 из 10 картинок");
});
