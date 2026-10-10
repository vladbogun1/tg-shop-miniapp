/**
 * «Метрики» with known numbers. The seed puts five orders (both channels) into March 2025 and
 * nothing else there, so in the custom period 2025-03-01 … 2025-03-31:
 *   all:      4 orders, sold 2 400 ₴, received 1 900 ₴, rejects 20 %
 *   Mini App: 3 orders, sold 1 700 ₴, received 1 200 ₴, rejects 0 %
 *   Сайт:     1 order,  sold   700 ₴, received   700 ₴, rejects 50 %
 *   funnel «Оформили / Оплатили / Отправлено»: all 4/2/3 = Mini App 2/1/2 + Сайт 2/1/1.
 * Plus: every tab opens for every preset period and every channel without an error.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "../lib/test";
import type { Api } from "../lib/api";

const FROM = "2025-03-01";
const TO = "2025-03-31";

const EXPECTED = {
  all: { label: "Все", sold: 240000, received: 190000, orders: 4, reject: 20, funnel: { order: 4, paid: 2, shipped: 3 } },
  miniapp: { label: "Mini App", sold: 170000, received: 120000, orders: 3, reject: 0, funnel: { order: 2, paid: 1, shipped: 2 } },
  web: { label: "Сайт", sold: 70000, received: 70000, orders: 1, reject: 50, funnel: { order: 2, paid: 1, shipped: 1 } },
} as const;
type Channel = keyof typeof EXPECTED;

const TABS = [
  ["Обзор", "Когда приходят заказы"],
  ["Товары и склад", "Топ товаров"],
  ["Покупатели", "Сколько раз покупают"],
  ["Воронка", "Много смотрят — мало покупают"],
  ["Операции", "Скорость обработки"],
] as const;
const PERIODS = ["Сегодня", "7 дн", "Этот месяц", "Прошлый месяц", "90 дн", "Год"] as const;

function uah(minor: number): RegExp {
  // uahShort below 10 000 ₴: "2 400 ₴" (any space between the groups).
  return new RegExp(`^${Math.round(minor / 100).toLocaleString("ru-RU").replace(/\s/g, "\\s")}\\s₴$`);
}

function kpi(page: Page, label: string) {
  return page.locator(".card").filter({ has: page.getByText(label, { exact: true }) }).locator(".kpi-num").first();
}

function funnelStep(page: Page, label: string) {
  return page.locator("div.grid").filter({ has: page.getByText(label, { exact: true }) }).locator("b").first();
}

async function overview(api: Api, channel: Channel) {
  const res = await api.raw("get", `/api/admin/metrics/overview?period=custom&from=${FROM}&to=${TO}&channel=${channel}`);
  expect(res.status).toBe(200);
  return res.body as unknown as {
    kpis: Record<"soldMinor" | "receivedMinor" | "orders" | "rejectRatePct", { value: number }>;
  };
}

async function funnel(api: Api, channel: Channel) {
  const res = await api.raw("get", `/api/admin/metrics/funnel?period=custom&from=${FROM}&to=${TO}&channel=${channel}`);
  expect(res.status).toBe(200);
  const steps = (res.body as unknown as { steps: { key: string; count: number }[] }).steps;
  return Object.fromEntries(steps.map((s) => [s.key, s.count])) as Record<string, number>;
}

async function pickCustomMarch(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Свой", exact: true }).click();
  const dates = page.locator("input[type=date]");
  await dates.nth(0).fill(FROM);
  await dates.nth(1).fill(TO);
  await page.getByRole("button", { name: "Показать", exact: true }).click();
}

test("«Обзор» за март 2025: продажи, поступления, заказы и отказы = засеянные, по каналам", async ({ page, api }) => {
  for (const ch of Object.keys(EXPECTED) as Channel[]) {
    const k = (await overview(api, ch)).kpis;
    const e = EXPECTED[ch];
    expect({ sold: k.soldMinor.value, received: k.receivedMinor.value, orders: k.orders.value, reject: k.rejectRatePct.value }, ch).toEqual({
      sold: e.sold,
      received: e.received,
      orders: e.orders,
      reject: e.reject,
    });
  }

  await page.goto("/metrics");
  await pickCustomMarch(page);
  for (const ch of Object.keys(EXPECTED) as Channel[]) {
    const e = EXPECTED[ch];
    await page.getByRole("button", { name: e.label, exact: true }).click();
    await expect(kpi(page, "Продано"), `${ch}: Продано`).toHaveText(uah(e.sold));
    await expect(kpi(page, "Получено"), `${ch}: Получено`).toHaveText(uah(e.received));
    await expect(kpi(page, "Заказов"), `${ch}: Заказов`).toHaveText(String(e.orders));
    await expect(kpi(page, "Отказы"), `${ch}: Отказы`).toHaveText(`${e.reject}%`);
  }
  // The choice (period + channel) is remembered across a reload.
  await page.reload();
  await expect(kpi(page, "Продано")).toHaveText(uah(EXPECTED.web.sold));
  await expect(kpi(page, "Заказов")).toHaveText(String(EXPECTED.web.orders));
});

test("после перезагрузки поля «Свой» показывают сохранённые даты", async ({ page }) => {
  await page.goto("/metrics");
  await pickCustomMarch(page);
  await expect(kpi(page, "Заказов")).toHaveText(String(EXPECTED.all.orders));
  await page.reload();
  await expect(kpi(page, "Заказов")).toHaveText(String(EXPECTED.all.orders));
  await expect(page.locator("input[type=date]").nth(0)).toHaveValue(FROM, { timeout: 5_000 });
  await expect(page.locator("input[type=date]").nth(1)).toHaveValue(TO, { timeout: 5_000 });
});

test("«Воронка»: при «Все» шаги заказов = Mini App + Сайт", async ({ page, api }) => {
  const api3 = { all: await funnel(api, "all"), miniapp: await funnel(api, "miniapp"), web: await funnel(api, "web") };
  for (const key of ["order", "paid", "shipped"] as const) {
    expect(api3.all[key], `API ${key}`).toBe(api3.miniapp[key] + api3.web[key]);
    for (const ch of Object.keys(EXPECTED) as Channel[]) expect(api3[ch][key], `API ${ch} ${key}`).toBe(EXPECTED[ch].funnel[key]);
  }

  await page.goto("/metrics?tab=funnel");
  await pickCustomMarch(page);
  const shown: Record<string, Record<string, number>> = {};
  for (const ch of Object.keys(EXPECTED) as Channel[]) {
    await page.getByRole("button", { name: EXPECTED[ch].label, exact: true }).click();
    const e = EXPECTED[ch].funnel;
    await expect(funnelStep(page, "Оформили заказ")).toHaveText(String(e.order));
    await expect(funnelStep(page, "Оплатили")).toHaveText(String(e.paid));
    await expect(funnelStep(page, "Отправлено")).toHaveText(String(e.shipped));
    shown[ch] = {
      order: Number(await funnelStep(page, "Оформили заказ").innerText()),
      paid: Number(await funnelStep(page, "Оплатили").innerText()),
      shipped: Number(await funnelStep(page, "Отправлено").innerText()),
    };
  }
  for (const key of ["order", "paid", "shipped"]) expect(shown.all[key]).toBe(shown.miniapp[key] + shown.web[key]);
});

test("каждая вкладка открывается для каждого периода и канала без ошибок", async ({ page, api }) => {
  test.setTimeout(240_000);
  // API: every tab × period × channel answers 200.
  const endpoints = ["overview", "stock", "customers", "funnel", "operations"];
  const periods = ["today", "7d", "month", "prevmonth", "90d", "year"];
  for (const ep of endpoints)
    for (const p of periods)
      for (const ch of ["all", "miniapp", "web"]) {
        const res = await api.raw("get", `/api/admin/metrics/${ep}?period=${p}&channel=${ch}`);
        expect(res.status, `${ep} ${p} ${ch}`).toBe(200);
      }

  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/metrics");
  await expect(page.getByRole("heading", { name: "Метрики", level: 1 })).toBeVisible();
  for (const [tab, panel] of TABS) {
    await page.getByRole("main").getByRole("button", { name: tab, exact: true }).click();
    for (const period of PERIODS) {
      await page.getByRole("button", { name: period, exact: true }).click();
      await expect(page.getByRole("heading", { level: 3, name: panel }), `${tab} · ${period}`).toBeVisible();
      await expect(page.getByText("Не удалось загрузить")).toHaveCount(0);
    }
    for (const ch of ["Mini App", "Сайт", "Все"]) {
      await page.getByRole("button", { name: ch, exact: true }).click();
      await expect(page.getByRole("heading", { level: 3, name: panel }), `${tab} · ${ch}`).toBeVisible();
      await expect(page.getByText("Не удалось загрузить")).toHaveCount(0);
    }
  }
  expect(failed).toEqual([]);
});
