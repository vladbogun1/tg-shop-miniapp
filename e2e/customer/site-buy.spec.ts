/**
 * Website: catalog → product → cart → checkout with a promo code → order page → payment window (docs/ARCHITECTURE-FRONT.md
 * step 5.0). The payment page is the fake monobank (lib/fake-mono.mjs); nothing is paid.
 */
import { expect, test } from "./fixtures.js";
import { SITE_URL, FAKE_MONO_URL } from "../env.js";
import { newBuyerId } from "../lib/customer.js";
import { query } from "../lib/db.js";
import { fillCheckoutContactsAndBranch, siteLogin } from "./site-helpers.js";

test.use({ baseURL: SITE_URL });

test("покупка: каталог → товар → кошик → оформлення з промокодом → сторінка замовлення → вікно оплати", async ({ page, context, clientIp }) => {
  const buyer = newBuyerId();
  await siteLogin(context, buyer, clientIp);

  await test.step("каталог і картка товару", async () => {
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Каталог", level: 1 })).toBeVisible();
    await expect(page.getByText("Знайдено 7 товарів").locator("visible=true")).toBeVisible();
    await page.getByRole("link", { name: "E2E Кепка" }).first().click();
    await expect(page).toHaveURL(/\/product\/e2e-kepka$/);
    await expect(page.getByRole("heading", { name: "E2E Кепка", level: 1 })).toBeVisible();
    await expect(page.getByText("349 ₴").first()).toBeVisible();
    await expect(page.getByText("В наявності", { exact: true }).first()).toBeVisible();
  });

  await test.step("у кошик", async () => {
    await page.getByRole("button", { name: "У кошик" }).first().click();
    await expect(page.getByText("У кошику: 1")).toBeVisible();
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: /Кошик/, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "E2E Кепка" }).first()).toBeVisible();
    await expect(page.getByRole("complementary")).toContainText(/Разом\s*349\s*₴/);
    await page.getByRole("link", { name: "Оформити" }).click();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  await test.step("оформлення: контакти, НП, оплата, промокод", async () => {
    await fillCheckoutContactsAndBranch(page);
    await page.getByRole("radio", { name: /Полная оплата онлайн/ }).click();
    await page.getByRole("textbox", { name: "Промокод" }).fill("E2ESMOKE10");
    await expect(page.getByText(/Знижка 34,90 ₴ із 349 ₴/)).toBeVisible();
    await page.getByRole("button", { name: "Оформити замовлення" }).click();
  });

  await test.step("сторінка замовлення", async () => {
    await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}/);
    await expect(page.getByText(/^Замовлення #[0-9a-f]{8} створено$/)).toBeVisible();
    await expect(page.getByText("Очікує оплати")).toBeVisible();
    await expect(page.getByText("314,10 ₴").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Чат із магазином" })).toBeVisible();
  });

  await test.step("вікно оплати відкриває сторінку monobank (фейк)", async () => {
    await page.getByRole("button", { name: /^Оплатити/ }).click();
    const dialog = page.getByRole("dialog", { name: /^Оплата замовлення/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("iframe")).toHaveAttribute("src", new RegExp(`^${FAKE_MONO_URL}/pay/`));
    await dialog.getByRole("button", { name: "Закрити" }).click();
    await expect(dialog).toBeHidden();
  });

  const [order] = await query<{ status: string; paid: number; total_minor: number; discount_minor: number }>(
    "SELECT status, paid, total_minor, discount_minor FROM orders WHERE user_id = ?",
    [buyer],
  );
  expect(order).toEqual({ status: "NEW", paid: 0, total_minor: 31410, discount_minor: 3490 });
});
