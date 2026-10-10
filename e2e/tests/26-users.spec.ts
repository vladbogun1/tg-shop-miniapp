/**
 * «Пользователи»: search (name, @username, id), the «Заблокировали бота» filter, sorting by money,
 * the profile drawer (orders count, money spent, the customer's orders → order card) and the
 * «Аналитика» tab. Numbers are checked against the seed (rejected orders do not count as spent).
 */
import type { Locator, Page } from "@playwright/test";
import { METRICS_ORDER, METRICS_USER, shortId } from "../lib/seed";
import { expect, test } from "../lib/test";
import type { Api } from "../lib/api";

interface UserCard {
  telegramUserId: number;
  ordersCount: number;
  totalSpentMinor: number;
  botBlocked: boolean;
}

async function users(api: Api, params: string): Promise<UserCard[]> {
  const res = await api.raw("get", `/api/admin/users?${params}`);
  expect(res.status).toBe(200);
  return res.body as unknown as UserCard[];
}

/** Body rows of the desktop table. */
function rows(page: Page): Locator {
  return page.locator("table.data-table tbody tr");
}

/** "1 200 ₴" with any kind of space between the groups. */
function moneyRe(hryvnias: number): RegExp {
  const s = hryvnias.toLocaleString("ru-RU").replace(/\s/g, "\\s");
  return new RegExp(`${s}\\s₴`);
}

test("поиск по имени, @username и ID; фильтр «Заблокировали бота»; сортировка по сумме", async ({ page, api }) => {
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Пользователи", level: 1 })).toBeVisible();
  const search = page.getByPlaceholder("Поиск: имя, @username, ID");

  // By surname: one row, with the seeded numbers (2 orders, 1000 + 200 ₴).
  await search.fill("Метриченко");
  await expect(rows(page)).toHaveCount(1);
  const z = rows(page).first();
  await expect(z).toContainText(METRICS_USER.zinoviy.name);
  await expect(z).toContainText(`@${METRICS_USER.zinoviy.username} · #${METRICS_USER.zinoviy.id}`);
  await expect(z).toContainText(moneyRe(1200));
  await expect(z).toContainText("активен");

  // By @username and by id.
  await search.fill("e2e_yaryna");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(METRICS_USER.yaryna.name);
  await search.fill(String(METRICS_USER.fedir.id));
  await expect(rows(page)).toHaveCount(1);
  const f = rows(page).first();
  await expect(f).toContainText(METRICS_USER.fedir.name);
  await expect(f).toContainText("заблокировал");
  // His only order was rejected: 0 ₴ spent.
  await expect(f).toContainText(/0\s₴/);

  await search.fill("никого-такого-нет");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await search.fill("");

  // Blocked only.
  const blocked = page.getByRole("button", { name: "Заблокировали бота" });
  await blocked.click();
  await expect(blocked).toHaveAttribute("aria-pressed", "true");
  const expectedBlocked = await users(api, "blockedOnly=true&size=50");
  expect(expectedBlocked.map((u) => u.telegramUserId)).toContain(METRICS_USER.fedir.id);
  await expect(rows(page)).toHaveCount(expectedBlocked.length);
  for (const r of await rows(page).all()) await expect(r).toContainText("заблокировал");
  await blocked.click();
  await expect(blocked).toHaveAttribute("aria-pressed", "false");

  // Sort by money, biggest first: the first row is the top spender of the API.
  await page.getByRole("button", { name: "Потрачено" }).click();
  await expect(page.locator("th[aria-sort='descending']")).toContainText("Потрачено");
  const top = (await users(api, "sortBy=totalSpentMinor&sortDir=desc&size=1"))[0];
  await expect(rows(page).first()).toContainText(`#${top.telegramUserId}`);
});

test("профиль: заказы и сумма, заказ открывается поверх", async ({ page }) => {
  await page.goto("/users");
  await page.getByPlaceholder("Поиск: имя, @username, ID").fill("Метриченко");
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().click();

  const profile = page.getByRole("dialog").filter({ hasText: "Открыть в Telegram" });
  await expect(profile).toBeVisible();
  await expect(profile).toContainText(METRICS_USER.zinoviy.name);
  await expect(profile.getByRole("link", { name: "Открыть в Telegram" })).toHaveAttribute(
    "href",
    `https://t.me/${METRICS_USER.zinoviy.username}`
  );
  await expect(profile).toContainText(moneyRe(1200));
  const orders = profile.getByRole("button").filter({ hasText: /#e2e001/ });
  await expect(orders).toHaveCount(2);
  await expect(profile).toContainText(shortId(METRICS_ORDER.m1));
  await expect(profile).toContainText(shortId(METRICS_ORDER.m5));

  await orders.filter({ hasText: shortId(METRICS_ORDER.m1) }).click();
  const drawer = page.getByRole("dialog").filter({ hasText: shortId(METRICS_ORDER.m1) }).last();
  await expect(drawer).toContainText(METRICS_USER.zinoviy.name);
  await expect(drawer).toContainText("E2E Рюкзак городской");
});

test("вкладка «Аналитика» открывается для каждого периода без ошибок", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/users");
  await page.getByRole("main").getByRole("button", { name: "Аналитика", exact: true }).click();
  await expect(page.getByText("Всего пользователей")).toBeVisible();
  await expect(page.getByText("Заблокировали бота").first()).toBeVisible();
  await expect(page.getByText("Топ покупателей")).toBeVisible();
  await expect(page.getByText("Не удалось загрузить")).toHaveCount(0);
  expect(failed).toEqual([]);
});
