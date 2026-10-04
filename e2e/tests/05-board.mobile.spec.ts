/**
 * The board on a phone (390×844): status tabs with counters instead of columns, search by the short
 * number, and the order card's × is on screen and closes it (the long header used to push it off).
 */
import { CUSTOMER, ORDER, shortId } from "../lib/seed";
import { boardSearch, expect, orderDrawer, test } from "../lib/test";

test("телефон: вкладки статусов, поиск, карточка закрывается крестиком", async ({ page, api }) => {
  await page.goto("/");
  const board = await api.board("month");

  // Tabs carry the server counters.
  await expect(page.getByRole("button", { name: new RegExp(`Новый\\s*${board.counts.NEW}$`) })).toBeVisible();
  await expect(page.getByText(CUSTOMER.stale, { exact: true })).toBeVisible();
  // The kanban is not mounted on a phone.
  await expect(page.getByText("Пусто")).toHaveCount(0);

  await boardSearch(page).fill(shortId(ORDER.shipped));
  await page.getByRole("button", { name: /Отправлен\s*1$/ }).click();
  const card = page.getByText(CUSTOMER.shipped, { exact: true });
  await expect(card).toHaveCount(1);
  await card.click();

  const drawer = orderDrawer(page, ORDER.shipped);
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(CUSTOMER.shipped);

  const close = drawer.getByRole("button", { name: "Закрыть" });
  await expect(close).toBeInViewport({ ratio: 1 });
  const box = await close.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  // One main action + «⋯» at the bottom, also on screen.
  await expect(drawer.getByRole("button", { name: "Другие действия" })).toBeInViewport();

  await close.click();
  await expect(drawer).toBeHidden();
  await expect(card).toBeVisible();
});
