/**
 * Mini App: comparison, and the gift for the order sum (the gift case) — docs/ARCHITECTURE-FRONT.md step 5.0.
 * Gift settings and the bronze prizes come from fixtures/customer-seed.sql + global-setup.customer.ts.
 */
import { expect, test } from "./fixtures.js";
import { MINIAPP_URL } from "../env.js";
import { insertOrder, newBuyerId } from "../lib/customer.js";
import { query } from "../lib/db.js";
import { installTelegramStub } from "../lib/tg-stub.js";
import { addToCart, fillCheckoutToConfirmation } from "./miniapp-helpers.js";

test.use({ baseURL: MINIAPP_URL });

test("порівняння: два товари з однієї категорії → вікно з рядками ціни й наявності", async ({ page, context }) => {
  await installTelegramStub(context, newBuyerId());
  await page.goto("/");

  const card = (title: string) => page.getByTestId("product-card").filter({ has: page.getByRole("heading", { name: title }) });
  await card("E2E Кепка").getByRole("button", { name: "Порівняти" }).click();
  await expect(card("E2E Кепка").getByRole("button", { name: "Прибрати з порівняння" })).toBeVisible();
  await card("E2E Термос").getByRole("button", { name: "Порівняти" }).click();
  await expect(page.getByText("Додано до порівняння · 2")).toBeVisible();

  await page.getByRole("button", { name: "Порівняти", exact: true }).last().click();
  const dialog = page.getByRole("dialog", { name: "Порівняння" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "E2E Кепка" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "E2E Термос" })).toBeVisible();
  await expect(dialog.getByText("Ціна", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("349 ₴", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("799 ₴", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("Наявність", { exact: true }).first()).toBeVisible();
});

test("подарунок: у кошику — скільки лишилось до кейса, з порогу — вибір «кейс або знижка», замовлення з кейсом", async ({ page, context }) => {
  await installTelegramStub(context, newBuyerId());
  await page.goto("/");
  await addToCart(page, "E2E Термос");

  await page.getByRole("link", { name: /Кошик/ }).click();
  await expect(page.getByText("Купіть ще на 701 ₴ — і отримаєте бронзовий кейс")).toBeVisible();
  await page.getByRole("button", { name: "Збільшити" }).click();
  await expect(page.getByText(/Вітаємо! До замовлення — бронзовий кейс у подарунок/)).toBeVisible();
  await page.getByRole("button", { name: "Оформити" }).click();

  await fillCheckoutToConfirmation(page);
  const gift = page.getByRole("radiogroup", { name: "Ваш подарунок" });
  await expect(gift.getByRole("radio", { name: /Кейс із подарунком/ })).toBeChecked();
  await expect(gift.getByRole("radio", { name: /Знижка −47 ₴/ })).toBeVisible();
  await page.getByRole("button", { name: "Оформити + 🎁 кейс" }).click();

  await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}/);
  await expect(page.getByText("До замовлення — кейс із подарунком")).toBeVisible();
  await expect(page.getByText("Кейс відкриється після оплати замовлення")).toBeVisible();
  const [order] = await query<{ gift_case_status: string; gift_tier: string }>(
    "SELECT gift_case_status, gift_tier FROM orders ORDER BY created_at DESC LIMIT 1",
  );
  expect(order).toEqual({ gift_case_status: "SEALED", gift_tier: "BRONZE" });
});

test("кейс: оплачене замовлення → «Відкрити» → приз і промокод", async ({ page, context }) => {
  const buyer = newBuyerId();
  const order = await insertOrder({ buyer, status: "APPROVED", sealedCase: { tier: "BRONZE", discountPercent: 10 } });
  await installTelegramStub(context, buyer);

  await page.goto(`/account/orders/${order.id}`);
  await expect(page.getByText("До замовлення — кейс із подарунком")).toBeVisible();
  await page.getByRole("button", { name: "Відкрити", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`Кейс за замовлення ${order.shortId}`) });
  await expect(dialog.getByRole("region", { name: "Що може бути в кейсі" })).toBeVisible();
  await dialog.getByRole("button", { name: "Відкрити кейс" }).click();

  const prize = dialog.getByRole("group", { name: "Ваш подарунок" });
  await expect(prize).toBeVisible({ timeout: 40_000 });
  await expect(prize.getByText("Знижка −10%")).toBeVisible();
  await expect(prize.locator("code")).toHaveText(/^CASE[A-Z0-9]+$/);
  await prize.getByRole("button", { name: "Забрати" }).click();
  await expect(dialog).toBeHidden();
});
