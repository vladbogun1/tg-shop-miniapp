"use client";

/**
 * NotificationsModal (customer) — inbox of orders with unread admin messages.
 * Rendered in a PORTAL to <body> (the bell sits inside a .glass header whose
 * transform would trap position:fixed). Mobile: full-screen sheet. Desktop:
 * panel anchored top-right. Backdrop blurred like the navbar. Tap a row → that
 * order's chat.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ transform: "translateZ(0)" }}
        >
          <div
            className="absolute inset-0 bg-black/45"
            style={{ backdropFilter: "blur(14px) saturate(140%)", WebkitBackdropFilter: "blur(14px) saturate(140%)" }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="glass glass--strong absolute inset-x-0 bottom-0 top-0 flex flex-col sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[82vh] sm:w-[400px] sm:rounded-[var(--r-lg)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5"
              style={{ paddingTop: "max(14px, var(--safe-top))" }}
            >
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
                paddingBottom: "calc(10px + var(--safe-bottom))",
              }}
            >
              {isLoading ? (
                <div className="flex flex-col gap-2 p-1">
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
    </AnimatePresence>,
    document.body
  );
}
