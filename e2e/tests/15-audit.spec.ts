/**
 * «Журнал» shows what the admin did — including everything the specs before it did to orders in
 * this run (the seed empties the log, so every order entry here comes from this run).
 */
import { ORDER, shortId } from "../lib/seed";
import { expect, test } from "../lib/test";

test("журнал показывает действия, сделанные в тестах", async ({ page, api }) => {
  // An action of this spec's own, so the check stands on its own when run alone.
  await api.changeStatus(ORDER.audit, { status: "APPROVED" });

  const entries = await api.audit();
  const touchedOrders = [...new Set(entries.filter((e) => e.entityType === "ORDER" && e.entityId).map((e) => e.entityId!))];
  expect(touchedOrders).toContain(ORDER.audit);

  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Журнал", level: 1 })).toBeVisible();

  const own = page
    .getByRole("row")
    .filter({ hasText: "Статус заказа" })
    .filter({ has: page.getByRole("link", { name: shortId(ORDER.audit) }) });
  await expect(own.first()).toBeVisible();
  await expect(own.first()).toContainText("Bootstrap admin");

  // Every order the specs acted on is in the log, linked to the order.
  for (const id of touchedOrders) {
    await expect(page.getByRole("link", { name: shortId(id) }).first()).toBeVisible();
  }
  await expect(page.getByText(`Показано: ${entries.length}`)).toBeVisible();

  // Filtering by action leaves only that action.
  await page.getByRole("button", { name: "Все действия" }).click();
  await page.getByRole("button", { name: "Статус заказа", exact: true }).click();
  const statusOnly = entries.filter((e) => e.action === "ORDER_STATUS").length;
  await expect(page.getByText(`Показано: ${statusOnly}`)).toBeVisible();
  const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
  await expect(rows).toHaveCount(statusOnly);
  for (const r of await rows.all()) await expect(r).toContainText("Статус заказа");
});
