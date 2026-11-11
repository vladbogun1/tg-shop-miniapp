"use client";

/**
 * Вкладки доставки checkout v2 (відділення · поштомат · кур'єр · самовивіз) и переключатель «Ввести вручну /
 * Обрати на карті». Правила вкладок — @shop/customer/delivery/tabs (те же, что в Mini App); здесь только вид сайта.
 */
import { Box, Keyboard, Map as MapIcon, Store, Truck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import type { DeliveryTab } from "@shop/customer/delivery/tabs";
import { useI18n } from "@/i18n/context";

const TAB_ICON: Record<DeliveryTab, ReactNode> = {
  WAREHOUSE: <Store className="h-5 w-5" strokeWidth={2.5} />,
  POSTOMAT: <Box className="h-5 w-5" strokeWidth={2.5} />,
  DOORS: <Truck className="h-5 w-5" strokeWidth={2.5} />,
  PICKUP: <UserRound className="h-5 w-5" strokeWidth={2.5} />,
};

const TAB_KEY = {
  WAREHOUSE: "delivery.tab.warehouse",
  POSTOMAT: "delivery.tab.postomat",
  DOORS: "delivery.tab.courier",
  PICKUP: "delivery.tab.pickup",
} as const;

const SUB_KEY = {
  WAREHOUSE: "delivery.tab.warehouse.sub",
  POSTOMAT: "delivery.tab.postomat.sub",
  DOORS: "delivery.tab.courier.sub",
  PICKUP: "delivery.tab.pickup.sub",
} as const;

/**
 * 2 × 2 на телефонах, в один ряд, где колонка достаточно широкая (рядом со сводкой на 1024 px она узкая — снова
 * 2 × 2); длинная подпись переносится, а не раздвигает страницу.
 */
export function DeliveryTabs({ tabs, value, onChange }: { tabs: readonly DeliveryTab[]; value: DeliveryTab; onChange: (tab: DeliveryTab) => void }) {
  const { t } = useI18n();
  return (
    <div role="tablist" aria-label={t("delivery.tabs.label")} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
      {tabs.map((tab) => {
        const active = tab === value;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className={`flex min-h-[88px] min-w-0 flex-col items-start gap-1.5 rounded-[var(--r-card)] border p-3 text-left transition-[transform,border-color,background-color] active:scale-[.99] sm:p-4 ${
              active
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)]"
            }`}
          >
            {TAB_ICON[tab]}
            <span className="max-w-full break-words font-display text-[13px] font-bold uppercase leading-tight tracking-[.05em] sm:text-[14px]">
              {t(TAB_KEY[tab])}
            </span>
            <span className="max-w-full break-words text-[12px] font-medium leading-snug" style={{ color: active ? "var(--ink)" : "var(--muted)" }}>
              {t(SUB_KEY[tab])}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type NpPickMode = "text" | "map";

/** «Ввести вручну» / «Обрати на карті»: по умолчанию поля, карта — по нажатию (и грузится только тогда). */
export function NpModeSwitch({ mode, onChange }: { mode: NpPickMode; onChange: (m: NpPickMode) => void }) {
  const { t } = useI18n();
  const opts: { key: NpPickMode; label: string; icon: ReactNode }[] = [
    { key: "text", label: t("checkout.np.modeText"), icon: <Keyboard className="h-4 w-4" strokeWidth={2.25} /> },
    { key: "map", label: t("checkout.np.modeMap"), icon: <MapIcon className="h-4 w-4" strokeWidth={2.25} /> },
  ];
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface-2)] p-1">
      {opts.map((o) => {
        const on = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            className={`flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--r-card)-4px)] border px-2 text-[14px] font-semibold transition-colors ${
              on ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <span className="shrink-0">{o.icon}</span>
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
