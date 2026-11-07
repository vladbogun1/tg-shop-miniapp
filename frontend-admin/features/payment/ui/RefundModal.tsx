"use client";

/**
 * RefundModal — money back to the customer's card for one paid monobank invoice («Вернуть только деньги»;
 * goods and stock are not touched — for that there is the return wizard).
 * Step 1: the whole remaining amount or a part of it (validated: > 0 and ≤ what is left), presets
 * «Остаток» / «50 %» fill the field. Step 2: an explicit confirmation — the refund cannot be taken back.
 * The refund settles asynchronously; the block shows «возврат в обработке» until monobank confirms.
 */
import { useLayoutEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { money, toMajor } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { useForm, type ShopForm } from "@shop/ui/form";
import { Input } from "@/components/ui/Input";
import { halfOf, parseMinor, partialRefundError } from "../model/amounts";
import { maskedPanShort } from "../model/online-payment";
import type { AdminInvoice } from "../model/types";
import { Segment } from "./Segment";

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

  function pickMode(m: Mode) {
    form.setValue("mode", m);
    setConfirming(false);
  }

  function preset(minor: number) {
    form.setValue("mode", "partial");
    form.setValue("partial", String(toMajor(minor)));
    setConfirming(false);
  }

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
        onPick={pickMode}
        onPreset={preset}
        onEdit={() => setConfirming(false)}
      />
    </Modal>
  );
}

function submitLabel(valid: boolean, confirming: boolean, amountText: string): string {
  if (!valid) return "Укажите сумму";
  return confirming ? `Да, вернуть ${amountText}` : `Вернуть · ${amountText}`;
}

function PresetChip({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "nb-press min-h-11 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--line-strong)]"
      )}
    >
      {label}
    </button>
  );
}

interface FieldsProps {
  form: ShopForm<Values>;
  invoice: AdminInvoice;
  leftMinor: number;
  currency: string;
  amount: number;
  partialError: string | undefined;
  confirming: boolean;
  onPick: (m: Mode) => void;
  onPreset: (minor: number) => void;
  onEdit: () => void;
}

function RefundFields({ form, invoice, leftMinor, currency, amount, partialError, confirming, onPick, onPreset, onEdit }: FieldsProps) {
  const mode = form.watch("mode");
  const card = maskedPanShort(invoice.maskedPan);
  const half = halfOf(leftMinor);
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px]">
        <div className="col-span-2 min-w-0 truncate text-[var(--text-muted)]">Платёж monobank{card ? <> · карта {card}</> : null}</div>
        <div>
          <dt className="field-label !text-[10.5px]">Оплачено онлайн</dt>
          <dd className="tabular mt-0.5 text-[14px] font-semibold text-[var(--text)]">{money(invoice.amountMinor, currency)}</dd>
        </div>
        <div>
          <dt className="field-label !text-[10.5px]">Можно вернуть</dt>
          <dd className="tabular mt-0.5 text-[14px] font-semibold text-[var(--accent-hi)]">{money(leftMinor, currency)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Сколько вернуть">
        <Segment selected={mode === "full"} label="Всю сумму" sub={money(leftMinor, currency)} onClick={() => onPick("full")} />
        <Segment selected={mode === "partial"} label="Часть суммы" onClick={() => onPick("partial")} />
      </div>
      {mode === "partial" && (
        <>
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
          <div className="flex flex-wrap gap-1.5">
            <PresetChip label={`Остаток · ${money(leftMinor, currency)}`} active={amount === leftMinor} onClick={() => onPreset(leftMinor)} />
            {half > 0 && <PresetChip label={`50 % · ${money(half, currency)}`} active={amount === half} onClick={() => onPreset(half)} />}
          </div>
        </>
      )}
      {confirming && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-[13px] font-semibold text-[var(--danger-ink)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Деньги уйдут на карту покупателя, отменить нельзя. Вернуть {money(amount, currency)}?</span>
        </p>
      )}
      <p className="text-[12px] text-[var(--text-faint)]">
        Товар и склад не трогает — для возврата товара есть «Возврат». monobank проводит возврат не сразу: пока он не
        подтвердится, у платежа будет пометка «возврат в обработке».
      </p>
    </div>
  );
}
