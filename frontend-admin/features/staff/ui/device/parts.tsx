import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: "ok" | "warn" | "muted" }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b border-[var(--line)] py-1.5 last:border-b-0">
      <span className="text-[13px] text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "text-right text-[13px] font-semibold",
          tone === "ok" && "text-[var(--ok)]",
          tone === "warn" && "text-[var(--danger-ink)]",
          (!tone || tone === "muted") && "text-[var(--text)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function Note({ icon, children, warn }: { icon: ReactNode; children: ReactNode; warn?: boolean }) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-[var(--r-md)] border p-3 text-[13px] leading-relaxed",
        warn
          ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--text)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
