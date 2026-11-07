/**
 * Return wizard on a paid, delivered order: one position goes back to the shelf and its price goes to the
 * card through the bank — the right amount lands in the money journal, the stock grows by that unit.
 */
import { PRODUCT, money } from "../lib/seed";
import { containerOf, dialog, expect, openOrderFromBoard, test, toast } from "./fixtures";

test("частичный возврат одной позиции: сумма в журнале денег и остаток на складе", async ({ page, api, money: m }) => {
  const p = await m.buyOnline([
    { productId: PRODUCT.scarf, quantity: 1 },
    { productId: PRODUCT.socks, quantity: 1 },
  ]);
  expect(await m.mono.webhook(p.invoiceId)).toBe(200);
  await api.changeStatus(p.orderId, { status: "APPROVED" });
  await api.changeStatus(p.orderId, { status: "SHIPPED", trackingNumber: "20450000009999" });
  await api.changeStatus(p.orderId, { status: "DELIVERED" });
  const socksBefore = (await api.product(PRODUCT.socks)).stock;
  const scarfBefore = (await api.product(PRODUCT.scarf)).stock;

  const drawer = await openOrderFromBoard(page, p.orderId, p.buyerName);
  await drawer.getByRole("button", { name: "Оформить возврат" }).click();
  const modal = dialog(page, "↩️ Возврат");
  const next = modal.getByRole("button", { name: "Далее" });
  await modal.getByRole("button", { name: "Уже у нас" }).click();
  const line = containerOf(modal, page.getByText("E2E Носки", { exact: true }), page.getByRole("switch", { name: "Вернуть" }));
  await line.getByRole("switch", { name: "Вернуть" }).click();
  await next.click();

  // Money: what was paid for the socks, through the bank.
  await expect(modal.getByLabel("Сколько вернуть, UAH")).toHaveValue("99");
  await modal.getByRole("button", { name: /Автоматически через monobank/ }).click();
  await next.click();
  await modal.getByRole("button", { name: "Оформить возврат" }).click();
  await expect(toast(page, "Возврат оформлен")).toBeVisible();
  await expect(modal).toBeHidden();

  // The bank got one refund for the socks only, and the shop booked the same amount.
  await expect.poll(async () => (await api.order(p.orderId)).refundedMinor).toBe(9900);
  const cancels = await m.mono.cancels(p.invoiceId);
  expect(cancels).toHaveLength(1);
  expect(cancels[0].body.amount).toBe(9900);
  const order = await api.order(p.orderId);
  expect(order.status).toBe("DELIVERED");
  const refunds = order.admin?.movements?.filter((x) => x.kind === "REFUND") ?? [];
  expect(refunds.map((x) => [x.channel, x.amountMinor])).toEqual([["MONO", 9900]]);
  expect(order.items.find((i) => i.title === "E2E Носки")?.returnedQty).toBe(1);
  expect(order.items.find((i) => i.title === "E2E Шарф")?.returnedQty ?? 0).toBe(0);
  expect((await api.product(PRODUCT.socks)).stock).toBe(socksBefore + 1);
  expect((await api.product(PRODUCT.scarf)).stock).toBe(scarfBefore);

  // The journal on the card (a fold, closed by default) shows the same figures.
  const ledger = drawer.locator("details").filter({ hasText: "Журнал денег" });
  await ledger.locator("summary").click();
  await expect(ledger).toContainText(`Получено ${money(59800)}`);
  await expect(ledger).toContainText(`Возвращено ${money(9900)}`);
});
