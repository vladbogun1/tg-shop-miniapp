/** Steps several Mini App specs share. Text is Ukrainian: the specs run with locale uk-UA. */
import { expect, type Page } from "@playwright/test";

/** Opens the product from the catalog and puts it in the cart (a product without sizes). */
export async function addToCart(page: Page, title: string, extra = 0): Promise<void> {
  await page.getByRole("button", { name: new RegExp(title) }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "У кошик" }).click();
  await dialog.getByRole("button", { name: "Закрити" }).click();
  if (extra > 0) {
    await page.getByRole("link", { name: /Кошик/ }).click();
    for (let i = 0; i < extra; i++) await page.getByRole("button", { name: "Збільшити" }).click();
    await expect(page.getByText(String(1 + extra), { exact: true }).first()).toBeVisible();
  }
}

/** Checkout steps 1-3: contacts, Nova Poshta branch, full online payment. Leaves the confirmation (step 4) open. */
export async function fillCheckoutToConfirmation(page: Page): Promise<void> {
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
}
