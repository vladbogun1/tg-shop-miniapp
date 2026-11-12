/**
 * Проверка находок аудита админки 2026-11-09 (`AUDIT_SHOTS=1`, иначе пропускается — в CI не идёт): экраны на 7 ширинах
 * без бокового скролла страницы, липкие строки не заходят под шапку, «Поставки», страница поставки и «Подарок» не тянут весь каталог.
 * Снимки — `_shots/audit-*.png`, находки вёрстки — в `qa-layout.jsonl`.
 */
import path from "node:path";
import type { Page } from "@playwright/test";
import { REPO_ROOT } from "../env.js";
import { checkLayout, heightFor, shotWidths } from "../lib/layout-qa";
import { PREORDER } from "../lib/seed";
import { dialog, expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = shotWidths([320, 360, 390, 768, 1024, 1280, 1440]);
const PAGES = ["/", "/dispatch", "/support", "/users", "/products", "/promocodes", "/gift", "/metrics", "/preorders", "/cards", "/inbox", "/incidents", "/settings", "/settings/delivery", "/settings/payment"];

test.skip(!process.env.AUDIT_SHOTS, "только по AUDIT_SHOTS=1");
test.setTimeout(600_000);

const slug = (p: string) => p.replace(/\W+/g, "_").replace(/^_|_$/g, "") || "root";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(300);
}

/** Низ шапки и верх липкого элемента после прокрутки: элемент не должен уходить под шапку. */
async function stickyGap(page: Page, selector: string): Promise<number | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const hdr = getComputedStyle(document.documentElement).getPropertyValue("--hdr-h");
    if (!el || !hdr) return null;
    return Math.round(el.getBoundingClientRect().top - parseFloat(hdr));
  }, selector);
}

test("экраны аудита на 7 ширинах: без бокового скролла", async ({ page }) => {
  const scroll: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: heightFor(w) });
    for (const p of PAGES) {
      await page.goto(p);
      await settle(page);
      await page.screenshot({ path: path.join(SHOTS, `audit-${w}-${slug(p)}.png`), fullPage: true });
      const issues = await checkLayout(page, `audit-${slug(p)}-${w}`);
      if (issues.some((i) => i.kind === "page-scroll")) scroll.push(`${p} @${w}`);
    }
  }
  expect(scroll, "страница едет вбок").toEqual([]);
});

test("«Поставки», страница поставки и «Подарок» — без выгрузки всего каталога", async ({ page }) => {
  const heavy: string[] = [];
  const byIds: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/admin/products/by-ids") byIds.push(u.search);
    if (u.pathname === "/api/admin/products" || (u.pathname === "/api/admin/cards/export" && !u.searchParams.has("ids"))) heavy.push(u.pathname + u.search);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/preorders");
  await settle(page);
  expect(heavy, "список поставок").toEqual([]);

  // Страница поставки: товары строк — запросом «по id» (значки и правка на месте), не всем каталогом.
  const first = page.locator('a[href^="/preorders/"]').filter({ hasNotText: "Черновик" }).first();
  if (await first.count()) {
    await first.click();
    await settle(page);
    expect(heavy, "страница поставки").toEqual([]);
    expect(byIds.length, "товары строк по id").toBeGreaterThan(0);
    await expect(page.getByText(/^(на сайте|скрыт|в архиве)$/).first(), "чип состояния товара").toBeVisible();
    const edit = page.getByRole("button", { name: "Редактировать товар" }).first();
    if (await edit.count()) {
      await edit.click();
      await expect(page.getByRole("dialog").first(), "окно товара").toBeVisible();
      await page.screenshot({ path: path.join(SHOTS, "audit-batch-edit-1440.png") });
      expect(heavy, "окно товара на странице поставки").toEqual([]);
      await page.keyboard.press("Escape");
    }
  }

  // «Подарок»: поле товара-подарка и «!» в сводке берут один товар по id.
  await page.goto("/gift");
  await settle(page);
  await page.screenshot({ path: path.join(SHOTS, "audit-gift-field-1440.png"), fullPage: true });
  await expect(page.getByText("Загрузка…"), "поле подарка дорисовалось").toHaveCount(0);
  expect(heavy, "подарок").toEqual([]);

  // Поле «Товар-подарок»: выбор через окно (ему каталог нужен), потом поле показывает товар из запроса «по id».
  await page.getByRole("button", { name: /Настройки/ }).first().click();
  await expect(page.getByText(/^(Запасной товар-подарок|Товар-подарок)$/).first()).toBeVisible();
  await expect(page.getByText("Загрузка…"), "поле подарка без товара").toHaveCount(0);
  expect(heavy, "настройки подарка").toEqual([]);
  await page.getByRole("button", { name: /^(Выбрать|Другой)$/ }).first().click();
  const option = page.getByRole("dialog").locator("button.card-2").first();
  const title = ((await option.locator("span.font-semibold").first().textContent()) ?? "").trim();
  byIds.length = 0;
  await option.click();
  await expect(page.getByText(title, { exact: true }).first(), "товар в поле подарка").toBeVisible();
  expect(byIds.length, "поле подарка спросило товар по id").toBeGreaterThan(0);
  await page.screenshot({ path: path.join(SHOTS, "audit-gift-picked-1440.png"), fullPage: true });
});

test("едущая поставка на 320: «⋯» в одной строке с главной кнопкой", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/preorders");
  await page.getByRole("button", { name: "Новая поставка" }).first().click();
  const form = dialog(page, "Новая поставка");
  await form.getByLabel("Название (для себя)").fill("Аудит: шапка на телефоне");
  await form.getByRole("button", { name: "Добавить товар" }).click();
  const pick = dialog(page, "Товар в поставку");
  await pick.getByLabel("Поиск товара").fill(PREORDER.productTitle);
  await pick.getByRole("button", { name: new RegExp(PREORDER.productTitle) }).click();
  await form.getByLabel("Заказано, шт").fill("1");
  await form.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page).toHaveURL(/\/preorders\/\d+$/);

  await page.setViewportSize({ width: 320, height: 812 });
  await settle(page);
  await page.screenshot({ path: path.join(SHOTS, "audit-batch-320.png"), fullPage: true });
  const main = await page.getByRole("button", { name: /Приехала/ }).boundingBox();
  const more = await page.getByRole("button", { name: "Ещё действия" }).boundingBox();
  expect(main && more, "обе кнопки видны").toBeTruthy();
  expect(Math.abs((main?.y ?? 0) - (more?.y ?? 0)), "«⋯» не уехал на отдельную строку").toBeLessThan(4);
});

test("липкие строки не заходят под шапку", async ({ page }) => {
  // Вкладки «Промокодов» на телефоне.
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/promocodes");
  await settle(page);
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "audit-sticky-promocodes-320.png") });
  const promo = await stickyGap(page, "div.sticky");
  if (promo !== null) expect(promo, "вкладки промокодов под шапкой").toBeGreaterThanOrEqual(-1);

  // «Шансы по редкостям» в «Кейсе» на ПК.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/gift");
  await settle(page);
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "audit-sticky-gift-1440.png") });
  const gift = await stickyGap(page, ".lg\\:sticky");
  if (gift !== null) expect(gift, "колонка кейса под шапкой").toBeGreaterThanOrEqual(-1);
});
