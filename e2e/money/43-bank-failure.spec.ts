/**
 * The bank is down for one invoice (answers 500, or does not answer): that refund fails cleanly, books
 * nothing, and the other orders go on (package 1: a bad invoice does not block the rest).
 */
import { PRODUCT } from "../lib/seed";
import { expect, test } from "./fixtures";

const refund = (orderId: string, invoiceId: string) => `/api/admin/orders/${orderId}/payments/${invoiceId}/refund`;

test("банк отвечает 500 по одному счёту — чужой возврат и статус проходят", async ({ api, money: m }) => {
  const a = await m.buyOnline([{ productId: PRODUCT.cap, quantity: 1 }]);
  const b = await m.buyOnline([{ productId: PRODUCT.socks, quantity: 1 }]);
  expect(await m.mono.webhook(a.invoiceId)).toBe(200);
  expect(await m.mono.webhook(b.invoiceId)).toBe(200);
  await m.mono.fail("500", { invoiceId: a.invoiceId });

  // A: refused with an error, nothing is booked, nothing is left «в обработке».
  const failed = await api.raw("post", refund(a.orderId, a.invoiceId));
  expect(failed.status).toBe(400);
  const [invA] = await api.payments(a.orderId);
  expect(invA).toMatchObject({ status: "success", refundedMinor: 0, refundPending: false });
  // The status poll of A fails quietly too (no 5xx for the admin).
  expect((await api.raw("post", `/api/admin/orders/${a.orderId}/payments/refresh`)).status).toBe(200);

  // B: untouched by A's trouble.
  expect((await api.raw("post", refund(b.orderId, b.invoiceId))).status).toBe(200);
  expect((await api.order(b.orderId)).refundedMinor).toBe(9900);
  expect(await m.mono.cancels(b.invoiceId)).toHaveLength(1);

  // The bank is back: A's refund goes through.
  await m.mono.reset();
  expect((await api.raw("post", refund(a.orderId, a.invoiceId))).status).toBe(200);
  expect((await api.order(a.orderId)).refundedMinor).toBe(34900);
  expect(await m.mono.cancels(a.invoiceId)).toHaveLength(1);
});

test("банк молчит по одному счёту — другой возврат не ждёт его", async ({ api, money: m }) => {
  test.setTimeout(120_000);
  const a = await m.buyOnline([{ productId: PRODUCT.cap, quantity: 1 }]);
  const b = await m.buyOnline([{ productId: PRODUCT.socks, quantity: 1 }]);
  expect(await m.mono.webhook(a.invoiceId)).toBe(200);
  expect(await m.mono.webhook(b.invoiceId)).toBe(200);
  await m.mono.fail("timeout", { invoiceId: a.invoiceId, path: "/invoice/cancel", hangMs: 25_000 });

  let aDone = false;
  // The backend gives up on the bank after 15 s; the client waits longer than that.
  const slow = api.raw("post", refund(a.orderId, a.invoiceId), undefined, 60_000).then((r) => {
    aDone = true;
    return r;
  });
  // A's request has reached the bank and hangs there.
  await expect.poll(async () => (await m.mono.cancels(a.invoiceId)).length).toBe(1);

  // B goes through while A is still waiting for the bank.
  expect((await api.raw("post", refund(b.orderId, b.invoiceId))).status).toBe(200);
  expect(aDone).toBe(false);
  expect((await api.order(b.orderId)).refundedMinor).toBe(9900);

  // A gives up on the client timeout: a clean refusal, nothing booked, nothing pending.
  const result = await slow;
  expect(result.status).toBe(400);
  const [invA] = await api.payments(a.orderId);
  expect(invA).toMatchObject({ refundedMinor: 0, refundPending: false });
});
