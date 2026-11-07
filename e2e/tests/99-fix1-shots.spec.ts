/**
 * Снимки доводки ИИ-карточки для проверки вёрстки глазами (`FIX1_SHOTS=1`, иначе пропускается — в CI не идёт):
 * запуск, ход, ревью с конфликтом правок и фото, чип ✦ и «Идут», ручной путь через ChatGPT в общей проверке —
 * на 320, 375 и 1440 px, в `_shots/fix1-*.png` корня репозитория.
 */
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { FAKE_AI_URL, REPO_ROOT } from "../env.js";
import type { Api } from "../lib/api";
import { checkLayout } from "../lib/layout-qa";
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const IMG = ["storefront.webp", "banner.webp"].map((f) => path.join(REPO_ROOT, "docs/brand/v3/reference", f));
const PHOTOS = ["https://example.com/e2e-shot-1.webp", "https://example.com/e2e-shot-2.webp"];

async function fake(p: string, body?: unknown) {
  const res = await fetch(`${FAKE_AI_URL}/__e2e/${p}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}

async function feature(api: Api, on: boolean | null) {
  await api.raw("put", "/api/admin/settings", { values: { "ai.feature.completion": on } });
}

async function title(api: Api): Promise<string> {
  await api.raw("put", "/api/admin/cards/import", { items: [{ productId: PRODUCT.scarf, specs: {}, confidence: {}, markReady: true }], replaceSpecs: false });
  const res = await api.raw("get", `/api/admin/cards/export?status=all&ids=${PRODUCT.scarf}`);
  const raw = res.body as unknown;
  const list = (Array.isArray(raw) ? raw : (raw as { items: { id: string; title: string }[] }).items) as { id: string; title: string }[];
  return list.find((i) => i.id === PRODUCT.scarf)!.title;
}

async function images(page: Page) {
  await page.route("https://example.com/**", (route) => {
    const i = route.request().url().includes("-2") ? 1 : 0;
    return route.fulfill({ body: fs.readFileSync(IMG[i]), contentType: "image/webp" });
  });
}

async function openEntry(page: Page, t: string): Promise<Locator> {
  await page.goto("/cards");
  await page.getByRole("button", { name: /^Готово\s*\d+$/ }).click();
  await page.getByLabel("Поиск карточек").fill(t);
  const row = page.getByRole("listitem").filter({ hasText: t });
  await row.getByRole("button", { name: new RegExp(t) }).click();
  await page.getByRole("button", { name: "Переоформить с ИИ" }).click();
  const modal = dialog(page, `: ${t}`);
  await expect(modal).toBeVisible();
  return modal;
}

const shot = async (page: Page, name: string) => {
  await checkLayout(page, `fix1-${name}`);
  await page.screenshot({ path: path.join(SHOTS, `fix1-${name}.png`) });
};

test.skip(!process.env.FIX1_SHOTS, "только по FIX1_SHOTS=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

test.afterAll(async ({ api }) => {
  await feature(api, null);
  await fake("reset", {});
});

test("снимки: запуск, ход, ревью с конфликтом и фото", async ({ page, api }) => {
  await fake("reset", {});
  await feature(api, true);
  await images(page);
  const t = await title(api);
  await fake("mode", { mode: "research", delayMs: 12000, description: `ИИ-описание шарфа: тёплый, мягкий, ${Date.now()}`, photos: PHOTOS });

  await page.setViewportSize({ width: 1440, height: 900 });
  const modal = await openEntry(page, t);
  await shot(page, "launch-1440");
  await modal.getByRole("button", { name: "Заполнить с ИИ", exact: true }).click();
  await expect(page.getByRole("button", { name: "Запустить" })).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "launch-confirm-1440");
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.getByTestId("ai-job-step")).toHaveText(/./, { timeout: 15_000 });
  await page.waitForTimeout(700);
  await shot(page, "progress-step-1440");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId("ai-job-step")).toHaveText("Разбираю найденное", { timeout: 15_000 });
  await shot(page, "progress-step-375");
  await page.setViewportSize({ width: 320, height: 640 });
  await shot(page, "progress-step-320");

  await api.raw("put", "/api/admin/cards/import", {
    items: [{ productId: PRODUCT.scarf, specs: {}, confidence: {}, description: `Правка человека ${Date.now()}`, markReady: true }],
    replaceSpecs: false,
  });
  await expect(page.getByText("Готово — проверьте, что предложил ИИ")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Открыть проверку" }).click();
  await expect(page).toHaveURL(/\/cards\/ai-review\/\d+$/);
  await expect(page.getByText(/Пока работал ИИ, карточку правил/)).toBeVisible();
  await page.getByRole("button", { name: /Заполнено не ИИ/ }).click();
  await expect(page.getByTestId("ai-review-photos")).toBeVisible();
  await page.waitForTimeout(800);
  for (const [w, h] of [
    [320, 640],
    [375, 812],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await shot(page, `review-conflict-${w}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    await shot(page, `review-conflict-${w}-bottom`);
  }
});

test("снимки: чип ✦ и «Идут» на 320/375", async ({ page, api }) => {
  await fake("reset", {});
  await feature(api, true);
  await fake("mode", { mode: "normal", delayMs: 25000 });
  const hex = "p" + PRODUCT.scarf.replace(/-/g, "");
  const job = await api.raw("post", "/api/admin/ai/card-jobs", {
    productId: PRODUCT.scarf,
    created: false,
    subjectVersion: "e2e",
    prompt: JSON.stringify({ [hex]: {} }),
    promptVersion: "e2e",
  });
  const jobId = (job.body as { id: number }).id;
  for (const w of [320, 375]) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto("/cards");
    await expect(page.getByTestId("ai-chip")).toBeVisible({ timeout: 15_000 });
    await shot(page, `chip-${w}`);
    await page.goto("/ai-tasks");
    await page.waitForTimeout(1500);
    await shot(page, `tasks-${w}`);
    await page.getByRole("tab", { name: /^Идут/ }).click();
    await page.waitForTimeout(800);
    await shot(page, `tasks-running-${w}`);
  }
  await api.raw("post", `/api/admin/ai/jobs/${jobId}/cancel`);
  await expect.poll(async () => ((await api.raw("get", `/api/admin/ai/jobs/${jobId}`)).body as { status: string }).status, { timeout: 30_000 }).not.toMatch(/^(QUEUED|RUNNING)$/);
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/ai-tasks");
  await page.getByRole("tab", { name: /^Идут/ }).click();
  await page.waitForTimeout(800);
  await shot(page, "tasks-empty-375");
});

test("снимки: ручной путь в новой проверке", async ({ page, api }) => {
  await fake("reset", {});
  await feature(api, true);
  await images(page);
  const t = await title(api);
  const hex = "p" + PRODUCT.scarf.replace(/-/g, "");
  const proposed = "ChatGPT: тёплый шарф из мериноса";
  const entry = {
    overall: 90,
    description: { ru: proposed, uk: `${proposed} (uk)`, en: `${proposed} (en)` },
    photos: PHOTOS,
    sources: ["https://example.com/manual"],
    specs: { e2e_no_such_key: 5 },
  };
  const answer = "```json\n" + JSON.stringify({ [hex]: entry }, null, 2) + "\n```";
  for (const [w, h] of [
    [1440, 900],
    [375, 812],
    [320, 640],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    const modal = await openEntry(page, t);
    await modal.getByRole("button", { name: "Через ChatGPT вручную" }).click();
    await modal.getByLabel("Ответ ИИ").fill(answer);
    await modal.getByRole("button", { name: "Проверить", exact: true }).click();
    await expect(modal.getByRole("heading", { name: "Проверка ответа" })).toBeVisible();
    const box = modal.getByLabel("Применить: Описание");
    if (!(await box.isVisible())) await modal.getByRole("button", { name: /Заменит значение/ }).click();
    await modal.getByRole("button", { name: "Изменить: Описание" }).click();
    await shot(page, `manual-edit-${w}`);
    await modal.getByLabel("Новое значение: Описание").fill(`${proposed} — поправлено`);
    await modal.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.waitForTimeout(600);
    await shot(page, `manual-review-${w}`);
    await modal.getByTestId("ai-review-photos").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, `manual-photos-${w}`);
    await modal.getByTestId("ai-review-skipped").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, `manual-bottom-${w}`);
    await page.keyboard.press("Escape");
  }
});
