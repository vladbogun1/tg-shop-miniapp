/**
 * Mini App, the purchase (docs/ARCHITECTURE-FRONT.md step 5.0): catalog → product → cart with a promo
 * code → checkout (4 steps) → the order page → «Оплатити» opens the payment page. Pins today's behaviour.
 */
import { expect, test } from "@playwright/test";
import { MINIAPP_URL } from "../env.js";
import { newBuyerId } from "../lib/customer.js";
import { installTelegramStub } from "../lib/tg-stub.js";

test.use({ baseURL: MINIAPP_URL });

test("каталог → товар → кошик з промокодом → оформлення → сторінка замовлення → оплата", async ({ page, context }) => {
  await installTelegramStub(context, newBuyerId());

  await test.step("каталог: товари з сидів, категорії", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "E2E Кепка", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E Футболка базовая", level: 3 })).toBeVisible();
    await expect(page.getByRole("button", { name: "E2E Футболки" })).toBeVisible();
    // out of stock (signed in): «Повідомити» — the queue for a restock — instead of a buy button
    await expect(page.getByRole("button", { name: "Повідомити" })).toBeVisible();
  });

  await test.step("товар: картка з описом і відгуком, додати в кошик", async () => {
    await page.getByRole("button", { name: /E2E Футболка базовая/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "E2E Футболка базовая" })).toBeVisible();
    await expect(dialog.getByText("Хлопок 100%.")).toBeVisible();
    await expect(dialog.getByText("E2E: вже опублікований відгук")).toBeVisible();
    // a product with sizes cannot be added before one is picked
    await expect(dialog.getByRole("button", { name: "Оберіть варіант" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Закрити" }).click();

    await page.getByRole("button", { name: /E2E Кепка/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "У кошик" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  });

  await test.step("кошик: рядок, промокод рахує знижку", async () => {
    await page.getByRole("link", { name: /Кошик/ }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "E2E Кепка", level: 3 })).toBeVisible();
    await page.getByRole("textbox", { name: "Промокод" }).fill("E2ESMOKE10");
    await expect(page.getByText("Знижка · E2ESMOKE10")).toBeVisible();
    await expect(page.getByText("−34,90 ₴")).toBeVisible();
    await expect(page.getByText("314,10 ₴").first()).toBeVisible();
    await page.getByRole("button", { name: "Оформити" }).click();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  await test.step("оформлення: контакти → доставка (Нова Пошта) → оплата → підтвердження", async () => {
    await expect(page.getByText("Крок 1/4")).toBeVisible();
    await page.getByRole("textbox", { name: "Ім'я та прізвище" }).fill("Тест Покупець");
    await page.getByRole("textbox", { name: "Телефон" }).fill("971234567");
    await page.getByRole("button", { name: "Далі" }).click();

    await expect(page.getByText("Крок 2/4")).toBeVisible();
    await page.getByRole("combobox", { name: "Місто" }).fill("Киї");
    await page.getByRole("option", { name: /Київ/ }).click();
    await page.getByRole("combobox", { name: "Відділення / поштомат" }).click();
    await page.getByRole("option", { name: /Відділення №1/ }).click();
    await page.getByRole("button", { name: "Далі" }).click();

    await expect(page.getByText("Крок 3/4")).toBeVisible();
    await page.getByRole("button", { name: /Полная оплата онлайн/ }).click();
    await page.getByRole("button", { name: "Далі" }).click();

    await expect(page.getByText("Крок 4/4")).toBeVisible();
    await expect(page.getByText("Знижка · E2ESMOKE10")).toBeVisible();
    await expect(page.getByText("Нова Пошта · Київ, Відділення №1 (тест): вул. Вигадана, 1")).toBeVisible();
    await page.getByRole("button", { name: "Оформити замовлення" }).click();
  });

  await test.step("сторінка замовлення: до сплати з промокодом, статуси", async () => {
    await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}\?created=1$/);
    await expect(page.getByText(/^Замовлення #[0-9a-f]{8} створено$/i)).toBeVisible();
    await expect(page.getByText("314,10 ₴").first()).toBeVisible();
    await expect(page.getByText("Очікує оплати")).toBeVisible();
    await expect(page.getByText("Знижка (E2ESMOKE10)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Скасувати замовлення" }).first()).toBeVisible();
  });

  await test.step("оплата: відкривається сторінка monobank (заглушка) в новій вкладці", async () => {
    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: /Оплатити 314,10/ }).click();
    const pay = await popup;
    await pay.waitForLoadState();
    expect(pay.url()).toMatch(/\/pay\/e2e-/);
    await expect(pay.locator("#fake-mono")).toBeVisible();
  });
});
