/**
 * «Внимание»: groups and counters match the server, «Отложить» hides a row, «Разобрано» hides an
 * informational row and the toast's «Отменить» brings it back.
 */
import type { Page } from "@playwright/test";
import { ORDER, shortId } from "../lib/seed";
import { expect, test, toast } from "../lib/test";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A group's <section> found by its heading. */
function group(page: Page, title: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: new RegExp(`^${escapeRe(title)}`) }) });
}

/** The row (list item) of an order inside a group. */
function row(page: Page, title: string, orderId: string) {
  return group(page, title).getByRole("listitem").filter({ hasText: shortId(orderId) });
}

test("группы и счётчики совпадают с сервером", async ({ page, api }) => {
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Внимание", level: 1 })).toBeVisible();

  const inbox = await api.inbox();
  const shown = inbox.groups.filter((g) => g.items.length > 0);
  // The fixture puts something into these four groups.
  expect(shown.map((g) => g.id)).toEqual(expect.arrayContaining(["PAYMENT", "CHAT", "NEW_STALE", "RETURN"]));

  for (const g of shown) {
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(`^${escapeRe(g.title)}\\s*${g.count}$`) })
    ).toBeVisible();
    // Up to five rows per group are rendered before «Показать ещё».
    await expect(group(page, g.title).getByRole("listitem")).toHaveCount(Math.min(5, g.items.length));
  }
  // The menu badge shows the same total.
  await expect(page.getByLabel(`Требует внимания: ${inbox.total}`).first()).toBeVisible();

  // Seeded rows sit in their groups, with the right main action. The money group: an order paid
  // online that still waits for the admin («Оплачен онлайн — подтвердите заказ»).
  const money = shown.find((g) => g.id === "PAYMENT")!;
  expect(money.items.map((i) => i.entityId)).toContain(ORDER.paidOnline);
  const paidRow = row(page, money.title, ORDER.paidOnline);
  await expect(paidRow).toContainText("Оплачен онлайн — подтвердите заказ");
  await expect(paidRow.getByRole("button", { name: "Открыть заказ" })).toBeVisible();
  // Not paid yet = not in the money group (the customer still has time to pay).
  expect(money.items.map((i) => i.entityId)).not.toContain(ORDER.awaiting);
  await expect(row(page, "Непрочитанные чаты", ORDER.chat).getByRole("button", { name: "Ответить" })).toBeVisible();
  await expect(row(page, "Новые без одобрения", ORDER.stale)).toBeVisible();
  await expect(row(page, "Отказы и возвраты", ORDER.refused)).toBeVisible();
});

test("«Отложить» убирает строку и уменьшает счётчик", async ({ page, api }) => {
  try {
    await page.goto("/inbox");
    const before = (await api.inbox()).groups.find((g) => g.id === "NEW_STALE")!;
    const target = row(page, "Новые без одобрения", ORDER.stale);
    await expect(target).toBeVisible();

    await target.getByRole("button", { name: "Отложить" }).click();
    await page.getByRole("menuitem", { name: "На 1 час" }).click();

    await expect(target).toHaveCount(0);
    // «до 14:05», or with a date when the hour crosses midnight.
    await expect(toast(page, /^Отложено до .*\d{2}:\d{2}$/)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(`^Новые без одобрения\\s*${before.count - 1}$`) })
    ).toBeVisible();
    await expect(group(page, "Новые без одобрения")).toContainText("отложено: 1");

    const after = (await api.inbox()).groups.find((g) => g.id === "NEW_STALE")!;
    expect(after.items.map((i) => i.entityId)).not.toContain(ORDER.stale);
  } finally {
    await api.inboxRestore("NEW_STALE", ORDER.stale);
  }
});

test("«Разобрано» прячет строку, «Отменить» в тосте возвращает её", async ({ page, api }) => {
  await page.goto("/inbox");
  const target = row(page, "Отказы и возвраты", ORDER.refused);
  await expect(target).toBeVisible();
  await expect(target).toContainText("Юрій Відмовник");

  await target.getByRole("button", { name: "Разобрано" }).click();
  await expect(target).toHaveCount(0);
  await expect(toast(page, "Разобрано")).toBeVisible();
  expect((await api.inbox()).groups.find((g) => g.id === "RETURN")!.items.map((i) => i.entityId)).not.toContain(
    ORDER.refused
  );

  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(target).toBeVisible();
  await expect
    .poll(async () => (await api.inbox()).groups.find((g) => g.id === "RETURN")!.items.map((i) => i.entityId))
    .toContain(ORDER.refused);
});
