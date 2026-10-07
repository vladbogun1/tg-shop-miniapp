/**
 * Payment in the order card. Payment is online only (monobank):
 *  - the «Онлайн-оплата» block lists the invoices (status, card, RRN) and shows the deadline while
 *    the order is unpaid;
 *  - «Вернуть деньги» asks full / partial (≤ what is left) and then an explicit confirmation —
 *    checked up to the confirmation only (the e2e stack has no monobank token);
 *  - the manual «Скорректировать оплату» (наложка, mistakes) starts on «Предоплата», names the
 *    amount, and «Полная оплата» needs a second, explicit confirmation.
 */
import type { Page } from "@playwright/test";
import { CUSTOMER, ORDER, money } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";

const TOTAL = 94800;
const PREPAY = 15000;

/** The refund dialog (the drawer behind it also has a «Вернуть деньги» button). */
function refundDialog(page: Page) {
  return page.getByRole("dialog").filter({ hasText: "Можно вернуть" });
}

test("онлайн-оплата: платёж в карточке, возврат — сумма не больше оплаченной и подтверждение", async ({
  page,
  api,
}) => {
  const drawer = await openOrderFromBoard(page, ORDER.paidOnline, CUSTOMER.paidOnline);
  const block = drawer.getByRole("region", { name: "Онлайн-оплата" });
  await expect(block).toBeVisible();
  await expect(block).toContainText("Оплачен");
  await expect(block).toContainText(money(PREPAY));
  await expect(block).toContainText("•••• 1902");
  await expect(block).toContainText("000000e2e0d1"); // RRN
  await expect(block.getByRole("button", { name: "Обновить статус" })).toBeVisible();
  // Paid: no deadline any more.
  await expect(block).not.toContainText("Оплатить до");

  await block.getByRole("button", { name: "Вернуть деньги" }).click();
  const modal = refundDialog(page);
  await expect(modal).toBeVisible();
  const full = modal.getByRole("button", { name: /^Всю сумму/ });
  await expect(full).toHaveAttribute("aria-pressed", "true");
  await expect(full).toContainText(money(PREPAY));
  await expect(modal.getByRole("button", { name: `Вернуть · ${money(PREPAY)}` })).toBeEnabled();

  // Partial: more than was paid is refused.
  await modal.getByRole("button", { name: /^Часть суммы/ }).click();
  const amount = modal.getByRole("spinbutton", { name: /^Сумма возврата/ });
  await amount.fill("200");
  await expect(modal.getByText(`Не больше ${money(PREPAY)}`)).toBeVisible();
  await expect(modal.getByRole("button", { name: "Укажите сумму" })).toBeDisabled();

  // A valid part → a second, explicit step before the money leaves.
  await amount.fill("50");
  await modal.getByRole("button", { name: `Вернуть · ${money(5000)}` }).click();
  await expect(modal.getByText("Деньги уйдут на карту покупателя, отменить нельзя")).toBeVisible();
  await expect(modal.getByRole("button", { name: `Да, вернуть ${money(5000)}` })).toBeVisible();
  await modal.getByRole("button", { name: "Назад" }).click();
  await expect(modal.getByText("Деньги уйдут на карту покупателя, отменить нельзя")).toBeHidden();

  // Leave without refunding (the partial amount is typed → «Закрыть без сохранения?» first).
  await modal.getByRole("button", { name: "Отмена", exact: true }).click();
  const guard = dialog(page, "Закрыть без сохранения?");
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  await expect(modal).toBeHidden();

  const invoices = await api.payments(ORDER.paidOnline);
  expect(invoices[0].status).toBe("success");
  expect(invoices[0].refundedMinor).toBe(0);
  expect(invoices[0].refundPending).toBe(false);
});

test("ждёт онлайн-оплату: срок «Оплатить до», ссылка выдана", async ({ page, api }) => {
  const drawer = await openOrderFromBoard(page, ORDER.awaiting, CUSTOMER.awaiting);
  await expect(drawer.getByText("Ждёт оплаты").first()).toBeVisible();
  const block = drawer.getByRole("region", { name: "Онлайн-оплата" });
  await expect(block).toContainText("Оплатить до");
  await expect(block).toContainText(/осталось \d+/);
  await expect(block).toContainText("Ссылка выдана");
  await expect(block).toContainText(`К оплате онлайн: ${money(PREPAY)}`);
  // Nothing paid → nothing to refund.
  await expect(block.getByRole("button", { name: "Вернуть деньги" })).toHaveCount(0);

  const order = await api.order(ORDER.awaiting);
  expect(order.paid).toBe(false);
  expect(order.paymentDueAt).toBeTruthy();
});

test("ручная корректировка: по умолчанию «Предоплата», подтверждение суммы", async ({ page, api }) => {
  const drawer = await openOrderFromBoard(page, ORDER.prepay, CUSTOMER.prepay);
  await drawer.getByRole("button", { name: "Скорректировать оплату" }).click();

  const modal = dialog(page, "Корректировка оплаты");
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
  // The same entry point stays for further corrections.
  await expect(drawer.getByRole("button", { name: "Скорректировать оплату" })).toBeVisible();
});
