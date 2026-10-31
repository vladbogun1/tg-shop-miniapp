"use client";

/**
 * RefundModal — money back to the customer's card for one paid monobank invoice.
 * Step 1: the whole remaining amount or a part of it (validated: > 0 and ≤ what is left).
 * Step 2: an explicit confirmation — the refund cannot be taken back.
 * The refund settles asynchronously; the block shows «возврат в обработке» until monobank confirms.
 */
import { useLayoutEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { money } from "@/lib/money";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { useForm, type ShopForm } from "@shop/ui/form";
import { Input } from "@/components/ui/Input";
import { parseMinor, partialRefundError } from "../model/amounts";
import { maskedPanShort } from "../model/online-payment";
import type { AdminInvoice } from "../model/types";
import { RadioOption } from "./RadioOption";

type Mode = "full" | "partial";

interface Values {
  mode: Mode;
  partial: string;
}

export function RefundModal({
  open,
  invoice,
  leftMinor,
  currency = "UAH",
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  invoice: AdminInvoice | null;
  /** What can still be refunded on this invoice. */
  leftMinor: number;
  currency?: string;
  loading?: boolean;
  onClose: () => void;
  /** `undefined` = refund everything that is left. Resolves true when sent (the caller closes). */
  onConfirm: (amountMinor: number | undefined) => Promise<boolean> | boolean | void;
}) {
  const form = useForm<Values>({ defaultValues: { mode: "full", partial: "" } });
  const { reset } = form;
  const { mode, partial } = form.watch();
  const [confirming, setConfirming] = useState(false);

  const invoiceId = invoice?.invoiceId ?? null;
  useLayoutEffect(() => {
    if (!open) return;
    reset({ mode: "full", partial: "" });
    setConfirming(false);
  }, [open, invoiceId, reset]);

  if (!invoice) return null;

  const partialMinor = parseMinor(partial);
  const partialError =
    mode === "partial" ? partialRefundError(partial, partialMinor, leftMinor, (m) => money(m, currency)) : undefined;
  const amount = mode === "full" ? leftMinor : partialMinor;
  const valid = leftMinor > 0 && amount > 0 && amount <= leftMinor && !partialError;

  async function submit() {
    if (!valid) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    // A partial equal to everything left is a full refund — let the server take "all that is left".
    await onConfirm(mode === "full" || amount === leftMinor ? undefined : amount);
  }

  const opt = (m: Mode, label: string, sub?: string) => (
    <RadioOption
      selected={mode === m}
      label={label}
      sub={sub}
      onSelect={() => {
        form.setValue("mode", m);
        setConfirming(false);
      }}
    />
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={mode === "partial" && partial.trim() !== ""}
      title="Вернуть деньги"
      footer={
        <>
          {confirming ? (
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={loading}>
              Назад
            </Button>
          ) : (
            <ModalCancel />
          )}
          <Button variant={confirming ? "danger" : "accent"} loading={loading} disabled={!valid} onClick={submit}>
            {submitLabel(valid, confirming, money(amount, currency))}
          </Button>
        </>
      }
    >
      <RefundFields
        form={form}
        invoice={invoice}
        leftMinor={leftMinor}
        currency={currency}
        amount={amount}
        partialError={partialError}
        confirming={confirming}
        opt={opt}
        onEdit={() => setConfirming(false)}
      />
    </Modal>
  );
}

function submitLabel(valid: boolean, confirming: boolean, amountText: string): string {
  if (!valid) return "Укажите сумму";
  return confirming ? `Да, вернуть ${amountText}` : `Вернуть · ${amountText}`;
}

function RefundFields({
  form,
  invoice,
  leftMinor,
  currency,
  amount,
  partialError,
  confirming,
  opt,
  onEdit,
}: {
  form: ShopForm<Values>;
  invoice: AdminInvoice;
  leftMinor: number;
  currency: string;
  amount: number;
  partialError: string | undefined;
  confirming: boolean;
  opt: (m: Mode, label: string, sub?: string) => ReactNode;
  onEdit: () => void;
}) {
  const mode = form.watch("mode");
  const card = maskedPanShort(invoice.maskedPan);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] text-[var(--text-muted)]">
        Оплачено онлайн {money(invoice.amountMinor, currency)}
        {card ? <> картой {card}</> : null}. Можно вернуть:{" "}
        <b className="tabular font-semibold text-[var(--text)]">{money(leftMinor, currency)}</b>.
      </p>
      {opt("full", "Всю сумму", money(leftMinor, currency))}
      {opt("partial", "Часть суммы")}
      {mode === "partial" && (
        <Input
          label="Сумма возврата, ₴"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          autoFocus
          {...form.register("partial", { onChange: onEdit })}
          placeholder="0"
          error={partialError}
        />
      )}
      {confirming && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-[13px] font-semibold text-[var(--danger-ink)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Деньги уйдут на карту покупателя, отменить нельзя. Вернуть {money(amount, currency)}?
          </span>
        </p>
      )}
      <p className="text-[12px] text-[var(--text-faint)]">
        monobank проводит возврат не сразу: пока он не подтвердится, у платежа будет пометка «возврат в
        обработке».
      </p>
    </div>
  );
}
