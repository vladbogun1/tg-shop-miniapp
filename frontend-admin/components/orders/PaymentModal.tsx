"use client";

/**
 * PaymentModal — record how much was ACTUALLY received for an order so наложка (COD) is exact.
 * Presets: prepayment (if the order has one) / full / custom amount, plus "Снять оплату".
 *
 * Money safety:
 *  - the choice is reset on every open and for every order (it used to be picked once, when the
 *    drawer mounted with no order yet, so it was stuck on "Полная оплата" — one hasty tap recorded
 *    the full amount on a prepaid order and the parcel left with no COD);
 *  - default is "Предоплата" when the order has one; a pending customer claim starts with NO choice,
 *    so the admin has to look at the transfer and pick;
 *  - "Полная оплата" needs a second, explicit confirmation of the amount;
 *  - "Снять оплату" asks first.
 */
import { useEffect, useState } from "react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useConfirm } from "@/components/ui/ConfirmModal";
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
  /** Resolves true when saved (the caller closes the modal). */
  onConfirm: (receivedMinor: number) => Promise<boolean> | boolean | void;
  loading?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [custom, setCustom] = useState("");
  const [confirmFull, setConfirmFull] = useState(false);
  const [confirm, confirmUi] = useConfirm();

  const orderId = order?.id ?? null;
  const hasPrepay = !!order && order.prepaymentMinor > 0;
  const claimPending = !!order && order.paymentClaimed && !order.paid;
  useEffect(() => {
    if (!open) return;
    setMode(hasPrepay && !claimPending ? "prepayment" : null);
    setCustom("");
    setConfirmFull(false);
  }, [open, orderId, hasPrepay, claimPending]);

  if (!order) return null;
  const cur = order.currency;

  const customMinor = Math.round((parseFloat(custom.replace(",", ".")) || 0) * 100);
  const amount =
    mode === "prepayment"
      ? order.prepaymentMinor
      : mode === "full"
        ? order.totalMinor
        : mode === "custom"
          ? customMinor
          : 0;
  const valid = mode !== null && amount > 0 && amount <= order.totalMinor;
  const codAfter = Math.max(0, order.totalMinor - amount);

  async function save() {
    if (!valid) return;
    if (mode === "full" && !confirmFull) {
      setConfirmFull(true);
      return;
    }
    await onConfirm(amount);
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

  function Opt({ m, label, sub }: { m: Mode; label: string; sub?: string }) {
    return (
      <button
        type="button"
        onClick={() => {
          setMode(m);
          setConfirmFull(false);
        }}
        aria-pressed={mode === m}
        className={cn(
          "flex w-full items-center justify-between rounded-[var(--r-md)] border-[2.5px] px-3.5 py-3 text-left transition-colors",
          mode === m ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border-2)] bg-[var(--surface)]"
        )}
      >
        <span className="text-[14px] font-bold text-[var(--text)]">{label}</span>
        {sub && <span className="text-[14px] font-black text-[var(--text)]">{sub}</span>}
      </button>
    );
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        closeOnBackdrop={false}
        dirty={mode === "custom" && custom.trim() !== ""}
        title="💳 Оплата заказа"
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
              {!valid
                ? "Выберите сумму"
                : confirmFull
                  ? `Да, получено ${money(amount, cur)}`
                  : `Подтвердить · ${money(amount, cur)}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2.5">
          {claimPending && (
            <p className="rounded-[var(--r-sm)] border-2 border-[var(--warn)] p-2.5 text-[13px] font-semibold text-[var(--text)]">
              Клиент сообщил об оплате. Проверьте поступление на счёт и выберите, сколько пришло.
            </p>
          )}
          <p className="text-[13px] text-[var(--text-muted)]">
            Сколько фактически получено от клиента? Наложка = сумма заказа ({money(order.totalMinor, cur)}) −
            полученное.
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
              autoFocus
              onChange={(e) => setCustom(e.target.value)}
              placeholder="0"
              error={customMinor > order.totalMinor ? "Больше суммы заказа" : undefined}
            />
          )}
          {confirmFull ? (
            <p className="rounded-[var(--r-sm)] border-2 border-[var(--danger)] p-2.5 text-[13px] font-bold text-[var(--text)]">
              Точно получена вся сумма {money(order.totalMinor, cur)}? Наложка станет 0 — посылка уйдёт без
              наложки.
            </p>
          ) : (
            valid && (
              <p className="text-[12px] text-[var(--text-muted)]">
                Наложка после сохранения: <b className="text-[var(--text)]">{money(codAfter, cur)}</b>
              </p>
            )
          )}
          {order.receivedMinor > 0 && (
            <p className="text-[12px] text-[var(--text-muted)]">
              Сейчас получено: <b className="text-[var(--text)]">{money(order.receivedMinor, cur)}</b>
            </p>
          )}
        </div>
      </Modal>
      {confirmUi}
    </>
  );
}
