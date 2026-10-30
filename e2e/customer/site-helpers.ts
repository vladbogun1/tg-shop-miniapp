/** Steps several website specs share. Text is Ukrainian: the specs run with locale uk-UA. */
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { SITE_URL } from "../env.js";

/** Signs the buyer in the way the dev profile allows (the user is created on the first call); sets the session cookies. */
export async function siteLogin(context: BrowserContext, telegramUserId: number, clientIp: string): Promise<void> {
  const res = await context.request.post(`${SITE_URL}/api/auth/web/dev-login`, {
    data: { telegramUserId },
    headers: { "x-forwarded-for": clientIp },
  });
  expect(res.status()).toBe(200);
}

/** Puts the product in the cart from its page (the cart lives on the server for a signed-in buyer). */
export async function addToCartFromProduct(page: Page, slug: string): Promise<void> {
  await page.goto(`/product/${slug}`);
  await page.getByRole("button", { name: "У кошик" }).first().click();
  await expect(page.getByText("У кошику: 1")).toBeVisible();
}

/** Checkout contacts + a Nova Poshta branch of the fixture city. The payment option stays as chosen by the caller. */
export async function fillCheckoutContactsAndBranch(page: Page): Promise<void> {
  await page.getByRole("textbox", { name: /ПІБ/ }).fill("Тест Покупець");
  await page.getByRole("textbox", { name: "Телефон" }).fill("0971234567");
  await page.getByRole("combobox", { name: "Місто" }).fill("Киї");
  await page.getByRole("option", { name: /Київ/ }).first().click();
  const branch = page.getByRole("combobox", { name: /Відділення/ });
  await branch.click();
  await branch.fill("Відділення №1");
  await page.getByRole("option", { name: /Відділення №1/ }).first().click();
}
