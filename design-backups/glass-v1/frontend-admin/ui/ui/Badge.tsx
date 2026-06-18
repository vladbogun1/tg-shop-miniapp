"use client";

/** Badge — small glass pill for delivery/payment/status/unread markers. */
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  color?: string;
  icon?: ReactNode;
  className?: string;
}

export function Badge({ children, color, icon, className }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--r-pill)] px-2 py-0.5 text-[11px] font-medium ${className ?? ""}`}
      style={{
        background: color ? `color-mix(in srgb, ${color} 22%, transparent)` : "var(--glass-bg)",
        color: color ?? "var(--text-muted)",
      }}
    >
      {icon}
      {children}
    </span>
  );
}
