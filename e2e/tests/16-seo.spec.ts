/**
 * SEO fields edited in the admin (V36):
 *  - a category's title / description / H1 / SEO text are saved from the tag dialog and served by
 *    the public API in Russian; the Ukrainian page gets nothing until there is a translation (the
 *    site then keeps its own Ukrainian template);
 *  - a product's brand and article number are saved from the «Сайт» step; a taken article number
 *    is refused with a readable message.
 */
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test, toast } from "../lib/test";

const TAG_NAME = "E2E Футболки";
const TAG_SLUG = "e2e-futbolki";

test("SEO категории: сохраняется из окна тега и отдаётся публичным API", async ({ page, api }) => {
  await page.goto("/tags");
  const card = page.locator(".card").filter({ hasText: TAG_NAME });
  await card.hover();
  await card.getByRole("button", { name: "Изменить" }).click();

  const modal = dialog(page, "Тег / категория");
  await modal.getByLabel("SEO-заголовок (title)").fill("Футболки E2E — купить в Украине");
  await modal.getByLabel("SEO-описание (description)").fill("Футболки для e2e: хлопок, доставка Новой Почтой.");
  await modal.getByLabel("Заголовок H1 (необязательно)").fill("Футболки с принтом");
  await modal.getByLabel("SEO-текст категории").fill("Первый абзац.\n\nВторой абзац о футболках.");
  await expect(modal.getByText(/^6 слов/)).toBeVisible();
  await modal.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Тег сохранён")).toBeVisible();
  await expect(modal).toBeHidden();
  await expect(page.locator(".card").filter({ hasText: TAG_NAME }).getByText("SEO")).toBeVisible();

  const ru = await api.raw("get", `/api/public/categories/${TAG_SLUG}?lang=ru`);
  expect(ru.status).toBe(200);
  expect(ru.body).toMatchObject({
    slug: TAG_SLUG,
    name: TAG_NAME,
    seoTitle: "Футболки E2E — купить в Украине",
    seoDescription: "Футболки для e2e: хлопок, доставка Новой Почтой.",
    h1: "Футболки с принтом",
    introText: "Первый абзац.\n\nВторой абзац о футболках.",
  });

  // No translation yet: the Ukrainian page keeps the site's template.
  const uk = await api.raw("get", `/api/public/categories/${TAG_SLUG}?lang=uk`);
  expect(uk.status).toBe(200);
  expect(uk.body).toMatchObject({ seoTitle: null, h1: null, introText: null });

  // The new fields are on the «Переводы» screen.
  const exported = await api.raw("get", "/api/admin/translations/export?locale=uk&status=missing&entityType=TAG");
  expect(exported.status).toBe(200);
  const fields = (exported.body as unknown as { field: string; productTitle: string | null }[])
    .filter((i) => i.productTitle === TAG_NAME)
    .map((i) => i.field);
  expect(fields).toEqual(["seo_title", "seo_description", "h1", "intro_text"]);

  expect((await api.raw("get", "/api/public/categories/no-such-category")).status).toBe(404);
});

test("бренд и артикул товара: сохраняются, занятый артикул отклоняется", async ({ page, api }) => {
  await page.goto(`/products?edit=${PRODUCT.cap}`);
  let modal = dialog(page, "Редактировать товар");
  await modal.getByRole("button", { name: "Шаг 5: Сайт" }).click();
  await modal.getByLabel("Бренд").fill("E2E Brand");
  await modal.getByLabel("Артикул (SKU)").fill("E2E-CAP-01");
  await modal.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Сохранено")).toBeVisible();
  await expect(modal).toBeHidden();

  const cap = (await api.product(PRODUCT.cap)) as unknown as { brand: string | null; sku: string | null };
  expect(cap.brand).toBe("E2E Brand");
  expect(cap.sku).toBe("E2E-CAP-01");
  const pub = await api.raw("get", "/api/public/products/by-slug/e2e-kepka?lang=uk");
  expect(pub.body).toMatchObject({ brand: "E2E Brand", sku: "E2E-CAP-01" });

  await page.goto(`/products?edit=${PRODUCT.bag}`);
  modal = dialog(page, "Редактировать товар");
  await modal.getByRole("button", { name: "Шаг 5: Сайт" }).click();
  await modal.getByLabel("Артикул (SKU)").fill("E2E-CAP-01");
  await modal.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "артикул «E2E-CAP-01» уже есть у другого товара")).toBeVisible();
  await expect(modal).toBeVisible();
  expect(((await api.product(PRODUCT.bag)) as unknown as { sku: string | null }).sku).toBeNull();
});
