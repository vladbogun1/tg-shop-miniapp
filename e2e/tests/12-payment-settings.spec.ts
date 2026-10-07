/**
 * «Оплата» settings. Payment is online only (monobank): the screen shows whether the acquiring is
 * connected and lists the payment options (full online, or an online prepayment + наложка). The
 * old card/IBAN requisites are gone. Switching off every option is refused (checkout would stop),
 * and a prepayment option needs its amount. Checked in the UI and on the server.
 */
import { expect, test } from "../lib/test";

test("статус monobank вверху, реквизитов больше нет", async ({ page, api }) => {
  await page.goto("/payment");
  const card = page.getByRole("region", { name: "Эквайринг monobank" });
  await expect(card).toBeVisible();

  const status = (await api.raw("get", "/api/admin/payments/monobank/status")).body as unknown as {
    enabled: boolean;
    merchantName?: string | null;
    error?: string | null;
    lastWebhookAt?: string | null;
  };
  if (!status.enabled) {
    // The e2e stack runs without MONOBANK_TOKEN.
    await expect(card).toContainText("Не настроено");
    await expect(card).toContainText("MONOBANK_TOKEN");
  } else if (status.error) {
    await expect(card).toContainText("Ошибка");
  } else {
    await expect(card).toContainText("Подключено");
    if (status.merchantName) await expect(card).toContainText(status.merchantName);
  }
  await expect(card).toContainText(status.lastWebhookAt ? "Последний вебхук" : "Вебхуков от monobank ещё не было");

  // Every option is paid online; the requisites editor is gone (and so is its endpoint).
  await expect(page.getByText("Вся сумма заказа онлайн через monobank.")).toHaveCount(1);
  await expect(page.getByText(/остаток — наложкой при получении/)).toHaveCount(2);
  await expect(page.getByLabel("Номер карты")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /^IBAN/ })).toHaveCount(0);
  expect((await api.raw("get", "/api/admin/payment-requisites")).status).not.toBe(200);
});

test("предоплате нужна сумма", async ({ page }) => {
  await page.goto("/payment");
  const save = page.getByRole("button", { name: "Сохранить" });
  const prepay = page.getByRole("switch", { name: "Предоплата + наложка", exact: true });
  await expect(prepay).toHaveCount(3);
  await expect(page.getByText("Все изменения сохранены")).toBeVisible();

  // «Полная оплата онлайн» → prepayment without an amount: cannot be saved.
  await prepay.nth(2).click();
  await expect(
    page.getByText("Укажите сумму предоплаты — её покупатель оплатит онлайн")
  ).toBeVisible();
  await expect(save).toBeDisabled();

  await prepay.nth(2).click();
  await expect(page.getByText("Все изменения сохранены")).toBeVisible();
});

test("нельзя выключить все способы оплаты", async ({ page, api }) => {
  await page.goto("/payment");
  const save = page.getByRole("button", { name: "Сохранить" });
  const visible = page.getByRole("switch", { name: "Показывать покупателям", exact: true });
  await expect(visible).toHaveCount(3);

  for (let i = 0; i < 3; i++) await visible.nth(i).click();
  await expect(page.getByText("Все способы выключены — оформить заказ будет нельзя.")).toBeVisible();
  await expect(
    page.getByText("Включите хотя бы один способ оплаты — иначе покупатели не смогут оформить заказ")
  ).toBeVisible();
  await expect(save).toBeDisabled();

  // One back on → savable again; back to the original state → nothing to save.
  await visible.nth(1).click();
  await expect(save).toBeEnabled();
  await visible.nth(0).click();
  await visible.nth(2).click();
  await expect(page.getByText("Все изменения сохранены")).toBeVisible();

  // Server side: a list with no active option is a 400 and changes nothing.
  const options = (await api.raw("get", "/api/admin/payment-options?includeInactive=true")).body as unknown as Record<
    string,
    unknown
  >[];
  const res = await api.raw(
    "put",
    "/api/admin/payment-options",
    options.map((o) => ({ ...o, active: false }))
  );
  expect(res.status).toBe(400);
  const still = (await api.raw("get", "/api/admin/payment-options")).body as unknown as unknown[];
  expect(still).toHaveLength(3);
});
