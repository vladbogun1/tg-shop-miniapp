"use client";

/**
 * Day separators of the admin chats (order chat, «Поддержка»), Telegram-style: a centred chip
 * «Сегодня» / «Вчера» / «7 октября» (with the year for an earlier year) above each day's run of
 * messages. Each day is its own section, so its chip sticks to the top while that day scrolls by
 * and the next day's chip takes over. Days are the browser's (its time zone).
 */
import { useMemo, type ReactNode } from "react";
import { dayKey, dayLabel } from "@shop/shared";

export interface ChatDay<T> {
  key: string;
  label: string;
  items: T[];
}

/** Consecutive messages of one calendar day (the list is already oldest-first). */
export function useChatDays<T>(list: T[], createdAt: (item: T) => string): ChatDay<T>[] {
  return useMemo(() => {
    const out: ChatDay<T>[] = [];
    for (const item of list) {
      const iso = createdAt(item);
      const key = dayKey(iso);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(item);
      else out.push({ key, label: dayLabel(iso), items: [item] });
    }
    return out;
  }, [list, createdAt]);
}

export function ChatDaySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <div className="pointer-events-none sticky top-0 z-[1] flex justify-center py-1">
        <span className="font-display rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shadow-[0_2px_8px_rgba(0,0,0,.25)]">
          {label}
        </span>
      </div>
      {children}
    </section>
  );
}
