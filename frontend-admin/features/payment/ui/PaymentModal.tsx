"use client";

/**
 * PaymentModal — manual CORRECTION of how much was actually received («Скорректировать оплату»).
 * Online payments (monobank) are credited by the server on their own; this is for the rest:
 * cash on delivery collected, a mistake to fix. Presets: prepayment (if the order has one) /
 * full / custom amount, plus "Снять оплату".
 *
 * Money safety:
 *  - the choice is reset on every open and for every order (it used to be picked once, when the
 *    drawer mounted with no order yet, so it was stuck on "Полная оплата" — one hasty tap recorded
 *    the full amount on a prepaid order and the parcel left with no COD);
 *  - default is "Предоплата" when the order has one (and nothing has been received yet);
 *  - "Полная оплата" needs a second, explicit confirmation of the amount;
 *  - "Снять оплату" asks first.
 */
import { useLayoutEffect, useState } from "react";
import { money } from "@/lib/money";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { useForm } from "@shop/ui/form";
import { isPaymentValid, parseMinor, paymentAmount, type PaymentMode } from "../model/amounts";
import type { MovementChannel } from "../model/movements";
import type { PaymentOrder } from "../model/types";
import { PaymentFields, type PaymentValues } from "./PaymentFields";
import { RadioOption } from "./RadioOption";

export function PaymentModal({
  open,
  order,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  order: PaymentOrder | null;
  onClose: () => void;
  /** Resolves true when saved (the caller closes the modal). */
  onConfirm: (receivedMinor: number, channel?: MovementChannel, note?: string) => Promise<boolean> | boolean | void;
  loading?: boolean;
}) {
  const form = useForm<PaymentValues>({ defaultValues: { mode: null, custom: "", channel: "NP_COD", note: "" } });
  const { reset } = form;
  const { mode, custom, channel, note } = form.watch();
  const [confirmFull, setConfirmFull] = useState(false);
  const confirm = useConfirm();

  const orderId = order?.id ?? null;
  const hasPrepay = !!order && order.prepaymentMinor > 0;
  const nothingYet = !!order && order.receivedMinor <= 0;
  const pickup = order?.deliveryMethod === "PICKUP";
  useLayoutEffect(() => {
    if (!open) return;
    reset({ mode: hasPrepay && nothingYet ? "prepayment" : null, custom: "", channel: pickup ? "CASH" : "NP_COD", note: "" });
    setConfirmFull(false);
  }, [open, orderId, hasPrepay, nothingYet, pickup, reset]);

  if (!order) return null;
  const cur = order.currency;

  const customMinor = parseMinor(custom);
  const amount = paymentAmount(mode, order, customMinor);
  const valid = isPaymentValid(mode, amount, order.totalMinor);
  const codAfter = Math.max(0, order.totalMinor - amount);

  async function save() {
    if (!valid) return;
    if (mode === "full" && !confirmFull) {
      setConfirmFull(true);
      return;
    }
    await onConfirm(amount, channel, note.trim() || undefined);
  }

  async function clearPayment() {
    if (!order) return;
    const ok = await confirm({
      title: "Снять оплату?",
      message: (
        <>
          Получено сейчас: <b>{money(order.receivedMinor, cur)}</b>. После снятия наложка станет{" "}
          <b>{money(order.totalMinor, cur)}</b>.
        </>
      ),
      confirmLabel: "Снять оплату",
      danger: true,
    });
    if (ok) await onConfirm(0);
  }

  const opt = (m: PaymentMode, label: string, sub?: string) => (
    <RadioOption
      selected={mode === m}
      label={label}
      sub={sub}
      onSelect={() => {
        form.setValue("mode", m);
        setConfirmFull(false);
      }}
    />
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={(mode === "custom" && custom.trim() !== "") || note.trim() !== ""}
      title="💳 Корректировка оплаты"
      footer={
        <>
          {order.receivedMinor > 0 && (
            <Button variant="ghost" onClick={clearPayment} disabled={loading} className="mr-auto">
              Снять оплату
            </Button>
          )}
          {confirmFull ? (
            <Button variant="ghost" onClick={() => setConfirmFull(false)}>
              Назад
            </Button>
          ) : (
            <ModalCancel />
          )}
          <Button variant="accent" loading={loading} disabled={!valid} onClick={save}>
            {submitLabel(valid, confirmFull, money(amount, cur))}
          </Button>
        </>
      }
    >
      <PaymentFields form={form} order={order} opt={opt} customMinor={customMinor} valid={valid} codAfter={codAfter} confirmFull={confirmFull} />
    </Modal>
  );
}

function submitLabel(valid: boolean, confirmFull: boolean, amountText: string): string {
  if (!valid) return "Выберите сумму";
  return confirmFull ? `Да, получено ${amountText}` : `Подтвердить · ${amountText}`;
}
