"use client";

/**
 * NotificationsBell — NEO-BRUTALISM envelope button for the headers.
 * Polls GET /api/me/unread-count (~20s). HIDDEN entirely when nothing is unread;
 * when there are unread messages it shows the envelope + count badge and opens
 * the NotificationsModal (conversations inbox) on tap. Query key + polling and
 * the exact zero-count hide behavior are preserved from the original.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Mail } from "lucide-react";
import { useState } from "react";
import { customerApi } from "@/lib/api";
import { haptic } from "@/lib/telegram";
import { NotificationsModal } from "@/components/NotificationsModal";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["me", "unread-count"],
    queryFn: () => customerApi.unreadCount(),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const count = data?.count ?? 0;

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            onClick={() => {
              haptic();
              setOpen(true);
            }}
            aria-label={`Новые сообщения: ${count}`}
            title={`Новые сообщения: ${count}`}
            className="tap relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[4px_4px_0_var(--shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            <Mail className="h-5 w-5" strokeWidth={2.5} />
            <motion.span
              key={count}
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 600, damping: 24 }}
              className="absolute -right-1.5 -top-1.5 flex h-[20px] min-w-[20px] items-center justify-center rounded-[var(--r)] border-[2px] border-[var(--line)] bg-[var(--accent)] px-1 text-[10px] font-black leading-none text-[var(--accent-ink)]"
              aria-hidden
            >
              {count > 99 ? "99+" : count}
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
      <NotificationsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
