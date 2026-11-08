/**
 * Проверка находок аудита админки 2026-11-09 (`AUDIT_SHOTS=1`, иначе пропускается — в CI не идёт): экраны на 7 ширинах
 * без бокового скролла страницы, липкие строки не заходят под шапку, «Поставки» не тянут весь каталог.
 * Снимки — `_shots/audit-*.png`, находки вёрстки — в `qa-layout.jsonl`.
 */
import path from "node:path";
import type { Page } from "@playwright/test";
import { REPO_ROOT } from "../env.js";
import { checkLayout, heightFor, shotWidths } from "../lib/layout-qa";
import { expect, test } from "../lib/test";

const SHOTS = path.join(REPO_ROOT, "_shots");
const WIDTHS = shotWidths([320, 360, 390, 768, 1024, 1280, 1440]);
const PAGES = ["/users", "/products", "/promocodes", "/gift", "/metrics", "/preorders", "/cards", "/inbox", "/incidents", "/settings"];

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

test("«Поставки» открываются без выгрузки всего каталога", async ({ page }) => {
  const heavy: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/admin/products" || (u.pathname === "/api/admin/cards/export" && !u.searchParams.has("ids"))) heavy.push(u.pathname + u.search);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/preorders");
  await settle(page);
  expect(heavy, "список поставок").toEqual([]);
  // Страница поставки берёт товары строк из каталога (значки и правка на месте) — эндпоинта «по id» пока нет;
  // проверяем только, что плашки больше не тянут всю выгрузку карточек.
  heavy.length = 0;
  const first = page.locator('a[href^="/preorders/"]').filter({ hasNotText: "Черновик" }).first();
  if (await first.count()) {
    await first.click();
    await settle(page);
  }
  expect(heavy.filter((u) => u.startsWith("/api/admin/cards/export")), "страница поставки").toEqual([]);
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
