/** «Внимание» on a phone: the row actions live in a bottom sheet behind «Отложить» (⋯). */
import { ORDER, shortId } from "../lib/seed";
import { expect, test, toast } from "../lib/test";

test("телефон: «Отложить» через нижний лист убирает строку", async ({ page, api }) => {
  try {
    await page.goto("/inbox");
    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { level: 2, name: /^Новые без одобрения/ }) });
    const target = section.getByRole("listitem").filter({ hasText: shortId(ORDER.stale) });
    await expect(target).toBeVisible();

    // Main action full width, «Отложить» as an icon button — both on screen, nothing cut off.
    const open = target.getByRole("button", { name: "Открыть заказ" });
    const more = target.getByRole("button", { name: "Отложить" });
    await expect(open).toBeInViewport();
    await target.scrollIntoViewIfNeeded();
    await expect(more).toBeInViewport();
    const box = await more.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    await more.click();
    const sheet = page.getByRole("dialog").filter({ hasText: "Отложить: на 1 час" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Отложить: на 1 час" }).click();

    await expect(sheet).toBeHidden();
    await expect(target).toHaveCount(0);
    await expect(toast(page, /^Отложено до/)).toBeVisible();
  } finally {
    await api.inboxRestore("NEW_STALE", ORDER.stale);
  }
});
