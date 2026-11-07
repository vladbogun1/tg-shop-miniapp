/**
 * Встроенный ИИ, центр задач (этап Э3): вкладки Идут · Проверить · Проблемы · История, шторка/панель с подробностями.
 * Задачи засеяны прямо в базу (lib/ai-admin.ts) на разные товары, чтобы строки отличались названием.
 * Владелец видит суммы и промпт; обычный админ без права «Финансы» — ни ₴, ни промпта, ни метрик, и не может
 * остановить чужую задачу.
 */
import type { Browser } from "@playwright/test";
import { ADMIN } from "../env.js";
import { clearSeeded, getAs, pageAs, postAs, productTitle, removePlainAdmin, seedJob, signInPlainAdmin } from "../lib/ai-admin";
import { PRODUCT } from "../lib/seed";
import { expect, test } from "../lib/test";

test.describe.configure({ mode: "serial" });

const NOW = new Date(Date.now() - 60_000).toISOString();
const PROMPT = "E2E-ПРОМПТ-СЕКРЕТНЫЙ-ТЕКСТ";
const titles = {} as Record<"review" | "failed" | "empty" | "applied" | "running", string>;
const ids = {} as Record<keyof typeof titles, number>;
let plainToken = "";

test.beforeAll(async () => {
  await clearSeeded();
  titles.review = await productTitle(PRODUCT.tee);
  titles.failed = await productTitle(PRODUCT.cap);
  titles.empty = await productTitle(PRODUCT.bag);
  titles.applied = await productTitle(PRODUCT.socks);
  titles.running = await productTitle(PRODUCT.scarf);
  ids.review = await seedJob({ status: "DONE", admin: ADMIN.id, subject: PRODUCT.tee, at: NOW, prompt: PROMPT });
  ids.failed = await seedJob({ status: "FAILED", admin: ADMIN.id, subject: PRODUCT.cap, at: NOW, errorCode: "MODEL_FAILED" });
  ids.empty = await seedJob({ status: "EMPTY", admin: ADMIN.id, subject: PRODUCT.bag, at: NOW });
  ids.applied = await seedJob({ status: "DONE", admin: ADMIN.id, subject: PRODUCT.socks, at: NOW, outcome: "APPLIED", applied: 8, rejected: 0 });
  ids.running = await seedJob({ status: "RUNNING", admin: ADMIN.id, subject: PRODUCT.scarf, at: NOW });
  plainToken = await signInPlainAdmin();
});

test.afterAll(async () => {
  await clearSeeded();
  await removePlainAdmin();
});

/** Имя строки по названию товара: без спецсимволов регулярки. */
function name(title: string): RegExp {
  return new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

async function openTab(page: import("@playwright/test").Page, tab: string) {
  await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
}

test("владелец: четыре вкладки раскладывают задачи, переход в ревью карточки", async ({ page }) => {
  await page.goto("/ai-tasks");
  await expect(page.getByRole("heading", { name: "ИИ-задачи" })).toBeVisible();

  // Есть что проверить — при входе сразу «Проверить» (макет 06), а не «Идут».
  await expect(page.getByRole("tab", { name: /^Проверить/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: name(titles.review) })).toBeVisible();
  await expect(page.getByRole("button", { name: name(titles.applied) })).toHaveCount(0);
  // Засеянная идущая задача — не здесь. По «Карточка ·»: e2e 40 оставляет на тот же шарф готовую «Дозаполнение»
  // (её остановили, когда единственный вызов модели уже шёл), и она честно ждёт проверки.
  await expect(page.getByRole("button", { name: new RegExp(`Карточка · ${name(titles.running).source}`) })).toHaveCount(0);

  await openTab(page, "Идут");
  await expect(page.getByRole("button", { name: name(titles.running) })).toBeVisible();
  await expect(page.getByRole("button", { name: name(titles.review) })).toHaveCount(0);

  await openTab(page, "Проблемы");
  await expect(page.getByRole("button", { name: name(titles.failed) })).toBeVisible();
  await expect(page.getByRole("button", { name: name(titles.empty) })).toBeVisible();

  await openTab(page, "История");
  await expect(page.getByRole("button", { name: name(titles.applied) })).toBeVisible();

  await openTab(page, "Проверить");
  await page.getByRole("button", { name: name(titles.review) }).click();
  const detail = page.getByTestId("ai-task-detail");
  await expect(detail).toBeVisible();
  // владельцу видны сумма и промпт
  await expect(detail.getByTestId("ai-task-cost")).toContainText("₴");
  await expect(detail.getByText("Промпт", { exact: true })).toBeVisible();
  await detail.getByRole("link", { name: "Открыть проверку" }).click();
  await expect(page).toHaveURL(new RegExp(`/cards/ai-review/${ids.review}`));
});

test("обычный админ видит задачи, но ни одной суммы, ни промпта, ни метрик ИИ", async ({ browser }: { browser: Browser }) => {
  const page = await pageAs(browser, plainToken);
  try {
    await page.goto("/ai-tasks");
    await openTab(page, "Проверить");
    const row = page.getByRole("button", { name: name(titles.review) });
    await expect(row).toBeVisible();
    await expect(page.getByTestId("ai-task-list")).not.toContainText("₴");
    await row.click();
    const detail = page.getByTestId("ai-task-detail");
    await expect(detail).toBeVisible();
    await expect(detail).not.toContainText("₴");
    await expect(detail.getByText("Промпт", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("ai-task-cost")).toHaveCount(0);
    await expect(page.getByText(PROMPT)).toHaveCount(0);

    // сервер: без денег в ответе, метрики закрыты, чужую остановку отклоняет
    const job = await getAs(plainToken, `/api/admin/ai/jobs/${ids.review}`);
    expect(job.status).toBe(200);
    expect(JSON.stringify(job.body)).not.toMatch(/costMinor|costMicroUsd|"prompt"/);
    expect((await getAs(plainToken, "/api/admin/ai/metrics/summary")).status).toBe(403);
    expect((await postAs(plainToken, `/api/admin/ai/jobs/${ids.running}/cancel`)).status).toBe(403);

    await page.goto("/metrics");
    await expect(page.getByRole("button", { name: "Предзаказы", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "ИИ", exact: true })).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

test("виджет на доске: админу — «ИИ можно запускать», владельцу — расход", async ({ page, browser }) => {
  await page.goto("/");
  const owner = page.getByTestId("ai-widget");
  await expect(owner).toContainText("Расход");
  await expect(owner).toContainText("ждёт проверки");

  const plain = await pageAs(browser, plainToken);
  try {
    await plain.goto("/");
    const w = plain.getByTestId("ai-widget");
    await expect(w).toContainText("ждёт проверки");
    await expect(w).not.toContainText("₴");
  } finally {
    await plain.context().close();
  }
});
