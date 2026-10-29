/**
 * «Поставки» + закупка и маржа (docs/PREORDERS-PLAN.md §5, §5А): the admin orders a batch of an
 * out-of-stock mouse from a factory, a customer queues for it, the batch arrives (the customer gets a
 * hold), the admin enters an expense and sees the unit cost, the customer buys from the hold (queue entry
 * BOUGHT, order card shows «Прибыль»). The steps depend on each other, so the spec runs in order.
 *
 * Customer calls go through a token signed with the e2e JWT secret (lib/api.ts CustomerApi).
 */
import fs from "node:fs";
import { CustomerApi } from "../lib/api";
import { query } from "../lib/db";
import { PREORDER, money } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";

test.describe.configure({ mode: "serial" });

const TITLE = "E2E Заказ у завода 38";
const PRICE_FX_CENTS = 5000; // $50.00 per unit
const FX_RATE = 40; // 40 ₴ per $
const SALE_PRICE_MINOR = 349900;
const EXPENSE_USD = 10; // × 40 = 400 ₴ over 2 arrived units = 200 ₴ each
const UNIT_COST_MINOR = PRICE_FX_CENTS * FX_RATE + (EXPENSE_USD * FX_RATE * 100) / 2; // 2 200 ₴

let batchId = 0;
let orderId = "";

interface BatchApi {
  id: number;
  status: string;
  items: { id: number; qtyOrdered: number; qtyArrived: number | null; unitPriceFx: number | null; priceMinor: number }[];
}
interface SubscriberApi {
  id: number;
  userId: number;
  status: string;
  qty: number;
  heldQty: number;
}

test("поставка создаётся из админки: товар без остатка, 2 шт, цена закупки", async ({ page, api }) => {
  await page.goto("/preorders");
  await expect(page.getByRole("heading", { name: "Поставки", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Новая поставка" }).first().click();

  const form = dialog(page, "Новая поставка");
  await form.getByLabel("Название (для себя)").fill(TITLE);
  await form.getByRole("button", { name: "Добавить товар" }).click();
  const pick = dialog(page, "Товар в поставку");
  await pick.getByLabel("Поиск товара").fill(PREORDER.productTitle);
  await pick.getByRole("button", { name: new RegExp(PREORDER.productTitle) }).click();

  await expect(form.getByText(PREORDER.productTitle)).toBeVisible();
  await form.getByLabel("Заказано, шт").fill("2");
  await form.getByPlaceholder("напр. 41.5").fill(String(FX_RATE));
  await form.getByLabel(/Цена закупки за шт/).fill("50");
  await form.getByRole("button", { name: "Создать", exact: true }).click();

  await expect(toast(page, "Поставка создана")).toBeVisible();
  await expect(page).toHaveURL(/\/preorders\/\d+$/);
  batchId = Number(new URL(page.url()).pathname.split("/").pop());

  await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect(page.getByText("предзаказ открыт")).toBeVisible();
  await expect(page.getByText("Заказана", { exact: true })).toBeVisible();

  const { status, body } = await api.raw("get", `/api/admin/preorders/batches/${batchId}`);
  expect(status).toBe(200);
  const batch = body as unknown as BatchApi;
  expect(batch.status).toBe("ORDERED");
  expect(batch.items).toHaveLength(1);
  expect(batch.items[0].qtyOrdered).toBe(2);
  expect(batch.items[0].unitPriceFx).toBe(PRICE_FX_CENTS);
});

test("покупатель встал в очередь: «ждут 1» в списке, в карточке, в «Чего ждут», CSV со списком", async ({ page }) => {
  const customer = await CustomerApi.create(PREORDER.customer.id);
  try {
    const sub = await customer.subscribe(PREORDER.product, 1);
    expect(sub.status).toBe("WAITING");
  } finally {
    await customer.dispose();
  }

  // The list card of the batch.
  await page.goto("/preorders");
  const row = page.getByRole("link", { name: new RegExp(TITLE) });
  await expect(row).toBeVisible();
  await expect(row.getByText("1 чел / 1 шт")).toBeVisible();

  // The batch: queue with the customer, counters.
  await row.click();
  await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await expect(page.getByText(PREORDER.customer.name)).toBeVisible();
  await expect(page.getByText(`@${PREORDER.customer.username}`)).toBeVisible();
  await expect(page.getByText("ждут 1 чел / 1 шт")).toBeVisible();

  // CSV of the queue (UTF-8 + BOM, «;»).
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await downloading;
  const csv = fs.readFileSync(await download.path(), "utf8");
  expect(csv).toContain("name;username;qty;status");
  expect(csv).toContain(PREORDER.customer.name);
  expect(csv).toContain(PREORDER.customer.username);

  // «Чего ждут»: the product is there and says the batch already brings it.
  await page.goto("/preorders?tab=demand");
  await expect(page.getByRole("tab", { name: /Чего ждут/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(PREORDER.productTitle).first()).toBeVisible();
  await expect(page.getByText("1 чел / 1 шт").first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`уже едет: ${TITLE}`) })).toBeVisible();

  // The home widget «Хотят купить».
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Хотят купить" })).toBeVisible();
});

test("«Приехала»: пришло 2, цена продажи — бронь у ждущего, остаток пополнен", async ({ page, api }) => {
  await page.goto(`/preorders/${batchId}`);
  await page.getByRole("button", { name: "Приехала", exact: true }).click();

  const modal = dialog(page, `Приехала: ${TITLE}`);
  await expect(modal.getByLabel("Пришло, шт")).toHaveValue("2");
  await modal.getByLabel("Цена продажи, ₴").fill(String(SALE_PRICE_MINOR / 100));

  // «Подтвердить» is locked until the preview is calculated.
  await expect(modal.getByRole("button", { name: "Подтвердить" })).toBeDisabled();
  await modal.getByRole("button", { name: "Посчитать" }).click();
  await expect(modal.getByText("бронь получат 1 чел (1 шт)")).toBeVisible();
  await expect(modal.getByText("не хватит 0 чел", { exact: true })).toBeVisible();
  await expect(modal.getByText("свободно в продажу 1 шт", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "Подтвердить" }).click();

  await expect(toast(page, "Приход проведён. Бронь получили 1 чел.")).toBeVisible();
  await expect(modal).toBeHidden();
  await expect(page.getByText("Приехала", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Бронь до/)).toBeVisible();

  const batch = (await api.raw("get", `/api/admin/preorders/batches/${batchId}`)).body as unknown as BatchApi;
  expect(batch.status).toBe("ARRIVED");
  expect(batch.items[0].qtyArrived).toBe(2);
  expect(batch.items[0].priceMinor).toBe(SALE_PRICE_MINOR);

  const product = await api.product(PREORDER.product);
  expect(product.stock).toBe(2);
  expect(product.priceMinor).toBe(SALE_PRICE_MINOR);

  const subs = (await api.raw("get", `/api/admin/preorders/batches/${batchId}/subscribers`)).body as unknown as SubscriberApi[];
  const mine = subs.find((s) => s.userId === PREORDER.customer.id);
  expect(mine?.status).toBe("HELD");
  expect(mine?.heldQty).toBe(1);
});

test("вкладка «Деньги»: расход партии, себестоимость штуки, «Все расходы внесены»", async ({ page, api }) => {
  await page.goto(`/preorders/${batchId}`);
  await page.getByRole("tab", { name: "Деньги" }).click();
  await expect(page.getByText("себестоимость предварительная", { exact: true })).toBeVisible();

  // Purchase only so far: 50 $ × 40 = 2 000 ₴ per unit, no expenses.
  await expect(page.getByRole("cell", { name: money(PRICE_FX_CENTS * FX_RATE) }).first()).toBeVisible();
  await expect(page.getByText("Расходов пока нет")).toBeVisible();

  await page.getByRole("button", { name: "Добавить расход" }).click();
  const modal = dialog(page, "Добавить расход");
  await modal.getByPlaceholder("напр. 120.00").fill(String(EXPENSE_USD));
  await modal.getByPlaceholder("напр. 41.5").fill(String(FX_RATE));
  await modal.getByPlaceholder("напр. DHL, накладная 123").fill("DHL e2e");
  await modal.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Расход добавлен")).toBeVisible();
  await expect(modal).toBeHidden();

  await expect(page.getByText("DHL e2e")).toBeVisible();
  // 400 ₴ of expenses spread over 2 units: unit cost 2 200 ₴, margin against the 3 499 ₴ price.
  await expect(page.getByRole("cell", { name: money(UNIT_COST_MINOR), exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: money(SALE_PRICE_MINOR - UNIT_COST_MINOR), exact: true }).first()).toBeVisible();

  await page.getByRole("switch", { name: /Все расходы внесены/ }).click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(toast(page, "Деньги поставки сохранены")).toBeVisible();
  await expect(page.getByText("себестоимость окончательная", { exact: true })).toBeVisible();

  const costing = (await api.raw("get", `/api/admin/costing/batches/${batchId}`)).body as unknown as {
    costsFinal: boolean;
    expensesMinor: number;
    lines: { costUnitMinor: number | null }[];
  };
  expect(costing.costsFinal).toBe(true);
  expect(costing.expensesMinor).toBe(EXPENSE_USD * FX_RATE * 100);
  expect(costing.lines[0].costUnitMinor).toBe(UNIT_COST_MINOR);
});

test("покупатель покупает из брони: очередь закрыта как BOUGHT, в заказе блок «Прибыль»", async ({ page, api }) => {
  const customer = await CustomerApi.create(PREORDER.customer.id);
  try {
    ({ orderId } = await customer.placeOrder(PREORDER.customer.name, [{ productId: PREORDER.product, quantity: 1 }]));
  } finally {
    await customer.dispose();
  }

  // The queue entry is done and linked to the order; one unit left on the shelf.
  const subs = await query<{ status: string; oid: string | null }>(
    "SELECT status, HEX(order_id) AS oid FROM preorder_subscriptions WHERE user_id = ?",
    [PREORDER.customer.id],
  );
  expect(subs).toHaveLength(1);
  expect(subs[0].status).toBe("BOUGHT");
  expect(subs[0].oid?.toLowerCase()).toBe(orderId.replace(/-/g, ""));
  expect((await api.product(PREORDER.product)).stock).toBe(1);

  // Order card: profit of the order from the batch's unit cost (FIFO lot).
  const drawer = await openOrderFromBoard(page, orderId, PREORDER.customer.name);
  await expect(drawer.getByRole("heading", { name: "Прибыль", level: 3 })).toBeVisible();
  await expect(drawer.getByText("Себестоимость", { exact: true })).toBeVisible();
  await expect(drawer.getByText(money(UNIT_COST_MINOR)).first()).toBeVisible();

  const profit = (await api.raw("get", `/api/admin/costing/orders/${orderId}`)).body as unknown as {
    revenueMinor: number;
    costMinor: number;
    complete: boolean;
  };
  expect(profit.revenueMinor).toBe(SALE_PRICE_MINOR);
  expect(profit.costMinor).toBe(UNIT_COST_MINOR);
  expect(profit.complete).toBe(true);

  // The batch's «Продажи» tab counts the sale.
  await page.goto(`/preorders/${batchId}`);
  await page.getByRole("tab", { name: "Продажи" }).click();
  await expect(page.getByText("Прибыль").first()).toBeVisible();
  await expect(page.getByText("Не удалось загрузить")).toHaveCount(0);
});

test("«Метрики → Предзаказы» и «Чего ждут» открываются без ошибок", async ({ page, api }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/metrics");
  await page.getByRole("button", { name: "Предзаказы", exact: true }).click();
  await expect(page).toHaveURL(/tab=preorders/);
  await expect(page.getByText("Подписок в очередь", { exact: true })).toBeVisible();
  await expect(page.getByText("Купили из брони", { exact: true })).toBeVisible();
  await expect(page.getByText("Не удалось загрузить")).toHaveCount(0);

  // The default period is «this month»: the subscription made today is in it. Days are Kyiv days on the
  // backend, so «today» is too (after 21:00/22:00 UTC the UTC date is still yesterday).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
  const { body } = await api.raw("get", `/api/admin/preorders/metrics?from=${today.slice(0, 8)}01&to=${today}`);
  expect((body as unknown as { subscriptions: number }).subscriptions).toBeGreaterThanOrEqual(1);

  // Nobody waits any more (the only queue entry was bought): the tab says so.
  await page.goto("/preorders?tab=demand");
  await expect(page.getByText("Пока никто не ждёт")).toBeVisible();

  // The finished batch sits under «Приехали».
  await page.getByRole("tab", { name: "Приехали" }).click();
  await expect(page.getByRole("link", { name: new RegExp(TITLE) })).toBeVisible();
  expect(failed).toEqual([]);
});
