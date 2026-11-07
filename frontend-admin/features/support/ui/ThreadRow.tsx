"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { timeAgo } from "@shop/core/time";
import { customerOf, threadTopic, urgencyOf, waitingLabel, waitingMinutes, type Urgency } from "../model/thread";
import { loadDraft } from "../model/draft";
import type { SupportThread } from "../model/types";
import { ProductThumb, ThreadSourceBadge, ThreadStatusBadges } from "./parts";

const URGENCY_TEXT: Record<Urgency, string> = {
  calm: "text-[var(--text-faint)]",
  warn: "text-[var(--warn)]",
  danger: "text-[var(--danger-ink)]",
};

const URGENCY_BAR: Record<Urgency, string> = {
  calm: "shadow-[inset_2px_0_0_var(--accent),var(--shadow-1)]",
  warn: "shadow-[inset_3px_0_0_var(--warn),var(--shadow-1)]",
  danger: "shadow-[inset_3px_0_0_var(--danger),var(--shadow-1)]",
};

/** Строка очереди: клиент, сколько ждёт (цвет по срочности), тема, превью, статус, источник, «черновик». */
export function ThreadRow({
  thread,
  index,
  active,
  nowMs,
  onOpen,
}: {
  thread: SupportThread;
  index: number;
  active: boolean;
  nowMs: number;
  onOpen: () => void;
}) {
  const minutes = waitingMinutes(thread, nowMs);
  const urgency = urgencyOf(minutes);
  const lastByAdmin = thread.lastSender === "ADMIN";
  const hasDraft = loadDraft(thread.id).trim().length > 0;
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.025, ease: [0.22, 1, 0.36, 1] }}
      className="list-none"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "card card-hover focusable flex w-full items-start gap-3 p-3 text-left lg:p-3",
          minutes != null && URGENCY_BAR[urgency],
          active && "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)]",
          thread.status === "CLOSED" && "opacity-80"
        )}
      >
        <ProductThumb thread={thread} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-[var(--text)]">{customerOf(thread)}</span>
            {thread.unreadCount > 0 && (
              <span className="count-badge shrink-0" title="Непрочитанные сообщения">
                {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
              </span>
            )}
            <span
              className={cn(
                "tabular ml-auto shrink-0 text-[12px]",
                minutes != null ? cn("font-semibold", URGENCY_TEXT[urgency]) : "text-[var(--text-faint)]"
              )}
            >
              {minutes != null ? waitingLabel(minutes) : timeAgo(thread.lastMessageAt)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{threadTopic(thread)}</div>
          {thread.lastPreview && (
            <div
              className={cn(
                "mt-0.5 line-clamp-1 break-words text-[13px]",
                thread.unreadCount > 0 ? "text-[var(--text)]" : "text-[var(--text-faint)]"
              )}
            >
              {lastByAdmin && <span className="text-[var(--text-faint)]">Вы: </span>}
              {thread.lastPreview}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ThreadStatusBadges thread={thread} />
            <ThreadSourceBadge source={thread.source} />
            {hasDraft && <Badge tone="warn">Черновик</Badge>}
          </div>
        </div>
      </button>
    </motion.li>
  );
}
