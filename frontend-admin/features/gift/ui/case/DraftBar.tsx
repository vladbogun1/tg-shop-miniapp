"use client";

import { Rocket, Undo2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { money } from "@/lib/money";
import { fmtPct, type Summary } from "../../model/case-draft";
import { roundToUah } from "../../model/units";

/** Строка «кейс ≈ N ₴ · маржа X %»: результат правки виден, не уезжая от призов (цвет — как в сводке). */
function MiniSummary({ sum }: { sum: Summary }) {
  const tone = sum.costShare <= 70 ? "var(--ok,#3ecf8e)" : sum.costShare <= 100 ? "var(--warn)" : "var(--danger-ink)";
  return (
    <span className="tabular text-[12px] text-[var(--text-muted)]">
      кейс ≈ {money(roundToUah(sum.avgCostMinor))} ·{" "}
      <b style={{ color: tone }}>{fmtPct(sum.costShare, 0)} % маржи</b>
    </span>
  );
}

/**
 * Sticky-полоса конструктора: «Опубликовано · призов: N» (with «сбросить черновик» when a no-op draft is left) или
 * «Черновик · изменений: N» с «Отменить» и «Опубликовать» — кнопка остаётся под рукой при правке нижних редкостей.
 */
export function DraftBar({
  sum,
  changed,
  hasDraft,
  total,
  busy,
  onDiscard,
  onPublish,
}: {
  sum: Summary;
  changed: number;
  hasDraft: boolean;
  total: number;
  busy: boolean;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  const wrap = "sticky top-[var(--hdr-h,61px)] z-20 mt-3 min-w-0";
  if (!hasDraft || changed === 0) {
    return (
      <div className={wrap}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] bg-[var(--surface)]/90 py-1 text-[12.5px] text-[var(--text-faint)] backdrop-blur">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ok,#3ecf8e)]" aria-hidden />
            Опубликовано · призов: {total}
          </span>
          {hasDraft && (
            <button type="button" className="focusable underline-offset-2 hover:underline" onClick={onDiscard}>
              сбросить черновик
            </button>
          )}
          {total > 0 && <MiniSummary sum={sum} />}
        </div>
      </div>
    );
  }
  return (
    <div className={wrap}>
      <div className="card-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 !border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] !bg-[var(--surface-2)] px-3 py-2.5 shadow-[var(--shadow-2,0_6px_20px_rgba(0,0,0,.35))]">
        <div className="min-w-0 text-[13px] leading-snug">
          <b className="text-[var(--ink)]">Черновик</b> · изменений: <span className="tabular">{changed}</span> · <MiniSummary sum={sum} />
          <span className="block text-[12px] text-[var(--text-muted)]">Покупатели пока видят опубликованный кейс</span>
        </div>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} disabled={busy} onClick={onDiscard}>
            Отменить
          </Button>
          <Button size="sm" variant="accent" icon={<Rocket className="h-4 w-4" />} loading={busy} onClick={onPublish}>
            Опубликовать ({changed})
          </Button>
        </div>
      </div>
    </div>
  );
}
