/** «Метрики»: all five tabs open, render their panels, and no API call fails. */
import { expect, test } from "../lib/test";

const TABS = [
  ["Обзор", "overview", "Когда приходят заказы"],
  ["Товары и склад", "stock", "Топ товаров"],
  ["Покупатели", "customers", "Сколько раз покупают"],
  ["Воронка", "funnel", "Много смотрят — мало покупают"],
  ["Операции", "operations", "Скорость обработки"],
] as const;

test("все 5 вкладок открываются без ошибок", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/metrics");
  await expect(page.getByRole("heading", { name: "Метрики", level: 1 })).toBeVisible();

  for (const [label, value, panel] of TABS) {
    await page.getByRole("button", { name: label, exact: true }).click();
    if (value !== "overview") await expect(page).toHaveURL(new RegExp(`tab=${value}`));
    await expect(page.getByRole("heading", { level: 3, name: panel })).toBeVisible();
    await expect(page.getByText("Не удалось загрузить")).toHaveCount(0);
  }
  expect(failed).toEqual([]);
});
