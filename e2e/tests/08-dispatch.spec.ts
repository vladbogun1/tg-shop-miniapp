/**
 * «Отправка»: the ТТН field and «Отправлено» right on the order card (no drawer, no modal).
 * A NEW order still waiting for its online prepayment cannot be shipped from here.
 */
import type { Page } from "@playwright/test";
import { CUSTOMER, ORDER } from "../lib/seed";
import { containerOf, expect, test, toast } from "../lib/test";

/** A dispatch card: the block holding the order's «открыть заказ» button and the ship form. */
function card(page: Page, orderId: string) {
  const hex = orderId.slice(0, 8);
  return containerOf(
    page,
    page.getByRole("button", { name: new RegExp(`${hex}.*открыть заказ`) }),
    page.getByRole("button", { name: "Отправлено" })
  );
}

test("ТТН и «Отправлено» прямо в карточке", async ({ page, api }) => {
  await page.goto("/dispatch");
  await expect(page.getByRole("heading", { name: /^Одобрены · \d+$/ })).toBeVisible();

  const c = card(page, ORDER.dispatch);
  await expect(c).toContainText(CUSTOMER.dispatch);
  await expect(c).toContainText("Наложка: 0"); // paid in full
  const ttn = c.getByRole("textbox", { name: "Номер ТТН" });
  const ship = c.getByRole("button", { name: "Отправлено" });
  await expect(ship).toBeDisabled();

  await ttn.fill("20450000000007");
  await ship.click();
  await expect(toast(page, "#e2e00007 отправлен, ТТН ушла клиенту")).toBeVisible();
  // Shipped orders leave the list.
  await expect(page.getByRole("button", { name: /e2e00007.*открыть заказ/ })).toHaveCount(0);

  const order = await api.order(ORDER.dispatch);
  expect(order.status).toBe("SHIPPED");
  expect(order.trackingNumber).toBe("20450000000007");
});

test("новый заказ без онлайн-предоплаты отправить нельзя", async ({ page, api }) => {
  await page.goto("/dispatch");
  await expect(page.getByRole("heading", { name: /^Новые — можно отправить сразу · \d+$/ })).toBeVisible();

  const c = card(page, ORDER.awaiting);
  await expect(c).toContainText("Ждём онлайн-предоплату 150 ₴");
  await c.getByRole("textbox", { name: "Номер ТТН" }).fill("20450000000002");
  await expect(c.getByRole("button", { name: "Отправлено" })).toBeDisabled();
  expect((await api.order(ORDER.awaiting)).status).toBe("NEW");
});
