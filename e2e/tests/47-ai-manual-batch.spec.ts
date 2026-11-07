/**
 * Ручной пакет карточек по частям (макет 03-batch, D): «часть 1 из 2» → промпт части → ответ ChatGPT → «Дальше» →
 * общая лента «Принять · Позже · Править» → «Закончить». Черновик в localStorage переживает перезагрузку, выход с
 * вставленным спрашивает «Выйти, сохранив вставленное?». Записанные карточки уходят в метрики как ручной путь.
 * Входы: «Оформить вручную (N)» в списке товаров, когда ИИ выключен, и «Оформить N вручную» у пакета ИИ на паузе.
 */
import type { Page } from "@playwright/test";
import { FAKE_AI_URL } from "../env.js";
import type { Api } from "../lib/api";
import { blankDescriptions, clearBatches } from "../lib/ai-batch";
import { productTitle } from "../lib/ai-admin";
import { query, withDb } from "../lib/db";
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

test.describe.configure({ mode: "serial" });

const IDS = [PRODUCT.tee, PRODUCT.cap, PRODUCT.bag, PRODUCT.socks, PRODUCT.scarf];
const titles: string[] = [];
const before = new Map<string, { description: string | null; card_status: string | null }>();
let lastJobId = 0;

async function fake(path: string, body?: unknown): Promise<void> {
  await fetch(`${FAKE_AI_URL}/__e2e/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

async function setting(api: Api, values: Record<string, unknown>) {
  expect((await api.raw("put", "/api/admin/settings", { values })).status).toBe(200);
}

const TEXT = "E2E-ручной";
const card = (pid: string) => ({ overall: 90, description: { ru: `${TEXT}: ${pid}`, uk: `${TEXT}: ${pid} (uk)`, en: `${TEXT}: ${pid} (en)` }, sources: ["https://example.com/manual"] });
const answer = (pids: string[]) => "```json\n" + JSON.stringify(Object.fromEntries(pids.map((p) => [p, card(p)])), null, 2) + "\n```";
/** Ответные id из промпта части (ключи JSON в разделе «Товары»). */
const pidsOf = (prompt: string) => [...prompt.slice(prompt.indexOf("## Товары")).matchAll(/"(p[0-9a-f]{8,32})"\s*:\s*\{/g)].map((m) => m[1]);
const uuidOf = (pid: string) => IDS.find((id) => id.replace(/-/g, "").toLowerCase().startsWith(pid.slice(1)))!;

test.beforeAll(async () => {
  for (const id of IDS) titles.push(await productTitle(id));
  const rows = await query<{ id: string; description: string | null; card_status: string | null }>(
    `SELECT BIN_TO_UUID(id) id, description, card_status FROM products WHERE id IN (${IDS.map(() => "UUID_TO_BIN(?)").join(", ")})`,
    IDS,
  );
  for (const r of rows) before.set(r.id, { description: r.description, card_status: r.card_status });
  lastJobId = (await query<{ n: number | null }>("SELECT MAX(id) n FROM ai_jobs"))[0].n ?? 0;
});

test.beforeEach(async () => {
  await clearBatches();
  await blankDescriptions(IDS);
  await fake("reset");
});

test.afterAll(async () => {
  await clearBatches();
  await withDb(async (conn) => {
    for (const [id, v] of before) await conn.query("UPDATE products SET description = ?, card_status = ? WHERE id = UUID_TO_BIN(?)", [v.description, v.card_status, id]);
    await conn.query("DELETE FROM ai_jobs WHERE id > ? AND path = 'MANUAL'", [lastJobId]);
  });
});

async function selectProducts(page: Page) {
  await page.goto("/products");
  const enter = page.getByRole("button", { name: "Выбрать", exact: true });
  if (await enter.isVisible()) await enter.click();
  for (const title of titles) await page.getByLabel(`Выбрать ${title}`).locator("visible=true").first().check();
}

const layer = (page: Page) => page.getByTestId("manual-batch");

async function promptPids(page: Page): Promise<string[]> {
  await layer(page).getByRole("button", { name: "Показать текст" }).click();
  const pids = pidsOf(await layer(page).locator("pre").innerText());
  await layer(page).getByRole("button", { name: "Скрыть текст" }).click();
  return pids;
}

test("ИИ выключен: части, черновик после перезагрузки, лента и запись", async ({ page, api }) => {
  await setting(api, { "ai.enabled": false });
  try {
    await selectProducts(page);
    await page.getByRole("button", { name: "Оформить вручную (5)" }).click();
    await expect(layer(page).getByTestId("manual-part-title")).toHaveText("Вручную: часть 1 из 2");
    await expect(layer(page).getByTestId("manual-part-sub")).toHaveText("Товары 1–4. Вставлено 0 из 4 ответов.");
    await expect(layer(page).getByRole("button", { name: "Скопировать промпт части 1" })).toBeVisible();

    const part1 = await promptPids(page);
    expect(part1).toHaveLength(4);
    await layer(page).getByLabel("Ответ ChatGPT на часть 1").fill(answer(part1.slice(0, 2)));
    await expect(layer(page).getByTestId("manual-part-sub")).toHaveText("Товары 1–4. Вставлено 2 из 4 ответов.");

    // Выход с вставленным — по макету: спросить и сохранить черновик.
    await layer(page).getByRole("button", { name: "Закрыть — вставленное сохранится" }).click();
    const exit = dialog(page, "Выйти, сохранив вставленное?");
    await expect(exit).toContainText("Вернуться: «часть 1 из 2, вставлено 2 из 4»");
    await exit.getByRole("button", { name: "Сохранить и выйти" }).click();
    await expect(layer(page)).toHaveCount(0);

    await page.reload();
    const resume = page.getByTestId("manual-resume");
    await expect(resume).toContainText("Ручной пакет: часть 1 из 2, вставлено 2 из 4");
    await resume.getByRole("button", { name: "Продолжить" }).click();
    await expect(layer(page).getByLabel("Ответ ChatGPT на часть 1")).toHaveValue(new RegExp(part1[0]));

    await layer(page).getByRole("button", { name: "Дальше: часть 2" }).click();
    await expect(layer(page).getByTestId("manual-part-sub")).toHaveText("Товар 5. Вставлено 0 из 1 ответа.");
    const part2 = await promptPids(page);
    expect(part2).toHaveLength(1);
    // Чужой товар из части 1 в ответе части 2 — заметно сразу и не принимается.
    await layer(page).getByLabel("Ответ ChatGPT на часть 2").fill(answer([...part2, part1[3]]));
    await expect(layer(page).getByTestId("manual-part-problems")).toContainText("не из этой части");
    await expect(layer(page).getByTestId("manual-part-answered")).toHaveText("Разобрано 1 из 1");

    await layer(page).getByRole("button", { name: "К проверке (3)" }).click();
    const sub = layer(page).getByTestId("manual-review-sub");
    await expect(sub).toHaveText("Ответов 3 из 5 · принято 0 · осталось 3");
    const marks = page.waitForRequest((r) => r.url().endsWith("/api/admin/ai/manual-marks") && r.method() === "POST");
    await layer(page).getByTestId("feed-accept").click();
    expect((await marks).postDataJSON()).toMatchObject({ feature: "CARD" });
    await expect(sub).toHaveText("Ответов 3 из 5 · принято 1 · осталось 2");

    await layer(page).getByTestId("feed-later").click();
    await layer(page).getByTestId("feed-edit").click();
    await layer(page).getByRole("button", { name: /^Применить \(\d+\)/ }).click();
    await expect(sub).toHaveText("Ответов 3 из 5 · принято 2 · осталось 1");
    await layer(page).getByTestId("feed-accept").click();

    await expect(layer(page).getByTestId("manual-finished")).toContainText("Принято из этого пакета: 3. Без ответа осталось 2");
    await layer(page).getByTestId("manual-finish").click();
    await expect(layer(page)).toHaveCount(0);
    await expect(page.getByTestId("manual-resume")).toHaveCount(0);

    const written = [part1[0], part1[1], part2[0]].map(uuidOf);
    for (const id of written) {
      const d = await query<{ description: string | null }>("SELECT description FROM products WHERE id = UUID_TO_BIN(?)", [id]);
      expect(d[0].description).toContain(TEXT);
    }
    const manual = await query<{ subject_id: string }>("SELECT subject_id FROM ai_jobs WHERE id > ? AND path = 'MANUAL' AND feature = 'CARD'", [lastJobId]);
    expect(new Set(manual.map((m) => m.subject_id))).toEqual(new Set(written));
  } finally {
    await setting(api, { "ai.enabled": null });
  }
});

test("пакет ИИ на паузе: «Оформить 5 вручную (2 части)» заканчивает пакет и открывает части", async ({ page, api }) => {
  await setting(api, { "ai.feature.completion": true, "ai.feature.batch": true, "ai.dayLimitCents": null });
  await fake("mode", { mode: "error" });
  await selectProducts(page);
  await page.getByRole("button", { name: "Заполнить с ИИ (5)" }).click();
  await dialog(page, "Заполнить с ИИ пакетом").getByRole("button", { name: "Запустить" }).click();

  const bar = page.getByTestId("batch-bar");
  await expect(bar).toContainText("Три сбоя подряд", { timeout: 60_000 });
  await bar.getByRole("button", { name: "Оформить 5 вручную (2 части)" }).click();
  const sure = dialog(page, "Закончить пакет и оформить 5 вручную?");
  await sure.getByRole("button", { name: "Закончить и оформить" }).click();

  await expect(layer(page).getByTestId("manual-part-title")).toHaveText("Вручную: часть 1 из 2");
  // Ничего не вставлено — закрывается без вопроса, пустой черновик не остаётся.
  await layer(page).getByRole("button", { name: "Закрыть — вставленное сохранится" }).click();
  await expect(layer(page)).toHaveCount(0);
  await expect(page.getByText(/^Пакет остановлен:$/)).toBeVisible();
  await page.goto("/products");
  await expect(page.getByTestId("manual-resume")).toHaveCount(0);
});
