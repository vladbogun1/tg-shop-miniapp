/**
 * Payment by the bank's webhook: a signed one marks the order paid (admin card and the buyer's view),
 * the same one again changes nothing, a forged one is refused (P2-23).
 */
import { PRODUCT, money } from "../lib/seed";
import { expect, openOrderFromBoard, test } from "./fixtures";

test("вебхук monobank: заказ оплачен у админа и у покупателя, повтор ничего не дублирует", async ({
  page,
  api,
  money: m,
}) => {
  const p = await m.buyOnline([{ productId: PRODUCT.cap, quantity: 1 }]);
  expect(p.amountMinor).toBe(34900);
  expect((await p.buyer.order(p.orderId)).paid).toBe(false);

  // A webhook with a wrong signature is refused and pays nothing.
  expect(await m.mono.webhook(p.invoiceId, { sign: false })).toBe(401);
  expect((await api.order(p.orderId)).paid).toBe(false);

  expect(await m.mono.webhook(p.invoiceId)).toBe(200);
  const order = await api.order(p.orderId);
  expect(order.paid).toBe(true);
  expect(order.receivedMinor).toBe(34900);
  const mine = await p.buyer.order(p.orderId);
  expect(mine.paid).toBe(true);
  expect(mine.amountDueMinor).toBe(0);

  // The admin card.
  const drawer = await openOrderFromBoard(page, p.orderId, p.buyerName);
  const block = drawer.getByRole("region", { name: "Онлайн-оплата" });
  await expect(block).toContainText("Оплачен");
  await expect(block).toContainText(money(34900));
  await expect(block).toContainText("•••• 1111");

  // The same webhook again (the bank retries): accepted, nothing is booked twice.
  expect(await m.mono.webhook(p.invoiceId)).toBe(200);
  const again = await api.order(p.orderId);
  expect(again.receivedMinor).toBe(34900);
  expect(again.admin?.movements?.filter((x) => x.kind === "PAYMENT")).toHaveLength(1);
  const invoices = await api.payments(p.orderId);
  expect(invoices).toHaveLength(1);
  expect(invoices[0]).toMatchObject({ invoiceId: p.invoiceId, status: "success", refundedMinor: 0 });
});
