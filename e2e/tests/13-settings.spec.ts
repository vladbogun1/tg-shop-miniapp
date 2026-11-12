/**
 * «Настройки»: обзор разделов → страница раздела; порог меняется и сохраняется, потом «Сбросить» к умолчанию.
 * (Берём порог склада, а не пороги «Внимания», чтобы не задеть тест inbox.) Поиск на обзоре находит поле и панель
 * из других разделов и открывает их; старые якоря `/settings#group-<id>` уводят на страницу раздела; у «Доставки» вкладки.
 */
import { containerOf, expect, test, toast } from "../lib/test";

const LABEL = "Порог «мало на складе»";
const KEY = "catalog.lowStockQty";

test("порог: изменить и сохранить, затем сбросить к умолчанию", async ({ page, api }) => {
  await page.goto("/settings/stock");
  const field = page.getByLabel(LABEL);
  await expect(field).toHaveValue("3");
  const saveBar = page.getByText(/^Несохранённых изменений: \d+/);

  // Invalid input blocks saving.
  await field.fill("abc");
  await expect(page.getByText("Исправьте поля с ошибками")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled();

  await field.fill("5");
  await expect(saveBar).toHaveText(/^Несохранённых изменений: 1/);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(toast(page, "Настройка сохранена")).toBeVisible();
  await expect(saveBar).toBeHidden();

  let item = (await api.settings()).items.find((i) => i.key === KEY)!;
  expect(item.value).toBe(5);
  expect(item.overridden).toBe(true);

  await page.reload();
  await expect(field).toHaveValue("5");
  const card = containerOf(page, page.getByLabel(LABEL), page.getByRole("button", { name: "Сбросить" }));
  await expect(card).toContainText("По умолчанию: 3");
  await expect(card).toContainText(/изменено/);

  await card.getByRole("button", { name: "Сбросить" }).click();
  await expect(field).toHaveValue("3");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(toast(page, "Настройка сохранена")).toBeVisible();
  await expect(saveBar).toBeHidden();

  item = (await api.settings()).items.find((i) => i.key === KEY)!;
  expect(item.overridden).toBe(false);
  expect(item.value).toBe(3);
  await page.reload();
  await expect(field).toHaveValue("3");
  await expect(containerOf(page, page.getByLabel(LABEL), page.getByText("По умолчанию: 3"))).not.toContainText("Сбросить");
});

test("обзор: раздел открывается своей страницей, «‹ Настройки» / меню ведут обратно", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Настройки", level: 1 })).toBeAttached();
  // На обзоре полей нет — только разделы.
  await expect(page.getByLabel(LABEL)).toHaveCount(0);

  await page.getByRole("link", { name: /Склад и маржа/ }).first().click();
  await expect(page).toHaveURL(/\/settings\/stock$/);
  await expect(page.getByRole("heading", { name: "Склад и маржа", level: 1 })).toBeVisible();
  await expect(page.getByLabel(LABEL)).toBeVisible();

  // Неизвестный раздел — на обзор.
  await page.goto("/settings/nope");
  await expect(page).toHaveURL(/\/settings$/);
});

test("поиск на обзоре: находит поле в другом разделе и открывает его", async ({ page }) => {
  await page.goto("/settings");
  const search = page.getByRole("textbox", { name: "Поиск по настройкам" });
  await search.fill("мало на складе");
  const results = page.getByRole("list", { name: "Найденные настройки" });
  const hit = results.getByRole("link", { name: new RegExp(LABEL) });
  await expect(hit).toContainText("Склад и маржа");
  await hit.click();
  await expect(page).toHaveURL(/\/settings\/stock#setting-catalog\.lowStockQty$/);
  await expect(page.getByLabel(LABEL)).toBeInViewport();

  // Панель Новой Почты находится по своим словам и открывается на своей вкладке.
  await page.goto("/settings");
  await search.fill("вебхук");
  await results.getByRole("link", { name: /Миттєві статуси \(вебхуки\)/ }).click();
  await expect(page).toHaveURL(/\/settings\/delivery\?tab=tracking#np-webhook$/);
  await expect(page.getByRole("tab", { name: /^Отслеживание/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Миттєві статуси (вебхуки)" })).toBeVisible();

  await page.goto("/settings");
  await search.fill("нет такой настройки");
  await expect(page.getByText("По запросу «нет такой настройки» настроек нет.")).toBeVisible();
});

test("старый якорь #group-novaposhta ведёт в «Доставку»; вкладки Новой Почты", async ({ page }) => {
  await page.goto("/settings#group-novaposhta");
  await expect(page).toHaveURL(/\/settings\/delivery$/);
  await expect(page.getByRole("heading", { name: "Доставка", level: 1 })).toBeVisible();

  const tab = (name: string) => page.getByRole("tab", { name: new RegExp("^" + name) });
  for (const name of ["Чекаут и цена", "ТТН и отправитель", "Коробки и вес", "Отслеживание"]) await expect(tab(name)).toBeVisible();
  await expect(tab("Чекаут и цена")).toHaveAttribute("aria-selected", "true");

  // Панели — на своих вкладках; вкладка запоминается в адресе.
  const sender = page.getByRole("heading", { name: "Отправитель Новой Почты" });
  const webhook = page.getByRole("heading", { name: "Миттєві статуси (вебхуки)" });
  await expect(sender).toBeHidden();
  await tab("ТТН и отправитель").click();
  await expect(page).toHaveURL(/\/settings\/delivery\?tab=ttn$/);
  await expect(sender).toBeVisible();
  await expect(webhook).toBeHidden();
  await tab("Отслеживание").click();
  await expect(webhook).toBeVisible();
  await page.reload();
  await expect(tab("Отслеживание")).toHaveAttribute("aria-selected", "true");
  await expect(webhook).toBeVisible();
});
