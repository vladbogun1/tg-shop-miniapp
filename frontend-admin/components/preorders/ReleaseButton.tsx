"use client";

/**
 * «Раздать брони»: ручная раздача после пополнения остатка не через поставку.
 * Всегда с подтверждением (сколько на складе и сколько человек ждёт) — автоматически не срабатывает.
 */
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { ApiError } from "@/lib/api";
import { PREORDERS_KEY, peopleOfRows, releaseDemand, releaseSummary, type Demand } from "@/lib/preorders";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";

/** Подтвердить и раздать брони по строкам «Чего ждут». Возвращает функцию-запуск и элемент для рендера. */
export function useReleaseAction(): [(rows: Demand[], label?: string) => Promise<void>, ReactNode, boolean] {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const [busy, setBusy] = useState(false);

  async function run(rows: Demand[], label?: string) {
    if (rows.length === 0) return;
    const stock = rows.reduce((n, d) => n + d.stock, 0);
    const people = peopleOfRows(rows);
    const units = rows.reduce((n, d) => n + d.units, 0);
    const ok = await confirm({
      title: "Раздать брони?",
      message: (
        <div className="flex flex-col gap-1.5">
          {label && <div className="font-semibold text-[var(--text)]">{label}</div>}
          <div>
            На складе: <b className="text-[var(--text)]">{stock} шт</b>. Ждут: <b className="text-[var(--text)]">{people} чел / {units} шт</b>.
          </div>
          <div>Первые в очереди получат бронь и сообщение от бота. Остальные продолжат ждать.</div>
        </div>
      ),
      confirmLabel: "Раздать брони",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await releaseDemand(rows);
      push(releaseSummary(res), res.heldPeople > 0 ? "ok" : "info");
      qc.invalidateQueries({ queryKey: PREORDERS_KEY });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось раздать брони", "error");
    } finally {
      setBusy(false);
    }
  }

  return [run, confirmUi, busy];
}

export function ReleaseButton({
  rows,
  label,
  size = "sm",
  variant = "outline",
}: {
  rows: Demand[];
  label?: string;
  size?: "sm" | "md";
  variant?: "outline" | "accent";
}) {
  const [run, ui, busy] = useReleaseAction();
  const disabled = rows.every((d) => d.stock <= 0);
  return (
    <>
      <Button
        size={size}
        variant={variant}
        icon={<Gift className="h-4 w-4" />}
        loading={busy}
        disabled={disabled}
        title={disabled ? "На складе пусто — раздавать нечего" : undefined}
        onClick={() => run(rows, label)}
      >
        Раздать брони
      </Button>
      {ui}
    </>
  );
}
