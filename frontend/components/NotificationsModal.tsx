"use client";

/**
 * NotificationsModal (customer) — inbox of orders with unread admin messages.
 * Telegram-style rows with last-message preview + time + unread badge. Tap a row
 * → open that order's chat and close. Centered card on desktop, bottom sheet on
 * mobile (Telegram WebView). Self-contained overlay (no shared Modal in client).
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { customerApi, type Conversation } from "@/lib/api";
import { formatDate, formatTime, shortOrderId } from "@/lib/format";
import { StatusChip } from "@/components/ui/StatusChip";
import { haptic } from "@/lib/telegram";

function whenLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  return d.toDateString() === today.toDateString() ? formatTime(iso) : formatDate(iso);
}

function senderPrefix(t?: string | null): string {
  return t === "CUSTOMER" ? "Вы: " : "";
}

export function NotificationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["me", "conversations"],
    queryFn: () => customerApi.conversations(),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });
  const rows = data ?? [];

  function openChat(c: Conversation) {
    haptic();
    onClose();
    router.push(`/account/orders/${c.orderId}/chat`);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ transform: "translateZ(0)" }}
        >
          <div
            className="absolute inset-0 bg-black/60"
            style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="glass glass--strong relative z-10 flex max-h-[80dvh] w-full flex-col rounded-t-[var(--r-lg)] sm:max-w-md sm:rounded-[var(--r-lg)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
              <h2 className="text-[16px] font-semibold text-[var(--text)]">Сообщения</h2>
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--text-muted)] hover:bg-white/10"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto p-2"
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                paddingBottom: "calc(8px + var(--safe-bottom))",
              }}
            >
              {isLoading ? (
                <div className="flex flex-col gap-2 p-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="glass h-16 animate-pulse rounded-[var(--r-md)]" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-[var(--text-faint)]">
                  <MessageCircle className="h-8 w-8 opacity-50" />
                  <span className="text-[14px]">Нет новых сообщений</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rows.map((c) => (
                    <button
                      key={c.orderId}
                      onClick={() => openChat(c)}
                      className="glass flex items-center gap-3 rounded-[var(--r-md)] p-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-semibold text-[var(--text)]">
                            Заказ {shortOrderId(c.orderId)}
                          </span>
                          <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                            {whenLabel(c.lastAt)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] text-[var(--text-muted)]">
                            {senderPrefix(c.lastSenderType)}
                            {c.lastPreview || "—"}
                          </span>
                          {c.unreadCount > 0 && (
                            <span className="glossy flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none">
                              {c.unreadCount > 99 ? "99+" : c.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5">
                          <StatusChip status={c.status} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
