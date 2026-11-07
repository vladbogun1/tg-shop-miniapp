"use client";

/**
 * Колонка «входов» экрана «Поставки» (вариант B макета): статусы поставок, «Что заказать», «Поставщики» — со счётчиками.
 * На ноутбуке — вертикальная колонка слева, на телефоне и планшете — одна прокручиваемая лента чипов (цель касания 44px).
 */
import { cn } from "@/lib/cn";

export type SupplyView = "open" | "arrived" | "cancelled" | "all" | "demand" | "suppliers";

export interface RailItem {
  value: SupplyView;
  label: string;
  count?: number;
  /** Акцентный счётчик («Что заказать»: ждут люди). */
  hot?: boolean;
}

export function BatchRail({ items, value, onChange }: { items: RailItem[]; value: SupplyView; onChange: (v: SupplyView) => void }) {
  return (
    <nav
      aria-label="Разделы поставок"
      className="thin-scroll -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:mb-0 lg:w-[212px] lg:shrink-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {items.map((it, i) => {
        const active = it.value === value;
        const divider = it.value === "demand";
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition-colors lg:min-h-[38px] lg:rounded-[var(--r-md)]",
              divider && i > 0 && "lg:mt-3",
              active
                ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
            )}
          >
            {it.label}
            {it.count != null && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[11.5px] font-bold",
                  it.hot && it.count > 0 ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--text-faint)]",
                )}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
