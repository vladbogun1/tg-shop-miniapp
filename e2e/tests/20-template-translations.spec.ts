/**
 * Chat reply templates are translated like the rest of the content: the editor opens on Russian
 * (the only required language), uk/en may stay empty, and an empty or outdated translation shows up
 * in «Переводы» → «Все переводы» → «Шаблоны чата», with the template's title as context.
 */
import { CUSTOMER, ORDER } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test } from "../lib/test";

test("шаблон: русский первым, пустые переводы попадают в «Переводы»", async ({ page, api }) => {
  const drawer = await openOrderFromBoard(page, ORDER.chat, CUSTOMER.chat);
  await drawer.getByRole("button", { name: /^Чат/ }).click();
  await drawer.getByRole("button", { name: "Шаблоны ответов" }).click();
  await dialog(page, "Управлять шаблонами").getByRole("button", { name: "Управлять шаблонами" }).click();

  const manager = dialog(page, "Новый шаблон");
  const row = manager.locator(".card-2").filter({ hasText: "Ваша ТТН" });
  await row.getByRole("button", { name: "Изменить" }).click();

  const editor = dialog(page, "Изменить шаблон");
  // Russian is the first tab and the one that opens.
  await expect(editor.getByLabel("Текст на русском (обязательно)")).toHaveValue(/^Заказ #\{orderNo\} отправлен/);
  const chips = editor.getByRole("button", { name: /^(рус|укр|eng)/i });
  await expect(chips.first()).toHaveText(/рус/i);

  // uk/en are optional; the editor says where they get translated otherwise.
  await editor.getByRole("button", { name: /^укр/i }).click();
  await expect(editor.getByLabel("Текст українською (необязательно)")).toHaveValue("");
  await expect(editor.getByText(/Можно не заполнять: пустой появится во вкладке «Переводы»/)).toBeVisible();

  await editor.getByRole("button", { name: /^рус/i }).click();
  const ru = editor.getByLabel("Текст на русском (обязательно)");
  await ru.press("Control+End");
  await ru.pressSequentially(" Хорошего дня!");
  await editor.getByRole("button", { name: "Сохранить" }).click();
  await expect(editor).toBeHidden();

  // The API lists it as a missing translation of the NEW Russian text, with the title as context.
  const missing = await api.translationExport("uk", "missing", "REPLY_TEMPLATE");
  const item = missing.find((i) => i.productTitle === "Ваша ТТН");
  expect(item?.field).toBe("body");
  expect(item?.source).toMatch(/Хорошего дня!$/);

  // …and so does the «Переводы» screen.
  await page.goto("/translations");
  await page.getByRole("button", { name: "Все переводы" }).click();
  await page.getByPlaceholder("Поиск по ru / uk / en / товару").fill("Хорошего дня");
  await expect(page.getByText("Шаблон чата «Ваша ТТН»")).toBeVisible();
});
