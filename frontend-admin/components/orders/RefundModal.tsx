"use client";

/**
 * RefundModal — money back to the customer's card for one paid monobank invoice.
 * Step 1: the whole remaining amount or a part of it (validated: > 0 and ≤ what is left).
 * Step 2: an explicit confirmation — the refund cannot be taken back.
 * The refund settles asynchronously; the block shows «возврат в обработке» until monobank confirms.
 */
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { AdminInvoice } from "@/lib/api";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { maskedPanShort } from "@/lib/online-payment";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Mode = "full" | "partial";

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
  const [mode, setMode] = useState<Mode>("full");
  const [partial, setPartial] = useState("");
  const [confirming, setConfirming] = useState(false);

  const invoiceId = invoice?.invoiceId ?? null;
  useEffect(() => {
    if (!open) return;
    setMode("full");
    setPartial("");
    setConfirming(false);
  }, [open, invoiceId]);

  if (!invoice) return null;

  const partialMinor = Math.round((parseFloat(partial.replace(",", ".")) || 0) * 100);
  const partialError =
    mode !== "partial" || partial.trim() === ""
      ? undefined
      : partialMinor <= 0
        ? "Введите сумму больше нуля"
        : partialMinor > leftMinor
          ? `Не больше ${money(leftMinor, currency)} — столько осталось по этому платежу`
          : undefined;
  const amount = mode === "full" ? leftMinor : partialMinor;
  const valid = leftMinor > 0 && amount > 0 && amount <= leftMinor && !partialError;
  const card = maskedPanShort(invoice.maskedPan);

  async function submit() {
    if (!valid) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    // A partial equal to everything left is a full refund — let the server take "all that is left".
    await onConfirm(mode === "full" || amount === leftMinor ? undefined : amount);
  }

  function Opt({ m, label, sub }: { m: Mode; label: string; sub?: string }) {
    return (
      <button
        type="button"
        onClick={() => {
          setMode(m);
          setConfirming(false);
        }}
        aria-pressed={mode === m}
        className={cn(
          "nb-press flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--r-md)] border px-3.5 py-2.5 text-left transition-colors",
          mode === m
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]"
        )}
      >
        <span className="flex items-center gap-2.5 text-[14px] font-semibold text-[var(--text)]">
          <span
            aria-hidden
            className={cn(
              "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
              mode === m ? "border-[var(--accent)]" : "border-[var(--line-strong)]"
            )}
          >
            {mode === m && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
          </span>
          {label}
        </span>
        {sub && (
          <span
            className={cn(
              "font-display tabular text-[15px] font-bold",
              mode === m ? "text-[var(--accent-hi)]" : "text-[var(--text)]"
            )}
          >
            {sub}
          </span>
        )}
      </button>
    );
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
            {!valid
              ? "Укажите сумму"
              : confirming
                ? `Да, вернуть ${money(amount, currency)}`
                : `Вернуть · ${money(amount, currency)}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <p className="text-[13px] text-[var(--text-muted)]">
          Оплачено онлайн {money(invoice.amountMinor, currency)}
          {card ? <> картой {card}</> : null}. Можно вернуть:{" "}
          <b className="tabular font-semibold text-[var(--text)]">{money(leftMinor, currency)}</b>.
        </p>
        <Opt m="full" label="Всю сумму" sub={money(leftMinor, currency)} />
        <Opt m="partial" label="Часть суммы" />
        {mode === "partial" && (
          <Input
            label="Сумма возврата, ₴"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={partial}
            autoFocus
            onChange={(e) => {
              setPartial(e.target.value);
              setConfirming(false);
            }}
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
    </Modal>
  );
}
