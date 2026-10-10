/**
 * «Мой аккаунт» (desktop) and signing out everywhere.
 *  - Profile, password form checks (in Russian), the devices panel; «Выйти на всех устройствах» asks
 *    first and «Отмена» keeps the session. All as the main e2e admin, without changing anything.
 *  - «Выйти везде» (sidebar) as a separate throwaway admin «e2e-exit» (id 5, set up here through
 *    SQL): after it, this browser is back at the form, a second open session is thrown out and its
 *    token gets 401. (Doing it as the main admin would kill the token every other spec uses.)
 */
import { request, type Browser, type Page } from "@playwright/test";
import { ADMIN, ADMIN_2FA_KEY, ADMIN_URL, API_URL, SECOND_ADMIN } from "../env.js";
import { query } from "../lib/db";
import { dialog, expect, test, toast } from "../lib/test";
import { encryptSecret, freshCode } from "../lib/totp";

const EXIT_ADMIN = {
  id: 5,
  login: "e2e-exit",
  // Same password / hash as e2e-second (test values from env.js).
  password: SECOND_ADMIN.password,
  passwordHash: SECOND_ADMIN.passwordHash,
  totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
};

async function setUpExitAdmin(): Promise<void> {
  await query(
    `INSERT INTO admin_users (telegram_user_id, username, password_hash, name, role, active, token_version)
     VALUES (?, ?, ?, 'E2E Выход', 'ADMIN', TRUE, 0)
     ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash), active = TRUE`,
    [EXIT_ADMIN.id, EXIT_ADMIN.login, EXIT_ADMIN.passwordHash]
  );
  await query(
    `UPDATE admin_users SET failed_attempts = 0, locked_until = NULL, totp_last_step = NULL,
       totp_secret_enc = ?, totp_enabled_at = NOW() WHERE telegram_user_id = ?`,
    [encryptSecret(EXIT_ADMIN.totpSecret, EXIT_ADMIN.id, ADMIN_2FA_KEY), EXIT_ADMIN.id]
  );
  await query("DELETE FROM admin_trusted_devices WHERE admin_id = ?", [EXIT_ADMIN.id]);
}

async function signIn(): Promise<string> {
  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const first = await ctx.post("/api/auth/admin/login", { data: { username: EXIT_ADMIN.login, password: EXIT_ADMIN.password } });
    expect(first.ok(), await first.text()).toBe(true);
    const body = (await first.json()) as { status: string; preAuthToken: string };
    expect(body.status).toBe("TOTP_REQUIRED");
    const done = await ctx.post("/api/auth/admin/2fa/verify", {
      data: { preAuthToken: body.preAuthToken, code: await freshCode(EXIT_ADMIN.totpSecret), trustDevice: false },
    });
    expect(done.ok(), await done.text()).toBe(true);
    return ((await done.json()) as { accessToken: string }).accessToken;
  } finally {
    await ctx.dispose();
  }
}

async function pageWithToken(browser: Browser, token: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: ADMIN_URL,
    locale: "ru-RU",
    viewport: { width: 1280, height: 800 },
    storageState: { cookies: [], origins: [{ origin: ADMIN_URL, localStorage: [{ name: "tgshop_admin_jwt", value: token }] }] },
  });
  return ctx.newPage();
}

async function apiStatus(token: string): Promise<number> {
  const ctx = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    return (await ctx.get("/api/admin/account")).status();
  } finally {
    await ctx.dispose();
  }
}

test("«Мой аккаунт»: профиль, проверки формы пароля, устройства; «Выйти на всех устройствах» → «Отмена»", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("complementary").first().getByRole("link", { name: "Мой аккаунт" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Мой аккаунт", level: 1 })).toBeVisible();

  const profile = page.locator("section").filter({ hasText: "Профиль" }).first();
  await expect(profile).toContainText(ADMIN.login);
  await expect(profile).toContainText("Главный админ");
  await expect(profile).toContainText(String(ADMIN.id));

  // Password form: inline checks and a refusal before any request.
  await page.getByLabel(/^Новый пароль/).fill("short");
  await expect(page.getByText("Минимум 10 символов", { exact: true })).toBeVisible();
  await page.getByLabel(/^Повторите новый пароль/).fill("other");
  await expect(page.getByText("Пароли не совпадают")).toBeVisible();
  await page.getByRole("button", { name: "Сменить пароль" }).click();
  await expect(toast(page, "Заполните все поля: новый пароль от 10 символов, повтор и код из приложения")).toBeVisible();

  // 2FA on, no trusted devices → «Забыть все устройства» is off.
  await expect(page.getByText("Включена", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Забыть все устройства" })).toBeDisabled();

  await page.getByRole("button", { name: "Выйти на всех устройствах" }).click();
  const confirm = dialog(page, "Выйти на всех устройствах?");
  await confirm.getByRole("button", { name: "Отмена" }).click();
  await expect(confirm).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Мой аккаунт", level: 1 })).toBeVisible();
});

test("«Выйти везде» в меню: это устройство и второе открытое — на форму входа, старый токен 401", async ({ browser }) => {
  await setUpExitAdmin();
  const tokenA = await signIn();
  const tokenB = await signIn();
  expect(await apiStatus(tokenB)).toBe(200);

  const a = await pageWithToken(browser, tokenA);
  const b = await pageWithToken(browser, tokenB);
  try {
    await a.goto("/");
    await expect(a.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();
    await b.goto("/");
    await expect(b.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();

    const button = a.getByRole("complementary").first().getByRole("button", { name: "Выйти везде" });
    await expect(button).toBeVisible();
    // It is one line next to «Выйти» (not wrapped).
    const box = await button.boundingBox();
    expect(box!.height).toBeLessThan(48);

    // First a «no» in the browser's confirm: nothing happens.
    a.once("dialog", (d) => void d.dismiss());
    await button.click();
    await expect(a.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();
    expect(await apiStatus(tokenA)).toBe(200);

    a.once("dialog", (d) => {
      expect(d.message()).toContain("Выйти на всех устройствах?");
      void d.accept();
    });
    await button.click();
    await expect(a.getByRole("button", { name: "Войти" })).toBeVisible();
    expect(await a.evaluate(() => localStorage.getItem("tgshop_admin_jwt"))).toBeNull();

    // Both tokens are dead; the other browser is thrown out on its next request.
    expect(await apiStatus(tokenA)).toBe(401);
    expect(await apiStatus(tokenB)).toBe(401);
    await b.reload();
    await expect(b.getByRole("button", { name: "Войти" })).toBeVisible();
  } finally {
    await a.context().close();
    await b.context().close();
  }
});
