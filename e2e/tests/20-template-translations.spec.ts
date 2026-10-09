/**
 * Chat reply templates are translated like the rest of the content: the editor opens on Russian
 * (the only required language), uk/en may stay empty, and an empty or outdated translation shows up
 * in «Переводы» → «Нужно перевести», with the template's title as context.
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

  // …and so does the «Переводы» screen: the text sits in «Нужно перевести» (and only there),
  // with the template's title as the place it is used.
  await page.goto("/translations");
  await page.getByRole("tab", { name: /^Нужно перевести/ }).click();
  await expect(page.getByRole("tab", { name: /^Нужно перевести/ })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Поиск").fill("Хорошего дня");
  const count = (name: string) => page.getByRole("tab", { name: new RegExp(`^${name}`) }).locator("span").first();
  await expect(count("Нужно перевести")).toHaveText("1");
  await expect(count("Устарели")).toHaveText("0");
  await expect(count("Проверить ИИ")).toHaveText("0");
  await expect(count("Готово")).toHaveText("0");
  const queued = page.getByRole("listitem").filter({ hasText: "Шаблон чата «Ваша ТТН»" });
  await expect(queued).toHaveCount(1);
  await expect(queued).toContainText(/Хорошего дня!/);
  await expect(queued).toContainText("UK: перевода нет");

  // A click opens it one by one, with the new Russian text as the original.
  await queued.getByRole("button").click();
  await expect(page.getByText(/Хорошего дня!/).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Нужно перевести/ })).toBeHidden();
});
