"use client";

/**
 * «Посылка вернулась» (POST /orders/{id}/return-received): the parcel is back at the shop — a
 * refused one, or the units of a delivered order the return wizard sent «едет назад».
 * Everything not marked as брак goes back on the shelf; брак is written off («Списания»).
 */
import { useEffect, useState } from "react";
import type { AdminOrderDetail, ReturnReceivedBody } from "@/lib/orders-api";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Image } from "@/lib/image";

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
          Всё, что не отмечено браком, вернётся на склад. Бракованное спишется.
        </p>
        {rows.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">Все позиции уже учтены.</p>}
        {rows.map((it) => {
          const left = travelling(it);
          const d = defect[it.id!] ?? 0;
          return (
            <div key={it.id} className="card-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
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
                    {d > 0 && <> · брак <b className="tabular text-[var(--text-muted)]">{d}</b></>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5" title="Сколько штук бракованных">
                  <span className="text-[11.5px] text-[var(--text-faint)]">брак</span>
                  <button
                    type="button"
                    disabled={d <= 0}
                    onClick={() => setDefect((p) => ({ ...p, [it.id!]: d - 1 }))}
                    className="nb-press grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="tabular w-6 text-center text-[14px] font-semibold text-[var(--text)]">{d}</span>
                  <button
                    type="button"
                    disabled={d >= left}
                    onClick={() => setDefect((p) => ({ ...p, [it.id!]: d + 1 }))}
                    className="nb-press grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <Input label="Комментарий (в журнал)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Modal>
  );
}
