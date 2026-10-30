/**
 * Website: chat, review, comparison and the gift case (docs/ARCHITECTURE-FRONT.md step 5.0).
 * Orders that need a courier or a payment are written into the database (lib/customer.ts).
 */
import { expect, test } from "./fixtures.js";
import { SITE_URL } from "../env.js";
import { adminSays, insertOrder, newBuyerId } from "../lib/customer.js";
import { query } from "../lib/db.js";
import { addToCartFromProduct, fillCheckoutContactsAndBranch, siteLogin } from "./site-helpers.js";

test.use({ baseURL: SITE_URL });

test("чат замовлення: відповідь магазину видно, своє повідомлення відправляється", async ({ page, context, clientIp }) => {
  const buyer = newBuyerId();
  const order = await insertOrder({ buyer, status: "APPROVED", paid: true });
  await adminSays(order.id, "Вітаємо! Замовлення підтверджено.");
  await siteLogin(context, buyer, clientIp);

  await page.goto(`/account/orders/${order.id}`);
  const chat = page.getByRole("region", { name: "Чат із магазином" });
  await expect(chat.getByText("Вітаємо! Замовлення підтверджено.")).toBeVisible();
  await expect(chat.getByText("У мережі")).toBeVisible();
  await chat.getByRole("textbox", { name: /^Повідомлення…/ }).fill("Дякую, чекаю на відправку");
  await chat.getByRole("button", { name: "Надіслати" }).click();
  await expect(chat.getByText("Дякую, чекаю на відправку")).toBeVisible();
  await expect(chat.getByRole("textbox", { name: /^Повідомлення…/ })).toHaveValue("");

  const saved = await query<{ sender_type: string; text: string }>(
    "SELECT sender_type, text FROM order_messages WHERE order_id = UUID_TO_BIN(?) ORDER BY id",
    [order.id],
  );
  expect(saved.map((m) => [m.sender_type, m.text])).toEqual([
    ["ADMIN", "Вітаємо! Замовлення підтверджено."],
    ["CUSTOMER", "Дякую, чекаю на відправку"],
  ]);
});

test("відгук: «Чекають на відгук» → оцінка + текст → відгук у «Мої відгуки» (чекає модерації)", async ({ page, context, clientIp }) => {
  const buyer = newBuyerId();
  await insertOrder({ buyer, status: "DELIVERED" });
  await siteLogin(context, buyer, clientIp);

  await page.goto("/account/reviews");
  const waiting = page.getByRole("region", { name: "Чекають на відгук" });
  await waiting.getByRole("button", { name: "Залишити відгук" }).click();
  const send = waiting.getByRole("button", { name: "Надіслати відгук" });
  await waiting.getByRole("radio", { name: "Оцінити на 5 з 5" }).click();
  await waiting.getByRole("textbox", { name: "Ваш відгук" }).fill("Кепка добра, сидить як треба");
  await send.click();

  await expect(page.getByRole("region", { name: "Мої відгуки" }).getByText("Кепка добра, сидить як треба")).toBeVisible();
  const saved = await query<{ rating: number; status: string; text: string }>(
    "SELECT rating, status, text FROM product_reviews WHERE tg_user_id = ?",
    [buyer],
  );
  expect(saved).toEqual([{ rating: 5, status: "PENDING", text: "Кепка добра, сидить як треба" }]);
});

test("порівняння: два товари з каталогу → вікно з рядками ціни й наявності", async ({ page, context, clientIp }) => {
  await siteLogin(context, newBuyerId(), clientIp);
  await page.goto("/catalog");

  const card = (title: string) => page.getByRole("article").filter({ hasText: title });
  await card("E2E Кепка").getByRole("button", { name: "Порівняти" }).click();
  await card("E2E Термос").getByRole("button", { name: "Порівняти" }).click();
  await expect(page.getByText("Додано до порівняння · 2")).toBeVisible();

  await page.getByRole("button", { name: "Порівняти", exact: true }).last().click();
  const dialog = page.getByRole("dialog", { name: /Порівняння/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "E2E Кепка" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "E2E Термос" })).toBeVisible();
  await expect(dialog.getByText("349 ₴", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("799 ₴", { exact: true }).first()).toBeVisible();
});

test("подарунок: у кошику — скільки лишилось до кейса, з порогу — кейс у замовленні", async ({ page, context, clientIp }) => {
  await siteLogin(context, newBuyerId(), clientIp);
  await addToCartFromProduct(page, "e2e-termos");

  await page.goto("/cart");
  await expect(page.getByText("Купіть ще на 701 ₴ — і отримаєте бронзовий кейс")).toBeVisible();
  await page.getByRole("button", { name: "Збільшити" }).click();
  await expect(page.getByText(/Вітаємо! До замовлення — бронзовий кейс у подарунок/)).toBeVisible();
  await page.getByRole("link", { name: "Оформити" }).click();

  await fillCheckoutContactsAndBranch(page);
  await page.getByRole("radio", { name: /Полная оплата онлайн/ }).click();
  const gift = page.getByRole("radiogroup", { name: "Ваш подарунок" });
  await expect(gift.getByRole("radio", { name: /Кейс із подарунком/ })).toBeChecked();
  await expect(gift.getByRole("radio", { name: /Знижка −47 ₴/ })).toBeVisible();
  await page.getByRole("button", { name: "Оформити + 🎁 кейс" }).click();

  await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}/);
  await expect(page.getByText("До замовлення — кейс із подарунком")).toBeVisible();
  await expect(page.getByText(/Кейс відкриється після оплати/)).toBeVisible();
});

test("кейс: оплачене замовлення → «Відкрити» → приз і промокод", async ({ page, context, clientIp }) => {
  const buyer = newBuyerId();
  const order = await insertOrder({ buyer, status: "APPROVED", sealedCase: { tier: "BRONZE", discountPercent: 10 } });
  await siteLogin(context, buyer, clientIp);

  await page.goto(`/account/orders/${order.id}`);
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
