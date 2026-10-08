/**
 * SEO fields edited in the admin (V36, catalog v2):
 *  - a category's title / description / H1 / SEO text are saved from the «SEO» tab of the category
 *    dialog («Категории») and served by the public API in Russian; the Ukrainian page gets nothing
 *    until there is a translation (the site then keeps its own Ukrainian template);
 *  - a product's brand (step «Категория», brand directory with «Создать „…“») and article number
 *    (step «Сайт») are saved; a taken article number is refused with a readable message.
 */
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test, toast } from "../lib/test";

const CATEGORY_NAME = "E2E Футболки";
const CATEGORY_SLUG = "e2e-futbolki";

test("SEO категории: сохраняется из окна категории и отдаётся публичным API", async ({ page, api }) => {
  await page.goto("/categories");
  const tree = page.getByRole("list", { name: "Дерево категорий" });
  await tree.getByRole("button", { name: new RegExp(CATEGORY_NAME) }).first().click();

  const modal = dialog(page, `Категория · ${CATEGORY_NAME}`);
  await modal.getByRole("tab", { name: "SEO" }).click();
  await modal.getByLabel("SEO-заголовок (title)").fill("Футболки E2E — купить в Украине");
  await modal.getByLabel("SEO-описание (description)").fill("Футболки для e2e: хлопок, доставка Новой Почтой.");
  await modal.getByLabel("Заголовок H1 (необязательно)").fill("Футболки с принтом");
  await modal.getByLabel("SEO-текст категории").fill("Первый абзац.\n\nВторой абзац о футболках.");
  await expect(modal.getByText(/^6 слов/)).toBeVisible();
  await modal.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Категория сохранена")).toBeVisible();
  await modal.getByRole("button", { name: "Закрыть" }).first().click();
  await expect(modal).toBeHidden();
  await expect(tree.locator("li").filter({ hasText: CATEGORY_NAME }).getByText("SEO", { exact: true }).first()).toBeVisible();

  const ru = await api.raw("get", `/api/public/categories/${CATEGORY_SLUG}?lang=ru`);
  expect(ru.status).toBe(200);
  expect(ru.body).toMatchObject({
    slug: CATEGORY_SLUG,
    name: CATEGORY_NAME,
    seoTitle: "Футболки E2E — купить в Украине",
    seoDescription: "Футболки для e2e: хлопок, доставка Новой Почтой.",
    h1: "Футболки с принтом",
    introText: "Первый абзац.\n\nВторой абзац о футболках.",
  });

  // No translation yet: the Ukrainian page keeps the site's template.
  const uk = await api.raw("get", `/api/public/categories/${CATEGORY_SLUG}?lang=uk`);
  expect(uk.status).toBe(200);
  expect(uk.body).toMatchObject({ seoTitle: null, h1: null, introText: null });

  // The new fields are on the «Переводы» screen (entity type CATEGORY since V52).
  const exported = await api.raw("get", "/api/admin/translations/export?locale=uk&status=missing&entityType=CATEGORY");
  expect(exported.status).toBe(200);
  const fields = (exported.body as unknown as { field: string; productTitle: string | null }[])
    .filter((i) => i.productTitle === CATEGORY_NAME)
    .map((i) => i.field);
  expect(fields).toEqual(["seo_title", "seo_description", "h1", "intro_text"]);

  expect((await api.raw("get", "/api/public/categories/no-such-category")).status).toBe(404);
});

test("бренд и артикул товара: сохраняются, занятый артикул отклоняется", async ({ page, api }) => {
  await page.goto(`/products?edit=${PRODUCT.cap}`);
  let modal = dialog(page, "Редактировать товар");
  await modal.getByRole("button", { name: "Шаг 4: Категория" }).click();
  const brand = modal.getByRole("combobox", { name: "Бренд" });
  await brand.fill("E2E Brand");
  await page.getByRole("option", { name: "Создать „E2E Brand“" }).click();
  await modal.getByRole("button", { name: "Шаг 6: Сайт" }).click();
  await modal.getByLabel("Артикул (SKU)").fill("E2E-CAP-01");
  await modal.getByRole("button", { name: "Сохранить" }).first().click();
  await expect(toast(page, "Сохранено")).toBeVisible();
  await expect(modal).toBeHidden();

  const cap = (await api.product(PRODUCT.cap)) as unknown as { brandRef: { name: string } | null; sku: string | null };
  expect(cap.brandRef?.name).toBe("E2E Brand");
  expect(cap.sku).toBe("E2E-CAP-01");
  const pub = await api.raw("get", "/api/public/products/by-slug/e2e-kepka?lang=uk");
  expect(pub.body).toMatchObject({ brand: "E2E Brand", sku: "E2E-CAP-01" });

  await page.goto(`/products?edit=${PRODUCT.bag}`);
  modal = dialog(page, "Редактировать товар");
  await modal.getByRole("button", { name: "Шаг 6: Сайт" }).click();
  await modal.getByLabel("Артикул (SKU)").fill("E2E-CAP-01");
  await modal.getByRole("button", { name: "Сохранить" }).first().click();
  await expect(toast(page, "артикул «E2E-CAP-01» уже есть у другого товара")).toBeVisible();
  await expect(modal).toBeVisible();
  expect(((await api.product(PRODUCT.bag)) as unknown as { sku: string | null }).sku).toBeNull();
});
