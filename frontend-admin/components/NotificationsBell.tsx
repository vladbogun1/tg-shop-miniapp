"use client";

/**
 * NotificationsBell — glass bell button for the admin topbar.
 * Polls GET /api/admin/orders/unread-count via TanStack Query (~20s). Shows a
 * small accent badge with the count when > 0. Click → the board "/".
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { adminApi, isAuthenticated } from "@/lib/api";

export function NotificationsBell() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["admin", "unread-count"],
    queryFn: () => adminApi.unreadCount(),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
    // Only poll once we have a token (avoids 401 spam on the login screen).
    enabled: isAuthenticated(),
  });

  const count = data?.count ?? 0;
  const label = count > 0 ? `Новые сообщения: ${count}` : "Новые сообщения";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={() => router.push("/")}
      aria-label={label}
      title={label}
      className="glass tap relative grid h-10 w-10 place-items-center rounded-[var(--r-pill)] text-[var(--text)]"
    >
      <Bell className="h-[18px] w-[18px]" />
      {count > 0 && (
        <span
          className="glossy absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
          aria-hidden
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </motion.button>
  );
}
