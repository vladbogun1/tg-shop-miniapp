"use client";

/**
 * NotificationsBell — glass bell button for the catalog / account headers.
 * Polls GET /api/me/unread-count via TanStack Query (~20s). Shows a small
 * accent badge with the count when > 0. Tap → /account.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { customerApi } from "@/lib/api";
import { haptic } from "@/lib/telegram";

export function NotificationsBell() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["me", "unread-count"],
    queryFn: () => customerApi.unreadCount(),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    // Backend offline / not authed → just hide the badge, don't error the UI.
    retry: false,
  });

  const count = data?.count ?? 0;
  const label =
    count > 0 ? `Новые сообщения: ${count}` : "Новые сообщения";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={() => {
        haptic();
        router.push("/account");
      }}
      aria-label={label}
      title={label}
      className="glass tap relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[var(--text)]"
    >
      <Bell className="h-5 w-5" />
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
