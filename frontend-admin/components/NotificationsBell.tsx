"use client";

/**
 * NotificationsBell — envelope button for the admin topbar. Polls
 * GET /api/admin/orders/unread-count (~20s). HIDDEN entirely when nothing is
 * unread; when there are unread messages it shows the envelope + count badge and
 * opens the NotificationsModal (conversations inbox) on click.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Mail } from "lucide-react";
import { useState } from "react";
import { adminApi, isAuthenticated } from "@/lib/api";
import { NotificationsModal } from "@/components/NotificationsModal";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin", "unread-count"],
    queryFn: () => adminApi.unreadCount(),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: isAuthenticated(),
  });

  const count = data?.count ?? 0;

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            onClick={() => setOpen(true)}
            aria-label={`Новые сообщения: ${count}`}
            title={`Новые сообщения: ${count}`}
            className="glass tap relative grid h-10 w-10 place-items-center rounded-[var(--r-pill)] text-[var(--text)]"
          >
            <Mail className="h-[18px] w-[18px]" />
            <span
              className="glossy absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
              aria-hidden
            >
              {count > 99 ? "99+" : count}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
      <NotificationsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
