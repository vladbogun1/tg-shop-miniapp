/**
 * Встроенный ИИ, «Поставка со скринов и PDF» (этап Э6): «Поставки» → «Из накладной (ИИ)» → скрин заказа → «Прочитать с ИИ»
 * → плашка «Прочитано 6 из 6, сумма сошлась» и шесть строк → товар выбран → «Дальше — форма поставки» с подсветкой
 * «из ИИ, проверьте». Модель — lib/fake-ai.mjs (шесть строк накладной); файл уходит в настоящий MinIO стека
 * (docker-compose.e2e.yml). В CI (внешняя БД) MinIO нет — сценарий загрузки пропускается. Выключенная функция
 * «Поставки» оставляет только ручной путь.
 */
import { mkdirSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { FAKE_AI_URL } from "../env.js";
import type { Api } from "../lib/api";
import { query } from "../lib/db";
import { PREORDER } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

test.describe.configure({ mode: "serial" });

const SHOTS = "_shots";
const NO_S3 = process.env.E2E_EXTERNAL_DB === "1";

/** Серый PNG 240×320: настоящий файл, чтобы сервер узнал его по содержимому, а не по имени. */
function screenshotPng(): Buffer {
  const w = 240;
  const h = 320;
  const raw = Buffer.alloc((w + 1) * h, 0xe0);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth, colour type 0 = grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

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
});

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
