"use client";

/**
 * «Посылка вернулась» (POST /orders/{id}/return-received): the parcel is back at the shop — a
 * refused one, or the units of a delivered order the return wizard sent «едет назад».
 * Everything not marked as брак goes back on the shelf; брак is written off («Списания»).
 * Each line has a «Брак» switch; with several units a counter says how many of them are broken.
 */
import { useEffect, useState } from "react";
import type { AdminOrderDetail, ReturnReceivedBody } from "@/lib/orders-api";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";

type Item = AdminOrderDetail["items"][number];

export function ReturnReceivedModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: AdminOrderDetail | null;
  onClose: () => void;
  onSave: (body: ReturnReceivedBody) => Promise<unknown> | void;
  loading?: boolean;
}) {
  /** itemId → units that came back damaged (to write off). */
  const [defect, setDefect] = useState<Record<number, number>>({});
  const [note, setNote] = useState("");

  const orderId = order?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setDefect({});
    setNote("");
  }, [open, orderId]);

  if (!order) return null;

  // Units on their way back; a refused parcel registered before the per-line count travels whole.
  const anyPending = order.items.some((it) => (it.returnPendingQty ?? 0) > 0);
  const travelling = (it: Item) =>
    anyPending ? it.returnPendingQty ?? 0 : order.status === "REJECTED" ? it.quantity - (it.returnedQty ?? 0) : 0;
  const rows = order.items.filter((it) => it.id != null && travelling(it) > 0);
  const totalDefect = Object.values(defect).reduce((s, n) => s + n, 0);

  function submit() {
    const lines: ReturnReceivedBody["lines"] = [];
    for (const it of rows) {
      const left = travelling(it);
      const d = Math.min(defect[it.id!] ?? 0, left);
      if (left - d > 0) lines.push({ itemId: it.id!, quantity: left - d, outcome: "RESTOCK" });
      if (d > 0) lines.push({ itemId: it.id!, quantity: d, outcome: "DEFECT" });
    }
    onSave({ lines, note: note.trim() || undefined });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={totalDefect > 0 || note.trim() !== ""}
      title="📦 Посылка вернулась"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={loading} disabled={rows.length === 0} onClick={submit}>
            Принять на склад
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[var(--text-muted)]">
          Всё вернётся на склад. Если что-то пришло сломанным — включите «Брак», оно спишется.
        </p>
        {rows.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">Все позиции уже учтены.</p>}
        {rows.map((it) => {
          const left = travelling(it);
          const d = defect[it.id!] ?? 0;
          const setD = (n: number) => setDefect((p) => ({ ...p, [it.id!]: Math.max(0, Math.min(left, n)) }));
          return (
            <div
              key={it.id}
              className={cn(
                "card-2 flex flex-col gap-2 px-3 py-2.5",
                d > 0 && "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Image
                  src={it.imageUrl ?? undefined}
                  alt={it.title}
                  size={80}
                  className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">
                    {it.gift && "🎁 "}
                    {it.title}
                  </div>
                  <div className="text-[12px] text-[var(--text-faint)]">
                    {it.variantName ? `${it.variantName} · ` : ""}вернулось {left} шт. · на склад{" "}
                    <b className="tabular text-[var(--text-muted)]">{left - d}</b>
                    {d > 0 && (
                      <>
                        {" "}· спишется <b className="tabular text-[var(--danger-ink)]">{d}</b>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <Toggle checked={d > 0} onChange={(on) => setD(on ? (left > 1 ? 1 : left) : 0)} label="Брак" />
                </div>
              </div>
              {d > 0 && left > 1 && (
                <div className="flex items-center justify-end gap-2 text-[12.5px] text-[var(--text-muted)]">
                  <span>Сколько бракованных:</span>
                  <StepBtn label="Меньше бракованных" disabled={d <= 1} onClick={() => setD(d - 1)}>
                    −
                  </StepBtn>
                  <span className="tabular w-6 text-center text-[14px] font-semibold text-[var(--text)]">{d}</span>
                  <StepBtn label="Больше бракованных" disabled={d >= left} onClick={() => setD(d + 1)}>
                    +
                  </StepBtn>
                  <span>из {left}</span>
                </div>
              )}
            </div>
          );
        })}
        <Input label="Комментарий (в журнал)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Modal>
  );
}

function StepBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="nb-press grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
