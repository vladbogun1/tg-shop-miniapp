/**
 * Order chat: opening it marks the customer's message read; a reply template (⚡) is inserted into
 * the input in the customer's language with the order's data filled in, and can be sent.
 */
import { CUSTOMER, ORDER } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test } from "../lib/test";

test("шаблон ответа подставляется с данными заказа", async ({ page, api }) => {
  const drawer = await openOrderFromBoard(page, ORDER.chat, CUSTOMER.chat);

  const chatTab = drawer.getByRole("button", { name: /^Чат/ });
  await expect(chatTab).toHaveText(/Чат\s*1$/); // one unread
  await chatTab.click();
  await expect(drawer.getByText("Добрий день! Коли відправите?")).toBeVisible();
  await expect
    .poll(async () => (await api.messages(ORDER.chat)).filter((m) => m.senderType === "CUSTOMER" && !m.readAt).length)
    .toBe(0);

  await drawer.getByRole("button", { name: "Шаблоны ответов" }).click();
  const picker = dialog(page, "Управлять шаблонами");
  await expect(picker).toBeVisible();
  // (The old «Реквизиты для оплаты» template is gone with the manual transfers — V39 deletes it.)
  await expect(picker.getByRole("button", { name: /^Реквизиты для оплаты/ })).toHaveCount(0);
  await picker.getByRole("button", { name: /^Отправим сегодня\/завтра/ }).click();
  await expect(picker).toBeHidden();

  // Customer locale is ru → the Russian text, placeholders replaced.
  const input = drawer.getByPlaceholder(/Сообщение клиенту/);
  await expect(input).toHaveValue(/^Марія Чатова, ваш заказ #e2e00003 отправим сегодня или завтра\./);
  await expect(input).not.toHaveValue(/\{[a-zA-Z]+\}/);

  // The admin can still edit it before sending.
  await input.press("Control+End");
  await input.pressSequentially(" Спасибо!");
  await drawer.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(drawer.getByText(/Марія Чатова, ваш заказ #e2e00003/)).toBeVisible();

  const messages = await api.messages(ORDER.chat);
  const sent = messages.find((m) => m.senderType === "ADMIN");
  expect(sent?.text).toMatch(/^Марія Чатова, ваш заказ/);
  expect(sent?.text).toMatch(/Спасибо!$/);
});
