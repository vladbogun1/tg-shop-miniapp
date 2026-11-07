"use client";

/**
 * Шапка метрик (вариант A): вкладки липнут под верхней панелью, чтобы переключаться без прокрутки
 * наверх. Ноутбук — период и канал в строке над вкладками; телефон — кнопка «период · даты» в
 * липкой полосе, сам выбор в шторке (PeriodSheet).
 */
import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useMediaQuery } from "@shop/ui/use-media";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CHANNEL_OPTIONS, PERIOD_OPTIONS, rangeLabel } from "../model/period";
import type { PeriodParams } from "../model/types";
import { ScopeBadge } from "./kit";
import { PeriodPicker } from "./PeriodPicker";
import { PeriodSheet } from "./PeriodSheet";

export interface HeaderTab<T extends string> {
  value: T;
  label: string;
}

export function MetricsHeader<T extends string>({
  params,
  onChange,
  tabs,
  tab,
  onTab,
  channelApplies,
}: {
  params: PeriodParams;
  onChange: (p: PeriodParams) => void;
  tabs: HeaderTab<T>[];
  tab: T;
  onTab: (t: T) => void;
  channelApplies: boolean;
}) {
  const phone = useMediaQuery("(max-width: 767px)");
  const [sheet, setSheet] = useState(false);
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === params.period)?.label ?? "";
  const channelLabel = CHANNEL_OPTIONS.find((o) => o.value === params.channel)?.label ?? "";

  return (
    <>
      {!phone && (
        <div className="mb-3">
          <PeriodPicker params={params} onChange={onChange} channelApplies={channelApplies} />
        </div>
      )}
      <div className="sticky top-[var(--hdr-h,61px)] z-20 -mx-4 mb-4 flex flex-col gap-2 bg-[var(--bg)] px-4 py-2 lg:-mx-7 lg:px-7">
        {phone && (
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="flex min-h-11 w-full items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-left"
            aria-label="Выбрать период и канал"
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-[var(--accent)]" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text)]">
              {periodLabel} <span className="font-normal text-[var(--text-muted)] mx-num">· {rangeLabel(params)}</span>
            </span>
            {channelApplies ? (
              <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{channelLabel}</span>
            ) : (
              <ScopeBadge>все каналы</ScopeBadge>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          </button>
        )}
        <div className="thin-scroll -mx-1 overflow-x-auto overflow-y-hidden px-1">
          <SegmentedControl options={tabs} value={tab} onChange={onTab} />
        </div>
      </div>
      {phone && (
        <PeriodSheet
          key={`${params.from ?? ""}-${params.to ?? ""}`}
          open={sheet}
          params={params}
          channelApplies={channelApplies}
          onChange={onChange}
          onClose={() => setSheet(false)}
        />
      )}
    </>
  );
}
