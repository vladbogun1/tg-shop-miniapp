/**
 * Links that come from outside the admin: /orders/{id} (bot notifications, push), with ?tab=chat;
 * the old «Теги» bookmark /tags → «Категории»; every menu section (and every section tab) opens without a
 * crash or a failed API call; section tabs (variant B): links between pages, the menu item stays lit,
 * «Настройки» lives in the sidebar footer.
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
  ["/ai-tasks", "ИИ-задачи"],
  ["/categories", "Категории"],
  ["/brands", "Бренды"],
  ["/translations", "Переводы"],
  ["/reviews", "Отзывы"],
  ["/users", "Покупатели"],
  ["/broadcasts", "Рассылки"],
  ["/promocodes", "Промокоды"],
  ["/gift", "Кейс"],
  ["/metrics", "Метрики"],
  ["/writeoffs", "Списания"],
  ["/audit", "Журнал"],
  ["/incidents", "Инциденты"],
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

test("вкладки раздела: «Категории» ведут на «Товары» и «Бренды», пункт «Товары» горит на «Брендах»", async ({ page }) => {
  await page.goto("/categories");
  const tabs = page.getByRole("navigation", { name: "Раздел «Товары»" });
  await expect(tabs.getByRole("link", { name: "Категории" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Бренды" }).click();
  await expect(page).toHaveURL(/\/brands$/);
  await expect(page.getByRole("heading", { name: "Бренды", level: 1 })).toBeVisible();
  const menu = page.getByRole("complementary").first();
  await expect(menu.getByRole("link", { name: "Товары", exact: true })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Товары" }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole("heading", { name: "Товары", level: 1 })).toBeVisible();

  // Реестр подарков — внутри вкладки «Кейс» раздела «Акции».
  await page.goto("/gift/registry");
  const promo = page.getByRole("navigation", { name: "Раздел «Акции»" });
  await expect(promo.getByRole("link", { name: "Кейс" })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: "Акции" })).toHaveAttribute("aria-current", "page");

  // «Настройки» — внизу меню, без блока «Система».
  await expect(menu.getByRole("link", { name: "Настройки" })).toBeVisible();
  await expect(menu.getByRole("button", { name: /^Система/ })).toHaveCount(0);
});
