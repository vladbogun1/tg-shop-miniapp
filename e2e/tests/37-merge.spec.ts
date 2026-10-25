/**
 * «Объединить заказы» (V71): the customer placed a second order before the first one shipped. The
 * newer one (a cap fully covered by a promo code, total 0, to another branch) joins the older one
 * (a backpack with the 150 ₴ prepayment paid): one parcel, the discount and the paid prepayment stay,
 * the rest is наложка. The newer order closes as «Объединён» and links to the one that stays.
 */
import { CUSTOMER, ORDER, money, shortId } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";

test("объединение: бесплатная кепка уезжает в заказ с рюкзаком, одной посылкой", async ({ page, api }) => {
  const drawer = await openOrderFromBoard(page, ORDER.mergeAway, CUSTOMER.mergeAway);
  await drawer.getByRole("button", { name: "Объединить", exact: true }).click();

  const modal = dialog(page, "Объединить заказы");
  // The only other open order of the customer is picked right away; the older one stays.
  await expect(modal.getByRole("button", { name: new RegExp(shortId(ORDER.mergeKeep)) }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(modal.getByRole("button", { name: /\(этот\)/ })).toHaveAttribute("aria-pressed", "false");

  // The branches differ: ship to the one of the newer order.
  await modal.getByRole("button", { name: new RegExp(`Из ${shortId(ORDER.mergeAway)}`) }).click();

  // 1299 ₴ in total, 150 ₴ prepayment already paid, the rest on delivery — nothing to pay online.
  await expect(modal.getByText(`Итого в ${shortId(ORDER.mergeKeep)}`)).toBeVisible();
  await expect(modal.getByText("Оплатить онлайн")).toHaveCount(0);
  await expect(modal.getByText(money(114900), { exact: true })).toBeVisible();

  await modal.getByRole("button", { name: "Объединить", exact: true }).click();
  await expect(toast(page, `Заказы объединены в ${shortId(ORDER.mergeKeep)}`)).toBeVisible();
  await expect(modal).toBeHidden();
  // The drawer switched to the order that stays.
  await expect(page.getByText("В этот заказ объединён")).toBeVisible();

  const kept = await api.order(ORDER.mergeKeep);
  expect(kept.status).toBe("APPROVED");
  expect(kept.items.map((i) => i.title).sort()).toEqual(["E2E Кепка", "E2E Рюкзак городской"]);
  expect(kept.totalMinor).toBe(129900);
  expect(kept.discountMinor).toBe(34900);
  expect(kept.receivedMinor).toBe(15000);
  expect(kept.amountDueMinor ?? 0).toBe(0);
  expect(kept.npWarehouseName).toContain("Відділення №2");
  expect(kept.admin?.mergedFromIds).toEqual([ORDER.mergeAway]);

  const away = await api.order(ORDER.mergeAway);
  expect(away.status).toBe("REJECTED");
  expect(away.rejectReasonCode).toBe("MERGED");
  expect(away.admin?.mergedIntoId).toBe(ORDER.mergeKeep);
  expect(away.items.map((i) => i.title)).toEqual(["E2E Кепка"]); // its own lines stay for the history
});
