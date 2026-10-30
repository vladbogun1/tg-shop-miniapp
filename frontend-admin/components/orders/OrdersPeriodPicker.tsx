"use client";

/**
 * Period of the orders board / table: the segmented presets and, for «Свой», two dates + «Показать»
 * (the same row as on the metrics page), on a line of its own under the presets so it never scrolls
 * away with them. On a phone the presets scroll sideways inside themselves.
 */
import { useState, type ReactNode } from "react";
import { todayIso } from "@/components/metrics/period";
import { Button } from "@shop/ui/admin-button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ORDERS_PERIOD_OPTIONS, type OrdersPeriod, type OrdersRange } from "@/lib/orders-period";

export function OrdersPeriodPicker({
  value,
  onChange,
  label,
}: {
  value: OrdersPeriod;
  onChange: (p: OrdersPeriod) => void;
  /** Shown before the presets (the board says what the period applies to). */
  label?: ReactNode;
}) {
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  // The remembered period arrives from localStorage after the first render: refill the fields then.
  const [shown, setShown] = useState({ from: value.from, to: value.to });
  if (shown.from !== value.from || shown.to !== value.to) {
    setShown({ from: value.from, to: value.to });
    setFrom(value.from ?? "");
    setTo(value.to ?? "");
  }
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || value.range === "custom";

  function pick(range: OrdersRange) {
    if (range === "custom") {
      setCustomOpen(true);
      if (from && to) onChange({ range, from, to });
      return;
    }
    setCustomOpen(false);
    onChange({ range });
  }

  const input =
    "h-10 min-w-[130px] flex-1 sm:w-[150px] sm:flex-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)] outline-none transition-[border-color,box-shadow] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)] pointer-coarse:h-11";

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2">
      <div className="thin-scroll flex max-w-full items-center gap-2 overflow-x-auto">
        {label}
        <SegmentedControl
          options={ORDERS_PERIOD_OPTIONS}
          value={showCustom ? "custom" : value.range}
          onChange={pick}
          className="h-10 shrink-0 pointer-coarse:h-11"
        />
      </div>
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-muted)] sm:flex-nowrap">
          <span>с</span>
          <input type="date" aria-label="С даты" className={input} value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} />
          <span>по</span>
          <input type="date" aria-label="По дату" className={input} value={to} min={from || undefined} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          <Button
            type="button"
            variant="accent"
            disabled={!from || !to || (value.range === "custom" && from === value.from && to === value.to)}
            onClick={() => onChange({ range: "custom", from, to })}
          >
            Показать
          </Button>
        </div>
      )}
    </div>
  );
}
