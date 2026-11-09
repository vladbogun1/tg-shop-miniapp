/**
 * «Поставка с ИИ» черновиком на сервере: «Поставки» → «Из накладной (ИИ)» → скрин → «Разобрать с ИИ» → экран черновика
 * с ходом работы → сервер сам читает (fake-ai: шесть строк, CNY), сопоставляет, пишет карточки новых товаров →
 * «Готово — проверьте» → курс/цены, если НБУ не ответил → «Принять» → поставка; новые товары — скрытые, остаток 0.
 * Плюс: со страницы можно уйти и вернуться — прогресс не теряется. Модель — lib/fake-ai.mjs, файл — MinIO стека.
 */
import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { FAKE_AI_URL } from "../env.js";
import type { Api } from "../lib/api";
import { query } from "../lib/db";
import { screenshotPng } from "../lib/png";
import { dialog, expect, test } from "../lib/test";

test.describe.configure({ mode: "serial" });

const SHOTS = "_shots";
const NO_S3 = process.env.E2E_EXTERNAL_DB === "1" && process.env.E2E_MINIO !== "1";
const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1440];

async function fake(path: string, body?: unknown): Promise<void> {
  await fetch(`${FAKE_AI_URL}/__e2e/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

async function setting(api: Api, values: Record<string, unknown>) {
  expect((await api.raw("put", "/api/admin/settings", { values })).status).toBe(200);
}

/** fullPage меняет размер окна — открытый список «⋯» от этого закрывается, его снимаем видимой частью. */
async function shot(page: Page, name: string, fullPage = true) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/draft-${name}.png`, fullPage });
}

async function cleanup() {
  await query("DELETE FROM supply_drafts");
  await query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE feature IN ('SUPPLY_EXTRACT', 'SUPPLY_MATCH', 'CARD'))");
  await query("DELETE FROM ai_jobs WHERE feature IN ('SUPPLY_EXTRACT', 'SUPPLY_MATCH', 'CARD')");
  await query("DELETE FROM ai_files");
}

test.beforeEach(async ({ api }) => {
  await cleanup();
  await fake("reset");
  await setting(api, { "ai.feature.supply": true, "ai.feature.card": true, "ai.dayLimitCents": null });
});

test.afterAll(cleanup);

/** Загрузить скрин и нажать «Разобрать с ИИ»; возвращает id черновика (экран уже на нём). */
async function startDraft(page: Page): Promise<number> {
  await page.goto("/preorders");
  await page.getByRole("button", { name: "Из накладной (ИИ)" }).click();
  const modal = dialog(page, "Поставка с ИИ");
  await modal.getByTestId("supply-ai-file-input").setInputFiles({ name: "order.png", mimeType: "image/png", buffer: screenshotPng() });
  const go = modal.getByRole("button", { name: "Разобрать с ИИ" });
  await expect(go).toBeEnabled({ timeout: 30_000 });
  await go.click();
  await page.waitForURL(/\/preorders\/drafts\/\d+$/);
  return Number(/(\d+)$/.exec(page.url())?.[1]);
}

/** Черновики в «Внимание» → «Поставки ждут проверки». */
async function inboxDrafts(api: Api): Promise<string[]> {
  const g = (await api.inbox()).groups.find((x) => x.id === "SUPPLY_DRAFT");
  return g ? g.items.map((i) => i.entityId) : [];
}

const ready = (page: Page) => expect(page.getByText("Готово — проверьте").first()).toBeVisible({ timeout: 120_000 });

// Сначала экраны: после «Принять» в следующем черновике те же строки уже найдутся в каталоге (новых товаров не будет).
test("экраны черновика на 7 ширинах: без бокового скролла", async ({ page }) => {
  test.skip(NO_S3, "нужен MinIO стека");
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await startDraft(page);
  await ready(page);
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`/preorders/drafts/${id}`);
    await expect(page.getByText("Позиции накладной").first()).toBeVisible();
    await expect(page.getByText(/Готово \d+ из \d+/)).toBeVisible();
    await shot(page, `review-${w}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `ширина ${w}`).toBe(false);
  }
  // «⋯» шапки: на ПК — список у кнопки, на телефоне — шторка снизу.
  for (const [w, role] of [[1440, "menuitem"], [390, "button"]] as const) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`/preorders/drafts/${id}`);
    await page.getByRole("button", { name: "Ещё действия" }).click();
    await expect(page.getByRole(role, { name: "Удалить черновик…" })).toBeVisible();
    await shot(page, `menu-${w}`, false);
    await page.keyboard.press("Escape");
  }
  for (const w of [360, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/preorders?tab=drafts");
    await expect(page.getByText("Готово — проверьте").first()).toBeVisible();
    await shot(page, `list-${w}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `список ${w}`).toBe(false);
  }
});

test("одна кнопка → ИИ сам всё делает → «Готово — проверьте» → «Принять» создаёт поставку и скрытые товары", async ({ page, api }) => {
  test.skip(NO_S3, "нужен MinIO стека");
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await startDraft(page);
  await expect(page.getByText("Читает накладную")).toBeVisible();
  await expect(page.getByText(/Можно закрыть страницу/)).toBeVisible();
  await shot(page, "working-1440");

  // Ушли со страницы и вернулись по ссылке из списка — черновик на месте, работа идёт дальше.
  await page.goto("/preorders?tab=drafts");
  await page.locator(`a[href="/preorders/drafts/${id}"]`).click();
  await page.waitForURL(new RegExp(`/preorders/drafts/${id}$`));
  await ready(page);
  await shot(page, "ready-1440");

  // Готовый черновик ждёт в «Внимание»; строка ведёт на него.
  expect(await inboxDrafts(api)).toContain(String(id));
  await page.goto("/inbox");
  const group = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: /^Поставки ждут проверки/ }) });
  await expect(group).toBeVisible();
  await shot(page, "inbox-1440");
  await group.getByRole("button", { name: "Открыть черновик" }).first().click();
  await page.waitForURL(new RegExp(`/preorders/drafts/${id}$`));
  await ready(page);

  // НБУ в стеке может не ответить — тогда курс вводим сами, пустые цены экран предложит по курсу.
  const rate = page.getByLabel("Курс к ₴");
  if (!(await rate.inputValue())) await rate.fill("5.8");
  const prices = page.getByLabel("Цена, ₴");
  const n = await prices.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) expect(Number(await prices.nth(i).inputValue())).toBeGreaterThan(0);

  // Имена новых товаров уникальны на прогон (повторный прогон на той же базе не упрётся в «уже в каталоге»).
  const tag = String(Date.now()).slice(-6);
  const titles = page.locator("[id^=prod-]").getByLabel("Название");
  for (let i = 0; i < (await titles.count()); i++) await titles.nth(i).fill(`${await titles.nth(i).inputValue()} ${tag}`);
  await page.getByText("Карточка от ИИ").first().click();
  await expect(page.getByText("Описание (рус.)").first()).toBeVisible();
  await expect(page.getByText("Правки сохранены")).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText("Всё решено").first(), "остались нерешённые пункты").toBeVisible();
  await shot(page, "ready-todo-1440");
  await page.getByRole("button", { name: "Принять" }).last().click();
  // Сумма в fake-ai может не сойтись с итогом — тогда экран спросит, всё ли равно принять.
  const mismatch = dialog(page, "Сумма не сходится");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) await mismatch.getByRole("button", { name: "Всё равно принять" }).click();
  await dialog(page, "Создать поставку?").getByRole("button", { name: "Создать" }).click();
  // Новые товары созданы скрытыми — экран сам показывает следующий шаг и ссылку на поставку.
  await expect(page.getByText("Поставка создана").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "accepted-1440");
  await page.getByRole("link", { name: /Открыть поставку/ }).click();
  await page.waitForURL(/\/preorders\/\d+$/, { timeout: 30_000 });
  // «⋯» поставки на ПК — список у кнопки, не шторка.
  await page.getByRole("button", { name: "Ещё действия" }).click();
  await expect(page.getByRole("menuitem", { name: "Отменить поставку…" })).toBeVisible();
  await shot(page, "batch-menu-1440", false);
  await page.keyboard.press("Escape");

  const made = await query<{ active: number; stock: number }>("SELECT active, stock FROM products WHERE title LIKE ?", [`% ${tag}`]);
  expect(made.length).toBe(n);
  expect(made.every((p) => !p.active && p.stock === 0)).toBe(true);
  const [d] = await query<{ status: string }>("SELECT status FROM supply_drafts WHERE id = ?", [id]);
  expect(d.status).toBe("ACCEPTED");
  // Принятый черновик уходит из «Внимание».
  expect(await inboxDrafts(api)).not.toContain(String(id));
});
