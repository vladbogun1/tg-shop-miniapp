/**
 * «Админы» (этап 2): главный приглашает (бот выключен → ссылка), приглашённый проходит /invite
 * (логин, пароль, 2FA) и входит; обычный админ не видит раздел и получает 403; сброс 2FA → настройка
 * заново; блокировка → вход невозможен, открытая сессия выкинута; нельзя заблокировать себя и
 * понизить последнего главного. The page acts as the main e2e admin (storage state); the ordinary
 * admin is «e2e-team» (lib/admins.ts).
 */
import { request, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { ADMIN, ADMIN_URL, API_URL, INVITED_TG_BASE, TEAM_ADMIN } from "../env.js";
import { savedToken } from "../lib/api";
import { dialog, expect, test, toast } from "../lib/test";
import { codeAt, freshCode, stepNow } from "../lib/totp";

/** e2e-team's current authenticator secret (a 2FA reset below gives it a new one). */
let teamSecret = TEAM_ADMIN.totpSecret;

async function api(token = savedToken()): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

/** Password + code (or first-time setup) for e2e-team, through the API; returns the access token. */
async function signInTeam(): Promise<string> {
  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const first = await ctx.post("/api/auth/admin/login", { data: { username: TEAM_ADMIN.login, password: TEAM_ADMIN.password } });
    expect(first.ok(), await first.text()).toBe(true);
    const body = (await first.json()) as { status: string; preAuthToken: string };
    if (body.status === "SETUP_REQUIRED") {
      const setup = await ctx.post("/api/auth/admin/2fa/setup", { data: { preAuthToken: body.preAuthToken } });
      teamSecret = ((await setup.json()) as { secret: string }).secret;
      const done = await ctx.post("/api/auth/admin/2fa/confirm", {
        data: { preAuthToken: body.preAuthToken, code: await freshCode(teamSecret), trustDevice: false },
      });
      expect(done.ok(), await done.text()).toBe(true);
      return ((await done.json()) as { accessToken: string }).accessToken;
    }
    expect(body.status).toBe("TOTP_REQUIRED");
    const done = await ctx.post("/api/auth/admin/2fa/verify", {
      data: { preAuthToken: body.preAuthToken, code: await freshCode(teamSecret), trustDevice: false },
    });
    expect(done.ok(), await done.text()).toBe(true);
    return ((await done.json()) as { accessToken: string }).accessToken;
  } finally {
    await ctx.dispose();
  }
}

/** A separate browser signed in with `token` (what the admin keeps in localStorage). */
async function pageWithToken(browser: Browser, token: string | null): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: ADMIN_URL,
    locale: "ru-RU",
    storageState: {
      cookies: [],
      origins: token ? [{ origin: ADMIN_URL, localStorage: [{ name: "tgshop_admin_jwt", value: token }] }] : [],
    },
  });
  return ctx.newPage();
}

function adminRow(page: Page, id: number) {
  return page.locator(`tr[data-admin="${id}"]`);
}

/** Opens the «⋯» menu of an admin row and picks an item. */
async function rowAction(page: Page, id: number, name: string, item: string): Promise<void> {
  await adminRow(page, id).getByRole("button", { name: `Действия: ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("главный приглашает (бот выключен → ссылка), приглашённый задаёт логин, пароль, 2FA и входит", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const tgId = INVITED_TG_BASE + 1;
  let url = "";

  await test.step("«Пригласить админа»: Telegram id вручную, имя, роль, свой код", async () => {
    await page.goto("/admins");
    await expect(page.getByRole("heading", { name: "Админы", level: 1 })).toBeAttached();
    await page.getByRole("button", { name: "Пригласить админа" }).click();
    const dlg = dialog(page, "Пригласить админа");
    await dlg.getByRole("button", { name: "Ввести id вручную" }).click();
    await dlg.getByLabel("Telegram id").fill(String(tgId));
    await dlg.getByLabel("Имя в админке").fill("E2E Приглашённый");
    await dlg.locator("#invite-code").fill(await freshCode(ADMIN.totpSecret));
    await dlg.getByRole("button", { name: "Пригласить", exact: true }).click();

    // No bot in e2e: the link comes back to the main admin, with a copy button and a warning.
    const linkDlg = dialog(page, "Бот не смог написать");
    await expect(linkDlg).toBeVisible();
    url = await linkDlg.getByLabel("Ссылка-приглашение").inputValue();
    expect(url).toMatch(new RegExp(`^${ADMIN_URL}/invite/[A-Za-z0-9_-]{43}$`));
    await expect(linkDlg.getByRole("button", { name: "Копировать" })).toBeVisible();
    await expect(linkDlg).toContainText("Передавайте только лично");
    await linkDlg.getByRole("button", { name: "Готово" }).click();
    await expect(page.locator(`tr[data-invite="${tgId}"]`)).toContainText("Приглашён до");
  });

  await test.step("/invite без входа: логин, пароль, QR → код → в админке", async () => {
    const guest = await pageWithToken(browser, null);
    await guest.goto(url);
    await expect(guest.getByRole("heading", { name: "Приглашение" })).toBeVisible();
    await guest.getByLabel(/^Логин/).fill("e2e-invited");
    await guest.getByLabel(/^Пароль/).fill("invited-pass-12345");
    await guest.getByLabel(/^Повторите пароль/).fill("invited-pass-12345");
    await guest.getByRole("button", { name: "Дальше" }).click();

    await expect(guest.getByRole("heading", { name: "Защита входа" })).toBeVisible();
    const secret = (await guest.getByLabel("Секретный ключ").getAttribute("data-secret"))!;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    await guest.getByLabel("Код из приложения").fill(codeAt(secret, stepNow()));
    await expect(guest.getByRole("heading", { name: "Заказы", level: 1 })).toBeAttached();
    // An ordinary admin: no «Админы» in the menu.
    await expect(guest.getByRole("link", { name: "Мой аккаунт" }).first()).toBeVisible();
    await expect(guest.getByRole("link", { name: "Админы" })).toHaveCount(0);

    // The link is single-use.
    const again = await pageWithToken(browser, null);
    await again.goto(url);
    await expect(again.getByRole("heading", { name: "Ссылка не действует" })).toBeVisible();
    await again.context().close();
    await guest.context().close();
  });

  await test.step("в списке — новый админ с логином и 2FA, в журнале — приглашение", async () => {
    await page.reload();
    const row = adminRow(page, tgId);
    await expect(row).toContainText("E2E Приглашённый");
    await expect(row).toContainText("e2e-invited");
    await expect(row).toContainText("2FA");
    await expect(page.locator(`tr[data-invite="${tgId}"]`)).toHaveCount(0);
  });
});

test("обычный админ не видит «Админы» и получает 403 по API", async ({ browser }) => {
  test.setTimeout(90_000);
  const token = await signInTeam();
  const ctx = await api(token);
  try {
    expect((await ctx.get("/api/admin/admins")).status()).toBe(403);
    expect((await ctx.post("/api/admin/admins/invites", { data: { telegramUserId: 123, name: "x", role: "ADMIN", code: "000000" } })).status()).toBe(403);
    expect((await ctx.post(`/api/admin/admins/${ADMIN.id}/block`, { data: { code: "000000" } })).status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
  // The token above was not dropped by the 403s on the API (only the panel reacts to them).
  const page = await pageWithToken(browser, await signInTeam());
  await page.goto("/admins");
  await expect(page.getByText("Только для главного админа")).toBeVisible();
  await expect(page.getByRole("link", { name: "Админы" })).toHaveCount(0);
  await page.context().close();
});

test("сброс 2FA главным → при входе настройка заново", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/admins");
  await rowAction(page, TEAM_ADMIN.id, "E2E Команда", "Сбросить 2FA");
  const dlg = dialog(page, "Сбросить 2FA у «E2E Команда»?");
  await dlg.locator("#admin-action-code").fill("000000");
  await expect(dlg.getByRole("alert")).toContainText("Неверный код");
  await dlg.locator("#admin-action-code").fill(await freshCode(ADMIN.totpSecret));
  await expect(toast(page, "2FA сброшена, сессии завершены")).toBeVisible();
  await expect(adminRow(page, TEAM_ADMIN.id)).toContainText("Без 2FA");

  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const first = await ctx.post("/api/auth/admin/login", { data: { username: TEAM_ADMIN.login, password: TEAM_ADMIN.password } });
    expect(((await first.json()) as { status: string }).status).toBe("SETUP_REQUIRED");
  } finally {
    await ctx.dispose();
  }
  await signInTeam(); // sets 2FA up again with a new secret
  await page.reload();
  await expect(adminRow(page, TEAM_ADMIN.id)).not.toContainText("Без 2FA");
});

test("блокировка: открытая сессия выкинута, вход паролем невозможен", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const token = await signInTeam();
  const victim = await pageWithToken(browser, token);
  await victim.goto("/");
  await expect(victim.getByRole("heading", { name: "Заказы", level: 1 })).toBeAttached();

  await page.goto("/admins");
  await rowAction(page, TEAM_ADMIN.id, "E2E Команда", "Заблокировать");
  const dlg = dialog(page, "Заблокировать «E2E Команда»?");
  await dlg.locator("#admin-action-code").fill(await freshCode(ADMIN.totpSecret));
  await expect(toast(page, "«E2E Команда» заблокирован")).toBeVisible();
  await expect(adminRow(page, TEAM_ADMIN.id)).toContainText("Заблокирован");

  // The open panel loses its session on the next request.
  await victim.reload();
  await expect(victim.getByText("Вход для администратора магазина")).toBeVisible();
  await victim.context().close();

  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const old = await ctx.get("/api/admin/account", { headers: { Authorization: `Bearer ${token}` } });
    expect(old.status()).toBe(401);
    const login = await ctx.post("/api/auth/admin/login", { data: { username: TEAM_ADMIN.login, password: TEAM_ADMIN.password } });
    expect(login.status()).toBe(401);
  } finally {
    await ctx.dispose();
  }
});

test("нельзя заблокировать / сбросить себя, последний главный не понижается", async ({ page }) => {
  await page.goto("/admins");
  const own = adminRow(page, ADMIN.id);
  await expect(own).toContainText("Это вы");
  await expect(own.getByRole("link", { name: "Мой аккаунт" })).toBeVisible();
  await expect(own.getByRole("button", { name: /^Действия/ })).toHaveCount(0);

  // Straight to the API: the rules are the backend's. The guard runs before the code is checked,
  // so a dummy code is enough (a wrong one would be 400 BAD_CODE, not 409).
  const ctx = await api();
  try {
    const forget = await ctx.post(`/api/admin/admins/${ADMIN.id}/forget-devices`);
    expect(forget.status()).toBe(409);
    expect(((await forget.json()) as { code: string }).code).toBe("SELF");

    const block = await ctx.post(`/api/admin/admins/${ADMIN.id}/block`, { data: { code: "000000" } });
    expect(block.status()).toBe(409);
    expect(["SELF", "LAST_SUPER_ADMIN"]).toContain(((await block.json()) as { code: string }).code);

    const demote = await ctx.patch(`/api/admin/admins/${ADMIN.id}`, { data: { role: "ADMIN", code: "000000" } });
    expect(demote.status()).toBe(409);
    expect(((await demote.json()) as { code: string }).code).toBe("LAST_SUPER_ADMIN");

    const account = await ctx.get("/api/admin/account");
    expect(((await account.json()) as { superAdmin: boolean }).superAdmin).toBe(true);
  } finally {
    await ctx.dispose();
  }
});
