/**
 * Exchange in a delivered, paid order (V69): the cap is already back at the shop (onto the shelf), a
 * backpack goes out instead as a NEW linked order — the delivered order keeps its status and ТТН,
 * what the cap was paid for counts towards the new order, the rest is наложка.
 */
import { CUSTOMER, ORDER, PRODUCT, money } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";

test("обмен: кепка уже у нас, взамен рюкзак отдельным заказом, исходный остаётся «Доставлен»", async ({ page, api }) => {
  const capBefore = (await api.product(PRODUCT.cap)).stock;
  const bagBefore = (await api.product(PRODUCT.bag)).stock;
  const drawer = await openOrderFromBoard(page, ORDER.exchange, CUSTOMER.exchange);
  await drawer.getByRole("button", { name: "Обмен", exact: true }).click();

  const modal = dialog(page, "Что вернул покупатель");
  const submit = modal.getByRole("button", { name: "Оформить обмен" });
  await expect(submit).toBeDisabled();

  // 1. The cap came back; the buyer brought it in person — straight onto the shelf.
  // The cap is also in the replacement search list below — take the returned-line card (it has the stepper).
  const capLine = modal.locator(".card-2").filter({ hasText: "в заказе 1 шт." }).filter({ hasText: "E2E Кепка" });
  await capLine.getByRole("button", { name: "+" }).click();
  await capLine.getByRole("button", { name: "Уже у нас — на склад" }).click();
  await expect(capLine).toContainText("+1 шт. на склад сразу");
  await expect(submit).toBeDisabled(); // nothing chosen instead yet

  // 2. A backpack instead, found by search.
  await modal.getByLabel("Поиск товара на замену").fill("Рюкзак");
  await modal.getByRole("button", { name: /E2E Рюкзак городской/ }).click();
  await expect(modal.getByText(`${money(129900)} × 1 = ${money(129900)}`)).toBeVisible();

  // Dearer by 950 ₴ — paid for the cap counts, the rest goes as cash on delivery.
  await expect(modal.getByText(`Доплата ${money(95000)}`, { exact: false })).toBeVisible();
  await expect(modal.getByRole("button", { name: "В «Новые»" })).toBeVisible();
  await modal.getByLabel("Комментарий (в журнал)").fill("e2e: не подошёл размер");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(toast(page, "Обмен оформлен — создан заказ")).toBeVisible();
  await expect(modal).toBeHidden();
  // The drawer switched to the new order, which links back to the delivered one.
  await expect(drawer).toContainText("Замена по обмену из заказа");
  await expect(drawer).toContainText("E2E Рюкзак городской");

  const original = await api.order(ORDER.exchange);
  expect(original.status).toBe("DELIVERED");
  expect(original.trackingNumber).toBe("20450000000014");
  expect(original.refundedMinor).toBe(34900); // moved to the new order, not paid out
  expect(original.items.find((i) => i.title === "E2E Кепка")?.returnedQty).toBe(1);
  const childId = original.admin?.exchangeOrderIds?.[0];
  expect(childId).toBeTruthy();

  const child = await api.order(childId!);
  expect(child.status).toBe("NEW");
  expect(child.trackingNumber).toBeNull();
  expect(child.totalMinor).toBe(129900);
  expect(child.receivedMinor).toBe(34900);
  expect(child.admin?.exchangeOfId).toBe(ORDER.exchange);
  expect(child.items.map((i) => i.title)).toEqual(["E2E Рюкзак городской"]);
  expect((await api.product(PRODUCT.cap)).stock).toBe(capBefore + 1);
  expect((await api.product(PRODUCT.bag)).stock).toBe(bagBefore - 1);

  // Back to the delivered order from the banner.
  await drawer.getByRole("button", { name: `#${ORDER.exchange.slice(0, 8)}` }).first().click();
  await expect(drawer).toContainText("Обмен: новый заказ");
});
