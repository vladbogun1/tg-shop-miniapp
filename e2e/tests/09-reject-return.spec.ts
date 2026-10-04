/**
 * Rejecting with a reason from the fixed list (and restocking), and a partial return of one line
 * with a refund.
 */
import { CUSTOMER, ORDER, PRODUCT, money } from "../lib/seed";
import { containerOf, dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";

test("отклонение: причина из списка обязательна, товар возвращается на склад", async ({ page, api }) => {
  const capBefore = (await api.product(PRODUCT.cap)).stock;
  const drawer = await openOrderFromBoard(page, ORDER.reject, CUSTOMER.reject);
  await drawer.getByRole("button", { name: "Отклонить", exact: true }).click();

  const modal = dialog(page, "Причина (обязательно)");
  const confirm = modal.getByRole("button", { name: "Подтвердить" });
  await expect(confirm).toBeDisabled();
  // «Другое» needs an explanation.
  await modal.getByRole("button", { name: "Другое", exact: true }).click();
  await expect(modal.getByLabel("Пояснение (обязательно)")).toBeVisible();
  await expect(confirm).toBeDisabled();

  await modal.getByRole("button", { name: "Нет в наличии", exact: true }).click();
  await expect(confirm).toBeEnabled();
  await modal.getByLabel("Пояснение (по желанию)").fill("Закончились кепки");
  await expect(modal.getByRole("switch", { name: "Вернуть товары на склад (1 шт.)" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await confirm.click();

  await expect(toast(page, "Статус: Отклонён")).toBeVisible();
  await expect(modal).toBeHidden();
  await expect(drawer).toContainText("Нет в наличии — Закончились кепки");

  const order = await api.order(ORDER.reject);
  expect(order.status).toBe("REJECTED");
  expect(order.rejectReasonCode).toBe("OUT_OF_STOCK");
  expect((await api.product(PRODUCT.cap)).stock).toBe(capBefore + 1);
});

test("возврат по позиции с суммой", async ({ page, api }) => {
  const capBefore = (await api.product(PRODUCT.cap)).stock;
  const drawer = await openOrderFromBoard(page, ORDER.delivered, CUSTOMER.delivered);
  await drawer.getByRole("button", { name: "Возврат", exact: true }).click();

  const modal = dialog(page, "Что вернули");
  const submit = modal.getByRole("button", { name: "Оформить возврат" });
  await expect(submit).toBeDisabled();

  // One cap back on the shelf; the t-shirt stays with the customer.
  const capLine = containerOf(modal, page.getByText("E2E Кепка", { exact: true }), page.getByRole("button", { name: "+" }));
  await capLine.getByRole("button", { name: "+" }).click();
  await expect(modal.getByRole("switch", { name: "На склад: +1 шт." })).toHaveAttribute("aria-checked", "true");
  await expect(capLine.getByRole("button", { name: "+" })).toBeDisabled(); // only 1 in the order

  await modal.getByRole("button", { name: `Подставить стоимость возвращённого: ${money(34900)}` }).click();
  const refund = modal.getByLabel("Вернуть денег, UAH");
  await expect(refund).toHaveValue("349");
  // More than was received is refused on the spot.
  await refund.fill("5000");
  await expect(modal.getByText(`Не больше полученного: ${money(94800)}`)).toBeVisible();
  await expect(submit).toBeDisabled();
  await refund.fill("349");
  await modal.getByLabel("Комментарий (в журнал)").fill("e2e: вернули кепку");
  await submit.click();

  await expect(toast(page, "Возврат оформлен")).toBeVisible();
  await expect(modal).toBeHidden();
  await expect(drawer).toContainText("Возврат оформлен");

  const order = await api.order(ORDER.delivered);
  expect(order.refundedMinor).toBe(34900);
  expect(order.status).toBe("DELIVERED");
  const cap = order.items.find((i) => i.title === "E2E Кепка")!;
  const tee = order.items.find((i) => i.title === "E2E Футболка базовая")!;
  expect(cap.returnedQty).toBe(1);
  expect(tee.returnedQty ?? 0).toBe(0);
  expect((await api.product(PRODUCT.cap)).stock).toBe(capBefore + 1);
});
