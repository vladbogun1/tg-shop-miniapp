/**
 * Встроенный ИИ, карточка товара (этап Э2): «Заполнить с ИИ» → ход → страница проверки → «Применить» → запись.
 * Модель здесь — lib/fake-ai.mjs (бэкенд ходит на неё через AI_MINIMAX_BASE_URL), настоящий ИИ не вызывается.
 *
 * Сценарии: нормальный ответ до записи; ИИ выключен — только ручная кнопка; двойной запуск — «Уже идёт»;
 * ответ без данных — «Показать ответ» и ручной путь; ход по шагам с поиском, правка карточки человеком во время
 * работы (имя и время в ревью), фото из ответа; ручной путь через ChatGPT в том же экране проверки (правка значения,
 * фото, метка MANUAL). Запись проверяется по выгрузке карточки и базе, а не только по экрану.
 *
 * Фото по ссылке сервер скачивает сам, а адреса localhost/частных сетей он не качает (защита от SSRF) — поэтому здесь
 * подменён только ответ POST …/photos/import: проверяется, что экран отправил именно отмеченные ссылки.
 */
import type { Locator, Page } from "@playwright/test";
import { FAKE_AI_URL } from "../env.js";
import type { Api } from "../lib/api";
import { query } from "../lib/db";
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

interface ExportItem {
  id: string;
  title: string;
  description?: string | null;
  cardMeta?: { sources?: string[]; overall?: number; importedAt?: string } | null;
}

const KEY = "ai.feature.completion";

async function card(api: Api): Promise<ExportItem> {
  const res = await api.raw("get", `/api/admin/cards/export?status=all&ids=${PRODUCT.scarf}`);
  expect(res.status).toBe(200);
  const raw = res.body as unknown;
  const list = (Array.isArray(raw) ? raw : ((raw as { items?: ExportItem[] }).items ?? [])) as ExportItem[];
  return list.find((i) => i.id === PRODUCT.scarf)!;
}

async function fake(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${FAKE_AI_URL}/__e2e/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}

/** Функция «Дозаполнение карточек» включена/выключена владельцем (null — как по умолчанию). */
async function feature(api: Api, on: boolean | null) {
  const res = await api.raw("put", "/api/admin/settings", { values: { [KEY]: on } });
  expect(res.status).toBe(200);
}

/** Строка карточки в «Карточки» → панель → «Переоформить с ИИ» → окно с входом во встроенный ИИ. */
async function openEntry(page: Page, title: string): Promise<Locator> {
  await page.goto("/cards");
  await page.getByRole("button", { name: /^Готово\s*\d+$/ }).click();
  await page.getByLabel("Поиск карточек").fill(title);
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Переоформить с ИИ" }).click();
  const modal = dialog(page, `: ${title}`);
  await expect(modal).toBeVisible();
  return modal;
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await fake("reset", {});
});

test.afterAll(async ({ api }) => {
  await feature(api, null);
  await fake("reset", {});
});

test("ИИ выключен: вместо кнопки причина, остаётся только ручной путь", async ({ page, api }) => {
  await feature(api, null);
  const title = (await card(api)).title;
  const modal = await openEntry(page, title);
  await expect(modal.getByText("Эта функция ИИ выключена")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Через ChatGPT вручную" })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Заполнить с ИИ", exact: true })).toHaveCount(0);
  expect((await fake("requests")) as unknown[]).toHaveLength(0);
});

test("запуск → ход → проверка → «Применить»: описание и журнал записаны", async ({ page, api }) => {
  await feature(api, true);
  const before = await card(api);
  const text = `E2E-ИИ ${Date.now()}. ${before.description ?? ""}`.trim();
  await fake("mode", { mode: "normal", description: text });

  const modal = await openEntry(page, before.title);
  await modal.getByRole("button", { name: "Заполнить с ИИ", exact: true }).click();
  // Карточка уже готова — перед запуском просят подтвердить, что ничего не изменится без «Применить».
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.getByText("Готово — проверьте, что предложил ИИ")).toBeVisible();
  await page.getByRole("button", { name: "Открыть проверку" }).click();

  await expect(page).toHaveURL(/\/cards\/ai-review\/\d+$/);
  await expect(page.getByText(/^Выбрано \d+ из \d+$/)).toBeVisible();
  // Описание уже было — оно в группе «Заменит значение»: по умолчанию не отмечено, группа свёрнута.
  const box = page.getByLabel("Применить: Описание");
  if (!(await box.isVisible())) await page.getByRole("button", { name: /Заменит значение/ }).click();
  await box.check();
  await expect(page.getByText("Выбрано 1 из")).toBeVisible();
  await page.getByRole("button", { name: "Применить (1)" }).click();
  await expect(page.getByText("Результат применён")).toBeVisible();

  const after = await card(api);
  expect(after.description).toBe(text);
  expect(after.cardMeta?.sources).toContain("https://example.com/spec");
  expect(after.cardMeta?.importedAt).toBeTruthy();
  expect(((await fake("requests")) as unknown[]).length).toBe(1);
});

test("ответ без данных: «Показать ответ» и ручной путь", async ({ page, api }) => {
  await feature(api, true);
  await fake("mode", { mode: "bad" });
  const before = await card(api);
  const modal = await openEntry(page, before.title);
  await modal.getByRole("button", { name: "Заполнить с ИИ", exact: true }).click();
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.getByText("Ответ ИИ не удалось прочитать.")).toBeVisible();
  await page.getByRole("button", { name: "Показать ответ" }).click();
  await expect(page.getByText("Не могу найти эту модель")).toBeVisible();
  await expect(page.getByRole("button", { name: "Через ChatGPT вручную" }).last()).toBeVisible();
  expect((await card(api)).description).toBe(before.description);
});

test("двойной запуск: второй не плодит задачу, показывает «Уже идёт»", async ({ page, api }) => {
  await feature(api, true);
  await fake("mode", { mode: "normal", delayMs: 8000 });
  const before = await card(api);
  const hex = "p" + PRODUCT.scarf.replace(/-/g, "");
  // Первый запуск — «из другой вкладки»: напрямую в API.
  const first = await api.raw("post", "/api/admin/ai/card-jobs", {
    productId: PRODUCT.scarf,
    created: false,
    subjectVersion: "e2e",
    prompt: JSON.stringify({ [hex]: {} }),
    promptVersion: "e2e",
  });
  expect(first.status).toBe(200);
  const jobId = (first.body as { id: number }).id;

  const modal = await openEntry(page, before.title);
  await modal.getByRole("button", { name: "Заполнить с ИИ", exact: true }).click();
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.getByText(/^Уже идёт:/)).toBeVisible();

  const active = await api.raw("get", "/api/admin/ai/jobs/active");
  expect((active.body as unknown as { subjectId: string }[]).filter((j) => j.subjectId === PRODUCT.scarf)).toHaveLength(1);

  await api.raw("post", `/api/admin/ai/jobs/${jobId}/cancel`);
  await expect
    .poll(async () => ((await api.raw("get", `/api/admin/ai/jobs/${jobId}`)).body as { status: string }).status, { timeout: 20_000 })
    .not.toMatch(/^(QUEUED|RUNNING)$/);
});

/** Подмена «Фото по ссылке»: сервер не качает localhost; отвечаем успехом и запоминаем, какие ссылки прислал экран. */
async function fakePhotoImport(page: Page): Promise<string[]> {
  const sent: string[] = [];
  await page.route("**/api/admin/products/*/photos/import", async (route) => {
    const url = (route.request().postDataJSON() as { url: string }).url;
    sent.push(url);
    await route.fulfill({ json: { key: "e2e/photo-by-link.webp", source: url, cutOut: true, imageKeys: ["e2e/photo-by-link.webp"] } });
  });
  return sent;
}

/** Отметить фото из ответа (у товара без фото первые три отмечены сразу). */
async function pickPhoto(scope: Locator, url: string) {
  const pick = scope.locator(`button[title="${url}"]`);
  await expect(pick).toBeVisible();
  if ((await pick.getAttribute("aria-pressed")) !== "true") await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
}

test("ход по шагам, правка карточки во время работы — имя и время, фото из ответа", async ({ page, api }) => {
  await feature(api, true);
  const before = await card(api);
  const photo = "https://example.com/e2e-scarf-step.jpg";
  await fake("mode", { mode: "research", delayMs: 7000, description: `E2E-ИИ шаги ${Date.now()}`, photos: [photo] });

  const modal = await openEntry(page, before.title);
  await modal.getByRole("button", { name: "Заполнить с ИИ", exact: true }).click();
  await page.getByRole("button", { name: "Запустить" }).click();
  // Ход: поиск уже был («Ищу: …»), ИИ разбирает найденное — этап «Ищу в интернете» и сам шаг строкой.
  await expect(page.getByTestId("ai-job-step")).toHaveText("Разбираю найденное", { timeout: 15_000 });
  await expect(page.getByTestId("ai-job-stages").locator('[aria-current="step"]')).toHaveText(/Ищу в интернете/);
  const calls = (await fake("requests")) as { mode: string }[];
  expect(calls.map((c) => c.mode)).toEqual(["research:search", "research:answer"]);

  // Пока ИИ работает, человек правит описание (одна карточка — запись в журнале с его именем).
  const human = `Правка человека ${Date.now()}`;
  const edit = await api.raw("put", "/api/admin/cards/import", {
    items: [{ productId: PRODUCT.scarf, specs: {}, confidence: {}, description: human, markReady: true }],
    replaceSpecs: false,
  });
  expect(edit.status).toBe(200);

  await expect(page.getByText("Готово — проверьте, что предложил ИИ")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Открыть проверку" }).click();
  await expect(page).toHaveURL(/\/cards\/ai-review\/\d+$/);
  const jobId = Number(new URL(page.url()).pathname.split("/").pop());
  // Кто и когда: в плашке и в строке под замком; применить поле нельзя.
  await expect(page.getByText(/Пока работал ИИ, карточку правил \S/)).toBeVisible();
  await page.getByRole("button", { name: /Заполнено не ИИ/ }).click();
  await expect(page.getByText(/\S изменил «Описание» в \d{1,2}:\d{2}/)).toBeVisible();
  await expect(page.getByLabel("Применить: Описание")).toHaveCount(0);

  // Фото из ответа применяются тем же «Фото по ссылке», что у мастера.
  const sent = await fakePhotoImport(page);
  await pickPhoto(page.getByTestId("ai-review-photos"), photo);
  await page.getByRole("button", { name: "Применить (0) + 1 фото" }).click();
  await expect(page.getByText("Результат применён")).toBeVisible();
  await expect(page.getByText("добавлено 1")).toBeVisible();
  expect(sent).toEqual([photo]);

  // Описание человека ИИ не заменил; исход по задаче: ничего не принято, одно поле под замком.
  expect((await card(api)).description).toBe(human);
  await expect
    .poll(async () => (await query<{ a: number; i: number }>("SELECT outcome_applied a, outcome_ignored i FROM ai_jobs WHERE id = ?", [jobId]))[0])
    .toEqual({ a: 0, i: 1 });
});

test("ручной путь через ChatGPT: тот же экран проверки, переводы, «не применится», правка значения, фото, метка MANUAL", async ({ page, api }) => {
  await feature(api, true);
  const before = await card(api);
  const hex = "p" + PRODUCT.scarf.replace(/-/g, "");
  const photo = "https://example.com/e2e-scarf-manual.jpg";
  const proposed = `E2E-ChatGPT ${Date.now()}`;
  const entry = {
    overall: 90,
    description: { ru: proposed, uk: `${proposed} (uk)`, en: `${proposed} (en)` },
    photos: [photo],
    sources: ["https://example.com/manual"],
    // ключа нет в схеме — в карточку не попадёт, а в проверке сказано, что и почему
    specs: { e2e_no_such_key: 5 },
  };
  const answer = "```json\n" + JSON.stringify({ [hex]: entry }, null, 2) + "\n```";

  const modal = await openEntry(page, before.title);
  await modal.getByRole("button", { name: "Через ChatGPT вручную" }).click();
  await modal.getByLabel("Ответ ИИ").fill(answer);
  await modal.getByRole("button", { name: "Проверить", exact: true }).click();
  // Тот же экран проверки, что у встроенного ИИ: группы, «Выбрано N из M», «Применить (N)».
  await expect(modal.getByRole("heading", { name: "Проверка ответа" })).toBeVisible();
  await expect(modal.getByText(/^Выбрано \d+ из \d+$/)).toBeVisible();
  const box = modal.getByLabel("Применить: Описание");
  if (!(await box.isVisible())) await modal.getByRole("button", { name: /Заменит значение/ }).click();

  // Всё, что показывала прежняя проверка: переводы uk/en (видно и правится), что не применится и почему.
  await expect(modal.getByTestId("ai-review-skipped")).toContainText("e2e_no_such_key");
  await expect(modal.getByTestId("ai-review-skipped")).toContainText("нет такого ключа");
  const tr = modal.getByTestId("ai-review-translations");
  await expect(tr.getByLabel("Описание UA")).toHaveValue(`${proposed} (uk)`);
  await tr.getByLabel("Описание UA").fill(`${proposed} (uk, поправлено)`);
  await expect(tr.getByLabel("Описание UA")).toHaveValue(`${proposed} (uk, поправлено)`);

  // Правка значения прямо в ревью: строка помечена и сама включается.
  await modal.getByRole("button", { name: "Изменить: Описание" }).click();
  const edited = `${proposed} — поправлено`;
  await modal.getByLabel("Новое значение: Описание").fill(edited);
  await modal.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(modal.getByText("изменено вами")).toBeVisible();
  await expect(box).toBeChecked();

  const sent = await fakePhotoImport(page);
  await pickPhoto(modal, photo);
  const marked = page.waitForRequest((r) => r.url().endsWith("/api/admin/ai/manual-marks") && r.method() === "POST");
  await modal.getByRole("button", { name: "Применить (1) + 1 фото" }).click();
  expect((await marked).postDataJSON()).toEqual({ feature: "CARD", subjectIds: [PRODUCT.scarf] });
  await expect(modal.getByText("Результат применён")).toBeVisible();
  await expect(modal.getByText("добавлено 1")).toBeVisible();
  expect(sent).toEqual([photo]);

  const after = await card(api);
  expect(after.description).toBe(edited);
  expect(after.cardMeta?.sources).toContain("https://example.com/manual");
  expect((await fake("requests")) as unknown[]).toHaveLength(0);
});
