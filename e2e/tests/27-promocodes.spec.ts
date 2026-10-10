/**
 * «Промокоды»: limits and reservations shown as the server counts them, create with validation
 * (inline + Russian server errors), edit a used code (warning, new limit), switch off, orders with
 * the code, delete. Checked against GET /api/admin/promocodes and the journal.
 */
import type { Locator, Page } from "@playwright/test";
import { CUSTOMER, METRICS_ORDER, METRICS_USER, ORDER, PROMO, PROMO_OTHER, shortId } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";
import type { Api } from "../lib/api";

interface Promo {
  id: string;
  code: string;
  discountPercent: number | null;
  discountAmountMinor: number | null;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
  reservedCount?: number;
}

async function promos(api: Api): Promise<Promo[]> {
  const res = await api.raw("get", "/api/admin/promocodes");
  expect(res.status).toBe(200);
  return res.body as unknown as Promo[];
}

/**
 * A form field by its label text. The label is not always tied to the input (the edit dialog of a
 * used code renders «Код» / «Макс. использований» without the association), so go by the input id
 * the Input component derives from the label.
 */
function field(scope: Locator, label: string): Locator {
  return scope.locator(`input[id="in-${label.replace(/ /g, "-")}"]`);
}

function promoRow(page: Page, code: string): Locator {
  return page.locator(".card-hover").filter({ has: page.getByText(code, { exact: true }) });
}

test("лимиты и резерв: «слоты в резерве», «лимит исчерпан», заказы с кодом", async ({ page, api }) => {
  const all = await promos(api);
  expect(all.find((p) => p.code === PROMO.reserve.code)).toMatchObject({ usesCount: 1, maxUses: 2, reservedCount: 1 });

  await page.goto("/promocodes");
  await expect(page.getByRole("heading", { name: "Промокоды", level: 1 })).toBeVisible();

  const reserve = promoRow(page, PROMO.reserve.code);
  await expect(reserve).toContainText("10% скидка");
  await expect(reserve).toContainText("Использовано 1 / 2 · резерв 1");
  await expect(reserve).toContainText("слоты в резерве");
  await expect(reserve).toContainText("активен");
  await expect(reserve).not.toContainText("лимит исчерпан");

  const full = promoRow(page, PROMO.full.code);
  await expect(full).toContainText(/−50\s₴/);
  await expect(full).toContainText("Использовано 1 / 1");
  await expect(full).toContainText("лимит исчерпан");
  await expect(full).not.toContainText("слоты в резерве");

  // Orders placed with the code.
  await reserve.getByRole("button", { name: "Заказы с кодом" }).click();
  const order = reserve.getByRole("button", { name: new RegExp(shortId(METRICS_ORDER.m3)) });
  await expect(order).toContainText(METRICS_USER.stepan.name);
  await expect(order).toContainText(/−70\s₴/);
  await order.click();
  await expect(page.getByRole("dialog").filter({ hasText: shortId(METRICS_ORDER.m3) }).last()).toContainText(
    METRICS_USER.stepan.name
  );
});

test("создать с проверками, изменить использованный, выключить, удалить", async ({ page, api }) => {
  await page.goto("/promocodes");
  await page.getByRole("button", { name: "Новый промокод" }).first().click();
  let dlg = dialog(page, "Новый промокод");
  const save = dlg.getByRole("button", { name: "Сохранить" });

  // Empty code / empty percent are refused with a clear message, nothing is created.
  await save.click();
  await expect(toast(page, "Укажите код")).toBeVisible();
  await field(dlg, "Код").fill("e2e15");
  await expect(field(dlg, "Код")).toHaveValue("E2E15");
  await save.click();
  await expect(toast(page, "Укажите процент")).toBeVisible();
  await field(dlg, "Скидка, %").fill("150");
  await expect(dlg.getByText("Целое число от 1 до 100")).toBeVisible();
  await field(dlg, "Скидка, %").fill("15");
  await expect(dlg.getByText("Целое число от 1 до 100")).toHaveCount(0);
  await field(dlg, "Макс. использований").fill("3");

  // A code that exists already: the server's refusal, in Russian.
  await field(dlg, "Код").fill(PROMO.full.code);
  await save.click();
  await expect(toast(page, /такой промокод уже есть/)).toBeVisible();
  await expect(dlg).toBeVisible();

  await field(dlg, "Код").fill("E2E15");
  await save.click();
  await expect(toast(page, "Сохранено")).toBeVisible();
  await expect(dlg).toBeHidden();
  const row = promoRow(page, "E2E15");
  await expect(row).toContainText("15% скидка");
  await expect(row).toContainText("Использовано 0 / 3");
  let created = (await promos(api)).find((p) => p.code === "E2E15")!;
  expect(created).toMatchObject({ discountPercent: 15, maxUses: 3, usesCount: 0, active: true });

  // Fixed amount + switched off.
  await row.getByRole("button", { name: "Редактировать" }).click();
  dlg = dialog(page, "Редактировать промокод");
  await expect(dlg.getByText(/Код уже применили/)).toHaveCount(0);
  await dlg.getByRole("button", { name: "₴ фиксированная" }).click();
  await field(dlg, "Скидка, ₴").fill("75");
  await dlg.getByRole("switch", { name: "Активен" }).click();
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Сохранено")).toBeVisible();
  await expect(row).toContainText(/−75\s₴/);
  await expect(row).toContainText("выключен");
  created = (await promos(api)).find((p) => p.code === "E2E15")!;
  expect(created.active).toBe(false);
  expect(created.discountAmountMinor).toBe(7500);
  expect(created.discountPercent ?? 0).toBe(0);

  // A used code warns that old orders keep their discount; a lower limit makes it exhausted.
  await promoRow(page, PROMO.reserve.code).getByRole("button", { name: "Редактировать" }).click();
  dlg = dialog(page, "Редактировать промокод");
  await expect(dlg).toContainText("Код уже применили 1 раз");
  await field(dlg, "Макс. использований").fill("1");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await expect(toast(page, "Сохранено")).toBeVisible();
  await expect(promoRow(page, PROMO.reserve.code)).toContainText("лимит исчерпан");
  await expect(promoRow(page, PROMO.reserve.code)).toContainText("Использовано 1 / 1");
  expect((await promos(api)).find((p) => p.code === PROMO.reserve.code)!.maxUses).toBe(1);

  // Delete.
  await row.getByRole("button", { name: "Удалить" }).click();
  const confirm = dialog(page, "Удалить промокод?");
  await expect(confirm).toContainText("E2E15");
  await confirm.getByRole("button", { name: "Удалить" }).click();
  await expect(toast(page, "Промокод удалён")).toBeVisible();
  await expect(row).toHaveCount(0);
  expect((await promos(api)).some((p) => p.code === "E2E15")).toBe(false);

  const actions = (await api.audit("&entityType=PROMO")).map((e) => e.action);
  expect(actions).toEqual(expect.arrayContaining(["PROMO_CREATE", "PROMO_UPDATE", "PROMO_DELETE"]));
});

/** A tab of the page with its counter: «Наши 2». */
function tab(page: Page, label: string): Locator {
  return page.getByRole("main").getByRole("button", { name: new RegExp(`^${label}\\s*\\d+$`) });
}

test("вкладки «Наши / Персональные скидки / За отзывы»: счётчики, ручные скидки, фильтр «Действуют», ?tab=", async ({ page, api }) => {
  const byOrigin = async (o: string) => {
    const res = await api.raw("get", `/api/admin/promocodes?origin=${o}`);
    expect(res.status).toBe(200);
    return (res.body as unknown as Promo[]).map((p) => p.code);
  };
  const ours = await byOrigin("OURS");
  const personal = await byOrigin("PERSONAL");
  const review = await byOrigin("REVIEW");
  expect(ours).toEqual(expect.arrayContaining([PROMO.reserve.code, PROMO.full.code]));
  expect(ours).not.toContain(PROMO_OTHER.personal);
  expect(personal).toEqual([PROMO_OTHER.personal]);
  expect(review).toEqual([PROMO_OTHER.bonus]);
  const manual = await api.raw("get", "/api/admin/promocodes/manual-discounts");
  expect(manual.status).toBe(200);
  const manualRows = manual.body as unknown as { id: string }[];
  expect(manualRows.map((m) => m.id)).toContain(METRICS_ORDER.m5);

  await page.goto("/promocodes");
  await expect(tab(page, "Наши")).toHaveText(new RegExp(`${ours.length}$`));
  await expect(tab(page, "Персональные скидки")).toHaveText(new RegExp(`${personal.length + manualRows.length}$`));
  await expect(tab(page, "За отзывы")).toHaveText(new RegExp(`${review.length}$`));
  // «Наши» (default) shows only shared codes.
  await expect(promoRow(page, PROMO.reserve.code)).toBeVisible();
  await expect(promoRow(page, PROMO_OTHER.personal)).toHaveCount(0);
  await expect(promoRow(page, PROMO_OTHER.bonus)).toHaveCount(0);

  // «Действуют» hides the exhausted code, «Не действуют» shows only it.
  // (Compared with the API's own view of each code, so the edits of the spec above do not matter.)
  const live = (await promos(api)).filter((p) => ours.includes(p.code) && p.active && !(p.maxUses && p.usesCount >= p.maxUses));
  await page.getByRole("button", { name: "Действуют", exact: true }).click();
  await expect(promoRow(page, PROMO.full.code)).toHaveCount(0);
  for (const p of live) await expect(promoRow(page, p.code)).toBeVisible();
  await page.getByRole("button", { name: "Не действуют", exact: true }).click();
  await expect(promoRow(page, PROMO.full.code)).toBeVisible();
  for (const p of live) await expect(promoRow(page, p.code)).toHaveCount(0);
  await page.getByRole("button", { name: "Все", exact: true }).click();

  // Search inside the tab.
  await page.getByLabel("Поиск промокода").fill("reserve");
  await expect(promoRow(page, PROMO.reserve.code)).toBeVisible();
  await expect(promoRow(page, PROMO.full.code)).toHaveCount(0);
  await page.getByLabel("Поиск промокода").fill("");

  // «Персональные скидки»: the customer's code + the manual discount block; the tab is in the URL.
  await tab(page, "Персональные скидки").click();
  await expect(page).toHaveURL(/tab=personal/);
  const personalRow = promoRow(page, PROMO_OTHER.personal);
  await expect(personalRow).toContainText("личный");
  await expect(page.getByText(`Ручные скидки в заказах · ${manualRows.length}`)).toBeVisible();
  await expect(page.getByRole("main")).toContainText(shortId(METRICS_ORDER.m5));
  await page.reload();
  await expect(promoRow(page, PROMO_OTHER.personal)).toBeVisible();

  // «За отзывы»: the bonus code, marked as such.
  await tab(page, "За отзывы").click();
  await expect(page).toHaveURL(/tab=review/);
  await expect(promoRow(page, PROMO_OTHER.bonus)).toContainText("бонус за отзыв");
  await expect(page.getByText(/Выдано 1, использовано 0/)).toBeVisible();
  await expect(promoRow(page, PROMO.reserve.code)).toHaveCount(0);
});

test("«Скидка на заказ»: в выборе только действующие «Наши» коды (без чужих личных и бонусов)", async ({ page, api }) => {
  const live = (await promos(api)).filter(
    (p) => p.active && !(p.maxUses && p.usesCount >= p.maxUses) && !(p as { ownerUserId?: number | null }).ownerUserId
  );
  const drawer = await openOrderFromBoard(page, ORDER.stale, CUSTOMER.stale);
  await drawer.getByRole("button", { name: "Скидка", exact: true }).click();
  const dlg = dialog(page, "Скидка на заказ");
  await expect(dlg).toBeVisible();
  const codeButtons = dlg.getByRole("button").filter({ hasText: /^E2E/ });
  for (const p of live.filter((x) => x.code.startsWith("E2E"))) await expect(dlg.getByRole("button", { name: new RegExp(`^${p.code}`) })).toBeVisible();
  await expect(codeButtons).toHaveCount(live.filter((x) => x.code.startsWith("E2E")).length);
  // Exhausted, someone else's personal code, a review bonus: not offered.
  for (const code of [PROMO.full.code, PROMO_OTHER.personal, PROMO_OTHER.bonus]) {
    await expect(dlg.getByRole("button", { name: new RegExp(`^${code}`) })).toHaveCount(0);
  }
  await expect(dlg.getByText("Личные коды этого клиента")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
});
