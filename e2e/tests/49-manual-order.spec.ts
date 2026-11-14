/**
 * «Новый заказ этому покупателю»: from an order's «Ещё» menu and from a customer's profile. The buyer, the
 * Telegram id and the Nova Poshta branch come filled in; the city and the branch are picked from the
 * directory (a typed city used to fail with «Выберите город»); the order is bound to the customer's account.
 */
import type { Locator, Page } from "@playwright/test";
import { query } from "../lib/db";
import { CUSTOMER, ORDER } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, pickFromMoreMenu, test } from "../lib/test";

/** A customer with no orders yet — only this spec uses him. */
const NESTOR = { tg: 900000401, username: "e2e_nestor", name: "Нестор Ручний" };

test.beforeAll(async () => {
  await query(
    `INSERT IGNORE INTO users (telegram_user_id, username, first_name, last_name, language_code, locale, created_at)
     VALUES (?, ?, 'Нестор', 'Ручний', 'uk', 'uk', NOW() - INTERVAL 3 DAY)`,
    [NESTOR.tg, NESTOR.username]
  );
});

async function addCap(form: Locator): Promise<void> {
  await form.getByPlaceholder("Найти товар по названию…").fill("Кепка");
  await form.getByRole("button", { name: /E2E Кепка/ }).click();
}

async function pickPayment(page: Page, form: Locator): Promise<void> {
  await form.getByRole("button", { name: /Выберите способ оплаты/ }).click();
  await page.getByRole("option", { name: "Полная оплата онлайн" }).or(page.getByRole("button", { name: "Полная оплата онлайн" })).first().click();
}

/** Creates the order and returns its id (the board then opens the new order's drawer). */
async function create(page: Page, form: Locator): Promise<string> {
  const res = page.waitForResponse((r) => r.url().endsWith("/api/admin/orders") && r.request().method() === "POST");
  await form.getByRole("button", { name: "Создать заказ" }).click();
  const r = await res;
  expect(r.ok(), `POST /api/admin/orders → ${r.status()}`).toBe(true);
  const body = (await r.json()) as { id?: string; orderId?: string };
  const id = body.id ?? body.orderId;
  expect(id).toBeTruthy();
  return id as string;
}

async function ownerOf(id: string): Promise<{ user_id: number | null; source: string; np_city_ref: string | null; np_warehouse_ref: string | null }> {
  const [row] = await query<{ user_id: number | null; source: string; np_city_ref: string | null; np_warehouse_ref: string | null }>(
    "SELECT user_id, source, np_city_ref, np_warehouse_ref FROM orders WHERE id = UUID_TO_BIN(?)",
    [id]
  );
  return row!;
}

test("из карточки заказа: покупатель и отделение подставлены, заказ попадает в его кабинет", async ({ page }) => {
  const drawer = await openOrderFromBoard(page, ORDER.prepay, CUSTOMER.prepay);
  await pickFromMoreMenu(page, drawer, "Новый заказ этому покупателю");

  const form = dialog(page, "Новый заказ этому покупателю");
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Имя покупателя")).toHaveValue(CUSTOMER.prepay);
  await expect(form.getByLabel("Телефон")).toHaveValue("+380000000001");
  await expect(form.getByLabel("Telegram id покупателя (необязательно)")).toHaveValue("900000001");
  await expect(form.getByText("Київ", { exact: true })).toBeVisible();
  await expect(form.getByText(/Відділення №1 \(тест\)/)).toBeVisible();

  // Another branch from the directory.
  await form.getByRole("button", { name: "Очистить «Відділення»" }).click();
  await form.getByPlaceholder("Номер или адрес…").fill("2");
  await page.getByRole("button", { name: /Відділення №2 \(тест\)/ }).click();

  await addCap(form);
  await pickPayment(page, form);
  const id = await create(page, form);

  await expect(page.getByRole("dialog").filter({ hasText: id.slice(0, 8) }).first()).toBeVisible();
  expect(await ownerOf(id)).toMatchObject({ user_id: 900000001, source: "ADMIN", np_city_ref: "e2e-city", np_warehouse_ref: "e2e-wh-2" });
});

test("из профиля покупателя без заказов: имя и Telegram id, город и отделение из справочника", async ({ page }) => {
  await page.goto("/users");
  await page.getByPlaceholder("Поиск: имя, @username, ID").fill(NESTOR.username);
  const row = page.getByText(NESTOR.name).first();
  await expect(row).toBeVisible();
  await row.click();

  const profile = page.getByRole("dialog").filter({ hasText: "Открыть в Telegram" });
  await expect(profile).toBeVisible();
  await profile.getByRole("button", { name: "Новый заказ" }).click();

  const form = dialog(page, "Новый заказ этому покупателю");
  await expect(form.getByLabel("Имя покупателя")).toHaveValue(NESTOR.name);
  await expect(form.getByLabel("Telegram id покупателя (необязательно)")).toHaveValue(String(NESTOR.tg));
  await form.getByLabel("Телефон").fill("+380000000401");

  // Without a city from the directory the order cannot be created.
  await addCap(form);
  await pickPayment(page, form);
  await expect(form.getByRole("button", { name: "Создать заказ" })).toBeDisabled();

  await form.getByPlaceholder("Начните вводить город…").fill("Київ");
  await page.getByRole("button", { name: /Київ/ }).first().click();
  await form.getByPlaceholder("Номер или адрес…").fill("1");
  await page.getByRole("button", { name: /Відділення №1 \(тест\)/ }).click();

  const id = await create(page, form);
  await expect(page.getByRole("dialog").filter({ hasText: id.slice(0, 8) }).first()).toBeVisible();
  expect(await ownerOf(id)).toMatchObject({ user_id: NESTOR.tg, source: "ADMIN", np_city_ref: "e2e-city", np_warehouse_ref: "e2e-wh-1" });
});
