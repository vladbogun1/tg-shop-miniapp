/**
 * Вход: логин/пароль → код из приложения → админка, и выход. Runs WITHOUT the shared storage state,
 * so it does its own sign-in (and «Выйти» revokes only that token — the one the other specs use
 * stays valid).
 */
import { ADMIN } from "../env.js";
import { expect, test, toast } from "../lib/test";
import { freshCode, wrongCode } from "../lib/totp";

test.use({ storageState: { cookies: [], origins: [] } });

test("вход: неверный пароль не пускает; пароль → код (неверный, затем верный) → админка; «Выйти» возвращает к форме", async ({
  page,
}) => {
  await page.goto("/");
  const login = page.getByLabel("Логин");
  const password = page.getByLabel("Пароль");
  await expect(page.getByText("Вход для администратора магазина")).toBeVisible();

  // Wrong password: an error toast, still on the form, no token stored.
  await login.fill(ADMIN.login);
  await password.fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(toast(page, "Неверный логин или пароль")).toBeVisible();
  await expect(page.getByText("Вход для администратора магазина")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tgshop_admin_jwt"))).toBeNull();

  // Right password: NOT the app yet — the code step.
  await password.fill(ADMIN.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Код из приложения" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tgshop_admin_jwt"))).toBeNull();

  // Wrong code: stays on the step with an error, the field is cleared.
  const code = page.getByLabel("Код из приложения");
  await code.fill(wrongCode(ADMIN.totpSecret)); // 6 digits submit by themselves
  await expect(page.getByText("Неверный код. Код обновляется каждые 30 секунд.")).toBeVisible();
  await expect(code).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("tgshop_admin_jwt"))).toBeNull();

  // Right code: the shell with the menu.
  await code.fill(await freshCode(ADMIN.totpSecret));
  await expect(toast(page, "Вход выполнен")).toBeVisible();
  const nav = page.getByRole("navigation").first();
  await expect(nav.getByRole("link", { name: /Заказы/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tgshop_admin_jwt"))).toBeTruthy();

  // Reload keeps the session.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Заказы", level: 1 })).toBeVisible();

  // «Выйти»: back to the form, token gone, a reload stays logged out.
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tgshop_admin_jwt"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
});
