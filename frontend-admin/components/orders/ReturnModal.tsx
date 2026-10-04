"use client";

/**
 * Register a (partial) return (POST /orders/{id}/return): how many units of each line came back,
 * whether they go back on the shelf, and how much money is refunded. The order status is not
 * changed — a parcel refused at the post office is still "Отклонить" with "Отказ на почте".
 */
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { AdminOrderDetail, ReturnBody } from "@/lib/orders-api";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";

interface LineState {
  qty: number;
  restock: boolean;
}

export function ReturnModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: AdminOrderDetail | null;
  onClose: () => void;
  onSave: (body: ReturnBody) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const [lines, setLines] = useState<Record<number, LineState>>({});
  const [refund, setRefund] = useState("");
  const [note, setNote] = useState("");

  const orderId = order?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setLines({});
    setRefund("");
    setNote("");
  }, [open, orderId]);

  const refundable = order ? Math.max(0, (order.receivedMinor ?? 0) - (order.refundedMinor ?? 0)) : 0;
  const goodsOnly = order?.status === "REJECTED";

  // Price of what is being returned now — a suggestion for the refund amount.
  const returnedValue = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((sum, it) => {
      const l = it.id != null ? lines[it.id] : undefined;
      return sum + (l ? l.qty * (it.gift ? 0 : it.priceMinor) : 0);
    }, 0);
  }, [order, lines]);

  if (!order) return null;
  const cur = order.currency;
  const refundMinor = Math.round((parseFloat(refund.replace(",", ".")) || 0) * 100);
  const units = Object.values(lines).reduce((s, l) => s + l.qty, 0);
  const tooMuch = refundMinor > refundable;
  const nothing = units === 0 && refundMinor === 0;
  const dirty = units > 0 || refund.trim() !== "" || note.trim() !== "";

  function setLine(id: number, patch: Partial<LineState>) {
    setLines((prev) => {
      const cur = prev[id] ?? { qty: 0, restock: true };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }

  function submit() {
    if (nothing || tooMuch) return;
    onSave({
      lines: Object.entries(lines)
        .filter(([, l]) => l.qty > 0)
        .map(([id, l]) => ({ itemId: Number(id), quantity: l.qty, restock: l.restock })),
      refundMinor,
      note: note.trim() || undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={dirty}
      title="↩️ Возврат"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={loading} disabled={nothing || tooMuch} onClick={submit}>
            Оформить возврат
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {goodsOnly ? (
          <p className="text-[13px] text-[var(--text-muted)]">
            Заказ отклонён — склад по нему уже учтён. Здесь можно записать только возврат денег.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Что вернули</div>
            {order.items.map((it, i) => {
              if (it.id == null) return null;
              const left = it.quantity - (it.returnedQty ?? 0);
              const l = lines[it.id] ?? { qty: 0, restock: true };
              return (
                <div key={it.id ?? i} className="rounded-[var(--r-md)] border-2 border-[var(--border-2)] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-bold text-[var(--text)]">
                        {it.gift && "🎁 "}
                        {it.title}
                      </div>
                      <div className="text-[12px] text-[var(--text-faint)]">
                        {it.variantName ? `${it.variantName} · ` : ""}в заказе {it.quantity} шт.
                        {(it.returnedQty ?? 0) > 0 && ` · уже возвращено ${it.returnedQty}`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StepBtn disabled={l.qty <= 0} onClick={() => setLine(it.id!, { qty: l.qty - 1 })}>
                        −
                      </StepBtn>
                      <span className="w-6 text-center text-[14px] font-black text-[var(--text)]">{l.qty}</span>
                      <StepBtn disabled={l.qty >= left} onClick={() => setLine(it.id!, { qty: l.qty + 1 })}>
                        +
                      </StepBtn>
                    </div>
                  </div>
                  {l.qty > 0 && (
                    <div className="mt-2">
                      <Toggle
                        checked={l.restock}
                        onChange={(v) => setLine(it.id!, { restock: v })}
                        label={`На склад: +${l.qty} шт.`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Input
            label={`Вернуть денег, ${cur}`}
            type="number"
            inputMode="decimal"
            value={refund}
            placeholder="0"
            onChange={(e) => setRefund(e.target.value)}
            error={tooMuch ? `Не больше полученного: ${money(refundable, cur)}` : undefined}
            hint={`Можно вернуть до ${money(refundable, cur)} (получено ${money(order.receivedMinor, cur)}${
              order.refundedMinor ? `, уже возвращено ${money(order.refundedMinor, cur)}` : ""
            }).`}
          />
          {returnedValue > 0 && (
            <button
              type="button"
              onClick={() => setRefund(String(Math.min(returnedValue, refundable) / 100))}
              className={cn("self-start text-[12px] font-bold text-[var(--accent)] hover:underline")}
            >
              Подставить стоимость возвращённого: {money(Math.min(returnedValue, refundable), cur)}
            </button>
          )}
        </div>
        <Input label="Комментарий (в журнал)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Modal>
  );
}

function StepBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="nb-press grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] text-[16px] font-black leading-none text-[var(--text)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
