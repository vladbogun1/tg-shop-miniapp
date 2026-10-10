"use client";

/**
 * Building blocks of the metrics page: panels, KPI tiles with a ▲▼ delta and a sparkline, notes and
 * inline bars. Text always wears text tokens; colour only marks the data.
 */
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Info, Minus, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/cn";
import { riseItem } from "@/lib/motion";
import type { Kpi } from "./api";
import { pct } from "./format";

export function Panel({
  title,
  icon: Icon,
  hint,
  actions,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section variants={riseItem} className={cn("panel min-w-0 p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="section-title flex items-center gap-2">
            {Icon && <Icon className="h-[17px] w-[17px] shrink-0 text-[var(--accent)]" />}
            {title}
          </h3>
          {hint && <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">{hint}</p>}
        </div>
        {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </motion.section>
  );
}

/**
 * ▲▼ change vs the comparison period. `goodWhenUp=false` for metrics where growth is bad (rejects).
 * Colour + arrow + sign, never colour alone.
 */
export function Delta({ kpi, goodWhenUp = true, suffix }: { kpi: Kpi; goodWhenUp?: boolean; suffix?: string }) {
  if (kpi.changePct == null) {
    return <span className="text-[12px] text-[var(--text-faint)]">нет данных для сравнения</span>;
  }
  const up = kpi.changePct > 0;
  const flat = Math.abs(kpi.changePct) < 0.5;
  const good = flat ? null : up === goodWhenUp;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[12px]">
      <span
        className="font-display inline-flex items-center gap-0.5 font-bold mx-num"
        style={{ color: good == null ? "var(--text-muted)" : good ? "var(--mx-up)" : "var(--mx-down)" }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={3} />
        {up ? "+" : ""}
        {pct(kpi.changePct)}
      </span>
      {suffix && <span className="text-[var(--text-faint)]">{suffix}</span>}
    </span>
  );
}

export function KpiTile({
  label,
  value,
  kpi,
  goodWhenUp = true,
  prevLabel,
  prevValue,
  spark,
  hint,
}: {
  label: string;
  value: string;
  kpi?: Kpi;
  goodWhenUp?: boolean;
  prevLabel?: string;
  prevValue?: string;
  spark?: number[];
  hint?: ReactNode;
}) {
  const data = spark?.map((v, i) => ({ i, v }));
  return (
    <motion.div variants={riseItem} className="card flex min-w-0 flex-col gap-1.5 p-4">
      <div className="field-label !text-[11px]">{label}</div>
      <div className="kpi-num text-[24px]">{value}</div>
      {data && data.length > 1 && (
        <div className="h-7 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
              <Line type="monotone" dataKey="v" stroke="var(--mx-s1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {kpi && <Delta kpi={kpi} goodWhenUp={goodWhenUp} suffix={prevLabel} />}
      {prevValue && kpi?.prev != null && (
        <div className="text-[11px] text-[var(--text-faint)]">было: {prevValue}</div>
      )}
      {hint && <div className="text-[11px] leading-snug text-[var(--text-faint)]">{hint}</div>}
    </motion.div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-[12px] leading-snug text-[var(--text-muted)]">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-[13px] text-[var(--text-faint)]">{children}</div>;
}

/** Thin inline bar for table cells (share of the column max). */
export function InlineBar({ value, max, color = "var(--mx-s1)" }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full min-w-[60px] overflow-hidden rounded-full bg-[var(--surface-3)]">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** Horizontally scrollable table wrapper so a wide table never widens the page on a phone. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="thin-scroll -mx-1 overflow-x-auto px-1">{children}</div>;
}

/** Long tables show the first rows and a "show all" toggle so a 100-row table does not bury the page. */
export function useLimited<T>(rows: T[], initial = 10): { visible: T[]; toggle: ReactNode } {
  const [all, setAll] = useState(false);
  const visible = all ? rows : rows.slice(0, initial);
  const toggle =
    rows.length > initial ? (
      <button
        type="button"
        onClick={() => setAll((v) => !v)}
        className="mt-2 text-[12px] font-semibold text-[var(--accent-hi)] hover:underline"
      >
        {all ? "Свернуть" : `Показать все (${rows.length})`}
      </button>
    ) : null;
  return { visible, toggle };
}

/** Status chip: icon + label, never colour alone. */
export function StatusChip({ tone, children }: { tone: "danger" | "warn" | "ok" | "muted"; children: ReactNode }) {
  const c = tone === "danger" ? "#F87171" : tone === "warn" ? "var(--warn)" : tone === "ok" ? "var(--ok)" : "var(--text-muted)";
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: tone === "muted" ? "var(--surface-3)" : `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}
    >
      {children}
    </span>
  );
}
