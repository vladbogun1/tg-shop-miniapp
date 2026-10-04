/**
 * Product editor vs. stock changed "in parallel" (an order placed, another admin) while the form
 * is open:
 *  - saving an unrelated edit must not write the stale stock back;
 *  - changing the stock from a stale value is refused with 409 and a readable message, and the
 *    form picks up the current number.
 */
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test, toast } from "../lib/test";

test("правка описания не перезаписывает остаток, изменённый параллельно", async ({ page, api }) => {
  await page.goto(`/products?edit=${PRODUCT.socks}`);
  const modal = dialog(page, "Редактировать товар");
  const description = modal.getByLabel("Описание");
  await expect(description).toHaveValue("Тёплые носки.");

  // Meanwhile three pairs are sold.
  await api.setProductStock(PRODUCT.socks, 37);

  await description.fill("Тёплые носки. Шерсть 80%.");
  await modal.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Сохранено")).toBeVisible();
  await expect(modal).toBeHidden();

  const p = await api.product(PRODUCT.socks);
  expect(p.description).toBe("Тёплые носки. Шерсть 80%.");
  expect(p.stock).toBe(37);
});

test("конфликт остатка: 409 с понятным сообщением, в форме актуальный остаток", async ({ page, api }) => {
  await page.goto(`/products?edit=${PRODUCT.scarf}`);
  const modal = dialog(page, "Редактировать товар");
  await modal.getByRole("button", { name: "Шаг 3: Цена и склад" }).click();
  const stock = modal.getByLabel("Остаток");
  await expect(stock).toHaveValue("12");

  // Meanwhile 3 scarves are sold.
  await api.setProductStock(PRODUCT.scarf, 9);

  await stock.fill("20");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/api/admin/products/${PRODUCT.scarf}`) && r.request().method() === "PATCH"
  );
  await modal.getByRole("button", { name: "Сохранить" }).click();
  const res = await saved;
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("STOCK_CONFLICT");

  await expect(
    toast(page, "Остаток «E2E Шарф» изменился (было 12, стало 9) — обновите. В форме теперь актуальный остаток — проверьте и сохраните ещё раз.")
  ).toBeVisible();
  await expect(modal).toBeVisible();
  await expect(stock).toHaveValue("9");
  expect((await api.product(PRODUCT.scarf)).stock).toBe(9);

  // A deliberate decision on the fresh number goes through.
  await stock.fill("20");
  await modal.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Сохранено")).toBeVisible();
  await expect(modal).toBeHidden();
  expect((await api.product(PRODUCT.scarf)).stock).toBe(20);
});
