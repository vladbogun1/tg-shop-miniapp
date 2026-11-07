/**
 * «Настройки» → «ИИ» (макет docs/ai-admin/mockups/07-settings.html): у финансиста блок есть, лимиты в долларах
 * с гривнами рядом, «Сохранить» только у чисел, выключатели сохраняются сразу, «Остановить идущие» — только когда
 * что-то идёт, «Ещё» → «Дополнительно» и «История изменений». Обычный админ блока не видит, а сервер отвечает 403.
 */
import type { Page } from "@playwright/test";
import { getAs, putAs, removePlainAdmin, signInPlainAdmin, pageAs } from "../lib/ai-admin";
import type { Api } from "../lib/api";
import { expect, test, toast } from "../lib/test";

test.describe.configure({ mode: "serial" });

const MONTH = "ai.monthLimitCents";
const TRANSLATION = "ai.feature.translation";

async function value(api: Api, key: string) {
  const res = await api.raw("get", "/api/admin/settings");
  const items = (res.body as unknown as { items: { key: string; value: unknown; overridden: boolean }[] }).items;
  return items.find((i) => i.key === key);
}

const field = (page: Page, key: string) => page.locator(`[id="setting-${key}"]`);

async function restore(api: Api) {
  await api.raw("put", "/api/admin/settings", { values: { [MONTH]: null, [TRANSLATION]: null } });
}


test.afterAll(async ({ api }) => {
  await restore(api);
  await removePlainAdmin();
});

test("финансист: лимит в долларах с гривнами, «Сохранить» у чисел, выключатель сохраняется сразу", async ({ page, api }) => {
  await restore(api);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  const ai = page.locator("#group-ai");
  await expect(ai.getByRole("heading", { name: "Лимиты" })).toBeVisible();
  // Порядок блоков — как в макете.
  const titles = await ai.locator("h3").allTextContents();
  expect(titles).toEqual(["Состояние", "Лимиты", "Функции", "Поиск", "Уведомления", "Ещё"]);

  // Выключатель «Переводы» — сразу на сервер, без «Сохранить».
  const switchOf = field(page, TRANSLATION).getByRole("switch");
  const before = (await value(api, TRANSLATION))!.value as boolean;
  await switchOf.click();
  await expect(toast(page, "Настройка сохранена")).toBeVisible();
  await expect.poll(async () => (await value(api, TRANSLATION))!.value).toBe(!before);
  await expect(page.getByText(/^Несохранённых изменений/)).toBeHidden();

  // Лимит в месяц: доллары, гривны рядом, сохраняется кнопкой; на сервере — центы.
  const month = field(page, MONTH).getByRole("textbox");
  await month.fill("12,5");
  await expect(field(page, MONTH)).toContainText(/≈ \d/);
  await expect(page.getByText(/^Несохранённых изменений: 1/)).toBeVisible();
  // Выключатель рядом, сохранённый сам, не стирает набранный лимит.
  await switchOf.click();
  await expect.poll(async () => (await value(api, TRANSLATION))!.value).toBe(before);
  await expect(month).toHaveValue("12,5");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(async () => (await value(api, MONTH))!.value).toBe(1250);

  // Неверная сумма не сохраняется и объясняется в долларах.
  await month.fill("1,234");
  await expect(field(page, MONTH)).toContainText("Сумма в долларах, например 10 или 2,50");
  await expect(page.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  await month.fill("12,5");

  // Задач нет — кнопки «Остановить» нет.
  await expect(ai.getByText("Сейчас задач нет")).toBeVisible();
  await expect(ai.getByRole("button", { name: /Остановить/ })).toHaveCount(0);

  // «Ещё»: дополнительные поля и история с только что сделанной правкой лимита.
  await ai.getByRole("button", { name: /Дополнительно/ }).click();
  await expect(field(page, "ai.deadlineMinutes")).toBeVisible();
  await ai.getByRole("button", { name: /История изменений/ }).click();
  const history = ai.getByRole("list", { name: "История изменений настроек ИИ" });
  await expect(history).toContainText("«Лимит в месяц»");
  await expect(history).not.toContainText("Порог");
});

test("обычный админ: блока «ИИ» в настройках нет, сервер отвечает 403", async ({ browser }) => {
  const token = await signInPlainAdmin();
  const page = await pageAs(browser, token, { width: 1440, height: 900 });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
  await expect(page.locator("#group-ai")).toHaveCount(0);
  await expect(page.locator(`[id="setting-${MONTH}"]`)).toHaveCount(0);
  await page.context().close();

  const list = await getAs(token, "/api/admin/settings");
  expect(list.status).toBe(200);
  const keys = (list.body as { items: { key: string }[] }).items.map((i) => i.key);
  expect(keys.some((k) => k.startsWith("ai."))).toBe(false);
  expect((await putAs(token, "/api/admin/settings", { values: { [MONTH]: 1 } })).status).toBe(403);
  expect((await getAs(token, "/api/admin/ai/state")).status).toBe(403);
});
