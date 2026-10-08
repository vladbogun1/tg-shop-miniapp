/**
 * Exchange in a delivered, paid order: the cap comes back (into circulation), a backpack goes out
 * instead — in the same order, which returns to «Новые» without a ТТН; the difference is наложка.
 */
import { CUSTOMER, ORDER, PRODUCT, money } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";

test("обмен: вернули кепку на склад, взамен рюкзак, заказ снова «Новый»", async ({ page, api }) => {
  const capBefore = (await api.product(PRODUCT.cap)).stock;
  const bagBefore = (await api.product(PRODUCT.bag)).stock;
  const drawer = await openOrderFromBoard(page, ORDER.exchange, CUSTOMER.exchange);
  await drawer.getByRole("button", { name: "Обмен", exact: true }).click();

  const modal = dialog(page, "Что вернул покупатель");
  const submit = modal.getByRole("button", { name: "Оформить обмен" });
  await expect(submit).toBeDisabled();

  // 1. The cap came back and goes back on the shelf.
  // The cap is also in the replacement search list below — take the returned-line card (it has the stepper).
  const capLine = modal.locator(".card-2").filter({ hasText: "в заказе 1 шт." }).filter({ hasText: "E2E Кепка" });
  await capLine.getByRole("button", { name: "+" }).click();
  await expect(modal.getByRole("switch", { name: "Вернуть в оборот (на склад +1 шт.)" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await expect(submit).toBeDisabled(); // nothing chosen instead yet

  // 2. A backpack instead, found by search.
  await modal.getByLabel("Поиск товара на замену").fill("Рюкзак");
  await modal.getByRole("button", { name: /E2E Рюкзак городской/ }).click();
  await expect(modal.getByText(`${money(129900)} × 1 = ${money(129900)}`)).toBeVisible();

  // Dearer by 950 ₴ — the hint says it goes as cash on delivery.
  await expect(modal.getByText(`Доплата ${money(95000)}`, { exact: false })).toBeVisible();
  await expect(modal.getByRole("button", { name: "В «Новые»" })).toBeVisible();
  await modal.getByLabel("Комментарий (в журнал)").fill("e2e: не подошёл размер");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(toast(page, "Обмен оформлен — заказ снова в «Новых»")).toBeVisible();
  await expect(modal).toBeHidden();
  await expect(drawer).toContainText("Вернули:");
  await expect(drawer).toContainText("E2E Кепка ×1 (на склад)");
  await expect(drawer).toContainText("старая ТТН 20450000000014");

  const order = await api.order(ORDER.exchange);
  expect(order.status).toBe("NEW");
  expect(order.trackingNumber).toBeNull();
  expect(order.totalMinor).toBe(129900);
  expect(order.receivedMinor).toBe(34900); // the money already paid stays; the rest is наложка
  expect(order.paid).toBe(true);
  expect(order.items.map((i) => i.title)).toEqual(["E2E Рюкзак городской"]);
  expect((await api.product(PRODUCT.cap)).stock).toBe(capBefore + 1);
  expect((await api.product(PRODUCT.bag)).stock).toBe(bagBefore - 1);
});
