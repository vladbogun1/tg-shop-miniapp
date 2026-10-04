"use client";

/**
 * Topbar bell → the «Внимание» screen. The badge is the same number as the menu item: every row
 * waiting for the owner (unread chats are one of its groups — the old chats-only popup is gone).
 */
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useInbox } from "@/lib/inbox";

export function NotificationsBell() {
  const pathname = usePathname();
  const { data } = useInbox();
  const count = data?.total ?? 0;
  const here = pathname === "/inbox";

  return (
    <Link
      href="/inbox"
      aria-label={count > 0 ? `Требует внимания: ${count}` : "Внимание — всё разобрано"}
      aria-current={here ? "page" : undefined}
      className={cn(
        "nb-press focusable relative grid h-10 w-10 place-items-center rounded-[var(--r-md)] border-[3px] border-[var(--line)] text-[var(--text)] shadow-[4px_4px_0_var(--shadow)]",
        here ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface)]"
      )}
    >
      <Bell className="h-[18px] w-[18px]" />
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
            className="absolute -right-2 -top-2 flex h-[20px] min-w-[20px] items-center justify-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--danger)] px-1 text-[10px] font-black leading-none text-[var(--accent-ink)]"
          >
            {count > 99 ? "99+" : count}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
