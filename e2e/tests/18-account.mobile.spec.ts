/**
 * «Мой аккаунт» на телефоне: пункт в «Ещё», статус 2FA, история входов без горизонтальной прокрутки.
 */
import { expect, test } from "../lib/test";

test("телефон: «Ещё» → «Мой аккаунт» — 2FA включена, история входов видна", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ещё — все разделы" }).click();
  const menu = page.getByRole("complementary", { name: "Все разделы" });
  await menu.getByRole("link", { name: "Мой аккаунт" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await expect(page.getByText("Включена", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Перенастроить" })).toBeVisible();
  const history = page.getByRole("list", { name: "История входов" });
  // The global setup signed in with password + code.
  await expect(history.getByRole("listitem").first()).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
