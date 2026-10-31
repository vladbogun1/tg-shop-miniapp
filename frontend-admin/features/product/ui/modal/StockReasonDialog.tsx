"use client";

/**
 * «Почему уменьшился остаток?» — asked when a product form is saved with a lowered stock. The reason
 * goes to the server (stockReason / stockNote) and lands in «Списания». Promise-based like useConfirm:
 *
 *   const [askReason, reasonUi] = useStockReason();
 *   const r = await askReason(3);            // null = the admin cancelled
 *   body = { ...body, stockReason: r.reason, stockNote: r.note };
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import { WRITEOFF_REASONS, type WriteoffReason } from "@/features/inventory";

export interface StockReason {
  reason: WriteoffReason;
  note?: string;
}

function StockReasonModal({
  open,
  units,
  onResult,
}: {
  open: boolean;
  units: number;
  onResult: (r: StockReason | null) => void;
}) {
  const [reason, setReason] = useState<WriteoffReason | null>(null);
  const [note, setNote] = useState("");
  const needsNote = reason === "OTHER";
  const canSubmit = reason !== null && (!needsNote || note.trim().length > 0);

  const submit = () => {
    if (!reason || !canSubmit) return;
    onResult({ reason, note: note.trim() || undefined });
    setReason(null);
    setNote("");
  };
  const cancel = () => {
    onResult(null);
    setReason(null);
    setNote("");
  };

  return (
    <Modal
      open={open}
      onClose={cancel}
      size="sm"
      title="Почему уменьшился остаток?"
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>
            Отмена
          </Button>
          <Button variant="accent" disabled={!canSubmit} onClick={submit}>
            Сохранить
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] text-[var(--text-muted)]">
        Остаток уменьшен на {units} шт. Укажите причину — списание попадёт в отчёт «Списания».
      </p>
      <div role="radiogroup" aria-label="Причина списания" className="flex flex-col gap-1.5">
        {WRITEOFF_REASONS.map((r) => {
          const on = reason === r.value;
          return (
            <label
              key={r.value}
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--r-md)] border px-3 py-2 text-[14px] transition-colors",
                on
                  ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)]"
                  : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--border-2)]"
              )}
            >
              <input
                type="radio"
                name="stock-reason"
                value={r.value}
                checked={on}
                onChange={() => setReason(r.value)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {r.label}
            </label>
          );
        })}
      </div>
      {reason && (
        <div className="mt-3">
          <Textarea
            label={needsNote ? "Что случилось (обязательно)" : "Пояснение (необязательно)"}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}

/** Returns `ask(units)` (resolves with the chosen reason, or null on cancel) and the element to render. */
export function useStockReason(): [(units: number) => Promise<StockReason | null>, ReactNode] {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState(0);
  const resolver = useRef<((r: StockReason | null) => void) | null>(null);

  const ask = useCallback((n: number) => {
    resolver.current?.(null);
    setUnits(n);
    setOpen(true);
    return new Promise<StockReason | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const onResult = useCallback((r: StockReason | null) => {
    setOpen(false);
    const res = resolver.current;
    resolver.current = null;
    res?.(r);
  }, []);

  return [ask, <StockReasonModal key="stock-reason" open={open} units={units} onResult={onResult} />];
}
