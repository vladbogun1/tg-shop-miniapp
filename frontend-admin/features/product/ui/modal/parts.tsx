"use client";

import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyStep({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="hud-frame flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--line)] px-6 py-10 text-center">
      <SlidersHorizontal className="h-6 w-6 text-[var(--text-faint)]" />
      <p className="max-w-sm text-[13px] text-[var(--text-muted)]">{text}</p>
      {action}
    </div>
  );
}

export function Warning({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-2.5 text-[13px] leading-snug text-[var(--text)]",
        !compact && "mt-4"
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      <span>{children}</span>
    </div>
  );
}
