/**
 * «Карточки» (docs/CATALOG-SPECS.md §4–5): the admin copies a prompt for any AI, pastes its
 * answer, reviews what changes and imports it; the card becomes «от ИИ», then «Проверено» from
 * the queue makes it READY. The answer here is written by the test (one product, a new
 * description that keeps the old text — valid whatever schema the stand has).
 */
import { expect, test } from "../lib/test";

interface ExportItem {
  id: string;
  title: string;
  description?: string | null;
  cardStatus?: string;
}

test("карточки: ответ ИИ → проверка → сохранение → «Проверено»", async ({ page, api }) => {
  const exp = await api.raw("get", "/api/admin/cards/export?status=all");
  expect(exp.status).toBe(200);
  const raw = exp.body as unknown;
  const items = (Array.isArray(raw) ? raw : ((raw as { items?: ExportItem[] }).items ?? [])) as ExportItem[];
  const product = items.find((i) => i.cardStatus !== "READY") ?? items[0];
  expect(product, "в базе есть товары").toBeTruthy();

  await page.goto("/cards");
  await expect(page.getByRole("heading", { name: "Карточки" })).toBeVisible();
  // The default filter is the to-do list (new / unoformed products on the storefront), which is empty
  // in the seed — pick «Все» to get a prompt.
  await page.getByRole("button", { name: /^Все\s*\d*$/ }).first().click();
  await expect(page.getByRole("button", { name: /Скопировать (промпт|пакет 1)/ }).first()).toBeVisible();

  // The answer id is "p" + 8 hex of the UUID (the checker also accepts a longer prefix).
  const pid = "p" + product.id.replace(/-/g, "").slice(0, 8);
  const description = `E2E-оформление. ${product.description ?? ""}`.trim();
  const answer = "```json\n" + JSON.stringify({ [pid]: { overall: 88, description, sources: ["https://example.com/spec"], notes: "e2e" } }, null, 2) + "\n```";
  await page.getByLabel("Ответ ИИ").fill(answer);
  await page.getByRole("button", { name: "Проверить", exact: true }).click();

  await expect(page.getByText("Проверка и сохранение")).toBeVisible();
  await expect(page.getByText(product.title).first()).toBeVisible();
  await expect(page.getByText("example.com")).toBeVisible();
  await page.getByRole("button", { name: /^Сохранить 1 товар/ }).click();
  await expect(page.getByText("Итог сохранения")).toBeVisible();

  const after = await api.raw("get", `/api/admin/cards/export?status=all&ids=${product.id}`);
  const list = (Array.isArray(after.body) ? after.body : ((after.body as { items?: ExportItem[] }).items ?? [])) as ExportItem[];
  const saved = list.find((i) => i.id === product.id)!;
  expect(saved.cardStatus).toBe("AI_FILLED");
  expect(saved.description).toMatch(/^E2E-оформление/);

  // Queue → «От ИИ — проверить» → «Проверено».
  await page.getByRole("button", { name: /^Очередь/ }).click();
  await page.getByRole("button", { name: /^От ИИ — проверить/ }).click();
  await page.getByLabel("Поиск в очереди").fill(product.title);
  const row = page.locator("li").filter({ hasText: product.title }).first();
  await row.getByRole("button", { name: "Проверено" }).click();
  await expect(row.getByRole("button", { name: "Проверено" })).toBeHidden();
  const done = await api.raw("get", `/api/admin/cards/export?status=all&ids=${product.id}`);
  const doneList = (Array.isArray(done.body) ? done.body : ((done.body as { items?: ExportItem[] }).items ?? [])) as ExportItem[];
  expect(doneList.find((i) => i.id === product.id)?.cardStatus).toBe("READY");
});
