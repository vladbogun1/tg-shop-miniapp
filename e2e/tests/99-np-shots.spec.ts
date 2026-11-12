/**
 * Снимки экранов Новой Почты для проверки вёрстки глазами (`NP_SHOTS=1`, иначе пропускается — в CI не идёт):
 * настройки НП (отправитель с отделениями, коробки, вебхуки, размеры), «Отправка» с ТТН и пакетной панелью,
 * вес и коробка в товаре. Ответы `/api/admin/np/*` подменены (`page.route`) выдуманными данными —
 * ни ключ НП, ни боевые ТТН не участвуют. Ширины 375 и 1440, файлы — `_shots/np-*.png`.
 */
import path from "node:path";
import type { Page, Route } from "@playwright/test";
import { REPO_ROOT } from "../env.js";
import { PRODUCT } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = [375, 1440];

test.skip(!process.env.NP_SHOTS, "только по NP_SHOTS=1");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

const BRANCHES = [
  { ref: "wh-1", number: "1", description: "Відділення №1: вул. Тестова, 1", cityRef: "c-1", cityName: "Київ" },
  { ref: "wh-2", number: "25", description: "Відділення №25: просп. Прикладний, 10", cityRef: "c-1", cityName: "Київ" },
];

const SENDER = {
  keyConfigured: true,
  dryRun: true,
  sender: {
    counterpartyRef: "cp-1",
    counterpartyName: "ФОП Тестовий Т. Т.",
    ownershipForm: "PrivatePerson",
    contactRef: "ct-1",
    contactName: "Тестовий Тест",
    phone: "380000000000",
    contacts: [{ ref: "ct-1", name: "Тестовий Тест", phone: "380000000000" }],
    warehouses: BRANCHES,
    defaultWarehouseRef: "wh-2",
    loadedAt: "2026-11-11T09:00:00Z",
  },
};

const SIZE = { weightG: 450, lengthMm: 200, widthMm: 150, heightMm: 60 };
const EMPTY = { weightG: null, lengthMm: null, widthMm: null, heightMm: null };

async function mockNp(page: Page) {
  await page.route("**/api/admin/np/sender", (r) => json(r, SENDER));
  await page.route("**/api/admin/np/box-presets", (r) =>
    json(r, {
      presets: [
        { name: "Мала", lengthMm: 200, widthMm: 150, heightMm: 100, tareG: 120, packMinor: 1500 },
        { name: "Середня", lengthMm: 300, widthMm: 200, heightMm: 150, tareG: 250, packMinor: 2500 },
      ],
    })
  );
  await page.route("**/api/admin/np/webhook", (r) =>
    json(r, { configured: true, url: "https://example.test/api/np/webhook", subscriptions: [{ id: "sub-1", type: "status", url: "https://example.test/api/np/webhook", active: true }], error: null })
  );
  await page.route("**/api/admin/np/size/categories", (r) =>
    json(r, [
      { id: "cat-1", parentId: null, name: "Мишки", size: SIZE },
      { id: "cat-2", parentId: "cat-1", name: "Бездротові", size: EMPTY },
      { id: "cat-3", parentId: null, name: "Килимки", size: { weightG: 600, lengthMm: 450, widthMm: 100, heightMm: 100 } },
    ])
  );
  await page.route("**/api/admin/np/size/products/*", (r) =>
    json(r, { id: PRODUCT.socks, size: SIZE, variants: [{ id: "v-1", name: "Чорний", size: EMPTY }], categoryId: null })
  );
}

const STAGES = [
  { shipmentStage: null, shipmentOrigin: null, shipmentStaleReasons: [], trackingNumber: null },
  { shipmentStage: "CREATED", shipmentOrigin: "API", shipmentStaleReasons: [], trackingNumber: "20450000000001", shipmentStatusText: "Створено" },
  { shipmentStage: "CREATED", shipmentOrigin: "API", shipmentStaleReasons: ["ADDRESS"], trackingNumber: "20450000000002", shipmentStatusText: "Створено" },
];

async function mockDispatch(page: Page) {
  await page.route("**/api/admin/orders/dispatch*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const orders = (await res.json()) as Record<string, unknown>[];
    const np = orders.map((o, i) =>
      i < STAGES.length
        ? { ...o, deliveryMethod: "NOVA_POSHTA", npServiceType: i === 1 ? "POSTOMAT" : "WAREHOUSE", paymentOnDelivery: i === 0, ...STAGES[i] }
        : o
    );
    await json(route, np);
  });
}

async function shoot(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `np-${name}-${width}.png`), fullPage: true });
}

for (const width of WIDTHS) {
  test(`настройки НП — ${width}`, async ({ page }) => {
    await mockNp(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/settings#group-novaposhta");
    const group = page.locator("#group-novaposhta");
    await expect(group.getByRole("heading", { name: "Отправитель Новой Почты" })).toBeVisible();
    await expect(group.getByText("Мала: 20×15×10 / тара 120 г / 15 ₴")).toBeVisible();
    await group.scrollIntoViewIfNeeded();
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await group.screenshot({ path: path.join(SHOTS, `np-settings-${width}.png`) });
  });

  test(`отправка с ТТН — ${width}`, async ({ page }) => {
    await mockNp(page);
    await mockDispatch(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dispatch");
    await expect(page.getByText("ТТН устарела").first()).toBeVisible();
    await shoot(page, "dispatch", width);
  });

  test(`вес и коробка в товаре — ${width}`, async ({ page }) => {
    await mockNp(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/products?edit=${PRODUCT.socks}`);
    const modal = dialog(page, "Редактировать товар");
    await modal.getByRole("button", { name: "Шаг 3: Цена и склад" }).click();
    const saveSize = modal.getByRole("button", { name: "Сохранить размеры" });
    await expect(saveSize).toBeVisible();
    // Блок внизу шага, внутри прокрутки окна: снимаем видимую часть окна, а не всю страницу.
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await saveSize.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, `np-product-size-${width}.png`) });
  });
}
