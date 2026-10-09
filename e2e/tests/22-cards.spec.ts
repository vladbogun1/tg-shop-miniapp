/**
 * «Карточки» (docs/CATALOG-SPECS.md §4–5): the admin opens «Оформить с ИИ», pastes the AI's answer,
 * checks what changes and saves it. A sure card (overall ≥ 80 %, no guessed field) goes straight to
 * «Готово»; a less sure one goes to «Проверить», where the review panel's «Принять» makes it READY.
 * The answer here is written by the test (two products, a new description that keeps the old text —
 * valid whatever schema the stand has).
 */
import type { Locator, Page } from "@playwright/test";
import { PRODUCT } from "../lib/seed";
import { expect, test } from "../lib/test";
import type { Api } from "../lib/api";

interface ExportItem {
  id: string;
  title: string;
  description?: string | null;
  cardStatus?: string;
  active?: boolean;
}

async function cards(api: Api, ids: string[]): Promise<ExportItem[]> {
  const res = await api.raw("get", `/api/admin/cards/export?status=all&ids=${ids.join(",")}`);
  expect(res.status).toBe(200);
  const raw = res.body as unknown;
  return (Array.isArray(raw) ? raw : ((raw as { items?: ExportItem[] }).items ?? [])) as ExportItem[];
}

/** The tab of the «Карточки» toolbar («Оформить · Проверить · Готово») and its counter. */
function tab(page: Page, name: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });
}
async function tabCount(page: Page, name: string): Promise<number> {
  const text = (await tab(page, name).innerText()).replace(/\s+/g, " ");
  return Number(text.match(/(\d+)\s*$/)?.[1] ?? NaN);
}

test("карточки: ответ ИИ → проверка → сохранение → «Проверено»", async ({ page, api }) => {
  // Seeded storefront products only the product specs touch: both READY in the seed.
  const [sure, doubtful] = await (async () => {
    const list = await cards(api, [PRODUCT.scarf, PRODUCT.socks]);
    return [PRODUCT.scarf, PRODUCT.socks].map((id) => list.find((i) => i.id === id)!);
  })();
  expect(sure && doubtful, "в сиде есть шарф и носки").toBeTruthy();
  expect(sure.active && doubtful.active).toBe(true);

  await page.goto("/cards");
  await expect(page.getByRole("heading", { name: "Карточки" })).toBeVisible();
  // Default storefront filter is «В работе» (on the storefront or new): both products are counted.
  await expect(tab(page, "Готово")).toBeVisible();
  const before = { review: await tabCount(page, "Проверить"), ready: await tabCount(page, "Готово") };

  // The batch wizard opens in a full-screen layer over the list.
  await page.getByRole("button", { name: /^Оформить с ИИ \(\d+\)$/ }).click();
  const wizard = page.getByRole("dialog", { name: "Оформить с ИИ" });
  await expect(wizard).toBeVisible();
  await expect(wizard.getByRole("button", { name: /Скопировать (промпт|пакет 1)/ }).first()).toBeVisible();

  // The answer id is "p" + hex of the UUID (the checker also accepts a longer prefix).
  const pid = (id: string) => "p" + id.replace(/-/g, ""); // full hex: seed ids share long prefixes
  const entry = (p: ExportItem, overall: number) => ({
    overall,
    description: `E2E-оформление. ${p.description ?? ""}`.trim(),
    sources: ["https://example.com/spec"],
    notes: "e2e",
  });
  const answer =
    "```json\n" + JSON.stringify({ [pid(sure.id)]: entry(sure, 88), [pid(doubtful.id)]: entry(doubtful, 65) }, null, 2) + "\n```";
  await wizard.getByLabel("Ответ ИИ").fill(answer);
  await wizard.getByRole("button", { name: "Проверить", exact: true }).click();

  await expect(wizard.getByText("Проверка и сохранение")).toBeVisible();
  await expect(wizard.getByText(sure.title).first()).toBeVisible();
  await expect(wizard.getByText(doubtful.title).first()).toBeVisible();
  await expect(wizard.getByRole("link", { name: /example\.com/ }).first()).toBeVisible();
  // Auto status: 88 % → «Готово», 65 % → «Проверить».
  await expect(wizard.getByText("станут «Готово»: 1")).toBeVisible();
  await expect(wizard.getByText("уйдут в «Проверить»: 1")).toBeVisible();
  await wizard.getByRole("button", { name: /^Сохранить 2 товара/ }).click();
  await expect(wizard.getByText("Итог сохранения")).toBeVisible();
  await expect(wizard.getByText("сохранено 2")).toBeVisible();

  const saved = await cards(api, [sure.id, doubtful.id]);
  const s1 = saved.find((i) => i.id === sure.id)!;
  const s2 = saved.find((i) => i.id === doubtful.id)!;
  expect(s1.cardStatus).toBe("READY");
  expect(s1.description).toMatch(/^E2E-оформление/);
  expect(s2.cardStatus).toBe("AI_FILLED");
  expect(s2.description).toMatch(/^E2E-оформление/);

  // Back to the list: the doubtful card moved from «Готово» to «Проверить».
  await wizard.getByRole("button", { name: /^Закрыть/ }).click();
  await expect(wizard).toBeHidden();
  await expect(tab(page, "Проверить")).toHaveText(new RegExp(`${before.review + 1}$`));
  await expect(tab(page, "Готово")).toHaveText(new RegExp(`${before.ready - 1}$`));

  // «Проверить» → the row → the review panel → «Принять».
  await tab(page, "Проверить").click();
  await page.getByLabel("Поиск карточек").fill(doubtful.title);
  const row = page.getByRole("listitem").filter({ hasText: doubtful.title });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("ИИ");
  await row.getByRole("button", { name: new RegExp(doubtful.title) }).click();
  const panel = page.getByRole("dialog", { name: `Проверка карточки: ${doubtful.title}` });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: /^Принять/ }).click();

  await expect(page.getByText(`«${doubtful.title}» — в «Готово»`)).toBeVisible();
  await expect(tab(page, "Проверить")).toHaveText(new RegExp(`${before.review}$`));
  await expect(tab(page, "Готово")).toHaveText(new RegExp(`${before.ready}$`));
  const done = await cards(api, [doubtful.id]);
  expect(done.find((i) => i.id === doubtful.id)?.cardStatus).toBe("READY");
});
