/**
 * Метрики → «ИИ» (этап Э3), по образцу 29-metrics-values: засеянные числа = числа на плитках.
 * В марте 2025 засеяно (всё по 2,00 ₴ за встроенную задачу, курс 42 ₴):
 *   A  CARD  принято 10/0           B  CARD  принято 6, отклонено 4 (частично)
 *   C  CARD  пусто (EMPTY)          D  ручной путь, причина «по выбору»
 *   E  тестовый админ claude-tech (по умолчанию не считается)       F  апрель — вне периода
 * Ожидаем за март: потрачено 6 ₴, принято 2 задачи, встроенный 2 против 1 ручного, «без правок» 80 % полей и 50 %
 * карточек целиком из 2, «зря потрачено» 2 ₴ (пустой ответ). Обычный админ вкладки «ИИ» не видит.
 */
import type { Page } from "@playwright/test";
import { ADMIN } from "../env.js";
import { clearSeeded, getAs, seedJob, signInPlainAdmin, removePlainAdmin, TEST_ADMIN_ID } from "../lib/ai-admin";
import { PRODUCT } from "../lib/seed";
import { expect, test } from "../lib/test";
import type { Api } from "../lib/api";

test.describe.configure({ mode: "serial" });

const FROM = "2025-03-01";
const TO = "2025-03-31";

test.beforeAll(async () => {
  await clearSeeded();
  await seedJob({ status: "DONE", admin: ADMIN.id, subject: PRODUCT.tee, at: "2025-03-10T10:00:00Z", outcome: "APPLIED", applied: 10, rejected: 0 });
  await seedJob({ status: "DONE", admin: ADMIN.id, subject: PRODUCT.cap, at: "2025-03-10T11:00:00Z", outcome: "PARTIAL", applied: 6, rejected: 4 });
  await seedJob({ status: "EMPTY", admin: ADMIN.id, subject: PRODUCT.bag, at: "2025-03-11T10:00:00Z" });
  await seedJob({ status: "DONE", admin: ADMIN.id, subject: PRODUCT.socks, at: "2025-03-11T12:00:00Z", path: "MANUAL", outcome: "APPLIED", costMicro: 0, rateMilli: 0, errorCode: "CHOICE" });
  await seedJob({ status: "DONE", admin: TEST_ADMIN_ID, subject: PRODUCT.scarf, at: "2025-03-11T13:00:00Z", outcome: "APPLIED", applied: 5, rejected: 0 });
  await seedJob({ status: "DONE", admin: ADMIN.id, subject: PRODUCT.tee, at: "2025-04-02T10:00:00Z", outcome: "APPLIED", applied: 5, rejected: 0 });
});

test.afterAll(async () => {
  await clearSeeded();
  await removePlainAdmin();
});

interface Summary {
  spentMinor: number;
  accepted: number;
  share: { builtin: number; manual: number; builtinPercent: number };
  noEdits: { fieldsPercent: number; cardsPercent: number; decided: number };
  wastedMinor: number;
  waiting: { count: number };
}

async function summary(api: Api, extra = ""): Promise<Summary> {
  const res = await api.raw("get", `/api/admin/ai/metrics/summary?from=${FROM}&to=${TO}${extra}`);
  expect(res.status).toBe(200);
  return res.body as unknown as Summary;
}

/** Плитка по подписи: значение и подсказка под ним. */
function tile(page: Page, testId: string) {
  const t = page.getByTestId(testId);
  return { value: t.locator(".kpi-num"), hint: t.locator("div").last() };
}

async function openAiTab(page: Page): Promise<void> {
  await page.goto("/metrics?tab=ai");
  await page.getByRole("button", { name: "Свой", exact: true }).click();
  const dates = page.locator("input[type=date]");
  await dates.nth(0).fill(FROM);
  await dates.nth(1).fill(TO);
  await page.getByRole("button", { name: "Показать", exact: true }).click();
}

test("API за март: засеянные числа, тестовый админ не считается, но с флагом считается", async ({ api }) => {
  const s = await summary(api);
  expect({ spent: s.spentMinor, accepted: s.accepted, builtin: s.share.builtin, manual: s.share.manual, wasted: s.wastedMinor }).toEqual({
    spent: 600,
    accepted: 2,
    builtin: 2,
    manual: 1,
    wasted: 200,
  });
  expect(s.noEdits).toMatchObject({ fieldsPercent: 80, cardsPercent: 50, decided: 2 });
  const withTest = await summary(api, "&withTest=true");
  expect(withTest.spentMinor).toBe(800);
  expect(withTest.accepted).toBe(3);
});

test("плитки «ИИ» = числа API, а график по дням в сумме даёт те же 6 ₴", async ({ page, api }) => {
  const s = await summary(api);
  await openAiTab(page);

  await expect(tile(page, "ai-tile-share").value).toHaveText(`${s.share.builtinPercent} %`);
  await expect(page.getByTestId("ai-tile-share")).toContainText("встроенный 2, вручную 1");
  await expect(page.getByTestId("ai-tile-share")).toContainText("по выбору: 1");
  await expect(tile(page, "ai-tile-noedits").value).toHaveText("80 %");
  await expect(page.getByTestId("ai-tile-noedits")).toContainText("карточек целиком 50 % из 2");
  await expect(tile(page, "ai-tile-waste").value).toHaveText(/^2([,.]00)?\s₴$/);
  await expect(page.getByTestId("ai-tile-waste")).toContainText("не нашёл данных: 1");
  await expect(tile(page, "ai-tile-waiting").value).toHaveText(String(s.waiting.count));

  await page.getByTestId("ai-more").click();
  await expect(page.getByTestId("ai-days-chart")).toBeVisible();
  const days = (await api.raw("get", `/api/admin/ai/metrics?groupBy=day&from=${FROM}&to=${TO}`)).body as unknown as {
    rows: { key: string; costMinor: number }[];
  };
  expect(days.rows).toHaveLength(31);
  expect(days.rows.reduce((sum, r) => sum + r.costMinor, 0)).toBe(s.spentMinor);
  expect(days.rows.find((r) => r.key === "2025-03-10")?.costMinor).toBe(400);
});

test("обычный админ: метрики ИИ закрыты на сервере и вкладки нет", async () => {
  const token = await signInPlainAdmin();
  expect((await getAs(token, `/api/admin/ai/metrics/summary?from=${FROM}&to=${TO}`)).status).toBe(403);
  expect((await getAs(token, `/api/admin/ai/metrics?groupBy=day&from=${FROM}&to=${TO}`)).status).toBe(403);
});
