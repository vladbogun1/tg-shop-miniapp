/**
 * Recording a payment on an order with a prepayment: the dialog starts on «Предоплата» (not on
 * «Полная оплата» — one hasty tap used to zero the cash-on-delivery), the button names the amount,
 * and «Полная оплата» needs a second, explicit confirmation.
 */
import { CUSTOMER, ORDER, money } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";

const TOTAL = 94800;
const PREPAY = 15000;

test("оплата: по умолчанию «Предоплата», подтверждение суммы", async ({ page, api }) => {
  const drawer = await openOrderFromBoard(page, ORDER.prepay, CUSTOMER.prepay);
  await drawer.getByRole("button", { name: "Отметить оплаченным" }).click();

  const modal = dialog(page, "Оплата заказа");
  await expect(modal).toBeVisible();
  const prepay = modal.getByRole("button", { name: /^Предоплата/ });
  const full = modal.getByRole("button", { name: /^Полная оплата/ });
  await expect(prepay).toHaveAttribute("aria-pressed", "true");
  await expect(full).toHaveAttribute("aria-pressed", "false");
  await expect(prepay).toContainText(money(PREPAY));
  await expect(modal.getByText(/Наложка после сохранения/)).toContainText(money(TOTAL - PREPAY));

  // «Полная оплата» asks again before recording the whole amount — and can be taken back.
  await full.click();
  await modal.getByRole("button", { name: `Подтвердить · ${money(TOTAL)}` }).click();
  await expect(modal.getByRole("button", { name: `Да, получено ${money(TOTAL)}` })).toBeVisible();
  await expect(modal.getByText(/Наложка станет 0/)).toBeVisible();
  await modal.getByRole("button", { name: "Назад" }).click();
  expect((await api.order(ORDER.prepay)).receivedMinor).toBe(0);

  await prepay.click();
  await modal.getByRole("button", { name: `Подтвердить · ${money(PREPAY)}` }).click();
  await expect(toast(page, "Оплата обновлена")).toBeVisible();
  await expect(modal).toBeHidden();

  const order = await api.order(ORDER.prepay);
  expect(order.receivedMinor).toBe(PREPAY);
  // The card now offers to change the payment, and shows what is left to collect.
  await expect(drawer.getByRole("button", { name: "Изменить оплату" })).toBeVisible();
});
