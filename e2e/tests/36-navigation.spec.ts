/**
 * Links that come from outside the admin: /orders/{id} (bot notifications, push), with ?tab=chat;
 * the old «Теги» bookmark /tags → «Категории»; every menu section opens without a crash or a failed
 * API call.
 */
import { CUSTOMER, ORDER, shortId } from "../lib/seed";
import { expect, orderDrawer, test } from "../lib/test";

test("/orders/{id} открывает карточку, закрытие ведёт на доску; ?tab=chat — сразу чат", async ({ page }) => {
  await page.goto(`/orders/${ORDER.shipped}`);
  const drawer = orderDrawer(page, ORDER.shipped);
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(CUSTOMER.shipped);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();

  await page.goto(`/orders/${ORDER.chat}?tab=chat`);
  const chat = orderDrawer(page, ORDER.chat);
  await expect(chat.getByText("Добрий день! Коли відправите?")).toBeVisible();
  await expect(chat.getByPlaceholder(/Сообщение клиенту/)).toBeVisible();
  await expect(chat).toContainText(shortId(ORDER.chat));
});

test("/tags (старая закладка) ведёт в «Категории»", async ({ page }) => {
  await page.goto("/tags");
  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByRole("heading", { name: "Категории", level: 1 })).toBeVisible();
});

const SECTIONS: [string, string][] = [
  ["/inbox", "Внимание"],
  ["/", "Заказы"],
  ["/dispatch", "Отправка"],
  ["/support", "Поддержка"],
  ["/products", "Товары"],
  ["/cards", "Карточки"],
  ["/categories", "Категории"],
  ["/brands", "Бренды"],
  ["/translations", "Переводы"],
  ["/reviews", "Отзывы"],
  ["/users", "Пользователи"],
  ["/broadcasts", "Рассылки"],
  ["/promocodes", "Промокоды"],
  ["/metrics", "Метрики"],
  ["/audit", "Журнал"],
  ["/payment", "Оплата"],
  ["/settings", "Настройки"],
  ["/admins", "Админы"],
  ["/account", "Мой аккаунт"],
];

test("каждый раздел меню открывается без ошибок", async ({ page }) => {
  test.setTimeout(120_000);
  const failed: string[] = [];
  page.on("response", (r) => {
    // Nova Poshta / MinIO are not there in e2e on purpose — not a page error.
    if (r.url().includes("/api/") && r.status() >= 400 && !/novaposhta|np\//.test(r.url())) failed.push(`${r.status()} ${r.url()}`);
  });
  for (const [path, title] of SECTIONS) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, level: 1 }).first(), path).toBeAttached();
    await expect(page.getByText("Не удалось загрузить"), path).toHaveCount(0);
  }
  expect(failed).toEqual([]);
});
