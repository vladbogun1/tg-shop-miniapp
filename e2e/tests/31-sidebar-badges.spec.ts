/**
 * Menu badges = the numbers on their pages:
 *  - «Внимание» = sum of the group counters on /inbox;
 *  - «Поддержка» = «Ждут ответа» on /support;
 *  - «Отзывы» = «На модерации» on /reviews;
 *  - «Переводы» = «Нужно перевести» + «Устарели» on /translations;
 *  - «Карточки» = «Оформить» + «Проверить» on /cards with the default storefront filter. Regression:
 *    an OLD hidden product with card_status AI_FILLED (seed: «E2E Старый плеер») must not be counted
 *    — the badge used to say 2 while both tabs were empty.
 *  - a folded section shows the sum of its badges.
 * Read-only: no spec state is changed here.
 */
import type { Locator, Page } from "@playwright/test";
import { EXTRA_PRODUCT } from "../lib/seed";
import { expect, test } from "../lib/test";

/** The number in a desktop-menu badge (0 when the badge is not shown). */
async function badge(page: Page, prefix: string): Promise<number> {
  const b = page.getByRole("complementary").first().getByLabel(new RegExp(`^${prefix}: \\d+$`));
  if ((await b.count()) === 0) return 0;
  const label = (await b.first().getAttribute("aria-label")) ?? "";
  return Number(label.match(/(\d+)$/)?.[1]);
}

/** «Оформить 3» — the counter of a segmented / tab control. */
async function counter(loc: Locator): Promise<number> {
  const t = (await loc.innerText()).replace(/\s+/g, " ").trim();
  return Number(t.match(/(\d+)$/)?.[1] ?? 0);
}

test("«Карточки»: бейдж = «Оформить» + «Проверить»; старый скрытый товар от ИИ не считается", async ({ page, api }) => {
  const stats = (await api.raw("get", "/api/admin/cards/stats")).body as { draft: number; aiFilled: number };
  // The old hidden AI_FILLED product exists and is AI_FILLED…
  const exp = await api.raw("get", `/api/admin/cards/export?status=ai_filled&ids=${EXTRA_PRODUCT.oldPlayer}`);
  const items = (Array.isArray(exp.body) ? exp.body : []) as { id: string; active?: boolean }[];
  expect(items.map((i) => i.id)).toContain(EXTRA_PRODUCT.oldPlayer);
  expect(items[0].active).toBe(false);

  await page.goto("/cards");
  await expect(page.getByRole("heading", { name: "Карточки" })).toBeVisible();
  const tab = (name: string) => page.getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });
  await expect(tab("Готово")).toBeVisible();
  const draft = await counter(tab("Оформить"));
  const review = await counter(tab("Проверить"));
  await expect.poll(() => badge(page, "Карточек ждут оформления или проверки")).toBe(draft + review);
  expect(stats.draft + stats.aiFilled, "API stats = вкладки").toBe(draft + review);

  // With «Все, со старыми» the old player appears in «Проверить» — so it is +1 there, not in the badge.
  await page.getByRole("button", { name: "В работе" }).click();
  await page.getByRole("button", { name: "Все, со старыми" }).click();
  await expect.poll(() => counter(tab("Проверить"))).toBe(review + 1);
  await tab("Проверить").click();
  await page.getByLabel("Поиск карточек").fill("E2E Старый плеер");
  await expect(page.getByRole("listitem").filter({ hasText: "E2E Старый плеер" })).toHaveCount(1);
  expect(await badge(page, "Карточек ждут оформления или проверки")).toBe(draft + review);
});

test("«Внимание», «Поддержка», «Отзывы», «Переводы»: бейдж = число на странице", async ({ page, api }) => {
  // Внимание
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Внимание", level: 1 })).toBeVisible();
  const inbox = await api.inbox();
  const headings = page.locator("section").getByRole("heading", { level: 2 });
  await expect(headings.first()).toBeVisible();
  let sum = 0;
  for (const h of await headings.all()) sum += Number(((await h.innerText()).match(/(\d+)\s*$/) ?? [0, 0])[1]);
  expect(sum).toBe(inbox.total);
  await expect.poll(() => badge(page, "Требует внимания")).toBe(inbox.total);

  // Поддержка
  await page.goto("/support");
  const waiting = page.getByRole("button", { name: /^Ждут ответа/ });
  await expect(waiting).toBeVisible();
  const supportApi = ((await api.raw("get", "/api/admin/support/unread-count")).body as { count: number }).count;
  await expect.poll(() => badge(page, "Ждут ответа в поддержке")).toBe(supportApi);
  // The chip hides a zero.
  if (supportApi > 0) await expect.poll(() => counter(waiting)).toBe(supportApi);

  // Отзывы
  await page.goto("/reviews");
  const pending = page.getByRole("button", { name: /^На модерации\s*\d+$/ });
  await expect(pending).toBeVisible();
  const pendingApi = ((await api.raw("get", "/api/admin/reviews?status=PENDING&page=0&size=1")).body as { pendingCount: number })
    .pendingCount;
  await expect.poll(() => counter(pending)).toBe(pendingApi);
  await expect.poll(() => badge(page, "Отзывов на модерации")).toBe(pendingApi);

  // Переводы
  await page.goto("/translations");
  const missing = page.getByRole("tab", { name: /^Нужно перевести/ });
  const stale = page.getByRole("tab", { name: /^Устарели/ });
  await expect(missing).toBeVisible();
  const tr = (await api.raw("get", "/api/admin/translations/stats")).body as { texts?: { missing: number; stale: number } };
  const trApi = (tr.texts?.missing ?? 0) + (tr.texts?.stale ?? 0);
  await expect.poll(() => badge(page, "Нужно перевести")).toBe(trApi);
  await expect.poll(async () => (await counter(missing)) + (await counter(stale)), { timeout: 15_000 }).toBe(trApi);
});

test("свёрнутый раздел меню показывает сумму своих бейджей", async ({ page }) => {
  await page.goto("/inbox");
  const nav = page.getByRole("complementary").first();
  await expect(nav.getByRole("link", { name: /Карточки/ })).toBeAttached();
  const sumCatalog =
    (await badge(page, "Карточек ждут оформления или проверки")) +
    (await badge(page, "Нужно перевести")) +
    (await badge(page, "Отзывов на модерации"));
  // Fold «Каталог» (open by default).
  const section = nav.getByRole("button", { name: /^Каталог/ });
  await section.click();
  await expect(section).toHaveAttribute("aria-expanded", "false");
  if (sumCatalog > 0) await expect(section.getByLabel(`В разделе ждут: ${sumCatalog}`)).toBeVisible();
  else await expect(section.getByLabel(/В разделе ждут/)).toHaveCount(0);
  await section.click();
  await expect(section).toHaveAttribute("aria-expanded", "true");
});
