"use client";

import { motion } from "framer-motion";
import { Box, Keyboard, Map as MapIcon, MapPin, Store, Truck, UserRound } from "lucide-react";
import type { DeliveryTab } from "@shop/customer/delivery/tabs";
import { Button } from "@shop/ui/primitives";
import type { NpWarehouse } from "@/lib/api";
import { useCheckoutT } from "@/i18n/checkout";
import { spring } from "@/lib/motion";
import { type NpMode, npLabel } from "../model/np-label";

const TAB_ICON: Record<DeliveryTab, React.ReactNode> = {
  WAREHOUSE: <Store className="h-5 w-5" />,
  POSTOMAT: <Box className="h-5 w-5" />,
  DOORS: <Truck className="h-5 w-5" />,
  PICKUP: <UserRound className="h-5 w-5" />,
};

const TAB_KEY = {
  WAREHOUSE: ["delivery.tab.warehouse", "delivery.tab.warehouse.sub"],
  POSTOMAT: ["delivery.tab.postomat", "delivery.tab.postomat.sub"],
  DOORS: ["delivery.tab.courier", "delivery.tab.courier.sub"],
  PICKUP: ["delivery.tab.pickup", "delivery.tab.pickup.sub"],
} as const;

/** Delivery tabs (checkout v2): відділення · поштомат · кур'єр · самовивіз, 2 × 2 (a long label wraps). */
export function DeliveryTabs({ tabs, value, onChange }: { tabs: readonly DeliveryTab[]; value: DeliveryTab; onChange: (t: DeliveryTab) => void }) {
  const t = useCheckoutT();
  return (
    <div role="tablist" aria-label={t("delivery.tabs.label")} className="grid grid-cols-2 gap-2.5">
      {tabs.map((tab) => {
        const active = tab === value;
        const [title, sub] = TAB_KEY[tab];
        return (
          <motion.button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            whileTap={{ scale: 0.98 }}
            onClick={() => onChange(tab)}
            className="tap flex min-h-0 min-w-0 flex-col items-start gap-1.5 rounded-[var(--r-card)] border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150"
            style={{
              background: active ? "linear-gradient(0deg, var(--accent-soft), var(--accent-soft)), var(--surface)" : "var(--surface)",
              borderColor: active ? "var(--accent)" : "var(--line)",
              color: "var(--ink)",
              boxShadow: active ? "0 0 22px -6px rgba(255,102,0,.45)" : "none",
            }}
          >
            <span style={{ color: active ? "var(--accent)" : "var(--muted)" }}>{TAB_ICON[tab]}</span>
            <span className="max-w-full break-words font-display text-[14px] font-bold uppercase leading-tight tracking-[0.05em]">{t(title)}</span>
            <span className="max-w-full break-words text-[11px] font-medium leading-snug" style={{ color: "var(--muted)" }}>
              {t(sub)}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** The picked branch as a card: the last order's one (badge + "Обрати інше") or the map pick. */
export function WarehouseCard({
  warehouse,
  badge,
  action,
}: {
  warehouse: NpWarehouse;
  badge?: string;
  action?: React.ReactNode;
}) {
  const t = useCheckoutT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex flex-col gap-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_-12px_var(--shadow)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)]">
          <MapPin className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold text-[var(--ink)]">{npLabel(warehouse, t)}</div>
          {badge && (
            <span className="font-display mt-1 inline-block rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              {badge}
            </span>
          )}
          <div className="mt-0.5 break-words text-[12px] font-medium text-[var(--muted)]">
            {warehouse.cityName ? `${warehouse.cityName}, ` : ""}
            {warehouse.description}
          </div>
        </div>
      </div>
      {action}
    </motion.div>
  );
}

/** "Ввести вручну" / "Обрати на карті" — a two-way segmented switch. */
export function NpModeSwitch({ mode, setMode }: { mode: NpMode; setMode: (m: NpMode) => void }) {
  const t = useCheckoutT();
  const opts: { key: NpMode; label: string; icon: React.ReactNode }[] = [
    { key: "text", label: t("checkout.np.modeText"), icon: <Keyboard className="h-4 w-4" strokeWidth={2.25} /> },
    { key: "map", label: t("checkout.np.modeMap"), icon: <MapIcon className="h-4 w-4" strokeWidth={2.25} /> },
  ];
  return (
    <div
      role="tablist"
      className="grid grid-cols-2 gap-1 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-1"
    >
      {opts.map((o) => {
        const on = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setMode(o.key)}
            className="tap flex min-h-[40px] min-w-0 items-center justify-center gap-1.5 rounded-[8px] border px-2 text-[13px] font-semibold transition-colors"
            style={{
              background: on ? "var(--accent-soft)" : "transparent",
              borderColor: on ? "var(--accent)" : "transparent",
              color: on ? "var(--accent-hi)" : "var(--muted)",
            }}
          >
            <span className="shrink-0">{o.icon}</span>
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
