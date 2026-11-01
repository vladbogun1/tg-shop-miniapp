/**
 * Refund to the card: a double click on the confirmation sends the bank exactly one request (package 1:
 * one refund at a time per order, the same refund keeps the same bank reference).
 */
import { PRODUCT, money } from "../lib/seed";
import { expect, openOrderFromBoard, test } from "./fixtures";

test("двойной клик «Да, вернуть» — в банк уходит один запрос на возврат", async ({ page, api, money: m }) => {
  const p = await m.buyOnline([{ productId: PRODUCT.cap, quantity: 1 }]);
  expect(await m.mono.webhook(p.invoiceId)).toBe(200);

  const drawer = await openOrderFromBoard(page, p.orderId, p.buyerName);
  await drawer.getByRole("region", { name: "Онлайн-оплата" }).getByRole("button", { name: "Вернуть только деньги" }).click();
  const modal = page.getByRole("dialog").filter({ hasText: "Можно вернуть" });
  await modal.getByRole("button", { name: `Вернуть · ${money(34900)}` }).click();
  await modal.getByRole("button", { name: `Да, вернуть ${money(34900)}` }).dblclick();
  await expect(modal).toBeHidden();

  // The refund settled at the bank and in the shop — and the bank was asked once.
  await expect.poll(async () => (await api.payments(p.orderId))[0].refundedMinor).toBe(34900);
  expect(await m.mono.cancels(p.invoiceId)).toHaveLength(1);
  const order = await api.order(p.orderId);
  expect(order.refundedMinor).toBe(34900);
  expect(order.admin?.movements?.filter((x) => x.kind === "REFUND")).toHaveLength(1);
  // Nothing left to refund: the button is gone.
  await expect(drawer.getByRole("button", { name: "Вернуть только деньги" })).toHaveCount(0);
});
