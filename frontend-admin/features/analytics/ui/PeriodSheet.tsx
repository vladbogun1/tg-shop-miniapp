"use client";

/**
 * Телефон: период и канал открываются шторкой из липкой шапки. Пресеты крупными кнопками, «Свой»
 * с двумя датами, канал и строка «Сравниваем с …» (подпись из PREV_LABEL — выбора сравнения в API нет).
 */
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { CHANNEL_OPTIONS, PERIOD_OPTIONS, PREV_LABEL, todayIso } from "../model/period";
import type { PeriodParams, PeriodToken } from "../model/types";
import { ScopeBadge } from "./kit";

const DATE_INPUT =
  "h-11 min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--accent)]";

export function PeriodSheet({
  open,
  params,
  channelApplies,
  onChange,
  onClose,
}: {
  open: boolean;
  params: PeriodParams;
  channelApplies: boolean;
  onChange: (p: PeriodParams) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(params.from ?? "");
  const [to, setTo] = useState(params.to ?? "");
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || params.period === "custom";

  function pick(period: PeriodToken) {
    if (period === "custom") {
      setCustomOpen(true);
      return;
    }
    onChange({ period, channel: params.channel });
    onClose();
  }

  return (
    <ActionSheet open={open} title="Период" onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {PERIOD_OPTIONS.map((o) => {
          const active = (showCustom ? "custom" : params.period) === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className={cn(
                "min-h-11 rounded-[var(--r-md)] border px-3 text-[14px] font-semibold",
                active
                  ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {showCustom && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
            <span>с</span>
            <input type="date" className={DATE_INPUT} value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} />
            <span>по</span>
            <input type="date" className={DATE_INPUT} value={to} min={from || undefined} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="accent"
            className="w-full"
            disabled={!from || !to}
            onClick={() => {
              onChange({ ...params, period: "custom", from, to });
              onClose();
            }}
          >
            Показать
          </Button>
        </div>
      )}
      <div className="mb-3">
        <div className="field-label mb-1.5">Канал</div>
        {channelApplies ? (
          <SegmentedControl options={CHANNEL_OPTIONS} value={params.channel} onChange={(channel) => onChange({ ...params, channel })} />
        ) : (
          <ScopeBadge>на этой вкладке канал не учитывается — все каналы</ScopeBadge>
        )}
      </div>
      <p className="text-[12px] text-[var(--text-faint)]">Сравниваем {PREV_LABEL[params.period]}</p>
    </ActionSheet>
  );
}
