"use client";

import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CHANNEL_OPTIONS, PERIOD_OPTIONS, todayIso } from "../model/period";
import type { PeriodParams, PeriodToken } from "../model/types";

export function PeriodPicker({ params, onChange }: { params: PeriodParams; onChange: (p: PeriodParams) => void }) {
  const [from, setFrom] = useState(params.from ?? "");
  const [to, setTo] = useState(params.to ?? "");
  // The remembered period arrives from localStorage after the first render: refill the fields then.
  const [shown, setShown] = useState({ from: params.from, to: params.to });
  if (shown.from !== params.from || shown.to !== params.to) {
    setShown({ from: params.from, to: params.to });
    setFrom(params.from ?? "");
    setTo(params.to ?? "");
  }
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || params.period === "custom";

  function pick(period: PeriodToken) {
    if (period === "custom") {
      setCustomOpen(true);
      if (from && to) onChange({ ...params, period, from, to });
      return;
    }
    setCustomOpen(false);
    onChange({ period, channel: params.channel });
  }

  const input =
    "h-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)] outline-none transition-[border-color,box-shadow] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)] pointer-coarse:h-9";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="thin-scroll -mx-1 max-w-full overflow-x-auto overflow-y-hidden px-1">
          <SegmentedControl size="sm" options={PERIOD_OPTIONS} value={showCustom ? "custom" : params.period} onChange={pick} />
        </div>
        <SegmentedControl
          size="sm"
          options={CHANNEL_OPTIONS}
          value={params.channel}
          onChange={(channel) => onChange({ ...params, channel })}
        />
      </div>
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <span>с</span>
          <input type="date" className={input} value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} />
          <span>по</span>
          <input type="date" className={input} value={to} min={from || undefined} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          <Button
            type="button"
            size="sm"
            variant="accent"
            disabled={!from || !to}
            onClick={() => onChange({ ...params, period: "custom", from, to })}
          >
            Показать
          </Button>
        </div>
      )}
    </div>
  );
}
