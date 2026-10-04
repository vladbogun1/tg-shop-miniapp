/**
 * `test` with the fixtures every spec uses, plus small page helpers. Locators go by role, label
 * and visible text only (no test ids): the admin markup is being reworked in parallel (PWA /
 * mobile), and these are what a user sees anyway.
 */
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { Api } from "./api";
import { shortId } from "./seed";

export const test = base.extend<{ api: Api; failOnPageErrors: void }>({
  api: async ({}, use) => {
    const api = await Api.create();
    await use(api);
    await api.dispose();
  },
  // Every spec fails on an uncaught exception in the page (a crashed React tree often still
  // "looks" fine for the assertion that happens to run next).
  failOnPageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await use();
      expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The toast with this text (toasts are plain text in the bottom-right stack). */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.getByText(text).last();
}

/** The topmost dialog (Modal / Drawer / sheet) whose content matches. */
export function dialog(page: Page, hasText?: string | RegExp): Locator {
  const all = page.getByRole("dialog");
  return hasText ? all.filter({ hasText }) : all.last();
}

/** The order drawer: the dialog whose header shows the order number. */
export function orderDrawer(page: Page, orderId: string): Locator {
  return page.getByRole("dialog").filter({ hasText: shortId(orderId) }).first();
}

/** Board search box. */
export function boardSearch(page: Page): Locator {
  return page.getByPlaceholder("Поиск: имя, телефон, товар, ТТН, №…");
}

/**
 * Opens an order from the board: searches its short number, waits until it is the only card,
 * and clicks it. Works on the desktop kanban and on the phone list alike.
 */
export async function openOrderFromBoard(page: Page, orderId: string, customer: string): Promise<Locator> {
  await page.goto("/");
  await boardSearch(page).fill(shortId(orderId));
  const card = page.getByText(customer, { exact: true });
  await expect(card).toHaveCount(1);
  await card.click();
  const drawer = orderDrawer(page, orderId);
  await expect(drawer).toBeVisible();
  // Details loaded (the skeleton is replaced by the customer block).
  await expect(drawer.getByText(customer).first()).toBeVisible();
  return drawer;
}

/** Innermost element of `scope` that contains every given locator (a "card" without test ids). */
export function containerOf(scope: Page | Locator, ...parts: Locator[]): Locator {
  let loc = scope.locator("div");
  for (const p of parts) loc = loc.filter({ has: p });
  return loc.last();
}
