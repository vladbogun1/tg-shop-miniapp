/**
 * «Товары» list: search, status filter counters, «на витрине» switch with the «Отменить» toast,
 * archive → «Архив» → «Восстановить». Uses its own seeded «E2E Термос» (READY, on the storefront).
 */
import type { Locator, Page } from "@playwright/test";
import { EXTRA_PRODUCT } from "../lib/seed";
import { expect, test, toast } from "../lib/test";

function productRow(page: Page, title: string): Locator {
  return page.locator("div.card").filter({ has: page.getByRole("heading", { level: 3, name: title, exact: true }) });
}

function filterChip(page: Page, label: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^${label}\\s*\\d+$`) });
}

async function chipCount(loc: Locator): Promise<number> {
  return Number(((await loc.innerText()).match(/(\d+)\s*$/) ?? [0, 0])[1]);
}

test("поиск, «на витрине» с отменой, счётчик «Скрытые», архив и восстановление", async ({ page, api }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Товары", level: 1 })).toBeVisible();
  const row = productRow(page, "E2E Термос");

  await page.getByLabel("Поиск по названию").fill("термос");
  await expect(row).toBeVisible();
  await expect(productRow(page, "E2E Кепка")).toHaveCount(0);
  await page.getByLabel("Поиск по названию").fill("");
  await expect(productRow(page, "E2E Кепка")).toBeVisible();

  const hiddenBefore = await chipCount(filterChip(page, "Скрытые"));

  // Hide: toast with «Отменить», badge «скрыт», counter +1, API inactive.
  await row.getByRole("switch").click();
  await expect(toast(page, "«E2E Термос» скрыт с витрины")).toBeVisible();
  await expect(row.getByText("скрыт", { exact: true })).toBeVisible();
  await expect.poll(() => chipCount(filterChip(page, "Скрытые"))).toBe(hiddenBefore + 1);
  expect((await api.product(EXTRA_PRODUCT.thermos)).active).toBe(false);

  // «Отменить» puts it back.
  await page.getByRole("button", { name: "Отменить" }).last().click();
  await expect.poll(async () => (await api.product(EXTRA_PRODUCT.thermos)).active).toBe(true);
  await expect(row.getByText("скрыт", { exact: true })).toHaveCount(0);
  await expect.poll(() => chipCount(filterChip(page, "Скрытые"))).toBe(hiddenBefore);

  // Filter «Скрытые» lists only hidden products.
  await filterChip(page, "Скрытые").click();
  await expect(row).toHaveCount(0);
  await filterChip(page, "Все").click();

  // Archive → gone from the active list, present in «Архив», restore brings it back.
  await row.getByRole("button", { name: "В архив" }).click();
  await expect(toast(page, "«E2E Термос» в архиве")).toBeVisible();
  await expect(row).toHaveCount(0);
  const archived = await api.raw("get", "/api/admin/products/archived");
  expect((archived.body as unknown as { id: string }[]).map((p) => p.id)).toContain(EXTRA_PRODUCT.thermos);

  await page.getByRole("button", { name: "Архив", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Восстановить" }).click();
  await expect(toast(page, "«E2E Термос» восстановлен")).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Активные", exact: true }).click();
  await expect(row).toBeVisible();
  expect((await api.product(EXTRA_PRODUCT.thermos)).title).toBe("E2E Термос");

  const actions = (await api.audit(`&entityId=${EXTRA_PRODUCT.thermos}`)).map((e) => e.action);
  expect(actions.length).toBeGreaterThanOrEqual(4);
});
