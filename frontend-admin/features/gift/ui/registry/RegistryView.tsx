"use client";

/**
 * The period's numbers, the over-limit warning, the filter and the gifts: «Список» (a table / cards) or
 * «По людям» (a card per person and month with a limit bar). The filter only narrows what is shown — the CSV has all rows.
 */
import { useState } from "react";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { filterRows, REGISTRY_FILTERS, type RegistryFilter } from "../../model/registry-view";
import type { GiftRegistry } from "../../model/types";
import { RegistryList } from "./RegistryList";
import { RegistryPeople } from "./RegistryPeople";

type Mode = "list" | "people";

export function RegistryView({ data }: { data: GiftRegistry }) {
  const [filter, setFilter] = useState<RegistryFilter>("all");
  const [mode, setMode] = useState<Mode>("list");
  const tiles = [
    { label: "Подарков", value: String(data.count) },
    { label: "На сумму", value: money(data.totalMinor) },
    { label: "Людей", value: String(data.people) },
    {
      label: "Сверх лимита",
      value: String(data.overLimit),
      hint: data.limitMinor > 0 ? `лимит ${money(data.limitMinor)} в месяц` : "лимит выключен",
      warn: data.overLimit > 0,
    },
  ];
  const rows = filterRows(data.rows, filter);
  return (
    <>
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card-2 min-w-0 px-3 py-2.5">
            <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">{t.label}</div>
            <div
              className={cn(
                "tabular mt-1 break-words font-display text-[18px] font-bold leading-tight",
                t.warn ? "text-[var(--danger-ink)]" : "text-[var(--ink)]"
              )}
            >
              {t.value}
            </div>
            {t.hint && <div className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">{t.hint}</div>}
          </div>
        ))}
      </div>

      {data.overLimit > 0 && (
        <p className="mb-4 flex items-start gap-2 text-[13px] leading-snug text-[var(--warn)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            У {data.overLimit} {data.overLimit === 1 ? "человека" : "человек"} подарки за месяц дороже лимита — с превышения
            удерживается НДФЛ и военный сбор. Покажите строки бухгалтеру.
          </span>
        </p>
      )}

      {data.rows.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Подарков за период нет"
          description="Отменённые заказы и возвращённые подарки сюда не попадают."
        />
      ) : (
        <>
          <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <SegmentedControl<RegistryFilter>
              size="sm"
              value={filter}
              onChange={setFilter}
              options={REGISTRY_FILTERS.map((f) => ({ ...f, count: f.value === "over" ? data.overLimit : undefined }))}
            />
            <SegmentedControl<Mode>
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "list", label: "Список" },
                { value: "people", label: "По людям" },
              ]}
            />
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={FileSpreadsheet} title="Под фильтр ничего не попало" description="Выберите «Все», чтобы увидеть все подарки периода." />
          ) : mode === "list" ? (
            <RegistryList rows={rows} />
          ) : (
            <RegistryPeople rows={rows} limitMinor={data.limitMinor} />
          )}
        </>
      )}
    </>
  );
}
