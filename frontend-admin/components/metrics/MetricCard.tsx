"use client";

/** MetricCard — single KPI tile on the metrics dashboard. */
import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  icon?: ReactNode;
}

export function MetricCard({ label, value, hint, accent, icon }: Props) {
  return (
    <div className="glass rounded-[var(--r-lg)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[var(--text-muted)]">
          {label}
        </span>
        {icon && (
          <span style={{ color: accent ?? "var(--text-faint)" }}>{icon}</span>
        )}
      </div>
      <div
        className="mt-1.5 text-[24px] font-bold leading-tight"
        style={{ color: accent ?? "var(--text)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-[var(--text-faint)]">{hint}</div>
      )}
    </div>
  );
}

/** ChartCard — glass panel wrapper for a chart with a title + empty state. */
export function ChartCard({
  title,
  empty,
  children,
  className,
}: {
  title: string;
  empty?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass rounded-[var(--r-lg)] p-4 ${className ?? ""}`}>
      <h3 className="mb-3 text-[14px] font-semibold text-[var(--text)]">
        {title}
      </h3>
      {empty ? (
        <div className="grid h-[220px] place-items-center text-[13px] text-[var(--text-faint)]">
          Нет данных за период
        </div>
      ) : (
        children
      )}
    </div>
  );
}
