/**
 * Probe: does any overlay of the admin leave the page untappable on an iPhone?
 *
 * Two admins (Safari on iOS, sometimes the installed app) report that the admin «freezes and stops responding
 * to taps until you re-enter». A known class of that bug: the exit of an AnimatePresence child never completes
 * (framer-motion 11) and the invisible full-screen layer stays on top swallowing every tap (fixed for Modal
 * only — ModalLayer in packages/ui/src/overlay/Modal.tsx).
 *
 * Runs in the `ios` project only (WebKit + iPhone 15 profile, touch), which exists only with IOS_REPRO=1
 * (CI installs Chromium alone):  IOS_REPRO=1 node scripts/run.mjs --keep --project=ios 99-ios-overlays
 * Part 2 fails today on purpose: it is the regression check for the shared exit guard. After every scenario `expectTappable`
 * checks the page: no visible full-screen fixed layer that takes pointer events, the body is not scroll-locked,
 * `elementFromPoint` on the tab bar hits the tab bar, and a real tap on a tab navigates. Findings go to
 * tg-shop-v2/_logs/ios-repro-findings.jsonl, screenshots of failures to tg-shop-v2/_shots/ios-repro/.
 *
 * Part 2 («exit hang») pauses the page clock (requestAnimationFrame stops, so every framer JS animation
 * freezes mid-exit, as an exit that never completes would) and checks which closed layers still catch taps.
 *
 * Nothing here changes data: sheets are closed with «Отмена»/×/backdrop, the period preset lives in the URL.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { API_URL, E2E_DIR } from "../env.js";
import { CUSTOMER, ORDER } from "../lib/seed";
import { expect, test as base } from "../lib/test";

/**
 * WebKit reports the router prefetches that a navigation aborts as unhandled rejections («… due to access
 * control checks»): noise here, not an app error. Everything else still fails the test (and is recorded).
 */
const test = base.extend<{ failOnPageErrors: void }>({
  failOnPageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (/due to access control checks/.test(e.message)) return;
      // Offline on purpose: failed chunk / fetch loads are the point of that scenario (recorded, not fatal).
      if (test.info().title.startsWith("offline") && /Load failed|_next\/static/.test(e.message)) return;
      errors.push(e.message);
    });
    await use();
    expect(errors, "uncaught errors in the page").toEqual([]);
  },
});

const SHOP_ROOT = path.resolve(E2E_DIR, "..", "..", "..");
const SHOTS = path.join(SHOP_ROOT, "_shots", "ios-repro");
const FINDINGS = path.join(SHOP_ROOT, "_logs", "ios-repro-findings.jsonl");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.dirname(FINDINGS), { recursive: true });

const TABBAR = 'nav[aria-label="Главные разделы"]';
const DELAYS = [0, 16, 50, 120, 200];

interface ElInfo {
  tag: string;
  cls: string;
  head: string;
  style: string | null;
  opacity: string;
  visibility: string;
  pointerEvents: string;
  zIndex: string;
}

interface Inspection {
  url: string;
  blockers: ElInfo[];
  center: ElInfo | null;
  atTab: ElInfo | null;
  tabOk: boolean;
  bodyOverflow: string;
  kbOpen: boolean;
  inert: string[];
  dialogs: number;
  historyLength: number;
  historyMarkers: string[];
}

/** What the page looks like for a finger right now (runs in the page). */
function inspect(page: Page): Promise<Inspection> {
  return page.evaluate((tabbar) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const info = (el: Element | null) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        cls: String((el as HTMLElement).className ?? "").slice(0, 200),
        head: el.outerHTML.slice(0, 300),
        style: el.getAttribute("style"),
        opacity: cs.opacity,
        visibility: cs.visibility,
        pointerEvents: cs.pointerEvents,
        zIndex: cs.zIndex,
      };
    };
    const blockers = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" || cs.display === "none") continue;
      if (cs.pointerEvents === "none" || cs.visibility !== "visible") continue;
      if (el.closest("[inert]") || el.closest(tabbar) || el.closest("[data-app-chrome]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < vw * vh * 0.5) continue;
      blockers.push(info(el)!);
    }
    const tab = document.querySelector(`${tabbar} a`);
    const tr = tab?.getBoundingClientRect();
    const atTab = tr ? document.elementFromPoint(tr.x + tr.width / 2, tr.y + tr.height / 2) : null;
    const visibleDialogs = Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"]')).filter((d) => {
      const r = d.getBoundingClientRect();
      const cs = getComputedStyle(d);
      return r.width > 0 && r.height > 0 && cs.visibility === "visible" && !d.closest("[inert]") && d.getAttribute("aria-hidden") !== "true";
    });
    return {
      url: location.pathname + location.search,
      blockers,
      center: info(document.elementFromPoint(vw / 2, vh / 2)),
      atTab: info(atTab),
      tabOk: !!atTab && !!atTab.closest(tabbar),
      bodyOverflow: document.body.style.overflow,
      kbOpen: document.documentElement.classList.contains("kb-open"),
      inert: Array.from(document.querySelectorAll("[inert]")).map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).slice(0, 60)}`),
      dialogs: visibleDialogs.length,
      historyLength: history.length,
      historyMarkers: Object.keys(history.state ?? {}).filter((k) => k.startsWith("__")),
    };
  }, TABBAR);
}

function record(entry: Record<string, unknown>) {
  fs.appendFileSync(FINDINGS, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

function slug(s: string) {
  return s.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 80);
}

/**
 * The page must answer a finger: nothing invisible on top, body scrolls, a tap on the tab bar navigates.
 * `settle` covers every exit animation here (0.16–0.24 s and springs).
 */
async function expectTappable(page: Page, label: string, settle = 900) {
  await page.waitForTimeout(settle);
  const r = await inspect(page);
  const target = r.url.startsWith("/inbox") ? { name: "Заказы", url: /localhost:\d+\/(\?.*)?$/ } : { name: "Внимание", url: /\/inbox/ };
  let tapError: string | null = null;
  try {
    await page.locator(TABBAR).getByRole("link", { name: target.name }).tap({ trial: true, timeout: 2000 });
  } catch (e) {
    tapError = String((e as Error).message).split("\n").filter((l) => /intercepts|Timeout/.test(l)).slice(0, 3).join(" | ");
  }
  const bad = r.blockers.length > 0 || !r.tabOk || r.bodyOverflow === "hidden" || r.dialogs > 0 || r.kbOpen || tapError !== null;
  record({ test: test.info().title, repeat: test.info().repeatEachIndex, label, ok: !bad, tapError, ...r });
  if (bad) await page.screenshot({ path: path.join(SHOTS, `${slug(test.info().title)}-${slug(label)}-r${test.info().repeatEachIndex}.png`) });

  expect(r.blockers, `${label}: invisible full-screen layer catches taps`).toEqual([]);
  expect(r.dialogs, `${label}: a dialog is still on screen`).toBe(0);
  expect(r.bodyOverflow, `${label}: body scroll stays locked`).not.toBe("hidden");
  expect(r.kbOpen, `${label}: html.kb-open left on (tab bar hidden)`).toBe(false);
  expect(tapError, `${label}: tab bar tap`).toBeNull();
  expect(r.tabOk, `${label}: elementFromPoint on the tab bar`).toBe(true);
  // A real tap goes through.
  await page.locator(TABBAR).getByRole("link", { name: target.name }).tap({ timeout: 3000 });
  await expect(page).toHaveURL(target.url);
}

/** In the page: click `first`, wait `delay` ms, click `second` — without Playwright's actionability waits. */
async function raceClicks(page: Page, first: string, second: string, delay: number) {
  await page.evaluate(
    async ({ first, second, delay }) => {
      const q = (s: string) => {
        const el = document.querySelector<HTMLElement>(s);
        if (!el) throw new Error(`not found: ${s}`);
        return el;
      };
      q(first).click();
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      q(second).click();
    },
    { first, second, delay }
  );
}

const TAB_INBOX = `${TABBAR} a[href="/inbox"]`;
const TAB_ORDERS = `${TABBAR} a[href="/"]`;
const DIALOG_CLOSE = '[role="dialog"] button[aria-label="Закрыть"]';

/** The board on a phone → «Новый» → the chat order's card → its drawer. */
async function openOrderFromBoard(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Новый.*\d+$/ }).tap();
  await page.getByText(CUSTOMER.chat, { exact: true }).first().tap();
  const drawer = page.getByRole("dialog").filter({ hasText: CUSTOMER.chat }).first();
  await expect(drawer).toBeVisible();
  await page.waitForTimeout(500);
  return drawer;
}

async function openPeriodSheet(page: Page) {
  await page.getByRole("button", { name: /^Период:/ }).tap();
  const sheet = page.getByRole("dialog").filter({ hasText: "Применяется к" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    if (!/due to access control checks/.test(e.message)) record({ test: test.info().title, pageerror: e.message });
  });
});

test.describe("1. real flows", () => {
  test("board: period sheet — preset, backdrop during the open animation, close + tab", async ({ page }) => {
    await page.goto("/");
    const sheet = await openPeriodSheet(page);
    await sheet.getByRole("button", { name: "7 дней" }).tap();
    await expectTappable(page, "preset picked");

    // Backdrop tapped while the sheet is still sliding up (it starts at once, no actionability wait).
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Период:/ })).toBeVisible();
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLElement>("button")).find((b) => b.getAttribute("aria-label")?.startsWith("Период:"));
      btn!.click();
      requestAnimationFrame(() => document.querySelector<HTMLElement>('div.fixed.inset-0.z-\\[160\\] > div')?.click());
    });
    await expectTappable(page, "backdrop during open");

    for (const d of DELAYS) {
      await page.goto("/");
      await openPeriodSheet(page);
      // Backdrop close, then a tab while the sheet slides out.
      await raceClicks(page, "div.fixed.inset-0.z-\\[160\\] > div", TAB_INBOX, d);
      await expectTappable(page, `backdrop + tab after ${d}ms`);
    }
  });

  test("board: «Переместить» sheet → «Отклонить» modal → «Отмена»", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Новый.*\d+$/ }).tap();
    await page.getByRole("button", { name: "Переместить" }).first().tap();
    const sheet = page.getByRole("dialog").filter({ hasText: "Переместить" });
    await expect(sheet).toBeVisible();
    const reject = sheet.getByRole("button", { name: /Отклон/ });
    await reject.tap();
    // ActionSheet closes itself and opens the modal in the same click.
    const modal = page.getByRole("dialog").filter({ hasText: /Отклон/ }).last();
    await expect(modal).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Отмена" }).last().tap();
    await expectTappable(page, "move sheet → modal → cancel");
  });

  test("order card from the board: × then a tab within the exit", async ({ page }) => {
    for (const d of DELAYS) {
      await openOrderFromBoard(page);
      await raceClicks(page, DIALOG_CLOSE, TAB_INBOX, d);
      await expectTappable(page, `× + tab after ${d}ms`);
    }
  });

  test("order card: open then a tab while it slides in", async ({ page }) => {
    for (const d of DELAYS) {
      await page.goto("/");
      await page.getByRole("button", { name: /^Новый.*\d+$/ }).tap();
      const card = page.getByText(CUSTOMER.chat, { exact: true }).first();
      await expect(card).toBeVisible();
      await card.evaluate(async (el, { tab, delay }) => {
        (el as HTMLElement).click();
        await new Promise((r) => setTimeout(r, delay));
        document.querySelector<HTMLElement>(tab)!.click();
      }, { tab: TAB_INBOX, delay: d });
      await expectTappable(page, `open + tab after ${d}ms`);
    }
  });

  test("order card: browser Back while it opens and while it is open", async ({ page }) => {
    await openOrderFromBoard(page);
    await page.goBack();
    await expectTappable(page, "back while open");

    await page.goto("/");
    await page.getByRole("button", { name: /^Новый.*\d+$/ }).tap();
    await page.getByText(CUSTOMER.chat, { exact: true }).first().evaluate((el) => {
      (el as HTMLElement).click();
      setTimeout(() => history.back(), 30);
    });
    await expectTappable(page, "back during the open animation");

    // Close with × and press Back right away (the × itself pops the history entry asynchronously).
    await openOrderFromBoard(page);
    await page.evaluate((sel) => {
      document.querySelector<HTMLElement>(sel)!.click();
      history.back();
    }, DIALOG_CLOSE);
    await expectTappable(page, "× + back at once");
  });

  test("order card: «Другие действия» sheet → item with a modal → «Отмена»", async ({ page }) => {
    const drawer = await openOrderFromBoard(page);
    await drawer.getByRole("button", { name: "Другие действия" }).tap();
    const sheet = page.getByRole("dialog").filter({ hasText: /^Заказ #/ });
    await expect(sheet).toBeVisible();
    const items = await sheet.getByRole("button").allInnerTexts();
    record({ test: test.info().title, sheetItems: items });
    // «Отклонить» asks for a reason in a modal — cancelled, nothing changes.
    await sheet.getByRole("button", { name: /Отклонить/ }).first().tap();
    const modal = page.getByRole("dialog").last();
    await expect(modal).toBeVisible();
    await page.waitForTimeout(300);
    await modal.getByRole("button", { name: "Отмена" }).tap();
    await page.waitForTimeout(600);
    // The drawer is still open — close it with ×, then the page must be free.
    await drawer.getByRole("button", { name: "Закрыть" }).tap();
    await expectTappable(page, "more sheet → modal → cancel → ×");
  });

  test("order card: chat tab, type, × with the field focused", async ({ page }) => {
    const drawer = await openOrderFromBoard(page);
    await drawer.getByRole("button", { name: /^Чат/ }).tap();
    const box = drawer.locator("textarea").first();
    await expect(box).toBeVisible();
    await box.tap();
    await box.pressSequentially("Добрий день", { delay: 20 });
    await drawer.getByRole("button", { name: "Закрыть" }).tap();
    await expectTappable(page, "chat × with focus");

    for (const d of DELAYS) {
      const dr = await openOrderFromBoard(page);
      await dr.getByRole("button", { name: /^Чат/ }).tap();
      await dr.locator("textarea").first().focus();
      await raceClicks(page, DIALOG_CLOSE, TAB_INBOX, d);
      await expectTappable(page, `chat focused × + tab after ${d}ms`);
    }
  });

  test("deep link /orders/<id>?tab=chat: × and Back", async ({ page }) => {
    await page.goto(`/orders/${ORDER.chat}?tab=chat`);
    const drawer = page.getByRole("dialog").filter({ hasText: CUSTOMER.chat }).first();
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Закрыть" }).tap();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expectTappable(page, "deep link ×");

    await page.goto(`/orders/${ORDER.chat}`);
    await expect(drawer).toBeVisible();
    await page.goBack().catch(() => undefined);
    await expectTappable(page, "deep link back");
  });

  test("inbox: group → order card → Back, Back", async ({ page }) => {
    await page.goto("/inbox");
    await page.getByRole("button", { name: /^Новые без одобрения/ }).tap();
    const open = page.getByRole("button", { name: "Открыть заказ" }).first();
    await open.tap();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.goBack();
    await page.waitForTimeout(400);
    await page.goBack();
    await expectTappable(page, "inbox back back");

    for (const d of DELAYS) {
      await page.goto("/inbox");
      await page.getByRole("button", { name: /^Новые без одобрения/ }).tap();
      await page.getByRole("button", { name: "Открыть заказ" }).first().tap();
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await raceClicks(page, DIALOG_CLOSE, TAB_ORDERS, d);
      await expectTappable(page, `inbox × + tab after ${d}ms`);
    }
  });

  test("«Ещё» menu: open → section, open → tab", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Ещё — все разделы" }).tap();
    const menu = page.getByRole("dialog", { name: "Все разделы" });
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: /Поддержка/ }).first().tap();
    await expect(page).toHaveURL(/\/support/);
    await expectTappable(page, "menu → support");

    for (const d of DELAYS) {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Ещё — все разделы" })).toBeVisible();
      await page.evaluate(
        async ({ tab, delay }) => {
          Array.from(document.querySelectorAll<HTMLElement>("button")).find((b) => b.getAttribute("aria-label") === "Ещё — все разделы")!.click();
          await new Promise((r) => setTimeout(r, delay));
          document.querySelector<HTMLElement>(tab)!.click();
        },
        { tab: TAB_INBOX, delay: d }
      );
      await expectTappable(page, `menu open + tab after ${d}ms`);
    }
  });

  test("products: filters sheet — × and close + tab", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: /^Фильтры/ }).tap();
    const sheet = page.getByRole("dialog").filter({ hasText: "Фильтры" }).last();
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Закрыть" }).tap();
    await expectTappable(page, "filters ×");

    for (const d of DELAYS) {
      await page.goto("/products");
      await page.getByRole("button", { name: /^Фильтры/ }).tap();
      await expect(page.getByRole("dialog").last()).toBeVisible();
      await raceClicks(page, DIALOG_CLOSE, TAB_INBOX, d);
      await expectTappable(page, `filters × + tab after ${d}ms`);
    }
  });

  test("background and back: visibilitychange / pagehide / pageshow(persisted) mid-exit", async ({ page }) => {
    await page.goto("/");
    await openPeriodSheet(page);
    await page.evaluate(async () => {
      document.querySelector<HTMLElement>("div.fixed.inset-0.z-\\[160\\] > div")!.click();
      const setVis = (v: string) => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => v === "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      };
      setVis("hidden");
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      await new Promise((r) => setTimeout(r, 1500));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      setVis("visible");
    });
    await expectTappable(page, "sheet exit across a synthetic background");

    await openOrderFromBoard(page);
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await page.getByRole("dialog").filter({ hasText: CUSTOMER.chat }).first().getByRole("button", { name: "Закрыть" }).tap();
    await expectTappable(page, "drawer after pageshow");
  });

  test("bfcache: leave with the order card open, come back", async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener("pageshow", (e) => ((window as unknown as { __persisted: boolean }).__persisted = e.persisted));
    });
    await openOrderFromBoard(page);
    await page.goto(`${API_URL}/actuator/health`);
    await page.goBack();
    await page.waitForTimeout(1000);
    const persisted = await page.evaluate(() => (window as unknown as { __persisted?: boolean }).__persisted ?? null);
    const r = await inspect(page);
    record({ test: test.info().title, persisted, afterBack: r });
    const drawer = page.getByRole("dialog").filter({ hasText: CUSTOMER.chat }).first();
    if (await drawer.isVisible()) await drawer.getByRole("button", { name: "Закрыть" }).tap();
    await expectTappable(page, `back from another site (persisted=${persisted})`);
  });

  test("reload with the order card open (iOS discarded the tab/app): Back still closes the next card", async ({ page }) => {
    await openOrderFromBoard(page);
    await page.reload();
    await expect(page.locator(TABBAR)).toBeVisible();
    const afterReload = await inspect(page);
    // Open the card again on the reloaded page, then Back.
    await page.getByRole("button", { name: /^Новый.*\d+$/ }).tap();
    await page.getByText(CUSTOMER.chat, { exact: true }).first().tap();
    await expect(page.getByRole("dialog").filter({ hasText: CUSTOMER.chat }).first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(900);
    const afterBack = await inspect(page);
    let afterClose: Inspection | null = null;
    if (afterBack.dialogs > 0) {
      await page.screenshot({ path: path.join(SHOTS, "reload-stale-marker-back.png") });
      // The card swallowed Back; its × now pops one more entry than it pushed.
      await page.getByRole("dialog").filter({ hasText: CUSTOMER.chat }).first().getByRole("button", { name: "Закрыть" }).tap();
      await page.waitForTimeout(900);
      afterClose = await inspect(page);
    }
    record({ test: test.info().title, afterReload: { markers: afterReload.historyMarkers, dialogs: afterReload.dialogs }, afterBack, afterClose });
    expect(afterBack.dialogs, "Back after a reload must close the order card").toBe(0);
  });

  test("offline: tab while offline, then online again", async ({ page, context }) => {
    // As in the installed app: the service worker controls the page (a fresh context gets it only after a reload).
    await page.goto("/");
    const isControlled = () => page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 10_000 }).then(() => true, () => false);
    if (!(await isControlled())) {
      await page.reload();
      await isControlled();
    }
    await expect(page.locator(TABBAR)).toBeVisible();
    const controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
    await context.setOffline(true);
    // The tab may already be gone if the router fell back to a full navigation.
    await page.locator(TAB_INBOX).tap({ timeout: 5000 }).catch((e: Error) => record({ test: test.info().title, offlineTapError: e.message.split("\n")[0] }));
    await page.waitForTimeout(2500);
    const offlineState = { url: page.url(), title: await page.title(), text: (await page.locator("body").innerText()).slice(0, 200) };
    await context.setOffline(false);
    await page.waitForTimeout(3000);
    const after = { url: page.url(), text: (await page.locator("body").innerText()).slice(0, 200) };
    record({ test: test.info().title, controlled, offlineState, after });
    if (!(await page.locator(TABBAR).isVisible())) await page.reload();
    await expectTappable(page, "after offline → online");
  });
});

/**
 * Exit hang, simulated: the page clock is paused (requestAnimationFrame and timers stop, framer's JS
 * animations freeze mid-exit), the overlay is closed, and we look at what catches a tap at the tab bar.
 * A guarded layer (Modal / MobileMenu) lets the tap through at once; an unguarded one swallows it.
 */
test.describe("2. exit hang (clock paused)", () => {
  async function frozenProbe(page: Page, label: string, close: () => Promise<void>) {
    // Pause first (at the page's own "now" + 0.5 s — it must not be in the past by the time the call lands), then close:
    // React still commits (MessageChannel is not faked), framer's exit starts but never advances.
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 500);
    await close();
    await page.waitForTimeout(800);
    const r = await inspect(page);
    record({ test: test.info().title, label, frozen: true, ok: r.blockers.length === 0 && r.tabOk, ...r });
    if (r.blockers.length > 0 || !r.tabOk) await page.screenshot({ path: path.join(SHOTS, `frozen-${slug(label)}.png`) });
    await page.clock.resume();
    return r;
  }

  for (const kase of [
    {
      name: "ActionSheet (period)",
      open: async (page: Page) => {
        await page.goto("/");
        await openPeriodSheet(page);
      },
      close: "div.fixed.inset-0.z-\\[160\\] > div",
    },
    { name: "Drawer (order card)", open: openOrderFromBoard, close: DIALOG_CLOSE },
    {
      name: "Sheet (products filters)",
      open: async (page: Page) => {
        await page.goto("/products");
        await page.getByRole("button", { name: /^Фильтры/ }).tap();
        await expect(page.getByRole("dialog").last()).toBeVisible();
      },
      close: DIALOG_CLOSE,
    },
    {
      name: "Modal (board move → reject reason)",
      open: async (page: Page) => {
        await page.goto("/");
        await page.getByRole("button", { name: /^Новый.*\d+$/ }).tap();
        await page.getByRole("button", { name: "Переместить" }).first().tap();
        await page.getByRole("dialog").filter({ hasText: "Переместить" }).getByRole("button", { name: /Отклон/ }).tap();
        await page.waitForTimeout(700);
      },
      close: '[role="dialog"] button[aria-label="Закрыть"]',
    },
    {
      name: "MobileMenu («Ещё»)",
      open: async (page: Page) => {
        await page.goto("/");
        await page.getByRole("button", { name: "Ещё — все разделы" }).tap();
        await page.waitForTimeout(600);
      },
      close: 'button[aria-label="Закрыть меню"]',
    },
  ]) {
    test(`frozen exit: ${kase.name}`, async ({ page }) => {
      await page.clock.install();
      await kase.open(page);
      const r = await frozenProbe(page, kase.name, async () => {
        await page.evaluate((sel) => {
          const all = Array.from(document.querySelectorAll<HTMLElement>(sel));
          all[all.length - 1].click();
        }, kase.close);
      });
      // Report, then assert: a closed layer must not catch the tap even while its exit is stuck.
      expect(r.blockers.map((b) => `${b.tag}.${b.cls} z=${b.zIndex} style=${b.style}`), `${kase.name}: frozen exit leaves a tap-catching layer`).toEqual([]);
      expect(r.tabOk, `${kase.name}: tab bar under the finger`).toBe(true);
    });
  }
});
