"use client";

import { motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useT } from "@/i18n/context";
import { spring } from "@/lib/motion";

/**
 * The scrollable message list shared by the order chat and the support thread: loading skeleton,
 * error card, an optional empty state, the "show earlier" button and the day-separated messages.
 */
export function ChatMessages<M extends { id: number | string }>({
  scrollRef,
  loading,
  skeletonCount,
  isError,
  onRetry,
  empty,
  hasMore,
  loadingEarlier,
  onLoadEarlier,
  days,
  renderMessage,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  skeletonCount: number;
  isError: boolean;
  onRetry: () => void;
  /** The empty state, or null when there is something to show / it is still loading. */
  empty: ReactNode;
  hasMore: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  days: { key: string; label: string; msgs: M[] }[];
  renderMessage: (msg: M) => ReactNode;
}) {
  const t = useT();
  return (
    <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: skeletonCount }, (_, i) => (
            <div
              key={i}
              className={`shimmer h-12 rounded-[var(--r-card)] ${i % 2 ? "w-1/2 self-end" : "w-2/3"}`}
            />
          ))}
        </div>
      )}

      {isError && (
        <div className="nb hud-frame mt-8 flex flex-col items-center gap-3 p-6 text-center">
          <WifiOff className="h-7 w-7 text-[var(--accent)]" strokeWidth={2.25} />
          <p className="text-[13px] text-[var(--muted)]">{t("chat.error")}</p>
          <button type="button" onClick={onRetry} className="nb-accent nb-press tap nb-up px-5 py-2 text-[13px]">
            {t("common.retry")}
          </button>
        </div>
      )}

      {empty}

      <div className="flex flex-col gap-1.5">
        {hasMore && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={onLoadEarlier}
              disabled={loadingEarlier}
              className="font-display tap rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)] disabled:opacity-60"
            >
              {loadingEarlier ? t("common.loading") : t("chat.loadEarlier")}
            </button>
          </div>
        )}
        {days.map((day) => (
          <section key={`d-${day.key}`} className="flex flex-col gap-1.5" aria-label={day.label}>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
              className="pointer-events-none sticky top-0 z-[2] my-2 flex justify-center"
            >
              <span className="font-display rounded-full bg-[rgba(34,34,34,.85)] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] shadow-[0_2px_8px_rgba(0,0,0,.35)] backdrop-blur-[6px]">
                {day.label}
              </span>
            </motion.div>
            {day.msgs.map((msg) => renderMessage(msg))}
          </section>
        ))}
      </div>
    </div>
  );
}
