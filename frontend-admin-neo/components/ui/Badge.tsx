"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { OrderStatus } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/orders";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--surface-3)] text-[var(--text-muted)] border-[var(--line)]",
  accent: "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--line)]",
  ok: "bg-[var(--ok)] text-[var(--accent-ink)] border-[var(--line)]",
  warn: "bg-[var(--warn)] text-[var(--accent-ink)] border-[var(--line)]",
  danger: "bg-[var(--danger)] text-[var(--accent-ink)] border-[var(--line)]",
  info: "bg-[var(--info)] text-[var(--accent-ink)] border-[var(--line)]",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border-[2px] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        TONE[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<OrderStatus, Tone> = {
  NEW: "info",
  APPROVED: "ok",
  SHIPPED: "warn",
  DELIVERED: "accent",
  REJECTED: "danger",
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border-[2px] border-[var(--line)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--accent-ink)]",
        className
      )}
      style={{
        backgroundColor: `var(--st-${status.toLowerCase()})`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ink)]" />
      {STATUS_LABEL[status]}
    </span>
  );
}
