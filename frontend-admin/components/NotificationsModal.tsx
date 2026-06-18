"use client";

/**
 * NotificationsModal (admin) — inbox of orders with unread customer messages.
 * Rendered in a PORTAL to <body> (the bell lives inside the .glass header whose
 * transform would otherwise trap position:fixed). Desktop: panel anchored at the
 * top-right under the bell. Mobile: full-screen sheet. Backdrop is blurred like
 * the navbar. Click a row → that order's chat; "Прочитать всё" marks all read.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { adminApi, type ConversationDto } from "@/lib/api";
import { STATUS_EMOJI, STATUS_LABEL, timeAgo } from "@/lib/orders";
import { GlassButton } from "@/components/ui/GlassButton";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/lib/toast";

function senderPrefix(t?: string | null): string {
  return t === "ADMIN" ? "Вы: " : "";
}

export function NotificationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { push } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "conversations"],
    queryFn: () => adminApi.conversations(),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });
  const rows = data ?? [];

  function openChat(c: ConversationDto) {
    onClose();
    router.push(`/orders/${c.orderId}?tab=chat`);
  }

  async function readAll() {
    try {
      await adminApi.markAllRead();
      qc.invalidateQueries({ queryKey: ["admin", "unread-count"] });
      qc.invalidateQueries({ queryKey: ["admin", "conversations"] });
      qc.invalidateQueries({ queryKey: ["board"] });
      push("Все сообщения отмечены прочитанными", "ok");
      onClose();
    } catch {
      push("Не удалось отметить", "error");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/45"
            style={{ backdropFilter: "blur(14px) saturate(140%)", WebkitBackdropFilter: "blur(14px) saturate(140%)" }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="glass glass--strong absolute inset-x-0 bottom-0 top-0 flex flex-col sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:max-h-[80vh] sm:w-[400px] sm:rounded-[var(--r-lg)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
              <h2 className="text-[16px] font-semibold text-[var(--text)]">Новые сообщения</h2>
              <div className="flex items-center gap-1">
                {rows.length > 0 && (
                  <GlassButton variant="glass" size="sm" onClick={readAll} icon={<CheckCheck className="h-4 w-4" />}>
                    Прочитать всё
                  </GlassButton>
                )}
                <button
                  onClick={onClose}
                  className="grid h-9 w-9 place-items-center rounded-full text-[var(--text-muted)] hover:bg-white/10"
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="thin-scroll flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-[var(--r-md)]" />
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
                      className="flex items-center gap-3 rounded-[var(--r-md)] bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                    >
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-[18px]">
                        {STATUS_EMOJI[c.status] ?? "📦"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[14px] font-semibold text-[var(--text)]">
                            {c.customerName || "Без имени"}
                          </span>
                          <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                            {c.lastAt ? timeAgo(c.lastAt) : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
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
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-[var(--text-faint)]">#{c.shortId}</span>
                          <Badge>{STATUS_LABEL[c.status]}</Badge>
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
