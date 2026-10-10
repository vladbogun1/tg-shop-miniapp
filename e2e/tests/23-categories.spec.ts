/**
 * «Категории»: the tree — create a root and a subcategory, rename, refuse to delete a category with
 * a subcategory / with products, delete; reorder; a category's characteristics (add, edit, delete).
 * Every step is checked against GET /api/admin/categories (and the journal), not only on screen.
 */
import type { Locator, Page } from "@playwright/test";
import { dialog, expect, test, toast } from "../lib/test";
import type { Api } from "../lib/api";

interface Cat {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
}

async function categories(api: Api): Promise<Cat[]> {
  const res = await api.raw("get", "/api/admin/categories");
  expect(res.status).toBe(200);
  return res.body as unknown as Cat[];
}

function tree(page: Page): Locator {
  return page.getByRole("list", { name: "Дерево категорий" });
}

/** A category row, found by its unique site address. */
function catRow(page: Page, slug: string): Locator {
  return tree(page).locator("div.group").filter({ hasText: `/catalog/${slug}` });
}

async function rowMenu(page: Page, slug: string, item: string): Promise<void> {
  await catRow(page, slug).getByRole("button", { name: "Действия" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item }).click();
}

test("дерево: создать корень и подкатегорию, переименовать, запреты удаления, удалить", async ({ page, api }) => {
  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "Категории", level: 1 })).toBeVisible();
  await expect(catRow(page, "e2e-futbolki")).toBeVisible();
  const rootsBefore = (await categories(api)).filter((c) => !c.parentId).length;
  await expect(page.getByText(`${rootsBefore} корневых`)).toBeVisible();

  // --- new root ---
  await page.getByRole("button", { name: "Новая категория" }).first().click();
  let dlg = dialog(page, "Новая категория");
  await dlg.getByLabel("Название").fill("E2E Периферия");
  await dlg.getByLabel("Адрес на сайте (slug)").fill("e2e-periferiya");
  await dlg.getByRole("button", { name: "Создать" }).click();
  await expect(toast(page, "Категория создана")).toBeVisible();
  await expect(dlg).toBeHidden();
  await expect(catRow(page, "e2e-periferiya")).toContainText("E2E Периферия");
  await expect(page.getByText(`${rootsBefore + 1} корневых`)).toBeVisible();
  const root = (await categories(api)).find((c) => c.slug === "e2e-periferiya")!;
  expect(root).toMatchObject({ name: "E2E Периферия", parentId: null });

  // --- subcategory from the row menu ---
  await rowMenu(page, "e2e-periferiya", "Добавить подкатегорию");
  dlg = dialog(page, "Новая подкатегория");
  await dlg.getByLabel("Название").fill("E2E Мыши");
  await dlg.getByLabel("Адрес на сайте (slug)").fill("e2e-myshi");
  await dlg.getByRole("button", { name: "Создать" }).click();
  await expect(toast(page, "Категория создана")).toBeVisible();
  await expect(catRow(page, "e2e-myshi")).toContainText("E2E Мыши");
  const child = (await categories(api)).find((c) => c.slug === "e2e-myshi")!;
  expect(child.parentId).toBe(root.id);
  // The child sits inside the parent's card and the parent counts it.
  await expect(tree(page).getByRole("listitem").filter({ hasText: "/catalog/e2e-periferiya" })).toContainText("/catalog/e2e-myshi");
  await expect(catRow(page, "e2e-periferiya")).toContainText("1 подкатегория");

  // --- a parent with a subcategory cannot be deleted ---
  await rowMenu(page, "e2e-periferiya", "Удалить");
  let refuse = dialog(page, "Нельзя удалить");
  await expect(refuse).toContainText("В «E2E Периферия» 1 подкатегория");
  await refuse.getByRole("button", { name: "Понятно" }).click();
  await expect(refuse).toBeHidden();
  expect((await categories(api)).some((c) => c.id === root.id)).toBe(true);

  // --- a category with products cannot be deleted either ---
  await rowMenu(page, "e2e-aksessuary", "Удалить");
  refuse = dialog(page, "Нельзя удалить");
  await expect(refuse).toContainText("Перенесите их в другую категорию");
  await refuse.getByRole("button", { name: "Понятно" }).click();

  // --- rename (the address stays) ---
  await catRow(page, "e2e-periferiya").getByRole("button", { name: /E2E Периферия/ }).click();
  dlg = dialog(page, "Категория · E2E Периферия");
  await dlg.getByLabel("Название").fill("E2E Периферия ПК");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Категория сохранена")).toBeVisible();
  await dlg.getByRole("button", { name: "Закрыть" }).first().click();
  await expect(dlg).toBeHidden();
  await expect(catRow(page, "e2e-periferiya")).toContainText("E2E Периферия ПК");
  expect((await categories(api)).find((c) => c.id === root.id)).toMatchObject({ name: "E2E Периферия ПК", slug: "e2e-periferiya" });

  // --- delete the child, then the (now empty) parent ---
  await rowMenu(page, "e2e-myshi", "Удалить");
  let confirm = dialog(page, "Удалить «E2E Мыши»?");
  await expect(confirm).toContainText("/catalog/e2e-myshi");
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(toast(page, "Категория удалена")).toBeVisible();
  await expect(catRow(page, "e2e-myshi")).toHaveCount(0);
  expect((await categories(api)).some((c) => c.id === child.id)).toBe(false);

  await rowMenu(page, "e2e-periferiya", "Удалить");
  confirm = dialog(page, "Удалить «E2E Периферия ПК»?");
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(toast(page, "Категория удалена").first()).toBeVisible();
  await expect(catRow(page, "e2e-periferiya")).toHaveCount(0);
  await expect(page.getByText(`${rootsBefore} корневых`)).toBeVisible();
  expect((await categories(api)).some((c) => c.id === root.id)).toBe(false);

  // The journal has every step.
  const actions = (await api.audit("&entityType=CATEGORY")).map((e) => e.action);
  expect(actions.filter((a) => a === "CATEGORY_CREATE").length).toBeGreaterThanOrEqual(2);
  expect(actions).toContain("CATEGORY_UPDATE");
  expect(actions.filter((a) => a === "CATEGORY_DELETE").length).toBeGreaterThanOrEqual(2);
});

test("поиск по дереву и порядок «Выше / Ниже»", async ({ page, api }) => {
  await page.goto("/categories");
  await expect(catRow(page, "e2e-futbolki")).toBeVisible();

  // Search leaves only the match.
  await page.getByLabel("Поиск категории").fill("Аксесс");
  await expect(catRow(page, "e2e-aksessuary")).toBeVisible();
  await expect(catRow(page, "e2e-futbolki")).toHaveCount(0);
  await page.getByLabel("Поиск категории").fill("нет-такой-категории");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page.getByLabel("Поиск категории").fill("");

  const order = async () =>
    (await categories(api)).filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.slug);
  const before = await order();
  const i = before.indexOf("e2e-futbolki");
  expect(i).toBeGreaterThanOrEqual(0);
  // The first root has «Выше» disabled.
  await expect(catRow(page, before[0]).getByRole("button", { name: "Выше" })).toBeDisabled();

  const dir = i < before.length - 1 ? "Ниже" : "Выше";
  await catRow(page, "e2e-futbolki").getByRole("button", { name: dir }).click();
  await expect.poll(order).not.toEqual(before);
  const after = await order();
  expect(after.indexOf("e2e-futbolki")).toBe(dir === "Ниже" ? i + 1 : i - 1);
  // And back.
  await catRow(page, "e2e-futbolki").getByRole("button", { name: dir === "Ниже" ? "Выше" : "Ниже" }).click();
  await expect.poll(order).toEqual(before);
});

test("характеристики категории: добавить, изменить, удалить", async ({ page, api }) => {
  const cat = (await categories(api)).find((c) => c.slug === "e2e-futbolki")!;
  const attrs = async () => {
    const res = await api.raw("get", `/api/admin/spec-attributes?categoryId=${cat.id}`);
    expect(res.status).toBe(200);
    return (res.body as unknown as { key: string; labelRu: string; categoryId: string | null; unitRu: string | null }[]).filter(
      (a) => a.categoryId === cat.id
    );
  };

  await page.goto("/categories");
  await rowMenu(page, "e2e-futbolki", "Характеристики");
  const dlg = dialog(page, "Категория · E2E Футболки");
  await expect(dlg.getByRole("tab", { name: /Характеристики/ })).toHaveAttribute("aria-selected", "true");

  await dlg.getByRole("button", { name: "Характеристика", exact: true }).click();
  const attr = dialog(page, "Новая характеристика");
  const add = attr.getByRole("button", { name: "Добавить", exact: true });
  // Labels in all three languages are required.
  await attr.getByLabel("RU", { exact: true }).first().fill("Плотность");
  await expect(add).toBeDisabled();
  await attr.getByLabel("UK", { exact: true }).first().fill("Щільність");
  await attr.getByLabel("EN", { exact: true }).first().fill("Density");
  await attr.getByLabel("Ключ").fill("density_e2e");
  // Type «Число» with a unit.
  await attr.getByRole("button", { name: "Выбор одного" }).click();
  await page.getByRole("button", { name: "Число", exact: true }).click();
  // The «Единица» block appears for numbers (its inputs are named by their placeholders).
  await expect(attr.getByRole("heading", { name: "Единица" })).toBeVisible();
  await attr.getByPlaceholder("г", { exact: true }).first().fill("г/м²");
  await add.click();
  await expect(toast(page, "Характеристика добавлена")).toBeVisible();
  await expect(attr).toBeHidden();

  const row = dlg.getByRole("listitem").filter({ hasText: "density_e2e" });
  await expect(row).toContainText("Плотность");
  await expect(row).toContainText("Число");
  let saved = (await attrs()).find((a) => a.key === "density_e2e");
  expect(saved).toMatchObject({ labelRu: "Плотность", unitRu: "г/м²" });

  // Edit the label.
  await row.getByRole("button", { name: "Изменить" }).click();
  const edit = dialog(page, "Характеристика · Плотность");
  await edit.getByLabel("RU", { exact: true }).first().fill("Плотность ткани");
  await edit.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Характеристика сохранена")).toBeVisible();
  await expect(row).toContainText("Плотность ткани");
  saved = (await attrs()).find((a) => a.key === "density_e2e");
  expect(saved?.labelRu).toBe("Плотность ткани");

  // Delete.
  await row.getByRole("button", { name: "Удалить" }).click();
  const confirm = dialog(page, "Удалить «Плотность ткани»?");
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(toast(page, "Характеристика удалена")).toBeVisible();
  await expect(row).toHaveCount(0);
  expect((await attrs()).some((a) => a.key === "density_e2e")).toBe(false);
});
