"use client";

/**
 * Topbar inbox button. Polls unread-count (~20s). Always visible; shows a badge
 * when there are unread customer messages. Opens the conversations inbox.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Новые сообщения: ${count}` : "Сообщения"}
        className="nb-press focusable relative grid h-10 w-10 place-items-center rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[4px_4px_0_var(--shadow)]"
      >
        <Bell className="h-[18px] w-[18px]" />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              className="absolute -right-2 -top-2 flex h-[20px] min-w-[20px] items-center justify-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--accent)] px-1 text-[10px] font-black leading-none text-[var(--accent-ink)]"
            >
              {count > 99 ? "99+" : count}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <NotificationsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
