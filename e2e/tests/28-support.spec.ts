/**
 * «Поддержка»: the waiting question shows in the menu badge, the «Ждут ответа» chip and «Внимание»;
 * an answer from the thread drawer clears all three and is stored; closing / reopening; filters,
 * search and the deep link. No bot (BOT_TOKEN is blank): the reply is only saved.
 */
import type { Locator, Page } from "@playwright/test";
import { METRICS_USER, SUPPORT_THREAD } from "../lib/seed";
import { expect, test, toast } from "../lib/test";
import type { Api } from "../lib/api";

async function waiting(api: Api): Promise<number> {
  const res = await api.raw("get", "/api/admin/support/unread-count");
  expect(res.status).toBe(200);
  return (res.body as { count: number }).count;
}

async function thread(api: Api, id: string) {
  const res = await api.raw("get", `/api/admin/support/threads/${id}`);
  expect(res.status).toBe(200);
  return res.body as { status: string; awaitingSince: string | null; unreadCount: number };
}

function threadRow(page: Page, name: string): Locator {
  return page.getByRole("main").getByRole("listitem").filter({ hasText: name });
}

function supportDrawer(page: Page): Locator {
  return page.getByRole("dialog").filter({ hasText: "Поддержка" }).last();
}

test("ответ на вопрос снимает «ждут ответа» везде; закрыть и открыть снова", async ({ page, api }) => {
  expect(await waiting(api)).toBe(1);
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Поддержка", level: 1 })).toBeVisible();

  // Badge, chip and «Внимание» agree.
  await expect(page.getByLabel("Ждут ответа в поддержке: 1").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ждут ответа\s*1$/ })).toBeVisible();
  expect((await api.inbox()).groups.find((g) => g.id === "SUPPORT")?.count).toBe(1);

  const row = threadRow(page, METRICS_USER.stepan.name);
  await expect(row).toContainText("E2E: а розмір L буде?");
  await expect(row.getByTitle("Непрочитанные сообщения")).toHaveText("1");
  // The closed one is not in «Открытые».
  await expect(threadRow(page, METRICS_USER.yaryna.name)).toHaveCount(0);

  await row.getByRole("button").first().click();
  const drawer = supportDrawer(page);
  await expect(drawer).toContainText("Вопрос о товаре");
  await expect(drawer).toContainText("E2E Футболка базовая");
  await expect(drawer.getByText("E2E: а розмір L буде?").last()).toBeVisible();
  await expect.poll(async () => (await thread(api, SUPPORT_THREAD.waiting)).unreadCount).toBe(0);

  const input = drawer.getByPlaceholder(/Ответ клиенту/);
  await input.fill("Так, L буде в понеділок.");
  await drawer.getByRole("button", { name: "Отправить" }).click();
  await expect(input).toHaveValue("");
  await expect(drawer.getByText("Так, L буде в понеділок.")).toBeVisible();

  // Nobody waits any more: API, menu badge, chip, «Внимание».
  await expect.poll(() => waiting(api)).toBe(0);
  const t = await thread(api, SUPPORT_THREAD.waiting);
  expect(t.awaitingSince).toBeNull();
  const msgs = await api.raw("get", `/api/admin/support/threads/${SUPPORT_THREAD.waiting}/messages`);
  expect(JSON.stringify(msgs.body)).toContain("Так, L буде в понеділок.");
  await expect(page.getByLabel(/^Ждут ответа в поддержке:/)).toHaveCount(0);
  expect((await api.inbox()).groups.find((g) => g.id === "SUPPORT")?.count ?? 0).toBe(0);

  // Close, then reopen.
  await drawer.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  await expect(toast(page, "Вопрос закрыт")).toBeVisible();
  await expect.poll(async () => (await thread(api, SUPPORT_THREAD.waiting)).status).toBe("CLOSED");
  await drawer.getByRole("button", { name: "Открыть снова" }).click();
  await expect(toast(page, "Вопрос открыт снова")).toBeVisible();
  await expect.poll(async () => (await thread(api, SUPPORT_THREAD.waiting)).status).toBe("OPEN");

  // The list shows the last word was ours.
  await page.keyboard.press("Escape");
  await expect(row).toContainText("Вы: Так, L буде в понеділок.");
});

test("фильтры, поиск и ссылка на вопрос", async ({ page }) => {
  await page.goto("/support");
  await page.getByRole("button", { name: "Закрытые", exact: true }).click();
  await expect(threadRow(page, METRICS_USER.yaryna.name)).toContainText("Доставка");
  await page.getByRole("button", { name: "Все", exact: true }).click();
  await expect(threadRow(page, METRICS_USER.yaryna.name)).toBeVisible();
  await expect(threadRow(page, METRICS_USER.stepan.name)).toBeVisible();

  await page.getByLabel("Поиск по вопросам").fill("Ярина");
  await expect(threadRow(page, METRICS_USER.stepan.name)).toHaveCount(0);
  await expect(threadRow(page, METRICS_USER.yaryna.name)).toBeVisible();
  await page.getByLabel("Поиск по вопросам").fill("нет-такого-текста");
  await expect(page.getByText("Ничего не нашлось")).toBeVisible();

  // Deep link (Telegram / push / «Внимание»): opens the thread, then leaves the address.
  await page.goto(`/support?thread=${SUPPORT_THREAD.closed}`);
  const drawer = supportDrawer(page);
  await expect(drawer).toContainText("Общий вопрос");
  await expect(drawer.getByText("E2E: коли відправляєте?")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Открыть снова" })).toBeVisible();
  await expect(page).not.toHaveURL(/thread=/);
});
