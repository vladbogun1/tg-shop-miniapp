/**
 * «Настройки»: change a threshold and save it, then «Сбросить» back to the default and save.
 * (The stock threshold is used, not the «Внимание» ones, so the inbox spec is not affected.)
 */
import { containerOf, expect, test, toast } from "../lib/test";

const LABEL = "Порог «мало на складе»";
const KEY = "catalog.lowStockQty";

test("порог: изменить и сохранить, затем сбросить к умолчанию", async ({ page, api }) => {
  await page.goto("/settings");
  const field = page.getByLabel(LABEL);
  await expect(field).toHaveValue("3");
  const saveBar = page.getByText(/^Несохранённых изменений: \d+/);

  // Invalid input blocks saving.
  await field.fill("abc");
  await expect(page.getByText("Исправьте поля с ошибками")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled();

  await field.fill("5");
  await expect(saveBar).toHaveText(/^Несохранённых изменений: 1/);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(toast(page, "Настройка сохранена")).toBeVisible();
  await expect(saveBar).toBeHidden();

  let item = (await api.settings()).items.find((i) => i.key === KEY)!;
  expect(item.value).toBe(5);
  expect(item.overridden).toBe(true);

  await page.reload();
  await expect(field).toHaveValue("5");
  const card = containerOf(page, page.getByLabel(LABEL), page.getByRole("button", { name: "Сбросить" }));
  await expect(card).toContainText("По умолчанию: 3");
  await expect(card).toContainText(/изменено/);

  await card.getByRole("button", { name: "Сбросить" }).click();
  await expect(field).toHaveValue("3");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(toast(page, "Настройка сохранена")).toBeVisible();
  await expect(saveBar).toBeHidden();

  item = (await api.settings()).items.find((i) => i.key === KEY)!;
  expect(item.overridden).toBe(false);
  expect(item.value).toBe(3);
  await page.reload();
  await expect(field).toHaveValue("3");
  await expect(containerOf(page, page.getByLabel(LABEL), page.getByText("По умолчанию: 3"))).not.toContainText("Сбросить");
});

test("поиск: украинское «пошта» находит группу «Новая Почта» и её панели", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByLabel(LABEL)).toBeVisible();
  const search = page.getByRole("textbox", { name: "Поиск по настройкам" });

  await search.fill("пошта");
  const group = page.locator("#group-novaposhta");
  await expect(group).toBeVisible();
  await expect(group.getByRole("heading", { name: "Отправитель Новой Почты" })).toBeVisible();
  await expect(page.getByLabel(LABEL)).toBeHidden();

  // A panel is found by its own words even when no setting of the group matches.
  await search.fill("вебхук");
  await expect(group.getByRole("heading", { name: "Миттєві статуси (вебхуки)" })).toBeVisible();
  await expect(group.getByRole("heading", { name: "Отправитель Новой Почты" })).toBeHidden();

  await search.fill("нет такой настройки");
  await expect(page.getByText("По запросу «нет такой настройки» настроек нет.")).toBeVisible();
});
