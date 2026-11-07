"use client";

/**
 * Phone: the orders period as on the metrics page — a full-width «📅 30 дней · к чему относится ▾»
 * button, the choice in a bottom sheet (presets as big buttons, «Свой» with two dates).
 * The segmented presets did not fit a phone and were shown only inside closed statuses, so the period
 * could not be found from the status list at all.
 */
import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";
import { todayIso } from "@/features/analytics";
import { Button } from "@shop/ui/admin-button";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { cn } from "@/lib/cn";
import { ORDERS_PERIOD_OPTIONS, periodLabel, type OrdersPeriod, type OrdersRange } from "../model/period";

const DATE_INPUT =
  "h-11 min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--accent)]";

interface SheetProps {
  open: boolean;
  value: OrdersPeriod;
  scope: string;
  onChange: (p: OrdersPeriod) => void;
  onClose: () => void;
}

function PeriodSheet({ open, value, scope, onChange, onClose }: SheetProps) {
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const [customOpen, setCustomOpen] = useState(false);
  const current = customOpen || value.range === "custom" ? "custom" : value.range;

  function pick(range: OrdersRange) {
    if (range === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange({ range });
    onClose();
  }

  return (
    <ActionSheet open={open} title="Период" onClose={onClose}>
      <p className="mb-3 text-[12.5px] text-[var(--text-muted)]">Применяется к: {scope}</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {ORDERS_PERIOD_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={current === o.value}
            onClick={() => pick(o.value)}
            className={cn(
              "min-h-11 rounded-[var(--r-md)] border px-3 text-[14px] font-semibold",
              current === o.value
                ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {current === "custom" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
            <span>с</span>
            <input type="date" aria-label="С даты" className={DATE_INPUT} value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} />
            <span>по</span>
            <input type="date" aria-label="По дату" className={DATE_INPUT} value={to} min={from || undefined} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="accent"
            className="w-full"
            disabled={!from || !to}
            onClick={() => {
              onChange({ range: "custom", from, to });
              onClose();
            }}
          >
            Показать
          </Button>
        </div>
      )}
    </ActionSheet>
  );
}

export function OrdersPeriodButton({
  value,
  onChange,
  scope,
}: {
  value: OrdersPeriod;
  onChange: (p: OrdersPeriod) => void;
  /** What the period filters here: «Доставлен и Отклонён» on the board, «все заказы» in the table. */
  scope: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Период: ${periodLabel(value)}. Применяется к: ${scope}`}
        className="nb-press flex min-h-11 w-full items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-left"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-[var(--accent)]" />
        <span className="shrink-0 text-[14px] font-semibold text-[var(--text)]">{periodLabel(value)}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-muted)]">· {scope}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
      </button>
      <PeriodSheet key={`${value.from ?? ""}-${value.to ?? ""}`} open={open} value={value} scope={scope} onChange={onChange} onClose={() => setOpen(false)} />
    </>
  );
}
