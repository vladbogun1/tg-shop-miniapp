"use client";

/**
 * «Раздать брони»: ручная раздача после пополнения остатка не через поставку.
 * Всегда с подтверждением (сколько на складе и сколько человек ждёт) — автоматически не срабатывает.
 */
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { Gift } from "lucide-react";
import { peopleOfRows } from "../model/demand";
import type { Demand } from "../model/types";
import { useReleaseDemand } from "../queries";

/** Подтвердить и раздать брони по строкам «Чего ждут». Возвращает функцию-запуск и признак «идёт». */
export function useReleaseAction(): [(rows: Demand[], label?: string) => Promise<void>, boolean] {
  const confirm = useConfirm();
  const release = useReleaseDemand();

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
    await release.mutateAsync(rows).catch(() => undefined);
  }

  return [run, release.isPending];
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
  const [run, busy] = useReleaseAction();
  const disabled = rows.every((d) => d.stock <= 0);
  return (
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
  );
}
