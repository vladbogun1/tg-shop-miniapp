/**
 * Встроенный ИИ, пакет (этап Э4): выбрать товары в списке → «Заполнить с ИИ (N)» → подтверждение → полоса хода →
 * итог. Модель — lib/fake-ai.mjs. Сценарии на пяти товарах: ход и итог; пауза по лимиту и «Продолжить»; сбои,
 * «Повторить неудачные»; «Принять безопасное» и «Отменить применение». Обычный админ видит штуки и минуты, без ₴.
 * fake-ai не ищет в интернете, а «безопасное» требует поиск, поэтому задачам пакета «поиск был» ставится в базе.
 */
import type { Browser, Page } from "@playwright/test";
import { FAKE_AI_URL } from "../env.js";
import type { Api } from "../lib/api";
import { blankDescriptions, clearBatches, markSearched } from "../lib/ai-batch";
import { clearSeeded, pageAs, productTitle, removePlainAdmin, signInPlainAdmin } from "../lib/ai-admin";
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test, toast } from "../lib/test";

test.describe.configure({ mode: "serial" });

const IDS = [PRODUCT.tee, PRODUCT.cap, PRODUCT.bag, PRODUCT.socks, PRODUCT.scarf];
const titles: string[] = [];
let plainToken = "";

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

async function description(api: Api, id: string): Promise<string | null> {
  const res = await api.raw("get", `/api/admin/cards/export?status=all&ids=${id}`);
  const raw = res.body as unknown;
  const list = (Array.isArray(raw) ? raw : ((raw as { items?: { id: string; description?: string | null }[] }).items ?? [])) as {
    id: string;
    description?: string | null;
  }[];
  return list.find((i) => i.id === id)?.description ?? null;
}

test.beforeAll(async () => {
  await clearSeeded();
  for (const id of IDS) titles.push(await productTitle(id));
  plainToken = await signInPlainAdmin();
});

test.beforeEach(async ({ api }) => {
  await clearBatches();
  await blankDescriptions(IDS);
  await fake("reset");
  await setting(api, { "ai.feature.completion": true, "ai.feature.batch": true, "ai.dayLimitCents": null });
});

test.afterAll(async () => {
  await clearBatches();
  await removePlainAdmin();
});

/** Отметить товары в списке и открыть окно подтверждения пакета. */
async function selectAndOpen(page: Page, count: number) {
  await page.goto("/products");
  // На телефоне чекбоксов нет, пока не нажато «Выбрать».
  const enter = page.getByRole("button", { name: "Выбрать", exact: true });
  if (await enter.isVisible()) await enter.click();
  for (const title of titles.slice(0, count)) await page.getByLabel(`Выбрать ${title}`).locator("visible=true").first().check();
  await page.getByRole("button", { name: `Заполнить с ИИ (${count})` }).click();
  const modal = dialog(page, "Заполнить с ИИ пакетом");
  await expect(modal).toBeVisible();
  return modal;
}

async function start(page: Page, count = 5) {
  const modal = await selectAndOpen(page, count);
  await modal.getByRole("button", { name: "Запустить" }).click();
  await expect(modal).toHaveCount(0);
}

const bar = (page: Page) => page.getByRole("status").filter({ hasText: /пакет|Пауза/ });
const summary = (page: Page) => page.getByText(/^Пакет (завершён|остановлен):$/).locator("xpath=../..");

test("ход: подтверждение с суммой, полоса «N из 5», итог «Готово 5»", async ({ page }) => {
  await fake("mode", { delayMs: 800 });
  const modal = await selectAndOpen(page, 5);
  await expect(modal).toContainText("5 карточек");
  await expect(modal).toContainText("₴");
  await modal.getByRole("button", { name: "Запустить" }).click();

  await expect(bar(page)).toContainText(/Идёт пакет: \d из 5/);
  await expect(bar(page).getByRole("button", { name: "Остановить" })).toBeVisible();
  await expect(summary(page)).toContainText("Готово 5", { timeout: 90_000 });
  await expect(summary(page).getByRole("button", { name: /Проверить \(5\)/ })).toBeVisible();
});

test("лимит: пауза «Дневной лимит исчерпан», после снятия лимита «Продолжить» доводит пакет", async ({ page, api }) => {
  // Сервер не берёт пакет, если лимит уже кончился; поэтому лимит «кончается» уже после запуска, пока идут первые задачи.
  await fake("mode", { delayMs: 2500 });
  await start(page, 5);
  await setting(api, { "ai.dayLimitCents": 1 });

  await expect(bar(page)).toContainText("Дневной лимит исчерпан", { timeout: 60_000 });
  await fake("mode", { delayMs: 0 });
  await setting(api, { "ai.dayLimitCents": null });
  await bar(page).getByRole("button", { name: "Продолжить" }).click();
  await expect(summary(page)).toContainText("Готово 5", { timeout: 90_000 });
});

test("сбои: три подряд ставят паузу, «Закончить» и «Повторить неудачные» запускают заново", async ({ page }) => {
  await fake("mode", { mode: "error" });
  await start(page, 5);
  await expect(bar(page)).toContainText("Три сбоя подряд", { timeout: 60_000 });
  await bar(page).getByRole("button", { name: "Закончить" }).click();
  await expect(summary(page)).toContainText(/Сбой \d/);

  await fake("reset");
  await summary(page).getByRole("button", { name: /Повторить неудачные \(\d\)/ }).click();
  await expect(summary(page)).toContainText("Готово", { timeout: 90_000 });
});

test("«Принять безопасное»: точные числа, запись описаний, «Отменить применение» возвращает пусто", async ({ page, api }) => {
  await start(page, 5);
  await expect(summary(page)).toContainText("Готово 5", { timeout: 90_000 });
  await markSearched();
  await page.reload();

  await summary(page).getByRole("button", { name: "Принять безопасное" }).click();
  const modal = dialog(page, "Принять безопасное");
  await expect(modal).toContainText("5 полей в 5 карточках");
  await modal.getByRole("button", { name: "Принять", exact: true }).click();
  await expect(modal).toContainText("Записано полей: 5, карточек: 5");
  expect(await description(api, PRODUCT.tee)).toContain("E2E-ИИ");

  await modal.getByRole("button", { name: "Отменить применение" }).click();
  await expect(toast(page, /Применение отменено/)).toBeVisible();
  await expect.poll(() => description(api, PRODUCT.tee)).toBeNull();
});

test("обычный админ: штуки и минуты в подтверждении, без ₴", async ({ browser }: { browser: Browser }) => {
  const page = await pageAs(browser, plainToken);
  try {
    const modal = await selectAndOpen(page, 3);
    await expect(modal).toContainText("3 карточек");
    await expect(modal).toContainText(/мин|минуты/);
    await expect(modal).not.toContainText("₴");
  } finally {
    await page.context().close();
  }
});

/** Снимки для проверки вёрстки (`E4_SHOTS=1`): подтверждение, полоса, итог, лента на 375 и 1440 px. */
for (const [name, width, height] of [["375", 375, 812], ["1440", 1440, 900]] as const) {
  test(`снимки ${name}`, async ({ page }) => {
    test.skip(!process.env.E4_SHOTS, "только по E4_SHOTS=1");
    const dir = process.env.E4_SHOTS_DIR ?? "../_shots";
    await page.setViewportSize({ width, height });
    await fake("mode", { delayMs: 2500 });
    const modal = await selectAndOpen(page, 5);
    await expect(modal).toContainText("5 карточек");
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/e4-confirm-${name}.png` });
    await modal.getByRole("button", { name: "Запустить" }).click();
    await expect(bar(page)).toContainText(/Идёт пакет: \d из 5/);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/e4-bar-${name}.png` });
    await expect(summary(page)).toContainText("Готово 5", { timeout: 90_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/e4-summary-${name}.png` });
    await summary(page).getByRole("button", { name: /Проверить \(5\)/ }).click();
    await expect(dialog(page, "Быстрая проверка")).toContainText("осталось 5");
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/e4-feed-${name}.png` });
  });
}
