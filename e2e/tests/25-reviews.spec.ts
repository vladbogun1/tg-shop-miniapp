/**
 * «Отзывы»: moderation (publish / hide / delete with confirmation, public reply and its removal),
 * the per-status counters, the menu badge and the «Отзывы на модерации» group of «Внимание», the
 * product filter deep link. Plus the site counter regression: GET /api/public/reviews/latest counts
 * published reviews of hidden (sold out, not archived) products, not of archived ones, and equals
 * the admin's «Опубликованы».
 */
import type { Locator, Page } from "@playwright/test";
import { EXTRA_PRODUCT, PRODUCT, REVIEW, REVIEW_OFF_SHELF } from "../lib/seed";
import { dialog, expect, test, toast } from "../lib/test";
import type { Api } from "../lib/api";

interface AdminReview {
  id: number;
  status: string;
  text: string;
  productId: string;
  adminReply: string | null;
}
interface AdminPage {
  items: AdminReview[];
  pendingCount: number;
  publishedCount: number;
  hiddenCount: number;
}

async function adminReviews(api: Api, status = "ALL"): Promise<AdminPage> {
  const res = await api.raw("get", `/api/admin/reviews?status=${status}&page=0&size=100`);
  expect(res.status).toBe(200);
  return res.body as unknown as AdminPage;
}

function card(page: Page, text: string): Locator {
  return page.getByRole("listitem").filter({ hasText: text });
}

/** A filter chip of the segmented control: «На модерации 3». */
function chip(page: Page, label: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^${label}\\s*\\d*$`) });
}

async function expectCounters(page: Page, api: Api, pending: number): Promise<void> {
  await expect(chip(page, "На модерации")).toHaveText(new RegExp(`На модерации\\s*${pending}$`));
  const inbox = await api.inbox();
  expect(inbox.groups.find((g) => g.id === "REVIEW")?.count ?? 0).toBe(pending);
  // The menu badge is the same number (absent at zero).
  const badge = page.getByLabel(/^Отзывов на модерации: \d+$/);
  if (pending > 0) await expect(badge.first()).toHaveText(String(pending));
  else await expect(badge).toHaveCount(0);
}

test("модерация: опубликовать, скрыть, удалить; счётчики, бейдж и «Внимание» обновляются", async ({ page, api }) => {
  const before = await adminReviews(api);
  expect(before.pendingCount).toBe(3);

  await page.goto("/reviews");
  await expect(page.getByRole("heading", { name: "Отзывы", level: 1 })).toBeVisible();
  await expect(chip(page, "Опубликованы")).toHaveText(new RegExp(`${before.publishedCount}$`));
  await expectCounters(page, api, 3);
  await expect(card(page, "E2E: чудова футболка")).toContainText("E2E Футболка базовая");
  await expect(card(page, "E2E: чудова футболка").getByLabel("Оценка 5 из 5")).toBeVisible();

  // Publish.
  await card(page, "E2E: чудова футболка").getByRole("button", { name: "Опубликовать" }).click();
  await expect(toast(page, "Отзыв опубликован")).toBeVisible();
  await expect(card(page, "E2E: чудова футболка")).toHaveCount(0);
  await expectCounters(page, api, 2);
  await expect(chip(page, "Опубликованы")).toHaveText(new RegExp(`${before.publishedCount + 1}$`));

  // Hide.
  await card(page, "E2E: кепка маломірить").getByRole("button", { name: "Скрыть" }).click();
  await expect(toast(page, "Отзыв скрыт с витрины")).toBeVisible();
  await expect(card(page, "E2E: кепка маломірить")).toHaveCount(0);
  await expectCounters(page, api, 1);

  // Delete asks first; «Отмена» keeps it.
  await card(page, "E2E: рюкзак нормальний").getByRole("button", { name: "Удалить" }).click();
  let confirm = dialog(page, "Удалить отзыв?");
  await confirm.getByRole("button", { name: "Отмена" }).click();
  await expect(card(page, "E2E: рюкзак нормальний")).toBeVisible();
  await card(page, "E2E: рюкзак нормальний").getByRole("button", { name: "Удалить" }).click();
  confirm = dialog(page, "Удалить отзыв?");
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(toast(page, "Отзыв удалён")).toBeVisible();
  await expect(page.getByText("Новых отзывов на проверку нет.")).toBeVisible();
  await expectCounters(page, api, 0);

  const after = await adminReviews(api);
  const status = (id: number) => after.items.find((r) => r.id === id)?.status;
  expect(status(REVIEW.tee)).toBe("PUBLISHED");
  expect(status(REVIEW.cap)).toBe("HIDDEN");
  expect(status(REVIEW.bag)).toBeUndefined();

  // «Скрытые» lists the hidden one, with «Опубликовать» but no «Скрыть».
  await chip(page, "Скрытые").click();
  await expect(page).toHaveURL(/status=HIDDEN/);
  const hidden = card(page, "E2E: кепка маломірить");
  await expect(hidden).toBeVisible();
  await expect(hidden.getByRole("button", { name: "Скрыть" })).toHaveCount(0);
  await expect(hidden.getByRole("button", { name: "Опубликовать" })).toBeVisible();
});

test("ответ магазина: сохранить, изменить, убрать", async ({ page, api }) => {
  await page.goto("/reviews?status=PUBLISHED");
  const c = card(page, "E2E: вже опублікований відгук");
  await expect(c).toBeVisible();

  await c.getByRole("button", { name: "Ответить" }).click();
  const field = c.getByLabel("Публичный ответ магазина");
  await expect(c.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  await field.fill("Дякуємо за відгук!");
  await c.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Ответ сохранён")).toBeVisible();
  await expect(c).toContainText("Ответ магазина");
  await expect(c).toContainText("Дякуємо за відгук!");
  let r = (await adminReviews(api, "PUBLISHED")).items.find((x) => x.id === REVIEW.published)!;
  expect(r.adminReply).toBe("Дякуємо за відгук!");

  await c.getByRole("button", { name: "Изменить ответ" }).click();
  await expect(c.getByLabel("Публичный ответ магазина")).toHaveValue("Дякуємо за відгук!");
  await c.getByRole("button", { name: "Убрать ответ" }).click();
  await expect(toast(page, "Ответ убран")).toBeVisible();
  await expect(c).not.toContainText("Ответ магазина");
  await expect(c.getByRole("button", { name: "Ответить" })).toBeVisible();
  r = (await adminReviews(api, "PUBLISHED")).items.find((x) => x.id === REVIEW.published)!;
  expect(r.adminReply ?? null).toBeNull();
});

test("фильтр по товару из ссылки: только отзывы о нём, чип снимает фильтр", async ({ page }) => {
  await page.goto(`/reviews?status=ALL&productId=${PRODUCT.tee}`);
  await expect(page.getByText("Товар: E2E Футболка базовая")).toBeVisible();
  const items = page.getByRole("main").getByRole("listitem");
  await expect(items.first()).toBeVisible();
  for (const it of await items.all()) await expect(it).toContainText("E2E Футболка базовая");
  await page.getByRole("button", { name: "Показать отзывы обо всех товарах" }).click();
  await expect(page.getByText("Товар: E2E Футболка базовая")).toHaveCount(0);
  await expect(page).not.toHaveURL(/productId=/);
});

test("сайт: счётчик отзывов учитывает скрытые и архивные товары и равен «Опубликованы»", async ({
  page,
  api,
}) => {
  const pub = await api.raw("get", "/api/public/reviews/latest?size=100");
  expect(pub.status).toBe(200);
  const feed = pub.body as unknown as {
    summary: { count: number };
    items: { id: number; productSlug: string | null; productTitle: string | null }[];
  };

  const admin = await adminReviews(api, "PUBLISHED");
  const published = admin.items;
  // Seed: a published review of the hidden «E2E Старый плеер» and of the archived «E2E Архивный чайник».
  expect(published.find((r) => r.id === REVIEW_OFF_SHELF.hidden)?.productId).toBe(EXTRA_PRODUCT.oldPlayer);

  // Reviews of the hidden and the archived product count and come without a link.
  const hiddenItem = feed.items.find((i) => i.id === REVIEW_OFF_SHELF.hidden);
  expect(hiddenItem, "отзыв скрытого товара в ленте").toBeTruthy();
  expect(hiddenItem!.productSlug).toBeNull();
  expect(feed.items.find((i) => i.id === REVIEW_OFF_SHELF.archived)?.productSlug).toBeNull();
  expect(feed.summary.count).toBe(published.length);
});

test("«Опубликованы» в админке = счётчик отзывов на сайте (при отзыве у архивного товара)", async ({ page, api }) => {
  const pub = await api.raw("get", "/api/public/reviews/latest?size=100");
  const siteCount = (pub.body as unknown as { summary: { count: number } }).summary.count;
  const admin = await adminReviews(api, "PUBLISHED");
  // The seed has a published review of an archived product (REVIEW_OFF_SHELF.archived).
  expect(admin.items.some((r) => r.id === REVIEW_OFF_SHELF.archived)).toBe(true);

  await page.goto("/reviews");
  await expect(chip(page, "Опубликованы")).toHaveText(new RegExp(`Опубликованы\\s*${siteCount}$`));
  expect(admin.publishedCount).toBe(siteCount);
});
