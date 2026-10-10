/**
 * «Журнал»: an action done in the UI right now appears at the top of «Админка» with a readable label
 * and the admin's name, and the object filter narrows to it; «Бот и сайт» (both views) opens without
 * errors, and its filters work.
 */
import { dialog, expect, test, toast } from "../lib/test";

test("действие в админке сразу появляется в журнале; фильтр по объекту", async ({ page, api }) => {
  // The action: a promo code created through the UI.
  await page.goto("/promocodes");
  await page.getByRole("button", { name: "Новый промокод" }).first().click();
  const dlg = dialog(page, "Новый промокод");
  await dlg.locator('input[id="in-Код"]').fill("E2EJOURNAL");
  await dlg.locator('input[id="in-Скидка,-%"]').fill("7");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Сохранено")).toBeVisible();

  const entries = await api.audit("&entityType=PROMO");
  expect(entries[0]).toMatchObject({ action: "PROMO_CREATE", details: "E2EJOURNAL" });

  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Журнал", level: 1 })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Промокод создан" }).filter({ hasText: "E2EJOURNAL" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Bootstrap admin");

  // Object filter «Промокод»: only promo rows.
  await page.getByRole("button", { name: "Все объекты" }).click();
  await page.getByRole("button", { name: "Промокод", exact: true }).click();
  await expect(page.getByText(`Показано: ${entries.length}`)).toBeVisible();
  const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
  await expect(rows).toHaveCount(entries.length);
});

test("«Бот и сайт»: лента событий и рассылки открываются без ошибок", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/audit");
  await page.getByRole("button", { name: "Бот и сайт", exact: true }).click();
  await expect(page).toHaveURL(/tab=bot/);
  await expect(page.getByText("Что бот кому отправил")).toBeVisible();
  await expect(page.getByRole("button", { name: "Все источники" })).toBeVisible();

  // Result filter: «Ошибка / не доставлено».
  await page.getByRole("button", { name: "Любой", exact: true }).click();
  await page.getByRole("button", { name: "Ошибка / не доставлено" }).click();
  await expect(page.getByText("Не удалось загрузить")).toHaveCount(0);

  await page.getByRole("button", { name: "Рассылки", exact: true }).last().click();
  await expect(page.getByText("Рассылок ещё не было")).toBeVisible();
  expect(failed).toEqual([]);
});
