/**
 * Mini App: the order chat and a review of a delivered order (docs/ARCHITECTURE-FRONT.md step 5.0).
 * The orders are written into the database (lib/customer.ts): a delivered one needs a courier.
 */
import { expect, test } from "@playwright/test";
import { MINIAPP_URL } from "../env.js";
import { adminSays, insertOrder, newBuyerId } from "../lib/customer.js";
import { query } from "../lib/db.js";
import { installTelegramStub } from "../lib/tg-stub.js";

test.use({ baseURL: MINIAPP_URL });

test("чат замовлення: відповідь магазину видно, своє повідомлення відправляється", async ({ page, context }) => {
  const buyer = newBuyerId();
  const order = await insertOrder({ buyer, status: "APPROVED", paid: true });
  await adminSays(order.id, "Вітаємо! Замовлення підтверджено.");
  await installTelegramStub(context, buyer);

  await page.goto("/account");
  await page.getByRole("link", { name: new RegExp(order.shortId) }).click();
  await expect(page.getByRole("heading", { name: `Замовлення ${order.shortId}`, level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Написати в чат" }).click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${order.id}/chat$`));

  await expect(page.getByText("Вітаємо! Замовлення підтверджено.")).toBeVisible();
  await page.getByRole("textbox", { name: "Повідомлення…" }).fill("Дякую, чекаю на відправку");
  await page.getByRole("button", { name: "Надіслати" }).click();
  await expect(page.getByText("Дякую, чекаю на відправку")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Повідомлення…" })).toHaveValue("");

  const saved = await query<{ sender_type: string; text: string }>(
    "SELECT sender_type, text FROM order_messages WHERE order_id = UUID_TO_BIN(?) ORDER BY id",
    [order.id],
  );
  expect(saved.map((m) => [m.sender_type, m.text])).toEqual([
    ["ADMIN", "Вітаємо! Замовлення підтверджено."],
    ["CUSTOMER", "Дякую, чекаю на відправку"],
  ]);
});

test("відгук на доставлений заказ: оцінка + текст → відгук чекає модерації", async ({ page, context }) => {
  const buyer = newBuyerId();
  const order = await insertOrder({ buyer, status: "DELIVERED" });
  await installTelegramStub(context, buyer);

  await page.goto(`/account/orders/${order.id}`);
  await expect(page.getByRole("heading", { name: "Залиште відгук — отримайте знижку на наступне замовлення" })).toBeVisible();
  const send = page.getByRole("button", { name: "Надіслати відгук" });
  await expect(send).toBeDisabled();
  await page.getByRole("radio", { name: "5 з 5" }).click();
  await page.getByRole("textbox", { name: "Текст відгуку" }).fill("Кепка добра, сидить як треба");
  await expect(send).toBeEnabled();
  await send.click();

  await expect(send).toBeHidden();
  const saved = await query<{ rating: number; status: string; text: string }>(
    "SELECT rating, status, text FROM product_reviews WHERE tg_user_id = ?",
    [buyer],
  );
  expect(saved).toEqual([{ rating: 5, status: "PENDING", text: "Кепка добра, сидить як треба" }]);
});
