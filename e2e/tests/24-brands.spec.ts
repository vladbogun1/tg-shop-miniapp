/**
 * «Бренды»: create (duplicate name warned on the spot, taken slug refused by the server in Russian),
 * edit, search by alias, merge into another brand (becomes its alias), delete. Checked against
 * GET /api/admin/brands and the journal.
 */
import type { Locator, Page } from "@playwright/test";
import { SEEDED_BRAND } from "../lib/seed";
import { dialog, expect, test, toast } from "../lib/test";
import type { Api } from "../lib/api";

interface Brand {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  website: string | null;
}

async function brands(api: Api): Promise<Brand[]> {
  const res = await api.raw("get", "/api/admin/brands");
  expect(res.status).toBe(200);
  return res.body as unknown as Brand[];
}

/** Desktop table row of a brand (by its slug cell). */
function brandRow(page: Page, slug: string): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name: slug, exact: true }) });
}

test("создать, изменить, найти по алиасу, объединить, удалить", async ({ page, api }) => {
  await page.goto("/brands");
  await expect(page.getByRole("heading", { name: "Бренды", level: 1 })).toBeVisible();
  await expect(brandRow(page, SEEDED_BRAND.slug)).toContainText(SEEDED_BRAND.name);

  // --- create ---
  await page.getByRole("button", { name: "Новый бренд" }).click();
  let dlg = dialog(page, "Новый бренд");
  // The same name is caught before saving.
  await dlg.getByLabel("Название").fill(SEEDED_BRAND.name);
  await expect(dlg.getByText(`Уже есть: «${SEEDED_BRAND.name}»`)).toBeVisible();
  await dlg.getByLabel("Название").fill("E2E Лоджитек");
  await expect(dlg.getByText(/Уже есть/)).toHaveCount(0);
  // A taken slug is refused by the server with a readable message; the dialog stays open.
  await dlg.getByLabel("Slug").fill(SEEDED_BRAND.slug);
  await dlg.getByRole("button", { name: "Создать" }).click();
  await expect(toast(page, `slug «${SEEDED_BRAND.slug}» уже занят`)).toBeVisible();
  await expect(dlg).toBeVisible();

  await dlg.getByLabel("Slug").fill("e2e-lodzhitek");
  await dlg.getByLabel("Сайт производителя").fill("https://logi.example.com");
  const aliases = dlg.getByLabel("Алиасы бренда");
  await aliases.fill("Лоджи");
  await aliases.press("Enter");
  await dlg.getByRole("button", { name: "Создать" }).click();
  await expect(toast(page, "Бренд создан")).toBeVisible();
  await expect(dlg).toBeHidden();
  const row = brandRow(page, "e2e-lodzhitek");
  await expect(row).toContainText("E2E Лоджитек");
  await expect(row).toContainText("logi.example.com");
  await expect(row).toContainText("Лоджи");
  let created = (await brands(api)).find((b) => b.slug === "e2e-lodzhitek")!;
  expect(created).toMatchObject({ name: "E2E Лоджитек", aliases: ["Лоджи"], website: "https://logi.example.com" });

  // --- edit ---
  await row.getByRole("button", { name: "Изменить", exact: true }).click();
  dlg = dialog(page, "Бренд · E2E Лоджитек");
  await expect(dlg.getByText("У бренда пока нет товаров.")).toBeVisible();
  await dlg.getByLabel("Сайт производителя").fill("https://logi2.example.com");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Бренд сохранён")).toBeVisible();
  await expect(row).toContainText("logi2.example.com");
  created = (await brands(api)).find((b) => b.id === created.id)!;
  expect(created.website).toBe("https://logi2.example.com");

  // --- search by alias ---
  const search = page.getByLabel("Поиск бренда");
  await search.fill("лоджи");
  await expect(row).toBeVisible();
  await expect(brandRow(page, SEEDED_BRAND.slug)).toHaveCount(0);
  await search.fill("нет-такого-бренда");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await search.fill("");

  // --- merge into the seeded brand ---
  await row.getByRole("button", { name: "Объединить с…" }).click();
  dlg = dialog(page, "Объединить «E2E Лоджитек»");
  const merge = dlg.getByRole("button", { name: "Объединить", exact: true });
  await expect(merge).toBeDisabled();
  await dlg.getByRole("combobox").fill("E2E Logi");
  await page.getByRole("option", { name: new RegExp(SEEDED_BRAND.name) }).click();
  await expect(dlg).toContainText(`«${SEEDED_BRAND.name}»`);
  await merge.click();
  await expect(toast(page, `«E2E Лоджитек» объединён с «${SEEDED_BRAND.name}»`)).toBeVisible();
  await expect(row).toHaveCount(0);
  const all = await brands(api);
  expect(all.some((b) => b.id === created.id)).toBe(false);
  expect(all.find((b) => b.id === SEEDED_BRAND.id)!.aliases).toContain("E2E Лоджитек");
  await expect(brandRow(page, SEEDED_BRAND.slug)).toContainText("E2E Лоджитек");

  // --- delete (a brand without products) ---
  const res = await api.raw("post", "/api/admin/brands", { name: "E2E На удаление", slug: "e2e-na-udalenie", aliases: [] });
  expect(res.status).toBeLessThan(300);
  await page.reload();
  const doomed = brandRow(page, "e2e-na-udalenie");
  await doomed.getByRole("button", { name: "Удалить", exact: true }).click();
  const confirm = dialog(page, "Удалить бренд «E2E На удаление»?");
  await expect(confirm).toContainText("Бренд без товаров — удаление ничего не затронет.");
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(toast(page, "Бренд удалён")).toBeVisible();
  await expect(doomed).toHaveCount(0);
  expect((await brands(api)).some((b) => b.slug === "e2e-na-udalenie")).toBe(false);

  const actions = (await api.audit("&entityType=BRAND")).map((e) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["BRAND_CREATE", "BRAND_UPDATE", "BRAND_MERGE", "BRAND_DELETE"]));
});
