/**
 * Вход по логину/паролю и выход. Runs WITHOUT the shared storage state, so it does its own login
 * (and «Выйти» revokes only that token — the one the other specs use stays valid).
 */
import { ADMIN } from "../env.js";
import { expect, test, toast } from "../lib/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("вход: неверный пароль не пускает, верный — пускает; «Выйти» возвращает к форме", async ({ page }) => {
  await page.goto("/");
  const login = page.getByLabel("Логин");
  const password = page.getByLabel("Пароль");
  await expect(page.getByText("Вход для администратора магазина")).toBeVisible();

  // Wrong password: an error toast, still on the form, no token stored.
  await login.fill(ADMIN.login);
  await password.fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("button", { name: "Войти" })).toBeEnabled();
  await expect(page.getByText("Вход для администратора магазина")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tgshop_admin_jwt"))).toBeNull();

  // Right password: the shell with the menu.
  await password.fill(ADMIN.password);
  await page.getByRole("button", { name: "Войти" }).click();
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
