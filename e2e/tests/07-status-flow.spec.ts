/**
 * Status changes from the order card: NEW → APPROVED → SHIPPED with a ТТН. A ТТН typed for one
 * order and cancelled must not show up pre-filled in the next order's dialog (it used to — and a
 * hasty «Подтвердить» shipped order B with order A's waybill).
 */
import { CUSTOMER, ORDER } from "../lib/seed";
import { dialog, expect, openOrderFromBoard, test, toast } from "../lib/test";

const TTN_LABEL = "Номер ТТН (обязательно)";

test("NEW → APPROVED → SHIPPED; ТТН после «Отмена» не переносится в следующий заказ", async ({ page, api }) => {
  // ---- A: approve ----
  let drawer = await openOrderFromBoard(page, ORDER.flow, CUSTOMER.flow);
  await drawer.getByRole("button", { name: "Одобрить", exact: true }).click();
  await expect(toast(page, "Статус: Одобрен")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Отправить (ТТН)" })).toBeVisible();
  expect((await api.order(ORDER.flow)).status).toBe("APPROVED");

  // ---- A: type a ТТН, then «Отмена» (the dirty guard asks first) ----
  await drawer.getByRole("button", { name: "Отправить (ТТН)" }).click();
  let modal = dialog(page, TTN_LABEL);
  await modal.getByLabel(TTN_LABEL).fill("20450000000777");
  await modal.getByRole("button", { name: "Отмена", exact: true }).click();
  const guard = dialog(page, "Закрыть без сохранения?");
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  await expect(modal).toBeHidden();
  expect((await api.order(ORDER.flow)).status).toBe("APPROVED");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // ---- B: the next order's ТТН dialog starts empty ----
  drawer = await openOrderFromBoard(page, ORDER.approved, CUSTOMER.approved);
  await drawer.getByRole("button", { name: "Отправить (ТТН)" }).click();
  modal = dialog(page, TTN_LABEL);
  await expect(modal).toContainText(CUSTOMER.approved);
  await expect(modal.getByLabel(TTN_LABEL)).toHaveValue("");
  await expect(modal.getByRole("button", { name: "Подтвердить" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(drawer).toBeVisible();
  expect((await api.order(ORDER.approved)).status).toBe("APPROVED");

  // ---- A: ship for real; a malformed number is flagged first ----
  drawer = await openOrderFromBoard(page, ORDER.flow, CUSTOMER.flow);
  await drawer.getByRole("button", { name: "Отправить (ТТН)" }).click();
  modal = dialog(page, TTN_LABEL);
  await expect(modal.getByLabel(TTN_LABEL)).toHaveValue("");
  await modal.getByLabel(TTN_LABEL).fill("12345");
  await expect(modal.getByText(/Не похоже на ТТН Новой Почты/)).toBeVisible();
  await modal.getByLabel(TTN_LABEL).fill("2045 0000 0000 05");
  await modal.getByRole("button", { name: "Подтвердить" }).click();
  await expect(toast(page, "Статус: Отправлен")).toBeVisible();
  await expect(modal).toBeHidden();
  await expect(drawer).toContainText("20450000000005");

  const shipped = await api.order(ORDER.flow);
  expect(shipped.status).toBe("SHIPPED");
  expect(shipped.trackingNumber).toBe("20450000000005");
  // B was never touched.
  const other = await api.order(ORDER.approved);
  expect(other.status).toBe("APPROVED");
  expect(other.trackingNumber).toBeNull();
});
