"use client";

/**
 * NotificationsModal (customer) — ChiSetup inbox of conversations.
 * Rendered in a PORTAL to <body> (the bell sits inside a header whose transform
 * would trap position:fixed). Mobile: full-screen sheet. Desktop: panel anchored
 * top-right. Tap a row → that order's chat. Query keys + polling are preserved
 * from the original. List items animate DIRECTLY (initial/animate + delay), not
 * via variant-label propagation (see NEO.md framer-motion caveat).
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/context";
import { customerApi, type Conversation } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import { formatDate, formatTime, shortOrderId } from "@/lib/format";
import { StatusChip } from "@/components/ui/StatusChip";
import { backdrop, sheetVariants, spring } from "@/lib/motion";
import { haptic } from "@/lib/telegram";

function whenLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  return d.toDateString() === today.toDateString() ? formatTime(iso) : formatDate(iso);
}

export function NotificationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const token = useAccessToken();
  const { data, isLoading } = useQuery({
    queryKey: ["me", "conversations"],
    queryFn: () => customerApi.conversations(),
    enabled: open && !!token,
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
          variants={backdrop}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[6px]"
            onClick={onClose}
            aria-hidden
          />

          {/* Mobile: full-screen sheet (slides up). Desktop: anchored panel. */}
          <motion.div
            variants={sheetVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-x-0 bottom-0 top-0 flex flex-col overflow-hidden border-[var(--line-strong)] bg-[var(--surface)] sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[82vh] sm:w-[400px] sm:rounded-[16px] sm:border sm:shadow-[0_18px_40px_-12px_rgba(0,0,0,.8)]"
          >
            {/* grab handle (mobile sheet affordance) */}
            <div className="flex justify-center pt-2 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-[var(--line-strong)]" />
            </div>

            <div
              className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3.5"
              style={{ paddingTop: "max(14px, var(--safe-top))" }}
            >
              <h2 className="font-display text-[17px] font-extrabold uppercase tracking-[0.04em] text-[var(--ink)]">
                {t("inbox.title")}
              </h2>
              <motion.button
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.07 }}
                onClick={onClose}
                className="tap grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] hover:text-[var(--ink)]"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" strokeWidth={2.25} />
              </motion.button>
            </div>

            <div
              className="no-scrollbar flex-1 overflow-y-auto bg-[var(--bg)] p-2.5"
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                paddingBottom: "calc(10px + var(--safe-bottom))",
              }}
            >
              {isLoading ? (
                <div className="flex flex-col gap-2.5 p-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="shimmer h-[84px] rounded-[var(--r-card)]" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center text-[var(--muted)]">
                  <div className="grid h-14 w-14 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)]">
                    <MessageCircle className="h-7 w-7" strokeWidth={2.25} />
                  </div>
                  <span className="font-display text-[14px] font-semibold uppercase tracking-[0.06em]">
                    {t("inbox.empty")}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {rows.map((c, i) => (
                    <motion.button
                      key={c.orderId}
                      initial={{ opacity: 0, y: 16, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ ...spring, delay: i * 0.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => openChat(c)}
                      className="tap flex items-center gap-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-3 text-left"
                    >
                      {/* order avatar tile */}
                      <div
                        className="font-display grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] text-[13px] font-bold text-[var(--accent)]"
                        aria-hidden
                      >
                        {c.orderId.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display truncate text-[14px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
                            {t("inbox.orderNumber", { id: shortOrderId(c.orderId) })}
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-[var(--faint)]">
                            {whenLabel(c.lastAt)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] text-[var(--muted)]">
                            {c.lastSenderType === "CUSTOMER" ? t("inbox.youPrefix") : ""}
                            {c.lastPreview || t("inbox.noPreview")}
                          </span>
                          {c.unreadCount > 0 && (
                            <span className="font-display flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--accent-ink)] shadow-[0_0_10px_rgba(255,102,0,.5)]">
                              {c.unreadCount > 99 ? "99+" : c.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5">
                          <StatusChip status={c.status} />
                        </div>
                      </div>
                    </motion.button>
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
