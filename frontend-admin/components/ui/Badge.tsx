"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { OrderStatus } from "@/lib/api";
import { STATUS_LABEL, STATUS_VAR } from "@/lib/orders";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

/**
 * Tinted chips (DESIGN-V3 §6/§8): colour at 16% as the fill, text (and dot) in the colour itself,
 * no ink border. Exo 2 600 caps — the `.chip-tint` class in globals.css; `--chip` picks the hue.
 * Text colours are the lighter steps where the base hue is too dark on graphite (danger, accent).
 */
const TONE: Record<Tone, string> = {
  neutral: "var(--text-muted)",
  accent: "var(--accent-hi)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "#F87171",
  info: "var(--info)",
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
      className={cn("chip-tint", tone === "neutral" && "!bg-[var(--surface-3)]", className)}
      style={{ "--chip": TONE[tone] } as CSSProperties}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Order-status chip: the status hue (--st-*) at 16% + dot and text in the hue — as in the Mini App. */
export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn("chip-tint", className)} style={{ "--chip": STATUS_VAR[status] } as CSSProperties}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}
