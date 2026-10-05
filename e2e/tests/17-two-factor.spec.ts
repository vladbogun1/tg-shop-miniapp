/**
 * Двухфакторный вход: первая настройка 2FA, доверенное устройство, смена пароля в «Мой аккаунт» и
 * то, что токен «первого шага» не открывает API. Each test signs in by itself (no shared storage
 * state) as one of the admins prepared by the global setup (lib/admins.ts).
 */
import { request } from "@playwright/test";
import { API_URL, FRESH_ADMIN, SECOND_ADMIN } from "../env.js";
import { expect, test, toast } from "../lib/test";
import { codeAt, freshCode, stepNow } from "../lib/totp";
import type { Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

async function enterPassword(page: Page, login: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

async function expectInApp(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();
}

test("первый вход без 2FA: QR + ключ + код → 2FA включена, вход выполнен", async ({ page, api }) => {
  await enterPassword(page, FRESH_ADMIN.login, FRESH_ADMIN.password);

  // Only the setup screen — no way into the app without 2FA.
  await expect(page.getByRole("heading", { name: "Защита входа" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR-код для приложения-аутентификатора" })).toBeVisible();
  const secretEl = page.getByLabel("Секретный ключ");
  await expect(secretEl).toBeVisible();
  const secret = (await secretEl.getAttribute("data-secret"))!;
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  // The shown key is grouped by four for typing; the otpauth link carries the same secret.
  await expect(secretEl).toHaveText(secret.replace(/(.{4})/g, "$1 ").trim());
  const link = page.getByRole("link", { name: "Открыть в приложении на этом телефоне" });
  await expect(link).toHaveAttribute("href", new RegExp(`^otpauth://totp/ChiSetup%20Admin:${FRESH_ADMIN.login}\\?secret=${secret}&`));
  await expect(page.getByRole("button", { name: "Копировать" })).toBeVisible();

  // The code from the "app" (computed from the shown key) switches 2FA on and signs in.
  await page.getByLabel("Код из приложения").fill(codeAt(secret, stepNow()));
  await expect(toast(page, "Вход выполнен")).toBeVisible();
  await expectInApp(page);

  // «Мой аккаунт» shows it on, and the journal has the setup.
  await page.goto("/account");
  await expect(page.getByText("Включена", { exact: true })).toBeVisible();
  const entries = await api.audit("&action=ADMIN_2FA_SETUP");
  expect(entries.some((e) => e.entityId === String(FRESH_ADMIN.id))).toBe(true);
});

test("доверенное устройство не спрашивает код; смена пароля завершает доверие и старый пароль", async ({ page }) => {
  await test.step("вход с галочкой «Доверять этому устройству»", async () => {
    await enterPassword(page, SECOND_ADMIN.login, SECOND_ADMIN.password);
    await expect(page.getByRole("heading", { name: "Код из приложения" })).toBeVisible();
    await page.getByRole("switch", { name: "Доверять этому устройству 30 дней" }).click();
    await page.getByLabel("Код из приложения").fill(await freshCode(SECOND_ADMIN.totpSecret));
    await expectInApp(page);
    // The device token is an HttpOnly cookie, invisible to the page's JavaScript.
    const cookie = (await page.context().cookies(`${API_URL}/api/auth/admin/login`)).find((c) => c.name === "admin_device");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(await page.evaluate(() => document.cookie)).not.toContain("admin_device");
  });

  await test.step("после «Выйти» вход по паролю — сразу в админку, без кода", async () => {
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await enterPassword(page, SECOND_ADMIN.login, SECOND_ADMIN.password);
    await expectInApp(page);
  });

  await test.step("«Мой аккаунт»: 1 доверенное устройство, история входов", async () => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Мой аккаунт", level: 1 })).toBeAttached();
    await expect(page.getByText("Доверенных устройств", { exact: true }).locator("..")).toContainText("1");
    const history = page.getByRole("list", { name: "История входов" });
    await expect(history.getByRole("listitem").first()).toContainText("Вход");
    await expect(history).toContainText("доверенное устройство");
  });

  await test.step("смена пароля: неверный код не меняет пароль", async () => {
    await page.getByLabel("Текущий пароль").fill(SECOND_ADMIN.password);
    await page.getByLabel(/^Новый пароль/).fill(SECOND_ADMIN.newPassword);
    await page.getByLabel("Повторите новый пароль").fill(SECOND_ADMIN.newPassword);
    await page.locator("#password-code").fill("000000");
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(toast(page, "Неверный код из приложения")).toBeVisible();
    // Still signed in (a wrong code here is not a lost session).
    await expect(page.getByRole("heading", { name: "Мой аккаунт", level: 1 })).toBeAttached();
  });

  await test.step("смена пароля с верным кодом: остаёмся в админке", async () => {
    await page.locator("#password-code").fill(await freshCode(SECOND_ADMIN.totpSecret));
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(toast(page, "Пароль изменён")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Мой аккаунт", level: 1 })).toBeAttached();
    await expect(page.getByText("Двухфакторная защита").first()).toBeVisible();
  });

  await test.step("старый пароль больше не подходит, новый — снова с кодом (устройство забыто)", async () => {
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await enterPassword(page, SECOND_ADMIN.login, SECOND_ADMIN.password);
    await expect(toast(page, "Неверный логин или пароль")).toBeVisible();
    await page.getByLabel("Пароль").fill(SECOND_ADMIN.newPassword);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("heading", { name: "Код из приложения" })).toBeVisible();
    await page.getByLabel("Код из приложения").fill(await freshCode(SECOND_ADMIN.totpSecret));
    await expectInApp(page);
  });
});

test("токен первого шага не открывает API админки (403), второй шаг без кода не проходит", async () => {
  const ctx = await request.newContext({ baseURL: API_URL });
  try {
    const first = await ctx.post("/api/auth/admin/login", {
      data: { username: FRESH_ADMIN.login, password: FRESH_ADMIN.password },
    });
    expect(first.ok()).toBe(true);
    const body = (await first.json()) as { status: string; preAuthToken: string; accessToken?: string };
    // TOTP_REQUIRED after the first test of this file, SETUP_REQUIRED when run alone.
    expect(["TOTP_REQUIRED", "SETUP_REQUIRED"]).toContain(body.status);
    expect(body.accessToken).toBeUndefined();

    for (const url of ["/api/admin/orders/board?range=month", "/api/admin/account", "/api/admin/ping"]) {
      const res = await ctx.get(url, { headers: { Authorization: `Bearer ${body.preAuthToken}` } });
      expect(res.status(), url).toBe(403);
      expect(((await res.json()) as { code?: string }).code).toBe("TWO_FACTOR_REQUIRED");
    }
    // A SETUP token cannot verify, a VERIFY token without a code is refused — 401 either way.
    const noCode = await ctx.post("/api/auth/admin/2fa/verify", {
      data: { preAuthToken: body.preAuthToken, code: "", trustDevice: false },
    });
    expect(noCode.status()).toBe(401);
    const forged = await ctx.post("/api/auth/admin/2fa/verify", {
      data: { preAuthToken: body.preAuthToken.slice(0, -4) + "AAAA", code: "123456", trustDevice: false },
    });
    expect(forged.status()).toBe(401);
  } finally {
    await ctx.dispose();
  }
});
