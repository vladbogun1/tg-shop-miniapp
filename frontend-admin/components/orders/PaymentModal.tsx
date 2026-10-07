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
  const nothingYet = !!order && order.receivedMinor <= 0;
  useEffect(() => {
    if (!open) return;
    setMode(hasPrepay && nothingYet ? "prepayment" : null);
    setCustom("");
    setConfirmFull(false);
  }, [open, orderId, hasPrepay, nothingYet]);

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
        {sub && <span className={cn("font-display tabular text-[15px] font-bold", mode === m ? "text-[var(--accent-hi)]" : "text-[var(--text)]")}>{sub}</span>}
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
          <p className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]">
            Онлайн-оплаты monobank засчитываются сами. Здесь — ручная правка: получили наложку, нужно
            исправить сумму. Деньги покупателю отсюда не возвращаются — для этого «Вернуть деньги» в блоке
            «Онлайн-оплата».
          </p>
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
            <p className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-[13px] font-semibold text-[var(--danger-ink)]">
              Точно получена вся сумма {money(order.totalMinor, cur)}? Наложка станет 0 — посылка уйдёт без
              наложки.
            </p>
          ) : (
            valid && (
              <p className="text-[12px] text-[var(--text-muted)]">
                Наложка после сохранения: <b className="tabular font-semibold text-[var(--text)]">{money(codAfter, cur)}</b>
              </p>
            )
          )}
          {order.receivedMinor > 0 && (
            <p className="text-[12px] text-[var(--text-muted)]">
              Сейчас получено: <b className="tabular font-semibold text-[var(--text)]">{money(order.receivedMinor, cur)}</b>
            </p>
          )}
        </div>
      </Modal>
      {confirmUi}
    </>
  );
}
