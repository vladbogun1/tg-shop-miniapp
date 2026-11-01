/**
 * «Доплатити»: the admin adds an item to a paid order, the buyer pays the difference on a second
 * payment page, the bank's webhook closes the order as paid in full.
 */
import { PRODUCT, money } from "../lib/seed";
import { expect, openOrderFromBoard, test } from "./fixtures";

test("доплата за добавленный товар: второй счёт на разницу, вебхук — заказ оплачен полностью", async ({
  page,
  api,
  money: m,
}) => {
  const p = await m.buyOnline([{ productId: PRODUCT.cap, quantity: 1 }]);
  expect(await m.mono.webhook(p.invoiceId)).toBe(200);
  expect((await p.buyer.order(p.orderId)).paid).toBe(true);

  // The admin adds a scarf (499 ₴) to the paid order.
  const added = await api.raw("post", `/api/admin/orders/${p.orderId}/items`, {
    productId: PRODUCT.scarf,
    quantity: 1,
    notifyCustomer: false,
  });
  expect(added.status).toBe(200);
  const due = await p.buyer.order(p.orderId);
  expect(due.totalMinor).toBe(34900 + 49900);
  expect(due.amountDueMinor).toBe(49900);

  const drawer = await openOrderFromBoard(page, p.orderId, p.buyerName);
  const block = drawer.getByRole("region", { name: "Онлайн-оплата" });
  await expect(drawer).toContainText("E2E Шарф");
  await expect(block).toContainText(money(34900));

  // «Доплатити»: a new invoice for the difference only.
  const top = await p.buyer.startPayment(p.orderId);
  expect(top.amountMinor).toBe(49900);
  expect(top.invoiceId).not.toBe(p.invoiceId);
  expect(await m.mono.webhook(top.invoiceId)).toBe(200);

  const order = await api.order(p.orderId);
  expect(order.paid).toBe(true);
  expect(order.receivedMinor).toBe(84800);
  const mine = await p.buyer.order(p.orderId);
  expect(mine.amountDueMinor).toBe(0);
  expect(mine.receivedMinor).toBe(84800);
  const invoices = await api.payments(p.orderId);
  expect(invoices.map((i) => [i.amountMinor, i.status]).sort()).toEqual([
    [34900, "success"],
    [49900, "success"],
  ]);
  // The admin card lists both payments.
  const reopened = (await openOrderFromBoard(page, p.orderId, p.buyerName)).getByRole("region", { name: "Онлайн-оплата" });
  await expect(reopened).toContainText(money(49900));
  await expect(reopened).toContainText(money(34900));
});
