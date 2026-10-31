"use client";

import { FileText, History, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TabName } from "./use-drawer-modals";

const TABS = [
  ["details", "Детали", FileText],
  ["chat", "Чат", MessageSquare],
  ["history", "История", History],
] as const;

/** Tabs — SegmentedControl look: --bg-2 track, active = orange tint + orange hairline. */
export function DrawerTabs({ tab, onChange, unread }: { tab: TabName; onChange: (t: TabName) => void; unread: number }) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] px-4 py-2.5 sm:px-5">
      <div className="flex gap-0.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px] sm:inline-flex">
        {TABS.map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={cn(
              "font-display hit flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] border px-3 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors sm:flex-none pointer-coarse:h-10",
              tab === t
                ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
            {t === "chat" && unread > 0 && <span className="count-badge count-badge--danger">{unread}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
