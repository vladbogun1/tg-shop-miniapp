/**
 * «Оплата» settings: a card number failing Luhn or an IBAN with a wrong checksum cannot be saved
 * (customers would pay into nowhere), and switching off every payment option is refused (checkout
 * would stop). Both checked in the UI and on the server.
 */
import { expect, test } from "../lib/test";

const CARD = "4111111111111111";
const IBAN = "UA053220010000026001234567890";

test("невалидная карта или IBAN не сохраняются", async ({ page, api }) => {
  await page.goto("/payment");
  const card = page.getByLabel("Номер карты");
  // By role: once an error shows, it becomes part of the label text.
  const iban = page.getByRole("textbox", { name: /^IBAN/ });
  const save = page.getByRole("button", { name: "Сохранить" });
  await expect(card).toHaveValue(CARD);
  await expect(page.getByText("Все изменения сохранены")).toBeVisible();

  await card.fill("4111111111111112");
  await expect(page.getByText("Номер карты с ошибкой (не прошёл проверку Luhn)").first()).toBeVisible();
  await expect(save).toBeDisabled();
  await card.fill("4111 1111");
  await expect(page.getByText("Номер карты — 16 цифр (допустимо 13–19)").first()).toBeVisible();
  await expect(save).toBeDisabled();
  await card.fill(CARD);

  await iban.fill("UA053220010000026001234567891");
  await expect(page.getByText("IBAN с ошибкой (не сходится контрольная сумма)").first()).toBeVisible();
  await expect(save).toBeDisabled();
  await iban.fill("UA05322001");
  await expect(page.getByText("IBAN: UA и 27 цифр (29 символов)").first()).toBeVisible();
  await expect(save).toBeDisabled();
  await iban.fill(IBAN);
  await expect(page.getByText("Все изменения сохранены")).toBeVisible();

  // The server refuses the same values (a stale or bypassed UI must not get them through).
  const current = (await api.raw("get", "/api/admin/payment-requisites")).body;
  const badCard = await api.raw("put", "/api/admin/payment-requisites", { ...current, cardNumber: "4111111111111112" });
  expect(badCard.status).toBe(400);
  const badIban = await api.raw("put", "/api/admin/payment-requisites", { ...current, iban: "UA053220010000026001234567891" });
  expect(badIban.status).toBe(400);
  const after = (await api.raw("get", "/api/admin/payment-requisites")).body;
  expect(after.cardNumber).toBe(CARD);
  expect(after.iban).toBe(IBAN);
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
