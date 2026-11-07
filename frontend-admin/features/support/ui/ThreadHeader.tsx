"use client";

import { UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { customerOf, urgencyOf, waitingLabel, waitingMinutes } from "../model/thread";
import type { SupportThread } from "../model/types";
import { ThreadSourceBadge, ThreadStatusBadges } from "./parts";

/** Шапка вопроса: имя клиента (открывает профиль поверх, чат остаётся), статус и «ждёт N», источник. */
export function ThreadHeader({
  thread,
  nowMs,
  onOpenCustomer,
}: {
  thread: SupportThread | undefined;
  nowMs: number;
  onOpenCustomer: () => void;
}) {
  if (!thread) return <Skeleton className="h-10 w-48" />;
  const minutes = waitingMinutes(thread, nowMs);
  const urgency = urgencyOf(minutes);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="eyebrow !text-[10px]">Поддержка</div>
      {thread.userId ? (
        <button
          type="button"
          onClick={onOpenCustomer}
          title="Открыть профиль клиента"
          className="focusable hit group inline-flex min-w-0 items-center gap-1.5 self-start rounded-[var(--r-sm)] text-left"
        >
          <UserRound className="h-4 w-4 shrink-0 text-[var(--text-faint)] group-hover:text-[var(--accent-hi)]" />
          <span className="font-display truncate text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)] underline-offset-4 group-hover:text-[var(--accent-hi)] group-hover:underline">
            {customerOf(thread)}
          </span>
        </button>
      ) : (
        <div className="font-display truncate text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">{customerOf(thread)}</div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <ThreadStatusBadges thread={thread} />
        <ThreadSourceBadge source={thread.source} />
        {minutes != null && (
          <span
            className={cn(
              "tabular text-[12px] font-semibold",
              urgency === "danger" ? "text-[var(--danger-ink)]" : urgency === "warn" ? "text-[var(--warn)]" : "text-[var(--text-faint)]"
            )}
          >
            {waitingLabel(minutes)}
          </span>
        )}
      </div>
    </div>
  );
}
