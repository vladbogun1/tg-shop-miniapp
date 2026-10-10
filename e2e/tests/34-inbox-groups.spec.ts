/**
 * «Внимание» — the groups added after 02-inbox: «Вопросы в поддержку» and «Отзывы на модерации»
 * show the seeded rows with the server's counters, and their main action leads to the right screen
 * (the support thread opened by the deep link, the reviews filtered to «На модерации»); an order row
 * opens the order card. The rows are inserted by the spec itself (and removed after).
 */
import type { Page } from "@playwright/test";
import { query } from "../lib/db";
import { CUSTOMER, METRICS_USER, ORDER, PRODUCT, shortId } from "../lib/seed";
import { expect, orderDrawer, test } from "../lib/test";

function group(page: Page, title: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: new RegExp(`^${title}`) }) });
}

// Own rows (inserted here, removed after): 25-reviews / 28-support may already have handled the seeded ones.
const THREAD = "e2e05001-0000-4000-8000-000000000034";
const REVIEW_ID = 9034;

test("«Вопросы в поддержку» и «Отзывы на модерации»: счётчики и переходы", async ({ page, api }) => {
  await query(
    `INSERT INTO support_threads (id, user_id, tg_user_id, customer_name, status, source, last_message_at, last_sender,
       last_preview, admin_unread, awaiting_since, created_at)
     VALUES (UUID_TO_BIN(?), 900000201, 900000201, ?, 'OPEN', 'WEB', NOW(), 'CUSTOMER', 'E2E: питання з «Уваги»', 1, NOW(), NOW())`,
    [THREAD, METRICS_USER.zinoviy.name]
  );
  await query(
    `INSERT INTO support_messages (thread_id, sender_type, sender_id, sender_name, type, text, created_at)
     VALUES (UUID_TO_BIN(?), 'CUSTOMER', 900000201, ?, 'TEXT', 'E2E: питання з «Уваги»', NOW())`,
    [THREAD, METRICS_USER.zinoviy.name]
  );
  await query(
    `INSERT INTO product_reviews (id, product_id, user_id, tg_user_id, author_name, rating, text, status, created_at, updated_at)
     VALUES (?, UUID_TO_BIN(?), 900000201, 900000201, 'Зиновій', 3, 'E2E: відгук з «Уваги»', 'PENDING', NOW(), NOW())`,
    [REVIEW_ID, PRODUCT.scarf]
  );
  try {
    const inbox = await api.inbox();
    const support = inbox.groups.find((g) => g.id === "SUPPORT")!;
    const review = inbox.groups.find((g) => g.id === "REVIEW")!;
    expect(support.items.map((i) => i.entityId)).toContain(THREAD);
    expect(review.count).toBeGreaterThanOrEqual(1);
    const pendingApi = ((await api.raw("get", "/api/admin/reviews?status=PENDING&page=0&size=1")).body as { pendingCount: number })
      .pendingCount;
    expect(review.count).toBe(pendingApi);

    await page.goto("/inbox");
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${support.title}\\s*${support.count}$`) })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${review.title}\\s*${review.count}$`) })).toBeVisible();

    // Support row → the thread drawer.
    const sRow = group(page, support.title).getByRole("listitem").filter({ hasText: METRICS_USER.zinoviy.name });
    await sRow.getByRole("button", { name: "Ответить" }).click();
    await expect(page).toHaveURL(/\/support/);
    await expect(page.getByRole("dialog").filter({ hasText: "E2E: питання з «Уваги»" }).last()).toBeVisible();

    // Review row → «Отзывы», «На модерации».
    await page.goto("/inbox");
    await group(page, review.title).getByRole("listitem").first().getByRole("button", { name: "К отзывам" }).click();
    await expect(page).toHaveURL(/\/reviews/);
    await expect(page.getByRole("button", { name: new RegExp(`^На модерации\\s*${pendingApi}$`) })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "E2E: відгук з «Уваги»" })).toBeVisible();
  } finally {
    await query("DELETE FROM product_reviews WHERE id = ?", [REVIEW_ID]);
    await query("DELETE FROM support_threads WHERE id = UUID_TO_BIN(?)", [THREAD]);
  }
});

test("строка заказа открывает карточку заказа поверх «Внимания»", async ({ page }) => {
  await page.goto("/inbox");
  const row = group(page, "Новые без одобрения").getByRole("listitem").filter({ hasText: shortId(ORDER.stale) });
  await row.getByRole("button", { name: /Открыть|Одобрить|Посмотреть/ }).first().click();
  const drawer = orderDrawer(page, ORDER.stale);
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(CUSTOMER.stale);
});
