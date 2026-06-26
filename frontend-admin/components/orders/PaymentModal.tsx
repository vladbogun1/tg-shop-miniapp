"use client";

/**
 * PaymentModal — record how much was ACTUALLY received for an order so наложка
 * (COD) is exact. Presets: prepayment (if the order has one) / full / custom
 * amount, plus "снять оплату" (clear). Confirms the chosen amount in minor units.
 */
import { useState } from "react";
import { money } from "@/lib/money";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { OrderDetailDto } from "@/lib/api";

type Mode = "prepayment" | "full" | "custom";

export function PaymentModal({
  open,
  order,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  order: OrderDetailDto | null;
  onClose: () => void;
  onConfirm: (receivedMinor: number) => void;
  loading?: boolean;
}) {
  const hasPrepay = !!order && order.prepaymentMinor > 0;
  const [mode, setMode] = useState<Mode>(hasPrepay ? "prepayment" : "full");
  const [custom, setCustom] = useState("");

  if (!order) return null;
  const cur = order.currency;

  const customMinor = Math.round((parseFloat(custom.replace(",", ".")) || 0) * 100);
  const amount =
    mode === "prepayment" ? order.prepaymentMinor : mode === "full" ? order.totalMinor : customMinor;
  const valid = amount > 0 && amount <= order.totalMinor;

  function Opt({ m, label, sub }: { m: Mode; label: string; sub?: string }) {
    return (
      <button
        type="button"
        onClick={() => setMode(m)}
        className={`flex w-full items-center justify-between rounded-[var(--r-md)] border-[2.5px] px-3.5 py-3 text-left transition-colors ${
          mode === m
            ? "border-[var(--accent)] bg-[var(--surface-2)]"
            : "border-[var(--border-2)] bg-[var(--surface)]"
        }`}
      >
        <span className="text-[14px] font-bold text-[var(--text)]">{label}</span>
        {sub && <span className="text-[14px] font-black text-[var(--text)]">{sub}</span>}
      </button>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="💳 Оплата заказа"
      footer={
        <>
          {order.receivedMinor > 0 && (
            <Button variant="ghost" onClick={() => onConfirm(0)} disabled={loading}>
              Снять оплату
            </Button>
          )}
          <Button
            variant="accent"
            loading={loading}
            disabled={!valid}
            onClick={() => onConfirm(amount)}
          >
            {valid ? `Подтвердить · ${money(amount, cur)}` : "Подтвердить"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <p className="text-[13px] text-[var(--text-muted)]">
          Сколько фактически получено от клиента? Наложка = сумма заказа (
          {money(order.totalMinor, cur)}) − полученное.
        </p>
        {hasPrepay && <Opt m="prepayment" label="Предоплата" sub={money(order.prepaymentMinor, cur)} />}
        <Opt m="full" label="Полная оплата" sub={money(order.totalMinor, cur)} />
        <Opt m="custom" label="Другая сумма" />
        {mode === "custom" && (
          <Input
            label={`Сумма, ${cur}`}
            type="number"
            inputMode="decimal"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="0"
          />
        )}
        {order.receivedMinor > 0 && (
          <p className="text-[12px] text-[var(--text-muted)]">
            Сейчас получено:{" "}
            <b className="text-[var(--text)]">{money(order.receivedMinor, cur)}</b>
          </p>
        )}
      </div>
    </Modal>
  );
}
