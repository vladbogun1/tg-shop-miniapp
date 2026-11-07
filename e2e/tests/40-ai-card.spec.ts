/**
 * Встроенный ИИ, карточка товара (этап Э2): «Заполнить с ИИ» → ход → страница проверки → «Применить» → запись.
 * Модель здесь — lib/fake-ai.mjs (бэкенд ходит на неё через AI_MINIMAX_BASE_URL), настоящий ИИ не вызывается.
 *
 * Сценарии: нормальный ответ до записи; ИИ выключен — только ручная кнопка; двойной запуск — «Уже идёт»;
 * ответ без данных — «Показать ответ» и ручной путь. Запись проверяется по выгрузке карточки, а не только по экрану.
 */
import type { Locator, Page } from "@playwright/test";
import { FAKE_AI_URL } from "../env.js";
import type { Api } from "../lib/api";
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

interface ExportItem {
  id: string;
  title: string;
  description?: string | null;
  cardMeta?: { sources?: string[]; overall?: number; importedAt?: string } | null;
}

const KEY = "ai.feature.completion";

async function card(api: Api): Promise<ExportItem> {
  const res = await api.raw("get", `/api/admin/cards/export?status=all&ids=${PRODUCT.scarf}`);
  expect(res.status).toBe(200);
  const raw = res.body as unknown;
  const list = (Array.isArray(raw) ? raw : ((raw as { items?: ExportItem[] }).items ?? [])) as ExportItem[];
  return list.find((i) => i.id === PRODUCT.scarf)!;
}

async function fake(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${FAKE_AI_URL}/__e2e/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}

/** Функция «Дозаполнение карточек» включена/выключена владельцем (null — как по умолчанию). */
async function feature(api: Api, on: boolean | null) {
  const res = await api.raw("put", "/api/admin/settings", { values: { [KEY]: on } });
  expect(res.status).toBe(200);
}

/** Строка карточки в «Карточки» → панель → «Переоформить с ИИ» → окно с входом во встроенный ИИ. */
async function openEntry(page: Page, title: string): Promise<Locator> {
  await page.goto("/cards");
  await page.getByRole("button", { name: /^Готово\s*\d+$/ }).click();
  await page.getByLabel("Поиск карточек").fill(title);
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Переоформить с ИИ" }).click();
  const modal = dialog(page, `: ${title}`);
  await expect(modal).toBeVisible();
  return modal;
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await fake("reset", {});
});

test.afterAll(async ({ api }) => {
  await feature(api, null);
  await fake("reset", {});
});

test("ИИ выключен: вместо кнопки причина, остаётся только ручной путь", async ({ page, api }) => {
  await feature(api, null);
  const title = (await card(api)).title;
  const modal = await openEntry(page, title);
  await expect(modal.getByText("Эта функция ИИ выключена")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Через ChatGPT вручную" })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Заполнить с ИИ", exact: true })).toHaveCount(0);
  expect((await fake("requests")) as unknown[]).toHaveLength(0);
});

test("запуск → ход → проверка → «Применить»: описание и журнал записаны", async ({ page, api }) => {
  await feature(api, true);
  const before = await card(api);
  const text = `E2E-ИИ ${Date.now()}. ${before.description ?? ""}`.trim();
  await fake("mode", { mode: "normal", description: text });

  const modal = await openEntry(page, before.title);
  await modal.getByRole("button", { name: "Заполнить с ИИ", exact: true }).click();
  // Карточка уже готова — перед запуском просят подтвердить, что ничего не изменится без «Применить».
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.getByText("Готово — проверьте, что предложил ИИ")).toBeVisible();
  await page.getByRole("button", { name: "Открыть проверку" }).click();

  await expect(page).toHaveURL(/\/cards\/ai-review\/\d+$/);
  await expect(page.getByText(/^Выбрано \d+ из \d+$/)).toBeVisible();
  // Описание уже было — оно в группе «Заменит значение»: по умолчанию не отмечено, группа свёрнута.
  const box = page.getByLabel("Применить: Описание");
  if (!(await box.isVisible())) await page.getByRole("button", { name: /Заменит значение/ }).click();
  await box.check();
  await expect(page.getByText("Выбрано 1 из")).toBeVisible();
  await page.getByRole("button", { name: "Применить (1)" }).click();
  await expect(page.getByText("Результат применён")).toBeVisible();

  const after = await card(api);
  expect(after.description).toBe(text);
  expect(after.cardMeta?.sources).toContain("https://example.com/spec");
  expect(after.cardMeta?.importedAt).toBeTruthy();
  expect(((await fake("requests")) as unknown[]).length).toBe(1);
});

test("ответ без данных: «Показать ответ» и ручной путь", async ({ page, api }) => {
  await feature(api, true);
  await fake("mode", { mode: "bad" });
  const before = await card(api);
  const modal = await openEntry(page, before.title);
  await modal.getByRole("button", { name: "Заполнить с ИИ", exact: true }).click();
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.getByText("Ответ ИИ не удалось прочитать.")).toBeVisible();
  await page.getByRole("button", { name: "Показать ответ" }).click();
  await expect(page.getByText("Не могу найти эту модель")).toBeVisible();
  await expect(page.getByRole("button", { name: "Через ChatGPT вручную" }).last()).toBeVisible();
  expect((await card(api)).description).toBe(before.description);
});

test("двойной запуск: второй не плодит задачу, показывает «Уже идёт»", async ({ page, api }) => {
  await feature(api, true);
  await fake("mode", { mode: "normal", delayMs: 8000 });
  const before = await card(api);
  const hex = "p" + PRODUCT.scarf.replace(/-/g, "");
  // Первый запуск — «из другой вкладки»: напрямую в API.
  const first = await api.raw("post", "/api/admin/ai/card-jobs", {
    productId: PRODUCT.scarf,
    created: false,
    subjectVersion: "e2e",
    prompt: JSON.stringify({ [hex]: {} }),
    promptVersion: "e2e",
  });
  expect(first.status).toBe(200);
  const jobId = (first.body as { id: number }).id;

  const modal = await openEntry(page, before.title);
  await modal.getByRole("button", { name: "Заполнить с ИИ", exact: true }).click();
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.getByText(/^Уже идёт:/)).toBeVisible();

  const active = await api.raw("get", "/api/admin/ai/jobs/active");
  expect((active.body as unknown as { subjectId: string }[]).filter((j) => j.subjectId === PRODUCT.scarf)).toHaveLength(1);

  await api.raw("post", `/api/admin/ai/jobs/${jobId}/cancel`);
  await expect
    .poll(async () => ((await api.raw("get", `/api/admin/ai/jobs/${jobId}`)).body as { status: string }).status, { timeout: 20_000 })
    .not.toMatch(/^(QUEUED|RUNNING)$/);
});
