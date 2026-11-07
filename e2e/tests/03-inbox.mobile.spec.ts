/**
 * «Внимание» on a phone (variant B): the groups are a chat list, a tap opens a group with cards;
 * a card's actions: the main one, «Разобрано» (✓) and «Отложить» (a bottom sheet with the presets).
 */
import { ORDER, shortId } from "../lib/seed";
import { expect, test, toast } from "../lib/test";

test("телефон: группа открывается из списка, «Отложить» через нижний лист убирает строку", async ({ page, api }) => {
  try {
    await page.goto("/inbox");
    // Screen 1: groups only, no rows yet.
    const entry = page.getByRole("button", { name: /^Новые без одобрения/ });
    await expect(entry).toBeVisible();
    // An entry previews the group's first row as one line, but no row card (with its actions) is on screen yet.
    await expect(page.getByRole("button", { name: "Открыть заказ" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Отложить" })).toHaveCount(0);
    await entry.click();

    // Screen 2: the group's cards.
    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { level: 2, name: /^Новые без одобрения/ }) });
    const target = section.getByRole("listitem").filter({ hasText: shortId(ORDER.stale) });
    // Other specs may add rows above (an exchanged order is back in «Новые») — scroll to it first.
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeVisible();

    // Main action full width, «Отложить» as an icon button — both on screen, nothing cut off.
    const open = target.getByRole("button", { name: "Открыть заказ" });
    const more = target.getByRole("button", { name: "Отложить" });
    await expect(open).toBeInViewport();
    await expect(more).toBeInViewport();
    const box = await more.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await more.click();
    const sheet = page.getByRole("dialog").filter({ hasText: "Отложить" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "На 1 час" }).click();

    await expect(sheet).toBeHidden();
    await expect(target).toHaveCount(0);
    await expect(toast(page, /^Отложено до/)).toBeVisible();
  } finally {
    await api.inboxRestore("NEW_STALE", ORDER.stale);
  }
});
