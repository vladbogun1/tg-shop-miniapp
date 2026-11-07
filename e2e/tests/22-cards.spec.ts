/**
 * «Карточки» (docs/CATALOG-SPECS.md §4–5): «/cards?ids=…» (ссылка из поставки) открывает ручной пакет
 * «Через ChatGPT вручную» этих товаров; ответ ChatGPT вставляется в часть, «К проверке» — лента «Принять».
 * A sure card (overall ≥ 80 %, no guessed field) goes straight to «Готово»; a less sure one goes to «Проверить»,
 * where the review panel's «Принять» makes it READY. The answer here is written by the test (two products, the
 * description they had before, emptied first so that it is «заполнит пустое» — valid whatever schema the stand has).
 */
import type { Locator, Page } from "@playwright/test";
import { blankDescriptions, clearBatches } from "../lib/ai-batch";
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

// Ручной пакет оставляет задачи «ИИ-задач» (путь MANUAL) на шарф и носки: следующие спеки засевают свои
// задачи на те же товары и ищут строку по названию — убираем пакет и его задачи.
test.afterAll(async () => {
  await clearBatches();
});

test("карточки: ответ ИИ → проверка → сохранение → «Проверено»", async ({ page, api }) => {
  // Seeded storefront products only the product specs touch: both READY in the seed.
  const [sure, doubtful] = await (async () => {
    const list = await cards(api, [PRODUCT.scarf, PRODUCT.socks]);
    return [PRODUCT.scarf, PRODUCT.socks].map((id) => list.find((i) => i.id === id)!);
  })();
  expect(sure && doubtful, "в сиде есть шарф и носки").toBeTruthy();
  expect(sure.active && doubtful.active).toBe(true);

  await blankDescriptions([sure.id, doubtful.id]);
  await page.goto("/cards");
  await expect(page.getByRole("heading", { name: "Карточки" })).toBeVisible();
  // Default storefront filter is «В работе» (on the storefront or new): both products are counted.
  await expect(tab(page, "Готово")).toBeVisible();
  await expect(page.getByTestId("cards-manual")).toHaveText(/^Через ChatGPT \(\d+\)$/);
  // Счётчики вкладок приходят отдельным запросом: до него «Готово» показывает 0, а в сиде готовы оба товара.
  await expect.poll(() => tabCount(page, "Готово")).toBeGreaterThanOrEqual(2);
  const before = { review: await tabCount(page, "Проверить"), ready: await tabCount(page, "Готово") };

  // The supply's link opens the manual batch of those products in a full-screen layer over the list.
  await page.goto(`/cards?ids=${sure.id},${doubtful.id}`);
  const layer = page.getByTestId("manual-batch");
  await expect(layer.getByTestId("manual-part-title")).toHaveText("Вручную: часть 1 из 1");
  await expect(layer.getByRole("button", { name: "Скопировать промпт части 1" })).toBeVisible();

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
  await layer.getByLabel("Ответ ChatGPT на часть 1").fill(answer);
  await expect(layer.getByTestId("manual-part-answered")).toHaveText("Разобрано 2 из 2");
  await layer.getByRole("button", { name: "К проверке (2)" }).click();

  const sub = layer.getByTestId("manual-review-sub");
  await expect(sub).toHaveText("Ответов 2 из 2 · решено 0 · осталось 2");
  await expect(layer.getByTestId("feed-fields")).toContainText("E2E-оформление");
  await layer.getByTestId("feed-accept").click();
  await expect(sub).toHaveText("Ответов 2 из 2 · решено 1 · осталось 1");
  await layer.getByTestId("feed-accept").click();
  await expect(layer.getByTestId("manual-finished")).toContainText("Решено по этому пакету: 2.");
  await layer.getByTestId("manual-finish").click();
  await expect(layer).toHaveCount(0);

  const saved = await cards(api, [sure.id, doubtful.id]);
  const s1 = saved.find((i) => i.id === sure.id)!;
  const s2 = saved.find((i) => i.id === doubtful.id)!;
  expect(s1.cardStatus).toBe("READY");
  expect(s1.description).toMatch(/^E2E-оформление/);
  expect(s2.cardStatus).toBe("AI_FILLED");
  expect(s2.description).toMatch(/^E2E-оформление/);

  // Back to the list: the doubtful card moved from «Готово» to «Проверить».
  await expect(tab(page, "Проверить")).toHaveText(new RegExp(`${before.review + 1}$`));
  await expect(tab(page, "Готово")).toHaveText(new RegExp(`${before.ready - 1}$`));

  // «Проверить» → the row → the review panel → «Принять».
  await tab(page, "Проверить").click();
  await page.getByLabel("Поиск карточек").fill(doubtful.title);
  const row = page.getByRole("listitem").filter({ hasText: doubtful.title });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("ИИ");
  await row.getByRole("button", { name: new RegExp(doubtful.title) }).click();
  // От 1280 px панель стоит рядом со списком (aside), уже — поверх него (dialog).
  const panelName = `Проверка карточки: ${doubtful.title}`;
  const panel = page.getByRole("complementary", { name: panelName }).or(page.getByRole("dialog", { name: panelName }));
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: /^Принять/ }).click();

  await expect(page.getByText(`«${doubtful.title}» — в «Готово»`)).toBeVisible();
  await expect(tab(page, "Проверить")).toHaveText(new RegExp(`${before.review}$`));
  await expect(tab(page, "Готово")).toHaveText(new RegExp(`${before.ready}$`));
  const done = await cards(api, [doubtful.id]);
  expect(done.find((i) => i.id === doubtful.id)?.cardStatus).toBe("READY");
});
