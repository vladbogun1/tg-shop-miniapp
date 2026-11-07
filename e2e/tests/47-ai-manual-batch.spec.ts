/**
 * Ручной пакет карточек по частям «Через ChatGPT вручную» (макет 03-batch, D) — задача на сервере, как пакет ИИ:
 * строка `ai_batches` (путь MANUAL) с товарами и черновиком экрана, вставленные ответы — задачи `ai_jobs` «готово,
 * ждёт проверки» без модели и денег. Поэтому пакет продолжается после перезагрузки с очищенным localStorage и в
 * другом браузере, в проверке есть «Принять безопасное» с отменой на 24 часа, а «Править» ведёт на обычный экран
 * проверки задачи (там категорию и бренд из ответа меняют выбором из существующих). Работает при выключенном ИИ.
 * Входы: «Через ChatGPT вручную (N)» в панели выбора и «Оформить N вручную» у пакета ИИ на паузе.
 */
import type { Browser, Page } from "@playwright/test";
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
type Saved = { description: string | null; card_status: string | null; category_id: string | null; brand_id: string | null };
const before = new Map<string, Saved>();
let lastJobId = 0;

async function fake(path: string, body?: unknown): Promise<void> {
  await fetch(`${FAKE_AI_URL}/__e2e/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

async function setting(api: Api, values: Record<string, unknown>) {
  expect((await api.raw("put", "/api/admin/settings", { values })).status).toBe(200);
}

const TEXT = "E2E-ручной";
const card = (pid: string) => ({ overall: 90, description: { ru: `${TEXT}: ${pid}`, uk: `${TEXT}: ${pid} (uk)`, en: `${TEXT}: ${pid} (en)` }, sources: ["https://example.com/manual"] });
const fenced = (o: object) => "```json\n" + JSON.stringify(o, null, 2) + "\n```";
const answer = (pids: string[]) => fenced(Object.fromEntries(pids.map((p) => [p, card(p)])));
/** Ответные id из промпта части (ключи JSON в разделе «Товары»). */
const pidsOf = (prompt: string) => [...prompt.slice(prompt.indexOf("## Товары")).matchAll(/"(p[0-9a-f]{8,32})"\s*:\s*\{/g)].map((m) => m[1]);
const uuidOf = (pid: string) => IDS.find((id) => id.replace(/-/g, "").toLowerCase().startsWith(pid.slice(1)))!;

const descriptionOf = async (id: string) =>
  (await query<{ description: string | null }>("SELECT description FROM products WHERE id = UUID_TO_BIN(?)", [id]))[0].description;

test.beforeAll(async () => {
  for (const id of IDS) titles.push(await productTitle(id));
  const rows = await query<Saved & { id: string }>(
    `SELECT BIN_TO_UUID(id) id, description, card_status, BIN_TO_UUID(category_id) category_id, BIN_TO_UUID(brand_id) brand_id FROM products WHERE id IN (${IDS.map(() => "UUID_TO_BIN(?)").join(", ")})`,
    IDS,
  );
  for (const r of rows) before.set(r.id, r);
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
    for (const [id, v] of before) await conn.query(
        "UPDATE products SET description = ?, card_status = ?, category_id = UUID_TO_BIN(?), brand_id = UUID_TO_BIN(?) WHERE id = UUID_TO_BIN(?)",
        [v.description, v.card_status, v.category_id, v.brand_id, id],
      );
    await conn.query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE id > ? AND path = 'MANUAL')", [lastJobId]);
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

/** Ручной пакет на сервере: строка и её задачи. */
async function serverBatch() {
  const b = await query<{ id: number; status: string; path: string; draft: string | null }>("SELECT id, status, path, draft FROM ai_batches WHERE path = 'MANUAL' ORDER BY id DESC LIMIT 1");
  const jobs = b[0]
    ? await query<{ subject_id: string; status: string; path: string; pasted: number; outcome: string | null; cost: number | null; answer: string }>(
        "SELECT j.subject_id, j.status, j.path, j.pasted, j.outcome, j.cost_micro_usd cost, b.answer FROM ai_jobs j JOIN ai_job_bodies b ON b.job_id = j.id WHERE j.batch_id = ? ORDER BY j.id",
        [b[0].id],
      )
    : [];
  return { batch: b[0], jobs };
}

/** «Другое устройство»: свой браузерный контекст того же админа — без localStorage первой вкладки. */
async function otherDevice(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: "./.auth/admin.json" });
  const page = await ctx.newPage();
  await page.goto("/products");
  return page;
}

test("ИИ выключен: пакет на сервере, продолжение после очистки localStorage и на другом устройстве, «Принять безопасное» и отмена", async ({ page, api, browser }) => {
  await setting(api, { "ai.enabled": false });
  try {
    await selectProducts(page);
    await page.getByRole("button", { name: "Через ChatGPT вручную (5)" }).click();
    await expect(layer(page).getByTestId("manual-part-title")).toHaveText("Вручную: часть 1 из 2");
    await expect(layer(page).getByTestId("manual-part-sub")).toHaveText("Товары 1–4. Вставлено 0 из 4 ответов.");
    expect((await serverBatch()).batch).toMatchObject({ status: "RUNNING", path: "MANUAL" });

    // Размер части меняется, пока ничего не вставлено.
    await layer(page).getByTestId("manual-size-8").click();
    await expect(layer(page).getByTestId("manual-part-title")).toHaveText("Вручную: часть 1 из 1");
    await layer(page).getByTestId("manual-size-4").click();
    await expect(layer(page).getByTestId("manual-part-title")).toHaveText("Вручную: часть 1 из 2");

    const part1 = await promptPids(page);
    expect(part1).toHaveLength(4);
    await layer(page).getByLabel("Ответ ChatGPT на часть 1").fill(answer(part1.slice(0, 2)));
    await expect(layer(page).getByTestId("manual-part-sub")).toHaveText("Товары 1–4. Вставлено 2 из 4 ответов.");
    await expect(layer(page).getByTestId("manual-size-8")).toHaveCount(0);
    await layer(page).getByTestId("manual-model").fill("GPT-5 Thinking");

    // Выход с вставленным — по макету: спросить; ответы части уходят задачами, черновик — на сервер.
    await layer(page).getByRole("button", { name: "Закрыть — вставленное сохранится" }).click();
    const exit = dialog(page, "Выйти, сохранив вставленное?");
    await expect(exit).toContainText("продолжить можно и с другого устройства: «часть 1 из 2, вставлено 2 из 4»");
    await exit.getByRole("button", { name: "Сохранить и выйти" }).click();
    await expect(layer(page)).toHaveCount(0);

    const saved = await serverBatch();
    expect(saved.jobs.map((j) => j.subject_id).sort()).toEqual(part1.slice(0, 2).map(uuidOf).sort());
    for (const j of saved.jobs) {
      expect(j).toMatchObject({ status: "DONE", path: "MANUAL", pasted: 1, outcome: null });
      expect(j.cost ?? 0).toBe(0);
      expect(j.answer).toContain("GPT-5 Thinking");
    }
    expect(saved.batch.draft).toContain("GPT-5 Thinking");

    // Перезагрузка с очищенным localStorage (кроме входа): полоса «Продолжить» — по серверу.
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== "tgshop_admin_jwt").forEach((k) => localStorage.removeItem(k)));
    await page.reload();
    await expect(page.getByTestId("manual-resume")).toContainText("Ручной пакет (5 товаров): часть 1 из 2, вставлено 2 из 4");

    // Другое устройство: тот же пакет, тот же вставленный текст.
    const other = await otherDevice(browser);
    try {
      const resume = other.getByTestId("manual-resume");
      await expect(resume).toContainText("часть 1 из 2, вставлено 2 из 4");
      await resume.getByRole("button", { name: "Продолжить" }).click();
      await expect(layer(other).getByLabel("Ответ ChatGPT на часть 1")).toHaveValue(new RegExp(part1[0]));
      await expect(layer(other).getByTestId("manual-model")).toHaveValue("GPT-5 Thinking");

      await layer(other).getByRole("button", { name: "Дальше: часть 2" }).click();
      await expect(layer(other).getByTestId("manual-part-sub")).toHaveText("Товар 5. Вставлено 0 из 1 ответа.");
      const part2 = await promptPids(other);
      expect(part2).toHaveLength(1);
      // Чужой товар из части 1 в ответе части 2 — заметно сразу и не принимается.
      await layer(other).getByLabel("Ответ ChatGPT на часть 2").fill(answer([...part2, part1[3]]));
      await expect(layer(other).getByTestId("manual-part-problems")).toContainText("не из этой части");
      await expect(layer(other).getByTestId("manual-part-answered")).toHaveText("Разобрано 1 из 1");
      await layer(other).getByRole("button", { name: "К проверке (3)" }).click();
      const sub = layer(other).getByTestId("manual-review-sub");
      await expect(sub).toHaveText("Ответов 3 из 5 · решено 0 · осталось 3");

      // «Принять» одну — запись и исход задачи.
      await layer(other).getByTestId("feed-accept").click();
      await expect(sub).toHaveText("Ответов 3 из 5 · решено 1 · осталось 2");
      // «Отменить» в полосе ленты: запись откатилась, карточка снова в ленте; принимаем её ещё раз.
      const firstId = (await serverBatch()).jobs.find((j) => j.outcome)!.subject_id;
      expect(await descriptionOf(firstId)).toContain(TEXT);
      await expect(layer(other).getByTestId("feed-undo-strip")).toContainText("Принято:");
      await layer(other).getByTestId("feed-undo").click();
      await expect(sub).toHaveText("Ответов 3 из 5 · решено 0 · осталось 3");
      await expect(layer(other).getByTestId("feed-undo-strip")).toHaveCount(0);
      expect(await descriptionOf(firstId)).toBeNull();
      expect((await serverBatch()).jobs.every((j) => j.outcome === null)).toBe(true);
      await layer(other).getByTestId("feed-accept").click();
      await expect(sub).toHaveText("Ответов 3 из 5 · решено 1 · осталось 2");

      // «Принять безопасное» для остальных — и «Отменить применение».
      await layer(other).getByTestId("batch-accept-safe").click();
      const safe = other.getByRole("dialog", { name: "Принять безопасное" });
      await expect(safe).toContainText("2 полей в 2 карточках");
      await expect(safe).toContainText("из вставленных ответов ChatGPT");
      await safe.getByTestId("safe-go").click();
      await expect(safe.getByTestId("safe-result")).toHaveText("Записано полей: 2, карточек: 2");
      const written = (await serverBatch()).jobs.filter((j) => j.outcome).map((j) => j.subject_id);
      expect(written).toHaveLength(3);
      for (const id of written) expect(await descriptionOf(id)).toContain(TEXT);

      await safe.getByTestId("safe-undo").click();
      await expect(safe).toHaveCount(0);
      const back = (await query<{ subject_id: string }>(
        "SELECT j.subject_id FROM ai_jobs j JOIN ai_apply_log l ON l.job_id = j.id WHERE j.batch_id = ? AND l.kind = 'SAFE' AND l.undone_at IS NOT NULL",
        [(await serverBatch()).batch.id],
      )).map((r) => r.subject_id);
      expect(back).toHaveLength(2);
      for (const id of back) expect(await descriptionOf(id)).toBeNull();

      // Отменённые снова ждут проверки — в ленте; принимаем их по одной, и в конце — итог пакета со ссылками.
      await expect(sub).toHaveText("Ответов 3 из 5 · решено 1 · осталось 2");
      await layer(other).getByTestId("feed-accept").click();
      await expect(sub).toHaveText("Ответов 3 из 5 · решено 2 · осталось 1");
      await layer(other).getByTestId("feed-accept").click();
      await expect(layer(other).getByTestId("manual-finished")).toContainText("Решено по этому пакету: 3. Без ответа осталось 2");
      const report = layer(other).getByTestId("batch-report");
      await expect(report.getByTestId("batch-report-counts")).toHaveText("Записано 3 · отклонено 0 · ждут проверки 0 · не получилось 0 · без ответа 2");
      await expect(report.getByTestId("report-written").getByRole("link")).toHaveCount(3);
      await expect(report.getByTestId("report-written").getByRole("link").first()).toHaveAttribute("href", /\/cards\/ai-review\/\d+$/);
      await expect(report.getByTestId("report-unanswered").getByRole("listitem")).toHaveCount(2);
      // Ссылка итога закрывает слой и ведёт на проверку задачи; к пакету — «Продолжить».
      await report.getByTestId("report-written").getByRole("link").first().click();
      await expect(other).toHaveURL(/\/cards\/ai-review\/\d+$/);
      await expect(layer(other)).toHaveCount(0);
      await other.goto("/products");
      await other.getByTestId("manual-resume").getByRole("button", { name: "Продолжить" }).click();
      await expect(layer(other).getByTestId("manual-finished")).toBeVisible();
      await layer(other).getByTestId("manual-finish").click();
      await expect(layer(other)).toHaveCount(0);
      await expect(other.getByTestId("manual-resume")).toHaveCount(0);
      expect((await serverBatch()).batch.status).toBe("DONE");
    } finally {
      await other.context().close();
    }
  } finally {
    await setting(api, { "ai.enabled": null });
  }
});

/** Категория и бренд карточки — по слагу и имени. */
async function placeOf(id: string) {
  return (
    await query<{ slug: string | null; brand: string | null }>(
      "SELECT c.slug, b.name brand FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id WHERE p.id = UUID_TO_BIN(?)",
      [id],
    )
  )[0];
}

test("«Править» из ленты: экран проверки задачи, категория и бренд выбором из существующих, без «Повторить тщательнее»", async ({ page, api }) => {
  await setting(api, { "ai.enabled": false });
  try {
    await selectProducts(page);
    await page.getByRole("button", { name: "Через ChatGPT вручную (5)" }).click();
    const part1 = await promptPids(page);
    const id = uuidOf(part1[0]);
    // Ответ предлагает несуществующие категорию и бренд — их заменяют выбором из каталога.
    const entry = { ...card(part1[0]), category: "net-takoy-kategorii", brand: "Неведомый бренд" };
    await layer(page).getByLabel("Ответ ChatGPT на часть 1").fill(fenced({ [part1[0]]: entry }));
    await layer(page).getByRole("button", { name: "Дальше: часть 2" }).click();
    await layer(page).getByRole("button", { name: "К проверке (1)" }).click();
    await layer(page).getByTestId("feed-edit").click();

    await expect(page).toHaveURL(/\/cards\/ai-review\/\d+$/);
    await expect(layer(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Ещё действия" }).click();
    await expect(page.getByRole("menuitem", { name: "Повторить тщательнее" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Показать ответ" }).click();
    await expect(dialog(page, "Ответ ChatGPT")).toContainText(TEXT);
    await page.keyboard.press("Escape");

    await expect(page.getByText("нет категории «net-takoy-kategorii» — не применится")).toBeVisible();
    // Бренда из ответа нет в каталоге: строка говорит, что «Применить» его заведёт (если не выбрать существующий).
    await expect(page.getByText("Бренд «Неведомый бренд» будет создан")).toBeVisible();
    const target = (await placeOf(id)).slug === "e2e-futbolki" ? { slug: "e2e-aksessuary", label: "E2E Аксессуары" } : { slug: "e2e-futbolki", label: "E2E Футболки" };
    const edit = page.getByTestId("ai-review-edit");
    await page.getByRole("button", { name: "Изменить: Категория" }).click();
    await edit.getByLabel("Новое значение: Категория").selectOption({ label: target.label });
    await edit.getByRole("button", { name: "Сохранить" }).click();
    await expect(edit).toHaveCount(0);
    // Категория у товара уже есть — строка в группе «Заменит значение» (свёрнута по умолчанию), но отмечена после правки.
    const categoryBox = page.getByLabel("Применить: Категория");
    if (!(await categoryBox.isVisible())) await page.getByRole("button", { name: /Заменит значение/ }).click();
    await expect(categoryBox).toBeChecked();
    await page.getByRole("button", { name: "Изменить: Бренд" }).click();
    await edit.getByLabel("Новое значение: Бренд").selectOption({ label: "E2E Logitech" });
    await edit.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByLabel("Применить: Бренд")).toBeChecked();

    await page.getByRole("button", { name: /^Применить \(\d+\)/ }).click();
    await expect(page.getByText("Результат применён")).toBeVisible();
    expect(await descriptionOf(id)).toContain(TEXT);
    expect(await placeOf(id)).toEqual({ slug: target.slug, brand: "E2E Logitech" });

    // Назад к пакету: «Продолжить» — проверка пуста, «Закончить».
    await page.goto("/products");
    await expect(page.getByTestId("manual-resume")).toContainText("проверка, осталось 0");
    await page.getByTestId("manual-resume").getByRole("button", { name: "Продолжить" }).click();
    await expect(layer(page).getByTestId("manual-finished")).toContainText("Решено по этому пакету: 1.");
    await layer(page).getByTestId("manual-finish").click();
    await expect(page.getByTestId("manual-resume")).toHaveCount(0);
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
  // Ничего не вставлено — закрывается без вопроса, пустой пакет на сервере удаляется.
  await layer(page).getByRole("button", { name: "Закрыть — вставленное сохранится" }).click();
  await expect(layer(page)).toHaveCount(0);
  await expect(page.getByText(/^Пакет остановлен:$/)).toBeVisible();
  expect((await serverBatch()).batch.status).toBe("CANCELED");
  await page.goto("/products");
  await expect(page.getByTestId("manual-resume")).toHaveCount(0);
});

/**
 * Подмена «Фото по ссылке»: сервер не качает адреса тестов; отвечаем успехом и запоминаем присланное — ссылку и
 * запись журнала применений (`applyId`), шагом которой экран назвал фото.
 */
async function fakePhotoImport(page: Page): Promise<{ url: string; applyId?: number }[]> {
  const sent: { url: string; applyId?: number }[] = [];
  await page.route("**/api/admin/products/*/photos/import", async (route) => {
    const body = route.request().postDataJSON() as { url: string; applyId?: number };
    sent.push(body);
    await route.fulfill({ json: { key: "e2e/photo-by-link.webp", source: body.url, cutOut: true, imageKeys: ["e2e/photo-by-link.webp"] } });
  });
  return sent;
}

/** Что «Отменить» должно вернуть кроме полей: статус, витрина, uk/en-переводы карточки. */
const extrasOf = async (id: string) => ({
  card: (await query("SELECT card_status, active, unfinished, card_confidence FROM products WHERE id = UUID_TO_BIN(?)", [id]))[0],
  tr: await query(
    "SELECT field, locale, text, origin FROM content_translations WHERE entity_type = 'PRODUCT' AND entity_id = UUID_TO_BIN(?) ORDER BY field, locale",
    [id],
  ),
});

const specsOf = async (id: string) =>
  (await query<{ specs: Record<string, unknown> | null }>("SELECT specs FROM products WHERE id = UUID_TO_BIN(?)", [id]))[0].specs;

test("лента: новый бренд — на ручную, «Принять» грузит фото, «Заменить целиком» удаляет лишнее, «Отменить» возвращает", async ({ page, api }) => {
  await setting(api, { "ai.enabled": false });
  const NEW_BRAND = "E2E Бренд-новичок";
  const photo = "https://example.com/e2e-feed-photo.jpg";
  let held = "";
  // Характеристика из схемы: обычная запись её сохраняет, удаляет только «Заменить характеристики целиком».
  const attr = await api.raw("post", "/api/admin/spec-attributes", { categoryId: null, key: "e2e_old", labelRu: "E2E Старое", labelUk: "E2E Старе", labelEn: "E2E Old", type: "TEXT", group: "main" });
  expect(attr.status).toBe(200);
  try {
    await selectProducts(page);
    await page.getByRole("button", { name: "Через ChatGPT вручную (5)" }).click();
    const part1 = await promptPids(page);
    const [plain, branded] = [part1[0], part1[1]];
    held = uuidOf(branded);
    // У «новичка» есть характеристика, которой нет в ответе: её удалит только «Заменить характеристики целиком».
    await query("UPDATE products SET specs = JSON_OBJECT('e2e_old', 'было') WHERE id = UUID_TO_BIN(?)", [held]);
    const brandBefore = (await placeOf(held)).brand;
    const answerText = fenced({ [plain]: card(plain), [branded]: { ...card(branded), brand: NEW_BRAND, photos: [photo] } });
    await layer(page).getByLabel("Ответ ChatGPT на часть 1").fill(answerText);
    await layer(page).getByRole("button", { name: "Дальше: часть 2" }).click();
    await layer(page).getByRole("button", { name: "К проверке (2)" }).click();
    const sub = layer(page).getByTestId("manual-review-sub");
    await expect(sub).toHaveText("Ответов 2 из 5 · решено 0 · осталось 2");

    // «Принять безопасное» не заводит бренд: карточка с новым брендом остаётся человеку.
    await layer(page).getByTestId("batch-accept-safe").click();
    const safe = page.getByRole("dialog", { name: "Принять безопасное" });
    await expect(safe).toContainText("1 полей в 1 карточках");
    await expect(safe.getByTestId("safe-held")).toContainText("Оставлено на ручную проверку: 1");
    await safe.getByTestId("safe-go").click();
    await expect(safe.getByTestId("safe-result")).toHaveText("Записано полей: 1, карточек: 1");
    await safe.getByRole("button", { name: "Закрыть", exact: true }).last().click();
    await expect(sub).toHaveText("Ответов 2 из 5 · решено 1 · осталось 1");
    expect(await descriptionOf(uuidOf(plain))).toContain(TEXT);
    expect(await descriptionOf(held)).toBeNull();

    // В ленте — что будет: бренда нет в каталоге, фото загрузятся, а с «Заменить целиком» — что удалится.
    const feed = layer(page).getByTestId("feed-card");
    await expect(feed.getByTestId("feed-new-brand")).toContainText(`Бренда «${NEW_BRAND}» нет в каталоге`);
    await expect(feed.getByTestId("feed-photos")).toHaveText("Фото из ответа: 1 — загрузятся после «Принять»");
    const toggle = feed.getByTestId("feed-replace-toggle");
    await expect(toggle).not.toBeChecked();
    await expect(feed.getByTestId("feed-removed")).toHaveCount(0);
    await toggle.check();
    await expect(feed.getByTestId("feed-removed")).toHaveText("Удалит характеристики: E2E Старое");

    const sent = await fakePhotoImport(page);
    const extrasBefore = await extrasOf(held);
    await feed.getByTestId("feed-accept").click();
    await expect(layer(page).getByTestId("manual-finished")).toBeVisible();
    await expect.poll(() => sent.map((s) => s.url)).toEqual([photo]);
    // Фото — шаг того же применения: сервер допишет его в журнал, «Отменить» его уберёт.
    const log = await query<{ id: number }>("SELECT l.id FROM ai_apply_log l JOIN ai_jobs j ON j.id = l.job_id WHERE j.subject_id = ? AND l.undone_at IS NULL ORDER BY l.id DESC LIMIT 1", [held]);
    expect(sent[0].applyId).toBe(log[0].id);
    const extrasAfter = await extrasOf(held);
    expect(extrasAfter.tr.map((r) => `${(r as { locale: string }).locale}:${(r as { field: string }).field}`)).toEqual(
      expect.arrayContaining(["uk:description", "en:description"]),
    );
    await expect(layer(page).getByText("добавлено 1")).toBeVisible();
    expect(await descriptionOf(held)).toContain(TEXT);
    expect((await specsOf(held))?.e2e_old).toBeUndefined();
    expect((await placeOf(held)).brand).toBe(brandBefore);
    expect(await query("SELECT id FROM brands WHERE name = ?", [NEW_BRAND])).toHaveLength(0);
    const report = layer(page).getByTestId("batch-report");
    await expect(report.getByTestId("batch-report-counts")).toHaveText("Записано 2 · отклонено 0 · ждут проверки 0 · не получилось 0 · без ответа 3");
    await expect(report.getByTestId("report-brands")).toHaveCount(0);

    // «Отменить»: описание и удалённая заменой характеристика вернулись, карточка снова в ленте.
    await layer(page).getByTestId("feed-undo").click();
    await expect(sub).toHaveText("Ответов 2 из 5 · решено 1 · осталось 1");
    expect(await descriptionOf(held)).toBeNull();
    expect(await specsOf(held)).toEqual({ e2e_old: "было" });
    // И переводы, статус, витрина — как до «Принять».
    expect(await extrasOf(held)).toEqual(extrasBefore);
    await expect(feed.getByTestId("feed-new-brand")).toBeVisible();
  } finally {
    if (held) await query("UPDATE products SET specs = NULL WHERE id = UUID_TO_BIN(?)", [held]);
    await api.raw("delete", `/api/admin/spec-attributes/${(attr.body as { id: string }).id}?force=1`);
    await setting(api, { "ai.enabled": null });
  }
});
