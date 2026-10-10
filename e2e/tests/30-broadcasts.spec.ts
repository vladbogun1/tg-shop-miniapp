/**
 * «Рассылки» WITHOUT a real send. The e2e backend has no bot (BOT_TOKEN blank — env.js), which the
 * spec checks first: a test send answers «Бот не настроен», and starting a broadcast is refused in
 * Russian with nothing written to the history. Around that: the draft (HTML check, character
 * counter, preview, language versions, kept across a reload), audience sizes from the API, the
 * confirmation dialog («Отмена» sends nothing), the journal entry of the test send.
 */
import { backendEnv } from "../env.js";
import { dialog, expect, test, toast } from "../lib/test";

test("черновик, проверка HTML, предпросмотр, аудитория — и без бота ничего не уходит", async ({ page, api }) => {
  // The stack under test really has no bot.
  expect(backendEnv().BOT_TOKEN).toBe("");
  const history0 = await api.raw("get", "/api/admin/broadcast/history?limit=20");
  expect(history0.status).toBe(200);
  const historyBefore = (history0.body as unknown as unknown[]).length;
  const aud = (await api.raw("get", "/api/admin/broadcast/audiences")).body as Record<string, number>;
  expect(aud.all).toBeGreaterThan(0);

  await page.goto("/broadcasts");
  await expect(page.getByRole("heading", { name: "Рассылки", level: 1 })).toBeVisible();
  const send = page.getByRole("button", { name: /^Разослать \(\d+\)$/ });
  // Nothing written yet: cannot send.
  await expect(send).toHaveText(`Разослать (${aud.all})`);
  await expect(send).toBeDisabled();

  const text = page.getByLabel("Текст сообщения (HTML)");
  // Broken HTML is reported and blocks the send.
  await text.fill("<b>Знижки тижня");
  await expect(page.getByRole("listitem").filter({ hasText: /<b>|тег|закры/i }).first()).toBeVisible();
  await expect(send).toBeDisabled();

  await text.fill("<b>Знижки тижня</b> — до 20%");
  await expect(page.getByText("<b>Знижки тижня</b> — до 20%".length + " / 4096")).toBeVisible();
  await expect(send).toBeEnabled();
  // Preview renders the HTML (bold), not the tags.
  const preview = page.locator(".tg-preview");
  await expect(preview.locator("b")).toHaveText("Знижки тижня");
  await expect(preview).not.toContainText("<b>");

  // A Russian version.
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.getByLabel(/Текст: .* \(HTML\)/).fill("<b>Скидки недели</b>");
  await expect(page.getByRole("button", { name: "RU ✓" })).toBeVisible();
  await page.getByRole("button", { name: "Основной", exact: true }).click();

  // The draft survives a reload.
  await page.reload();
  await expect(page.getByLabel("Текст сообщения (HTML)")).toHaveValue("<b>Знижки тижня</b> — до 20%");
  await expect(page.getByRole("button", { name: "RU ✓" })).toBeVisible();

  // Audience: the count on the button follows the API.
  await page.getByRole("button", { name: new RegExp(`^Все · ${aud.all}$`) }).click();
  await page.getByRole("button", { name: new RegExp(`^С заказами · ${aud.active}$`) }).click();
  await expect(send).toHaveText(`Разослать (${aud.active})`);

  // «Тест себе»: no bot → a readable refusal, journalled.
  await page.getByRole("button", { name: "Тест себе" }).click();
  await expect(toast(page, "Бот не настроен")).toBeVisible();
  const tests = await api.audit("&action=BROADCAST_TEST");
  expect(tests[0]?.details).toContain("Бот не настроен");

  // Confirmation: «Отмена» sends nothing.
  await send.click();
  let confirm = dialog(page, "Подтвердите рассылку");
  await expect(confirm).toContainText("«С заказами»");
  await expect(confirm).toContainText(`${aud.active} получателей`);
  await expect(confirm).toContainText("Отдельные версии: RU");
  await confirm.getByRole("button", { name: "Отмена" }).click();
  await expect(confirm).toBeHidden();

  // Confirmed: the backend refuses (no bot) in Russian; the draft stays, nothing in the history.
  await send.click();
  confirm = dialog(page, "Подтвердите рассылку");
  await confirm.getByRole("button", { name: "Разослать" }).click();
  await expect(toast(page, /Бот не настроен/)).toBeVisible();
  await expect(page.getByLabel("Текст сообщения (HTML)")).toHaveValue("<b>Знижки тижня</b> — до 20%");
  const history1 = (await api.raw("get", "/api/admin/broadcast/history?limit=20")).body as unknown as unknown[];
  expect(history1.length).toBe(historyBefore);
  expect((await api.audit("&action=BROADCAST_START")).length).toBe(0);

  // «Очистить черновик».
  await page.getByRole("button", { name: "Очистить черновик" }).click();
  await expect(page.getByLabel("Текст сообщения (HTML)")).toHaveValue("");
  await expect(send).toBeDisabled();
});
