/**
 * The orders board (desktop kanban): columns with counts and money totals as the server reports
 * them, search by the short order number, the order card, and Esc closing only the top layer.
 */
import type { Page } from "@playwright/test";
import { CUSTOMER, ORDER, money, shortId } from "../lib/seed";
import { boardSearch, dialog, expect, openOrderFromBoard, orderDrawer, test } from "../lib/test";

const COLUMNS = [
  ["NEW", "Новый"],
  ["APPROVED", "Одобрен"],
  ["SHIPPED", "Отправлен"],
  ["DELIVERED", "Доставлен"],
  ["REJECTED", "Отклонён"],
] as const;

/** A kanban column: the innermost block holding its title and its money total. */
function column(page: Page, label: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .filter({ hasText: "₴" })
    .last();
}

test("колонки: количество и сумма совпадают с сервером", async ({ page, api }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();
  const board = await api.board("month");

  for (const [status, label] of COLUMNS) {
    const col = column(page, label);
    const count = board.counts[status] ?? 0;
    await expect(col).toContainText(money(board.sums?.[status] ?? 0));
    // Header = title + count badge (the block with the title but without the total).
    const header = col
      .locator("div")
      .filter({ has: page.getByText(label, { exact: true }) })
      .filter({ hasNotText: "₴" })
      .first();
    await expect(header).toHaveText(new RegExp(`${label}\\s*${count}$`));
    if (count === 0) await expect(col).toContainText("Пусто");
  }
  // The fixture's NEW orders are on the board.
  await expect(column(page, "Новый").getByText(CUSTOMER.stale, { exact: true })).toBeVisible();
});

test("поиск по #короткому-номеру оставляет один заказ, карточка открывается", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(CUSTOMER.stale, { exact: true })).toBeVisible();

  await boardSearch(page).fill(shortId(ORDER.shipped));
  await expect(page.getByText(CUSTOMER.stale, { exact: true })).toHaveCount(0);
  await expect(page.getByText(CUSTOMER.shipped, { exact: true })).toHaveCount(1);
  await expect(page.getByText("Пусто")).toHaveCount(4);
  await expect(column(page, "Отправлен").getByText(CUSTOMER.shipped, { exact: true })).toBeVisible();

  // Without "#" and with only the first characters it still finds the order.
  await boardSearch(page).fill("e2e0000b");
  await expect(page.getByText(CUSTOMER.shipped, { exact: true })).toHaveCount(1);

  await page.getByText(CUSTOMER.shipped, { exact: true }).click();
  const drawer = orderDrawer(page, ORDER.shipped);
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("59000000000011");
  await expect(drawer.getByRole("button", { name: "Детали", exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Доставлен", exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "Закрыть" }).click();
  await expect(drawer).toBeHidden();
});

test("Esc закрывает только верхний слой: сначала корректировку оплаты, потом карточку", async ({ page }) => {
  const drawer = await openOrderFromBoard(page, ORDER.shipped, CUSTOMER.shipped);

  await drawer.getByRole("button", { name: "Скорректировать оплату" }).click();
  const pay = dialog(page, "Корректировка оплаты");
  await expect(pay).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(pay).toBeHidden();
  await expect(drawer).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  // The board is still there (the drawer did not navigate away).
  await expect(page.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();
});

test("Esc на заполненной форме: сначала «Закрыть без сохранения?», ввод не теряется", async ({ page, api }) => {
  const drawer = await openOrderFromBoard(page, ORDER.shipped, CUSTOMER.shipped);
  await drawer.getByRole("button", { name: "Отклонить", exact: true }).click();
  const modal = dialog(page, "Причина (обязательно)");
  await modal.getByRole("button", { name: "Отказ на почте", exact: true }).click();
  await modal.getByLabel("Пояснение (по желанию)").fill("черновик");

  // Esc → the guard on top; Esc again closes only the guard, the form keeps what was typed.
  await page.keyboard.press("Escape");
  const guard = dialog(page, "Закрыть без сохранения?");
  await expect(guard).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guard).toBeHidden();
  await expect(modal.getByLabel("Пояснение (по желанию)")).toHaveValue("черновик");
  await expect(drawer).toBeVisible();

  // Confirming the guard closes the form only; the order card stays.
  await page.keyboard.press("Escape");
  await guard.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  await expect(modal).toBeHidden();
  await expect(drawer).toBeVisible();
  expect((await api.order(ORDER.shipped)).status).toBe("SHIPPED");
});
